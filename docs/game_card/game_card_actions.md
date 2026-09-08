# 游戏卡操作与 Predicate

## insert

在指定位置插入一条新消息。

```json
{
  "type": "insert",
  "predicate": { "index": 0 },
  "anchor": "before",
  "role": "system",
  "content": "{{file:worldbook.rules}}",
  "ttl": -1
}
```

- `predicate`：可选。存在时定位锚点消息；省略时直接插入到 `messages` 末尾，支持空数组
- `anchor`：`before` 或 `after`，默认 `after`。仅在声明 `predicate` 时生效
- `role`：新消息的 role
- `content`：Content 描述符
- `ttl`：消息存活轮数，默认 `-1`
- `find`：可选。声明可被 `content` 引用的跨消息查询
- `when`：可选。命中后才执行该 action；省略 `phase` 时使用当前规则阶段

初始化空会话时可省略 `predicate`：

```json
{
  "type": "insert",
  "role": "system",
  "content": "开场规则",
  "_meta": { "source": "game_card_init", "visibility": "user_visible" }
}
```

## remove

删除匹配 predicate 的消息。运行时从后往前删除，避免索引偏移。

```json
{
  "type": "remove",
  "predicate": { "role": "system" }
}
```

## replace

修改匹配消息的 `content` 和/或 `ttl`。

