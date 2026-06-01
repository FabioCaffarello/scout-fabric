---
name: smoke-publish
description: Roda o smoke test do ciclo `publish → install → use` contra um Verdaccio local efêmero. **Nunca** toca o npmjs público. Use sempre que o usuário pedir "smoke test", "provar publish", "validar que o pacote instala", "rodar o smoke", "checar release antes do real", ou equivalente. O script orquestra build, registry local, publish, consumidor descartável, prova comportamental via `tsc`, e cleanup. Idempotente — trap-cleanup mesmo em Ctrl-C.
---

# smoke-publish

Envelopa `tools/smoke-publish.sh`. **Lógica zero aqui** — quando o smoke
mudar (ex.: outro pacote a smoke-testar), muda só o script.

## O que o script faz (resumo, não a fonte da verdade)

1. Build do `sf-tsconfig` via `tsc --build`.
2. Sobe Verdaccio em background na 4873.
3. Publica via `nx release publish --registry=http://localhost:4873`.
4. Cria consumidor em `mktemp -d` com `--userconfig` próprio
   (isolamento explícito, não por path).
5. `npm install @fabio.caffarello/sf-tsconfig typescript` do registry
   local.
6. `tsc --showConfig` num tsconfig que faz `extends` do pacote —
   assert que `noUncheckedIndexedAccess: true` veio junto.
7. Positivo: código violando a flag deve **falhar** com `TS18048`.
8. Controle: código corrigido deve **passar** (anti-falso-positivo).
9. Derruba Verdaccio, remove tmp dir e o storage local.

Detalhes vivem em `docs/release.md` e no próprio script.

## Como invocar

```sh
./tools/smoke-publish.sh
```

## Critério de aceite

Saída termina com `==> ALL CHECKS PASSED`. Qualquer outra coisa é
falha — reportar a linha exata do log que quebrou.

## Quando NÃO usar

- Para publicar de verdade no npmjs — isto é local-only. Publish real
  está coberto em `docs/release.md` e exige `NPM_TOKEN`.
- Para validar `lint`/`typecheck`/`test` — use a skill `validate`.
- Para rodar contra outro pacote além de `sf-tsconfig` — hoje o script
  é específico; quando expandirmos, **muda o script**, não esta skill.
