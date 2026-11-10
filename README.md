# Breaker

> **Nome:** **Breaker** — decisão 77, substituindo a decisão 22. O nome antigo foi removido do
> código, da interface, dos pacotes e dos documentos atuais.
>
> ⚠️ **A disponibilidade externa de `Breaker` não foi verificada.** A verificação de 2026-09-22
> era para o nome antigo e não se aplica.

> **Estado:** **13 níveis no ar** na era jogável `CDUVH22U…`, com progressão on-chain de 0 a 12.
> A era sandbox `CDWHNWW6…` tem os mesmos casos sem pré-requisitos, para desenvolvimento e
> demonstração. Ambas são testnet.

Um jogo de captura-a-bandeira (CTF) para **Stellar/Soroban**: cada nível é um contrato
deliberadamente vulnerável que o jogador precisa explorar para avançar.

## O que é

- Um jogo de níveis progressivos sobre **vulnerabilidades reais de Soroban**
- Cada jogador recebe uma **instância própria** de cada nível, deployada on-chain
- A validação é **on-chain**: um contrato verifica se o objetivo foi cumprido
- A interação acontece no **console nativo do DevTools do navegador**
- **Qualquer pessoa pode escrever um nível** — os oficiais são curados, e os seus rodam no seu
  próprio jogo

## O que **não** é

- **Não é um CTF de EVM adaptado.** Reentrância é **impossível** em Soroban — o host rejeita
  o padrão A→B→A (CAP-0046-11). O repertório de níveis aqui é necessariamente outro.
- **Não é um curso.** É um jogo. O texto ensina o mínimo; a compreensão vem de explorar.
- **Não é uma ferramenta de auditoria.** Não substitui Scout, Sanctifier ou uma auditoria.
- **Não é mainnet.** O MVP roda em **testnet**.

> ### ⚠️ Este repositório não tem código de produção
>
> **Breaker** é um projeto da **zolvency**, e é **educacional**.
> Os contratos aqui são **quebrados de propósito** — cada nível é uma vulnerabilidade
> plantada, para ser explorada.

## A tese

> As vulnerabilidades que importam em Soroban são **diferentes** das do EVM, e ninguém está
> ensinando elas de forma prática.

`require_auth` ausente ou mal escopado, replay em conta customizada, upgrade não autorizado
de WASM, corrupção de estado parcial via `try_invoke_contract`, TTL e archival, overflow
deliberado — nada disso tem equivalente direto no mundo EVM, e nada disso tem onde ser
praticado.

## Pré-requisitos de ambiente

Instalado e verificado em **2026-09-22**. Tudo **user-local**, sem `sudo`:

| Requisito | Situação | Observação |
|---|---|---|
| Node **22 LTS** | ✅ **22.23.2** via `fnm` | `/usr/bin/node` (18.19.1, do `apt`) **intacto** |
| Rust + alvo `wasm32v1-none` | ✅ **1.98.1** via `rustup` | Rust **1.91+** — MSRV do `soroban-sdk` 28.0.0 |
| `stellar-cli` | ✅ **28.0.0** pinado | Necessário para build, upload, deploy e geração de bindings |
| Conta de testnet financiada | ✅ `dev` | Via Friendbot (10.000 XLM por conta) |

## Como rodar

```bash
./scripts/ci.sh all              # tudo o que o CI checa, do jeito que ele checa

cd contracts && ./build.sh && cargo test
cd frontend && npm ci && npm test
cd frontend && npm run dev                 # campanha jogável, em http://localhost:5173
cd frontend && VITE_DEPLOYMENT_PROFILE=sandbox npm run dev  # sandbox on-chain sem progressão

./scripts/deploy.sh              # sobe o que ainda não subiu (escreve em testnet)
./scripts/exploit.sh 1           # executa o exploit de um nível contra a rede
./scripts/keeper.sh --plan       # o que o keeper estenderia, sem tocar a rede
```

⚠️ **O build dos contratos é `./contracts/build.sh`** — que chama `stellar contract build`.
**Nunca `cargo` direto:** os dois produzem bytes diferentes para o mesmo fonte, e o hash no ledger
deixaria de bater com o que o jogador reconstrói.

⚠️ **Os comandos que escrevem em rede são portão** — leia [`AGENTS.md`](AGENTS.md) antes de rodar
`deploy.sh` ou `exploit.sh`.

## Estrutura do repositório

```
.
├── AGENTS.md            instruções para agentes de IA
├── levels.json          catálogo e pré-requisitos dos níveis
├── contracts/           núcleo, níveis, validadores e harness
├── frontend/            jogo e interface
└── scripts/             deploy, keeper e verificações locais
```

