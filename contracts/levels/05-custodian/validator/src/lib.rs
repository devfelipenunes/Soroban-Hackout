#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

#[contractclient(name = "CustodianClient")]
pub trait CustodianInterface {
    fn operator_identity(env: Env) -> u32;
    fn controller(env: Env, identity: u32) -> Address;
    fn gate_open(env: Env, caller: Address) -> bool;
}

#[contract]
pub struct CustodianValidator;

#[contractimpl]
impl CustodianValidator {
    pub fn validate(env: Env, instance: Address, player: Address) -> bool {
        let custodian = CustodianClient::new(&env, &instance);
        let identity = custodian.operator_identity();
        custodian.controller(&identity) == player && custodian.gate_open(&player)
    }
}
