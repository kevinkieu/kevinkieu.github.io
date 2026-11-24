export default {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'es5',
  bracketSpacing: true,
  arrowParens: 'avoid',
  endOfLine: 'lf',
  plugins: [],
  overrides: [
    {
      files: ['*.json', '*.jsonc'],
      options: {
        printWidth: 120,
      },
    },
    {
      files: ['*.md'],
      options: {
        printWidth: 100,
        proseWrap: 'always',
      },
    },
    {
      files: ['*.html'],
      options: {
        printWidth: 120,
        tabWidth: 2,
      },
    },
    {
      files: ['*.css'],
      options: {
        printWidth: 100,
      },
    },
  ],
};
