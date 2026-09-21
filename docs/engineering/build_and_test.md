# Build, Test & Run

<!-- devkit:omit:start -->
适用任务：选择验证命令、修改构建或发布流程。  
相关代码：`package.json`、`scripts/`、`src/tauri/build.rs`、`.github/workflows/`。  
前置文档：无；从任务路由按需进入。
<!-- devkit:omit:end -->

Vite requires Node.js `^20.19.0` or `>=22.12.0`. Tauri commands also require stable Rust and the platform prerequisites from the Tauri 2 documentation.

Tauri is the only desktop target.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite and the Tauri desktop debug app |
| `npm run build` | Build the renderer and native Tauri desktop installer |
| `npm run renderer:dev` | Start only the Vite renderer on port `1420` |
| `npm run renderer:build` | Build only the renderer to `dist/renderer/` |
| `npm run web:dev` | Start the Web play preview on port `1422` |
| `npm run web:build` | Build the static Web player to `dist/web/` |
| `npm run test:web:unit` | Run focused Web Jest tests; full `test:js` enforces coverage |
| `npm run test:web:integration` | Verify dual-build isolation and run real-browser platform contract tests |
| `npm run test:web:e2e` | Build and test production catalog/gameplay, including root and `/play/` startup |
| `npm run test:web` | Run Web unit, build-isolation, browser integration and gameplay tests |
| `npm run game-card:export -- <card-dir> --format gamecard` | Validate and export a game card package to `dist/game-cards/` |
| `npm run game-card:publish -- <card-dir> [--cover <relative-path>]` | Publish immutable static releases and catalog to `dist/web-cards/`; see [Web design](../architecture/web.md) |
| `npm run game-card:export -- <card-dir> --format png --cover <path>` | Export a renderable PNG containing the complete game card |
| `npm run test` | Run Jest, integration, Rust and Tauri desktop E2E tests |
| `npm run test:js` | Run Jest unit and JavaScript integration tests |
| `npm run test:rust` | Run Tauri Rust backend tests |
| `npm run test:tauri` | Build the isolated Tauri E2E app and run WebdriverIO |
| `npm run test:e2e-real-api` | Run optional Tauri OpenAI/Anthropic smoke tests from `E2E_*` environment variables |
| `npm run lint` | Run ESLint on `.js` and `.jsx` files |

`tauri:dev`、`tauri:build` 和 `test:e2e` 是对应默认命令的兼容别名。

酒馆导入专用桌面测试：先运行 `npm run tauri:e2e:build`，再运行 `npx wdio run wdio.tavern.conf.mjs`。它使用独立文件选择 fixture，验证自动导入、兼容差异取消、单独覆盖确认、实际 Worker 编译、世界书及重启恢复；不纳入使用原生卡 fixture 的默认桌面 suite。编译器用 `npx jest --runInBand --coverage=false test/tavern-import` 测试，压缩构建回归位于 integration suite。

项目 `card.json` 导入：`cargo test --manifest-path src/tauri/Cargo.toml project_file_import --lib` 覆盖格式识别、目录资源、存档保留和失败安全。E2E 构建后运行 `npx wdio run wdio.tauri.conf.mjs --spec test/tauri-e2e/project-file-import.e2e.js` 验证单按钮导入整个项目、实际规则执行与更新；默认文件选择 fixture 指向项目的 `card.json`。

## Renderer

- `src/renderer/main.jsx` is the shared bootstrap. Web builds use `src/web/index.html` and `src/web/main.jsx`; desktop builds retain `src/renderer/index.html`. Vite aliases `@application` and `@platform` select the corresponding application and services; Web-specific implementations live under `src/web/`, alongside `src/tauri/`.
- `src/renderer/styles/renderer.css` is the single platform CSS entry.
- Tauri development starts Vite through `beforeDevCommand`.
- Tauri production and E2E build Vite through `beforeBuildCommand`.
- Cargo `build.rs` also generates the [offline game card devkit](../authoring/devkit.md) from local docs/templates/libs and bundles it as `devkit/`; no separate generation command is needed.
- Production output uses WebKit/Chromium-compatible targets and local bundled fonts.
- Desktop model requests use Rust `reqwest` and Channel; the desktop renderer does not require provider CORS support.

## Web build and browser tests

The Web target provides hosted cards, full caching, model fetch, shared rules/Worker/UI and media gameplay; see [Web design](../architecture/web.md). Sessions use explicit IndexedDB saving with complete snapshots and revision conflict checks. Resource removal preserves sessions and coordinates tabs via Web Locks; session deletion preserves resources. Unavailable services throw `PLATFORM_UNAVAILABLE`. Desktop retains automatic saving.

`web:build` uses relative URLs by default. Set `WEB_BASE=/play/` or run `npm run web:build -- --base /play/` for a fixed subpath. For standalone hosting, deploy `dist/web/` and supply the published `cards/` directory; no route fallback or native application is needed. The official website assembles the player with the website and card artifacts before deployment (see below). Each target cleans only its own output directory.

