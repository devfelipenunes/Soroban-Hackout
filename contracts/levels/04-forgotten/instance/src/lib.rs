#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, Env, Vec};

const LAST_PUBLIC_FLOOR: u32 = 999;
const FORGOTTEN_FLOOR: u32 = 1_000;
const TTL_THRESHOLD: u32 = 300_000;
const TTL_EXTEND_TO: u32 = 518_400;

#[contracttype]
pub enum DataKey {
    Floors,
    Floor(u32),
    Renewed(u32),
}

#[contract]
pub struct Forgotten;

#[contractimpl]
impl Forgotten {
    pub fn __constructor(env: Env, player: Address) {
        let _ = player;

        let mut floors = Vec::new(&env);
        for floor_id in 1u32..=LAST_PUBLIC_FLOOR {
            floors.push_back(floor_id);
        }
        env.storage().instance().set(&DataKey::Floors, &floors);

        env.storage().persistent().set(
            &DataKey::Floor(FORGOTTEN_FLOOR),
            &Bytes::from_slice(&env, b"FIRST LAYER"),
        );
        env.storage()
            .instance()
            .set(&DataKey::Renewed(FORGOTTEN_FLOOR), &false);
    }

    pub fn floors(env: Env) -> Vec<u32> {
        env.storage().instance().get(&DataKey::Floors).unwrap()
    }

    pub fn floor(env: Env, floor_id: u32) -> Bytes {
        if floor_id <= LAST_PUBLIC_FLOOR {
            return Bytes::from_slice(&env, b"LOWER MERIDIAN");
        }

        env.storage()
            .persistent()
            .get(&DataKey::Floor(floor_id))
            .unwrap()
    }

    pub fn renewed(env: Env, floor_id: u32) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Renewed(floor_id))
            .unwrap_or(false)
    }

    pub fn renew_floor(env: Env, floor_id: u32) {
        if floor_id != LAST_PUBLIC_FLOOR {
            panic!("only the last public floor has the hidden successor");
        }

        let target = floor_id.saturating_add(1);
        let key = DataKey::Floor(target);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        let mut floors: Vec<u32> = env.storage().instance().get(&DataKey::Floors).unwrap();
        if !floors.iter().any(|existing| existing == target) {
            floors.push_back(target);
            env.storage().instance().set(&DataKey::Floors, &floors);
        }

        env.storage()
            .instance()
            .set(&DataKey::Renewed(target), &true);
    }
}
