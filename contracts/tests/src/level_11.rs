use crate::harness::{contract_error, errors, spec_identifiers, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, Bytes, BytesN, Env};
pub const SPEC: LevelSpec = LevelSpec {
    id: 11,
    slug: "rewrite",
    interface: &[
        "__constructor",
        "commitment",
        "context_verified",
        "decoder",
        "decoder_failed",
        "evidence_share",
        "fragment",
        "historical_manifest",
        "historical_signature",
        "index",
        "key",
        "manifest",
        "manifest_verified",
        "player",
        "recover_proof",
        "signature",
        "unlock_evidence",
        "verified_manifest",
        "verify_history",
        "verify_manifest",
        "voss_proof",
    ],
};
#[allow(dead_code)]
#[contractclient(name = "RewriteClient")]
pub trait RewriteInterface {
    fn evidence_share(env: Env, index: u32) -> BytesN<32>;
    fn unlock_evidence(env: Env, key: BytesN<32>) -> bool;
    fn historical_manifest(env: Env) -> Bytes;
    fn historical_signature(env: Env) -> BytesN<64>;
    fn verify_history(env: Env, signature: BytesN<64>);
    fn manifest(env: Env) -> Bytes;
    fn verify_manifest(env: Env, manifest: Bytes) -> bool;
    fn recover_proof(env: Env, decoder: Address, fragment: Bytes) -> bool;
    fn manifest_verified(env: Env) -> bool;
    fn context_verified(env: Env) -> bool;
    fn verified_manifest(env: Env) -> Option<Bytes>;
    fn voss_proof(env: Env) -> bool;
    fn decoder_failed(env: Env) -> bool;
}

fn variant(c: &Scenario, instance: &Address) -> Bytes {
    let historical = RewriteClient::new(&c.env, instance).historical_manifest();
    let mut out = Bytes::new(&c.env);
    for index in 0..historical.len() {
        let byte = historical.get(index).unwrap();
        out.push_back(if byte.is_ascii_lowercase() {
            byte - 32
        } else {
            byte
        });
    }
    out
}

fn lowered(c: &Scenario, instance: &Address) -> Bytes {
    let historical = RewriteClient::new(&c.env, instance).historical_manifest();
    let mut out = Bytes::new(&c.env);
    for index in 0..historical.len() {
        let byte = historical.get(index).unwrap();
        out.push_back(if byte.is_ascii_uppercase() {
            byte + 32
        } else {
            byte
        });
    }
    out
}

fn prepare_history(c: &Scenario, instance: &Address) {
    let x = RewriteClient::new(&c.env, instance);
    c.env.mock_all_auths();
    let a = x.evidence_share(&0);
    let b = x.evidence_share(&1);
    let d = x.evidence_share(&2);
    let mut key = [0u8; 32];
    for n in 0..32 {
        key[n as usize] = a.get(n).unwrap() ^ b.get(n).unwrap() ^ d.get(n).unwrap();
    }
    assert!(x.unlock_evidence(&BytesN::from_array(&c.env, &key)));
    x.verify_history(&x.historical_signature());
    c.env.set_auths(&[]);
}

fn prepare(c: &Scenario, instance: &Address) {
    prepare_history(c, instance);
    let x = RewriteClient::new(&c.env, instance);
    c.env.mock_all_auths();
    assert!(x.verify_manifest(&variant(c, instance)));
    c.env.set_auths(&[]);
}

pub(crate) fn exploit(c: &Scenario, instance: &Address, decoder: &Address) {
    prepare(c, instance);
    let x = RewriteClient::new(&c.env, instance);
    c.env.mock_all_auths();
    assert!(x.recover_proof(decoder, &variant(c, instance)));
    c.env.set_auths(&[]);
}

#[test]
fn another_instances_manifest_is_rejected() {
    let c = Scenario::new();
    let a = c.create_instance(&c.player, SPEC.id);
    let b = c.create_instance(&c.player, SPEC.id);
    let a = RewriteClient::new(&c.env, &a);
    let b = RewriteClient::new(&c.env, &b);
    assert_ne!(a.manifest(), b.manifest());
    c.env.mock_all_auths();
    assert!(!b.verify_manifest(&a.manifest()));
    c.env.set_auths(&[]);
    assert!(!b.manifest_verified());
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    assert_eq!(
        c.submit(&c.player, &i),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );
}

#[test]
fn the_exploit_turns_decoder_failure_into_voss_proof() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    let d = c.register_aux("breaker_level_11_decoder");
    exploit(&c, &i, &d);
    let x = RewriteClient::new(&c.env, &i);
    assert!(x.manifest_verified() && x.voss_proof() && x.decoder_failed());
    assert_eq!(c.submit(&c.player, &i), Ok(()));
}

#[test]
fn the_exact_record_is_refused_and_a_case_variant_is_accepted() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    let d = c.register_aux("breaker_level_11_decoder");
    prepare_history(&c, &i);
    let x = RewriteClient::new(&c.env, &i);
    let accepted = variant(&c, &i);

    c.env.mock_all_auths();
    assert!(
        !x.verify_manifest(&x.manifest()),
        "the context the contract is supposed to check is refused"
    );
    assert!(
        !x.verify_manifest(&x.historical_manifest()),
        "the exact archived record is refused"
    );
    assert!(!x.context_verified());
    assert_eq!(x.verified_manifest(), None);
    assert!(
        x.verify_manifest(&accepted),
        "a case variant of the archived record is accepted as the context"
    );
    assert!(x.context_verified());
    assert_eq!(
        x.verified_manifest(),
        Some(accepted.clone()),
        "the accepted variant is on the record, so the false positive is observable"
    );
    c.env.set_auths(&[]);

    assert!(!x.voss_proof());
    assert_eq!(
        c.submit(&c.player, &i),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );

    c.env.mock_all_auths();
    assert!(x.recover_proof(&d, &accepted));
    c.env.set_auths(&[]);
    assert_eq!(c.submit(&c.player, &i), Ok(()));
}

