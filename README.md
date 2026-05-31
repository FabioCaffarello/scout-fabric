# scout-fabric

Monorepo-fábrica baseada em Nx 22 que publica pacotes (`@fabio.caffarello/sf-*`)
para uso por **projetos externos independentes**. Não é um app.

- **Contexto, decisões e roadmap:** [`docs/architecture/context.md`](docs/architecture/context.md)
- **Comandos validados e convenções para agentes/contribuidores:** [`CLAUDE.md`](CLAUDE.md)

## Início rápido

```sh
pnpm install      # restaura deps e instala hooks
pnpm lint         # lint (no-op enquanto packages/ está vazio)
pnpm typecheck    # typecheck (idem)
pnpm format:check # checa formatação
pnpm format       # aplica formatação
```

Os pacotes publicáveis vão nascer em `packages/sf-<pkg>/` sob o scope
`@fabio.caffarello/sf-*`. Hoje o diretório está vazio — a fundação está
pronta para receber o primeiro pacote.
