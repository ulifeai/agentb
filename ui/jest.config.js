module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom/extend-expect'],
  moduleNameMapper: {
    // If you have path aliases in tsconfig, map them here
    // Example: '^@components/(.*)$': '<rootDir>/src/components/$1'
  },
  transform: {
   '^.+\\.(ts|tsx)$': 'ts-jest',
  },
};
