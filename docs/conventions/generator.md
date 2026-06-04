# Convenção — generator de produto dentro do `sf-plugin`

Referência viva para criar generators **reais** (não probes como o
`marker`) dentro do `sf-plugin`. Cresce com cada peça implementada.
Documento canônico do design vive em
[`../design/`](../design/) (ex.: `webapp-generator.md`); esta
convenção captura **o como**, não o **o quê**.

**Probe vs. produto:** o `marker` é probe de infraestrutura — prova
o caminho de scaffolding (schema → generator function → `generateFiles`

- EJS → Tree → spec). Generator de produto entrega valor real, sob
  contrato fixo (schema), com referência a um doc de design. **Esta
  convenção é para o segundo caso.**

---

## 1) Criar o generator

```sh
pnpm exec nx g @nx/plugin:generator packages/sf-plugin/src/generators/<name> \
  --name=<name> \
  --description="<one-line description>" \
  --unitTestRunner=vitest \
  --no-interactive
```

**Comportamento observado** (Peça 1 do `webapp`): quando rodado num
plugin já configurado, o `@nx/plugin:generator` deixa footprint
mínimo — só `generators.json` modificado (registro adicionado). Sem
side-effects em `eslint.config.mjs` raiz, `package.json` do pacote,
`nx.json`, etc.

Isso diverge do **primeiro** uso (que cria o plugin do zero, ver
[`package.md`](./package.md) seção 8.b), onde o generator injeta
side-effects estruturais. Para o N-ésimo generator dentro de um
plugin já vivo, espere quase nada.

---

## 2) Ajustes obrigatórios pós-generator

### a) `$schema` do generator (atrito do `@nx/plugin:generator`)

O generator injeta `$schema: "https://json-schema.org/schema"` no
`schema.json` que **retorna 404**. Trocar por:

```jsonc
"$schema": "http://json-schema.org/draft-07/schema#"
```

(canonical Draft 7). O IDE marca diagnostic claro se ficar errado.

### b) Schema honesto: required + pattern, `additionalProperties: false`

Substituir o `schema.json` stub do generator (que tem só `name`) pelo
schema real definido no doc de design. Para o `webapp`:

```jsonc
{
  "properties": {
    "name": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
    "directory": { "type": "string" },
  },
  "required": ["name", "directory"],
  "additionalProperties": false,
}
```

`additionalProperties: false` evita que o consumidor passe campos não
declarados silenciosamente — mantém o schema como contrato.

### c) Validação imperativa no generator function

O `schema.json` é consumido pelo **Nx CLI** no momento da invocação
(`nx g sf-plugin:<name> ...`). Mas chamadas via **API direta**
(testes Tree, integrações com outros generators) bypassam o CLI — o
generator function recebe `options` sem validação alguma.

**Defesa em profundidade:** `validateOptions(options)` exportada do
generator function, que repete as regras críticas (required +
pattern) em código TypeScript com `asserts options is Schema` para
narrowing. Não é duplicação — é a **única** validação que protege
chamadas que não passam pelo CLI.

Padrão:

```ts
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export function validateOptions(
  options: Partial<MyGeneratorSchema>,
): asserts options is MyGeneratorSchema {
  if (!options.name) throw new Error('sf-plugin:<name> — `name` is required');
  if (!options.directory) throw new Error('sf-plugin:<name> — `directory` is required');
  if (!NAME_PATTERN.test(options.name)) {
    throw new Error(`sf-plugin:<name> — \`name\` must match ${NAME_PATTERN} ...`);
  }
}

