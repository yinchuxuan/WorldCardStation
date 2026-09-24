# 游戏卡运行模型

<!-- devkit:omit:start -->
适用任务：修改消息模型、规则阶段和执行顺序。
相关代码：`src/shared/game-card/runtime/`、`src/renderer/gameCard/mainSession.js`。
前置文档：无。
<!-- devkit:omit:end -->

## 组成

游戏卡由 `card.json`、`main.js`、Agent 定义、提示词与演出资源组成。
当前游戏卡协议为 `formatVersion: "2"`；卡片的 `version` 是独立的内容版本。

Agent = 独立 Messages + Rules + 模型配置引用。多个 Agent 共享当前 Session 的 State。
主程序决定调用顺序、游戏逻辑及展示内容；变量变化本身不会自动触发 Agent。

- [清单、主程序与 reader](./runtime.md)：入口、API、流式输出、保存恢复与迁移。
- [Schema](./schema.md)：结构校验和跨文件约束。
- [操作](./rules/actions.md)、[Predicate](./rules/predicates.md)、[Content](./rules/content.md)：规则语法。

## Messages 与可见记录

每个 Agent 的消息格式为：

```js
{
  id: "平台分配的稳定 ID",
  role: "user", // user | assistant | system
  content: "正文",
  thinking: "可选思考内容",
  ttl: -1,
  _meta: { source: "可选来源", visibility: "llm_only" }
}
```

规则操作当前 Agent 的 Messages；`find.agentId` 可读取另一 Agent 的快照。
主程序通过 `ctx.agents.messages(id)` 获取只读快照，不能直接修改数组或其中的对象。
消息 ID 由平台分配，规则不能伪造或重复 ID。

玩家输入不自动写入所有 Agent。主程序接收输入，将其写入变量后，由各 Agent 的规则选择是否注入上下文。

Agent 消息不自动显示给玩家，`_meta.visibility` 也不能替代 `ctx.present(reader)`。
实际展示内容单独保存在可见记录中；标题栏的 msg 历史页面可切换查看每个 Agent 的真实 Messages。
因此原始流式演出可以与 `post_response` 修改后的历史不同。

## 规则与阶段

规则在 Agent 文件的 `rules` 数组中按顺序执行。前序规则和 action 的输出立即成为后续条件、find、action 的输入。

```json
{
  "model": "default",
  "rules": [
    {"when":{"phase":"init"},"then":[{"type":"insert","role":"system","content":"你是旁白。"}]},
    {"when":{"phase":"pre_send"},"then":[{"type":"insert","role":"user","content":"{{state:turn.input}}"}]}
  ]
}
```

| 阶段 | 时机 |
| --- | --- |
| `init` | 新 Session 启动时按 Agent 声明顺序执行一次，全部完成后才执行 onStart |
| `pre_send` | 该 Agent 每次请求前，准备 Messages 与 State |
| `post_response` | 完整响应通过校验、普通 patch 提交后，处理回复 |

新 Session 执行所有 Agent 的 init 及可选 onStart；读档不重复执行。即使规则删除了所有消息，已经初始化的 Agent 也不会再次 init。
旧的 `after_stream` / `after_response` 不属于新 Agent 阶段。

`when.phase` 必填；length、last、any、all、state 条件可组合。嵌套 action/content 的 when 可省略 phase，继承当前阶段。
`last.num` 在最近 N 条消息中测试是否有匹配项；其余条件和消息筛选规则见 Predicate/Content。

## TTL

init 不推进 TTL；每次调用在 pre_send 之前仅对所属 Agent 执行 TTL 衰减。
正数减 1，减至 0 的消息移除；未声明或 -1 表示永久。
pre_send 中新插入 ttl=1 的消息参与本次请求，下次调用前移除；其他 Agent 的 TTL 不受影响。

## Pipeline 执行流程

```text
玩家输入 → onInput(ctx, input)
  → 主程序写 State，选择 Agent
  → TTL 衰减 → pre_send
  → 模型请求与原始 response 流
  → 校验完整响应 → 提交普通 state_patch → post_response → call.done()
  → 主程序继续调用，或结束本轮
```

阅读与模型完成是两个边界：reader 可以在模型返回时消费原始流，也可以等待 done 后消费最终消息。
分段 reader 推进时提交 state_patch_stream；普通 state_patch 仅由 Agent 提交，reader 不重复执行。

失败、取消或非法 patch 都会结束本轮并恢复整轮基准，包括所有 Agent、State 和演出。
只有完整轮次可保存；重试重新执行整轮 onInput，不恢复脚本调用栈。

模型传输只取 role/content 等协议字段，不发送 id、ttl 或 _meta；OpenAI 保留 system 消息，Anthropic 提取为顶层 system。
模型配置和密钥属于平台，卡片只引用配置名称，当前双端均支持 `default`。
