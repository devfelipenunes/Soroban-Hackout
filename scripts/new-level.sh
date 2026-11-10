#!/usr/bin/env bash

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

command -v jq >/dev/null 2>&1 || { echo "✗ jq not found" >&2; exit 1; }

usage() {
    echo "usage: ./scripts/new-level.sh <id> <slug> \"<name pt-BR>\" \"<name en>\" [difficulty]" >&2
    echo "  e.g. ./scripts/new-level.sh 2 dust \"A poeira\" \"The dust\"" >&2
    exit 1
}

[ $# -ge 4 ] || usage

ID="$1"
SLUG="$2"
NAME_PT="$3"
NAME_EN="$4"
DIFFICULTY="${5:-1}"
AUTHOR="${AUTHOR:-zolvency}"

case "$ID" in
    ''|*[!0-9]*) echo "✗ <id> must be a number, got '$ID'" >&2; exit 1 ;;
esac

case "$SLUG" in
    ''|*[!a-z0-9]*|[!a-z]*)
        echo "✗ <slug> must match ^[a-z][a-z0-9]*\$ — one lowercase word, starting with a letter." >&2
        echo "  No hyphen: the Cargo package keeps it and the WASM name does not, so the two" >&2
        echo "  spellings would diverge. No capitals either — nothing lowercases the slug." >&2
        exit 1 ;;
esac

case "$DIFFICULTY" in
    ''|*[!0-9]*) echo "✗ <difficulty> must be a number, got '$DIFFICULTY'" >&2; exit 1 ;;
esac

if [ "$DIFFICULTY" -eq 0 ]; then
    echo "✗ difficulty 0 is the tutorial's, and only the tutorial's." >&2
    echo "  Zero is what makes the UI label the level 'Tutorial'. Use 1 or more." >&2
    exit 1
fi
if [ "$DIFFICULTY" -gt 5 ]; then
    echo "✗ difficulty $DIFFICULTY is above the scale's top (5)." >&2
    echo "  The UI clamps it, so it would silently show as 5 — see Difficulty.tsx." >&2
    exit 1
fi

NN="$(printf '%02d' "$ID")"
DIR="contracts/levels/${NN}-${SLUG}"
INSTANCE_CRATE="breaker-level-${NN}-${SLUG}"
VALIDATOR_CRATE="breaker-level-${NN}-validator"
TYPE_NAME="${SLUG^}"
TEST_FILE="contracts/tests/src/level_${NN}.rs"

if [ -e "$DIR" ]; then
    echo "✗ $DIR already exists — refusing to write into it" >&2; exit 1
fi
if [ -e "$TEST_FILE" ]; then
    echo "✗ $TEST_FILE already exists" >&2; exit 1
fi
if jq -e --argjson id "$ID" '.levels | any(.id == $id)' levels.json >/dev/null; then
    echo "✗ level $ID is already in levels.json" >&2; exit 1
fi
if jq -e --arg s "$SLUG" '.levels | any(.slug == $s)' levels.json >/dev/null; then
    echo "✗ the slug '$SLUG' is already used in levels.json" >&2; exit 1
fi

echo "creating level $ID ($SLUG) — $INSTANCE_CRATE + $VALIDATOR_CRATE"
echo


mkdir -p "$DIR/instance/src" "$DIR/validator/src"

cat > "$DIR/instance/Cargo.toml" <<EOF
[package]
name = "$INSTANCE_CRATE"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true
repository.workspace = true
description = "Nível $ID — $NAME_PT."

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
soroban-sdk.workspace = true

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
EOF

cat > "$DIR/validator/Cargo.toml" <<EOF
[package]
name = "$VALIDATOR_CRATE"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
license.workspace = true
repository.workspace = true
description = "Validador do nível $ID — ⚠️ esqueleto: hoje recusa sempre."

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
soroban-sdk.workspace = true

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
EOF

cat > "$DIR/instance/src/lib.rs" <<EOF
#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};


#[contracttype]
pub enum DataKey {
    Owner,
}


#[contract]
pub struct $TYPE_NAME;


#[contractimpl]
impl $TYPE_NAME {
    pub fn __constructor(env: Env, player: Address) {
        env.storage().instance().set(&DataKey::Owner, &player);
    }

    pub fn owner(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Owner).unwrap()
    }
}
EOF

