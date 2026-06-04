import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import { validateOptions, webappGenerator } from './webapp';

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
    it('runs without error for a valid input', async () => {
      await expect(
        webappGenerator(tree, { name: 'hello-rds', directory: 'apps/hello-rds' }),
      ).resolves.toBeUndefined();
    });

    it('throws when input misses a required field', async () => {
      // @ts-expect-error: testing the runtime guard with an intentionally incomplete options object
      await expect(webappGenerator(tree, { directory: 'apps/hello-rds' })).rejects.toThrow(
        /`name` is required/,
      );
    });

    it('throws when input violates the name pattern', async () => {
      await expect(
        webappGenerator(tree, { name: 'PascalCase', directory: 'apps/x' }),
      ).rejects.toThrow(/kebab-case/);
    });
  });
});
