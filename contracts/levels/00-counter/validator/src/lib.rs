#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

#[contractclient(name = "CounterClient")]
pub trait CounterInterface {
    fn count(env: Env) -> u32;
}

#[contract]
pub struct CounterValidator;

#[contractimpl]
impl CounterValidator {
    pub fn validate(env: Env, instance: Address, _player: Address) -> bool {
        CounterClient::new(&env, &instance).count() >= 1
    }
}