export async function myGenerator(tree: Tree, options: MyGeneratorSchema) {
  validateOptions(options);
  // ...
}
```

Mantenha o regex de pattern em **uma constante** no topo do arquivo,
e cite no comentário que o pattern espelha o do `schema.json`
(sincronização manual; vale o custo pela cobertura).

**Custo de sincronia — assumido conscientemente.** `validateOptions`
repete regras do `schema.json` em código TypeScript: o `schema.json` é
a fonte para o Nx CLI, e o código é a fonte para chamadas via API.
Duas fontes que podem divergir se alguém mudar uma e esquecer a outra.

Para schemas **simples** (poucos campos, ≤1 pattern por campo, como o
do `webapp`), o risco de divergência é baixo e a defesa em profundidade
vale o custo. Sincronização manual com um comentário no topo do regex
basta.

Para schemas **complexos** (vários patterns, validações condicionais,
enums grandes), considere **derivar** a validação imperativa do
`schema.json` (uma fonte única) — por exemplo via AJV consumindo o
próprio JSON. Não force agora; o gatilho é o primeiro schema que
incomode na manutenção.

A regra-mãe: as duas fontes precisam estar em sincronia. Se um campo é
adicionado ou alterado no `schema.json`, `validateOptions` muda junto
no mesmo commit — ou a estratégia migra para derivação. O `lint` do
`@nx/nx-plugin-checks` não pega divergência; só o spec (asserções
separadas por regra, ver §3.c) pega.

### d) Templates EJS (`files/`) só quando a peça correspondente chegar

O generator gera `files/src/index.ts.template` como exemplo. Se a
peça atual ainda não usa templates (ex.: peça de scaffold/schema
sem comportamento de geração), **deletar `files/`**. Adicionar
depois, quando a peça que usa templates chegar.

---

## 3) Testes — defesa em profundidade

### a) Spec deve passar pelo `tsc --build`, não só pelo `vitest`

Vitest usa transformer permissivo (esbuild) que **mascara erros de
tipo** no spec. Caso real (Peça 1 do `webapp`): `@ts-expect-error`
dentro de objeto literal escapou do `vitest` mas o `tsc --build`
(cache-frio) pegou com TS2578 + TS2345.

**Sempre validar com `pnpm exec nx reset && pnpm exec nx run sf-plugin:typecheck`
antes de declarar a peça pronta.** O `tsc --build` cold typecheck
inclui o spec (via `tsconfig.spec.json#references`) e pega o que o
vitest deixaria passar.

Esse é o mesmo princípio da seção 3.a do `package.md` (TS6307
pitfall), aplicado a outro caso: **specs também são typecheckados;
o cache do vitest mente quando o spec tem erro de tipo.**

### b) `@ts-expect-error` no lugar certo

```ts
// ❌ Errado — TS2578 (directive unused) + erro real escapa
await expect(
  generator(tree, {
    // @ts-expect-error
    directory: 'apps/x',
  }),
).rejects.toThrow();

// ✅ Certo — comentário imediatamente antes da chamada que falha
// @ts-expect-error: missing required `name`
await expect(generator(tree, { directory: 'apps/x' })).rejects.toThrow();
```

### c) Test helpers não podem vazar no tarball

Generators que precisam de helpers de teste não-triviais (ex.: carregar
uma fixture na Tree) caem numa pegadinha: o helper, se vive dentro de
`src/` (qualquer subdiretório, inclusive `__internal__/`,
`_testing/`), é compilado pelo `@nx/js:tsc` e **publicado no tarball**
do pacote. Consumidores externos recebem código de scaffolding de
teste que para eles é lixo.

Três soluções, em ordem de simplicidade:

**1. Inline no spec** (recomendado para helpers de até ~30 linhas):
manter a função no próprio `*.spec.ts`, fora de import externo.
Custo: duplicação se o segundo generator precisar do mesmo helper —
mas até lá, é mais barato.

**2. Mover para `tests/`** (fora do `src/`): o `vitest.config.mts`
já inclui `{src,tests}/**/*.spec.ts`, e o `tsconfig.lib.json` tem
`rootDir: "src"`, então `tests/` fica fora do build. O custo é o
caminho relativo feio (`../../../../tests/helper`).

**3. Promover para subpath exportado** (`@fabio.caffarello/sf-plugin/testing`):
caminho que `@nx/devkit/testing` segue. Justificável quando há mais
de um generator precisando, **e** o helper é estável o suficiente
para virar contrato. Não force antes disso — é nova superfície
pública a manter.

