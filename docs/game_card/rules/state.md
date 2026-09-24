# State 机制参考

<!-- devkit:omit:start -->
适用任务：修改变量默认值、约束、state_patch 和提交时序。  
相关代码：`src/shared/game-card/state/`、`src/renderer/gameCard/statePatchPipeline.js`。  
前置文档：[游戏卡（Game Card）参考](../overview.md)
<!-- devkit:omit:end -->

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
{"stateSchema":"state/schema.json"}
```

`stateSchema` 必须是相对路径，读取时限制在游戏卡目录内。

schema 文件支持直接 map：

```json
{"player.hp":{"type":"number","default":100,"min":0,"max":100,"onInvalid":"clamp","llmRead":true,"llmWrite":true,"uiVisible":true},"route":{"type":"enum","values":["none","alice","bad_end"],"default":"none"}}
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

载入时恢复共享 State 和全部 Agent 数据，不执行 init；新会话从 schema 默认值开始。
每次 Agent 调用执行 init（首次）、TTL 衰减、pre_send、模型生成、校验、普通 patch、post_response。
main.js 通过 ctx.state.get/has/set/delete 读写共享变量，调用期间不并发修改 State。

阅读提交独立于模型完成：分段 reader 推进时提交 state_patch_stream，非分段仅过滤标签。
失败或取消恢复整轮基准；不会保存半轮变量，详见 [主程序与 reader](../runtime.md)。

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

State 与全部 Agent 上下文、实际展示记录一起保存在带版本的 runtimeSession 中。
桌面自动保存完整轮次；Web 显式创建新存档。旧卡存档不能作为新协议 Session 恢复。
不保存 Promise、模型请求、reader 或 JS 调用栈，不提供游戏卡存档迁移。

## 模型 State Patch

LLM 只能写入 schema 已声明（或声明对象的允许子路径）且 llmWrite 未禁止的路径。
顶层 action/action 数组沿用 State action 格式；不带 type 的对象表示批量 state.set。
例如 `{"player.hp":80}`。复杂逻辑仍由主程序或规则 exec 完成。

- `<state_patch>…</state_patch>`：完整响应通过校验后、post_response 前提交一次。
- `<state_patch_stream>…</state_patch_stream>`：仅由分段 reader 在下一段显示前提交。
- 两种标签均从玩家正文过滤；非分段和隐藏调用不提交阅读 patch。
- 非法或无权限 patch 使整轮失败并回滚，不静默跳过。
- 历史回看和读档不重复提交；两种通道不保证跨通道时序，避免竞争写同一路径。

具体完成边界与例子见 [清单、主程序与 reader](../runtime.md)。
