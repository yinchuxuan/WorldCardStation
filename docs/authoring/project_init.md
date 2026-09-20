# 游戏卡项目初始化

<!-- devkit:omit:start -->
适用任务：修改初始化命令、模板和不覆盖保证。  
相关代码：`src/tauri/src/project_init.rs`、`devkit/templates/`。  
前置文档：[游戏卡（Game Card）参考](../game_card/overview.md)
<!-- devkit:omit:end -->

客户端原生入口使用 [随客户端安装的开发包](./devkit.md)。无需 Node、npm、Shell/PowerShell 启动脚本、独立 CLI 安装包、平台源码或网络。

## 调用

以下 `client` 代表实际客户端可执行文件，不是全局命令名：

```text
client --help
client --init-project <目录>
client --init-project <目录> --lib worldbook
```

- `--help` 返回 JSON，包含用法、当前内置库及实际开发包/指南路径。
- 目录可为绝对路径或相对调用进程当前目录的路径，支持空格和中文；不存在时创建。
- `--lib` 可重复，重复的同名库去重；当前只支持 `worldbook`，不选择时不复制任何库。
- 未知参数、缺少参数值、重复的 `--init-project` 或未知库明确失败；`--dry-run` 是独立的 [只读语法检查命令](./dry_run.md)，不能和初始化混用。
- 应由 agent 的进程工具直接启动客户端并等待退出、读取 stdout；不要通过会转交给已有应用进程的打开文件/应用命令调用。

macOS 已安装应用的可执行文件为 `.app/Contents/MacOS/world-card-station-tauri`；Windows 使用安装目录的 `.exe`，Linux 使用客户端可执行文件或 AppImage。可从下面的 GUI 入口取得实际路径，不要求设置 PATH。

初始化在创建 Tauri 窗口、应用数据目录和模型网络状态之前完成；不安装或激活卡片，不创建 session，不触发 init 规则，也不会关闭已经打开的另一个客户端进程。普通无参数启动行为不变。

## GUI 起步指令

系统配置 → 游戏卡开发 → **复制给 agent 的开发指令**。点击时客户端根据自身位置生成文本并复制，成功提示“已复制，请粘贴到 agent 对话中”。不弹目录选择器、不创建项目、不调用模型、不安装卡片或改写配置。

指令只要求 agent 先阅读开发指南，按需查阅 DSL spec 和 lib 索引，并用 JSON 提供必要本机路径：`executable`、`gameCardsPath`、`guidePath`、`specIndexPath`、`librariesIndexPath`。初始化、lib 接入、dry-run 和日志排查步骤统一写在开发指南中，不在复制文本中重复命令或流程。

实际游玩时点击标题栏的卡片图标开启开发者模式，点击名称仅打开切卡菜单。agent 使用 gameCardsPath 和既有两级 active.json 自行定位当前 session 的 trace.jsonl，按 index.json 确认名称；不要求用户复制日志路径。数据目录取自当前客户端存储，不接受 renderer 指定，不写入可提交的项目资料。

路径作为 JSON 数据提供，不生成分系统的 shell 命令。agent 按指南直接调用可执行文件；不分发启动脚本。Linux AppImage 使用原始 AppImage 文件作为启动入口，内置文档在临时挂载目录中，指南要求阅读期间保持 GUI 客户端打开。

客户端移动或重新安装后重新复制，不将本机路径写入游戏卡或提交 Git。读取入口缺失时明确报错；剪贴板不可用或写入被拒绝时展示完整只读文本，支持聚焦全选和手动复制。按钮生成期间禁止重复点击，失败后可重试。

## 生成与保留

新卡生成唯一 UUID 和最小 `card.json`，复制指南、lib 索引和 spec 到 `.wcs/`。不执行 Git 初始化、提交或发布，不生成 `devkit.json`、本机配置、测试输入、启动脚本或运行日志。

新卡选择世界书时生成：

