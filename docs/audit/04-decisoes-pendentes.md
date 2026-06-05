# Decisões arquiteturais — scout-fabric @ 4e3ca13

**Origem:** consolidação das 12 pendências levantadas pelas Frentes 1 (reprodutibilidade de pacote) e 2 (cobertura de teste / orquestração da delegação).
**Para:** dono da fábrica.
**Forma:** este documento estrutura as decisões para serem tomadas, não as toma.

Convenção: cada pendência é citada pelo número original da pilha (1–12). Reorganizadas aqui por **acoplamento** (decidir uma muda as outras), não pela frente de origem.

---

## 1) Agrupamento por acoplamento

### Cluster I — "Formalizar a Forma C como variante" (pacote-doc-agente)

**Contém:** #1 (CJS obrigatório vs convencional), #2 (flags `@nx/plugin:plugin`), #3 (agente: branch vs `plugin-creator`), #4 (refs `§8.b` quebradas).

**Por que estão acopladas:**

- #4 é a manifestação superficial ("o ponteiro aponta para vazio"). Resolver #4 com a opção "escrever a seção" **exige** os conteúdos #1 e #2.
- #3 é derivativa: o agente lê o doc canônico (`package-creator.md:28-29` literal: "se houver divergência entre o playbook abaixo e o doc, **o doc vence**"). Sem §8.b, qualquer branch ou plugin-creator referenciaria vácuo.
- Inversamente: #4 com a opção "reescrever o ponteiro para a fonte real" (commit `73212d7` + `generator.md §5.c`) **não** exige #1+#2 resolvidos, mas deixa #3 sem âncora documental e propaga o defeito ao kit de scout (`dev-toolkit-informs-scout.md:114` — "o sf-plugin vai materializar a primeira receita do catálogo").

**Decisão-raiz do cluster:** #4 — porque das duas opções de #4, uma exige resolver #1+#2 e a outra não.

### Cluster II — "Forma A no agente" (independente)

**Contém:** #5 (Forma A diverge-silencioso em `package-creator`).

**Acoplamento:** nenhum com Cluster I no plano estrutural — Forma A é JSON-pura, Forma C é plugin; o branch ou nota de cada uma no agente é editável independentemente. Mas: **ambas são edições no mesmo agente** (`.claude/agents/package-creator.md`), então pode ser conveniente decidir junto com #3 do Cluster I se a opção de #3 for "branch dentro do agente" (passos a coordenar).

### Cluster III — "Contrato `materialize` ↔ generator delegante" (CRÍTICO)

**Contém:** #6 (fonte de verdade do `materialize`), #7 (idempotência), #8 (falha parcial / rollback), #9 (drift fixture↔CNA real).

**Por que estão acopladas:**

- #6 é a raiz. A escolha entre (a) manifesto declarativo, (b) snapshot `find` pré/pós, (c) expor fixture como contrato muda o significado das outras três:
  - Se (a) manifesto: **idempotência** vira "2ª chamada compara manifesto-atual ↔ disco e patcha"; **rollback** vira "iterar manifesto reverso e apagar"; **drift** vira "manifesto e fixture têm que casar — provar isso é nova camada".
  - Se (b) snapshot: **idempotência** vira "snapshot pré ≅ snapshot pós-pós"; **rollback** vira "apagar diff entre snapshot pré e pós"; **drift** orthogonal — snapshot ignora a forma da fixture.
  - Se (c) fixture-as-contract: **drift** **é** a violação do contrato (decide a si mesmo); **idempotência** e **rollback** ainda não-resolvidos (a fixture diz "o que" mas não "como reagir").
- #7 sozinha pode ser resolvida sem #6 ("cravar que o generator só roda uma vez; é o materialize que garante isso"), mas essa resposta empurra a complexidade para o materialize, que precisa de #6 para saber **como** garantir que rodou só uma vez.
- #8 sem #6 = "limpe à mão" — possível como decisão de design, mas então o `materialize` em workspace real (não-mktemp) é frágil por design.

**Decisão-raiz do cluster:** #6.

### Cluster IV — "Validação de input no generator" (independente)

**Contém:** #10 (path traversal em `directory`).

**Acoplamento:** nenhum. `validateOptions` (`packages/sf-plugin/src/generators/webapp/webapp.ts:135-149`) e o `schema.json` (`packages/sf-plugin/src/generators/webapp/schema.json:18-22`) são onde a validação vive; a decisão é local. Independente de Cluster I, II, III.

### Cluster V — "Cadência de garantia longeva" (semi-independente)

**Contém:** #11 (versões RDS/peers no longo prazo), #12 (`eslint` composto contra código React real).

**Por que estão acopladas:**

