# Design — `sf-plugin:webapp` generator

Este documento fixa o desenho do **primeiro generator real** do `sf-plugin`:
um orquestrador que delega ao `create-next-app` e aplica um harness
mínimo para integrar o `@fabio.caffarello/react-design-system` (RDS).

**Status:** decisões cravadas em fato observado (não em hipótese). Pronto
para virar prompt de implementação.

Convenções deste doc:

- "Fixado" = cravado por investigação empírica; mudar exige novo doc.
- "Decisão de produto" = livre dentro do que a fábrica suporta; o autor
  do `spec.md` escolhe.
- "Atrito" = caso de uso real que não cobrimos hoje; vira frente futura
  quando aparecer.

---

## 1) Posicionamento

O `sf-plugin:webapp` é um **orquestrador**, não um scaffolder puro:

1. Delega o boilerplate Next ao `create-next-app` (versão fixa).
2. Aplica o **harness da fábrica** sobre a saída — sobrescreve os
   arquivos cuja forma é nossa, edita leve os que tocamos pontualmente,
   deixa intocado o que é domínio do Next.

A separação não é estilística. É consequência do princípio de
"investigar antes de cravar": o `create-next-app` é o autor canônico do
template Next 16; reimplementar isso aqui é trabalho duplicado e atalho
para divergir. Mas o RDS + as configs da fábrica são autoria nossa, e
o harness é onde isso vive.

---

## 2) Versão fixa do `create-next-app`

**Fixado:** `create-next-app@16.2.7` (exata, sem `^` ou `~`).

- Lançada **2026-06-01**. Latest stable da linha 16.x.
- Linha 16.x estabilizada esta semana — mesma data tem `15.5.19` (patch
  da linha anterior), sinal de manutenção viva do release process.
- Canaries `16.3.0-canary.*` existem; **não usar**.

**Por que exata, não `^`:** entre `15.x` e `16.x` mudaram flags
(`--turbopack` sumiu, `--biome`/`--rspack`/`--react-compiler`/`--agents-md`
apareceram) **e** o conteúdo do template (próximo item). Determinismo
do generator depende da pinagem exata. Bump de versão é mudança da
fábrica (PR + atualização da fixture de teste — ver §10.1), não do
scout.

---

## 3) Conjunto de flags (contrato do orquestrador)

**Fixado:**

```sh
pnpm dlx create-next-app@16.2.7 <project-dir> \
  --ts \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --no-react-compiler \
  --no-agents-md \
  --import-alias '@/*' \
  --use-pnpm \
  --skip-install \
  --disable-git
```

Rodou non-interactive em ~6s no sandbox em `/tmp` sem dispar prompt
algum. Cada flag justificada:

