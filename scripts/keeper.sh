#!/usr/bin/env bash

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"


. "$HERE/scripts/lib.sh"

NETWORK="${NETWORK:-testnet}"
SOURCE="${SOURCE:-keeper}"
RECORD="${RECORD:-$HERE/deployments.json}"
LEDGERS="${LEDGERS:-518400}"
SLACK="${SLACK:-1000}"

case "$LEDGERS" in ''|*[!0-9]*) echo "✗ LEDGERS must be a positive integer." >&2; exit 1 ;; esac
case "$SLACK" in ''|*[!0-9]*) echo "✗ SLACK must be a non-negative integer." >&2; exit 1 ;; esac
[ "$LEDGERS" -gt 0 ] || { echo "✗ LEDGERS must be a positive integer." >&2; exit 1; }

MODE="extend"

case "${1:-}" in
    ""|--extend) ;;
    --plan)      MODE="plan" ;;
    *)
        echo "usage: ./scripts/keeper.sh [--plan]" >&2
        echo "  --plan reads the record and prints the targets, without touching a network." >&2
        exit 1 ;;
esac

bootstrap
need jq "the keeper reads the record"

if [ ! -f "$RECORD" ]; then
    echo "✗ $RECORD does not exist — run ./scripts/deploy.sh first." >&2
    exit 1
fi

if ! jq -e '.contracts | length > 0' "$RECORD" >/dev/null 2>&1; then
    echo "✗ $RECORD is not valid JSON, or names no contracts." >&2
    echo "  Read as empty, this run would extend nothing and report success. That is" >&2
    echo "  indistinguishable from a keeper that works — until everything is archived, and" >&2
    echo "  by then there is nothing left to extend." >&2
    exit 1
fi

targets() {
    jq -r '
        .contracts | to_entries[] | .key as $name |
        ( if (.value.id // "") != "" then
              [ "\($name) [instance]", "--id", .value.id ]
          else empty end ),
        ( if (.value.wasm_hash // "") != "" then
              [ "\($name) [code]", "--wasm-hash", .value.wasm_hash ]
          else empty end )
        | @tsv
    ' "$RECORD"
}

CURRENT_LEDGER=""

current_ledger() {
    if [ -z "$CURRENT_LEDGER" ]; then
        local out
        out="$(stellar ledger latest --network "$NETWORK" --output json 2>&1)" || {
            echo "✗ could not read the current ledger from $NETWORK." >&2
            printf '%s\n' "$out" | sed 's/^/    /' >&2
            return 1
        }
        CURRENT_LEDGER="$(printf '%s\n' "$out" | jq -r '(.sequence // .result.sequence) // empty' 2>/dev/null)" || CURRENT_LEDGER=""
        case "$CURRENT_LEDGER" in
            ''|*[!0-9]*)
                echo "✗ could not parse the current ledger from the network." >&2
                printf '%s\n' "$out" | sed 's/^/    /' >&2
                return 1 ;;
        esac
    fi
    printf '%s' "$CURRENT_LEDGER"
}

days() { printf '%s' "$(( LEDGERS / 17280 ))"; }

keeper_label() {
    case "$SOURCE" in
        S*) printf 'a secret key (redacted)' ;;
        *)  printf '%s' "$SOURCE" ;;
    esac
}

if [ "$MODE" = plan ]; then
    echo "network: $NETWORK"
    echo "record:  $RECORD"
    echo "extend:  $LEDGERS ledgers (~$(days) days at 5s a ledger)"
    echo
    echo "the keeper would extend, in this order:"
    TARGETS="$(targets)" || { echo "✗ could not read targets from $RECORD." >&2; exit 1; }
    if [ -z "$TARGETS" ]; then
        echo "✗ $RECORD names no targets — a plan with nothing to extend is not a plan." >&2
        exit 1
    fi
    while IFS=$'\t' read -r label flag value; do
        printf '  %-42s %s %s\n' "$label" "$flag" "$value"
    done <<< "$TARGETS"
    echo
    echo "nothing was sent — \`--plan\` never loads a key and never reaches the network."
    exit 0
