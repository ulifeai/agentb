// jest.config.js

module.exports = {
  // Use ts-jest for TypeScript
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Root paths and test file matching
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],

  // ts-jest-specific globals (separate tsconfig)
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
    },
  },

  // File transformations
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },

  // Ignore transforming node_modules by default
  transformIgnorePatterns: ['<rootDir>/node_modules/'],

  // Module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Define test projects, plus a default project that runs everything
  projects: [
    {
      displayName: 'all',
      preset: 'ts-jest',
      testEnvironment: 'node',
      globals: { 'ts-jest': { tsconfig: 'tsconfig.test.json' } },
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      // Match all tests under src
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
    },
    {
      displayName: 'agents',
      preset: 'ts-jest',
      testEnvironment: 'node',
      globals: { 'ts-jest': { tsconfig: 'tsconfig.test.json' } },
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      testMatch: ['<rootDir>/src/agents/__tests__/**/*.test.ts'],
    },
    {
      displayName: 'llm',
      preset: 'ts-jest',
      testEnvironment: 'node',
      globals: { 'ts-jest': { tsconfig: 'tsconfig.test.json' } },
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      testMatch: ['<rootDir>/src/llm/__tests__/**/*.test.ts'],
    },
    {
      displayName: 'core',
      preset: 'ts-jest',
      testEnvironment: 'node',
      globals: { 'ts-jest': { tsconfig: 'tsconfig.test.json' } },
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      testMatch: ['<rootDir>/src/core/__tests__/**/*.test.ts'],
    },
    {
      displayName: 'tools',
      preset: 'ts-jest',
      testEnvironment: 'node',
      globals: { 'ts-jest': { tsconfig: 'tsconfig.test.json' } },
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      testMatch: ['<rootDir>/src/tools/**/*.test.ts'],
    },
    {
      displayName: 'threads',
      preset: 'ts-jest',
      testEnvironment: 'node',
      globals: { 'ts-jest': { tsconfig: 'tsconfig.test.json' } },
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      testMatch: ['<rootDir>/src/threads/__tests__/**/*.test.ts'],
    },
    {
      displayName: 'facades',
      preset: 'ts-jest',
      testEnvironment: 'node',
      globals: { 'ts-jest': { tsconfig: 'tsconfig.test.json' } },
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      testMatch: ['<rootDir>/src/facades/__tests__/**/*.test.ts'],
    },
    {
      displayName: 'managers',
      preset: 'ts-jest',
      testEnvironment: 'node',
      globals: { 'ts-jest': { tsconfig: 'tsconfig.test.json' } },
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      testMatch: ['<rootDir>/src/managers/__tests__/**/*.test.ts'],
    },
    {
      displayName: 'ui',
      preset: 'ts-jest',
      testEnvironment: 'node',
      globals: { 'ts-jest': { tsconfig: 'tsconfig.test.json' } },
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      testMatch: ['<rootDir>/src/ui/__tests__/**/*.test.ts'],
    },
  ],
};
