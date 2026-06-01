# Convenção — pacote publicável `sf-*`

Referência única para criar um pacote `@fabio.caffarello/sf-*` correto.
Destila o que está implícito no `sf-tsconfig` e o que vive espalhado em
[`../architecture/context.md`](../architecture/context.md),
[`../../CLAUDE.md`](../../CLAUDE.md) e nas memórias do projeto.

**Princípio que vale para tudo abaixo: use o Nx.** Generators do `@nx/js`
e `@nx/vite`, executores inferidos pelos plugins, `nx affected` para
escopar trabalho. Não escreva à mão o que o generator escreve.

---

## 1) Gerar

Dois comandos, nessa ordem. Substitua `<pkg>` (sem o prefixo `sf-`) e
`<type>` (ver tabela de tags na seção 5).

```sh
pnpm exec nx g @nx/js:lib packages/sf-<pkg> \
  --name=sf-<pkg> \
  --bundler=tsc \
  --publishable \
  --importPath=@fabio.caffarello/sf-<pkg> \
  --linter=eslint \
  --unitTestRunner=none \
  --tags=scope:public,type:<type> \
  --useProjectJson=false \
  --no-interactive

pnpm exec nx g @nx/vite:configuration \
  --project=sf-<pkg> \
  --includeVitest=true \
  --uiFramework=none \
  --testEnvironment=node \
  --no-interactive
```

**Por que dois passos:** `@nx/js:lib` cria a estrutura publicável; o
`@nx/vite:configuration` adiciona `vitest.config`, `tsconfig.spec.json`
e infere o target `test` via `@nx/vite/plugin`.

**Não use `--unitTestRunner=vitest` no `@nx/js:lib`.** Aquele caminho
chama um generator deprecated (`@nx/vite:vitest`) e ainda gera config
quebrada para TS Solution. Sempre dois passos.

---

## 2) Estado pós-generator — o que o Nx escreve

```
packages/sf-<pkg>/
├── package.json                  # ajustes obrigatórios na seção 4
├── README.md                     # placeholder; reescrever
├── eslint.config.mjs             # estende a raiz + @nx/dependency-checks
├── src/
│   ├── index.ts                  # re-export do stub
│   └── lib/
│       ├── sf-<pkg>.ts           # stub: export function sf<Pkg>(): string
│       └── sf-<pkg>.spec.ts      # teste trivial do stub (mantém)
├── tsconfig.json                 # references → lib + spec
├── tsconfig.lib.json             # build: tsc --build
├── tsconfig.spec.json            # PRECISA DE FIX (seção 3)
└── vitest.config.mts             # OK se reescrito (seção 3)
```

Além disso, o Nx também escreve **arquivos parasitas que precisam ser
removidos**. Não deixe passar:

| Arquivo                                 | Por que tem que sair                                                      |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `packages/sf-<pkg>/vite.config.mts`     | Faz `build` virar `vite build`. Queremos `tsc --build tsconfig.lib.json`. |
| `vitest.workspace.ts` (raiz, se nascer) | Nx já gerencia cada `test` per-project. Workspace mode duplica controle.  |
| `nx.json#targetDefaults.test.dependsOn` | Se o generator adicionar `["^build"]`, **remover**: ver decisão abaixo.   |

**Decisão de design colada aqui** (já registrada no
[`../architecture/context.md`](../architecture/context.md)):
`targetDefaults.test.dependsOn` **NÃO** inclui `^build` porque o
`customConditions: ["@scout-fabric/source"]` resolve imports do
workspace para o TS source em dev. Forçar `^build` antes de test é
trabalho inútil que mata o ganho do TS Solution.

---

## 3) Ajustes obrigatórios pós-generator

### a) `tsconfig.spec.json` — `references` ao `tsconfig.lib.json`

**Sem isto, CI pega TS6307** (cache local mascara o bug):

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    /* ... gerado ... */
  },
  "include": [
    /* ... gerado ... */
  ],
  "references": [{ "path": "./tsconfig.lib.json" }],
}
```

Reproduzir o sintoma local: `pnpm exec nx reset && pnpm exec nx run sf-<pkg>:typecheck`.

### b) `vitest.config.mts` — reescrever limpo

O `@nx/vite:configuration` injeta `build`/`dts` e outras coisas que não
queremos. Substitua o arquivo inteiro por:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '../../node_modules/.vite/packages/sf-<pkg>',
  test: {
    name: 'sf-<pkg>',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
  },
});
```

### c) `package.json` — `publishConfig`, `files`, `exports`

O generator dá um bom esqueleto. Garanta:

```jsonc
{
  "name": "@fabio.caffarello/sf-<pkg>",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",

  "exports": {
    "./package.json": "./package.json",
    // ...uma entrada por artefato exportado (ex.: "./base.json": "./base.json")
    ".": {
      "@scout-fabric/source": "./src/index.ts", // INVARIANTE: condition de dev
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js",
    },
  },

  "files": ["dist", "README.md", "!**/*.tsbuildinfo" /* + JSONs/assets publicados */],

  "publishConfig": {
    "access": "public", // INVARIANTE para scope público
  },

  "nx": {
    "name": "sf-<pkg>",
    "tags": ["scope:public", "type:<type>"],
  },

  "dependencies": {
    "tslib": "^2.3.0",
    // + runtime deps reais
  },
}
```

