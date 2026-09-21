# World Card Station Web 版本设计

<!-- devkit:omit:start -->
适用任务：修改 Web 端产品边界、缓存或浏览器存储。  
相关代码：`src/web/`、`test/web/`。  
前置文档：[Platform Adapter](platform_adapter.md)
<!-- devkit:omit:end -->

## 产品边界

Web 是静态托管的轻量游玩端：从主站选择游戏、下载完整资源、连接自己的模型并手动存档。客户端承担完整游玩、卡片导入与开发能力；两端共享 DSL、变量、规则、消息管线、脚本、自定义 UI 和演出系统。

| 能力 | Web 游玩端 | Tauri 客户端 |
| --- | --- | --- |
| 游戏来源 | 主站可信托管卡 | 本地卡包、项目与酒馆卡导入 |
| 进度保存 | 手动创建新存档，保存在当前浏览器 | 自动保存，并可手动创建存档 |
| 开发与调试 | 不提供开发者模式和磁盘 trace | 提供本机开发与调试能力 |
| 模型连接 | 浏览器直连，受 CORS 限制 | 原生网络请求 |
| 卸载游戏 | 只删除资源缓存，保留 Session | 删除游戏卡及其 Session |

Web 不提供账号、云同步、付费额度、模型代理、作者自助发布、任意 URL 加载、本地卡导入、网页离线启动或本地 Agent/CLI 接口。**存档转移不属于产品设计：不提供存档导入导出，也不提供跨浏览器、跨设备或与客户端之间的存档迁移。**

“纯静态”指平台和卡片无需自有业务服务器；模型仍需要联网访问外部服务。公开下载的卡片规则、脚本和剧情不具备保密性。

## 代码与平台边界

`src/renderer/` 承载共享 React 前端，`src/shared/game-card/` 承载平台无关核心；`src/web/` 与 `src/tauri/` 平级，负责 Web 入口、浏览器存储、资源与网络适配。memory adapter 只用于测试。

Vite 通过 `@application` 和 `@platform` 选择双端入口。Web 使用 `web:dev`、`web:build`，输出 `dist/web/`；桌面输出 `dist/renderer/`，互不清理。Web 产物不得包含 Tauri bridge、原生窗口或 WebDriver 依赖。

共享组件维护一份布局、样式与交互。`capabilities` 决定可用能力，`savePolicy` 决定保存策略，`cardPolicy` 决定准备资源与卸载语义；业务代码不直接判断宿主或调用 Tauri API。具体接口见 [平台适配](./platform_adapter.md)。

| 服务 | Web 职责 |
| --- | --- |
| resources | 从固定版本缓存读取授权文本；媒体按需创建并回收 Blob URL |
| repository / scriptExecutor | 返回已展开配置，复用 Worker 执行器与 context/result 校验 |
| cards | 合并可信目录与历史引用，准备完整缓存后激活，卸载资源 |
| config / background | IndexedDB 保存设置、模型密钥与自定义背景 Blob |
| sessions | IndexedDB 保存完整快照，执行显式存档与冲突检查 |
| window | 提供浏览器全屏能力，不提供原生窗口操作 |

Web 保留普通聊天，隐藏本地卡导入、开发者模式和本机路径，不启动磁盘 trace 或原生关闭订阅。不另设全屏按钮、顶栏保存按钮或“记住密钥”开关。不可用服务的意外调用明确报错，不返回假成功。

## 主站与静态发布

