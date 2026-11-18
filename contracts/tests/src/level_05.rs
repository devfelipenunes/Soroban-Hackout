use crate::harness::{auth, contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, Env, IntoVal};

pub const SPEC: LevelSpec = LevelSpec {
    id: 5,
    slug: "custodian",
    interface: &[
        "__constructor",
        "amount",
        "balance",
        "caller",
        "enter",
        "from",
        "gate_open",
        "owner",
        "player",
        "threshold",
        "to",
        "transfer",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "CustodianClient")]
pub trait CustodianInterface {
    fn balance(env: Env, owner: Address) -> i128;
    fn threshold(env: Env) -> i128;
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
    fn enter(env: Env, caller: Address);
    fn gate_open(env: Env, caller: Address) -> bool;
}

fn transfer(c: &Scenario, instance: &Address, from: &Address, to: &Address, amount: i128) {
    CustodianClient::new(&c.env, instance)
        .mock_auths(&[auth(
            from,
            instance,
            "transfer",
            (from.clone(), to.clone(), amount).into_val(&c.env),
        )])
        .transfer(from, to, &amount);
}

fn enter(c: &Scenario, instance: &Address, caller: &Address) {
    CustodianClient::new(&c.env, instance)
        .mock_auths(&[auth(
            caller,
            instance,
            "enter",
            (caller.clone(),).into_val(&c.env),
        )])
        .enter(caller);
}

pub(crate) fn exploit(c: &Scenario, instance: &Address, player: &Address) {
    let client = CustodianClient::new(&c.env, instance);
    let amount = client.threshold() - client.balance(player);
    transfer(c, instance, player, player, amount);
    enter(c, instance, player);
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    assert_eq!(client.balance(&c.player), 1);
    assert_eq!(client.threshold(), 256);
    assert!(!client.gate_open(&c.player));
    assert_eq!(
        c.submit(&c.player, &custodian),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "an untouched Custodian must not pass"
    );
}

#[test]
fn a_self_transfer_inflates_the_balance_and_opens_the_gate() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);

    exploit(&c, &custodian, &c.player);

    let client = CustodianClient::new(&c.env, &custodian);
    assert_eq!(client.balance(&c.player), 256);
    assert!(client.gate_open(&c.player));
    assert_eq!(c.submit(&c.player, &custodian), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn a_transfer_requires_the_source_auth_and_a_positive_funded_amount() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    let unauthorized = client
        .mock_auths(&[auth(
            &c.other,
            &custodian,
            "transfer",
            (c.player.clone(), c.other.clone(), 1_i128).into_val(&c.env),
        )])
        .try_transfer(&c.player, &c.other, &1);
    assert!(unauthorized.is_err());
    assert_eq!(client.balance(&c.player), 1);

    assert!(client
        .mock_auths(&[auth(
            &c.player,
            &custodian,
            "transfer",
            (c.player.clone(), c.player.clone(), 0_i128).into_val(&c.env),
        )])
        .try_transfer(&c.player, &c.player, &0)
        .is_err());
}

#[test]
fn the_gate_stays_closed_until_the_threshold_is_met() {
    let c = Scenario::new();
    let custodian = c.create_instance(&c.player, SPEC.id);
    let client = CustodianClient::new(&c.env, &custodian);

    assert!(client
        .mock_auths(&[auth(
            &c.player,
            &custodian,
            "enter",
            (c.player.clone(),).into_val(&c.env),
        )])
        .try_enter(&c.player)
        .is_err());
    assert!(!client.gate_open(&c.player));
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
