import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import globals from 'globals';

const nodeScripts = [
  'build.js',
  'bump-version.js',
  'scripts/**/*.js',
  'scratch/**/*.js',
  'worker/**/*.js',
  'test/**/*.js',
  'vitest.config.mjs',
];

export default tseslint.config(
  // Base JS config
  js.configs.recommended,
  // TypeScript recommended configs
  ...tseslint.configs.recommended,
  // Prettier integration
  prettierConfig,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      // Recommended rules for vanilla JS project
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-undef': 'off', // TypeScript handles this
      'no-global-assign': 'error',
      'no-implicit-globals': 'off', // Allow function declarations in scripts
      'no-redeclare': 'warn',
      'no-empty': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-useless-escape': 'warn',
      'no-sparse-arrays': 'warn',
      'no-misleading-character-class': 'warn',
    },
  },
  // Node.js scripts - allow require, commonjs
  {
    files: nodeScripts,
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.es2024 },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-redeclare': 'off', // Allow redeclaring globals like URL in test files
    },
  },
  // Browser JS modules
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2024 },
    },
    rules: {
      // Allow window/globalThis for browser globals
      'no-restricted-globals': ['error', 'event', 'fdescribe', 'fit', 'it', 'xdescribe', 'xit'],
    },
  },
  // Ambient type declarations: `any` là chủ ý cho interop với code JS legacy.
  {
    files: ['types/**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },
  // Ignore patterns
  {
    ignores: [
      'node_modules/**',
      'android/**',
      '.git/**',
      'dist/**',
      'build/**',
      '*.min.js',
      'coverage/**',
      '*.log',
    ],
  }
);
