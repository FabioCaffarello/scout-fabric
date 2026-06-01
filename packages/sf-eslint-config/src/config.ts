import nx from '@nx/eslint-plugin';
import prettier from 'eslint-config-prettier';

const config = [
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

  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],

  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    rules: {
      eqeqeq: ['error', 'always'] as const,
      'no-console': ['warn', { allow: ['warn', 'error'] }] as const,
    },
  },

  prettier,
];

export default config;
