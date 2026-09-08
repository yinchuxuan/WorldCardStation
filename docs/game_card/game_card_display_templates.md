# Display 只读模板与深度

这是普通游戏卡 display 的通用能力，不是酒馆宏解释器，也不开放 display exec。

## 片段数组

`pattern` 和 `replace` 原有字符串语义不变。数组中的字符串是字面量，不解释 Content、宏或 `$1`；动态值必须显式声明：

```json
{
  "stage": "before_markdown", "type": "regex_replace",
  "pattern": ["(", { "state": "player.name", "escapeRegex": true }, ")"],
  "flags": "g",
  "replace": ["<b>", { "capture": 1 }, "</b>：", { "state": "player.title" }],
  "trimStrings": [" ", { "parts": [{ "state": "player.omit" }] }],
  "minDepth": 0, "maxDepth": 2
}
```

- `{state: path}`：读取当前 state；缺失/null 为 `""`，其他值字符串化，不允许访问原型链。
- `escapeRegex: true`：转义该 state 值的正则特殊字符，固定字面量不转义。
- `{capture: 0}` 为完整匹配；正整数为编号捕获组，字符串为命名捕获组。仅 replacement 数组允许 capture，缺失捕获组为空文本。
- `trimStrings`：最多 64 项，每项为字面字符串或 `{parts: 只读片段数组}`。对象包裹避免 `$import` 的数组展开语义将不同 trim 项混合。仅作用于显式 capture 片段，按顺序做字面删除，不影响 replacement 中的其他文本；原生字符串 replace 不受影响。
- 拼接结果不递归解释。宏样式文本、state 值或捕获结果中的 `$1` 都不会变成额外操作。

最多执行每角色前 50 条规则。正则解析后的源码最多 1000 字符，输入最多 100000 字符，单条替换结果最多 1000000 字符；超限/错误跳过并记录警告。片段数组最多 512 项。执行仍为同步 JavaScript RegExp，不承诺可中断的 UI 正则超时。

## 消息深度

仅计真实 user/assistant 消息，最新为 0，往前逐条增加；不计 system、llm_only、debug_only 或世界书注入。流式 assistant 视作最新一条，已完成历史的深度相应加 1。

minDepth/maxDepth 均包含边界，缺失/null 不限制。没有历史定位的调用不猜测深度，跳过配置了边界的规则；自定义 UI 的 renderAssistantMessage 使用 options.depth，默认 0。

深度或被引用的 state 值变化时更新显示缓存；普通消息、流式消息及分段阅读使用一致的上下文。分段数与 state_patch 阅读边界从同一显示变换计算，已提交 patch 不重复应用。

显示模板只读取 state，不产生变量写入、随机数或文件访问；不改变消息、存档或模型输入。输出仍经过 Markdown 和 DOMPurify。
