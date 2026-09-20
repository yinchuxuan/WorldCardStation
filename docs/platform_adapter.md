# Platform Adapter

## 目标

平台 adapter 隔离 React/game card runtime 与 Tauri native backend。Shared core 只接收普通数据和显式依赖，不读取 `window`、DOM、本地文件系统或 Tauri API。

Tauri 是唯一桌面 target；Web 目前仅提供启动骨架。memory adapter 用于 unit test，不参与生产构建。

## 双端入口与能力

Vite 通过 `@platform` 选择 `desktop.js` 或 `web.js`；现有 `index.js` / `modelFetch.js` 作为稳定导出入口。Jest 默认选择桌面入口，浏览器集成测试验证 Web 的真实构建解析。

两个入口统一导出 `gameCardPlatform`、`rendererServices`、`modelFetch`、`capabilities`、`savePolicy`。能力声明只表示当前已实现的能力，包含 `cardImport`、`localDevelopment`、`diskTrace`、`nativeClose`、`fullscreen` 和 `gameplay`；保存策略分别为 `automatic` / `manual`，不混入能力字段。

步骤 1 的 Web 能力全部关闭：`@application` 选择不挂载聊天、设置、trace 或原生窗口订阅的启动页；普通聊天只显示未开放入口。所有未实现服务调用抛出含 `code: PLATFORM_UNAVAILABLE`、`operation` 的 Error，不返回空数据或伪造保存成功。后续接入共享运行时时须落实入口能力控制和手动保存策略，不能仅靠声明改变桌面 hooks 的行为。

桌面入口仍挂载原有 App 并使用原有 native 服务，自动保存语义不变。构建期依赖检查禁止 Web 产物引入 Tauri API、Tauri adapter 或 WebDriver。

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

repository 返回已经完成 `$import` 展开的卡，renderer 只加载外部 state schema 和运行资源；需要原始 import fixture 的测试在测试适配边界模拟 native 展开。读取 active card 失败必须传播错误，不能解释为普通聊天。

## Renderer Services

配置、背景、Session 与游戏卡安装管理 contract 集中定义在 `src/renderer/platform/contracts.js`：

```txt
rendererServices.config
rendererServices.background
rendererServices.sessions
rendererServices.cards
rendererServices.development
rendererServices.trace
rendererServices.window
```

`tauriRendererServices.js` 将 contract 映射为业务级 command 和受控窗口 API，并用 `listen` 订阅背景配置变更。adapter 负责将 Rust 错误、取消和校验详情归一化为 JavaScript `Error`。

`development.getInstructions()` 调用只读 `get_game_card_development_instructions`，由 native 根据当前客户端/资源目录和 AppStorage 的实际 gameCardsPath 生成文档阅读指引和必要本机路径，不重复开发流程，不接受 renderer 提供的本机路径。agent 按指南和既有 active/index 文件定位当前 session 日志，无专用日志查询接口。设置组件负责起步指令的剪贴板写入及失败时的手动复制；该能力不初始化项目或改变游戏卡、Session、模型配置。

`trace.start(scope, snapshot)`、`trace.append(token, records)`、`trace.close(token)` 映射到 `start_session_trace`、`append_session_trace`、`close_session_trace`。仅实际游玩的开发者模式使用；native 固定安全的原始 card/session 目录，不接受任意输出路径。记录器默认关闭、串行写入，失败明确提示不完整；dry-run 不加载该服务。见 [运行日志](./game_card/game_card_runtime_trace.md)。

`cards.uninstall(id)` 删除已导入游戏卡；如果目标是当前 active card，后端同时清空 active card。游戏卡选择器负责在调用前二次确认，并在卸载当前卡后切回普通聊天 Session。

`cards.importFile()` 使用统一文件选择器；原生容器或平台项目 `card.json` 返回已安装卡，后者复用目录导入管线安装完整项目。酒馆 JSON（包括同名 `card.json`）、PNG/APNG、CHARX 返回 `{ kind: 'tavern', token, id, source, resources, fingerprint, container }`，此时不安装。内置 Worker 编译后调用 `stageTavernImport(token, { files, copies, worldbook }, targetId?)`，后端校验并返回 revision；无警告自动 `commitTavernImport(token, revision)`，有兼容差异或显式更新目标则分别确认后提交。取消用 `cancelTavernImport(token)`。资源只有任务内 ID，无任意磁盘路径；修改计划须重新 stage，旧 revision 和重复提交被拒绝。主动更新酒馆卡时传 `importFile({ tavernOnly: true })`，误选原生容器或项目入口均在安装前拒绝，不按原生 ID 意外安装其它卡。

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

生产导入只提供 `cards.importFile()`，项目 `card.json` 仍复用 native 底层目录安装管线，不再暴露独立目录选择接口。`e2e_seed_game_card` 仅在 `e2e` feature 注册，供测试创建 fixture；正式构建没有跳过导入校验直接写卡的 command。
