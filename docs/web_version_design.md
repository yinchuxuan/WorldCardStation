# World Card Station Web 版本设计

状态：提案，尚未实现。日期：2026-09-20。

## 1. 目标与范围

在保留 Tauri 客户端的前提下，为同一平台源码增加静态托管的 Web 游玩端。同一份游戏卡内容可在两端运行，不复制 DSL、规则引擎、聊天管线或演出系统。

首期交付：双端构建、可信预发布游戏卡加载、模型直连、浏览器本地存档、存档导入导出和核心游玩流程。以一张现有卡验证完整闭环。

首期不包含：账号、云同步、付费额度、模型代理、作者自助发布、游戏卡商店、任意 URL 卡片加载、网页 PNG/ZIP/酒馆卡导入、完整离线下载、本地 Agent/CLI 网页化。桌面端现有能力继续保留。

“纯静态”指平台和卡片无需自有业务服务器；模型仍由外部服务计算，需要联网且允许浏览器访问。下载到浏览器的公开卡片规则和剧情不具备保密性。

## 2. 现状与迁移原则

当前 `src/renderer/` 是 React/Vite 应用；`src/shared/game-card/` 为平台无关核心。`src/renderer/platform/` 隔离资源、仓库、脚本执行、Session 和配置。`index.js` 与 `modelFetch.js` 当前固定选择 Tauri；Rust 承担磁盘存储、卡片安装与模型 HTTP。

沿用现有业务接口，在平台边界新增 Web 实现。memory adapter 仍仅用于测试，不充当持久化生产实现。现有架构文档描述当前实现，本文描述拟新增能力。

```text
React UI / chat runtime / game-card core
                  ↓
          构建时选择 platform
          ↙                 ↘
Tauri adapter             Web adapter
Rust / app_data_dir       IndexedDB / HTTP / fetch
          ↓                 ↓
桌面安装包                静态网页产物
```

## 3. 构建与模块边界

Vite 增加显式 Web 构建目标，保留现有桌面开发和打包命令。建议新增 `web:dev`、`web:build`，Web 输出 `dist/web`，桌面继续输出 `dist/renderer`，避免互相清理产物。

通过构建别名选择 Web/Tauri 平台入口；每个入口提供 gameCardPlatform、rendererServices、modelFetch 和 capabilities。业务模块不判断桌面环境，也不直接引入 Tauri API。Web 依赖图不得包含 native bridge、桌面窗口或 WebDriver 插件。

保留普通聊天入口。首期通过应用内状态选择预发布卡，不引入必须由服务器回退处理的深层路由。资源 URL 依据部署 base URL 解析，支持站点子路径。

## 4. 平台接口适配

| 接口 | Web 实现 |
| --- | --- |
| resources.readText | 根据卡片版本和清单读取授权相对路径；合并并发请求，缓存成功结果 |
| resources.getImageUrl/getAudioUrl | 返回版本固定的静态资源 URL，媒体由浏览器获取 |
| repository.getActiveCard | 返回已校验、已展开 `$import` 的卡；失败显式抛错 |
| scriptExecutor.run | 复用 Worker 执行器及 context/result 校验 |
| config | IndexedDB 保存非密钥设置；密钥策略见第 8 节 |
| sessions | IndexedDB 实现现有会话契约及完整快照保存 |
| cards | 预发布列表、激活、移除本地记录；首次选择仅登记在线引用 |
| background | 文件选择后保存 Blob，显示时创建并回收 Object URL |
| window | 提供可用的网页全屏能力；关闭 native 窗口能力不开放 |
| development / trace | 首期不提供本机指引和磁盘 trace，入口受能力声明控制 |

capabilities 显式声明 cardImport、localDevelopment、diskTrace、nativeClose 和 fullscreen 等实际能力。不可用操作隐藏或说明原因；意外调用返回明确错误，不使用“成功但无效果”的占位实现。

Web 在线卡登记不冒充 `cards.importFile()`。以最小新增业务操作表达在线登记，保留桌面导入与酒馆转换契约。移除卡片记录若会删除其存档，必须在执行前明确确认。

## 5. 在线游戏卡与发布准备

首期使用可信的固定发布目录和一个静态索引，不建设发布后台。游戏卡目录继续作为创作源，既有 `.gamecard`/PNG 保持桌面分发形式。

