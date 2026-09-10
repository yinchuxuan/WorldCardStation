# 游戏卡 Audio 设计文档

## 目标

Audio 定义游戏卡可使用的本地音频资源，并通过 `gameState` 控制当前播放内容。

第一版只设计 BGM：游戏卡声明 BGM key 到资源路径的映射，state schema 声明当前 BGM key，state action 修改目标 key，presentation controller 显式发布到播放器。

Audio 不进入 LLM prompt，不写入消息正文，也不由 display rules 处理。

## 设计原则

- `card.audio` 是资源表，`gameState.audio` 是当前会话状态。
- BGM 状态跟随 session 保存和加载；普通模式切换 session 时恢复播放，分段模式保持停止。
- 游戏卡规则只修改语义化 key，不直接散落文件路径。
- 音频资源只能来自当前游戏卡目录，禁止路径穿越。
- 播放器是 UI 运行时能力，不改变 messages、retry base 或 LLM 请求。

## 游戏卡配置

顶层 `audio` 使用按类型分组的资源表：

```json
{
  "audio": {
    "bgm": {
      "intro": "audio/intro.mp3",
      "ensemble": "audio/ensemble.mp3",
      "quiet": "audio/quiet.mp3"
    }
  }
}
```

路径必须是游戏卡目录内的相对路径，不允许以 `/`、`\` 开头，不允许 `..` 路径段，建议只允许 `.mp3`、`.ogg`、`.wav`、`.m4a`。

## State Schema

当前 BGM key 由 `gameState.audio.bgm` 表示：

```json
{
  "audio.bgm": {
    "type": "enum",
    "values": ["none", "intro", "ensemble", "quiet"],
    "default": "intro",
    "description": "当前播放的 BGM key"
  }
}
```

运行时派生 schema 时会在资源 key 前加入保留值 `none`，用于停止 BGM；默认值仍是资源表的第一个 key。显式 schema 也应遵守相同约定，`none` 不能用作资源 key。

运行时 state 保存为嵌套 JSON：

```json
{
  "audio": {
    "bgm": "intro"
  }
}
```

## 规则更新

游戏卡继续使用现有 state action：

```json
{
  "type": "state.set",
  "path": "audio.bgm",
  "value": "ensemble"
}
```

语义等价于：

```js
gameState.audio.bgm = "ensemble";
```

示例：进入固定剧情节点时切换 BGM。

```json
{
  "when": {
    "phase": "pre_send",
    "state": {
      "timeline.currentSlot": {
        "eq": "2007.10.21: 16:00 星期日 - 2007.10.21: 18:00 星期日"
      }
    }
  },
  "then": [
    {
      "type": "state.set",
      "path": "audio.bgm",
      "value": "ensemble"
    }
  ]
}
```

## 前端播放器

前端 presentation controller 提供 `updateBgm(card, state)`，播放器只响应显式更新请求，不监听 state 变化。

解析流程：

```txt
gameState.audio.bgm
  -> card.audio.bgm[bgmKey]
  -> getGameCardAudioUrl(relativePath)
  -> audio element load/play
```

播放时机：

- 用户提交消息后立即停止当前 BGM；仅键入输入不停止
- 供应商请求失败时恢复提交前的 BGM；用户主动取消时保持停止并保留部分回复
- LLM 只输出 thinking/reasoning 时保持停止
- 普通模式在正文第一个 token 开始流式输出时，按当前 `gameState.audio.bgm` 从头加载并播放
- 分段模式在 session 加载时恢复存档中的 BGM，但不在正文首 token 时自动继承播放
- 分段模式每次成功执行 `state.set audio.bgm` 时，在阅读游标越过该 patch 后发布播放请求；即使值未变化也会重新播放
- 普通模式下，`state_patch` 改变 `audio.bgm` 时，在流游标越过该 patch 后发布播放请求
- 普通模式的 `pre_send` / `after_response` 可通过 `audio.updateBgm` 手动发布播放请求；分段模式忽略该动作
- 平台所有 BGM 播放入口统一延迟 1 秒；停止或新的播放请求会取消尚未执行的延迟任务
- 每个播放请求都从头播放；同一 BGM 复用已解析的资源 URL

行为要求：

- active game card 为空时停止播放
- 当前 key 缺失或资源不存在时停止播放并记录错误
- 切换游戏卡时停止旧音频
- 切换 session 后按恢复出的 `gameState.audio.bgm` 播放；分段模式后续仍只响应显式 set
- 相同 key 不重复加载
- 音频循环播放默认开启

浏览器自动播放策略可能要求用户先交互。播放器应提供播放/暂停按钮，不能假设首次加载一定能自动播放。

## 用户设置

用户播放偏好属于应用 UI 设置，不属于剧情状态。`enabled`、`volume`、`muted` 不应写入游戏卡 `state.schema`，也不应随 session 剧情进度变化。

## 资源安全

渲染进程通过 game card platform contract 请求资源 URL：

```js
platform.resources.getAudioUrl(card.id, "audio/intro.mp3");
```

Tauri 受控资源协议校验当前 active game card、相对路径边界、realpath 和音频扩展名，并支持 byte Range。

返回值应是可供 `<audio>` 加载的安全 URL 或失败结果。

## 与 Display Rules 的关系

Audio 不通过 display rules 实现。

display rules 是 UI-only 文本变换，只作用于消息内容渲染；BGM 是本地运行时状态，来源应是 `gameState.audio.bgm`。这样不会污染历史消息，也不会把音频控制标签发给 LLM。

## 后续扩展

可以在相同结构下扩展其它音频类型：

```json
{
  "audio": {
    "bgm": {
      "intro": "audio/intro.mp3"
    },
    "sfx": {
      "door": "audio/sfx/door.mp3"
    },
    "ambient": {
      "rain": "audio/ambient/rain.ogg"
    }
  }
}
```

对应 state path 可以是 `audio.bgm` 和 `audio.ambient`。

短音效 `sfx` 是否进入 state 需要另行设计；它更像一次性事件，不一定适合保存为持久化状态。

## 测试范围

- game card schema 接受 `audio.bgm` 资源表并拒绝非法路径
- state schema enum 默认值能初始化 `gameState.audio.bgm`
- state action 能更新 `audio.bgm`
- 资源协议拒绝路径穿越和非音频扩展名
- 组件只在收到显式 update 请求时切换音频资源
- 切换游戏卡或 session 时停止或恢复正确 BGM
- 用户提交时停止播放；普通模式在正文开始时按最新 state 播放，分段模式只响应显式 `state.set audio.bgm`
