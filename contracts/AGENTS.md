# Contratos

> **Estado:** instruções locais de build, teste e segurança.

- Leia `Cargo.toml` e `rust-toolchain.toml`; preserve pins de SDK e toolchain.
- Neste diretório: `./build.sh && cargo test`. O harness usa WASMs do disco; construa antes de testar.
- Não substitua `stellar contract build` por `cargo build` no build de contratos.
- Preserve as invariantes do núcleo descritas na AGENTS da raiz.
- Cada caso precisa de teste de estado inicial não resolvido e teste do exploit resolvido.
- Um teste nativo não substitui evidência do comportamento WASM. Não afrouxe o validador para passar testes.
- Alterações de ABI, storage ou toolchain exigem avaliar o impacto nos bindings, hashes e instâncias existentes. O núcleo não tem upgrade.
- Registre novos casos em `../levels.json` usando o gerador existente; mantenha o catálogo, crates e harness coerentes.
- Validar na rede exige autorização específica. Não execute deploy como efeito colateral de build.
