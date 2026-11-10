# Scripts

> **State:** local execution and validation instructions.

Commands below start from the repository root.

| Command | Effect |
|---|---|
| `./scripts/ci.sh scripts` | Local probes with a simulated CLI; no network |
| `./scripts/keeper.sh --plan` | Lists record targets, no network |
| `./scripts/new-level.sh ...` | Creates files and changes the catalog/crates |
| `./scripts/deploy.sh` | Build, upload, deploy, record and bindings; writes to the network |
| `./scripts/exploit.sh <id>` | Creates and solves an instance on the network |
| `./scripts/keeper.sh` | Sends transactions to extend TTL |
| `node scripts/ui-check.cjs [--sign] [--level 10\|11\|12]` | Checks the levels 10–12 UI in the browser; `--sign` runs the exploit with a local signature |

- Use Bash and LF line endings. Preserve `set -euo pipefail` and non-zero failures.
- `lib.sh` is shared; check its callers when changing interfaces.
- Preserve the probes for invalid records, mismatched hashes and failed record writes.
- Preserve `--optimize=false` on upload and the WASM hash comparison.
- `--fresh` creates a new core and changes the progress reference. The record is prepared in a temporary file; failures preserve the previous record and leave the partial recoverable. `--force` swaps a case's target and validator; old instance states are not rewritten.
- `levels.json` declares the on-chain prerequisites. The deploy reapplies them for every registered level. `--open-progression` clears the configuration and only accepts `NETWORK=testnet` with `RECORD` pointing at this tree's `deployments.sandbox.json`; use it only in the E2E sandbox.
- Exploit recipes are sourced into the runner's shell: do not use `cd` or `exit 0`. Use only the interface the runner provides.
- When changing scripts, run `bash -n` on the changed files and `./scripts/ci.sh scripts`. The probes do not prove that an exploit works on the network.
- `ui-check.cjs` is a manual UI check for levels 10–12; it needs Playwright/Chromium and does not run in CI.
