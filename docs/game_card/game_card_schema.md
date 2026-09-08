# 游戏卡协议 Schema

## 唯一事实源

`src/shared/game-card/schema/game-card.schema.json` 是游戏卡结构协议的唯一事实源。字段、action、predicate、content、资源路径及 UI 配置的增删只修改该文件，不再同步维护手写结构 validator。

协议在两个边界校验：

- Tauri 导入：先展开 `$import`，再使用嵌入的 shared schema 校验完整游戏卡。
- shared runtime：执行 `init`、`pre_send` 或 `after_response` 前校验。

两处返回同一组格式化错误。结构不合法时不会继续读取资源或执行规则。

## 跨文件语义

JSON Schema 不负责读取文件。schema 中带 `x-file: true` 的定义会由导入器收集，Tauri backend 随后确认对应文件存在。

以下检查仍属于加载边界，而不是结构 validator：

- `$import` 文件存在、路径安全、深度和循环引用。
- schema 标注资源的文件存在性。
- 外部 state schema 的 JSON 读取、默认值和字段约束。

新增文件型语法时，应复用带 `x-file` 的 path definition，使存在性检查自动生效。

## 版本

协议版本位于 schema 顶层 `x-schema-version`，当前为 `1.10.0`（新增 display 只读模板和深度）。它与游戏卡顶层 `version` 无关：后者由卡作者标记内容版本，不参与平台协议选择。

协议版本遵循 SemVer：

- major：删除语法、改变既有字段含义或新增必填字段。
- minor：向后兼容地增加可选字段、action 或配置类型。
- patch：不改变有效输入集合的错误信息、注释或约束修正。

当前 schema 使用 Ajv `$data` 表达字段间约束。Rust backend 实现等价语义检查，并通过共享 fixture 与 Ajv validator 保持一致；不得维护另一份 schema。