```json
{
  "type": "replace",
  "predicate": { "role": "assistant" },
  "content": "{{original_content}}.regex_replace{pattern:'^```',with:''}",
  "ttl": 2
}
```

`replace` 支持可选 `find` 字段，供 `content` 引用当前消息数组中其他消息的 content。

## conditional action group

`then` 中可以嵌套条件动作组，用同一个 `when` 控制多条 action。组本身按声明位置执行；命中后，内部 `then` 继续按顺序执行，并且可以读取组内前序 action 修改后的 state。组内 `when.phase` 可省略，省略时继承当前规则阶段。

```json
{
  "when": { "state": { "route": "alice" } },
  "then": [
    { "type": "state.set", "path": "audio.bgm", "value": "normal" },
    { "type": "state.set", "path": "visual.scene", "value": "school" }
  ]
}
```

条件组可以嵌套，也支持 `find`。没有命中时整组跳过，不会执行内部 action。

## state actions

声明式修改游戏状态，不直接修改 messages；后续 action 和后续 rule 可立即读取新 state。

```json
{ "type": "state.set", "path": "route", "value": "alice" }
{ "type": "state.inc", "path": "player.hp", "value": -5 }
{ "type": "state.delete", "path": "temp.lastRoll" }
{ "type": "state.append", "path": "inventory", "value": { "id": "key" } }
{ "type": "state.remove", "path": "inventory", "value": { "id": "key" } }
{ "type": "state.roll", "path": "temp.roll", "dice": "1d6" }
{ "type": "state.randomInt", "path": "temp.pick", "min": 1, "max": 6 }
{ "type": "state.advance", "path": "timeline.currentSlot" }
```

`state.inc` 只接受有限数值增量且目标必须是已有的有限数值，结果继续经过 state schema 校验与 clamp。`state.roll` 支持 `d6` / `1d6` / `2d10` 形式，写入掷骰总和。`state.randomInt` 写入闭区间 `[min, max]` 的整数。`state.advance` 只支持 schema 中 `type: "enum"` 的路径，将当前值推进到 `values` 中的下一个值，已经在末尾时保持不变。

所有 action 都支持可选 `when`，条件语义与 content 分支一致。规则级或 action 级 `find` 写入的 `temp.find.*` 可以被后续 action 的 `when` 读取：

```json
{
  "type": "state.advance",
  "path": "timeline.currentSlot",
  "when": {
    "state": {
      "temp.find.assistantTime": { "gte": "2007.10.22: 16:00" }
    }
  }
}
```

## presentation actions

state 中的 `visual` / `audio` 只描述目标值。以下 action 会把当前阶段结束时的 state 显式发布到实际展示层：

```json
{ "type": "visual.updateBackground" }
{ "type": "visual.updatePortrait" }
{ "type": "audio.updateBgm" }
```

- `visual.updateBackground`：按 `state.visual.scene` 更新当前背景或 CG
- `visual.updatePortrait`：按 `state.visual.portraits` 更新完整人物立绘层
- `audio.updateBgm`：按 `state.audio.bgm` 更新，并在平台统一延迟后从头播放 BGM；同一 BGM 会复用资源 URL

平台默认在首个正文 token 到达时依次执行三项更新。卡片可以关闭默认行为，完全改由 `pre_send` / `after_response` 规则控制：

```json
{
  "presentation": {
    "autoUpdateOnFirstToken": false
  }
}
```

LLM 响应中的 `state_patch` 是另一条统一发布路径：普通模式在流游标越过 patch 时发布其中变化的展示字段，分段模式在阅读游标进入 patch 后的段落时发布。它不依赖首 token 自动更新开关。

## exec

兜底操作，用于声明式操作无法覆盖的游戏逻辑。`exec` 调用受限上下文中的 JavaScript，并以返回值更新消息、状态或副作用描述。

```json
{
  "type": "exec",
  "source": "state.player.hp = utils.clamp(state.player.hp - args.damage, 0, 100); return { state };",
  "args": { "damage": 5 }
}
```

`source` 与 `sourceFile` 必须二选一。长脚本通过 `sourceFile` 引用卡内文件：

```json
{
  "type": "exec",
  "sourceFile": "lib/worldbook/index.js",
  "args": { "worldbook": "worldbook" }
}
```

`args` 是可选的只读 JSON 对象，对 `source` 和 `sourceFile` 语义相同，通过 `ctx.args` 传入。平台不解释其字段，也不预设 `config`、`options` 或 `exec` 等分区；字段结构完全由脚本定义。

`sourceFile` 使用游戏卡目录相对路径，平台会在执行前读取内容；脚本不获得非受控文件 IO 权限。`lib/` 只是卡内共享代码的推荐目录，与普通脚本没有不同的加载、权限或生命周期语义。

`sourceFile` 可以在脚本顶部声明同卡内脚本依赖：

```js
include("./timelines/chapter-1.js");
```

平台会在执行前按声明顺序展开 `include(...)`，适合拆出共享 helper 或章节 resolver。

`sourceFile` 文件必须定义 `run(ctx)`，可以是同步或异步函数；这是普通 JS 文件，不能写裸 `return`：

```js
function run(ctx) {
  const { state, utils } = ctx;
  state.roll = utils.randomInt(1, 100);
  return { state };
}
```

上下文字段：

| 字段 | 说明 |
|---|---|
| `messages` | 当前消息数组 |
| `state` | 当前游戏状态 |
| `config` | 游戏卡配置字段，只读 |
| `event` | 当前触发事件 |
| `args` | 当前 action 的参数，只读；省略时为空对象 |
| `files` | `read(fileId)` 读取已声明文本；`readText(scopeId, relativePath)` 异步读取已授权目录内文本 |
| `utils` | `randomInt`、`roll`、`clamp`、`uuid` |

`readText` 的 scope 必须是顶层 `files` 中的目录描述符；路径相对该目录解析，并禁止绝对路径、反斜杠、空路径段和 `..`。返回值或异步完成值固定为 `{ messages?, state?, effects? }`。不提供 `require` / `import` / `process` / `window` / `document` / `fetch` / `ipcRenderer` / Node.js / native API。

桌面端每次 `exec` 默认总超时为 2000 毫秒，包含 Worker 启动、脚本执行和异步文件读取等待。超时仍会终止 Worker 并报错，不接受迟到的执行结果。该限制由平台管理，不是卡内 `args` 或 action 配置项。

推荐优先让 `exec` 只返回 `{ state }`，用于时间线、随机分支、audio/background 等派生状态；只有声明式 action 无法表达消息变换时，再返回 `{ messages, state }` 作为高级逃生口。

## Predicate

Predicate 的字段、组合和 `when.last.num` 语义见 [Predicate 文档](./game_card_predicates.md)。
