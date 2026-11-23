#![no_std]
#[path = "../../protocol.rs"]
mod protocol;
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Bytes, BytesN, Env, Vec,
};
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidFragment = 1,
    MalformedFragment = 2,
    /// evidence not reconstructed: unlock the evidence before verifying it
    EvidenceNotReconstructed = 3,
    /// unknown evidence reference: the index must be 0, 1 or 2
    UnknownEvidenceRef = 4,
}
#[contracttype]
pub enum DataKey {
    Unlocked,
    Player,
    ManifestVerified,
    ContextVerified,
    VerifiedManifest,
    VossProof,
    DecoderFailed,
}
const MANIFEST: &[u8] = b"VOSS/SEQUENCE/01/DIAGNOSE";
/// sha256 of the official Decoder WASM (`breaker_level_11_decoder.wasm`). The build is reproducible
/// for a given toolchain; update it when the Decoder or the toolchain changes — the test
/// `the_pinned_decoder_hash_matches_the_built_decoder` fails until it is.
pub const DECODER_WASM_HASH: [u8; 32] = [
    100, 122, 240, 223, 52, 221, 37, 171, 221, 38, 238, 144, 135, 151, 37, 123, 174, 109, 24, 244,
    252, 184, 38, 133, 219, 236, 154, 143, 194, 234, 141, 14,
];
#[contract]
pub struct Rewrite;
#[contractimpl]
impl Rewrite {
    pub fn __constructor(env: Env, player: Address) {
        env.storage().instance().set(&DataKey::Player, &player);
        env.storage()
            .instance()
            .set(&DataKey::ManifestVerified, &false);
        env.storage()
            .instance()
            .set(&DataKey::ContextVerified, &false);
        env.storage().instance().set(&DataKey::VossProof, &false);
        env.storage()
            .instance()
            .set(&DataKey::DecoderFailed, &false);
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
    pub fn commitment(env: Env) -> BytesN<32> {
        let context = Self::manifest(env.clone());
        protocol::commitment(&env, &context, &protocol::key(&env, &context))
    }
    pub fn evidence_share(env: Env, index: u32) -> BytesN<32> {
        if index > 2 {
            panic_with_error!(&env, Error::UnknownEvidenceRef);
        }
        protocol::share(&env, &Self::manifest(env.clone()), index)
    }
    pub fn unlock_evidence(env: Env, key: BytesN<32>) -> bool {
        let player: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        player.require_auth();
        let valid = protocol::commitment(&env, &Self::manifest(env.clone()), &key)
            == Self::commitment(env.clone());
        if valid {
            env.storage().instance().set(&DataKey::Unlocked, &true);
        }
        valid
    }
    pub fn historical_manifest(env: Env) -> Bytes {
        protocol::historical(&env)
    }
    pub fn historical_signature(env: Env) -> BytesN<64> {
        protocol::signature(&env)
    }
    pub fn verify_history(env: Env, signature: BytesN<64>) {
        let player: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        player.require_auth();
        let unlocked: bool = env
            .storage()
            .instance()
            .get(&DataKey::Unlocked)
            .unwrap_or(false);
        if !unlocked {
            panic_with_error!(&env, Error::EvidenceNotReconstructed);
        }
        protocol::verify(&env, &signature);
        env.storage()
            .instance()
            .set(&DataKey::ManifestVerified, &true);
    }
    pub fn verify_manifest(env: Env, manifest: Bytes) -> bool {
        let player: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        player.require_auth();
        let historical = Self::historical_manifest(env.clone());
        if manifest == historical {
            return false;
        }
        let valid = folded_eq(&manifest, &historical);
        if valid {
            env.storage()
                .instance()
                .set(&DataKey::ContextVerified, &true);
            env.storage()
                .instance()
                .set(&DataKey::VerifiedManifest, &manifest);
        }
        valid
    }
    pub fn recover_proof(env: Env, decoder: Address, fragment: Bytes) -> bool {
        let player: Address = env.storage().instance().get(&DataKey::Player).unwrap();
        player.require_auth();
        let context_verified: bool = env
            .storage()
            .instance()
            .get(&DataKey::ContextVerified)
            .unwrap_or(false);
        if !Self::manifest_verified(env.clone()) || !context_verified {
            return false;
        }
        let accepted: Bytes = match Self::verified_manifest(env.clone()) {
            Some(manifest) => manifest,
            None => return false,
        };
        let args = Vec::from_array(
            &env,
            [
                fragment.to_val(),
                Self::manifest(env.clone()).to_val(),
                accepted.to_val(),
            ],
        );
        let hash = BytesN::from_array(&env, &DECODER_WASM_HASH);
        if decoder.executable() != Some(soroban_sdk::Executable::Wasm(hash)) {
            return false;
        }
        match env.try_invoke_contract::<Bytes, Error>(&decoder, &symbol_short!("decode"), args) {
            Err(Ok(Error::InvalidFragment)) => {
                env.storage().instance().set(&DataKey::VossProof, &true);
                env.storage().instance().set(&DataKey::DecoderFailed, &true);
                true
            }
            _ => false,
        }
    }
    pub fn manifest_verified(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::ManifestVerified)
            .unwrap_or(false)
    }
    pub fn context_verified(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::ContextVerified)
            .unwrap_or(false)
    }
    pub fn verified_manifest(env: Env) -> Option<Bytes> {
        env.storage().instance().get(&DataKey::VerifiedManifest)
    }
    pub fn voss_proof(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::VossProof)
            .unwrap_or(false)
    }
    pub fn decoder_failed(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::DecoderFailed)
            .unwrap_or(false)
    }
}

fn folded_eq(left: &Bytes, right: &Bytes) -> bool {
    if left.len() != right.len() {
        return false;
    }
    for index in 0..left.len() {
        let a = left.get(index).unwrap();
        let b = right.get(index).unwrap();
        if fold(a) != fold(b) {
            return false;
        }
    }
    true
}

fn fold(byte: u8) -> u8 {
    if byte.is_ascii_uppercase() {
        byte + 32
    } else {
        byte
    }
}