**Caso real (Peça 3 do `webapp`):** o helper `applyFixture` foi
extraído para `src/generators/webapp/__internal__/apply-fixture.ts`
e o `pnpm pack --dry-run` revelou `dist/.../apply-fixture.{js,d.ts}`
no tarball. Inlinado de volta no spec — primeiro caso, surface
mínima.

### d) Cobertura mínima do schema

Para cada generator de produto, o spec deve provar **separadamente**:

- Aceitação de input válido.
- Rejeição por `required` (cada campo obrigatório, um teste).
- Rejeição por `pattern` (se o campo tem pattern, um teste por
  violação representativa).
- Rejeição pelo `webappGenerator` (entry point), provando que ele
  delega a `validateOptions` — não só a função pura.

Se o spec só testa `required`, o pattern poderia estar quebrado sem
ninguém perceber. São regras distintas; cada uma merece uma asserção.

---

## 4) Listar para confirmar registro

```sh
pnpm exec nx list @fabio.caffarello/sf-plugin
```

Deve listar o generator novo ao lado dos existentes. Se não aparecer,
revisar `generators.json` (factory + schema paths apontam para
`./dist/generators/<name>/...`).

---

## 5) Fixtures como dado de teste

Generators que delegam a ferramentas externas (CNA, etc.) testam o
harness contra a **saída real congelada** dessa ferramenta — não
contra mocks inventados. A fixture vive em
`packages/sf-plugin/src/generators/<name>/__fixtures__/<tool>-<version>/`.

### a) Versão no nome do diretório

O sufixo de versão (ex.: `cna-16.2.7/`) é obrigatório. Quando bumpar
a versão da ferramenta delegada, a nova fixture coexiste com a antiga
sem sobrescrever — e o nome diz qual versão capturou.

### b) Captura sob o contrato exato

A fixture é a saída da ferramenta delegada **com as flags exatas do
contrato** (ver doc de design da feature). Capturar com flags
diferentes mente sobre o input do harness. Em particular, capturar
**sem `--skip-install` equivalente** enche a fixture de `node_modules/`
inúteis (~MB de bytes vs ~KB do contrato).

### c) Excluir das ferramentas do workspace — cinco camadas

A fixture é dado, não código. Cinco configurações precisam refletir
isso, e cada uma protege contra um tipo de vazamento distinto:

**1. `tsconfig.lib.json#exclude`** — adicionar `"src/**/__fixtures__/**"`.
Sem isso, `tsc --build` tenta typecheckar `.ts`/`.d.ts` da fixture
contra deps que o pacote não tem (`next`, etc.) e quebra com TS2307.

**2. `package.json#nx.targets.build.options.assets`** — adicionar
`"ignore": ["**/__fixtures__/**", "**/__fixtures__/**/.*"]` em cada
asset. Sem isso, o `@nx/js:tsc` copia arquivos da fixture para
`dist/`. **Atrito conhecido**: o `ignore` do `@nx/js:tsc` é
inconsistente com dotfiles — o pattern principal (`**/!(*.ts)`)
matcha dotfiles, mas o `ignore: ["**/__fixtures__/**"]` sozinho
**não** os ignora. O pattern extra `**/__fixtures__/**/.*` cobre o
gap. (Caso real: `.gitignore` da fixture do `webapp` vazou para o
dist sem esse pattern.)

**3. `.nxignore`** — adicionar `**/__fixtures__/` na raiz do workspace.
Sem isso, o Nx 22 **infere a fixture como um projeto** (detecta o
`package.json`/`tsconfig.json` dentro dela). `nx show projects` lista
um projeto a mais, `nx run-many` tenta rodar targets contra ele, e
quebra com erro sem contexto claro. Caso real: o `cna-run-2` da
fixture do `webapp` apareceu como 4º projeto até o `.nxignore` ser
criado.

