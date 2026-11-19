#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

const STARTING_BALANCE: i128 = 1;
const GATE_THRESHOLD: i128 = 256;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Balance(Address),
    GateOpen(Address),
}

#[contract]
pub struct Custodian;

#[contractimpl]
impl Custodian {
    pub fn __constructor(env: Env, player: Address) {
        env.storage()
            .instance()
            .set(&DataKey::Balance(player), &STARTING_BALANCE);
    }

    pub fn balance(env: Env, owner: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Balance(owner))
            .unwrap_or(0)
    }

    pub fn threshold(_env: Env) -> i128 {
        GATE_THRESHOLD
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let from_balance = Self::balance(env.clone(), from.clone());
        // The same storage key is written twice below for a self-transfer. The
        // broken balance check lets the second write replace the debit with a
        // credit, which is the intended flaw in this level.
        if from != to && from_balance < amount {
            panic!("insufficient balance");
        }
        let to_balance = Self::balance(env.clone(), to.clone());

        env.storage()
            .instance()
            .set(&DataKey::Balance(from), &(from_balance - amount));
        env.storage()
            .instance()
            .set(&DataKey::Balance(to), &(to_balance + amount));
    }

    pub fn enter(env: Env, caller: Address) {
        caller.require_auth();
        if Self::balance(env.clone(), caller.clone()) < GATE_THRESHOLD {
            panic!("insufficient balance for gate");
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
