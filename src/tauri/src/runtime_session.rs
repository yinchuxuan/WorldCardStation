use crate::json_store::AppResult;
use serde_json::Value;

// Storage envelope only. The shared runtime validates Agent, State and record semantics
// against the loaded card before enabling input or saving.
pub fn validate(history: &Value) -> AppResult<()> {
    let Some(saved) = history.get("runtimeSession") else {
        return Ok(());
    };
    let valid_snapshot = |snapshot: &Value| {
        snapshot["state"].is_object()
            && snapshot["contexts"].is_object()
            && snapshot["records"].is_array()
            && snapshot["messages"].is_array()
    };
    let retry = &saved["retryBase"];
    if saved["version"].as_u64() != Some(1)
        || !saved["cardId"].is_string()
        || !saved["cardVersion"].is_string()
        || saved["sequence"].as_u64().is_none()
        || !valid_snapshot(&saved["current"])
        || !saved["viewState"].is_object()
        || saved.get("retryBase").is_none()
        || !(retry.is_null()
            || retry["input"].is_string()
                && valid_snapshot(&retry["snapshot"])
                && retry["viewState"].is_object())
    {
        return Err("游戏 Session 已损坏或版本不兼容，不能恢复或覆盖".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::{
        app_storage::AppStorage,
        history::SaveOptions,
        json_store::{read_json, write_json},
        session_commands::{load_history, save_history},
        session_management, sessions,
    };
    use serde_json::{json, Value};

    #[tokio::test]
    async fn runtime_session_atomic_roundtrip_restart_and_scope_isolation() {
        let path =
            std::env::temp_dir().join(format!("wcs-runtime-session-{}", uuid::Uuid::new_v4()));
        let storage = AppStorage::new(path.clone());
        load_history(&storage).await.unwrap();
        let root = sessions::session_root(&storage.game_cards_dir()).unwrap();
        let context = sessions::active_context(&root).unwrap();
        let saved = json!({"version":1,"cardId":"test","cardVersion":"1.0.0","sequence":1,
            "current":{"state":{"score":1},"contexts":{"judge":{"initialized":true,"messages":[
                {"id":"msg-round-1-1","role":"assistant","content":"final","ttl":-1,"thinking":"reason"}]}},
                "messages":[{"id":"visible-round-1-1","role":"assistant","content":"raw","mode":"segmented",
                    "units":[{"text":"raw","patches":["{\"score\":1}"]}]}],"records":[]},
            "viewState":{"reading":{"messageId":"visible-round-1-1","segmentIndex":0}},
            "retryBase":{"input":"go","snapshot":{"state":{},"contexts":{},"messages":[],"records":[]},"viewState":{}}});
        save_history(
            &storage,
            json!([]),
            SaveOptions {
                runtime_session: Some(saved.clone()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        // The complete retry base is in messages.json; an unrelated stale legacy retry file is not read.
        std::fs::write(&context.retry_base, b"broken legacy retry").unwrap();
        let restarted = AppStorage::new(path.clone());
        let loaded = load_history(&restarted).await.unwrap();
        assert_eq!(loaded["runtimeSession"], saved);
        assert_eq!(loaded["messages"][0]["units"][0]["text"], "raw");
        assert!(save_history(&storage, json!([]), SaveOptions::default())
            .await
            .is_err());
        session_management::create(&root, "other").unwrap();
        assert!(load_history(&storage)
            .await
            .unwrap()
            .get("runtimeSession")
            .is_none());
        session_management::set_active(&root, &context.id).unwrap();
        let mut invalid = loaded.clone();
        invalid["runtimeSession"]["version"] = json!(99);
        write_json(&context.messages, &invalid).unwrap();
        assert!(load_history(&storage).await.is_err());
        assert!(save_history(
            &storage,
            json!([]),
            SaveOptions {
                runtime_session: Some(saved),
                ..Default::default()
            }
        )
        .await
        .is_err());
        assert_eq!(
            read_json::<Value>(&context.messages).unwrap().unwrap(),
            invalid
        );
        std::fs::remove_dir_all(path).unwrap();
    }
}
