#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"


. "$HERE/scripts/lib.sh"

TARGET="${1:-all}"

case "$TARGET" in
    contracts|frontend|scripts|all) ;;
    *) echo "usage: ./scripts/ci.sh [contracts|frontend|scripts|all]" >&2; exit 1 ;;
esac

bootstrap

contracts_job() {
    echo "── contracts ─────────────────────────────────────────────────"
    ./contracts/build.sh
    (cd contracts && cargo test)
}

frontend_job() {
    echo "── frontend ──────────────────────────────────────────────────"
    (cd frontend && npm ci && npm test && npm run build)
}

SANDBOX=""
PROBE=""
OUT=""
LOG=""
GOOD=""

stub_stellar() {
    cat > "$SANDBOX/bin/stellar" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${STUB_LOG:?STUB_LOG not set}"

ALPHABET="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

address_from_hash() {
    local hex; hex="$(printf '%s' "$1" | sha256sum | cut -d' ' -f1)"
    local out="C" i
    for i in $(seq 0 54); do
        out="$out${ALPHABET:$(( 16#${hex:$(( i % 64 )):1} % 32 )):1}"
    done
    printf '%s' "$out"
}

case "$1 ${2:-}" in
    "keys address")
        printf '%s\n' "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4" ;;
    "contract build")
        exit 0 ;;
    "contract upload")
        wasm=""
        while [ $# -gt 0 ]; do [ "$1" = "--wasm" ] && wasm="$2"; shift; done
        sha256sum "$wasm" | cut -d' ' -f1 ;;
    "contract deploy")
        hash=""
        while [ $# -gt 0 ]; do [ "$1" = "--wasm-hash" ] && hash="$2"; shift; done
        [ -z "${STUB_DEPLOY_GARBAGE:-}" ] || { printf 'no address here\n'; exit 0; }
        address_from_hash "$hash" ;;
    "contract invoke")
        fn=""
        while [ $# -gt 0 ]; do case "$1" in --) fn="$2"; break ;; esac; shift; done
        [ "$fn" = "is_completed" ] && printf 'true\n'
        exit 0 ;;
    "ledger latest")
        printf '{"sequence": %s}\n' "${STUB_LEDGER_SEQUENCE:-1000000}" ;;
    "contract extend")
        target=""
        while [ $# -gt 0 ]; do
            case "$1" in --id|--wasm-hash) target="$2"; shift ;; esac
            shift
        done
        if [ -n "${STUB_EXTEND_FAIL:-}" ] && [ "$target" = "$STUB_EXTEND_FAIL" ]; then
            printf 'stub: the rpc refused the extend of %s\n' "$target" >&2
            exit 1
        fi
        [ -z "${STUB_EXTEND_NO_TTL:-}" ] || { printf 'no TTL here\n'; exit 0; }
        ttl="${STUB_EXTEND_TTL:-9000000}"
        if [ -n "${STUB_EXTEND_LAG:-}" ] && [ "$target" = "$STUB_EXTEND_LAG" ]; then
            ttl="$(( ttl - ${STUB_EXTEND_GAP:-100665} ))"
        fi
        printf '%s\n' "$ttl" ;;
    *)
        [ "$1" = "--version" ] && { printf 'stellar 28.0.0 (stub)\n'; exit 0; }
        printf 'stub: unhandled: %s\n' "$*" >&2 ;;
esac
STUB
    chmod +x "$SANDBOX/bin/stellar"
}

