# Web 全量缓存与本地资源

## 用户入口与范围

目录中的“下载资源 / 检查缓存”准备选定的固定 release，显示已完成校验的字节数和总量，支持取消与重试。资源完整并完成规则预加载后显示就绪；当前仍不开放模型连接、执行游戏或保存进度。

需要 HTTPS 或 localhost，以及浏览器允许使用 Cache Storage、IndexedDB。浏览器普通 HTTP 缓存不是游戏资源缓存；不引入 Service Worker，不承诺网页离线启动或模型离线推理。

## 身份与存储

发布引用使用 `sourceUrl + cardId + releaseId` 三元组，不能只用作者版本号。sourceUrl 是固定可信目录的规范 URL，sourceId 为其 UTF-8 SHA-256。

- Cache Storage：`wcs-card-v1-<sourceId>-<cardId>-<releaseId>`；保存 release 清单、所有运行文件和预览封面。请求键为该 release 下的固定资源 URL。
- IndexedDB：`WorldCardStationWeb`，数据库版本 1，`cardReferences` store，keyPath 为 `key`。记录来源、卡片、release、内容指纹和 `ready`；本步不创建或修改 Session、设置、模型密钥。
- 每个页面的活动资源上下文只在内存中。退出资源上下文不删缓存、不删发布引用，也不保存游戏进度。

同卡不同 release 和不同来源分别准备，不覆盖旧缓存。UI 当前从在线目录选择版本；已持久化发布引用不是会话恢复 UI，后续存档流程才会使用它。

## 准备流程

1. 校验可信源下的发布地址。清单有缓存则先读缓存，否则获取固定 release.json；禁止跟随重定向或携带凭据。
2. 校验发布协议、平台/Schema 版本、入口、文件数和大小、路径/重复项、媒体类型、release 摘要及跨端内容指纹。摘要规则复用[发布协议](./web_static_release.md)，不重新序列化运行 card.json 来猜测指纹。
3. 将本次发布记录设为未就绪，检查每一项实际缓存是否存在并带有匹配的校验元数据。就绪记录不是跳过检查的凭据；完整缓存不会重新请求发布清单和资源。
4. 仅补缺失或元数据不符的文件，并发上限为 2。逐文件读取并限制实际大小，校验 SHA-256 与长度后才写缓存。不缓存 404、错误字节或中断响应。
5. 若浏览器提供空间估算，预留缺失数据大小的 10% 余量；实际写入仍捕获配额失败，不自动删除任何存档或其他卡片。
6. 再次确认所有条目存在，读取并校验 card.json；复用共享运行时读取外部 state schema、Content 文件及 exec include 预加载，不执行脚本。
7. 最后用 IndexedDB 事务提交就绪记录，然后切换内存活动上下文。任何失败不激活半成品，不释放此前活动上下文；已成功校验的下载保留供重试使用。

Cache Storage 与 IndexedDB 没有跨库事务。标记写入失败时，完整缓存可以保留，但此次准备仍失败；下次复查缓存并重试写标记。浏览器回收缓存后即使标记还在，也会被下次完整性检查发现。

取消会中止网络读取并等待并发任务结束；已经完整校验并写入的文件可以保留。进度按完成校验并缓存的整文件累计，不表示文件内部的逐字节进度。Web Crypto 对单文件摘要仍需要内存缓冲；不把整张卡一次性读入内存，但本步不承诺数百 MB 资源的峰值内存验收已完成。

## 本地接口与授权

`src/web/hostedCards.js` 提供 `prepare(entry, { signal, onProgress })` 和 `release()`。prepare 返回固定引用、卡片及规则预加载结果；本页面同时只允许一个已进入下载阶段的准备任务。release 释放 Blob URL 并使迟到结果失效，不是卸载操作；跨标签页下载与卸载协调留在卸载步骤实现。

`src/web/platform.js` 将共享 `gameCardPlatform.resources` 和 `repository` 连接到当前上下文：

- `repository.getActiveCard()`：没有完成准备时返回 null；否则返回已展开的原始卡配置。
- `resources.readText(cardId, relativePath)`：只从当前固定版本清单中的文本缓存读取，不自动请求网络。Content/脚本的 file ID 与目录 scope 继续由现有共享授权逻辑解析。
- `resources.getImageUrl/getAudioUrl`：校验 cardId、清单与 visual/audio 声明，按需读取 Blob 并返回对象 URL；不返回发布服务器的媒体 URL。
- 同一上下文复用已生成的媒体 URL；切换/释放时撤销。异步媒体读取结束时再检查上下文是否失效，不让迟到结果创建泄漏的 URL。

每次资源读取仍检查实际缓存。缓存缺失返回“重新检查并补齐缓存”，不隐藏网络修复。规则同步 `readFile` 使用现有预加载结果，目录动态文本仍走异步受控读取；不改变 DSL 语义。

失败的资源 Promise 不会在新一轮 prepare 中复用：新上下文使用新的资源对象，避免把上一次失败永久记住。真实游玩中的画面保留、资源解码及过期演出结果处理属于下一步运行闭环。

## 自动化验证

- Jest：清单/路径/版本限制、身份隔离、下载边界与并发、取消、活动上下文切换、迟到结果、UI 重试。
- 浏览器集成：实际 Cache Storage 和 IndexedDB、UTF-8 文本、脚本预加载、图片/音频 Blob、释放、断开发布服务后本地准备、单文件修复、来源与版本隔离。
- 故障场景：服务 404、错误内容、连接中断、取消；在真实存储写入边界注入配额错误和就绪标记失败，验证不激活与可重试。这不等于真实耗尽设备磁盘的验收。
- 生产构建 E2E：按钮下载、就绪提示、再次准备/刷新后复用、删除单项缓存只补该文件；浏览列表仍只请求索引和封面。

上述用例纳入 `npm run test:web`。浏览器矩阵、真实大卡及正式托管验收仍按[开发计划](./web_development_plan.md)执行，不用 Chrome 结果代替 Firefox/Safari。
