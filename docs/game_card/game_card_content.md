# 游戏卡 Content 描述符

Content 描述符描述如何生成一条消息的 `content` 值。

## 原子内容来源

| 来源 | 语法 | 说明 |
|---|---|---|
| 消息原文 | `{{original_content}}` | `replace` 时为被匹配消息的 content；`insert` 时为空字符串 |
| 文本文件 | `{{file:fileRef}}` | 读取游戏卡 `files` 授权的文本资源 |
| Markdown 章节 | `{{file:fileRef#标题}}` | 读取授权文本资源里的唯一 Markdown 章节 |
| 状态读取 | `{{state:path.to.value}}` | 读取当前 state；`find` 结果通过 `temp.find.*` 读取 |

## 文本文件

游戏卡通过顶层 `files` 注册单个文本或命名的文本目录：

```json
{
  "files": {
    "plot_guides": "chapters/chapter-1/plot_guides.md",
    "worldbook": {
      "directory": "worldbook",
      "include": ["config.json", "entries/*.md"]
    }
  }
}
```

字符串值注册精确 file ID。目录描述符把 scope ID 注册成虚拟路径前缀，例如 `{{file:worldbook/entries/e000001.md}}`；解析时精确 file ID 优先，否则用第一个 `/` 前的 ID 查找目录 scope。`include` 是授权范围，不会展开写回游戏卡。`files` 也可以通过 `$import` 拆分。

文件和目录必须是游戏卡内的安全相对路径。目录 include 支持精确文件和单层 `*`，匹配结果仅限 `.md`、`.txt`、`.json`；音频和图片继续使用 `audio` / `visual` 资源表。

精确 file ID 和章节名可以从 state 读取：

```txt
{{file:plot_guides}}
{{file:plot_guides#FixedPlot1}}
{{file:$temp.plotFile#$temp.PlotType}}
```

目录 fileRef 必须在规则中写成静态字面量，以便执行前加载；state 动态引用只接受精确 file ID。fileRef 始终经过顶层 `files` 授权，不支持裸文件路径。

预加载只解析规则中实际的 Content 字段及其分支，不解释 `exec.args`、state action 的普通 JSON 值、predicate 文本或 transform 参数中的字面量。

## Markdown 章节

`{{file:fileRef#标题}}` 会在对应 Markdown 文件中查找标题文本完全相同的唯一标题，不要求写 `##` / `###` 层级：

```md
## 雪菜线
这里是雪菜线规则。

### 临时状态
同属雪菜线，会一起返回。

## 和纱线
这里不会返回。
```

返回内容不包含标题本身，直到下一个同级或更高级标题为止。找不到标题或标题重复都会报错。

## find 查询

规则或 `insert` / `replace` action 可声明 `find`，用 Predicate 从当前输入的完整 `messages` 中查询消息。查询结果写入父级局部状态 `temp.find.<name>`，父规则或父 action 结束后恢复原 `temp.find`，不会持久化到会话 state。

```json
{
  "type": "replace",
  "predicate": { "_meta.source": "summary" },
  "find": [
    {
      "name": "summaryMsgs",
      "from": {
        "role": "assistant",
        "content": { "regex": "<summary>[\\s\\S]*?</summary>" }
      },
      "match": {
        "regex": "<summary>([\\s\\S]*?)</summary>",
        "group": 1
      },
      "many": true,
      "join": "\n"
    }
  ],
  "content": "{{state:temp.find.summaryMsgs}}"
}
```

| 字段 | 说明 |
|---|---|
| `name` | 必填。结果写入 `temp.find.<name>` |
| `from` | 必填。复用 Predicate 语法，命中的消息按原顺序返回 |
| `select` | 可选。取消息字段，默认 `content`；支持 `content`、`thinking`、`role`、`_meta.source` |
| `match` | 可选。`regex` + `group`，对选中字段提取子串 |
| `many` | 可选。`true` 写入数组；默认写入第一条命中结果 |
| `join` | 可选。供外部调试或后续兼容使用；content 通常直接读取 `temp.find.*` |
| `default` | 可选。没有命中时写入的 JSON 值；默认单值为 `null`，多值为 `[]` |

`find` 只支持数组语法，content 通过 `{{state:temp.find.name}}` 读取查询结果。

## Content 值类型

Content 可以是模板字符串，也可以是 `include` / `select` 对象。

模板字符串会保留普通文本，并解析其中任意位置的 `{{source}}`。source 的中间值可以是 `string` 或 `string[]`。`{{state:path}}` 读取数组时会用换行渲染；普通来源返回 `string`。

Transform 函数可以紧跟在 source 后面。它默认支持列表输入：对列表中每个 item 逐条应用。`.join{...}` 将列表收敛为字符串；如果最终结果仍是列表，使用默认 `\n` 拼接。

## include / select

`include` 和 `select` 用于根据当前 messages / state 动态生成 content，适合世界书和状态分支。

分支条件使用 `when`，语义与规则 `when` 相同，但 `phase` 可省略；省略时使用当前 action 所在阶段。`when.last` / `when.any` / `when.all` 内部继续使用 Predicate。

### include

`include` 会渲染所有命中的分支，并用 `join` 拼接。`join` 默认 `\n`。没有分支命中时渲染 `default`；未声明 `default` 时为空字符串。`prefix` / `suffix` 会包裹最终结果。

```json
{
  "type": "replace",
  "predicate": { "_meta.source": "worldbook" },
  "content": {
    "include": [
      {
        "when": {
          "last": {
            "num": 3,
            "role": { "in": ["user", "assistant"] },
            "content": { "regex": "冬马|和纱|Kazusa" }
          }
        },
        "content": "{{file:worldbook.characters#冬马和纱}}"
      },
      {
        "when": { "state": { "setsuna.affection": { "gte": 50 } } },
        "content": "小木曾雪菜对春希已经表现出明显依赖。"
      }
    ],
    "prefix": "本轮世界书:",
    "default": "无",
    "join": "\n\n"
  }
}
```

### select

`select` 会渲染第一条命中的分支，适合互斥分支。没有命中时渲染 `default`；未声明 `default` 时为空字符串。

```json
{
  "content": {
    "select": [
      {
        "when": { "state": { "route": "kazusa" } },
        "content": "{{file:routes#和纱线}}"
      },
      {
        "when": { "state": { "route": "setsuna" } },
        "content": "{{file:routes#雪菜线}}"
      }
    ],
    "default": "{{file:routes#共通线}}"
  }
}
```

## Transform 函数

| 函数 | 参数 | 效果 |
|---|---|---|
| `regex_replace` | `pattern`, `with`, `flags?` | 正则替换 |
| `regex_extract` | `pattern`, `group?` | 提取捕获组；`group` 默认 1，没有捕获组时取完整匹配 |
| `format` | 模板字符串 | 用 `{{value}}` 引用当前值，用于逐项加前后缀 |
| `join` | 分隔字符串 | 将 `string[]` 拼接成 `string` |

## 模板规则

```txt
template = text_or_chain*
chain    = source ("." transform)*
source   = "{{original_content}}" | "{{state:...}}" | "{{state_json:...}}" | "{{file:fileRef[#section]}}"
```

普通文本原样保留。`.` 只绑定它前面的 source，不影响后续文本或 source。

## 示例

```txt
{{original_content}}.regex_replace{pattern:'^```',with:''}
{{original_content}}

{{file:roleplay_rules}}
{{file:$temp.plotFile#$temp.PlotType}}
【回复】{{original_content}}
当前时间: {{state:timeline.currentTime}}
```
