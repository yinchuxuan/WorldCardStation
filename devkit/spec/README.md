# DSL spec 阅读索引

本目录是供 agent 查阅的语法、语义文档，不是校验器、JSON Schema 副本或运行配置。对应版本见 [开发指南](../development.md)。平台使用自身唯一 Schema 校验，修改这里的文档不会改变运行行为。

文档从平台现有协议文档同源生成。正文中提及的源码位置、内部函数和仓库测试命令仅用于解释实现，不是开发游戏卡的依赖；开发者无需平台源码、Node 或 npm。标为“后续”“未来”的扩展不是当前承诺支持的语法。

## 按任务查阅

| 任务 | 文档 |
| --- | --- |
| 消息结构、可见性、TTL、规则阶段和执行顺序 | [游戏卡运行流程](./game_card_design.md) |
| 卡结构校验与协议版本 | [Schema 边界](./game_card/game_card_schema.md) |
| insert/remove/replace、state action、exec/args/include | [操作](./game_card/game_card_actions.md) |
| 消息匹配、逻辑组合、最近 N 条 | [Predicate](./game_card/game_card_predicates.md) |
| 模板、文件/目录授权、find、include/select、transform | [Content](./game_card/game_card_content.md) |
| JSON 文件拆分与加载限制 | [JSON import](./game_card/game_card_imports.md) |
| 变量默认值、约束、引用、state_patch、持久化 | [State](./game_card/game_card_state.md) |
| 显示变换与分段阅读 | [Display](./game_card/game_card_display.md)、[只读模板和深度](./game_card/game_card_display_templates.md) |
| 回复契约与自动重试 | [Response validation](./game_card/game_card_response_validation.md) |
| BGM、背景、CG、立绘与阅读面板 | [Audio](./game_card/game_card_audio.md)、[Visual](./game_card/game_card_visual.md)、[面板](./game_card/game_card_visual_panel.md) |
| CSS、自定义 React root 与受控 UI 事件 | [UI runtime](./game_card/game_card_ui_runtime.md) |
| 实际游玩行为排查、session 日志格式与完整性 | [Runtime trace](./game_card/game_card_runtime_trace.md) |

库说明不属于 DSL spec，见 [内置 lib 索引](../libs.md)。lib 与普通 exec 使用同一套权限和参数语义。

## 最小模板与资源组织

开发包的 `templates/minimal/card.json` 是初始化用模板。客户端 `--init-project` 为新卡自动生成 UUID；手动复制时也必须替换占位 ID。模板本身不依赖任何库或外部文件。

入口必须叫 `card.json`，不是 `cards.json`。`rules/`、`state/`、`lib/` 等只是推荐目录，不会自动加载。通过 `$import`、`stateSchema`、`sourceFile` 或资源声明显式引用所需内容。

卡片原生分发容器是 `.gamecard` 或携带平台 payload 的 PNG，根目录同样包含 `card.json`；不得将玩家 session 和开发资料当成游戏内容分发。当前离线包不提供独立打包器或启动脚本。
