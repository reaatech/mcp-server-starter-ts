import { textContent } from '@reaatech/mcp-server-core';
import { SERVICE_NAME, SERVICE_VERSION, envConfig } from '@reaatech/mcp-server-core';
import { z } from 'zod';
import { defineTool } from './registry.js';

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
      name: SERVICE_NAME,
      version: SERVICE_VERSION,
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
