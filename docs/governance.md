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

## Detecção de drift

O workflow [`.github/workflows/governance-drift.yml`](../.github/workflows/governance-drift.yml)
roda o script em dry-run em dois momentos:

- **Sob demanda**: `gh workflow run governance-drift.yml`.
- **Semanal**: segunda 13:00 UTC. Pega drifts criados fora-de-banda
  (alguém editou via UI do GitHub sem commitar o JSON).

Se houver diff entre o estado live e o `branch-protection.main.json`, o
job falha. O workflow **nunca aplica** — drift exige decisão humana:

1. Identificar quem/quando mudou (UI do GitHub mostra histórico de
   proteção em Settings → Branches).
2. Decidir: a mudança foi legítima? Então `governance/...json` precisa
   refletir isso — abra PR atualizando o spec.
3. Foi indevida? Reverter rodando `./scripts/apply-branch-protection.sh --apply`.

### Pré-requisito: secret `GOVERNANCE_ADMIN_TOKEN`

`GET /repos/.../branches/main/protection` exige permissão
`administration: read`, que **não é grantable pelo `permissions:` do
workflow** (é permissão do app, não do token). O `GITHUB_TOKEN`
automático então não funciona para este check.

O workflow usa `secrets.GOVERNANCE_ADMIN_TOKEN || secrets.GITHUB_TOKEN`
— prefere o PAT se ele existir, e cai no token automático apenas para
que a falha seja barulhenta enquanto o PAT não estiver configurado.

Para destravar o check:

1. Criar PAT fine-grained com `Repository administration: Read` (ou
   classic com `repo`), válido apenas para este repo.
2. Salvar como secret `GOVERNANCE_ADMIN_TOKEN` em
   Settings → Secrets and variables → Actions.
3. Re-rodar via `gh workflow run governance-drift.yml`.

## O que isto NÃO cobre

- `required_signatures` (endpoint separado na API; não plugado).
- Branch protection de outras branches (só `main`).
- Repository settings (privacidade, default branch, etc.) — fora de escopo
  por ora.
- GitHub Actions permissions e secrets — pode entrar num arquivo irmão
  `governance/repo-settings.json` quando precisar.
