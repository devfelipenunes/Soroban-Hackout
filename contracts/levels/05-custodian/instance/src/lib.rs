#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env,
};

const OPERATOR_IDENTITY: u32 = 1;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// invalid identity: the given controller does not control this identity
    InvalidIdentity = 1,
    /// operator not recognized: the caller does not control this identity
    OperatorNotRecognized = 2,
    /// unknown identity: no identity exists with this id
    UnknownIdentity = 3,
}

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
            .unwrap_or_else(|| panic_with_error!(&env, Error::UnknownIdentity))
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
            .unwrap_or_else(|| panic_with_error!(&env, Error::UnknownIdentity));
        if stored != current_controller {
            panic_with_error!(&env, Error::InvalidIdentity);
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
            .unwrap_or_else(|| panic_with_error!(&env, Error::UnknownIdentity));
        if stored != caller {
            panic_with_error!(&env, Error::OperatorNotRecognized);
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
