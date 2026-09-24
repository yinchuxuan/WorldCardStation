# 受控主程序与输入轮

适用任务：维护新协议 main.js 宿主、顺序调度、整轮重试和输入适配。
相关代码：`src/renderer/gameCard/mainSession.js`、`src/renderer/platform/mainRuntime.worker.js`、`src/renderer/chat/useMainGeneration.js`。
前置文档：[最小执行契约](./game_runtime_api.md)、[清单与加载](./game_runtime_manifest.md)。

## 运行边界

`createBrowserMainSession({ definition, readText, generate, timeoutMs })` 创建一个 Session 的内部主程序实例。
definition 来自新清单加载器；readText 必须绑定当前授权卡根，校验规范路径与 realpath，不能解释为任意 URL。
generate 由平台模型适配器提供，仍使用独立 AbortSignal 和内容/thinking 回调；配置和密钥不发送到 Worker。
测试可以向 createMainSession 注入同契约的 workerFactory，不在 renderer 主线程执行卡片源码。

- start()：新 Session 按顺序执行全部 init 后调用可选 onStart，完成后幂等；恢复的已启动 Session 不执行脚本。
- send(input)：进入 Session 内 FIFO；启动及前一轮结束后，从最新完整结果执行 onInput。返回该轮完成的只读快照 Promise。
- retry(input?)：清空待执行输入，取消并等待当前轮退出，再从上一轮开始前的基准重跑；可替换玩家输入，不是只重试最后一个 Agent。
- cancel()：清空待执行输入，终止当前 Worker、取消模型请求并等待退出；之后可以再次 send/retry。
- dispose()：永久停止实例；切换 Session、卸载卡片或销毁输入宿主时调用。
- snapshot()：返回最后完整结果的副本；view() 保留执行或失败现场。running 只表示正在执行/取消，failed 表示失败现场未解决；pendingCount 为待执行输入数。
- view()/subscribe(listener)：宿主只读观察当前临时 State、Agent 历史和可见记录；不是可保存快照。
- advance()：确认当前显示段已读完；没有等待阅读时返回 false，不预先消费下一段。

一轮只允许一个未完成 Agent，主程序通过 await call.done() 顺序推进。
State API 同步校验、写入和读取，和 Agent 引擎位于同一个 Worker，不使用异步镜像替代同步语义。
调用期间 main 不得 set/delete State；完成后可立即读取普通 patch 和 post_response 的结果。
Messages 查询是只读副本，输入不自动写入或广播给任何 Agent。

输入轮严格串行；present 完成不等于 onInput 返回，后续游戏逻辑仍属于当前轮。
失败时停止执行并暂停队列，保留待执行输入；不自动跳过失败轮。退出 loading，但禁止新输入及保存；retry 清空队列并恢复轮前基准后重跑。取消队列不将失败现场标为成功。
pending 队列只存于内存，不进入存档；beginLoad/dispose 同样取消当前轮并清空队列。
运行锁保护 State 和 Agent 历史，不决定输入框显隐或可编辑性。UI 发送在入队时返回成功并清空草稿，完成/失败通过订阅更新。

## 卡内模块

main 指向的模块必须导出函数 onInput(ctx, input)，可选导出函数 onStart(ctx)。非函数导出会报错。
支持静态相对路径 import、命名导入/别名、namespace 导入，以及命名 function/class/简单 const 声明导出。
依赖先加载、每轮求值一次；导出是初始化时的只读命名空间快照，不支持完整 ESM 的动态 live binding。
不支持 default/re-export、export let/var、解构导出、动态 import、import.meta、顶层 await 或循环依赖。
依赖文件必须带 .js 后缀；允许 ../ 到卡内父目录，但不能越过卡根；不访问 npm、URL 或系统模块。
图深度上限 32，模块数上限 128；错误标注来源文件，不能将缺失导出当作 undefined 继续调用。

