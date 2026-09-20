# 游戏卡 Predicate

<!-- devkit:omit:start -->
适用任务：修改条件匹配、逻辑组合和最近消息判断。  
相关代码：`src/shared/game-card/engine/predicate.js`。  
前置文档：[游戏卡（Game Card）参考](../overview.md)
<!-- devkit:omit:end -->

Predicate 是声明式消息匹配条件，用于 `insert` 定位锚点、`replace` / `remove` 定位目标，也用于 `when.last`、`when.any` 和 `when.all`。

## 字段

| 语法 | 匹配逻辑 |
|---|---|
| `{ "role": "user" }` | `msg.role === "user"` |
| `{ "content": { "regex": "^【" } }` | 正则匹配 |
| `{ "content": { "contains": "关键词" } }` | 字符串包含 |
| `{ "role": { "in": ["user", "assistant"] } }` | 集合成员 |
| `{ "role": { "nin": ["system"] } }` | 非集合成员 |
| `{ "index": 0 }` | `i === 0` |
| `{ "index": "last" }` | `i === len - 1` |
| `{ "role": "assistant", "occurrence": "not_last" }` | 匹配除最后一条之外的该角色消息 |
| `{ "all": true }` | 所有消息 |

多个字段使用隐式 AND。`{ "role": "user", "_meta.source": "game_card" }` 表示 role 为 user 且 `_meta.source` 为 game_card。

`occurrence` 必须和字符串形式的 `role` 一起使用，用于相对该角色的最后一条消息进行匹配。

## 逻辑组合

```json
{ "or": [{ "role": "user" }, { "role": "assistant" }] }
{ "not": { "role": "system" } }
```

`when.state` 的 `gt`、`gte`、`lt`、`lte` 支持 number，也支持同类型 string。字符串按字典序比较，只适合固定宽度、可排序格式，例如 `2007.10.22: 16:00`。

## `when.last.num`

`when.last` 可额外声明 `num`，表示在最近 N 条消息中查找任意匹配项：

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

`num` 只在 `when.last` 中有效，不属于 action `predicate` 或 `when.any/all` 的通用 Predicate 字段。
