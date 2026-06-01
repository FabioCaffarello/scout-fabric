// @ts-check
import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
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
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          // depConstraints placeholder enquanto packages/ está vazio.
          // Popular conforme os pacotes nascerem, ex.:
          //   { sourceTag: 'scope:public',   onlyDependOnLibsWithTags: ['scope:public'] },
          //   { sourceTag: 'scope:internal', onlyDependOnLibsWithTags: ['scope:public', 'scope:internal'] },
          //   { sourceTag: 'type:plugin',    onlyDependOnLibsWithTags: ['type:config', 'type:utils', 'type:plugin'] },
          //   { sourceTag: 'type:config',    onlyDependOnLibsWithTags: [] },
          depConstraints: [{ sourceTag: '*', onlyDependOnLibsWithTags: ['*'] }],
        },
      ],
    },
  },

  // Regras typed-aware. Exigem typescript-eslint com projectService:
  // ativaremos por pacote quando os pacotes nascerem (cada um com seu tsconfig.lib.json).
  // Mantemos aqui como referência declarada para evitar drift quando subirmos por pacote.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },

  // Desliga TODAS as regras de formatação que conflitam com Prettier.
  // Mantém ESLint focado em bugs/semântica; Prettier cuida do estilo.
  prettier,
];
