---
name: governance
description: Compara o estado live da branch protection da `main` no GitHub com `governance/branch-protection.main.json` (spec versionado), e opcionalmente reaplica. Use quando o usuário pedir "reaplicar governança", "checar branch protection", "ver se há drift", "aplicar governance", "sincronizar proteção da main", ou equivalente. Por default só roda em dry-run. Idempotente — o `PUT` da API GitHub aceita o mesmo payload N vezes com o mesmo resultado.
---

# governance

Envelopa `scripts/apply-branch-protection.sh`. **Lógica zero aqui** — a
normalização de JSON, o diff e o `PUT` vivem no script.

## Modos

- **Dry-run (default).** Mostra o diff entre o estado live da `main` e o
  spec. **Não muda nada.**
- **Apply (`--apply`).** Faz `PUT` na API GitHub com o JSON do spec,
  sobrescrevendo o estado live. Idempotente — mesmo spec, mesmo
  resultado final, sempre.

## Como invocar

Dry-run:

```sh
./scripts/apply-branch-protection.sh
```

Apply (somente após confirmação explícita do usuário):

```sh
./scripts/apply-branch-protection.sh --apply
```

## Protocolo de aplicação

Se o usuário pediu `--apply` no input:

1. **Sempre** rode primeiro o dry-run e mostre o diff.
2. Se o diff for vazio (`(no diff — already in sync)`), reporte e **não
   chame com `--apply`** — não há nada a aplicar.
3. Se houver diff, mostre-o **literalmente** e pergunte
   "Confirma `--apply`?" — aguarde sim explícito antes de chamar.
4. Após `--apply`, reporte a saída resumida do script.

## Quando NÃO usar

- Para criar/alterar proteção em branches que não sejam `main` —
  fora de escopo (o spec atual é só `main`).
- Para mudar repository settings (visibilidade, default branch,
  permissions, etc.) — fora de escopo.
- Para rodar o drift check em CI — esse é outro caminho
  (`.github/workflows/governance-drift.yml`, automatizado).

## Referência

`docs/governance.md`.
