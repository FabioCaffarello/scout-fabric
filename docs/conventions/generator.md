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

## 6) O que NÃO entra aqui

- **O quê** o generator faz — vive no doc de design correspondente em
  `docs/design/<generator>.md`.
- **Como** o pacote `sf-plugin` foi montado — vive em
  [`package.md`](./package.md) seção 8.b (variante "pacote com build
  via `@nx/js:tsc` + assets").
- **Estratégia de teste em smoke real** — vive no doc de design da
  feature (ex.: `webapp-generator.md` §10.2), porque é específica do
  generator. Esta convenção cobre apenas o que é genérico ao caminho
  Tree-testável.
