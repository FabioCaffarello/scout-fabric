import { formatFiles, generateFiles, Tree } from '@nx/devkit';
import * as path from 'node:path';

import { MarkerGeneratorSchema } from './schema';

export async function markerGenerator(tree: Tree, options: MarkerGeneratorSchema): Promise<void> {
  generateFiles(tree, path.join(__dirname, 'files'), options.directory, {
    name: options.name,
    tmpl: '',
  });
  await formatFiles(tree);
}

export default markerGenerator;
