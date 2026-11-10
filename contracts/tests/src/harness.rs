use soroban_sdk::{
    contractclient, contracttype, testutils::Address as _, Address, Bytes, BytesN, ConstructorArgs,
    Env, Error, IntoVal, Val,
};

const WITHOUT_CHECKS: &[u8] = include_bytes!("../fixtures/fixture_overflow_no_checks.wasm");

const WITH_CHECKS: &[u8] = include_bytes!("../fixtures/fixture_overflow_with_checks.wasm");

#[allow(dead_code)]
#[contractclient(name = "FixtureOverflowClient")]
pub trait FixtureOverflowInterface {
    fn add_one(env: Env, x: u32) -> u32;
}

const CEILING: u32 = u32::MAX;

#[test]
fn the_harness_tells_the_two_wasms_apart() {
    let env_without = Env::default();
    let without =
        FixtureOverflowClient::new(&env_without, &env_without.register(WITHOUT_CHECKS, ()));
    assert_eq!(
        without.add_one(&CEILING),
        0,
        "the WASM built without checks should wrap: u32::MAX + 1 == 0"
    );

    let env_with = Env::default();
    let with = FixtureOverflowClient::new(&env_with, &env_with.register(WITH_CHECKS, ()));
    assert!(
        with.try_add_one(&CEILING).is_err(),
        "the WASM built with checks should abort on the host"
    );
}

#[test]
fn the_native_source_panics() {
    let hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    let result = std::panic::catch_unwind(|| {
        let x: u32 = std::hint::black_box(CEILING);
        x + 1
    });
    std::panic::set_hook(hook);

    assert!(
        result.is_err(),
        "the test profile should have overflow-checks on — \
         if this test failed, rule 4's premise changed and it needs revisiting"
    );
}

#[test]
fn the_two_versioned_fixtures_differ() {
    assert_ne!(
        WITHOUT_CHECKS, WITH_CHECKS,
        "the two fixtures hold the same bytes — run tests/build-fixtures.sh"
    );
    assert!(
        !WITHOUT_CHECKS.is_empty(),
        "empty fixture: include_bytes! picked up a file that was never built"
    );
}

#[test]
fn the_scenario_leaves_authorization_off() {
    let scenario = Scenario::new();
    let anywhere = BytesN::from_array(&scenario.env, &[0; 32]);

    assert!(
        scenario
            .core_client()
            .try_register_level(&999u32, &anywhere, &scenario.admin)
            .is_err(),
        "authorization survived the setup: mock_all_auths is still on, and every require_auth \
         assertion in this suite is now theatre"
    );
}

const WASM_DIR: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../target/wasm32v1-none/release"
);

const CONTRACTS_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/..");

fn newest_build_input(dir: &std::path::Path, newest: &mut std::time::SystemTime) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() {
            let skip = matches!(
                path.file_name().and_then(|n| n.to_str()),
                Some("target") | Some("tests")
            );
            if !skip {
                newest_build_input(&path, newest);
            }
            continue;
        }

        let is_input = matches!(
            path.extension().and_then(|e| e.to_str()),
            Some("rs") | Some("toml")
        );
        if !is_input {
            continue;
        }

        if let Ok(modified) = entry.metadata().and_then(|m| m.modified()) {
            if modified > *newest {
                *newest = modified;
            }
        }
    }
}

fn newest_build_input_overall() -> std::time::SystemTime {
    let mut newest = std::time::SystemTime::UNIX_EPOCH;
    newest_build_input(std::path::Path::new(CONTRACTS_DIR), &mut newest);
    newest
}

pub fn read_wasm(name: &str) -> std::vec::Vec<u8> {
    let path = format!("{WASM_DIR}/{name}.wasm");
    let wasm = std::fs::read(&path).unwrap_or_else(|e| {
        panic!(
            "could not read `{path}`: {e}\n\
             The contracts must be built BEFORE the tests.\n\
             Run:  cd contracts && ./build.sh"
        )
    });

    if let Ok(built_at) = std::fs::metadata(&path).and_then(|m| m.modified()) {
        let source_at = newest_build_input_overall();
        if built_at < source_at {
            panic!(
                "`{path}` is OLDER than the sources it was built from.\n\
                 A stale WASM passes this whole suite while testing code that no longer exists —\n\
                 every green below it would be a lie.\n\
                 Run:  cd contracts && ./build.sh"
            );
        }
    }

    wasm
}

