#!/usr/bin/env bash

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"


. "$HERE/scripts/lib.sh"

NETWORK="${NETWORK:-testnet}"
RECORD="${RECORD:-$HERE/deployments.json}"
MANIFEST="$HERE/levels.json"
W=contracts/target/wasm32v1-none/release
FRESH=0
FORCE=""
OPEN_PROGRESSION=0
while [ $# -gt 0 ]; do
    case "$1" in
        --fresh)
            FRESH=1; shift ;;
        --force)
            [ $# -ge 2 ] || { echo "✗ --force needs a level id:  ./scripts/deploy.sh --force 1" >&2; exit 1; }
            FORCE="$(level_id_or_die "$2")"; shift 2 ;;
        --open-progression)
            OPEN_PROGRESSION=1; shift ;;
        *)
            echo "✗ unknown argument: $1" >&2
            echo "  usage: ./scripts/deploy.sh [--fresh] [--force <level-id>] [--open-progression]" >&2
            exit 1 ;;
    esac
done

if [ "$FRESH" = 1 ] && [ -n "$FORCE" ]; then
    echo "✗ --fresh and --force disagree." >&2
    echo "  --fresh ignores the whole record and deploys a NEW core: every player's progress" >&2
    echo "  goes with it. --force repairs one level and touches nothing else." >&2
    exit 1
fi

