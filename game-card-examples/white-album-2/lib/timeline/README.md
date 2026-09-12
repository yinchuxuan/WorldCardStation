# 剧情时间线 Library

随游戏卡分发的普通 JavaScript 库，只负责时间解析、节点区间选择和上一轮时间上限约束。不负责章节业务、分支锁定、结局判定、随机事件、人物态度、消息拼装或演出。

本目录只分发脚本和文档。将完整 `lib/timeline/` 和本文复制到卡内 `lib/timeline/`，配置和剧情正文由卡作者维护；不依赖平台源码、npm 或网络。当前通过复制接入，尚未注册为客户端的 `--lib` 初始化选项。

## 普通 exec 接入

```json
{
  "files": {
    "timeline": { "directory": "timeline", "include": ["config.json"] },
    "plot": "plot/chapter-1.md"
  },
  "rules": [{
    "when": { "phase": "pre_send" },
    "then": [{
      "type": "exec",
      "sourceFile": "lib/timeline/index.js",
      "args": { "timeline": "timeline" }
    }, {
      "type": "insert",
      "role": "system",
      "content": "{{file:$timeline.data.plotFile#$timeline.data.section}}",
      "ttl": 1,
      "_meta": { "visibility": "llm_only" }
    }]
  }]
}
```

`args.timeline` 必填，是 `files` 的目录 scope ID。`args.config` 可选，默认 `config.json`，相对该 scope；读取始终经过 `ctx.files.readText` 的授权、include 和路径检查。它们是普通 exec 参数，不扩展平台 DSL。

卡的 state schema 必须提供 `timeline.currentTime` 字符串默认值。模型可以写 currentTime；`timeline.currentSlot/currentSlotEnd/data` 应保持模型只读。

入口只在解析成功后写入：

- `timeline.currentTime`：受上一轮上限修正后的时间。
- `timeline.currentSlot`：选中节点 ID。
- `timeline.currentSlotEnd`：选中节点本轮允许推进的上限；配置 end 为 null 时输出空字符串，兼容 string state schema。
- `timeline.data`：选中节点的卡片专属数据，未配置时为 `{}`；每次整体替换，避免遗留前一个节点的数据。

其他 state 字段保持不变。不直接修改 messages，不另建私有存档；这些字段沿用平台会话保存、分支和 retry 恢复。

## 配置

`timeline/config.json`：

```json
{
  "slots": [
    {
      "id": "free",
      "range": { "lte": "2007.10.21: 14:00" },
      "end": "2007.10.21: 16:00",
      "data": { "plotFile": "plot", "section": "FreePlot1", "kind": "free" }
    },
    {
      "id": "fixed",
      "range": { "gt": "2007.10.21: 14:00", "lte": "2007.10.21: 16:00" },
      "end": "2007.10.21: 18:00",
      "data": { "plotFile": "plot", "section": "FixedPlot1", "kind": "fixed" }
    },
    {
      "id": "after",
      "range": { "gt": "2007.10.21: 16:00" },
      "end": null,
      "data": { "plotFile": "plot", "section": "Afterstory", "kind": "free" }
    }
  ]
}
```

- `slots` 是非空数组，ID 在本配置中唯一；数组顺序决定多个节点同时命中时的优先级。
- `range` 必填，支持 `gt/gte/lt/lte`；每侧最多一种边界，省略的一侧无界，空对象表示全时段。空区间、反向区间和未知操作符报错。
- `end` 必填，为合法时间或 null。它与 range 的上界独立：range 决定何时加载节点，end 决定加载后本轮可以推进多远。
- `data` 可选 JSON 对象，库不解释人物、剧情类型或文件引用；节点 ID 与正文标题不必相同。正文仍由卡的 files/content 规则授权和读取，不强制一节点一文件。
- `fallback` 可选，指定本配置内的节点 ID。没有命中且未配置 fallback 时报错；使用 fallback 或多节点命中时返回警告，不静默跳转。

## 时间与执行语义

时间格式为 `YYYY.MM.DD: HH:mm`，兼容一位月、日、小时及尾部的 `星期X`。按 UTC 日历数值比较，忽略星期文字，不受本机时区/DST 影响；不读取真实时钟。非法日期、缺失时间或未知格式报错，不借助 Date 的自动日期溢出。

每次先用传入的 `currentSlotEnd` 限制 currentTime，再用修正后的时间选节点，最后发布新节点的 end。缺失、空字符串或 null 的上一轮上限表示不约束。仅限制向未来越界，不自动推进时间、不阻止时间倒退，也不补执行被跨过的节点。

约束发生在调用库时；在 pre_send 中调用不能撤回前一轮已经生成的正文。节点被选中不表示剧情已经完成，不自动写完成标记。重跑使用传入的 state/config，不保存跨 exec 缓存或抽取随机数。

## 卡内 wrapper

有卡片专属状态布局或章节策略时，include 核心而非带有 run 的入口：

```js
include("lib/timeline/core.js");

async function run(ctx) {
  const config = await loadTimelineConfig(ctx);
  const result = resolveTimeline(config, ctx.state.timeline);
  // 在此映射 result.slot，应用卡片自己的分支规则，再写入 state。
  return { state: ctx.state, effects: { timeline: result.diagnostics } };
}
```

上例仅展示调用，不自动写入结果。可复用函数：

- `parseTimelineTime(value, label?)`：解析为 UTC 毫秒数。
- `clampTimelineTime(currentTime, currentSlotEnd)`：返回 requestedTime、previousEnd、currentTime、clamped，不修改输入。
- `selectTimelineSlot(config, currentTime)`：返回 `{ slot, diagnostics }`，slot 为独立副本，不修改 config。
- `resolveTimeline(config, { currentTime, currentSlotEnd })`：组合约束和选择，返回 `{ currentTime, slot, diagnostics }`，不修改输入。
- `loadTimelineConfig(ctx, args = ctx.args)`：只读取并解析授权 JSON；节点结构在选择时校验，JSON 内不展开平台的加载期 `$import`。

WA2 的专属入口是 `scripts/plot.js`，章节逻辑位于 `scripts/chapters/`，通过 include 使用 `lib/timeline/core.js`，不调用库的默认 index.js 入口。先约束时间，再选择章节配置；保留原分支、结局和随机剧情代码，以及原有 state 字段。日后谈由卡片直接选择，不再匹配普通节点表。两章的原首节点回退显式配置为 fallback。

配置目录不必命名为 timeline。WA2 将 `plot/chapter-1.json`、`plot/chapter-2.json` 与同章 Markdown 正文放在一起；`files.timeline` 的 directory 为 `plot`，include 仍仅授权两份 JSON。正文继续使用原有 `plot.chapter.*` 精确文件 ID，scope ID、脚本参数和存档字段不随物理目录变更。

## 诊断与验证

普通入口返回 `{ state, effects: { timeline } }`。effects 包含请求时间、旧上限、实际时间、是否修正、选中 ID、所有命中 ID、是否回退和 warnings，直接进入现有运行时 trace。WA2 wrapper 还报告最终剧情版本和日后谈跳过区间选择的原因。

非法配置/时间和读取失败沿 exec 错误链路失败，不提交本次结果。dry-run 仅检查脚本语法和静态引用，不执行本库、不会验证动态读取的节点配置；配置及行为需要运行测试或实际游玩验证。

仓库测试：`npx jest --runInBand --coverage=false test/libs/timeline`。卡内脚本和文档副本一致性、真实规则引擎/Worker 读取、时间边界和错误隔离均有覆盖。
