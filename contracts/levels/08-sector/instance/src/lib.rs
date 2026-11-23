#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env, Vec,
};

/// A record's weight must fit an `i32`: it looks like a safe ceiling, and it is the only check
/// the door makes.
const MAX_WEIGHT: u32 = i32::MAX as u32;
const SEED_WEIGHTS: [u32; 3] = [100, 200, 300];

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// archive intact: the maintenance pass still runs, so there is nothing to dump
    ArchiveIntact = 1,
    /// weight too large: a record's weight must fit an i32 (at most 2147483647)
    WeightTooLarge = 2,
}

#[contracttype]
pub enum DataKey {
    Weights,
    Revealed,
}

#[contract]
pub struct Sector;

#[contractimpl]
impl Sector {
    pub fn __constructor(env: Env, player: Address) {
        let _ = player;

        let mut weights = Vec::<u32>::new(&env);
        for weight in SEED_WEIGHTS {
            weights.push_back(weight);
        }

        env.storage().instance().set(&DataKey::Weights, &weights);
        env.storage().instance().set(&DataKey::Revealed, &false);
    }

    /// Appends one record per weight. Each weight is checked on its own, against the ceiling.
    /// Records are never removed.
    pub fn add_records(env: Env, weights: Vec<u32>) {
        let mut all = Self::load(&env);

        for weight in weights.iter() {
            if weight > MAX_WEIGHT {
                panic_with_error!(&env, Error::WeightTooLarge);
            }
            all.push_back(weight);
        }

        env.storage().instance().set(&DataKey::Weights, &all);
    }

    /// The maintenance pass: totals the weight of every record and digests the archive.
    pub fn rebuild(env: Env) -> BytesN<32> {
        let mut total: u32 = 0;
        let mut material = Bytes::new(&env);

        for weight in Self::load(&env).iter() {
            total += weight;
            material.extend_from_array(&weight.to_be_bytes());
        }

        material.extend_from_array(&total.to_be_bytes());
        env.crypto().sha256(&material).into()
    }

    pub fn stored(env: Env) -> u32 {
        Self::load(&env).len()
    }

    /// The raw dump of the archive. It only answers once the maintenance pass is dead.
    pub fn snapshot(env: Env) -> Bytes {
        let total = Self::load(&env)
            .iter()
            .try_fold(0u32, |sum, weight| sum.checked_add(weight));
        if total.is_some() {
            panic_with_error!(&env, Error::ArchiveIntact);
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

    fn load(env: &Env) -> Vec<u32> {
        env.storage()
            .instance()
            .get(&DataKey::Weights)
            .unwrap_or(Vec::new(env))
    }
}
