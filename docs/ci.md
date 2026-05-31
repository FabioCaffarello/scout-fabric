# CI

Mapa do CI da fábrica. Curto por design.

## O que o CI da fábrica faz

Único workflow: `.github/workflows/ci.yml`. Disparado em:

- `pull_request` para `main` — **affected** (`lint`, `typecheck`, `test`, `build`)
- `push` em `main` — **run-many** (mesmos targets, em todo projeto)

Três jobs por run, em paralelo:

| Job          | Quando            | Comando                                                                      |
| ------------ | ----------------- | ---------------------------------------------------------------------------- |
| `format`     | PR + push em main | `pnpm format:check`                                                          |
| `commit-msg` | PR only           | `pnpm exec commitlint --from <base.sha> --to <head.sha> --verbose`           |
| `verify`     | PR / push         | `pnpm exec nx affected -t ...` (PR) ou `pnpm exec nx run-many -t ...` (push) |

`verify` usa `nrwl/nx-set-shas@v4` para resolver `NX_BASE`/`NX_HEAD`. Em PR, base
é o merge-base com `origin/main`; em push em main, base é o SHA do último run
com sucesso.

Setup compartilhado: `checkout` com `fetch-depth: 0` (necessário para o cálculo
de affected), `pnpm/action-setup@v4` (lê `packageManager: pnpm@10.33.2`),
`setup-node@v4` com `node-version-file: .nvmrc` (24) e `cache: pnpm`. `HUSKY=0`
silencia o `prepare` em CI. Permissions: `contents:read` + `actions:read`
(esta última necessária ao `nx-set-shas` em push events).

Sem matriz de Node, sem matriz de OS, sem Nx Cloud. A entrada para isso é a
demanda concreta — não está nem perto.

## Onde está a fronteira

Este CI valida a **fábrica**, não os projetos gerados.

- O CI da fábrica testa pacotes `@fabio.caffarello/sf-*` (configs, plugin,
  generators) com o universo da própria fábrica.
- Cada projeto gerado tem **seu próprio CI**, fora deste repositório, com
  release independente. Esses projetos consomem os pacotes publicados via
  `pnpm update`.
- A fábrica **não** simula o CI dos projetos-filhos. Validar a integração de
  ponta a ponta com um projeto real é responsabilidade de smoke tests
  separados (roadmap).

## Como reproduzir localmente

Os mesmos comandos do CI funcionam local:

```sh
pnpm format:check
echo "<msg>" | pnpm commitlint
pnpm affected:lint           # ou affected:typecheck, affected:test, affected:build
pnpm many:lint               # ou many:typecheck, ...
```

`pnpm affected:*` usa `defaultBase: main` por trás dos panos. Para mirar uma
base específica:

```sh
pnpm exec nx affected -t lint --base=HEAD~3
```

Para validar um workflow antes de subir: `actionlint .github/workflows/ci.yml`.
