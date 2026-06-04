import { Tree } from '@nx/devkit';

import { WebappGeneratorSchema } from './schema';

// Mirrors `schema.json#properties.name.pattern`. Kept in sync by hand: the
// JSON schema is consumed by Nx CLI at invocation time; this regex is the
// in-code defense for callers that bypass the CLI (direct generator API
// calls, integration tests). Defense in depth, not duplication.
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

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

export async function webappGenerator(_tree: Tree, options: WebappGeneratorSchema): Promise<void> {
  validateOptions(options);
  // Peça 1 (atual): scaffold + schema validado. Comportamento substantivo
  // virá nas próximas peças, sempre referenciando docs/design/webapp-generator.md:
  //   - Peça 2: fixture do create-next-app capturada como dado de teste (§10.1)
  //   - Peça 3: harness — sobrescrita dos 5 arquivos + criação do providers.tsx
  //             + edição leve do package.json (§5 + §9)
  //   - Peça 4: delegação ao create-next-app via subprocess (§3)
  //   - Peça 5: smoke real em tools/smoke-webapp.sh (§10.2)
}

export default webappGenerator;
