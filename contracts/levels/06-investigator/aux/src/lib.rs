#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, Bytes, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidFragment = 1,
}

#[contract]
pub struct Decoder;

#[contractimpl]
impl Decoder {
    pub fn decode(_env: Env, fragment: Bytes) -> Result<Bytes, Error> {
        if fragment.len() != 32 {
            return Err(Error::InvalidFragment);
        }
        Ok(fragment)
    }
}
