# @fabio.caffarello/sf-plugin

Nx plugin que hospeda generators do `scout-fabric`.

## Instalação

```sh
pnpm add -D @fabio.caffarello/sf-plugin
```

O consumidor precisa ter `@nx/devkit` (peer) e `nx` instalados —
qualquer workspace Nx já tem.

## Generators

| Generator | O que faz                                                 |
| --------- | --------------------------------------------------------- |
| `marker`  | Cria um arquivo `<directory>/<name>.md`. Smoke do plugin. |

## Uso

```sh
pnpm exec nx g @fabio.caffarello/sf-plugin:marker --name=foo --directory=tmp
```

Gera `tmp/foo.md`.