**4. `.gitignore` raiz com `!**/**fixtures**/**`** — anula regras de
`.gitignore` aninhadas dentro da fixture. A fixture do `create-next-app`
**traz seu próprio `.gitignore`** (do template Next), e esse arquivo
lista `next-env.d.ts` e `*.tsbuildinfo` como ignorados — mas para a
fábrica esses arquivos **são o dado de teste que queremos versionar**.
Sem a regra de unignore no `.gitignore` raiz, o `git add` silenciosamente
pula esses arquivos e nem avisa. Caso real: `next-env.d.ts` da fixture
do `webapp` foi commitado localmente como "sucesso", o CI no runner
limpo falhou com `ENOENT` ao tentar ler o arquivo via `fs.readFileSync`
no spec.

**5. `.prettierignore` com `**/**fixtures**/**`** — Prettier por default
tenta formatar todo arquivo do workspace, e a fixture tem `.tsx`/`.css`
que Prettier considera "passível de melhoria". Reformatar a fixture é
**mentir sobre o que o upstream produziu** — o ponto inteiro de ter
fixture é provar contra fato. Sem essa entrada, `pnpm format:check`
falha mesmo com a fixture corretamente versionada. Caso real:
`next-env.d.ts` e `globals.css` da fixture do `webapp` causaram
`format:check` fail no CI até a entrada ser adicionada.

**Cinto de segurança no `.gitignore` do workspace** — adicionar
`**/.next/`. O CNA com `--skip-install` não gera `.next/`, mas se
alguém regenerar a fixture sem essa flag, o `.next/` (centenas de
MB) não vai para o repo.

### d) Validar — `pnpm pack` E inspeção do `dist/` direto

A prova definitiva tem **dois passos** que não se substituem:

**1. `pnpm --filter @fabio.caffarello/sf-plugin pack --dry-run`** — ler
a lista de "Tarball Contents". Deve conter apenas artefatos canônicos
(`dist/`, `README.md`, `package.json`, `generators.json`). Se aparecer
qualquer arquivo da fixture, alguma das três camadas acima falhou.

**2. `find packages/sf-plugin/dist -type f`** — inspeção direta da
saída do build. Necessário porque o `pnpm pack` segue a convenção npm
que **automaticamente exclui dotfiles** do tarball (`.gitignore`,
`.dotenv`, etc.), e isso **mascara vazamento de dotfiles no `dist/`**.
Caso real: o `.gitignore` da fixture vazou para o `dist/` com o
`ignore` do `@nx/js:tsc` sem o pattern extra para dotfiles
(`**/__fixtures__/**/.*`), mas o `pnpm pack --dry-run` listou o
tarball como limpo. **`pnpm pack` sozinho é falso-verde para dotfiles.**

Em conjunto: o `pnpm pack` valida o que o consumidor recebe; o
`find dist/` valida o estado do build no disco. Os dois precisam
estar limpos para a fixture estar honestamente excluída.

Este é o terceiro caso do padrão recorrente da fábrica: há uma camada
onde o caminho rápido de validação esconde um problema que só a
verificação completa expõe (cf. §3.a TS6307 do package.md, §3.a desta
convenção sobre `nx reset && typecheck` vs vitest). O catálogo dessas
armadilhas é parte do que esta convenção existe para preservar.

### e) Eslint ignores do pacote

O `eslint.config.mjs` do pacote precisa ignorar `**/__fixtures__/**`
junto com `**/out-tsc`. Sem isso, o lint do pacote tenta linta os
arquivos da fixture contra as regras da fábrica (incompatíveis — o
Next gera código com convenções diferentes).

---

## 6) Generators que delegam a ferramentas externas

Generators de produto frequentemente **delegam o boilerplate a uma
ferramenta externa** (`create-next-app`, `npm create vite`,
`create-t3-app`, etc.) e aplicam um harness por cima. O `webapp` do
`sf-plugin` é o primeiro caso da fábrica; o padrão descrito aqui é o
que o **scout** vai reusar quando o `materialize` invocar generators
que tocam o mundo externo.

### a) Contrato em cinco itens

Generators que rodam processo externo devem expor:

