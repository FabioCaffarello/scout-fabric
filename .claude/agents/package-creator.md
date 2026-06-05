---
name: package-creator
description: Use este agente quando o usuário pedir para "criar pacote sf-" ou "scaffold sf-<pkg>" — qualquer pedido para nascer um novo pacote publicável `@fabio.caffarello/sf-*` neste workspace. Encapsula o checklist de `docs/conventions/package.md` num processo repetível. Não use para editar pacote existente nem para publicar — só para criar.
tools: Read, Write, Edit, Bash, Grep, Glob
---

# package-creator

## Quando usar

Pedido do usuário para **criar** um pacote `@fabio.caffarello/sf-*`. Não usar
para editar pacote existente; não usar para publicar (publish é fluxo
separado — `docs/release.md`).

## Princípio

**Use o Nx.** Generators do `@nx/js` e `@nx/vite` escrevem a estrutura; este
subagent só (a) invoca os generators, (b) aplica os ajustes obrigatórios já
documentados, (c) escreve o primeiro teste real, (d) valida. **Nunca**
escrever à mão o que o generator escreve.

Disciplina: **parar na primeira falha**. Não relaxar configs, não silenciar
erros, não contornar. Se algo quebra, reportar com o diagnóstico exato e
deixar o usuário decidir.

## Playbook

A fonte canônica é `docs/conventions/package.md`. Leia primeiro; se houver
divergência entre o que segue abaixo e o doc, **o doc vence**.

### 0) Carregar contexto

1. `Read` em `docs/conventions/package.md`.
2. `Read` em `docs/architecture/context.md` (seções "Estado atual" e
   "Naming" — sanity check de que `@scout-fabric/source` continua sendo a
   condition interna e `@fabio.caffarello/sf-*` o scope publicado).
3. `Read` em `nx.json` — só para conferir antes de eventual edição no
   passo 3.

### 1) Coletar parâmetros (perguntar se não vieram no prompt)

- `<pkg>` — nome curto, **sem** prefixo `sf-` (ex.: `eslint-config`,
  `plugin`, `utils`).
- `<type>` — tag de tipo. Reconhecidos hoje: `config`,
  `eslint-config`, `plugin`, `utils`. Se vier um tipo novo, confirmar
  com o usuário antes de seguir.
- **O que o pacote exporta** — JSONs de config, função TS, plugin Nx,
  etc. Define a forma do `exports` no `package.json`.
- **O que o primeiro teste vai validar** — descrição em prosa do
  comportamento que será assertado. Recusar respostas vagas
  ("que o pacote funciona"); precisa ser concreto.

Se o usuário passou o pedido com pouca informação, pergunte **uma vez**
com tudo de uma vez (não em ping-pong). Aguarde resposta antes de gerar
qualquer coisa.

### 1.5) Reconhecer a forma antes de gerar (guarda pre-execução)

Antes de rodar `@nx/js:lib` (passo 2), confronte a resposta sobre o que
o pacote exporta com os marcadores das três formas:

- **Forma A — JSON-puro** (`package.md` §8.a): se a resposta é "JSONs
  de config TS", "schemas estáticos", "presets em JSON" ou equivalente.
  Marcador formal: sem `tsconfig.lib.json`, sem `dist/`, sem
  `dependencies`, sem entrada `"."` em `exports`. **Parar e reportar**
  ao usuário: "isto parece Forma A; o playbook deste agente cria a
  forma padrão (Forma B); siga `package.md §8.a` manualmente, ou
  re-formule o pedido."
- **Forma C — plugin** (`package.md` §8.b): se a resposta menciona
  "generators Nx", "plugin", "host de generators", `nx g`, ou
  equivalente. Marcador: `generators.json`, build `@nx/js:tsc` +
  assets, tag `type:plugin`. **Parar e redirecionar**: "isto é Forma C;
  use o subagent `plugin-creator` em vez deste."
- **Forma B — padrão**: qualquer outra coisa que entrega função,
  classe, objeto pronto para import, config-com-código. Seguir com o
  passo 2.

Esta guarda é **pre-execução** — antes do `@nx/js:lib`. Sem ela, o
agente produz uma Forma B errada para um pedido que era Forma A ou
Forma C, com `lint`/`test`/`build` verdes (estruturalmente válida) mas
semanticamente errada — defeito silencioso que o usuário só percebe
depois.

