# CLAUDE.md

Monorepo-fábrica Nx que publica pacotes em npm para projetos externos.
Contexto, decisões e roadmap em
[`docs/architecture/context.md`](docs/architecture/context.md). Não duplicar
conteúdo aqui — este arquivo só descreve o que muda comportamento.

## Comandos que funcionam hoje

| Comando                                                          | O que faz                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                                   | Restaura deps e instala/atualiza hooks (`prepare`).                                                                          |
| `pnpm lint`                                                      | `nx run-many -t lint` em todos os projetos.                                                                                  |
| `pnpm typecheck`                                                 | `nx run-many -t typecheck` em todos os projetos.                                                                             |
| `pnpm test`                                                      | `nx run-many -t test`. Vitest com `@nx/vite/plugin`.                                                                         |
| `pnpm test:watch`                                                | `nx run-many -t test --watch` — para iteração em um pacote específico, prefira `pnpm exec nx run <pkg>:test --watch`.        |
| `pnpm format:check`                                              | Verifica formatação Prettier do repo.                                                                                        |
| `pnpm format`                                                    | Aplica Prettier.                                                                                                             |
| `echo "<msg>" \| pnpm commitlint`                                | Linta uma mensagem via stdin.                                                                                                |
| `pnpm affected:lint`                                             | Lint só nos projetos afetados desde `main` (mesmo que CI roda em PR).                                                        |
| `pnpm affected:typecheck`                                        | Typecheck nos afetados.                                                                                                      |
| `pnpm affected:test`                                             | Test nos afetados.                                                                                                           |
| `pnpm affected:build`                                            | Build nos afetados.                                                                                                          |
| `pnpm many:lint` / `many:typecheck` / `many:test` / `many:build` | Mesmos targets em **todos** os projetos (o que CI faz em push em main).                                                      |
| `pnpm exec nx affected -t lint --base=<ref>`                     | Para escolher um base ≠ `main`.                                                                                              |
| `pnpm exec nx show projects`                                     | Lista projetos reconhecidos pelo Nx.                                                                                         |
| `pnpm graph`                                                     | Abre o grafo (interativo). Use `--file=<path>` para `.json`/`.html`.                                                         |
| `pnpm exec nx release --dry-run --skip-publish`                  | Preview do bump e changelog. Não toca em git nem npm.                                                                        |
| `./tools/smoke-publish.sh`                                       | Smoke do ciclo publish→install→use contra Verdaccio local. Provas em `docs/release.md`.                                      |
| `./tools/smoke-webapp.sh`                                        | Smoke do ciclo entrada→app: gera webapp real, `next build`, asserta integração RDS. Lento (~1-2 min). Skill `/smoke-webapp`. |
| `./scripts/apply-branch-protection.sh`                           | Diff entre `governance/branch-protection.main.json` e o estado live (dry-run). `--apply` para PUT.                           |

Use `pnpm exec <bin>`, **nunca** `npx` — workspace é pnpm-puro e `.npmrc`
carrega chaves pnpm-only.

## Convenções inegociáveis

- **Conventional commits.** Hook `commit-msg` (commitlint) bloqueia o que
  fugir. Tipos do `@commitlint/config-conventional` — sem custom.
- **Nunca relaxar TS/lint para "passar".** Se uma regra incomoda, corrige
  no código ou se discute a regra. Não silencia caso-a-caso (`// eslint-disable`,
  `// @ts-ignore`) sem justificativa local genuína.
- **Publicáveis** sob `@fabio.caffarello/sf-<pkg>`. Nada com outro scope vai
  para npm.
- **Design system é externo** — `@fabio.caffarello/react-design-system` é
  repo apartado, instalado via npm. Nunca conter, recriar ou "espelhar" aqui.
- **`@scout-fabric/source` ≠ scope de publicação.** É uma condition do
  `tsconfig.base.json#customConditions` para dev-time. Não publica e não
  aparece em `package.json` de pacotes externos. Não confundir com
  `@fabio.caffarello/sf-*`.
- **Hooks rápidos.** Pre-commit ≤ ~5s. `typecheck` e `test` ficam para CI,
  não para pre-commit.
- **CI da fábrica ≠ CI dos projetos-filhos.** Detalhes em [`docs/ci.md`](docs/ci.md).
- **Governança é código.** Mudar a proteção da `main` significa editar
  `governance/branch-protection.main.json` + PR + `--apply`. Detalhes em
  [`docs/governance.md`](docs/governance.md).
- **Release não publica sozinho.** Workflow é `workflow_dispatch` apenas,
  e o bloco de publish real está comentado. `docs/release.md` tem a
  checklist de ativação.

## Onde pôr coisas novas

Os diretórios abaixo são a convenção pretendida; vão materializar conforme
generators do plugin Nx forem rodados.

- **Pacote publicável novo** → `packages/sf-<pkg>/`. **Use o subagent
  `package-creator`** (veja abaixo) — não escreva à mão.
- **Plugin Nx** → `packages/sf-plugin/`.
- **Catálogo de scout / schemas / kit de scout** → ainda não definido; ver
  roadmap em `context.md`.
- **Documentação de decisão arquitetural** → `docs/architecture/`.
- **Convenções de criação de pacote** → `docs/conventions/package.md`
  (fonte canônica; o subagent consulta).

## Subagents

- **`package-creator`** — encapsula o checklist de
  `docs/conventions/package.md` para criar um pacote `sf-*` novo.
  Disparado por pedidos como "criar pacote sf-X" ou "scaffold sf-X".
  Roda o generator, aplica os ajustes obrigatórios, escreve o primeiro
  teste real e valida. **Não publica, não comita, não abre PR.** Definição
  em [`.claude/agents/package-creator.md`](.claude/agents/package-creator.md).

## Skills

Cada skill é fina: descreve quando usar e delega para o script. Lógica
vive no script — quando mudar o procedimento, muda só o script.

| Skill            | Trigger                                                             | Invoca                                                                                               |
| ---------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/validate`      | "validar", "rodar os checks", "verify local", "antes do PR"         | `pnpm exec nx affected -t lint typecheck test build` (ou `nx run-many` com `--all`)                  |
| `/smoke-publish` | "smoke test", "provar publish", "validar install"                   | `./tools/smoke-publish.sh`                                                                           |
| `/smoke-webapp`  | "smoke do webapp", "provar generator de webapp", "antes de release" | `./tools/smoke-webapp.sh` — gera webapp real, `next build`, asserta integração RDS. Lento (~1-2 min) |
| `/governance`    | "reaplicar governança", "branch protection", "drift check"          | `./scripts/apply-branch-protection.sh` — dry-run default; `--apply` exige diff prévio + confirmação  |

Definições em `.claude/skills/<name>/SKILL.md`.

## Norte sem burocracia

Hooks rápidos, CI legível, docs que descrevem o que existe. Se uma checagem
ou documento não economiza tempo no caminho comum, vai fora. Bug pego em
desktop > bug pego em CI > bug pego no projeto-cliente — mas regras lentas
que viram `--no-verify` valem zero.
