#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

#[contractclient(name = "ImpossibleClient")]
pub trait ImpossibleInterface {
    fn credit(env: Env, player: Address) -> u32;
    fn impossible(env: Env) -> u32;
}

#[contract]
pub struct ImpossibleValidator;

#[contractimpl]
impl ImpossibleValidator {
    pub fn validate(env: Env, instance: Address, player: Address) -> bool {
        let account = ImpossibleClient::new(&env, &instance);
        account.credit(&player) == account.impossible()
    }
}
