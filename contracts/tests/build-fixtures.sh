#!/usr/bin/env bash

set -euo pipefail

if ! command -v cargo >/dev/null 2>&1 && [ -f "$HOME/.cargo/env" ]; then

    . "$HOME/.cargo/env"
fi

command -v cargo >/dev/null 2>&1 || {
    echo "✗ cargo not found. Install Rust: https://rustup.rs" >&2
    exit 1
}

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS="$(dirname "$HERE")"
DESTINATION="$HERE/fixtures"
CRATE="breaker-fixture-overflow"
TARGET="wasm32v1-none"

export SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1

build_variant() {
    local checks="$1" output="$2"
    local target_dir="/tmp/breaker-fixture-${checks}"

    echo "→ overflow-checks=${checks}"
    RUSTFLAGS="-C overflow-checks=${checks}" \
    CARGO_TARGET_DIR="$target_dir" \
        cargo build \
            --manifest-path "$CONTRACTS/Cargo.toml" \
            --package "$CRATE" \
            --target "$TARGET" \
            --release \
            --quiet

    local artifact="${target_dir}/${TARGET}/release/breaker_fixture_overflow.wasm"
    [ -f "$artifact" ] || { echo "✗ não encontrei $artifact" >&2; exit 1; }

    mkdir -p "$DESTINATION"
    cp "$artifact" "$DESTINATION/$output"
    echo "  $output  $(stat -c%s "$DESTINATION/$output") bytes  sha256:$(sha256sum "$DESTINATION/$output" | cut -c1-16)"
}

build_variant off fixture_overflow_no_checks.wasm
build_variant on  fixture_overflow_with_checks.wasm

if cmp -s "$DESTINATION/fixture_overflow_no_checks.wasm" \
          "$DESTINATION/fixture_overflow_with_checks.wasm"; then
    echo "✗ the two WASMs came out IDENTICAL — RUSTFLAGS had no effect" >&2
    exit 1
fi

echo "✓ the two variants diverge, as expected"
