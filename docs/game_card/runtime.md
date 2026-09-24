# 清单、主程序与 reader

<!-- devkit:omit:start -->
适用任务：开发新卡、接入双端播放器或迁移旧卡。
相关代码：`src/shared/game-card/runtime/`、`src/renderer/gameCard/loadPlayerSession.js`。
前置文档：[运行模型](./overview.md)。
<!-- devkit:omit:end -->

## card.json

```json
{
  "formatVersion": "1",
  "id": "my-game",
  "version": "1.0.0",
  "name": "我的游戏",
  "main": "main.js",
  "agents": { "narrator": "agents/narrator.json" },
  "stateSchema": "state/schema.json"
}
```

main 必须是卡内 JS 文件；agents 至少一个，键为 Agent ID，值为卡内 JSON 文件。
Agent ID 以英文字母开头，后续可用字母、数字、下划线、连字符，最长 64 字符。
卡 ID 还允许以数字开头，支持客户端生成的 UUID；保留名称和越界路径被拒绝。

根清单保留 files、state/stateSchema、visual、audio、display、presentation、ui 和描述字段。
rules、responseValidation 移到各 Agent 文件，不再放在根清单。Agent 文件仅有 model、rules 和可选 responseValidation。

根清单可设置 `"statePatch": { "enabled": false }`，省略时默认开启。
关闭时所有 Agent 不解析或提交模型正文中的 `<state_patch>`；所有 reader 将 `<state_patch>` 和 `<state_patch_stream>` 视为普通文本，不过滤、不执行，也不因标签不完整或嵌套报错。
回复校验的 content 来源和显示层也不再自动剔除这些标签；作者配置的显示规则和 Markdown 渲染仍照常执行。
这只关闭模型正文的变量更新协议，不影响 main.js 的 State API、规则写入变量或 responseValidation 本身。

model 是平台配置引用，不是模型名称或 API 密钥；播放器目前提供 default，不允许卡片内联 endpoint/密钥。

card.json 和 Agent JSON 均支持 [JSON import](./packaging/imports.md)。路径相对于卡根，不相对于导入文件。
数组中的整项 import 若展开为数组，会展开一层；其他嵌套数组不隐式展平。

## main.js

```js
export async function onInput(ctx, input) {
  ctx.state.set("turn.input", input);
  const call = ctx.agents.call("narrator");
  await ctx.present(ctx.createReader({
    source: call.response,
    mode: "continuous"
  }));
  await call.done();
}
```

onInput 是每轮输入入口；可选导出 `async function onStart(ctx)`，用于新游戏开场。
新 Session 先创建共享 State，再按 card.json 声明顺序执行所有 Agent 的 init，最后调用 onStart。
onStart 可以直接读取各 Agent 初始化后的 Messages，不必调用 LLM 来取得开场。
未导出 onStart 时仍执行所有 init。启动期间提交的输入排队等待，完成后才执行；队列清空后才允许保存。
启动失败停止并保留现场，不标记启动成功；重新启动时从初始化前重跑。已有存档恢复时不重复 init/onStart；不存在 onLoad 回调。
模块可静态 import/export 卡内相对路径的 JS；禁止动态 import、远程模块、任意文件和宿主 API。
启动和每轮输入分别在新的可终止 Worker 内运行，不依赖模块变量保存游戏数据。
不支持并行或后台调用；一轮中只能有一个未完成 Agent 调用。等待 done 后才可继续下一次调用。
输入按 Session 内 FIFO 串行执行；main 返回前，新输入只入队，不抢占。未 await 完成的调用或 reader 会使本轮失败。

| API | 输入与返回 |
| --- | --- |
| ctx.state.get(path) | 返回 JSON 副本；缺失返回 undefined |
| ctx.state.has(path) | 是否存在路径 |
| ctx.state.set(path, value) / delete(path) | 校验后修改共享 State；Agent 调用中禁止主程序同时写入 |
| ctx.agents.messages(id) | 当前 Agent 的只读 Messages 快照 |
| ctx.agents.call(id) | 同步返回 { messageId, response, done } |
| call.response | 一次消费的 AsyncIterable<string>，完整原始 assistant 输出，包含控制标签，不包含 thinking |
| call.done() | 等待生成、回复校验、普通 patch 和 post_response；不等待玩家阅读 |
| ctx.createReader({source, mode}) | 创建本轮 reader，source 为字符串或文本异步流 |
| ctx.present(reader, options?) | 消费并展示正文；options.waitForAdvance 控制分段阅读确认，耗尽后 resolve，保留画面 |

