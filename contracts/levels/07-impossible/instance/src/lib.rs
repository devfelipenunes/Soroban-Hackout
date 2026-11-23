#![no_std]

use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env,
};

const MIN_INPUT: u32 = 10_000;
const FACTOR: u32 = 100_020_001;
const BASE_ELAPSED: u32 = 2_735_411_053;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// out of range: stake and rate must be at least 10000 and elapsed above zero
    OutOfRange = 1,
    /// overflow: the checked arithmetic exceeded u32
    Overflow = 2,
    /// underflow: the amount is larger than the credit
    Underflow = 3,
}

#[contracttype]
pub enum DataKey {
    Player,
    Credit(Address),
}

#[contract]
pub struct Impossible;

#[contractimpl]
impl Impossible {
    pub fn __constructor(env: Env, player: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
    }

    fn target(env: &Env, player: &Address) -> u32 {
        let context = (player.clone(), env.current_contract_address()).to_xdr(env);
        let digest = env.crypto().sha256(&context).to_array();
        let offset = u32::from_be_bytes([digest[0], digest[1], digest[2], digest[3]]) % 97;
        BASE_ELAPSED.wrapping_add(offset).wrapping_mul(FACTOR)
    }

    fn apply(env: Env, player: Address, reward: u32) {
        let current: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Credit(player.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Credit(player), &current.wrapping_add(reward));
    }

    pub fn accrue(env: Env, player: Address, stake: u32, rate: u32, elapsed: u32) {
        player.require_auth();

        if stake < MIN_INPUT || rate < MIN_INPUT || elapsed == 0 {
            panic_with_error!(&env, Error::OutOfRange);
        }

        let reward = stake.wrapping_mul(rate).wrapping_mul(elapsed);
        Self::apply(env, player, reward);
    }

    pub fn accrue_checked(env: Env, player: Address, stake: u32, rate: u32, elapsed: u32) {
        player.require_auth();

        if stake < MIN_INPUT || rate < MIN_INPUT || elapsed == 0 {
            panic_with_error!(&env, Error::OutOfRange);
        }

        let reward = stake
            .checked_mul(rate)
            .and_then(|value| value.checked_mul(elapsed))
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        let current: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Credit(player.clone()))
            .unwrap_or(0);
        env.storage().instance().set(
            &DataKey::Credit(player),
            &current
                .checked_add(reward)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow)),
        );
    }

    pub fn withdraw(env: Env, player: Address, amount: u32) {
        player.require_auth();
        let current: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Credit(player.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Credit(player), &current.wrapping_sub(amount));
    }

    pub fn withdraw_checked(env: Env, player: Address, amount: u32) {
        player.require_auth();
        let current: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Credit(player.clone()))
            .unwrap_or(0);
        env.storage().instance().set(
            &DataKey::Credit(player),
            &current
                .checked_sub(amount)
                .unwrap_or_else(|| panic_with_error!(&env, Error::Underflow)),
        );
    }

    pub fn credit(env: Env, player: Address) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Credit(player))
            .unwrap_or(0)
    }

    pub fn impossible(env: Env) -> u32 {
        let player: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        Self::target(&env, &player)
    }

    pub fn min_input(_env: Env) -> u32 {
        MIN_INPUT
    }
}