if [ "$OPEN_PROGRESSION" = 1 ]; then
    case "$RECORD" in
        /*) RECORD_PATH="$RECORD" ;;
        *) RECORD_PATH="$HERE/$RECORD" ;;
    esac
    RECORD_DIR="$(cd "$(dirname "$RECORD_PATH")" 2>/dev/null && pwd -P)" \
        || { echo "✗ cannot resolve the sandbox record directory." >&2; exit 1; }
    if [ "$NETWORK" != "testnet" ] \
        || [ "$RECORD_DIR/$(basename "$RECORD_PATH")" != "$HERE/deployments.sandbox.json" ] \
        || [ -L "$RECORD_PATH" ]; then
        echo "✗ --open-progression requires the repository sandbox record on testnet." >&2
        exit 1
    fi
    RECORD="$HERE/deployments.sandbox.json"
fi

bootstrap
need stellar "install the Stellar CLI version compatible with contracts/Cargo.toml"
need jq "required for the record"

[ -f "$MANIFEST" ] || { echo "✗ levels.json not found at $MANIFEST" >&2; exit 1; }
jq -e . "$MANIFEST" >/dev/null 2>&1 \
    || { echo "✗ $MANIFEST is not valid JSON." >&2; exit 1; }
jq -e '.levels | length > 0' "$MANIFEST" >/dev/null 2>&1 \
    || { echo "✗ $MANIFEST names no levels — nothing to deploy" >&2; exit 1; }
jq -e 'all(.levels[]; (.id | type) == "number" and (.slug | type) == "string" and (.name | type) == "object" and ((.prerequisites | type) == "array"))' "$MANIFEST" >/dev/null 2>&1 \
    || { echo "✗ every level needs a numeric id, a string slug, a multilingual name and a prerequisites array." >&2; exit 1; }
jq -e '
    .levels as $levels
    | all(range(0; ($levels | length));
        . as $index
        | (($levels[$index].prerequisites | type) == "array")
            and (($levels[$index].prerequisites | length) == ($levels[$index].prerequisites | unique | length))
            and all($levels[$index].prerequisites[];
                . as $prerequisite
                | any($levels[0:$index][]; .id == $prerequisite)
            )
        )
' "$MANIFEST" >/dev/null 2>&1 \
    || { echo "✗ every level needs an explicit prerequisites array containing only earlier, unique level ids." >&2; exit 1; }

RECORD_TARGET="$RECORD"
STAGED_RECORD=""
if [ "$FRESH" = 1 ]; then
    STAGED_RECORD="$(mktemp "${RECORD_TARGET}.work.XXXXXX")"
    printf '{}\n' > "$STAGED_RECORD"
    RECORD="$STAGED_RECORD"
    finalize_staged_record() {
        local status=$?
        trap - EXIT
        if [ "$status" -eq 0 ]; then
            if ! mv "$STAGED_RECORD" "$RECORD_TARGET"; then
                echo "✗ deploy completed but could not replace $RECORD_TARGET." >&2
                echo "  The completed record remains at $STAGED_RECORD." >&2
                exit 1
            fi
        else
            local partial="${RECORD_TARGET}.partial.$(date -u +%Y%m%dT%H%M%SZ).$$"
            if [ -f "$RECORD_TARGET" ]; then
                echo "✗ deploy failed; the previous record was preserved at $RECORD_TARGET." >&2
            else
                echo "✗ deploy failed; no previous record existed at $RECORD_TARGET." >&2
            fi
            if mv "$STAGED_RECORD" "$partial"; then
                echo "  Partial deployment progress is recorded at $partial." >&2
            else
                echo "✗ could not preserve the partial record." >&2
            fi
        fi
        exit "$status"
    }
    trap finalize_staged_record EXIT
elif [ ! -f "$RECORD" ]; then
    echo '{}' > "$RECORD"
elif ! jq -e . "$RECORD" >/dev/null 2>&1; then
    echo "✗ $RECORD is not valid JSON." >&2
    echo "  Refusing to continue. A record that cannot be read looks exactly like an EMPTY" >&2
    echo "  record — and an empty record makes this script deploy a SECOND core." >&2
    echo "  Fix the file, or run ./scripts/deploy.sh --fresh to start a new era on purpose." >&2
    exit 1
fi

RECORD_NETWORK="$(jq -r '.network // empty' "$RECORD" 2>/dev/null || true)"
if [ -n "$RECORD_NETWORK" ] && [ "$RECORD_NETWORK" != "$NETWORK" ]; then
    echo "✗ $RECORD is for $RECORD_NETWORK, not $NETWORK." >&2
    exit 1
fi

if [ -n "$FORCE" ]; then
    jq -e --argjson id "$FORCE" '.levels[] | select(.id == $id)' "$MANIFEST" >/dev/null 2>&1 \
        || { echo "✗ level $FORCE is not in levels.json — there is nothing to force" >&2; exit 1; }

    LOCAL_CORE_HASH="$(sha256sum "$W/breaker_core.wasm" 2>/dev/null | cut -d' ' -f1)" || LOCAL_CORE_HASH=""
    RECORDED_CORE_HASH="$(jq -r '.contracts.breaker_core.wasm_hash // ""' "$RECORD")"
    if [ "$LOCAL_CORE_HASH" != "$RECORDED_CORE_HASH" ]; then
        echo "✗ --force needs the core on the ledger to be the one built from this tree." >&2
        echo "  local:    ${LOCAL_CORE_HASH:-<not built>}" >&2
        echo "  recorded: ${RECORDED_CORE_HASH:-<none>}" >&2
        echo "  A core cannot be upgraded (decision 15), so an older one has no set_wasm_hash." >&2
        echo "  Run ./scripts/deploy.sh without --force to deploy a new core — and note that a" >&2
        echo "  new core starts with an empty \`completed\`." >&2
        exit 1
    fi
fi

if [ "$OPEN_PROGRESSION" = 1 ]; then
    echo "progression: open (explicitly requested)"
else
    echo "progression: configured by levels.json"
fi

SOURCE="${SOURCE:-dev}"
ADMIN="${ADMIN:-$(stellar keys address "$SOURCE")}"

already_have() {
    local value status=0
    value="$(jq -r "($1) // empty" "$RECORD" 2>/dev/null)" || status=$?
    if [ "$status" -ne 0 ]; then
        echo "✗ could not read $1 from $RECORD." >&2
        exit 1
    fi
    [ -n "$value" ] && [ "$value" != "false" ] && [ "$value" != "null" ]
}

store() {
    local tmp; tmp="$(mktemp "$(dirname "$RECORD")/.$(basename "$RECORD").XXXXXX")" || tmp=""
    if [ -z "$tmp" ] \
       || ! jq --arg v "$2" "$1 = \$v" "$RECORD" > "$tmp" 2>/dev/null \
       || ! mv "$tmp" "$RECORD"; then
        [ -z "$tmp" ] || rm -f "$tmp"
        echo "✗ could not write $1 into $RECORD." >&2
        echo "  Aborting before anything else is deployed: continuing would create contracts" >&2
        echo "  the record never learns about." >&2
        exit 1
    fi
}

forced() {
    [ -n "$FORCE" ] || return 1
    case "$1" in "breaker_level_$(pad2 "$FORCE")_"*) return 0 ;; esac
    return 1
}

assert_current() {
    local name="$1" path="$2"
    local recorded; recorded="$(jq -r ".contracts.\"$name\".wasm_hash // empty" "$RECORD")"
    [ -n "$recorded" ] || return 0
    local local_hash; local_hash="$(sha256sum "$path" | cut -d' ' -f1)"
    [ "$recorded" = "$local_hash" ] || refuse_stale "$name" "$recorded" "$local_hash"
}

refuse_stale() {
    echo "✗ $1 on the ledger is NOT what this tree builds." >&2
    echo "  on the ledger: $2" >&2
    echo "  local build:   $3" >&2
    if [ "$1" = "breaker_core" ]; then
        echo "  A core cannot be upgraded (decision 15), so there is nothing to repair." >&2
        echo "  Run ./scripts/deploy.sh --fresh to start a new era — and note that a new core" >&2
        echo "  starts with an empty \`completed\`." >&2
    else
        echo "  The ledger still runs the old code and will keep running it." >&2
        echo "  Run ./scripts/deploy.sh --force <level-id> to move the target, or --fresh for" >&2
        echo "  a new era." >&2
    fi
    exit 1
}

build() {
    echo "── build ─────────────────────────────────────────────────────"
    ./contracts/build.sh
    echo
}

UPLOADED=""

upload_wasm() {
    local name="$1" path="$2" field=".contracts.$1.wasm_hash"

    local local_hash; local_hash="$(sha256sum "$path" | cut -d' ' -f1)"
    local recorded; recorded="$(jq -r "$field // empty" "$RECORD")"

    if [ -n "$recorded" ] && ! forced "$name"; then
        [ "$recorded" = "$local_hash" ] || refuse_stale "$name" "$recorded" "$local_hash"
        echo "  ↷ $name: already on the ledger" >&2
        UPLOADED="$recorded"
        return 0
    fi

    echo "  ↑ $name ($(stat -c%s "$path") bytes)" >&2

    local out
    out="$(stellar contract upload --wasm "$path" --source-account "$SOURCE" \
           --network "$NETWORK" --optimize=false 2>&1)" || { echo "$out" >&2; return 1; }

    local hash; hash="$(hash_from "$out")" || hash=""

    if [ -z "$hash" ]; then
        echo "✗ could not read the uploaded hash from the output." >&2
        printf '%s\n' "$out" | sed 's/^/    /' >&2
        return 1
    fi

    if [ "$hash" != "$local_hash" ]; then
        echo "✗ the ledger hash ($hash) differs from the local sha256 ($local_hash)." >&2
        echo "  The WASM was reprocessed along the way. The source check would not hold." >&2
        return 1
    fi

    store "$field" "$hash"
    UPLOADED="$hash"
}

DEPLOYED=""

deploy() {
    local name="$1" hash="$2"; shift 2
    local field=".contracts.$name.id"

    if already_have "$field" && ! forced "$name"; then
        echo "  ↷ $name: already deployed" >&2
        DEPLOYED="$(jq -r "$field" "$RECORD")"
        return 0
    fi

    echo "  ⇩ $name" >&2
    local out
    out="$(stellar contract deploy --wasm-hash "$hash" --source-account "$SOURCE" \
           --network "$NETWORK" -- "$@" 2>&1)" || { echo "$out" >&2; return 1; }

    local id; id="$(address_from "$out")" || id=""
    [ -n "$id" ] || { echo "✗ could not read the address from the deploy output" >&2; echo "$out" >&2; return 1; }

    store "$field" "$id"
    DEPLOYED="$id"
}

invoke() {
    stellar contract invoke --id "$1" --source-account "$SOURCE" --network "$NETWORK" \
        -- "$2" "${@:3}" >/dev/null
}

apply_prerequisites() {
    local level_id="$1" prerequisites="$2"
    if [ "$OPEN_PROGRESSION" = 1 ]; then
        prerequisites='[]'
    fi
    invoke "$CORE" set_prerequisites --level_id "$level_id" --prerequisites "$prerequisites"
}

echo "network: $NETWORK"
echo "source:  $SOURCE"
echo "admin:   $ADMIN"
echo

build

echo "── core ──────────────────────────────────────────────────────"
upload_wasm breaker_core "$W/breaker_core.wasm"
H_CORE="$UPLOADED"
deploy breaker_core "$H_CORE" --admin "$ADMIN"
CORE="$DEPLOYED"
echo

echo "── níveis ────────────────────────────────────────────────────"
LEVELS_COUNT="$(jq '.levels | length' "$MANIFEST")"
LEVELS_TSV="$(jq -r '.levels[] | [.id, .slug, (.name["pt-BR"] // .name.en // .slug), (.aux // "__NONE__"), ((.prerequisites // []) | tojson)] | @tsv' "$MANIFEST")"
[ "$LEVELS_COUNT" -eq "$(printf '%s\n' "$LEVELS_TSV" | wc -l)" ] \
    || { echo "✗ could not read every level from $MANIFEST." >&2; exit 1; }
while IFS=$'\t' read -r id slug label aux prerequisites; do
    [ "$aux" = "__NONE__" ] && aux=""
    level_names "$id" "$slug"
    instance="$LEVEL_INSTANCE"
    validator="$LEVEL_VALIDATOR"
    AUX_NAME=""
    [ -z "$aux" ] || AUX_NAME="breaker_level_${LEVEL_NN}_${aux}"

    FORCED=0
    if [ -n "$FORCE" ] && [ "$FORCE" -eq "$id" ]; then FORCED=1; fi

    if [ "$FORCED" = 0 ]; then
        assert_current "$instance"  "$W/$instance.wasm"
        assert_current "$validator" "$W/$validator.wasm"
        [ -z "$AUX_NAME" ] || assert_current "$AUX_NAME" "$W/$AUX_NAME.wasm"
    fi

    if [ "$FORCED" = 0 ] \
       && already_have ".levels.\"$id\".registered" \
       && [ "$(jq -r ".levels.\"$id\".core // \"\"" "$RECORD")" = "$CORE" ] \
       && { [ -z "$AUX_NAME" ] || already_have ".contracts.\"$AUX_NAME\".id"; }; then
        echo "  ↷ $LEVEL_NN $label: already registered"
        apply_prerequisites "$id" "$prerequisites"
        continue
    fi

    if [ "$FORCED" = 1 ]; then
        echo "  ── $LEVEL_NN $label — FORCED"
        echo "     future instances of level $id will run the NEW target."
        echo "     instances that already exist keep the code they were born with."
        echo "     \`completed\` is not touched."
        echo "     ⚠️  the NEW validator judges the OLD instances: it must be able to read"
        echo "         the state the old code wrote, or attempts in flight get stuck."
    else
        echo "  ── $LEVEL_NN $label"
    fi

    OLD_INSTANCE_HASH="$(jq -r  ".contracts.\"$instance\".wasm_hash  // \"\"" "$RECORD")"
    OLD_VALIDATOR_HASH="$(jq -r ".contracts.\"$validator\".wasm_hash // \"\"" "$RECORD")"

    upload_wasm "$instance" "$W/$instance.wasm"
    H_INSTANCE="$UPLOADED"
    upload_wasm "$validator" "$W/$validator.wasm"
    H_VALIDATOR="$UPLOADED"

    if [ "$FORCED" = 1 ] && [ "$H_VALIDATOR" = "$OLD_VALIDATOR_HASH" ]; then
        VALIDATOR="$(jq -r ".contracts.\"$validator\".id // \"\"" "$RECORD")"
        [ -n "$VALIDATOR" ] || { echo "✗ the record has no address for $validator" >&2; exit 1; }
        echo "  ↷ $validator: unchanged, kept"
    else
        deploy "$validator" "$H_VALIDATOR"
        VALIDATOR="$DEPLOYED"
    fi

    if [ -n "$AUX_NAME" ]; then
        OLD_AUX_HASH="$(jq -r ".contracts.\"$AUX_NAME\".wasm_hash // \"\"" "$RECORD")"
        upload_wasm "$AUX_NAME" "$W/$AUX_NAME.wasm"
        H_AUX="$UPLOADED"
        if [ "$FORCED" = 1 ] && [ "$H_AUX" = "$OLD_AUX_HASH" ] \
           && already_have ".contracts.\"$AUX_NAME\".id"; then
            echo "  ↷ $AUX_NAME: unchanged, kept"
        else
            deploy "$AUX_NAME" "$H_AUX"
        fi
    fi

    if [ "$FORCED" = 0 ]; then
        invoke "$CORE" register_level --level_id "$id" --wasm_hash "$H_INSTANCE" --validator "$VALIDATOR"
        store ".levels.\"$id\".registered" 'true'
        store ".levels.\"$id\".core"       "$CORE"
    else
        invoke "$CORE" set_wasm_hash --level_id "$id" --wasm_hash "$H_INSTANCE"
        if [ "$H_VALIDATOR" != "$OLD_VALIDATOR_HASH" ]; then
            invoke "$CORE" set_validator --level_id "$id" --validator "$VALIDATOR"
        fi

        store ".levels.\"$id\".registered" 'true'
        store ".levels.\"$id\".core"       "$CORE"
        store ".levels.\"$id\".previous_wasm_hash" "$OLD_INSTANCE_HASH"
    fi
    apply_prerequisites "$id" "$prerequisites"
    done <<< "$LEVELS_TSV"
echo

echo "── NFT da temporada ──────────────────────────────────────────"
upload_wasm breaker_season "$W/breaker_credentials.wasm"
H_SEASON="$UPLOADED"
if [ "$FRESH" = 0 ] && already_have '.contracts.breaker_season.id'; then
    echo "  ↷ breaker_season: already deployed" >&2
else
    CASES="$(jq -c '[.levels[].id]' "$MANIFEST")"
    SEASON_URI="${SEASON_URI:-data:application/json;base64,$(base64 -w0 "$HERE/scripts/nft/season-01.json")}"
    deploy breaker_season "$H_SEASON" \
        --admin "$ADMIN" \
        --core "$CORE" \
        --cases "$CASES" \
        --name "Breaker — Season 01" \
        --symbol "BREAKER-S1" \
        --uri "$SEASON_URI"
fi
echo

echo "── bindings ──────────────────────────────────────────────────"
BINDINGS="${BINDINGS:-}"
if [ -n "$BINDINGS" ]; then
    mkdir -p "$BINDINGS"
    echo "  ＋ breaker_core"
    stellar contract bindings typescript --id "$CORE" --network "$NETWORK" \
        --output-dir "$BINDINGS/breaker_core" --overwrite >/dev/null
else
    echo "  ↷ skipped (set BINDINGS=<dir> to generate)"
fi
echo

echo "── registro final ────────────────────────────────────────────"
TMP="$(mktemp "$(dirname "$RECORD")/.$(basename "$RECORD").final.XXXXXX")" || TMP=""
if [ -z "$TMP" ]; then
    echo "✗ could not create a temporary record next to $RECORD." >&2
    exit 1
fi
if ! jq -n \
  --arg network "$NETWORK" \
  --arg admin "$ADMIN" \
  --arg cli "$(stellar --version 2>&1 | head -1)" \
  --arg sdk "$(grep -A1 '^name = "soroban-sdk"' contracts/Cargo.lock | grep '^version' | head -1 | cut -d'"' -f2)" \
  --arg rustc "$(cd contracts && rustc --version 2>/dev/null | sed -E 's/ [0-9]{4}-[0-9]{2}-[0-9]{2}//' || echo '?')" \
  --slurpfile current "$RECORD" \
  '{
     network: $network,
     admin: $admin,
     inputs: {
       recipe: "stellar contract build",
       stellar_cli: $cli,
       soroban_sdk: $sdk,
       rustc: $rustc,
       target: "wasm32v1-none",
       upload: "--optimize=false, so the ledger hash is the sha256 of the file"
     },
     contracts: ($current[0].contracts // {}),
     levels: ($current[0].levels // {})
   }' > "$TMP"; then
    rm -f "$TMP"
    echo "✗ could not write the final record." >&2
    exit 1
fi
if ! mv "$TMP" "$RECORD"; then
    rm -f "$TMP"
    echo "✗ could not replace $RECORD." >&2
    exit 1
fi

jq '.' "$RECORD"

echo
echo "✅ done. Core: $CORE"
echo "   Next step (the criterion that closes the scope):"
echo "     ./scripts/exploit.sh    # the two-call exploit, against the testnet"
