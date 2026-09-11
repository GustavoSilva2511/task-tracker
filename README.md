# Solução desafio roadmap
https://roadmap.sh/projects/task-tracker

# Task Tracker

Um tracker de tarefas de linha de comando: `task-cli` registra o que você precisa fazer, o que está fazendo e o que concluiu, armazenando tudo em um arquivo JSON no diretório atual.

Escrito em TypeScript com **zero dependências de runtime**. Node 22.6+ remove os tipos TypeScript ao carregar, então `src/*.ts` é executado diretamente — não há etapa de build e nem bundler. Apenas módulos nativos do Node são usados: `node:fs/promises`, `node:path`, `node:crypto` e `node:test` para os testes. TypeScript é uma dependência de desenvolvimento usada apenas para verificação de tipos.

## Requisitos

- Node.js >= 22.6 (testado em 24.16)
- pnpm >= 10 (testado em 11.5.3) — `corepack enable pnpm` pega a versão pinhada do `packageManager` no `package.json`

## Instalação

```bash
pnpm install            # dependências de desenvolvimento apenas: typescript + @types/node
pnpm link --global      # opcional: coloca `task-cli` no PATH
```

Sem `pnpm link --global`, invoque-o diretamente:

```bash
node /path/to/task-tracker/bin/task-cli.mjs list
```

## Uso

```bash
task-cli adicionar "Comprar mantimentos"                    # Tarefa adicionada com sucesso (ID: 1)
task-cli atualizar 1 "Comprar mantimentos e cozinhar jantar"
task-cli excluir 1
task-cli marcar-andamento 1
task-cli marcar-concluído 1
task-cli marcar-pendente 1                            # volta uma tarefa para pendente
task-cli listar                                   # todas as tarefas
task-cli listar pendente
task-cli listar andamento
task-cli listar concluído
task-cli listar não-concluído                      # pendente + andamento
task-cli ajuda
```

`listar` imprime uma tabela alinhada:

```
ID  STATUS       CRIADO           ATUALIZADO           DESCRIÇÃO
--  -----------  ----------------  ----------------  -----------------------------
1   andamento    2026-09-01 19:55  2026-09-01 19:55  Comprar mantimentos e cozinhar jantar
2   concluído    2026-09-01 19:55  2026-09-01 19:55  Escrever o relatório

2 tarefas.
```

Os comandos saem `0` em caso de sucesso e `1` em qualquer erro, com a mensagem na stderr —
então o CLI se compõe bem em scripts.

## Armazenamento

As tarefas vivem em `tasks.json` no diretório atual, criado na primeira escrita e armazenado como JSON pretty-print. Defina `TASK_TRACKER_FILE` para apontar para um caminho diferente.

```json
[
  {
    "id": 1,
    "description": "Comprar mantimentos e cozinhar jantar",
    "status": "in-progress",
    "createdAt": "2026-09-01T22:55:25.345Z",
    "updatedAt": "2026-09-01T22:55:25.714Z"
  }
]
```

Status é um de `todo`, `in-progress` ou `done`. Os timestamps são ISO 8601;
`updatedAt` é atualizado sempre que uma tarefa é modificada.

Escritas vão para um arquivo temporário no mesmo diretório e são depois renomeadas, então uma execução interrompida nunca pode deixar um armazenamento meio escrito.

## Casos de borda tratados

- Arquivo `tasks.json` ausente, vazio ou corromido — mensagem clara, nunca um stack trace
- Entradas de tarefa malformadas — o erro nomeia a entrada e o campo problemático
- Comandos desconhecidos, contagens de argumentos erradas, IDs não numéricos ou desconhecidos
- Descrições em branco ou muito longas (>500 caracteres)
- IDs são `max + 1`, então eles permanecem únicos após exclusões
- Um comando falho deixa o armazenamento byte-por-byte inalterado
- `updatedAt` não é atualizado quando um `mark-*` é um no-op

## Desenvolvimento

```bash
pnpm test         # 22 testes via node:test
pnpm typecheck
```