最终消息按调用的 messageId 查询，不依赖“最后一条 assistant”：

```js
const call = ctx.agents.call("narrator");
await call.done();
const message = ctx.agents.messages("narrator").find(msg => msg.id === call.messageId);
if (!message) throw new Error("回复被规则删除");
await ctx.present(ctx.createReader({ source: message.content, mode: "segmented" }));
```

post_response 不修改原始 response。静态来源是最终消息的字符串快照，之后的消息变更不改变这次展示。
隐藏调用只等待 done，不需要创建 reader；不会提交阅读 patch。

分段默认每段都等待确认。交互页可由卡片声明展示后不等待，例如：

```js
await ctx.present(ctx.createReader({ source: call.response, mode: "segmented" }), {
  waitForAdvance: text => !/^<choices>[^\r\n]*<\/choices>$/.test(text.trim())
});
```

waitForAdvance 可为布尔值或同步 text => boolean；text 已过滤控制标签但未经 display 变换。
false 不截断来源，present 仍须读到 EOF。选项页可保留在屏幕上，main 继续结算；此时提交的新输入等待本轮返回。
平台不内置 choices 语义，选项仍可由 display 转成按钮；输入框显隐由卡片 UI/CSS 控制，不由运行锁决定。

## Reader 与两种 patch

| mode | next() 的 value | state_patch_stream | state_patch |
| --- | --- | --- | --- |
| continuous | { text: 增量文本, patches: [] } | 过滤，不提交 | 过滤，不提交 |
| segmented | { text: 一段正文, patches: 本次已提交记录 } | 推进到该段时提交 | 过滤，不提交 |

next() 返回 {done, value}；ctx.present 使用同一接口驱动阅读，卡片不要同时手动 next。
读取可预先缓存和解析，但预读不能提交变量。不要再次执行 value.patches。
分段正文沿用 display.segmentSeparator；patch 前正文先成段，patch 在后段显示前提交。
末尾仅有 patch 时返回空正文单元；回看和读档使用可见记录，不重新运行 reader。

普通 state_patch 在完整模型响应校验通过后、post_response 前提交一次。
state_patch_stream 仅在分段阅读中生效。两者均受 State Schema 与 llmWrite 限制；
主程序不能用自定义 applyPatch 绕过权限。解析或提交错误使整轮失败，不静默跳过。
两种提交通道不保证相互顺序，避免在同一路径上依赖它们的竞争结果。

## 保存、恢复与调试

整轮成功后才形成可保存结果。桌面自动保存，Web 手动创建新存档。
保存所有 Agent 的 Messages/initialized、State、实际可见记录及平台视图数据。
失败停止并保留已提交变量、消息及当前演出，退出生成状态；失败操作自身不产生部分 patch 写入。只有重试才恢复轮前基准并重跑 main.js。
失败现场禁止保存、不自动覆盖已有存档；保留失败输入供重试或编辑，不支持从异常代码位置继续。
失败暂停队列，待执行输入不会自动运行；停止、重试、换 Session 或卸载会清空队列。重试先取消并等待当前轮退出，再执行重跑。
pending 输入只存在于内存，不保存或恢复。
读档只恢复数据，不执行 init/onStart、不重播 patch，也不恢复 Promise 或运行中的脚本。
新 Session 可通过 State 默认值设置初始背景、立绘和 BGM；已有存档优先恢复实际保存的演出目标。

开发者模式 trace 可按 main.input、agent.call、agentId、callId 和 sourceFile 定位；
规则 import 的源文件位置随事件记录。日志可能含提示词和正文，不要公开含敏感剧情的完整日志。

## 从旧卡迁移

1. 添加 formatVersion、main、agents，将 rules/responseValidation 移到 Agent。
2. 将后处理规则改为 post_response；原 after_response 的“读完后结算”应移到 main 中 await present 之后。
3. 通过 State 显式传递玩家输入，在 pre_send 中插入各 Agent 需要的消息。
4. 将与段落同步的演出 patch 改成 state_patch_stream；最终结算仍用 state_patch。
5. 显式选择 raw response 或最终 msg 展示；init 准备上下文，onStart 从 Messages 读取开场并调用 present。静态开场中的分段 patch 使用 state_patch_stream。
6. 运行 dry-run，再实际验证输入、阅读、取消、重试和保存恢复。

旧卡存档不迁移；保留旧数据供自行备份，但不能作为新协议 Session 加载。
酒馆转换尚未生成新清单时，玩家导入入口明确拒绝转换产物；底层转换模块不代表播放器兼容承诺。
