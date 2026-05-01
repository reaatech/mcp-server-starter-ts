import { startServer } from '@reaatech/mcp-server-server';

startServer().catch((error: Error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
