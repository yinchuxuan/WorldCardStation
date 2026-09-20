# Web 游戏卡静态发布协议

## 工具与边界

```sh
npm run game-card:publish -- /path/to/card --cover images/cover.png
npm run game-card:publish -- /path/to/card --output /path/to/site/cards
```

输入是项目目录，不是压缩包；封面可选，必须位于卡内。默认输出 `dist/web-cards/`，与网页构建目录分离，避免重新构建网页时删除旧发布。先构建网页，再把发布目录作为网页部署位置下的 `cards/` 提供；上传完整新 release、验证成功后，最后替换 `cards/index.json`。不要用清空站点目录的同步方式删除旧版本。

本地 `npm run web:dev` 自动将 `dist/web-cards/` 挂载到网页 base 下的 `cards/`，发布后刷新目录即可，无需复制或重启。自定义输出目录时设置 `WEB_CARDS_DIR`（相对仓库或绝对路径）。未发布时返回真实 404，页面提示“游戏目录尚未配置”；不会生成假目录、自动发布示例卡或回退为 HTML。该挂载仅用于开发服务，不把资源自动打进网页产物；正式部署仍需提供上述 `cards/`。

这是仓库维护者工具，需要仓库、Node/npm 依赖、Rust 和当前 Tauri 编译依赖；不是安装后客户端命令。运行阶段只需要普通静态服务器，浏览器不依赖 Rust 或 Node。

发布复用桌面 `$import` 展开、唯一 Schema、资源存在性和外部 state schema 校验。脚本 include 使用正式运行时解析器收集依赖，不执行代码。不替代完整客户端 dry-run，也不保证 JavaScript 语法、模型表现、媒体解码或游戏行为正确。

## 文件布局

```text
cards/
  index.json
  <cardId>/<releaseId>/
    release.json
    card.json
    state.json、scripts/、worldbook/、images/……
    preview/cover.png                 可选
```

`card.json` 是展开后、规范序列化的运行配置；其余运行资源原样复制。JSON import 源片段只有同时属于运行资源时才保留。空的授权目录也会在本地产物中保留，但不占文件清单条目。

## index.json：轻量目录

```json
{
  "formatVersion": 1,
  "cards": [{
    "cardId": "demo",
    "cardVersion": "1.0",
    "releaseId": "sha256-<64位小写十六进制>",
    "name": "示例卡",
    "description": "卡片简介",
    "release": "demo/sha256-<摘要>/release.json",
    "cover": "demo/sha256-<摘要>/preview/cover.png"
  }]
}
```

每张卡只列当前推荐发布；旧 release 保留不删除。无封面时 `cover` 为 `null`。地址相对 `cards/`，不是任意 URL。目录按 cardId 排序；同一 cardId 不能重复。网页按部署根或子路径定位自己的 `cards/index.json`，不会读取用户指定的发布源。

列表仅请求索引和封面，不预取 release、脚本或媒体。名称、简介作为纯文本展示。索引请求不携带凭据、不跟随重定向，使用 `no-cache` 重新验证；网络、格式或路径错误显示错误和重试入口，不伪装成空目录。当前开始游玩按钮不可用。

## release.json：固定发布

| 字段 | 含义 |
| --- | --- |
| formatVersion | 当前为整数 `1`；未知版本拒绝处理 |
| cardId / cardVersion | 作者标识与版本；版本字符串不是内容身份 |
| releaseId | `sha256-` 加发布描述的 SHA-256 |
| contentFingerprint | `wcs-content-v1-` 加运行内容指纹 |
| schemaVersion | 发布时采用的 DSL Schema 版本 |
| platformVersion | 发布所验证的平台版本；v1 保守要求运行端与其一致 |
| entry | 固定为 `card.json` |
| name / description | 来自展开后卡片配置 |
| files | 全部运行文件，按 UTF-8 路径字节升序排列 |
| cover | 独立预览文件描述，或 `null`；不属于运行内容指纹 |

每个文件描述包含 `path`、`bytes`、`sha256`、`mediaType`。长度为原始文件字节数，SHA-256 为 64 位小写十六进制；路径相对 release 目录。`release.json` 不列入自身文件清单。封面复制到保留的 `preview/cover.<扩展名>`，单独限制 10 MiB，不通过背景资源猜测封面。

