use crate::harness::{contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::testutils::Ledger as _;
use soroban_sdk::{contractclient, contracttype, Address, Bytes, BytesN, Env};
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Payload {
    DiagnoseCore,
    OpenForensicSession(Address),
}
pub const SPEC: LevelSpec = LevelSpec {
    id: 12,
    slug: "architect",
    interface: &[
        "DiagnoseCore",
        "OpenForensicSession",
        "Payload",
        "__constructor",
        "eta",
        "evidence_share",
        "evidence_verified",
        "execute",
        "executed_payload",
        "historical_manifest",
        "historical_signature",
        "index",
        "key",
        "manifest",
        "open_forensic_session",
        "original",
        "payload",
        "player",
        "rewrite_payload",
        "rewritten",
        "session",
        "signature",
        "unlock_evidence",
        "verify_history",
        "verify_evidence",
    ],
};
#[allow(dead_code)]
#[contractclient(name = "ArchitectClient")]
pub trait ArchitectInterface {
    fn evidence_share(env: Env, index: u32) -> BytesN<32>;
    fn unlock_evidence(env: Env, key: BytesN<32>) -> bool;
    fn historical_signature(env: Env) -> BytesN<64>;
    fn verify_history(env: Env, signature: BytesN<64>);
    fn manifest(env: Env) -> Bytes;
    fn verify_evidence(env: Env, manifest: Bytes) -> bool;
    fn eta(env: Env) -> u32;
    fn rewrite_payload(env: Env, payload: Payload);
    fn execute(env: Env);
    fn open_forensic_session(env: Env, player: Address);
    fn session(env: Env, player: Address) -> bool;
}
fn evidence(c: &Scenario, i: &Address) {
    let x = ArchitectClient::new(&c.env, i);
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
    assert!(x.verify_evidence(&x.manifest()));
}
pub(crate) fn exploit(c: &Scenario, i: &Address, p: &Address) {
    let x = ArchitectClient::new(&c.env, i);
    evidence(c, i);
    x.rewrite_payload(&Payload::OpenForensicSession(i.clone()));
    c.env.ledger().set_sequence_number(x.eta());
    x.execute();
    x.open_forensic_session(p);
    c.env.set_auths(&[]);
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
fn the_exploit_opens_the_session_through_the_swallowed_error() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &i, &c.player);
    assert!(ArchitectClient::new(&c.env, &i).session(&c.player));
    assert_eq!(c.submit(&c.player, &i), Ok(()));
}
#[test]
fn the_straight_path_does_not_pass() {
    let c = Scenario::new();
    let i = c.create_instance(&c.player, SPEC.id);
    let x = ArchitectClient::new(&c.env, &i);
    evidence(&c, &i);
    x.rewrite_payload(&Payload::OpenForensicSession(c.player.clone()));
    c.env.ledger().set_sequence_number(x.eta());
    x.execute();
    assert_eq!(
        c.submit(&c.player, &i),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "the executed payload must belong to another owner"
    );
    c.env.set_auths(&[]);
}