sandbox_build() {
    SANDBOX="$(mktemp -d)"
    trap 'rm -rf "$SANDBOX"' EXIT
    LOG="$SANDBOX/stub.log"
    OUT="$SANDBOX/out"
    GOOD="$SANDBOX/good.json"

    mkdir -p "$SANDBOX/home" "$SANDBOX/bin" \
             "$SANDBOX/repo/scripts" "$SANDBOX/repo/contracts/target/wasm32v1-none/release"

    cp scripts/lib.sh scripts/deploy.sh scripts/keeper.sh "$SANDBOX/repo/scripts/"
    cp -a scripts/nft "$SANDBOX/repo/scripts/"
    cp levels.json "$SANDBOX/repo/levels.json"
    cp contracts/Cargo.lock "$SANDBOX/repo/contracts/Cargo.lock"
    printf '#!/usr/bin/env bash\nexit 0\n' > "$SANDBOX/repo/contracts/build.sh"
    chmod +x "$SANDBOX/repo/contracts/build.sh"
    stub_stellar

    local wasm="$SANDBOX/repo/contracts/target/wasm32v1-none/release"
    printf 'wasm:core\n' > "$wasm/breaker_core.wasm"
    printf 'wasm:season\n' > "$wasm/breaker_credentials.wasm"
    local id slug aux
    while IFS=$'\t' read -r id slug aux; do
        printf 'wasm:%s:%s\n' "$id" "$slug" > "$wasm/breaker_level_$(pad2 "$id")_${slug}.wasm"
        printf 'validator:%s\n' "$id"         > "$wasm/breaker_level_$(pad2 "$id")_validator.wasm"
        if [ -n "$aux" ]; then
            printf 'aux:%s:%s\n' "$id" "$aux" > "$wasm/breaker_level_$(pad2 "$id")_${aux}.wasm"
        fi
    done < <(jq -r '.levels[] | [.id, .slug, (.aux // "")] | @tsv' levels.json)

    local resolved
    resolved="$(PATH="$SANDBOX/bin:$PATH" command -v stellar)"
    [ "$resolved" = "$SANDBOX/bin/stellar" ] || {
        echo "✗ refusing to run the probes: \`stellar\` resolves to $resolved, not the stub." >&2
        echo "  These probes run deploy.sh, and a real CLI would reach a real network." >&2
        exit 1
    }
    echo "  sandbox: $SANDBOX"
    echo "  stellar: the stub, HOME: an empty directory, TMPDIR: whatever a probe sets"
    echo
}

fresh() {
    PROBE="$SANDBOX/$1"
    rm -rf "$PROBE"
    cp -a "$SANDBOX/repo" "$PROBE"
    : > "$LOG"
}

deploy_run() {
    ( cd "$PROBE" && \
      env -i \
        PATH="$SANDBOX/bin:$PATH" \
        HOME="$SANDBOX/home" \
        STUB_LOG="$LOG" \
        STUB_DEPLOY_GARBAGE="${STUB_DEPLOY_GARBAGE:-}" \
        TMPDIR="${PROBE_TMPDIR:-/tmp}" \
        NETWORK=testnet-probe \
        SOURCE=probe \
        bash scripts/deploy.sh "$@" ) > "$OUT" 2>&1
}

keeper_run() {
    ( cd "$PROBE" && \
      env -i \
        PATH="$SANDBOX/bin:$PATH" \
        HOME="$SANDBOX/home" \
        STUB_LOG="$LOG" \
        STUB_EXTEND_FAIL="${STUB_EXTEND_FAIL:-}" \
        STUB_EXTEND_LAG="${STUB_EXTEND_LAG:-}" \
        STUB_EXTEND_TTL="${STUB_EXTEND_TTL:-}" \
        STUB_EXTEND_NO_TTL="${STUB_EXTEND_NO_TTL:-}" \
        STUB_LEDGER_SEQUENCE="${STUB_LEDGER_SEQUENCE:-}" \
        NETWORK=testnet-probe \
        SOURCE=probe \
        bash scripts/keeper.sh "$@" ) > "$OUT" 2>&1
}

logged() { grep -c -e "$1" "$LOG" 2>/dev/null || true; }

dump() {
    sed 's/^/    | /' "$OUT" >&2
    echo "    | (stub log)" >&2
    sed 's/^/    | /' "$LOG" >&2
}

