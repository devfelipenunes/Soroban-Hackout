#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Vec,
};

const CHOICES: u32 = 4;
const REQUIRED_HITS: u32 = 3;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// exactly three targets and choices are required
    WrongCount = 1,
    /// choice out of range: each choice must be below 4
    ChoiceOutOfRange = 2,
    /// the target must be ahead of the current ledger
    TargetNotAhead = 3,
    /// the last target ledger has not arrived yet
    LastTargetPending = 4,
    /// no prediction: this player has not predicted (or already revealed)
    NoPrediction = 5,
}

#[contracttype]
pub struct Prediction {
    pub targets: Vec<u32>,
    pub choices: Vec<u32>,
}

#[contracttype]
pub enum DataKey {
    Prediction(Address),
    Streak(Address),
}

#[contract]
pub struct Oracle;

#[contractimpl]
impl Oracle {
    pub fn __constructor(env: Env, player: Address) {
        let _ = player;
        let _ = env;
    }

    pub fn predict(env: Env, player: Address, targets: Vec<u32>, choices: Vec<u32>) {
        player.require_auth();

        if targets.len() != REQUIRED_HITS || choices.len() != REQUIRED_HITS {
            panic_with_error!(&env, Error::WrongCount);
        }

        let now = env.ledger().sequence();
        for index in 0..REQUIRED_HITS {
            let target = targets.get(index).unwrap();
            let choice = choices.get(index).unwrap();
            if choice >= CHOICES {
                panic_with_error!(&env, Error::ChoiceOutOfRange);
            }
            if target <= now {
                panic_with_error!(&env, Error::TargetNotAhead);
            }
        }

        env.storage().instance().set(
            &DataKey::Prediction(player),
            &Prediction { targets, choices },
        );
    }

    pub fn reveal(env: Env, player: Address) -> u32 {
        player.require_auth();

        let stored: Prediction = env
            .storage()
            .instance()
            .get(&DataKey::Prediction(player.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoPrediction));

        let now = env.ledger().sequence();
        let mut last = 0u32;
        for index in 0..REQUIRED_HITS {
            let target = stored.targets.get(index).unwrap();
            if target > last {
                last = target;
            }
        }
        if now < last {
            panic_with_error!(&env, Error::LastTargetPending);
        }

        env.storage()
            .instance()
            .remove(&DataKey::Prediction(player.clone()));

        let mut hits = 0u32;
        for index in 0..REQUIRED_HITS {
            let target = stored.targets.get(index).unwrap();
            let choice = stored.choices.get(index).unwrap();
            if choice == target % CHOICES {
                hits += 1;
            }
        }

        env.storage()
            .instance()
            .set(&DataKey::Streak(player), &hits);
        hits
    }

    pub fn current_sequence(env: Env) -> u32 {
        env.ledger().sequence()
    }

    pub fn streak(env: Env, player: Address) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Streak(player))
            .unwrap_or(0)
    }

    pub fn choices(_env: Env) -> u32 {
        CHOICES
    }

    pub fn required_hits(_env: Env) -> u32 {
        REQUIRED_HITS
    }
}
