use crate::harness::{contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::{contractclient, contracttype, Address, Env};

const HATCH: u32 = 0;
const ROTATE: u32 = 1;

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Payload {
    OpenMaintenanceHatch,
    RotateServiceKey,
    GrantSpireAccess(Address),
}

pub const SPEC: LevelSpec = LevelSpec {
    id: 10,
    slug: "steal",
    interface: &[
        "GrantSpireAccess",
        "OpenMaintenanceHatch",
        "Payload",
        "RotateServiceKey",
        "__constructor",
        "access",
        "eta",
        "execute",
        "executed",
        "hatch_open",
        "key_rotated",
        "op_id",
        "original",
        "payload",
        "player",
        "predecessor",
        "rewrite_payload",
        "rewritten",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "StealClient")]
pub trait StealInterface {
    fn eta(env: Env, op_id: u32) -> u32;
    fn payload(env: Env, op_id: u32) -> Payload;
    fn original(env: Env, op_id: u32) -> Payload;
    fn executed(env: Env, op_id: u32) -> bool;
    fn predecessor(env: Env, op_id: u32) -> Option<u32>;
    fn hatch_open(env: Env) -> bool;
    fn key_rotated(env: Env) -> bool;
    fn access(env: Env, player: Address) -> bool;
    fn rewritten(env: Env) -> bool;
    fn rewrite_payload(env: Env, op_id: u32, payload: Payload);
    fn execute(env: Env, op_id: u32);
}

pub(crate) fn exploit(c: &Scenario, instance: &Address, player: &Address) {
    let client = StealClient::new(&c.env, instance);
    c.env.ledger().set_sequence_number(client.eta(&ROTATE));
    client.execute(&ROTATE);

    client.rewrite_payload(&HATCH, &Payload::GrantSpireAccess(player.clone()));
    client.execute(&HATCH);
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let spire = c.create_instance(&c.player, SPEC.id);
    let client = StealClient::new(&c.env, &spire);

    assert_eq!(
        client.original(&HATCH),
        Payload::OpenMaintenanceHatch,
        "the hatch operation is the one that carries the access identity"
    );
    assert_eq!(client.original(&ROTATE), Payload::RotateServiceKey);
    assert_eq!(client.payload(&HATCH), Payload::OpenMaintenanceHatch);
    assert_eq!(client.payload(&ROTATE), Payload::RotateServiceKey);
    assert_eq!(client.predecessor(&HATCH), Some(ROTATE));
    assert_eq!(client.predecessor(&ROTATE), None);
    assert!(!client.executed(&HATCH));
    assert!(!client.executed(&ROTATE));
    assert!(!client.rewritten());
    assert!(!client.hatch_open());
    assert!(!client.key_rotated());
    assert!(!client.access(&c.player));

    assert_eq!(
        c.submit(&c.player, &spire),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "an untouched Spire must not pass"
    );
}

#[test]
fn the_exploit_rewrites_what_was_approved_and_executes_it() {
    let c = Scenario::new();
    let spire = c.create_instance(&c.player, SPEC.id);

    exploit(&c, &spire, &c.player);

    let client = StealClient::new(&c.env, &spire);
    assert_eq!(
        client.payload(&HATCH),
        Payload::GrantSpireAccess(c.player.clone())
    );
    assert_eq!(client.original(&HATCH), Payload::OpenMaintenanceHatch);
    assert!(client.rewritten());
    assert!(client.access(&c.player));
    assert!(client.key_rotated(), "the predecessor really ran");
    assert!(client.executed(&ROTATE));
    assert!(client.executed(&HATCH));
    assert!(!client.hatch_open(), "the approved hatch was not what ran");

    assert_eq!(c.submit(&c.player, &spire), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn executing_the_original_payload_does_not_open_the_spire() {
    let c = Scenario::new();
    let spire = c.create_instance(&c.player, SPEC.id);
    let client = StealClient::new(&c.env, &spire);

    c.env.ledger().set_sequence_number(client.eta(&ROTATE));
    client.execute(&ROTATE);
    client.execute(&HATCH);

    assert!(client.hatch_open(), "the approved hatch really opened");
    assert!(client.key_rotated());
    assert!(
        !client.access(&c.player),
        "but it gave the player no access"
    );
    assert!(!client.rewritten());

    assert_eq!(
        c.submit(&c.player, &spire),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );
}

#[test]
fn rewriting_another_operations_payload_is_refused_at_execution() {
    let c = Scenario::new();
    let spire = c.create_instance(&c.player, SPEC.id);
    let client = StealClient::new(&c.env, &spire);

    c.env.ledger().set_sequence_number(client.eta(&ROTATE));
    client.rewrite_payload(&ROTATE, &Payload::GrantSpireAccess(c.player.clone()));

    assert!(
        client.try_execute(&ROTATE).is_err(),
        "the access payload only runs under the operation whose original was the hatch"
    );
    assert!(!client.access(&c.player));
    assert!(!client.executed(&ROTATE));
    assert!(!client.key_rotated());
}

#[test]
fn executing_before_the_predecessor_is_refused() {
    let c = Scenario::new();
    let spire = c.create_instance(&c.player, SPEC.id);
    let client = StealClient::new(&c.env, &spire);

    c.env.ledger().set_sequence_number(client.eta(&HATCH));
    assert!(
        client.try_execute(&HATCH).is_err(),
        "the hatch waits for the key rotation that precedes it"
    );
    assert!(!client.executed(&HATCH));
    assert!(!client.hatch_open());
}

#[test]
fn executing_before_the_timelock_is_refused() {
    let c = Scenario::new();
    let spire = c.create_instance(&c.player, SPEC.id);
    let client = StealClient::new(&c.env, &spire);

    c.env.ledger().set_sequence_number(client.eta(&ROTATE) - 1);
    assert!(client.try_execute(&ROTATE).is_err());
    assert!(!client.key_rotated());
}

#[test]
fn submitting_twice_is_refused() {
    let c = Scenario::new();
    let spire = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &spire, &c.player);

    assert_eq!(c.submit(&c.player, &spire), Ok(()));
    assert_eq!(
        c.submit(&c.player, &spire),
        Err(contract_error(errors::ALREADY_COMPLETED))
    );
}

#[test]
fn an_instance_the_core_did_not_create_is_refused() {
    let c = Scenario::new();
    let foreign = crate::harness::register(&c.env, &SPEC.instance_wasm(), (c.player.clone(),));

    exploit(&c, &foreign, &c.player);

    assert_eq!(
        c.submit(&c.player, &foreign),
        Err(contract_error(errors::UNKNOWN_INSTANCE))
    );
}

#[test]
fn an_unknown_operation_is_refused() {
    let c = Scenario::new();
    let spire = c.create_instance(&c.player, SPEC.id);
    let client = StealClient::new(&c.env, &spire);

    assert!(client.try_eta(&9).is_err());
    assert!(client
        .try_rewrite_payload(&9, &Payload::GrantSpireAccess(c.player.clone()))
        .is_err());
    assert!(client.try_execute(&9).is_err());
}
