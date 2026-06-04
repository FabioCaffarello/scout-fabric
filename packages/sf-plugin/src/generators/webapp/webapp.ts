import { generateFiles, Tree, updateJson, workspaceRoot } from '@nx/devkit';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';

import { WebappGeneratorSchema } from './schema';

// Mirrors `schema.json#properties.name.pattern`. Kept in sync by hand: the
// JSON schema is consumed by Nx CLI at invocation time; this regex is the
// in-code defense for callers that bypass the CLI (direct generator API
// calls, integration tests). See docs/conventions/generator.md §2.c.
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

// =====================================================================
// CNA delegation contract — see docs/design/webapp-generator.md §2 + §3
// =====================================================================

/**
 * Pinned exact version of `create-next-app`. **No `^` or `~`.**
 *
 * Bumping this is a fábrica-level change (open a PR, regenerate the
 * fixture in __fixtures__/cna-<version>/ if the CNA output shape changed,
 * update the contract flags below if the CNA CLI gained/lost any
 * dimension that affects determinism).
 */
export const CNA_VERSION = '16.2.7' as const;

/**
 * The 11 flags of the §3 contract — cada uma cravada com justificativa
 * no doc de design. **A ordem é o argv exato passado ao create-next-app**,
 * incluindo o par `--import-alias '@/*'` (flag + valor) que ocupa duas
 * posições no array.
 *
 * Trocar este array (adição, remoção, reordenação) é mudança de contrato
 * — o spec faz um snapshot que falha se a forma muda, e asserções
 * semânticas adicionais protegem flags cuja ausência causa um defeito
 * conhecido (ex.: `--skip-install`, `--no-agents-md`).
 */
export const CNA_FLAGS = [
  '--ts',
  '--tailwind',
  '--eslint',
  '--app',
  '--src-dir',
  '--no-react-compiler',
  '--no-agents-md',
  '--import-alias',
  '@/*',
  '--use-pnpm',
  '--skip-install',
  '--disable-git',
] as const;

/**
 * Dependency contract for the generator. Exposed in the function
 * signature so callers (tests, integrations) can inject a stub —
 * the production default is `defaultRunCreateNextApp` below.
 *
 * Why injection by parameter (and not `vi.mock`): the testability is
 * part of the generator's contract, visible to anyone reading the
 * signature; mocking via the test framework hides that. See
 * docs/conventions/generator.md §6.
 */
export interface WebappDeps {
  /**
   * Run `create-next-app@<CNA_VERSION>` against the absolute target
   * directory with the §3 flag set. In production, this spawns a
   * subprocess; in tests, it is replaced with a stub that loads the
   * captured fixture (see webapp.spec.ts).
   */
  runCreateNextApp(targetAbsoluteDir: string): Promise<void>;
}

/**
 * Production default — invokes the real `create-next-app` via
 * `pnpm dlx`. **Not unit-testable**: spawns a subprocess that writes to
 * disk. Proven by the Peça 5 smoke (`tools/smoke-webapp.sh`), not by
 * Tree-test.
 *
 * Uses `pnpm dlx` instead of `npx` to align with the workspace's
 * pnpm-only stance (the `.npmrc` carries pnpm-only keys, the
 * convention is `pnpm exec` everywhere). `pnpm dlx` honors the exact
 * `@${CNA_VERSION}` pin — the smoke test confirms.
 */
export const defaultRunCreateNextApp: WebappDeps['runCreateNextApp'] = async (target) => {
  // create-next-app requires the PARENT directory of `target` to exist.
  // When `options.directory` is `apps/hello-rds` in a fresh workspace,
  // `apps/` does not exist yet, and CNA fails with "The application path
  // is not writable" (an unhelpful surface error for a missing parent).
  // Encapsulating the parent-mkdir here keeps the generator function
  // clean and puts the knowledge of CNA's requirement where the CNA is
  // actually invoked. Caught by the Peça 5 smoke run, not by the Tree-test.
  await mkdir(path.dirname(target), { recursive: true });

  return new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['dlx', `create-next-app@${CNA_VERSION}`, target, ...CNA_FLAGS], {
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `sf-plugin:webapp — create-next-app@${CNA_VERSION} exited with code ${code ?? 'null'}`,
          ),
        );
      }
    });
  });
};

