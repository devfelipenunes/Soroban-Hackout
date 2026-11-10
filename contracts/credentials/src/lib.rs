#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, Address, Env, String, Vec,
};
use stellar_tokens::non_fungible::Base;

const TTL_THRESHOLD: u32 = 17280;
const TTL_EXTEND_TO: u32 = 518400;

const METADATA_BASE: &str = "brecha://season";

#[contracttype]
pub enum DataKey {
    Admin,
    Core,
    Cases,
    Uri,
    Claimed(Address),
    TokenOf(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotCompleted = 1,
    AlreadyClaimed = 2,
    NonTransferable = 3,
    InvalidCases = 4,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SeasonClaimed {
    #[topic]
    pub player: Address,
    pub token_id: u32,
}

#[contractclient(name = "CoreClient")]
pub trait CoreInterface {
    fn is_completed(env: Env, player: Address, level_id: u32) -> bool;
}

#[contract]
pub struct BreakerSeason;

#[contractimpl]
impl BreakerSeason {
    pub fn __constructor(
        env: Env,
        admin: Address,
        core: Address,
        cases: Vec<u32>,
        name: String,
        symbol: String,
        uri: String,
    ) {
        if cases.is_empty() {
            panic_with_error!(&env, Error::InvalidCases);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Core, &core);
        env.storage().instance().set(&DataKey::Cases, &cases);
        env.storage().instance().set(&DataKey::Uri, &uri);
        Base::set_metadata(&env, String::from_str(&env, METADATA_BASE), name, symbol);
        Self::touch(&env);
    }

    pub fn claim(env: Env, player: Address) -> u32 {
        player.require_auth();
        if env
            .storage()
            .instance()
            .has(&DataKey::Claimed(player.clone()))
        {
            panic_with_error!(&env, Error::AlreadyClaimed);
        }

        let core = Self::core(&env);
        let cases = Self::cases(&env);
        let client = CoreClient::new(&env, &core);
        for level_id in cases.iter() {
            if !client.is_completed(&player, &level_id) {
                panic_with_error!(&env, Error::NotCompleted);
            }
        }

        let token_id = Base::mint(&env, &player);
        env.storage()
            .instance()
            .set(&DataKey::Claimed(player.clone()), &token_id);
        env.storage()
            .instance()
            .set(&DataKey::TokenOf(player.clone()), &token_id);
        Self::touch(&env);

        SeasonClaimed { player, token_id }.publish(&env);
        token_id
    }

    pub fn has_claimed(env: Env, player: Address) -> bool {
        env.storage().instance().has(&DataKey::Claimed(player))
    }

    pub fn token_of(env: Env, player: Address) -> Option<u32> {
        env.storage().instance().get(&DataKey::TokenOf(player))
    }

    pub fn set_uri(env: Env, uri: String) {
        Self::admin(&env).require_auth();
        env.storage().instance().set(&DataKey::Uri, &uri);
        Self::touch(&env);
    }

    pub fn balance(env: Env, owner: Address) -> u32 {
        Base::balance(&env, &owner)
    }

    pub fn owner_of(env: Env, token_id: u32) -> Address {
        Base::owner_of(&env, token_id)
    }

    pub fn name(env: Env) -> String {
        Base::name(&env)
    }

    pub fn symbol(env: Env) -> String {
        Base::symbol(&env)
    }

    pub fn token_uri(env: Env, token_id: u32) -> String {
        let _ = Base::owner_of(&env, token_id);
        Self::uri(&env)
    }

    pub fn get_approved(_env: Env, _token_id: u32) -> Option<Address> {
        None
    }

    pub fn is_approved_for_all(_env: Env, _owner: Address, _operator: Address) -> bool {
        false
    }

    pub fn transfer(env: Env, _from: Address, _to: Address, _token_id: u32) {
        panic_with_error!(&env, Error::NonTransferable);
    }

    pub fn transfer_from(
        env: Env,
        _spender: Address,
        _from: Address,
        _to: Address,
        _token_id: u32,
    ) {
        panic_with_error!(&env, Error::NonTransferable);
    }

    pub fn approve(
        env: Env,
        _approver: Address,
        _approved: Address,
        _token_id: u32,
        _live_until_ledger: u32,
    ) {
        panic_with_error!(&env, Error::NonTransferable);
    }

    pub fn approve_for_all(env: Env, _owner: Address, _operator: Address, _live_until_ledger: u32) {
        panic_with_error!(&env, Error::NonTransferable);
    }
}

impl BreakerSeason {
    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, Error::InvalidCases))
    }

    fn core(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Core)
            .unwrap_or_else(|| panic_with_error!(env, Error::InvalidCases))
    }

    fn cases(env: &Env) -> Vec<u32> {
        env.storage()
            .instance()
            .get(&DataKey::Cases)
            .unwrap_or_else(|| panic_with_error!(env, Error::InvalidCases))
    }

    fn uri(env: &Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Uri)
            .unwrap_or_else(|| panic_with_error!(env, Error::InvalidCases))
    }

    fn touch(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}