fi

need stellar "install stellar-cli 28.0.0 (see the README prerequisites)"

RESULTS=""
RESULTS="$(mktemp)" || RESULTS=""

if [ -z "$RESULTS" ]; then
    echo "✗ could not create a temporary file to collect the results." >&2
    exit 1
fi

trap 'rm -f "$RESULTS"' EXIT

extend_one() {
    local label="$1" flag="$2" value="$3"
    local out status=0 ttl

    out="$(stellar contract extend \
        --source-account "$SOURCE" \
        --network "$NETWORK" \
        "$flag" "$value" \
        --ledgers-to-extend "$LEDGERS" \
        --ttl-ledger-only 2>&1)" || status=$?

    if [ "$status" != 0 ]; then
        echo "✗ the extend of $label failed (exit $status)." >&2
        printf '%s\n' "$out" | sed 's/^/    /' >&2
        echo "  Stopping here: the entries after this one are now older than the ones before" >&2
        echo "  it, and the next scheduled run is the thing that has to fix that." >&2
        return 1
    fi

    ttl="$(printf '%s\n' "$out" | tr -dc '0-9\n' | grep -E '[0-9]' | tail -1)" || ttl=""

    if [ -z "$ttl" ]; then
        echo "✗ the extend of $label reported success but printed no TTL ledger." >&2
        printf '%s\n' "$out" | sed 's/^/    /' >&2
        return 1
    fi

    local current floor
    current="$(current_ledger)" || return 1
    floor=$(( current + LEDGERS - SLACK ))
    if [ "$ttl" -lt "$floor" ]; then
        echo "✗ the extend of $label returned TTL $ttl, but the current ledger is $current." >&2
        echo "  A successful extend should land at least $LEDGERS ledgers ahead (floor $floor)." >&2
        echo "  The entry did not move: re-uploading byte-identical code reuses the ledger entry." >&2
        return 1
    fi

    printf '%s\t%s\n' "$ttl" "$label" >> "$RESULTS"
    printf '  ✓ %-42s → ledger %s\n' "$label" "$ttl"
}

check_they_moved_together() {
    local lines min max spread

    if [ ! -s "$RESULTS" ]; then
        echo "✗ nothing was extended." >&2
        return 1
    fi

    lines="$(wc -l < "$RESULTS")"
    min="$(cut -f1 "$RESULTS" | sort -n | head -1)"
    max="$(cut -f1 "$RESULTS" | sort -n | tail -1)"
    spread=$(( max - min ))

    if [ "$spread" -gt "$SLACK" ]; then
        echo "✗ the entries did not land together: the widest gap is $spread ledgers." >&2
        echo "  All $lines were just extended by the same $LEDGERS, so they should all name the" >&2
        echo "  same ledger. A gap means some of them did NOT move — and the one that did not" >&2
        echo "  move is the one that expires first, in silence." >&2
        echo "  This is the measured failure mode: re-uploading byte-identical code reuses the ledger entry and renews nothing." >&2
        echo "  \`breaker_level_00_validator [code]\` sitting ~100.665 ledgers behind the rest," >&2
        echo "  because re-uploading byte-identical code reuses the entry and renews nothing." >&2
        sort -n "$RESULTS" | sed 's/^/    /' >&2
        return 1
    fi

    echo "  $lines entries, all expiring at ledger $min (±$spread)."
}

echo "network: $NETWORK"
echo "keeper:  $(keeper_label)"
echo "record:  $RECORD"
echo "extend:  $LEDGERS ledgers (~$(days) days at 5s a ledger)"
echo

TARGETS="$(targets)" || { echo "✗ could not read targets from $RECORD." >&2; exit 1; }
if [ -z "$TARGETS" ]; then
    echo "✗ $RECORD names no targets." >&2
    exit 1
fi
while IFS=$'\t' read -r label flag value; do
    extend_one "$label" "$flag" "$value"
done <<< "$TARGETS"

echo
check_they_moved_together

echo
echo "✅ keeper: every entry this project pays for was extended in $NETWORK."
