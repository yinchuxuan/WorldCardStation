# Architecture

World Card Station（世界站）是面向 AI Roleplay 游戏卡的桌面平台。

## 组成部分

- **Tauri 桌面壳 (`src/tauri/`)**：创建桌面窗口，管理应用生命周期，通过 Rust commands 提供配置、Session、游戏卡仓库和模型网络能力。
- **渲染进程 (`src/renderer/`)**：Vite 构建的 React 单页应用。`main.jsx` 是唯一入口，`App.jsx` 为根组件。
- **聊天运行时 (`src/renderer/chat/`)**：管理 session、持久化、生成、重试、中止和滚动。
- **游戏卡核心 (`src/shared/game-card/`)**：平台无关的规则、content、state、schema 与协议逻辑，只处理普通数据和显式依赖。
- **平台适配层 (`src/renderer/platform/`)**：将 renderer contract 映射为 Tauri `invoke`、event、Channel 和受控资源 URL；memory adapter 只用于测试。
- **模型传输 (`src/renderer/platform/tauriModelFetch.js`)**：将 Rust HTTP Channel 适配为 `ReadableStream`，聊天层继续复用同一套 SSE parser。

Tauri 是唯一桌面生产 target。renderer 和 shared core 不做桌面平台判断，也不直接使用文件系统、dialog 或任意 native API。

## 调用方向

```txt
React / src/renderer/gameCard runtime
  -> renderer services / game card platform contract
    -> Tauri renderer adapter
      -> invoke / listen / Channel / convertFileSrc
        -> Rust commands / controlled resource protocol
          -> app_data_dir / model endpoint
```

Renderer 使用以下窄接口：

```js
resources.readText(cardId, relativePath)
resources.getImageUrl(cardId, relativePath)
resources.getAudioUrl(cardId, relativePath)
repository.getActiveCard()
scriptExecutor.run(source, context, options)
```

配置、背景、会话和游戏卡仓库通过 `rendererServices` 的 `config`、`background`、`sessions`、`cards` 接口访问。`cards` 提供已导入卡列表、active card 切换和 `importFile()` 文件导入；选择项目 `card.json` 时，后端通过目录安装管线导入整个项目。组件不直接调用 Tauri API。

## 样式

`src/renderer/main.jsx` 只导入 `src/renderer/styles/renderer.css`。游戏卡的 `display.stylesheet`、`visual.stylesheet` 和 `ui.stylesheet` 由 runtime 从当前卡目录读取，写入独立 `<style>`，切卡时替换或清理。

Tauri CSP 只开放动态游戏卡组件所需的受控 `Function`、Blob Worker 和运行时样式。图片与音频只能通过 `local` 受控协议加载，模型外网连接由 Rust command 完成。

## 数据与迁移

业务数据位于 Tauri `app_data_dir`：

```txt
config/{model,background}.json
game-cards/active.json
game-cards/no-card/sessions/
game-cards/cards/<card-id>/{card.json,sessions/}
```

所有业务 JSON 使用同目录临时文件和 rename 原子替换；同一 session 的写入串行执行。

Tauri bundle identifier 有意保留为 `com.airp.chatapp`，使 World Card Station 升级安装后继续读取原有配置、游戏卡和 Session；它是数据兼容标识，不再作为产品名称使用。

## 游戏卡协议

`src/shared/game-card/schema/game-card.schema.json` 是唯一结构事实源。Rust 导入器嵌入该 schema，处理 `$import`、路径边界、引用文件存在性和 Ajv `$data` 等价语义；共享 fixture 保证 JS runtime 与 Rust 导入校验一致。

Shared core 不依赖 DOM、React、Tauri、Node 文件系统或本地绝对路径。脚本上下文与返回值校验属于 shared core，Worker 执行属于 renderer adapter。

## 测试边界

- `test/chat`、`test/game-card`、`test/components`：Jest renderer 和 shared core 测试。
- `test/libs`：`libs/` 下可复用库的测试及公共测试辅助文件。
- `test/platform`：Tauri/memory adapter contract 与 WebView 配置测试。
- `src/tauri/src/*tests*`：存储、导入、资源协议和模型网络 Rust 测试。
- `test/tauri-e2e`：真实 Tauri commands、资源协议、流式网络和进程重启恢复。

正式 build 只加载 `default` capability。WebDriver 插件、增强 capability、固定导入目录和隔离数据目录只在 `e2e` feature/config 中启用。

## 本地资源

- `local://game-card/<card-id>/<image|audio>/<relative-path>` 只解析当前活动卡内的受支持资源。
- `local://user-background/current` 只解析背景配置授权的用户图片。
- Rust 在每次请求校验 card id、资源类型、扩展名、规范化路径和 realpath。
- 音频响应支持 byte Range；协议响应使用 `no-store`，避免切卡后复用旧授权缓存。
- adapter 使用 `convertFileSrc` 适配 Windows 与 macOS/Linux 的协议 URL 形式。
