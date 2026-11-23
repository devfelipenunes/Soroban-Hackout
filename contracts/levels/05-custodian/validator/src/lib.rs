#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

#[contractclient(name = "CustodianClient")]
pub trait CustodianInterface {
    fn gate_open(env: Env, caller: Address) -> bool;
}

#[contract]
pub struct CustodianValidator;

#[contractimpl]
impl CustodianValidator {
    // Only `enter` opens the gate, and it checks the chain of parents on the way: the validator
    // reads what the instance decided.
    pub fn validate(env: Env, instance: Address, player: Address) -> bool {
        CustodianClient::new(&env, &instance).gate_open(&player)
    }
}
