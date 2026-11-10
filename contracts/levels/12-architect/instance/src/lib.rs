#![no_std]
#[path = "../../../11-rewrite/protocol.rs"]
mod protocol;
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Bytes, Env, IntoVal, Symbol, Vec,
};
const TIMELOCK: u32 = 5;
const MANIFEST: &[u8] = b"VOSS/SEQUENCE/01/DIAGNOSE";
#[contracttype]
#[derive(Clone, PartialEq, Eq)]
pub enum Payload {
    DiagnoseCore,
    OpenForensicSession(Address),
}
#[contracttype]
pub enum DataKey {
    Player,
    Unlocked,
    History,
    Executed,
    ExecutedPayload,
    Eta,
    Original,
    Payload,
    Evidence,
    Executing,
    Session(Address),
    Rewritten,
}
#[contract]
pub struct Architect;
#[contractimpl]
impl Architect {
    pub fn __constructor(env: Env, player: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
        let p = Payload::DiagnoseCore;
        env.storage()
            .instance()
            .set(&DataKey::Eta, &(env.ledger().sequence() + TIMELOCK));
        env.storage().instance().set(&DataKey::Original, &p);
        env.storage().instance().set(&DataKey::Payload, &p);
        env.storage().instance().set(&DataKey::Evidence, &false);
        env.storage().instance().set(&DataKey::Executing, &false);
        env.storage().instance().set(&DataKey::Rewritten, &false);
    }
    pub fn manifest(env: Env) -> Bytes {
        let player: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        (
            Bytes::from_slice(&env, MANIFEST),
            env.ledger().network_id(),
            env.current_contract_address(),
            player,
        )
            .to_xdr(&env)
    }
    pub fn verify_evidence(env: Env, manifest: Bytes) -> bool {
        let player: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        player.require_auth();
        let left: soroban_sdk::BytesN<32> = env.crypto().sha256(&manifest).into();
        let right: soroban_sdk::BytesN<32> =
            env.crypto().sha256(&Self::manifest(env.clone())).into();
        let valid = left == right;
        let unlocked: bool = env
            .storage()
            .instance()
            .get(&DataKey::Unlocked)
            .unwrap_or(false);
        let history: bool = env
            .storage()
            .instance()
            .get(&DataKey::History)
            .unwrap_or(false);
        let valid = valid && unlocked && history;
        if valid {
            env.storage().instance().set(&DataKey::Evidence, &true);
        }
        valid
    }
    pub fn evidence_share(env: Env, index: u32) -> soroban_sdk::BytesN<32> {
        protocol::share(&env, &Self::manifest(env.clone()), index)
    }
    pub fn unlock_evidence(env: Env, key: soroban_sdk::BytesN<32>) -> bool {
        let player: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        player.require_auth();
        let context = Self::manifest(env.clone());
        let valid = protocol::commitment(&env, &context, &key)
            == protocol::commitment(&env, &context, &protocol::key(&env, &context));
        if valid {
            env.storage().instance().set(&DataKey::Unlocked, &true);
        }
        valid
    }
    pub fn historical_manifest(env: Env) -> Bytes {
        protocol::historical(&env)
    }
    pub fn historical_signature(env: Env) -> soroban_sdk::BytesN<64> {
        protocol::signature(&env)
    }
    pub fn verify_history(env: Env, signature: soroban_sdk::BytesN<64>) {
        let player: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        player.require_auth();
        let unlocked: bool = env
            .storage()
            .instance()
            .get(&DataKey::Unlocked)
            .unwrap_or(false);
        if !unlocked {
            panic!("evidence not reconstructed");
        }
        protocol::verify(&env, &signature);
        env.storage().instance().set(&DataKey::History, &true);
    }
    pub fn eta(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Eta).unwrap()
    }
    pub fn original(env: Env) -> Payload {
        env.storage().instance().get(&DataKey::Original).unwrap()
    }
    pub fn payload(env: Env) -> Payload {
        env.storage().instance().get(&DataKey::Payload).unwrap()
    }
    pub fn evidence_verified(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Evidence)
            .unwrap_or(false)
    }
    pub fn executed_payload(env: Env) -> Option<Payload> {
        env.storage().instance().get(&DataKey::ExecutedPayload)
    }
    pub fn rewritten(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Rewritten)
            .unwrap_or(false)
    }
    pub fn session(env: Env, player: Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Session(player))
            .unwrap_or(false)
    }
    pub fn rewrite_payload(env: Env, payload: Payload) {
        let player: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        player.require_auth();
        let executed: bool = env
            .storage()
            .instance()
            .get(&DataKey::Executed)
            .unwrap_or(false);
        if executed {
            panic!("operation already executed");
        }
        env.storage().instance().set(&DataKey::Payload, &payload);
        let changed = payload != Self::original(env.clone());
        env.storage().instance().set(&DataKey::Rewritten, &changed);
    }
    pub fn execute(env: Env) {
        let player: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        player.require_auth();
        let executed: bool = env
            .storage()
            .instance()
            .get(&DataKey::Executed)
            .unwrap_or(false);
        if executed || !Self::evidence_verified(env.clone()) {
            panic!("operation unavailable");
        }
        if env.ledger().sequence() < Self::eta(env.clone()) {
            panic!("timelock not ready");
        }
        let p = Self::payload(env.clone());
        env.storage().instance().set(&DataKey::ExecutedPayload, &p);
        env.storage().instance().set(&DataKey::Executing, &true);
        if let Payload::OpenForensicSession(who) = p {
            let args = Vec::from_array(&env, [who.into_val(&env)]);
            let _ = env.try_invoke_contract::<(), soroban_sdk::Error>(
                &env.current_contract_address(),
                &Symbol::new(&env, "open_forensic_session"),
                args,
            );
        }
        env.storage().instance().set(&DataKey::Executed, &true);
    }
    pub fn open_forensic_session(env: Env, player: Address) {
        let owner: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        if player != owner {
            panic!("wrong session owner");
        }
        let executing: bool = env
            .storage()
            .instance()
            .get(&DataKey::Executing)
            .unwrap_or(false);
        if !executing {
            panic!("not authorized by timelock");
        }
        env.storage()
            .instance()
            .set(&DataKey::Session(player), &true);
    }
}
