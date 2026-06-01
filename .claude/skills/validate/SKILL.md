---
name: validate
description: Roda a bateria de validação local (lint, typecheck, test, build) sobre os projetos afetados desde `main` por default, ou sobre todos com `--all`. Use sempre que o usuário pedir "validar", "rodar os checks", "verify local", "ver se está verde", "antes do PR", ou equivalente. Reproduz exatamente o que o job `verify` do CI executa em PR (ou em push para main com `--all`). Para na primeira falha.
---

# validate

Reproduz local a bateria que o CI roda. **Lógica zero aqui** — só invoca
os comandos Nx que já existem.

## Como invocar

**Default — afetados desde `main`** (o que o CI faz em PR):

```sh
pnpm exec nx affected -t lint typecheck test build
```

**Com `--all`** — todos os projetos (o que o CI faz em push para `main`):

```sh
pnpm exec nx run-many -t lint typecheck test build
```

## Disciplina

- **Para na primeira falha.** Reporte a mensagem literal do Nx.
- **Não silencie** com `eslint-disable`, `@ts-ignore` ou flags de skip-cache
  só para "passar".
- Se nenhum target rodou (`No tasks were run`), isso **é** sucesso —
  significa que nada foi afetado, não que falhou.

## Quando NÃO usar

- Para rodar um único target → use diretamente `pnpm affected:lint`,
  `pnpm many:typecheck`, etc.
- Para validar publish → use a skill `smoke-publish`.
- Para checar drift de governança → use a skill `governance`.