cat > "$DIR/validator/src/lib.rs" <<EOF
#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env};


#[contract]
pub struct ${TYPE_NAME}Validator;


#[contractimpl]
impl ${TYPE_NAME}Validator {
    pub fn validate(_env: Env, _instance: Address, _player: Address) -> bool {
        false
    }
}
EOF


awk -v a="    \"levels/${NN}-${SLUG}/instance\"," \
    -v b="    \"levels/${NN}-${SLUG}/validator\"," '
    { lines[NR] = $0 }
    /^[[:space:]]*"levels\// { last = NR }
    END {
        for (i = 1; i <= NR; i++) {
            print lines[i]
            if (i == last) { print a; print b }
        }
    }' contracts/Cargo.toml > contracts/Cargo.toml.new
mv contracts/Cargo.toml.new contracts/Cargo.toml

awk -v m="mod level_${NN};" '
    { lines[NR] = $0 }
    /^mod level_/ { last = NR }
    END {
        for (i = 1; i <= NR; i++) {
            print lines[i]
            if (i == last) { print m }
        }
    }' contracts/tests/src/lib.rs > contracts/tests/src/lib.rs.new
mv contracts/tests/src/lib.rs.new contracts/tests/src/lib.rs

awk -v m="    \&crate::level_${NN}::SPEC," '{ if (inside && $0 == "];" ) print m; print; if ($0 ~ /^pub const ALL:/) inside=1; if (inside && $0 == "];" ) inside=0 }' contracts/tests/src/levels.rs > contracts/tests/src/levels.rs.new
mv contracts/tests/src/levels.rs.new contracts/tests/src/levels.rs

TMP="$(mktemp)"
jq --argjson id "$ID" --arg slug "$SLUG" --argjson difficulty "$DIFFICULTY" \
   --arg author "$AUTHOR" --arg pt "$NAME_PT" --arg en "$NAME_EN" \
   '.levels += [{
        id: $id,
        prerequisites: null,
        slug: $slug,
        difficulty: $difficulty,
        author: $author,
        revealCode: true,
        name: { "pt-BR": $pt, en: $en },
        summary: {
            "pt-BR": "Resumo por escrever.",
            en: "Summary to be written."
        }
    }]' levels.json > "$TMP"
mv "$TMP" levels.json


cat > "$TEST_FILE" <<EOF
use crate::harness::{contract_error, errors, LevelSpec, Scenario};

pub const SPEC: LevelSpec = LevelSpec {
    id: $ID,
    slug: "$SLUG",
    interface: &["__constructor", "owner", "player"],
};


#[test]
fn the_level_is_registered_and_a_fresh_instance_does_not_pass() {
    let c = Scenario::new();

    assert!(
        c.core_client().levels().contains(&SPEC.id),
        "the level must be in the core's index"
    );

    let instance = c.create_instance(&c.player, SPEC.id);
    assert_eq!(
        c.submit(&c.player, &instance),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "the placeholder validator must refuse an untouched instance"
    );
    assert!(!c.is_completed(&c.player, SPEC.id));
}
EOF


BRIEF_DIR="frontend/src/levels/briefings"
CONC_DIR="frontend/src/levels/conclusions"