| Flag                   | Justificativa                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--ts`                 | Padrão da fábrica.                                                                                                                                                                                                             |
| `--tailwind`           | **Exigido pelo RDS** — `@tailwindcss/postcss` está em `dependencies` (não peer) do RDS. Não é decisão, é dependência declarada. Também necessário para o dev escrever Tailwind nas suas páginas (§9.4).                        |
| `--eslint`             | Alinha com a fábrica. Vamos compor `eslint-config-next` + `sf-eslint-config` (§7). `--biome` seria divergência sem caso real.                                                                                                  |
| `--app`                | App Router. Pages Router está em modo legado no Next 16.                                                                                                                                                                       |
| `--src-dir`            | Convenção (separa código de config no root).                                                                                                                                                                                   |
| `--no-react-compiler`  | Conservador. React Compiler é opt-in experimental; vira variável se um caso justificar.                                                                                                                                        |
| `--no-agents-md`       | O `--agents-md` (default em 16.2.7) gera `AGENTS.md` e `CLAUDE.md` com texto genérico do Next ("This is NOT the Next.js you know"). Não é o que o scout espera. Removemos no contrato; cada projeto adiciona depois se quiser. |
| `--import-alias '@/*'` | Alias padrão Next. Cravar explícito > confiar no default.                                                                                                                                                                      |
| `--use-pnpm`           | Padrão da fábrica.                                                                                                                                                                                                             |
| `--skip-install`       | **Chave do orquestrador.** O install acontece DEPOIS, quando o harness já editou `package.json` (RDS + peers + `sf-eslint-config`). Rodar `pnpm install` agora seria descartado em seguida.                                    |
| `--disable-git`        | O webapp gerado é standalone; quem inicializa git é o scout, não o `create-next-app`.                                                                                                                                          |

**Dimensões deixadas em default por serem off-default ou não-aplicáveis:**
`--rspack` (off), `--biome` (off — `--eslint` cravado), `--api` (off —
`--app` cravado), `--use-bun/yarn/npm` (off — `--use-pnpm` cravado),
`--example*` (off), `--empty` (off — queremos o template `app-tw` para
sobrescrever só o que importa).

---

## 4) Saída do `create-next-app` — inventário canônico

Árvore real gerada com o set acima (capturada em
`/tmp/scout-fabric-investigation/cna-run-2/` durante a investigação):

```text
.
├── .gitignore
├── README.md
├── eslint.config.mjs
├── next-env.d.ts
├── next.config.ts
├── package.json
├── pnpm-workspace.yaml
├── postcss.config.mjs
├── tsconfig.json
├── public/{file,globe,next,vercel,window}.svg
└── src/app/
    ├── favicon.ico
    ├── globals.css
    ├── layout.tsx
    └── page.tsx
```

Surpresas que valem registrar:

- **`pnpm-workspace.yaml`** é gerado pelo `create-next-app@16.2.7`. Não
  é arquivo "de monorepo" — só carrega `ignoredBuiltDependencies: [sharp, unrs-resolver]`
  (config pnpm 10+ para permitir postinstall scripts dos binários
  nativos do Next).
- **Não há `tailwind.config.ts`**. Tailwind v4 é CSS-first; toda config
  vive em `globals.css` via `@theme`.
- **`AGENTS.md`/`CLAUDE.md`** seriam gerados com `--agents-md`. Removidos
  via `--no-agents-md`.

---

## 5) Fronteira de posse — tabela canônica

A fábrica toca **6 arquivos** (sobrescreve 5, edita 1), cria **1 novo**
(`app/providers.tsx` — §9.2), e deixa **11+ intocados**.

### Sobrescrever (template próprio)

| Arquivo               | Por que tomar posse                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/layout.tsx`  | Importa CSS do RDS (§9.1), envolve `children` em `Providers` (§9.2), usa classes semânticas do RDS no `<body>` (§9.3). Forma do template Next muda entre versões — template próprio nos isola. |
| `src/app/page.tsx`    | Boilerplate Vercel-marketing (Image do `next.svg`, links UTM) sai. Entra Hello-World **usando `<Button variant="primary">` do RDS** — prova viva da integração.                                |
| `src/app/globals.css` | Mantém `@import "tailwindcss";`. Remove o bloco `@theme inline { ... }` que o Next gera (variáveis para Geist fonts) — o RDS provê seus próprios tokens via CSS bundle (§9.3).                 |
| `eslint.config.mjs`   | Compõe `eslint-config-next/core-web-vitals + /typescript` com `@fabio.caffarello/sf-eslint-config` (§7). Forma do template Next muda — sobrescrever é mais robusto que edit leve.              |
| `README.md`           | Substitui placeholder genérico do Next por instruções específicas do scout (link para o `spec.md`, comandos do projeto).                                                                       |

### Editar leve (cirúrgico)

| Arquivo        | Edição                                                                                                                                                                                                                                                          | Por que é robusta                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `package.json` | Adicionar em `dependencies`: `@fabio.caffarello/react-design-system` + peers do RDS (`lucide-react`, `react-hook-form`, `zod`, `@hookform/resolvers`). Adicionar em `devDependencies`: `@fabio.caffarello/sf-eslint-config`. Substituir `name` pelo do projeto. | Mexer em chaves específicas via JSON parse/write. Não depende da forma do resto do arquivo. |