refuse() {
    echo "✗ $1" >&2
    shift
    while [ $# -gt 0 ]; do echo "  $1" >&2; shift; done
    dump
    exit 1
}

RECIPE_SURFACE=" INSTANCE CORE PLAYER NETWORK SOURCE AUX "
RECIPE_STUB=""

recipe_stub() {
    printf '%s\n' "$@" > "$RECIPE_STUB"
    chmod +x "$RECIPE_STUB"
}

recipe_check() {
    local recipe="$3" path="$1/$3"
    local hit used assigned name offenders=""

    if [ ! -f "$path" ]; then
        echo "✗ level $2 has no exploit recipe." >&2
        echo "  expected: $recipe" >&2
        echo "  A level is not playable until somebody has solved it in writing — item 5 of" >&2
        echo "  ./scripts/new-level.sh and fill in the generated files." >&2
        return 1
    fi

    if [ ! -x "$path" ]; then
        echo "✗ $recipe is not executable." >&2
        echo "  fix: chmod +x $recipe" >&2
        echo "  exploit.sh sources it, and a recipe nobody can run is not a recipe." >&2
        return 1
    fi

    hit="$(grep -nE '(^|[^A-Za-z0-9_])cd([^A-Za-z0-9_]|$)' "$path" || true)"
    if [ -n "$hit" ]; then
        echo "✗ $recipe changes directory:" >&2
        printf '%s\n' "$hit" | sed 's/^/    /' >&2
        echo "  exploit.sh runs from the repository root and sources the recipe into its own" >&2
        echo "  shell, so a \`cd\` here moves the ground under steps ③ and ④ as well." >&2
        return 1
    fi

    hit="$(grep -nE '\bexit\b' "$path" | grep -vE '\bexit[[:space:]]+[1-9][0-9]*([^0-9]|$)' || true)"
    if [ -n "$hit" ]; then
        echo "✗ $recipe exits with something other than a non-zero literal:" >&2
        printf '%s\n' "$hit" | sed 's/^/    /' >&2
        echo "  The recipe is sourced, so its \`exit\` ends exploit.sh. That is how a recipe" >&2
        echo "  reports a failed exploit, and the only thing it may report: an \`exit 0\` leaves" >&2
        echo "  a successful status behind with no \`✅\` in sight, which reads exactly like a run" >&2
        echo "  that worked. Use a non-zero literal." >&2
        return 1
    fi

    used="$(grep -oE '\$\{?[A-Za-z_][A-Za-z0-9_]*' "$path" | sed -E 's/^\$\{?//' | sort -u || true)"
    assigned="$(grep -oE '(^|[^A-Za-z0-9_])[A-Za-z_][A-Za-z0-9_]*=' "$path" \
        | sed -E 's/^[^A-Za-z_]*//' | sed -E 's/=$//' | sort -u || true)"

    while IFS= read -r name; do
        [ -n "$name" ] || continue
        case "$RECIPE_SURFACE" in *" $name "*) continue ;; esac
        if grep -qxF -- "$name" <<< "$assigned"; then continue; fi
        offenders="${offenders}${offenders:+ }$name"
    done <<< "$used"

    if [ -n "$offenders" ]; then
        echo "✗ $recipe reads names that belong to exploit.sh: $offenders" >&2
        echo "  A recipe may read \$INSTANCE, \$CORE, \$PLAYER, \$NETWORK and \$SOURCE, and call" >&2
        echo "  \`call\`, \`address_from\` and \`hash_from\`. Everything else in the shell around it" >&2
        echo "  is exploit.sh's business: a recipe that reads \$SLUG breaks the day that name" >&2
        echo "  changes, and nothing else here would have said so. Assign it locally instead." >&2
        echo "  Read scripts/AGENTS.md for the recipe interface constraints." >&2
        return 1
    fi

    return 0
}

recipes_lint() {
    local root="${1:-$HERE}"
    local manifest="$root/levels.json"
    local id slug bad=0

    if [ ! -f "$manifest" ]; then
        echo "✗ no $manifest — that file names the levels, and the names are the recipes." >&2
        return 1
    fi

    if ! jq -e '.levels | length > 0' "$manifest" >/dev/null 2>&1; then
        echo "✗ $manifest is not valid JSON, or lists no levels." >&2
        echo "  Read as empty, this check would pass without looking at a single recipe." >&2
        return 1
    fi

    while IFS=$'\t' read -r id slug; do
        recipe_check "$root" "$id ($slug)" "scripts/exploits/$(pad2 "$id")-${slug}.sh" || bad=1
    done < <(jq -r '.levels[] | [.id, .slug] | @tsv' "$manifest")

    return "$bad"
}