最小发布工具复用现有 Rust 导入解析、schema 和资源引用校验，输出展开后的卡配置及独立资源。Rust 只在构建阶段运行，Web 运行时不依赖 Rust。禁止发布 Session、trace、模型设置或本地绝对路径。

```text
cards/<card-id>/<release-id>/
  release.json          发布元数据及文件清单
  card.json             已展开 $import 的运行配置
  rules/ state/ ui/     规则、schema、脚本和样式
  images/ audio/        独立媒体资源
```

`release.json` 是新增的分发协议，不是第二份游戏卡 DSL。至少包含发布协议版本、cardId、cardVersion、不可变 releaseId、平台兼容要求、入口，以及文件的相对路径、字节数、哈希和类型。

静态索引给出简介、封面和 release 地址。releaseId 以内容摘要或唯一构建标识生成，不能仅依赖作者重复使用的版本号。浏览器只接受配置的可信发布源。

发布时先上传完整 release 并校验，再更新索引；已发布 release 不原地覆盖。已有会话引用的旧 release 应保留；缺失时提示不可用，不能自动换成最新版本。

## 6. 加载、缓存与失败行为

1. 浏览列表只获取索引和封面；选择卡片只登记发布引用。
2. 开始游戏加载 release、card.json、外部 state schema，以及初始化所需脚本、样式和文本。
3. 初始化前等待现有规则预加载完成；同步 `readFile` 仍读取已准备文本，不改成隐式异步网络操作。
4. 目录 scope 和动态内容继续遵守 `files` 授权；路径必须落在清单和固定发布目录内。拒绝绝对路径、路径穿越和未授权协议。
5. 背景、立绘、音乐仅在使用时加载；首屏必要图像可预加载，不遍历下载整个媒体清单。

媒体首期采用浏览器 HTTP 缓存；不引入 Service Worker 或把所有媒体写入 IndexedDB。不承诺离线可用。release 资源可长期缓存，索引采用重新验证策略；缓存键包含发布版本，切卡清理旧的内存引用。

入口、schema、规则文本或脚本获取失败时停止该次初始化/操作，保留此前存档，提供重试。图片失败显示占位与重试提示；音频失败不破坏已提交游戏状态。不缓存失败 Promise 为永久结果。

哈希用于版本识别和完整性检查，不能证明发布者可信；文本可在资源层校验，媒体首期由发布校验与不可变 URL 保证版本一致，不为了校验强制提前整文件下载。

## 7. 存储、版本与存档转移

浏览器数据库拟命名 `WorldCardStationWeb`。使用版本化 IndexedDB schema；逻辑上分 settings、cardReferences、sessions、backgrounds，必要索引在实现时确定。媒体缓存与用户存档分开管理。

每个卡片引用包含 sourceId、cardId、cardVersion、releaseId 和 releaseUrl。会话作用域由来源、卡片和 release 唯一确定，再加 sessionId；普通聊天使用独立作用域，避免与卡片或不同来源同名卡混淆。

一次会话保存须在同一事务中提交 messages、gameState、viewState、retryBase、metadata 和 revision。保留当前串行合并保存、切卡前保存、重试使用原快照等语义。数据库事务外先完成网络和数据准备，不跨网络请求保持事务。

初始化恢复失败时禁止后续自动保存覆盖旧记录。保存错误必须可见，内存中的最新状态保留以便重试或导出；不得静默退回内存并显示“已保存”。

流式生成过程中可节流保存当前允许恢复的快照，回合完成和受控状态提交后及时保存。中断生成恢复为未完成消息，不假装生成成功。页面关闭事件仅作为补充，不依赖异步关闭回调保证持久化。

多标签页采用事务内 revision 比较拒绝旧版本覆盖；冲突页面暂停保存与生成，提示重新加载或导出本地副本。广播通知可改善体验，但不能取代数据库冲突检查。

申请持久化存储、检查空间作为增强；申请失败不声称存档永久可靠。配额不足提示导出与管理存储，不能自动删除其他会话。

定义带 formatVersion 的独立 Session JSON 导出格式，包含完整快照、卡片身份/版本和导出时间；排除 API Key、模型配置、磁盘路径和资源缓存。导出不包含卡片媒体。

导入先校验结构、大小、兼容要求和目标卡片版本，再创建新 session；失败不覆盖现有数据。跨端导入需匹配已安装/已发布卡片的内容版本，缺少可核验版本信息时不得静默视为兼容。首期不自动升级旧存档到新卡版本。

