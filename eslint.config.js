//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // server.js is the plain-JS Node runtime entry (not part of the TS project),
    // scripts/*.mjs are standalone CLI scripts — neither belongs to the type-aware lint.
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      '.templates/**',
      'server.js',
      'scripts/**',
    ],
  },
]
