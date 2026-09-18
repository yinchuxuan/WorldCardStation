# State 机制参考

## 概述

State 是 AI Roleplay Game 的变量系统。平台提供变量定义、引用、修改、校验、持久化和调试能力；变量业务含义由游戏卡开发者决定。

原则：

- state 是事实源，messages 是叙事记录，prompt 是投影
- state 是聊天 session 的数据，不是游戏卡文件自身的数据
- 游戏卡不预设 `player`、`npc`、`quest` 等业务结构
- 游戏卡通过 schema 描述关键字段，但运行时 state 仍是普通 JSON
- state 处理必须发生在游戏卡 rules 之前
- 哪些变量呈现给 LLM 由游戏卡规则显式决定

## 游戏卡引用 Schema

游戏卡不内联完整 schema，而是引用同目录下的 schema 文件：

```json
{
  "stateSchema": "state/schema.json"
}
```

`stateSchema` 必须是相对路径，读取时限制在游戏卡目录内。

schema 文件支持直接 map：

```json
{
  "player.hp": {
    "type": "number",
    "default": 100,
    "min": 0,
    "max": 100,
    "onInvalid": "clamp",
    "llmRead": true,
    "llmWrite": true,
    "uiVisible": true
  },
  "route": {
    "type": "enum",
    "values": ["none", "alice", "bad_end"],
    "default": "none"
  }
}
```

也支持包装格式：

```json
{
  "schema": {
    "player.hp": {
      "type": "number",
      "default": 100
    }
  }
}
```

## Schema 字段

支持 `type`、`default`、`min`、`max`、`values`、`onInvalid`、`description`、`llmRead`、`llmWrite`、`uiVisible`、`userEditable`。`object` 还可使用 `properties`、`additionalProperties` 和 `maxProperties` 约束子属性。

`type` 支持 `string` / `number` / `boolean` / `object` / `array` / `enum`。`onInvalid` 支持 `error` 或 `clamp`。权限和展示字段不代表自动注入 prompt；`llmWrite` 用于约束模型 patch 的写入权限。

## 存储与路径

schema 使用点路径声明，运行时 state 保存为嵌套 JSON：

```json
{
  "player": {
    "hp": 80
  },
  "route": "none",
  "memory": {
    "old_man_warning": "老人警告玩家不要午夜进入钟楼"
  }
}
```

path 只支持点路径；数组元素不使用 `inventory[0]` 语法。

平台提供基础工具：`getStateValue`、`setStateValue`、`hasStateValue`、`deleteStateValue`、`ensureStateDefaults`。

## 初始化与默认值

新聊天：

```txt
state schema defaults -> session.gameState
```

继续聊天：

```txt
saved session.gameState -> ensureStateDefaults(schema, savedState)
```

`ensureStateDefaults` 只补缺失变量，不覆盖已有变量，不删除废弃变量。不自动执行复杂状态迁移。

## 执行顺序

加载会话：

```txt
read messages.json
  -> load active card and state schema
  -> ensureStateDefaults(schema, savedGameState)
  -> run init rules if messages is empty
  -> save messages + gameState if changed
```

用户发送：

```txt
append user message
  -> load state schema
  -> ensureStateDefaults(schema, gameState)
  -> decayTTL
  -> run pre_send rules
  -> send to LLM
  -> 按顺序解析正文与 state_patch，按流式/阅读游标提交 patch
  -> 完整流结束后执行 responseValidation；retry 则回滚并重新生成
  -> 接受 assistant message
  -> run after_stream rules
  -> 等待该响应的剩余 patch 全部提交
  -> run after_response rules
  -> save messages + gameState
```

普通模式在流游标越过完整 patch 时提交；分段模式正文开始前的 patch 先提交，后续 patch 随阅读游标提交。`after_stream` 不等待阅读完成，`after_response` 等待全部 patch 提交。各规则阶段执行前补齐 state 默认值，详见 [运行流程](../game_card_design.md#pipeline-执行流程)。

## 变量引用

Content 描述符支持读取 state：

```txt
{{state:player.hp}}
{{state:route}}
{{state_json:memory}}
```

规则：

- `{{state:path}}` 返回标量的字符串表示
- object / array 使用 `{{state_json:path}}`
- 缺失变量默认渲染为空字符串，并在 trace 中记录 warning

是否把变量呈现给 LLM 由规则显式决定。

## State 条件

`when.state` 支持基于变量触发规则：

```json
{
  "when": {
    "phase": "pre_send",
    "state": {
      "player.hp": { "lte": 20 },
      "flags.met_boss": true
    }
  }
}
```

支持 `eq`、`gt`、`gte`、`lt`、`lte`、`in`、`nin`、`contains`、`exists`、`regex`。多 key 默认 AND。

## State 修改
支持 `state.set`、`state.inc`、`state.delete`、`state.append`、`state.remove`、`state.roll`、`state.randomInt`、`state.advance`。`set` 写入 JSON 值；`inc` 给已有有限数值加上有限增量；`delete` 删除变量；`append` 追加数组；`remove` 移除深相等值；`roll` 掷骰；`randomInt` 写入闭区间整数；`advance` 将 enum schema 路径推进到下一个枚举值，末尾保持不变。它们不修改 messages；命中 schema 必须校验，`onInvalid: "clamp"` 对 number 生效。规则可写未命中 schema 的路径；模型 patch 另受 `llmWrite` 和动态命名空间约束。

## 持久化

state 随聊天历史保存：

```json
{
  "messages": [],
  "gameState": {}
}
```

兼容旧格式：

- 旧文件如果是数组，按 `messages` 读取，`gameState` 为空对象
- 新保存统一写对象格式
- messages 和 gameState 必须一起保存，避免剧情记录与变量状态不一致

## 模型 State Patch

动态变量用于开放运行时命名空间，例如 `memory.*`、`flags.*`、`npc.*.notes`。未被 schema 或 dynamic 覆盖的 path 默认不可由 LLM 创建或写入。

LLM 不直接写持久化 state，而是在回复中输出隐藏 `<state_patch>`。顶层 action 或 action 数组沿用原格式；不带 `type` 的顶层对象是批量 `state.set` 语法糖，例如 `{"visual.scene":"rooftop","audio.bgm":"sad"}`。响应管线把正文与 patch 作为一条有序时间线：普通模式在流游标越过完整 patch 时应用；分段模式先应用正文开始前的 patch，其余在阅读游标进入 patch 后的段落时应用，尾部 patch 在读完末段时应用。patch 按 schema 校验且只应用一次，回看不回滚。供应商请求失败时恢复请求开始前的 state，用户主动取消时保留已经应用的 patch；retry 始终使用发送前的独立 snapshot。全部 patch 提交后才执行 `after_response`。解析或校验失败不应中断聊天，只记录 warning 并跳过非法补丁。复杂状态逻辑继续使用 `exec`。

每次 state 读取失败、补丁失败或修改成功都应记录 trace，至少包含 phase、rule/action 位置、变更 diff、校验错误和 LLM patch reason。
