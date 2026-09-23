# 最小执行契约

适用任务：按已定稿 API 实现后续主程序、Agent 调用和 reader。
相关代码：`src/shared/game-card/`、`src/renderer/chat/`；本页 API 的执行实现尚未交付。
前置文档：[运行时设计](./game_runtime_design.md)、[清单与加载](./game_runtime_manifest.md)。
以下名称及完成边界是后续实现的正式契约，不表示当前播放器已经提供这些 API。
本轮不提供并发、后台调用、独立前端或脚本恢复。

## 主程序与共享 State

入口：`export async function onInput(ctx, input)`。input 为本轮玩家输入字符串，不自动广播给 Agent。
ctx 只在当前输入轮有效；onInput 正常结束且调用、阅读均完成后，整轮才成功。

| 接口 | 返回与语义 |
| --- | --- |
| ctx.state.get(path) | JSON 值的快照；路径缺失返回 undefined |
| ctx.state.has(path) | 是否存在路径 |
| ctx.state.set(path, value) | 校验后同步写共享 State；返回 undefined |
| ctx.state.delete(path) | 同步删除；返回 undefined，缺失时不报错 |
| ctx.agents.call(agentId) | 同步返回 CallHandle，异步启动该 Agent |
| ctx.agents.messages(agentId) | 当前 Agent Messages 的只读快照数组，不触发初始化或调用 |
| ctx.createReader({ source, mode }) | 返回 Reader，绑定本轮共享 State 和卡片阅读配置 |
| ctx.present(reader) | Promise<void>，平台驱动阅读并保存实际展示记录 |

State 使用现有点路径、值校验和默认值，不暴露可原地修改的引用。
未知 Agent、重入或同时启动第二个未完成调用立即报错；合法调用的运行错误由 done() 拒绝。
rules.exec 不包含 agents.call，不允许绕过主程序递归调度。

## 调用句柄和消息

```js
const call = ctx.agents.call('narrator');
// CallHandle: { messageId: string, response: AsyncIterable<string>, done(): Promise<void> }
await call.done();
const msg = ctx.agents.messages('narrator').find(msg => msg.id === call.messageId);
if (msg) await ctx.present(ctx.createReader({ source: msg.content, mode: 'continuous' }));
```

- messageId 在返回句柄时分配，对应本次生成的 assistant msg.id；平台生成稳定 ID，规则不能改写 ID。
- Messages 延用现有 role/content/thinking/ttl/_meta 字段，增加平台维护的 id。
- response 只包含模型 assistant content 的原始文本增量，包括两种控制标签；不包含 SSE 包装或单独的 thinking 通道。
- 传输由 Agent 持续驱动并收集输出，即使无人读取 response，也能结束；隐藏调用只需 await done()。
- response 仅允许一个消费者，从本次输出起点消费；较晚订阅仍可消费已缓存前缀，不丢已生成内容。
- response 的迭代结束表示原始文本流结束，不代表后处理、阅读或整轮完成；任何路径都必须等待 done()。
- done() 可重复等待同一个完成结果；边界为生成 → 回复校验 → 普通 patch 提交 → post_response。
- init 按 Agent 标记仅执行一次；每次请求前推进该 Agent TTL 并执行 pre_send。
- post_response 修改 Messages，不修改 response 或已展示记录。若删除本次 msg，按 ID 查询返回缺失。
- messages(agentId) 返回调用时的副本；必须在 done() 后重新查询才能拿到后处理结果。
- 规则 find.agentId 同样读取执行时快照，沿用现有 from/select/match/many/default；写入操作只针对当前 Agent。

不得用 response 偷换“最终 msg”，也不得在目标 msg 被删除时自动退回 response。
初始化/规则插入的消息也由平台分配 ID；同一 Session 内 ID 不复用。

## Reader 输入和输出

source 必填，为 string 或 AsyncIterable<string>；只接受文本，静态 msg 传入其 content 快照。
mode 必填，只接受 `segmented` / `continuous`；脚本不可注入 applyPatch 或任意提交回调。
内部纯 reader 可以接收受控 applyPatch 依赖；ctx.createReader 只绑定本 Session 的模型写入校验接口。

`await reader.next()` 返回以下两种值之一：

```js
{ done: false, value: { text: '本段或本次增量', patches: ['{"scene":"school"}'] } }
{ done: true, value: undefined }
```

patches 是本次已成功提交的 state_patch_stream 标签内部 JSON 文本，按源顺序排列；不是待执行命令。
非分段模式始终返回空 patches。结束后 next() 继续返回 done:true；不得并发执行两个 next()。
reader 不修改 Messages，也不负责启动、重试模型或执行 post_response。

## 分段、过滤和提交

- segmented 输出完整段；continuous 输出过滤后的增量，不将网络 chunk 当作段落。
- 分段使用 card.display.segmentSeparator 的字面字符串；未配置时使用空行（`\n[ \t]*\n+`）。CRLF/CR 统一为 LF。
- state_patch_stream 也形成分段边界：先输出前文，后段显示前提交 patch；连续标签按顺序累积到后段。
- 空白正文不单独成页；末尾只有 patch 时输出 text:"" 的更新单元，present 不显示空白页。
- 预读和解析缓存不得提交；只有 next() 推进该单元时提交其 patch，成功后返回对应正文。
- 两种模式均过滤完整 `<state_patch>…</state_patch>` 和 `<state_patch_stream>…</state_patch_stream>`。
- continuous 对两种标签均不提交；segmented 仅提交 state_patch_stream。
- 普通 state_patch 由 Agent 从校验接受的完整原始响应提取并按源顺序提交一次，发生在 post_response 前。
- 两种标签沿用现有 patch JSON 结构和 llmWrite 限制；失败终止当前操作并使整轮失败，不能静默忽略。
- 标签大小写敏感、不带属性、不支持嵌套；标签内不能出现未转义的同类闭合标签文本。
- 必须缓冲跨 chunk 标签前缀；到 EOF 尚未闭合的控制标签报错，不泄漏为可见文字。
- 被过滤且不会执行的 patch 内容不解析 JSON；完整标签之外的普通文本照常输出。
- 静态来源按后处理后的 content 重新解析位置，不使用原始 response 的索引。

模型完成与阅读完成彼此独立；普通 patch 和阅读 patch 不保证跨通道顺序。
需要静态最终消息时先 await done()；下一 Agent 依赖阅读变量时先 await present(reader)。
present 每显示一段后等待玩家推进，再调用 next()；continuous 自动持续消费。
同一 Reader 的单元只提交一次；main 负责不对同一内容重新创建有副作用的 Reader，静态字符串不携带来源身份。
历史回看读取展示记录，不重新构造可提交 reader。
原始流已经展示或 reader 已提交副作用后，不得在底层透明重生成；失败统一回到整轮重试基准。

## 失败与生命周期

JS 异常、调用失败、解析/提交失败、玩家取消都使本轮失败，取消请求和阅读并恢复整轮基准。
未消费的隐藏 response 不阻止完成；已创建的 reader 必须读完，不能遗留跨轮继续消费。
call.done() 拒绝必须被宿主捕获；即使卡片尚在 await present，宿主也应终止阅读，不留悬挂任务。
Session 切换或卸载后，旧 ctx、reader 与迟到回调失效，不得写新 Session。
平台完成一轮后才允许保存；不持久化 Promise、Reader 或 JS 栈。
