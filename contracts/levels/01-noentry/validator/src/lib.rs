#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

const SERVICE_DOOR: u32 = 17;

#[contractclient(name = "NoentryClient")]
pub trait NoentryInterface {
    fn owner_of(env: Env, door_id: u32) -> Address;
    fn is_open(env: Env, door_id: u32) -> bool;
}

#[contract]
pub struct NoentryValidator;

#[contractimpl]
impl NoentryValidator {
    pub fn validate(env: Env, instance: Address, player: Address) -> bool {
        let door = NoentryClient::new(&env, &instance);
        door.is_open(&SERVICE_DOOR) && door.owner_of(&SERVICE_DOOR) != player
    }
}
