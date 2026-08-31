use crate::app_storage::AppStorage;
use crate::config_commands::{authorize_background, save_background, USER_BACKGROUND_URL};
use crate::json_store::write_json;
use crate::resource_response::handle_resource_request;
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tauri::http::{header, Method, Request, StatusCode};
use uuid::Uuid;

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("world-card-station-resource-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn fixture() -> (TestDir, AppStorage) {
    let dir = TestDir::new();
    let storage = AppStorage::new(dir.0.clone());
    let card = dir.0.join("game-cards/cards/active-card");
    fs::create_dir_all(card.join("images")).unwrap();
    fs::create_dir_all(card.join("audio")).unwrap();
    fs::write(card.join("images/school.jpg"), b"image-data").unwrap();
    fs::write(card.join("images/note.txt"), b"not-image").unwrap();
    fs::write(card.join("audio/theme.ogg"), b"0123456789").unwrap();
    write_json(
        &dir.0.join("game-cards/active.json"),
        &json!({ "id": "active-card" }),
    )
    .unwrap();
    (dir, storage)
}

fn request(path: &str) -> Request<Vec<u8>> {
    Request::builder()
        .uri(format!("local://localhost/{path}"))
        .body(Vec::new())
        .unwrap()
}

#[test]
fn serves_images_and_audio_ranges_with_correct_headers() {
    let (_dir, storage) = fixture();
    let image = handle_resource_request(
        &storage,
        request("game-card%2Factive-card%2Fimage%2Fimages%2Fschool.jpg"),
    );
    assert_eq!(image.status(), StatusCode::OK);
    assert_eq!(image.headers()[header::CONTENT_TYPE], "image/jpeg");
    assert_eq!(image.body(), b"image-data");

    let audio_request = Request::builder()
        .uri("local://localhost/game-card%2Factive-card%2Faudio%2Faudio%2Ftheme.ogg")
        .header(header::RANGE, "bytes=2-5")
        .body(Vec::new())
        .unwrap();
    let audio = handle_resource_request(&storage, audio_request);
    assert_eq!(audio.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(audio.headers()[header::CONTENT_TYPE], "audio/ogg");
    assert_eq!(audio.headers()[header::ACCEPT_RANGES], "bytes");
    assert_eq!(audio.headers()[header::CONTENT_RANGE], "bytes 2-5/10");
    assert_eq!(audio.body(), b"2345");
}

#[test]
fn rejects_inactive_cards_unsafe_paths_extensions_and_methods() {
    let (_dir, storage) = fixture();
    let paths = [
        "game-card%2Fother-card%2Fimage%2Fimages%2Fschool.jpg",
        "game-card%2Factive-card%2Fimage%2F..%2Fschool.jpg",
        "game-card%2Factive-card%2Fimage%2Fimages%2Fnote.txt",
        "unknown%2Fresource",
    ];
    for path in paths {
        assert_eq!(
            handle_resource_request(&storage, request(path)).status(),
            StatusCode::NOT_FOUND
        );
    }
    let post = Request::builder()
        .method(Method::POST)
        .uri("local://localhost/game-card%2Factive-card%2Fimage%2Fimages%2Fschool.jpg")
        .body(Vec::new())
        .unwrap();
    assert_eq!(
        handle_resource_request(&storage, post).status(),
        StatusCode::METHOD_NOT_ALLOWED
    );
}

#[test]
fn returns_range_errors_and_head_metadata_without_a_body() {
    let (dir, storage) = fixture();
    let invalid = Request::builder()
        .uri("local://localhost/game-card%2Factive-card%2Faudio%2Faudio%2Ftheme.ogg")
        .header(header::RANGE, "bytes=20-30")
        .body(Vec::new())
        .unwrap();
    let invalid = handle_resource_request(&storage, invalid);
    assert_eq!(invalid.status(), StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(invalid.headers()[header::CONTENT_RANGE], "bytes */10");

    let head = Request::builder()
        .method(Method::HEAD)
        .uri("local://localhost/game-card%2Factive-card%2Faudio%2Faudio%2Ftheme.ogg")
        .body(Vec::new())
        .unwrap();
    let head = handle_resource_request(&storage, head);
    assert_eq!(head.headers()[header::CONTENT_LENGTH], "10");
    assert!(head.body().is_empty());

    let large_path = dir.0.join("game-cards/cards/active-card/audio/large.mp3");
    fs::write(&large_path, vec![1_u8; 1_100_000]).unwrap();
    let ranged = Request::builder()
        .uri("local://localhost/game-card%2Factive-card%2Faudio%2Faudio%2Flarge.mp3")
        .header(header::RANGE, "bytes=0-")
        .body(Vec::new())
        .unwrap();
    let ranged = handle_resource_request(&storage, ranged);
    assert_eq!(ranged.body().len(), 1_000 * 1024);
    assert_eq!(
        ranged.headers()[header::CONTENT_RANGE],
        "bytes 0-1023999/1100000"
    );
}

#[tokio::test]
async fn only_serves_the_user_background_authorized_by_saved_config() {
    let (dir, storage) = fixture();
    let path = dir.0.join("selected.webp");
    fs::write(&path, b"background").unwrap();
    let url = "user-background%2Fcurrent";
    assert_eq!(
        handle_resource_request(&storage, request(url)).status(),
        StatusCode::NOT_FOUND
    );

    authorize_background(&storage, &path).await.unwrap();
    save_background(
        &storage,
        json!({ "backgroundImageUrl": USER_BACKGROUND_URL, "backgroundOpacity": 0.5 }),
    )
    .await
    .unwrap();
    let response = handle_resource_request(&storage, request(url));
    assert_eq!(response.headers()[header::CONTENT_TYPE], "image/webp");
    assert_eq!(response.body(), b"background");
}

#[cfg(unix)]
#[test]
fn rejects_symlinks_that_leave_the_card_directory() {
    use std::os::unix::fs::symlink;
    let (dir, storage) = fixture();
    let outside = dir.0.join("outside.jpg");
    fs::write(&outside, b"outside").unwrap();
    symlink(
        outside,
        dir.0
            .join("game-cards/cards/active-card/images/outside.jpg"),
    )
    .unwrap();
    let response = handle_resource_request(
        &storage,
        request("game-card%2Factive-card%2Fimage%2Fimages%2Foutside.jpg"),
    );
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
