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

**Condition `@scout-fabric/source` é dev-time apenas.** Ela vive no
`tsconfig.base.json#customConditions` para o TS do workspace resolver
imports de pacote para source em vez de dist. **Nunca aparece no
`exports` publicado** — apontaria para `src/` que não está no tarball, e
um consumidor externo que adicionasse a condition no próprio tsconfig
quebraria. Referência em [`../architecture/context.md`](../architecture/context.md).

**Sincronizar o lockfile.** Após editar `dependencies` /
`peerDependencies`, rodar `pnpm install` no root (sem
`--frozen-lockfile`) para o `pnpm-lock.yaml` refletir. Commitar o
lockfile junto. CI roda com `--frozen-lockfile` e os três jobs
quebram antes mesmo de `verify` chegar nos targets.

**Peer deps invisíveis ao linter.** O `@nx/dependency-checks` mira
`dependencies` + `peerDependencies` e pede que algo no source do
pacote importe cada entrada. Peers que são **contratos para o
consumidor** (ex.: `eslint`, `react`) e que não aparecem em `import`
no source do próprio pacote precisam de
`ignoredDependencies: [...]` no `eslint.config.mjs` do pacote:

```js
'@nx/dependency-checks': ['error', {
  ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
  ignoredDependencies: ['eslint'],
}]
```

**Peers contratuais verificam-se em runtime, não em manifesto.** Para
pacotes que espalham presets de terceiros (ex.: `sf-eslint-config`
espalha `nx.configs['flat/typescript']`), o que o preset
**`require()`s em runtime** pode divergir do que ele **declara como
peer**. Caso real: `@nx/eslint-plugin` declara
`@typescript-eslint/parser` como peer, mas o preset
`flat/typescript` faz `require('typescript-eslint')` (a umbrella) no
load. Quem espalha o preset tem que declarar a umbrella como peer,
não o parser. Nenhum `pnpm pack --dry-run`, `@nx/dependency-checks`
ou typecheck pega isso — só `tools/smoke-publish.sh`, que instala o
pacote num consumidor descartável e roda a ferramenta de verdade.
**Sempre rode o smoke antes de publicar um pacote que espalha
presets de terceiros.**

**`.d.ts` do default exportado deve ser neutro.** Para pacotes JS
publicáveis, anote o tipo do `export default` explicitamente com
tipos vindos de um peer já declarado (ex.: `Linter.Config[]` de
`eslint`). Sem anotação, o TS infere a partir do que é espalhado e o
`.d.ts` resultante pode arrastar uma referência a um pacote
transitivo (ex.: `import("typescript-eslint").FlatConfig.Config`)
que o consumidor não tem instalado — quebra para quem está sem
`skipLibCheck`. Confirme abrindo o `dist/*.d.ts` e procurando por
`import("<pkg>")`: se aparece, anote no source.

**`importHelpers` honesto.** A heurística em
`@nx/js/find-npm-dependencies` exige `tslib` em `dependencies`
sempre que o `tsconfig.lib.json` efetivo do pacote tem
`importHelpers: true`, independente do dist emitido usar helper.
Se o source do pacote não dispara helpers (sem async, sem spread
em target < ES2022, sem decorators), override `importHelpers: false`
no `tsconfig.lib.json` do pacote e omita o `tslib`. Confirme com
`grep tslib dist/` — deve sair vazio.

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

