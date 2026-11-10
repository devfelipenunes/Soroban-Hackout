# AGENTS.md — instruções para agentes de IA

> **Estado:** requisitos em elaboração. Este arquivo descreve as regras do projeto para
> qualquer agente que venha a trabalhar nele. O repositório já contém contratos, frontend e
> scripts; os comandos de build e teste estão documentados abaixo.

## Antes de fazer qualquer coisa

1. Leia o `AGENTS.md` mais próximo dos arquivos que pretende alterar.
2. Confira `git status --short` para preservar alterações já existentes no workspace.

## Escopo: o que pode ser feito sem perguntar

**Pode, sem perguntar:**
- Ler qualquer arquivo
- Corrigir erro factual, link morto, ou inconsistência entre documentos
- Adicionar detalhe a um documento existente, desde que seja verificável

**Precisa perguntar antes:**
- **Criar arquivo novo**
- **Instalar qualquer dependência** (`npm install`, `cargo add`, `rustup target add`)
- **Mudar decisão registrada** em qualquer `AGENTS.md`
- **Resolver uma questão em aberto** — as em aberto estão lá porque uma pessoa precisa
  decidir, não porque ninguém pensou nelas
- `git commit`, `git push`, ou qualquer operação que publique algo
- Deploy em qualquer rede, mesmo testnet

**Nunca:**
- Inventar uma decisão que não foi tomada. Se um documento precisa de uma resposta que não
  existe, **escreva a pergunta**, não a resposta
- Commitar segredos, chaves, ou identidades (`stellar keys`), mesmo de testnet

## Convenções

### Idioma da documentação
**PT-BR.** O *jogo* é trilíngue (PT-BR/EN/ES via i18n); a *documentação interna* não. Não
traduza os docs.

### Documentação
- Todo arquivo abre com uma seção **Estado**
- Afirmações factuais devem ser verificáveis; não acrescente datas de verificação
- Números medidos e números estimados são marcados como tal, separadamente
- Link entre documentos com caminho relativo, sempre

### Código
- **Rust/Soroban:** `soroban-sdk` em **versão exata, na linha `28.x`** — nunca `>=`
  (**decisão 19**). O **piso de segurança** é o 25.1.1 (CVE-2026-26267); o 28.x é a **escolha**,
  por ser onde existe o `ExternalRef` — a classe que é a tese do projeto. O `stellar-cli`
  acompanha a mesma linha.
- **TS/React:** sem `any`; o `Client` gerado pelos bindings é a fonte de tipos
- Formatação: `cargo fmt` no Rust, Prettier no TS

## Regras do projeto

Estas cinco regras são **invariantes de segurança**, não preferências de estilo. Cada uma
existe porque a anterior cai se ela cair.

> **1. O núcleo não pode ter estado que o jogador consiga mudar.**
>
> O jogador é um adversário — e é isso que o jogo *quer* que ele seja. Se ele conseguir
> escrever em qualquer coisa que o núcleo — ou o validador — leia no momento de validar, a
> validação deixa de significar qualquer coisa.

> **2. A instância é descartável. O núcleo é sagrado.**
>
> O estado da instância **deve** poder ser completamente destruído pelo jogador — é
> literalmente o objetivo do jogo. Ela não faz parte da arquitetura e pode até ser
> destruída por completo. O núcleo, não. O validador também não: ele **não tem estado
> nenhum** — o que ele lê é a instância.

> **3. O jogador nunca interage com o validador diretamente.**
>
> A decisão 11 separou o que antes era uma peça só: o **núcleo** cria instâncias e guarda posse
> e progresso; o **validador**, um por nível, decide se o objetivo foi cumprido. O jogador fala
> com a **instância** e com o **núcleo** — criar a instância e submeter a solução são transações
> dele, e não há como ser diferente. O que ele **nunca** toca é o validador: se o validador
> virar superfície de ataque, as regras 1 e 2 caem junto.
>
> *Nota de redação (questão **G**, resolvida em 2026-09-22).* A regra dizia "a factory" quando
> só existia uma peça com esse nome, e por isso era **falsa na letra**: o jogador
> necessariamente chama o núcleo. O invariante não mudou — o substantivo ficou preciso.

