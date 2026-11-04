# 接入 Qwen Code Agent 扩展

状态：待审批；仅完成调研、计划自审及官方图标下载，尚未实施源码。日期：2026-11-03。

实施仓库 `EXT = D:/work-space/context-hub-extensions`；宿主仓库 `HUB = D:/work-space/dsh-context-hub`。本文只负责 Qwen Code。六个产品可以由各自专属 Agent 并行开发；Qwen Agent 只写 `EXT/plugins/qwen-code/`，共享文件由主 Agent 协调独立任务处理，不跨产品复用开发 Agent。

## 目标与首版边界

目标包括 Qwen Code 原生 skills、MCP 声明、Markdown commands、Markdown subagents、`QWEN.md` 指令，以及原生扩展包的识别、收录、用户级文件安装/更新/卸载和用户/项目 activation 管理。沿用服务注册式接入，不复制页面、不在宿主加入 Qwen 分支。

插件包的唯一目标格式为 **`qwen-extension.json`**。阶段 1–5 可以先交付资产及原生包识别；阶段 6 固定已发布 activation/文件事务协议并协调通用宿主能力，阶段 7 实现安装器，阶段 8 集成收尾。不能因为协议复杂或没有实机就从目标删去安装能力；也不能只复制目录、只写一个 enabled 字段便宣称完成生命周期。证据或通用 API 尚不足的具体动作保留为未完成子项，列出缺口和可先交付部分，不用猜测或 CLI 回退补齐。

普通资产首版管理官方默认根 `~/.qwen` 和当前项目 `.qwen`。文档说明 `QWEN_HOME` 可以覆盖全局根，但当前 `PlaceFiles`、`SkillPlace` 没有环境根声明，首版不宣称支持自定义根。全局 `~/.agents/skills` 也不冒充已经存在的宿主共享位置。

不以真实 Qwen 客户端、独立隔离环境、已发布宿主版本或独立验收为开发前置。开发必须完成本地单测、typecheck、build 和可运行的宿主源码集成检查；实机发现、模型调用和界面效果留给用户后续自行调试，汇报时明确未验证。

## 已读上下文与现有行为

已阅读 `HUB/AGENTS.md`、`HUB/docs/memory.md`、`HUB/.claude/agents/create-plan.md`，并对照 `HUB/docs/plans/agent-cursor.md`、`agent-host-prerequisites.md` 和 `agent-p1-integrations.md`。这些旧计划只作仓库背景，当前源码和本次查证优先，不继承其中过时的“待补 API”状态。

| 路径与真实符号 | 当前行为及本次用途 |
| --- | --- |
| `EXT/plugins/cursor/src/index.tsx:apply` | 注入 skills/prompts/mcp/plugins/targets/locales；使用 `registerManifests` 声明原生路径；可复用接入方式，不复制 Cursor 路径和状态 |
| `EXT/plugins/antigravity/src/prompts.ts:createAntigravityPrompts` | 生成文件所有权标记、指令分节与坏标记保护；复用行为，不复制规则 frontmatter 或文件大小上限 |
| `EXT/plugins/opencode/src/prompts.ts` | 命令 description、正文规范化、全局指令分节；可复用短小实现方式，不复制 OpenCode 的 mode 字段 |
| `HUB/packages/resources/skills/src/provider.ts:SkillPlace/readablePlaces` | 两种固定 scope、相对目录，随 target 选择过滤；不用另写扫描器 |
| `HUB/packages/resources/skills/src/extension.ts:SHARED_PLACE` | 只有 workspace `.agents/skills`；不能推导为全局共享位置 |
| `HUB/packages/resources/prompts/src/workspace-provider.ts:PLACE/DOCUMENTS` | 已提供共享项目 `AGENTS.md`；Qwen 不重复注册该文件 |
| `HUB/packages/resources/prompts/src/command-file.ts:commandFile` | `frontmatter:false` 只规范化正文；`true` 固定生成 name/description，因此 Qwen command 仅取规范化正文、在扩展内补 description |
| `HUB/packages/resources/mcp/src/provider.ts:McpPlace/McpEntry` | `installable` 可选、`switchable` 明确；未知格式可用 declaration:null 保留展示；enabled 是 boolean，不代表连接成功 |
| `HUB/packages/resources/mcp/src/declaration.ts:readDeclaration/writeDeclaration` | 通用远程字段是 url，默认判 http；Qwen 的 httpUrl 与 SSE url 必须显式适配，不能直接传原对象 |
| `HUB/packages/core/src/place-files.ts:PlaceRef`、`src/host/place-files.ts:createFsPlaceFiles` | 仅 workspace/global 加相对路径，用户根不按客户端环境变量改变；不绕过此端口访问真实目录 |
| `HUB/packages/resources/plugins/src/provider.ts:registerManifests/PluginHeld` | 已有清单贡献生命周期，enabled 可未知；阶段 5 用 registerManifests，阶段 7 再接完整安装器与被证实的状态 |
| `HUB/packages/resources/plugins/src/contract.ts:pluginManifestPaths` | 已可追加原生清单路径并在边界检查，不必往常量添加 Qwen 文件名 |
| `HUB/packages/resources/plugins/src/host/contents.ts:readPackContents` | 已读 manifest 的 skills/commands 路径及内联 mcpServers，能服务 native-only fixture；不为 Qwen 再写目录扫描器 |
| `HUB/packages/resources/plugins/src/host/installer-files.ts` | 已有白名单、源/目标快照与进程内补偿；模板仍要求至少两段，环境根仅接受绝对路径，缺客户端兼容跨进程锁、持久提交点和分阶段 journal；完整安装需要下文通用前置 |
| `EXT/scripts/build-marketplace.mjs:iconDataUrl` | 图标上限 32 KiB；识别 PNG，不要求 SVG；市场索引是生成文件 |

无既有 Qwen 专属实现需要兼容或迁移。实施前仅检查 `EXT/plugins/qwen-code/` 是否被别的任务新建；若已有内容，先读差异并由主 Agent 协调归属，不覆盖。

## 官方证据与版本分层

本次先用 Context7 resolve Qwen Code，再查询官网与官方仓库，并直接读取下列页面。表中 D 是官网当前文档；R 是 npm 已发布版本对应源码；S 是设计，不将 S 代替 R。

### 发布基线

