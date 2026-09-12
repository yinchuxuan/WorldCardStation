use crate::game_card_imports::read_card_with_sources;
use crate::game_card_schema::validate_card;
use crate::game_card_source_map::locate;
use crate::json_store::write_json;
use crate::tavern_test_support::TestDir;
use serde_json::json;

#[test]
fn imports_splice_only_imported_arrays_and_preserve_data_and_source_locations() {
    let temp = TestDir::new();
    write_json(
        &temp.0.join("card.json"),
        &json!({
            "id": "matrix", "version": "1", "name": "Matrix",
            "rules": [{ "$import": "rules.json" }, {
                "when": { "phase": "init" }, "then": [{
                    "type": "state.set", "path": "matrix", "value": [[1, 2], [3, 4]]
                }]
            }]
        }),
    )
    .unwrap();
    write_json(
        &temp.0.join("rules.json"),
        &json!([{
            "when": { "phase": "pre_send" }, "then": [{ "$import": "actions.json" }]
        }]),
    )
    .unwrap();
    write_json(
        &temp.0.join("actions.json"),
        &json!([{
            "type": "exec", "source": "return {state};",
            "args": { "matrix": [[1, 2], [3, 4]], "nested": [[], [[5]]] }
        }]),
    )
    .unwrap();
    let expanded = read_card_with_sources(&temp.0).unwrap();
    validate_card(&expanded.card, &temp.0).unwrap();
    assert_eq!(expanded.card["rules"].as_array().unwrap().len(), 2);
    assert_eq!(
        expanded.card.pointer("/rules/0/then/0/args/matrix"),
        Some(&json!([[1, 2], [3, 4]]))
    );
    assert_eq!(
        expanded.card.pointer("/rules/0/then/0/args/nested"),
        Some(&json!([[], [[5]]]))
    );
    assert_eq!(
        expanded.card.pointer("/rules/1/then/0/value"),
        Some(&json!([[1, 2], [3, 4]]))
    );
    let imported = locate(&expanded.sources, "/rules/0/then/0/args/matrix/1/0");
    assert_eq!(imported.file, "actions.json");
    assert_eq!(imported.pointer, "/0/args/matrix/1/0");
    let literal = locate(&expanded.sources, "/rules/1/then/0/value/1/1");
    assert_eq!(literal.file, "card.json");
    assert_eq!(literal.pointer, "/rules/1/then/0/value/1/1");
}

#[test]
fn data_constraints_only_interpret_actions_not_script_args_or_state_values() {
    let temp = TestDir::new();
    let literal = json!({ "type": "state.randomInt", "min": 10, "max": 1 });
    let card = json!({
        "id": "literal", "version": "1", "name": "Literal",
        "rules": [{ "when": { "phase": "pre_send" }, "then": [
            { "type": "exec", "source": "return {state};", "args": literal },
            { "type": "state.set", "path": "data", "value": literal }
        ] }]
    });
    validate_card(&card, &temp.0).unwrap();
    let mut invalid = card;
    invalid["rules"][0]["then"] = json!([{ "when": { "phase": "pre_send" }, "then": [{
        "type": "state.randomInt", "path": "pick", "min": 10, "max": 1
    }] }]);
    let error = validate_card(&invalid, &temp.0).unwrap_err();
    assert_eq!(error.details.len(), 1);
    assert_eq!(
        error.details[0].pointer.as_deref(),
        Some("/rules/0/then/0/then/0/max")
    );
    assert!(error.details[0].message.contains("must be >= 10"));
    invalid["rules"][0]["then"][0]["then"][0]["max"] = json!(11);
    validate_card(&invalid, &temp.0).unwrap();
}
