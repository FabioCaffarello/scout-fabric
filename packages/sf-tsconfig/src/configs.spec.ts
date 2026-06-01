import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadJson(name: string): { compilerOptions?: Record<string, unknown>; extends?: string } {
  return JSON.parse(readFileSync(join(pkgRoot, name), 'utf8'));
}

describe('base.json', () => {
  const base = loadJson('base.json');
  const co = base.compilerOptions ?? {};

  it('targets es2022 with nodenext module resolution', () => {
    expect(co.target).toBe('es2022');
    expect(co.module).toBe('nodenext');
    expect(co.moduleResolution).toBe('nodenext');
    expect(co.lib).toEqual(['es2022']);
  });

  it('enables strict mode and the extras decided in the foundation', () => {
    expect(co.strict).toBe(true);
    expect(co.noUncheckedIndexedAccess).toBe(true);
    expect(co.noImplicitOverride).toBe(true);
    expect(co.noImplicitReturns).toBe(true);
    expect(co.noFallthroughCasesInSwitch).toBe(true);
    expect(co.noUnusedLocals).toBe(true);
    expect(co.noEmitOnError).toBe(true);
  });

  it('keeps lib/runtime ergonomics on', () => {
    expect(co.isolatedModules).toBe(true);
    expect(co.importHelpers).toBe(true);
    expect(co.skipLibCheck).toBe(true);
  });

  it('does not leak the internal dev-time customConditions', () => {
    expect(co.customConditions).toBeUndefined();
  });
});

describe('lib.json', () => {
  const lib = loadJson('lib.json');
  const co = lib.compilerOptions ?? {};

  it('extends ./base.json', () => {
    expect(lib.extends).toBe('./base.json');
  });

  it('opts in to composite + declarations for buildable libraries', () => {
    expect(co.composite).toBe(true);
    expect(co.declaration).toBe(true);
    expect(co.declarationMap).toBe(true);
    expect(co.emitDeclarationOnly).toBe(false);
  });
});
