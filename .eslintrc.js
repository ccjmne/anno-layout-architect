module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: 'airbnb-base',
  env: { browser: true },
  parserOptions: {
    project: './tsconfig.json',
  },
  rules: {
    'import/no-extraneous-dependencies': ['error', { devDependencies: ['webpack.config.ts'] }],
    'quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
    'quote-props': ['error', 'consistent-as-needed'],
    'max-len': ['error', 140, { ignoreTrailingComments: true }],
    'no-unused-vars': 'off',
    'object-curly-newline': ['error', {
      ImportDeclaration: 'never',
      ObjectExpression: { consistent: true, multiline: true },
      ObjectPattern: { consistent: true, multiline: true },
    }],
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars-experimental': 'error',
  },
};
