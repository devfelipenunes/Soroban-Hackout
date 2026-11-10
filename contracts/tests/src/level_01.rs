use crate::harness::{contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, Env, IntoVal};

pub const SPEC: LevelSpec = LevelSpec {
    id: 1,
    slug: "noentry",
    interface: &[
        "__constructor",
        "door_id",
        "is_open",
        "open",
        "owner",
        "owner_of",
        "player",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "NoentryClient")]
pub trait NoentryInterface {
    fn open(env: Env, owner: Address, door_id: u32);
    fn owner_of(env: Env, door_id: u32) -> Address;
    fn is_open(env: Env, door_id: u32) -> bool;
}

pub(crate) fn exploit(c: &Scenario, instance: &Address, _player: &Address) {
    NoentryClient::new(&c.env, instance).open(instance, &17u32);
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let door = c.create_instance(&c.player, SPEC.id);

    assert!(
        !c.is_completed(&c.player, SPEC.id),
        "the pair must not start completed"
    );

    assert!(
        !NoentryClient::new(&c.env, &door).is_open(&17u32),
        "the service door must start closed"
    );
    assert_ne!(
        NoentryClient::new(&c.env, &door).owner_of(&17u32),
        c.player,
        "the door must not be owned by the player, or there would be no level"
    );

    assert_eq!(
        c.submit(&c.player, &door),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "a closed door must fail at the validator"
    );
}

#[test]
fn the_exploit_opens_the_door_without_the_key() {
    let c = Scenario::new();
    let door = c.create_instance(&c.player, SPEC.id);

    exploit(&c, &door, &c.player);

    assert!(
        NoentryClient::new(&c.env, &door).is_open(&17u32),
        "the door must be open after the exploit"
    );
    assert_eq!(c.submit(&c.player, &door), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn naming_the_wrong_owner_does_not_open_the_door() {
    let c = Scenario::new();
    let door = c.create_instance(&c.player, SPEC.id);
    let client = NoentryClient::new(&c.env, &door);

    assert!(
        client.try_open(&c.other, &17u32).is_err(),
        "the contract must compare the argument with the stored owner"
    );
    assert!(!client.is_open(&17u32));

    assert!(
        client.try_open(&door, &16u32).is_err(),
        "a door nobody registered has no owner to name"
    );
}

#[test]
fn the_player_can_read_the_owner_the_contract_believes() {
    let c = Scenario::new();
    let door = c.create_instance(&c.player, SPEC.id);

    assert_eq!(
        NoentryClient::new(&c.env, &door).owner_of(&17u32),
        door,
        "the stored owner is the instance itself, which never signs"
    );
}

#[test]
fn submitting_twice_is_refused() {
    let c = Scenario::new();
    let door = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &door, &c.player);

    assert_eq!(c.submit(&c.player, &door), Ok(()), "the first one passes");
    assert_eq!(
        c.submit(&c.player, &door),
        Err(contract_error(errors::ALREADY_COMPLETED)),
        "the second must hit ALREADY_COMPLETED, not OBJECTIVE_NOT_MET"
    );
}

#[test]
fn an_instance_the_core_did_not_create_is_refused() {
    let c = Scenario::new();

    let foreign = crate::harness::register(&c.env, &SPEC.instance_wasm(), (c.player.clone(),));

    exploit(&c, &foreign, &c.player);
    assert!(
        NoentryClient::new(&c.env, &foreign).is_open(&17u32),
        "the foreign instance really is open"
    );

    assert_eq!(
        c.submit(&c.player, &foreign),
        Err(contract_error(errors::UNKNOWN_INSTANCE)),
        "the core must ignore instances it did not create"
    );
}

#[test]
fn submitting_another_players_instance_gives_no_credit() {
    let c = Scenario::new();
    let door = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &door, &c.player);

    let result = c
        .core_client()
        .mock_auths(&[crate::harness::auth(
            &c.other,
            &c.core,
            "submit_instance",
            (door.clone(),).into_val(&c.env),
        )])
        .try_submit_instance(&door);

    assert!(result.is_err(), "the core demands the owner's auth");
    assert!(!c.is_completed(&c.other, SPEC.id));
    assert!(!c.is_completed(&c.player, SPEC.id));
}