### Criar novo

| Arquivo                 | Conteúdo                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/providers.tsx` | Client component (`"use client"`) que envolve `AppProvider` do RDS. Necessário porque `RootLayout` é server component e providers React precisam de client boundary. Detalhado em §9.2. |

### Intocado

| Arquivo                        | Por quê                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig.json`                | `sf-tsconfig` é Node-first e **incompatível** com Next. Ver §6.                                                                        |
| `next.config.ts`               | Vazio; o app evolui.                                                                                                                   |
| `next-env.d.ts`                | Comentário explícito do Next: "should not be edited".                                                                                  |
| `postcss.config.mjs`           | Setup Tailwind v4 — exatamente o que o RDS precisa.                                                                                    |
| `pnpm-workspace.yaml`          | Só carrega config pnpm (binários nativos). Webapp é standalone — sem colisão. Se o webapp um dia for parte de monorepo, vira variável. |
| `.gitignore`                   | `.gitignore` padrão do Next cobre o necessário (`.next/`, `node_modules`, `.env*`, etc.).                                              |
| `public/*.svg` + `favicon.ico` | Assets — o app substitui quando quiser. O generator não tem opinião.                                                                   |

---

## 6) `tsconfig.json` — por que NÃO estender `sf-tsconfig`

`sf-tsconfig/base.json` (atual):

```jsonc
{ "module": "nodenext", "moduleResolution": "nodenext",
  "lib": ["es2022"], "target": "es2022",
  "composite": true, ... }
```

`tsconfig.json` que o `create-next-app@16.2.7` gera:

```jsonc
{
  "module": "esnext",
  "moduleResolution": "bundler",
  "jsx": "react-jsx",
  "lib": ["dom", "dom.iterable", "esnext"],
  "noEmit": true,
  "plugins": [{ "name": "next" }],
  "paths": { "@/*": ["./src/*"] },
  "target": "ES2017",
}
```

Colisões:

- `module: nodenext` vs `esnext` — Next quebra em `nodenext`.
- `moduleResolution: nodenext` vs `bundler` — Next 16 usa subpath
  exports de forma incompatível com `nodenext`.
- `sf-tsconfig` não tem `jsx` — Next exige `react-jsx`.
- `lib: ["es2022"]` (sem DOM) — webapp não tipo-checa.
- `composite: true` vs `noEmit: true` — propósitos opostos.

**Decisão:** `tsconfig.json` é **intocado**. Tentar uniformizar TS
config entre webapp Next e fábrica Node-first é uniformidade falsa —
não é disciplina, é teimosia. Quebraria `next build`.

**Saída futura, se aparecer caso:** `@fabio.caffarello/sf-tsconfig/web.json`
dedicado a webapps (bundler + DOM + JSX, herdando apenas a strictness
da fábrica). Não existe hoje, e não está no escopo deste generator.

---

## 7) `eslint.config.mjs` — composição

O `create-next-app` gera:

```js
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([...nextVitals, ...nextTs, globalIgnores([...])]);
```

O harness sobrescreve para compor com a fábrica:

```js
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import sf from '@fabio.caffarello/sf-eslint-config';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...sf,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
```

A ordem importa: `sf` por último pode sobrescrever regras menos
estritas dos presets do Next. Validação empírica disso fica para a
fase de implementação — se causar atrito real, viramos a ordem ou
filtramos `sf` para o que faz sentido em webapps.

**Risco assumido:** `sf-eslint-config` foi escrito para libs
Node-first; algumas regras dele (`@nx/dependency-checks`,
`@nx/nx-plugin-checks`) podem não fazer sentido num webapp e
provavelmente são no-ops por falta de target. Se travarem, o
harness as remove pontualmente — ainda fase de implementação.

---

## 8) Schema da entrada `webapp` no catálogo

### Variáveis reais

