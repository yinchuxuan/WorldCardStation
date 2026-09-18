# 游戏卡（Game Card）参考

## 概述

游戏卡是纯 JSON 配置文件，定义 AI roleplay 游戏的运行时规则。核心职责：在消息发送到 LLM 前后，对 `messages` 数组进行声明式变换。

> 游戏卡 != 角色卡。角色卡定义"角色是谁"；游戏卡定义"游戏怎么玩"。一张游戏卡可以引用多张角色卡（NPC），但游戏卡本身定义的是游戏逻辑。

详细参考：

- [操作](./game_card/game_card_actions.md)
- [Predicate](./game_card/game_card_predicates.md)
- [Content 描述符与 find](./game_card/game_card_content.md)

## 消息格式（内部）

```js
{
  role: "user" | "assistant" | "system",
  content: string,
  _thinking?: string,    // UI 内部用
  thinking?: string,     // 持久化
  _meta?: {
    source?: string,     // 消息来源标记
    visibility?: "llm_only" | "user_visible" | "debug_only"
  },
  ttl?: number           // 消息剩余存活轮数，-1 表示永久
}
```

模型配置或请求失败属于平台临时 UI 状态，不写入 `messages`，也不进入游戏卡规则或 LLM 上下文。

`_meta` 和 `ttl` 不会发送给 LLM。

## 消息可见性

普通对话流默认只渲染 `role: "user"` 和 `role: "assistant"` 的消息，`role: "system"` 默认隐藏。

`_meta.visibility` 可覆盖或收紧 UI 可见性：

| visibility | 普通对话流 | 用途 |
|---|---|---|
| `llm_only` | 隐藏 | 系统规则、世界书、临时提示 |
| `user_visible` | 显示 | 摘要、状态、任务日志等需要玩家看到的游戏卡消息 |
| `debug_only` | 隐藏 | 调试信息 |

`user_visible` 可以让 `system` 消息显示在普通对话流中；未声明 visibility 的 `system` 消息仍然隐藏。

## 消息 TTL

消息可通过 `ttl` 字段控制自动过期。每次 `pre_send` 规则执行前，上一轮遗留且 `ttl > 0` 的消息 `ttl -= 1`，减到 0 时从数组中移除。

| ttl 值 | 含义 |
|---|---|
| `-1` | 永久存在（不衰减） |
| `1` | 下一轮 `pre_send` 前移除 |
| `5` | 5 轮对话后移除 |
| 无 `ttl` 字段 | 同 `-1`，永久存在 |

`insert` 默认 `ttl: -1`。`replace` 可只修改 `ttl` 而不修改 `content`。

## 协议适配

规则输出的消息数组可能包含 `role: "system"`。在调用 API 前需要协议适配：

```txt
messages (含 system) -> adaptToProtocol -> API 请求体
```

- OpenAI：原生支持 `role: "system"`，直接透传
- Anthropic：提取所有 `role: "system"` 消息，拼接为顶层 `system` 字段

## 规则结构

游戏卡包含一组平铺的规则条目，每条规则由 `when`（触发条件）和 `then`（执行操作）组成：

```json
{
  "rules": [
    { "when": { "phase": "pre_send" }, "then": [ "...操作列表..." ] }
  ]
}
```

规则按声明顺序组成流水线。运行时逐条规则判断 `when`，匹配后立即执行该规则的 `then`；规则输出的 `messages` 和 `state` 会作为下一条规则的输入。

这意味着前序规则的 `insert` / `remove` / `replace` / `exec` 会影响后续规则的触发条件。比如两条连续规则都写 `length: { "eq": 1 }`，如果第一条规则插入了消息使总数变为 2，第二条规则就不会再匹配。

同一条规则内的 `then` 操作也按顺序执行，前一个操作输出会作为后一个操作输入。因此后续操作的 `find` 可以查到前序操作插入或修改后的消息；单个操作不能 `find` 到自己尚未插入的消息。

## 初始化阶段

`init` 阶段在聊天历史加载后、用户发送消息前执行，用于向空会话写入初始消息。运行时只会对空的已加载历史执行 `init`，初始消息保存后再次加载会因为历史非空而跳过，避免重复插入。

