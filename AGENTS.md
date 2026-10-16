# AGENTS.md

## 与我协作的方式

- 说话直接，不要奉承我，也不要用讨好式开场。
- 如果你不同意我的判断，要直接指出，并给出具体理由。
- 如果你的反对是基于判断而不是确定事实，要说明这是判断。
- 不要编造技术细节。如果你不知道某个 API、CLI 参数、包版本、模型名、环境变量、路径或配置格式，要先验证，或者明确说不知道。
- 对当前工具、模型名、包版本、价格、API、平台行为等信息，默认认为训练数据可能已经过时。依赖这些信息前要先验证。
- 优先给出精确命令、文件路径、配置字段和可观察的检查方式，少给空泛建议。

## 默认工作方式

- 完成任务，而不是停在草稿阶段。除非我明确要求只写草稿。
- 工作流程应包括：实现、验证、清理和汇报。
- 如果下一步已经由任务、计划、失败的检查结果或项目说明暗示出来，就继续推进，不要反复问我"下一步怎么办"。
- 如果存在多个合理解释，且风险较低，说明你的假设并继续执行。
- 如果涉及数据丢失、密钥、凭证、计费、部署、外部服务、生产系统、破坏性命令或大范围架构变化，必须先问我。
- 改动要聚焦于我请求的任务，不要顺手做无关清理或机会主义重构。
- 如果发现无关 bug、死代码或设计风险，可以单独提出来。除非它阻塞当前任务，或者我明确要求，否则不要顺手修。

## 持续改进循环

- 用户每次纠正后，都将对应的问题模式记录到 `docs/memory.md`。
- 为自己制定规则，避免重复犯同样的错误。
- 持续迭代这些经验，直到错误率下降。
- 每次会话开始时，回顾相关项目的经验教训。

## 任务管理

- 当要执行一个任务时、你首先需要使用 `plan` 模式创建一个详细的实施计划
- 创建计划前你需要充分了解上下文、而不是去靠猜测
- 创建计划需要足够详细、并且按照阶段执行、每一个阶段都有完成目标和验收标注
- 计划文档写入到 `docs/plans`
- 当用户确认计划完成后、归档该计划到 `docs/plans/archive`

## 编码前

- 编辑前先找到并阅读最近的项目说明。
- 检查是否存在 `AGENTS.md`、`AGENTS.override.md`、`Claude.md`、`.codex/config.toml`、README、相关文档、测试和已有代码模式。
- 当可以查看相关文件、测试或文档时，不要只根据文件名猜测。
- 引入新模式前，优先使用仓库已有工具链和代码风格。
- 优先做小而直接的改动，避免大范围重写。
- 写能解决实际问题的最少代码。
- 不要为了项目暂时不需要的场景添加猜测性的功能、抽象、配置或错误处理。
- 匹配正在编辑文件的现有风格，即使你个人会用另一种写法。

## 验证

- 在相关检查通过前，不要说编码任务已经完成。
- 如果项目配置了 typecheck、lint、tests、format checks 或 build，先运行范围最小但相关的检查。
- 如果改动影响共享行为、公开 API、构建配置或核心逻辑，要运行更广泛的检查。
- 如果项目没有配置检查，要明确说明，而不是声称已经验证。
- 如果检查因为你的改动失败，要先调查并修复，再结束任务。
- 如果检查因为缺少依赖、环境限制、权限或时间无法运行，要明确说明哪些内容没有验证，并列出应该运行的命令。
- 对 UI 或浏览器可见的改动，如果环境允许，要打开或运行相关页面，确认修改后的流程可见且可用。
- 对脚本改动，要用有代表性的输入运行脚本，并检查输出。
- 如果某条规则非常关键，优先用可执行检查、测试、hook、脚本、沙箱或权限边界兜底，而不是只依赖文字说明。

## 指令优先级

当指令发生冲突时，按以下顺序执行：
1. 系统和安全规则。
2. 我最新的明确请求。
3. 距离被编辑文件最近的项目说明。
4. 仓库级说明。
5. 本文件中的全局说明。

