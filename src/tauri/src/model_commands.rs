use crate::json_store::AppResult;
use crate::model_http::{stream_request, validate_request, ModelRequest, ModelStreamEvent};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{ipc::Channel, State};
use tokio::sync::{watch, Mutex};

#[derive(Clone)]
pub(crate) struct ModelNetworkState {
    client: reqwest::Client,
    requests: Arc<Mutex<HashMap<String, watch::Sender<bool>>>>,
}

impl ModelNetworkState {
    pub(crate) async fn require_idle(&self) -> crate::game_card_error::CardResult<()> {
        if self.requests.lock().await.is_empty() {
            Ok(())
        } else {
            Err(crate::game_card_error::GameCardError::new(
                "生成期间不能安装游戏卡",
            ))
        }
    }

    pub(crate) fn new() -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .build()
            .map_err(|error| error.to_string())?;
        Ok(Self {
            client,
            requests: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    async fn register(&self, request_id: &str) -> AppResult<watch::Receiver<bool>> {
        let mut requests = self.requests.lock().await;
        if requests.contains_key(request_id) {
            return Err("Model request id is already active".to_string());
        }
        let (sender, receiver) = watch::channel(false);
        requests.insert(request_id.to_string(), sender);
        Ok(receiver)
    }

    async fn remove(&self, request_id: &str) {
        self.requests.lock().await.remove(request_id);
    }

    async fn cancel(&self, request_id: &str) -> bool {
        let requests = self.requests.lock().await;
        requests
            .get(request_id)
            .is_some_and(|sender| sender.send(true).is_ok())
    }
}

#[tauri::command]
pub async fn stream_model_request(
    state: State<'_, ModelNetworkState>,
    request: ModelRequest,
    on_event: Channel<ModelStreamEvent>,
) -> AppResult<()> {
    validate_request(&request)?;
    let request_id = request.request_id.clone();
    let mut cancel = state.register(&request_id).await?;
    let network = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        let result = stream_request(&network.client, request, &mut cancel, |event| {
            on_event.send(event).map_err(|error| error.to_string())
        })
        .await;
        if let Err(message) = result {
            let _ = on_event.send(ModelStreamEvent::Error { message });
        }
        network.remove(&request_id).await;
    });
    Ok(())
}

#[tauri::command]
pub async fn cancel_model_stream(
    state: State<'_, ModelNetworkState>,
    request_id: String,
) -> AppResult<bool> {
    if request_id.is_empty() || request_id.len() > 64 {
        return Err("Invalid model request id".to_string());
    }
    Ok(state.cancel(&request_id).await)
}
