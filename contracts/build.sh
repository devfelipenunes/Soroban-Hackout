#!/usr/bin/env bash

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v stellar >/dev/null 2>&1 && [ -d "$HOME/.local/bin" ]; then
    PATH="$HOME/.local/bin:$PATH"
fi
if ! command -v cargo >/dev/null 2>&1 && [ -f "$HOME/.cargo/env" ]; then

    . "$HOME/.cargo/env"
fi

command -v stellar >/dev/null 2>&1 || {
    echo "✗ stellar not found — install a Stellar CLI version compatible with the SDK in contracts/Cargo.toml." >&2
    exit 1
}
command -v jq >/dev/null 2>&1 || {
    echo "✗ jq not found — required to check the level artifacts." >&2
    exit 1
}

cd "$HERE"
rm -rf target/wasm32v1-none/release
stellar contract build

echo
echo "Artifacts in target/wasm32v1-none/release/:"
shopt -s nullglob
artifacts=(target/wasm32v1-none/release/*.wasm)
shopt -u nullglob

if [ ${#artifacts[@]} -eq 0 ]; then
    echo "  ✗ no WASM found — the build did not produce what was expected" >&2
    exit 1
fi

for f in "${artifacts[@]}"; do
    printf "  %-38s %7s bytes\n" "$(basename "$f")" "$(stat -c%s "$f")"
done

missing=0
check_artifact() {
    [ -f "target/wasm32v1-none/release/$1.wasm" ] \
        || { echo "  ✗ missing $1.wasm" >&2; missing=1; }
}

check_artifact breaker_core
check_artifact breaker_credentials
check_artifact breaker_attribution

LEVELS_TSV="$(jq -r '.levels[] | [.id, .slug, (.aux // "")] | @tsv' ../levels.json)"
while IFS=$'\t' read -r id slug aux; do
    pad="$(printf '%02d' "$id")"
    check_artifact "breaker_level_${pad}_${slug}"
    check_artifact "breaker_level_${pad}_validator"
    [ -z "$aux" ] || check_artifact "breaker_level_${pad}_${aux}"
done <<< "$LEVELS_TSV"

[ "$missing" = 0 ] || {
    echo "✗ the build did not produce every contract the game deploys." >&2
    exit 1
}

echo
echo "Next step:  cargo test"
