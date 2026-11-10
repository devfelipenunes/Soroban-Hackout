use crate::harness::{auth, contract_error, errors, LevelSpec, Scenario};
use soroban_sdk::{contractclient, Address, Env, IntoVal};

const STAKE: u32 = 10_001;
const RATE: u32 = 10_001;

pub const SPEC: LevelSpec = LevelSpec {
    id: 7,
    slug: "impossible",
    interface: &[
        "__constructor",
        "accrue",
        "accrue_checked",
        "amount",
        "credit",
        "elapsed",
        "impossible",
        "min_input",
        "player",
        "rate",
        "stake",
        "withdraw",
        "withdraw_checked",
    ],
};

#[allow(dead_code)]
#[contractclient(name = "ImpossibleClient")]
pub trait ImpossibleInterface {
    fn accrue(env: Env, player: Address, stake: u32, rate: u32, elapsed: u32);
    fn accrue_checked(env: Env, player: Address, stake: u32, rate: u32, elapsed: u32);
    fn withdraw(env: Env, player: Address, amount: u32);
    fn withdraw_checked(env: Env, player: Address, amount: u32);
    fn credit(env: Env, player: Address) -> u32;
    fn impossible(env: Env) -> u32;
    fn min_input(env: Env) -> u32;
}

fn inverse_odd(value: u64) -> u64 {
    let mut inverse = value;
    for _ in 0..6 {
        inverse = inverse.wrapping_mul(2u64.wrapping_sub(value.wrapping_mul(inverse)));
    }
    inverse & 0xffff_ffff
}

fn elapsed_for(c: &Scenario, instance: &Address) -> u32 {
    let target = ImpossibleClient::new(&c.env, instance).impossible();
    let inverse = inverse_odd((STAKE as u64) * (RATE as u64));
    ((target as u64).wrapping_mul(inverse) & 0xffff_ffff) as u32
}

fn accrue(c: &Scenario, instance: &Address, player: &Address, stake: u32, rate: u32, elapsed: u32) {
    ImpossibleClient::new(&c.env, instance)
        .mock_auths(&[auth(
            player,
            instance,
            "accrue",
            (player.clone(), stake, rate, elapsed).into_val(&c.env),
        )])
        .accrue(player, &stake, &rate, &elapsed);
}

fn withdraw(c: &Scenario, instance: &Address, player: &Address, amount: u32) {
    ImpossibleClient::new(&c.env, instance)
        .mock_auths(&[auth(
            player,
            instance,
            "withdraw",
            (player.clone(), amount).into_val(&c.env),
        )])
        .withdraw(player, &amount);
}

fn underflow_amount(target: u32) -> u32 {
    0u32.wrapping_sub(target)
}

pub(crate) fn exploit(c: &Scenario, instance: &Address, player: &Address) {
    let target = ImpossibleClient::new(&c.env, instance).impossible();
    withdraw(c, instance, player, underflow_amount(target));
}

#[test]
fn the_objective_is_not_met_at_the_start() {
    let c = Scenario::new();
    let account = c.create_instance(&c.player, SPEC.id);
    let client = ImpossibleClient::new(&c.env, &account);

    assert_eq!(client.credit(&c.player), 0, "the account starts empty");
    assert_ne!(
        client.impossible(),
        0,
        "the per-player target must be a real balance"
    );
    assert_eq!(client.min_input(), 10_000);

    assert_eq!(
        c.submit(&c.player, &account),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "an untouched account must not pass"
    );
}

