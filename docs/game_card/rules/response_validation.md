# 游戏卡 Response Validation 参考

<!-- devkit:omit:start -->
适用任务：修改回复校验、自动重试和警告语义。  
相关代码：`src/shared/game-card/validation/`。  
前置文档：[游戏卡（Game Card）参考](../overview.md)
<!-- devkit:omit:end -->

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

## Agent 配置

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
| `maxRetries` | integer | 结构上保留 0–5；新 Agent 不进行透明自动重试，实际重试由整轮主程序处理 |
| `rules` | array | 校验规则，按声明顺序执行并收集全部违规，最多 64 条 |

规则数组使用隐式 AND。单条规则可通过 onFailure 覆盖默认策略。存在任意 retry 违规时调用失败并回滚整轮；只有 warn 违规时接受回复。不会按 maxRetries 自动降级接受。

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

- `stateBefore`：结算普通 patch 前的 State，可能包含已经推进的阅读 patch。
- `stateAfter`：按输出顺序计算普通 patch 后的候选值；不模拟尚未推进的阅读 patch。
- `updates`：规范化后的更新记录，至少包含 path、operation、before、after。
- `passed`：所有启用且命中 `when` 的规则是否通过。
- `action`：通过时为 `null`；失败时为 `retry` 或 `warn`。
- `violations`：按规则顺序返回 id、message、onFailure 和实际匹配信息。

该函数是 shared core 中的纯校验逻辑，不负责回滚、发送请求、修改消息、运行规则或展示错误。

## Retry 与 Warning

新 Agent 调用在完整生成后先计算普通 state_patch 候选值，再进行回复校验。
state_patch_stream 属于阅读，不计入普通结算候选值或 updates。content 正则过滤两种标签；raw 保留完整输出。

`retry` 违规使本次调用失败，不执行 post_response；平台停止并保留现场，玩家重试时才恢复整轮 main.js 开始前的 State、所有 Agent 和演出。
玩家重试会重新执行整轮主程序，不复用失败调用的 pre_send，不透明重播已经提交阅读副作用的流。
首版不在 Agent 内按 maxRetries 自动补发请求；该配置不能改变整轮重试边界。

`warn` 接受响应，将违规信息写入本次 assistant 的 _meta.validationWarnings，
然后提交普通 patch、执行 post_response。warning 不发给模型。
原始 response 和实际可见记录不自动包含后处理元数据；可在 Agent 消息历史中检查 warning。
平台在 Agent 校验完成、发布回复时显示告警，不等待 present 阅读结束；同轮多 Agent 告警合并，每条回复只通知一次。
关闭提醒后，阅读推进不会再次弹出同一告警；实际开始下一轮或重试、切换 Session 时清除旧提醒，读档不重弹历史警告。

正则的内容长度限制及匹配语义保持不变；是否正确生成、演出仍需实际游玩验证。
