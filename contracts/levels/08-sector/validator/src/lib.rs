#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

#[contractclient(name = "SectorClient")]
pub trait SectorInterface {
    fn count(env: Env) -> u32;
    fn stored(env: Env) -> u32;
    fn threshold(env: Env) -> u32;
    fn revealed(env: Env) -> bool;
}

#[contract]
pub struct SectorValidator;

#[contractimpl]
impl SectorValidator {
    pub fn validate(env: Env, instance: Address, _player: Address) -> bool {
        let archive = SectorClient::new(&env, &instance);
        archive.count() >= archive.threshold()
            && archive.stored() < archive.threshold()
            && archive.revealed()
    }
}