源码图和静态内容在 Session 内加载复用；模块实例、局部变量和闭包每轮重新创建。
跨轮游戏数据应写入共享 State，而不是依赖模块级变量。脚本修改后需重新创建 Session 实例。
Agent 的内容和 exec include 复用现有授权、预加载和返回值检查；exec 与 main 使用同一个隔离执行环境。
exec 不获得 agents.call，也不能借助动态编译绕过 main 的调度。

## 隔离、超时和完成

每轮使用一个可终止 Worker。脚本只收到 State/Agent 和 reader/present API；不接触 DOM、网络、存储、定时器、Worker 消息通道或平台配置。
模块通过 AST 检查和受控编译加载，禁用动态 import/eval/Function；禁用函数构造器链并冻结基础对象原型。
全局能力采用允许列表；无法屏蔽的宿主全局会使初始化失败，不降低隔离继续执行。
这些限制只应用于专用 Worker，不修改现有 renderer 或旧 exec 的全局环境。

默认响应性检测窗口为 2 秒：Worker 不响应探测时终止；模型/授权文件/玩家阅读等待期间只要 Worker 能响应则不消耗这个窗口。
因此它是可运行性看门狗，不是精确 CPU 计量器。没有平台工作却悬挂的 Promise 也会报错，不允许隐式后台任务。
脚本同步或微任务死循环均可终止；模型等待期间的超时仍由现有传输层负责。

onInput 返回时必须没有未完成调用、reader 或 present。未读取的隐藏 response 不影响成功；调用或 reader 失败都会使整轮失败，脚本 catch 不能将其转为成功提交。
Worker 的临时数据通过只读 view 更新演出和历史；只有整轮成功才更新 Session 的完整 snapshot。异常/超时停止并保留最后已发布的变量、历史及画面，不自动回滚；失败 patch 不提交。
只有 retry 才从失败现场恢复轮前基准并重新执行；切换/卸载丢弃现场。内部主动取消仍清理当前执行，不允许迟到结果写入。
重试成功轮同样从原始基准开始，不重复追加上下文；失败轮分配过的消息 ID 不在下一轮复用。
终止后不再接收旧 Worker 结果，迟到模型/文件回调也不能写回新 Session。

## 输入与交付边界

共享 useMainGeneration 接受 mainSession，统一发送、重试和取消入口。普通聊天使用内置默认卡，关闭 statePatch 协议，经过同一 Worker、Agent 和 reader/present；不是另一条生成管线。
GameCardRuntimeProvider 从已验证的卡片准备主程序与 Agent 定义，加载期间禁止输入。
切卡销毁旧实例，Session 切换通过 beginLoad/restoreHistory 恢复数据；异步加载结果按请求代次隔离。
普通聊天和导入卡均由玩家入口创建运行时，使用带版本的完整 Session 保存恢复，不执行旧生成管线。
reader/present 的读取、展示记录与演出桥见 [Reader 与现有演出](./game_runtime_reader.md)。
保存与恢复接口见 [多 Agent Session](./game_runtime_sessions.md)。只转换普通聊天旧历史，不迁移旧卡存档。

普通聊天默认卡是平台随包提供的 card.json、单 Agent 定义和 main.js 内容，通过正常定义加载器校验并在 Worker 中运行，不安装到卡仓库。
它使用 continuous reader、关闭 statePatch，并保留普通聊天的折叠历史、编辑重试和思维链界面。
普通聊天传输适配器将首个内联 thinking 块分离到思维链通道；游戏卡仍接收原始 response，不受此兼容处理影响。
缺少模型配置或请求失败同样停止本轮、保留现场并禁止保存；修复配置后可整轮 retry。取消丢弃当前未完成轮，恢复轮前基准；不再保存部分模型响应。

## 验证

单元测试覆盖模块路径、导出、资源加载、调用完成、宿主响应性、输入切换和重试边界。
mainSession/mainSandbox 集成测试用真实 Worker 运行同一份浏览器 bundle，验证顺序、回滚、取消、隔离与计算终止。
Web 浏览器集成的 main-program 用例验证生产 Worker 构建、原生全局隔离、模块加载与强制终止；纳入现有三浏览器矩阵。
