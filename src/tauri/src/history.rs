use serde::Deserialize;
use serde_json::{json, Map, Value};
use uuid::Uuid;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOptions {
    pub game_state: Option<Value>,
    pub retry_base_messages: Option<Vec<Value>>,
    pub retry_base_state: Option<Value>,
    pub view_state: Option<Value>,
    pub runtime_session: Option<Value>,
}

fn object_or_empty(value: Option<&Value>) -> Value {
    value
        .filter(|item| item.is_object())
        .cloned()
        .unwrap_or_else(|| json!({}))
}

fn clean_message(value: &Value) -> Value {
    let mut result = Map::new();
    for key in ["role", "content", "id", "thinking", "_meta", "ttl"] {
        if let Some(field) = value.get(key) {
            result.insert(key.to_string(), field.clone());
        }
    }
    Value::Object(result)
}

fn clean_messages(values: &[Value]) -> Vec<Value> {
    values.iter().map(clean_message).collect()
}

fn restore_messages(values: &[Value]) -> Vec<Value> {
    values
        .iter()
        .map(|value| {
            let mut message = value.as_object().cloned().unwrap_or_default();
            let has_id = message
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| !id.is_empty());
            if !has_id {
                message.insert("id".to_string(), Value::String(Uuid::new_v4().to_string()));
            }
            if let Some(thinking) = message
                .get("thinking")
                .and_then(Value::as_str)
                .filter(|item| !item.is_empty())
            {
                message.insert("_thinking".to_string(), Value::String(thinking.to_string()));
            }
            Value::Object(message)
        })
        .collect()
}

pub fn encode_history(payload: &Value, options: &SaveOptions) -> Value {
    if let Some(runtime) = options.runtime_session.as_ref() {
        return json!({"messages": runtime["current"]["messages"],
            "gameState": runtime["current"]["state"], "viewState": runtime["viewState"],
            "runtimeSession": runtime});
    }
    let (messages, game_state) = if let Some(values) = payload.as_array() {
        (
            values.as_slice(),
            object_or_empty(options.game_state.as_ref()),
        )
    } else {
        let values = payload
            .get("messages")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        (values, object_or_empty(payload.get("gameState")))
    };
    let view_state = object_or_empty(
        options
            .view_state
            .as_ref()
            .or_else(|| payload.get("viewState")),
    );
    json!({
        "messages": clean_messages(messages),
        "gameState": game_state,
        "viewState": view_state
    })
}

pub fn encode_retry_base(options: &SaveOptions) -> Value {
    let messages = options.retry_base_messages.as_deref().unwrap_or(&[]);
    json!({
        "messages": clean_messages(messages),
        "gameState": object_or_empty(options.retry_base_state.as_ref())
    })
}

pub fn decode_history(value: Option<&Value>, retry: Option<&Value>) -> Value {
    if let Some(saved) = value.filter(|item| item.get("runtimeSession").is_some()) {
        return saved.clone();
    }
    let history_messages = value
        .and_then(|item| item.as_array().or_else(|| item.get("messages")?.as_array()))
        .map(|values| restore_messages(values))
        .unwrap_or_default();
    let game_state = value
        .filter(|item| item.is_object())
        .map(|item| object_or_empty(item.get("gameState")))
        .unwrap_or_else(|| json!({}));
    let view_state = value
        .filter(|item| item.is_object())
        .map(|item| object_or_empty(item.get("viewState")))
        .unwrap_or_else(|| json!({}));
    let mut result = json!({
        "messages": history_messages,
        "gameState": game_state,
        "viewState": view_state
    });
    if let Some(retry_value) = retry {
        let retry_messages = retry_value
            .as_array()
            .or_else(|| retry_value.get("messages").and_then(Value::as_array))
            .map(|values| restore_messages(values))
            .unwrap_or_default();
        if !retry_messages.is_empty() {
            result["retryBaseMessages"] = Value::Array(retry_messages);
        }
        if retry_value.is_object() && retry_value.get("gameState").is_some() {
            result["retryBaseState"] = object_or_empty(retry_value.get("gameState"));
        }
    }
    result
}

pub fn preview(messages: &[Value]) -> String {
    messages
        .iter()
        .rev()
        .find_map(|message| {
            let role = message.get("role")?.as_str()?;
            if !matches!(role, "user" | "assistant") {
                return None;
            }
            let words = message
                .get("content")?
                .as_str()?
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            Some(words.chars().take(80).collect())
        })
        .unwrap_or_default()
}