`web:dev` serves the publisher's `dist/web-cards/` at `<base>/cards/`; `WEB_CARDS_DIR` overrides the local directory. Missing files return 404 instead of the SPA HTML fallback. Publish a card, then refresh the catalog; no dev-server restart is needed. This development mount is not included in production builds. `test:web:build` also starts real Vite servers at root and subpath to verify serving, updates, missing files and path isolation.

`test:web:build` builds desktop → Web → desktop, compares output hashes, builds a `/play/` variant and a separate browser integration page. The Web build rejects Tauri adapters/API and WebDriver imports and emits `module-graph.json` for dependency inspection. The integration page is under `dist/web-harness/`, never the production output.

It also runs the real Rust publisher against the minimal card fixture, verifies manifest bytes/hashes and deterministic repeat, and places the test-only catalog in `dist/web-fixture/cards/`. Browser E2E checks metadata, decoded cover and index/cover-only requests at both bases. Web tests therefore require the Rust/Tauri build dependencies as well as Node; CI installs both. Production hosting must supply its own `cards/` directory; no test card is bundled into the website.

WebdriverIO uses ordinary browser drivers, without the Tauri service. `WEB_BROWSER` selects `chrome` (default), `firefox`, or `safari`; Safari requires macOS and enabled Safari remote automation. Drivers/browsers may need network downloads on first use. CI covers Chrome and Firefox on Linux, and real Safari/WebKit on macOS; no Safari result is inferred from Chrome.

Linux Web CI starts PulseAudio with a default null sink so headless Firefox can initialize real audio playback without a physical sound device. Media error assertions remain enabled. Browser harness results use `errorMessage`, not a top-level `error` field, to avoid classic WebDriver treating expected application failures as protocol errors.

The static test server binds `127.0.0.1:1430` (`WEB_TEST_PORT` overrides it); a real cross-origin model SSE server uses the next port. Test servers record requests without credentials, browser errors and screenshots in `test-results/web/`. Cache fault tests cover 404, bad bytes, truncation and cancellation; quota/marker failures are injected at storage boundaries. Runtime tests exercise actual Worker, CORS, SSE, default key persistence/clearing and background Blobs. Production E2E covers downloads, multi-turn state/UI/media and retry. A shared scenario compares browser Worker results with a Node VM desktop-pipeline baseline, not a native WebView. No real model credentials are used.

`test:web:unit` is a focused fast run without standalone global coverage collection; all new production files remain included in the unchanged `test:js` coverage gate. `npm run test:web` tests one selected browser; CI runs it for each browser in the matrix. Desktop regression gates remain independent.

## Jest

`jest.config.js` uses jsdom and Testing Library for renderer/shared tests. The Tauri API module is mocked at the adapter boundary; business tests configure native command results through `global.platformMock`.

`test/libs/` contains reusable library tests and their helpers; `test/game-card/` tests the platform DSL/runtime with minimal fixtures, and `test/tavern-import/` tests Tavern conversion. WA2 is maintained separately; platform tests do not read its project directory or verify its content. Run library tests with `npx jest --runInBand --coverage=false test/libs`. The default Jest suite discovers them automatically.

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
- [project initialization](../authoring/project_init.md), no-overwrite/rollback safety and native command results (`cargo test --manifest-path src/tauri/Cargo.toml project_init`).
- GUI agent bootstrap document pointers, local resource discovery and lossless JSON path serialization (`cargo test --manifest-path src/tauri/Cargo.toml development --lib`).
- [client dry-run](../authoring/dry_run.md), original-source diagnostics and real offline read-only syntax checks (`cargo test --manifest-path src/tauri/Cargo.toml dry_run`). The native integration checks require a desktop WebView; use `xvfb-run -a` on headless Linux, as in CI.

Cargo also bundles the dry-run checker through the existing Node/Vite build dependencies and embeds it in the executable. Installed clients do not need Node, a dev server or a second checker package.

Developer-mode [runtime trace](../authoring/runtime_trace.md): `cargo test --manifest-path src/tauri/Cargo.toml trace --lib` covers JSONL writes, session isolation, source mapping, privacy exclusions and path/failure safety. Jest `runtimeTrace*.test.js` and `RuntimeTraceControl.test.js` cover exact changes, conditions, find, exec, rollback and the title-bar switch. After the E2E build, run `npx wdio run wdio.tauri.conf.mjs --spec test/tauri-e2e/runtime-trace.e2e.js` for real Worker/session logging and read-only active/index log discovery.

## Tauri E2E

`test/tauri-e2e` uses WebdriverIO with the embedded Tauri WebDriver provider. The `e2e` Cargo feature enables test-only plugins, an isolated app data directory and a fixed fixture import directory.

The suite covers startup, settings, background, Session and history storage, retry, message collapse, game card rules, file content, exec, state patches, multi-turn TTL, visibility, stream abort, card import, dynamic React UI, controlled image/audio URLs and process restart persistence. A local streaming endpoint records requests made by the real Rust HTTP Channel.

