# Build, Test & Run

Vite requires Node.js `^20.19.0` or `>=22.12.0`. Tauri commands also require stable Rust and the platform prerequisites from the Tauri 2 documentation.

Tauri is the only desktop target.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite and the Tauri desktop debug app |
| `npm run build` | Build the renderer and native Tauri desktop installer |
| `npm run renderer:dev` | Start only the Vite renderer on port `1420` |
| `npm run renderer:build` | Build only the renderer to `dist/renderer/` |
| `npm run game-card:export -- <card-dir> --format gamecard` | Validate and export a game card package to `dist/game-cards/` |
| `npm run game-card:export -- <card-dir> --format png --cover <path>` | Export a renderable PNG containing the complete game card |
| `npm run test` | Run Jest, integration, Rust and Tauri desktop E2E tests |
| `npm run test:js` | Run Jest unit and JavaScript integration tests |
| `npm run test:rust` | Run Tauri Rust backend tests |
| `npm run test:tauri` | Build the isolated Tauri E2E app and run WebdriverIO |
| `npm run test:e2e-real-api` | Run optional Tauri OpenAI/Anthropic smoke tests from `E2E_*` environment variables |
| `npm run lint` | Run ESLint on `.js` and `.jsx` files |

`tauri:dev`、`tauri:build` 和 `test:e2e` 是对应默认命令的兼容别名。

酒馆导入专用桌面测试：先运行 `npm run tauri:e2e:build`，再运行 `npx wdio run wdio.tavern.conf.mjs`。它使用独立文件选择 fixture，验证自动导入、兼容差异取消、单独覆盖确认、实际 Worker 编译、世界书及重启恢复；不纳入使用原生卡 fixture 的默认桌面 suite。编译器用 `npx jest --runInBand --coverage=false test/tavern-import` 测试，压缩构建回归位于 integration suite。

## Renderer

- `src/renderer/main.jsx` is the single renderer entry.
- `src/renderer/styles/renderer.css` is the single platform CSS entry.
- Tauri development starts Vite through `beforeDevCommand`.
- Tauri production and E2E build Vite through `beforeBuildCommand`.
- Cargo `build.rs` also generates the [offline game card devkit](./game_card/game_card_devkit.md) from local docs/templates/libs and bundles it as `devkit/`; no separate generation command is needed.
- Production output uses WebKit/Chromium-compatible targets and local bundled fonts.
- Model requests use Rust `reqwest` and Channel; renderer does not require provider CORS support.

## Jest

`jest.config.js` uses jsdom and Testing Library for renderer/shared tests. The Tauri API module is mocked at the adapter boundary; business tests configure native command results through `global.platformMock`.

`test/libs/` contains reusable library tests and their helpers; game-card-specific tests stay in `test/game-card/`, and Tavern conversion tests stay in `test/tavern-import/`. Run library tests with `npx jest --runInBand --coverage=false test/libs`. The default Jest suite discovers them automatically.

Coverage thresholds remain 70% branches, 80% functions, 85% lines and 82% statements.

`jest.integration.config.js` runs the remaining platform-independent filesystem and schema integration tests without mocks.

## Rust

`cargo test --manifest-path src/tauri/Cargo.toml` covers:

- atomic JSON storage and serialized session saves;
- config, history, retry state and session isolation;
- game card imports, schema parity and path safety;
- resource authorization, MIME and audio Range responses;
- model request validation, streaming and cancellation.
- offline devkit generation, version consistency, portable documentation links and template validation (`cargo test --manifest-path src/tauri/Cargo.toml devkit --lib`).
- [project initialization](./game_card/game_card_project_init.md), no-overwrite/rollback safety and native command results (`cargo test --manifest-path src/tauri/Cargo.toml project_init`).
- GUI agent bootstrap instructions, local resource discovery and POSIX/PowerShell quoting (`cargo test --manifest-path src/tauri/Cargo.toml development --lib`).

## Tauri E2E

`test/tauri-e2e` uses WebdriverIO with the embedded Tauri WebDriver provider. The `e2e` Cargo feature enables test-only plugins, an isolated app data directory and a fixed fixture import directory.

The suite covers startup, settings, background, Session and history storage, retry, message collapse, game card rules, file content, exec, state patches, multi-turn TTL, visibility, stream abort, card import, dynamic React UI, controlled image/audio URLs and process restart persistence. A local streaming endpoint records requests made by the real Rust HTTP Channel.

Real provider calls are excluded from the default suite. Set `E2E_OPENAI_URL`, `E2E_OPENAI_KEY`, `E2E_OPENAI_MODEL` and/or the equivalent `E2E_ANTHROPIC_*` variables before running `npm run test:e2e-real-api`.

Production builds do not contain WebDriver commands or E2E permissions.

## CI And Release

`.github/workflows/tauri-ci.yml` runs JavaScript checks plus a macOS, Windows and Linux Rust/build matrix. Tauri E2E runs on all three systems, with `xvfb` on Linux.

`.github/workflows/tauri-release.yml` creates signed draft installers for:

- macOS app/DMG on Apple Silicon and Intel;
- Windows NSIS;
- Linux deb/AppImage.

Release tags use `app-v*`. macOS release requires Apple signing/notarization secrets; Windows release requires a PFX certificate and password.
