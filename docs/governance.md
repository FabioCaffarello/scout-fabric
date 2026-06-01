# Governança

A proteção da branch `main` é versionada como código. O estado vive no repo;
não é mais um efeito invisível da memória de quem configurou.

## Estado declarado

[`governance/branch-protection.main.json`](../governance/branch-protection.main.json) —
fonte da verdade da proteção da `main`. Schema do GitHub branch protection.

## Aplicar / verificar

```sh
# Dry-run: mostra o diff entre o estado live no GitHub e o spec. Não muda nada.
./scripts/apply-branch-protection.sh

# Aplicar de verdade. PUT na API com o spec; sobrescreve o estado live.
./scripts/apply-branch-protection.sh --apply
```

Idempotente — o `PUT` é idempotente por natureza, e o script compara antes,
então rodar duas vezes com o mesmo spec não tem efeito visível.

## Decisões registradas

- **3 required status checks** — `format`, `commit-msg`, `verify`. Como
  `commit-msg` só roda em `pull_request`, o efeito combinado é forçar fluxo
  PR: push direto em `main` é bloqueado porque o check nunca passou para
  aquele commit.
- **`strict: true`** — branch precisa estar up-to-date com `origin/main`
  antes do merge. Casa com `gh pr merge --rebase` que usamos.
- **`enforce_admins: false`** — admin pode bypassar. Trade-off para a fase
  atual (repo solo + setup em movimento). **Gatilhos para virar `true`:**
  - Entrada do segundo contribuidor regular (admin deixa de ser o único
    humano sob as regras).
  - Ativação do publish real no npmjs (bypass passa a ter consequência
    externa — uma versão publicada).
- **`required_pull_request_reviews: null`** — sem revisão obrigatória.
  Repo solo. Quando o time crescer, virar `{ "required_approving_review_count": 1 }`.
- **`allow_force_pushes: false`** e **`allow_deletions: false`** — sem
  reescrita de história em `main`.

## Como alterar a governança

1. Editar `governance/branch-protection.main.json`.
2. `./scripts/apply-branch-protection.sh` (dry-run, ver diff).
3. Se o diff bate com a intenção, `./scripts/apply-branch-protection.sh --apply`.
4. Commit do JSON via PR convencional, exatamente como qualquer outra
   mudança — incluindo o commit-msg conventional, porque a própria
   proteção exige isso.

## O que isto NÃO cobre

- `required_signatures` (endpoint separado na API; não plugado).
- Branch protection de outras branches (só `main`).
- Repository settings (privacidade, default branch, etc.) — fora de escopo
  por ora.
- GitHub Actions permissions e secrets — pode entrar num arquivo irmão
  `governance/repo-settings.json` quando precisar.
