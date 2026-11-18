use crate::harness::{contract_error, errors, LevelSpec, Scenario};
use soroban_env_host::InvocationResourceLimits;
use soroban_sdk::{
    contractclient, testutils::cost_estimate::NetworkInvocationResourceLimits, Address, BytesN,
    Env, Vec,
};
use std::panic::{catch_unwind, AssertUnwindSafe};

pub const SPEC: LevelSpec = LevelSpec {
    id: 8,
    slug: "sector",
    interface: &[
        "__constructor",
        "add_records",
        "begin_rebuild",
        "count",
        "rebuilt",
        "rebuild",
        "rebuild_started",
        "stored",
        "threshold",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "SectorClient")]
pub trait SectorInterface {
    fn add_records(env: Env, records: Vec<BytesN<32>>);
    fn begin_rebuild(env: Env);
    fn count(env: Env) -> u32;
    fn stored(env: Env) -> u32;
    fn threshold(env: Env) -> u32;
    fn rebuild(env: Env) -> BytesN<32>;
    fn rebuild_started(env: Env) -> bool;
    fn rebuilt(env: Env) -> bool;
}

fn add_unique(c: &Scenario, instance: &Address, n: u32) {
    for start in (0..n).step_by(20) {
        let mut batch = Vec::<BytesN<32>>::new(&c.env);
        for i in start..(start + 20).min(n) {
            let mut bytes = [0u8; 32];
            bytes[..4].copy_from_slice(&i.to_be_bytes());
            batch.push_back(BytesN::from_array(&c.env, &bytes));
        }
        SectorClient::new(&c.env, instance).add_records(&batch);
    }
}

fn prepare(c: &Scenario, instance: &Address, records: u32) {
    add_unique(c, instance, records);
    SectorClient::new(&c.env, instance).begin_rebuild();
}

fn enforce_testnet_read_limit(env: &Env) {
    let mut limits = InvocationResourceLimits::mainnet();
    // The in-memory harness counts persistent reads as memory footprint. It
    // also includes three fixed entries, so 203 models 200 record reads plus
    // that overhead; record 201 exceeds it.
    limits.ledger_entries = 203;
    env.cost_estimate().enforce_resource_limits(limits);
}

fn rebuild_is_rejected(c: &Scenario, instance: &Address) -> bool {
    // The host panics on an exceeded resource limit but does not roll back the
    // in-memory test Env. Run the attempted transaction on a snapshot fork so
    // the original Env retains the state a real network would retain.
    let attempt_env = Env::from_snapshot(c.env.to_snapshot());
    enforce_testnet_read_limit(&attempt_env);
    let instance_key = instance.to_string();
    let attempt_instance = Address::from_str(&attempt_env, &instance_key.to_string());
    let client = SectorClient::new(&attempt_env, &attempt_instance);
    assert_eq!(client.count(), 201);
    assert!(client.rebuild_started());
    catch_unwind(AssertUnwindSafe(|| client.rebuild())).is_err()
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let client = SectorClient::new(&c.env, &archive);

    assert_eq!(client.count(), 0);
    assert_eq!(client.threshold(), 201);
    assert!(!client.rebuild_started());
    assert!(!client.rebuilt());
    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );
}

#[test]
fn a_rebuild_at_the_read_entry_limit_succeeds() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    prepare(&c, &archive, 200);
    enforce_testnet_read_limit(&c.env);

    let client = SectorClient::new(&c.env, &archive);
    let _digest = client.rebuild();
    assert!(client.rebuilt());
    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "a rebuild that completes within the resource limit is not an exploit"
    );
}

#[test]
fn persistent_growth_makes_the_wasm_rebuild_exceed_transaction_limits() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    prepare(&c, &archive, 201);
    let client = SectorClient::new(&c.env, &archive);
    assert_eq!(client.count(), 201);
    assert!(client.rebuild_started());
    assert!(!client.rebuilt());
    assert!(
        rebuild_is_rejected(&c, &archive),
        "201 persistent records must exceed the 200-entry read budget"
    );

    assert_eq!(c.submit(&c.player, &archive), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn duplicate_records_do_not_inflate_persistent_archive_size() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let duplicate = BytesN::from_array(&c.env, &[7u8; 32]);
    let mut batch = Vec::new(&c.env);
    for _ in 0..20 {
        batch.push_back(duplicate.clone());
    }
    SectorClient::new(&c.env, &archive).add_records(&batch);

    let client = SectorClient::new(&c.env, &archive);
    assert_eq!(client.count(), 1);
    assert_eq!(client.stored(), 1);
}

#[test]
fn resubmitting_the_same_completed_instance_is_idempotent() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    prepare(&c, &archive, 201);
    assert!(rebuild_is_rejected(&c, &archive));

    assert_eq!(c.submit(&c.player, &archive), Ok(()));
    assert_eq!(c.submit(&c.player, &archive), Ok(()));
}

#[test]
fn an_instance_the_core_did_not_create_is_refused() {
    let c = Scenario::new();
    let foreign = crate::harness::register(&c.env, &SPEC.instance_wasm(), (c.player.clone(),));
    prepare(&c, &foreign, 201);
    assert!(rebuild_is_rejected(&c, &foreign));
    assert_eq!(
        c.submit(&c.player, &foreign),
        Err(contract_error(errors::UNKNOWN_INSTANCE))
    );
}