1. **Versão pinada como constante pública exportada** (`CNA_VERSION = '16.2.7' as const`).
   Bumpar = mudança da fábrica. Spec faz snapshot que falha em drift.

2. **Argv da ferramenta como tuple readonly pública exportada**
   (`CNA_FLAGS = [...] as const`). Ordem importa e é parte do contrato.
   Spec faz snapshot do array completo (rede ampla) + asserções
   semânticas item-por-item nas flags cuja ausência causa um defeito
   conhecido (proteção contra `vitest -u` cego — ver §6.c).

3. **Interface `Deps` com a função que executa o subprocess** —
   `{ runCreateNextApp(target): Promise<void> }`. Testabilidade
   declarada na assinatura do generator, não escondida no spec.

4. **Default exportado para produção** (`defaultRunCreateNextApp`)
   — implementa o spawn real via `child_process.spawn` + `pnpm dlx`
   com a versão pinada e flags. **Esta função é a única não
   Tree-testável** do generator; sua prova vive no smoke real
   (§10.2 do doc de design da feature).

5. **Parâmetro `deps` opcional com default de produção** na
   assinatura: `webappGenerator(tree, options, deps = defaultDeps)`.
   Nx CLI chama sem deps (production); testes chamam com stub.

**O generator NUNCA chama `child_process.spawn` (ou equivalente)
direto.** Isso quebra a testabilidade declarada e oculta a dependência
externa do contrato. Se houver `child_process` no `*.ts` do generator
fora de `defaultRun<X>`, é bug de arquitetura.

### b) Por que injeção por parâmetro, não `vi.mock`

`vi.mock`/`jest.mock` funcionam, mas escondem a testabilidade no
framework de teste. A injeção por parâmetro:

- Torna a testabilidade **parte do contrato visível** na assinatura —
  qualquer um lendo a função vê o que é injetável sem ler o spec.
- Funciona fora do Vitest (futuro: testes de integração, composição
  com outros generators, harness genérico).
- É dependency injection clássica — pattern estável que sobrevive a
  mudanças de framework.

A diferença é princípio, não preferência: testabilidade declarada

> testabilidade truque-de-framework.

### c) Snapshot do argv + asserções semânticas — proteção em dupla camada

```ts
// Snapshot — rede ampla (pega adição, remoção, reordenação)
it('matches the §3 contract argv exactly', () => {
  expect(CNA_FLAGS).toEqual(['--ts', '--tailwind' /* ... */, , '--skip-install', '--disable-git']);
});

// Âncoras semânticas — protegem contra `vitest -u` cego
it('includes --skip-install — without it, pnpm install runs before the harness adds RDS deps', () => {
  expect(CNA_FLAGS).toContain('--skip-install');
});
```

O snapshot quebra em qualquer drift; quem atualiza cegamente (`vitest -u`)
não pensa no que mudou. As asserções semânticas adicionam por que
aquela flag importa — quem quiser remover precisa entender o defeito
que vai voltar. Não é redundância; é a explicação ancorada como teste.

**Regra prática:** uma asserção semântica por flag cuja ausência causa
um defeito observável (não cabe asserir cada flag — o snapshot já cobre
a forma; semânticas só para o que tem consequência conhecida).

### d) Costura Tree ↔ disco — característica da delegação

A ferramenta externa (CNA, etc.) escreve em **disco real** (no
`workspaceRoot/<options.directory>`). O harness opera na **Tree
virtual** do Nx. A composição funciona porque:

- `tree.read(path)` faz **fallback automático para o disco** quando a
  Tree não tem o arquivo registrado — pattern documentado do
  `@nx/devkit`.
- `tree.write(path, content)` registra na Tree (não toca disco).
- `tree.flush()` no fim do generator escreve **só as modificações da
  Tree** por cima do disco — não deleta arquivos não-tocados.

Sequência em produção:

1. `deps.runCreateNextApp(target)` — subprocess escreve ~20 arquivos
   em disco.
