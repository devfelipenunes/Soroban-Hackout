#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, symbol_short, Address, BytesN, Env, Val,
    Vec,
};

#[contractclient(name = "SectorClient")]
pub trait SectorInterface {
    fn revealed(env: Env) -> bool;
}

// Mirrors the instance's error codes: the validator recognises exactly `CorruptRecord`.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ArchiveIntact = 1,
    EmptyRecord = 2,
    CorruptRecord = 3,
}

#[contract]
pub struct SectorValidator;

#[contractimpl]
impl SectorValidator {
    pub fn validate(env: Env, instance: Address, _player: Address) -> bool {
        // `rebuild` only reads: a pass leaves nothing behind, a failure rolls back with the call.
        let outcome = env.try_invoke_contract::<BytesN<32>, Error>(
            &instance,
            &symbol_short!("rebuild"),
            Vec::<Val>::new(&env),
        );

        match outcome {
            Err(Ok(Error::CorruptRecord)) => SectorClient::new(&env, &instance).revealed(),
            _ => false,
        }
    }
}