| Variável    | Tipo   | Validação                                            |
| ----------- | ------ | ---------------------------------------------------- |
| `name`      | string | `/^[a-z][a-z0-9-]*$/` (kebab-case, começa com letra) |
| `directory` | string | path workspace-relative                              |

**Tudo o resto é invariante.** A lista enumerada em §3 (versão do
`create-next-app`, todas as 11 flags, todas as escolhas de §5 e §9)
é fixa da fábrica.

### Formato `spec.md` — Markdown com frontmatter YAML

```markdown
---
kind: webapp
name: hello-rds
directory: apps/hello-rds
---

# hello-rds

Prosa para humano: contexto, motivação, decisões específicas.
O frontmatter acima é o que o `materialize` lê.
```

### Mapeamento entrada → generator

```yaml
# catálogo (formato a definir, conceitual)
kind: webapp
generator: '@fabio.caffarello/sf-plugin:webapp'
schema:
  type: object
  required: [name, directory]
  properties:
    name: { type: string, pattern: '^[a-z][a-z0-9-]*$' }
    directory: { type: string }
  additionalProperties: false
```

**Indireção `kind → catálogo → generator`** isola o autor do `spec.md`
do nome interno do generator. Renomear `sf-plugin:webapp` no futuro
não invalida specs antigos. O catálogo é o único lugar onde o nome
real aparece.

### O que **não** entra no schema (resistir à tentação)

- ❌ `tailwind: boolean` — fixo `true` (RDS exige, §9).
- ❌ `eslint: 'eslint' | 'biome'` — fixo `eslint`.
- ❌ `bundler: 'turbopack' | 'rspack'` — fixo turbopack (default Next 16).
- ❌ `appRouter: boolean` — fixo `true`.
- ❌ `nextVersion: string` — fixo pela fábrica (mudança = bump do
  `sf-plugin`, com regeneração da fixture).
- ❌ `designSystem` — só `@fabio.caffarello/react-design-system`. Se
  aparecer um segundo, o generator se ramifica (`sf-plugin:webapp-rds`,
  `sf-plugin:webapp-<outro>`) ou ganha variável — decisão para depois.
- ❌ `metadata.title`, `description` — prosa do `spec.md`.

Cada `❌` vira `✅` quando aparecer um caso real, não antes.

---

## 9) Integração do RDS — fato observado, não hipótese

Investigação feita por `npm pack @fabio.caffarello/react-design-system@1.24.0`
e leitura dos `.d.ts` + `dist/react-design-system.css` + `README.md`
publicado em `/tmp/scout-fabric-investigation/rds-pack/`.

### 9.1) CSS export — sim, e o caminho é canônico

`package.json` do RDS:

```jsonc
"exports": {
  ".":            { "import": "./dist/index.js", ... },
  "./styles":     "./dist/react-design-system.css",
  "./styles.css": "./dist/react-design-system.css"
}
```

O bundle CSS tem ~100 KB e inclui:

- O Tailwind v4 inteiro compilado (cabeçalho
  `/*! tailwindcss v4.1.16 | MIT License */`).
- Todas as utility classes que o RDS usa (`flex`, `items-center`, etc.).
- Todos os tokens semânticos do RDS (`.bg-surface-canvas`, `.text-fg-primary`,
  etc. — confirmados via grep no bundle).
- Regras para `@media (prefers-color-scheme: dark)`.
- Selectors para `[data-theme=dark]`, `[data-variant=creative|minimal|tech]`.

**Como importar (caminho documentado pelo README do RDS, linha 19):**

```tsx
// src/app/layout.tsx (topo)
import '@fabio.caffarello/react-design-system/styles';
import './globals.css';
```

A ordem importa para CSS cascade: o `globals.css` (que carrega
`@import "tailwindcss";` para Tailwind do projeto) vem **depois** do
CSS do RDS — assim utility classes do projeto sobrescrevem se houver
colisão, e o dev tem previsibilidade.

**Decisão:** importar via `import` em `layout.tsx`, **não** via
`@import` no `globals.css`. Razões:

