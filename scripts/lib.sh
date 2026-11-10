#!/usr/bin/env bash

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bootstrap() {
    if [ -d "$HOME/.local/bin" ]; then PATH="$HOME/.local/bin:$PATH"; fi
    if ! command -v cargo >/dev/null 2>&1 && [ -f "$HOME/.cargo/env" ]; then

        . "$HOME/.cargo/env"
    fi
}

need() {
    command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 not found — $2" >&2; exit 1; }
}

ADDRESS_RE='\bC[A-Z2-7]{55}\b'
HASH_RE='\b[0-9a-f]{64}\b'

address_from() { printf '%s\n' "$1" | grep -oE "$ADDRESS_RE" | tail -1; }
hash_from()    { printf '%s\n' "$1" | grep -oE "$HASH_RE" | tail -1; }

case_variant_hex() {
    printf '%s' "$1" | xxd -r -p | tr '[:lower:]' '[:upper:]' | xxd -p -c 256
}

pad2() { printf '%02d' "$1"; }

level_id_or_die() {
    case "${1:-}" in
        ''|*[!0-9]*)
            echo "✗ the level id must be a number, got '${1:-}'" >&2
            exit 1 ;;
    esac
    printf '%s' "$((10#$1))"
}

level_names() {
    LEVEL_ID="$(level_id_or_die "$1")"
    LEVEL_NN="$(pad2 "$LEVEL_ID")"
    LEVEL_INSTANCE="breaker_level_${LEVEL_NN}_${2}"
    LEVEL_VALIDATOR="breaker_level_${LEVEL_NN}_validator"
}

level_slug_or_die() {
    local manifest="$1" id="$2" slug
    slug="$(jq -r --argjson id "$id" '.levels[] | select(.id == $id) | .slug' "$manifest")"
    [ -n "$slug" ] || { echo "✗ level $id is not in $manifest" >&2; exit 1; }
    printf '%s' "$slug"
}
