/**
 * Unit tests for session-metrics module
 */

import { updateTransportSessionCount } from '../../../src/transports/session-metrics.js';

describe('session-metrics', () => {
  beforeEach(() => {
    updateTransportSessionCount('sse', 0);
    updateTransportSessionCount('streamable-http', 0);
  });

  it('should track SSE session count', () => {
    updateTransportSessionCount('sse', 5);
  });

  it('should track streamable-http session count', () => {
    updateTransportSessionCount('streamable-http', 3);
  });

  it('should track both transports', () => {
    updateTransportSessionCount('sse', 2);
    updateTransportSessionCount('streamable-http', 3);
  });

  it('should reset counts', () => {
    updateTransportSessionCount('sse', 10);
    updateTransportSessionCount('streamable-http', 5);
    updateTransportSessionCount('sse', 0);
    updateTransportSessionCount('streamable-http', 0);
  });
});