## Status do projeto

- [x] Pesquisa de viabilidade
- [x] Levantamento de prior art
- [x] Requisitos mínimos documentados
- [x] Decisões do MVP resolvidas — **70 decididas, nenhuma em aberto**
- [x] Ambiente preparado
- [x] Os **níveis da campanha** (ids 0 a 12) implementados e verdes localmente
- [x] A era nova do núcleo (decisão 38) — executada em 2026-09-28
- [x] O keeper de TTL (decisão 35) — rodado contra a testnet, com a janela medida
- [x] A home da Season 01 com as artes dos níveis da campanha, o Rewrite bloqueado e o Architect
- [x] O Breaker OS nos **níveis da campanha** — rail COMMS/EVIDENCE/TERMINAL com beats e evidências
- [x] O canon narrativo da Season 1 nos níveis da campanha — Mara Vale, Voss, `REFUSED`, andar 24
- [x] A sequência final narrada (Rewrite + The Architect) — rota `/final`, 2026-10-21
- [x] O **dossiê por nível** e a **história longa** pós-vitória — decisão 48, 2026-10-21
- [x] O **Breaker OS como dispositivo** — handheld com home, apps, `CASES` como app padrão,
      badges e gaveta no mobile — decisão 49, 2026-10-21
- [x] A **auditoria narrativa** e os ajustes de contação — home sem spoiler, cards de mistério,
      transição para `/final` e desfecho da Mara — decisão 50, 2026-10-21
- [x] A **entrega da narrativa longa** — 11 histórias com 6 cenas e 400–600 palavras, `lead` +
      `ThreadStrip`, três escolhas de tom com eco no epílogo e a contagem 10/11 — decisão 51,
      2026-10-21
- [x] A **entrada pela carteira Freighter** na testnet — decisões 65 e 66, 2026-10-22; o jogo
      exige uma carteira conectada e não mantém uma sessão local como prova de acesso
- [x] A **primeira impressão em movimento** — header transparente sobre a arte, fumaça, sweep do
      herói, cards com cortina/parallax, prévia do caso e intro do login — decisão 53, 2026-10-21
- [x] O **livro no carrossel** — os capítulos da novelização (`frontend/src/levels/book/`) em 6 páginas
      bilíngues cada, com escolha de tom no fim; o scroll percorre os slides e setas/pontos/teclado/arrasto são atalhos —
      decisão 54, 2026-10-21
- [x] ~~O spoiler do livro~~ — o portão interno foi removido; a sequência fica no modal de entrada
      — decisão 59, 2026-10-21
- [x] O **desfecho no nível seguinte** — “No caso anterior” abre o nível com o fim do capítulo
      anterior; a sequência será garantida no modal de entrada — decisão 56, 2026-10-21
- [x] A **home abre todos os cards** no carregamento, sem esperar o scroll — decisão 58, 2026-10-21
- [x] O **deck suave** — roda com auto-avanço de 450 ms, slides empilhados com parallax e régua em filmstrip —
      decisão 60, 2026-10-21
- [x] O **conteúdo do nível em parallax** — os blocos sobem e aparecem em cascata ao entrar na tela —
      decisão 63, 2026-10-22
- [x] A **cidade viva da home** — respiração, feixes, tráfego, fumaça, nuvens e pinos dos setores —
      decisão 61, 2026-10-21
- [x] Os **dossiês dos setores** — hover no pino desfoca a cidade e abre a lore do lugar —
      decisão 64, 2026-10-22
- [x] **“Casos, não níveis”** na UI, em PT e EN — decisão 62, 2026-10-21
- [x] O **livro em PT-BR** — falas humanas traduzidas; sistema, nomes próprios e o mote ficam em
      inglês — decisão 57, 2026-10-21
- [x] O deploy da campanha e o `exploit.sh` de **todos os níveis** — 2026-10-21
- [x] O keeper da campanha — **47 alvos**, todos a 30 dias
- [ ] Jogar os níveis **no navegador** — nenhum foi, até hoje
- [x] Os **contratos** de 11 (`Rewrite`) e 12 (`The Architect`) — implementados e presentes nos
      registros de deploy; a história é narrada na sequência final


## Ícones de terceiros

O BREAKER OS incorpora ícones da biblioteca [Phosphor](https://github.com/phosphor-icons/core),
sem instalar dependências. Fonte e licença verificadas em 2026-10-22.

```text
MIT License

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
