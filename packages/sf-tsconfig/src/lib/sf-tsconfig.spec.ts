import { describe, it, expect } from 'vitest';
import { sfTsconfig } from './sf-tsconfig.js';

describe('sfTsconfig', () => {
  it('returns the package name', () => {
    expect(sfTsconfig()).toBe('sf-tsconfig');
  });
});
