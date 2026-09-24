# 多 Agent Session 保存与恢复

适用任务：新运行时的完整存档、读档、整轮重试和阅读视图恢复。
相关代码：`src/shared/game-card/runtime/sessionSnapshot.js`、`src/renderer/gameCard/mainSession.js`、`src/renderer/chat/useChatSession.js`。
前置文档：[Session](./sessions.md)、[Reader 与现有演出](./game_runtime_reader.md)。

## 数据与边界

复用 sessions.loadHistory / saveHistory 和已有会话菜单，不新增存档服务或检查点 API。
新运行时向 saveHistory 的 options 传入 runtimeSession；普通聊天仍使用原格式。
runtimeSession 是独立版本的完整数据包，version 为数字 1，与卡片 formatVersion 不同。

```text
runtimeSession
├─ version / cardId / cardVersion
├─ sequence                         已分配的输入轮 ID 上界
├─ current
│  ├─ state                         共享变量
│  ├─ contexts[agentId]
│  │  ├─ messages                   ID、正文、thinking、TTL、元数据
│  │  └─ initialized                不从消息数量推断
│  ├─ records                       实际消费的正文与 text/patches 单元
│  └─ messages                      玩家输入与可见记录组成的展示历史
├─ viewState
│  ├─ reading                       messageId / segmentIndex，或 null
│  └─ presentation                  已发布背景、立绘、BGM 的 State 快照
└─ retryBase                        null 或 input / snapshot / viewState
```

records 与 Agent Messages 独立；原始 response 已展示的内容不由 post_response 后的消息重建。
messages 引用的可见记录在 JSON 中保存为相同内容的副本，加载时校验一致性。
presentation 不保存卡片定义、资源 URL、播放进度或模型配置；读档时绑定当前授权卡片重新请求资源。
保存完整的已发布 State 是为了区分演出目标与当前变量；例如停止 BGM 后不应仅凭 State 恢复播放。
patches 仅作记录，历史回看和读档绝不重新 apply。

## 完整轮次

- exportSession() 只在已成功加载且输入轮结束后可用；模型返回但仍在阅读时也拒绝。
- snapshot() 保持“最后完整结果”的语义；view() 是临时预览，不能作为存档来源。
- 玩家输入和可见记录由 Session 统一维护，不依赖 React 组件的临时历史。
- 失败/取消恢复整轮基准后才能保存；不保存半轮正文或半轮 Agent 上下文。
- retryBase 一并保存；重启后的重试仍从该输入前的全部数据重跑，不重复追加上下文。
- sequence 不因重试、取消或恢复较早存档回退，消息 ID 不与保留历史冲突。
- 不保存 Reader、Promise、Worker、执行中的请求或 JS 栈。

## 双端存储

桌面：runtimeSession 与用于索引的 messages/gameState/viewState 同存 messages.json，使用现有原子替换和串行写入。
重试基准包含在同一数据包，不再读写该新格式会话的旧 retry-base.json，避免拆文件恢复出不一致结果。
完成后自动保存；显式“存档”复制完整数据至新 Session；写失败保留内存结果并显示错误。

Web：在现有 IndexedDB Session 事务中写入同一数据包，保留 saveTarget、revision 和 asNew 语义。
仅点击“存档”创建新档；不因模型完成、阅读回看或切换自动保存。
发生配额、冲突、来源删除或写入失败时不宣称保存成功，也不覆盖来源档案。

## 恢复与隔离

beginLoad() 先禁止输入/保存，取消旧轮次并清除旧预览；restoreHistory() 完整校验后替换数据。
卡片 ID/内容版本、Agent 集合必须匹配；校验初始化标记、State 值、消息 ID、展示记录及阅读位置。
除平台新建的空 Session 外，不接受缺少新数据包的旧卡存档；旧播放器也不能加载或覆盖新存档。
未知版本、损坏内容、缺失 Agent 或非法 State 都阻止继续输入和保存；保留原档，成功重新加载后才解除。

恢复不执行 init、规则、模型请求或 reader，只恢复视图并等待下一次输入。
已初始化 Agent 下一轮不重复 init；未调用 Agent 保持未初始化；TTL 只在下一次所属 Agent 调用时推进。
切换加载使用失效标记丢弃旧加载结果；取消后的 Worker 和模型回调不能写入目标会话。
普通玩家 V2 导入入口仍关闭；本契约用于已注入的内部运行时，完整导入/发布接入另行交付。

## 验证

真实 Worker 集成覆盖双 Agent 读写往返、后处理与展示差异、重启后继续/重试、读档不重复 patch、损坏档和隔离。
共享 Hook 验证自动/手动策略、加载失败禁写、阅读回看和保存错误；Rust 验证原子文件数据包及旧重试文件隔离。
浏览器 main-reader 用例覆盖实际 IndexedDB 存档、页面刷新、资源恢复、Agent 历史和下一轮上下文。
