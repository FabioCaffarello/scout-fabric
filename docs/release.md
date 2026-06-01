# Release

Como o release é feito hoje e o que falta para o primeiro publish real. Curto
por design.

## Estado

- `nx.json#release` configurado (independent + conventional commits + per-project
  changelog). Detalhes em [`architecture/context.md`](architecture/context.md).
- `.github/workflows/release.yml` — manual (`workflow_dispatch`):
  - Sempre roda `nx release --dry-run --skip-publish`: mostra o bump e o
    changelog que seriam aplicados.
  - Opcional (input `run_smoke=true`): roda `tools/smoke-publish.sh` em CI —
    sobe Verdaccio, publica, instala em consumidor descartável.
- **Publish real desabilitado** — bloco comentado no workflow. Nada chega ao
  npmjs até a checklist abaixo ser concluída.

## Rodar dry-run

Pela UI: Actions → release → "Run workflow".

Pela CLI:

```sh
gh workflow run release.yml -f run_smoke=true
```

## Reproduzir localmente

```sh
pnpm exec nx release --dry-run --skip-publish
./tools/smoke-publish.sh
```

## Checklist para ativar publish real

Antes de descomentar o bloco de publish no workflow:

- [ ] **npm automation token** com escopo mínimo (`@fabio.caffarello/*`,
      `read-and-publish`). Não usar token user-level (escopo amplo demais).
- [ ] **2FA habilitado** no owner do scope. Automation tokens bypassam 2FA no
      publish; a conta ainda precisa de 2FA contra takeover.
- [ ] Salvar token como secret `NPM_TOKEN` no repo
      (Settings → Secrets and variables → Actions).
- [ ] Editar `release.yml`: remover `--dry-run` no step de release **ou**
      substituir pelo bloco comentado.
- [ ] Adicionar `permissions: id-token: write` ao job para habilitar
      [npm provenance](https://docs.npmjs.com/generating-provenance-statements)
      (`NPM_CONFIG_PROVENANCE: 'true'`).
- [ ] Confirmar com `gh workflow run release.yml` que o publish chega ao
      npmjs e o tarball é o esperado (1.4 KB, 10 files para `sf-tsconfig`).

## Rollback

`npm unpublish` tem janela curta (24–72h) e impacta consumidores que já
instalaram. Em caso de bug numa versão publicada:

1. Publicar patch corrigindo (`fix:` → PATCH bump pelo conventional flow).
2. Marcar a versão problemática com:
   ```sh
   npm deprecate '@fabio.caffarello/<pkg>@<version>' '<motivo curto>'
   ```
3. `npm unpublish` apenas em emergência absoluta (vazamento de credencial,
   conteúdo sensível) e dentro da janela.

## Onde cada coisa vive

| Item                        | Caminho                                     |
| --------------------------- | ------------------------------------------- |
| Config de release           | `nx.json#release`                           |
| Smoke test                  | `tools/smoke-publish.sh`                    |
| Workflow                    | `.github/workflows/release.yml`             |
| Tag pattern                 | `{projectName}@{version}`                   |
| Changelog                   | `packages/<pkg>/CHANGELOG.md` (per-project) |
| Verdaccio config (local)    | `.verdaccio/config.yml`                     |
| Verdaccio storage (efêmero) | `tmp/local-registry/storage`                |
