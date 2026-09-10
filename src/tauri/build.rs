#[path = "build/devkit.rs"]
mod devkit;

fn main() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    for path in [
        "devkit",
        "docs/game_card",
        "docs/game_card_design.md",
        "libs/worldbook-library",
        "package.json",
        "src/shared/game-card/schema/game-card.schema.json",
        "src/tauri/build",
        "src/tauri/build.rs",
    ] {
        println!("cargo:rerun-if-changed={}", root.join(path).display());
    }
    devkit::generate(&root, &root.join("dist/devkit"), env!("CARGO_PKG_VERSION"))
        .expect("failed to build the offline game card devkit");
    tauri_build::build()
}