如果冲突涉及安全、数据丢失、凭证、外部服务、部署、计费或重大架构决策，停止并询问我。

## 搜索与代码修改

- 重命名函数、类型、变量、文件、路由、命令或配置字段时，要分别搜索直接引用、类型引用、字符串字面量、动态 import、re-export、barrel files、测试、mock、文档和生成引用。只搜索一次是不够的。
- 改变行为前，先查找是否已有测试定义了预期行为。
- 新建 helper、组件、类型、schema 或工具函数前，先复用本地已有实现。
- 除非任务明确要求，不要静默移除已有行为。
- 清理你自己的改动产生的未使用 import、变量和文件。
- 不要删除原本就存在的死代码，除非我要求。

## 命令与工具

- 优先使用项目提供的脚本，而不是临时拼命令。
- 如果项目里有 `scripts/`、`script/`、`Makefile`、`package.json`、`pyproject.toml`、`Cargo.toml`、`go.mod` 或类似工具文件，先阅读它们再选择命令。
- 不要随意切换包管理器。
- 没有明确理由时，不要添加或升级生产依赖。
- 如果确实需要添加依赖，要说明为什么现有代码或标准库不够。
- 不要绕过 pre-commit hooks，也不要使用 `--no-verify`，除非我明确批准。
- 在安全且可自动化的情况下，优先使用 CLI 或 API 工作流，而不是手动网页操作。

## Git

- 除非我明确要求，不要 push 到 main 或默认分支。
- 如果需要 push 提交，使用 feature branch。
- 没有明确批准，不要 force-push、重写历史或 reset 分支。
- 提交前先检查 diff。
- 不要把密钥、本地专用路径、生成噪音或无关格式化改动放进 commit。
- 提交时使用简洁、语义清晰的 commit message。

## 密钥与凭证

- 不要把 API key、token、密码、私钥、连接字符串、cookie 或凭证硬编码到源码里。
- 从环境变量或项目已有的 secret 机制读取密钥。
- 确保 `.env` 文件和本地凭证文件被 Git 忽略。
- 提交前检查 staged changes 中是否可能包含密钥。
- 如果发现已经提交过的密钥，停止操作，指出风险，并建议轮换密钥。

## 文档与项目记忆

- `AGENTS.md`/`Claude.md` 是入口，不是知识库。
- 把稳定、重复适用的规则放进 `AGENTS.md`。
- 把项目事实、架构、安装细节、当前状态、任务日志和长篇说明放进 README、docs、PROJECT_STATE、TASK_LOG 或类似项目文档。
- 把复杂的多步骤计划放进 `PLANS.md` 或任务专属计划文档。
- 把可复用但太细的工作流放进 Skills，而不是塞进 `AGENTS.md`。
- 当行为、安装方式、命令、公开 API、部署方式或用户可见流程发生变化时，更新文档。
- 不要在 README 和 AGENTS.md 之间重复大段内容。必要时用链接互相指向。

## 子智能体策略

- 充分使用子智能体，保持主上下文窗口整洁。
- 将调研、探索和并行分析交给子智能体。
- 遇到复杂问题，通过子智能体投入更多计算资源。
- 每个子智能体只负责一项任务，专注执行。

## 最终回复

完成任务时，汇报：

- 改了什么。
- 验证了什么。
- 如果有未验证内容，说明原因。
- 触及了哪些重要文件。
- 还有哪些风险或后续建议。

最终回复要简洁、实用。不要让我自己检查一遍才知道工作是否可用。

<!-- aoci:begin -->
## AOCI 仓库认知

AOCI 为本仓库维护一个稳定、可版本化、可增量更新的仓库级认知层，供模型跨任务复用对系统的理解。

`aoci.txt` 是面向模型的结构化认知索引。它以每个受管理文件、数据库表或其他受管理对象一条独立 Entry 的方式，用符号标签与 F/R/A/S 语义表达对象的核心职责、重要关系、对外契约，以及理解或修改系统时必须知道的非显然约束和设计决策。

Header、目录段和全部 Entry 共同组成完整仓库索引，可以覆盖前端、后端、配置、数据库结构及其他受管理内容。受管理内容发生变化时，通常只需维护受影响的认知条目，不需要重新生成整个索引。

