# 开发者模式运行日志

运行日志已接入平台正常游玩链路。它用于定位“行为和预期不一致”，不是 dry-run 报告、另一份游戏历史或回放输入。

## 使用

1. 正常加载游戏卡，点击标题栏左侧的卡片图标切换开发者模式；相邻的游戏卡名称只打开切卡菜单。默认关闭，每次启动客户端需重新开启；图标高亮表示已开启，小圆点表示正在记录，悬停提示具体状态。正常状态不增加文字按钮，记录失败仍明确显示日志不完整。
2. 实际游玩、重试或推进阅读，复现问题。开关不改变模型、规则阶段、脚本权限、超时或状态提交语义。
3. 复现后直接让 agent 排查“当前会话”，由 agent 按下文读取日志，不要求用户提供 session ID、选择目录或复制日志路径。消息正文和 state 完整保留，分享前检查隐私。
4. 再次点击卡片图标关闭模式，停止新记录并保留已有文件；再次开启追加新的记录段。新 session 自动开始独立记录，普通聊天不生成游戏卡日志；普通聊天图标同样可切换模式，等待加载游戏卡会话。

位置固定在平台数据目录，不在游戏卡开发仓库中：

```text
game-cards/cards/<card-id>/sessions/<session-id>/trace.jsonl
```

没有额外调试窗口、断言系统、trace 查询接口或回放服务。dry-run 不初始化此记录器、不执行规则，也不创建 session 或 trace。

中途开启只记录之后的过程，以当时内存 messages/state 为起点，不补造已经发生的步骤。正在进行的阶段不会倒补，之后进入的规则阶段会记录；关闭中的未完成执行明确标为不完整。

## agent 定位当前会话

系统配置中的“复制给 agent 的开发指令”提供当前客户端实际使用的 `gameCardsPath`，即平台数据目录下的 `game-cards/` 绝对路径。它不是开发仓库或开发包目录；仅作为本机起步信息使用，不写入项目或 Git。新 agent 会话若缺少此信息，先取得起步指令，不猜测安装目录；日常排查无需反复复制指令。

在 `gameCardsPath` 下只读查找：

1. 读取 `active.json` 的 `id`，得到当前游戏卡 ID；null 表示普通聊天，没有游戏卡 trace。
2. 读取 `cards/<card-id>/sessions/active.json` 的 `id`，得到当前 session ID。
3. 读取 `cards/<card-id>/sessions/index.json`，以 ID 确认 `title`、更新时间和消息预览。
4. 读取 `cards/<card-id>/sessions/<session-id>/trace.jsonl`，核对事件中的 cardId/sessionId 和复现时间，再排查规则对 messages/state 的实际影响。

“当前”指读取时的选择。复现后若已切换 session，按原会话名称查该卡的 index；名称允许重复，同名时结合时间、预览或向开发者确认，不任意取第一项。重命名只改 title，不改变 ID 和日志目录。若已切换游戏卡，还需先确认原卡。

没有日志或没有对应时间的记录时，说明可能尚未开启记录、复现早于开启或记录失败，不能以旧日志冒充本次过程。不要为了查找日志切换 active card/session、创建目录或修改已安装卡、存档；修复只在开发仓库进行。既有 active/index 文件就是定位依据，不新增 current-session 文件、trace 查询服务或 GUI 路径复制入口。

## 文件结构和读取方法

UTF-8 JSONL，每行一个 JSON 对象，按实际接收顺序追加。先按 `captureId` 区分每次启用/切换会话的记录段，再按 `operationId` 区分规则阶段、生成和 UI 操作；不能把不同 operation 的差量直接混合应用。

| 字段或事件 | 含义 |
| --- | --- |
| `capture.start` | `formatVersion: 1`、平台/协议版本、卡内容指纹、完整起始 `snapshot.messages/state` |
| `cardId` / `sessionId` / `captureId` | native 固定的原始归属，后续切换活动卡或 session 不重定向旧写入 |
| `sequence` / `time` | 同一 capture 的递增序号、事件发生时间；磁盘批量写入不改变事件顺序 |
| `operation.start` | 操作 ID、`kind`、完整输入快照；init/pre_send/after_stream/after_response/state_patch 各自独立 |
| `parentOperationId` / `origin` | 生成内阶段关联所属 generation；patch 标明 stream/reading、patchOrdinal，阅读还记录 messageId 和 targetBoundary |
| `pointer` / `source` | 展开 DSL 路径及原文件 `{file, pointer}`，通过正式 `$import` 展开映射定位 |
| `changes` | 相对此 operation 上一事件的精确 messages/state 变化，无变化是 `messages: null, state: []` |
| `operation.end` | completed / with_errors / failed / aborted 等实际结果，不代表每个中间状态都持久化 |
| `platform.commit` | React 发布到当前会话的实际内存快照变化；无 operationId，差量从 capture.start 起独立连续计算 |
| `capture.end` | 停止原因、completed/incomplete 及未结束的 operation ID；缺少结尾不能视为完整记录 |

`platform.commit` 是内存提交，不是磁盘存档成功收据；messages.json 和 retry-base.json 仍走原有保存队列。trace 不反过来驱动规则、状态或存档。

