#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

#[contractclient(name = "DeadmanClient")]
pub trait DeadmanInterface {
    fn admin(env: Env) -> Address;
    fn released(env: Env) -> bool;
    fn balance(env: Env, who: Address) -> i128;
}

#[contract]
pub struct DeadmanValidator;

#[contractimpl]
impl DeadmanValidator {
    pub fn validate(env: Env, instance: Address, player: Address) -> bool {
        let registry = DeadmanClient::new(&env, &instance);
        registry.admin() == player && registry.released() && registry.balance(&player) > 0
    }
}