Real provider calls are excluded from the default suite. Set `E2E_OPENAI_URL`, `E2E_OPENAI_KEY`, `E2E_OPENAI_MODEL` and/or the equivalent `E2E_ANTHROPIC_*` variables before running `npm run test:e2e-real-api`.

Production builds do not contain WebDriver commands or E2E permissions.

E2E refreshes explicitly focus the test window so background WebViews do not suspend entrance animations. This permission is test-only. Linux CI installs `webkit2gtk-driver`, runs E2E under a private D-Bus session and Xvfb, and disables WebKit compositing only in that GPU-less test environment. Failed desktop jobs upload backend logs and test fixtures/screenshots for diagnosis.

## CI And Release

`.github/workflows/tauri-ci.yml` always runs JavaScript checks, Chrome/Firefox/Safari tests, and Rust plus desktop E2E on macOS, Windows and Linux (`xvfb` on Linux). Ordinary code/test changes do not build or upload Release installers; the isolated Debug E2E app is still built.

CI listens to pushes on `master`/`main`, pull requests and manual dispatch. Both the default desktop suite and the separate Tavern import suite always run on all three platforms. `scripts/ci-installer-policy.mjs` enables additional installer verification for dependency/lockfile, build/toolchain configuration, packaging scripts, Tauri metadata/icons/capabilities and bundled resource changes (including devkit source documents and libraries). Deletions and renames are included; unavailable comparison history conservatively enables packaging. Checkout fetches only the comparison commit when needed, not the full history. Manual dispatch can enable `build_installers` explicitly.

The release workflow reuses all CI tests with `skip_installer_check: true`, then its dependent `publish` job builds the formal installers once, including both macOS architectures. This avoids packaging once in validation and again in publishing; test failures still block release packaging. CI installer verification only uploads workflow artifacts, never publishes a Release.

`.github/workflows/tauri-release.yml` creates draft installers for:

- macOS app/DMG on Apple Silicon and Intel;
- Windows NSIS;
- Linux deb/AppImage.

Release tags use `wcs-v*`. The current release tag is `wcs-v1.0.0`; retired `app-v*` tags have been removed. Signing certificates are optional: without them, macOS uses an ad-hoc signature and Windows produces an unsigned installer. Apple certificate-based signing/notarization requires the corresponding certificate, password and Apple account secrets; Windows certificate-based signing requires a PFX certificate and password.

The current version is `1.0.0`. Builds create a draft stable release; publish it only after all platforms finish successfully. `scripts/check-release-version.cjs` checks npm/Tauri/Cargo versions and rejects mismatched release tags. Run it locally before tagging. Publishing the draft still requires checking all four architecture/platform artifact sets, installation on clean systems, an upgrade with backed-up data, model connectivity and installed devkit/dry-run behavior. CI does not replace this manual acceptance or real-provider testing. Release notes live in `docs/releases/1.0.0.md`; the installation FAQ lives only in README.

## Web formal releases

The production site is [world-card-station.pages.dev](https://world-card-station.pages.dev/): `/` hosts the website and documentation, `/play/` the Web player, and `/play/cards/` the hosted cards, with the catalog at `/play/cards/index.json`. The website repository assembles all three into one Cloudflare Pages deployment; this repository only produces the player artifact.

`.github/workflows/web-release.yml` listens to published non-prerelease GitHub Releases (not ordinary pushes). It builds `/play/` assets, uploads `wcs-web.zip` and its SHA-256 checksum to the same Release, then notifies `yinchuxuan/WorldCardStation_website`. Existing desktop tag-to-draft releases remain unchanged.

WA2 is published independently by `yinchuxuan/white_album_2` as `wcs-card-web.zip` plus its SHA-256 checksum. Both source repositories notify the website only after their artifacts are complete. Ordinary commits or tag pushes do not publish the production site: a formal Release must be published and its Web artifacts generated. The website also supports manual deployment and its own formal Release trigger; its homepage is built from the current default branch.

Configure `SITE_DISPATCH_TOKEN` with Contents write access only to the website repository; Cloudflare secrets stay in that repository. The website owns source allowlists, version reconciliation, immutable release identities and deployment. Its [RELEASING.md](https://github.com/yinchuxuan/WorldCardStation_website/blob/main/RELEASING.md) is the authoritative setup and recovery guide. The manual source workflow accepts an existing formal Release tag for retries; uploaded assets cannot be overwritten. New tags must contain the Web implementation and workflow.

The website selects the latest complete formal release of the player and each card by publication order, validates checksums and platform/Schema compatibility, then deploys the assembled site. Only the selected latest card resources are deployed; historical artifacts remain on GitHub Releases and identities in the lock file, not at old production resource URLs. A committed lock file records the desired deployment, not proof of successful deployment. See [Web design](../architecture/web.md) for the impact on cached games and old sessions.

Deployment acceptance checks `/`, `/play/`, `/play/cards/index.json`, missing-resource 404s, complete card download, model CORS, manual saving and refresh recovery. Model services must allow the production Origin `https://world-card-station.pages.dev`; hosting cards on the same site does not proxy model requests. Browser data from localhost or the old GitHub Pages origin is not automatically migrated.
