import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  CNA_FLAGS,
  CNA_VERSION,
  defaultRunCreateNextApp,
  validateOptions,
  webappGenerator,
  type WebappDeps,
} from './webapp';

const FIXTURE = 'cna-16.2.7';
const FIXTURE_ROOT = path.join(__dirname, '__fixtures__', FIXTURE);
const TARGET = 'apps/hello-rds';
const NAME = 'hello-rds';

// Loads a captured fixture into the virtual Tree. Inlined here (vs a
// helper file under `__internal__/`) because pulling it out forces a
// build-config gymnastic — the `@nx/js:tsc` executor would otherwise
// publish the helper into `dist/` for npm consumers, who have no use
// for test scaffolding. When a second generator needs the same logic,
// promote then; for now, inline is the smaller surface.
function applyFixture(tree: Tree, fixtureRoot: string, targetDir: string): void {
  if (!fs.existsSync(fixtureRoot)) {
    throw new Error(`applyFixture: fixture not found at ${fixtureRoot}`);
  }
  walk(fixtureRoot, fixtureRoot, (absolutePath) => {
    const relativePath = path.relative(fixtureRoot, absolutePath);
    const content = fs.readFileSync(absolutePath);
    tree.write(path.posix.join(targetDir, ...relativePath.split(path.sep)), content);
  });
}

function walk(root: string, dir: string, cb: (absolutePath: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, abs, cb);
    } else if (entry.isFile()) {
      cb(abs);
    }
  }
}

/**
 * Test stub for `runCreateNextApp`: replays the captured fixture into
 * the Tree at the target dir, simulating what the real CNA would do
 * by writing to disk in production. Used as the `deps.runCreateNextApp`
 * injection in the harness tests below.
 */
function fixtureBackedRunCna(tree: Tree, targetDir: string): WebappDeps['runCreateNextApp'] {
  return async () => {
    applyFixture(tree, FIXTURE_ROOT, targetDir);
  };
}

describe('sf-plugin:webapp — schema validation (Peça 1)', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  describe('validateOptions (pure function)', () => {
    it('accepts a valid input (kebab name + directory)', () => {
      expect(() => validateOptions({ name: 'foo', directory: 'apps/foo' })).not.toThrow();
    });

    it('rejects when `name` is missing — required violation', () => {
      expect(() => validateOptions({ directory: 'apps/foo' })).toThrow(/`name` is required/);
    });

    it('rejects when `directory` is missing — required violation', () => {
      expect(() => validateOptions({ name: 'foo' })).toThrow(/`directory` is required/);
    });

    it('rejects when `name` violates the kebab-case pattern — pattern violation', () => {
      expect(() => validateOptions({ name: 'Foo', directory: 'apps/foo' })).toThrow(/kebab-case/);
    });

    it('rejects names that start with a digit — pattern violation', () => {
      expect(() => validateOptions({ name: '1foo', directory: 'apps/foo' })).toThrow(/kebab-case/);
    });
  });

  describe('webappGenerator (entry point delegates to validateOptions)', () => {
    it('throws when input misses a required field — runs BEFORE any subprocess', async () => {
      const runCreateNextApp = vi.fn(async () => {
        throw new Error('runCreateNextApp must not be called when validation fails');
      });
      await expect(
        // @ts-expect-error: testing the runtime guard with an intentionally incomplete options object
        webappGenerator(tree, { directory: 'apps/hello-rds' }, { runCreateNextApp }),
      ).rejects.toThrow(/`name` is required/);
      expect(runCreateNextApp).not.toHaveBeenCalled();
    });

    it('throws when input violates the name pattern — runs BEFORE any subprocess', async () => {
      const runCreateNextApp = vi.fn(async () => {
        throw new Error('runCreateNextApp must not be called when validation fails');
      });
      await expect(
        webappGenerator(tree, { name: 'PascalCase', directory: 'apps/x' }, { runCreateNextApp }),
      ).rejects.toThrow(/kebab-case/);
      expect(runCreateNextApp).not.toHaveBeenCalled();
    });
  });
});