资源准备会先验证协议、兼容要求、清单和固定发布身份，再下载缓存；版本不兼容时在下载入口报告错误。见[全量缓存与本地资源](./web_resource_cache.md)。这尚不包含模型连接、游戏执行和存档恢复。

## 确定性与跨端内容身份

v1 的运行入口序列化由共享 Rust 实现定义：JSON 对象键递归排序、无额外空白、UTF-8，无 BOM/末尾换行；数组顺序保留，数字使用 `serde_json` 序列化形式。这不是 RFC 8785，不承诺将 `1` 和 `1.0` 等不同数字表示归一化。不要用任意语言默认的 JSON stringify 重建入口字节。

指纹算法依次输入 SHA-256：

1. 固定 ASCII 前缀 `wcs-content-v1`，加一个零字节。
2. 对排序后的每个运行文件：路径 UTF-8 字节长度（u64 大端）、路径字节、文件长度（u64 大端）、该文件 SHA-256 的 64 字节小写 ASCII 十六进制文本。
3. 输出加前缀 `wcs-content-v1-`。资源字节、路径或运行配置改变都会改变指纹。

封面、发布平台版本、源目录绝对地址、时间戳、JSON import 的拆分方式、ZIP/PNG 容器字节不参与运行内容指纹。相同源卡经过桌面目录加载或容器导入后，按同一资源收集与规范化规则计算，得到相同指纹；当前尚未把此身份接入存档导入导出。

releaseId 是移除 `releaseId` 字段后的整个发布描述，按上述 JSON 规范化后取 SHA-256，再加 `sha256-`。因此换预览封面或发布平台版本也产生新 release，不覆盖原版本；同一内容和发布参数重复运行得到相同身份。

## 收集与隐私边界

- 只发布 Schema 标记的资源、`files` 目录 include 匹配的文件，以及脚本静态 include 依赖；不复制整个工程。
- 目录 include 沿用精确路径与单层 `*` 语义；不扩大为递归通配。精确引用缺失报错，无匹配的通配可为空。
- 不解析脚本运行时计算的路径，也不解析 CSS 的任意 URL；所需资源必须通过平台已有资源声明授权。发布不联网抓取外部资源。
- 排除隐藏路径，以及 sessions、trace/traces、logs、settings、settings.json、model-config.json、node_modules、target、dist、AGENTS.md 等保留私有路径；显式资源或 JSON import 引用私有路径时拒绝发布，不能默默缺资源。
- 拒绝路径穿越、绝对路径、反斜杠、URL 特殊字符、控制字符、`.` 段、尾随空格/点、符号链接和大小写冲突。封面仅接受平台支持的栅格图片扩展名。
- 沿用运行资源上限：4096 个文件、单文件 512 MiB、总量 2 GiB；封面另计。

路径过滤不是秘密扫描器。作者主动写进剧情、脚本或 state 的密钥、个人信息和绝对路径文本不会被自动识别或改写；必须在发布前审核。所有实际发布字节对玩家公开，内容哈希不提供作者真实性或保密保证。

## 原子发布与失败处理

工具独占输出目录的 `.publish.lock`，在随机 staging 目录完成复制、正式加载器复验、逐文件长度/哈希及清单读回检查。然后将完整目录移动到不可变目标，最后原子替换索引。不同发布工具不得绕开锁同时写同一目录；进程异常退出遗留锁时，确认没有发布进程后人工清理。

已存在的相同 release 必须与本次清单、文件校验值一致，才能复用；不覆盖或修复损坏的已发布版本。失败清理本次 staging，不修改先前索引或旧 release。如果目录提交成功但索引提交失败，会保留一个完整、尚未被索引引用的 release，重试可复用。此事务只针对本机目录，不自动保证远程上传原子性。

## 验证

`cargo test --manifest-path src/tauri/Cargo.toml web_release --lib` 检查确定性、容器/桌面配置和指纹一致性、私有引用、依赖与失败安全。`npm run test:web:build` 真实运行发布工具，重新读取清单、逐文件核对长度/哈希，并验证重复发布。浏览器 E2E 在根路径和 `/play/` 验证目录元数据、可显示封面和“仅索引及封面”的请求范围。
