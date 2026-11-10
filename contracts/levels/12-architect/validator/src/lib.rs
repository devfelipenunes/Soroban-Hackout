#![no_std]
use soroban_sdk::{contract, contractclient, contractimpl, contracttype, Address, Env};
#[contracttype]
#[derive(Clone, PartialEq, Eq)]
pub enum Payload {
    DiagnoseCore,
    OpenForensicSession(Address),
}
#[contractclient(name = "ArchitectClient")]
pub trait ArchitectInterface {
    fn evidence_verified(env: Env) -> bool;
    fn rewritten(env: Env) -> bool;
    fn session(env: Env, player: Address) -> bool;
    fn original(env: Env) -> Payload;
    fn executed_payload(env: Env) -> Option<Payload>;
}
#[contract]
pub struct ArchitectValidator;
#[contractimpl]
impl ArchitectValidator {
    pub fn validate(env: Env, instance: Address, player: Address) -> bool {
        let c = ArchitectClient::new(&env, &instance);
        let other_owner = match c.executed_payload() {
            Some(Payload::OpenForensicSession(who)) => who != player,
            _ => false,
        };
        other_owner
            && c.evidence_verified()
            && c.rewritten()
            && c.session(&player)
            && c.original() == Payload::DiagnoseCore
    }
}
