#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
pub enum DataKey {
    Owner,
    Count,
}

#[contract]
pub struct Counter;

#[contractimpl]
impl Counter {
    pub fn __constructor(env: Env, player: Address) {
        env.storage().instance().set(&DataKey::Owner, &player);
        env.storage().instance().set(&DataKey::Count, &0u32);
    }

    pub fn increment(env: Env) {
        read_owner(&env).require_auth();
        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        env.storage().instance().set(&DataKey::Count, &(count + 1));
    }

    pub fn count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    pub fn owner(env: Env) -> Address {
        read_owner(&env)
    }
}

fn read_owner(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Owner).unwrap()
}