write_brief() {
    cat > "$BRIEF_DIR/${NN}.$1.md" <<EOF
# $2


> ⚠️ **Enunciado por escrever.** Criado por \`scripts/new-level.sh\`.

$3


## O que fazer

O objetivo ainda não foi escrito.

Quando estiver, ele tem de ser alcançável **só com o console** — \`window.contract\`, o endereço
da sua instância, e mais nada. Se a solução exigir deployar um contrato, ela não cabe no modelo
de hoje (decisão 2), e isso é uma decisão em aberto, não um detalhe de implementação.

Repare que este arquivo não tem botão nenhum, e não é descuido: neste jogo o console **é** a
interface.
EOF
}

write_brief "pt-BR" "Nível $ID — $NAME_PT" \
    "Descreva aqui o cenário do ponto de vista de quem joga: o que o contrato faz, o que ele
promete, e o que deveria levantar suspeita em quem lê o código."

write_brief "en" "Level $ID — $NAME_EN" \
    "Describe the scenario from the player's point of view: what the contract does, what it
promises, and what should raise suspicion in whoever reads the code."

write_conclusion() {
    cat > "$CONC_DIR/${NN}.$1.md" <<EOF
# $2


> ⚠️ **Explicação por escrever.** Criado por \`scripts/new-level.sh\`.

$3

Este texto aparece **depois** de o nível ser resolvido, e é onde o desafio vira lição: qual era a
classe de falha, por que ela é fácil de não ver numa revisão, e como se defende dela.

Sem isto, o nível ensina que dá para quebrar o contrato — e não o que fazer para que o seu não
quebre.
EOF
}

write_conclusion "pt-BR" "Nível $ID — $NAME_PT: a explicação" \
    "Escreva aqui a classe de falha do nível e o motivo de ela passar despercebida."

write_conclusion "en" "Level $ID — $NAME_EN: the explanation" \
    "Write here the level's class of flaw and why it goes unnoticed."

NARR_DIR="frontend/src/levels/narrative"
mkdir -p "$NARR_DIR"

cat > "$NARR_DIR/${NN}.json" <<EOF
{
  "beats": [
    {
      "trigger": "start",
      "speaker": "mara",
      "text": {
        "pt-BR": "Caso $ID — o canal ainda está em silêncio.",
        "en": "Case $ID — the channel is still silent."
      }
    },
    {
      "trigger": "solved",
      "speaker": "system",
      "text": {
        "pt-BR": "CASE BREACHED.",
        "en": "CASE BREACHED."
      }
    }
  ],
  "evidence": [],
  "replies": [],
  "documents": [
    { "id": "${NN}-context", "title": { "pt-BR": "Contexto por escrever", "en": "Context to be written" }, "source": { "pt-BR": "Dossiê do caso", "en": "Case file" }, "body": [{ "pt-BR": "Escreva uma prova inicial sem revelar o exploit.", "en": "Write initial evidence without revealing the exploit." }], "reveal": "start" },
    { "id": "${NN}-record", "title": { "pt-BR": "Registro por escrever", "en": "Record to be written" }, "source": { "pt-BR": "Documento do caso", "en": "Case document" }, "body": [{ "pt-BR": "Preserve origem e limites da evidência.", "en": "Preserve evidence provenance and limits." }], "reveal": "start" },
    { "id": "${NN}-previous-record", "title": { "pt-BR": "Do caso anterior", "en": "From the previous case" }, "source": { "pt-BR": "Dossiê preservado", "en": "Preserved case file" }, "body": [{ "pt-BR": "Escreva a ligação com o caso anterior.", "en": "Write the link to the previous case." }], "reveal": "previous-solved" }
  ],
  "hints": [
    {
      "pt-BR": "Reformule o objetivo sem entregar a chamada.",
      "en": "Reframe the objective without giving away the call."
    },
    {
      "pt-BR": "Aponte o método ou o estado que o jogador deve inspecionar.",
      "en": "Point to the method or state the player should inspect."
    },
    {
      "pt-BR": "Nomeie a classe de falha, nunca a solução.",
      "en": "Name the flaw class, never the solution."
    }
  ]
}
EOF

CASE_DIR="frontend/src/levels/casefile"
STORY_DIR="frontend/src/levels/story"
BOOK_DIR="frontend/src/levels/book"
mkdir -p "$CASE_DIR" "$STORY_DIR" "$BOOK_DIR"

cat > "$CASE_DIR/${NN}.json" <<EOF
{
  "objective": {
    "pt-BR": "Objetivo por escrever.",
    "en": "Objective to be written."
  },
  "target": {
    "pt-BR": "Alvo por escrever.",
    "en": "Target to be written."
  },
  "owner": {
    "pt-BR": "Dono ou autoridade por escrever.",
    "en": "Owner or authority to be written."
  },
  "network": {
    "pt-BR": "Stellar testnet",
    "en": "Stellar testnet"
  },
  "lead": {
    "pt-BR": "O próximo fio por escrever.",
    "en": "The next thread to be written."
  },
  "known": [
    {
      "pt-BR": "Fato conhecido por escrever.",
      "en": "Known fact to be written."
    }
  ],
  "unknown": [
    {
      "pt-BR": "Pergunta em aberto por escrever.",
      "en": "Open question to be written."
    }
  ],
  "reading": [
    {
      "pt-BR": "Pergunta para levar ao código.",
      "en": "Question to bring to the code."
    }
  ]
}
EOF

cat > "$STORY_DIR/${NN}.json" <<EOF
{
  "scenes": [
    {
      "id": "opening",
      "title": {
        "pt-BR": "Cena por escrever.",
        "en": "Scene to be written."
      },
      "paragraphs": [
        {
          "pt-BR": "O texto longo do caso começa aqui.",
          "en": "The case's long-form text starts here."
        }
      ]
    },
    {
      "id": "turn",
      "title": {
        "pt-BR": "Virada por escrever.",
        "en": "Turn to be written."
      },
      "paragraphs": [
        {
          "pt-BR": "A cena em que o caso muda de sentido.",
          "en": "The scene where the case changes meaning."
        }
      ]
    },
    {
      "id": "cost",
      "title": {
        "pt-BR": "Custo por escrever.",
        "en": "Cost to be written."
      },
      "paragraphs": [
        {
          "pt-BR": "Quem paga pelo que foi feito aqui.",
          "en": "Who pays for what was done here."
        }
      ]
    },
    {
      "id": "close",
      "title": {
        "pt-BR": "Fecho por escrever.",
        "en": "Close to be written."
      },
      "paragraphs": [
        {
          "pt-BR": "O fio que aponta para o próximo caso.",
          "en": "The thread that points to the next case."
        }
      ]
    }
  ]
}
EOF

cat > "$BOOK_DIR/${NN}.json" <<EOF
{
  "title": {
    "pt-BR": "Capítulo por escrever.",
    "en": "Chapter to be written."
  },
  "openingCount": 1,
  "pages": [
    {
      "paragraphs": [
        {
          "pt-BR": "A chegada do caso começa aqui, sem revelar a solução.",
          "en": "The case arrival starts here, without revealing the solution."
        }
      ]
    },
    {
      "paragraphs": [
        {
          "pt-BR": "O desfecho aparece na abertura do próximo caso após a confirmação da solução.",
          "en": "The outcome appears in the next case opening after confirmed completion."
        }
      ]
    }
  ]
}
EOF

ART_DIR="frontend/public/images/levels"
if [ -f "$ART_DIR/homepage.webp" ] && [ ! -e "$ART_DIR/${NN}.webp" ]; then
    cp "$ART_DIR/homepage.webp" "$ART_DIR/${NN}.webp"
fi


cat <<EOF

✅ level $ID scaffolded.  The files:

   $DIR/instance/          ($INSTANCE_CRATE)
   $DIR/validator/         ($VALIDATOR_CRATE)
   $TEST_FILE
   $BRIEF_DIR/${NN}.{pt-BR,en}.md
   $CONC_DIR/${NN}.{pt-BR,en}.md
   $NARR_DIR/${NN}.json
   $CASE_DIR/${NN}.json
   $STORY_DIR/${NN}.json
   $BOOK_DIR/${NN}.json
   $ART_DIR/${NN}.webp     (placeholder, copied from the homepage)

   + contracts/Cargo.toml, contracts/tests/src/lib.rs, contracts/tests/src/levels.rs, levels.json

What is left, and none of it is boilerplate:

   1. the flaw          $DIR/instance/src/lib.rs
   2. the check         $DIR/validator/src/lib.rs   — today it returns \`false\` always,
                                                        so the level is not playable yet
   3. the tests         $TEST_FILE
   4. the prerequisites levels.json (`prerequisites`: explicitly choose [] or earlier level ids)
      the briefing      $BRIEF_DIR/${NN}.{pt-BR,en}.md
      the explanation   $CONC_DIR/${NN}.{pt-BR,en}.md
      the card summary  levels.json (\`summary\`)
   5. the exploit       scripts/exploits/${NN}-${SLUG}.sh   — this is what proves, against
                                                              the network, that the level is
                                                              solvable
   6. the season art    $ART_DIR/${NN}.webp — replace the placeholder with the level's art
   7. the narrative     $NARR_DIR/${NN}.json — the stub has \`start\`, \`solved\`, three hints and linear case documents;
                                                    write the beats and evidence for the case
   8. the case file     $CASE_DIR/${NN}.json — objective, target, network, lead, known, unknown, reading
   9. the full story    $STORY_DIR/${NN}.json — the long-form text, unlocked after solving
  10. the book chapter  $BOOK_DIR/${NN}.json — openingCount splits arrival from the outcome shown in the next case

Then:

   cd contracts && ./build.sh && cargo test
   cd frontend && npm test
EOF
