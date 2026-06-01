import type { Linter } from 'eslint';
import nx from '@nx/eslint-plugin';
import prettier from 'eslint-config-prettier';

const config: Linter.Config[] = [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.nx/**',
      '**/coverage/**',
      '**/tmp/**',
      '**/out-tsc/**',
      'pnpm-lock.yaml',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },

  ...(nx.configs['flat/base'] as Linter.Config[]),
  ...(nx.configs['flat/typescript'] as Linter.Config[]),
  ...(nx.configs['flat/javascript'] as Linter.Config[]),

  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  prettier as Linter.Config,
];

export default config;