AOCI 提供系统架构、对象职责、重要关系、对外契约和关键约束的高密度视图。

### 工作原理

AOCI 采用“模型生成、模型读取”的认知闭环。

Header、Entry 和 Curation 语义的创作只按当前机器签发的 Plan 与实时 Guide 执行；由 Host 模型基于当前绑定证据独立完成。

Entry 的语义必须来自模型对真实证据的理解。不得仅依据路径、文件名、扩展名、AST、符号列表、依赖扫描、正则、固定模板或规则引擎推导、预填、拼接或改写索引语义。

对 Fresh Bootstrap，只按当前机器签发的 Plan 和实时 Guide 执行。当它们要求创作时，Host 模型创作 Root、Meta、Tag 和 F/R/A/S，提供 authoring-run 声明，并把它绑定到 Plan、Evidence 与完整 Candidate。不得要求 AOCI 填写 `origin=host_model`、制造 Receipt 或把程序生成的 Framework 当作语义。本文件不自行重建 Onboarding 流程。内部批次不是用户决策；只有遇到既有批准边界或真实的安全、漂移、CAS、Recovery 条件才停止。

### 最小使用入口

- `aoci_rules`：取得当前AOCI版本的会话运行合同。
- `aoci_overview`：建立或恢复本仓库的完整认知。
- `aoci_maintain`：受管理对象达到最终稳定状态后检查认知是否需要维护。
- `aoci_update_entry`：提交与当前证据和源码摘要绑定的完整语义更新批次。
- `aoci_report`：仅当当前布局和工具状态支持时，在证据不足、无法可靠生成语义时登记待办，不猜写。

其他MCP工具、CLI命令、参数和专项流程，以当前工具说明、Guide和 `--help` 返回内容为准，不在本文件中重复完整手册。

本区块只规定仓库接入、认知使用和收尾原则。`aoci_rules` 承载当前会话合同，Guide实时输出承载当前Plan的执行顺序与停点，工具Schema、Spec和Validator承载机器结构与判据；Prompt、Description、README和静态文档不能覆盖这些机器事实。

### 建立、生成和恢复认知

1. 每个新的 Agent Run 开始时，应先判断：

   - 本仓库是否已经存在可用的完整AOCI索引；
   - 当前上下文中是否已有与本仓库根、当前索引版本和当前AOCI服务相匹配，并且模型仍可可靠使用的完整仓库认知。

