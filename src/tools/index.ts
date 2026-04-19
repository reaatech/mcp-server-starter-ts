/**
 * Tool registry and auto-discovery system.
 *
 * Tools are auto-discovered from *.tool.ts files in this directory.
 * Each tool must export a default ToolDefinition object.
 *
 * Usage:
 *   import { discoverTools } from './tools/index.js';
 *   const tools = await discoverTools();
 */

import { z } from 'zod';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import type { ToolContext, ToolResponse } from '../types/domain.js';
import { logger } from '../observability/logger.js';

/**
 * Definition of a tool that can be registered with the MCP server.
 */
export interface ToolDefinition {
  /** Unique tool identifier */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** Zod schema for input validation */
  inputSchema: z.ZodObject<z.ZodRawShape>;
  /** Tool execution handler */
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResponse>;
}

/**
 * Helper to define a tool with proper typing.
 * Use this when creating new tools.
 *
 * @example
 * export default defineTool({
 *   name: 'my-tool',
 *   description: 'Does something useful',
 *   inputSchema: z.object({
 *     param: z.string().describe('A parameter'),
 *   }),
 *   handler: async ({ param }, context) => {
 *     return { content: [{ type: 'text', text: `Result: ${param}` }] };
 *   },
 * });
 */
export function defineTool(def: ToolDefinition): ToolDefinition {
  return def;
}

/**
 * In-memory registry of discovered tools.
 * Populated by discoverTools() at startup.
 */
let discoveredTools: ToolDefinition[] = [];

/**
 * Manually register a tool.
 * Use this for testing or when auto-discovery is not desired.
 */
export function registerTool(tool: ToolDefinition): void {
  if (discoveredTools.some((t) => t.name === tool.name)) {
    throw new Error(`Tool "${tool.name}" is already registered`);
  }
  discoveredTools.push(tool);
  logger.debug({ tool: tool.name }, 'Tool registered');
}

/**
 * Get all registered tools.
 */
export function getTools(): ToolDefinition[] {
  return [...discoveredTools];
}

/**
 * Get a tool by name.
 */
export function getTool(name: string): ToolDefinition | undefined {
  return discoveredTools.find((t) => t.name === name);
}

/**
 * Clear all registered tools.
 * Primarily for testing purposes.
 */
export function clearTools(): void {
  discoveredTools = [];
  logger.debug('All tools cleared');
}

async function resolveToolsDirectory(): Promise<string> {
  const candidateDirectories = [
    path.resolve(process.cwd(), 'src/tools'),
    path.resolve(process.cwd(), 'dist/src/tools'),
    path.resolve(process.cwd(), 'dist/tools'),
  ];

  for (const directory of candidateDirectories) {
    try {
      await access(directory, fsConstants.R_OK);
      return directory;
    } catch {
      continue;
    }
  }

  throw new Error('Unable to locate tools directory');
}

async function discoverToolModulePaths(): Promise<string[]> {
  const toolsDirectory = await resolveToolsDirectory();
  const entries = await readdir(toolsDirectory, { withFileTypes: true });

  return entries
    .filter(
      (entry) =>
        entry.isFile() && /\.tool\.(ts|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')
    )
    .map((entry) => path.join(toolsDirectory, entry.name))
    .sort();
}

export async function discoverTools(): Promise<ToolDefinition[]> {
  discoveredTools = [];

  const toolModulePaths = await discoverToolModulePaths();
  const toolModules = await Promise.all(toolModulePaths.map((modulePath) => import(modulePath)));

  for (const mod of toolModules) {
    if (mod.default) {
      registerTool(mod.default);
    }
  }

  logger.info(
    {
      toolCount: discoveredTools.length,
      tools: discoveredTools.map((tool) => tool.name),
    },
    'Tool discovery completed'
  );

  return discoveredTools;
}
