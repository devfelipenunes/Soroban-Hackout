use crate::harness::{auth, contract_error, register, Scenario};
use crate::level_00::CounterClient;
use soroban_sdk::{contractclient, Address, Env, IntoVal, String, Vec};

#[allow(dead_code)]
#[contractclient(name = "SeasonClient")]
trait SeasonInterface {
    fn claim(env: Env, player: Address) -> u32;
    fn has_claimed(env: Env, player: Address) -> bool;
    fn token_of(env: Env, player: Address) -> Option<u32>;
    fn balance(env: Env, owner: Address) -> u32;
    fn owner_of(env: Env, token_id: u32) -> Address;
    fn name(env: Env) -> String;
    fn symbol(env: Env) -> String;
    fn token_uri(env: Env, token_id: u32) -> String;
    fn set_uri(env: Env, uri: String);
    fn transfer(env: Env, from: Address, to: Address, token_id: u32);
    fn approve(
        env: Env,
        approver: Address,
        approved: Address,
        token_id: u32,
        live_until_ledger: u32,
    );
}

const NOT_COMPLETED: u32 = 1;
const ALREADY_CLAIMED: u32 = 2;
const NON_TRANSFERABLE: u32 = 3;

fn season(c: &Scenario, cases: Vec<u32>) -> (Address, SeasonClient<'_>) {
    let address = register(
        &c.env,
        "breaker_credentials",
        (
            c.admin.clone(),
            c.core.clone(),
            cases,
            String::from_str(&c.env, "Breaker — Season 01"),
            String::from_str(&c.env, "BREAKER-S1"),
            String::from_str(&c.env, "https://example.test/season-1.json"),
        ),
    );
    (address.clone(), SeasonClient::new(&c.env, &address))
}

fn claim_auth<'a>(c: &'a Scenario, address: &'a Address) -> soroban_sdk::testutils::MockAuth<'a> {
    auth(
        &c.player,
        address,
        "claim",
        (c.player.clone(),).into_val(&c.env),
    )
}

fn complete_tutorial(c: &Scenario) {
    let instance = c.create_instance(&c.player, crate::level_00::SPEC.id);
    CounterClient::new(&c.env, &instance)
        .mock_auths(&[auth(&c.player, &instance, "increment", Vec::new(&c.env))])
        .increment();
    assert_eq!(c.submit(&c.player, &instance), Ok(()));
}

#[test]
fn the_objective_is_not_met_before_the_cases_are_completed() {
    let c = Scenario::new();
    let cases = Vec::from_array(&c.env, [crate::level_00::SPEC.id]);
    let (address, season) = season(&c, cases);

    let before = season
        .mock_auths(&[claim_auth(&c, &address)])
        .try_claim(&c.player)
        .unwrap_err()
        .unwrap();
    assert_eq!(before, contract_error(NOT_COMPLETED));
    assert!(!season.has_claimed(&c.player));
}

#[test]
fn the_season_credential_is_claimable_once_after_every_case() {
    let c = Scenario::new();
    let cases = Vec::from_array(&c.env, [crate::level_00::SPEC.id]);
    let (address, season) = season(&c, cases);
    complete_tutorial(&c);

    let token_id = season
        .mock_auths(&[claim_auth(&c, &address)])
        .claim(&c.player);
    assert!(season.has_claimed(&c.player));
    assert_eq!(season.token_of(&c.player), Some(token_id));
    assert_eq!(season.owner_of(&token_id), c.player);
    assert_eq!(season.balance(&c.player), 1);
    assert_eq!(
        season.name(),
        String::from_str(&c.env, "Breaker — Season 01")
    );
    assert_eq!(season.symbol(), String::from_str(&c.env, "BREAKER-S1"));
    assert_eq!(
        season.token_uri(&token_id),
        String::from_str(&c.env, "https://example.test/season-1.json")
    );

    let duplicate = season
        .mock_auths(&[claim_auth(&c, &address)])
        .try_claim(&c.player)
        .unwrap_err()
        .unwrap();
    assert_eq!(duplicate, contract_error(ALREADY_CLAIMED));
}

#[test]
fn every_declared_case_is_required() {
    let c = Scenario::new();
    let cases = Vec::from_array(&c.env, [crate::level_00::SPEC.id, crate::level_01::SPEC.id]);
    let (address, season) = season(&c, cases);
    complete_tutorial(&c);

    let incomplete = season
        .mock_auths(&[claim_auth(&c, &address)])
        .try_claim(&c.player)
        .unwrap_err()
        .unwrap();
    assert_eq!(incomplete, contract_error(NOT_COMPLETED));

    let door = c.create_instance(&c.player, crate::level_01::SPEC.id);
    crate::level_01::exploit(&c, &door, &c.player);
    assert_eq!(c.submit(&c.player, &door), Ok(()));

    let token_id = season
        .mock_auths(&[claim_auth(&c, &address)])
        .claim(&c.player);
    assert_eq!(season.owner_of(&token_id), c.player);
}

#[test]
fn the_credential_cannot_be_transferred_or_approved() {
    let c = Scenario::new();
    let cases = Vec::from_array(&c.env, [crate::level_00::SPEC.id]);
    let (address, season) = season(&c, cases);
    complete_tutorial(&c);
    let token_id = season
        .mock_auths(&[claim_auth(&c, &address)])
        .claim(&c.player);

    let transfer = season
        .mock_all_auths()
        .try_transfer(&c.player, &c.other, &token_id)
        .unwrap_err()
        .unwrap();
    assert_eq!(transfer, contract_error(NON_TRANSFERABLE));

    let approve = season
        .mock_all_auths()
        .try_approve(
            &c.player,
            &c.other,
            &token_id,
            &(c.env.ledger().sequence() + 100),
        )
        .unwrap_err()
        .unwrap();
    assert_eq!(approve, contract_error(NON_TRANSFERABLE));
}

#[test]
fn the_admin_can_change_the_metadata_uri() {
    let c = Scenario::new();
    let cases = Vec::from_array(&c.env, [crate::level_00::SPEC.id]);
    let (address, season) = season(&c, cases);
    complete_tutorial(&c);
    let token_id = season
        .mock_auths(&[claim_auth(&c, &address)])
        .claim(&c.player);

    let next = String::from_str(&c.env, "https://example.test/season-1-v2.json");
    season
        .mock_auths(&[auth(
            &c.admin,
            &address,
            "set_uri",
            (next.clone(),).into_val(&c.env),
        )])
        .set_uri(&next);
    assert_eq!(season.token_uri(&token_id), next);
}
