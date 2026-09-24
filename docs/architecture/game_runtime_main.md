# 受控主程序与输入轮

适用任务：维护新协议 main.js 宿主、顺序调度、整轮重试和输入适配。
相关代码：`src/renderer/gameCard/mainSession.js`、`src/renderer/platform/mainRuntime.worker.js`、`src/renderer/chat/useMainGeneration.js`。
前置文档：[最小执行契约](./game_runtime_api.md)、[清单与加载](./game_runtime_manifest.md)。

## 运行边界

`createBrowserMainSession({ definition, readText, generate, timeoutMs })` 创建一个 Session 的内部主程序实例。
definition 来自新清单加载器；readText 必须绑定当前授权卡根，校验规范路径与 realpath，不能解释为任意 URL。
generate 由平台模型适配器提供，仍使用独立 AbortSignal 和内容/thinking 回调；配置和密钥不发送到 Worker。
测试可以向 createMainSession 注入同契约的 workerFactory，不在 renderer 主线程执行卡片源码。

- send(input)：从当前已完成结果开始一轮，成功返回包含 state/contexts 的只读快照。
- retry(input?)：从上一轮开始前的内存基准重跑，可替换玩家输入；不是只重试最后一个 Agent。
- cancel()：终止当前 Worker、取消模型请求，等待输入退出；可以再次 send/retry。
- dispose()：永久停止实例；切换 Session、卸载卡片或销毁输入宿主时调用。
- snapshot()：返回最后完整结果的副本，不暴露执行中的半轮 State；running 表示输入是否未结束。

一轮只允许一个未完成 Agent，主程序通过 await call.done() 顺序推进。
State API 同步校验、写入和读取，和 Agent 引擎位于同一个 Worker，不使用异步镜像替代同步语义。
调用期间 main 不得 set/delete State；完成后可立即读取普通 patch 和 post_response 的结果。
Messages 查询是只读副本，输入不自动写入或广播给任何 Agent。

## 卡内模块

main 指向的模块必须导出函数 onInput(ctx, input)，通常写成 export async function onInput。
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

每轮使用一个可终止 Worker。脚本只收到 State/Agent API；不接触 DOM、网络、存储、定时器、Worker 消息通道或平台配置。
模块通过 AST 检查和受控编译加载，禁用动态 import/eval/Function；禁用函数构造器链并冻结基础对象原型。
全局能力采用允许列表；无法屏蔽的宿主全局会使初始化失败，不降低隔离继续执行。
这些限制只应用于专用 Worker，不修改现有 renderer 或旧 exec 的全局环境。

默认响应性检测窗口为 2 秒：Worker 不响应探测时终止；模型/授权文件等待期间只要 Worker 能响应则不消耗这个窗口。
因此它是可运行性看门狗，不是精确 CPU 计量器。没有平台工作却悬挂的 Promise 也会报错，不允许隐式后台任务。
脚本同步或微任务死循环均可终止；模型等待期间的超时仍由现有传输层负责。

onInput 返回时必须没有未完成调用。未读取的隐藏 response 不影响成功；任一 call.done() 失败都会使整轮失败，脚本 catch 不能将其转为成功提交。
只有整轮成功才把 Worker 的 State、全部 Messages 和 init 标记发布到 Session；失败、取消、超时均丢弃临时结果。
重试成功轮同样从原始基准开始，不重复追加上下文；失败轮分配过的消息 ID 不在下一轮复用。
终止后不再接收旧 Worker 结果，迟到模型/文件回调也不能写回新 Session。

## 输入与交付边界

共享 useChatGeneration 接受内部 mainSession 注入，复用现有发送、重试、停止入口；普通聊天和旧播放器保持原路径。
GameCardRuntimeProvider 的 mainSession 由内部宿主管理，Session 切换必须替换实例，输入 Hook 释放旧实例。
此通道尚不由普通导入流程自动创建；注入时禁用旧格式的自动及手动保存，关闭时仅清理，不写入旧 Session 存档。
当前主程序只开放 State/Agent API，reader/present 和可见演出记录由独立 reader 契约接入，不伪造空实现。
新协议仍未向普通玩家开放，也没有存档恢复或旧卡兼容承诺。

## 验证

单元测试覆盖模块路径、导出、资源加载、调用完成、宿主响应性、输入切换和重试边界。
mainSession/mainSandbox 集成测试用真实 Worker 运行同一份浏览器 bundle，验证顺序、回滚、取消、隔离与计算终止。
Web 浏览器集成的 main-program 用例验证生产 Worker 构建、原生全局隔离、模块加载与强制终止；纳入现有三浏览器矩阵。
