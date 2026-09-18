# 客户端 dry-run

客户端提供原生只读语法检查入口，与 [项目初始化](./game_card_project_init.md)、卡片导入安装和实际游玩分开。调用不需要平台源码、Node/npm、网络或项目内启动脚本。

## 调用

以下 `client` 是从系统配置 → 游戏卡开发 →“复制给 agent 的开发指令”取得的实际可执行文件：

```text
client --dry-run <项目目录>
client --dry-run .
```

目录必须已存在，入口为目录内的 `card.json`；支持相对调用进程工作目录的路径、中文和空格。不接受压缩包、酒馆卡或单个 JSON 文件，也不隐式初始化项目。

参数只能出现一次，不能与 `--init-project`、`--lib` 或 `--help` 混用。通过进程工具直接启动、等待退出并读取 stdout，不使用会转交给现有应用窗口的“打开应用”命令。`--help` 同时列出初始化和 dry-run 用法。

## 检查范围

- JSON 解析、`$import` 展开、路径边界、文件存在、导入循环和深度上限。
- 唯一游戏卡 Schema、action/predicate 参数、跨字段约束及运行时补充校验。
- Schema 声明的文本、脚本、样式、图片、音频资源，目录 scope，以及外部 state schema。
- 所有规则及嵌套条件组中的 Content 模板、transform 和正则，包括当前可能不命中的分支。
- 静态 `{{file:...}}` 的授权、文件存在及唯一 Markdown 章节；精确 ID 优先，目录引用继续遵守 include scope。
- predicate、find、display、responseValidation 中可静态确定的 JavaScript 正则和 flags；display 全字面量片段数组可拼接检查。
- exec 的 inline/sourceFile、静态 include 的路径/循环/深度与 JavaScript 编译语法；还检查注册的 UI scripts 和 UI root 的现有编译语法。

平台复用正式 Content 解析器、scope 解析、exec include 展开和 Worker 编译函数；编译后不调用生成的函数。UI root 也只构造 factory，不执行模块初始化或渲染组件。任意 `args`、state 数据、display 字面量和文件正文不会被猜测成另一段 DSL。

目录 scope 是授权而非全目录注册。检查器不枚举世界书条目，只读取可静态确定的引用；lib 内部的配置格式、运行时选择的条目、`files.read/readText` 调用不通过执行脚本验证。

动态 file ID/章节和含 state 的 display 正则返回定位到原声明的警告，不代入猜测值。变量值、分支结果、JS 运行入口是否为函数及其返回值、lib 业务约束、CSS 外观和媒体解码不在检查范围内。语法通过不代表行为正确。

## 结果与退出状态

stdout 是单个 JSON 对象，以换行结束；不向项目或 session 写检查报告。示例：

```json
{
  "ok": false,
  "operation": "dry-run",
  "status": "invalid",
  "platformVersion": "1.0.8",
  "schemaVersion": "1.10.0",
  "projectPath": "/absolute/card-project",
  "checked": ["json", "imports", "schema"],
  "diagnostics": [{
    "code": "exec_syntax",
    "file": "lib/helper.js",
    "pointer": "",
    "message": "Unexpected token ';'"
  }],
  "warnings": [],
  "notChecked": ["不执行规则、脚本或 UI；不确认运行行为。"]
}
```

清单示例已缩略。`checked` 列出已进行的检查类别，`notChecked` 始终说明静态边界。结构或加载出错时停止后续检查；通过结构校验后可同时报告多处静态错误。没有错误但有警告仍可通过。

退出码：`0` 通过（`status: valid`）；`1` 校验不通过（`invalid`）；`2` 参数错误；`3` 无法完成检查（`failed`，例如项目目录不存在、桌面引擎不可用或检查器超时）。参数/环境错误通过 `error.code/message` 返回，不把未完成当作语法通过。

诊断有稳定 `code`、原始原因和源文件。JSON 字段使用 RFC 6901 Pointer，`$import` 数组展开后仍指向原文件的位置；JSON 解析错误附带 1 起算的行列号。include 文件独立编译的错误指向该 JS 文件；拼接冲突指向入口文件，可附 `reference` 指向调用它的原 JSON 字段。不伪造 JavaScript 引擎未提供的原文件行列。

常见类别：`parse_json`、`read_json`、`expand_import`、`validate_card`、`validate_files`、`load_state_schema`、`validate_state_schema`、`runtime_schema`、`content_syntax`、`file_reference`、`regex_syntax`、`exec_include`、`exec_syntax`、`ui_syntax`。

## 运行与副作用边界

原生层复用正式加载器和校验器，不经过安装/激活流程，不创建 AppStorage 或模型网络状态。所有项目读取继续通过卡目录边界检查，包括拒绝指向目录外的符号链接。

JavaScript 检查复用客户端自带的桌面 WebView 引擎，在不可见、非持久化的独立检查页面完成；不是游戏运行环境或调试窗口，不加载 React 应用，不运行任何规则阶段、脚本顶层代码、`run(ctx)` 或模型调用。检查页面只携带内嵌的平台检查代码，仅有获取待检查卡、卡内只读文本、返回结果三个命令，无安装、配置、会话或模型接口。

检查不修改项目、玩家存档、active card、模型配置或已有会话，不生成 session/trace，也不关闭用户已运行的客户端。WebView 所需缓存使用本次独占的系统临时目录，结束后清理，不使用平台业务数据目录。检查器启动/检查超过 30 秒返回检查失败。

这一实现不需要可见窗口或人工操作，但需要本机桌面 WebView 环境，不承诺无桌面的服务器或容器可用。Linux CI 可通过 Xvfb 提供显示环境；无 DISPLAY/WAYLAND_DISPLAY 时明确返回检查失败。