2. `generateFiles` registra sobrescritas + criação na Tree.
3. `updateJson(tree, "<dir>/package.json", ...)` — `tree.read` lê do
   disco (CNA escreveu lá), aplica callback, registra modificação na
   Tree.
4. Nx flush — modificações da Tree caem em cima do que o CNA deixou.

**Consequência importante:** os arquivos que o CNA escreve **não
aparecem em `tree.listChanges()`** — só as modificações do harness
aparecem. Para `nx generate --dry-run`, isso significa que o output
mostra só os 6 arquivos do harness, **não os ~20 do CNA**.

Para um generator que delega, isso é aceitável (ninguém roda dry-run
de um generator que invoca CNA real — o CNA rodaria mesmo em dry-run,
sem ganho). Mas é uma **quebra sutil do modelo mental do Nx** que
quem orquestra esses generators precisa saber:

- **Para o scout/`materialize`**: ao invocar generators que delegam,
  **não confiar em `tree.listChanges()`** para saber tudo que foi
  gerado. A delegação a disco é invisível à Tree. O `materialize`
  precisa de outra fonte de verdade (ex.: o doc de design lista os
  arquivos esperados, ou um smoke pós-geração verifica
  fisicamente).

Caso real: `webapp` Peça 4. O CNA produz 18 arquivos; o harness toca 6. `tree.listChanges()` reporta os 6, não os 18.

### e) Validação rodando no Nx — não testada no Tree

Quando o Nx CLI invoca o generator via `nx g sf-plugin:<name> ...`,
ele valida `options` contra o `schema.json` **antes** de chamar o
generator function. Mas como vimos em §2.c, chamadas via API direta
bypassam essa validação.

Para generators que delegam, isso vira ainda mais importante: se a
validação não rodasse antes do `deps.runCreateNextApp`, um input
inválido **dispararia o subprocess** (lento, com efeito em disco)
antes de descobrir o erro. **O spec deve provar explicitamente que
`validateOptions` roda antes de qualquer chamada a `deps`:**

```ts
it('throws when input misses a required field — runs BEFORE any subprocess', async () => {
  const runCreateNextApp = vi.fn(async () => {
    throw new Error('runCreateNextApp must not be called when validation fails');
  });
  await expect(
    // @ts-expect-error: testing the runtime guard
    webappGenerator(tree, { directory: 'apps/x' }, { runCreateNextApp }),
  ).rejects.toThrow(/`name` is required/);
  expect(runCreateNextApp).not.toHaveBeenCalled();
});
```

A asserção `runCreateNextApp.not.toHaveBeenCalled()` é a prova material
da ordem.

---

## 7) Estratégia de teste — Tree-test rápido + smoke real lento

Generators de produto provam-se em **duas camadas que não se substituem**.
Esta seção fecha o catálogo: o que cada camada cobre, o que cada uma
**não** cobre, e onde cada uma roda.

### a) Camada 1 — Tree-test contra fixture (rápido, todo PR)

Modelo do `marker` e do harness do `webapp` (33 asserções
comportamentais contra `__fixtures__/cna-16.2.7/`). Cobre:

- Schema validation (§3.c — required + pattern, asserções separadas).
- Ordem da composição (§6.a — `validateOptions` antes do subprocess,
  delegação antes do harness).
- Templates EJS aplicados (sobrescritas + criação).
- Edição cirúrgica de manifestos (`updateJson`).
- Files intocados byte-idênticos à fixture.
- Snapshot + asserções semânticas do argv da ferramenta delegada (§6.c).

**Não cobre**:

- O `defaultRun<X>` real (subprocess).
- O comportamento da ferramenta delegada (ex.: o `create-next-app`
  realmente baixou e gerou).
- O build/lint/run do output (o gerador produz arquivos válidos para
  o downstream).

Custo: <1s. Cadência: pre-commit + todo PR.

### b) Camada 2 — Smoke real ponta a ponta (lento, periódico)