```json
{
  "when": { "phase": "init", "length": 0 },
  "then": [
    {
      "type": "insert",
      "role": "system",
      "content": "{{file:intro}}",
      "_meta": { "source": "game_card_init", "visibility": "user_visible" }
    }
  ]
}
```

## When（触发条件）

`when` 的本质是判断当前流水线位置的消息数组是否满足触发条件。

```json
{ "when": { "phase": "init", "length": 0 } }
{ "when": { "phase": "pre_send" } }
{ "when": { "phase": "pre_send", "length": 1 } }
{ "when": { "phase": "pre_send", "length": { "lte": 1 } } }
{ "when": { "phase": "after_stream", "last": { "role": "assistant" } } }
{ "when": { "phase": "after_response", "last": { "role": "assistant" } } }
{ "when": { "phase": "pre_send", "last": { "num": 3, "role": "user", "content": { "contains": "陌生感" } } } }
{ "when": { "phase": "pre_send", "any": { "content": { "regex": "start_quest" } } } }
```

| 字段 | 类型 | 含义 |
|---|---|---|
| `phase` | string | 必填。`init`、`pre_send`、`after_stream` 或 `after_response` |
| `length` | number 或比较对象 | 消息总数。支持 `gt`/`gte`/`lt`/`lte`/`eq` |
| `last` | predicate | 最后一条消息是否匹配 |
| `any` | predicate | 是否有任意消息匹配 |
| `all` | predicate | 是否所有消息都匹配 |

不加 `length`/`last`/`any`/`all` 表示该阶段每次都执行。

`last` 也支持 `num`，用于在最近 N 条消息中查找任意匹配项：

```json
{
  "when": {
    "phase": "pre_send",
    "last": {
      "num": 3,
      "role": { "in": ["user", "assistant"] },
      "content": { "contains": "陌生感" }
    }
  }
}
```

语义等价于 `messages.slice(-3).some(msg => predicate(msg))`。`num` 必须为正整数；除 `num` 外的字段仍按 Predicate 的隐式 AND 规则匹配。

## Pipeline 执行流程

```txt
聊天历史加载
  -> 若 messages 为空，执行 init 规则并保存

用户发送
  -> decayTTL
  -> 按顺序逐条判断 pre_send 规则的 when
  -> 匹配则立即执行该规则的 then
  -> adaptToProtocol
  -> sendChatRequest
  -> 按响应顺序增量解析正文与 state_patch
  -> 普通模式：流游标越过完整 state_patch 时立即校验并写入 state
  -> 分段模式：正文开始前的 patch 先提交，其余随阅读游标进入后续段落提交
  -> state 中变化的背景、立绘和 BGM 同步发布到展示层
  -> 完整响应流结束后执行 responseValidation；retry 时回滚并重生成，warn/通过时继续
  -> 完整响应流结束后，执行 after_stream 规则
  -> 响应到达提交边界后，按顺序逐条判断 after_response 规则的 when
  -> 匹配则立即执行该规则的 then
  -> 显示 + 保存
```

响应被视为正文和 `<state_patch>` 组成的有序时间线。`after_stream` 在完整响应流结束后立即执行，不等待分段阅读推进；适合处理只依赖完整 assistant 文本的逻辑。普通模式的提交边界是流式接收位置；分段模式先提交正文开始前的 patch，其余的提交边界是用户当前读到的段落，尾部 patch 在读完末段时提交。已越过的 patch 只应用一次，回看不会回滚 state。供应商请求失败时丢弃本轮响应，并恢复请求开始前的 messages、state 和背景、立绘、BGM；用户主动取消则保留部分 assistant 和已经应用的值。两种情况都不修改 retry 使用的发送前 snapshot。`after_response` 始终在该响应的 patch 全部提交后执行。

## 完整游戏卡结构

```json
{
  "version": "1.0",
  "id": "uuid",
  "name": "游戏名称",
  "description": "描述",
  "author": "作者",
  "rules": [
    {
      "when": { "phase": "pre_send", "length": 1 },
      "then": [
        {
          "type": "insert",
          "predicate": { "index": 0 },
          "anchor": "before",
          "role": "system",
          "content": "{{file:worldbook.rules}}"
        }
      ]
    }
  ]
}
```