1. É o caminho documentado pelo README do RDS.
2. Next 16 + Turbopack tem quirks com `@import` de CSS resolvido em
   `node_modules` dentro de `globals.css`. `import` em server
   component é o caminho canônico.
3. Mais legível: a integração com RDS está visível no `layout.tsx`,
   não escondida no `globals.css`.

### 9.2) Providers — necessários mesmo no caso básico

`@fabio.caffarello/react-design-system` exporta vários providers
(`AppProvider`, `ThemeProvider`, `ConfigProvider`, `ToastProvider`,
`DialogProvider`). O canônico é o **composto**:

```tsx
// Hierarquia documentada no AppProvider.d.ts:
// AppProvider (Root)
//   ├── ThemeProvider
//   ├── ConfigProvider
//   └── ComponentProviders (opcional)
//       ├── ToastProvider
//       └── DialogProvider
<AppProvider>
  <App />
</AppProvider>
```

**Atrito documentado pelo próprio RDS:** todos os providers vivem em
`providers-bundle.ts` para criar uma fronteira de módulo única. O
header do arquivo (`providers/index.d.ts:8`):

> IMPORTANT: Do NOT import providers directly from individual files.
> Always import from this index or from providers-bundle.ts.

Razão: Turbopack code-splita providers em chunks separados se forem
importados de paths individuais, e a ordem de inicialização quebra. O
RDS resolve via re-export agregado. **Conseqüência para o harness:**
sempre importar de `@fabio.caffarello/react-design-system` (entry
único), nunca de subpaths.

**Por que envolver mesmo sem usar Toast/Dialog:** custo zero (não
atrapalha quando não há toasts/dialogs), e quando o dev adicionar
`<Toast>` ou `<Dialog>` mais tarde, já funciona sem reescrever o
layout. Max compatibility, decisão pragmática.

**Boundary client/server:** providers React são client components.
`RootLayout` no Next 16 App Router é server component por default.
Pattern padrão: criar `app/providers.tsx` como client component
(`"use client"`) que envolve `AppProvider`, e o `layout.tsx`
(server) importa o wrapper.

### 9.3) Tema CSS-driven — sem JS necessário no caso básico

O README do RDS (linha 34) declara:

> The DS follows the user's OS color scheme preference automatically
> via the `prefers-color-scheme` media query. A consumer in a
> dark-mode environment sees the dark variant of every token without
> any setup in the app.

E override programático via attribute ou class no `<html>`:

```html
<html data-theme="light">
  <!-- ou data-theme="dark" -->
  <html class="dark">
    <html data-variant="creative">
      <!-- creative | minimal | tech -->
    </html>
  </html>
</html>
```

O bundle CSS implementa esses selectors (confirmado por grep). O
`ThemeProvider` existe para **toggle programático**
(`useTheme().toggleTheme()`), não é necessário para o tema funcionar.

**Decisão do template canônico:** `<html lang="en">` sem `data-theme`
default — segue OS. Quem quiser fixar customiza depois.

### 9.4) Tailwind no projeto + Tailwind no bundle do RDS — coexistem

O bundle do RDS traz Tailwind v4 compilado **das classes que o RDS
usa**. Se o dev escrever `flex items-center justify-between` numa
página dele e essa combinação exata não está no bundle, ele precisa
do Tailwind do projeto para gerar o CSS dessas classes.

**Decisão:** `--tailwind` ON no `create-next-app` continua válido. O
`postcss.config.mjs` + `@import "tailwindcss";` no `globals.css`
configuram Tailwind v4 no projeto. Composição final:

- CSS do RDS (via `import` em `layout.tsx`) — classes que o RDS
  pré-compilou + tokens semânticos + variants de tema.
- Tailwind do projeto (via `globals.css`) — classes que o dev escreve
  no app.

Tailwind v4 usa CSS layers; sobreposição é gerenciada estruturalmente.
Sem conflito significativo na prática.

### 9.5) Template do `layout.tsx` — esqueleto canônico

