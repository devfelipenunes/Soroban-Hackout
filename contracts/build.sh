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

cd "$HERE"
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

echo
echo "Next step:  cargo test"
