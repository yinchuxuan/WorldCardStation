# 酒馆正则转换

## 目标与取舍

导入 `data.extensions.regex_scripts`，生成普通游戏卡 display 规则和受控 exec；不加载酒馆插件，不添加 request 阶段，也不维护 requestMessages 或原文备份。

存档、普通规则与模型输入使用同一份 messages。提示词正则会永久改写消息，旧消息压缩后不能恢复原文；这是明确接受的平台转换语义，仅记录 info，不增加导入确认。显示规则仍是纯渲染，不写入 messages。

| 源规则 | 转换目标 |
| --- | --- |
| markdownOnly=true、promptOnly=false | display.user / display.assistant |
| promptOnly=true | pre_send 中直接替换真实消息；世界书扫描发生在其后 |
| 两者为 true | 同上，另在初始化/响应完成时处理新 assistant；不重复生成 display 规则 |
| 两者均为 false | pre_send 处理最新用户输入，init / after_stream 处理新 assistant |

同类规则按源数组顺序执行；跨显示和持久化阶段不承诺完全保留酒馆的交错行为。流式正文在完成前仍可能显示未处理文本。

## 支持范围

- 作用位置：用户输入（1）、AI 输出（2）。世界书条目（5）、思考（6）、斜杠命令及其他位置逐项报告不支持；混合位置只转换受支持的部分。
- 表达式接受裸源码或 `/pattern/flags`，支持 g/i/m/s/u；保留无 g 时仅替换第一次的语义。
- 支持编号/命名捕获组、`$0`、`{{match}}` 和 trimStrings；捕获缺失输出空字符串。酒馆替换中的 `$&` 等不自动当成原生替换符。
- 正则模板支持 char/user、静态 getvar、newline/noop/comment；转换成字面量和平台只读 state 片段，不重新解析捕获结果中的宏。未知宏保持原文并报告，不执行嵌套内容或有副作用的宏。
- substituteRegex=0 不处理查找式中的宏，1 原样插入宏值，2 转义宏值中的正则特殊字符；不会转义表达式的固定部分。
- minDepth/maxDepth 为包含边界，null/缺失表示无界；深度按真实 user/assistant 消息倒数，最新为 0，流式 assistant 计一条。隐藏提示、世界书和调试消息不计数。
- disabled 规则只归档，不因未启用的空表达式或无效表达式阻断导入。启用但不合法的规则跳过并给出定位警告。

## 重复执行与编辑

统一改写消息后，同一规则不能每轮反复给旧消息加前缀。消息 `_meta` 只记录规则版本、已执行规则 ID 和最终文本指纹，不保存原文。首次进入深度范围时执行一次；已执行的规则不因深度变化自动撤销或重新执行。

在保留执行标记的消息上检测到文本修改后，runOnEdit=true 的已执行规则允许重跑，false 的不重跑；尚未执行的新规则仍按条件执行。显示规则每次以当前原文计算，深度或只读状态变化时更新渲染。重试沿现有 messages/state snapshot 恢复；编辑后重试若恢复到尚未处理的发送前基准，视为新的输入处理，不模拟酒馆独立编辑事件，不引入第二份存档。

## 美化与安全

显示结果继续经过 Markdown 和 DOMPurify，不执行 script、事件属性或卡内程序。静态样式提取为卡内 stylesheet，并限制到本卡消息区域；动画名称隔离。不能安全转换的样式明确报告，不能通过 CSS 导入读取外部资源。

沿用 display 的规则数、表达式和输入长度限制；这些限制不等于正则执行超时保护。消息正则通过受控 exec 执行，遵守现有超时与目录沙盒，不授予新权限。

## 验收

- V2/V3、四种模式、源顺序、禁用/无效规则、部分支持的位置及逐项报告。
- 捕获组、trimStrings、宏转义、未知宏、恶意字符串不变成代码、压缩构建后的脚本可运行。
- 深度范围、重复发送、编辑/重试、历史与 API 内容一致，世界书基于修改后的历史触发。
- 显示状态与深度更新、流式和分段阅读、安全 HTML/样式、原有原生 display 字符串语义不变。

参考：[酒馆正则说明](https://docs.sillytavern.app/extensions/regex/)、[正则引擎](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/extensions/regex/engine.js)。上述有损转换语义以本文为准，不承诺与酒馆完全一致。
