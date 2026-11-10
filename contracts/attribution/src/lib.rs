#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, xdr::ToXdr, Bytes, BytesN, Env};

const DOMAIN: &[u8] = b"BREAKER/QA/VOSS-ATTRIBUTION/v1";
const VAULT_AMOUNT: i128 = 2_400_000;
const ROUTE_17: u32 = 17;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Fixture {
    pub incident_hash: BytesN<32>,
    pub gate_event_hash: BytesN<32>,
    pub recovery_hash: BytesN<32>,
    pub escrow_credit_hash: BytesN<32>,

    pub authenticated_actor: BytesN<32>,
    pub voss_operational_key: BytesN<32>,
    pub incident_ledger: u32,
    pub key_valid_from: u32,
    pub key_valid_until: u32,
    pub gate_route: u32,
    pub recovery_observed_route: u32,
    pub amount: i128,
    pub voss_can_withdraw: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Gates {
    pub g0_incident: bool,
    pub g1_gate: bool,
    pub g2_actor: bool,
    pub g3_identity: bool,
    pub g4_causality: bool,
    pub g5_escrow: bool,
    pub g6_complete: bool,
}

#[contracttype]
#[derive(Clone)]
struct AttestationPayload {
    domain: Bytes,
    incident_hash: BytesN<32>,
    gate_event_hash: BytesN<32>,
    recovery_hash: BytesN<32>,
    escrow_credit_hash: BytesN<32>,
    authenticated_actor: BytesN<32>,
    voss_operational_key: BytesN<32>,
    incident_ledger: u32,
    key_valid_from: u32,
    key_valid_until: u32,
    gate_route: u32,
    recovery_observed_route: u32,
    amount: i128,
    voss_can_withdraw: bool,
}

#[contracttype]
enum DataKey {
    Fixture,
    ActorKey,
    IssuerKey,
}

#[contract]
pub struct VossAttribution;

#[contractimpl]
impl VossAttribution {
    pub fn __constructor(
        env: Env,
        fixture: Fixture,
        actor_key: BytesN<32>,
        actor_signature: BytesN<64>,
        issuer_key: BytesN<32>,
        issuer_signature: BytesN<64>,
    ) {
        let payload = Self::attestation_payload(&env, &fixture);
        env.crypto()
            .ed25519_verify(&actor_key, &payload, &actor_signature);
        env.crypto()
            .ed25519_verify(&issuer_key, &payload, &issuer_signature);
        env.storage().instance().set(&DataKey::Fixture, &fixture);
        env.storage().instance().set(&DataKey::ActorKey, &actor_key);
        env.storage()
            .instance()
            .set(&DataKey::IssuerKey, &issuer_key);
    }

    pub fn fixture(env: Env) -> Fixture {
        env.storage().instance().get(&DataKey::Fixture).unwrap()
    }

    pub fn payload(env: Env) -> Bytes {
        let fixture = Self::fixture(env.clone());
        Self::attestation_payload(&env, &fixture)
    }

    pub fn gates(env: Env) -> Gates {
        let fixture = Self::fixture(env.clone());
        Self::evaluate(
            env.clone(),
            fixture,
            Self::actor_key(&env),
            Self::issuer_key(&env),
        )
    }

    pub fn evaluate(
        env: Env,
        fixture: Fixture,
        actor_key: BytesN<32>,
        issuer_key: BytesN<32>,
    ) -> Gates {
        let zero = BytesN::from_array(&env, &[0; 32]);
        let g0_incident = fixture.incident_hash != zero;
        let g1_gate = fixture.gate_event_hash != zero && fixture.gate_route == ROUTE_17;
        let g2_actor = fixture.authenticated_actor == fixture.voss_operational_key
            && fixture.authenticated_actor == actor_key;
        let g3_identity = fixture.incident_ledger >= fixture.key_valid_from
            && fixture.incident_ledger <= fixture.key_valid_until
            && issuer_key != zero;
        let g4_causality =
            fixture.recovery_hash != zero && fixture.gate_route == fixture.recovery_observed_route;
        let g5_escrow = fixture.escrow_credit_hash != zero
            && fixture.amount == VAULT_AMOUNT
            && !fixture.voss_can_withdraw;
        let g6_complete =
            g0_incident && g1_gate && g2_actor && g3_identity && g4_causality && g5_escrow;
        Gates {
            g0_incident,
            g1_gate,
            g2_actor,
            g3_identity,
            g4_causality,
            g5_escrow,
            g6_complete,
        }
    }

    pub fn attribution_verified(env: Env) -> bool {
        Self::gates(env).g6_complete
    }

    fn actor_key(env: &Env) -> BytesN<32> {
        env.storage().instance().get(&DataKey::ActorKey).unwrap()
    }

    fn issuer_key(env: &Env) -> BytesN<32> {
        env.storage().instance().get(&DataKey::IssuerKey).unwrap()
    }

    fn attestation_payload(env: &Env, fixture: &Fixture) -> Bytes {
        AttestationPayload {
            domain: Bytes::from_slice(env, DOMAIN),
            incident_hash: fixture.incident_hash.clone(),
            gate_event_hash: fixture.gate_event_hash.clone(),
            recovery_hash: fixture.recovery_hash.clone(),
            escrow_credit_hash: fixture.escrow_credit_hash.clone(),
            authenticated_actor: fixture.authenticated_actor.clone(),
            voss_operational_key: fixture.voss_operational_key.clone(),
            incident_ledger: fixture.incident_ledger,
            key_valid_from: fixture.key_valid_from,
            key_valid_until: fixture.key_valid_until,
            gate_route: fixture.gate_route,
            recovery_observed_route: fixture.recovery_observed_route,
            amount: fixture.amount,
            voss_can_withdraw: fixture.voss_can_withdraw,
        }
        .to_xdr(env)
    }
}

#[cfg(test)]
extern crate std;

#[cfg(test)]
mod tests {
    use super::*;

    const ACTOR_KEY: [u8; 32] = [
        5, 122, 25, 253, 6, 214, 23, 86, 22, 31, 82, 127, 67, 10, 14, 98, 135, 4, 96, 127, 78, 89,
        58, 242, 196, 20, 170, 113, 73, 24, 120, 207,
    ];
    const ACTOR_SIGNATURE: [u8; 64] = [
        231, 11, 58, 96, 60, 60, 25, 86, 45, 46, 82, 204, 168, 121, 9, 176, 151, 245, 180, 60, 218,
        138, 164, 111, 28, 126, 36, 33, 235, 36, 154, 4, 178, 118, 75, 106, 135, 22, 135, 18, 168,
        69, 164, 231, 212, 205, 253, 22, 42, 253, 2, 198, 144, 71, 123, 180, 218, 157, 250, 157,
        103, 168, 113, 12,
    ];
    const ISSUER_KEY: [u8; 32] = [
        83, 41, 65, 139, 101, 116, 125, 101, 57, 137, 169, 26, 215, 133, 204, 94, 48, 195, 240, 3,
        91, 187, 136, 137, 115, 157, 180, 65, 163, 239, 238, 5,
    ];
    const ISSUER_SIGNATURE: [u8; 64] = [
        201, 86, 240, 27, 137, 98, 165, 50, 76, 0, 125, 216, 226, 219, 181, 99, 230, 43, 233, 140,
        224, 187, 5, 12, 46, 96, 82, 4, 245, 7, 97, 95, 206, 56, 117, 163, 11, 38, 63, 33, 187,
        156, 12, 128, 230, 178, 245, 123, 63, 226, 136, 60, 98, 92, 194, 129, 252, 70, 217, 246,
        213, 81, 213, 0,
    ];

    fn fixture(env: &Env) -> Fixture {
        let hash = |value| BytesN::from_array(env, &[value; 32]);
        Fixture {
            incident_hash: hash(1),
            gate_event_hash: hash(2),
            recovery_hash: hash(3),
            escrow_credit_hash: hash(4),
            authenticated_actor: BytesN::from_array(env, &ACTOR_KEY),
            voss_operational_key: BytesN::from_array(env, &ACTOR_KEY),
            incident_ledger: 100,
            key_valid_from: 90,
            key_valid_until: 110,
            gate_route: 17,
            recovery_observed_route: 17,
            amount: VAULT_AMOUNT,
            voss_can_withdraw: false,
        }
    }

    fn hash(env: &Env, value: u8) -> BytesN<32> {
        BytesN::from_array(env, &[value; 32])
    }

    fn client(env: &Env) -> VossAttributionClient<'_> {
        let actor_key = BytesN::from_array(env, &ACTOR_KEY);
        let actor_signature = BytesN::from_array(env, &ACTOR_SIGNATURE);
        let issuer_key = BytesN::from_array(env, &ISSUER_KEY);
        let issuer_signature = BytesN::from_array(env, &ISSUER_SIGNATURE);
        VossAttributionClient::new(
            env,
            &env.register(
                VossAttribution,
                (
                    fixture(env),
                    actor_key,
                    actor_signature,
                    issuer_key,
                    issuer_signature,
                ),
            ),
        )
    }

    #[test]
    fn signed_qa_fixture_passes_all_gates() {
        let env = Env::default();
        let gates = client(&env).gates();
        assert!(
            gates.g0_incident
                && gates.g1_gate
                && gates.g2_actor
                && gates.g3_identity
                && gates.g4_causality
                && gates.g5_escrow
                && gates.g6_complete
        );
        assert!(client(&env).attribution_verified());
    }

    #[test]
    fn negative_fixtures_do_not_release_attribution() {
        let env = Env::default();
        let good = fixture(&env);
        let actor = BytesN::from_array(&env, &ACTOR_KEY);
        let issuer = BytesN::from_array(&env, &ISSUER_KEY);
        let reject = |candidate: Fixture| {
            assert!(
                !VossAttributionClient::new(
                    &env,
                    &env.register(
                        VossAttribution,
                        (
                            good.clone(),
                            actor.clone(),
                            BytesN::from_array(&env, &ACTOR_SIGNATURE),
                            issuer.clone(),
                            BytesN::from_array(&env, &ISSUER_SIGNATURE)
                        )
                    )
                )
                .evaluate(&candidate, &actor, &issuer)
                .g6_complete
            );
        };

        reject(Fixture {
            authenticated_actor: hash(&env, 9),
            ..good.clone()
        });

        reject(Fixture {
            incident_hash: hash(&env, 0),
            ..good.clone()
        });
        reject(Fixture {
            incident_ledger: 111,
            ..good.clone()
        });

        reject(Fixture {
            recovery_observed_route: 18,
            ..good.clone()
        });

        reject(Fixture {
            amount: 2_399_999,
            ..good.clone()
        });
        reject(Fixture {
            voss_can_withdraw: true,
            ..good.clone()
        });
    }
}
