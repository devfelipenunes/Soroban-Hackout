use crate::harness::{spec_identifiers, LevelSpec};

pub const ALL: &[&LevelSpec] = &[
    &crate::level_00::SPEC,
    &crate::level_01::SPEC,
    &crate::level_02::SPEC,
    &crate::level_03::SPEC,
    &crate::level_04::SPEC,
    &crate::level_05::SPEC,
    &crate::level_06::SPEC,
    &crate::level_07::SPEC,
    &crate::level_08::SPEC,
    &crate::level_09::SPEC,
    &crate::level_10::SPEC,
    &crate::level_11::SPEC,
    &crate::level_12::SPEC,
];

fn owned(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| String::from(*item)).collect()
}

#[test]
fn each_level_exposes_exactly_its_declared_interface() {
    for spec in ALL {
        let mut declared = owned(spec.interface);
        declared.sort();

        let built = spec_identifiers(&spec.instance_wasm());

        assert_eq!(
            built, declared,
            "\n  the interface built into level {} (`{}`) is not the one `SPEC.interface` declares.\n\
             \n  built:    {built:?}\n  declared: {declared:?}\n\n  \
             If you widened the interface on purpose, paste the `built` list into \
             `SPEC.interface` in the level's test module.\n  \
             If you did not: rule 5 forbids every path by which a level swaps its own WASM, \
             and this list is the level saying on the record that it has none.\n",
            spec.id, spec.slug
        );
    }
}

#[test]
fn the_interface_extractor_reads_names_out_of_a_spec_it_did_not_build() {
    assert_eq!(
        spec_identifiers("breaker_level_00_validator"),
        owned(&["instance", "player", "validate"]),
        "the extractor did not read a validator's own interface out of its spec section. \
         A scanner that finds nothing passes every whitelist for free — this is the control \
         that keeps `each_level_exposes_exactly_its_declared_interface` from being a green \
         light wired to nothing"
    );
}
