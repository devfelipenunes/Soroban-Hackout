#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, BytesN, Env, Map, Vec};

const THRESHOLD: u32 = 500;

#[contracttype]
pub enum DataKey {
    Records,
    Unique,
    Count,
    Revealed,
}

#[contract]
pub struct Sector;

#[contractimpl]
impl Sector {
    pub fn __constructor(env: Env, player: Address) {
        let _ = player;
        env.storage()
            .instance()
            .set(&DataKey::Records, &Vec::<BytesN<32>>::new(&env));
        env.storage()
            .instance()
            .set(&DataKey::Unique, &Map::<BytesN<32>, bool>::new(&env));
        env.storage().instance().set(&DataKey::Count, &0u32);
        env.storage().instance().set(&DataKey::Revealed, &false);
    }

    pub fn add_records(env: Env, records: Vec<BytesN<32>>) {
        let mut all: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&DataKey::Records)
            .unwrap_or(Vec::new(&env));
        let mut unique: Map<BytesN<32>, bool> = env
            .storage()
            .instance()
            .get(&DataKey::Unique)
            .unwrap_or(Map::new(&env));
        let mut count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);

        for record in records.iter() {
            count = count.saturating_add(1);
            if !unique.contains_key(record.clone()) {
                unique.set(record.clone(), true);
                all.push_back(record);
            }
        }

        env.storage().instance().set(&DataKey::Records, &all);
        env.storage().instance().set(&DataKey::Unique, &unique);
        env.storage().instance().set(&DataKey::Count, &count);
    }

    pub fn count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    pub fn stored(env: Env) -> u32 {
        let all: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&DataKey::Records)
            .unwrap_or(Vec::new(&env));
        all.len()
    }

    pub fn threshold(_env: Env) -> u32 {
        THRESHOLD
    }

    pub fn snapshot(env: Env) -> Bytes {
        if Self::count(env.clone()) < THRESHOLD {
            panic!("archive intact");
        }

        env.storage().instance().set(&DataKey::Revealed, &true);
        Bytes::from_slice(
            &env,
            b"AREN VOSS // REFUSED\nSUBJECT: PLAYER // STATUS: ACTIVE",
        )
    }

    pub fn revealed(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Revealed)
            .unwrap_or(false)
    }
}
