# 内置 lib 索引

开发包版本：{{DEVKIT_VERSION}}；平台版本：{{PLATFORM_VERSION}}；DSL 协议版本：{{SCHEMA_VERSION}}。

本索引列出现有内置库，不代表已接入项目。通用接入流程见 [开发指南](./development.md)。

## worldbook

- 用途：按关键词、条件、递归和预算选择世界书条目，生成本轮模型消息。
- 库版本：`sha256:{{WORLDBOOK_VERSION}}`。
- 初始化参数：`--lib worldbook`。
- 开发包目录：`libs/worldbook-library/`，相对客户端 `--help` 返回的 `devkitPath`。
- 卡内目录：`lib/worldbook/`；入口：`lib/worldbook/index.js`。
- 文档：开发包库目录中的 `README.md`、`SEMANTICS.md`，获取后随库放在卡内目录。
