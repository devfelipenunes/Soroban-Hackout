#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

#[contractclient(name = "StealClient")]
pub trait StealInterface {
    fn access(env: Env, player: Address) -> bool;
    fn rewritten(env: Env) -> bool;
    fn hatch_open(env: Env) -> bool;
}

#[contract]
pub struct StealValidator;

#[contractimpl]
impl StealValidator {
    pub fn validate(env: Env, instance: Address, player: Address) -> bool {
        let spire = StealClient::new(&env, &instance);
        spire.access(&player) && spire.rewritten() && !spire.hatch_open()
    }
}