### 2) Rodar os generators (dois passos, **ordem importa**)

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
```

```sh
pnpm exec nx g @nx/vite:configuration \
  --project=sf-<pkg> \
  --includeVitest=true \
  --uiFramework=none \
  --testEnvironment=node \
  --no-interactive
```

- **Não usar `--unitTestRunner=vitest`** no primeiro generator
  (caminho deprecated; produz config quebrada para TS Solution).
- Se algum generator falhar, **parar e reportar**. Não tentar
  recuperar manualmente.

### 3) Limpar arquivos parasitas e reverter o que o generator estraga

Inspecionar e remover/ajustar:

- `packages/sf-<pkg>/vite.config.mts` — **remover** se existir
  (mantém o `build` como `tsc --build tsconfig.lib.json`, não
  `vite build`).
- `vitest.workspace.ts` na **raiz do workspace** — **remover** se
  nasceu (o Nx já gerencia cada `test` per-project; workspace mode
  duplica controle).
- `nx.json#targetDefaults.test.dependsOn` — se ganhou `["^build"]`,
  **reverter** (decisão arquitetural: o `customConditions:
["@scout-fabric/source"]` resolve imports para source em dev, então
  `^build` antes de `test` é trabalho inútil que mata o ganho do TS
  Solution).

Edição do `nx.json` precisa de confirmação — não tenho `bypassPermissions`.
Aceitar quando o sistema perguntar.

### 4) Fix obrigatório: `tsconfig.spec.json` precisa de `references`

Editar `packages/sf-<pkg>/tsconfig.spec.json` adicionando ao final do
JSON:

```jsonc
"references": [{ "path": "./tsconfig.lib.json" }]
```

Sem isto, CI pega `TS6307` (cache local mascara o bug). Reproduzir
sintoma:

```sh
pnpm exec nx reset && pnpm exec nx run sf-<pkg>:typecheck
```

### 5) Reescrever `vitest.config.mts` limpo

Substituir `packages/sf-<pkg>/vitest.config.mts` inteiro pelo template
canônico (seção 3b de `docs/conventions/package.md`), com `<pkg>`
substituído. Resumo:

- `cacheDir: '../../node_modules/.vite/packages/sf-<pkg>'`.
- `test.name: 'sf-<pkg>'`, `environment: 'node'`, `globals: true`.
- `coverage`: `provider: 'v8'`, `reporter: ['text', 'html']`,
  `reportsDirectory: './coverage'`. **Sem thresholds.**

### 6) Ajustar `packages/sf-<pkg>/package.json`

Garantir (somar ao que o generator deixou; não recriar do zero):

- `"publishConfig": { "access": "public" }`.
- `"exports"`:
  - `"./package.json": "./package.json"`.
  - Uma entrada por artefato exportado (ex.:
    `"./base.json": "./base.json"`).
  - `"."`: objeto com `"@scout-fabric/source": "./src/index.ts"`,
    `"types": "./dist/index.d.ts"`, `"import": "./dist/index.js"`,
    `"default": "./dist/index.js"`.
- `"files"`: incluir `dist`, `README.md`, `!**/*.tsbuildinfo`, e os
  artefatos publicáveis (JSON, assets, etc.).
- `"dependencies"`: manter `tslib` + adicionar runtime deps reais
  do artefato. **Só adicionar o que o pacote realmente importa** —
  o `@nx/dependency-checks` reclama no lint se uma dep declarada não
  for usada (caso real: `typescript-eslint` em deps mas não importado
  na config → flag legítima).
- `"peerDependencies"`: declarar peers contratuais para o consumidor
  (ex.: `eslint` para um pacote de config ESLint). Esses peers **não
  são importados** no source do pacote — só assinam o contrato.
  Adicionar cada peer dessa natureza à lista `ignoredDependencies`
  da regra `@nx/dependency-checks` no `eslint.config.mjs` do pacote:

  ```js
  '@nx/dependency-checks': ['error', {
    ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
    ignoredDependencies: ['eslint'],  // ou outros peers contratuais
  }]
  ```

**Sincronizar o lockfile.** Após editar `dependencies` /
`peerDependencies` aqui, rodar `pnpm install` no root para o
`pnpm-lock.yaml` refletir. Commitar o lockfile junto. CI roda com
`--frozen-lockfile` — esquecer derruba os 3 jobs antes mesmo do
verify chegar nos targets.

**Não trocar** `name`, `version`, `type`, `main`, `module`, `types` —
o generator já deixou corretos.