pub fn bytes(env: &Env, name: &str) -> Bytes {
    Bytes::from_slice(env, &read_wasm(name))
}

pub fn register<A: ConstructorArgs>(env: &Env, name: &str, args: A) -> Address {
    env.register(read_wasm(name).as_slice(), args)
}

const SPEC_SECTION: &str = "contractspecv0";

fn read_leb128(bytes: &[u8], at: usize) -> (usize, usize) {
    let mut value = 0usize;
    let mut shift = 0u32;
    let mut i = at;

    loop {
        let byte = bytes[i];
        i += 1;
        value |= ((byte & 0x7f) as usize) << shift;
        if byte & 0x80 == 0 {
            return (value, i);
        }
        shift += 7;
    }
}

fn spec_section(wasm: &[u8]) -> Option<&[u8]> {
    let mut i = 8;

    while i < wasm.len() {
        let id = wasm[i];
        let (size, after_size) = read_leb128(wasm, i + 1);
        let payload = &wasm[after_size..after_size + size];
        i = after_size + size;

        if id != 0 {
            continue;
        }

        let (name_len, after_len) = read_leb128(payload, 0);
        if &payload[after_len..after_len + name_len] == SPEC_SECTION.as_bytes() {
            return Some(&payload[after_len + name_len..]);
        }
    }

    None
}

fn is_identifier_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

pub fn spec_identifiers(name: &str) -> Vec<String> {
    let wasm = read_wasm(name);
    let payload = spec_section(&wasm).unwrap_or_else(|| {
        panic!(
            "`{name}.wasm` has no `{SPEC_SECTION}` section. Every contract this project builds \
             declares one, so its absence means the build changed shape — and a whitelist read \
             off an empty spec would pass by finding nothing"
        )
    });

    let mut found = Vec::new();
    let mut i = 0;

    while i + 4 <= payload.len() {
        let len = u32::from_be_bytes([payload[i], payload[i + 1], payload[i + 2], payload[i + 3]])
            as usize;
        let end = i + 4 + len;

        if (1..=64).contains(&len) && end <= payload.len() {
            let candidate = &payload[i + 4..end];
            let starts = candidate[0].is_ascii_alphabetic() || candidate[0] == b'_';

            if starts && candidate.iter().all(|byte| is_identifier_byte(*byte)) {
                found.push(String::from_utf8_lossy(candidate).into_owned());
                i = end;
                continue;
            }
        }

        i += 1;
    }

    found.sort();
    found.dedup();
    found
}

#[contracttype]
#[derive(Clone)]
pub struct LevelInfo {
    pub wasm_hash: BytesN<32>,
    pub validator: Address,
}

#[allow(dead_code)]
#[contractclient(name = "BreakerCoreClient")]
pub trait BreakerCoreInterface {
    fn register_level(env: Env, level_id: u32, wasm_hash: BytesN<32>, validator: Address);
    fn set_validator(env: Env, level_id: u32, validator: Address);
    fn set_wasm_hash(env: Env, level_id: u32, wasm_hash: BytesN<32>);
    fn set_prerequisites(env: Env, level_id: u32, prerequisites: soroban_sdk::Vec<u32>);
    fn create_instance(env: Env, player: Address, level_id: u32) -> Address;
    fn submit_instance(env: Env, instance: Address);
    fn levels(env: Env) -> soroban_sdk::Vec<u32>;
    fn level_info(env: Env, level_id: u32) -> LevelInfo;
    fn instances(env: Env, player: Address, level_id: u32) -> soroban_sdk::Vec<Address>;
    fn is_completed(env: Env, player: Address, level_id: u32) -> bool;
    fn can_access(env: Env, player: Address, level_id: u32) -> bool;
}

pub mod errors {
    pub const LEVEL_NOT_FOUND: u32 = 1;
    pub const UNKNOWN_INSTANCE: u32 = 2;
    pub const ALREADY_COMPLETED: u32 = 3;
    pub const OBJECTIVE_NOT_MET: u32 = 4;
    pub const ACCESS_LOCKED: u32 = 6;
    pub const INVALID_PREREQUISITE: u32 = 7;
}

pub struct LevelSpec {
    pub id: u32,
    pub slug: &'static str,
    pub interface: &'static [&'static str],
}

impl LevelSpec {
    pub fn instance_wasm(&self) -> String {
        format!("breaker_level_{:02}_{}", self.id, self.slug)
    }

    pub fn validator_wasm(&self) -> String {
        format!("breaker_level_{:02}_validator", self.id)
    }
}

