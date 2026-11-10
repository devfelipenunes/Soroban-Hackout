#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

#[contractclient(name = "OracleClient")]
pub trait OracleInterface {
    fn streak(env: Env, player: Address) -> u32;
    fn required_hits(env: Env) -> u32;
}

#[contract]
pub struct OracleValidator;

#[contractimpl]
impl OracleValidator {
    pub fn validate(env: Env, instance: Address, player: Address) -> bool {
        let oracle = OracleClient::new(&env, &instance);
        oracle.streak(&player) >= oracle.required_hits()
    }
}
