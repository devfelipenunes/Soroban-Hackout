#![no_std]
use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};
#[contractclient(name = "RewriteClient")]
pub trait RewriteInterface {
    fn manifest_verified(env: Env) -> bool;
    fn voss_proof(env: Env) -> bool;
    fn decoder_failed(env: Env) -> bool;
}
#[contract]
pub struct RewriteValidator;
#[contractimpl]
impl RewriteValidator {
    pub fn validate(env: Env, instance: Address, _player: Address) -> bool {
        let c = RewriteClient::new(&env, &instance);
        c.manifest_verified() && c.voss_proof() && c.decoder_failed()
    }
}
