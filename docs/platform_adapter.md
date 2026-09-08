# Platform Adapter

## 目标

平台 adapter 隔离 React/game card runtime 与 Tauri native backend。Shared core 只接收普通数据和显式依赖，不读取 `window`、DOM、本地文件系统或 Tauri API。

Tauri 是唯一桌面 target；memory adapter 用于 unit test，不参与生产构建。

## Game Card Contract

`src/renderer/platform/gameCardPlatform.js` 创建并冻结以下接口：

```js
{
  resources: {
    readText(cardId, relativePath),
    getImageUrl(cardId, relativePath),
    getAudioUrl(cardId, relativePath)
  },
  repository: { getActiveCard() },
  scriptExecutor: { run(source, context, options) }
}
```

`tauriGameCardPlatform.js` 将文本与 active card 映射为 `invoke`，将图片和音频映射为 `convertFileSrc` 生成的受控 `local` URL。资源授权在 Rust 协议实际读取时再次校验。

`memoryGameCardPlatform.js` 从内存中的 card、文本和 URL 读取资源。聊天管线与 shared core 单元测试应优先使用它。

## Renderer Services

配置、背景、Session 与游戏卡安装管理 contract 集中定义在 `src/renderer/platform/contracts.js`：

```txt
rendererServices.config
rendererServices.background
rendererServices.sessions
rendererServices.cards
rendererServices.window
```

`tauriRendererServices.js` 将 contract 映射为业务级 command 和受控窗口 API，并用 `listen` 订阅背景配置变更。adapter 负责将 Rust 错误、取消和校验详情归一化为 JavaScript `Error`。

`cards.uninstall(id)` 删除已导入游戏卡；如果目标是当前 active card，后端同时清空 active card。游戏卡选择器负责在调用前二次确认，并在卸载当前卡后切回普通聊天 Session。

`cards.importFile()` 使用统一文件选择器；原生卡返回已安装卡，酒馆卡返回 `{ kind: 'tavern', token, id, source, resources, fingerprint, container }`，此时不安装。内置 Worker 编译后调用 `stageTavernImport(token, { files, copies, worldbook }, targetId?)`，后端校验并返回 revision；无警告自动 `commitTavernImport(token, revision)`，有兼容差异或显式更新目标则分别确认后提交。取消用 `cancelTavernImport(token)`。资源只有任务内 ID，无任意磁盘路径；修改计划须重新 stage，旧 revision 和重复提交被拒绝。主动更新酒馆卡时传 `importFile({ tavernOnly: true })`，误选原生包在安装前拒绝，不按原生 ID 意外安装其它卡。

## 模型网络

`tauriModelFetch.js` 使用 Rust `stream_model_request` 和 Channel，将响应包装成兼容 `fetch` 的 `ReadableStream`。`src/renderer/chat/apiClient.js` 因此继续复用 OpenAI/Anthropic SSE parser。

模型配置中的 `reasoningEffort` 在未设置时省略；OpenAI 协议映射为 `reasoning_effort`，Anthropic 协议映射为 `output_config.effort`。设置界面提供当前协议的通用档位，具体模型可能只支持其中一部分。

OpenAI-compatible 流中的 `reasoning_content`、`reasoning` 与可见的 `reasoning_details` 文本会统一写入消息 thinking；加密 reasoning detail 不进入 UI。

`AbortSignal` 通过 request id 映射到 `cancel_model_stream`。renderer 不直接连接模型外网，也不维护额外 CORS 代理。

模型设置中的“已配置”状态按钮复用同一条生成链路，向当前模型发送限长的 `Hi` 流式请求；通过后显示“已连接”。测试因此会同时验证 URL、密钥、模型名、协议和响应格式，并可能产生少量模型费用；它不是独立的 HTTP 健康检查。

## 受控脚本

`controlledScriptExecutor.js` 在独立 Worker 中执行游戏卡 JavaScript，默认总超时为 2000 毫秒，包含 Worker 启动、执行及异步文件读取等待；超时会终止 Worker。规则入口与执行器共用默认值，内部调用仍可显式传入 `options.timeoutMs`。脚本 context 和 result 协议位于 `src/shared/game-card/exec`；DOM、native command 和本地文件能力不会进入脚本上下文。

规则、Content 和 exec 共用预加载的 `fileContents` 与显式注入的读取接口，不接受 Node `fs`、`path` 或本地 `baseDir`。同步 `readFile(relativePath)` 必须返回文本；桌面异步读取通过 `resources.readText` 预加载脚本及 include，目录 scope 的延迟读取使用 `readText`。renderer 不再维护独立的 action / Content 文件适配封装。

Node VM 执行分支仍供 Jest 与无 WebView 的内存管线测试使用；它不是第二个桌面 target。memory adapter、JSDoc contract 和 schema 引用收集校验也属于有实际用途的测试／开发支持，不按生产入口不可达直接删除。

## 调用方向

```txt
React / game card runtime
  -> platform contract
    -> Tauri adapter
      -> invoke / listen / Channel / convertFileSrc
        -> Rust backend

Unit tests
  -> memory adapter or mocked Tauri client
```

新增平台能力时先扩展业务级 contract，再实现 Rust command 和 adapter。不要在组件或 shared core 中直接 import Tauri API，也不要复制游戏卡 schema 或规则引擎。

## Contract Tests

adapter 至少覆盖：

- 文本、图片、音频和 active card 的成功与失败路径。
- 配置、背景、Session 和导入 command 的 payload 与错误归一化。
- init、pre-send、after-response 的完整内存管线。
- Worker context、返回值校验、超时和中止。
- 本地资源不能越过当前游戏卡目录。
