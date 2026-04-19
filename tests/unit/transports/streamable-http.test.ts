/**
 * Unit tests for StreamableHTTP transport utility functions
 */

import { clearAllSessions } from '../../../src/transports/streamable-http.js';

jest.mock('../../../src/observability/metrics.js', () => ({
  recordTransportRequest: jest.fn(),
}));
jest.mock('../../../src/observability/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../../../src/config/env.js', () => ({
  envConfig: {
    SESSION_TIMEOUT_MS: 1800000,
  },
}));
jest.mock('../../../src/transports/session-metrics.js', () => ({
  updateTransportSessionCount: jest.fn(),
}));

describe('streamable-http transport utilities', () => {
  beforeEach(() => {
    clearAllSessions();
  });

  describe('clearAllSessions', () => {
    it('should not throw when no sessions exist', () => {
      expect(() => clearAllSessions()).not.toThrow();
    });
  });
});
