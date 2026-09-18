# 游戏卡 Visual Panel 参考

## 目标

Visual panel 是游戏卡背景图上的剧情阅读面板。它解决两个问题：

- 背景图需要更完整地展示，而不是被全屏 veil 压平。
- AI 回复可能很长，文本区域必须适合连续阅读。

面板布局和样式属于 UI runtime 能力，不修改 messages，不进入 LLM prompt，也不影响 display rules 的文本变换结果。

## 设计原则

- `visual.scene` 决定展示哪张背景或 CG。
- `visual.textPanel` 决定剧情阅读面板放在哪里。
- 游戏卡 CSS 只控制视觉面板外观，不控制全局 App UI。
- 平台提供可读的基础样式；游戏卡可以覆盖变量和受控 class。
- 文本面板位置使用枚举，不开放任意坐标，避免布局失控。
- 移动端由平台自动降级，游戏卡不需要单独写复杂布局。

## 运行时状态

在 state schema 中声明面板位置：

```json
{
  "visual.textPanel": {
    "type": "enum",
    "values": ["center", "left", "right"],
    "default": "center",
    "description": "剧情阅读面板位置",
    "llmRead": false,
    "llmWrite": false
  }
}
```

游戏卡规则通过 `state.set` 修改：

```json
{
  "type": "state.set",
  "path": "visual.textPanel",
  "value": "right"
}
```

`visual.textPanel` 应随 session 保存和恢复。LLM 不应直接读取或写入它，因为 LLM 通常不知道当前图片构图。

## 布局语义

| 值 | 桌面端行为 | 适用场景 |
|---|---|---|
| `center` | 居中窄阅读列 | 通用场景图、无明确主体 |
| `left` | 左侧阅读面板，右侧展示背景主体 | 主体在右侧 |
| `right` | 右侧阅读面板，左侧展示背景主体 | 主体在左侧 |
移动端保持平台默认居中阅读列，避免左右分栏挤压文字。

## 游戏卡配置

可以在 `visual` 中声明样式文件：

```json
{
  "visual": {
    "stylesheet": "visual.css",
    "background": {
      "haiku": "images/haiku.png",
      "music_room": "images/music_room.png"
    }
  }
}
```

路径限制与 display stylesheet 一致：只能是当前游戏卡目录内的安全相对 CSS 路径，不能使用绝对路径或 `..`。

背景资源表只接受资源路径，不支持内嵌 `textPanel` 默认值。面板位置由 state 控制，并在背景更新请求发布时应用；只写入 state 不代表立即更新展示。需要立即发布时调用 `visual.updateBackground`，见 [演出操作](./game_card_actions.md#presentation-actions)。

## CSS 作用域

平台在 App 根节点提供卡片作用域和位置 class，例如：

```html
<div class="app-container has-background-image game-card-theme-white-album-2">
```

游戏卡 CSS 必须写在该作用域或平台提供的 visual class 下：

```css
.game-card-theme-white-album-2 .game-card-visual-panel {
  --game-card-veil-bg: rgba(18, 24, 38, 0.66);
}
```

游戏卡 CSS 不应覆盖 sidebar、settings、modal、button 等全局组件。

## 基础 Class

平台提供这些稳定 class：

```txt
.game-card-visual-layout
.game-card-visual-panel
.game-card-visual-position-center
.game-card-visual-position-left
.game-card-visual-position-right
```

`game-card-visual-panel` 是阅读背景遮罩，不是正文容器。`game-card-visual-position-*` 按已发布的 `visual.textPanel` 切换。正文样式可使用 [UI runtime](./game_card_ui_runtime.md) 中的稳定样式接口。

## 推荐变量

游戏卡优先覆盖 CSS variables，而不是依赖内部 DOM：

```css
.game-card-theme-white-album-2 {
  --chat-reading-width: 640px;
  --game-card-veil-bg: rgba(18, 24, 38, 0.62);
  --game-card-text-color: #f8efe2;
  --game-card-highlight-color: #f4c982;
  --game-card-text-line-height: 1.9;
  --game-card-paragraph-line-height: 1.95;
  --game-card-panel-edge-gap: 40px;
  --game-card-panel-inner-gap: 40px;
}
```

平台样式读取这些变量；遮罩、正文和高亮颜色还支持 `-light` / `-dark` 后缀，主题专用值优先。阅读宽度主要用于居中布局，左右布局使用半屏及边距设置。

## 长文本策略

Visual panel 不要求把 AI 回复分页。默认行为是：

- 面板高度固定。
- 正文区域内部滚动。
- 历史消息仍按原 messages 保存。
- display rules 继续先处理文本，visual panel 只负责承载渲染结果。

卡片可通过 `display.segmentedReading` 开启分段阅读，支持跨回复回看及 session 阅读位置恢复；分隔符、阅读事件及 patch 提交边界见 [Display](./game_card_display.md#分段阅读)。

## 与 Display CSS 的关系

`display.css` 负责消息内容内部样式，例如角色名、状态块、选项样式。

`visual.css` 负责背景图阅读面板样式，例如面板透明度、边框、文字颜色、行距和面板宽度。

两者可以同时生效，但职责不同，避免一个 CSS 文件承担所有视觉规则。
