#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, xdr::ToXdr, Address, Bytes, BytesN, Env, Vec,
};

const TTL_THRESHOLD: u32 = 17280;
const TTL_EXTEND_TO: u32 = 518400;

#[contracttype]
#[derive(Clone)]
pub struct LevelInfo {
    pub wasm_hash: BytesN<32>,
    pub validator: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LevelRegistered {
    #[topic]
    pub level_id: u32,
    pub wasm_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidatorSet {
    #[topic]
    pub level_id: u32,
    pub validator: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WasmHashSet {
    #[topic]
    pub level_id: u32,
    pub wasm_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrerequisitesSet {
    #[topic]
    pub level_id: u32,
    pub prerequisites: Vec<u32>,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Levels,
    Level(u32),
    Instances(Address, u32),
    Completed(Address, u32),
    OwnerOf(Address),
    Prerequisites(u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    LevelNotFound = 1,
    UnknownInstance = 2,
    AlreadyCompleted = 3,
    ObjectiveNotMet = 4,
    NotInitialised = 5,
    AccessLocked = 6,
    InvalidPrerequisite = 7,
}

#[contractclient(name = "ValidatorClient")]
pub trait ValidatorInterface {
    fn validate(env: Env, instance: Address, player: Address) -> bool;
}

#[contract]
pub struct BreakerCore;

#[contractimpl]
impl BreakerCore {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        Self::touch(&env);
    }

    pub fn register_level(env: Env, level_id: u32, wasm_hash: BytesN<32>, validator: Address) {
        Self::admin(&env).require_auth();

        if env.storage().instance().has(&DataKey::Level(level_id)) {
            Self::touch(&env);
            return;
        }

        Self::write_level(
            &env,
            level_id,
            &LevelInfo {
                wasm_hash: wasm_hash.clone(),
                validator,
            },
        );

        let mut levels: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::Levels)
            .unwrap_or(Vec::new(&env));
        levels.push_back(level_id);
        env.storage().instance().set(&DataKey::Levels, &levels);
        Self::touch(&env);

        LevelRegistered {
            level_id,
            wasm_hash,
        }
        .publish(&env);
    }

    pub fn set_validator(env: Env, level_id: u32, validator: Address) {
        Self::mutate_level(&env, level_id, |info| info.validator = validator.clone());

        ValidatorSet {
            level_id,
            validator,
        }
        .publish(&env);
    }

    pub fn set_wasm_hash(env: Env, level_id: u32, wasm_hash: BytesN<32>) {
        Self::mutate_level(&env, level_id, |info| info.wasm_hash = wasm_hash.clone());

        WasmHashSet {
            level_id,
            wasm_hash,
        }
        .publish(&env);
    }

    pub fn set_prerequisites(env: Env, level_id: u32, prerequisites: Vec<u32>) {
        Self::admin(&env).require_auth();
        let level_position = Self::level_position(&env, level_id);
        let mut seen = Vec::new(&env);

        for prerequisite in prerequisites.iter() {
            let prerequisite_position = Self::level_position(&env, prerequisite);
            if prerequisite_position >= level_position || seen.contains(prerequisite) {
                panic_with_error!(&env, Error::InvalidPrerequisite);
            }
            seen.push_back(prerequisite);
        }

        env.storage()
            .instance()
            .set(&DataKey::Prerequisites(level_id), &prerequisites);
        Self::touch(&env);

        PrerequisitesSet {
            level_id,
            prerequisites,
        }
        .publish(&env);
    }

    pub fn create_instance(env: Env, player: Address, level_id: u32) -> Address {
        player.require_auth();

        if !Self::can_access(env.clone(), player.clone(), level_id) {
            panic_with_error!(&env, Error::AccessLocked);
        }

        let info = Self::read_level_info(&env, level_id);

        let mut instances: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Instances(player.clone(), level_id))
            .unwrap_or(Vec::new(&env));

        let attempt = instances.len();
        let salt = Self::salt(&env, &player, level_id, attempt);

        let instance = env.deployer().with_current_contract(salt).deploy_contract(
            soroban_sdk::ContractExecutable::Wasm(info.wasm_hash),
            (player.clone(),),
        );

        instances.push_back(instance.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Instances(player.clone(), level_id), &instances);
        env.storage().persistent().extend_ttl(
            &DataKey::Instances(player.clone(), level_id),
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );
        env.storage()
            .persistent()
            .set(&DataKey::OwnerOf(instance.clone()), &(player, level_id));
        env.storage().persistent().extend_ttl(
            &DataKey::OwnerOf(instance.clone()),
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );

        instance
    }

    pub fn submit_instance(env: Env, instance: Address) {
        let (player, level_id): (Address, u32) = env
            .storage()
            .persistent()
            .get(&DataKey::OwnerOf(instance.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::UnknownInstance));

        player.require_auth();

        if !Self::can_access(env.clone(), player.clone(), level_id) {
            panic_with_error!(&env, Error::AccessLocked);
        }

        if Self::is_completed(env.clone(), player.clone(), level_id) {
            panic_with_error!(&env, Error::AlreadyCompleted);
        }

        let info = Self::read_level_info(&env, level_id);
        let validator = ValidatorClient::new(&env, &info.validator);
        if !validator.validate(&instance, &player) {
            panic_with_error!(&env, Error::ObjectiveNotMet);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Completed(player.clone(), level_id), &true);
        env.storage().persistent().extend_ttl(
            &DataKey::Completed(player, level_id),
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );
    }

    pub fn levels(env: Env) -> Vec<u32> {
        env.storage()
            .instance()
            .get(&DataKey::Levels)
            .unwrap_or(Vec::new(&env))
    }

    pub fn level_info(env: Env, level_id: u32) -> LevelInfo {
        Self::read_level_info(&env, level_id)
    }

    pub fn instances(env: Env, player: Address, level_id: u32) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Instances(player, level_id))
            .unwrap_or(Vec::new(&env))
    }

