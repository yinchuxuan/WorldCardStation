# 新运行时清单与加载契约

适用任务：formatVersion "1" 的双端加载边界。
相关代码：`src/shared/game-card/runtime/loadDefinition.js`、`src/tauri/src/game_runtime_definition.rs`。
前置文档：[运行时设计](./game_runtime_design.md)。脚本 API 见 [最小执行契约](./game_runtime_api.md)。
结构事实源仍为 `src/shared/game-card/schema/game-card.schema.json`；本文解释跨文件语义，不替代 Schema。

## 协议选择

- `formatVersion` 固定为字符串 `"1"`；缺失、旧版、数字或未知版本均在新加载器中拒绝，提示迁移。
- `version` 是作者的内容版本，不选择运行协议。
- 唯一 Schema 的 `runtimeManifest` / `runtimeAgent` 定义新清单，复用资源、State、操作等定义。
- 新协议 Schema 视图替换阶段枚举、收紧路径、给 find 增加 agentId；JS/Rust 按相同方式构造。
- Schema 发布版本为 x-schema-version 2.1.0，formatVersion 1 选择运行协议。
- 玩家入口拒绝旧版或未知版本；根部旧结构仅用于底层迁移/格式测试，不是播放器兼容承诺。

## card.json

```json
{
  "formatVersion": "1",
  "id": "my-game",
  "name": "我的游戏",
  "version": "1.0.0",
  "main": "main.js",
  "agents": {
    "judge": "agents/judge.json",
    "narrator": "agents/narrator.json"
  },
  "files": { "world": "content/world.md" },
  "stateSchema": "state/schema.json",
  "display": { "segmentedReading": true }
}
```

- 上述 formatVersion、id、name、version、main、agents 必填；agents 至少一个。
- Agent ID 为大小写敏感的字母开头标识，只允许字母、数字、下划线、连字符，最长 64 字符；禁用原型相关保留名。
- main 是卡内 `.js` 模块路径，不强制文件名必须为 main.js；导出 `async function onInput(ctx, input)`，可选导出 `async function onStart(ctx)`。
- agents 的值是独立 `.json` 文件路径，不接收内联对象或目录；同一个文件可供多个 ID 使用，运行实例仍独立。
- description、author、state、stateSchema、files、audio、visual、presentation、display、ui 延续现有含义。
- rules、responseValidation 移至各 Agent；card.json 不接受这两个顶层字段。
- 不添加 ui.entry、自动后台入口、依赖安装器或卡内密钥。

## Agent 文件

```json
{
  "model": "default",
  "rules": [
    {
      "when": { "phase": "pre_send" },
      "find": [{ "name": "judgment", "agentId": "judge", "from": { "role": "assistant", "index": "last" } }],
      "then": [{ "type": "insert", "role": "system", "content": "裁定：{{state:temp.find.judgment}}" }]
    }
  ]
}
```

- model、rules 必填；rules 允许空数组。responseValidation 可选，使用现有规则结构。
- model 是平台提供的配置引用，不是供应商 modelName、URL 或配置对象。
- `default` 表示平台当前配置；具体配置是否可调用在调用边界检查，加载不联网测试密钥。
- 其他字符串必须存在于宿主传入的 modelIds 中，缺失则报错，不回退 default。
- 当前产品只有一份模型配置，因此只能实际绑定 default；命名引用先通过测试宿主验证，不在本步骤增加配置管理 UI。
- 不接受 messages、state、files 或内联凭证。初始 Messages 通过该 Agent 的 init 规则构造。
- 所有 Agent 共用 card.files 内容授权及 State；所有文件路径相对于卡根目录，而非 Agent 文件目录。
- 阶段仅允许 init、pre_send、post_response；旧 after_stream / after_response 包括嵌套条件均拒绝。
- find.agentId 可选：省略查询自身；显式指定已声明 Agent 查询快照。CRUD 目标仍是自身。
- 查不到消息使用现有 find.default 语义；未知 Agent 是错误，不等同空历史。复制内容不共享对象。

## 加载边界

JS：`loadRuntimeDefinition({ readText, stat, modelIds })`；Rust：内部 `load_definition(root, model_ids)`。
JS 资源 adapter 的 stat 返回 `file` / `directory`，缺失或越界时抛错；readText 返回 UTF-8 文本。
两者必须在授权卡根内解析路径，包括 symlink/realpath 边界；不能直接将卡内路径作为任意 URL 请求。

1. 读取 card.json，检查协议和 manifest Schema。
2. 根据 x-file / 目录声明检查入口、Agent 文件以及卡片资源存在性。
3. 加载每个 Agent，校验 Schema、模型引用、跨 Agent 引用和规则文件存在性。
4. 加载 stateSchema（优先于 state.schema），校验 State schema；读取入口源码但不执行。
5. 返回 `{ formatVersion, card, main: { path, source }, agents, stateSchema }`。

agents 按 ID 保存 `{ id, file, definition }`。JS 返回深冻结快照；Rust 返回独立 JSON 值。
定义不含运行 Messages、初始化标记、模型密钥或平台配置；这些只在后续运行实例中存在。
所有路径拒绝绝对路径、反斜杠、盘符、空路径分量、`.` / `..` 分量及控制字符。
错误包含来源文件及相关字段；JSON 错误标出实际文件，跨文件引用错误不一律归到 card.json。

清单和 Agent JSON 均展开 `$import`，沿用卡根相对路径、深度/循环限制及数组整项展开。
JS definition/agent 返回 sources 源码映射；导入、发布和 dry-run 使用相同规则。
桌面资源存在性由原生加载边界检查；Web 使用完整缓存清单检查，不允许缺文件时请求未授权网络路径。
入口 JS 语法、onInput 导出和模块依赖校验属于受控脚本宿主；本边界只确认文件类型、存在性并读取源码。
运行、reader、模型请求和 UI 均不在此加载阶段执行。

## 契约验证

共享用例：`test/fixtures/runtime-definition-cases.json`，最小卡：`test/fixtures/runtime-definition/`。
JS/Rust 分别验证成功定义、缺文件、协议拒绝、路径逃逸、非法规则、模型和 Agent 引用等相同用例。
测试入口为 `test/game-card/runtimeDefinition.integration.test.js` 与 Rust `runtime_definition` 测试。
