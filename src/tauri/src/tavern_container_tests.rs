use crate::tavern_input::prepare;
use crate::tavern_png::read_character;
use crate::tavern_test_support::{character, input_file, png, zip, TestDir};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::json;
use std::fs;

fn text(name: &str, value: &[u8]) -> Vec<u8> {
    [name.as_bytes(), &[0], value].concat()
}

#[test]
fn tavern_png_prioritizes_ccv3_and_never_falls_back_from_corrupt_selected_payload() {
    let dir = TestDir::new();
    let path = dir.0.join("role.apng");
    let v2 = STANDARD.encode(character("v2").to_string());
    let v3 = STANDARD.encode(character("v3").to_string());
    fs::write(
        &path,
        png(&[
            (b"tEXt", text("chara", v2.as_bytes())),
            (b"tEXt", text("ccv3", v3.as_bytes())),
        ]),
    )
    .unwrap();
    assert_eq!(
        read_character(&path).unwrap().unwrap()["spec"],
        "chara_card_v3"
    );
    fs::write(
        &path,
        png(&[
            (b"tEXt", text("chara", v2.as_bytes())),
            (b"tEXt", text("ccv3", b"broken")),
        ]),
    )
    .unwrap();
    assert!(read_character(&path).is_err());
    fs::write(
        &path,
        png(&[
            (b"tEXt", text("chara", v2.as_bytes())),
            (b"gcAr", b"broken".to_vec()),
        ]),
    )
    .unwrap();
    assert!(read_character(&path).unwrap().is_none());
    fs::write(
        &path,
        png(&[
            (b"tEXt", text("chara", v2.as_bytes())),
            (b"tEXt", text("chara", v2.as_bytes())),
        ]),
    )
    .unwrap();
    assert!(read_character(&path).is_err());
    fs::write(&path, png(&[])).unwrap();
    assert!(read_character(&path).unwrap_err().error.contains("不包含"));
}

#[test]
fn tavern_png_rejects_crc_utf8_and_trailing_data() {
    let dir = TestDir::new();
    let path = dir.0.join("role.png");
    fs::write(
        &path,
        png(&[(b"tEXt", text("chara", STANDARD.encode([255]).as_bytes()))]),
    )
    .unwrap();
    assert!(read_character(&path).is_err());
    let mut bytes = png(&[(
        b"tEXt",
        text(
            "chara",
            STANDARD.encode(character("v2").to_string()).as_bytes(),
        ),
    )]);
    bytes[20] ^= 1;
    fs::write(&path, &bytes).unwrap();
    assert!(read_character(&path).unwrap_err().error.contains("CRC"));
    bytes[20] ^= 1;
    bytes.push(0);
    fs::write(&path, bytes).unwrap();
    assert!(read_character(&path).is_err());
}

#[test]
fn tavern_json_charx_native_magic_and_token_resources_are_separate() {
    let dir = TestDir::new();
    let json_path = input_file(&dir.0);
    let prepared = prepare(&json_path, &dir.0).unwrap();
    assert_eq!(prepared.container, "json");
    assert!(prepared.native.is_none());
    let root = prepared.root.clone();
    drop(prepared);
    assert!(!root.exists());
    let path = dir.0.join("untrusted.extension");
    let mut card = character("v3");
    card["data"]["assets"] = json!([{ "uri": "embeded://assets/icon.png" }]);
    zip(
        &path,
        &[
            ("card.json", card.to_string().as_bytes()),
            ("assets/icon.png", b"asset"),
        ],
    );
    let prepared = prepare(&path, &dir.0).unwrap();
    assert_eq!(prepared.container, "charx");
    assert_eq!(prepared.resources.len(), 1);
    let resource = serde_json::to_value(&prepared.resources[0]).unwrap();
    assert!(resource.get("path").is_none());
    assert_eq!(resource["id"], "r0");
    zip(
        &path,
        &[(
            "card.json",
            br#"{"version":"1","id":"native","name":"Native","rules":[]}"#,
        )],
    );
    assert!(prepare(&path, &dir.0).unwrap().native.is_some());
}

#[test]
fn tavern_charx_reuses_archive_path_and_count_validation() {
    let dir = TestDir::new();
    let path = dir.0.join("card.charx");
    for name in ["../escape", "/absolute", "sessions/data.json", "bad\\file"] {
        zip(
            &path,
            &[
                ("card.json", character("v3").to_string().as_bytes()),
                (name, b"bad"),
            ],
        );
        assert!(prepare(&path, &dir.0).is_err(), "{name}");
    }
    zip(&path, &[("card.json", b"{}"), ("CARD.JSON", b"{}")]);
    assert!(prepare(&path, &dir.0).is_err());
    zip(&path, &[("nested/card.json", b"{}")]);
    assert!(prepare(&path, &dir.0).is_err());
}
