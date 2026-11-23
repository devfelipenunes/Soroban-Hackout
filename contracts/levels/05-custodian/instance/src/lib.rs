#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env,
};

const OPERATOR_IDENTITY: u32 = 1;
/// The parent of a root identity: no identity uses it.
const NO_PARENT: u32 = 0;
/// How many parents the gate follows before it gives up.
const MAX_DEPTH: u32 = 8;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// already registered: this identity already has a controller
    AlreadyRegistered = 1,
    /// unknown identity: no identity exists with this id
    UnknownIdentity = 2,
    /// operator not recognized: the caller does not control this identity
    OperatorNotRecognized = 3,
    /// not under the operator: the chain of parents does not reach the operator identity
    NotUnderOperator = 4,
}

#[contracttype]
pub enum DataKey {
    Controller(u32),
    Parent(u32),
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
        env.storage()
            .instance()
            .set(&DataKey::Parent(OPERATOR_IDENTITY), &NO_PARENT);
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

    pub fn parent_of(env: Env, identity: u32) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Parent(identity))
            .unwrap_or_else(|| panic_with_error!(&env, Error::UnknownIdentity))
    }

    /// Registers a new identity under a parent. The new controller signs; the parent is only
    /// required to exist.
    pub fn register_identity(env: Env, identity: u32, controller: Address, parent: u32) {
        controller.require_auth();

        if env.storage().instance().has(&DataKey::Controller(identity)) {
            panic_with_error!(&env, Error::AlreadyRegistered);
        }
        if parent != NO_PARENT && !env.storage().instance().has(&DataKey::Parent(parent)) {
            panic_with_error!(&env, Error::UnknownIdentity);
        }

        env.storage()
            .instance()
            .set(&DataKey::Controller(identity), &controller);
        env.storage()
            .instance()
            .set(&DataKey::Parent(identity), &parent);
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

        if !Self::reaches_operator(&env, identity) {
            panic_with_error!(&env, Error::NotUnderOperator);
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

    /// Walks the chain of parents, up to `MAX_DEPTH` hops, looking for the operator identity.
    fn reaches_operator(env: &Env, identity: u32) -> bool {
        let mut current = identity;
        for _ in 0..=MAX_DEPTH {
            if current == OPERATOR_IDENTITY {
                return true;
            }
            current = env
                .storage()
                .instance()
                .get(&DataKey::Parent(current))
                .unwrap_or(NO_PARENT);
            if current == NO_PARENT {
                return false;
            }
        }
        false
    }
}
