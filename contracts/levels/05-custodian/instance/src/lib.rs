#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

const OPERATOR_IDENTITY: u32 = 1;

#[contracttype]
pub enum DataKey {
    Controller(u32),
    GateOpen(Address),
}

#[contract]
pub struct Custodian;

#[contractimpl]
impl Custodian {
    pub fn __constructor(env: Env, player: Address) {
        let _ = player;
        env.storage().instance().set(
            &DataKey::Controller(OPERATOR_IDENTITY),
            &env.current_contract_address(),
        );
    }

    pub fn operator_identity(_env: Env) -> u32 {
        OPERATOR_IDENTITY
    }

    pub fn controller(env: Env, identity: u32) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Controller(identity))
            .unwrap()
    }

    pub fn claim_identity(
        env: Env,
        identity: u32,
        current_controller: Address,
        new_controller: Address,
    ) {
        new_controller.require_auth();

        let stored: Address = env
            .storage()
            .instance()
            .get(&DataKey::Controller(identity))
            .unwrap();
        if stored != current_controller {
            panic!("invalid identity");
        }

        env.storage()
            .instance()
            .set(&DataKey::Controller(identity), &new_controller);
    }

    pub fn enter(env: Env, identity: u32, caller: Address) {
        caller.require_auth();

        let stored: Address = env
            .storage()
            .instance()
            .get(&DataKey::Controller(identity))
            .unwrap();
        if stored != caller {
            panic!("operator not recognized");
        }

        env.storage()
            .instance()
            .set(&DataKey::GateOpen(caller), &true);
    }

    pub fn gate_open(env: Env, caller: Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::GateOpen(caller))
            .unwrap_or(false)
    }
}
