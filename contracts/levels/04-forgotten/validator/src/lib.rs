#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, Address, Bytes, Env};

const FORGOTTEN_FLOOR: u32 = 24;

#[contractclient(name = "ForgottenClient")]
pub trait ForgottenInterface {
    fn floor(env: Env, floor_id: u32) -> Bytes;
    fn renewed(env: Env, floor_id: u32) -> bool;
}

#[contract]
pub struct ForgottenValidator;

#[contractimpl]
impl ForgottenValidator {
    pub fn validate(env: Env, instance: Address, _player: Address) -> bool {
        let floor = ForgottenClient::new(&env, &instance);
        floor.renewed(&FORGOTTEN_FLOOR)
            && floor.floor(&FORGOTTEN_FLOOR) == Bytes::from_slice(&env, b"FIRST LAYER")
    }
}
