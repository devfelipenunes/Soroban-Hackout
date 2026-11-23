#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env, Vec,
};

const VERSION: u8 = 1;
const RECORD_LEN: u32 = 33;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// archive intact: every record is well formed, so there is nothing to dump
    ArchiveIntact = 1,
    /// empty record: a record needs at least one byte
    EmptyRecord = 2,
    /// corrupt record: a record must be 33 bytes, the first one being the version 1
    CorruptRecord = 3,
}

#[contracttype]
pub enum DataKey {
    Records,
    Revealed,
}

#[contract]
pub struct Sector;

#[contractimpl]
impl Sector {
    pub fn __constructor(env: Env, player: Address) {
        let _ = player;

        let mut records = Vec::<Bytes>::new(&env);
        for id in 1u8..=3 {
            let mut raw = [0u8; RECORD_LEN as usize];
            raw[0] = VERSION;
            raw[1] = id;
            records.push_back(Bytes::from_array(&env, &raw));
        }

        env.storage().instance().set(&DataKey::Records, &records);
        env.storage().instance().set(&DataKey::Revealed, &false);
    }

    /// Appends records to the archive. A record is stored as long as it is not empty.
    /// Records are never removed.
    pub fn add_records(env: Env, records: Vec<Bytes>) {
        let mut all = Self::load(&env);

        for record in records.iter() {
            if record.is_empty() {
                panic_with_error!(&env, Error::EmptyRecord);
            }
            all.push_back(record);
        }

        env.storage().instance().set(&DataKey::Records, &all);
    }

    /// The maintenance pass: reads every record and digests the archive. A record is
    /// well formed when it has 33 bytes and the first byte is the version, 1. One
    /// malformed record makes the whole pass fail.
    pub fn rebuild(env: Env) -> BytesN<32> {
        let mut material = Bytes::new(&env);

        for record in Self::load(&env).iter() {
            if !Self::is_well_formed(&record) {
                panic_with_error!(&env, Error::CorruptRecord);
            }
            material.append(&record);
        }

        env.crypto().sha256(&material).into()
    }

    pub fn stored(env: Env) -> u32 {
        Self::load(&env).len()
    }

    /// The raw dump of the archive. It only answers once the archive is broken.
    pub fn snapshot(env: Env) -> Bytes {
        let intact = Self::load(&env)
            .iter()
            .all(|record| Self::is_well_formed(&record));
        if intact {
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

    fn load(env: &Env) -> Vec<Bytes> {
        env.storage()
            .instance()
            .get(&DataKey::Records)
            .unwrap_or(Vec::new(env))
    }

    fn is_well_formed(record: &Bytes) -> bool {
        record.len() == RECORD_LEN && record.get(0) == Some(VERSION)
    }
}