## 8. 模型网络与密钥

Web modelFetch 使用原生 fetch、ReadableStream 和 AbortSignal，复用现有请求构造与 OpenAI/Anthropic SSE parser。模型服务必须支持当前网站来源、请求头及对应协议的浏览器请求。

保留 HTTP 错误、超时、流式中断和取消处理。浏览器 TypeError 可能来自网络或 CORS，提示“网络或跨域访问失败”，不能无证据断言具体原因。不得使用 no-cors 伪装解决响应读取问题。

密钥默认仅保存在内存；用户明确选择“在此浏览器记住”后才写入本地配置，并提供删除入口。本地保存不等于加密保险箱。平台不把共享服务密钥写进构建产物，不向静态托管端上传用户密钥。

首期不实现代理，不保证所有桌面可用端点都可在网页使用。真实服务验证使用明确配置的测试端点和凭据，自动化默认使用模拟流式响应。

## 9. 游戏卡代码与浏览器能力

保留现有 Worker 超时和数据校验；动态 React UI 和 Worker 不自动构成对恶意卡片的完整安全隔离。首期只加载审核过的卡片，未知发布源和用户上传代码不开放。

静态站部署显式设置适配现有动态 UI、Blob Worker、样式和媒体的 CSP，不直接复制 Tauri 的 local 协议策略。模型连接策略需要覆盖允许的外部端点；在浏览器中验证实际限制。

启动按钮提供媒体用户交互时机，处理浏览器拒绝自动播放和全屏请求的情况。对象 URL 在背景切换/卸载后回收。移动端响应式和音频行为纳入验证，但首期不承诺完整移动端产品适配。

## 10. 实施顺序

| 阶段 | 工作 | 交付与退出条件 |
| --- | --- | --- |
| A：浏览器运行闭环 | 双端入口、capabilities、最小发布准备、在线资源、Web 初始服务 | 同一张卡在网页初始化，模拟模型下完成规则和演出；桌面可运行 |
| B：完整游玩与恢复 | IndexedDB、真实模型直连、切卡/切会话、重试/取消、及时保存 | 支持跨域的真实端点完成回合；刷新恢复完整状态；读取失败不覆盖存档 |
| C：交付验证 | 存档转移、版本检查、冲突保护、失败提示、静态部署和桌面回归 | 网页构建可独立托管，同卡两端通过验收，存档可验证地导入导出 |

新增代码集中在 platform Web adapter、浏览器存储和发布准备工具。共享核心仅为实际契约缺口改动；不借迁移重写规则引擎或既有桌面存储。

## 11. 验证与验收

- 构建：Web 无 Tauri 运行依赖，双端输出互不覆盖；根目录和子路径部署均可启动。
- 适配契约：资源授权、卡片激活、错误传播、配置、Session 行为具有针对性测试。
- 资源：以请求记录证明启动不下载全卡媒体，只有使用相应场景才加载资源；断网和 404 可恢复。
- 存档：刷新、切换、重试、未完成生成、配额错误、读取失败、版本缺失、双标签冲突均不静默丢档。
- 模型：模拟流测试流式解析、取消和错误；配置测试服务后验证实际浏览器跨域与生成。
- 演出：背景、立绘、音乐、自定义 UI、脚本超时在目标浏览器实际验证。
- 跨端：同卡同初始状态和同模拟响应产生一致的游戏状态；存档往返保留消息、状态和重试基准。
- 回归：现有相关 JS/Rust 测试及 Tauri 核心流程保持通过；不以移除检查换取网页通过。
- 浏览器矩阵：当前稳定版 Chromium、Firefox、Safari 验证核心流程；记录实际版本和已知限制。

## 12. 后续演进与参考

后续独立增加主站目录与详情、客户端在线下载安装、网页卡包导入、离线缓存和账号同步。自助代码卡发布必须先解决信任与隔离；统一模型额度需要服务端。

相关设计：[架构](./architecture.md)、[平台接口](./platform_adapter.md)、[会话](./chat_session_design.md)、[卡包](./game_card/game_card_packages.md)、[Content](./game_card/game_card_content.md)、[UI runtime](./game_card/game_card_ui_runtime.md)。

浏览器约束参考：[CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)、[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)、[存储配额与回收](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)。
