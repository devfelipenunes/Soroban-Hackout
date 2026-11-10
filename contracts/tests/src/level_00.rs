use crate::harness::{auth, contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, Env, Val, Vec as SVec};

pub const SPEC: LevelSpec = LevelSpec {
    id: 0,
    slug: "counter",
    interface: &["__constructor", "count", "increment", "owner", "player"],
};

#[allow(dead_code)]
#[contractclient(name = "CounterClient")]
pub trait CounterInterface {
    fn increment(env: Env);
    fn count(env: Env) -> u32;
    fn owner(env: Env) -> Address;
}

#[test]
fn the_trivial_action_solves_the_level() {
    let c = Scenario::new();
    let counter = c.create_instance(&c.player, SPEC.id);
    let v = CounterClient::new(&c.env, &counter);

    assert_eq!(v.count(), 0, "the counter starts at zero");
    assert_eq!(v.owner(), c.player);
    assert!(!c.is_completed(&c.player, SPEC.id));

    assert_eq!(
        c.submit(&c.player, &counter),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "without incrementing, the validator must refuse"
    );

    v.mock_auths(&[auth(
        &c.player,
        &counter,
        "increment",
        SVec::<Val>::new(&c.env),
    )])
    .increment();
    assert_eq!(v.count(), 1);

    assert_eq!(c.submit(&c.player, &counter), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn increment_requires_the_owner_authorization() {
    let c = Scenario::new();
    let counter = c.create_instance(&c.player, SPEC.id);

    let v = CounterClient::new(&c.env, &counter);
    assert!(
        v.try_increment().is_err(),
        "anyone could increment someone else's counter — the require_auth is gone"
    );
    assert_eq!(v.count(), 0, "and the state must not have changed");

    assert!(
        v.mock_auths(&[auth(
            &c.other,
            &counter,
            "increment",
            SVec::<Val>::new(&c.env)
        )])
        .try_increment()
        .is_err(),
        "the authorization must be the owner's, not just any address's"
    );
    assert_eq!(v.count(), 0);
}

#[test]
fn level_0_is_an_instance_validator_pair_like_the_others() {
    let c = Scenario::new();
    let counter = c.create_instance(&c.player, SPEC.id);

    assert!(c.core_client().levels().contains(SPEC.id));
    assert_eq!(
        c.core_client().instances(&c.player, &SPEC.id).len(),
        1,
        "the instance is in the pair's index, as in any level"
    );

    let v = CounterClient::new(&c.env, &counter);
    v.mock_auths(&[auth(
        &c.player,
        &counter,
        "increment",
        SVec::<Val>::new(&c.env),
    )])
    .increment();
    assert_eq!(c.submit(&c.player, &counter), Ok(()));

    assert!(c.is_completed(&c.player, SPEC.id));
    assert!(
        !c.is_completed(&c.player, crate::level_01::SPEC.id),
        "solving level 0 must not solve level 1"
    );
}