2. 仓库已经存在可用的完整索引，但当前Run没有可靠完整认知时，先调用 `aoci_rules`，再调用 `aoci_overview`。

   完整认知仍可靠时直接复用。局部不确定本身不要求机械重读系统全貌。

   本Run从已知Host上下文压缩恢复时（包括宿主注入的压缩摘要），必须把此前模型认知视为不可靠。压缩handoff不得保留或摘要正式Whole-Index，也不得保留或摘要任何Overview Header、Entry、Chunk、Challenge或Attestation正文；只能保留安全续接所需的receipt身份、未完成write或Recovery状态，以及立即重载指令。复制进handoff的Whole-Index语义或receipt不能证明恢复后模型的当前认知可靠。若当前上下文已无法可靠保留运行合同，先调用 `aoci_rules`。继续业务任务前，使用 `refresh_reasons=["context_compaction"]` 和新的 `refresh_event_id` 调用普通完整Whole-Index `aoci_overview`（不设置 `check_only` 或设为false）；不得使用 `check_only` 或认知probe。原样跟随每个 `next_cursor` 直到 `completed=true`，确认交付，并且只基于新交付正文提交一次Attestation。完成这次新的完整传输后，即使Attestation为partial或fail也消费该generation，并按既有合同继续source-bound任务，不再自动调用第二次Overview。

   AOCI可以针对 `context_compaction`、项目 `cognition_refresh_threshold` 下的机器 `semantic_threshold` 或主要 `phase_transition` 提供checkpoint与认知状态事实。只需要这些紧凑事实时使用 `check_only=true`；这些事实只向Agent提供建议，不替模型决定是否需要系统全貌。

   Agent显式调用普通 `aoci_overview`（未设置 `check_only` 或为false）时，只要能形成一致的CognitionSet，AOCI必须完整交付请求scope。不得因为已有receipt、阈值未达到或没有待处理刷新原因而抑制正文。正式认知Dirty或Stale时仍交付正文，但必须标记不可靠。存在未决恢复或无法形成一致snapshot时失败关闭，不返回混合正文。

   普通Overview返回 `continuation_required=true` 时，必须原样提交 `next_cursor` 并自动继续到 `completed=true`。不得询问用户、开始业务任务或给出阶段性系统结论。Host截断、缺块、重复、乱序、cursor失败、Index变化或`chunk_tokens`变化时停止本次认知链。Attestation完成前不得用Memory、源码、Spec、`aoci.txt`、历史会话、scope、search或Entry读取修补或补充Whole-Index认知。Challenge ordinal是正式Entry序列中的1-based位置；Header内容、注释、空行、Section/Overview/Chunk Marker、Receipt与Metadata均不计数，Chunk Receipt ordinal使用同一序列。Attestation必须原样回绑本次Challenge发布的当前`index_sha256`、`entry_sequence_sha256`与`entry_count`；旧Index、旧Entry序列、旧数量或旧Attestation均无效。完整链结束后只正式提交一次既有模型认知Attestation；同一响应只允许一次不改变语义答案的JSON Schema或字段格式修正。对象、Tag或F不匹配即失败且认知吸收不确定，不得语义重试或旁路补答。首次认知失败时还不得执行Root/Meta、Migration、全局布局或其他未重新绑定的系统级决策。上下文压缩刷新若传输完整、认知身份不变、治理对齐且没有Recovery或第三方冲突，即使Attestation为partial或fail也消耗该refresh generation，并继续原任务，不再自动重读Overview。`system_mastery_percent`只自评系统框架——架构、职责、强关系、稳定外部契约以及高熵安全和维护约束——不表示完整实现或运行实况知识；机器索引覆盖率必须分开。默认只向用户输出由本次真实覆盖率、Challenge、块数、Token和掌握度生成的规定成功或失败一句话。Host截断时提示用户把 `overview_delivery.chunk_tokens` 设置为更小的合法值后重新开始，不得自动修改。

   加法认知等级必须与严格证明字段分开解释。`delivery_verified`表示已加载Index且Host交付已确认，但完整认知验证仍未完成；应表达为“已加载且交付已验证”，不得描述为“没有认知”或“没有理解系统”。`cognition_verified`要求Attestation通过（Challenge至少80%的ordinal完全正确且对象身份至多失手一处），`cognition_governed`还要求治理对齐。通用完整读取失败句只用于真实交付故障。

   当Overview响应包含可选`cognition-state/v2`投影时，必须分别解释各维度。其Level止于`model_cognition_usable`；`strict_attestation_verified`、`governance_aligned`与`current_system_cognition_reliable`都是独立状态，绝不参与该Level。ordinal、对象身份、Tag或核心F不匹配可以导致严格Attestation失败，而模型认知仍然可用；不得仅凭这种不匹配就宣称模型没有理解系统。只有`current_system_cognition_reliable=true`允许无保留地声称当前完整系统认知可靠。投影缺失时继续使用上述Legacy解释。

   普通的只读审计、分析、检查、不修改代码或不提交、不push，不自动等于严格零写入，也不改变上述认知有效性判断。Codex Memory和历史Skill只能辅助恢复经验、用户偏好与调查方向，不能替代与当前仓库根、索引摘要、AOCI服务身份和认知范围匹配的当前认知收据；项目AGENTS和当前AOCI身份在AOCI状态上优先于历史Memory。

   只有用户明确禁止Ledger、元数据、`.aoci`运行资产及任何文件写入时，才按严格零写入处理。若必要的认知建立与该边界冲突，必须报告冲突并请求用户裁决或建议使用隔离副本，不得静默以Memory替代当前仓库认知。