Para referência da fase de implementação (não é o template final, é o
shape):

```tsx
// app/providers.tsx — novo arquivo, client component
//
// Existe separado do layout.tsx por uma razão estrutural, não estilística:
// providers React (Context-based) são client components, mas o RootLayout
// do App Router é server component por default. Server components não
// podem renderizar Context Providers diretamente — daí a fronteira.
//
// NÃO mover este AppProvider para dentro do layout.tsx "para simplificar".
// Mover quebra a fronteira client/server e o Next falha no build com
// "createContext only works in Client Components".
//
// Também: o RDS exige que providers venham SEMPRE do entry único
// (`@fabio.caffarello/react-design-system`), nunca de subpaths
// (`/providers/AppProvider`). Razão documentada no README do RDS:
// Turbopack code-splita providers importados de subpaths em chunks
// separados e a ordem de inicialização quebra em runtime.
'use client';
import { AppProvider } from '@fabio.caffarello/react-design-system';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}

// app/layout.tsx — sobrescrita
import '@fabio.caffarello/react-design-system/styles';
import './globals.css';

import type { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: '<%= name %>', // EJS interpola no generator
  description: '<%= name %>',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-surface-canvas text-fg-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Notas:

- Sem `next/font/google`. As Geist fonts do template Next saem; o RDS
  gerencia tipografia via seus tokens (`tokens/typography`).
- `bg-surface-canvas text-fg-primary` no `<body>` é requisito explícito
  do README do RDS (linha 30) para o surface seguir o tema ativo.
- `<html lang="en">` é o caso básico — i18n vira variável quando
  aparecer caso real.

### 9.6) Template do `page.tsx` — Hello-World com RDS

```tsx
import { Button } from "@fabio.caffarello/react-design-system";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-semibold">
          <%= name %>
        </h1>
        <p className="text-fg-secondary max-w-md">
          Webapp gerado por <code>@fabio.caffarello/sf-plugin:webapp</code>.
          O botão abaixo vem do <code>react-design-system</code>.
        </p>
        <Button variant="primary">Hello, RDS</Button>
      </div>
    </main>
  );
}
```

Esse template é prova viva: se o build do webapp falhar aqui, a
integração do RDS está quebrada e o generator não cumpriu sua razão de
existir.

---

## 10) Estratégia de teste — duas camadas

### 10.1) Camada 1 — Tree-test com fixture realista (rápido)

Modelo do `marker` do `sf-plugin`. Testa a parte **harness** do
generator (sobrescritas, edição de `package.json`, criação de
`providers.tsx`) sobre uma Tree virtual.

**Fixture:** captura uma vez a saída real de
`create-next-app@16.2.7 --ts --tailwind --eslint --app --src-dir ...`
e armazena como dados de teste (não código gerado dinamicamente).
Regenerar quando bumpar a versão fixada.

Exemplo (pseudo, fase de implementação detalha):

```ts
it('overwrites layout.tsx with RDS provider and styles', async () => {
  const tree = createTreeWithEmptyWorkspace();
  applyNextFixture(tree, 'apps/hello-rds'); // fixture do CNA

  await webappGenerator(tree, { name: 'hello-rds', directory: 'apps/hello-rds' });

  const layout = tree.read('apps/hello-rds/src/app/layout.tsx', 'utf-8') ?? '';
  expect(layout).toContain('@fabio.caffarello/react-design-system/styles');
  expect(layout).toContain('<Providers>');
  expect(layout).not.toContain('Geist_Mono'); // template Next foi descartado

  const pkg = JSON.parse(tree.read('apps/hello-rds/package.json', 'utf-8') ?? '{}');
  expect(pkg.dependencies['@fabio.caffarello/react-design-system']).toBeTruthy();
});
```

Custo: <1s. Roda em pre-commit + cada PR. Cobre **o harness inteiro**.

### 10.2) Camada 2 — Smoke real (lento, periódico)

Análogo direto do `tools/smoke-publish.sh` que prova o ciclo
publish→install→use das libs. Aqui o smoke prova o ciclo
generate→install→build do webapp:

1. Rodar o generator end-to-end num dir descartável.
2. `pnpm install` no projeto gerado completa sem erro.
3. `pnpm exec next build` passa.
4. `pnpm exec eslint .` passa.
5. **Asserção comportamental:** o output do `next build` contém
   referências ao RDS (e.g., classes `bg-surface-canvas` /
   `text-fg-primary` no HTML estático). Sem isso, "integração com
   RDS" foi placebo.

Custo empírico estimado: ~1-2 min/execução (CNA ~6s, pnpm install
~30-60s, next build ~20-40s).

### 10.3) Trade-off do mock e cadência recomendada

| Camada         | Onde roda   | Quando                                                                        |
| -------------- | ----------- | ----------------------------------------------------------------------------- |
| **Tree-test**  | local + CI  | pre-commit (lint-staged), PR, push em main                                    |
| **Smoke real** | CI dedicado | nightly (cron) + `workflow_dispatch` antes de release                         |
| **Smoke real** | local       | sempre que bumpar `create-next-app` ou mexer no harness do `sf-plugin:webapp` |

Smoke real **não** entra em todo PR. Razão: 1-2 min de smoke por PR é
caro para um teste que raramente falha por problema do PR
(geralmente é registry intermitente, rede, ou bump do CNA — todos
fora do escopo do PR). Nightly + manual pre-release é o equilíbrio.

**Por que dois smokes (`smoke-publish.sh` + futuro `smoke-webapp.sh`)
e não um só:** provam coisas opostas. `smoke-publish` é
**saída → consumidor** (a fábrica produz pacotes que instalam e
funcionam). `smoke-webapp` é **entrada → app** (a fábrica produz um
app que builda). Direções opostas, scripts separados.

---

## 11) Atritos assumidos (caso real futuro vira nova frente)

- **Webapp dentro de monorepo.** Hoje pressuposto: webapp gerado é
  repo standalone. Se aparecer caso de "gerar webapp como pacote
  Nx dentro do scout-fabric", o `pnpm-workspace.yaml` do CNA colide.
  Vira variável + tratamento no harness.
- **i18n.** `<html lang="en">` é fixo. Quando aparecer caso, vira
  variável do schema.
- **Custom fonts.** Template não importa Geist (`next/font/google`).
  Quando aparecer caso, vira variável ou pattern de extensão.
- **Variantes do RDS (`creative`/`minimal`/`tech`).** Hoje template
  não cravar `data-variant`. Quando aparecer caso, vira variável do
  schema.
- **Tema fixo (light/dark) vs OS preference.** Hoje segue OS. Quando
  aparecer caso, vira variável.
- **Segundo design system.** Hoje só RDS. Se aparecer, decisão de
  ramificar o generator vs adicionar variável.
- **`sf-tsconfig/web.json`** dedicado para webapps. Hoje fora de
  escopo. Quando o segundo webapp aparecer e a duplicação de tsconfig
  doer, viramos preset compartilhado.

---

## 12) Limites deste documento

Este doc fixa **o desenho do generator**. Não fixa:

- O formato exato do **catálogo** (apenas o shape conceitual da
  entrada `webapp`). O catálogo cresce quando o segundo generator
  real aparecer.
- A implementação do **`materialize`** (o consumidor do `spec.md`).
- A localização exata da **fixture** do CNA (decisão da fase de
  implementação — provavelmente `packages/sf-plugin/src/generators/webapp/__fixtures__/cna-16.2.7/`).
- O script exato de **`tools/smoke-webapp.sh`** — espelha
  `smoke-publish.sh`, mas a forma exata sai durante a implementação.

Prompts de implementação a partir daqui referenciam este doc por
seção (`§9.5 esqueleto do layout.tsx`, `§5 fronteira de posse`, etc.).
Mudanças no desenho exigem update deste doc antes da implementação,
não durante.
