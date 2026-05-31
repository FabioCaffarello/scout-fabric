# CLAUDE.md

Monorepo-fábrica Nx que publica pacotes em npm para projetos externos.
Contexto, decisões e roadmap em
[`docs/architecture/context.md`](docs/architecture/context.md). Não duplicar
conteúdo aqui — este arquivo só descreve o que muda comportamento.

## Comandos que funcionam hoje

| Comando                                           | O que faz                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm install`                                    | Restaura deps e instala/atualiza hooks (`prepare`).                |
| `pnpm lint`                                       | `nx run-many -t lint`. No-op enquanto `packages/` está vazio.      |
| `pnpm typecheck`                                  | `nx run-many -t typecheck`. No-op enquanto `packages/` está vazio. |
| `pnpm format:check`                               | Verifica formatação Prettier do repo.                              |
| `pnpm format`                                     | Aplica Prettier.                                                   |
| `echo "<msg>" \| pnpm commitlint`                 | Linta uma mensagem via stdin.                                      |
| `pnpm exec nx affected -t lint --base=<ref>`      | Lint só nos projetos afetados a partir de `<ref>`.                 |
| `pnpm exec nx affected -t typecheck --base=<ref>` | Typecheck só nos afetados.                                         |
| `pnpm exec nx show projects`                      | Lista projetos reconhecidos pelo Nx.                               |
| `pnpm exec nx graph --file=<path>`                | Exporta o grafo do workspace (`.json` ou `.html`).                 |

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

## Onde pôr coisas novas

Os diretórios abaixo são a convenção pretendida; vão materializar conforme
generators do plugin Nx forem rodados.

- **Pacote publicável novo** → `packages/sf-<pkg>/`.
- **Plugin Nx** → `packages/sf-plugin/`.
- **Catálogo de scout / schemas / kit de scout** → ainda não definido; ver
  roadmap em `context.md`.
- **Documentação de decisão arquitetural** → `docs/architecture/`.

## Norte sem burocracia

Hooks rápidos, CI legível, docs que descrevem o que existe. Se uma checagem
ou documento não economiza tempo no caminho comum, vai fora. Bug pego em
desktop > bug pego em CI > bug pego no projeto-cliente — mas regras lentas
que viram `--no-verify` valem zero.
