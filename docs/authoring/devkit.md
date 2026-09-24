# 离线游戏卡开发包

<!-- devkit:omit:start -->
适用任务：修改离线资料收集、安装和版本检查。  
相关代码：`devkit/`、`src/tauri/build/devkit.rs`。  
前置文档：[游戏卡（Game Card）参考](../game_card/overview.md)
<!-- devkit:omit:end -->

开发资料和可选库已随 Tauri 客户端构建、安装，[项目初始化命令和 GUI 起步指令](./project_init.md)、[只读 dry-run](./dry_run.md) 和 [开发者模式日志](./runtime_trace.md) 也已接通。

## 内容与来源

```text
devkit/
  development.md                 # agent 阅读入口，含版本和当前能力边界
  libs.md                        # 所有内置库的选型索引，不表示已经接入
  spec/README.md                 # DSL 语法文档索引
  spec/game_card/overview.md      # 执行模型与生命周期
  spec/game_card/                 # 按 rules/presentation/packaging 分类的 DSL 文档
  spec/authoring/runtime_trace.md # 运行日志契约
  spec/compatibility/tavern/      # 相关转换语义
  templates/minimal/             # card.json + main.js + Agent JSON
  libs/worldbook-library/         # 通用脚本和 README/SEMANTICS
```

- 仓库 `devkit/` 只维护开发指南、索引及最小模板，不维护 DSL 或世界书脚本副本。
- `src/tauri/build/devkit.rs` 在 Cargo 构建时从 `docs/`、`libs/worldbook-library/` 和模板生成 `dist/devkit/`；产物不提交 Git。
- DSL 文档使用显式清单，内容同源复制；`devkit:omit:start/end` 注释之间的非 DSL 仓库导航不进入离线包。相对链接缺失会使构建失败。
- 世界书从 `libs/worldbook-library/` 复制全部脚本和文档，不从 WA2 卡复制，不携带配置、entry、测试或示例卡。
- 开发包版本跟随客户端，构建检查 Cargo/package/Tauri 版本一致；协议版本读取唯一 Schema 的 `x-schema-version`。
- 库内容版本是按相对路径排序后的脚本与文档 SHA-256，写入索引及生成的库 README；不新增 lib 加载协议或版本选择器。

## 构建与安装

`npm run dev`、`npm run build`、Tauri E2E 构建及直接 Cargo 构建均经过同一 `build.rs`，不需要额外运行开发包生成命令。构建时不下载文档和库；常规 Node/Rust 构建依赖仍按原构建流程准备。

Tauri `bundle.resources` 将 `dist/devkit/` 映射到安装资源目录的 `devkit/`，三个桌面平台共用。开发构建同时复制到对应 Cargo profile 的资源位置。安装包中的开发资料不依赖原仓库路径，开发者阅读和复制时不需要 Node/npm、平台源码或网络。

macOS 应用包内为 `Contents/Resources/devkit/`；其它平台使用 Tauri 对应的资源目录。系统配置 → 游戏卡开发 →“复制给 agent 的开发指令”提供实际客户端和文档阅读入口路径；实际客户端的 `--help` 返回开发包根路径，不让 agent 猜路径。AppImage 阅读内置文档期间需保持客户端打开。

构建只同步构建专用产物目录：输入变化后重新生成，移除已经不再分发的旧文件，未变化文件不改写。不能把该内部生成函数当成面向用户项目的初始化 API。

## 当前使用边界

agent 先阅读分发包中的 `development.md`，再调用 `client --init-project <目录> [--lib worldbook]`。客户端为新卡生成 UUID，默认不覆盖已有卡；手动复制模板时仍须替换占位 ID。

指南、lib 索引和完整 spec 复制到项目 `.wcs/` 后仍可通过相对链接查阅。所选库的脚本及文档复制到卡内 `lib/worldbook/`；新卡自动生成世界书空配置和接入，已有卡需按警告确认接入。不默认安装全部库，不覆盖已有卡内容。

项目初始化、dry-run 均提供独立完成边界和 JSON 结果，但不等于实际游玩验证。指南给出 dry-run 的静态检查边界，以及从标题栏开启开发者模式后，agent 使用起步指令的 gameCardsPath 和既有 active/index 文件定位当前 session 日志的方法；不要求用户提供 session ID 或复制日志路径。日志说明从同源文档复制到 spec。原生导入会安装/激活卡片，不是只读检查。

目录导入和导出排除根 `.wcs/`、session 和 Git 元数据；原生包拒绝 session，忽略 `.wcs/`。库及配套文档照常分发；发布前仍需检查卡内容中是否混入机器信息或密钥。
