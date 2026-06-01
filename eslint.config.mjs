// @ts-check
//
// Workspace-level ESLint flat config.
//
// The shared base — common ignores, Nx flat presets, opinionated rules,
// and `eslint-config-prettier` — comes from the published package
// `@fabio.caffarello/sf-eslint-config` (the workspace consumes it via
// pnpm `workspace:*`, so it's symlinked from `packages/sf-eslint-config`).
// Updates to the shared base happen there, not here.
//
// This file only adds what is genuinely workspace-specific and cannot
// live in a publishable package:
//   - typed-aware rules that need `parserOptions.projectService` and
//     `tsconfigRootDir`,
//   - `@nx/enforce-module-boundaries` with this workspace's
//     `depConstraints`.
//
// Note: Node resolves `@fabio.caffarello/sf-eslint-config` to its built
// `dist/index.js` via `exports.default`. The `lint` target therefore has
// `dependsOn: ['sf-eslint-config:build']` in `nx.json` so the dist is
// fresh before any lint runs.

import sf from '@fabio.caffarello/sf-eslint-config';
import tseslint from 'typescript-eslint';

export default [
  ...sf,

  // Workspace-specific: typed-aware rules.
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

  // Workspace-specific: enforce-module-boundaries with the depConstraints
  // of THIS workspace. Generated projects will declare their own.
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          // TODO: popular conforme os pacotes nascerem. Exemplos:
          //   { sourceTag: 'scope:public',  onlyDependOnLibsWithTags: ['scope:public'] },
          //   { sourceTag: 'scope:internal', onlyDependOnLibsWithTags: ['scope:public', 'scope:internal'] },
          //   { sourceTag: 'type:plugin',   onlyDependOnLibsWithTags: ['type:config', 'type:utils', 'type:plugin'] },
          //   { sourceTag: 'type:config',   onlyDependOnLibsWithTags: [] },
          depConstraints: [{ sourceTag: '*', onlyDependOnLibsWithTags: ['*'] }],
        },
      ],
    },
  },
];