| Aspecto                                   | Invariante (sempre)                             | Varia por pacote                                                       |
| ----------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Nome do projeto Nx                        | `sf-<pkg>`                                      | `<pkg>`                                                                |
| Scope publicado                           | `@fabio.caffarello/sf-<pkg>`                    | —                                                                      |
| Bundler                                   | `tsc` (via `@nx/js/typescript`)                 | —                                                                      |
| Build command efetivo                     | `tsc --build tsconfig.lib.json`                 | —                                                                      |
| Linter                                    | `eslint` (estende `eslint.config.mjs` raiz)     | —                                                                      |
| Test runner                               | `vitest` via `@nx/vite/plugin`                  | —                                                                      |
| Test env                                  | `node`                                          | —                                                                      |
| Coverage                                  | v8 + `text,html` + `./coverage`, sem thresholds | —                                                                      |
| `customConditions` no manifesto publicado | **ausente** (vive só em `tsconfig.base.json`)   | —                                                                      |
| `publishConfig.access`                    | `public`                                        | —                                                                      |
| Tag `scope:*`                             | `scope:public`                                  | (interno usaria `scope:internal` — não há ainda)                       |
| Tag `type:*`                              | —                                               | `type:config` \| `type:eslint-config` \| `type:plugin` \| `type:utils` |
| `engines.node` (no manifesto publicado)   | herdar do workspace (`>=22.0.0`) ou ≥ ele       | pacotes com requisito mais alto podem subir                            |
| O que o pacote exporta                    | —                                               | JSON configs, função/objeto TS, generators/executors, etc.             |
| O que o primeiro teste verifica           | —                                               | o comportamento concreto do artefato                                   |
| `dependencies` runtime                    | `tslib` quando o source emite helpers           | + deps reais; ausente em pacotes JSON-puro (ver §8)                    |
| Build target (inferido)                   | presente quando há `tsconfig.lib.json`          | ausente em pacotes JSON-puro (ver §8)                                  |

`type:plugin` denota a forma estrutural Forma C — pacote que hospeda
generators Nx, com build explícito `@nx/js:tsc` + assets +
`generators.json`. Detalhada em §8.b.

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

---

## 8) Variantes conhecidas

Se o pacote não bate com a forma "lib TS publicável padrão", siga a
variante correspondente — os ajustes substituem (não somam aos) da
seção 3.

### 8.a) Config JSON-puro (ex.: `sf-tsconfig`)

Pacote que entrega só artefatos JSON estáticos via subpath exports,
sem dimensão JS publicada.

**Marcador para reconhecer:** sem `tsconfig.lib.json`, sem `dist/`,
sem `dependencies`, sem entrada `"."` em `exports`. Se um pacote
tem qualquer um desses, **não** é JSON-puro — é a forma padrão.

**O que diverge da seção 3:**

- `package.json` sem `main`, `module`, `types`. `exports` tem
  apenas subpath exports apontando para os JSONs:
  ```jsonc
  "exports": {
    "./package.json": "./package.json",
    "./base.json": "./base.json",
    "./lib.json": "./lib.json"
  }
  ```
- `files` lista apenas os JSONs + `README.md` (sem `dist`, sem
  filtro de `tsbuildinfo`).
- `dependencies` ausente. Pacote é estático; não emite JS.
- `tsconfig.lib.json` **removido**. Sem ele, `@nx/js/typescript`
  deixa de inferir o target `build`. `nx run-many -t build` pula
  em silêncio; `preVersionCommand` (`pnpm exec nx run-many -t build`)
  continua válido.
- `tsconfig.json` raiz do pacote referencia só
  `./tsconfig.spec.json` (sem `tsconfig.lib.json`).
- `tsconfig.spec.json` sem `references` ao `tsconfig.lib.json`.
- README declara o contrato implícito do JSON (ex.: `TypeScript >= 5.0`
  para `module: nodenext` + flags de strictness modernas).
- Teste comportamental (seção 4) lê os JSONs via `fs.readFileSync`,
  não via `import`. Não depende de build.

**Quando usar:** o pacote entrega configuração estática para outras
ferramentas (`tsconfig`, `package.json`-style configs, schemas
`.json`, etc.).

**Quando NÃO usar:** se entrega função, classe, objeto, executor,
generator, plugin Nx, flat config de ESLint — qualquer coisa que é
código carregado, use a forma padrão.

### 8.b) Plugin (host de generators Nx — ex.: `sf-plugin`)

Pacote que hospeda generators Nx executados via `nx g <pkg>:<name>` no
consumidor. A única forma da fábrica que **gera código no consumidor**
— base do `materialize` do scout.

**Marcador para reconhecer:** `generators.json` na raiz; chave
`"generators": "./generators.json"` no `package.json`; **ausência** de
`"type": "module"`; build declarado à mão com `@nx/js:tsc` + `assets`;
tag `type:plugin`. Se um pacote tem qualquer um desses, é Forma C.
Reciprocamente: se um pacote **não** tem `generators.json`, **não** é
Forma C.

