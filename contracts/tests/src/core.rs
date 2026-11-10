use crate::harness::{auth, contract_error, errors, Scenario};
use crate::level_00::CounterClient;
use crate::level_01::{exploit, NoentryClient, SPEC as NOENTRY};
use soroban_sdk::{IntoVal, Val, Vec as SVec};

#[test]
fn access_is_on_chain_and_isolated_per_player() {
    let c = Scenario::new();
    let prerequisites = SVec::from_array(&c.env, [crate::level_00::SPEC.id]);
    c.set_prerequisites(NOENTRY.id, &prerequisites);

    assert!(!c.can_access(&c.player, NOENTRY.id));
    assert_eq!(
        c.core_client()
            .mock_auths(&[auth(
                &c.player,
                &c.core,
                "create_instance",
                (&c.player.clone(), NOENTRY.id).into_val(&c.env),
            )])
            .try_create_instance(&c.player, &NOENTRY.id)
            .unwrap_err()
            .unwrap(),
        contract_error(errors::ACCESS_LOCKED),
        "a direct Core call bypassed the closed level"
    );

    let tutorial = c.create_instance(&c.player, crate::level_00::SPEC.id);
    CounterClient::new(&c.env, &tutorial)
        .mock_auths(&[auth(
            &c.player,
            &tutorial,
            "increment",
            SVec::<Val>::new(&c.env),
        )])
        .increment();
    assert_eq!(c.submit(&c.player, &tutorial), Ok(()));

    assert!(c.can_access(&c.player, NOENTRY.id));
    assert!(!c.can_access(&c.other, NOENTRY.id));
    let door = c.create_instance(&c.player, NOENTRY.id);
    exploit(&c, &door, &c.player);
    assert_eq!(c.submit(&c.player, &door), Ok(()));
}

#[test]
fn submission_rechecks_access_after_an_instance_exists() {
    let c = Scenario::new();
    let door = c.create_instance(&c.player, NOENTRY.id);
    let prerequisites = SVec::from_array(&c.env, [crate::level_00::SPEC.id]);
    c.set_prerequisites(NOENTRY.id, &prerequisites);
    exploit(&c, &door, &c.player);

    assert_eq!(
        c.submit(&c.player, &door),
        Err(contract_error(errors::ACCESS_LOCKED)),
        "an instance created before the gate could still be submitted"
    );
}

#[test]
fn the_admin_registers_and_re_registration_is_a_no_op() {
    let c = Scenario::new();

    let hash = c.upload_instance_wasm(&NOENTRY);
    let new_validator = c.register_validator(&NOENTRY);

    c.core_client()
        .mock_auths(&[auth(
            &c.admin,
            &c.core,
            "register_level",
            (7u32, hash.clone(), new_validator.clone()).into_val(&c.env),
        )])
        .register_level(&7u32, &hash, &new_validator);

    assert!(c.core_client().levels().contains(7));

    let before = c.level_info(7);

    let other_validator = c.register_validator(&crate::level_00::SPEC);
    c.core_client()
        .mock_auths(&[auth(
            &c.admin,
            &c.core,
            "register_level",
            (7u32, hash.clone(), other_validator.clone()).into_val(&c.env),
        )])
        .register_level(&7u32, &hash, &other_validator);

    let occurrences = c.core_client().levels().iter().filter(|l| *l == 7).count();
    assert_eq!(occurrences, 1, "re-registration duplicated the level");

    let after = c.level_info(7);
    assert_eq!(
        after.validator, before.validator,
        "re-registration overwrote the validator: the no-op is not a no-op, and the \
         early return in `register_level` is the only thing holding it"
    );
    assert_eq!(
        after.wasm_hash, before.wasm_hash,
        "re-registration overwrote the wasm hash: the no-op is not a no-op"
    );
}

#[test]
fn swapping_the_validator_does_not_invalidate_those_already_solved() {
    let c = Scenario::new();

    let door = c.create_instance(&c.player, NOENTRY.id);
    exploit(&c, &door, &c.player);
    assert_eq!(c.submit(&c.player, &door), Ok(()));
    assert!(c.is_completed(&c.player, NOENTRY.id));

    let new_validator = c.register_validator(&NOENTRY);
    c.set_validator(NOENTRY.id, &new_validator);

    assert_eq!(
        c.level_info(NOENTRY.id).validator,
        new_validator,
        "the swap did not land: without this, a no-op `set_validator` would pass this test"
    );

    assert!(c.is_completed(&c.player, NOENTRY.id));

    let other = c.create_instance(&c.other, NOENTRY.id);
    assert_eq!(
        c.submit(&c.other, &other),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "the swap must hold for those who have not solved it yet"
    );
}

#[test]
fn swapping_the_wasm_hash_moves_only_instances_created_after_it() {
    let c = Scenario::new();

    let before = c.create_instance(&c.player, NOENTRY.id);
    assert_eq!(
        NoentryClient::new(&c.env, &before).owner_of(&17u32),
        before,
        "level 1 must deploy the door before the swap, or this proves nothing"
    );

    let counter_hash = c.upload_instance_wasm(&crate::level_00::SPEC);
    c.set_wasm_hash(NOENTRY.id, &counter_hash);

    exploit(&c, &before, &c.player);
    assert_eq!(c.submit(&c.player, &before), Ok(()));

    let after = c.create_instance(&c.other, NOENTRY.id);
    assert_ne!(before, after, "each attempt has its own address");
    assert_eq!(CounterClient::new(&c.env, &after).count(), 0);
    assert!(NoentryClient::new(&c.env, &after)
        .try_is_open(&17u32)
        .is_err());
}