```text
card.json                         # files 目录 scope + pre_send 普通 exec
lib/worldbook/*.js
lib/worldbook/README.md
lib/worldbook/SEMANTICS.md
worldbook/config.json              # 空 entries，配置属于卡作者
worldbook/entries/                 # 正文目录，不逐条注册
.wcs/...
```

`worldbook/config.json` 沿用既有库配置，`args.worldbook` 引用 scope；不增加新的平台 DSL。新卡所用的 `worldbook/`、`lib/worldbook/` 如已被占用会报冲突，不猜测已有内容用途。

已有卡：原样保留 `card.json`，包括 ID、规则顺序、`$import` 和尚未完成的内容。只新增缺失的开发支持，不校验整张卡或执行代码。选择世界书时提供缺失的库及配置，但不改写卡入口，返回警告要求作者确认目录授权和 exec 接入。

资料和库版本按组保护：

- 已有 `.wcs/` 开发资料整组保留，避免混入新版 spec。仅含普通笔记的目录仍可补充资料；已有部分受管资料却缺少阅读入口 `development.md` 时，报告冲突而不是返回不存在的指南。
- 已有非空 `lib/worldbook/` 整组保留，即使缺少模块也不擅自补入另一版本；警告说明需要审阅。
- 已有世界书配置和正文不覆盖；没有世界书需求时不触碰这些目录。
- 重复初始化不是更新命令，既不替换库或资料，也不重建卡 ID；移动或 clone 项目不需要隐藏注册记录。

## 结果协议

stdout 是单个 JSON 对象，以换行结束；Windows GUI 子系统版本也保留 agent 重定向的 stdout/stderr 管道，并可连接父控制台。

成功包含：

```json
{
  "ok": true,
  "operation": "init-project",
  "platformVersion": "1.0.8",
  "projectPath": "/absolute/card-project",
  "guidePath": "/absolute/card-project/.wcs/development.md",
  "cardId": "new-or-existing-id",
  "created": ["card.json", ".wcs/development.md"],
  "preserved": [],
  "warnings": [],
  "next": "先阅读项目中的 .wcs/development.md，按其中的流程开发游戏卡。初始化不是语法检查或实际游玩验证。"
}
```

文件清单示例已缩略。路径组以 `/` 结尾，`created` 只列新建文件；目录随所需文件创建，世界书正文目录即使为空也创建。已有卡无法读取 ID 时 `cardId` 为 null，不代表它已通过语法校验。

退出码：0 成功（可有警告）；2 参数错误或未知库；1 路径、资源、写入或结果输出失败。失败 JSON 包含 `ok: false`、`operation`、`platformVersion`、`error.code/message`。如不能完整清理，附加 `error.retainedPaths`，不会静默删除用户修改。

## 写入边界

初始化先在内存准备资料和文件计划，检查目标冲突，再创建文件；拒绝软链接、Windows reparse point、特殊文件、文件/目录类型冲突，以及开发包自身或其祖先目录。各次写入前重新检查目录边界，使用 `create_new`，不覆盖并发出现的文件。新卡入口最后写入。

写入阶段使用项目内临时 `.wcs-init.lock`，取得锁后重新检查计划，避免两个初始化进程使用彼此尚未完成的文件；存在锁返回 `project_busy`。正常完成或回滚后删除本次锁，强制终止留下的锁需确认无初始化进程后人工清理，不自动抢锁。

可捕获的写入失败只撤销本次新建、身份及内容未变化的文件，目录只尝试删除空目录；不递归删除项目。用户并发新增或修改的内容保留并报告。强制终止进程可能留下未完成的文件，后续初始化仍不覆盖，需要根据保留/冲突结果人工整理；这不是整个仓库的事务替换或升级机制。

初始化与 dry-run、导入安装及实际游玩相互独立。目录导入和导出排除根 `.wcs/`、sessions 和 Git 元数据；原生包导入忽略根 `.wcs/` 并拒绝 sessions。lib 脚本和配套文档随卡分发，发布前仍需检查内容中是否混入密钥或本机信息。
