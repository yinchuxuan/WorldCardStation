# 游戏卡 Response Validation 参考

## 目标

`responseValidation` 允许游戏卡声明 LLM 完整回复必须满足的契约。支持正文正则检查和 state 更新检查，失败策略仅支持 `retry` 与 `warn`。

校验只在一次成功的 stream 完整结束后执行。普通模式和分段阅读模式使用相同的完整回复进行校验，不校验单个 token 或单个段落；请求失败和用户中止生成不执行校验。

## 执行顺序

```txt
pre_send
  -> 保存本次响应开始前的 state 与演出快照
  -> 流式接收正文和 state_patch
  -> stream 完整结束
  -> validateResponse
     -> retry：恢复快照并重新生成
     -> warn：接受回复并记录 warning
     -> 通过：继续
  -> after_stream
  -> state_patch 到达提交边界
  -> after_response
  -> 保存
```

`validateResponse` 必须早于 `after_stream`，避免 summary 等规则处理随后被 retry 丢弃的回复。分段模式仍按阅读游标提交真实 state；校验器只使用完整响应构造的更新记录和候选最终值，不提前提交尚未读到的 patch。

## 顶层配置

```json
{
  "responseValidation": {
    "onFailure": "retry",
    "maxRetries": 2,
    "rules": []
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `onFailure` | `retry \| warn` | 默认失败策略，未声明时为 `retry` |
| `maxRetries` | integer | 自动重试次数，不包含第一次生成；默认 2，范围 0–5；仅用于 `retry` |
| `rules` | array | 校验规则，按声明顺序执行并收集全部违规，最多 64 条 |

规则数组使用隐式 AND。单条规则可通过 `onFailure` 覆盖默认策略。存在任意 `retry` 违规时重试；只有 `warn` 违规时接受回复。达到 `maxRetries` 后仍失败，最后一次回复按 `warn` 接受，不引入第三种 reject 语义。

## 通用规则字段

```json
{
  "id": "rule-id",
  "enabled": true,
  "when": { "state": {} },
  "type": "content.regex",
  "onFailure": "retry",
  "message": "供模型修正和调试使用的说明"
}
```

| 字段 | 必填 | 说明 |
|---|---:|---|
| `id` | 是 | 卡内唯一且稳定的规则标识 |
| `type` | 是 | `content.regex` 或 `state.update` |
| `enabled` | 否 | 默认 `true`；`false` 时跳过 |
| `when.state` | 否 | 使用本轮 `pre_send` 完成后的 state predicate |
| `onFailure` | 否 | 覆盖顶层失败策略 |
| `message` | 是 | 可执行的失败原因，不应只复述规则 id |

`when.state` 沿用现有 `eq`、`gt`、`gte`、`lt`、`lte`、`in`、`nin`、`contains`、`exists` 和 `regex`。它只读取响应开始前的 state，不受本轮 patch 影响。

## 正文正则规则

```json
{
  "id": "choices-block",
  "type": "content.regex",
  "source": "content",
  "pattern": "<choices>[\\s\\S]*?<\\/choices>",
  "flags": "u",
  "matches": { "eq": 1 },
  "message": "回复必须且只能包含一个 choices 块"
}
```

| 字段 | 必填 | 说明 |
|---|---:|---|
| `source` | 否 | `content` 或 `raw`，默认 `content` |
| `pattern` | 是 | JavaScript 正则源码，不使用 `/.../` 包裹，最长 2048 字符 |
| `flags` | 否 | 只允许 `i`、`m`、`s`、`u` |
| `matches` | 是 | 匹配次数，支持 `eq`、`gt`、`gte`、`lt`、`lte` |

`content` 是移除完整 `<state_patch>` 后的 assistant 正文；`raw` 是包含协议块的原始 assistant 输出。两者都不包含 thinking，也不经过 display rules。平台自行统计全部匹配，因此不开放 `g`。

必须出现、禁止出现和限制次数分别写为：

```json
{ "matches": { "gte": 1 } }
{ "matches": { "eq": 0 } }
{ "matches": { "gte": 1, "lte": 4 } }
```

## State 更新规则

```json
{
  "id": "current-time-update",
  "type": "state.update",
  "path": "timeline.currentTime",
  "updates": { "eq": 1 },
  "operations": ["state.set"],
  "value": { "regex": "^2007\\." },
  "message": "每轮必须显式设置一次当前时间"
}
```

| 字段 | 必填 | 说明 |
|---|---:|---|
| `path` | 是 | 精确的 state 点路径；不支持通配符 |
| `updates` | 否 | 本轮显式更新次数，使用次数比较器 |
| `operations` | 否 | 允许的 state action 类型；每次更新都必须命中 |
| `value` | 否 | 全部更新完成后的候选最终值 matcher |
| `delta` | 否 | 候选最终值减去响应开始前值的数值 matcher |

至少声明 `updates`、`operations`、`value`、`delta` 中的一项。`updates` 统计成功解析并通过 state schema 的显式 action；设置为原值仍算一次。批量对象语法糖按规范化后的 `state.set` 统计。

`value` 沿用 state matcher。`delta` 只支持有限数字和 `eq`、`gt`、`gte`、`lt`、`lte`。如果规则只有 `value` 或 `delta` 而模型没有更新该路径，则该规则跳过；需要强制更新时必须同时声明 `updates.gte` 或 `updates.eq`。

常见写法：

```json
{
  "id": "route-readonly",
  "type": "state.update",
  "path": "route",
  "updates": { "eq": 0 },
  "message": "模型不能直接修改路线变量"
}
```

```json
{
  "id": "affection-change-limit",
  "type": "state.update",
  "path": "setsuna.affection",
  "updates": { "lte": 1 },
  "operations": ["state.inc"],
  "delta": { "gte": -2, "lte": 2 },
  "message": "雪菜好感度单轮变化不能超过 2"
}
```

类型、枚举、绝对范围和 `llmWrite` 权限仍由 state schema 负责；response validation 只描述单轮回复契约，不替代 state schema。

## `validateResponse` 契约

```js
validateResponse({ config, rawContent, stateBefore, stateAfter, updates })
// -> { passed, action, violations }
```

- `stateBefore`：`pre_send` 完成后的快照。
- `stateAfter`：按输出顺序计算全部合法 patch 后的校验候选值，不代表分段模式已经提交。
- `updates`：规范化后的更新记录，至少包含 path、operation、before、after。
- `passed`：所有启用且命中 `when` 的规则是否通过。
- `action`：通过时为 `null`；失败时为 `retry` 或 `warn`。
- `violations`：按规则顺序返回 id、message、onFailure 和实际匹配信息。

该函数是 shared core 中的纯校验逻辑，不负责回滚、发送请求、修改消息、运行规则或展示错误。

## Retry 与 Warning

`retry` 会丢弃无效 assistant，恢复本轮响应开始前的 state、背景、立绘和 BGM，不执行该响应的 `after_stream` / `after_response`。下一次请求复用已经完成的 `pre_send` 结果，并临时追加全部违规说明；说明不保存到 messages，也不进入 summary。

`warn` 的固定语义是“接受回复并附加非阻塞提醒”。它与通过校验的回复执行完全相同的后续流程：保存 assistant，执行 `after_stream`，按普通或分段模式原有时机提交 state patch，发布背景、立绘和 BGM，全部 patch 提交后执行 `after_response`，最后正常持久化。warning 不得阻塞阅读、选项或下一轮输入。

```txt
validateResponse
  -> warn
  -> after_stream
  -> state_patch 到达提交边界
  -> after_response
  -> 保存 assistant、state 和 warning
```

平台应将 warning 作为 assistant 的内部元数据持久化，其中包含规则 id、message 和实际匹配信息；它不发送给 LLM、不进入 summary，也不受游戏卡 UI 样式控制。提醒应使用平台级非阻塞入口，不弹出必须确认的模态框。

玩家在 warning 后仍可手动 retry。此时平台使用该轮原有的生成前 retry snapshot，撤销 assistant、summary、state 和视听演出后重新生成；玩家继续阅读、选择选项或发送下一条消息，则视为接受该 warning。达到 `maxRetries` 后降级得到的 warning 遵循完全相同的接受与提交语义。

自动重试期间保持 `isLoading`。用户停止生成会终止整个重试链。正则在游戏卡加载边界验证 flags 和语法；待检查文本上限为 131072 字符，超限视为规则失败，避免正则阻塞渲染进程。
