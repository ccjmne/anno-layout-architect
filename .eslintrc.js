module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: 'airbnb-base',
  env: { browser: true },
  settings: {
    'import/resolver': {
      webpack: {
        config: {
          resolve: {
            extensions: ['.js', '.ts'],
          },
        },
      },
    },
  },
  rules: {
    'arrow-parens': ['error', 'as-needed'],
    'global-require': ['warn'],
    'import/extensions': [
      'warn',
      'ignorePackages',
      { js: 'never', jsx: 'never', ts: 'never', tsx: 'never' },
    ],
    'import/no-extraneous-dependencies': ['off', { devDependencies: ['webpack.config.ts'] }],
    'import/prefer-default-export': 'off',
    'lines-between-class-members': ['warn', 'always', { exceptAfterSingleLine: true }],
    'max-len': ['error', 140, { ignoreTrailingComments: true }],
    'no-underscore-dangle': 'off',
    'no-unused-vars': 'off',
    'object-curly-newline': ['error', {
      ImportDeclaration: 'never',
      ObjectExpression: { consistent: true, multiline: true },
      ObjectPattern: { consistent: true, multiline: true },
    }],
    'padded-blocks': ['error', { blocks: 'never', switches: 'always', classes: 'always' }],
    'quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
    'quote-props': ['error', 'consistent-as-needed'],
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars-experimental': 'error',
  },
};
