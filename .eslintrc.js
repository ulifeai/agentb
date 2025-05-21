module.exports = {
    parser: '@typescript-eslint/parser',
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'prettier', // Make sure Prettier is last to override other formatting rules
    ],
    plugins: ['@typescript-eslint', 'prettier'],
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    env: {
      es6: true,
      node: true,
      jest: true, // If using Jest for tests
    },
    rules: {
      'prettier/prettier': 'error', // Report Prettier violations as ESLint errors
      '@typescript-eslint/no-explicit-any': 'warn', // Warn instead of error for `any` for flexibility
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Add other custom rules here
    },
    ignorePatterns: ['node_modules/', 'dist/', '*.js', 'src/examples'], // Ignore JS files if you only write TS
  };