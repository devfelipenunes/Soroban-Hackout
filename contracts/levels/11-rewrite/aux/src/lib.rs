#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, Bytes, Env};
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidFragment = 1,
    MalformedFragment = 2,
}
#[contract]
pub struct Decoder;
#[contractimpl]
impl Decoder {
    pub fn decode(
        _env: Env,
        fragment: Bytes,
        context: Bytes,
        historical: Bytes,
    ) -> Result<Bytes, Error> {
        if fragment == context {
            Ok(fragment)
        } else if fragment == historical {
            Err(Error::InvalidFragment)
        } else {
            Err(Error::MalformedFragment)
        }
    }
}