#[test]
fn the_forced_pair_makes_the_new_target_solvable_end_to_end() {
    let c = Scenario::new();

    let counter_hash = c.upload_instance_wasm(&crate::level_00::SPEC);
    let counter_validator = c.register_validator(&crate::level_00::SPEC);

    c.set_wasm_hash(NOENTRY.id, &counter_hash);
    c.set_validator(NOENTRY.id, &counter_validator);

    let instance = c.create_instance(&c.player, NOENTRY.id);

    assert_eq!(
        c.submit(&c.player, &instance),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );

    CounterClient::new(&c.env, &instance)
        .mock_auths(&[auth(
            &c.player,
            &instance,
            "increment",
            SVec::<Val>::new(&c.env),
        )])
        .increment();

    assert_eq!(c.submit(&c.player, &instance), Ok(()));
    assert!(c.is_completed(&c.player, NOENTRY.id));
}

#[test]
fn swapping_the_wasm_hash_does_not_invalidate_those_already_solved() {
    let c = Scenario::new();

    let door = c.create_instance(&c.player, NOENTRY.id);
    exploit(&c, &door, &c.player);
    assert_eq!(c.submit(&c.player, &door), Ok(()));

    let counter_hash = c.upload_instance_wasm(&crate::level_00::SPEC);
    c.set_wasm_hash(NOENTRY.id, &counter_hash);

    assert!(c.is_completed(&c.player, NOENTRY.id));
}

#[test]
fn only_the_admin_can_swap_the_wasm_hash() {
    let c = Scenario::new();
    let counter_hash = c.upload_instance_wasm(&crate::level_00::SPEC);

    let refused = c
        .core_client()
        .mock_auths(&[auth(
            &c.player,
            &c.core,
            "set_wasm_hash",
            (NOENTRY.id, counter_hash.clone()).into_val(&c.env),
        )])
        .try_set_wasm_hash(&NOENTRY.id, &counter_hash);
    assert!(refused.is_err());

    let still = c.create_instance(&c.player, NOENTRY.id);
    assert_eq!(
        NoentryClient::new(&c.env, &still).owner_of(&17u32),
        still,
        "the refused call must not have moved the target"
    );
}

#[test]
fn set_wasm_hash_on_an_unknown_level_fails() {
    let c = Scenario::new();
    let counter_hash = c.upload_instance_wasm(&crate::level_00::SPEC);

    let err = c
        .core_client()
        .mock_auths(&[auth(
            &c.admin,
            &c.core,
            "set_wasm_hash",
            (999u32, counter_hash.clone()).into_val(&c.env),
        )])
        .try_set_wasm_hash(&999u32, &counter_hash)
        .unwrap_err()
        .unwrap();

    assert_eq!(err, contract_error(errors::LEVEL_NOT_FOUND));
}

#[test]
fn swapping_one_field_does_not_reset_the_other() {
    let c = Scenario::new();
    let original = c.level_info(NOENTRY.id);

    let new_validator = c.register_validator(&crate::level_00::SPEC);
    c.set_validator(NOENTRY.id, &new_validator);

    let after_validator = c.level_info(NOENTRY.id);
    assert_eq!(after_validator.wasm_hash, original.wasm_hash);
    assert_eq!(after_validator.validator, new_validator);

    let counter_hash = c.upload_instance_wasm(&crate::level_00::SPEC);
    c.set_wasm_hash(NOENTRY.id, &counter_hash);

    let after_hash = c.level_info(NOENTRY.id);
    assert_eq!(after_hash.wasm_hash, counter_hash);
    assert_eq!(
        after_hash.validator, new_validator,
        "set_wasm_hash wiped the validator"
    );
}

#[test]
fn a_prerequisite_must_be_an_earlier_unique_level() {
    let c = Scenario::new();

    let ahead = SVec::from_array(&c.env, [NOENTRY.id]);
    let err = c
        .core_client()
        .mock_auths(&[auth(
            &c.admin,
            &c.core,
            "set_prerequisites",
            (crate::level_00::SPEC.id, ahead.clone()).into_val(&c.env),
        )])
        .try_set_prerequisites(&crate::level_00::SPEC.id, &ahead)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, contract_error(errors::INVALID_PREREQUISITE));

    let repeated = SVec::from_array(&c.env, [crate::level_00::SPEC.id, crate::level_00::SPEC.id]);
    let err = c
        .core_client()
        .mock_auths(&[auth(
            &c.admin,
            &c.core,
            "set_prerequisites",
            (NOENTRY.id, repeated.clone()).into_val(&c.env),
        )])
        .try_set_prerequisites(&NOENTRY.id, &repeated)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, contract_error(errors::INVALID_PREREQUISITE));
}
