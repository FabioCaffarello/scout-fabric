# scout-fabric — contexto

Mapa do projeto. Curto por design.

## O que é

Fábrica de projetos baseada em Nx que gera repos independentes de alta
qualidade. A fábrica **publica pacotes** no npm; os projetos gerados
nascem **fora** dela.

## Decisões tomadas

- **Topologia B** — monorepo-fábrica publica em npm; projetos gerados são
  **repos externos**, com release próprio (cada time controla quando
  consumir um bump).
- **Modo TS Solution (package-based)** do Nx 22 — nativo do preset `ts`,
  sem migração. `composite` + project references + `customConditions`.
- **Inteligência num plugin Nx próprio** (`@fabio.caffarello/sf-plugin`) —
  generators, executors e migrations. A CLI da fábrica é Nx.
- **Design system externo** — `@fabio.caffarello/react-design-system` vive
  em repo apartado, consumido via npm. Nunca contido aqui.
- **Duas naturezas de herança:**
  1. **Por versão de pacote** — bump em `sf-*` publicado alcança projetos
     externos no próximo `pnpm update`.
  2. **Por transformação de código** — `nx migrate` aqui dentro; para
     externos virá `forge update` (roadmap).
- **Fluxo em três fases, com checkpoints:** `init → scout → materialize`.
- **Scout determinístico** — escolhe de catálogo fixo. Specs em Markdown
  com frontmatter YAML (prosa para humano + bloco para generators).
- **Naming** — publicáveis sob `@fabio.caffarello/sf-<pkg>`; condition
  interna `@scout-fabric/source` (dev-time, nunca publicada).
- **Stack** — pnpm 10, Husky v9 + lint-staged, conventional commits.

## Estado atual

**Foundation (camada 0):**

- Workspace Nx 22.7.5, TS 5.9, modo TS Solution.
- `tsconfig.base.json` estrito (inclui `noUncheckedIndexedAccess`).
- ESLint 9 flat + `@nx/eslint-plugin` (com `enforce-module-boundaries`
  como placeholder) + `typescript-eslint`. Prettier explícito
  (`printWidth=100`, `trailingComma=all`, `semi`, `lf`). ESLint e Prettier
  separados via `eslint-config-prettier`.
- Husky v9 ativo: `pre-commit` roda `lint-staged`; `commit-msg` roda
  `commitlint` (conventional).
- Node pin — `.nvmrc=24`, `engines.node: ">=22.0.0"`.
- `nx.json` com `namedInputs.production` excluindo testes/configs de
  runner, `sharedGlobals` modelando os arquivos cross-workspace,
  `targetDefaults.test` semeado.

**Pacotes (camada 0.9):** `packages/sf-tsconfig` — base TS reusável
(`base.json` + `lib.json`). Único pacote real até agora.
Convenção para criar um novo `sf-*` (generator + ajustes obrigatórios)
em [`../conventions/package.md`](../conventions/package.md).

**CI (camada 1):** `.github/workflows/ci.yml` — 3 jobs (`format`,
`commit-msg`, `verify`) com `nx-set-shas`. PR roda `affected`; push em
`main` roda `run-many`. Branch protection na `main` exige os 3 checks.
Detalhes em [`ci.md`](../ci.md).

**Testes (camada C):** Vitest 4 via `@nx/vite/plugin`. `sf-tsconfig`
tem `test` target real (7 testes assertando shape de `base.json`/`lib.json`).
Coverage `v8`, reporters `text+html`, sem thresholds.

**Release (camada A):** ✅ provado / ⏳ pendente:

- ✅ `nx.json#release` configurado (independente + conventional commits +
  per-project changelog).
- ✅ `tools/smoke-publish.sh` prova `publish → install → use` contra
  Verdaccio local, com asserção comportamental (`noUncheckedIndexedAccess`
  falha como esperado no consumidor).
- ✅ `.github/workflows/release.yml` (manual) com job `dry-run` (sempre)
  e `smoke` (opt-in via input).
- ⏳ Publish real no npmjs: falta criar secret `NPM_TOKEN` (automation,
  scoped to `@fabio.caffarello/*`) e descomentar bloco em `release.yml`.
  Checklist em [`release.md`](../release.md).

**Governança (camada B):** ✅ provado / ⏳ pendente:

- ✅ `governance/branch-protection.main.json` versionado + script
  idempotente `scripts/apply-branch-protection.sh`. Detalhes em
  [`governance.md`](../governance.md).
- ✅ `.github/workflows/governance-drift.yml` — `workflow_dispatch` +
  cron semanal — detecta drift entre spec e estado live, **nunca aplica**.
- ⏳ Secret `GOVERNANCE_ADMIN_TOKEN` (PAT com `Repository administration: Read`).
  Sem ele, o drift check falha por permissão. Quando configurado, vira
  verde semanal.

## Roadmap

**Pendências operacionais** (não-software):

- `NPM_TOKEN` (automation, scope `@fabio.caffarello/*`) → ativa publish real.
- `GOVERNANCE_ADMIN_TOKEN` (PAT, `Repository administration: Read`) →
  ativa drift check verde.

**Próximos pacotes** (camada de produto):

- `@fabio.caffarello/sf-eslint-config` — extrai `eslint.config.mjs` raiz
  como pacote consumível por projetos externos.
- `@fabio.caffarello/sf-plugin` — Nx plugin (generators + executors +
  migrations). A "CLI da fábrica".

**Mais à frente:**

- Catálogo de scout (estrutura, schemas, conteúdo).
- Kit de scout — subagents Claude, slash-commands.
- `forge update` — propagação de transformações a repos externos.

## Diagramas

### Três fases

```mermaid
flowchart LR
  A[init] -->|checkpoint| B[scout]
  B -->|checkpoint| C[materialize]
  C --> D[(repo externo)]
```

### Duas naturezas de herança

```mermaid
flowchart LR
  F[scout-fabric] -->|publish| P["pacotes @fabio.caffarello/sf-*"]
  P -->|pnpm update| R[(repo externo)]
  F -.->|"forge update (roadmap)"| R
```
