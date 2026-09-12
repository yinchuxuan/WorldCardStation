# 游戏卡 JSON Import

<!-- devkit:omit:start -->
本文只定义卡内 JSON 的 `$import` 展开语义。`.gamecard` 与 PNG 图片游戏卡的打包、导入和导出见 [游戏卡分发容器](./game_card_packages.md)。
<!-- devkit:omit:end -->

JSON 标准本身不支持 import。平台在读取游戏卡时提供一个加载期扩展：

```json
{ "$import": "rules/timeline.json" }
```

导入会在主进程读取 `card.json` 时展开。前端、规则引擎和校验器只看到展开后的完整游戏卡。

展开完成后，主进程使用与运行时相同的 `game-card.schema.json` 校验完整结构，并检查 schema 标记出的资源文件是否存在。声明了不存在的文本、脚本、样式、图片或音频文件时，整张卡拒绝导入。

流式生成期间平台禁用游戏卡导入，避免旧请求继续向新激活的游戏卡或 Session 写入消息、状态和演出结果。导入新卡时，平台会在新 stylesheet 全部读取完成后一次性替换旧样式，不暴露无样式的中间状态。

导入完成后新卡会成为 active game card，并出现在平台游戏卡选择器中。选择器也可以激活其它已导入卡，或选择“普通聊天”将 active game card 设为 `null`；这些操作不会删除原卡及其 session。

`$import` 可以放在对象字段或数组元素中，常见拆分包括：

```json
{
  "audio": { "$import": "audio.json" },
  "visual": { "$import": "visual.json" },
  "files": { "$import": "files.json" },
  "display": { "$import": "display.json" },
  "rules": [{ "$import": "rules/timeline.json" }]
}
```

## 顺序

`rules` 数组顺序是执行顺序。数组里的 import 会在原位置展开：

```json
{
  "rules": [
    { "$import": "rules/init.json" },
    { "$import": "rules/timeline.json" },
    { "id": "tail", "when": { "phase": "pre_send" }, "then": [] }
  ]
}
```

如果 `rules/timeline.json` 是数组，数组内规则会按文件内顺序插入到该位置。

只有数组中直接声明的 `$import` 返回数组时才做上述拼接。普通嵌套数组保持结构，例如 `args.matrix: [[1, 2], [3, 4]]` 不会被压平；展开后的来源映射也保留各层数组下标。生产环境统一由 native 加载器展开，renderer 不重复解释 `$import`。

## 安全限制

- 只能导入当前游戏卡目录内的相对路径。
- 禁止绝对路径、反斜杠、空路径段和 `..`。
- 只能导入 `.json` 文件。
- 循环导入会报错。
- import 深度超过限制会报错。

## 推荐拆分

```txt
white-album-2/
  card.json
  audio.json
  files.json
  visual.json
  display.json
  rules/
    init.json
    context.json
    timeline.json
```

`card.json` 保留游戏卡入口信息，复杂规则放到 `rules/` 下拆分。
