#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

#[contractclient(name = "CustodianClient")]
pub trait CustodianInterface {
    fn balance(env: Env, owner: Address) -> i128;
    fn threshold(env: Env) -> i128;
    fn gate_open(env: Env, caller: Address) -> bool;
}

#[contract]
pub struct CustodianValidator;

#[contractimpl]
impl CustodianValidator {
    pub fn validate(env: Env, instance: Address, player: Address) -> bool {
        let custodian = CustodianClient::new(&env, &instance);
        custodian.balance(&player) >= custodian.threshold() && custodian.gate_open(&player)
    }
}
