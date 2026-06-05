# Relatório de drift — scout-fabric @ 4e3ca13

**Origem:** primeira frente da auditoria read-only (Frente 1 parte 1). Mapeia DRIFT entre o que a documentação crava como "fato observado" e o que o código/realidade de fato dizem. **Não corrige nada; reporta.**

**Estado do repo no momento da auditoria:** `4e3ca13` (merge da PR #19), branch `main`, working tree limpa.
**Regeneração:** este arquivo foi reescrito a partir da transcrição da sessão de auditoria. Cada citação foi re-ancorada contra o disco atual (HEAD ainda em `4e3ca13`). Uma divergência foi encontrada e está marcada inline como **[DIVERGIU]**.

---

## 1) Contagens e números

### 1a) "33 asserções comportamentais" (`generator.md` §7.a) vs realidade

- **Veredito: DRIFT**
- **Evidência:** `docs/conventions/generator.md:508` — "Modelo do `marker` e do harness do `webapp` (33 asserções comportamentais contra `__fixtures__/cna-16.2.7/`)". **[DIVERGIU: citação original era `:509`; disco atual mostra `:508` — off-by-one no relatório original, corrigida nesta regeneração]**.
- A "Peça 3" no spec (linhas 245–472 de `packages/sf-plugin/src/generators/webapp/webapp.spec.ts`, delimitada pelo `describe('sf-plugin:webapp — harness against captured CNA fixture (Peça 3)')` em `:245`) tem **22 `it()` blocks + 1 `it.each` parametrizado em 5 arquivos** = **27 test cases**, ou ~41 chamadas a `expect()`. Nenhum desses números é 33.
- **Risco para a scout:** quem ler "33 asserções" como contrato de cobertura mínima vai planejar com baseline errada. Pior: se a doc justifica decisão de cadência ("33 asserções rodam em <1s, ok para pre-commit"), revisores aceitam regressões silenciosas sem perceber que o número de proteções caiu.

### 1b) "43 asserções" (sumário do merge) vs realidade

- **Veredito: MATCH** (coerente quando `it.each` é expandido)
- **Evidência:** Mensagem do commit `21e7bd8`: "46 testes (43 webapp + 3 marker), 0 regressão". Contagem real do `webapp.spec.ts`:
  - Peça 1 (schema validation, `:60-111`): 7 `it()`
  - Peça 4 (CNA delegation, `:113-243`): 9 `it()`
  - Peça 3 (harness fixture, `:245-472`): 22 `it()` + 1 `it.each` × 5 = 27 cases
  - Total expandido: **43 test cases** ✓
- O número casa quando `it.each` é expandido como o Vitest expande.

### 1c) marker.spec.ts

- **Veredito: MATCH** — `packages/sf-plugin/src/generators/marker/marker.spec.ts` tem **3 `it()` blocks** (linhas 13, 22, 31). Casa com "3 marker" do mesmo commit.

### 1d) "11 flags" (`webapp-generator.md` §3, `webapp.ts:29`) vs `CNA_FLAGS` real

- **Veredito: MATCH com nuance explicitamente documentada**
- **Evidência:** `CNA_FLAGS` em `packages/sf-plugin/src/generators/webapp/webapp.ts:39-52` tem **12 entradas** no array (porque `--import-alias` + `@/*` ocupam duas posições). O comentário em `webapp.ts:29-32` explicita: "incluindo o par `--import-alias '@/*'` (flag + valor) que ocupa duas posições no array". A tabela em `docs/design/webapp-generator.md:78-89` lista 11 linhas semânticas. O spec em `webapp.spec.ts:167` tem teste dedicado provando que `--import-alias` é seguido por `@/*` em posição consecutiva. Nuance tratada nos três pontos.

### 1e) "6 casos do catálogo caminho-rápido-esconde"

- **Veredito: MATCH (interno coerente, com fricção sutil)**
- **Evidência:** `generator.md:576-578` _[cite alinhado ao quote, que percorre :576-578]_ diz "5º e 6º casos do padrão 'caminho rápido esconde' (antes: TS6307, `@ts-expect-error` no vitest, dotfiles no `pnpm pack`, `.gitignore` aninhado + Prettier)" — listando 4 prévios + 2 novos = **6 totais**. Localização real dos 6:
  1. TS6307 cold typecheck → `docs/conventions/package.md:89` _[critério: linha-âncora da palavra-chave; a subseção §3.a inteira é :87-104]_
  2. vitest mascara erros de tipo / `@ts-expect-error` → `generator.md:144-174` (§3.a + §3.b)
  3. `pnpm pack --dry-run` é falso-verde para dotfiles → `generator.md:310-326` (§5.d)
  4. `.gitignore` aninhado + Prettier (caso composto) → `generator.md:287-303` (§5.c #4 + #5)
  5. parent dir mkdir antes do CNA → `generator.md:562-566` (§7.c #1)
  6. `"use client"` em `page.tsx` → `generator.md:568-574` (§7.c #2)
- **Fricção interna**: `generator.md:332` diz "Este é o **terceiro** caso", mas `§7.c` posteriormente conta como 4º o que `§5.d` numera como 3º. Numeração interna inconsistente, mas total de 6 é estável e casa com o sumário do merge.

## 2) Contrato código ↔ doc

### 2a) Contrato em cinco itens (`generator.md` §6.a, linhas 356-387) — webapp.ts

- **Veredito: MATCH (todos os 5)**

| Item do contrato                         | Local em `webapp.ts`                                                                                       | Status |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| 1. Versão pinada const pública exportada | `webapp.ts:26` `export const CNA_VERSION = '16.2.7' as const`                                              | ✓      |
| 2. Argv tuple readonly pública exportada | `webapp.ts:39-52` `export const CNA_FLAGS = [...] as const`                                                | ✓      |
| 3. Interface `Deps`                      | `webapp.ts:64-72` `export interface WebappDeps { runCreateNextApp(...) }`                                  | ✓      |
| 4. Default exportado para produção       | `webapp.ts:85` `export const defaultRunCreateNextApp`                                                      | ✓      |
| 5. Parâmetro `deps` opcional com default | `webapp.ts:179-183` `webappGenerator(tree, options, deps = { runCreateNextApp: defaultRunCreateNextApp })` | ✓      |

### 2b) `validateOptions` espelha `schema.json` (§2.c em `generator.md:73-132`)

- **Veredito: MATCH**
- `schema.json:11` pattern `"^[a-z][a-z0-9-]*$"` ≡ `webapp.ts:12` `NAME_PATTERN = /^[a-z][a-z0-9-]*$/`
- `schema.json:24` `required: ["name", "directory"]` ≡ `webapp.ts:138,141` checa ambos. `additionalProperties: false` está em `schema.json:25`, sem espelhamento imperativo (regra do CLI; o `webapp.ts` aceita campos extras silenciosamente — pequeno gap não-coberto, mas consistente com §2.c que só exige espelho de `required` + `pattern`).

### 2c) `applyFixture` inlinado no spec; helper não vaza no tarball (§5.c #1 e §5.d)

- **Veredito: MATCH**
- `find packages/sf-plugin/src -name "*.ts"` confirma ausência de `__internal__/apply-fixture.ts`. A função existe inline em `webapp.spec.ts:26-46`.
- `find packages/sf-plugin/dist -type f` lista **21 arquivos**, todos canônicos (apenas `dist/generators/{marker,webapp}/...` + `dist/index.*`). Sem `apply-fixture.*`, sem `.spec.*`, sem `__fixtures__/`.
- `pnpm pack --dry-run`: 23 entradas canônicas (dist + README + package.json + generators.json). Tarball limpo.

## 3) Estado vs context.md

| Afirmação em `context.md`                                                   | Veredito                                   | Evidência                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camada 0 — workspace Nx 22, TS 5.9, ESLint flat, Husky v9, .nvmrc=24        | MATCH (estrutural)                         | arquivos existem                                                                                                                                                                                                                                                                                                                                                                         |
| Camadas 0.9 + 3 — **"dois pacotes vivos"** (sf-tsconfig + sf-eslint-config) | **DRIFT**                                  | `packages/` tem **três**: `sf-tsconfig`, `sf-eslint-config`, **`sf-plugin`**                                                                                                                                                                                                                                                                                                             |
| Pacote sf-plugin "**Próximos pacotes** (camada de produto)" (linha 126-130) | **DRIFT crítico**                          | `sf-plugin` JÁ existe com 2 generators (`marker`, `webapp`) e 1 fixture CNA-16.2.7, foi mergeado em PRs #17, #18, #19. context.md descreve estado pré-camada-2.5                                                                                                                                                                                                                         |
| CI camada 1 — "3 jobs (format, commit-msg, verify)"                         | MATCH                                      | `.github/workflows/ci.yml:21,36,57` exatamente esses 3 jobs _(critério: linhas-chave do job. O relatório original citava as linhas `name:` adjacentes — `:22,37,57` — mas misturava critérios entre os três; nesta regeneração padronizei para a linha-chave do job. Um leitor que abrir `ci.yml:21` esperando ver `name:` precisa saber que a linha mostrada é `format:`, não o nome.)_ |
| `.github/workflows/release.yml` (manual) com job dry-run + smoke opt-in     | MATCH                                      | arquivo existe                                                                                                                                                                                                                                                                                                                                                                           |
| `.github/workflows/governance-drift.yml` com `workflow_dispatch` + cron     | MATCH                                      | arquivo existe                                                                                                                                                                                                                                                                                                                                                                           |
| `governance/branch-protection.main.json` versionado                         | MATCH                                      | arquivo existe                                                                                                                                                                                                                                                                                                                                                                           |
| `tools/smoke-publish.sh`                                                    | MATCH                                      | existe                                                                                                                                                                                                                                                                                                                                                                                   |
| Roadmap "Catálogo de scout", "Kit de scout", "forge update"                 | MATCH (forward-looking, nada implementado) | nenhum diretório `catalog/` ou `scout-kit/` em `packages/`                                                                                                                                                                                                                                                                                                                               |

**Risco do drift de roadmap (3.c):** quem entrar para projetar a camada de scout vai partir de premissa errada — vai planejar "criar o sf-plugin" em vez de "estender o sf-plugin existente para suportar `webapp` no catálogo". A doc-âncora subestima quanto já foi pago. Pior: o trecho diz "será o primeiro a usar o ferramental `.claude/`", mas o `sf-plugin` real **não foi criado pelo subagent `package-creator`** (ele tem ajuste pós-generator diferente do checklist — ver `package.md` §8.a vs sf-plugin como plugin, não JSON-puro), portanto a premissa "ferramental provado pelo sf-plugin" é falsa para esta camada.

**Drift menor não listado pelo escopo:** `docs/design/webapp-generator.md:8` ainda anuncia "Pronto para virar prompt de implementação", mas a implementação está em main (PRs #18, #19). Status do doc não foi atualizado para "implementado".

## 4) Referências cruzadas

### 4a) Links relativos quebrados

- **`docs/conventions/generator.md:35`** → `[package.md](./package.md) seção 8.b` — **DRIFT**: `package.md` só tem `### 8.a)` em `:338`, não há `### 8.b)`.
- **`docs/conventions/generator.md:608`** → `[package.md](./package.md) seção 8.b (variante "pacote com build via @nx/js:tsc + assets")` — **DRIFT**: mesma referência ausente. A variante "pacote com build + assets" descreveria justamente o `sf-plugin` (que é a forma diferente do JSON-puro), mas a seção nunca foi escrita.
- Demais links em `docs/` (entre `context.md`, `package.md`, `ci.md`, `governance.md`, `release.md`, `architecture/`, `design/`, `governance/`, `.github/workflows/`) resolvem para arquivos existentes — **MATCH**.

**Risco do 4a:** quem usar `generator.md` como prompt para criar o **segundo** plugin/generator-host vai clicar no link, não achar a seção, e ou improvisar (resultado divergente do plano original) ou parar para perguntar. O caminho documentado para "como o sf-plugin foi montado" está prometido e não entregue — a forma do plugin não é derivável só de `§8.a` (JSON-puro), porque sf-plugin emite JS + assets EJS.

### 4b) Referências de seção §10.2, §6.a, §6.c, etc.

- `generator.md:377,611` → `webapp-generator.md §10.2` — **MATCH** (`webapp-generator.md:593`).
- `generator.md:473` → `§2.c` desta convenção — **MATCH** (§2.c em `generator.md:73`).
- `generator.md:131,511` → `§3.c` — **MATCH** (§3.c em `generator.md:209`).
- `generator.md:367,517` → `§6.c` — **MATCH** (§6.c em `generator.md:404`).
- `webapp-generator.md:50` → `§10.1` — **MATCH** (`webapp-generator.md:560`).
- `webapp-generator.md` referências a `§5, §6, §7, §9.1-§9.6` — todas **MATCH**.

## Tabela-resumo

| Frente                    | nº de DRIFTs         | O mais grave                                                                                                                                          |
| ------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Contagens e números    | **1**                | `33 asserções` em `generator.md` §7.a (Peça 3 real = 27 cases). Risco: baseline de cobertura mentida na fonte canônica                                |
| 2. Contrato código ↔ doc | **0**                | — (todos os 5 itens do §6.a presentes; pattern espelhado; helper não vaza)                                                                            |
| 3. Estado vs context.md   | **2** (relacionados) | `sf-plugin` listado como "**Próximo pacote**" em `context.md:126-130` quando já tem 2 generators em main. `context.md` está atrás do estado em ~3 PRs |
| 4. Referências cruzadas   | **2** (mesma origem) | Links para `package.md §8.b` em `generator.md:35` e `:608` — seção nunca foi escrita; é justamente a variante que descreveria o **próprio sf-plugin** |

**Total: 5 DRIFTs distintos.** O mais grave em absoluto: o **par "context.md fala de sf-plugin como próximo passo" + "generator.md aponta para `package.md §8.b` que documentaria a forma do sf-plugin, mas a seção não existe"** — juntos significam que a fonte canônica não registrou o nascimento de uma forma nova de pacote da fábrica. Quem projetar a próxima camada (scout) parte daí sem ancoragem.

---

**Nota da regeneração:** este relatório foi reescrito a partir da transcrição da sessão original. A única divergência encontrada na re-ancoragem foi a citação de `generator.md:509` no relatório original, que está marcada inline como `:508` (off-by-one). Todas as demais ~30 citações casaram com o disco no estado `4e3ca13`.
