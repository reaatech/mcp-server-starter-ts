import type { Config } from 'jest';

const commonConfig = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.jest.json',
      },
    ],
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
} satisfies Partial<Config>;

const config: Config = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/*.d.ts',
    '!src/observability/tracing.ts',
    '!src/observability/metrics.ts',
    '!src/server.ts',
    '!src/tools/index.ts',
    '!src/transports/sse.ts',
    '!src/transports/streamable-http.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  projects: [
    {
      ...commonConfig,
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
      roots: ['<rootDir>/src', '<rootDir>/tests/unit'],
    },
    {
      ...commonConfig,
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
      roots: ['<rootDir>/src', '<rootDir>/tests/e2e'],
    },
  ],
};

export default config;
