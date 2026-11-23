use crate::harness::{contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, Bytes, BytesN, Env, Vec};

pub const SPEC: LevelSpec = LevelSpec {
    id: 8,
    slug: "sector",
    interface: &[
        "Error",
        "ArchiveIntact",
        "EmptyRecord",
        "CorruptRecord",
        "__constructor",
        "add_records",
        "player",
        "rebuild",
        "records",
        "revealed",
        "snapshot",
        "stored",
    ],
};

const ARCHIVE_INTACT: u32 = 1;
const EMPTY_RECORD: u32 = 2;
const CORRUPT_RECORD: u32 = 3;

#[allow(dead_code)]
#[contractclient(name = "SectorClient")]
pub trait SectorInterface {
    fn add_records(env: Env, records: Vec<Bytes>);
    fn rebuild(env: Env) -> BytesN<32>;
    fn stored(env: Env) -> u32;
    fn snapshot(env: Env) -> Bytes;
    fn revealed(env: Env) -> bool;
}

fn well_formed(env: &Env, id: u8) -> Bytes {
    let mut raw = [0u8; 33];
    raw[0] = 1;
    raw[1] = id;
    Bytes::from_array(env, &raw)
}

fn add(c: &Scenario, instance: &Address, record: Bytes) {
    let mut records = Vec::<Bytes>::new(&c.env);
    records.push_back(record);
    SectorClient::new(&c.env, instance).add_records(&records);
}

// One malformed record is the whole attack: a single byte with the wrong version.
pub(crate) fn exploit(c: &Scenario, instance: &Address) {
    add(c, instance, Bytes::from_array(&c.env, &[0u8]));
    let _ = SectorClient::new(&c.env, instance).snapshot();
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let client = SectorClient::new(&c.env, &archive);

    assert_eq!(
        client.stored(),
        3,
        "the archive starts with three legacy records"
    );
    let _ = client.rebuild();
    assert!(!client.revealed());
    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "a healthy archive must not pass"
    );
}

#[test]
fn one_malformed_record_makes_the_rebuild_fail_for_good() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let client = SectorClient::new(&c.env, &archive);

    add(&c, &archive, Bytes::from_array(&c.env, &[0u8]));

    assert_eq!(
        client.try_rebuild(),
        Err(Ok(contract_error(CORRUPT_RECORD))),
        "the poisoned record denies the maintenance pass"
    );

    // Adding good records does not repair it: nothing removes a record.
    for id in 10..20u8 {
        add(&c, &archive, well_formed(&c.env, id));
    }
    assert_eq!(
        client.try_rebuild(),
        Err(Ok(contract_error(CORRUPT_RECORD))),
        "the denial is permanent"
    );
}

#[test]
fn the_exploit_passes_the_validator() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);

    exploit(&c, &archive);

    assert!(SectorClient::new(&c.env, &archive).revealed());
    assert_eq!(c.submit(&c.player, &archive), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn a_broken_archive_that_was_never_dumped_does_not_pass() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);

    add(&c, &archive, Bytes::from_array(&c.env, &[0u8]));

    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "the dump is part of the objective"
    );
}

#[test]
fn many_well_formed_records_do_not_pass() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);

    for id in 10..110u8 {
        add(&c, &archive, well_formed(&c.env, id));
    }

    let client = SectorClient::new(&c.env, &archive);
    assert_eq!(client.stored(), 103);
    let _ = client.rebuild();
    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "volume is not the attack: validity is"
    );
}

#[test]
fn an_empty_record_is_refused_at_the_door() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);

    let mut records = Vec::<Bytes>::new(&c.env);
    records.push_back(Bytes::new(&c.env));
    assert_eq!(
        SectorClient::new(&c.env, &archive).try_add_records(&records),
        Err(Ok(contract_error(EMPTY_RECORD)))
    );
}

#[test]
fn the_snapshot_stays_closed_while_the_archive_is_intact() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);

    assert_eq!(
        SectorClient::new(&c.env, &archive).try_snapshot(),
        Err(Ok(contract_error(ARCHIVE_INTACT)))
    );
}

#[test]
fn the_snapshot_is_the_list_that_names_the_player() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);

    add(&c, &archive, Bytes::from_array(&c.env, &[0u8]));

    assert_eq!(
        SectorClient::new(&c.env, &archive).snapshot(),
        Bytes::from_slice(
            &c.env,
            b"AREN VOSS // REFUSED\nSUBJECT: PLAYER // STATUS: ACTIVE"
        )
    );
}

#[test]
fn submitting_twice_is_accepted() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &archive);

    assert_eq!(c.submit(&c.player, &archive), Ok(()));
    assert_eq!(c.submit(&c.player, &archive), Ok(()));
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
