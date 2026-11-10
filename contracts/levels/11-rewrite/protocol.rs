use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{Bytes, BytesN, Env};

const PUBLIC_KEY: [u8; 32] = [
    224, 154, 21, 70, 219, 68, 255, 86, 85, 35, 26, 211, 192, 24, 76, 25, 179, 154, 109, 178, 141,
    115, 25, 124, 186, 58, 252, 75, 175, 239, 239, 189,
];
const SIGNATURE: [u8; 64] = [
    243, 150, 228, 226, 128, 198, 87, 42, 253, 133, 22, 181, 26, 255, 134, 144, 45, 182, 170, 48,
    52, 167, 76, 122, 206, 59, 32, 202, 194, 50, 100, 224, 81, 66, 100, 48, 124, 118, 200, 199, 72,
    33, 17, 80, 17, 200, 134, 167, 34, 155, 108, 231, 85, 75, 164, 19, 17, 33, 48, 211, 191, 46,
    32, 0,
];
pub fn historical(env: &Env) -> Bytes {
    Bytes::from_slice(env, b"BREAKER/VOSS/v1/diagnose_core")
}
pub fn signature(env: &Env) -> BytesN<64> {
    BytesN::from_array(env, &SIGNATURE)
}
pub fn verify(env: &Env, signature: &BytesN<64>) {
    env.crypto().ed25519_verify(
        &BytesN::from_array(env, &PUBLIC_KEY),
        &historical(env),
        signature,
    );
}
pub fn share(env: &Env, context: &Bytes, index: u32) -> BytesN<32> {
    if index > 2 {
        panic!("unknown evidence reference");
    }
    env.crypto()
        .sha256(
            &(
                Bytes::from_slice(env, b"BREAKER/EVIDENCE/v1"),
                context.clone(),
                index,
            )
                .to_xdr(env),
        )
        .into()
}
pub fn key(env: &Env, context: &Bytes) -> BytesN<32> {
    let a = share(env, context, 0);
    let b = share(env, context, 1);
    let c = share(env, context, 2);
    let mut result = [0u8; 32];
    for i in 0..32 {
        result[i as usize] = a.get(i).unwrap() ^ b.get(i).unwrap() ^ c.get(i).unwrap();
    }
    BytesN::from_array(env, &result)
}
pub fn commitment(env: &Env, context: &Bytes, key: &BytesN<32>) -> BytesN<32> {
    env.crypto()
        .sha256(
            &(
                Bytes::from_slice(env, b"BREAKER/COMMITMENT/v1"),
                context.clone(),
                key.clone(),
            )
                .to_xdr(env),
        )
        .into()
}
