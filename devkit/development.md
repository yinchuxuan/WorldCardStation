# 游戏卡开发指南

开发包版本：{{DEVKIT_VERSION}}；平台版本：{{PLATFORM_VERSION}}；DSL 协议版本：{{SCHEMA_VERSION}}。

## 1. 准备项目

在开发者指定的游戏卡目录中工作。从客户端“系统配置 → 游戏卡开发 → 复制给 agent 的开发指令”取得本机 `executable` 和 `gameCardsPath`；以下 `client` 代表该可执行文件的实际路径，不是全局命令。

直接启动可执行文件并传递独立参数，不要通过打开应用的命令转交给已运行窗口。客户端移动或重新安装后重新复制指令；AppImage 阅读内置文档期间保持客户端打开。

先查看 [内置 lib 索引](./libs.md)，按游戏卡需求或开发者指定选择库。尚未初始化项目时执行：

```text
client --init-project .
```

选用内置库时追加 `--lib <库 ID>`，多个库重复提供 `--lib`；支持的 ID 以当前客户端 `--help` 和库索引为准。等待命令退出，读取 JSON 结果，确认 `ok` 并处理 `warnings`；成功后阅读项目中的 `.wcs/development.md`。保留已有文件，不通过删除内容解决初始化冲突。

## 2. 编写游戏卡

按需查阅 [DSL spec](./spec/README.md)，编写根目录的 `card.json`、规则、状态和内容资源。优先使用普通 DSL，复杂逻辑再用 `exec` 或 lib。

接入 lib 时，按以下流程操作：

- 从库索引或开发者提供的库中选型，先阅读该版本的 README，确认用途、入口、参数和依赖。
- 内置库按索引通过初始化命令获取；其它库按其文档将所需脚本及配套文档复制到卡内（通常为 `lib/<库名>/`），保持相对目录结构，不直接引用客户端或平台源码中的库。
- 按库文档准备游戏卡自己的配置、内容和资源授权，在指定规则阶段通过普通 `exec` 的 `sourceFile`、`args` 调用入口；共享脚本依赖按需使用 `include(...)`。具体字段以库文档为准，语法见 [exec](./spec/game_card/game_card_actions.md#exec)。复制文件不等于完成接入。

脚本、库和资源放在游戏卡目录内，使用相对路径；文本读取遵守 `files` 注册或目录 scope 授权。保留开发者已有内容和指定的库版本。

## 3. 检查语法

每次修改后，在项目目录直接启动客户端并等待退出：

```text
client --dry-run .
```

读取 stdout 的 JSON 报告，根据 `diagnostics` 中的文件位置和原因修复，再次检查；同时阅读 `warnings`、`checked` 和 `notChecked`。退出码：0 通过，1 校验错误，2 参数错误，3 检查未完成。

dry-run 只检查语法和静态引用，不执行规则、不调用模型、不生成 session 或 trace；通过不代表行为符合预期。

## 4. 实际验证与排查

由开发者点击游戏卡标题 → 导入卡片，选择项目根目录的 `card.json`，客户端会导入整个项目目录。点击标题栏左侧的卡片图标开启开发者模式，正常游玩复现问题；agent 随后排查当前会话。

在 `gameCardsPath` 下读取 `active.json` 获取卡 ID，再读 `cards/<card-id>/sessions/active.json` 获取 session ID，最后读取该 session 目录的 `trace.jsonl`。若已切换会话，按原名称在对应卡的 `sessions/index.json` 中查找；同名时确认目标。

按 [运行日志说明](./spec/game_card/game_card_runtime_trace.md) 对照预期检查 messages/state 的实际变化。核对日志归属、复现时间和完整性；日志缺失时先确认记录已开启并重新复现。只读平台数据，修复在开发仓库中进行。

修复后重新 dry-run，再由开发者重新导入并验证；修改源码不会自动更新已安装卡。不要将日志、密钥或本机绝对路径放入卡内容或提交 Git。