// =====================================================================
// Harness contract — see docs/design/webapp-generator.md §5 + §9
// =====================================================================

// Versões cravadas das deps que o harness injeta no webapp gerado.
// Bump destas constantes é mudança da fábrica (PR + regenerar fixture
// se a forma do package.json do CNA mudar). Ver docs/design/webapp-generator.md §5.
const RDS_VERSION = '^1.24.0';
const RDS_RUNTIME_DEPENDENCIES: Record<string, string> = {
  '@fabio.caffarello/react-design-system': RDS_VERSION,
  // peers que o consumidor precisa instalar (declarados pelo RDS):
  'lucide-react': '^0.552.0',
  'react-hook-form': '^7.71.0',
  zod: '^3.0.0',
  '@hookform/resolvers': '^3.0.0',
};
const FACTORY_DEV_DEPENDENCIES: Record<string, string> = {
  '@fabio.caffarello/sf-eslint-config': '^0.0.1',
};

export function validateOptions(
  options: Partial<WebappGeneratorSchema>,
): asserts options is WebappGeneratorSchema {
  if (!options.name) {
    throw new Error('sf-plugin:webapp — `name` is required');
  }
  if (!options.directory) {
    throw new Error('sf-plugin:webapp — `directory` is required');
  }
  if (!NAME_PATTERN.test(options.name)) {
    throw new Error(
      `sf-plugin:webapp — \`name\` must match ${NAME_PATTERN} (kebab-case, starts with a lowercase letter)`,
    );
  }
}

interface PackageJsonShape {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Generator entry point. Composition (see docs/design/webapp-generator.md):
 *
 *   1. Validate options (§2.c — defense in depth vs CLI bypass).
 *   2. Delegate to `create-next-app` (§3) via `deps.runCreateNextApp`,
 *      which writes the Next boilerplate to disk at
 *      `${workspaceRoot}/${options.directory}`.
 *   3. Apply the harness on the Tree (§5 + §9):
 *      - `generateFiles` overwrites the 5 owned files and creates
 *        `providers.tsx`.
 *      - `updateJson` reads `package.json` from disk (via Tree's
 *        automatic disk fallback — see docs/conventions/generator.md
 *        §6), renames the project, and injects RDS + sf-eslint-config.
 *
 * Composition consequence (Tree ↔ disk): the files the CNA writes are
 * NOT recorded in `tree.listChanges()` — only the harness mutations
 * are. `nx generate --dry-run` will therefore show only the 6 files
 * the harness touches, not the ~20 the CNA produces. That is
 * intentional for a delegating generator and called out in
 * docs/conventions/generator.md §6.
 */
export async function webappGenerator(
  tree: Tree,
  options: WebappGeneratorSchema,
  deps: WebappDeps = { runCreateNextApp: defaultRunCreateNextApp },
): Promise<void> {
  validateOptions(options);

  // Step 1 — delegation. `create-next-app` writes to disk at the
  // absolute path; the Tree's disk-fallback lets `updateJson` and
  // `generateFiles` find those files in step 2.
  const targetAbsoluteDir = path.join(workspaceRoot, options.directory);
  await deps.runCreateNextApp(targetAbsoluteDir);

  // Step 2 — harness (§5 + §9).
  generateFiles(tree, path.join(__dirname, 'files'), options.directory, {
    name: options.name,
    tmpl: '',
  });

  const packageJsonPath = path.posix.join(options.directory, 'package.json');
  updateJson<PackageJsonShape>(tree, packageJsonPath, (pkg) => {
    pkg.name = options.name;
    pkg.dependencies = {
      ...(pkg.dependencies ?? {}),
      ...RDS_RUNTIME_DEPENDENCIES,
    };
    pkg.devDependencies = {
      ...(pkg.devDependencies ?? {}),
      ...FACTORY_DEV_DEPENDENCIES,
    };
    return pkg;
  });

  // Próxima peça: tools/smoke-webapp.sh (smoke real, §10.2) prova a
  // composição em runtime — CNA real + harness + pnpm install + next build.
}

export default webappGenerator;
