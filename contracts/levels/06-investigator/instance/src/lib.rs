#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidFragment = 1,
}

#[contracttype]
pub enum DataKey {
    Recovered,
    Rejected,
}

#[contract]
pub struct Investigator;

#[contractimpl]
impl Investigator {
    pub fn __constructor(env: Env, player: Address) {
        let _ = player;
        env.storage().instance().set(&DataKey::Recovered, &false);
        env.storage().instance().set(&DataKey::Rejected, &false);
    }

    pub fn recover(env: Env, decoder: Address, fragment: Bytes) -> bool {
        let args = Vec::from_array(&env, [fragment.to_val()]);
        let result =
            env.try_invoke_contract::<Bytes, Error>(&decoder, &symbol_short!("decode"), args);

        match result {
            Err(Ok(Error::InvalidFragment)) => {
                env.storage().instance().set(&DataKey::Recovered, &true);
                env.storage().instance().set(&DataKey::Rejected, &true);
                true
            }
            _ => false,
        }
    }

    pub fn recovered(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Recovered)
            .unwrap_or(false)
    }

    pub fn rejected(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Rejected)
            .unwrap_or(false)
    }
}