pub struct Scenario {
    pub env: Env,
    pub core: Address,
    pub admin: Address,
    pub player: Address,
    pub other: Address,
}

impl Scenario {
    pub fn new() -> Self {
        Self::with_levels(crate::levels::ALL)
    }

    pub fn with_levels(specs: &[&LevelSpec]) -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let player = Address::generate(&env);
        let other = Address::generate(&env);

        let core = register(&env, "breaker_core", (admin.clone(),));
        let core_client = BreakerCoreClient::new(&env, &core);

        for spec in specs {
            let wasm_hash = env
                .deployer()
                .upload_contract_wasm(bytes(&env, &spec.instance_wasm()));
            let validator = register(&env, &spec.validator_wasm(), ());
            core_client.register_level(&spec.id, &wasm_hash, &validator);
        }

        env.set_auths(&[]);

        Self {
            env,
            core,
            admin,
            player,
            other,
        }
    }

    pub fn core_client(&self) -> BreakerCoreClient<'_> {
        BreakerCoreClient::new(&self.env, &self.core)
    }

    pub fn create_instance(&self, player: &Address, level_id: u32) -> Address {
        self.core_client()
            .mock_auths(&[auth(
                player,
                &self.core,
                "create_instance",
                (&player.clone(), level_id).into_val(&self.env),
            )])
            .create_instance(player, &level_id)
    }

    pub fn upload_instance_wasm(&self, spec: &LevelSpec) -> BytesN<32> {
        self.env
            .deployer()
            .upload_contract_wasm(bytes(&self.env, &spec.instance_wasm()))
    }

    pub fn register_validator(&self, spec: &LevelSpec) -> Address {
        register(&self.env, &spec.validator_wasm(), ())
    }

    pub fn set_wasm_hash(&self, level_id: u32, wasm_hash: &BytesN<32>) {
        self.core_client()
            .mock_auths(&[auth(
                &self.admin,
                &self.core,
                "set_wasm_hash",
                (level_id, wasm_hash.clone()).into_val(&self.env),
            )])
            .set_wasm_hash(&level_id, wasm_hash);
    }

    pub fn set_validator(&self, level_id: u32, validator: &Address) {
        self.core_client()
            .mock_auths(&[auth(
                &self.admin,
                &self.core,
                "set_validator",
                (level_id, validator.clone()).into_val(&self.env),
            )])
            .set_validator(&level_id, validator);
    }

    pub fn set_prerequisites(&self, level_id: u32, prerequisites: &soroban_sdk::Vec<u32>) {
        self.core_client()
            .mock_auths(&[auth(
                &self.admin,
                &self.core,
                "set_prerequisites",
                (level_id, prerequisites.clone()).into_val(&self.env),
            )])
            .set_prerequisites(&level_id, prerequisites);
    }

    pub fn register_aux(&self, name: &str) -> Address {
        register(&self.env, name, ())
    }

    pub fn level_info(&self, level_id: u32) -> LevelInfo {
        self.core_client().level_info(&level_id)
    }

    pub fn submit(&self, owner: &Address, instance: &Address) -> Result<(), Error> {
        match self
            .core_client()
            .mock_auths(&[auth(
                owner,
                &self.core,
                "submit_instance",
                (instance.clone(),).into_val(&self.env),
            )])
            .try_submit_instance(instance)
        {
            Ok(_) => Ok(()),
            Err(Ok(contract_error)) => Err(contract_error),
            Err(Err(invoke)) => panic!("invocation failure, not a contract error: {invoke:?}"),
        }
    }

    pub fn is_completed(&self, player: &Address, level_id: u32) -> bool {
        self.core_client().is_completed(player, &level_id)
    }

    pub fn can_access(&self, player: &Address, level_id: u32) -> bool {
        self.core_client().can_access(player, &level_id)
    }
}

pub fn auth<'a>(
    signer: &'a Address,
    contract: &'a Address,
    fn_name: &'a str,
    args: soroban_sdk::Vec<Val>,
) -> soroban_sdk::testutils::MockAuth<'a> {
    let invoke: &'a soroban_sdk::testutils::MockAuthInvoke<'a> =
        Box::leak(Box::new(soroban_sdk::testutils::MockAuthInvoke {
            contract,
            fn_name,
            args,
            sub_invokes: &[],
        }));
    soroban_sdk::testutils::MockAuth {
        address: signer,
        invoke,
    }
}

pub fn contract_error(code: u32) -> Error {
    Error::from_contract_error(code)
}
