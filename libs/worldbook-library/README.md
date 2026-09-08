# 游戏卡世界书 Library

## 目标与边界

这是随游戏卡分发的普通 JavaScript library：读取酒馆格式世界书配置，选择条目，再生成本轮 LLM 消息。只实现世界书运行时，不负责 PNG/CHARX 导入、编辑器或平台级世界书管理。

本目录只分发通用脚本和文档，不包含示例卡、世界书配置或条目正文。实际游戏卡复制其中的 `lib/worldbook/`，维护自己的 `worldbook/config.json` 和 Markdown 正文。仓库中的接入示例仅保留 `game-card-examples/white-album-2/`；测试数据位于 `test/fixtures/worldbook/`，不包含 library 副本，也不随库分发。版本由卡作者固定，不依赖平台源码、npm、网络或系统文件。修改 library 后应整体替换脚本目录，不能混用不同版本的模块。

平台没有特殊的 lib 类型或 worldbook action。入口仍然是普通 `exec sourceFile`，只使用 `ctx.messages/state/args/files/utils`，遵守相同的目录沙盒和超时限制。详细行为与兼容边界见 [运行语义](./SEMANTICS.md)。

## 卡内结构

```txt
card.json
lib/worldbook/
  index.js              # exec 入口，其余模块由 include 展开
  normalize.js          # V2 / V3 / SillyTavern 字段归一化
  matcher.js            # 关键词、正则、扫描深度
  resolver.js           # 选择、递归、预算流程
  ...                   # 必须复制本目录中的所有 .js
worldbook/
  config.json
  entries/
    冬马和纱.md
    第二音乐教室.md
```

一条 entry 一个 Markdown 文件，不需要 frontmatter、额外标题或分片协议。文件名由卡作者决定，`id` 只要求书内唯一且稳定；两者通过 `content_file` 关联。重命名正文文件时更新此引用，无需修改 ID。

## 接入

```json
{
  "files": {
    "worldbook": {
      "directory": "worldbook",
      "include": ["config.json", "entries/*.md"]
    }
  },
  "rules": [{
    "id": "worldbook",
    "when": { "phase": "pre_send" },
    "then": [{
      "type": "exec",
      "sourceFile": "lib/worldbook/index.js",
      "args": { "worldbook": "worldbook" }
    }]
  }]
}
```

`args` 是普通 exec 的完整 JSON 参数对象，没有 configs/args/exec 类别，也不需要 fieldIds。唯一必填字段 `worldbook` 是 `files` 中的目录 scope ID，固定读取该 scope 下的 `config.json`。

entry 不逐条注册到 `card.json.files`。目录描述符授权范围内的只读访问，既不枚举文件，也不隐式授予卡外访问能力。library 使用 `await ctx.files.readText(scopeId, relativePath)`，由平台检查目录、include 和路径边界。普通规则仍可静态引用 `{{file:worldbook/entries/冬马和纱.md}}`。

可选参数由卡作者提供，不从平台私有字段猜测：

| 参数 | 用途 |
| --- | --- |
| `character` | `id/name/nickname/tags/description/personality/scenario/depth_prompt/creator_notes`；匹配源、过滤、宏和示例对话 |
| `user` | `name/description/icon`；用户宏、persona 匹配和 V3 图标条件 |
| `generation_type` | ST 生成类型过滤，默认 `normal`；继续/重试等调用方应传入对应类型 |
| `greeting_index` | V3 开场白索引，0 为默认开场白 |
| `max_context_reached` | 是否达到模型上下文上限，供 V3 条目条件使用 |

这些只是 library 参数，不增加 exec 公共语法。缺少可选上下文时，相关能力按 [运行语义](./SEMANTICS.md) 降级并报告诊断。

## 配置

`config.json` 接受 V2/V3 `character_book` 对象、`lorebook_v3` 包装对象，以及 ST 独立世界书的 entries 对象。不接收整张角色卡。

```json
{
  "name": "main",
  "scan_depth": 4,
  "token_budget": 2048,
  "recursive_scanning": true,
  "extensions": {
    "world_card_station": {
      "format": "sillytavern",
      "max_recursion_steps": 8,
      "anchors": { "character": ["character-description", "character-scenario"] }
    }
  },
  "entries": [{
    "id": "kazusa",
    "name": "冬马和纱",
    "keys": ["和纱", "冬马"],
    "content": "",
    "enabled": true,
    "insertion_order": 100,
    "position": "after_char",
    "extensions": {
      "probability": 100,
      "useProbability": true,
      "world_card_station": {
        "content_file": "entries/冬马和纱.md",
        "decorators": []
      }
    }
  }]
}
```

