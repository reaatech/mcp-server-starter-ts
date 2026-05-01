import { constants as fsConstants } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import path from 'node:path';
import type { ToolContext, ToolResponse } from '@reaatech/mcp-server-core';
import { logger } from '@reaatech/mcp-server-observability';
import type { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResponse>;
}

export function defineTool(def: ToolDefinition): ToolDefinition {
  return def;
}

let discoveredTools: ToolDefinition[] = [];

export function registerTool(tool: ToolDefinition): void {
  if (discoveredTools.some((t) => t.name === tool.name)) {
    throw new Error(`Tool "${tool.name}" is already registered`);
  }
  discoveredTools.push(tool);
  logger.debug({ tool: tool.name }, 'Tool registered');
}

export function getTools(): ToolDefinition[] {
  return [...discoveredTools];
}

export function getTool(name: string): ToolDefinition | undefined {
  return discoveredTools.find((t) => t.name === name);
}

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
      // Directory not accessible, try next candidate
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
        entry.isFile() && /\.tool\.(ts|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts'),
    )
    .map((entry) => path.join(toolsDirectory, entry.name))
    .sort();
}

export async function discoverTools(): Promise<ToolDefinition[]> {
  discoveredTools = [];

  await Promise.all([
    import('./echo.tool.js')
      .then((mod) => {
        if (mod.default) {
          registerTool(mod.default);
        }
      })
      .catch(() => {
        logger.debug('Built-in echo tool not available');
      }),
    import('./health-check.tool.js')
      .then((mod) => {
        if (mod.default) {
          registerTool(mod.default);
        }
      })
      .catch(() => {
        logger.debug('Built-in health-check tool not available');
      }),
  ]);

  try {
    const toolModulePaths = await discoverToolModulePaths();
    const toolModules = await Promise.all(toolModulePaths.map((modulePath) => import(modulePath)));

    for (const mod of toolModules) {
      if (mod.default) {
        registerTool(mod.default);
      }
    }
  } catch {
    logger.debug('Filesystem tool discovery skipped');
  }

  logger.info(
    {
      toolCount: discoveredTools.length,
      tools: discoveredTools.map((tool) => tool.name),
    },
    'Tool discovery completed',
  );

  return discoveredTools;
}
