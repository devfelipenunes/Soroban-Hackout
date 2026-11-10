# Breaker

**Breaker** is a capture-the-flag game for **Stellar/Soroban**. Each level is a deliberately
vulnerable contract that the player has to exploit to move forward.

> **Status:** 13 levels are live on testnet in the playable era `CDUVH22U…`, with on-chain
> progression from 0 to 12. The sandbox era `CDWHNWW6…` carries the same cases without
> prerequisites, for development and demos. Both are testnet.

## What it is

- A progressive game about real Soroban vulnerabilities.
- Every player gets their own on-chain instance of each level.
- Validation is on-chain: a contract checks whether the objective was met.
- Interaction happens in the browser's native DevTools console.
- Anyone can write a level; official levels are curated, and your own run in your own game.

## What it is not

- **Not an adapted EVM CTF.** Reentrancy is impossible in Soroban — the host rejects the
  A→B→A pattern (CAP-0046-11). The level repertoire here is necessarily different.
- **Not a course.** It is a game. The text teaches the minimum; understanding comes from exploring.
- **Not an audit tool.** It does not replace Scout, Sanctifier or a manual audit.
- **Not mainnet.** The MVP runs on testnet.

> **This repository has no production code.** Breaker is a **zolvency** educational project.
> The contracts are broken on purpose — each level is a planted vulnerability meant to be exploited.

## The thesis

> The vulnerabilities that matter in Soroban are different from the ones in EVM, and nobody is
> teaching them in practice.

Missing or mis-scoped `require_auth`, replay in a custom account, unauthorized WASM upgrade,
partial state corruption through `try_invoke_contract`, TTL and archival, deliberate overflow —
none of these has a direct EVM equivalent, and none has a place to be practiced.

## Environment

All requirements are user-local; no `sudo`.

| Requirement | Version / note |
|---|---|
| Node 22 LTS | 22.23.2 |
| Rust + `wasm32v1-none` target | 1.98.1 |
| `stellar-cli` | 28.0.0, pinned |
| Funded testnet account | use a `stellar keys` identity |

## Running

```bash
./scripts/ci.sh all              # everything CI checks, the same way it checks

cd contracts && ./build.sh && cargo test
cd frontend && npm ci && npm test
cd frontend && npm run dev                 # playable campaign at http://localhost:5173
cd frontend && VITE_DEPLOYMENT_PROFILE=sandbox npm run dev  # sandbox, no progression

./scripts/deploy.sh              # deploy what is missing (writes to testnet)
./scripts/exploit.sh 1           # run one level's exploit against the network
./scripts/keeper.sh --plan       # what the keeper would extend, without touching the network
```

**Build contracts with `./contracts/build.sh`**, which calls `stellar contract build`.
Never call `cargo` directly: the two produce different bytes for the same source, and the
ledger hash would stop matching what the player rebuilds.

**Commands that write to the network are gated.** Read [`AGENTS.md`](AGENTS.md) before running
`deploy.sh` or `exploit.sh`.

## Repository layout

```
.
├── AGENTS.md            instructions for AI agents
├── levels.json          level catalog and prerequisites
├── contracts/           core, levels, validators and harness
├── frontend/            game and interface
└── scripts/             deploy, keeper and local checks
```

## Status

- All 13 levels (ids 0–12) are implemented and covered by the two-test rule.
- Contracts 11 (`Rewrite`) and 12 (`The Architect`) are implemented and present in the
  deployment records.
- The browser campaign has not been played end to end yet.
- On-chain progress has a 30-day persistent TTL and no renewal path yet; a new era will fix it.