describe('sf-plugin:webapp — CNA delegation contract (Peça 4)', () => {
  describe('CNA_VERSION', () => {
    it('pins the exact create-next-app version — bump is a fábrica-level change (§2)', () => {
      expect(CNA_VERSION).toBe('16.2.7');
      // No `^`, no `~`, no `latest` — determinism depends on the exact pin.
      expect(CNA_VERSION).not.toMatch(/[\^~]/);
    });
  });

  describe('CNA_FLAGS', () => {
    it('matches the §3 contract argv exactly — snapshot guard', () => {
      // Reordering, adding, or removing any element breaks this snapshot.
      // The snapshot is the wide net; the semantic asserts below are the
      // anchors that prevent it from being updated cegamente.
      expect(CNA_FLAGS).toEqual([
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
      ]);
    });

    it('includes --skip-install — without it, pnpm install runs before the harness adds RDS deps', () => {
      // The harness injects @fabio.caffarello/react-design-system + peers
      // + sf-eslint-config into package.json AFTER the CNA runs. If
      // --skip-install were absent, the CNA would install Next-only deps,
      // and the consumer would have to install again after the harness —
      // the first install would be wasted work.
      expect(CNA_FLAGS).toContain('--skip-install');
    });

    it('includes --no-agents-md — without it, CNA writes the generic Next AGENTS.md/CLAUDE.md', () => {
      // The CNA default (16.2.7) generates AGENTS.md with the text
      // "This is NOT the Next.js you know" and a CLAUDE.md that just
      // imports it. The scout's webapp is a curated context; these
      // generic files mislead more than help.
      expect(CNA_FLAGS).toContain('--no-agents-md');
    });

    it('includes --disable-git — without it, CNA initializes a separate git repo inside the workspace', () => {
      // The webapp is composed by the scout, which initializes (or
      // doesn't) the git story itself. CNA's `git init` would create
      // a nested repo and confuse downstream tools.
      expect(CNA_FLAGS).toContain('--disable-git');
    });

    it('includes the --import-alias pair (flag + value) at consecutive positions', () => {
      const flagIdx = CNA_FLAGS.indexOf('--import-alias');
      expect(flagIdx).toBeGreaterThanOrEqual(0);
      expect(CNA_FLAGS[flagIdx + 1]).toBe('@/*');
    });
  });

  describe('defaultRunCreateNextApp', () => {
    it('is exported as the production default for the deps contract', () => {
      // Implementation (spawn pnpm dlx create-next-app@16.2.7 ...) is
      // proved by the Peça 5 smoke (tools/smoke-webapp.sh), not by
      // Tree-test — spawning the real CNA in unit tests would be slow
      // and require network access. The smoke also confirms the
      // `pnpm dlx` cache resolves to the EXACT pinned version.
      expect(typeof defaultRunCreateNextApp).toBe('function');
    });
  });

  describe('composition: delegation BEFORE harness', () => {
    let tree: Tree;
    beforeEach(() => {
      tree = createTreeWithEmptyWorkspace();
    });

    it('calls runCreateNextApp once with an absolute path that ends in options.directory', async () => {
      const targetsReceived: string[] = [];
      await webappGenerator(
        tree,
        { name: NAME, directory: TARGET },
        {
          runCreateNextApp: async (target) => {
            targetsReceived.push(target);
            applyFixture(tree, FIXTURE_ROOT, TARGET);
          },
        },
      );
      expect(targetsReceived).toHaveLength(1);
      const received = targetsReceived[0];
      if (received === undefined) {
        throw new Error('runCreateNextApp was not called with a target');
      }
      expect(path.isAbsolute(received)).toBe(true);
      // workspaceRoot/<TARGET> — the trailing segment is exactly options.directory.
      expect(received.endsWith(path.sep + TARGET.split('/').join(path.sep))).toBe(true);
    });

    it('runs runCreateNextApp BEFORE the harness writes anything to the Tree', async () => {
      const order: string[] = [];

      await webappGenerator(
        tree,
        { name: NAME, directory: TARGET },
        {
          runCreateNextApp: async () => {
            // Snapshot of the Tree at the moment delegation runs: empty.
            // If the harness ran first, providers.tsx (created file) or
            // a modified package.json/layout.tsx would already exist.
            expect(tree.exists(`${TARGET}/src/app/providers.tsx`)).toBe(false);
            expect(tree.exists(`${TARGET}/src/app/layout.tsx`)).toBe(false);
            expect(tree.exists(`${TARGET}/package.json`)).toBe(false);
            order.push('cna');
            applyFixture(tree, FIXTURE_ROOT, TARGET);
          },
        },
      );

      // After the generator: harness ran (proof = providers.tsx exists,
      // RDS in package.json, Geist stripped from layout.tsx).
      order.push('harness');
      expect(order).toEqual(['cna', 'harness']);
      expect(tree.exists(`${TARGET}/src/app/providers.tsx`)).toBe(true);
      const layout = tree.read(`${TARGET}/src/app/layout.tsx`, 'utf-8') ?? '';
      expect(layout).toContain('@fabio.caffarello/react-design-system/styles');
      expect(layout).not.toContain('Geist_Mono');
    });
  });
});

