#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Env};

const GHOST_DEVICE: u32 = 17;

#[contractclient(name = "WarehouseClient")]
pub trait WarehouseInterface {
    fn owner_of(env: Env, item_id: u32) -> Address;
}

#[contract]
pub struct WarehouseValidator;

#[contractimpl]
impl WarehouseValidator {
    pub fn validate(env: Env, instance: Address, player: Address) -> bool {
        WarehouseClient::new(&env, &instance).owner_of(&GHOST_DEVICE) == player
    }
}
