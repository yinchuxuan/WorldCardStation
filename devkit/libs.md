# 内置 lib 索引

开发包版本：{{DEVKIT_VERSION}}；平台版本：{{PLATFORM_VERSION}}；DSL 协议版本：{{SCHEMA_VERSION}}。

本索引只供选型，不是运行时注册表。列出某库不代表已接入项目。先按游戏卡需求判断，开发者的指定或限制优先，不默认复制全部库。

## worldbook

- 用途：按关键词、条件、递归和预算选择世界书条目，生成本轮模型消息。
- 适合：世界设定较多、需要按上下文激活正文，或使用 V2/V3/ST 世界书配置的游戏卡。少量固定提示可以直接用普通规则。
- 库版本：`sha256:{{WORLDBOOK_VERSION}}`，由本次分发的脚本及文档内容计算，不使用游戏卡内容版本。
- 接口：普通 `exec sourceFile`，通过 `args.worldbook` 指定 `files` 目录 scope ID；不会增加世界书专用平台语法。
- 限制：没有向量检索、ST 插件执行和完整提示词管理器；预算是估算值，受普通 exec 沙盒和总超时限制。详细能力边界以所选版本文档为准。

## 离线获取和接入

客户端开发包中相对位置为 `libs/worldbook-library/`，先阅读其中的 `README.md` 和 `SEMANTICS.md`。本索引不保存机器绝对路径；调用实际客户端的 `--help` 获取开发包位置。

选用后调用 `client --init-project <目录> --lib worldbook`。初始化将全部脚本和 `README.md`、`SEMANTICS.md` 复制到卡内 `lib/worldbook/`，相对链接保持有效，项目里的这份文档是所选库版本的依据。已有库整组保留，不补入可能不兼容的新版模块。

新卡同时生成卡自己的 `worldbook/config.json`、空 `entries/` 目录、目录 scope 和普通 exec，作者按 README 填写配置及正文。已有卡不会改写原规则，需根据命令警告确认接入。正文文件名由作者决定，通过 `content_file` 对应稳定 entry ID；不逐个注册 entry。不复制整张示例卡，也不从示例卡提取另一份库。

没有选用的库不需要复制；之后需要时仍可从同一离线包获取。已有库默认不覆盖，升级时整体审阅并替换同版本脚本和文档，保留卡自己的配置及正文。

普通脚本和 lib 的调用、参数、include 和权限语义见 [exec](./spec/game_card/game_card_actions.md#exec)，目录授权见 [Content 文件引用](./spec/game_card/game_card_content.md#文本文件)。
