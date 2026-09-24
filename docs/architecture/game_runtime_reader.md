# Reader 与现有演出

适用任务：维护新运行时正文读取、演出更新和 Agent 历史。
相关代码：`src/shared/game-card/runtime/reader.js`、`src/shared/game-card/runtime/mainReaders.js`、`src/renderer/chat/useMainPresentation.js`。
前置文档：[最小执行契约](./game_runtime_api.md)、[受控主程序与输入轮](./game_runtime_main.md)。

## 读取与提交

ctx.createReader({ source, mode }) 接收字符串或 AsyncIterable<string>，mode 必须为 segmented 或 continuous。
返回对象仅有 next()；分段单元为完整正文段，连续单元为过滤后的文本增量，统一返回 { text, patches }。
next() 的完成、调用 done() 的完成和整个输入轮的完成仍为三个独立边界。

- 解析在专用 Worker 内执行，与共享 State 使用同一实例；卡片不能注入提交函数。
- 跨 chunk 保留可能的标签前缀，统一 CRLF/CR；两类完整控制块均不进入正文。
- 普通 state_patch 仍只在 Agent 接受完整响应后提交；reader 不重复解析它的 JSON。
- segmented 仅在 next() 返回该段前按源顺序提交 state_patch_stream，continuous 对两类块均不执行。
- 分段采用 card.display.segmentSeparator 字面分隔符，缺省为空行；stream patch 也形成边界。
- 正文前 patch 属于第一段，连续 patch 属于后段，末尾仅 patch 返回空正文单元，不显示空页。
- 不并发执行 next()，不允许把未读完的 reader 留到下一轮；错误使整轮失败。
- 阅读提交与异步规则阶段串行进入 State，避免规则快照覆盖已经提交的阅读变量。

分段在 reader 的原始输入上进行，随后每个已选单元复用 display rules、Markdown 和 sanitize。
这不同于旧播放器先 display 变换再分段；不使用旧 patch timeline 重算或提交新运行时的控制块。

## 展示与记录

ctx.present(reader, { waitForAdvance = true } = {}) 驱动本轮 reader，同一时间只能有一个 present，同一 reader 不重复 present。
segmented 默认每段等待玩家确认，包括最后一段。waitForAdvance 可为布尔值，或接收该段 text、同步返回布尔值的卡内函数。
该 text 已过滤控制标签，但尚未经过 display rules；false 表示显示本段后不等待确认，继续读取。continuous 始终自动消费。
present 仅在来源 EOF 且全部必要阅读确认完成后返回；不会遇到选项标记就提前截断来源。平台不识别卡片专属的选项标签。
返回只结束消费，不清空已展示画面，也不代表 main 返回；无确认的交互页可以保留并接受下一次输入。
平台确认只解除 Worker 的等待，不在 renderer 中执行脚本或重新 apply patch。
隐藏 Agent 不自动创建正文、占据阅读页或执行阅读 patch。

每次 present 生成独立可见记录：id、role、content、mode、units；units 保存实际消费的 text/patches。
content 是已展示正文，不含控制标签；patches 是已提交记录，不是恢复时待执行的命令。
可见记录独立于 Agent Messages，所以 post_response 改写或删除消息不会反向改写已展示的原始流。
仅 patch 的记录允许 content 为空，但不产生消息气泡。字符串来源无身份去重，main 不应对同一正文重复创建有副作用的 reader。

平台复用现有正文样式、Markdown 安全渲染和输入 action；分段点击/Enter 推进沿用交互目标过滤。
输入框不受运行锁或阅读等待控制；卡片通过自己的 UI/CSS 决定何时显示，主程序运行时提交的输入排队等待。标题栏不提供通用停止按钮；底层取消机制供重试和生命周期清理使用。运行锁不代表模型正在思考。
reading.previous/next/latest 回看已展示单元只移动 UI 游标，不重新解析、不恢复旧变量或重新播放演出。
卡内 UI 的 `ui.pendingInput` 为本轮等待首次 present 非空正文的玩家输入；正文展示、整轮结束/失败/取消后为 null，开场和读档也为 null。它是临时 UI 信息，不属于 State 或存档；旧正文、Agent 隐藏输出及纯变量 patch 不会清除它。

## 演出与失败

Worker 发布只读 State/上下文预览；背景、立绘、阅读面板和 BGM 继续由现有 presentation controller、资源适配器和播放器实现。
State 的演出字段变化按新值发布；阅读 patch 显式 set 同一 BGM 仍重新发起播放。
首个可见正文沿用 autoUpdateOnFirstToken：背景/立绘自动发布，continuous 也自动发布 BGM；隐藏输出不触发首正文行为。
规则的显式演出动作沿用已有控制器语义。请求密钥和资源 URL 不进入主程序 Worker。

输入开始保留完整 State、全部 Agent 上下文/初始化标记、可见记录、阅读位置和实际已发布演出目标。
失败时终止 Worker、模型和阅读等待，清除 pendingInput，但保留已展示正文、已提交变量和演出现场；迟到回调无权发布。retry 才恢复轮前基准。
即使 main 尚在等待玩家阅读，call.done() 失败也立即终止该轮；不在底层透明重生成。
snapshot() 只包含完整结果；view() 包括未完成或失败现场，只供显示。失败后禁止自动/手动保存，不把旧 snapshot 冒充当前现场保存。

## Agent 历史

共享 msg 历史页面标题栏按声明顺序显示 Agent 按钮，读取当前 Session 对应上下文的实际 Messages。
保留 message id、role、content、thinking、ttl 和元数据；显示规则修改后的消息，不是可见记录。
空 Agent 显示空状态；切换 Session 后选择失效时回到首个 Agent，立即停止展示旧 Session 数据。
查看及切换只读，不触发初始化、调用、规则或 reader。

## 交付边界与验证

此能力由 mainSession 接入双端共用 ChatRuntime；新协议保存 runtimeSession，不写入旧卡格式存档。
完整数据与阅读/演出恢复见 [多 Agent Session](./game_runtime_sessions.md)，不持久化 Reader、Promise 或 JS 栈。
reader 单元测试覆盖双来源/双模式、跨 chunk、提交时点和错误；真实 Worker 集成验证后处理差异、隐藏输出与整轮回滚。
共享 React 测试验证历史隔离及演出恢复；浏览器 main-reader 用例通过本地 SSE、真实资源缓存和播放器覆盖逐段演出及失败恢复。
