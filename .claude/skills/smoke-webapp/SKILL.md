---
name: smoke-webapp
description: Roda o smoke real do `sf-plugin:webapp` — prova end-to-end o ciclo entrada → app que builda. Use sempre que o usuário pedir "smoke do webapp", "provar que o generator gera app que builda", "rodar smoke-webapp", "validar webapp generator", "antes de release do sf-plugin", ou equivalente. Lento (~1-2 min: CNA + install + next build). O script orquestra Verdaccio local, publish da fábrica, `nx g sf-plugin:webapp` real, install, `next build`, `eslint`, e asserções comportamentais de integração RDS — com cleanup via trap.
---

# smoke-webapp

Envelopa `tools/smoke-webapp.sh`. **Lógica zero aqui** — quando o smoke
mudar (ex.: novo generator, nova ferramenta delegada), muda só o
script.

## O que o script faz (resumo, não a fonte da verdade)

1. Build da fábrica (`sf-tsconfig`, `sf-eslint-config`, `sf-plugin`).
2. Sobe Verdaccio na 4873.
3. Publica os três pacotes da fábrica no Verdaccio
   (`@fabio.caffarello/sf-eslint-config` é dep transitiva do webapp).
4. Cria host isolado em `mktemp -d` com `.npmrc` local → Verdaccio.
   Asserta isolamento por `npm config get`, não por path.
5. Instala `nx` + `@fabio.caffarello/sf-plugin` no host.
6. Roda `nx g @fabio.caffarello/sf-plugin:webapp ...` — exercita
   `defaultRunCreateNextApp` (única função do generator que não é
   Tree-testável).
7. Confirma `create-next-app@16.2.7` pinning exato lendo a versão de
   `next` e `eslint-config-next` no `package.json` gerado.
8. `pnpm install` no webapp gerado (resolve RDS + peers + sf-eslint-config).
9. `pnpm exec next build` — deve passar.
10. `pnpm exec eslint .` — deve passar (config composta Next + sf).
11. **Asserção comportamental**: classes semânticas do RDS
    (`bg-surface-canvas`, `text-fg-primary`) aparecem no
    `.next/server/app/index.html` — prova de integração em runtime.
12. **Controles**: `Geist_Mono` e `vercel.com/templates` **ausentes** —
    prova que o harness sobrescreveu, não só adicionou.
13. Cleanup via trap (Verdaccio, tmp dir, registry storage).

Detalhes vivem em `docs/conventions/generator.md` §7 e no próprio
script.

## Como invocar

```sh
./tools/smoke-webapp.sh
```

## Critério de aceite

Saída termina com `==> ALL CHECKS PASSED`. Qualquer outra coisa é
falha — reportar a linha exata do log que quebrou. Se `next build`
falha, é o generator que está errado (template, integração RDS,
deps); conserte o generator, não o smoke. **O smoke é o juiz.**

## Cadência (não rodar em todo PR)

- **Local antes de release** do `sf-plugin`: sempre.
- **Local após bump** de `CNA_VERSION` no `webapp.ts`: sempre, com
  a fixture do CNA regenerada juntamente.
- **CI dedicado** (nightly cron + `workflow_dispatch`): sim.
- **CI em todo PR**: não. ~1-2 min por execução; raramente falha por
  causa do PR (geralmente é rede, registry intermitente, bump do CNA).

## Quando NÃO usar

- Para validar `lint`/`typecheck`/`test`/`build` — use a skill `validate`.
- Para provar `publish → install → use` das libs de config — use a
  skill `smoke-publish` (direção oposta: saída → consumidor).
- Para publicar de verdade no npmjs — o Verdaccio é local-only.
