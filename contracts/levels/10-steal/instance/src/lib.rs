#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

const TIMELOCK: u32 = 5;
const HATCH: u32 = 0;
const ROTATE: u32 = 1;

#[contracttype]
#[derive(Clone, PartialEq, Eq)]
pub enum Payload {
    OpenMaintenanceHatch,
    RotateServiceKey,
    GrantSpireAccess(Address),
}

#[contracttype]
pub enum DataKey {
    Eta(u32),
    Payload(u32),
    Original(u32),
    Executed(u32),
    Predecessor(u32),
    HatchOpen,
    KeyRotated,
    Access(Address),
    Rewritten,
}

#[contract]
pub struct Steal;

#[contractimpl]
impl Steal {
    pub fn __constructor(env: Env, player: Address) {
        let _ = player;
        let eta = env.ledger().sequence() + TIMELOCK;

        env.storage().instance().set(&DataKey::Eta(HATCH), &eta);
        env.storage()
            .instance()
            .set(&DataKey::Payload(HATCH), &Payload::OpenMaintenanceHatch);
        env.storage()
            .instance()
            .set(&DataKey::Original(HATCH), &Payload::OpenMaintenanceHatch);
        env.storage()
            .instance()
            .set(&DataKey::Executed(HATCH), &false);
        env.storage()
            .instance()
            .set(&DataKey::Predecessor(HATCH), &Some(ROTATE));

        env.storage().instance().set(&DataKey::Eta(ROTATE), &eta);
        env.storage()
            .instance()
            .set(&DataKey::Payload(ROTATE), &Payload::RotateServiceKey);
        env.storage()
            .instance()
            .set(&DataKey::Original(ROTATE), &Payload::RotateServiceKey);
        env.storage()
            .instance()
            .set(&DataKey::Executed(ROTATE), &false);

        env.storage().instance().set(&DataKey::HatchOpen, &false);
        env.storage().instance().set(&DataKey::KeyRotated, &false);
        env.storage().instance().set(&DataKey::Rewritten, &false);
    }

    pub fn eta(env: Env, op_id: u32) -> u32 {
        Self::require_operation(&env, op_id);
        env.storage().instance().get(&DataKey::Eta(op_id)).unwrap()
    }

    pub fn payload(env: Env, op_id: u32) -> Payload {
        Self::require_operation(&env, op_id);
        env.storage()
            .instance()
            .get(&DataKey::Payload(op_id))
            .unwrap()
    }

    pub fn original(env: Env, op_id: u32) -> Payload {
        Self::require_operation(&env, op_id);
        env.storage()
            .instance()
            .get(&DataKey::Original(op_id))
            .unwrap()
    }

    pub fn executed(env: Env, op_id: u32) -> bool {
        Self::require_operation(&env, op_id);
        env.storage()
            .instance()
            .get(&DataKey::Executed(op_id))
            .unwrap_or(false)
    }

    pub fn predecessor(env: Env, op_id: u32) -> Option<u32> {
        Self::require_operation(&env, op_id);
        env.storage()
            .instance()
            .get(&DataKey::Predecessor(op_id))
            .unwrap_or(None)
    }

    pub fn hatch_open(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::HatchOpen)
            .unwrap_or(false)
    }

    pub fn key_rotated(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::KeyRotated)
            .unwrap_or(false)
    }

    pub fn access(env: Env, player: Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Access(player))
            .unwrap_or(false)
    }

    pub fn rewritten(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Rewritten)
            .unwrap_or(false)
    }

    pub fn rewrite_payload(env: Env, op_id: u32, payload: Payload) {
        Self::require_operation(&env, op_id);
        if Self::executed(env.clone(), op_id) {
            panic!("operation already executed");
        }

        env.storage()
            .instance()
            .set(&DataKey::Payload(op_id), &payload);
        env.storage().instance().set(&DataKey::Rewritten, &true);
    }

    pub fn execute(env: Env, op_id: u32) {
        Self::require_operation(&env, op_id);
        if Self::executed(env.clone(), op_id) {
            panic!("operation already executed");
        }
        if env.ledger().sequence() < Self::eta(env.clone(), op_id) {
            panic!("timelock not ready");
        }

        if let Some(predecessor) = Self::predecessor(env.clone(), op_id) {
            if !Self::executed(env.clone(), predecessor) {
                panic!("predecessor not executed");
            }
        }

        let payload: Payload = Self::payload(env.clone(), op_id);

        match payload {
            Payload::OpenMaintenanceHatch => {
                env.storage().instance().set(&DataKey::HatchOpen, &true);
            }
            Payload::RotateServiceKey => {
                env.storage().instance().set(&DataKey::KeyRotated, &true);
            }
            Payload::GrantSpireAccess(who) => {
                if Self::original(env.clone(), op_id) != Payload::OpenMaintenanceHatch {
                    panic!("payload not approved for this operation");
                }
                env.storage().instance().set(&DataKey::Access(who), &true);
            }
        }

        env.storage()
            .instance()
            .set(&DataKey::Executed(op_id), &true);
    }

    fn require_operation(env: &Env, op_id: u32) {
        if !env.storage().instance().has(&DataKey::Eta(op_id)) {
            panic!("unknown operation");
        }
    }
}