**Generator de nascimento:** `@nx/plugin:plugin`, **não** `@nx/js:lib`
(que é o da forma padrão e da §8.a). Ancorado no corpo do commit
`73212d7` ("Side-effects do `@nx/plugin:plugin` no workspace estão
neste commit").

#### Comando — graduação inline por flag

```sh
pnpm exec nx g @nx/plugin:plugin packages/sf-<pkg> \
  --linter=eslint \
  --tags=scope:public,type:plugin \
  --useProjectJson=false \
  --importPath=@fabio.caffarello/sf-<pkg> \
  --no-interactive \
  --unitTestRunner=none
```

| Flag                                      | Grau                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--linter=eslint`                         | **OBSERVADO-por-resultado** (`packages/sf-plugin/eslint.config.mjs` existe; convenção do workspace)                                                                                                                                                                                                                                                  |
| `--tags=scope:public,type:plugin`         | **OBSERVADO-por-resultado** (`packages/sf-plugin/package.json:61-63`)                                                                                                                                                                                                                                                                                |
| `--useProjectJson=false`                  | **OBSERVADO-por-resultado** (ausência de `project.json` em `packages/sf-plugin/`)                                                                                                                                                                                                                                                                    |
| `--importPath=@fabio.caffarello/sf-<pkg>` | **OBSERVADO-por-resultado** (`packages/sf-plugin/package.json:2`)                                                                                                                                                                                                                                                                                    |
| `--no-interactive`                        | **OBSERVADO-por-convenção-universal** do workspace                                                                                                                                                                                                                                                                                                   |
| `--unitTestRunner=none`                   | **INFERIDO-DO-EFEITO**. O corpo do `73212d7` diz "`@nx/jest` peer indesejado **removido**" — "removido" pode significar (a) o generator rodou com runner default que pulled `@nx/jest`, limpo depois; ou (b) rodou com `none` por outra razão. `none` evita o cleanup; o uso histórico em `73212d7` é ambíguo. Verificar na primeira invocação real. |
| `--description=<...>`                     | **LACUNA**: flag aceita pelo generator, não registrada em `73212d7`.                                                                                                                                                                                                                                                                                 |

O comando **parece** análogo ao de §8.a (literal testado), mas as
graduações são diferentes — algumas flags têm cobertura indireta ("o
estado real do `sf-plugin` confirma o efeito"), uma é genuinamente
inferida do efeito. Quem copia-cola leva os graus junto.

#### Regra CJS — obrigatório no perfil de compat atual

O Nx CLI carrega cada factory de generator via `require()` literal
(`node_modules/nx/dist/src/config/schema-utils.js:26`, dentro de
`getImplementationFactory`, chamada de `generator-utils.js:24` durante
`getGeneratorInformation`).

**Fatos do Node** (OBSERVADO-FORA-DO-REPO; fonte canônica:
[Node v22.12.0 release notes](https://nodejs.org/en/blog/release/v22.12.0)
— LTS "Jod", 2024-12-03; espelho:
[github.com/nodejs/node releases/v22.12.0](https://github.com/nodejs/node/releases/tag/v22.12.0)):

- A partir da v22.12.0, `require(esm)` é **default-on**; antes estava
  atrás de `--experimental-require-module`.
- Em Node 22.0–22.11, `require()` em ESM lança `ERR_REQUIRE_ESM`.
- Mesmo com `require(esm)` habilitado, `require()` de um ES module
  lança `ERR_REQUIRE_ASYNC_MODULE` quando o módulo **ou qualquer dep
  no grafo** usa **top-level await**.
- Na linha 22.x, o warning experimental de `require(esm)` **não é
  emitido** quando o `require` vem de path contendo `node_modules`.
  Como o `sf-plugin` é carregado pelo Nx a partir de `node_modules` no
  consumidor, a distinção CJS-vs-ESM aqui é sobre **funcionar** (a
  janela `ERR_REQUIRE_ESM` em 22.0–22.11, mais o caso de top-level
  await) — **não** sobre warning. Nomeado para não confundir falha
  com ruído.

**Consequência para a Forma C.** `sf-plugin` **não declara
`engines.node` próprio** — herda o piso prático do workspace
(`>=22.0.0`), que **inclui** Node 22.0–22.11. Logo:

- Forma C **não declara `"type": "module"`** no `package.json`. O
  `dist/index.js` resultante é CJS (`"use strict";` na primeira linha).
- Modernizar para ESM **não** é edit isolado do `"type"`. Exigiria as
  duas condições simultâneas:
  1. **Elevar `engines.node` para `≥22.12.0`** — resolve a janela
     `ERR_REQUIRE_ESM` em 22.0–22.11.
  2. **Garantir que o módulo do plugin e todas as deps no grafo não
     usem top-level await** — caso contrário, `require()` no consumidor
     lança `ERR_REQUIRE_ASYNC_MODULE` mesmo em Node ≥22.12. Para
     factories Nx síncronas isso raramente é problema, mas a condição
     é parte da regra.

#### O que diverge da seção 3

1. **`package.json` top-level: `"generators": "./generators.json"`**
   e `"generators.json"` em `files[]`. Sem isso, o Nx CLI não descobre
   os generators no consumidor instalado.
2. **`nx.targets.build` declarado à mão** no `package.json#nx.targets`,
   com `executor: "@nx/js:tsc"`, `generatePackageJson: false`, e
   **dois blocos `assets[]`**:
   - bloco 1, `glob: "**/!(*.ts)"` — copia templates EJS e `schema.json`;
   - bloco 2, `glob: "**/*.d.ts"` — copia schemas tipados à mão (o
     bloco 1 exclui `.d.ts`).

   Cada bloco precisa de **dois entries** em `ignore` para fixtures:
   `"**/__fixtures__/**"` e `"**/__fixtures__/**/.*"` (atrito do
   `@nx/js:tsc` com dotfiles — fonte canônica em
   [`generator.md`](./generator.md) §5.c #2).

3. **`tsconfig.lib.json#exclude` ganha `"src/**/**fixtures**/**"`**
   quando o plugin tem fixtures. Sem isso, `tsc --build` tentaria
   typecheckar `.ts`/`.d.ts` da fixture contra deps que o plugin não
   tem. Fonte em [`generator.md`](./generator.md) §5.c #1.
4. **`@nx/devkit` em `dependencies`** (não peer) + `tslib` mantido.
   O plugin importa `Tree`, `generateFiles`, `updateJson`,
   `workspaceRoot` em runtime — deps reais.
5. **Sem `"type": "module"`** (regra CJS acima).
6. **`vitest.config.mts` e `tsconfig.spec.json` criados à mão.**
   `@nx/vite:configuration` recusa projetos com `@nx/js:tsc` explícito
   (lista de unsupported executors do `@nx/vite`; observado no corpo
   de `73212d7`).
7. **`eslint.config.mjs` do pacote**: ganha regra
   `@nx/nx-plugin-checks` sobre `**/package.json` e
   `**/generators.json`, e `ignores: ['**/__fixtures__/**']` quando há
   fixtures.

**Camadas anti-fixture** (apenas quando o plugin tem fixtures): seis
camadas — `tsconfig.lib.json#exclude`, `assets[].ignore` (2 entries
por bloco), `.nxignore`, `.gitignore` raiz com unignore,
`.prettierignore`, e o `eslint.config.mjs` do pacote. Documentadas em
[`generator.md`](./generator.md) §5.c + §5.e; não duplicadas aqui.

**`src/index.ts` pode ser vazio.** O entry só satisfaz a convenção do
scope publicável — a API real é descoberta via `generators.json`.

**Quando usar:** o pacote hospeda generators (e/ou executors,
migrations) Nx que serão invocados via `nx g <pkg>:<name>` no
consumidor.

**Quando NÃO usar:** se entrega função, classe, objeto pronto para
import (sem dimensão de generator), use a forma padrão (§1–§7). Se
entrega JSON estático, use §8.a.
