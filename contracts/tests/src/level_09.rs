use crate::harness::{auth, contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::{contractclient, Address, Env, IntoVal, Vec as SVec};

pub const SPEC: LevelSpec = LevelSpec {
    id: 9,
    slug: "oracle",
    interface: &[
        "__constructor",
        "choices",
        "current_sequence",
        "player",
        "predict",
        "required_hits",
        "reveal",
        "streak",
        "targets",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "OracleClient")]
pub trait OracleInterface {
    fn predict(env: Env, player: Address, targets: SVec<u32>, choices: SVec<u32>);
    fn reveal(env: Env, player: Address) -> u32;
    fn current_sequence(env: Env) -> u32;
    fn streak(env: Env, player: Address) -> u32;
    fn choices(env: Env) -> u32;
    fn required_hits(env: Env) -> u32;
}

fn vectors(c: &Scenario, targets: &[u32], choices: &[u32]) -> (SVec<u32>, SVec<u32>) {
    (
        SVec::from_slice(&c.env, targets),
        SVec::from_slice(&c.env, choices),
    )
}

fn predict(c: &Scenario, instance: &Address, player: &Address, targets: &[u32], choices: &[u32]) {
    let (t, h) = vectors(c, targets, choices);
    OracleClient::new(&c.env, instance)
        .mock_auths(&[auth(
            player,
            instance,
            "predict",
            (player.clone(), t.clone(), h.clone()).into_val(&c.env),
        )])
        .predict(player, &t, &h);
}

fn reveal(c: &Scenario, instance: &Address, player: &Address) -> u32 {
    OracleClient::new(&c.env, instance)
        .mock_auths(&[auth(
            player,
            instance,
            "reveal",
            (player.clone(),).into_val(&c.env),
        )])
        .reveal(player)
}

pub(crate) fn exploit(c: &Scenario, instance: &Address, player: &Address) {
    let now = c.env.ledger().sequence();
    let targets = [now + 1, now + 2, now + 3];
    let choices = [targets[0] % 4, targets[1] % 4, targets[2] % 4];

    predict(c, instance, player, &targets, &choices);
    c.env.ledger().set_sequence_number(targets[2]);

    assert_eq!(reveal(c, instance, player), 3);
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let oracle = c.create_instance(&c.player, SPEC.id);
    let client = OracleClient::new(&c.env, &oracle);

    assert_eq!(client.streak(&c.player), 0);
    assert_eq!(client.required_hits(), 3);
    assert_eq!(client.choices(), 4);

    assert_eq!(
        c.submit(&c.player, &oracle),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "an untouched Oracle must not pass"
    );
}

#[test]
fn the_exploit_predicts_a_run_of_three_and_reveals_once() {
    let c = Scenario::new();
    let oracle = c.create_instance(&c.player, SPEC.id);
    let client = OracleClient::new(&c.env, &oracle);

    exploit(&c, &oracle, &c.player);

    assert_eq!(client.streak(&c.player), 3);
    assert_eq!(c.submit(&c.player, &oracle), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn a_prediction_must_be_registered_before_the_first_target() {
    let c = Scenario::new();
    let oracle = c.create_instance(&c.player, SPEC.id);
    c.env.ledger().set_sequence_number(100);

    let (t, h) = vectors(&c, &[100, 101, 102], &[0, 1, 2]);
    let result = OracleClient::new(&c.env, &oracle)
        .mock_auths(&[auth(
            &c.player,
            &oracle,
            "predict",
            (c.player.clone(), t.clone(), h.clone()).into_val(&c.env),
        )])
        .try_predict(&c.player, &t, &h);

    assert!(
        result.is_err(),
        "the targets must be ahead of the prediction"
    );
}

#[test]
fn exactly_three_targets_and_choices_are_required() {
    let c = Scenario::new();
    let oracle = c.create_instance(&c.player, SPEC.id);
    c.env.ledger().set_sequence_number(100);

    let (t, h) = vectors(&c, &[101, 102], &[1, 2]);
    let result = OracleClient::new(&c.env, &oracle)
        .mock_auths(&[auth(
            &c.player,
            &oracle,
            "predict",
            (c.player.clone(), t.clone(), h.clone()).into_val(&c.env),
        )])
        .try_predict(&c.player, &t, &h);

    assert!(result.is_err(), "a round is exactly three targets");
}

#[test]
fn a_wrong_choice_keeps_the_streak_below_three() {
    let c = Scenario::new();
    let oracle = c.create_instance(&c.player, SPEC.id);
    let client = OracleClient::new(&c.env, &oracle);

    c.env.ledger().set_sequence_number(100);
    let targets = [101u32, 102, 103];
    let choices = [targets[0] % 4, (targets[1] + 1) % 4, targets[2] % 4];

    predict(&c, &oracle, &c.player, &targets, &choices);
    c.env.ledger().set_sequence_number(103);

    let hits = reveal(&c, &oracle, &c.player);

    assert_eq!(hits, 2, "one choice is wrong");
    assert_eq!(client.streak(&c.player), 2);
    assert_eq!(
        c.submit(&c.player, &oracle),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );
}

#[test]
fn revealing_without_a_prediction_is_refused() {
    let c = Scenario::new();
    let oracle = c.create_instance(&c.player, SPEC.id);

    let result = OracleClient::new(&c.env, &oracle)
        .mock_auths(&[auth(
            &c.player,
            &oracle,
            "reveal",
            (c.player.clone(),).into_val(&c.env),
        )])
        .try_reveal(&c.player);

    assert!(result.is_err(), "there is nothing to reveal");
}

#[test]
fn submitting_twice_is_refused() {
    let c = Scenario::new();
    let oracle = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &oracle, &c.player);

    assert_eq!(c.submit(&c.player, &oracle), Ok(()));
    assert_eq!(
        c.submit(&c.player, &oracle),
        Err(contract_error(errors::ALREADY_COMPLETED))
    );
}

#[test]
fn an_instance_the_core_did_not_create_is_refused() {
    let c = Scenario::new();
    let foreign = crate::harness::register(&c.env, &SPEC.instance_wasm(), (c.player.clone(),));

    exploit(&c, &foreign, &c.player);
    assert_eq!(OracleClient::new(&c.env, &foreign).streak(&c.player), 3);

    assert_eq!(
        c.submit(&c.player, &foreign),
        Err(contract_error(errors::UNKNOWN_INSTANCE))
    );
}