> **4. Todo nível tem dois testes — e eles rodam contra o WASM deployado, não só contra
> `cargo test`.**
>
> Um teste afirma que o objetivo **não** está cumprido no início; o outro executa o exploit
> e afirma que passou a estar. Sem o primeiro, não dá para distinguir um nível solucionável
> de um que já nasce "resolvido" — e um nível que nasce resolvido passa em qualquer teste
> de exploit.
>
> O "contra o WASM deployado" não é preciosismo: `cargo test` executa o crate
> nativo, enquanto o jogo executa o WASM construído por `stellar contract build`.
> **Um teste que passa em `cargo test` não prova que o WASM é o que foi deployado.**
>
> O profile de release mantém `overflow-checks = true` de propósito, para que o
> harness e o deploy concordem sobre overflow.

> **5. Nenhum nível expõe caminho para trocar o próprio WASM.**
>
> `update_current_contract_wasm` **não tem autenticação embutida** — mas **só o próprio
> contrato consegue chamá-la**. Não existe host function que troque o executável de *outro*
> contrato. Então a defesa é a omissão, e ela basta: sem entrypoint de upgrade, a instância é
> **imutável na prática**.
>
> **Por que isto é invariante, e não estilo:** o upgrade **preserva o storage** — só o campo
> `executable` muda. Se o jogador trocar o código da instância, ele passa a escrever o estado
> que o validador lê. A decisão 11 fez a validação **ler estado** em vez de ouvir a instância;
> sem esta regra, aquele ganho se perde por outro caminho.
>
> Vale para caminhos **indiretos**: qualquer função pública que receba `BytesN<32>` e chegue
> em `update_current_contract_wasm`, e o registro de executable refs (`ExternalRef`,
> protocolo 28+), que deixa um contrato controlar o executável de outro.

## Fontes de verdade

Ordem de precedência quando duas fontes discordam:

1. **O código-fonte do contrato / o WASM deployado** — o que executa é a verdade
2. **A documentação oficial da SDF** (`developers.stellar.org`)
3. **O spec do contrato** (`spec.funcs()` / `spec.jsonSchema()`) — a interface real, não a
   que alguém lembra que era
4. **Este repositório** (`AGENTS.md`, `README.md`) — para decisões já tomadas aqui
5. **Blogs, Medium, respostas de LLM** — não são fonte. Se só existe aí, não está verificado

**Armadilha recorrente:** a documentação pública de TTL mostra valores de **mainnet**. No
testnet o mínimo é **7 dias**, não 120.

## Build e teste

```bash
# Contratos: o WASM primeiro, os testes depois.
cd contracts && ./build.sh && cargo test

# Frontend: tipos, suíte e build (incluem o guarda do catálogo de níveis).
cd frontend && npx tsc --noEmit && npm test && npm run build

# Scripts: sondas locais com CLI simulado; não acessa a rede.
./scripts/ci.sh scripts
```

⚠️ **`cargo build` sozinho não constrói contrato.** O `build.rs` do SDK exige
`stellar contract build`, e é o que o `contracts/build.sh` chama. Um
`cargo build -p breaker-level-NN-instance` falha com *"soroban-sdk requires stellar-cli
v25.2.0+"* — **isso não é defeito**, é a receita.

⚠️ **`cargo test` lê os WASMs do disco**, então `./build.sh` vem antes. Um teste que falha
depois de uma mudança no contrato costuma ser WASM velho, não teste errado.

**Os bindings TypeScript são gerados pelo `scripts/deploy.sh`**, e só os do núcleo. Não há
comando separado: eles são um passo do deploy, e o que está versionado em
`frontend/src/contracts/` é o resultado.

**O teste que guarda a estrutura do projeto** é `frontend/src/levels/manifest.test.ts`. Ele
confere que o `levels.json`, o disco, o `Cargo.toml` do workspace, os módulos de teste e o
conteúdo nos três idiomas concordam. Antes de acrescentar um nível, use
`scripts/new-level.sh` — o caminho é um comando.

## Onde está o quê

Use [`README.md`](README.md) como entrada para a estrutura do projeto e consulte o `AGENTS.md`
local antes de alterar cada subsistema.
