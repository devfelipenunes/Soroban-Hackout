#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env,
};

const GHOST_DEVICE: u32 = 17;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// wrong owner: the item is not owned by the given owner
    WrongOwner = 1,
    /// unknown item: no item exists with this id
    UnknownItem = 2,
}

#[contracttype]
pub enum DataKey {
    Owner(u32),
}

#[contract]
pub struct Warehouse;

#[contractimpl]
impl Warehouse {
    pub fn __constructor(env: Env, player: Address) {
        let _ = player;
        env.storage().instance().set(
            &DataKey::Owner(GHOST_DEVICE),
            &env.current_contract_address(),
        );
    }

    pub fn transfer_item(env: Env, owner: Address, recipient: Address, item_id: u32) {
        recipient.require_auth();

        let current: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner(item_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::UnknownItem));
        if current != owner {
            panic_with_error!(&env, Error::WrongOwner);
        }

        env.storage()
            .instance()
            .set(&DataKey::Owner(item_id), &recipient);
    }

    pub fn owner_of(env: Env, item_id: u32) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Owner(item_id))
            .unwrap_or_else(|| panic_with_error!(&env, Error::UnknownItem))
    }
}
