# 游戏卡 Display Rules

<!-- devkit:omit:start -->
适用任务：修改显示变换和分段阅读。  
相关代码：`src/renderer/gameCard/displayRules.js`、`src/renderer/components/`。  
前置文档：[游戏卡（Game Card）参考](../overview.md)
<!-- devkit:omit:end -->

## 目标

Display rules 定义 user / assistant 消息进入普通对话流渲染前的 UI-only 变换。

它只影响视觉呈现，不修改:

- `messages` 原文
- 聊天历史保存内容
- 发送给 LLM 的 API messages
- game card `rules` 的运行时输入

因此 display rules 适合处理“给模型和后续规则保留，但不直接展示给玩家”的内容，例如 `<summary>...</summary>`，也适合把轻量文本约定转换成更丰富的 UI 样式。

## 设计原则

- 自然文本是默认路径；LLM 不需要为了显示而输出大量标签。
- 标签只用于隐藏内容或少量结构化内容。
- 常见视觉增强优先使用正则规则识别自然文本。
- 规则失败不能阻断消息显示；失败规则应跳过并记录错误。
- 变换后的内容仍必须经过 Markdown 渲染和 HTML sanitize。
- 只处理普通对话流中的 user / assistant content，不处理 `_thinking`。

## 配置结构

Display rules 位于游戏卡顶层:

```json
{"display":{"assistant":[{"id":"hide-summary","enabled":true,"stage":"before_markdown","type":"regex_replace","pattern":"<summary>[\\s\\S]*?<\\/summary>","flags":"g","replace":""}]}}
```

`display.user` / `display.assistant` 中的规则按数组顺序执行。每条规则的输出作为下一条规则的输入。

## 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 规则标识，用于 debug 和错误提示 |
| `enabled` | boolean | 可选，`false` 时跳过；默认 `true` |
| `stage` | string | 执行阶段，只支持 `before_markdown` |
| `type` | string | 规则类型，只支持 `regex_replace` |
| `pattern` | string / 片段数组 | JavaScript 正则源码，不包含 `/.../` 包裹；数组支持只读 state |
| `flags` | string | 正则 flags，建议只允许 `gimsu` |
| `replace` | string / 片段数组 | 字符串保持 JavaScript replace 语义；数组显式引用捕获组/state |
| `trimStrings` | array | 仅用于片段数组，插入捕获结果前依次删除指定文本 |
| `minDepth` / `maxDepth` | integer / null | 包含边界，null/缺省无界；无消息深度上下文时跳过有限深度规则 |

片段数组和深度的完整语义见 [显示模板](./display_templates.md)。

## Stage

只开放:

| stage | 输入 | 输出 | 用途 |
|---|---|---|---|
| `before_markdown` | user / assistant 原始 `content` | Markdown 源文本 | 隐藏标签、包装文本约定、轻量格式增强 |

不开放 `after_markdown`，避免变换误伤已渲染 HTML。

## Regex Replace

`regex_replace` 等价于:

```js
content.replace(new RegExp(pattern, flags), replace)
```

`replace` 支持 JavaScript replace 的 capture group:

- `$1`, `$2`: 捕获组
- `$&`: 完整匹配
- ``$` ``: 匹配前文本
- `$'`: 匹配后文本

示例: 隐藏 summary 标签。

```json
{
  "id": "hide-summary",
  "stage": "before_markdown",
  "type": "regex_replace",
  "pattern": "<summary>[\\s\\S]*?<\\/summary>",
  "flags": "g",
  "replace": ""
}
```

输入:

```txt
「你终于来了。」
<summary>
玩家抵达音乐室。雪菜情绪紧张。
</summary>
```

UI 显示:

```txt
「你终于来了。」
```

原始 `msg.content` 仍保留 `<summary>`。

## 自然文本增强

Display rules 不要求 assistant 输出大量标签。推荐用正则识别轻量文本约定。

示例: 将角色名行包装成 speaker 样式。

```json
{
  "id": "speaker-line",
  "stage": "before_markdown",
  "type": "regex_replace",
  "pattern": "^【(.+?)】$",
  "flags": "gm",
  "replace": "<div class=\"rp-speaker\">$1</div>"
}
```

输入:

```txt
【雪菜】
「你来了。」
```

渲染前转换为:

```html
<div class="rp-speaker">雪菜</div>
「你来了。」
```

之后继续走 Markdown、sanitize、quote highlight 和 DOM 渲染。

## 标签增强

标签适合用于隐藏或结构化附加内容，不建议覆盖正文叙事。

示例: 状态块。

```json
{
  "id": "status-block",
  "stage": "before_markdown",
  "type": "regex_replace",
  "pattern": "<status>([\\s\\S]*?)<\\/status>",
  "flags": "g",
  "replace": "<div class=\"rp-status\">$1</div>"
}
```

## 安全边界

- 不支持 display `exec` 或任意 JavaScript。
- 不支持事件属性、脚本注入或内联行为。
- `flags` 应限制为 `gimsu`，不开放 `y`。
- 限制规则数量、表达式/输入/输出长度；长度限制不等于正则超时保护。
- 所有 display 输出必须继续经过 `DOMPurify.sanitize`。
- display rules 不应改变 retry、history、API request 或 game state。

## 与酒馆正则方案的关系

本设计借鉴 SillyTavern 常见正则美化插件的思路: 用正则在渲染管线中对消息做格式化，并区分 display-only 与 prompt/history 变更。

平台 display 保持以下边界，酒馆发送正则的有损转换见 [正则转换](../../compatibility/tavern/regex.md)：

- 只作用于 user / assistant 对话流显示
- 只处理当前单条消息
- 只支持 `before_markdown`
- 只支持 `regex_replace`
- 永远 display-only，不写回聊天记录

## 分段阅读

新主程序以 `ctx.createReader({source, mode: "segmented"})` 明确选择分段阅读；
continuous 是非分段增量显示。不要仅设置 display.segmentedReading 来改变 main.js 的 reader。
平台复用现有阅读 UI，点击非交互区域或 Enter 推进；链接、输入控件和文本选择不推进。

display.segmentSeparator 可指定普通字符串分隔符，默认按空行分段；CRLF 统一为 LF。
reader 先对源文本分段、处理 patch，再由 display 变换显示正文；避免显示替换改变预期的阅读段数。

state_patch_stream 在推进到后段时提交；普通 state_patch 仅过滤，其结算由 Agent 负责。
尾部无正文 patch 不生成空白页面。实际展示单元和提交结果保存在 Session，
回看与读档不重新解析源文本或重播 patch；执行中的阅读不形成可保存存档。
具体来源、完成时机与失败语义见 [reader](../runtime.md#reader-与两种-patch)。
