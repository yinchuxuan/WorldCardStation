# 游戏卡 Visual 参考

## 目标

Visual 定义游戏卡可使用的本地视觉资源，并通过 `gameState` 控制当前展示内容。

游戏卡分别声明普通背景、剧情 CG，以及人物、表情到立绘路径的映射。运行时自动派生隐藏 state schema，`visual.scene` 统一选择背景或 CG，`visual.portraits` 保存最多四名可见人物。平台只在普通背景上自动排列透明立绘；CG 显示期间屏蔽立绘层，但保留人物 State。

Visual 不进入 LLM prompt，不写入消息正文，也不由 display rules 处理。

## 设计原则

- `card.visual` 是资源表，`gameState.visual` 是当前会话状态。
- 背景状态跟随 session 保存和加载，切换 session 时恢复。
- 游戏卡规则只修改语义化 key，不直接散落文件路径。
- 图片资源只能来自当前游戏卡目录，禁止路径穿越。
- 视觉背景是 UI 运行时能力，不改变 messages、retry base 或 LLM 请求。
- 游戏卡背景优先级高于用户设置背景；当前游戏卡没有背景时回落到用户设置背景。

## 游戏卡配置

顶层 `visual` 使用按类型分组的资源表：

```json
{
  "visual": {
    "background": {
      "school": "images/school.jpg",
      "music_room": "images/music_room.webp"
    },
    "cg": {
      "confession": "images/confession.png"
    },
    "portrait": {
      "touma": {
        "normal": "images/portraits/touma-normal.png",
        "sad": "images/portraits/touma-sad.png"
      },
      "setsuna": {
        "normal": "images/portraits/setsuna-normal.webp"
      }
    }
  }
}
```

路径必须是游戏卡目录内的相对路径，不允许以 `/`、`\` 开头，不允许 `..` 路径段，建议只允许 `.png`、`.jpg`、`.jpeg`、`.webp`、`.gif`、`.bmp`。

## State Schema

当前基础画面 key 由 `gameState.visual.scene` 表示。运行时应合并 `card.visual.background` 与 `card.visual.cg` 自动派生 schema；两张资源表的 key 不得重复：

```json
{
  "visual.scene": {
    "type": "enum",
    "values": ["school", "music_room", "confession"],
    "default": "school",
    "description": "当前展示的背景或剧情 CG key",
    "llmRead": false,
    "llmWrite": false
  }
}
```

schema 的 `values` 是 background 与 cg 的 key 合集，`default` 优先使用 background 的第一个 key，没有 background 时使用 cg 的第一个 key。

声明 `card.visual.portrait` 后，运行时还会派生 `visual.portraits` 对象 schema。对象 key 是人物，value 是该人物的表情，最多四项；人物和表情都必须来自资源表，默认空对象表示无人显示。

运行时 state 保存为嵌套 JSON：

```json
{
  "visual": {
    "scene": "school",
    "portraits": {
      "touma": "sad",
      "setsuna": "normal"
    }
  }
}
```

## 规则更新

游戏卡继续使用现有 state action：

```json
{
  "type": "state.set",
  "path": "visual.scene",
  "value": "music_room"
}
```

语义等价于：

```js
gameState.visual.scene = "music_room";
```

## 前端渲染

前端 presentation controller 提供 `updateBackground(card, state)` 和 `updatePortrait(card, state)`。state 更新只改变目标值，不直接改变实际画面。

解析流程：

```txt
gameState.visual.scene
  -> card.visual.background[sceneKey] 或 card.visual.cg[sceneKey]
  -> getGameCardImageUrl(relativePath)
  -> App 背景图
```

行为要求：

- active game card 为空时使用用户设置背景。
- 当前 key 缺失或资源不存在时使用用户设置背景并记录错误。
- 切换游戏卡时清理旧游戏卡背景。
- 切换 session 后按恢复出的 `gameState.visual.scene` 展示背景或 CG。
- 相同 key 不重复解析资源 URL。
- 平台默认在首个正文 token 到达时调用两个 update 函数；首 token 前失败或取消不会自动切换画面。
- `state_patch` 改变视觉字段时，在普通模式的流游标或分段模式的阅读游标越过该 patch 后立即发布变化。
- 供应商请求失败时重新发布请求开始前的背景和立绘；用户主动取消时保留当前画面。
- scene 属于 `background` 时允许叠加立绘；属于 `cg` 时立即清空当前及退场中的立绘渲染层，但不修改 `gameState.visual.portraits`。
- scene 变化必须同时刷新基础画面与立绘层，使进入 CG 时立绘消失、返回 background 时保留的立绘重新显示。
- `presentation.autoUpdateOnFirstToken: false` 可关闭默认调用；卡片可在 `pre_send` / `after_response` 使用 `visual.updateBackground`、`visual.updatePortrait` 手动发布。
- update 每次读取传入 state 的目标 key；异步资源解析只允许最新的通道请求生效，不维护待发布 visual snapshot。
- 游戏卡背景只覆盖背景图片，不覆盖用户设置的遮罩透明度；透明度仍使用现有 `backgroundOpacity`。

## 资源安全

渲染进程通过 game card platform contract 请求资源 URL：

```js
platform.resources.getImageUrl(card.id, "images/school.jpg");
```

Tauri 受控资源协议校验当前 active game card、相对路径边界、realpath 和图片扩展名。

返回值应是可供 CSS `background-image` 加载的安全 URL 或失败结果。

## 与 Display Rules 的关系

Visual 不通过 display rules 实现。

display rules 是 UI-only 文本变换，只作用于消息内容渲染；基础画面是本地运行时状态，来源应是 `gameState.visual.scene`。这样不会污染历史消息，也不会把视觉控制标签发给 LLM。

## 与 Audio 的关系

Visual 与 Audio 使用相同资源表模式：

```txt
card.audio.bgm + gameState.audio.bgm
card.visual.{background,cg} + gameState.visual.scene
```

两者都应自动派生隐藏 state schema，避免游戏卡作者在 `state.schema` 中重复声明运行时资源 key。

## 多人物立绘

State 只描述当前可见人物和表情，不包含位置或尺寸。每次写入替换完整人物集合，省略的人物退场：

```json
{
  "visual.portraits": {
    "touma": "sad",
    "setsuna": "normal"
  }
}
```

平台按资源表中的人物声明顺序稳定排列角色：一人居中、二人左右、三人左中右、四人四列，并随人数增加自动缩小、始终底部对齐。游戏卡 CSS 可覆盖构图；LLM 无需理解位置语义。人物槽位以人物 key 保持稳定：新人物登场时在背景动画后淡入，同一人物仅切换表情时重建图片并播放一次无延迟的短淡入。旧 `visual.portrait=人物_表情` 会在加载 State 时迁移为新对象。