消息差量是一个精确 `splice`：`index`、完整 `removed`、完整 `added`，保留 role、正文、thinking、TTL、ID、所有 `_meta`。一次操作可同时删除/增加多条，不猜测消息身份或来源。exec 改变数组时使用 `operation: "replace"` 和完整 `before/after`。

状态差量使用 JSON Pointer `path` 和完整 `before/after`；键创建/删除额外携带 `hasBefore/hasAfter`，因此缺失和 null 可区分。普通对象递归到变化路径，数组整体替换。示例：

```json
{"path":"/player/hp","before":10,"after":5}
{"path":"/temp/result","hasBefore":false,"hasAfter":true,"after":null}
```

读取时先确认基准快照和归属，再沿 operation 查看差量及状态；检查 `rule.rollback`、局部 find 和实际提交，不能把一次 action 的尝试写入直接当成最终结果。

## 覆盖的实际行为

- 规则条件、action 条件、消息 predicate、find 查询和 Content 分支记录实际判断值、命中/跳过；短路分支标记 `not_evaluated`，不为日志重新运行表达式或随机选择。
- 规则及嵌套 action 的开始、结束、失败、耗时、原声明及既有 summary/effects。先插入后删除、中间改值后还原，即使最终无变化也可见。
- `find.enter` 记录 `temp.find` 的局部建立/遮蔽和原值，`find.restore` 记录恢复；规则失败时由 `rule.rollback` 明确丢弃未提交过程。
- state action 的尝试值、schema 校验/clamp 结果与实际变更。随机数只生成一次；日志记录实际写入值。
- exec 的真实输入 args/config/event、输入输出 messages/state、耗时、effects 和失败。顶层已开始执行但尚未返回的 JS 内部变量不可观察，不伪造超时脚本的输出。
- 文本/目录 scope 实际读取、读取失败，以及 sourceFile/include 的来源。同步文件预加载不冒充脚本实际调用 `files.read`。
- `exec.source.lines` 按拼接后脚本的零基数组位置提供原文件和一基行号；包含 include 剥离映射。错误保留原始 Worker stack；引擎包装函数的行号偏移依赖 WebView，不猜测或伪造精确错误行列。
- 平台 state 默认值、TTL 衰减/删除、实际应用的每个 state_patch action、模型实际输入消息和完整响应、responseValidation 结果/重试回滚、请求失败回滚、用户中止后的部分保留。
- 分段阅读时只把实际应用的 patch 标为状态变化；用于响应校验的候选 state/updates 在 `model.response.validationCandidate` 中单独记录，不冒充已提交 state。
- UI 的 `game.state.apply` / `game.script.run` 记录 action、exec 输出、拒绝或提交；已卸载 UI 的迟到结果标为 discarded。

生成、规则阶段和 UI 操作有各自输入快照；其差量表示该操作中的数据流。并发的流式接收与阅读推进以各自记录及 `platform.commit` 区分，不能仅靠时间相邻推断因果。

世界书沿用现有 `effects.worldbook` 报告。哪些条目被选中、排除或产生警告看 effects，实际注入后是否被后续规则修改/删除看 messages 变化。不新增专用 lib 日志协议。

`model.request` 保存正式适配链路去除内部字段后的 normalized_messages 和协议类型，不保存 HTTP 请求体。Anthropic 后续将 system 消息移到顶层 system；日志里的消息正文与该输入一致，不冒充原始网络抓包。

## 完整性、安全和边界

记录器在规则/action 执行边界立即收集不可变数据，并串行批量写入。最后一个 action 报错或 Worker 超时不会删除之前已收集/写入的步骤。原有错误处理仍决定整条规则或生成是否回滚，日志只观察。

native 只接受已开启 capture 的 token，不接受任意日志路径；校验卡/session ID 和路径，拒绝软链接/reparse point。append 绑定原 session，删除后的目录不会被迟到写入重新创建。关闭窗口会等待现有保存及 trace 队列。

卡指纹是按相对路径排序的文件名、长度、内容 SHA-256，排除 sessions、.wcs、.git、.DS_Store；包括脚本和世界书内容。它描述开启时的已安装目录，不是热更新机制；修改开发仓库后仍需重新导入。不要在运行期间从外部修改已安装目录，否则缓存中的实际输入和文件指纹可能不同。

目前不截断正文、不轮转或自动删除日志，文件可能较大。写入/序列化失败会停止该段并在界面提示“运行日志不完整”；不能把提示消失或文件存在当成完整证明。发现上次末行被截断时拒绝继续追加，保留原文件，可用新 session 继续记录。异常退出时可能丢失尚未落盘的尾部，缺少 capture/operation 结束标记即不能声称已完成。

只记录游戏数据，不复制模型密钥、认证头、请求 URL 或无关设置。错误保留运行原因；卡内容及模型文本自身包含的隐私不会被自动脱敏。

目录导入跳过根 sessions/.wcs/.git；原生包继续拒绝 sessions，忽略根 .wcs；导出排除 sessions/.wcs。更新卡保留已安装 session（含日志），lib 脚本和配套文档照常分发。
