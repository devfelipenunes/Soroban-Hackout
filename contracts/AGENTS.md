# Contracts

> **State:** local build, test and security instructions.

- Read `Cargo.toml` and `rust-toolchain.toml`; preserve the SDK and toolchain pins.
- In this directory: `./build.sh && cargo test`. The harness uses WASMs from disk; build before testing.
- Do not replace `stellar contract build` with `cargo build` for contract builds.
- Preserve the core invariants described in the root AGENTS.md.
- Every case needs a not-solved-yet test and an exploit-solved test.
- A native test does not replace evidence of WASM behavior. Do not loosen the validator to pass tests.
- ABI, storage or toolchain changes require assessing the impact on bindings, hashes and existing instances. The core has no upgrade.
- Register new cases in `../levels.json` with the existing generator; keep the catalog, crates and harness in agreement.
- Validating on the network requires specific authorization. Do not deploy as a side effect of a build.
