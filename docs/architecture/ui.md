# Desktop UI 设计规范

<!-- devkit:omit:start -->
适用任务：修改共享界面布局、样式和交互。  
相关代码：`src/renderer/components/`、`src/renderer/styles/`。  
前置文档：[Architecture](overview.md)
<!-- devkit:omit:end -->

## 一、配色系统
| 角色 | 浅色模式 | 深色模式 (data-theme="dark") |
|------|----------|------|
| Primary | #006494 | #60A5FA (Blue) |
| Secondary | #00838F | #60A5FA (统一蓝色) |
| Surface | #FFFFFF | #0F172A (Zinc) |
| On-Surface | #1C1B1F | #F1F5F9 |
| Success | #2E7D32 | #4ADE80 |
| Error | #B3261E | #FCA5A5 |
| Outline/Divider | #E0E0E0 | #475569 / #1E293B |

禁止: 紫色渐变、霓虹色、荧光色

## 二、字体规范
字体族: 'Google Sans Display' / 'Google Sans' / sans-serif，代码 'Roboto Mono'
| 层级 | 大小 | 字重 |
|------|------|------|
| Headline | 24-32px | 600 |
| Title | 16-22px | 500 |
| Body | 14-16px | 400 |
| Label | 11-14px | 500 |

## 三、布局与圆角
- 窗口: 800-1920px 响应式 | 圆角: 卡片12px / 按钮8px / 输入框12px
- 间距: 4/8/12/16/24/28px grid

## 四、交互与动效
- 状态层: Hover 8% / Focus 12% / Pressed 12% 透明度
- 动画: Emphasized easing, 200-300ms，用于显隐、入场和交互状态变化
- Header 底部使用静态 primary → secondary 渐变条，不使用常驻循环动画
- Elevation: 5级阴影系统 (dark/light 独立)

## 五、可访问性 (WCAG AA)
- 对比度: 正文 ≥4.5:1 / 大文本 ≥3:1
- Focus: 2px outline | 点击区域 ≥44×44px

## 六、分段阅读
- 游戏卡通过 `display.segmentedReading: true` 开启分段阅读，不提供用户级开关。
- 开启时按 Markdown 自然段（或卡内 `display.segmentSeparator`）分页并隐藏 thinking block；阅读游标可跨 assistant 回复前后移动，并随 session 保存、恢复。
- 回看历史只改变阅读位置，不回滚 messages、state 或演出；流式生成期间回看不会停止生成，也不会被新内容强制拉回最新位置。
- 点击非交互文本区域进入下一段；链接、游戏卡按钮和文字选择不得触发翻页。
- 关闭时恢复全文展示和原有 thinking 点击行为。

## 七、桌面全屏
- 应用聚焦时按 F11 切换 Tauri 原生全屏，不使用 CSS 全屏或窗口最大化模拟。
- 全屏由平台控制，游戏卡只能适配视口，不能直接调用桌面窗口 API。
