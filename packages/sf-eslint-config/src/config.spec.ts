import { describe, it, expect } from 'vitest';
import config from './config.js';
import prettier from 'eslint-config-prettier';

type Entry = { rules?: Record<string, unknown>; plugins?: Record<string, unknown> };

function mergedRules(entries: readonly Entry[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const entry of entries) {
    if (entry && typeof entry === 'object' && entry.rules) {
      Object.assign(merged, entry.rules);
    }
  }
  return merged;
}

describe('@fabio.caffarello/sf-eslint-config', () => {
  it('exports a non-empty flat config array', () => {
    expect(Array.isArray(config)).toBe(true);
    expect(config.length).toBeGreaterThan(0);
  });

  it('applies the universal opinionated rules at the workspace level', () => {
    const rules = mergedRules(config as Entry[]);
    expect(rules['eqeqeq']).toEqual(['error', 'always']);
    expect(rules['no-console']).toEqual(['warn', { allow: ['warn', 'error'] }]);
  });

  it('participates @nx/eslint-plugin so downstream can enforce module boundaries', () => {
    const haveNxPlugin = (config as Entry[]).some(
      (c) => c && typeof c === 'object' && c.plugins !== undefined && '@nx' in c.plugins,
    );
    expect(haveNxPlugin).toBe(true);
  });

  it('eslint-config-prettier is the last entry so formatting rules are turned off', () => {
    expect(config[config.length - 1]).toBe(prettier);
  });
});
