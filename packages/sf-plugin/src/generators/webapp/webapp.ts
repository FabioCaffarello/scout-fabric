import { generateFiles, Tree, updateJson } from '@nx/devkit';
import * as path from 'node:path';

import { WebappGeneratorSchema } from './schema';

// Mirrors `schema.json#properties.name.pattern`. Kept in sync by hand: the
// JSON schema is consumed by Nx CLI at invocation time; this regex is the
// in-code defense for callers that bypass the CLI (direct generator API
// calls, integration tests). See docs/conventions/generator.md §2.c.
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

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

export async function webappGenerator(tree: Tree, options: WebappGeneratorSchema): Promise<void> {
  validateOptions(options);

  // D — sobrescritas + criação do providers.tsx, via templates EJS.
  // Ver docs/design/webapp-generator.md §5 (fronteira de posse) e §9
  // (integração do RDS).
  generateFiles(tree, path.join(__dirname, 'files'), options.directory, {
    name: options.name,
    tmpl: '',
  });

  // E — edição cirúrgica do package.json que o create-next-app deixou.
  // Preserva tudo do CNA (next, react, scripts, tailwind devDeps) e
  // injeta o que a fábrica precisa: RDS + peers + sf-eslint-config.
  // Ver docs/design/webapp-generator.md §5 ("editar leve").
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

  // Próximas peças:
  //   - Peça 4: delegação real ao create-next-app (subprocess, §3)
  //   - Peça 5: tools/smoke-webapp.sh (smoke real, §10.2)
}

export default webappGenerator;