- Ambas são "o smoke prova X num momento; nada prova X ao longo do tempo".
- Ambas podem ser resolvidas pelo mesmo mecanismo (mudar a cadência do `smoke-webapp.sh` — `tools/smoke-webapp.sh:36-318` — para nightly real, ou adicionar smoke separado com app real).
- A independência delas em relação ao Cluster III é parcial: se Cluster III escolher (a) manifesto, e o manifesto incluir versões pinadas, então #11 ganha um anti-corrosivo extra (manifesto auditável); mas #11 não exige isso.

### Pendências verdadeiramente independentes (resolvem-se sozinhas)

- **#5** (Forma A no agente) — edição local no agente.
- **#10** (path traversal) — edição local em `validateOptions`/`schema.json`.
- **#4 apenas a escolha "criar §8.b" vs "reescrever ponteiro"** — a escolha é independente; o conteúdo (se "criar") depende de #1+#2.

---

## 2) Mapa de alavancagem

Ordem de alavancagem (decisão → o que ela destrava):

| #       | Decisão                                          | Alavancagem (o que ela destrava)                                                                                                      | Razão ancorada                                                                                                                                                                                                                     |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#6**  | Fonte de verdade do `materialize`                | Recontextualiza #7, #8, #9 (Cluster III inteiro); influencia #11 indiretamente                                                        | `generator.md:441-453` (§6.d) cataloga que `tree.listChanges()` é cego à delegação. **Nada** no `materialize` pode operar sem responder #6 primeiro. `context.md:27` define `materialize` como uma das três fases canônicas.       |
| **#4**  | Refs `§8.b` (criar seção vs reescrever ponteiro) | Se "criar", força #1+#2 a serem resolvidos; gera contexto para #3. Se "reescrever ponteiro", deixa #1+#2+#3 sem doc.                  | `generator.md:35` e `:608` apontam para vazio (`grep -n '8\.[ab]\|seção 8' docs/conventions/package.md` retorna só `:338:### 8.a)`).                                                                                               |
| **#3**  | Agente: branch vs `plugin-creator` separado      | Define padrão que o scout vai **emitir aos filhos** (`dev-toolkit-informs-scout.md:25-32, 90-100`). Decidir uma vez fixa o protótipo. | `package-creator.md:60-69` (forma B), `:228-231` (build inferido), `:255-257` (proíbe edit em `nx.json`). Os três pontos divergem da Forma C real.                                                                                 |
| **#1**  | CJS obrigatório vs convencional na Forma C       | Vira/não-vira asserção no smoke. Define se "modernizar" `"type": "module"` é regressão pega ou bug em produção do filho.              | `packages/sf-plugin/package.json` não tem `"type": "module"`; `packages/sf-plugin/dist/index.js:1` é `"use strict";` (CJS). Comparar com `packages/sf-eslint-config/package.json:4` que tem `"type": "module"`.                    |
| **#7**  | Idempotência                                     | Resolve um caso de uso central do `materialize` (re-materializar é natural).                                                          | `webapp.ts:179-214` não tem checagem de "diretório já existe"; `CNA_FLAGS` (`:39-52`) não inclui `--overwrite` ou equivalente.                                                                                                     |
| **#8**  | Rollback / falha parcial                         | Define se `materialize` em workspace real precisa ou não de cleanup.                                                                  | `webapp.ts:85-113` (`defaultRunCreateNextApp`) não tem `try`/`catch`; `webappGenerator` (`:179-214`) também não. Em falha mid-spawn, disco fica sujo, sem rastro no Tree.                                                          |
| **#9**  | Drift fixture↔CNA real                          | Resolve um defeito que afeta **todos os filhos simultaneamente**.                                                                     | `tools/smoke-webapp.sh:200-205` (post-generator asserts) e `:282-300` (controles) não fazem `diff -r` contra `__fixtures__/cna-16.2.7/`.                                                                                           |
| **#10** | Path traversal em `directory`                    | Fecha vetor de segurança/corrupção.                                                                                                   | `validateOptions` em `webapp.ts:135-149` não toca em `directory` além de existência; `schema.json:18-22` só pede `type: string`.                                                                                                   |
| **#2**  | Flags exatas do `@nx/plugin:plugin`              | Vira frase canônica do §8.b. Sem isso, §8.b tem um buraco onde §8.a tem comando literal.                                              | corpo do commit `73212d7` ancora o **generator** (`@nx/plugin:plugin`); flags não estão em lugar nenhum do repo.                                                                                                                   |
| **#5**  | Forma A no agente                                | Fecha célula DIVERGE-SILENCIOSO.                                                                                                      | `package-creator.md:60-69` usa `@nx/js:lib` (cria Forma B); `package.md:343-345` (marcador §8.a) nunca é consultado pelo agente.                                                                                                   |
| **#11** | Cadência de garantia das versões                 | Vira defeito de "primeiro filho a tocar descobre" em "CI da fábrica pega".                                                            | `tools/smoke-webapp.sh:36-318` roda manual; `generator.md:550-555` declara cadência "local antes de release + nightly + manual". Nightly não existe (`.github/workflows/` tem só `ci.yml`, `governance-drift.yml`, `release.yml`). |
| **#12** | `eslint` composto contra código real             | Valida atrito antecipado.                                                                                                             | `webapp-generator.md:255-258` antecipa o atrito; `webapp.spec.ts:407-411` só checa strings; `tools/smoke-webapp.sh:259-264` roda contra Hello-World.                                                                               |