`https://registry.npmjs.org/@qwen-code/qwen-code/latest` 于 2026-11-03 返回 `version: 0.26.6`、`gitHead: 042c023b7beb4ad2a9ef95b2906b3564e3f23089`、Node `>=22.0.0`。这用于锁定客户端证据，不是给扩展添加 Node 生产依赖，也不是 `engines.contextHub` 的值。npm latest 将来可变，本计划针对这一发布基线及所列当前原生文档，不新增旧版分支。

| 编号 | 官方来源 | 原文或已读事实 |
| --- | --- | --- |
| D1 | [Skills](https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/) | “Store them in `~/.qwen/skills/`”；项目 `.qwen/skills/`，也读两级 `.agents/skills/`，同名 `.qwen` 优先；必需非空 name/description；插件技能名称为 `<extensionName>:<name>` |
| D2 | [MCP](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/) | 用户 `~/.qwen/settings.json`、项目 `.qwen/settings.json`，顶层 mcpServers；stdio command/args/env/cwd，Streamable HTTP httpUrl/headers，SSE url/headers |
| D3 | [Commands](https://qwenlm.github.io/qwen-code-docs/en/users/features/commands/) | 两级 `.qwen/commands/`，Markdown 可选 YAML description，子目录映射 `:` 命名空间；TOML 仅旧版兼容且已弃用，本版不实现 |
| D4 | [Memory](https://qwenlm.github.io/qwen-code-docs/en/users/features/memory/) | `~/.qwen/QWEN.md`、项目 `QWEN.md`、`.qwen/QWEN.local.md`；也读 AGENTS.md；未给 QWEN.md frontmatter，按 Markdown 指令正文处理 |
| D5 | [Extensions](https://qwenlm.github.io/qwen-code-docs/en/users/extension/introduction/) | “Commands are `.md` files”；启动发现 `<home>/.qwen/extensions`；原生 qwen-extension.json 可包含 commands/skills/agents/workflows/contextFileName/mcpServers/settings/channels；工作流默认关闭 |
| D6 | [Agent Plugins v1](https://qwenlm.github.io/qwen-code-docs/en/users/extension/agent-plugins/) | 根 plugin.json 用 canonical v1 schema；“Direct-child `skills/*/SKILL.md`”；commands/agents/hooks “these directories are ignored”，workflows 同样忽略；不加载 Qwen context/settings/channels/apps |
| D7 | [Settings](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/) | QWEN_HOME “Customizes the global configuration directory”，支持相对路径、~ 展开，项目 `.qwen/` 不受影响；QWEN_RUNTIME_DIR 仅运行数据 |
| D8 | [Subagents](https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/) | 两级 `.qwen/agents/*.md`；最小 YAML name/description 和 Markdown system prompt；省略 model/tools 时继承父上下文 |
| D9 | [Headless](https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/) | `qwen -p "..." --output-format json` 为非交互；可用于用户后续测试，不在本轮自动运行模型 |
| R1 | [0.26.6 ExtensionManager](https://raw.githubusercontent.com/QwenLM/qwen-code/042c023b7beb4ad2a9ef95b2906b3564e3f23089/packages/core/src/extension/extensionManager.ts) | loadExtensionsFromExtensionsDir/loadExtension 扫描目录，loadExtensionManifest 读原生清单；安装元数据对发现可选；activation 同时涉及旧投影和 store snapshot，不能从目录推出真实启用态 |
| R2 | [0.26.6 ExtensionStore](https://raw.githubusercontent.com/QwenLM/qwen-code/042c023b7beb4ad2a9ef95b2906b3564e3f23089/packages/core/src/extension/extension-store.ts) | 已实现 extension-store/state.json、state.previous.json、lock、transactions、rollback；快照 version:2/generation/extensions 等；“state.json is the commit point.”；投影与恢复有独立逻辑 |
| R3 | [0.26.6 install CLI](https://raw.githubusercontent.com/QwenLM/qwen-code/042c023b7beb4ad2a9ef95b2906b3564e3f23089/packages/cli/src/commands/extensions/install.ts) | --consent 跳过确认；--scope 接受 user/project/workspace；不是给 Hub 留 CLI 写入后门 |
| R4 | [0.26.6 variables](https://raw.githubusercontent.com/QwenLM/qwen-code/042c023b7beb4ad2a9ef95b2906b3564e3f23089/packages/core/src/extension/variables.ts) | 原生 qwen-extension.json、设置 .env、安装记录 .qwen-extension-install.json；不把这些文件名当成可由 Hub 随意写入的独立协议 |
| S1 | [Extension Management V2 design](https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/design/extension-management-v2.md) | 设计文档本身没有实现状态保证；其 activation store 方向已由 R1/R2 发布源码独立证实，但未来 main 的变更不能自动归入 0.26.6 |

开发者旧扩展页仍出现 TOML commands 和较少字段；本计划以 D3/D5 当前用户文档为准，不引入 TOML 兼容。D5 不是完整 formal JSON Schema；首版不编造全面清单校验器。扩展包不执行、不转换，generic host 负责安全收录和元数据展示。

### 原生格式的选择

原生清单示例字段为 name、version、mcpServers、contextFileName、commands、skills、agents、workflows、settings、channels；开发者页另列 excludeTools。D1 明确原生 extension manifest 可声明 hooks，但具体 hook shape 不作为本版独立生成协议。

Agent Plugins v1 虽为当前支持格式，仍只能激活技能与 MCP；Qwen 文档写明不重写 plugin.json/mcp.json/SKILL.md，也不生成原生清单。其 stdio 支持 `${PLUGIN_ROOT}`、`${PLUGIN_DATA}`，只展开 args/env/cwd；远程只支持 Streamable HTTP，SSE 条目跳过。选它会丢 Qwen commands/agents/workflows/context 等，因此本扩展只贡献原生路径，不增加第二个 parser、清单回退、双清单生成或跨格式转换。

这不改变 Hub 全局资产库对其他 Agent 的包识别：`registerManifests(["qwen-extension.json"])` 是新增可识别路径，不是全局拒绝所有其他清单。Qwen 安装器只接受已验证的原生清单；只有 plugin.json 或其他客户端清单的包在写盘前明确拒绝，不生成第二份清单。

## 官方图标

已下载到 `HUB/docs/research/agent-icons/qwen-code.png`，未覆盖既有文件，原始内容未重绘、裁剪、压缩或转格式。

| 属性 | 值 |
| --- | --- |
| 来源页面 | https://qwenlm.github.io/qwen-code-docs/en/ |
| 官方资源 URL | https://qwenlm.github.io/qwen-code-docs/favicon.png |
| 归属证据 | 页面原始 img 的 alt 为 Qwen Code，src 为 `/qwen-code-docs/favicon.png`；favicon/apple-touch-icon 也引用此资源 |
| 格式/尺寸 | PNG，512 × 512 |
| 大小 | 26,030 bytes，低于当前市场构建的 32,768 bytes 限制 |
| SHA-256 | `ad7aaf529ec001319a5fdd5481a147d1293355a8c6619e65036eb459c8291521` |
| 实施目标 | `EXT/plugins/qwen-code/assets/icon.png`，逐字节复制；plugin.yaml 与 img 路由均使用 .png |

官网未单独列此 PNG 的再分发许可，不能将源码许可证自动等同于图标授权。官方源码仓 [LICENSE](https://raw.githubusercontent.com/QwenLM/qwen-code/main/LICENSE) 为 Apache-2.0，第 6 节说明不授予商标/商号等使用权，保留描述作品来源的合理惯常使用例外。README 记录来源、Qwen 品牌归属和未获官方背书；不声称商标被 Apache 许可。发布时依据正式品牌条款判断再分发范围，不以此阻断本地实现。

另发现官方 VS Code 包 `assets/icon.png` 为 53,565 bytes，超过市场图标上限，未放入仓库，不为它提高上限。研究目录只保留上述文档站原件。

## 六个注入点与位置映射

扩展 id 为 `qwen-code`，服务/target id 为 `hub.target.qwen-code`；资源 URL 为 `/hub/extensions/qwen-code/assets/icon.png`。最终 inject 为 `[skills, prompts, mcp, plugins, targets, locales]`。

| 注入点 | 首版注册 | 不做的推断 |
| --- | --- | --- |
| skills | workspace `qwen-code` 与 global `qwen-code-global`，dir 均 `.qwen/skills` | 不重复 workspace 共享 `.agents/skills`；不声称已有 global shared place |
| mcp | 同两个 place id，各指向本 scope 的 `.qwen/settings.json`；每 scope 一个安装入口 | 不读写 .env，不从配置存在推断已批准或已连接 |
| prompts | 两作用域 commands/skill/agent/instructions；项目指令 QWEN.md，全局 `.qwen/QWEN.md` | 不重复 AGENTS.md；不把 Qwen 未证实的 `.agents/commands` 当命令路径 |
| plugins | `registerManifests(["qwen-extension.json"])`；阶段 7 注册原生文件安装器 | artifact 固定用户根，project 是 activation 上下文；不把目录存在当 enabled，不使用 CLI 写入回退 |
| targets | 展示实际管理位置；supports 为 `skill/mcp/memory/agent` | 不添加新 supports 枚举，不宣称独立 hooks/workflows 管理 |
| locales | `qwen-code.*` en/zh-CN 元数据、位置、必要错误消息 | 不在界面加冗余解释段落，边界放 README |

| 资产/文件 | 读写边界 |
| --- | --- |
| `~/.qwen/skills/<slug>/SKILL.md`、`.qwen/skills/<slug>/SKILL.md` | 通过现有 skills 位置交付；prompt 的 skill form 生成最小 name/description/body |
| `~/.qwen/settings.json`、`.qwen/settings.json` | 只编辑 mcpServers 下的目标 server；保留其他客户端设置 |
| `~/.qwen/commands/<slug>.md`、`.qwen/commands/<slug>.md` | description frontmatter + Hub 标记 + 正文；不添加 name、tools、model 字段 |
| `~/.qwen/agents/<slug>.md`、`.qwen/agents/<slug>.md` | 最小 name/description frontmatter + 标记 + 正文；不固化模型和权限 |
| `~/.qwen/QWEN.md`、项目根 `QWEN.md` | 仅管理该 prompt 的成对标记段；保留文件其余正文 |
| 项目 `.qwen/QWEN.local.md` | 官方支持，但首版不自动创建/修改，也不改 .gitignore |
| 项目 `AGENTS.md`、`.agents/skills` | 复用现有共享 provider，不重复注册或计数 |
| `~/.agents/skills`、自定义 skills.directories、普通资产的 QWEN_HOME | 仅在 README 标明客户端能力；普通 skills/MCP/prompts 首版不注册这些动态入口；插件根另按阶段 6 的通用声明能力实现，不混淆两条端口 |
| `~/.qwen/extensions/<name>/`、`extension-store/state.json` 及投影 | 阶段 7 只经通用宿主端口完成整包事务和已知 V2 policy 变更；不得直接接触用户根做实验 |
| `.env`、外部 settings/credentials、已有客户端安装元数据 | 不读取真实 secret，不接管凭证；新本地原生包可按 R1 的无安装元数据路径发现，身份按源码计算；有敏感安装要求时明确拒绝该次安装且不改源/目标 |

## 具体实现规则

### MCP

`createQwenCodeMcp(ctx.mcp.tools)` 只使用当前注入工具和 `io.files`。

1. null 文件可新建；现有空白文件、非对象根、非对象 mcpServers、坏 JSON/JSONC 明确拒绝写入，原文件不变。使用宿主 parser/editor，不新增 parser 依赖。
2. 单条 transport 互斥：非空 command 表示 stdio，非空 httpUrl 表示 http，非空 url 表示 sse；不能混合。在调用通用 readDeclaration 前检查 args 为字符串数组、env/headers 为字符串 map，不能依赖该工具静默丢无效值。unsupported 条目 read 时返回 declaration:null 保留行；安装覆盖/删除不能静默接管不理解的条目。
3. 读取 HTTP 时临时映射为 `{...entry,url:entry.httpUrl,type:"http"}`；读取 SSE 临时补 type:sse。仅用于内存转换，不把 type/transport 字段写进 Qwen 配置。stdio 使用通用 command/args/env。
4. 写入 stdio 用 command/args/env；HTTP 用 httpUrl/headers；SSE 用 url/headers。只改当前 server 的已管理字段及移除互斥 transport 字段，保留 cwd、timeout、discoveryTimeoutMs、oauth、includeTools/excludeTools、trust 等不在表单建模的字段、其他 server、根字段与注释。
5. transport 切换若会使既有额外字段语义失效，例如从 stdio 切远程仍有 cwd 或远程 oauth/headers 进入 stdio，拒绝并提示冲突，不自动丢弃用户配置。不把 secrets 从环境变量展开后写回；字符串占位符原样保留。
6. `uninstall` 只删目标节点，缺失节点为幂等空操作；`locate` 用 jsonValueLines 指向真实节点。
7. 两个 place 均 `switchable:false`，不实现 setEnabled，不发明 disabled 字段。read 的 enabled:true 仅符合无开关的声明视图，README 明确不代表客户端实际允许、连接或最终覆盖结果；mcp.allowed/mcp.excluded 的模式解析不在本版。

### Prompts

`createQwenCodePrompts(icon, ctx.prompts.tools)` 提供 commands、skill、agent、instructions。place/form/option 必须在声明内，不接受任意路径。

- 文件名用 tools.slugOf，再拒绝空值、点段、路径分隔符、Windows 不可用字符、保留名与末尾点/空格；用户名称不参与路径拼接。技能 frontmatter 的 name 使用验证后的 slug。
- description 优先 prompt.description，再 describeBody，再 prompt.name。YAML scalar 用扩展内最小字符串编码，覆盖引号、冒号、换行及 Unicode；不加模型、tool allowlist 或 approvalMode。
- 正文通过 commandFile({frontmatter:false}) 统一 BOM/换行和结尾；commands 在本地补单个 description，skills/agents 补 name/description。指令文件不添加 YAML frontmatter。
- 生成文件的第一段仍是 YAML frontmatter，紧接第一条正文为 `<!-- context-hub:<slug> -->`。只有准确位置的标记可证明归属；手写文件、正文别处偶然含标记或不同 slug 均不能覆盖/删除。
- QWEN.md 使用 withSection/withoutSection；写前检测开闭不成对、重复和逆序，拒绝让坏标记吞掉用户文字。移除只删自己的段；剩余空白才删文件。held 每次读实际位置和标记，不用内存投递记录代替文件状态。

### 原生包识别与生命周期目标

原生包识别先独立完成；完整安装器保留为本计划目标，在阶段 6–7 解决发布协议及宿主前置，不把未知项变成默认放弃的功能。

- native-only fixture 含 qwen-extension.json、非默认 commands/skills 路径、内联 mcpServers、context/agents/hooks/workflows；证明 generic intake 完整收录且没有执行任何脚本，不生成 plugin.json。
- 当前 manifest 不是完整 formal JSON Schema：安装器只验证实际消费的必需字段、包名一致、路径安全和已建模值类型，保留其他当前原生字段；不因不认识无关字段便静默删改。
- 相同物理 artifact 固定在 `QWEN_HOME/extensions/<name>`。用户级新安装对应 defaultActivation=enabled；项目级初次安装在同一物理根，只使当前 workspace enabled、默认 disabled，不能复制到猜测的项目 extensions 目录。
- 对 Hub 已管理 artifact 的更新保留现有 policy 和其他 workspace overrides；显式用户开关改 defaultActivation，项目开关只改当前 workspaceOverride，不能顺手调用会清空其他 override 的 scope-reset 语义。
- 卸载 artifact 是用户级操作，必须同时移除对应 V2 policy 并同步投影；清除项目 override 是解除项目策略，不是物理卸载，不得删除其他 workspace 共用的 artifact。
- 有外部来源、未知元数据、链接、不可解析 policy、待恢复事务或所有权摘要不符的条目仍展示，只读且 enabled 可未知；不得覆盖、自动迁移或以客户端默认 true 掩盖未知。

### 已证实的发布协议

以下来自 R1/R2 的 0.26.6 源码，区别于 S1 设计；方法名供实现时逐项核对和建立 fixture。

| 项目 | 已知语义 | 实现约束 |
| --- | --- | --- |
| 身份 | `getExtensionId` 无安装元数据时使用 sha256(config.name)；snapshot 或 stored-credential 的 installId 有独立分支 | Hub 新本地目录包可用无元数据路径，不伪造 credential/installId；外部记录按已存在的当前元数据解析，不按路径猜 id |
| Snapshot | version:2、generation、legacyProjectionHash、extensions map；policy 含 name、defaultActivation、workspaceOverrides，可能还有 artifactDirectory/artifactGeneration/skillWorkspaceOverrides 等 | 精确校验现行版本，保留不相关 policy/当前已知可选字段；旧版本或坏结构拒绝写入，不做历史迁移 |
| 投影 | `projectionHash` 为 sha256(JSON.stringify(projection))，不是任意排序后的 JSON；`buildLegacyProjection` 决定生成顺序和 legacyProjectionRemainder 保留 | fixture 对同一输入逐字节比对上游预期；不能自行换 canonical JSON 规则。当前 version:2 的 legacyPathRules/投影是协议组成，不因名称含 legacy 而删掉 |
| 优先级 | `getActivation` 先看 canonical workspace 精确 enabled/disabled，再处理 inherit mask，之后当前 policy 路径规则，最后 defaultActivation | 读取只报告文件策略效果，无法知道运行会话的 CLI override、安全模式和连接状态；不标“运行中” |
| Workspace key | `canonicalizeWorkspacePath` 用 path.resolve，再 fs.realpathSync.native；仅 ENOENT 回退 resolved | 需要通用的 captured workspace canonical path 能力，不能在浏览器用字符串大小写/斜杠猜 canonical key |
| 状态写入 | `writeSnapshotUnlocked` 先保存有效旧 snapshot 到 state.previous.json，再原子写 state.json，之后尽力写投影；state.json 是 commit point | 提交点之后投影/清理失败不能回滚为“未安装”；须返回已提交及遗留修复项，避免页面重试重复操作 |
| Artifact 事务 | `commitArtifact` 使用 staging/rollback/transactions，journal version:1，phase 为 prepared/artifact_swapped/state_committed；含 previousGeneration/targetGeneration/targetSnapshot 和目录引用 | 必须以发布源码为准生成可恢复 journal；不能把现有仅进程内 rollback 当断电恢复保证 |
| 锁 | `withLock` 使用 proper-lockfile 对 extension-store/lock 锁定，stale 60000ms、update 5000ms；加锁后先处理现存恢复事务 | 需要客户端兼容跨进程 lease；不能只依赖 PluginDisk.run 的进程内队列，也不能看一次 lock 不存在后直接写 |
| 卸载 | `commitArtifact(operation:uninstall)` 从目标 snapshot 删 identity，generation 增一，并协调 artifact 移除；CLI 还会清理偏好 | Hub 至少保证 artifact/store/projection 一致。偏好若涉及 secret 或未证实格式则原样保留并如实报告；不能删除整个 .env 或他人偏好 |

### 未确认项与可先交付路径

R1/R2 已足以规划 V2 安装，不再将 activation 一概称为未知。仍需在阶段 6 从同一固定提交建立可执行 fixture 的细节是：完整 journal 校验与恢复排序、失败阶段的 Windows copy/rename fallback、偏好 cleanup 的精确范围、客户端额外安装设置的需求判定、project override 的宿主 UI 表达。每项均有具体源码符号或对应通用契约工作，不要求先跑真实客户端。

如果某一细节不能从固定发布源码及其测试证实，先完成该 parser/只读列表与阶段 1–5，不暴露对应写按钮；任务中准确留下未完成的 action、缺少的证据/宿主能力和下一条源码测试。不能将这种局部未完成写成整项安装能力已经完成，或整体从计划删掉。旧格式迁移、credential 安装和需要用户提供 secret 的包不列入本轮自动写入范围，遇到时零写入拒绝并解释。

### 所需通用宿主前置（协调任务，不加入客户端分支）

以下是拟新增能力，不是声称当前 API 已存在；主 Agent 指定一个共享所有者实现，Qwen Agent 同步 contracts 镜像与测试。可先并行开发资产、纯 policy 函数及 fixture；共同 API 完成后接通 I/O，客户端实测不在依赖链。

1. **直接子目录模板**：允许 `directories:[":name"]`，仍精确包含一个 name token、拒绝空段/点段/越界/根目录删除。Qwen 声明 home `.qwen`、state `extensions`，目的相对路径 name；宿主不认识 extensions 字面量。
2. **环境根与 canonical workspace**：通过声明选择客户端文档需要的 absolute/relative/~ 环境根策略，不改变既有扩展默认约束；捕获并返回 realpath 后 workspace key。普通 assets 的环境根是另一条端口能力，本计划仍明确默认根覆盖，不借插件端口推导已支持。
3. **客户端兼容目录 lease**：通用声明锁 ref、stale/update 与有界重试；所有路径重新通过白名单/no-follow 校验，提供 compromised 失败状态和释放。仓库 lockfile 已含 proper-lockfile@4.1.2，但没有直接依赖声明；若由共享实现采用它，在 host 包明确声明同版直接依赖，理由是兼容既有 stale/heartbeat 协议，不能从传递依赖偷 import，也不自行手写另一套伪锁。当前计划阶段不安装依赖。
4. **持久目录/文件事务 recipe**：保留 source/target snapshots，支持扩展提供声明式 journal 文档及 prepared→artifact swap→state commit→after-commit projection/cleanup 顺序、显式提交点和对应备份路径；允许在同一已声明锁下复核 state.previous/state/policy。journal 的 JSON 由 Qwen 扩展按已证实协议生成，宿主只执行通用阶段、白名单/no-follow、快照比较、原子写/恢复；禁止宿主硬编码 Qwen 的 schema/字段。字段名由共享 owner 落地后同步，不在扩展假用未存在 API。
5. **恢复与拒绝边界**：遇到外部待恢复 journal/损坏 state，未完成当前协议的源码恢复 fixture 前只读拒绝该次变更，不猜修复。新事务在每个 crash point 的 recipe 必须与发布源码恢复预期一致；提交后投影失败要展示 committed warning，不能伪报回滚成功。
6. **安装与 activation 分离**：当前 PluginPlace 没有 switch-only/安装过滤能力，且 file 暗含同一 scope 的物理位置。用通用贡献数据表达 artifact 安装目标、只切换策略的 workspace 上下文及实际 global 状态文件 ref，安装菜单过滤 switch-only，project 清除 override 不画成物理卸载；不发明项目 settings 文件。若共同 API 只先完成 user 安装/开关，则 user 生命周期先交付，project action 保留未完成子项，不能用复制 artifact 冒充 project 安装。

共享候选文件为 `HUB/packages/resources/plugins/src/{provider,tools,handlers,rows,install-actions}.ts*`、`src/host/installer-files.ts` 及对应测试；若 physical PlaceRef/bridge 扩展确有必要才动 `HUB/packages/core/src/place-files.ts` 和适配器。新增 import/export、HTTP handler、镜像契约、菜单/计数、fixture 与异常本地化都由共同 owner 一起验收。共享验收至少运行当前 package scripts：`pnpm --filter @context-hub/plugins typecheck`、`pnpm --filter @context-hub/plugins test`、相关 lint；若改 core 则同时跑 core 对应脚本，公开 API 稳定后再由主 Agent 跑全仓检查。

## 受影响文件、调用方与并行边界

新增 `EXT/plugins/qwen-code/`：

```text
package.json
plugin.yaml
build.mjs
tsconfig.json
vitest.config.ts
README.md
assets/icon.png
src/index.tsx
src/contracts.ts
src/locations.ts
src/messages.ts
src/provider.ts
src/prompts.ts
src/plugin-state.ts                # 当前 V2 身份、policy、投影、recipe 纯函数
src/installer.ts                   # 原生文件 I/O 与 PluginInstaller
__test__/registration.test.ts
__test__/provider.test.ts
__test__/prompts.test.ts
__test__/native-manifests.test.ts
__test__/plugin-state.test.ts
__test__/installer.test.ts
__test__/fixtures/upstream-v0.26.6.ts # 固定发布源码的输入/预期，含来源，不下载执行客户端
__test__/host.test.ts
__test__/fixtures.ts
__test__/react-jsx.ts
lib/index.js                       # build 生成，不手写、不提交
```

- `package.json` name `qwen-code`，main/exports 指 `lib/index.js`；scripts 使用现有 `build: node build.mjs`、`test: vitest run`、`typecheck: tsc --noEmit`，依赖版本沿用同仓当前参考包，无新生产依赖。
- `plugin.yaml` id `qwen-code`、category agent、中英 metadata、icon assets/icon.png、permissions `[assets.read,assets.write,filesystem]`；注入六项。version 在 package.json，plugin.yaml 不放 version/entry。engines.contextHub 只绑定实际宿主版本，不填 Qwen 版本或虚构未来宿主版本；可先开发，发布兼容范围由主 Agent 统一核对。
- `build.mjs` 保留参考包 absWorkingDir、浏览器 ESM 与四个 React external；不让下载扩展运行时 import Hub workspace 包。
- `contracts.ts` 仅镜像实际使用的当前 shape，包括 nullable McpEntry.declaration、McpPlace.installable?、registerManifests，以及阶段 6 实际交付后的 PluginInstaller/PluginDisk 通用能力；不把 proposed contract 当已存在 API，不加入旧宿主降级或 CLI 回退。
- `index.tsx:apply` 负责生命周期归属；卸载扩展后位置、target、locale、manifest 声明撤销。icon 用静态 img 路由，保留 alt 或可访问名称策略。
- `locations.ts` 是 id、路径、supports 的唯一来源；messages.ts 只定义必要中英消息。
- 调用方为宿主已有 skills/prompts/mcp/plugins 目录页、targets 侧栏、locale 消费方和 marketplace 构建；Qwen 产品 Agent 不复制页面。安装/activation 分离若需菜单改动，由阶段 6 共同 owner 作为通用能力实现并覆盖调用方/导出/bridge，不在产品目录偷偷耦合宿主。
- 根 pnpm-workspace.yaml 已覆盖 plugins/*，不用改。pnpm-lock.yaml、marketplace.json 等共享/生成文件由主 Agent 协调；产品 Agent 不手工改市场索引、不在并行中覆盖 lockfile。
- `HUB/docs/research/agent-icons/qwen-code.png` 是本轮计划产物，实施只读复制；本计划与图标以外没有本轮仓库改动。

实施前搜索 `qwen-code`、`hub.target.qwen-code`、place id、`qwen-extension.json` 的已有直接引用、字符串、测试和动态 import；这用于避免并行撞名，不是安排重命名。若需改名，再分别查类型、re-export、fixture、文档和生成引用，不改其他产品。

## 分阶段实施与验收

批准后创建八条 TaskCreate，subject 使用下列阶段名；每阶段开始前 in_progress，验收立即 completed。阶段 6 涉及的公共 API 单独交共同 owner，任务列表显式记录依赖；Qwen 产品 Agent 仍可完成独立的纯协议函数和资产部分，不等待实机。若范围调整，先同步任务与本计划，再改源码。以下命令已按 EXT 根和参考包的真实 package.json 核对；`--filter qwen-code` 对应阶段 1 新包沿用的现有脚本，没有虚构测试脚本。

### 阶段 1：建立扩展骨架

**目标**：建立独立可构建扩展和正确品牌资源。

**文件**：package.json、plugin.yaml、build.mjs、tsconfig.json、vitest.config.ts、assets/icon.png、src/index.tsx/contracts.ts/locations.ts/messages.ts、README.md、registration.test.ts、react-jsx.ts。

**动作**：先逐字节复制研究图标，再沿用 Cursor 构建配置创建最小 target/locales 注册。资源 provider 按后续阶段逐个加入，未实现能力不提前写入 supports；不创建无行为占位 provider。README 记录原始图标 URL、摘要、品牌限制和当前开发状态。

**验收**：在 EXT 根运行 `pnpm --filter qwen-code typecheck`、`pnpm --filter qwen-code test`、`pnpm --filter qwen-code build`。注册测试确认 id 唯一、图标路由为 PNG、locale 两种；图标字节摘要与本文相同且不超过 32 KiB。构建输出只含该扩展、React 保持 external。若本机现有依赖链接未覆盖新包，由主 Agent 协调工作区依赖；不改包管理器或添加替代依赖。

### 阶段 2：注册技能位置

**目标**：通过现有服务交付原生 workspace/global skills，正确复用共享位置。

**文件**：src/index.tsx、locations.ts、contracts.ts、README.md、registration.test.ts、fixtures.ts。

**动作**：注册两个 `.qwen/skills` places 和共同 provider id；仅声明真实覆盖的默认根。保持 `.agents/skills` 在宿主 shared provider 中，全球共享目录只在 README 说明未管理。

**验收**：同三条包级脚本；测试两个 scope/dir/id/order，选择 target 时可读取、不选择时不贡献原生位置，注销后清除；不重复 shared workspace，也不凭空注册 global shared。测试使用 in-memory service 或真实 Cordis 生命周期 helper，不能把只记录调用次数当注销证明。

### 阶段 3：实现 MCP 声明读写

**目标**：两个 settings 文件均能安全增删声明，并明确 transport 与状态语义。

**文件**：src/provider.ts、contracts.ts、index.tsx、locations.ts、messages.ts、provider.test.ts、fixtures.ts、README.md。

**动作**：按上文适配 stdio/httpUrl/url；使用宿主 JSONC 工具，按节点修改；两个位置均 switchable:false；未理解格式只读展示，写入拒绝。不接触真实 .env 或变量值。

**验收**：同三条包级脚本；覆盖两 scope、三 transport、transport 冲突、空/坏容器、不支持 entry、占位符保留、注释/未知根字段/其他 server/额外字段保持、幂等删除、locate。源数据同时含 httpUrl 与 url 时拒绝，不能默选。无关字段或 transport 额外配置会丢失时零写入；断言没有 setEnabled、disabled 写入及子进程调用。

### 阶段 4：交付命令与指令

**目标**：完成 commands、skills、agents 和 QWEN.md 的安全投递/移除。

**文件**：src/prompts.ts、contracts.ts、index.tsx、locations.ts、messages.ts、prompts.test.ts、fixtures.ts、README.md。

**动作**：两个 PromptPlace 提供四种 form；命令只写 description，技能/代理写 name/description；QWEN.md 管理标记段。项目 AGENTS.md 仍由 shared provider 管理；不写 QWEN.local.md、TOML、rules、workflows。

**验收**：同三条包级脚本；覆盖两 scope/四 form、最小 frontmatter、Unicode 描述和 slug、BOM/CRLF、参数占位符原样、正文第一条所有权标记、手写冲突、错误 place/form/option、重复/不成对指令标记、幂等更新、只移除自身片段、剩余正文保留。held 从真实 fixture 文件计算；无 marker 的同名文件始终保留。

### 阶段 5：识别原生扩展包

**目标**：让 Hub 当前 generic intake 识别 Qwen native-only 包，不引入生命周期写入。

**文件**：src/index.tsx、contracts.ts、registration.test.ts、native-manifests.test.ts、fixtures.ts、README.md、plugin.yaml。

**动作**：声明 qwen-extension.json。用最小原生 fixture 验收 host collect/describe/readPackContents，对非默认 commands/skills 路径和内联 MCP 直接读取；包原件不变。本阶段先不注册 installer；阶段 6–7 完成当前协议的安全 I/O 后接通，不把 version:2 的单字段写入当成安装实现。

**验收**：同三条包级脚本；声明和注销生命周期、native-only 收录、name/version/description、非默认组件路径、内联 MCP、脚本未执行、源包无补写 plugin.json 均通过。本阶段不提前暴露未实现写按钮，不访问用户真实 extension-store/.env/安装元数据。host 集成命令见阶段 8；缺少 Qwen CLI 不跳过纯单测。

### 阶段 6：固定原生文件事务契约

**目标**：将 R1/R2 发布实现转成可执行的纯协议 fixture，并交付/协调完整安装所需的通用宿主能力；不下载执行客户端、不用实机代替源码核对。

**文件**：`src/plugin-state.ts`、`__test__/plugin-state.test.ts`、`__test__/fixtures/upstream-v0.26.6.ts`、`contracts.ts`、README.md；共同 owner 负责上文列出的 HUB 通用文件、依赖声明和对应 bridge/UI/事务测试，Qwen Agent 不抢写公共文件。

**动作**：

1. 对照固定提交的 `getExtensionId/hashValue`、`parseState`、`getActivation`、`buildLegacyProjection/projectionHash`、`writeSnapshotUnlocked`、`commitArtifact/withLock` 和 journal 校验/恢复函数，记录输入、输出、文件集合和提交顺序。fixture 中标来源 URL/commit，不复制整个客户端源码，不引入运行时客户端依赖。
2. 实现当前 V2 的解析、身份、policy 修改、投影与 transaction recipe 纯函数。保留不相关当前记录和规则；历史版本/单独旧投影不自动迁移。缺少完整证据的 recovery 变种保持只读拒绝，并精确列明，而不是猜写。
3. 主 Agent 调度共同 owner 实现直接子目录、lease、canonical workspace、持久提交点及 stage recipe；同步 types、handlers、tools、测试和前后端声明。安装/activation 分离能力独立表达，不把 project 画成另一份包。

**验收**：EXT 包级 typecheck/test/build 通过；源码 fixture 至少覆盖无 metadata 的 id、snapshot installId 分支、坏 id/name、版本/容器校验、未知当前字段保留、default/exact/inherit/规则优先级、投影 hash 字节顺序、generation 递增及 source-only 未执行断言。共享任务执行上文 HUB 包级脚本；锁竞争/过期/compromised、prepared/swap/state commit/投影失败/清理失败、no-follow、跨根与源/目标并发变化均有可执行测试。不能以 fixture 单测通过声称 Qwen 实机已加载。

**阶段出口**：共同 I/O 尚未落地时，纯函数/fixture 可以验收，但不得将共同依赖或阶段 7 标完成；阶段 1–5 仍可独立交付，缺口是明确开发任务，不是客户端安装门槛。

### 阶段 7：实现原生扩展生命周期

**目标**：通过已交付通用端口完成 native-only 文件安装/更新/卸载及已证实的 activation，不调用 CLI、不落入真实用户配置测试。

**文件**：`src/installer.ts`、`plugin-state.ts`、`contracts.ts`、`index.tsx`、`locations.ts`、`messages.ts`、`__test__/installer.test.ts`、`host.test.ts`、fixtures.ts、README.md。

**动作**：

1. `createQwenCodeInstaller` 声明 home `.qwen`、当前文档的环境根策略、state `extensions`、单段 name 模板；state/projection/journal/ownership 只在所需路径白名单中。available 只检查宿主能力，不要求 qwen 在 PATH；禁止调用 tools.run/has/syncMarketplace 执行客户端安装。
2. held 列出原生目录并按 R1 的真实 metadata/manifest 求 id；与当前 V2 policy 对上后才返回文件策略的 enabled，不能对上的 readOnly/unknown。外部包不因同名就成为 Hub 所有；sourceAvailable 仅核实后填写。
3. install 对 library 源、原生清单、包名/目录、当前 snapshot 和目标树取快照；拒绝非原生输入、混淆清单、安全路径失败、未完成外部事务和需要 secret 的安装。Hub 新本地包不生成凭证元数据，按发布实现的无 metadata 分支计算身份。提交 native-compatible journal、artifact 和 snapshot/projection，用户级新安装 default enabled；新项目激活按已交付的 scope 模型设置，已有其他 policy/override 保留。
4. 相同已管理原件安装幂等；版本更新完整保留原生组件与当前 activation，用 source/target 摘要拒绝外部改动。所有权 sidecar 不写入包源，不改变厂商清单；如果 sidecar 与 state 提交不能同事务保护则不宣称可安全接管。
5. setEnabled 只改当前 user default 或当前 workspace 精确 override，generation/projection/previous snapshot 按源码顺序提交；不覆盖其他 workspace。清除 project override 与 user artifact remove 分开。PluginPlace 不具备对应语义时等共同契约接通，不能发明项目物理文件。
6. remove 只对当前 Hub 所有且摘要匹配的 artifact 执行发布协议的用户卸载：目录与目标 policy 同事务移除、projection 重算、不留可重新生效的残留。settings/偏好若涉及未知或 secret 字段原样保留，报告该清理未实施；不删除整个 store、.env 或外部包。需要当前客户端恢复的既存异常只读拒绝，避免猜测修复。
7. 将 installer 注册与 apply 生命周期绑定；只有已实现且通过源码 fixture/宿主测试的动作进入菜单。README 分别写出 user 安装、project activation、未覆盖的特殊输入和客户端加载未实测，不能用未知 enabled 计入开关。

**验收**：EXT 包级脚本及显式 CONTEXT_HUB_CHECKOUT host test 通过；覆盖 fresh install→held→toggle→update→remove、原生组件整包保持、source snapshot/目标变更冲突、非 managed 拒绝、坏 V2/旧版反例零写入、其他包与 workspace policy 保留、投影正确、state.previous、generation、全部 crash points 的提交/恢复语义、external pending journal 拒绝、安装后卸载不复活。临时 fixture 验证锁和事务，不访问真实 Qwen；run/网络工具调用即失败。project 单独缺契约时准确保留未完成 action，不能将 user 通过扩大报告为全 scope 通过。

### 阶段 8：完成集成与收尾

**目标**：用真实宿主源码端口证明文件和注册契约可用，清理本次产物，交给主 Agent 汇总。

**文件**：__test__/host.test.ts、fixtures.ts、registration.test.ts、README.md 及本扩展自己的遗漏修正；不得扩展到其他插件。

**动作与验收**：

1. 沿用 `EXT/plugins/opencode/__test__/host.test.ts` 的 `CONTEXT_HUB_CHECKOUT` 入口，只在测试加载真实 toolkit、PlaceFiles 和 native library；临时文件由测试内部生成和清理，不要求外部准备隔离系统。运行 `CONTEXT_HUB_CHECKOUT=D:/work-space/dsh-context-hub pnpm --filter qwen-code test`，确认 host tests 实际执行，记录数量与 skip；缺依赖时列出未执行命令，不伪报通过。
2. fixture 注入临时 userHome/folder/hubHome，验证真实 JSONC 编辑、QWEN.md 分节、native-only 库收录；子进程和网络端口设为调用即失败，证明没有真实 Qwen、MCP、hooks、npm 或凭证访问。无宿主路径时纯单测仍必须执行，host tests 明确标注跳过；本机双仓可用时应执行上述显式命令。
3. 再运行 `pnpm --filter qwen-code typecheck`、`pnpm --filter qwen-code build`。向主 Agent 交付包级结果和文件列表，由主 Agent 在并行产品合并后统一跑 EXT 根现有 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`（后者含 build:marketplace），避免产品 Agent 同时覆盖生成索引。
4. 根 lint/build 如因他人改动失败，报告原始失败和归属，不修其他产品。市场集成检查 Qwen 条目真实出现、icon MIME image/png、字节数合法、lib/index.js 存在；不手写市场 JSON。
5. 清理自己的未用 import/fixture、临时构建噪音；README 最终明确实际覆盖路径、默认根、普通资产自定义根/全局共享缺口、各插件 lifecycle 动作的完成与未完成范围、MCP 声明视图和未跑客户端。检查 diff 仅含本产品及协调允许的生成记录，无凭证、本机路径硬编码或无关格式化。
6. 阶段 6 的共同宿主文件若实际改动，由该 owner 在稳定后维护 AOCI；本轮只写计划和图标，不调用源码索引维护。计划只有用户明确确认实施完成后才由主 Agent 归档，本阶段不提前移动。

**完成判据**：包级 typecheck/test/build 通过，host tests 的执行/跳过事实清楚；native 文件安装/更新/卸载、activation 和异常恢复的每项有源码 fixture 及真实宿主端口证据；未完成 action 单列而不冒称通过。六个注入点与菜单声明一致、未知状态不伪造；官方图标原件可追溯。真实客户端效果未验证必须单列，但不阻止开发完成。

## 不做与依赖边界

本轮不实现 TOML commands、Agent Plugins v1/Claude/Gemini 清单回退、双清单转换、历史 activation 迁移、插件市场注册、npm/Git 远程安装、客户端 secret/settings 提示交互、secret 存储、CLI 写入回退、独立 hooks/workflows/规则编辑器、嵌套工作区发现和普通资产的动态全局根。当前原生包中的相关组件完整保留，但 Hub 不执行它们。需要 secret 的具体安装输入不自动处理，不代表剔除无 secret 的原生本地安装目标。

原生安装/更新/卸载及 user/project activation 已纳入阶段 6–7，所需身份、generation、投影、客户端兼容锁、事务/恢复与 scope 模型由固定发布源码和通用宿主能力实现，不再仅列作“将来另行要求”。若部分证据不足，清楚保留该 action 为未完成子项，阶段 1–5 可先交付；不扩大为放弃全部安装，也不为通过验收降低数据一致性。宿主仍不得出现 Qwen 路径/环境变量/schema 分支。

## 后续人工验证清单（不作为开发阻断）

以下是查证客户端行为的命令，不是本轮自动执行任务。客户端未安装时报告无法运行，不要求安装后才完成扩展开发。

- `qwen --version`：比较当前客户端与本计划 0.26.6 基线，避免把 main 文档变化视作旧版兼容任务。
- `qwen extensions install --help`、`qwen extensions enable --help`：核对该客户端实际 scope/consent；不由 Hub 调用。
- 若用户自行准备绝对 QWEN_HOME 和无执行组件的 fixture，可用 `QWEN_HOME=<absolute-path> qwen extensions install <fixture> --consent --scope user` 后比对 state/projection。此测试需要用户选择目录；不把占位符当可直接运行的命令，不触碰真实全局根。
- 用 `/skills`、`/memory`、`/agents` 和命令菜单核查对应资产；MCP 只使用用户明确选择的无凭证测试服务，不能因文件测试通过就声称连接成功。
- 如需 headless 模型检查，由用户自行选择模型及凭证后执行 `qwen -p "<prompt>" --output-format json`；其外部调用和费用不包含在本计划自动操作中。

## 自审记录

- 修正了将 V2 仅称“设计未知”的过时结论：用 npm gitHead 对应发布源码 R1/R2 证实实现存在，同时拒绝把设计页作为完整文件写入规范。
- 移除真实客户端/隔离环境/独立验收的开发门槛；每个阶段均可由本地工具和 fixture 验收，人工清单单独记录。
- 修正了先前将 native lifecycle 整体剔除的范围收窄：目标包括文件安装/更新/卸载及 activation，阶段 1–5 可以先交付，阶段 6–7 完成协议和共享端口。只有证据不足的具体 action 不暴露，不能借“复杂/没实机”取消目标；无猜写 activation、无 CLI 后门。
- 重新核对 shared skills 只有 workspace、PlaceFiles 不读 QWEN_HOME、MCP url 默认判 http；避免复制相似客户端的全局覆盖和 transport 语义。
- 修正图标大小问题：未采用超限 VS Code PNG，保留官网原始 favicon，摘要/格式/大小和市场限制均已检查；未伪造独立图标许可。
- 八阶段都有目标、文件、动作和验收；package scripts 来源真实，测试覆盖零写入反例、未理解格式、手写归属、坏指令标记、注销、current V2 policy 以及持久提交点/恢复。proper-lockfile 兼容参数来自发布源码，不从库名推导协议。
- 无重命名或共享生成文件抢写；公共 API/导出/bridge/UI/依赖由阶段 6 的共享 owner 统一实现与验收，产品 Agent 独占自身目录。仅计划与图标已产出，未经用户批准不得实施。
