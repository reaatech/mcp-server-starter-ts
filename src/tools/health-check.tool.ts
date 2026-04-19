/**
 * Health check tool — returns server health status.
 *
 * Provides information about server uptime, version, and environment.
 * Useful for monitoring and diagnostics.
 */

import { z } from 'zod';
import { defineTool } from './index.js';
import { textContent } from '../types/domain.js';
import { getServerVersion, getServerName } from '../server.js';
import { envConfig } from '../config/env.js';

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Get server uptime in seconds
 */
function getUptime(): number {
  return Math.floor(process.uptime());
}

export default defineTool({
  name: 'health-check',
  description:
    'Check the health status of the MCP server. Returns uptime, version, and environment information.',
  inputSchema: z.object({}),
  handler: async () => {
    const uptime = getUptime();
    const payload = {
      status: 'healthy',
      name: getServerName(),
      version: getServerVersion(),
      environment: envConfig.NODE_ENV,
      uptime,
      uptimeHuman: formatUptime(uptime),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      checks: {
        readiness: 'ready',
        liveness: 'alive',
      },
    };

    return {
      content: [textContent(JSON.stringify(payload))],
    };
  },
});
