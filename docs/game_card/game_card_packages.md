# 游戏卡导入导出与分发容器

## 目标与边界

平台使用同一份游戏卡目录作为运行时和开发时真相源，并提供两种单文件分发容器：

- `.gamecard`：用于高效发布、备份和稳定导入。
- `.png`：用于像图片一样预览和分享，同时携带完整游戏卡。

两种容器携带完全相同的 ZIP payload，导入后都安装为普通游戏卡目录。不设计第二套 card schema，不将 Session 作为游戏卡内容分发。

本文定义平台原生容器。酒馆 V2/V3 复用“导入卡片”入口，自动转换成普通游戏卡目录，进入共用校验和安装管线；仅兼容差异或显式覆盖需要确认，当前范围见 [酒馆卡导入与转换设计](./game_card_tavern_import.md)。下述原生 PNG/ZIP 规则不直接用于解释酒馆 payload。

## 规范目录

`card.json` 必须位于容器根目录，不得多包一层卡名目录：

```txt
card.json
audio.json
visual.json
files.json
display.json
ui.json
rules/
state/
images/
audio/
ui/
```

`card.json.id` 是安装标识，相同 id 表示更新已安装卡；`card.json.version` 是卡作者维护的内容版本，与平台 schema 版本无关。

容器不包含 `sessions/`（含 trace）、`.wcs/`、`.git/`、`.DS_Store`、`__MACOSX/`、资源分叉文件或已生成的导出物。lib 脚本与配套文档保留。开发目录始终是可编辑源，容器只是构建产物。

PNG 导出需要封面。平台后续可在 schema 中增加可选 `cover` 图片路径；未声明时由导出命令要求显式选择，不从背景资源中猜测。

## `.gamecard` 容器

`.gamecard` 是带专用扩展名的 ZIP 文件。容器 v1 不增加 `manifest.json`；`card.json` 仍是唯一入口，容器版本由导入器协议管理。

导出器必须使用固定路径排序、规范化时间戳和文件属性，保证相同输入产生相同字节。文本适用 Deflate；PNG、MP3、OGG 等已压缩资源使用 Store 或低成本压缩。

## PNG 图片容器

PNG 容器是合法 PNG datastream。封面的 `IDAT` 保持不变，完整 `.gamecard` 字节放入最后一个 `IDAT` 之后、`IEND` 之前的私有 ancillary chunk：

```txt
PNG signature -> IHDR/.../IDAT -> gcAr[0..n] -> IEND
```

`gcAr` 的四个字母依次表示 ancillary、private、保留位合法和 safe-to-copy。普通 PNG 解码器可忽略该 chunk 显示封面；这不保证图片编辑器或社交平台重新编码时保留它。

容器不使用 Base64、`tEXt` 或 `IEND` 后追加数据。ZIP 以二进制分段写入，每段 payload 最大 16 MiB。`gcAr` v1 header 使用大端整数，每段重复携带：

```txt
magic[8] = "CHATGCPK"
containerVersion: u16 = 1
segmentIndex: u32
segmentCount: u32
archiveSize: u64
archiveSha256: [u8; 32]
payload: [u8]
```

PNG CRC 校验单段，SHA-256 校验重组后的完整 ZIP。导入器必须流式扫描 chunk 并写入临时文件，不得通过通用图片库将整张大图读入内存。

所有分段的版本、段数、archive 大小和 hash 必须一致；段序号必须唯一且连续。任何缺段、重复段、未知版本或重组长度不符都拒绝导入。

## 统一导入管线

目录、`.gamecard` 和 PNG 只有“物化临时目录”的前置步骤不同，后续必须共用：

```txt
source -> staging directory -> read_card/$import -> schema/resource validation
       -> preserve sessions -> atomic replace -> activate
```

- 目录导入将源树复制到 staging，跳过根 `sessions/`、`.wcs/`、`.git/`，不复制开发日志；更新时仍保留目标已有 session。
- `.gamecard` 验证 ZIP 文件头后流式解压到 staging。
- PNG 重组和校验 ZIP，然后进入相同的安全解压流程。

任何导入失败都只删除 staging，不改变 active card 和已安装目录。导入相同 id 时替换规则与资源，保留原 `sessions/`；只有原子替换完成后才激活新卡。生成期间继续禁止导入和切卡。

