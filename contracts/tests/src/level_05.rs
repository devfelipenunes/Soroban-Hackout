use crate::harness::{auth, contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, Env, IntoVal};

pub const SPEC: LevelSpec = LevelSpec {
    id: 5,
    slug: "custodian",
    interface: &[
        "Error",
        "AlreadyRegistered",
        "UnknownIdentity",
        "OperatorNotRecognized",
        "NotUnderOperator",
        "__constructor",
        "caller",
        "controller",
        "enter",
        "gate_open",
        "identity",
        "operator_identity",
        "parent",
        "parent_of",
        "player",
        "register_identity",
    ],
};

const ALREADY_REGISTERED: u32 = 1;
const UNKNOWN_IDENTITY: u32 = 2;
const OPERATOR_NOT_RECOGNIZED: u32 = 3;
const NOT_UNDER_OPERATOR: u32 = 4;

#[allow(dead_code)]
#[contractclient(name = "CustodianClient")]
pub trait CustodianInterface {
    fn operator_identity(env: Env) -> u32;
    fn controller(env: Env, identity: u32) -> Address;
    fn parent_of(env: Env, identity: u32) -> u32;
    fn register_identity(env: Env, identity: u32, controller: Address, parent: u32);
    fn enter(env: Env, identity: u32, caller: Address);
    fn gate_open(env: Env, caller: Address) -> bool;
}

// Only the controller being registered signs: nobody asks the parent.
fn register(c: &Scenario, instance: &Address, identity: u32, who: &Address, parent: u32) {
    CustodianClient::new(&c.env, instance)
        .mock_auths(&[auth(
            who,
            instance,
            "register_identity",
            (identity, who.clone(), parent).into_val(&c.env),
        )])
        .register_identity(&identity, who, &parent);
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

// The player declares the operator identity as the parent of their own: two calls.
pub(crate) fn exploit(c: &Scenario, instance: &Address, player: &Address) {
    let operator = CustodianClient::new(&c.env, instance).operator_identity();
    register(c, instance, 2, player, operator);
    enter(c, instance, 2, player);
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    let operator = client.operator_identity();
    assert_eq!(
        client.controller(&operator),
        custodian,
        "the operator identity belongs to the sealed system"
    );
    assert_eq!(client.parent_of(&operator), 0, "the operator has no parent");
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
    assert_eq!(client.controller(&2), c.player);
    assert_eq!(client.parent_of(&2), client.operator_identity());
    assert!(client.gate_open(&c.player));
    assert_eq!(
        client.controller(&client.operator_identity()),
        custodian,
        "the operator identity itself is never taken: only the chain is forged"
    );

    assert_eq!(c.submit(&c.player, &custodian), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn authority_follows_the_chain_of_parents() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    // 3 hangs from 2, which hangs from the operator: the gate follows the whole chain.
    register(&c, &custodian, 2, &c.other, 1);
    register(&c, &custodian, 3, &c.player, 2);
    enter(&c, &custodian, 3, &c.player);

    assert!(client.gate_open(&c.player));
}

#[test]
fn the_gate_only_opens_for_the_controller_of_the_identity() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    register(&c, &custodian, 2, &c.player, 1);

    let result = client
        .mock_auths(&[auth(
            &c.other,
            &custodian,
            "enter",
            (2u32, c.other.clone()).into_val(&c.env),
        )])
        .try_enter(&2, &c.other);
    assert_eq!(result, Err(Ok(contract_error(OPERATOR_NOT_RECOGNIZED))));
    assert!(!client.gate_open(&c.other));
}

#[test]
fn the_operator_identity_itself_cannot_be_entered_by_a_player() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    let result = client
        .mock_auths(&[auth(
            &c.player,
            &custodian,
            "enter",
            (1u32, c.player.clone()).into_val(&c.env),
        )])
        .try_enter(&1, &c.player);
    assert_eq!(result, Err(Ok(contract_error(OPERATOR_NOT_RECOGNIZED))));
}

#[test]
fn an_identity_cannot_be_registered_twice() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    register(&c, &custodian, 2, &c.other, 1);

    let result = client
        .mock_auths(&[auth(
            &c.player,
            &custodian,
            "register_identity",
            (2u32, c.player.clone(), 1u32).into_val(&c.env),
        )])
        .try_register_identity(&2, &c.player, &1);
    assert_eq!(result, Err(Ok(contract_error(ALREADY_REGISTERED))));
    assert_eq!(client.controller(&2), c.other, "the first owner keeps it");

    // The operator identity cannot be re-registered either.
    let result = client
        .mock_auths(&[auth(
            &c.player,
            &custodian,
            "register_identity",
            (1u32, c.player.clone(), 1u32).into_val(&c.env),
        )])
        .try_register_identity(&1, &c.player, &1);
    assert_eq!(result, Err(Ok(contract_error(ALREADY_REGISTERED))));
    assert_eq!(client.controller(&1), custodian);
}

#[test]
fn a_parent_must_exist() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    let result = client
        .mock_auths(&[auth(
            &c.player,
            &custodian,
            "register_identity",
            (2u32, c.player.clone(), 99u32).into_val(&c.env),
        )])
        .try_register_identity(&2, &c.player, &99);
    assert_eq!(result, Err(Ok(contract_error(UNKNOWN_IDENTITY))));
}

#[test]
fn an_identity_whose_chain_stops_before_the_operator_does_not_enter() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    // 0 is the "no parent" marker: a root that is not the operator.
    register(&c, &custodian, 2, &c.player, 0);

    let result = client
        .mock_auths(&[auth(
            &c.player,
            &custodian,
            "enter",
            (2u32, c.player.clone()).into_val(&c.env),
        )])
        .try_enter(&2, &c.player);
    assert_eq!(result, Err(Ok(contract_error(NOT_UNDER_OPERATOR))));
    assert!(!client.gate_open(&c.player));
    assert_eq!(
        c.submit(&c.player, &custodian),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );
}

#[test]
fn a_chain_deeper_than_the_gate_follows_does_not_enter() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    // 2 -> 1 is depth one; each extra hop is another identity hanging from the last.
    register(&c, &custodian, 2, &c.other, 1);
    for identity in 3..=12u32 {
        register(&c, &custodian, identity, &c.other, identity - 1);
    }
    register(&c, &custodian, 13, &c.player, 12);

    let result = client
        .mock_auths(&[auth(
            &c.player,
            &custodian,
            "enter",
            (13u32, c.player.clone()).into_val(&c.env),
        )])
        .try_enter(&13, &c.player);
    assert_eq!(result, Err(Ok(contract_error(NOT_UNDER_OPERATOR))));
}

#[test]
fn submitting_twice_is_accepted() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &custodian, &c.player);

    assert_eq!(c.submit(&c.player, &custodian), Ok(()));
    assert_eq!(c.submit(&c.player, &custodian), Ok(()));
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
