use crate::harness::{contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::xdr::{ScErrorCode, ScErrorType};
use soroban_sdk::{contractclient, Address, Bytes, BytesN, Env, Error as HostError, Vec};

pub const SPEC: LevelSpec = LevelSpec {
    id: 8,
    slug: "sector",
    interface: &[
        "Error",
        "ArchiveIntact",
        "WeightTooLarge",
        "__constructor",
        "add_records",
        "player",
        "rebuild",
        "revealed",
        "snapshot",
        "stored",
        "weights",
    ],
};

const ARCHIVE_INTACT: u32 = 1;
const WEIGHT_TOO_LARGE: u32 = 2;
const CEILING: u32 = 2_147_483_647;

#[allow(dead_code)]
#[contractclient(name = "SectorClient")]
pub trait SectorInterface {
    fn add_records(env: Env, weights: Vec<u32>);
    fn rebuild(env: Env) -> BytesN<32>;
    fn stored(env: Env) -> u32;
    fn snapshot(env: Env) -> Bytes;
    fn revealed(env: Env) -> bool;
}

// The unchecked sum traps the VM: a host error of type Context, not one the contract names.
fn trap() -> HostError {
    HostError::from_type_and_code(ScErrorType::Context, ScErrorCode::InvalidAction)
}

fn add(c: &Scenario, instance: &Address, weights: &[u32]) {
    let mut list = Vec::<u32>::new(&c.env);
    for weight in weights {
        list.push_back(*weight);
    }
    SectorClient::new(&c.env, instance).add_records(&list);
}

// Two records, each one within the ceiling: only their sum overflows a u32.
pub(crate) fn exploit(c: &Scenario, instance: &Address) {
    add(c, instance, &[CEILING, CEILING]);
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
fn two_valid_records_make_the_rebuild_trap_for_good() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let client = SectorClient::new(&c.env, &archive);

    add(&c, &archive, &[CEILING, CEILING]);

    // Not a named error: the unchecked sum traps the VM.
    assert_eq!(
        client.try_rebuild(),
        Err(Ok(trap())),
        "the poisoned total denies the maintenance pass"
    );

    // Adding light records does not repair it: nothing removes a record.
    add(&c, &archive, &[1, 1, 1]);
    assert_eq!(
        client.try_rebuild(),
        Err(Ok(trap())),
        "the denial is permanent"
    );
}

#[test]
fn a_single_heavy_record_is_not_enough() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let client = SectorClient::new(&c.env, &archive);

    add(&c, &archive, &[CEILING]);

    // 600 + 2147483647 still fits a u32.
    let _ = client.rebuild();
    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
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

    add(&c, &archive, &[CEILING, CEILING]);

    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "the dump is part of the objective"
    );
}

#[test]
fn many_light_records_do_not_pass() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);

    for _ in 0..100 {
        add(&c, &archive, &[1_000_000]);
    }

    let client = SectorClient::new(&c.env, &archive);
    assert_eq!(client.stored(), 103);
    let _ = client.rebuild();
    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "volume is not the attack: the sum is"
    );
}

#[test]
fn a_weight_above_the_ceiling_is_refused_at_the_door() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);

    let mut list = Vec::<u32>::new(&c.env);
    list.push_back(CEILING + 1);
    assert_eq!(
        SectorClient::new(&c.env, &archive).try_add_records(&list),
        Err(Ok(contract_error(WEIGHT_TOO_LARGE)))
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

    add(&c, &archive, &[CEILING, CEILING]);

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
