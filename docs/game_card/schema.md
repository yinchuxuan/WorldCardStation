# 游戏卡协议 Schema

<!-- devkit:omit:start -->
适用任务：修改卡结构校验与协议版本。  
相关代码：`src/shared/game-card/schema/`。  
前置文档：[游戏卡（Game Card）参考](overview.md)
<!-- devkit:omit:end -->

## 唯一事实源

`src/shared/game-card/schema/game-card.schema.json` 是游戏卡结构协议的唯一事实源。字段、action、predicate、content、资源路径及 UI 配置的增删只修改该文件，不再同步维护手写结构 validator。

协议在两个边界校验：

- Tauri 玩家导入：展开清单和 Agent 的 `$import`，校验新协议、文件和模型引用。
- 双端加载：使用 `runtimeManifest` / `runtimeAgent` 视图校验定义，再读取主程序模块。

视图由唯一 Schema 的 definitions 与 x-runtime-overrides 生成，JS/Rust 使用相同约束。
根部旧卡结构仅供底层格式/迁移检查，不是玩家可用协议。结构不合法时不执行卡片脚本。

## 跨文件语义

JSON Schema 不负责读取文件。schema 中带 `x-file: true` 的定义会由导入器收集，Tauri backend 随后确认对应文件存在。

以下检查仍属于加载边界，而不是结构 validator：

- `$import` 文件存在、路径安全、深度和循环引用。
- schema 标注资源的文件存在性。
- 外部 state schema 的 JSON 读取、默认值和字段约束。

新增文件型语法时，应复用带 `x-file` 的 path definition，使存在性检查自动生效。

## 版本

<!-- devkit:omit:start -->
维护者的加载契约见 [新运行时清单](../architecture/game_runtime_manifest.md)。
<!-- devkit:omit:end -->

Schema 发布版本为 `x-schema-version: "2.0.0"`。玩家卡片使用 `formatVersion: "2"` 选择新协议；
顶层 `version` 由卡作者标记内容版本，不参与平台协议选择。新语法见 [清单与主程序](./runtime.md)。

协议版本遵循 SemVer：

- major：删除语法、改变既有字段含义或新增必填字段。
- minor：向后兼容地增加可选字段、action 或配置类型。
- patch：不改变有效输入集合的错误信息、注释或约束修正。

当前 schema 使用 Ajv `$data` 表达字段间约束。Rust backend 实现等价语义检查，并通过共享 fixture 与 Ajv validator 保持一致；不得维护另一份 schema。