3. 仓库没有可用的完整索引，或当前只有最小骨架、Header不完整、Entries未完成、必要Curation尚未裁决时，如果需要建立正式完整AOCI索引，先取得 `aoci_rules`，然后进入当前AOCI Guide。由Guide依据仓库真实状态决定下一阶段并完成必要安全步骤。

   `aoci_maintain` 不替代索引建立流程。

   不在本文件中自行重建或硬编码完整索引生成状态机。

4. 在长程任务中，模型负责保留当前认知收据并正确使用刷新门禁：

   - Host报告上下文压缩或模型已知系统全貌丢失时，执行上述强制 `context_compaction` 重载规则；AOCI不能自行推断Host事件；
   - 进入真正的主要阶段时声明 `phase_transition`，不得把函数、测试运行或小步骤当作阶段；
   - 在有用的稳定检查点通过 `check_only=true` 取得机器语义计数；
   - 除已知压缩的强制重载外，由Agent判断当前任务是否需要再次显式获取指定scope或完整Overview；
   - 在维护和对齐完成前，保留AOCI报告的Dirty或Stale可靠性状态。

### 任务收尾与认知维护

5. 纯只读问答、分析、版本核验，或没有产生受AOCI管理对象变化的任务，不需要调用维护工具。当前AOCI版本是任意`aoci_overview` check_only或`aoci_maintain`响应里的`cognition_receipt.mcp_service_version`；二进制路径是项目`.mcp.json`里的`command`，CLI不必在PATH上。

6. 发生受AOCI管理对象变化时，待其达到本次任务的最终稳定状态后，只调用一次 `aoci_maintain`。不要在每次中间修改后逐文件维护。

7. 若维护结果返回真实语义候选，Host 模型必须基于每个候选绑定的对象和必要证据，独立创作完整标签与F/R/A/S更新。通过 `aoci_update_entry` 一次提交当前机器签发批次的完整候选集合，同时原样保留每项 `source_sha256`、`candidate_id` 与对应domain批次身份。`max_entries`只限制单次请求和原子事务，不限制logical plan、Whole-Index或Managed Scope。`remaining`非零时，在当前批次成功Apply后重新调用Maintain并从新preimage继续；绝不能为满足transport上限缩减Index覆盖或自行截取返回批次。

   没有足够证据且当前布局支持 `aoci_report` 时，使用它而不猜测、套用模板或为消除待办而生成缺乏证据的认知。

8. 必须遵守工具返回的结构化状态和安全边界：

   - `repair_required`：只修复明确命中的候选，再重新提交当前机器签发的完整批次；
   - `stopped`：结束当前写入尝试并检查 `failed_step`、错误、正式写入证据与Recovery。auto模式下，已证明零写入则记录closure并重新Plan；完整Intent和可证明postimage则Resume；策略要求Rollback且preimage可证明则精确恢复后重新Plan。只有证据不足、第三方正式字节冲突、需要审批或外部动作，或命中其他真实安全边界时，才停止整个用户任务；
   - 冲突、审批、人工裁决、权限和安全信号不得忽略；
   - 已经对齐后不得重复维护或重复写入；`refresh_ready_for_overview` 是checkpoint事实，由Agent决定是否为下一阶段请求普通完整Overview。

   维护完成后如果又修改了任何受管理对象，之前的维护结果失效，应在新的最终稳定状态重新完成收尾。

9. 用户只限制业务文件范围，但没有明确禁止仓库托管资产时，AOCI托管资产可以在收尾阶段为保持认知一致而更新，并应在审计和提交中与业务文件区分。

   用户明确禁止修改 `aoci.txt`、`.aoci`、元数据或任何额外文件时，以用户限制为准，不得写入，并如实报告剩余不一致。

### 专项流程

初始化、完整索引生成、Header生成、Entries生成、数据库结构索引、Curation、人工评审和故障恢复，只按当前AOCI Guide或工具在对应阶段返回的指令、命令和安全停点执行。

不预加载、不猜测，也不自行重建这些专项流程。平台调用方式、请求格式、批次上限、审批规则、索引格式细节和恢复步骤由对应Guide、工具说明、模型Prompt和CLI帮助按需提供。
<!-- aoci:end -->
