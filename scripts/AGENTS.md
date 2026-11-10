# Scripts

> **Estado:** instruções locais de execução e validação.

Comandos abaixo partem da raiz do repositório.

| Comando | Efeito |
|---|---|
| `./scripts/ci.sh scripts` | Sondas locais com CLI simulado; não usa a rede |
| `./scripts/keeper.sh --plan` | Lista alvos do registro, sem rede |
| `./scripts/new-level.sh ...` | Cria arquivos e modifica catálogo/crates |
| `./scripts/deploy.sh` | Build, upload, deploy, registro e bindings; escreve na rede |
| `./scripts/exploit.sh <id>` | Cria e resolve instância na rede |
| `./scripts/keeper.sh` | Envia transações para estender TTL |
| `node scripts/ui-check.cjs [--sign] [--level 10\|11\|12]` | Confere a UI dos níveis 10–12 no navegador; `--sign` executa o exploit com assinatura local |

- Use Bash e finais de linha LF. Preserve `set -euo pipefail` e falhas com código não-zero.
- `lib.sh` é compartilhado; conferir seus chamadores ao alterar interfaces.
- Preserve as sondas de registro inválido, hashes divergentes e escrita de registro malsucedida.
- Preserve `--optimize=false` no upload e a comparação do hash do WASM.
- `--fresh` cria núcleo novo e muda a referência de progresso. O registro é preparado em arquivo temporário; falhas preservam o registro anterior e deixam o parcial recuperável. `--force` troca o alvo e o validador de um caso; os estados de instâncias antigas não são reescritos.
- `levels.json` declara os pré-requisitos on-chain. O deploy os reaplica em cada nível registrado. `--open-progression` limpa a configuração e só aceita `NETWORK=testnet` com `RECORD` apontando para o `deployments.sandbox.json` desta árvore; use apenas na sandbox de E2E.
- Receitas de exploit são carregadas no shell do runner: não use `cd` nem `exit 0`. Use apenas a interface que o runner fornece.
- Ao alterar scripts, rode `bash -n` nos arquivos alterados e `./scripts/ci.sh scripts`. As sondas não provam que um exploit funciona na rede.
- `ui-check.cjs` é conferência manual de UI dos níveis 10–12; depende de Playwright/Chromium disponíveis e não roda no CI.
