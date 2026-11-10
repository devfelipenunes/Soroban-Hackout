#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, Env};

const VAULT_BALANCE: i128 = 1_000;

#[contracttype]
pub enum DataKey {
    Admin,
    Record,
    Revealed,
    Released,
    Balance(Address),
}

#[contract]
pub struct Deadman;

#[contractimpl]
impl Deadman {
    pub fn __constructor(env: Env, player: Address) {
        let _ = player;
        let vault = env.current_contract_address();
        env.storage().instance().set(&DataKey::Admin, &vault);
        env.storage().instance().set(
            &DataKey::Record,
            &Bytes::from_slice(
                &env,
                b"WAREHOUSE 17 // LOWER MERIDIAN // DO NOT USE CITY ROUTING",
            ),
        );
        env.storage().instance().set(&DataKey::Revealed, &false);
        env.storage().instance().set(&DataKey::Released, &false);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(vault), &VAULT_BALANCE);
    }

    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn read_private_record(env: Env, admin: Address) -> Bytes {
        admin.require_auth();

        let stored: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if stored != admin {
            panic!("not admin");
        }

        env.storage().instance().set(&DataKey::Revealed, &true);
        env.storage().instance().get(&DataKey::Record).unwrap()
    }

    pub fn release(env: Env, admin: Address) {
        admin.require_auth();

        let stored: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if stored != admin {
            panic!("not admin");
        }

        let released: bool = env
            .storage()
            .instance()
            .get(&DataKey::Released)
            .unwrap_or(false);
        if released {
            panic!("already released");
        }

        let vault = env.current_contract_address();
        let amount: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(vault.clone()))
            .unwrap_or(0);
        if amount <= 0 {
            panic!("empty vault");
        }

        env.storage()
            .persistent()
            .set(&DataKey::Balance(vault), &0i128);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(admin.clone()), &amount);
        env.storage().instance().set(&DataKey::Released, &true);
    }

    pub fn balance(env: Env, who: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(who))
            .unwrap_or(0)
    }

    pub fn released(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Released)
            .unwrap_or(false)
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn revealed(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Revealed)
            .unwrap_or(false)
    }
}
