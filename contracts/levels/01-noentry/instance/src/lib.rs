#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

const SERVICE_DOOR: u32 = 17;

#[contracttype]
pub enum DataKey {
    Owner(u32),
    Open(u32),
}

#[contract]
pub struct Noentry;

#[contractimpl]
impl Noentry {
    pub fn __constructor(env: Env, player: Address) {
        let _ = player;
        env.storage().instance().set(
            &DataKey::Owner(SERVICE_DOOR),
            &env.current_contract_address(),
        );
        env.storage()
            .instance()
            .set(&DataKey::Open(SERVICE_DOOR), &false);
    }

    pub fn open(env: Env, owner: Address, door_id: u32) {
        let stored: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner(door_id))
            .unwrap();
        if stored != owner {
            panic!("wrong owner");
        }
        env.storage().instance().set(&DataKey::Open(door_id), &true);
    }

    pub fn owner_of(env: Env, door_id: u32) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Owner(door_id))
            .unwrap()
    }

    pub fn is_open(env: Env, door_id: u32) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Open(door_id))
            .unwrap_or(false)
    }
}