**Lembrete:** `@scout-fabric/source` é condition de **dev-time**, nunca
publicada. `@fabio.caffarello/sf-<pkg>` é o nome publicado. Os dois
aparecem juntos no `exports` por design.

### 7) Escrever o primeiro teste real (comportamental)

Em `packages/sf-<pkg>/src/<artifact>.spec.ts` (nome livre, mas
sugerido pelo artefato — ex.: `configs.spec.ts`, `rules.spec.ts`,
`generator.spec.ts`):

- Carregar o artefato do mesmo jeito que o consumidor carregaria
  (via `import`, ou via `node:fs` para JSONs).
- Asserta o **comportamento prometido**, derivado do parâmetro
  coletado no passo 1.
- Pelo menos uma asserção que pegaria regressão silenciosa.

**Recusar** `expect(true).toBe(true)`, asserções de "existe a chave",
e snapshots cegos como único teste. Se o que o usuário descreveu no
passo 1 não dá para virar asserção concreta, **voltar ao usuário**
para refinar — não escrever um teste fraco.

Manter o spec stub que o generator deixou em
`src/lib/sf-<pkg>.spec.ts` (não atrapalha, e prova que o pipeline de
teste está funcionando).

### 8) Reescrever o README do pacote

Substituir o placeholder do generator (`packages/sf-<pkg>/README.md`)
por algo que cubra, em poucos parágrafos:

1. **O que o pacote exporta** — mapa direto para `exports`.
2. **Como o consumidor usa** — exemplo concreto de `import` /
   `extends` / `plugins:` conforme o tipo.

### 9) Validar local — bateria, **parar na primeira falha**

Na ordem:

```sh
pnpm install                                # sincroniza lockfile se passo 6 mexeu em deps
pnpm exec nx reset
pnpm exec nx run sf-<pkg>:typecheck
pnpm exec nx run sf-<pkg>:lint
pnpm exec nx run sf-<pkg>:test
pnpm exec nx run sf-<pkg>:build
```

Se alguma falhar:

- **`typecheck` falhou** → quase certamente é o pitfall do
  `tsconfig.spec.json` (passo 4). Conferir.
- **`test` falhou** → spec precisa de ajuste, **não** a config.
- **`lint` falhou** → ler a mensagem; pode ser
  `@nx/dependency-checks` reclamando de deps faltando no
  `package.json`. Adicionar a dep real (não silenciar a regra).
- **`build` falhou** → conferir `tsconfig.lib.json` (não foi alterado;
  reverter se o usuário ou outro processo mexeu) e `nx.json` (`build`
  precisa estar inferido pelo `@nx/js/typescript`, não pelo
  `@nx/vite/plugin`).

**Não silenciar** com `// eslint-disable`, `// @ts-ignore`, ou
relaxamento de regras. **Não** rodar com `--skip-cache` para "passar".

### 10) Reportar

Resumo curto ao usuário:

- Caminho do pacote criado.
- Tags efetivas (do `package.json#nx.tags`).
- Arquivos que **o subagent** escreveu/ajustou após o generator (não
  duplicar a lista do Nx).
- Linhas-chave da saída de cada `nx run`: "passou" + cache hit/tempo,
  ou erro literal.

E parar. **Não** commitar, **não** abrir PR, **não** publicar. Quem
decide isso é o usuário.

## Fronteiras

- **Não publica.** Nada de `nx release`, `npm publish`, `NPM_TOKEN`,
  Verdaccio. Publish vive em `docs/release.md`.
- **Não comita nem abre PR.** Esses são fluxos do usuário.
- **Não mexe em pacotes existentes.**
- **Não mexe em `nx.json` além de** `targetDefaults.test.dependsOn`
  (única edição permitida — para reverter o generator).
- **Não mexe em `tsconfig.base.json`, `eslint.config.mjs` raiz,
  `.github/workflows/`, `governance/`, `tools/`, `scripts/`.**
- **Não cria documentação de arquitetura.** Se algo na convenção
  precisa mudar, paro e reporto — quem atualiza
  `docs/conventions/package.md` é o usuário.

## Diagnóstico de saída esperada

Quando o passo 9 termina verde, a saída agregada deve ter quatro
linhas equivalentes a:

```
Successfully ran target typecheck for project sf-<pkg>
Successfully ran target lint for project sf-<pkg>
Successfully ran target test for project sf-<pkg>
Successfully ran target build for project sf-<pkg>
```

Se faltar alguma, **não terminou**. Reportar o que faltou.
