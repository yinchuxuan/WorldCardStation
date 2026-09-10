# 游戏卡开发指南

开发包版本：{{DEVKIT_VERSION}}；平台版本：{{PLATFORM_VERSION}}；DSL 协议版本：{{SCHEMA_VERSION}}。

这是普通 Markdown 开发资料。每次开始开发或开启新的 agent 会话，先阅读本文件，再按需查阅 [DSL spec](./spec/README.md) 和 [内置 lib 索引](./libs.md)。无需安装 skill、npm 包或访问平台源码。

## 当前交付范围

本版提供随客户端安装的离线文档、最小模板、可选库、原生项目初始化命令，以及系统配置中的“复制给 agent 的开发指令”按钮。dry-run 语法检查入口和开发者模式 session trace 尚未提供；不要猜测或调用这些接口，也不要把初始化或普通导入称为 dry-run。

后续 dry-run 只检查语法和静态引用，不执行规则，不创建 session，也不生成 trace。trace 将由平台开启开发者模式后的实际游玩产生，用于观察规则对 messages/state 的影响；语法通过不代表行为符合预期。

## 离线开发包与项目副本

安装资源中的 `devkit/` 是只读原件，包含本文件、`libs.md`、`spec/`、`templates/minimal/` 和 `libs/`。从系统配置 → 游戏卡开发复制起步指令可取得本机客户端位置和阅读入口；调用 `client --help` 也可取得实际开发包和指南路径，不要猜测安装路径。所有依赖都在包内，外部规范链接仅作背景来源，断网不影响阅读与初始化。

按钮只复制文本，不初始化项目。客户端移动或重新安装后重新复制；AppImage 内置文档位于临时挂载目录，阅读期间保持客户端打开。本机路径仅用于本次调用，不写入项目中的文档、卡内容或 Git。

以下 `client` 代表本机实际客户端可执行文件路径，不是需要另行安装的命令；通过 agent 的进程工具直接传入参数，路径含空格时正确引用：

```text
client --help
client --init-project .
client --init-project . --lib worldbook
```

读取 `--help` 提供的指南与 lib 索引，按需求选择库，再运行其中一种初始化命令。不选库时只生成最小卡和 `.wcs/` 资料；新卡自动生成 UUID，随后由作者修改名称、描述、作者和内容。选用世界书时额外复制脚本和库文档，生成空 entries 配置、正文目录、目录 scope 和普通 exec 接入。

命令输出单个 JSON 对象并退出：`ok` 表示操作成功，`created` / `preserved` 列出新建和保留的文件或目录组，`warnings` 列出需人工处理的事项，`guidePath` 是下一步阅读入口。成功退出码为 0，参数错误或未知库为 2，其它失败为 1；失败原因在 `error.code/message` 中。失败回滚时无法安全清理的内容通过 `error.retainedPaths` 报告。

已有卡保留原始 `card.json`，即使尚未编写完整也不展开 `$import` 或执行规则；选库后根据警告手动接入，不自动修改规则顺序。已有开发资料或库作为整组固定版本保留，不补入新版模块；只有普通笔记的 `.wcs/` 仍会补充资料，存在部分资料但缺少 development.md 时报告冲突。更新不属于初始化，不默认覆盖文件。

初始化不打开窗口、安装卡片或创建 session，不影响已经打开的客户端。写入前检查路径和冲突，拒绝链接与目录外写入；失败仅清理本次创建且未被改动的内容。不要在安装资源中改稿，不创建指向客户端的软链接，不隐式初始化 Git、提交、联网下载或升级已有库。

初始化期间使用临时 `.wcs-init.lock` 防止同一项目并发初始化，正常完成或回滚后移除；`project_busy` 表示已有锁。强制终止后如锁残留，先确认没有初始化进程再清理，不自动抢占或覆盖。

建议结构：

```text
card.json
rules/                         # 按需用 $import 拆分
state/                         # 按需定义 state schema
lib/worldbook/                 # 仅选用世界书时复制，含库文档
worldbook/config.json           # 卡自己的世界书配置
worldbook/entries/              # 卡自己的 Markdown 正文
.wcs/development.md
.wcs/libs.md
.wcs/spec/
```

模板只包含最小的初始化规则，不默认添加状态、库、人物设定或模型配置。需要拆分时按 [JSON import](./spec/game_card/game_card_imports.md) 操作，不能凭目录名推断文件会自动加载。

## 编写与修改

- 优先使用 [普通 action](./spec/game_card/game_card_actions.md)、[条件](./spec/game_card/game_card_predicates.md) 和 [Content](./spec/game_card/game_card_content.md)；复杂计算再使用普通 `exec`。
- 规则和 action 按顺序运行，前面的消息和状态变化会影响后面的判断。阶段、TTL、响应提交时机见 [运行流程](./spec/game_card_design.md)。
- `sourceFile` 指向卡内 JS，入口是 `run(ctx)`；`args` 是脚本自定义的只读 JSON 对象。lib 没有额外加载机制或权限。
- 文本读取必须经过 `files` 精确注册或目录 scope 授权；目录授权不是枚举注册。世界书 entry 不逐条写入 `card.json`。
- [state schema](./spec/game_card/game_card_state.md) 负责变量默认值和约束；不要将玩家 session 或机器配置混入卡文件。
- [display](./spec/game_card/game_card_display.md) 只改变呈现；真正需要影响模型和历史时使用普通规则修改 messages。

保留开发者现有规则、内容与指定的库版本。agent 根据需求选择库，开发者的显式选择优先；有实质性功能取舍才询问。

## 检查与实际验证

当前可用平台原有导入流程加载卡片，导入会执行平台的结构、引用校验，但也会安装或激活卡片，不是只读检查；需要开发者实际操作或明确授权。不要宣称已完成尚未提供的 dry-run。

行为不符合预期时，先明确触发阶段、输入消息、相关 state、规则顺序和期望变化，再通过平台实际游玩验证。修改开发目录不会自动热更新已安装卡，应重新加载更新后的卡片；不要将一次导入成功当成剧情验证成功。

## 版本与发布

本文件版本对应这份固定资料，`card.json.version` 仍是卡作者维护的内容版本。客户端升级不自动替换项目副本，修改文档也不会改变 DSL 运行时。库版本见索引和随库 README。

卡内容、所选库及配套文档属于玩家包；`.wcs/` 仅供开发，可随项目 Git 保存，但不应随玩家包分发。当前导入/导出尚未统一排除 `.wcs/`，发布前请在独立发布目录中只整理卡内容，不要直接打包整个开发目录，也不要依赖 `.gitignore` 作为导出过滤器。

不分发模型密钥、本机路径、玩家 session 或完整行为日志。不需要生成 `devkit.json`、`inputs/`、`local.json`、`runs/` 或任何启动脚本。
