# 游戏运行时重构设计

状态：目标设计草案，尚未实现。清单字段、脚本入口和 API 均为示意，不是当前可用语法。

适用任务：评审 main.js 编排多 Agent 的最小重构。
前置文档：[当前架构](./overview.md)。当前字段仍以 [Schema 契约](../game_card/schema.md)为准。

## 1. 本轮目标

让游戏卡通过 main.js 顺序调用多个 Agent，并在调用之间执行 JS 游戏逻辑。
每个 Agent 拥有独立上下文，通过共享 State 协作；继续使用平台现有界面和演出系统。

- Agent = Messages + Rules + 模型配置引用。
- main.js 决定调用顺序、业务分支，以及展示原始 response 还是后处理后的 msg。
- Rules 将变量注入 prompt，模型和 JS 通过受控接口修改变量。
- 正文直接流式展示，不要求先完整写入 state.text。
- 平台继续负责输入、聊天记录、分段阅读、背景、立绘、音乐和已有自定义 UI 能力。

最小链路：玩家输入 → main.js → Judge 写变量 → Narrator 读取变量 → 平台展示回复和演出。

## 2. 职责边界

| 模块 | 本轮职责 |
| --- | --- |
| main.js | 处理一轮输入、顺序调用 Agent、读写变量、执行游戏逻辑、选择展示回复 |
| Agent 执行层 | 独立 Messages、初始化、Rules、模型请求、响应校验和变量更新 |
| 共享 State | 复用现有默认值、schema、写入限制和 patch 能力 |
| 现有界面与演出 | 展示选定回复、处理阅读交互、根据变量调度已有资源 |
| 平台运行层 | 托管脚本、取消、错误处理、Session 和 trace |
| 平台适配层 | 复用双端模型传输、资源及持久化接口 |

必要的拆分是让模型调用不自动产生可见消息；不要求先建设独立前端体系。
Agent 处理普通变量提交，reader 处理阅读位置相关的提交；两者不得重复执行同一类 patch。

## 3. 游戏卡定义

在现有 State、内容授权、资源和显示配置基础上，增加主程序入口与 Agent 定义。
以下仅展示新增结构，正式字段由 Schema 定稿：

```json
{
  "formatVersion": "2",
  "id": "my-game",
  "name": "我的游戏",
  "version": "1.0.0",
  "main": "main.js",
  "agents": {
    "judge": "agents/judge.json",
    "narrator": "agents/narrator.json"
  }
}
```

formatVersion 选择运行协议，取值待定；version 是卡片内容版本。
Agent 文件声明规则、内容引用、模型配置引用及回复校验，不保存运行中的 Messages。
密钥仍由平台持有，不进入卡片脚本。

沿用现有资源目录和卡内 lib 使用方式，不新增 ui.entry、前端宿主或包管理体系。
main.js 及其模块遵循卡内路径授权，不获得任意文件、网络或宿主访问权。

## 4. Agent 与共享变量

- Messages CRUD 默认作用于当前 Agent；查询可显式指定其他 Agent，只读取得执行时的快照。
- 跨 Agent 引用插入为副本，不共享可变对象；TTL 按所属 Agent 的调用轮次推进。
- 初始化标记按 Agent 保存，不能以 Messages 是否为空推断是否初始化。
- 所有 Agent 和 main.js 访问同一个 Session 的 State，复用现有校验与模型写入限制。
- pre_send 在该 Agent 请求前执行，post_response 在完整响应通过校验后执行。
- 规则内 exec 继续承担短时逻辑，不从规则内递归调用 Agent。
- 变量变化不自动触发其他 Agent，依赖顺序由 main.js 显式安排。

Judge 写入 turn.judgment 后，Narrator 可以用现有模板语法读取：

```json
{
  "when": { "phase": "pre_send" },
  "then": [{
    "type": "insert",
    "role": "system",
    "content": "依据本轮裁定继续叙述：\n{{state_json:turn.judgment}}",
    "ttl": 1
  }]
}
```

