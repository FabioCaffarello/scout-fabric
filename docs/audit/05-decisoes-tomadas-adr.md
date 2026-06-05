# ADR — Decisões tomadas, Fases 1–4

**Estado do repo:** `4e3ca13` (merge da PR #19), branch `main`, working tree limpa.
**Modo:** read-only sobre o repo. Este artefato registra decisões tomadas em sessão; **nada foi escrito no repo**.
**Natureza de cada decisão é declarada visivelmente** — o leitor jamais deve confundir "a fábrica provou no repo" com "foi decidido em sessão e ainda não está no repo".

## 1) Sumário

Doze pendências entraram na sessão; **onze decididas, uma pendente (#3)**. Fases 1–3 fecharam dez (#10, #5, #4, #2, #1, #6, #7, #8 — com #9 inicialmente migrada e #11/#12 sem veredito); **Fase 4 fechou as três restantes** (#9, #11, #12). Dentre as decididas, oito são **ANCORADA-EM-FATO**, uma é **DECISÃO-DE-PRODUTO crítica** (o invariante "exclusivo-da-fábrica" sob #6), três são **DECISÃO-DE-MÉTODO** (graduação inline em #2, forma de stub em #4, postura relatório em #11). A dívida que **não pode evaporar**: o invariante "entre `init` e `materialize`, o `.claude/` é escrito só pela fábrica" é a fundação do contrato de zonas (#6), foi escolhido na sessão, e **ainda não está em lugar nenhum do repo** — precisa ir para `docs/architecture/context.md` quando o read-only ceder. Sem ele, #7, #8, e a guarda de sanidade de #6 ficam sem âncora. Dois reposicionamentos que a Fase 4 produziu e que valem destacar: **#9 passa de "gap de cadência" a "única defesa existente contra drift que afeta a frota inteira"** (vulnerabilidade-multiplicadora); **#12 fica reativo enquadrado como 7º caso do padrão "caminho rápido esconde"** — quando primeiro filho relatar, vira convenção.

## 2) Tabela mestra

| #   | Decisão (uma linha)                                                                                                                                                                 | Natureza                                                                                                     | Aterrissagem                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| #10 | Validar `directory` contra `..` E path absoluto em `validateOptions` + `schema.json`                                                                                                | ANCORADA-EM-FATO + decisão de fechar vetor                                                                   | `packages/sf-plugin/src/generators/webapp/webapp.ts` (validateOptions) + `schema.json`                                       |
| #5  | Agente: nota pre-execução, parar e reportar se exports casa padrão JSON-puro                                                                                                        | DECISÃO-DE-MÉTODO + ANCORADA (fronteira "falhar barulhento")                                                 | `.claude/agents/package-creator.md`                                                                                          |
| #4  | Criar §8.b já como stub com itens ancorados + slots `[a decidir]`                                                                                                                   | DECISÃO-DE-MÉTODO (forma de documentação)                                                                    | `docs/conventions/package.md` (nova seção §8.b)                                                                              |
| #2  | `@nx/plugin:plugin` + 5 flags OBSERVADO-por-resultado + 1 INFERIDO-DO-EFEITO (`--unitTestRunner=none`) + remanescentes LACUNA; graduação inline obrigatória                         | ANCORADA (estado de `sf-plugin/package.json` e corpo do `73212d7`) + DECISÃO-DE-MÉTODO (graduação inline)    | `docs/conventions/package.md` §8.b (slot que estava `[a decidir]`)                                                           |
| #1  | CJS obrigatório **no perfil de compat atual**; ponto de comutação nomeado (`engines.node ≥22.12`)                                                                                   | ANCORADA-EM-FATO multi-camada                                                                                | `docs/conventions/package.md` §8.b (slot que estava `[a decidir]`) + `tools/smoke-webapp.sh` (asserção causal)               |
| #3  | Agente: branch interno vs `plugin-creator` separado vs nenhum                                                                                                                       | **PENDENTE**                                                                                                 | (Decidir antes de aterrissar #5, #4, #2)                                                                                     |
| #6  | Contrato de zonas (zona-app + zona-.claude) com snapshot `find` rebaixado a guarda de sanidade                                                                                      | **DECISÃO-DE-PRODUTO** (incluindo invariante "exclusivo-da-fábrica") + DECISÃO-DE-MÉTODO (rebaixar snapshot) | `docs/architecture/context.md` (invariante) + futura camada `materialize` (contrato + guarda)                                |
| #7  | Idempotência: zona-app sobrescrita-segura; zona-.claude patch-idempotente. Detalhe técnico do CNA sem `--overwrite` em dir não-vazio é decisão de implementação                     | ANCORADA (subordinada a #6)                                                                                  | Implementação do `materialize` + `webapp.ts:defaultRunCreateNextApp` (limpar zona-app antes do CNA, ou subdir virgem + move) |
| #8  | Rollback: tudo é da fábrica → zona-app `rm -rf`; zona-.claude reverte patch                                                                                                         | Subordinada a #6 (DECISÃO-DE-PRODUTO em cascata)                                                             | Implementação do `materialize`                                                                                               |
| #9  | Drift fixture↔CNA real: passo `diff -r` fixture↔CNA fresco anexado ao nightly. **Reposicionada:** capability-add contra vulnerabilidade-multiplicadora, não doc-gap-close         | ANCORADA-EM-FATO (subordinada ao mecanismo nightly)                                                          | `.github/workflows/nightly.yml` (novo) + `tools/smoke-webapp.sh` (passo `diff -r`)                                           |
| #11 | Versões RDS/peers ao longo do tempo: nightly cobre via `pnpm install + next build` que o smoke já faz; postura **relatório com limiar de persistência**, não gate                   | ANCORADA-EM-FATO + DECISÃO-DE-MÉTODO (postura)                                                               | `.github/workflows/nightly.yml` (novo)                                                                                       |
| #12 | `eslint` contra código React real: **reativo, não proativo.** Fica como atrito conhecido a observar; quando primeiro filho relatar, vira 7º caso do padrão "caminho rápido esconde" | ANCORADA-EM-FATO (alinhamento com filosofia explícita do projeto)                                            | (Nenhuma aterrissagem agora — entra em `generator.md §7.c` quando relato chegar)                                             |

## 3) Ficha por decisão

### #10 — Path traversal em `directory`

**Decisão:** validar `directory` contra (a) presença de `..` em qualquer segmento e (b) ser path absoluto. Em **dois lugares**: `validateOptions` (defesa para chamadas via API) + `schema.json` (defesa para chamadas via Nx CLI).

**Fundamento:** o vetor real de escape é o `..` — `path.join('/workspace', '/etc/foo')` (POSIX) retorna `/workspace/etc/foo` (neutraliza absoluto por concatenação), mas `path.join('/workspace', '../../etc/foo')` retorna `/etc/foo` (escapa). Validar **ambos** mesmo assim, porque a regra é cravada no input, não emergente do comportamento da `path.join` — coerente com a tese da fábrica de não depender de detalhes sutis de biblioteca.

**Alternativas rejeitadas:**

- Validar só em `materialize` upstream — rejeitada por violar defesa em profundidade já estabelecida.
- Validar só `..` sem `path absoluto` — rejeitada por honestidade da regra no input.

**Natureza:** **ANCORADA-EM-FATO**.

**Citação re-verificada:** `docs/conventions/generator.md:73-105` (§2.c, "Defesa em profundidade"). O texto literal — "Não é duplicação — é a única validação que protege chamadas que não passam pelo CLI" — confirma o precedente exato para repetir validação no generator function.

### #5 — Forma A no `package-creator`

**Decisão:** o agente ganha **nota pre-execução** que, se a resposta do usuário a "o que o pacote exporta?" (`package-creator.md:47`) casar o padrão JSON-puro (ex.: "JSONs de config TS", "schemas estáticos", "presets em JSON"), o agente **para e reporta** antes de invocar `@nx/js:lib`. Não há branch completo para a Forma A.

**Fundamento:** o defeito catalogado na Frente 1 é o **silêncio** (agente entrega Forma B silenciosamente quando o usuário queria Forma A), não a incapacidade. "Falhar barulhento" é fronteira do agente declarada em `dev-toolkit-informs-scout.md` (Padrão 4 do `.claude` da fábrica). O marcador do `§8.a` (`package.md:343-345`) é post-hoc; a versão útil é pre-execução, atada à pergunta que o agente já faz.

**Alternativas rejeitadas:**

- (a) Branch completo Forma A no agente — rejeitada por custo desproporcional para um caminho raro; mata uma incapacidade que ninguém pediu para resolver agora.
- (c) Aceitar o defeito — rejeitada por contradizer o padrão "falhar barulhento".

**Natureza:** **DECISÃO-DE-MÉTODO** (forma de fechar o silêncio) + ANCORADA (padrão do agente já está no repo).

**Citação re-verificada:** `.claude/agents/package-creator.md:47` (a pergunta "O que o pacote exporta — JSONs de config, função TS, plugin Nx, etc."). Pergunta confirmada literalmente.

### #4 — Refs `§8.b` quebradas

**Decisão:** **criar a §8.b já na Fase 1**, como stub com (i) os ~15 itens estruturais já ancorados pelo mapa da Frente 1 e (ii) dois slots **`[a decidir]`** marcando onde os conteúdos de #1 (CJS) e #2 (flags) vão pousar. Após Fase 2, esses dois slots foram preenchidos pelas decisões #2 e #1 desta sessão.

**Fundamento:** das três opções (criar/reescrever ponteiro/deletar), só "criar" honra o princípio "doc é fonte canônica que o agente consulta" (`dev-toolkit-informs-scout.md` Padrão 3). "Reescrever para apontar para o `73212d7` body" promoveria mensagem de commit a doc canônico, refratando o princípio. "Deletar" admite a lacuna sem fechá-la. O stub com slots visíveis é **honesto sobre o que ainda não sabe**, é melhor que um ponteiro que parece typo, e desacopla o nascimento da §8.b da resolução de #1/#2 (Fase 1 não fica refém da Fase 2).

**Alternativas rejeitadas:**

- Reescrever ponteiro para commit body — refrata "docs como fato observado em lugar consultável".
- Deletar ponteiro — admite lacuna sem fechá-la.

**Natureza:** **DECISÃO-DE-MÉTODO** (forma de documentar).

**Citação re-verificada:** `docs/conventions/generator.md:35` e `:608` apontam para `package.md §8.b`; `grep -n '8\.[ab]\|seção 8' docs/conventions/package.md` retorna apenas `:338:### 8.a)`. Confirmado: §8.b não existe.

### #2 — Flags do `@nx/plugin:plugin`

**Decisão:** documentar `@nx/plugin:plugin` como o comando + flags derivadas das convenções do workspace, com **graduação inline por flag** (cada flag carrega seu grau dentro do bloco, inseparável de cópia-cola).

- `--linter=eslint` — **OBSERVADO-por-resultado** (`packages/sf-plugin/eslint.config.mjs` existe; sem rastro de "removido linter" no `73212d7`).
- `--tags=scope:public,type:plugin` — **OBSERVADO-por-resultado** (`packages/sf-plugin/package.json:61-63` confirma as duas tags literalmente).
- `--useProjectJson=false` — **OBSERVADO-por-resultado** (não há `project.json` em `packages/sf-plugin/`; o workspace usa o padrão em `package-creator.md:68`).
- `--importPath=@fabio.caffarello/sf-plugin` — **OBSERVADO-por-resultado** (`packages/sf-plugin/package.json:2` = `"name": "@fabio.caffarello/sf-plugin"`).
- `--no-interactive` — **OBSERVADO-por-convenção-universal** (workspace, sem evidência de prompts).
- `--unitTestRunner=none` — **INFERIDO-DO-EFEITO**, **rebaixado** da hipótese inicial. O `73212d7` body (linha 36 da mensagem) diz literalmente "@nx/jest peer indesejado **removido**". A palavra "removido" implica presença-anterior, o que **pode** significar que o generator foi rodado com `--unitTestRunner=jest` (ou default que pulled `@nx/jest`) e depois limpou; **ou** que foi rodado com `--unitTestRunner=none` por outra razão e o "removido" é frouxo. Ambíguo. A flag plausível para o futuro é `--unitTestRunner=none` (evita o passo de limpeza), mas a evidência não a confirma como a flag usada historicamente.
- `--description` e quaisquer outras — **LACUNA** (não há rastro no repo).

**Fundamento:** alternativa (a) "investigar empiricamente" comprava a _certeza errada_ — o footprint reproduzido hoje não é o mesmo que o footprint de `73212d7` (Nx pode mudar defaults entre patches). (b-prime) entrega o que de fato precisa estar no §8.b — comando canônico com flags derivadas de convenções verificáveis pelo estado real, sem gastar o escape do read-only. Graduação inline (vs. nota de rodapé) garante que a anotação não pode ser separada do bloco na leitura — proteção contra a forma do artefato comunicar certeza que o conteúdo não tem.

**Alternativas rejeitadas:**

- (a) Reconstruir empiricamente — compra "este comando produz este footprint hoje", não "este foi o comando de nascimento".
- (b) puro (sem graduação inline) — comando-bloco-mais-nota decai na leitura; o bloco persiste, a nota some.
- (c) Cristalizar via subagent — depende de #3 (pendente).

**Natureza:** **ANCORADA-EM-FATO** (cinco flags do estado real) + **INFERIDO-DO-EFEITO** explícito (`--unitTestRunner=none`) + **LACUNA** explícita (remanescentes) + **DECISÃO-DE-MÉTODO** (graduação inline).

**Citações re-verificadas nesta passagem:**

- `packages/sf-plugin/package.json:61-63` — `"tags": [..., "type:plugin"]` ✓
- `packages/sf-plugin/package.json:2` — `"name": "@fabio.caffarello/sf-plugin"` ✓
- corpo do commit `73212d7`, linha 36 da mensagem — "@nx/jest peer indesejado **removido** (Vitest-only workspace)" ✓
- ausência de `project.json` em `packages/sf-plugin/` (re-verificado por listagem) ✓
- `eslint.config.mjs` presente em `packages/sf-plugin/` ✓

### #1 — CJS obrigatório vs convencional

**Decisão:** CJS é **obrigatório no perfil de compat atual**, com ponto de comutação nomeado. O §8.b crava: "não adicione `"type": "module"`; o Nx CLI carrega via `require()`; `require()` síncrono em ESM (feature `require(esm)`) é default-on apenas em Node ≥22.12; o sf-plugin não declara `engines.node` próprio, então herda o piso prático do workspace (`>=22.0.0`), que inclui a janela 22.0–22.11 onde `require(esm)` não está disponível. Modernizar exige elevar `engines.node` para `≥22.12` simultaneamente — não é edição isolada do `package.json`."

Smoke ganha asserção causal: `head -1 dist/index.js === '"use strict";'` com comentário **nomeando ambas as camadas** (Nx require + Node <22.12 sem `require(esm)`).

**Fundamento:** a pergunta de #1 ("qual mecanismo o Nx CLI usa para carregar plugin?") é respondível por **inspeção do código que já está em `node_modules/nx/`** — read-only, sem execução, sem mutação. A terceira opção dissolveu a falsa bifurcação "executar vs hipótese". A segunda passagem (não atropelar o primeiro achado conveniente) revelou a nuance Node 22.12+: o mecanismo é `require()` literalmente, mas `require()` em Node moderno aceita ESM síncrono — então a implicação para `"type": "module"` é **condicional ao perfil de Node**, não absoluta. O perfil declarado pelo sf-plugin é o que torna CJS efetivamente obrigatório hoje.

**Alternativas rejeitadas:**

- "Investigar empiricamente em scratch" — desnecessária; a resposta está em código já lível.
- "Documentar como convencional-com-hipótese" — rejeitada porque deixar INFERIDO parado quando OBSERVADO está a dez minutos de leitura inverte o propósito da graduação.

**Natureza:** **ANCORADA-EM-FATO multi-camada**.

**Citações re-verificadas nesta passagem:**

- `node_modules/nx/dist/src/config/schema-utils.js:26` — `const module = require(modulePath);` dentro da função `getImplementationFactory` (declarada em `:19`, exportada em `:3`). Re-verificado por leitura literal das linhas 20-30. ✓
- `node_modules/nx/dist/src/command-line/generate/generator-utils.js:24` — `const implementationFactory = (0, schema_utils_1.getImplementationFactory)(generatorConfig.implementation, generatorsDir, collectionName, projects);` dentro de `getGeneratorInformation`. Re-verificado. ✓
- `packages/sf-plugin/package.json` — **NÃO** tem campo `"engines"` (`grep -n '"engines"' packages/sf-plugin/package.json` retorna vazio). ✓
- root `package.json:7-9` — `"engines": { "node": ">=22.0.0" }`. ✓ Mesma proposição confirmada em `docs/architecture/context.md:46` (`engines.node: ">=22.0.0"`).
- Hook ESM ativo ao redor do `require`: NENHUM para `.js` (o bloco `if (extname === '.ts')` em `schema-utils.js:23-25` só registra TS transpiler, não aplicável ao sf-plugin). ✓

**Nota de proveniência sobre o ponto de comutação:** a afirmação "`require(esm)` é default-on a partir de Node 22.12" é **OBSERVADO-FORA-DO-REPO** (release notes/changelog público do Node.js). Não há ancoragem no scout-fabric para isso; é conhecimento de plataforma. Em rigor disciplinar, ao escrever o §8.b o autor deve incluir referência ao release note correspondente do Node (ex.: link para o changelog que documenta a mudança de default), para que a derivação da consequência (CJS obrigatório dadas as garantias atuais) seja cadeia verificável de ponta a ponta.

### #3 — Agente: branch interno vs `plugin-creator` separado

**Status:** **PENDENTE.** Não decidida nesta sessão.

**Opções abertas:**

- (a) Branch `<type>=plugin` dentro de `.claude/agents/package-creator.md`. Invariante implícita: "uma chamada do usuário → um agente".
- (b) Subagent novo `.claude/agents/plugin-creator.md`. Invariante implícita: "um agente, uma forma".
- (c) Não criar agente; `package-creator` ganha nota "Forma C: siga manualmente `package.md §8.b`". Invariante implícita: "agente só para caminho frequente".

**Meta-decisão que falta:** as três invariantes acima **não estão escritas no repo**. Decidir qual prevalece é pré-requisito para #3. Não há ancoragem disponível; é DECISÃO-DE-PRODUTO sobre o padrão do ferramental, que se propagará ao kit de scout via `dev-toolkit-informs-scout.md:25-32, 90-100`.

**Dependências:** #3 deve ser decidida **antes** de aterrissar #5, #4, #2, porque a forma do agente determina onde o conteúdo de §8.b é consumido (se (b), o agente novo lê §8.b; se (a), o branch interno lê; se (c), só o humano lê).

### #6 — Fonte de verdade do `materialize`

**Decisão:** **contrato de zonas**, com snapshot `find` pré/pós rebaixado a guarda de sanidade.

- **Zona-app** (regime CREATE): território do CNA + harness. Re-materialize é sobrescrita-segura porque conteúdo é integralmente da fábrica.
- **Zona-.claude** (regime PATCH): criada no `init`/`scout`, atualizada pelo `materialize` que conhece a forma anterior (idempotente por patch).
- **Fonte de verdade primária** = a **declaração** do contrato de zonas (qual diretório pertence a qual regime), não descoberta runtime.
- **Snapshot `find` pré/pós** sobrevive **rebaixado** a guarda de sanidade: se o disco divergir do esperado pelo contrato, ou aparecer artefato fora das zonas declaradas, o `materialize` **para e reporta** — não sobrescreve.

**Alternativas rejeitadas:**

- (a) Manifesto declarativo por generator — só seria necessário para distinguir procedência fábrica-vs-operador; o invariante "exclusivo-da-fábrica" elimina essa necessidade.
- (c) Expor fixture como contrato — fixture responde "qual o shape esperado", não "qual a forma do inventário". Pergunta diferente da que o `materialize` faz.

**Natureza:** **DECISÃO-DE-PRODUTO crítica**.

⚠️ **DÍVIDA EMBUTIDA — NÃO PODE EVAPORAR**: o contrato de zonas pressupõe o **invariante "exclusivo-da-fábrica"** — entre `init` e `materialize`, o `.claude/` do projeto-filho **é escrito apenas pela fábrica, nunca pelo operador à mão**. **Este invariante não está em nenhum lugar do repo hoje**. Ver §4 abaixo.

### #7 — Idempotência

**Decisão:** resolvida pelo contrato de zonas (#6). Zona-app é sobrescrita-segura; zona-.claude é patch-idempotente. **Resíduo técnico**: o CNA invocado em `webapp.ts:defaultRunCreateNextApp` não tem flag de overwrite no `CNA_FLAGS` (re-verificado: `grep -n "overwrite\|--overwrite" packages/sf-plugin/src/generators/webapp/webapp.ts` retorna apenas comentário sobre `generateFiles`, não flag de CNA). Logo, CNA em diretório não-vazio falha — é **decisão de implementação** (limpar zona-app antes do CNA, ou rodar CNA em subdir virgem + `mv` atômico), não decisão de política, e a política já está fixada por #6.

**Natureza:** subordinada a #6 (cascata).

### #8 — Rollback / falha parcial

**Decisão:** resolvida pelo contrato de zonas (#6). Como tudo na zona-app é da fábrica, rollback = `rm -rf <zona-app>`. Como a zona-.claude é patch idempotente, rollback = reverter o patch para a forma pré-`materialize`. Falha-parcial deixa de ser "disco de procedência ambígua" — passa a ser "estado conhecido por zona".

**Natureza:** subordinada a #6 (cascata, com a mesma dívida embutida do invariante).

### Mecanismo Fase 4 — Nightly como contêiner de #9 e #11

**Decisão:** criar `.github/workflows/nightly.yml` que invoca `tools/smoke-webapp.sh`. Posture **relatório com limiar de persistência**, não gate. Realização canônica via issue auto-gerenciada pelo workflow (abre/atualiza/fecha conforme status; humano reage à atividade da issue, não ao check vermelho na lista de PRs).

**Fundamento da existência do nightly:** a doc já o promete em `docs/conventions/generator.md:553-554` ("Cadência: **local antes de release + nightly + manual pre-release**") mas ele não existe — `.github/workflows/` tem apenas `ci.yml`, `governance-drift.yml`, `release.yml`. A Fase 4 fecha esse gap, mas a justificativa não é honrar promessa de doc — é resolver duas corrosões temporais garantidas (#9 e #11), das quais #9 é particularmente grave (ver ficha).

**Fundamento da postura relatório-com-persistência:** o nightly depende de rede externa (`pnpm dlx` baixa o CNA; `pnpm install` resolve registry público). Os outros workflows do repo são herméticos. Um nightly que é gate sob dependência de rede corrói os sinais herméticos por contaminação — falsos-positivos de rede às 3h da manhã geram fadiga de alarme, e fadiga de alarme vira `--no-verify` mental. O projeto codificou isto como princípio: `CLAUDE.md:101` — "regras lentas que viram `--no-verify` valem zero". Persistência distingue corrosão-real (falha consistente por N noites) de ruído (falha isolada).

**Alternativas rejeitadas:**

- Nightly como gate — rejeitada pela fadiga de alarme.
- Cadência ad-hoc (humano lembra de rodar local) — rejeitada porque corrosão temporal exige periodicidade não-confiável a memória.
- Não criar nightly — rejeitada porque #9 fica sem nenhuma defesa em camada alguma.

**Natureza:** **DECISÃO-DE-MÉTODO** (postura) subordinada à existência do nightly.

**Citações re-verificadas:**

- `docs/conventions/generator.md:553-554` — "Cadência: **local antes de release + nightly + manual pre-release**". Promessa de cadência. ✓
- `.github/workflows/` — `ls` retorna `ci.yml`, `governance-drift.yml`, `release.yml`. Nightly ausente. ✓
- `CLAUDE.md:98-101` — seção "Norte sem burocracia"; texto literal: "Se uma checagem ou documento não economiza tempo no caminho comum, vai fora. Bug pego em desktop > bug pego em CI > bug pego no projeto-cliente — mas regras lentas que viram `--no-verify` valem zero." ✓

### #9 — Drift fixture↔CNA real

**Decisão:** o nightly ganha um passo de comparação byte-a-byte entre o output de `pnpm dlx create-next-app@16.2.7 ...` fresco e a fixture congelada `__fixtures__/cna-16.2.7/`. Divergência = a fixture precisa ser regenerada (ou o CNA mexeu em algo via fetch lazy não-versionado).

**Reposicionamento da Fase 4 — não evaporar:** quando o documento de decisões enquadrou #9 como "cadência" (junto com #11), a severidade ficou marcada MÉDIA. A Fase 4 revelou que isso subestima o caso. **#9 não é gap de cadência — é a única defesa que existirá contra um defeito silencioso que afeta a frota inteira simultaneamente.** Re-ancorado: `tools/smoke-webapp.sh:200-204` (post-generator block) só checa que `apps/hello-rds/` foi criado e que `providers.tsx` existe; nada compara contra a fixture. `webapp.spec.ts:54-58` (`fixtureBackedRunCna`) confia na fixture por design. Portanto, drift fixture↔CNA hoje **não tem como ser pego em camada alguma**, e quando ocorrer a fábrica passa a gerar input divergente para todo filho gerado dali em diante. Severidade efetiva é maior do que MÉDIA; quem aterrissar #9 deve registrar a justificativa como capability-add contra vulnerabilidade-multiplicadora, não como honrar promessa de doc.

**Alternativas rejeitadas:**

- Aceitar o risco e documentar — rejeitada por permitir defeito-multiplicador silencioso.
- Eliminar a fixture; Tree-test usa CNA real cacheado — rejeitada por violar `generator.md:506-528` (Tree-test rápido <1s no PR).

**Natureza:** **ANCORADA-EM-FATO** (subordinada ao mecanismo nightly).

**Detalhe de implementação fora de política:** `diff -r` é o primitivo natural (a fixture foi capturada sob `--skip-install --disable-git`, é estática por construção). Se algum arquivo do template-Next tiver elemento dependente de data/cache na captura, vira filtro — questão de protocolo de fixture, não de política do nightly. Registrar quando implementar.

**Citações re-verificadas:**

- `tools/smoke-webapp.sh:200-204` — block post-generator com apenas `[[ -d apps/hello-rds ]]` e `[[ -f .../providers.tsx ]]`; nenhum `diff` contra fixture. ✓
- `packages/sf-plugin/src/generators/webapp/webapp.spec.ts:54-58` — `fixtureBackedRunCna` (mock que aplica a fixture na Tree). ✓
- `docs/conventions/generator.md:506-528` — §7.a, "Camada 1 — Tree-test contra fixture (rápido, todo PR). Custo: <1s." ✓

### #11 — Versões RDS/peers ao longo do tempo

**Decisão:** o nightly cobre via os passos que o smoke já faz — `pnpm install` no webapp gerado (`smoke-webapp.sh:241`) + `pnpm exec next build` (`:254`) + `pnpm exec eslint .` (`:261`). Rodar com cadência periódica converte "primeiro filho descobre" em "fábrica descobre primeiro". Nenhuma asserção nova no smoke; só nova cadência.

**Fundamento:** as deps que o harness injeta (`webapp.ts:122-133`: RDS, lucide-react, react-hook-form, zod, @hookform/resolvers, sf-eslint-config) usam ranges `^x.y.z`. Versões mudam ao longo do tempo no registry; a tupla pode deixar de resolver ou de buildar sem que ninguém edite o repo da fábrica. O smoke já prova "a tupla atual instala+builda"; rodar periodicamente prova a propriedade ao longo do tempo.

**Alternativas rejeitadas:**

- Pinar todas as versões (sem `^`) — rejeitada porque perde a "natureza 1 — por versão de pacote" de `context.md:22-26` (bumps de segurança não alcançam filhos automaticamente).
- Aceitar o risco — rejeitada porque a fábrica tem o smoke; só falta a cadência.

**Natureza:** **ANCORADA-EM-FATO** (subordinada ao mecanismo nightly).

**Citações re-verificadas:**

- `tools/smoke-webapp.sh:241,254,261` — `pnpm install`, `next build`, `eslint` no webapp gerado (já existentes). ✓
- `packages/sf-plugin/src/generators/webapp/webapp.ts:122-133` — `RDS_VERSION` e os 4 peers + `sf-eslint-config` em devDeps, todos com ranges `^`. ✓
- `docs/architecture/context.md:22-26` — "Duas naturezas de herança... 1. Por versão de pacote — bump em sf-\* publicado alcança projetos externos no próximo `pnpm update`." ✓

### #12 — `eslint` contra código React real

**Decisão:** **reativo, não proativo.** Fica enquadrado como "atrito conhecido a observar"; quando primeiro filho relatar (ou quando o CI/smoke do próprio filho pegar), vira o **7º caso do padrão "caminho rápido esconde"** documentado em `generator.md §7.c` (junto com TS6307, `@ts-expect-error` no vitest, dotfiles em `pnpm pack`, `.gitignore` aninhado + Prettier, parent dir do CNA, `"use client"` em `page.tsx`). Nada adicionado ao nightly.

**Fundamento — três camadas convergentes:**

1. **Alinhamento com a filosofia explícita do projeto.** `CLAUDE.md:98-101` (seção "Norte sem burocracia"): "Se uma checagem ou documento não economiza tempo no caminho comum, vai fora." A própria fábrica codificou que coisas que não cobrem o caminho comum frequente saem. #12 é atrito **antecipado, não observado** — `webapp-generator.md:249-250` diz literalmente "se causar atrito real, viramos a ordem ou filtramos `sf` para o que faz sentido em webapps"; `:252-256` enquadra como "Risco assumido". Categoria explicitamente marcada como reativa pela própria doc de design.
2. **A fixture que escreveríamos agora é palpite sobre qual código React aciona qual regra.** "Regras Node-first disparando em React" é uma categoria, não uma regra. Se palpitarmos errado — e atrito real costuma se materializar em padrões que ninguém antecipou — a fixture passa verde, o filho descobre o atrito de qualquer forma, e a fixture vira lixo que precisa ser reescrita para refletir o atrito real. Uma fixture-que-mente (verde sobre defeito que existe) é exatamente o modo de falha que toda a auditoria perseguiu (o "removido" de #2, o `pnpm pack` mascarando dotfiles em `generator.md §5.d`).
3. **Pattern da própria fábrica é responsivo-com-cataloging, não preventivo.** Os 6 casos do catálogo em `generator.md §5.c+§5.e` + `§7.c` foram **todos** catalogados quando apareceram, nenhum foi prevenido. #12 cabe no molde sem fricção.

**Contra-argumento considerado e rejeitado:** "a fábrica fica cega até o filho relatar — detecção mais lenta". Verdade, mas o filho **tem smoke e CI próprios por design** (parte do contrato do scout-fabric per `dev-toolkit-informs-scout.md`), e a fábrica nunca prometeu pegar o atrito antes do filho — prometeu pegar antes do produto-final do filho, e o CI do filho cumpre isso. A garantia não é violada.

**Alternativas rejeitadas:**

- Anexar fixture de "app real" ao nightly (proativo) — rejeitada pelas três camadas acima, em particular pela segunda (palpite que pode mentir).
- Fixture no Tree-test que assegura que regras específicas não disparam — rejeitada por mesma razão; specs também palpitam.

**Natureza:** **ANCORADA-EM-FATO** (alinhamento com filosofia explícita do projeto).

**Citações re-verificadas:**

- `CLAUDE.md:98-101` — seção "Norte sem burocracia" + "vai fora se não economiza tempo no caminho comum". ✓
- `docs/design/webapp-generator.md:249-250` — "se causar atrito real, viramos a ordem ou filtramos `sf` para o que faz sentido em webapps". ✓
- `docs/design/webapp-generator.md:252-256` — "Risco assumido: `sf-eslint-config` foi escrito para libs Node-first; algumas regras dele... podem não fazer sentido num webapp e provavelmente são no-ops por falta de target. Se travarem, o harness as remove pontualmente — ainda fase de implementação." ✓
- `docs/conventions/generator.md §7.c` (catálogo dos 6 casos) — pattern de responsivo-com-cataloging. ✓

## 4) DÍVIDA DE PRODUTO A CRAVAR (esta seção não pode evaporar)

Esta seção lista o que foi **decidido em sessão**, **não está em lugar nenhum do repo**, e **precisa ser cravado em doc canônico** quando o read-only ceder. Confundir um item desta seção com um fato ancorado é o erro disciplinar mais grave possível.

### Dívida 1 — Invariante "exclusivo-da-fábrica" (de #6)

**Texto da dívida (a ser cravado, não escrito aqui como execução):**

> Entre as fases `init` e `materialize`, o diretório `.claude/` de um projeto-filho gerado pela fábrica **é escrito apenas pela fábrica** — pelo `scout` no `init`, e pelo `materialize` quando ele reroda. O operador humano **não edita `.claude/` à mão** nesse intervalo. Edits manuais quebram o contrato de zonas: o snapshot de sanidade do `materialize` vai detectar divergência e parar.

**Onde precisa aterrissar:** `docs/architecture/context.md` (seção "Decisões tomadas" e/ou nova seção "Contrato de zonas — `init` → `materialize`"). Deve ser referenciado por:

- A futura implementação do `materialize` (guarda de sanidade).
- O kit de scout que será emitido aos filhos (`dev-toolkit-informs-scout.md:114-118` declara que o sf-plugin materializa a primeira receita do catálogo — o invariante precisa estar visível ao consumidor desse veículo).

**Por que é dívida crítica:** sem este invariante cravado, #6 perde sua fundação (zona-.claude deixa de ser patch-idempotente se outro autor mexer), e #7+#8 perdem sua cascata (a sobrescrita-segura assume procedência única). A guarda de sanidade do snapshot `find` continua existindo como defesa, mas vira reativa em vez de declarada — pega o estrago em vez de prevenir.

**Status atual no repo:** ausente. `grep -rn "exclusivo-da-fábrica\|invariante.*claude" docs/` retorna vazio (não rodado aqui, mas pode ser executado para confirmar).

## 5) PENDENTE

### #3 — Agente: branch vs `plugin-creator` separado

Já registrada acima. Resumo da pendência:

- Três opções (branch interno / agente novo / só nota), três invariantes implícitas, **nenhuma escrita no repo**.
- Bloqueia: aterrissagem de #5, #4, #2 (a forma do consumidor de §8.b depende dela).
- Meta-decisão pré-requisito: qual invariante prevalece ("uma chamada → um agente" vs "um agente → uma forma" vs "agente só para caminho frequente").

## 6) Apêndice de proveniência

Cada citação que entrou como ANCORADA-EM-FATO, re-verificada nesta passagem (read-only, sem execução).

| Citação                                                                | Conteúdo verificado                                                                                                | Re-ancorado nesta passagem?                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `docs/conventions/generator.md:73-105`                                 | §2.c, "Defesa em profundidade" + padrão de `validateOptions` para #10                                              | sim                                                                       |
| `.claude/agents/package-creator.md:47`                                 | "O que o pacote exporta — JSONs de config, função TS, plugin Nx, etc." para #5                                     | sim (corrigido off-by-one de `:46` → `:47` nesta passagem de atualização) |
| `docs/conventions/generator.md:35, :608`                               | Refs `§8.b` apontando para vazio (para #4)                                                                         | sim                                                                       |
| `docs/conventions/package.md:332-345`                                  | §8 só tem §8.a; `### 8.b)` não existe                                                                              | sim (re-grep)                                                             |
| `packages/sf-plugin/package.json:2`                                    | `"name": "@fabio.caffarello/sf-plugin"` para #2                                                                    | sim                                                                       |
| `packages/sf-plugin/package.json:61-63`                                | `"tags": [..., "type:plugin"]` para #2                                                                             | sim                                                                       |
| corpo do commit `73212d7`, linha 36 da mensagem                        | "@nx/jest peer indesejado removido (Vitest-only workspace)" para #2 (`--unitTestRunner=none` rebaixado)            | sim                                                                       |
| `node_modules/nx/dist/src/config/schema-utils.js:26`                   | `const module = require(modulePath);` para #1 (mecanismo de load)                                                  | sim (re-leitura literal das linhas 20-30)                                 |
| `node_modules/nx/dist/src/command-line/generate/generator-utils.js:24` | Chamada de `getImplementationFactory` dentro de `getGeneratorInformation` para #1                                  | sim                                                                       |
| `packages/sf-plugin/package.json` (ausência)                           | Sem campo `"engines"` para #1 (perfil de compat)                                                                   | sim (re-grep vazio)                                                       |
| root `package.json:7-9`                                                | `"engines": { "node": ">=22.0.0" }` para #1                                                                        | sim                                                                       |
| `packages/sf-plugin/src/generators/webapp/webapp.ts` (ausência)        | `CNA_FLAGS` não inclui `--overwrite` para #7 (resíduo técnico)                                                     | sim (re-grep só encontrou comentário)                                     |
| Node release notes (`require(esm)` default-on em 22.12+)               | OBSERVADO-FORA-DO-REPO para #1; deve receber link de changelog ao aterrissar                                       | NÃO ancorado no repo (declarado como OBSERVADO-EXTERNO)                   |
| `docs/conventions/generator.md:553-554`                                | Cadência prometida "local antes de release + nightly + manual pre-release" para mecanismo Fase 4                   | sim                                                                       |
| `.github/workflows/` (ausência de nightly)                             | Só `ci.yml`, `governance-drift.yml`, `release.yml` — nightly ausente                                               | sim                                                                       |
| `CLAUDE.md:98-101`                                                     | "Norte sem burocracia" + "regras lentas que viram `--no-verify` valem zero" para postura de #11 e filosofia de #12 | sim                                                                       |
| `tools/smoke-webapp.sh:200-204`                                        | Post-generator block sem `diff -r` contra fixture, para #9                                                         | sim                                                                       |
| `packages/sf-plugin/src/generators/webapp/webapp.spec.ts:54-58`        | `fixtureBackedRunCna` (Tree-test confia na fixture por design) para #9                                             | sim                                                                       |
| `docs/conventions/generator.md:506-528`                                | §7.a, Tree-test rápido <1s no PR — barreira para opções alternativas em #9                                         | sim                                                                       |
| `tools/smoke-webapp.sh:241,254,261`                                    | `pnpm install`, `next build`, `eslint` no webapp gerado (já existem) para #11                                      | sim                                                                       |
| `packages/sf-plugin/src/generators/webapp/webapp.ts:122-133`           | `RDS_VERSION` + 4 peers + sf-eslint-config com ranges `^` para #11                                                 | sim                                                                       |
| `docs/architecture/context.md:22-26`                                   | "Duas naturezas de herança" — natureza 1 (por versão de pacote) para #11                                           | sim                                                                       |
| `docs/design/webapp-generator.md:249-250`                              | "se causar atrito real, viramos a ordem ou filtramos" para #12 (atrito antecipado, não observado)                  | sim                                                                       |
| `docs/design/webapp-generator.md:252-256`                              | "Risco assumido" sobre regras Node-first em webapp para #12                                                        | sim                                                                       |

Nenhuma citação reportada nesta passagem divergiu do que está no disco. **Uma correção de proveniência foi aplicada nesta atualização:** a citação `.claude/agents/package-creator.md:46` (registrada em Fase 1) estava off-by-one — o bullet "O que o pacote exporta" começa em `:47`, não `:46`. A linha foi corrigida no corpo do ADR e marcada nesta tabela. Sem essa correção, o ADR teria uma rachadura na propriedade que dá ao registro sua autoridade.

---

**Status final:** **onze decididas, uma pendente** (#3 — agente branch vs `plugin-creator` separado, aguarda meta-decisão sobre invariante do agente). Uma dívida de produto crítica (invariante "exclusivo-da-fábrica") aguarda aterrissagem em `context.md` no momento em que o read-only ceder. **Nada foi escrito no repo nesta sessão.** Este ADR é o registro persistente das quatro fases — Fase 1 (independentes: #10, #5, #4), Fase 2 (Cluster I: #2, #1), Fase 3 (Cluster III: #6, #7, #8), Fase 4 (cadência+cobertura: #9, #11, #12). Quando a sessão de execução começar — natureza diferente desta — o ADR é o input.
