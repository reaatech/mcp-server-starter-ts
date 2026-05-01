import { setActiveSessionCount } from '@reaatech/mcp-server-observability';

const transportCounts = {
  sse: 0,
  'streamable-http': 0,
};

export function updateTransportSessionCount(
  transport: keyof typeof transportCounts,
  count: number,
): void {
  transportCounts[transport] = count;
  setActiveSessionCount(transportCounts.sse + transportCounts['streamable-http']);
}
