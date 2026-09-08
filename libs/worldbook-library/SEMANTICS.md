# 世界书运行语义

这是 library 的行为契约，不是酒馆卡导入方案。接入和目录授权见 [README](./README.md)。

## 对齐来源

- [Character Card V2](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)：character_book 基础字段。
- [Character Card V3](https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md)：Lorebook、装饰器和文本宏。
- [SillyTavern World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)：扩展字段与运行行为。
- ST 的 [导出实现](https://github.com/SillyTavern/SillyTavern/blob/release/src/endpoints/characters.js) 和 [运行实现](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/world-info.js)：用于核对 extensions、正则、分组、递归和定时效果。

这些规范与实现并不完全一致。library 显式区分 V2/V3 和 ST 语义，不声称复刻整个 SillyTavern 提示词管理器或插件生态。

## 字段归一化

接受 entries 数组和 ST 以 UID 为键的 entries 对象。ID 优先取 id、uid、对象键，数组缺失 ID 时生成 entry-<索引>；建议作者提供稳定 ID，避免重排后改变定时状态身份。

保留原配置字段，统一 key/keys、keysecondary/secondary_keys、order/insertion_order、disable/enabled、caseSensitive/case_sensitive 和 scanDepth/scan_depth。高级字段同时读取顶层别名与 extensions；extensions 中的非 null 值优先，null 回退顶层/书级默认。ST 导出的数值 position 优先于其有损的 before_char/after_char 字段。

## 选择流程

1. 读取 config，校验 ID，加载必要的装饰器及历史状态。
2. 扫描最近 N 条真实 user/assistant 消息；不扫描 llm_only 或其他 worldbook 注入，不将它们计入定时效果或深度。
3. 检查启用、生成类型、角色过滤、装饰器及定时条件，激活常驻或关键词命中项。
4. 处理 inclusion group，再进行概率判定、正文读取和预算筛选。
5. 递归只扫描已入选且未 prevent_recursion 的正文，并与原历史扫描文本合并；淘汰项不参与递归。
6. 按 insertion_order 升序稳定排序，在各目标位置注入一次，提交会话状态和诊断。

### 关键词与正则

| 行为 | V2 / V3 | SillyTavern |
| --- | --- | --- |
| 普通 keys | 任一命中即可；V3 use_regex=false 时正则外观也是普通文本 | 仅 /pattern/flags 形式启用正则，其余关键词按普通文本匹配 |
| use_regex=true | 按正则匹配；V3 忽略 constant 和 secondary_keys | 不把所有关键词强制转成正则，仍执行 secondary_keys 过滤 |
| 大小写 | 普通文本由 case_sensitive 决定；裸正则沿用此设置 | 普通文本由 case_sensitive 决定 |
| 显式正则 flags | 原样使用，不擅自补 i | 原样使用，不擅自补 i |
| 无效正则 | V3 任一 primary/additional 模式无效则普通匹配失败，并报告诊断 | 对应关键词不匹配，不中断其他条目 |

selectiveLogic 支持 0=AND ANY、1=NOT ALL、2=NOT ANY、3=AND ALL；没有次关键词不附加过滤。ST 关键词匹配前去除首尾空白。

match_whole_words 按 ST 的单词边界处理单个词，包含空白的多词短语按子串匹配。其边界是 JavaScript 的 ASCII 词字符语义，不是中文分词器。

可选匹配源包括 persona、角色描述、性格、角色注释、场景和作者注释。通过 args 的 character/user 传入；缺失的源按空文本并报告诊断。characterFilter 的 names 和 tags 都存在时须同时满足，isExclude 分别反转；names 使用 character.id，缺省时用 name。缺失角色上下文时不激活带角色过滤的条目。

### 分组、概率、递归

- group 支持逗号分隔多个组，同组只选择一个条目，跨组赢家排除所有重叠候选。
- active sticky 优先；否则根据 use_group_scoring 筛选最高匹配分，再由 group_override 按较高 insertion_order 优先，或按 group_weight 加权随机。权重默认 100；显式 0 不参与抽选。
- 分数包含主关键词命中数量；AND ANY 增加命中次关键词数量，AND ALL 全部命中才加分，NOT 类不加次关键词分。条目可显式关闭分数筛选。
- probability 范围按 0–100 解释，0 禁用、100 必中；useProbability=false 跳过概率检查。缺省概率视为必过；有概率但没有开关时应用概率。同一调用不会反复掷骰，sticky 的后续扫描跳过概率。
- prevent_recursion 表示其正文不触发别人；exclude_recursion 表示自己不由递归激活。delay_until_recursion=true 等同级别 1，数值级别按升序分阶段处理，每个级别继续扫描到无新增项，再进入下一等级；不是将该数值解释为聊天轮数。
- recursive_scanning=false 时不进行任何正文递归，也不激活延迟到递归阶段的条目。硬上限防止循环，达到上限报告诊断。

### 预算

token_budget 是绝对 token 估算值，不是 ST 全局上下文百分比。省略表示不设预算，0 表示没有普通条目预算；ignore_budget 条目不计入预算。

ST 的 sticky、constant 优先；其后按 priority（缺省用 insertion_order）降序，最后按配置顺序打破平局。V2/V3 按 priority 优先，不因 constant 绕过预算。无法放入的条目跳过，较小候选仍可入选；较晚递归阶段不会替换已接受的早期条目。

估算仅针对展开后的条目正文：ASCII 每 4 字符约 1 token，非 ASCII 每码点约 1 token，向上取整。不是模型 tokenizer，包装、分隔符和其他提示词不计入；因此不承诺与 ST 或实际模型 token 数完全一致。

## 插入位置

| 配置位置 | library 行为 |
| --- | --- |
| before_char / 0；after_char / 1 | character 锚点范围之前/之后 |
| 2 / 3 | authors_note 锚点之前/之后；锚点缺失时忽略条目并报告 |
| 4 + depth + role | 从真实聊天消息末尾倒数插入；0 在末尾，超过历史长度在最旧聊天消息前 |
| 5 / 6 | examples 锚点之前/之后；识别 <START>、用户/角色名及 user/assistant 说话行 |
| 7 + outlet_name | 不自动注入，汇总为命名 outlet，供后续普通规则读取 |
| 未指定 | 兼容原有游戏卡：最后一条 user 消息前，没有 user 时追加 |

数值 role 为 0=system、1=user、2=assistant，也接受对应字符串。角色及示例锚点缺失时回退到默认位置并报告诊断；不伪造角色定义。无法解析的示例文本保留为 system 段并报告，不丢正文。

V3 before_desc/after_desc、personality、scenario 使用同名配置锚点（前两者共用 description）。普通角色位置与 V3 可选装饰器不同：装饰器指向不存在的段落时被忽略，可启用其 @@@ 后备行。

相邻同位置同角色的普通条目合并；不同角色保持配置顺序。depth=0、role=assistant 只生成 assistant 消息，是否作为 prefill 使用由模型协议决定。

## 定时效果与历史匹配

状态保存在 state.__worldbook[scopeId]，按 entry ID 隔离，记录配置/正文指纹和真实聊天历史指纹。所有效果都以消息数计，不是对话轮数，也不依赖系统时钟。

- delay=N：至少已有 N 条真实聊天消息才可激活。
- 在消息数 M 激活 sticky=N 后，M+N 之前保持激活；重复命中不续期。
- cooldown=C：从 sticky 结束时开始；没有 sticky 时从激活开始。在 M+N+C 达到时可重新命中。
- 当前历史没有前进时清除定时窗口；重试不重复增加历史命中计数。删除、改写历史前缀或修改 entry/正文使对应旧效果失效。
- 只有通过所有筛选并最终入选的条目启动效果。分组、概率和预算淘汰项不会启动计时。

平台恢复分支/retry-base 时应同时恢复消息与游戏状态。library 不用全局计数，也不会将另一个世界书的状态当成自己的状态。

## V3 装饰器与文本宏

启用 V3 语义时解析独立的 @@ 行并从正文移除；@@@ 表示紧邻的后备候选，支持任意长度后备链，未知/无效/环境不支持的装饰器触发后备。重复的有效装饰器取首个，additional_keys 可重复。

支持 activate_only_after、activate_only_every（计 assistant 消息）、keep_activate_after_match、dont_activate_after_match（按规范的 more than once，在此前两次不同上下文激活后生效）、depth、role、scan_depth、position、additional_keys、exclude_keys、activate、dont_activate。

is_greeting、is_user_icon、ignore_on_max_context 在调用方提供相应上下文时生效，否则忽略并报告。additional_keys 的每一行都要求至少一个键命中；V3 正则模式不应用 exclude_keys。enabled=false 永远不被 activate 覆盖。ST 只采用其支持的 activate/dont_activate 装饰器，强制关键词命中仍受定时、概率等 ST 过滤约束。

instruct_depth、instruct_scan_depth、reverse_depth、reverse_instruct_depth 按 V3 对聊天环境的约定忽略；disable_ui_prompt 没有平台对应能力，也忽略并报告。library 不修改卡片的 system_prompt 或 post_history_instructions。

安全文本宏支持大小写不敏感的 char/user、random、pick、roll、reverse、//、comment、hidden_key；random/pick 接受 V3 逗号格式及 ST 双冒号格式。pick 对同一历史、条目和宏位置保持确定性；不会执行代码。hidden_key 只进入递归扫描，不进入模型正文；注释既不扫描也不注入。缺少角色/用户名称时保留原宏并报告缺少上下文。

以上是未传文本渲染回调时的默认行为。`runWorldbook` 的第三参数可以替换关键词和正文渲染，具体接口见 [README](./README.md#可选的编译文本渲染器)；选择、预算、递归和注入流程不变。编译导入器可据此提供基于会话种子及固定文本位置的 pick，不受默认历史种子影响。

## 不在本库内模拟的能力

向量检索只报告能力缺失，条目仍可通过关键词命中；automation_id 不执行，报告诊断。ST 插件宏、变量宏、全局 outlet 宏以及完整 STscript/模板引擎未实现，未知宏保留原文并报告。ST 全局最小激活数、全局提示词管理、示例消息裁剪策略和模型 tokenizer 也不属于本库。

诊断位于 effects.worldbook.warnings；卡作者可在接入时判断这些差异是否影响自己的世界书，不能将“配置被接受”当成所有 ST 插件行为都已得到兼容。