describe('sf-plugin:webapp — harness against captured CNA fixture (Peça 3)', () => {
  let tree: Tree;

  beforeEach(async () => {
    tree = createTreeWithEmptyWorkspace();
    await webappGenerator(
      tree,
      { name: NAME, directory: TARGET },
      { runCreateNextApp: fixtureBackedRunCna(tree, TARGET) },
    );
  });

  describe('src/app/layout.tsx — overwritten (§9.5)', () => {
    let layout: string;
    beforeEach(() => {
      layout = tree.read(`${TARGET}/src/app/layout.tsx`, 'utf-8') ?? '';
    });

    it('imports the RDS styles BEFORE ./globals.css (CSS cascade order, §9.1)', () => {
      // Look at actual import statements, not at comments that may mention paths.
      const importLines = layout
        .split('\n')
        .map((line, idx) => ({ line, idx }))
        .filter(({ line }) => /^\s*import\s/.test(line));

      const rdsImport = importLines.find(({ line }) =>
        line.includes('@fabio.caffarello/react-design-system/styles'),
      );
      const globalsImport = importLines.find(({ line }) => line.includes('./globals.css'));

      if (!rdsImport || !globalsImport) {
        throw new Error(
          `layout.tsx must import both RDS styles and ./globals.css; got rds=${String(rdsImport)}, globals=${String(globalsImport)}`,
        );
      }
      expect(rdsImport.idx).toBeLessThan(globalsImport.idx);
    });

    it('wraps children in <Providers> (§9.2)', () => {
      expect(layout).toMatch(/<Providers>\s*\{children\}\s*<\/Providers>/);
    });

    it('imports Providers from the local providers module', () => {
      expect(layout).toMatch(/from\s+["']\.\/providers["']/);
    });

    it('uses RDS semantic classes on <body> (§9.3 + README RDS l.30)', () => {
      expect(layout).toContain('bg-surface-canvas');
      expect(layout).toContain('text-fg-primary');
    });

    it('does NOT carry the Geist fonts the CNA template ships', () => {
      expect(layout).not.toContain('Geist_Mono');
      expect(layout).not.toContain('next/font/google');
    });

    it('sets metadata.title to the project name', () => {
      expect(layout).toContain('title: "hello-rds"');
    });
  });

  describe('src/app/providers.tsx — created new (§9.2)', () => {
    let providers: string;
    beforeEach(() => {
      providers = tree.read(`${TARGET}/src/app/providers.tsx`, 'utf-8') ?? '';
    });

    it('exists at the expected path', () => {
      expect(tree.exists(`${TARGET}/src/app/providers.tsx`)).toBe(true);
    });

    it('declares "use client" before any import (client boundary, §9.2)', () => {
      const firstMeaningful = providers
        .split('\n')
        .map((line) => line.trim())
        .find(
          (line) =>
            line.length > 0 &&
            !line.startsWith('//') &&
            !line.startsWith('/*') &&
            !line.startsWith('*'),
        );
      expect(firstMeaningful).toBe('"use client";');
    });

    it('imports AppProvider from the RDS root entry (NOT a subpath, §9.2 Turbopack atrito)', () => {
      expect(providers).toMatch(
        /import\s+\{\s*AppProvider\s*\}\s+from\s+["']@fabio\.caffarello\/react-design-system["']/,
      );
      expect(providers).not.toMatch(
        /from\s+["']@fabio\.caffarello\/react-design-system\/providers/,
      );
    });

    it('carries the explanatory comment that guards against future "simplification"', () => {
      expect(providers).toMatch(/NÃO mover.*layout\.tsx/);
    });
  });

  describe('src/app/globals.css — overwritten (§9.3)', () => {
    let css: string;
    beforeEach(() => {
      css = tree.read(`${TARGET}/src/app/globals.css`, 'utf-8') ?? '';
    });

    it('keeps the Tailwind import (the dev still writes Tailwind classes, §9.4)', () => {
      expect(css).toContain('@import "tailwindcss"');
    });

    it('removes the Geist @theme inline block from the CNA template', () => {
      expect(css).not.toContain('--font-geist-sans');
      expect(css).not.toContain('--font-geist-mono');
    });
  });

  describe('src/app/page.tsx — overwritten (§9.6)', () => {
    let page: string;
    beforeEach(() => {
      page = tree.read(`${TARGET}/src/app/page.tsx`, 'utf-8') ?? '';
    });

    it('imports a component from the RDS — proof of integration', () => {
      expect(page).toMatch(
        /import\s+\{[^}]*\bButton\b[^}]*\}\s+from\s+["']@fabio\.caffarello\/react-design-system["']/,
      );
    });

    it('interpolates the project name into the heading', () => {
      expect(page).toContain('hello-rds');
    });

    it('discards the Vercel-marketing boilerplate from the CNA template', () => {
      expect(page).not.toContain('vercel.com/templates');
      expect(page).not.toContain('next.svg');
    });
  });

  describe('eslint.config.mjs — overwritten (§7)', () => {
    let cfg: string;
    beforeEach(() => {
      cfg = tree.read(`${TARGET}/eslint.config.mjs`, 'utf-8') ?? '';
    });

    it('composes eslint-config-next presets with @fabio.caffarello/sf-eslint-config', () => {
      expect(cfg).toContain('eslint-config-next/core-web-vitals');
      expect(cfg).toContain('eslint-config-next/typescript');
      expect(cfg).toContain('@fabio.caffarello/sf-eslint-config');
    });
  });

  describe('package.json — edited surgically (§5)', () => {
    interface PackageShape {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }
    let pkg: PackageShape;
    beforeEach(() => {
      pkg = JSON.parse(tree.read(`${TARGET}/package.json`, 'utf-8') ?? '{}') as PackageShape;
    });

    it('renames the project to the requested name', () => {
      expect(pkg.name).toBe('hello-rds');
    });

    it('preserves the Next deps the CNA injected', () => {
      expect(pkg.dependencies?.next).toBeTruthy();
      expect(pkg.dependencies?.react).toBeTruthy();
      expect(pkg.dependencies?.['react-dom']).toBeTruthy();
    });

    it('adds the RDS and its peer dependencies to runtime deps', () => {
      const deps = pkg.dependencies ?? {};
      expect(deps['@fabio.caffarello/react-design-system']).toBeTruthy();
      expect(deps['lucide-react']).toBeTruthy();
      expect(deps['react-hook-form']).toBeTruthy();
      expect(deps['zod']).toBeTruthy();
      expect(deps['@hookform/resolvers']).toBeTruthy();
    });

    it('adds @fabio.caffarello/sf-eslint-config as a devDependency', () => {
      expect(pkg.devDependencies?.['@fabio.caffarello/sf-eslint-config']).toBeTruthy();
    });

    it('preserves the Tailwind v4 devDeps the CNA injected (§9.4)', () => {
      expect(pkg.devDependencies?.['@tailwindcss/postcss']).toBeTruthy();
      expect(pkg.devDependencies?.tailwindcss).toBeTruthy();
    });
  });

  describe('files untouched by the harness — §5 "intocados"', () => {
    const INTACT_FILES = [
      'tsconfig.json',
      'next.config.ts',
      'next-env.d.ts',
      'postcss.config.mjs',
      'pnpm-workspace.yaml',
    ];

    it.each(INTACT_FILES)('keeps the CNA-generated %s byte-identical to the fixture', (file) => {
      const fixtureBytes = fs.readFileSync(path.join(FIXTURE_ROOT, file));
      const treeBytes = tree.read(`${TARGET}/${file}`);
      if (treeBytes === null) {
        throw new Error(`${file} missing from tree under ${TARGET}`);
      }
      expect(treeBytes.equals(fixtureBytes)).toBe(true);
    });
  });
});
