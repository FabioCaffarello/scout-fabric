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

### d) Templates EJS (`files/`) opcionais

O generator gera `files/src/index.ts.template` como exemplo. Se a peça
de scaffold não usa templates, **deletar `files/`**. Adicionar
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

### c) Cobertura mínima do schema

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

## 5) O que NÃO entra aqui

- **O quê** o generator faz — vive no doc de design correspondente em
  `docs/design/<generator>.md`.
- **Como** o pacote `sf-plugin` foi montado — vive em
  [`package.md`](./package.md) seção 8.b (variante "pacote com build
  via `@nx/js:tsc` + assets").
- **Estratégia de teste em smoke real** — vive no doc de design da
  feature (ex.: `webapp-generator.md` §10.2), porque é específica do
  generator. Esta convenção cobre apenas o que é genérico ao caminho
  Tree-testável.
