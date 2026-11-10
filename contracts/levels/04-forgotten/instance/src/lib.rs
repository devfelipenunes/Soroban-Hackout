#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, Env, Vec};

const FORGOTTEN_FLOOR: u32 = 24;
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

        env.storage().instance().set(
            &DataKey::Floors,
            &Vec::from_slice(
                &env,
                &[
                    1u32, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
                    22, 23,
                ],
            ),
        );

        for floor_id in 1u32..=23 {
            env.storage().persistent().set(
                &DataKey::Floor(floor_id),
                &Bytes::from_slice(&env, b"LOWER MERIDIAN"),
            );
        }

        env.storage().persistent().set(
            &DataKey::Floor(FORGOTTEN_FLOOR),
            &Bytes::from_slice(&env, b"FIRST LAYER"),
        );
        env.storage()
            .persistent()
            .set(&DataKey::Renewed(FORGOTTEN_FLOOR), &false);
    }

    pub fn floors(env: Env) -> Vec<u32> {
        env.storage().instance().get(&DataKey::Floors).unwrap()
    }

    pub fn floor(env: Env, floor_id: u32) -> Bytes {
        env.storage()
            .persistent()
            .get(&DataKey::Floor(floor_id))
            .unwrap()
    }

    pub fn renewed(env: Env, floor_id: u32) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Renewed(floor_id))
            .unwrap_or(false)
    }

    pub fn renew_floor(env: Env, floor_id: u32) {
        let target = floor_id.saturating_add(1);
        let key = DataKey::Floor(target);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage()
            .persistent()
            .set(&DataKey::Renewed(target), &true);
    }
}
