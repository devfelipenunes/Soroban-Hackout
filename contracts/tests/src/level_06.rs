use crate::harness::{contract_error, errors, spec_identifiers, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, Bytes, Env};

pub const SPEC: LevelSpec = LevelSpec {
    id: 6,
    slug: "investigator",
    interface: &[
        "__constructor",
        "decoder",
        "fragment",
        "player",
        "recover",
        "recovered",
        "rejected",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "InvestigatorClient")]
pub trait InvestigatorInterface {
    fn recover(env: Env, decoder: Address, fragment: Bytes) -> bool;
    fn recovered(env: Env) -> bool;
    fn rejected(env: Env) -> bool;
}

fn recover(c: &Scenario, instance: &Address, decoder: &Address, fragment: &Bytes) -> bool {
    InvestigatorClient::new(&c.env, instance).recover(decoder, fragment)
}

pub(crate) fn exploit(c: &Scenario, instance: &Address, decoder: &Address) {
    let fragment = Bytes::from_slice(&c.env, b"not-a-fragment");
    assert!(
        recover(c, instance, decoder, &fragment),
        "the exploit must be the path that swallows the decoder's error"
    );
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let client = InvestigatorClient::new(&c.env, &archive);

    assert!(!client.recovered(), "nothing has been recovered");
    assert!(!client.rejected(), "nothing has been rejected");

    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "an untouched archive must not pass"
    );
}

#[test]
fn the_exploit_turns_a_failed_decode_into_recovery() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let decoder = c.register_aux("breaker_level_06_decoder");

    exploit(&c, &archive, &decoder);

    let client = InvestigatorClient::new(&c.env, &archive);
    assert!(
        client.recovered(),
        "the archive marked the fragment recovered"
    );
    assert!(
        client.rejected(),
        "and recorded that the decoder rejected it"
    );

    assert_eq!(c.submit(&c.player, &archive), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn a_valid_fragment_does_not_trigger_the_path() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let decoder = c.register_aux("breaker_level_06_decoder");
    let client = InvestigatorClient::new(&c.env, &archive);

    let valid = Bytes::from_slice(&c.env, &[0u8; 32]);
    assert!(
        !recover(&c, &archive, &decoder, &valid),
        "a decoder success must not be treated as the exploit"
    );
    assert!(!client.recovered());
    assert!(!client.rejected());

    assert_eq!(
        c.submit(&c.player, &archive),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );
}

#[test]
fn a_contract_without_decode_does_not_count_as_the_decoder() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let client = InvestigatorClient::new(&c.env, &archive);

    let fragment = Bytes::from_slice(&c.env, b"not-a-fragment");
    assert!(
        !recover(&c, &archive, &c.core, &fragment),
        "a missing function is not the decoder's specific rejection"
    );
    assert!(!client.recovered());
    assert!(!client.rejected());
}

#[test]
fn the_decoder_exposes_only_its_declared_interface() {
    let mut built = spec_identifiers("breaker_level_06_decoder");
    built.sort();

    let mut declared: Vec<String> = ["Error", "InvalidFragment", "decode", "fragment"]
        .iter()
        .map(|name| String::from(*name))
        .collect();
    declared.sort();

    assert_eq!(
        built, declared,
        "the auxiliary decoder is a second contract of this level; the rule 5 whitelist must \
         cover it too, or an upgrade path there would pass unnoticed"
    );
}

#[test]
fn submitting_twice_is_refused() {
    let c = Scenario::new();
    let archive = c.create_instance(&c.player, SPEC.id);
    let decoder = c.register_aux("breaker_level_06_decoder");
    exploit(&c, &archive, &decoder);

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
    let decoder = c.register_aux("breaker_level_06_decoder");

    exploit(&c, &foreign, &decoder);
    assert!(InvestigatorClient::new(&c.env, &foreign).recovered());

    assert_eq!(
        c.submit(&c.player, &foreign),
        Err(contract_error(errors::UNKNOWN_INSTANCE))
    );
}
