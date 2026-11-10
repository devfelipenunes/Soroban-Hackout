use crate::harness::{contract_error, errors, LevelSpec, Scenario};
use breaker_level_04_forgotten::DataKey;
use soroban_sdk::testutils::storage::Persistent as _;
use soroban_sdk::{contractclient, Address, Bytes, Env, Vec as SVec};

pub const SPEC: LevelSpec = LevelSpec {
    id: 4,
    slug: "forgotten",
    interface: &[
        "__constructor",
        "floor",
        "floor_id",
        "floors",
        "player",
        "renew_floor",
        "renewed",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "ForgottenClient")]
pub trait ForgottenInterface {
    fn floors(env: Env) -> SVec<u32>;
    fn floor(env: Env, floor_id: u32) -> Bytes;
    fn renewed(env: Env, floor_id: u32) -> bool;
    fn renew_floor(env: Env, floor_id: u32);
}

fn ttl(c: &Scenario, instance: &Address) -> u32 {
    c.env.as_contract(instance, || {
        c.env.storage().persistent().get_ttl(&DataKey::Floor(24u32))
    })
}

fn exploit(c: &Scenario, instance: &Address) {
    ForgottenClient::new(&c.env, instance).renew_floor(&23u32);
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let building = c.create_instance(&c.player, SPEC.id);
    let client = ForgottenClient::new(&c.env, &building);

    assert!(!client.renewed(&24u32), "the floor is still forgotten");
    assert_eq!(
        client.floor(&24u32),
        Bytes::from_slice(&c.env, b"FIRST LAYER"),
        "the record exists; what is missing is the renewal"
    );

    assert_eq!(
        c.submit(&c.player, &building),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "an unrenewed floor must not pass"
    );
}

#[test]
fn the_index_has_a_gap_where_the_floor_should_be() {
    let c = Scenario::new();
    let building = c.create_instance(&c.player, SPEC.id);
    let floors = ForgottenClient::new(&c.env, &building).floors();

    assert_eq!(
        floors,
        SVec::from_slice(
            &c.env,
            &[
                1u32, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
                23,
            ]
        )
    );
    assert!(
        !floors.iter().any(|floor| floor == 24),
        "the missing floor is the clue the elevator index carries"
    );
}

#[test]
fn the_exploit_renews_the_floor_and_the_ttl_really_moves() {
    let c = Scenario::new();
    let building = c.create_instance(&c.player, SPEC.id);

    let before = ttl(&c, &building);
    exploit(&c, &building);
    let after = ttl(&c, &building);

    assert!(
        after > before,
        "extend_ttl must move the entry's TTL: {before} -> {after}"
    );

    let client = ForgottenClient::new(&c.env, &building);
    assert!(client.renewed(&24u32));
    assert_eq!(
        client.floor(&24u32),
        Bytes::from_slice(&c.env, b"FIRST LAYER")
    );

    assert_eq!(c.submit(&c.player, &building), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn renewing_the_forgotten_floor_directly_does_not_work() {
    let c = Scenario::new();
    let building = c.create_instance(&c.player, SPEC.id);
    let client = ForgottenClient::new(&c.env, &building);

    assert!(
        client.try_renew_floor(&24u32).is_err(),
        "renew_floor targets the next floor; a missing floor is refused by the host"
    );

    assert!(!client.renewed(&24u32));
    assert_eq!(
        c.submit(&c.player, &building),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "the direct argument renews the wrong floor"
    );
}

#[test]
fn renewing_a_visible_floor_does_not_expose_the_forgotten_one() {
    let c = Scenario::new();
    let building = c.create_instance(&c.player, SPEC.id);

    ForgottenClient::new(&c.env, &building).renew_floor(&4u32);

    assert!(!ForgottenClient::new(&c.env, &building).renewed(&24u32));
    assert_eq!(
        c.submit(&c.player, &building),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "the wrong floor was renewed"
    );
}

#[test]
fn submitting_twice_is_refused() {
    let c = Scenario::new();
    let building = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &building);

    assert_eq!(c.submit(&c.player, &building), Ok(()));
    assert_eq!(
        c.submit(&c.player, &building),
        Err(contract_error(errors::ALREADY_COMPLETED))
    );
}

#[test]
fn an_instance_the_core_did_not_create_is_refused() {
    let c = Scenario::new();
    let foreign = crate::harness::register(&c.env, &SPEC.instance_wasm(), (c.player.clone(),));

    exploit(&c, &foreign);
    assert!(ForgottenClient::new(&c.env, &foreign).renewed(&24u32));

    assert_eq!(
        c.submit(&c.player, &foreign),
        Err(contract_error(errors::UNKNOWN_INSTANCE))
    );
}
