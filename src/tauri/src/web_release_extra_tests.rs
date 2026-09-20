use super::*;

#[test]
fn web_release_resource_change_and_cover_identity_are_separate() {
    let f = Fixture::new();
    let first = f.publish();
    fs::write(f.source.join("worldbook/序章.md"), "changed").unwrap();
    let second = f.publish();
    assert_ne!(first.content_fingerprint, second.content_fingerprint);
    assert_ne!(first.release_id, second.release_id);
    fs::copy(
        f.source.join("images/cover.png"),
        f.source.join("cover.png"),
    )
    .unwrap();
    let third = publish(&f.source, &f.output, Some("cover.png")).unwrap();
    assert_eq!(second.release_id, third.release_id);
    // The preview is outside runtime resource declarations.
    fs::write(f.source.join("cover.png"), b"changed preview bytes").unwrap();
    let fourth = publish(&f.source, &f.output, Some("cover.png")).unwrap();
    assert_eq!(second.content_fingerprint, fourth.content_fingerprint);
    assert_ne!(second.release_id, fourth.release_id);
    assert!(f.release_dir(&first).exists());
}

#[test]
fn web_release_keeps_other_cards_and_rejects_missing_declared_resources() {
    let f = Fixture::new();
    let first = f.publish();
    let mut card = read_card(&f.source).unwrap();
    card["id"] = json!("second");
    write_json(&f.source.join("card.json"), &card).unwrap();
    f.publish();
    let catalog: Value = read_json(&f.output.join("index.json")).unwrap().unwrap();
    assert_eq!(catalog["cards"].as_array().unwrap().len(), 2);
    assert!(f.release_dir(&first).exists());
    fs::remove_file(f.source.join("images/cover.png")).unwrap();
    assert!(publish(&f.source, &f.output, None).is_err());
    assert_eq!(
        read_json::<Value>(&f.output.join("index.json"))
            .unwrap()
            .unwrap(),
        catalog
    );
}

#[test]
fn web_release_scope_patterns_and_case_collisions_are_checked() {
    let f = Fixture::new();
    fs::create_dir(f.source.join("worldbook/nested")).unwrap();
    fs::write(
        f.source.join("worldbook/nested/hidden.md"),
        "outside single star",
    )
    .unwrap();
    assert!(!f.publish().files.iter().any(|p| p.path.contains("nested")));
    let mut card = read_card(&f.source).unwrap();
    card["files"]["book"]["include"] = json!(["missing.md"]);
    write_json(&f.source.join("card.json"), &card).unwrap();
    assert!(publish(&f.source, &f.output, None).is_err());
    // Use JSON files so Schema accepts both on case-sensitive and insensitive hosts.
    fs::write(f.source.join("other.json"), "{}").unwrap();
    fs::write(f.source.join("OTHER.json"), "{}").unwrap();
    card["files"] = json!({"a": "other.json", "b": "OTHER.json"});
    write_json(&f.source.join("card.json"), &card).unwrap();
    assert!(publish(&f.source, &f.output, None)
        .unwrap_err()
        .error
        .contains("Case-colliding"));
}

#[test]
fn web_release_rejects_oversized_resource_before_copying() {
    let f = Fixture::new();
    fs::File::create(f.source.join("images/cover.png"))
        .unwrap()
        .set_len(crate::game_card_archive::MAX_FILE_SIZE + 1)
        .unwrap();
    assert!(publish(&f.source, &f.output, None)
        .unwrap_err()
        .error
        .contains("limit"));
    assert!(!f.output.join("index.json").exists());
}

#[test]
fn web_release_canonical_keys_and_file_order_are_stable() {
    use crate::web_release_protocol::{canonical, digest, release_id};
    let left: Value = serde_json::from_str(r#"{"z":{"b":2,"a":1},"a":[2,1]}"#).unwrap();
    assert_eq!(
        String::from_utf8(canonical(&left).unwrap()).unwrap(),
        r#"{"a":[2,1],"z":{"a":1,"b":2}}"#
    );
    assert_eq!(
        digest(b"abc"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    let f = Fixture::new();
    let release = f.publish();
    assert_eq!(release_id(&release).unwrap(), release.release_id);
    assert!(release
        .files
        .windows(2)
        .all(|pair| pair[0].path < pair[1].path));
}