## 安全约束

导入器逐个处理 archive entry，不依赖“一次性解压全部”辅助函数。v1 要求：

- 路径必须是有效 UTF-8 相对路径，禁止绝对路径、反斜杠、空段和 `..`。
- 拒绝软链接、特殊文件、加密 ZIP、重复路径和仅大小写不同的冲突路径。
- 拒绝包内 `sessions/`，忽略根 `.wcs/`，并要求根目录只有一个 `card.json`。
- 默认上限：4096 个文件、单文件 512 MiB、archive 1 GiB、解压后总量 2 GiB。
- 写入前检查累计长度，不信任 ZIP header 或 `gcAr` 声明的大小。
- 完整执行现有 `$import` 安全、schema 和 `x-file` 资源存在性校验。

## 导出器

仓库首先提供命令行导出器，目录仍是唯一可编辑输入：

```sh
npm run game-card:export -- game-card-examples/white-album-2 --format gamecard
npm run game-card:export -- game-card-examples/white-album-2 --format png --cover images/cover.png
```

输出到 `dist/game-cards/<id>-<version>.gamecard|png`。导出前校验源目录，生成共用 ZIP payload，输出 SHA-256，再通过导入解码器读回自检。任何失败都不留下不完整的目标文件。

容器编解码、安全解压和确定性打包放在 Rust/Tauri 共享模块。仓库 CLI 和后续的应用内导出 command 复用该模块，不维护 JS/Rust 两套容器实现。

## 平台接口与 UI

游戏卡选择面板保留单一“导入卡片”按钮，直接打开文件选择器。选择平台项目根目录的 `card.json` 时，通过已有目录导入管线安装整个项目（含 `$import`、脚本和资源），无需先打包或选择导入类型。导入会复制安装，不挂载开发目录或自动热更新，也无需开启开发者模式。应用内导出 UI 仍待实现。

文件内容识别优先：PNG/ZIP 仍按容器处理；JSON 中有 `spec` 时按酒馆格式识别，未知 `spec` 明确失败，即使文件名为 `card.json` 也不回退为目录导入。只有无 `spec` 的 `card.json` 才进入平台目录校验；其他 JSON 不隐式读取其所在目录。目录导入完整执行现有加载、Schema 和路径安全检查，失败不安装。

导入器根据文件 magic 判断 ZIP 或 PNG，不只信任扩展名。普通 PNG 需明确报错“图片不包含游戏卡”。导入、导出和校验大文件时显示进度，允许取消，取消后清理临时文件。

文件和项目导入共用不可重复点击的“正在导入”状态和不定进度条；成功后显示导入的卡名并短暂停留，失败时保留面板并引导用户查看错误详情，取消选择则直接恢复空闲状态。生成期间禁止导入。

已安装卡可以从游戏卡选择器卸载。平台必须先提示游戏卡资源和该卡全部 Session 都会被永久删除；卸载当前卡后自动切换到普通聊天，普通聊天和其它游戏卡的 Session 不受影响。生成期间禁止卸载。

PNG 导出界面必须提示：图片可以普通渲染，但经编辑、压缩或平台重编码后可能无法再导入，应保留原始文件。

## 验证计划

- Rust 单元测试覆盖确定性 ZIP、PNG 分段往返、CRC/SHA 失败和大文件流式处理。
- 恶意 fixture 覆盖 Zip Slip、软链接、重复/大小写冲突、缺少根 `card.json`、解压上限和破损 chunk。
- repository 测试覆盖首次安装、同 id 更新、Session 保留、回滚和 active card 切换。
- adapter/UI 测试覆盖格式识别、生成期间禁用、进度、取消和错误文案。
- 真实 Tauri E2E 分别导入小型 `.gamecard` 和 PNG 卡，并验证资源协议在重启后仍可用。

## 实施顺序

1. 抽取 staging 校验、Session 保留和原子安装共用管线。
2. 实现 ZIP codec、`.gamecard` 导入和导出 CLI。
3. 实现 PNG `gcAr` codec，复用同一 ZIP payload。
4. 接入文件导入 UI、进度、取消和错误状态。
5. 在有用户编辑或二次分发需求时，再增加应用内导出 UI。