Modelo do `tools/smoke-webapp.sh`. Roda em ambiente descartável,
exercita o `default<X>` real, e prova que o output **builda, linta,
roda**. Tem assertion comportamental sobre o produto final
(ex.: classes do RDS no HTML estático do `next build`) + controles
(ex.: boilerplate da ferramenta delegada está **ausente**, provando
que o harness sobrescreveu).

Cobre:

- A ferramenta delegada de fato baixa, executa, escreve em disco.
- O harness aplica sobre output real.
- O webapp gerado satisfaz `pnpm install` + `next build` + `eslint`.
- A integração do design system (ou equivalente) é runtime, não só
  declarada no manifest.
- A versão pinada (`CNA_VERSION = '16.2.7'`) é a que **de fato roda**
  — o `pnpm dlx` cache não promove silenciosamente.

**Não cobre**:

- As condições de borda do harness que a Tree-test enumera (asserção
  por asserção sobre o conteúdo dos templates).

Custo: ~1-2 min. Cadência: **local antes de release + nightly + manual
pre-release**. Não roda em todo PR (custo/valor desfavorável; raramente
falha por causa do PR).

### c) Padrão recorrente: o smoke real pega o que o Tree-test não vê

Lições do `webapp` Peça 5 — **dois defeitos descobertos só pelo smoke**,
ambos invisíveis ao Tree-test:

1. **Parent dir do `target` precisa existir antes do CNA.** O Tree-test
   mocka `runCreateNextApp` e nunca passa um path real a um subprocess
   real. O CNA reclama com mensagem genérica ("The application path is
   not writable") quando o pai não existe. Solução: `defaultRunCreateNextApp`
   faz `mkdir(dirname(target), { recursive: true })` antes do spawn.

2. **`page.tsx` com componente do design system precisa de `"use client"`.**
   O `<Button>` do RDS internamente usa React Context (via `cva` +
   providers). Em Next 16 + Turbopack, o prerender server-side da
   página falha com `(0, j.createContext) is not a function` se o
   componente RDS for evaluated num server tree. Solução: marcar
   `page.tsx` como client component no template do harness. Tree-test
   não cobre porque não roda `next build`.

Esses são o **5º e 6º casos do padrão "caminho rápido esconde"**
(antes: TS6307, `@ts-expect-error` no vitest, dotfiles no `pnpm pack`,
`.gitignore` aninhado + Prettier). A regra que emerge: **toda nova
ferramenta delegada provavelmente adiciona um caso novo**. O smoke
é onde se descobre.

### d) Quando bumpar a versão pinada da ferramenta delegada

Quando `CNA_VERSION` muda (ex.: `16.2.7` → `16.3.0`), TUDO acontece em
um único PR:

1. **Atualizar a constante** no `webapp.ts` (`CNA_VERSION = '16.3.0'`).
2. **Regenerar a fixture**: rodar o CNA nova versão com as 11 flags do
   contrato, capturar em `__fixtures__/cna-16.3.0/`, excluir a antiga
   (`cna-16.2.7/`).
3. **Atualizar o `applyFixture`** no spec para apontar para o novo
   diretório.
4. **Rodar `nx run sf-plugin:test`** — o snapshot dos `CNA_FLAGS` pode
   precisar atualizar (se a ferramenta mudou flags).
5. **Rodar `./tools/smoke-webapp.sh`** — prova de fato no nova versão.
6. **Atualizar `webapp-generator.md` §2** com data, versão e razão.

O snapshot dos flags é a rede ampla; o smoke é o juiz. A fixture é o
dado congelado; ela MUDA quando a versão muda.

---

## 8) O que NÃO entra aqui

- **O quê** o generator faz — vive no doc de design correspondente em
  `docs/design/<generator>.md`.
- **Como** o pacote `sf-plugin` foi montado — vive em
  [`package.md`](./package.md) seção 8.b (variante "pacote com build
  via `@nx/js:tsc` + assets").
- **Estratégia de teste em smoke real** — vive no doc de design da
  feature (ex.: `webapp-generator.md` §10.2), porque é específica do
  generator. Esta convenção cobre apenas o que é genérico ao caminho
  Tree-testável.