共享变量传递业务结果，不新增强制的 Agent input/output 容器。
玩家输入由 main.js 接收，可写入变量并通过规则注入各 Agent，不自动广播到所有 Messages。
Narrator 也可在 pre_send 查询 Judge 的消息并注入自身上下文，复用消息筛选语义，不必经 State 搬运文本。
main.js 保证前置调用完成；“最后一条 assistant”可能是旧消息，精确关联应使用本次调用的 messageId。

## 5. 调用、原始 response 与最终 msg

以下示例用于明确职责；方法名称和具体完成边界在实现前定稿：

```js
export async function onInput(ctx, input) {
  ctx.state.set("turn.input", input);
  ctx.state.delete("turn.judgment");

  const judgment = ctx.agents.call("judge");
  await judgment.done(); // 平台完成生成及后处理，不需要展示才能完成
  if (!ctx.state.has("turn.judgment")) throw new Error("缺少本轮裁定");

  // 此处可以执行卡内 JS 结算或分支逻辑。
  const call = ctx.agents.call("narrator");
  const reader = ctx.createReader({ source: call.response, mode: "segmented" });
  await ctx.present(reader); // 平台界面驱动 reader.next()，等待阅读结束
  await call.done(); // 同时确保生成、校验和后处理成功
}
```

agents.call 返回调用句柄，含原始 response 文本流、messageId 和 done()；不是第二份可变消息。
response 是完整模型输出，包括控制标签，不随 post_response 修改；Messages 保存可被规则处理的消息。
done() 等待生成、校验、普通 patch 提交及 post_response 完成；不等待 reader 或玩家阅读。
pre_send 准备上下文；post_response 可改写本次 assistant msg，但不回头修改原始流及已展示内容。
静态展示先等待 done()，再按 messageId 取得处理后的 msg.content 快照作为 reader.source。
规则若删除目标消息，查询返回缺失，由主程序选择跳过或报错，不能退回原始 response 冒充最终消息。
辅助 Agent 消息不自动展示；模型输出作为数据处理，不作为 JS 或未经净化的 HTML 执行。

## 6. Reader：输入、输出与提交时机

reader 统一消费原始 response 或静态 msg，不负责模型调用，也不修改 Messages。
输入为 source（字符串或 AsyncIterable<string>）、mode（segmented/continuous）和受控 applyPatch 回调。
ctx.createReader 默认绑定当前 Session 的受控 State 提交接口，卡片不能借回调绕过校验。
静态文本先固定快照；网络 chunk 仅是传输边界，不是阅读段落。

| 模式 | 输出 | 标签处理 |
| --- | --- | --- |
| segmented | 完整段落及对应 patches | 过滤两种标签；推进时提交 state_patch_stream |
| continuous | 可显示的增量文本，patches 为空 | 过滤两种标签，均不提交 |

reader.next() 返回 { done, value: { text, patches } }；patches 是本次已提交的记录，调用方不得再次 apply。
分段模式内部可提前解析和缓存，但只有 next() 推进到该段时才按顺序提交 patch，提交成功后返回正文。
UI 显示正文并等待玩家操作后再调用 next()；非分段模式持续消费增量即可。
标签前正文先形成一段，state_patch_stream 作用于后续段落，在后段显示前提交。
连续标签保持顺序；末尾仅有 patch 时返回空正文更新单元，无需额外展示空白页。
正文分段沿用平台阅读配置；增量解析必须处理跨 chunk 标签，不泄漏控制文本，不因预读提前提交。

普通 <state_patch> 始终由 Agent 在完整响应通过校验后、post_response 前提交一次，reader 只过滤。
<state_patch_stream> 只由分段 reader 提交；隐藏调用及非分段展示不会执行它。
两种文本来源均支持两种阅读模式；静态模式按后处理后的文本重新解析，不能沿用原始流的位置索引。
因此模型完成和演出完成是不同边界；后续 Agent 依赖阅读变量时，main.js 必须等待 reader 消费结束。
普通 patch 与阅读 patch 不保证跨通道顺序；卡片应避免依赖同一路径的时序，确需排序时显式等待。
取消、解析或提交失败使 reader 终止，交给整轮失败处理；已产生副作用的阅读流不允许透明重播重试。
本轮同一展示源只进行一次带副作用的阅读；历史回看使用已保存展示记录，不重新执行 patch。

