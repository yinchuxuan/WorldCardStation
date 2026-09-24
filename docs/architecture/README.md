# 平台架构索引

跨模块改动先读架构总览；其余只选择本次任务涉及的契约。

- [架构总览](./overview.md)：模块职责、依赖方向与数据边界。
- [平台适配](./platform_adapter.md)：双端服务、能力与策略。
- [Session](./sessions.md)：会话切换、快照、保存与恢复。
- [共享 UI](./ui.md)：视觉、布局和交互约束。
- [Web 设计](./web.md)：浏览器端产品边界、静态部署、资源缓存和本地存档契约。
- [游戏运行时重构设计（草案）](./game_runtime_design.md)：main.js 顺序编排多 Agent、共享变量，复用现有界面和演出；不是当前协议。
- [新运行时清单与加载契约](./game_runtime_manifest.md)：formatVersion 2 的内部定义、资源路径与模型引用。
- [最小执行契约](./game_runtime_api.md)：后续主程序、调用句柄、消息快照和 reader 的正式 API。
- [受控主程序与输入轮](./game_runtime_main.md)：Worker 隔离、卡内模块、整轮重试和内部输入通道。
- [游戏运行时重构实施步骤](./game_runtime_implementation.md)：分阶段交付、依赖关系、测试与验收门槛。