保留酒馆字段和 extensions 原貌，library 自有配置只放在 `extensions.world_card_station`。正文引用优先于内联 `content`；存在引用但文件缺失时会报错，不偷偷回退内联正文。

书级设置：

- `format`：`auto`（默认）、`v2`、`v3`、`sillytavern`。自动识别 ST 独立对象和导出特征；无特征的普通对象按 V2，`lorebook_v3` 按 V3。从 V3 角色卡取出的裸 character_book 应显式标记 `v3`，ST 导出则标记 `sillytavern`。这是匹配语义选择，不是平台加载类型。
- `max_recursion_steps`：默认 8，硬上限 16；包含首次扫描。
- `case_sensitive/match_whole_words/use_group_scoring`：条目未指定或为 null 时的默认值，均默认 false。
- `anchors`：`character/description/personality/scenario/authors_note/examples` 对应消息的 `_meta.source` 字符串或数组。定义消息须由游戏卡规则先插入，随后执行 library；数组覆盖从第一个匹配消息到最后一个匹配消息的范围。
- `prefix/suffix/join`：每组注入消息的包装和正文间隔，默认空、空、两个换行。

## 读取与规模

普通 V2 条目先匹配元数据，再读取命中正文。ST/V3 的装饰器可能改变激活条件，因此缺少装饰器元数据时必须预读所有启用条目的正文，不能只读取关键词已命中的条目。

可在 entry 的 `extensions.world_card_station.decorators` 中保存完整装饰器行数组（含 `@@@` 后备行）；没有装饰器用 `[]`。这使匹配阶段无需读取正文。它是可选加速索引，不是第二份正文；修改 Markdown 装饰器时必须同步更新它。定时/历史匹配条目还会读取正文以验证内容是否变化。

千条 entry 仍可一条一文件；有装饰器索引时，测试验证千条外部 entry 只读取 config 和命中正文。平台可缓存文件内容，但 library 不在多次 exec 之间保存可变全局对象。当前桌面平台的 exec 默认总超时为 2000 毫秒，磁盘/Worker 往返也计入其中；不能承诺任意规模冷读取均能在默认时限内完成。

## 返回值、存档与诊断

### 可选的编译文本渲染器

卡内 wrapper 可调用 `runWorldbook(ctx, args, renderText)`。第三参数是普通 JS 回调，不是 exec JSON args。回调接收 `{ entry, field, index?, text }`，其中 field 为 `keys`、`secondary_keys` 或 `content`，返回或异步返回 `{ content, scanContent }` 两个字符串。关键词在匹配前渲染，正文在预算和递归前渲染；正文已移除生效格式下的装饰器行，同一条目正文复用结果。

传入回调后完全替代默认文本宏展开，不进行第二次宏替换。回调须同时处理普通文本、隐藏关键词及注释，并自行验证编译文本索引是否失效。未传回调时原有行为不变。关键词和候选正文可能并行渲染，回调不能写共享游戏状态；需要副作用的求值顺序不属于本接口。

### 结果

入口返回 `{ messages, state?, effects }`。注入消息为 `ttl: 1`、`llm_only`，携带 `_meta.source: "worldbook:<书名或 ID>"` 和 `_meta.worldbook_scope`。重跑只替换相同 scope 的注入，不会删除同名的另一本书。

有定时效果、V3 历史匹配或 outlet 时，私有状态写入 `state.__worldbook[scopeId]`；其他游戏状态保留。调用方必须继续传递返回的 state。平台现有会话保存、分支和 retry-base 随之保存/恢复，无需额外平台存储。不要手工复用另一会话的这段状态；该命名空间不能另作他用。

`effects.worldbook` 包含 `scope/selected/budget_skipped/outlets/warnings`，可在 exec trace 查看。警告去重并最多保留 100 项，不注入模型消息。配置损坏、重复 ID、越界或缺失正文沿现有 exec 错误链路失败，不提交本次消息和定时状态。

Outlet 只汇总到 `state.__worldbook[scopeId].outlets` 及 effects，不自动注入；后续普通规则或 exec 可读取并自行定位。这里不注册全局 `{{outlet::name}}` 宏。

## 验证

仓库中的 `test/game-card/worldbook*.test.js` 覆盖真实 ST 导出形状、V2/V3 差异、选择与插入、跨轮恢复、沙盒/Worker、千条资源读取和 WA2 脚本副本一致性。运行：

```sh
npx jest --runInBand --coverage=false test/game-card/worldbook
```