**Decisão-raiz absoluta:** **#6**. Não porque é a mais urgente, mas porque (a) é pré-condição para 3 outras decisões críticas (#7, #8, #9), e (b) é a única que bloqueia a capacidade central do `materialize` — a próxima camada do produto (`context.md:27,144-145`).

**Decisão-raiz secundária:** **#4**. Cluster I inteiro deriva dela.

---

## 3) Ficha de cada decisão (ou cluster)

### Cluster III / #6 — fonte de verdade do `materialize` sobre "o que foi gerado"

**Pergunta:** quando o `materialize` invocar um generator delegante (CNA, Vite, etc.) que escreve no disco fora do alcance da Tree, **com base em que fonte de verdade** o `materialize` decide o que validar, re-aplicar, ou reverter?

**Opções reais (ancoradas em capacidade já-existente no repo):**

- **(a) Manifesto declarativo por generator** — cada generator exporta uma lista de "arquivos que eu gero". Ex.: nova chave em `generators.json` ou companion file. Já é viável: `webapp.ts:39-52` exporta `CNA_FLAGS`; mesmo padrão poderia exportar `EXPECTED_FILES`.
  - **Custo:** moderado. Cada generator precisa escrever e manter o manifesto; teste de divergência manifesto↔realidade vira camada nova; cresce com cada generator novo.
  - **Ganha:** materialize pode validar, idempotência (#7) vira diff manifesto↔disco, rollback (#8) vira iteração reversa do manifesto, drift (#9) vira teste de "manifesto bate com `__fixtures__/`".
  - **Perde:** mais um arquivo a sincronizar; convidando ao próprio drift (manifesto mente sobre o disco).
  - **Reversibilidade:** alta (manifesto é doc; pode ser refinado).

- **(b) Snapshot `find` pré/pós-generate** — materialize roda `find <target> -type f` antes e depois; armazena o diff como "o que esse generator gerou". Pattern não usado no repo hoje, mas **observável**, agnóstico ao generator.
  - **Custo:** baixo no generator (zero impacto); custo concentrado no materialize.
  - **Ganha:** rollback (#8) é o diff invertido — operação genérica; idempotência (#7) é "diff(pós-1, pós-2) == ∅"; nenhum manifesto novo a manter.
  - **Perde:** opaco (materialize não sabe **o quê** gerou semanticamente, só **que** gerou); pega arquivos transientes (`.DS_Store`, cache); não distingue o que o generator gerou do que o subprocess externo (CNA) gerou — mas isso pode não importar para materialize.
  - **Reversibilidade:** alta.

- **(c) Expor a fixture como contrato** — `__fixtures__/cna-16.2.7/` deixa de ser dado de teste interno e vira API pública do generator. Materialize lê a fixture para saber o shape esperado.
  - **Custo:** alto. Fixture hoje está excluída de 6 camadas (`generator.md:258-308` §5.c + `:338-344` §5.e) — toda essa proteção tem que ser reescrita ou parcialmente revertida. Tarball cresce.
  - **Ganha:** drift (#9) vira self-validating (contrato = fixture); semanticamente honesto (o materialize sabe o shape exato).
  - **Perde:** acoplamento forte entre versão pinada da ferramenta e contrato; bump de CNA passa a ser breaking change da API do `sf-plugin` (não só da fábrica internamente); fixture como API é difícil de versionar.
  - **Reversibilidade:** baixa (expor API é caminho de um sentido).

**O que destrava no scout ao decidir:** `context.md:27` define a 3ª fase `materialize` que ainda não foi escrita. Sem #6, qualquer tentativa de implementar materialize precisa improvisar uma resposta — risco de a decisão de fato ser tomada no commit que escrever materialize, sem revisão. `dev-toolkit-informs-scout.md:114` confirma que `sf-plugin` é o veículo: a escolha aqui define a forma do veículo.

**Severidade:** **CRÍTICA**. **Bloqueia** o scout — `materialize` não pode ser escrito coerentemente sem responder isso.

### Cluster III / #7 — idempotência

**Pergunta:** o generator é idempotente (2ª chamada = no-op ou patch idempotente) ou é "roda uma vez só, falha em re-execução"?

**Opções reais:**

- **(a) Tornar idempotente** — `webappGenerator` (`webapp.ts:179-214`) ganha checagem de "directory existe e contém output do generator anterior → pular CNA, só re-aplicar harness". Exige #6 (precisa saber o que esperar).
  - **Custo:** mudança em `webapp.ts` + 1 camada de teste. Acopla a #6 (precisa de manifesto/snapshot/fixture para detectar "output anterior").
  - **Ganha:** materialize pode rerodar livre; alinhamento com `nx generate` semantics.
  - **Perde:** complexidade na composição (Tree ↔ disco); risco de patch parcial.

- **(b) Cravar "roda uma vez só"** — documentar que o generator não é idempotente; o `materialize` é responsável por garantir que cada generator roda só uma vez por target.
  - **Custo:** mínimo no generator; transfere a complexidade para o materialize.
  - **Ganha:** menos código no generator; contrato claro.
  - **Perde:** materialize fica mais complexo; re-materialize do filho exige limpeza prévia explícita.

- **(c) Falhar explicitamente em re-execução** — `webappGenerator` ganha `if (existsSync(target)) throw new Error('refusing to overwrite')`. Variante de (b) com fail-fast.
  - **Custo:** ~5 linhas de código + 1 teste.
  - **Ganha:** comportamento previsível e auditável.
  - **Perde:** materialize precisa de pré-passo de cleanup; humano pode ficar irritado em iteração de catálogo.

**O que destrava no scout:** materialize precisa saber se pode chamar o mesmo generator 2× ou se tem que orquestrar limpeza. Decisão muda a forma do materialize.

**Severidade:** **ALTA**. **Bloqueia** apenas materialize; o uso 1×-só (CI da fábrica, smoke) não é afetado.

### Cluster III / #8 — falha parcial / rollback

**Pergunta:** se `defaultRunCreateNextApp` (`webapp.ts:85-113`) falha no meio (CNA escreveu alguns arquivos e morreu), quem é responsável por limpar?

**Opções reais:**

- **(a) Generator implementa rollback** — `defaultRunCreateNextApp` ganha `try`/`catch` que `rm -rf target` se subprocess sair com código ≠ 0. Exige #6 indiretamente (sem manifesto/snapshot, o `rm -rf target` é seguro só se target era criado nesta execução — mas isso significa que precisa registrar o estado pré).
  - **Custo:** moderado. Lógica de "criei eu? então posso apagar" é não-trivial. Requer detectar pré-estado.
  - **Ganha:** materialize pode rerodar livremente; humano não precisa limpar à mão.
  - **Perde:** rollback errado apaga código do usuário (caso `target` pré-existia com conteúdo).

- **(b) Documentar "limpe à mão" como contrato** — explicitamente declarar que falha do generator deixa estado sujo; cleanup é responsabilidade do operador/materialize.
  - **Custo:** mínimo.
  - **Ganha:** contrato simples.
  - **Perde:** filho que falhar em materialize fica com diretório parcial; UX ruim em produção.

- **(c) Generator usa diretório temp + move-atomic-no-sucesso** — escreve em `${target}.tmp.${pid}`, e só renomeia para `target` no exit 0. Operação atômica do filesystem.
  - **Custo:** mudança não-trivial em `defaultRunCreateNextApp`; precisa garantir que CNA aceita target temp.
  - **Ganha:** atômico; sem rollback explícito; falha = `.tmp` órfão (limpeza trivial).
  - **Perde:** o nome do diretório que CNA "vê" passa a ser diferente do final — pode quebrar templates que hard-codam path; mexer com filesystem move tem edge cases (cross-device, etc.).

**O que destrava no scout:** `materialize` em workspace de filho não-descartável precisa saber se pode confiar no estado do disco pós-falha.

**Severidade:** **ALTA**. Bloqueia uso real do materialize; não bloqueia a fábrica internamente (mktemp do smoke esconde).

### Cluster III / #9 — drift fixture↔CNA real

**Pergunta:** como detectar quando `__fixtures__/cna-16.2.7/` diverge do output do `pnpm dlx create-next-app@16.2.7` real?

**Opções reais:**

- **(a) Smoke ganha passo de comparação** — `tools/smoke-webapp.sh` adiciona um `diff -r __fixtures__/cna-16.2.7/ <output CNA real>` pós-fase-6 (`:190-205`). Falha do diff = a fixture precisa ser regenerada.
  - **Custo:** ~10 linhas no smoke. Cadência: precisa rodar (atualmente smoke é manual — ver #11).
  - **Ganha:** drift pega em **uma** execução de smoke; nightly fecha o loop.
  - **Perde:** sai do escopo declarado de smoke ("juiz do `defaultRunCreateNextApp`" — `tools/smoke-webapp.sh:7-9`); expande o smoke.

- **(b) Aceitar o risco e documentar** — assumir que CNA pinado @16.2.7 é determinístico (`pnpm dlx` cache, npm pin); o risco residual de drift via fetch lazy do CNA é considerado aceitável.
  - **Custo:** mínimo.
  - **Ganha:** smoke simples.
  - **Perde:** quando CNA mexer no template via mecanismo não-versionado, fábrica não descobre até next.js quebrar.

- **(c) Eliminar a fixture; Tree-test usa o CNA real cacheado** — fixture deixa de existir; o Tree-test inicializa o CNA uma vez por suíte e reusa. Inverte a frente: a Tree-test fica lenta mas livre de drift.
  - **Custo:** alto. Re-arquitetura do Tree-test; viola o princípio em `generator.md:506-528` ("Camada 1 — Tree-test contra fixture (rápido, todo PR)... Custo: <1s. Cadência: pre-commit + todo PR").
  - **Ganha:** drift impossível.
  - **Perde:** Tree-test perde o atributo "rápido"; cadência precisa ser repensada; 6 camadas anti-fixture (§5.c+§5.e) ficam órfãs.

**O que destrava no scout:** filhos gerados em momentos diferentes podem ter estado divergente sem alarme. Drift na fábrica vira drift sistêmico nos filhos.

**Severidade:** **ALTA**. Não bloqueia, mas é defeito silencioso multiplicador.

### Cluster IV / #10 — path traversal em `directory`

**Pergunta:** `directory` deve ser validado contra path traversal (`../`, paths absolutos, etc.)?

**Opções reais:**

- **(a) Validar em `validateOptions`** — `webapp.ts:135-149` ganha checagem de que `directory` não contém `..` e não é absoluto. Schema (`schema.json:18-22`) ganha `pattern`.
  - **Custo:** ~5 linhas + 2-3 testes.
  - **Ganha:** vetor fechado; `materialize` pode confiar.
  - **Perde:** nenhum material.

- **(b) Validar em `materialize` upstream** — generator confia no input, materialize/scout valida antes de chamar.
  - **Custo:** depende do materialize (que ainda não existe).
  - **Ganha:** validação centralizada.
  - **Perde:** chamadas via API direta (não via materialize — caso documentado em `generator.md:74-83`) ficam sem proteção. Defesa em profundidade é o padrão da fábrica (`generator.md:74-105` argumenta exatamente isso para required+pattern).

**Dominante:** **(a)**, porque (b) viola explicitamente a regra de defesa em profundidade já estabelecida em `generator.md:74-105` ("Defesa em profundidade: `validateOptions(options)` exportada do generator function, que repete as regras críticas... Não é duplicação — é a **única** validação que protege chamadas que não passam pelo CLI."). Path traversal é uma "regra crítica" pela mesma definição.

**Severidade:** ALTA pela severidade do vetor (corrupção fora do workspace), BAIXA pela dificuldade do fix.

### Cluster I / #4 — refs `§8.b` quebradas

**Pergunta:** os ponteiros em `generator.md:35` e `:608` apontam para `package.md §8.b` que não existe. Criar a seção, reescrever o ponteiro, ou deletar?

**Opções reais:**

- **(a) Criar `§8.b`** — escreve a seção em `package.md` usando os 15 itens já-ancorados do relatório da Frente 1 + as respostas para #1, #2, #3.
  - **Custo:** alto. Depende de #1, #2 resolvidos. Decisão #3 (agente: branch vs separado) também relevante.
  - **Ganha:** Forma C ganha doc canônico; `dev-toolkit-informs-scout.md:37-42` ("fonte única referenciada por agente") volta a aplicar.
  - **Perde:** sem #1+#2 decididos, doc fica incompleto ou com `[a decidir]` cravado.
  - **Reversibilidade:** alta.

- **(b) Reescrever ponteiros para fonte existente** — `generator.md:35` e `:608` passam a apontar para commit `73212d7` + `generator.md §5.c` (camadas anti-fixture).
  - **Custo:** ~5 minutos.
  - **Ganha:** sem promessa quebrada; honesto.
  - **Perde:** commit message vira fonte canônica (frágil; refrata "docs descrevem o que existe" do `CLAUDE.md`). #1, #2, #3 continuam sem âncora.
  - **Reversibilidade:** alta.

- **(c) Deletar ponteiros** — assumir que Forma C não está documentada e parar de prometer.
  - **Custo:** ~2 minutos.
  - **Ganha:** zero promessas falsas.
  - **Perde:** leitor de `generator.md:35` (que justamente trata do primeiro uso do `@nx/plugin:generator` em plugin já-criado) fica sem indicação de onde foi documentado **como** o plugin nasce. Lacuna ostensiva.
  - **Reversibilidade:** alta.

**O que destrava no scout:** opção (a) é a única que destrava #3 (agente coerente com a forma); (b) e (c) deixam o agente de hoje permanentemente incoerente com a Forma C.

**Severidade:** ALTA para o scout via (a); BAIXA via (b)/(c) — mas (b)/(c) deixam o defeito original intacto.

### Cluster I / #1 — CJS obrigatório vs convencional na Forma C

**Pergunta:** o `sf-plugin/package.json` **não tem** `"type": "module"`, ao contrário de `sf-tsconfig:4` e `sf-eslint-config:4`. É invariante obrigatório (Nx CLI exige CJS) ou só convencional (`@nx/plugin:plugin` default + ninguém remediou)?

**Opções reais:**

- **(a) Investigar e cravar como invariante** — stracear/instrumentar o `pnpm exec nx g @fabio.caffarello/sf-plugin:marker` ou inspecionar o código do Nx CLI no `node_modules` para confirmar `require()` vs `import()`. Documentar como regra.
  - **Custo:** ~1h de investigação + 1 linha no doc.
  - **Ganha:** smoke pode ganhar asserção "`head -1 dist/index.js === '"use strict";'`"; regressão pega.
  - **Perde:** investigação fora do escopo read-only desta auditoria.

- **(b) Cravar como convencional sem investigar** — escrever "não adicionar `"type": "module"` ao manifesto da Forma C; o smoke vai pegar se alguém adicionar."
  - **Custo:** ~5 minutos.
  - **Ganha:** doc tem regra; smoke pega regressão.
  - **Perde:** se for de fato obrigatório, doc subexplicativa (humano vai questionar; perde 30 minutos).

- **(c) Não escrever a regra** — deixar como atrito conhecido só no corpo do commit fundador (`73212d7`).
  - **Custo:** zero hoje.
  - **Ganha:** zero.
  - **Perde:** próximo plugin nasce errado; smoke do filho pega tarde.

**O que destrava no scout:** plugin emitido aos filhos via materialize precisa ter a mesma forma; "modernização" silenciosa de `"type": "module"` por algum bot/PR é um cenário concreto. Decisão muda o que o smoke do filho pode asserir.

**Severidade:** MÉDIA. Não bloqueia; defeito-silencioso-com-tempo.

### Cluster I / #2 — flags exatas de `@nx/plugin:plugin`

**Pergunta:** qual é o comando canônico (com flags) para nascer um pacote Forma C?

**Opções reais:**

- **(a) Reconstruir empiricamente em branch descartável** — rodar `@nx/plugin:plugin` com flags candidatas e diffar footprint contra `73212d7`. Decisão **fora do escopo read-only**, mas relatável como próximo passo.
  - **Custo:** ~30 minutos.
  - **Ganha:** comando canônico testado.
  - **Perde:** muta estado (criar branch); pode descobrir que o footprint nunca é reproduzível exatamente (Nx pode mudar default entre patch versions).

- **(b) Documentar "use `@nx/plugin:plugin`, ajuste depois" sem flags** — listar os ajustes pós (que **estão** no `73212d7` corpo) sem o comando exato.
  - **Custo:** ~10 minutos.
  - **Ganha:** doc tem caminho.
  - **Perde:** próximo plugin pode ter sutil divergência de flags; lista de ajustes pós cresce inadvertidamente.

- **(c) Cristalizar via subagent `plugin-creator` que codifica o comando descoberto em (a)** — depende de #3.
  - **Custo:** maior (a + escrita do agente).
  - **Ganha:** resolve #2 + #3 simultaneamente.
  - **Perde:** decisões compostas; reversibilidade menor.

**O que destrava no scout:** sem (a) ou (b), o §8.b tem buraco onde §8.a tem comando literal (`package.md:20-29` é literal). Frase canônica do §8.b vira "consulte o commit `73212d7`" — frágil.

**Severidade:** MÉDIA. Doc fica feia; não bloqueia.

### Cluster I / #3 — agente: branch `<type>=plugin` vs `plugin-creator` separado

**Pergunta:** `package-creator.md` ganha branch para Forma C, ou nasce `.claude/agents/plugin-creator.md` separado, ou nenhum dos dois?

**Opções reais:**

- **(a) Branch dentro de `package-creator`** — coleta `<type>` (`:42-46`), bifurca em três caminhos.
  - **Custo:** agente cresce; uma fonte de verdade.
  - **Ganha:** o leitor familiarizado com `package-creator` herda tudo.
  - **Perde:** risco do playbook ficar denso; manter coerência das 3 branches é trabalho.

- **(b) Subagent separado `plugin-creator`** — agente novo focado na Forma C; `package-creator` ganha nota "se `<type>=plugin`, use `plugin-creator`".
  - **Custo:** mais arquivos.
  - **Ganha:** cada agente focado, curto, especializado.
  - **Perde:** humano precisa saber qual chamar.

- **(c) Não criar agente para Forma C** — `package-creator` ganha nota "Forma C: siga manualmente `package.md §8.b`".
  - **Custo:** mínimo.
  - **Ganha:** sobrecarrega o humano com a Forma C (rara).
  - **Perde:** padrão "subagent emitido aos filhos" (`dev-toolkit-informs-scout.md:25-32`) fica incoerente para a Forma C; protótipo do scout tem buraco.

**Trade-off central:** três invariantes implícitas competem — "uma chamada → um agente" (favorece a), "um agente, uma forma" (favorece b), "agente só para caminho frequente" (favorece c). **Nenhuma das três está escrita no repo.** Decidir o pattern primeiro permite escolher.

**O que destrava no scout:** `dev-toolkit-informs-scout.md:118-122` declara que `sf-plugin` emite o pattern aos filhos. O scout vai gerar subagents análogos para o filho — `route-creator`, `service-creator`, etc. (`:91-98`). A escolha aqui fixa o protótipo.

**Severidade:** ALTA pela frente do scout; MÉDIA pela frente da fábrica.

### Cluster II / #5 — Forma A no agente

**Pergunta:** o agente `package-creator` deve consultar o marcador do `§8.a` (`package.md:343-345`) antes de gerar?

**Opções reais:**

- **(a) Branch `<type>=config-json-puro` no agente** — análogo à opção (a) de #3.
- **(b) Nota explícita sem branch** — agente ganha "antes de gerar, ler `package.md:343-345` e decidir A vs B; se A, parar e reportar para humano fazer o stripping".
- **(c) Aceitar o defeito** — Forma A é rara; reverter um pacote criado como B é barato.

**Dominante:** **nenhuma** estritamente. (b) é a de menor custo/risco; (a) é mais completa; (c) preserva o status quo.

**O que destrava no scout:** célula DIVERGE-SILENCIOSO desaparece. Protótipo do agente fica honesto sobre as três formas.

**Severidade:** MÉDIA. Não bloqueia; é higiene.

### Cluster V / #11 — versões RDS/peers ao longo do tempo

**Pergunta:** a tupla (CNA 16.2.7, RDS ^1.24.0, lucide ^0.552, react-hook-form ^7.71, zod ^3, @hookform/resolvers ^3) instala+builda — quem prova isso amanhã?

**Opções reais:**

- **(a) Smoke vira nightly via GitHub Actions** — adicionar workflow `nightly.yml` que invoca `tools/smoke-webapp.sh`. Cadência declarada em `generator.md:550-555` ("nightly (cron) + workflow_dispatch") **não está implementada** (`.github/workflows/` só tem `ci.yml`, `governance-drift.yml`, `release.yml`).
  - **Custo:** moderado; precisa GitHub Actions runner com `pnpm dlx` (rede).
  - **Ganha:** "primeiro filho descobre" vira "fábrica descobre antes do filho".
  - **Perde:** custo de runtime/CI; falhas intermitentes (network) podem causar alarmes falsos.

- **(b) Pinar tudo (sem `^`)** — converter `^1.24.0` para `1.24.0` literal nos manifestos do harness. Mantém comportamento determinístico até bump explícito.
  - **Custo:** baixo.
  - **Ganha:** smoke prova num momento, e até o bump esse momento permanece.
  - **Perde:** bumps de segurança não chegam aos filhos automaticamente (perde a "natureza 1 — por versão de pacote" de `context.md:22-26`).

- **(c) Aceitar o risco** — manter `^` e cadência manual.
  - **Custo:** zero.
  - **Perde:** defeito-com-tempo.

**Severidade:** MÉDIA.

### Cluster V / #12 — `eslint` composto contra código React real

**Pergunta:** o atrito antecipado em `webapp-generator.md:255-258` (regras "Node-first" do `sf-eslint-config` em código React) — como validar?

**Opções reais:**

- **(a) Smoke ganha fase "app real"** — após `next build` (`tools/smoke-webapp.sh:254`), escrever um componente React não-Hello-World e rodar `eslint` contra ele.
- **(b) Fixture de "app real" no Tree-test** — adicionar testes que asseguram que regras específicas (`@nx/dependency-checks`, `@nx/nx-plugin-checks`) **não** disparam no template gerado.
- **(c) Aceitar e documentar atrito** — escrever em `webapp-generator.md` "se o filho tropeçar nessas regras, abra issue".

**Severidade:** MÉDIA. Atrito previsível, fix barato quando aparecer.

---

## 4) Sequência sugerida de decisão

Ordem que respeita acoplamento (raiz antes das dependentes) e separa "destrava scout" de "pode esperar".

### Fase 1 — Decisões independentes que podem rodar em paralelo (sem bloqueio mútuo)

1. **#10** (path traversal) — opção dominante (a). Não exige nada.
2. **#5** (Forma A no agente) — escolha entre (a)/(b)/(c). Não exige nada.
3. **#4 (apenas a escolha)** — decidir entre "criar §8.b" vs "reescrever ponteiro" vs "deletar". Se "criar", vai para Fase 2 a resolver #1+#2. Se "reescrever"/"deletar", encerra Cluster I aqui (com defeito reconhecido).

### Fase 2 — Cluster I (se #4 = "criar §8.b")

4. **#1** (CJS obrigatório vs convencional) — escolha entre (a) investigar / (b) cravar convencional / (c) não escrever.
5. **#2** (flags `@nx/plugin:plugin`) — escolha entre (a) reconstruir empiricamente / (b) listar só ajustes pós / (c) cristalizar via agente.
6. **#3** (agente: branch vs separado vs nenhum) — depende de #2(c) potencialmente; se (a) ou (b) em #2, #3 fica livre.

### Fase 3 — Cluster III (raiz arquitetural — destrava scout)

7. **#6** (fonte de verdade do `materialize`) — escolha entre (a) manifesto / (b) snapshot / (c) fixture-as-contract. **Esta é a decisão-raiz.**
8. Apenas após #6: **#7** (idempotência), **#8** (rollback), **#9** (drift) — cada uma reformulada à luz de #6. Podem ser tomadas em paralelo entre si, mas todas posteriores a #6.

### Fase 4 — Cluster V (cadência de garantia longeva)

9. **#11** (versões longevas) — pode ser decidido junto com (a) de #9 se nightly for criado.
10. **#12** (`eslint` em código real) — pode ser decidido junto com #11.

### Resumo da sequência

- **Decidir já**: #10, #5, #4-escolha (3 decisões; ~30 min de discussão).
- **Decidir antes do `materialize`**: #6, e em cascata #7, #8, #9 (Cluster III).
- **Decidir antes do próximo plugin nascer**: #1, #2, #3 (Cluster I; se #4 = "criar").
- **Pode esperar**: #11, #12 (Cluster V).

---

## 5) O que **não** é decisão (apenas execução)

Itens sem trade-off real; uma vez decidido fazer, a ação é mecânica.

| Item                                                                                         | O que fazer                                                                                                            | Evidência                                                                                |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Corrigir "33 asserções comportamentais" → 27 cases (Peça 3) **ou** → 43 cases (total webapp) | Editar `generator.md:509` para o número correto e cravar o que está contando (Peça 3 isolada vs total)                 | `webapp.spec.ts:245-472` tem 22 `it()` + 1 `it.each(5)` = 27 cases na Peça 3; total = 43 |
| Atualizar status do design doc                                                               | Editar `webapp-generator.md:8` ("Pronto para virar prompt de implementação") para indicar "implementado em PR #18+#19" | implementação está em main (commits `ca2887c`, `6982b2e`, `780e3f3`, `21e7bd8`)          |
| Atualizar context.md Roadmap                                                                 | Mover `sf-plugin` de "Próximos pacotes" para "Estado atual" em `context.md:126-130`                                    | `packages/sf-plugin/` existe com 2 generators (marker, webapp)                           |
| Adicionar `type:plugin` à descrição em `package.md:285`                                      | Já está listado mas sem ligação para Forma C; basta adicionar referência                                               | `package.md:285` lista a tag; `sf-plugin/package.json:63` usa                            |

Esses itens são **higiene de doc**, não decisões arquiteturais. Listados aqui para tirar ruído.

---

## Apêndice — proveniência das amarrações

| Afirmação                                              | Evidência                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Fluxo `init → scout → materialize` é o canônico        | `docs/architecture/context.md:27, 144-145`                                                        |
| Scout é determinístico, escolhe de catálogo fixo       | `docs/architecture/context.md:28-29`                                                              |
| `sf-plugin` materializa a primeira receita do catálogo | `docs/reflection/dev-toolkit-informs-scout.md:114`                                                |
| `.claude` da fábrica é protótipo emitido aos filhos    | `dev-toolkit-informs-scout.md:6-10, 90-100, 118-122`                                              |
| `tree.listChanges()` é cego à delegação                | `generator.md:441-453` (§6.d)                                                                     |
| §8.b referenciado mas inexistente                      | `generator.md:35, :608` apontam; `package.md:332-345` só tem §8.a                                 |
| Forma C nasce de `@nx/plugin:plugin`                   | corpo do commit `73212d7` ("Side-effects do `@nx/plugin:plugin` no workspace estão neste commit") |
| `sf-plugin/dist/index.js` é CJS                        | `head -1` retorna `"use strict";` (sessão anterior)                                               |
| `sf-plugin/package.json` não tem `"type": "module"`    | `grep -n '"type"' packages/sf-plugin/package.json` retorna só `"types"` e tag                     |
| `defaultRunCreateNextApp` sem rollback                 | `webapp.ts:85-113` — sem `try`/`catch`                                                            |
| `validateOptions` sem checagem de path                 | `webapp.ts:135-149` — só `name` required + pattern; `directory` só required                       |
| Smoke é manual, não nightly                            | `.github/workflows/` tem só `ci.yml`, `governance-drift.yml`, `release.yml`                       |
| Defesa em profundidade é padrão estabelecido           | `generator.md:74-105` (§2.c) argumenta exatamente                                                 |

---

**Este artefato é insumo para sessão de decisão do dono da fábrica. Ele não decide nada; estrutura o que precisa ser decidido, em que ordem, e com que dependências.**
