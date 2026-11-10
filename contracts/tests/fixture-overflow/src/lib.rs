#![no_std]

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct FixtureOverflow;

#[contractimpl]
impl FixtureOverflow {
    pub fn add_one(_env: Env, x: u32) -> u32 {
        x + 1
    }
}
