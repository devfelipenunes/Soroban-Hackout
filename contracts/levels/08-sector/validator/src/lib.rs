#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, symbol_short, Address, BytesN, Env,
    InvokeError, Val, Vec,
};

#[contractclient(name = "SectorClient")]
pub trait SectorInterface {
    fn revealed(env: Env) -> bool;
}

// Mirrors the instance's error codes: a *named* error is a refusal, not the denial of service.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ArchiveIntact = 1,
    WeightTooLarge = 2,
}

#[contract]
pub struct SectorValidator;

#[contractimpl]
impl SectorValidator {
    pub fn validate(env: Env, instance: Address, _player: Address) -> bool {
        // `rebuild` only reads: a pass leaves nothing behind, a trap rolls back with the call.
        let outcome = env.try_invoke_contract::<BytesN<32>, Error>(
            &instance,
            &symbol_short!("rebuild"),
            Vec::<Val>::new(&env),
        );

        // The denial of service is a trap of the VM (the unchecked sum overflowing), not an
        // error the contract names.
        match outcome {
            Err(Err(InvokeError::Abort)) => SectorClient::new(&env, &instance).revealed(),
            _ => false,
        }
    }
}
