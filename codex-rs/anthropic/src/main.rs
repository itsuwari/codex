use std::sync::Arc;

use axum::Json;
use axum::Router;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::http::StatusCode;
use axum::http::header::AUTHORIZATION;
use axum::routing::post;
use codex_core::AuthManager;
use codex_protocol::mcp_protocol::AuthMode;
use reqwest::Client;
use serde::Deserialize;
use serde::Serialize;

#[derive(Clone)]
struct AppState {
    auth_manager: Arc<AuthManager>,
    http_client: Client,
    openai_url: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct Message {
    #[allow(dead_code)]
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct MessageRequest {
    #[allow(dead_code)]
    model: String,
    messages: Vec<Message>,
}

#[derive(Serialize, Deserialize)]
struct MessageResponse {
    id: String,
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<Message>,
}

#[derive(Serialize, Deserialize)]
struct OpenAiChoice {
    message: Message,
}

#[derive(Serialize, Deserialize)]
struct OpenAiResponse {
    id: String,
    choices: Vec<OpenAiChoice>,
}

async fn post_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<MessageRequest>,
) -> Result<Json<MessageResponse>, StatusCode> {
    let auth_header = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let auth = state.auth_manager.auth().ok_or(StatusCode::UNAUTHORIZED)?;

    match auth.get_token().await {
        Ok(expected) if expected == token => {
            let openai_payload = OpenAiRequest {
                model: payload.model,
                messages: payload.messages,
            };

            let response = state
                .http_client
                .post(&state.openai_url)
                .bearer_auth(expected)
                .json(&openai_payload)
                .send()
                .await
                .map_err(|_| StatusCode::BAD_GATEWAY)?;

            let openai: OpenAiResponse =
                response.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;

            let content = openai
                .choices
                .first()
                .map(|c| c.message.content.clone())
                .unwrap_or_default();

            Ok(Json(MessageResponse {
                id: openai.id,
                role: "assistant".into(),
                content,
            }))
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

#[tokio::main]
async fn main() {
    let codex_home =
        codex_core::config::find_codex_home().unwrap_or_else(|e| panic!("find codex home: {e}"));
    let auth_manager = AuthManager::new(codex_home, AuthMode::ChatGPT, "anthropic_server".into());
    let state = AppState {
        auth_manager: Arc::new(auth_manager),
        http_client: Client::new(),
        openai_url: "https://api.openai.com/v1/chat/completions".into(),
    };

    let app = Router::new()
        .route("/v1/messages", post(post_messages))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080")
        .await
        .unwrap_or_else(|e| panic!("bind listener: {e}"));
    axum::serve(listener, app)
        .await
        .unwrap_or_else(|e| panic!("serve app: {e}"));
}

#[cfg(test)]
mod tests {
    use super::AppState;
    use super::OpenAiRequest;
    use super::OpenAiResponse;
    use super::post_messages;
    use axum::Json;
    use axum::Router;
    use axum::body::Body;
    use axum::body::{self};
    use axum::http::Request;
    use axum::http::StatusCode;
    use axum::http::header::AUTHORIZATION;
    use axum::response::IntoResponse;
    use axum::routing::post;
    use codex_core::AuthManager;
    use codex_core::CodexAuth;
    use pretty_assertions::assert_eq;
    use reqwest::Client;
    use tower::util::ServiceExt;

    fn test_app(openai_url: &str) -> Router {
        let auth = CodexAuth::create_dummy_chatgpt_auth_for_testing();
        let manager = AuthManager::from_auth_for_testing(auth);
        let state = AppState {
            auth_manager: manager,
            http_client: Client::new(),
            openai_url: openai_url.to_string(),
        };

        Router::new()
            .route("/v1/messages", post(post_messages))
            .with_state(state)
    }

    #[axum::debug_handler]
    async fn mock_openai_handler(Json(req): Json<OpenAiRequest>) -> impl IntoResponse {
        assert_eq!(req.messages.len(), 2);
        assert_eq!(req.messages[1].content, "bye");
        Json(OpenAiResponse {
            id: "openai-id".into(),
            choices: vec![super::OpenAiChoice {
                message: super::Message {
                    role: "assistant".into(),
                    content: "forwarded".into(),
                },
            }],
        })
    }

    async fn start_openai_server() -> (String, tokio::task::JoinHandle<()>) {
        let router = Router::new().route("/v1/chat/completions", post(mock_openai_handler));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let url = format!("http://{addr}/v1/chat/completions");
        let handle = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        (url, handle)
    }

    #[tokio::test]
    async fn forwards_to_openai_when_authorized() {
        let (url, handle) = start_openai_server().await;
        let app = test_app(&url);
        let body = serde_json::json!({
            "model": "claude",
            "messages": [
                {"role": "user", "content": "hello"},
                {"role": "user", "content": "bye"}
            ]
        });
        let request = Request::builder()
            .method("POST")
            .uri("/v1/messages")
            .header("content-type", "application/json")
            .header(AUTHORIZATION, "Bearer Access Token")
            .body(Body::from(body.to_string()))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let bytes = body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let msg: super::MessageResponse = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(msg.content, "forwarded");
        assert_eq!(msg.role, "assistant");

        handle.abort();
    }

    #[tokio::test]
    async fn unauthorized_without_token() {
        let app = test_app("http://localhost:9");
        let body = serde_json::json!({"model": "claude", "messages": []});
        let request = Request::builder()
            .method("POST")
            .uri("/v1/messages")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn unauthorized_with_wrong_token() {
        let app = test_app("http://localhost:9");
        let body = serde_json::json!({"model": "claude", "messages": []});
        let request = Request::builder()
            .method("POST")
            .uri("/v1/messages")
            .header("content-type", "application/json")
            .header(AUTHORIZATION, "Bearer wrong")
            .body(Body::from(body.to_string()))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