lint_fail() {
    echo "✗ $1" >&2
    shift
    while [ $# -gt 0 ]; do echo "  $1" >&2; shift; done
    sed 's/^/    | /' "$OUT" >&2
    exit 1
}

lint_must_fail() {
    local status=0
    recipes_lint "$SANDBOX/recipes" > "$OUT" 2>&1 || status=$?
    [ "$status" != 0 ] || lint_fail "$1" \
        "The recipe lint accepted it." \
        "It is the only thing between the repository and a recipe that breaks exploit.sh," \
        "and a lint that cannot fail is a green light wired to nothing."
    grep -qF -- "$2" "$OUT" || lint_fail "$1" \
        "It was refused, but not by the check under test." \
        "the message had to name: $2"
    echo "  ✓ $1"
}

lint_must_pass() {
    local status=0
    recipes_lint "$SANDBOX/recipes" > "$OUT" 2>&1 || status=$?
    [ "$status" = 0 ] || lint_fail "$1" "The lint refused a recipe it has to accept."
    echo "  ✓ $1"
}

lint_probes() {
    local dir="$SANDBOX/recipes"

    mkdir -p "$dir/scripts/exploits"
    printf '%s\n' '{"levels":[{"id":1,"slug":"probe"}]}' > "$dir/levels.json"
    RECIPE_STUB="$dir/scripts/exploits/01-probe.sh"

    recipe_stub 'call "$INSTANCE" open >/dev/null' \
                'OPEN="$(call "$INSTANCE" is_open)"' \
                '[ "$OPEN" = "true" ] || { echo "✗ it did not open" >&2; exit 1; }'
    lint_must_pass "R0  a recipe that stays inside the contract passes"

    rm -f "$RECIPE_STUB"
    lint_must_fail "R1  a level with no recipe is refused" "has no exploit recipe"
    grep -qF '01-probe.sh' "$OUT" || lint_fail "R1: the refusal did not name the path to write." \
        "The reader has to be told which file is missing, not just that one is."

    recipe_stub 'call "$INSTANCE" open >/dev/null'
    chmod -x "$RECIPE_STUB"
    lint_must_fail "R2  a recipe nobody can run is refused" "is not executable"

    recipe_stub 'call "$INSTANCE" --id "$SLUG" >/dev/null'
    lint_must_fail "R3  a recipe that reads exploit.sh's own names is refused" "SLUG"

    recipe_stub 'cd contracts' 'call "$INSTANCE" open >/dev/null'
    lint_must_fail "R4  a recipe that moves the shell is refused" "changes directory"

    recipe_stub 'call "$INSTANCE" open' 'exit 0'
    lint_must_fail "R5  a recipe that exits zero is refused" "non-zero"

    recipe_stub 'call "$INSTANCE" open' 'exit 1'
    lint_must_pass "R6  \`exit 1\` is accepted — it is how a recipe reports a failed exploit"

    printf '%s\n' '{"levels":[]}' > "$dir/levels.json"
    lint_must_fail "R7  a manifest that reads as empty is refused" "lists no levels"
}

keeper_probes() {
    local status extends lagging expected

    fresh keeper
    cp "$GOOD" "$PROBE/deployments.json"
    expected="$(jq '[.contracts[] | (if (.id // "") != "" then 1 else 0 end) + (if (.wasm_hash // "") != "" then 1 else 0 end)] | add // 0' "$GOOD")"
    STUB_EXTEND_FAIL="" STUB_EXTEND_LAG=""
    status=0; keeper_run || status=$?
    [ "$status" = 0 ] || refuse \
        "K0: ./scripts/keeper.sh against a healthy record exited $status." \
        "Every probe below is a probe of a failure mode; none of them means anything if a" \
        "correct run does not pass."
    extends="$(logged '^contract extend')"
    [ "$extends" = "$expected" ] || refuse \
        "K0: the keeper extended $extends entries, not $expected." \
        "The record names $expected targets: every instance has an address, every code entry" \
        "has a hash, and each one has to be extended. A player's own instance is NOT the" \
        "keeper's — the player pays for that one (decision 23)."
    grep -q 'all expiring at ledger' "$OUT" || refuse \
        "K0: the run finished but did not report the TTLs landing together."
    echo "  ✓ K0  a healthy record extends all $expected entries"

    fresh keeper_empty
    printf '{"network":"testnet","contracts":{}}\n' > "$PROBE/deployments.json"
    status=0; keeper_run || status=$?
    [ "$status" != 0 ] || refuse \
        "K1: a record that names no contracts was read as a keeper with nothing to do." \
        "It reported success. A keeper that extends nothing looks exactly like one that" \
        "works — until every entry is archived, and then there is nothing left to extend."
    [ "$(logged '^contract extend')" = 0 ] || refuse \
        "K1: the keeper announced it had nothing to extend, and then extended something." \
        "The record is the only source of targets; if it reads as empty the run has to be" \
        "over before anything is signed."
    grep -q 'names no contracts' "$OUT" || refuse \
        "K1: the run stopped somewhere, but not because the record could not be read." \
        "A broken record has to be refused AS a broken record."
    echo "  ✓ K1  a record that reads as empty is refused, with zero extends"

    fresh keeper_anomaly
    cp "$GOOD" "$PROBE/deployments.json"
    lagging="$(jq -r '.contracts.breaker_level_00_validator.wasm_hash' "$GOOD")"
    STUB_EXTEND_LAG="$lagging" STUB_EXTEND_FAIL=""
    status=0; keeper_run || status=$?
    STUB_EXTEND_LAG=""
    [ "$status" != 0 ] || refuse \
        "K2: one entry came back ~100.665 ledgers behind the rest and the keeper called it a" \
        "success." \
        "Re-uploading" \
        "byte-identical code reuses the ledger entry and renews nothing, so the extend" \
        "reports success while the entry keeps its old, shorter TTL. It is invisible until" \
        "that one entry is archived and the level it belongs to stops working."
    grep -q 'did not land together' "$OUT" || refuse \
        "K2: the run failed, but not because the entries did not land together." \
        "the widening gap is the only thing that makes a silently-unrenewed entry visible."
    grep -q "$lagging" "$LOG" || refuse \
        "K2: the run failed without ever attempting the lagging entry."
    echo "  ✓ K2  an entry that does not move is caught, and named"

    fresh keeper_stops
    cp "$GOOD" "$PROBE/deployments.json"
    STUB_EXTEND_FAIL="$(jq -r '.contracts.breaker_level_00_validator.wasm_hash' "$GOOD")"
    STUB_EXTEND_LAG=""
    status=0; keeper_run || status=$?
    STUB_EXTEND_FAIL=""
    [ "$status" != 0 ] || refuse \
        "K3: the rpc refused an extend and the keeper reported success." \
        "A run that reports success over a failed extend is a keeper that has already" \
        "stopped, and nothing says so."
    extends="$(logged '^contract extend')"
    [ "$extends" -lt "$expected" ] || refuse \
        "K3: the extend failed and the keeper went on to extend all $expected anyway." \
        "It extended $extends. Continuing past a failure renews the entries after it and" \
        "leaves the ones before it older — turning one failure into a stale entry nobody" \
        "is looking at."
    echo "  ✓ K3  a failed extend stops the run"

    fresh keeper_stuck
    cp "$GOOD" "$PROBE/deployments.json"
    STUB_EXTEND_TTL=1000000 STUB_EXTEND_FAIL="" STUB_EXTEND_LAG=""
    status=0; keeper_run || status=$?
    STUB_EXTEND_TTL=""
    [ "$status" != 0 ] || refuse \
        "K4: every extend returned the same old TTL and the keeper called it a success." \
        "Re-uploading byte-identical code reuses the ledger entry, so every target can" \
        "report success and renew nothing. With all TTLs identical there is no spread."
    grep -q 'did not move' "$OUT" || refuse \
        "K4: the run failed, but not because the entries did not move." \
        "the absolute floor is the only thing that catches uniform non-movement."
    echo "  ✓ K4  an extend that reports success but does not move is caught"

    for bad in '{"contracts":{"breaker_core":null}}' '{"contracts":{"breaker_core":"CAAAA"}}'; do
        fresh keeper_plan_bad
        printf '%s\n' "$bad" > "$PROBE/deployments.json"
        status=0; keeper_run --plan || status=$?
        [ "$status" != 0 ] || refuse \
            "K5: --plan was green with zero targets ($bad)." \
            "A preflight that lists nothing and exits 0 is a green light wired to nothing."
        echo "  ✓ K5  --plan refuses a record that names no target"
    done

    fresh keeper_no_ttl
    cp "$GOOD" "$PROBE/deployments.json"
    STUB_EXTEND_NO_TTL=1
    status=0; keeper_run || status=$?
    STUB_EXTEND_NO_TTL=""
    [ "$status" != 0 ] || refuse \
        "K6: an extend that printed no TTL was read as a success." \
        "The extend is paid and the run reported success without a ledger to check."
    grep -q 'printed no TTL' "$OUT" || refuse \
        "K6: the run failed without saying the TTL was missing."
    echo "  ✓ K6  an extend with no TTL fails with a message"
}

variant_probe() {
    local input expected output
    need xxd "the level 11 recipe derives its case variant with it"
    input="$(printf 'BREAKER/VOSS/v1/diagnose_core' | xxd -p -c 256)"
    expected="$(printf 'BREAKER/VOSS/V1/DIAGNOSE_CORE' | xxd -p -c 256)"
    output="$(case_variant_hex "$input")"
    [ "$output" = "$expected" ] || {
        echo "✗ V1: the case variant of the historical manifest is not the expected bytes." >&2
        echo "  got:      $output" >&2
        echo "  expected: $expected" >&2
        echo "  The level 11 recipe crosses the deny list with this transformation; if it" >&2
        echo "  changes silently, the recipe stops solving the level while still looking" >&2
        echo "  like an exploit." >&2
        return 1
    }
    echo "  ✓ V1  the 11 recipe's case variant is the expected byte string"
}

scripts_job() {
    echo "── scripts ───────────────────────────────────────────────────"
    need jq "the probes and the recipe lint read levels.json"

    recipes_lint "$HERE" || exit 1
    echo "  ✓ every level has a recipe, and no recipe reads past the contract"

    variant_probe || exit 1

    sandbox_build

    local status deploys registers uploads invokes slug recorded local_hash levels auxes expected_deploys expected_registers

    levels="$(jq '.levels | length' levels.json)"
    auxes="$(jq '[.levels[] | select((.aux // "") != "")] | length' levels.json)"
    expected_deploys=$((levels + 2 + auxes))
    expected_registers="$levels"

    fresh smoke
    status=0; deploy_run || status=$?
    [ "$status" = 0 ] || refuse \
        "P0: a plain ./scripts/deploy.sh against a clean record did not finish (exit $status)." \
        "Everything below is a probe of a failure mode; none of them means anything if a" \
        "correct run does not pass."

    deploys="$(logged '^contract deploy')"
    registers="$(logged 'register_level')"
    [ "$deploys" = "$expected_deploys" ] && [ "$registers" = "$expected_registers" ] || refuse \
        "P0: the happy path changed shape — $deploys deploys and $registers \`register_level\`." \
        "Expected $expected_deploys deploys (the core, one validator per level, one" \
        "auxiliary contract where the manifest declares one, and the season NFT) and" \
        "$expected_registers registrations."
    cp "$PROBE/deployments.json" "$GOOD"
    echo "  ✓ P0  a clean run finishes: $deploys deploys, $registers register_level"

    fresh force
    cp "$GOOD" "$PROBE/deployments.json"
    status=0; deploy_run --force 00 || status=$?
    [ "$status" = 0 ] || refuse \
        "P1: ./scripts/deploy.sh --force 00 exited $status." \
        "\`00\` names level 0, and the record normalises ids before writing them. If the" \
        "script refuses the flag the record accepts, that is a third answer to one question."
    invokes="$(logged 'set_wasm_hash')"
    [ "$invokes" -ge 1 ] || refuse \
        "P1: --force 00 forced nothing — no \`set_wasm_hash\` reached the core." \
        "The record writes level 0 as \`0\`; the flag is typed as \`00\`. Comparing the two as" \
        "strings makes the flag a no-op that still reports success, and the level keeps" \
        "running the code the author was trying to replace."
    echo "  ✓ P1  --force 00 forces the level the record calls 0"

    fresh corrupt
    printf '{ "contracts": ' > "$PROBE/deployments.json"
    status=0; deploy_run || status=$?
    uploads="$(logged '^contract upload')"
    [ "$status" != 0 ] || refuse \
        "P2: a record that is not valid JSON was read as an EMPTY record." \
        "The run reported success. An unreadable record and an empty record must not look" \
        "alike: on an empty one this script deploys a SECOND core, and every player's" \
        "progress is on the first."
    [ "$uploads" = 0 ] || refuse \
        "P2: the script aborted, but only after uploading $uploads WASM(s)." \
        "The record has to be checked before anything reaches the ledger, not after."
    grep -q 'is not valid JSON' "$OUT" || refuse \
        "P2: the run stopped somewhere, but not because the record could not be read." \
        "A corrupt record has to be refused AS a corrupt record. Left to fail wherever it" \
        "happens to fail next, the script reads as \"nothing is registered\" for as long as" \
        "the first accidental error holds out — and that is how a second core gets deployed."
    echo "  ✓ P2  a corrupt record aborts with zero uploads"

    fresh store
    cp "$GOOD" "$PROBE/deployments.json"
    PROBE_TMPDIR=/dev/null
    status=0; deploy_run --force 00 || status=$?
    PROBE_TMPDIR=""
    invokes="$(logged '^contract invoke')"
    [ "$status" != 0 ] || refuse \
        "P3: the script could not write the record and reported success anyway." \
        "Every write goes through \`store\`; a \`store\` that fails silently leaves the file" \
        "describing a ledger that no longer matches it."
    [ "$invokes" = 0 ] || refuse \
        "P3: the record could not be written, and the script went on to talk to the core" \
        "anyway ($invokes \`contract invoke\` after the failed write)." \
        "The ledger would learn something the record never will — and the next run would" \
        "have no way to know it happened."
    grep -q 'could not write' "$OUT" || refuse \
        "P3: the run stopped, but nothing said the record was the reason." \
        "The write is the only step whose failure leaves the ledger and the file disagreeing," \
        "so it is the one failure that has to be named where it happens."
    echo "  ✓ P3  an unwritable record aborts before the core hears anything"

    fresh stale
    cp "$GOOD" "$PROBE/deployments.json"
    slug="$(jq -r '.levels[] | select(.id == 0) | .slug' levels.json)"
    printf 'wasm:edited-after-the-deploy\n' \
        > "$PROBE/contracts/target/wasm32v1-none/release/breaker_level_00_${slug}.wasm"
    local_hash="$(sha256sum "$PROBE/contracts/target/wasm32v1-none/release/breaker_level_00_${slug}.wasm" | cut -d' ' -f1)"
    recorded="$(jq -r '.contracts."breaker_level_00_'"$slug"'".wasm_hash // empty' "$GOOD")"
    status=0; deploy_run || status=$?
    uploads="$(logged '^contract upload')"
    [ "$status" != 0 ] || refuse \
        "P4: the ledger runs one WASM for level 0 and this tree builds another, and the" \
        "script said nothing and reported success." \
        "A skipped upload looks exactly like an upload that was not needed."
    [ "$uploads" = 0 ] || refuse \
        "P4: the script aborted, but only after uploading $uploads WASM(s)."
    grep -q "$recorded" "$OUT" && grep -q "$local_hash" "$OUT" || refuse \
        "P4: the refusal did not name both hashes." \
        "on the ledger: $recorded" \
        "local build:   $local_hash" \
        "Naming one of them leaves the reader unable to tell which side moved."
    echo "  ✓ P4  a stale level WASM aborts naming both hashes"

    fresh bad_manifest
    printf '{"levels":[{"id":0,"slug":"counter","name":"Counter","prerequisites":[]}]}' > "$PROBE/levels.json"
    status=0; deploy_run || status=$?
    uploads="$(logged '^contract upload')"
    [ "$status" != 0 ] || refuse \
        "P5: a levels.json whose name is a string was accepted and the deploy reported success." \
        "The level loop would read zero lines and the script would still print ✅ done."
    [ "$uploads" = 0 ] || refuse \
        "P5: the script aborted, but only after uploading $uploads WASM(s)."
    grep -q 'multilingual name' "$OUT" || refuse \
        "P5: the run stopped, but not because the manifest could not be read as levels."
    echo "  ✓ P5  a malformed levels.json aborts before any upload"

    fresh deploy_garbage
    STUB_DEPLOY_GARBAGE=1
    status=0; deploy_run || status=$?
    STUB_DEPLOY_GARBAGE=""
    [ "$status" != 0 ] || refuse \
        "P6: a deploy output without an address was read as a success." \
        "The contract is on the ledger and the record never learns its address."
    grep -q 'could not read the address' "$OUT" || refuse \
        "P6: the run failed without naming the address it could not read."
    echo "  ✓ P6  an unreadable deploy output is named, not swallowed"

    fresh force_unbuilt
    cp "$GOOD" "$PROBE/deployments.json"
    rm "$PROBE/contracts/target/wasm32v1-none/release/breaker_core.wasm"
    status=0; deploy_run --force 00 || status=$?
    [ "$status" != 0 ] || refuse \
        "P7: --force ran against a tree with no core WASM and reported success." \
        "The check that compares the local core with the ledger read an absent file as a hash."
    grep -q '<not built>' "$OUT" || refuse \
        "P7: the refusal did not report that the local core was not built."
    echo "  ✓ P7  --force without a built core fails with a message"

    echo
    echo "  the probes are the ways \`deploy.sh\` used to fail without saying so:"
    echo "    P1  a flag the record normalises and the script does not"
    echo "    P2  a record that cannot be read, read as an empty one"
    echo "    P3  a write that fails where the failure cannot travel"
    echo "    P4  a level whose code on the ledger is not the code in this tree"
    echo "    P5  a manifest whose levels cannot be read"
    echo "    P6  a deploy output without an address"
    echo "    P7  --force against a tree with no built core"
    echo "  they run against a stub \`stellar\` in a sandbox with an empty HOME — no network,"
    echo "  no keys, no \`deployments.json\` of the real repository."
    echo
    echo "  and the recipe lint, against recipes that are wrong on purpose:"
    lint_probes
    echo "  the lint is static. It says a recipe is shaped right, never that it solves the"
    echo "  level — confirm that separately on the network with authorization."
    echo

    echo "  and the keeper, whose whole job is to fail loudly when it cannot do its job:"
    keeper_probes
    echo "    K1  the same defect as P2, one layer out: a keeper with no targets is a"
    echo "        keeper that has already stopped, and it looks exactly like one that works"
    echo "    K2  an invalid result: an extend that reports success and"
    echo "        renews nothing, visible only as one entry falling behind the others"
    echo "  these are the half of the keeper that can be checked without a network. Whether"
    echo "  it actually moves the TTL requires an authorized network check."
}

case "$TARGET" in
    contracts) contracts_job ;;
    frontend)  frontend_job ;;
    scripts)   scripts_job ;;
    all)       contracts_job; frontend_job; scripts_job ;;
esac

echo "✅ ci: $TARGET"
