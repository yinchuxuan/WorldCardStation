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
        "src/renderer/gameCard/dryRun",
        "src/renderer/gameCard/execSource.js",
        "src/shared/game-card",
    ] {
        println!("cargo:rerun-if-changed={}", root.join(path).display());
    }
    devkit::generate(&root, &root.join("dist/devkit"), env!("CARGO_PKG_VERSION"))
        .expect("failed to build the offline game card devkit");
    let status = std::process::Command::new("node")
        .current_dir(&root)
        .arg("src/tauri/build/dry_run.mjs")
        .arg(std::env::var_os("OUT_DIR").expect("missing Cargo output directory"))
        .status()
        .expect("building the embedded dry-run checker requires Node and npm install");
    assert!(
        status.success(),
        "failed to build the embedded dry-run checker"
    );
    tauri_build::build()
}