#[test]
fn the_honest_sequence_does_not_reach_the_proof() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    let d = c.register_aux("breaker_level_11_decoder");
    prepare_history(&c, &i);
    let x = RewriteClient::new(&c.env, &i);
    let accepted = variant(&c, &i);

    c.env.mock_all_auths();
    assert!(!x.verify_manifest(&x.manifest()));
    assert!(!x.context_verified());
    assert_eq!(x.verified_manifest(), None);
    assert!(
        !x.recover_proof(&d, &accepted),
        "without the false positive, the variant is not a proof"
    );
    c.env.set_auths(&[]);

    assert!(!x.voss_proof());
    assert!(!x.decoder_failed());
    assert_eq!(
        c.submit(&c.player, &i),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );
}

#[test]
fn the_proof_is_bound_to_the_accepted_variant() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    let d = c.register_aux("breaker_level_11_decoder");
    prepare(&c, &i);
    let x = RewriteClient::new(&c.env, &i);

    c.env.mock_all_auths();
    assert!(
        !x.recover_proof(&d, &x.historical_manifest()),
        "the exact record is not the accepted variant"
    );
    c.env.set_auths(&[]);
    assert!(!x.voss_proof());
    assert!(!x.decoder_failed());
}

#[test]
fn a_different_case_variant_is_not_the_accepted_proof() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    let d = c.register_aux("breaker_level_11_decoder");
    prepare(&c, &i);
    let x = RewriteClient::new(&c.env, &i);

    c.env.mock_all_auths();
    assert!(
        !x.recover_proof(&d, &lowered(&c, &i)),
        "the proof is bound to the variant that verify_manifest accepted"
    );
    c.env.set_auths(&[]);
    assert!(!x.voss_proof());
    assert!(!x.decoder_failed());
}

#[test]
fn the_comparison_accepts_only_case_variants() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    prepare_history(&c, &i);
    let x = RewriteClient::new(&c.env, &i);
    let historical = x.historical_manifest();

    let mut mixed = Bytes::new(&c.env);
    for index in 0..historical.len() {
        let byte = historical.get(index).unwrap();
        mixed.push_back(if index == 0 && byte.is_ascii_uppercase() {
            byte + 32
        } else {
            byte
        });
    }

    let mut changed = Bytes::new(&c.env);
    for index in 0..historical.len() {
        let byte = historical.get(index).unwrap();
        changed.push_back(if index == 1 { b'X' } else { byte });
    }

    let mut longer = historical.clone();
    longer.push_back(b'X');

    c.env.mock_all_auths();
    assert!(x.verify_manifest(&variant(&c, &i)));
    assert!(x.verify_manifest(&lowered(&c, &i)));
    assert!(x.verify_manifest(&mixed));
    assert!(!x.verify_manifest(&changed));
    assert!(!x.verify_manifest(&longer));
    assert!(!x.verify_manifest(&Bytes::new(&c.env)));
    assert!(!x.verify_manifest(&historical));
    assert!(!x.verify_manifest(&x.manifest()));
    c.env.set_auths(&[]);
}

#[test]
fn the_player_authorizes_every_proof_step() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    let d = c.register_aux("breaker_level_11_decoder");
    let x = RewriteClient::new(&c.env, &i);
    let key = BytesN::from_array(&c.env, &[0u8; 32]);

    assert!(x.try_unlock_evidence(&key).is_err());
    assert!(x.try_verify_history(&x.historical_signature()).is_err());
    assert!(x.try_verify_manifest(&variant(&c, &i)).is_err());
    assert!(x.try_recover_proof(&d, &variant(&c, &i)).is_err());
}

#[test]
fn garbage_is_not_a_proof() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    let d = c.register_aux("breaker_level_11_decoder");
    prepare(&c, &i);
    let x = RewriteClient::new(&c.env, &i);
    c.env.mock_all_auths();
    assert!(!x.recover_proof(&d, &Bytes::from_slice(&c.env, b"invalid")));
    c.env.set_auths(&[]);
    assert!(!x.voss_proof());
    assert!(!x.decoder_failed());
    assert_eq!(
        c.submit(&c.player, &i),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );
}

#[test]
fn the_current_manifest_is_not_a_proof() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    let d = c.register_aux("breaker_level_11_decoder");
    prepare(&c, &i);
    let x = RewriteClient::new(&c.env, &i);
    c.env.mock_all_auths();
    assert!(!x.recover_proof(&d, &x.manifest()));
    c.env.set_auths(&[]);
    assert!(!x.voss_proof());
    assert!(!x.decoder_failed());
}

#[test]
fn the_decoder_exposes_only_its_declared_interface() {
    let mut built = spec_identifiers("breaker_level_11_decoder");
    built.sort();

    let mut declared: Vec<String> = [
        "Error",
        "InvalidFragment",
        "MalformedFragment",
        "context",
        "decode",
        "fragment",
        "historical",
    ]
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