## 7. 一轮交互、错误和取消

首版每个 Session 同时只运行一轮输入，一轮内只允许一个未完成的 Agent 调用。
不支持并行模型请求、后台任务或跨输入继续运行的脚本；违规调用明确报错。
主程序结束前必须完成调用及已启动的阅读；异常退出时平台取消请求和 reader。

一轮输入前保存内存重试基准，覆盖共享 State、全部 Agent 上下文及初始化标记、可见记录和必要视图数据。
一轮成功后才成为新的可保存结果；失败或取消恢复本轮基准，并清理临时显示和演出。
首版重试重新执行整轮 main.js，不提供单 Agent 独立检查点。
切换 Session、卸载或停止后，旧脚本和请求不得继续写回。

脚本在可终止的受控宿主执行；模型等待与脚本 CPU 限制分开。
trace 增加 agentId、callId 和主程序来源，定位一轮内的调用、变量修改和失败。
不为顺序执行建设并发冲突检测、写入版本历史或后台调度框架。

## 8. Session 与版本边界

扩展现有 Session，保存共享 State、全部 Agent Messages/初始化标记、可见记录和平台阅读状态。
可见记录保存实际展示内容，不能由后处理后的 Messages 重建原始流展示，也不能在读档时重新 apply patch。
保存以完整轮次为边界；生成或阅读提交未结束时不保存半轮数据。
桌面仍自动保存，Web 仍显式创建新存档；运行中显式保存禁用。
载入后恢复数据并等待下一次输入，不恢复 Promise、JS 调用栈或进行中的模型请求。

本轮不做旧游戏卡运行时兼容，也不迁移旧卡存档。
通过明确协议标识拒绝旧版或未知版卡片并提示迁移，不按新语义静默加载。
提示词、资源和仍成立的规则可迁移复用，不保留第二套长期执行器。
普通聊天继续可用；酒馆转换工具若仍输出旧协议，应明确提示暂不支持。

## 9. Agent 消息历史查看

复用平台现有 msg 历史展示页面，在该页面标题栏增加 Agent 切换按钮，不新建独立调试页面。
按钮按卡片声明的 Agent 列出；选中后展示当前 Session 内该 Agent 的完整 Messages，沿用现有消息展示格式。
辅助 Agent 同样可查看；尚未产生消息时显示空状态，不混入其他 Agent 或玩家可见记录。
页面读取实际 Messages，因此显示 post_response 等规则修改后的内容，不是原始 response 的副本。
切换 Agent 只改变查看对象，不触发调用、初始化、规则或 reader，也不修改游戏状态。
切换游戏卡或 Session 后重新绑定数据；选中 Agent 不存在时回到首个 Agent，无 Agent 时显示空状态。
桌面与 Web 复用同一页面和切换控件，保留现有历史查看入口，不以新增开发者模式为前提。

## 10. 实施与验收范围

复用 src/renderer/chat/ 的生成、输入和 Session 管线，以及 src/shared/game-card/ 的规则与 State 能力。
src/renderer/gameCard/ 的演出接入 reader，支持原始 response 和最终 msg 两种来源。
导入、发布、静态检查和开发参考同步更新新清单，继续使用唯一共享 Schema。

先用最小 Judge/Narrator fixture 验证，再迁移 WA2 验证真实提示词和现有演出体验。
测试覆盖上下文/TTL 隔离、变量传递、隐藏调用、流式显示、整轮重试、取消、保存恢复和双端运行。
仍成立的底层契约测试保留；绑定旧语义的测试按明确的新契约替换，不能删除来规避失败。

暂不纳入：卡内独立前端、资源桥、演出库提取、并行/后台 Agent、通用 State 事务框架、
检查点 API、脚本中途恢复、3D 和存档转移；本轮包含上述 reader 与两种 patch 的职责划分。
这些能力不作为 main.js 多 Agent 首版的前置条件。
