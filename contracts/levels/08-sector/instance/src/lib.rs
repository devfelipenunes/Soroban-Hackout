#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Bytes, BytesN, Env};

// Testnet currently permits 200 persistent ledger entries to be read by one
// transaction. A rebuild over 201 unique records necessarily exceeds that cap.
const THRESHOLD: u32 = 201;
const MAX_BATCH: u32 = 20;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Count,
    RecordAt(u32),
    Seen(BytesN<32>),
    RebuildStarted,
    Rebuilt,
}

#[contract]
pub struct Sector;

#[contractimpl]
impl Sector {
    pub fn __constructor(_env: Env, _player: soroban_sdk::Address) {}

    /// Anyone can add unique records. Small batches keep each write operation
    /// affordable while allowing the persistent archive to grow without a cap.
    pub fn add_records(env: Env, records: soroban_sdk::Vec<BytesN<32>>) {
        if records.len() > MAX_BATCH {
            panic!("batch too large");
        }

        let mut count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);

        for record in records.iter() {
            let seen_key = DataKey::Seen(record.clone());
            if !env.storage().persistent().has(&seen_key) {
                env.storage().persistent().set(&seen_key, &true);
                env.storage()
                    .persistent()
                    .set(&DataKey::RecordAt(count), &record);
                count = count.saturating_add(1);
            }
        }

        env.storage().instance().set(&DataKey::Count, &count);
    }

    pub fn count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    pub fn stored(env: Env) -> u32 {
        Self::count(env)
    }

    pub fn threshold(_env: Env) -> u32 {
        THRESHOLD
    }

    pub fn begin_rebuild(env: Env) {
        env.storage()
            .instance()
            .set(&DataKey::RebuildStarted, &true);
    }

    /// Rebuild the index by loading every persistent record. Once the archive
    /// exceeds the transaction read-entry budget, the host rejects this call.
    pub fn rebuild(env: Env) -> BytesN<32> {
        if !env
            .storage()
            .instance()
            .get(&DataKey::RebuildStarted)
            .unwrap_or(false)
        {
            panic!("rebuild not started");
        }

        let count = Self::count(env.clone());
        let mut material = Bytes::new(&env);
        for index in 0..count {
            let record: BytesN<32> = env
                .storage()
                .persistent()
                .get(&DataKey::RecordAt(index))
                .unwrap_or_else(|| panic!("archive record missing"));
            material.append(&Bytes::from_slice(&env, &record.to_array()));
        }

        let digest = env.crypto().sha256(&material);
        env.storage().instance().set(&DataKey::Rebuilt, &true);
        digest.into()
    }

    pub fn rebuild_started(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::RebuildStarted)
            .unwrap_or(false)
    }

    pub fn rebuilt(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Rebuilt)
            .unwrap_or(false)
    }
}