#[test]
fn the_product_path_reaches_the_impossible_balance() {
    let c = Scenario::new();
    let account = c.create_instance(&c.player, SPEC.id);
    let client = ImpossibleClient::new(&c.env, &account);
    let target = client.impossible();
    let elapsed = elapsed_for(&c, &account);

    assert_eq!(
        STAKE.wrapping_mul(RATE).wrapping_mul(elapsed),
        target,
        "the computed elapsed must land on this instance's target"
    );

    accrue(&c, &account, &c.player, STAKE, RATE, elapsed);

    assert_eq!(client.credit(&c.player), target);
    assert_eq!(c.submit(&c.player, &account), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn the_withdraw_underflow_reaches_the_target() {
    let c = Scenario::new();
    let account = c.create_instance(&c.player, SPEC.id);
    let client = ImpossibleClient::new(&c.env, &account);
    let target = client.impossible();

    withdraw(&c, &account, &c.player, underflow_amount(target));

    assert_eq!(client.credit(&c.player), target);
    assert_eq!(c.submit(&c.player, &account), Ok(()));
    assert!(c.is_completed(&c.player, SPEC.id));
}

#[test]
fn the_checked_withdraw_refuses_the_underflow() {
    let c = Scenario::new();
    let account = c.create_instance(&c.player, SPEC.id);
    let client = ImpossibleClient::new(&c.env, &account);
    let amount = underflow_amount(client.impossible());

    let result = client
        .mock_auths(&[auth(
            &c.player,
            &account,
            "withdraw_checked",
            (c.player.clone(), amount).into_val(&c.env),
        )])
        .try_withdraw_checked(&c.player, &amount);

    assert!(
        result.is_err(),
        "the checked path must refuse the underflow"
    );
    assert_eq!(client.credit(&c.player), 0);
    assert_eq!(
        c.submit(&c.player, &account),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );
}

#[test]
fn the_checked_path_refuses_the_overflow() {
    let c = Scenario::new();
    let account = c.create_instance(&c.player, SPEC.id);
    let client = ImpossibleClient::new(&c.env, &account);
    let elapsed = elapsed_for(&c, &account);

    let result = client
        .mock_auths(&[auth(
            &c.player,
            &account,
            "accrue_checked",
            (c.player.clone(), STAKE, RATE, elapsed).into_val(&c.env),
        )])
        .try_accrue_checked(&c.player, &STAKE, &RATE, &elapsed);

    assert!(result.is_err(), "the checked path must refuse the overflow");
    assert_eq!(client.credit(&c.player), 0);
    assert_eq!(
        c.submit(&c.player, &account),
        Err(contract_error(errors::OBJECTIVE_NOT_MET))
    );
}

#[test]
fn the_inputs_below_the_floor_are_refused() {
    let c = Scenario::new();
    let account = c.create_instance(&c.player, SPEC.id);

    let result = ImpossibleClient::new(&c.env, &account)
        .mock_auths(&[auth(
            &c.player,
            &account,
            "accrue",
            (c.player.clone(), 1u32, 1u32, 1u32).into_val(&c.env),
        )])
        .try_accrue(&c.player, &1u32, &1u32, &1u32);

    assert!(result.is_err(), "the contract only accepts large inputs");
    assert_eq!(ImpossibleClient::new(&c.env, &account).credit(&c.player), 0);
}

#[test]
fn a_product_that_does_not_wrap_is_not_the_exploit() {
    let c = Scenario::new();
    let account = c.create_instance(&c.player, SPEC.id);

    accrue(&c, &account, &c.player, STAKE, RATE, 2);

    assert_eq!(
        ImpossibleClient::new(&c.env, &account).credit(&c.player),
        STAKE * RATE * 2
    );
    assert_eq!(
        c.submit(&c.player, &account),
        Err(contract_error(errors::OBJECTIVE_NOT_MET)),
        "a large but ordinary balance is not the impossible one"
    );
}

#[test]
fn submitting_twice_is_refused() {
    let c = Scenario::new();
    let account = c.create_instance(&c.player, SPEC.id);
    exploit(&c, &account, &c.player);

    assert_eq!(c.submit(&c.player, &account), Ok(()));
    assert_eq!(
        c.submit(&c.player, &account),
        Err(contract_error(errors::ALREADY_COMPLETED))
    );
}

#[test]
fn an_instance_the_core_did_not_create_is_refused() {
    let c = Scenario::new();
    let foreign = crate::harness::register(&c.env, &SPEC.instance_wasm(), (c.player.clone(),));

    exploit(&c, &foreign, &c.player);
    assert_eq!(
        ImpossibleClient::new(&c.env, &foreign).credit(&c.player),
        ImpossibleClient::new(&c.env, &foreign).impossible()
    );

    assert_eq!(
        c.submit(&c.player, &foreign),
        Err(contract_error(errors::UNKNOWN_INSTANCE))
    );
}