    pub fn is_completed(env: Env, player: Address, level_id: u32) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Completed(player, level_id))
            .unwrap_or(false)
    }

    pub fn can_access(env: Env, player: Address, level_id: u32) -> bool {
        Self::read_level_info(&env, level_id);
        let prerequisites: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::Prerequisites(level_id))
            .unwrap_or(Vec::new(&env));

        for prerequisite in prerequisites.iter() {
            if !Self::is_completed(env.clone(), player.clone(), prerequisite) {
                return false;
            }
        }

        true
    }
}

impl BreakerCore {
    fn touch(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialised))
    }

    fn read_level_info(env: &Env, level_id: u32) -> LevelInfo {
        env.storage()
            .instance()
            .get(&DataKey::Level(level_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::LevelNotFound))
    }

    fn level_position(env: &Env, level_id: u32) -> u32 {
        let levels: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::Levels)
            .unwrap_or(Vec::new(env));

        for (position, registered) in levels.iter().enumerate() {
            if registered == level_id {
                return position as u32;
            }
        }

        panic_with_error!(env, Error::LevelNotFound)
    }

    fn write_level(env: &Env, level_id: u32, info: &LevelInfo) {
        env.storage()
            .instance()
            .set(&DataKey::Level(level_id), info);
        Self::touch(env);
    }

    fn mutate_level<F>(env: &Env, level_id: u32, mutate: F) -> LevelInfo
    where
        F: FnOnce(&mut LevelInfo),
    {
        Self::admin(env).require_auth();

        let mut info = Self::read_level_info(env, level_id);
        mutate(&mut info);
        Self::write_level(env, level_id, &info);

        info
    }

    fn salt(env: &Env, player: &Address, level_id: u32, attempt: u32) -> BytesN<32> {
        let mut data = Bytes::new(env);
        data.append(&player.clone().to_xdr(env));
        data.extend_from_array(&level_id.to_be_bytes());
        data.extend_from_array(&attempt.to_be_bytes());
        env.crypto().sha256(&data).to_bytes()
    }
}
