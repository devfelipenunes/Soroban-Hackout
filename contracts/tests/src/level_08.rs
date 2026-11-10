use crate::harness::{contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, BytesN, Env};

pub const SPEC: LevelSpec = LevelSpec {
    id: 8,
    slug: "sector",
    interface: &[
        "__constructor",
        "add_records",
        "count",
        "player",
        "records",
        "revealed",
        "snapshot",
        "stored",
        "threshold",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "SectorClient")]
pub trait SectorInterface {
    fn add_records(env: Env, records: soroban_sdk::Vec<BytesN<32>>);
    fn count(env: Env) -> u32;
    fn stored(env: Env) -> u32;
    fn threshold(env: Env) -> u32;
    fn snapshot(env: Env) -> soroban_sdk::Bytes;
    fn revealed(env: Env) -> bool;
}

fn add(c: &Scenario, instance: &Address, n: u32) {
    let mut batch = soroban_sdk::Vec::<BytesN<32>>::new(&c.env);
    for _ in 0..n {
        batch.push_back(BytesN::from_array(&c.env, &[7u8; 32]));
    }
    SectorClient::new(&c.env, instance).add_records(&batch);
}

fn add_unique(c: &Scenario, instance: &Address, n: u32) {
    let mut batch = soroban_sdk::Vec::<BytesN<32>>::new(&c.env);
    for i in 0..n {
        let mut bytes = [0u8; 32];
        bytes[0] = (i % 256) as u8;
        bytes[1] = (i / 256) as u8;
        batch.push_back(BytesN::from_array(&c.env, &bytes));
    }
    SectorClient::new(&c.env, instance).add_records(&batch);
}

pub(crate) fn exploit(c: &Scenario, instance: &Address) {
    let threshold = SectorClient::new(&c.env, instance).threshold();
    add(c, instance, threshold);
    let client = SectorClient::new(&c.env, instance);
    assert_eq!(client.count(), threshold, "the counter counts every entry");
    assert_eq!(
        client.stored(),
        1,
        "the archive stores the first duplicate only"
    );
    let _ = client.snapshot();
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let client = SectorClient::new(&c.env, &archive);

    assert_eq!(client.count(), 0, "the archive starts empty");
    assert_eq!(client.stored(), 0, "the archive stores nothing");
    assert_eq!(client.threshold(), 500, "the advertised capacity");
    assert!(!client.revealed());

    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "an intact archive must not pass"
    );
}

#[test]
fn the_exploit_fills_the_counter_without_growing_the_archive() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);

    exploit(&c, &archive);

    let client = SectorClient::new(&c.env, &archive);
    assert_eq!(client.count(), 500);
    assert_eq!(client.stored(), 1);
    assert!(client.revealed());

    assert_eq!(c.submit(&c.player, &archive), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn one_record_short_does_not_unlock_the_snapshot() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let client = SectorClient::new(&c.env, &archive);

    add(&c, &archive, 499);

    assert_eq!(client.count(), 499);
    assert_eq!(client.stored(), 1);
    assert!(
        client.try_snapshot().is_err(),
        "the archive must refuse the snapshot below its capacity"
    );
    assert!(!client.revealed());

    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );
}

#[test]
fn a_full_archive_of_unique_records_does_not_pass() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);

    add_unique(&c, &archive, 500);

    let client = SectorClient::new(&c.env, &archive);
    assert_eq!(client.count(), 500);
    assert_eq!(client.stored(), 500);
    let _ = client.snapshot();
    assert!(client.revealed());

    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "the validator must require a counter that outruns the stored archive"
    );
}

#[test]
fn the_snapshot_is_the_list_that_names_the_player() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);

    exploit(&c, &archive);

    let snapshot = SectorClient::new(&c.env, &archive).snapshot();
    assert_eq!(
        snapshot,
        soroban_sdk::Bytes::from_slice(
            &c.env,
            b"AREN VOSS // REFUSED\nSUBJECT: PLAYER // STATUS: ACTIVE"
        )
    );
}

#[test]
fn submitting_twice_is_refused() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &archive);

    assert_eq!(c.submit(&c.player, &archive), Ok(()));
    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::ALREADY_COMPLETED))
    );
}

#[test]
fn an_instance_the_core_did_not_create_is_refused() {
    let c = Scenario::new();
    let foreign = crate::harness::register(&c.env, &SPEC.instance_wasm(), (c.player.clone(),));

    exploit(&c, &foreign);
    assert!(SectorClient::new(&c.env, &foreign).revealed());

    assert_eq!(
        c.submit(&c.player, &foreign),
        Err(contract_error(errors::UNKNOWN_INSTANCE))
    );
}