正式主站为 [world-card-station.pages.dev](https://world-card-station.pages.dev/)，按以下路径统一部署：

| 路径 | 内容 |
| --- | --- |
| `/` | 官网与文档 |
| `/play/` | Web 播放器，构建使用 `WEB_BASE=/play/` |
| `/play/cards/index.json` | 可信卡片目录 |
| `/play/cards/<card-id>/<release-id>/` | 固定版本的清单、配置与资源 |

应用内切换游戏，不依赖服务器深层路由回退；资源 URL 基于部署 base 解析，仍支持独立静态部署。缺失资源必须返回 404，不能返回首页 HTML。

平台和 WA2 等白名单卡片仓库发布正式 Release 后生成 Web 产物并通知 website 仓库，由后者核对来源、摘要及平台/Schema 兼容性，与官网一起部署至 Cloudflare Pages。普通提交或 tag 推送不直接上线；发布操作以 [构建与测试](../engineering/build_and_test.md#web-formal-releases) 及其链接的 website 发布说明为准。

卡片发布器复用 Rust 导入解析、Schema 和资源校验，输出展开 `$import` 的 `card.json`、`release.json` 及独立资源。`release.json` 定义分发身份、兼容要求和文件路径、大小、哈希、类型，不是另一套 DSL。`releaseId` 标识不可变内容，不能仅使用作者版本号。产物不包含 Session、trace、模型设置或源目录绝对路径；Rust/Node 不参与浏览器运行。

正式站点每张卡只部署最新完整正式版本，索引与资源一起发布；Release 产物不可原地替换。历史产物保留在 GitHub Release，历史身份保留在锁文件，但旧生产资源 URL 会返回 404，运行时不会自动从 GitHub 补齐。

部署不清理浏览器中的完整旧版缓存，也不迁移旧存档。旧版资源被卸载、回收或部分缺失后，可能无法恢复游玩；此时必须明确报错，不能静默换成最新版。未完成的旧版下载需刷新目录后重新选择最新版。

## 全量缓存与资源读取

1. 浏览目录只获取索引和封面；选择游戏或恢复 Session 时绑定固定发布版本，不自动升级。
2. 检查已校验清单、就绪标记及全部缓存条目。齐全则从本地加载，不重新下载卡片资源；不能只检查缓存名称或 `card.json`。
3. 缺失时下载全部配置、Schema、脚本、样式、文本及媒体。采用有限并发、逐文件处理，显示大小和进度，支持取消、重试并复用已校验文件。
4. 每个文件校验长度与哈希后写入版本缓存；全部成功才提交就绪标记并允许初始化。失败不标记完成，不影响其他版本或存档。
5. 初始化前预加载规则文本，同步 `readFile` 读取已准备内容；目录 scope 和动态读取仍遵守 `files` 授权，路径必须位于清单及固定发布目录内。

Cache Storage 按 `sourceId/cardId/releaseId` 隔离，不依赖普通 HTTP 缓存。就绪标记不能替代条目检查；日常启动不逐次重新计算全卡哈希。Cache Storage 与 IndexedDB 之间没有跨库事务。

全量下载不等于全量解码。图片、音频按需从缓存读取并生成 Blob URL，切换或卸载时释放；不直接使用远程媒体 URL 假设会命中缓存。运行时资源缺失必须报错并允许在线版本补齐，不把失败 Promise 永久缓存。

下载前估算空间，写入时处理配额不足；不能为资源下载自动删除存档。哈希用于完整性校验，不证明发布者可信。不使用 Service Worker，不承诺网页断网重启或模型离线可用。

## Session 与浏览器存储

IndexedDB 数据库为 `WorldCardStationWeb`，保存设置、卡片引用、Session 和背景；卡片文件放 Cache Storage。存储按 Origin（协议、主机、端口）隔离，localhost、旧 GitHub Pages 与正式主站的数据不互通，也不随部署迁移。

卡片引用保留 `sourceId`、`cardId`、`cardVersion`、`releaseId` 和 `releaseUrl`。Session 绑定来源、卡片及固定发布版本，再以 `sessionId` 区分；普通聊天使用独立作用域。各标签页独立持有当前选择，保存目标不能由其他标签页的切换改变。

### 显式存档

- 普通聊天与游戏均只在内存中推进；流式输出、回合完成、阅读位置和 State 变化不自动写回进度。设置、背景和卡片登记等管理数据独立持久化。
- 会话面板的“存档”将完整快照创建为新 Session，不覆盖旧档；保存后继续当前进度，刷新恢复新存档。不常驻显示保存状态或额外提示文字。
- 生成、初始化或状态操作期间禁用存档；取消生成稳定后可保存未完成消息，但不将其标为生成成功。
- 切卡、切会话或卸载当前卡直接离开，不弹存档确认、不自动保存；未存档进度丢弃。刷新、关闭或崩溃同样可能丢失未存档进度。
- 重新打开恢复最近存档；无已保存进度则重新初始化。恢复与初始化不自行覆盖存档。重试使用发送前的内存基准，不回退到上一次手动存档。

### 一致性与失败保护

保存以同一 IndexedDB 事务提交 messages、gameState、viewState、retryBase、metadata 与 revision；网络准备不放入数据库事务。保存绑定明确作用域和来源 revision，事务内检查来源仍存在且未改变；迟到保存不能复活已删除 Session。

多标签页可以从同一来源分别创建新存档，不互相覆盖。冲突或保存失败必须可见并保留内存现场供重试，不得退回内存后宣称已保存；恢复失败不得覆盖原记录。

浏览器回收或用户清理站点数据可能同时删除资源与存档。存档不提供导出备份或迁移能力，清除后无法通过重新下载卡片恢复；持久化存储申请也不保证永久保留。配额不足时提示用户管理空间，不自动删除其他 Session。

## 卸载资源与删除 Session

切换或退出游戏仅释放运行时和 Blob URL，不删除资源缓存或存档。

“卸载游戏资源”删除该来源下指定卡片的全部缓存版本及就绪标记，保留发布引用和 Session。先退出受影响运行时，再清理资源；通过 Web Locks、失效通知协调下载与卸载，其他标签页停止使用失效资源。保留旧版存档不意味着下线资源可以重新下载。

删除 Session 需独立确认，在 IndexedDB 事务内删除快照及相关索引，不触碰资源缓存。删除当前 Session 后切换其他会话；没有会话时退出，不自动重建被删除的会话。取消确认则保留当前现场。

## 模型连接与安全边界

Web 使用原生 fetch、ReadableStream 和 AbortSignal，复用共享 OpenAI/Anthropic 请求构造、SSE 解析和连接测试。服务商必须允许 Origin `https://world-card-station.pages.dev`、所需请求头及协议，并正确处理 CORS 预检；同源托管官网和卡片不会代理模型请求，也不保证桌面可用的端点在网页可用。

保留 HTTP 错误、超时、流式中断和取消处理。浏览器 TypeError 提示“网络或跨域访问失败”，不能无证据断定具体原因；不使用 `no-cors` 绕过响应读取限制。

API Key 默认随模型配置保存在 IndexedDB，清空字段同时清空持久化密钥。本地存储不是加密保险箱；密钥不写入构建产物、不上传到静态主站。真实模型测试使用明确配置的凭据，自动化测试默认使用模拟响应。

仅加载可信托管卡。Worker 超时与数据校验不等于对恶意脚本的完整安全隔离，动态 React UI 也不是沙箱。部署安全策略需兼容动态 UI、Blob Worker、媒体及允许的模型端点，不能照搬 Tauri 的 local 协议策略。浏览器可能限制音频自动播放与全屏请求，需遵守用户交互要求并处理拒绝。

相关契约：[平台接口](./platform_adapter.md)、[会话](./sessions.md)、[Content](../game_card/rules/content.md)、[UI runtime](../game_card/presentation/ui_runtime.md)。测试命令与发布验收见 [构建与测试](../engineering/build_and_test.md)。
