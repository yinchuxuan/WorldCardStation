# Chat Session Design

<!-- devkit:omit:start -->
适用任务：修改会话切换、保存、恢复和重试快照。  
相关代码：`src/renderer/chat/`、`src/tauri/src/sessions.rs`、`src/web/sessions.js`。  
前置文档：[Platform Adapter](platform_adapter.md)
<!-- devkit:omit:end -->

## 目标

聊天 session 用来保存和加载同一游戏卡下的多条独立对话线。每个 session 必须包含完整的聊天上下文、游戏状态和重试基准，切换 session 时应恢复到该 session 自己的状态。

## 存储布局

以下磁盘布局和自动保存规则描述 Tauri 客户端。Web 复用会话 UI 和运行管线，但使用 IndexedDB、显式保存目标和手动保存策略，见 [Web 版本设计](./web.md)。

聊天历史按 active game card 和 active session 读取：

```
game-cards/
  no-card/
    sessions/
      active.json
      default/
        messages.json
        retry-base.json
  cards/
    <card-id>/
      sessions/
        active.json
        default/
          messages.json
          retry-base.json
```

历史读写和 session 管理均已通过 Tauri renderer service 与 Rust commands 实现。

## 数据结构

以下是普通聊天及旧播放器格式。内部多 Agent 运行时复用相同服务与目录，但保存带版本的完整数据包；见 [多 Agent Session](./game_runtime_sessions.md)。其恢复不执行 init，重试基准也不拆文件。

每个 session root 包含 `index.json`：

```
sessions/
  active.json
  index.json
  <session-id>/
    messages.json
    retry-base.json
```

`active.json`：

```json
{
  "id": "default"
}
```

`index.json`：

```json
{
  "sessions": [
    {
      "id": "default",
      "title": "默认会话",
      "createdAt": "2026-05-31T10:00:00.000Z",
      "updatedAt": "2026-05-31T10:20:00.000Z",
      "messageCount": 12,
      "preview": "春希推开第三音乐室的门..."
    }
  ]
}
```

`messages.json` 继续保存当前格式：

```json
{
  "messages": [],
  "gameState": {},
  "viewState": {
    "reading": {
      "messageId": "assistant-message-id",
      "segmentIndex": 0
    }
  }
}
```

`viewState.reading` 是平台视图状态，用稳定消息 ID 和零基分段下标记录分段阅读位置；它不属于游戏卡 state，也不进入 retry base。

`retry-base.json` 继续保存重试基准：

```json
{
  "messages": [],
  "gameState": {}
}
```

## 平台接口

Renderer 只使用 `rendererServices.sessions`：

- `loadHistory()`
- `saveHistory(messages, options)`
- `list()`
- `getActive()`
- `create(title)`
- `setActive(id)`
- `rename(id, title)`
- `delete(id)`

开发者模式开启后，同目录追加 `trace.jsonl`；关闭模式保留文件。历史加载额外返回 `traceScope: {cardId, sessionId}`（普通聊天为 null），用于绑定记录归属。旧会话的迟到日志不写到新会话，详见 [运行日志](../authoring/runtime_trace.md)。

Tauri adapter 分别映射到 Rust commands：

- `get_chat_history`
- `save_chat_history`
- `list_chat_sessions`
- `get_active_chat_session`
- `create_chat_session`
- `set_active_chat_session`
- `rename_chat_session`
- `delete_chat_session`

## 行为规则

- session 作用域跟随当前游戏卡；未加载游戏卡时使用 `no-card`。
- 如果 session root 不存在，自动创建 `default` session。
- `save_chat_history` 成功后更新当前 session 的 `updatedAt`、`messageCount` 和 `preview`。
- 同一 session 的读取和保存进入串行队列；messages、gameState、viewState、retry base 和 metadata 按一次保存顺序更新。
- session JSON 使用临时文件加 `rename` 原子替换，写入失败不会留下不完整 JSON。
- 新 session 初始包含空 `messages.json` 和空 `retry-base.json`。
- 切换 session 前先保存当前内存中的 messages、gameState、viewState 和 retry base。
- retry 使用发送前保存在内存中的 retry base；不得为 retry 重新 hydrate Session 或阅读位置。
- retry base 完整保留 messages 的正文、TTL、metadata 和 state，不按卡片标记或 TTL 清洗。重试只重新执行本轮规则；编辑最后一条用户输入优先读取同一消息的 retry base，没有快照时保留现有正文。
- 历史或游戏卡初始化加载失败时不启用保存；自动保存、显式保存及关闭窗口都不能覆盖尚未成功恢复的 Session。成功重新加载后才恢复保存。
- 自动保存按最新快照串行合并；关闭桌面窗口时先停止生成并等待保存队列清空，再销毁窗口。
- 切换 session 后重新调用现有历史加载流程，并重新执行 game card init。
- 删除当前 session 后切换到最近更新的其它 session；如果没有其它 session，则创建新的 `default`。
- session id 必须复用现有安全 id 规则，避免路径穿越。

## 前端集成

`useChatSession` 通过 session service 读写当前 session，`useChatPersistence` 管理自动保存和 retry base。session 控件负责管理 active session：

- 显示当前游戏卡名和当前 session 标题。
- 展开后列出同一游戏卡下的 session。
- 支持新建、切换、重命名和删除。
- 切换通过 `useChatSession.switchSession()` 完成，并重置 streaming、retry ref 和展开状态。

session 控件不应该依赖 msg 历史调试面板；msg 历史仍只用于查看当前保存内容。

游戏卡选择器与 session 控件相互独立。选择器固定提供“普通聊天”，并列出所有已导入游戏卡；“普通聊天”对应 active game card 为 `null`。切换作用域时平台必须按以下顺序执行：

1. 保存旧作用域的当前 session。
2. 更新 active game card。
3. 清理旧游戏卡的 BGM、背景、立绘、样式和自定义 UI。
4. 加载目标作用域的 active session，并恢复其消息、gameState 和阅读位置。

生成期间禁用游戏卡切换和卸载。普通切换不会删除任何游戏卡或 session，也不会把游戏卡消息复制到 `no-card`；卸载是单独的确认操作，会删除目标卡及其全部 session，卸载当前卡后切换到 `no-card`。
