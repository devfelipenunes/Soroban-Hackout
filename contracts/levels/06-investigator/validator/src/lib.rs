#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

#[contractclient(name = "InvestigatorClient")]
pub trait InvestigatorInterface {
    fn recovered(env: Env) -> bool;
    fn rejected(env: Env) -> bool;
}

#[contract]
pub struct InvestigatorValidator;

#[contractimpl]
impl InvestigatorValidator {
    pub fn validate(env: Env, instance: Address, _player: Address) -> bool {
        let archive = InvestigatorClient::new(&env, &instance);
        archive.recovered() && archive.rejected()
    }
}