**Não confunda** `@scout-fabric/source` (condition interna, dev-time)
com `@fabio.caffarello/sf-<pkg>` (scope publicado). Os dois aparecem
juntos no `exports` por design e nunca devem ser permutados —
referência em [`../architecture/context.md`](../architecture/context.md).

### d) README do pacote

Substituir o placeholder por algo que explique:

1. O que o pacote exporta (mapa para `exports`).
2. Como o consumidor usa (exemplo concreto de import / `extends` / `plugins:`).

---

## 4) O primeiro teste — comportamento, não tautologia

O spec stub que o generator deixa em `src/lib/sf-<pkg>.spec.ts` testa
uma função stub trivial. **Manter, mas não é o teste que importa.**

O teste que importa é o que verifica o **artefato real publicado**.
Convenção: `src/<artifact>.spec.ts`. Padrão do `sf-tsconfig`:

- Carrega o artefato como o consumidor carrega (via `import` ou via
  `fs` quando o artefato é JSON puro).
- Asserta o **comportamento prometido**: para um JSON de config TS, as
  flags que o pacote promete entregar. Para uma config ESLint, as
  regras-chave. Para um generator, o `Tree` resultante. Para uma lib
  utilitária, o I/O concreto de funções públicas.
- Inclui ao menos uma asserção que pegaria regressão silenciosa.

`sf-tsconfig`/`src/configs.spec.ts` é exemplo canônico — assert que
`base.json` tem `noUncheckedIndexedAccess: true`, que `lib.json`
estende `./base.json`, que `customConditions` **não** vaza para o
artefato publicado.

`expect(true).toBe(true)` ou checagem só de existência de chave **não
conta**. O smoke test em `tools/smoke-publish.sh` complementa: prova
que o tarball, instalado num consumidor real, faz o que o spec diz.

---

## 5) Invariantes vs. variáveis por pacote

| Aspecto                                 | Invariante (sempre)                             | Varia por pacote                                                       |
| --------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Nome do projeto Nx                      | `sf-<pkg>`                                      | `<pkg>`                                                                |
| Scope publicado                         | `@fabio.caffarello/sf-<pkg>`                    | —                                                                      |
| Bundler                                 | `tsc` (via `@nx/js/typescript`)                 | —                                                                      |
| Build command efetivo                   | `tsc --build tsconfig.lib.json`                 | —                                                                      |
| Linter                                  | `eslint` (estende `eslint.config.mjs` raiz)     | —                                                                      |
| Test runner                             | `vitest` via `@nx/vite/plugin`                  | —                                                                      |
| Test env                                | `node`                                          | —                                                                      |
| Coverage                                | v8 + `text,html` + `./coverage`, sem thresholds | —                                                                      |
| `customConditions` do exports           | `@scout-fabric/source` → `./src/index.ts`       | —                                                                      |
| `publishConfig.access`                  | `public`                                        | —                                                                      |
| Tag `scope:*`                           | `scope:public`                                  | (interno usaria `scope:internal` — não há ainda)                       |
| Tag `type:*`                            | —                                               | `type:config` \| `type:eslint-config` \| `type:plugin` \| `type:utils` |
| `engines.node` (no manifesto publicado) | herdar do workspace (`>=22.0.0`) ou ≥ ele       | pacotes com requisito mais alto podem subir                            |
| O que o pacote exporta                  | —                                               | JSON configs, função/objeto TS, generators/executors, etc.             |
| O que o primeiro teste verifica         | —                                               | o comportamento concreto do artefato                                   |
| `dependencies` runtime                  | `tslib` (default)                               | + dependências reais do artefato                                       |

---

## 6) Validar antes de pedir review

Local, todos verdes:

```sh
pnpm exec nx run sf-<pkg>:typecheck
pnpm exec nx run sf-<pkg>:lint
pnpm exec nx run sf-<pkg>:test
pnpm exec nx run sf-<pkg>:test --coverage
pnpm exec nx run sf-<pkg>:build
pnpm exec nx reset && pnpm exec nx run sf-<pkg>:typecheck   # reproduz pitfall do TS6307 se houver
```

Antes do PR final, smoke contra Verdaccio (opcional mas recomendado
para pacotes não-triviais):

```sh
./tools/smoke-publish.sh   # ajusta o script se a prova comportamental do novo pacote for diferente
```

A prova comportamental do smoke é o aceite real: o pacote instalado
num consumidor descartável produz o efeito prometido (ver
[`../release.md`](../release.md)).

---

## 7) O que **não** entra aqui

Coisas que vivem em outros docs e não devem ser duplicadas:

- Setup de testes do workspace, decisões sobre Vitest vs. Jest →
  memórias de projeto + [`../architecture/context.md`](../architecture/context.md).
- Pipeline de CI, branch protection → [`../ci.md`](../ci.md) e [`../governance.md`](../governance.md).
- Pipeline de release, checklist do `NPM_TOKEN` → [`../release.md`](../release.md).
- Naming/topologia/condition `@scout-fabric/source` → [`../architecture/context.md`](../architecture/context.md).
