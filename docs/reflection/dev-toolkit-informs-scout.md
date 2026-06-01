# O `.claude` de dev informa o kit de scout

Reflexão registrada após construir o ferramental de desenvolvimento da
fábrica (subagent `package-creator` + skills `validate` /
`smoke-publish` / `governance`). Esses padrões valem como protótipo do
que a fábrica vai **emitir** para os projetos-filhos como parte do kit
de scout.

## Padrões que funcionaram

### 1. Skill fina, lógica no script

Cada skill em `.claude/skills/<name>/SKILL.md` tem corpo curto que
descreve **quando usar** e **qual script chama**. A lógica vive em
`tools/*.sh` ou `scripts/*.sh`. Mudar comportamento = mudar o script,
não a skill.

**Para os filhos:** cada projeto gerado nasce com skills que envolvem
seus comandos canônicos (rodar testes, gerar uma rota, fazer um
deploy de preview). O script é a fonte da verdade; a skill é o atalho.

### 2. Subagent com fronteiras explícitas

`.claude/agents/package-creator.md` lista o que **não faz** antes do
que faz: não publica, não comita, não abre PR, não mexe em pacotes
existentes, não atualiza documentação de arquitetura.

**Para os filhos:** subagents emitidos para o projeto-filho devem ter
o mesmo padrão. Um "route-creator" para um app não comita; um
"migration-creator" para um serviço não roda a migration. O operador
fica no controle das ações irreversíveis.

### 3. Fonte única de convenção referenciada por agente

`docs/conventions/package.md` é canônico. O agente abre como passo 0 e
declara: "se houver divergência entre o playbook abaixo e o doc, o doc
vence." Quando descobrimos pitfalls (TS6307, lockfile, peer deps
contratuais), atualizamos **o doc primeiro** — o agente referencia,
não duplica.

**Para os filhos:** o projeto-filho tem `docs/conventions/<thing>.md`
para cada artefato repetitivo (rota, lib, schema). O subagent
correspondente lê o doc no início. Atualização de convenção vira PR;
agente herda sem mudar.

### 4. Disciplina "parar na primeira falha"

Tanto no agent quanto nas skills, a regra é a mesma: se um target
falha, reportar literalmente e parar. Não silenciar com
`eslint-disable`, não rodar com `--skip-cache` para "passar". A falha
é o sinal.

**Para os filhos:** todo automation emitida vem com esse contrato.
Falhar é OK; falhar barulhento e quieto é a única forma errada.

### 5. Auto-aplicação (dogfooding) como aceite real

A fábrica usa o `sf-eslint-config` que ela publica (via stub fino na
raiz). O smoke test instala o `sf-tsconfig` num consumidor descartável
e verifica que ele **muda o tsc** do consumidor. A lint do
`sf-eslint-config` aplicou a própria regra `eqeqeq` no spec e pegou
um `!=` — ouriço de prova.

**Para os filhos:** o projeto-filho deve consumir o que publica
sempre que possível. O kit de scout aplica suas próprias convenções
no próprio repo. O ato de funcionar = a prova.

### 6. Triggers em linguagem natural, multi-idioma

Cada skill tem `description` com várias frases gatilho ("validar",
"rodar os checks", "verify local", "antes do PR"). O usuário não
precisa lembrar nome técnico — basta dizer o que quer.

**Para os filhos:** triggers em PT-BR + EN, casados ao vocabulário do
domínio do projeto-filho.

### 7. Sem `bypassPermissions` em escritas de config

O subagent **não** tem permissão automática para sobrescrever
configs. Cada edição em `nx.json`, `package.json`, `tsconfig.spec.json`
pede confirmação. Isso é fricção saudável quando a ação é
irreversível em termos de "alguém vai consumir esse commit".

**Para os filhos:** mesmo princípio. Subagents emitidos não bypassam
confirmação para arquivos de config.

## O que será emitido para projetos-filhos

Quando a camada de scout estiver pronta, o catálogo conterá receitas
que materializam `.claude/` em cada projeto gerado:

- **Skill `validate`** — adaptada ao stack do filho (mesma forma,
  comando diferente).
- **Subagent análogo ao `package-creator`** — varia por tipo de
  projeto: `route-creator` para um app web, `service-creator` para um
  backend, `migration-creator` para um pacote com schemas.
- **Skill análoga a `smoke-publish`** apenas para projetos que
  publicam. Para apps, vira `smoke-deploy` ou `smoke-preview`.
- **Skill `governance`** sempre — toda projeto-filho versionado em
  GitHub se beneficia da branch protection como código.

## O que NÃO emitir

- Convenções e subagents específicos desta fábrica (não fazem sentido
  fora). Ex.: `package-creator` aqui é específico para `sf-*`; o
  filho vai ter outro subagent.
- Workflows da fábrica (`release.yml` daqui é da fábrica; o filho
  precisa do seu próprio com seu ciclo).
- Memórias `.claude/projects/.../memory/` — específicas desta sessão
  de construção; o filho começa com memória vazia.

## Próximo passo do produto

O `sf-plugin` vai materializar a primeira receita do catálogo: um
generator do Nx que cria um projeto-filho com seu próprio `.claude/`
seguindo esses padrões.
