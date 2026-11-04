# 接入 Kiro 资产与 Powers

状态：待审批。本文完成调研、实施规划与官方图标取样，尚未创建扩展源码、安装依赖、改客户端配置或启动服务。用户批准后再执行本计划；计划完成由用户确认后才移入 archive。

调研日期：2026-11-03。实施仓库为 `D:/work-space/context-hub-extensions`，宿主参考仓库为 `D:/work-space/dsh-context-hub`。下文 `plugins/` 均属于扩展仓库，`packages/` 均属于宿主仓库。由 Kiro 专属开发 Agent 独立执行，可与其他产品并行；不等待其他产品、真实客户端、隔离验收环境或 Host 新版本发布。

## 目标与边界

整体目标包括 Kiro 的原生资产交付与 Powers 文件化管理。先交付 Hub 的 skills、MCP、提示词到已公开的默认文件位置，再按已确认的客户端磁盘协议接入 Powers；不因复杂、缺少真机或隔离环境就从目标中删除 Powers。只支持当前官方配置文档和 Agent Plugins 格式，不增加历史 parser、别名、迁移或回退。

**阶段 1–4 可独立交付资产；Powers 保留为阶段 5 的原生接入目标。** 官方已经给出用户根 `~/.kiro/powers/`，但尚未给出足以实现完整文件安装的安装子目录、发现记录、卸载记录和启停持久化协议。当前证据下先不执行插件安装，不能根据根目录猜写 `installed/`、`installed.json`、`enabledPlugins` 等状态，也不能用 CLI 写入绕过文件化要求。阶段 5 明确补齐证据、契约与安装器的路径；缺少客户端运行环境只产生未实测声明，不阻断基于可靠协议的实现。

本计划不做：项目级 Powers（官方作用域不支持）、`POWER.md` 兼容、独立 MCP provider 越权管理 Powers 内部 MCP、Hooks、Workflows、独立 Commands 目录、云同步、登录、连接探测、组织策略、Kiro 内部数据库、普通资产的自定义配置根、客户端版本自动探测或任何跨产品重构。Powers 自定义根属于阶段 5 的通用根策略核对项，不宣称已有完整支持。

## 真实源码依据

| 文件与符号 | 当前行为及实施含义 |
| --- | --- |
| `plugins/cursor/src/index.tsx:apply` | 注册 skills、prompts、mcp、plugins、targets、locales；Kiro 资产交付先使用五个，Powers 适配器在阶段 5 根据证据接入第六个。 |
| `plugins/cursor/src/contracts.ts` | 下载扩展只镜像使用到的宿主类型，运行时不 import Host 包；Kiro 继续这一模式，阶段 1–4 不复制 installer 契约。 |
| `plugins/cursor/src/provider.ts:createCursorMcp` | JSONC 原位编辑、固定物理文件、拒绝覆盖未知同名声明；复用行为模式，不复制 Cursor 专属字段。 |
| `plugins/antigravity/src/prompts.ts:createAntigravityPrompts` | 使用持有标记保护独立文件，使用 `withSection/withoutSection` 管理全局指令；可参考其冲突检查。 |
| `plugins/cursor/{package.json,build.mjs,tsconfig.json,vitest.config.ts}` | 已有 ESM/esbuild/TypeScript/Vitest 工具链与 React JSX 测试替身；不引入生产依赖。 |
| `plugins/cursor/__test__/fixtures.ts:fixture` | 通过测试专用 Host 源码变量加载真实工具，`home/userHome/workspace` 全部传临时目录；Kiro 测试缩小到所需文件端口。 |
| `packages/resources/skills/src/provider.ts:SkillPlace` 与 `extension.ts:SHARED_PLACE` | skills 注册目录相对 home/workspace；共享 place 只有工作区 `.agents/skills`，不能称 Kiro 已从此读到技能。 |
| `packages/resources/mcp/src/provider.ts:McpProvider` | 每个 place 对应一个确定的 `PlaceRef`；read/install/uninstall/setEnabled/locate 可用。 |
| `packages/resources/mcp/src/declaration.ts:readDeclaration/writeDeclaration` | 通用声明只含 stdio command/args/env 或 remote url/headers；扩展负责 disabled 等客户端字段。 |
| `packages/resources/prompts/src/provider.ts:PromptProvider` | form 可由扩展声明；无需增加 Kiro 专属宿主分支。 |
| `packages/resources/prompts/src/workspace-provider.ts:workspacePromptProvider` | 共享工作区已有 `AGENTS.md`；Kiro 不重复注册这一物理文件。共享 `.agents/rules` 和 `.agents/agents` 没有 Kiro 自动发现依据，不能冒充原生交付。 |
| `packages/core/src/place-files.ts:PlaceRef/PlaceFiles` | 只有 global/workspace 两根，没有普通资产的环境根声明或进程环境读取能力。 |
| `packages/resources/plugins/src/contract.ts:PLUGIN_MANIFESTS` | 已识别根 `plugin.json`；Kiro 不需要另加 manifest 路径。 |
| `packages/resources/plugins/src/provider.ts:PluginDiskDeclaration/PluginHeld` | 已有 homeEnv/stateEnv、directories 与未知 enabled；这不是本轮 Kiro 的宿主缺口，且不能借插件端口为普通资产偷渡环境访问。 |
| `packages/resources/plugins/src/host/contents.ts:readPackContents` | 默认 MCP 文件为 `.mcp.json`，会漏 Agent Plugins 的 `mcp.json`；本计划记录为共享内容读取缺口，不在 Kiro 扩展暗改宿主。 |
| `packages/extensions/src/types.ts:AgentAssetKind` | 只有 skill/mcp/memory/hook/agent；本扩展声明 skill/mcp/memory/agent，不增加 command/plugin 枚举。 |

已阅读 `docs/memory.md` 中默认原生位置、只做当前协议、文件化、并行开发和真实目录隔离要求。本次不修改经验日志、共享计划、Host 源码或其他产品。

## 官方事实与协议决策

以 2026-11-03 获取的官方正文为准；网页检索摘要可能仍指向历史创建文档。已通过 Context7 解析 Kiro/Powers，并以官方站正文复核。未确认的内容不作为成功路径前提。

| 项目 | 官方依据与原文 | 决策 |
| --- | --- | --- |
| Skills | https://kiro.dev/docs/skills/ 列出 `.kiro/skills/` 与 `~/.kiro/skills/`；“workspace skills take priority over global skills”。 | 两处原生位置均注册，交付 `<name>/SKILL.md` 目录；不增加 `.agents/skills` 的 Kiro 入口。 |
| 独立 MCP | https://kiro.dev/docs/mcp/configuration/ 列出 `.kiro/settings/mcp.json` 与 `~/.kiro/settings/mcp.json`。顶层 `mcpServers`；local 的 command/args/env 与 remote 的 url/headers 都支持 disabled。 | 每个 scope 一处安装目标；仅管理顶层 mcpServers。 |
| MCP 开关 | 同页原文：“Whether the server is disabled (default: false)”。 | `enabled = disabled !== true`，setEnabled 写反义 disabled；只表示该物理文件的声明状态。 |
| MCP 传输 | 同页 local 以 command、remote 以 url 区分；没有可验证的 HTTP/SSE type 字段。 | 首版交付 stdio 与 http；明确拒绝 Hub 的 sse 投递，不猜写 `type: sse`，不静默改成 http。 |
| Steering | https://kiro.dev/docs/steering/ 列出 `.kiro/steering/`、`~/.kiro/steering/`；auto 模式要求 name 与 description。 | rule form 写原生 auto Steering。 |
| Instructions | 同页允许全局 steering 内、项目根与子目录的 AGENTS.md；“AGENTS.md files do not support inclusion modes and are always included”。 | 全局写 `~/.kiro/steering/AGENTS.md` 标记段；项目根复用共享 AGENTS.md。 |
| Agents | https://kiro.dev/docs/custom-agents/creating/ 与 https://kiro.dev/docs/custom-agents/configuration-reference/ 列出 `.kiro/agents/`、`~/.kiro/agents/`，支持 Markdown frontmatter + body；filename becomes the agent name。 | 两 scope 交付 `.md`，仅生成 name、description 和正文；不猜工具权限、模型或 includePowers 默认值。 |
| Powers 根 | https://kiro.dev/docs/configuration/ 的 Powers 行全局列为 `~/.kiro/powers/`、项目列为 `—`，作用域表 Project 为 —，Agent 通过 includePowers。 | 用户 Powers 根已证实；项目 `.kiro/powers/<name>/` 不作为发现位置或安装目标。 |
| 当前 Power 包 | https://kiro.dev/docs/powers/create/：“Every power needs a plugin.json manifest”；必填 $schema/name/version/description/author/keywords。 | 当前协议为根 plugin.json + 可选 skills/、mcp.json。schema 为 `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`。 |
| Legacy Power | 创建页：“Powers built with the legacy POWER.md format continue to work”；安装页同时接受 plugin.json 或 POWER.md。https://kiro.dev/powers/submit/ 要求公开仓库 “must contain plugin.json”。 | POWER.md 仍是 Kiro 支持的 legacy 格式，不称无效；Hub 首版仅选当前创建/提交格式，不实现其兼容。 |
| Power MCP | https://kiro.dev/docs/powers/installation/：“managed internally by Kiro”且“not added to your user-level ~/.kiro/settings/mcp.json”。旧 POWER.md 格式才写该文件的 Powers 段。 | 不扫描、编辑或伪造新格式 Power 的内部 MCP。独立 MCP provider 保留其他顶层字段，包括已有 powers 段。 |
| Power 安装方式 | 同页有官方注册表 Add to Kiro、IDE 面板、GitHub URL、本地文件夹，以及 `kiro-cli powers install <name\|path>`/uninstall。 | 保留原生文件安装目标；阶段 5 补磁盘协议并接安装器，CLI 仅可作为独立对照，不作为写入回退。 |
| 环境根 | https://kiro.dev/docs/configuration/：“Override the global directory with KIRO_HOME”；必须绝对路径；V3 包括配置、登录、会话和 Agent 状态。相对路径、文件系统根、home 或其祖先会被忽略。 | 首版明确只管理默认 `~/.kiro`。IDE 对 KIRO_HOME 的一致行为未确认，普通资产端口也不能读取该变量，不能自动发现或承诺自定义根可用。 |

### Powers 原生能力、安装方案与证据边界

Powers 是 Kiro 的原生包系统：当前包结构为根 `plugin.json`、可选 `skills/`、`mcp.json`，manifest 的 keywords 驱动按需激活；Power 内 MCP 随 Power 激活/停用，由 Kiro 内部管理。官方注册表、IDE、本地文件夹、GitHub 和 CLI 均有安装入口。安装、发现、持久启停、运行时按需激活是四件事，不能用其中一项推定其余项。

| 安装方案 | 官方已证实内容 | Hub 可采用的路径与限制 |
| --- | --- | --- |
| 本地 Agent Plugins 目录导入 | IDE 的 Import power from a folder 接受包根的 plugin.json；`kiro-cli powers install <name\|path>` 接受本地路径。 | 现有 Hub 插件库已能保留这类包；可把原样包作为 Kiro 本地导入的输入。仅准备/交付可导入包不算完成客户端安装，也不新增虚假的“已安装”记录。 |
| 官方注册表或 GitHub 导入 | Add to Kiro、IDE GitHub 导入已公开；用户根为 ~/.kiro/powers。 | 证明原生分发能力存在，但注册表元数据不等于客户端安装记录。当前不写远程账户或市场状态；文件安装以本地已收录包为输入。 |
| 客户端 CLI 安装 | 官方公开 install/uninstall；IDE 与 CLI 共享已安装 Powers 的能力已有文档。 | 可作为经授权后的独立对照工具，不作为 Hub 的写入实现或回退。不得为图省事在 tools.run 中隐藏安装。 |
| 原生文件安装 | 已知 ~/.kiro/powers 根与 Agent Plugins 包格式；PluginDisk 已支持声明目录模板和多文件事务。 | 保留为阶段 5 的目标。用官方文档/官方随附资源或实现取得实际目录、发现记录、卸载约束后，按声明驱动的文件适配器实现；不要求先在本机跑客户端才能写适配器与测试。 |
| 仅复制到根下任意子目录 | 官方未确认自动发现规则。 | 当前不能作为安装方案；不把 ~/.kiro/powers/<name>、installed/<name> 或任何自建 registry 当事实。 |

#### 阶段 5 需要补齐的具体证据

| 协议项 | 已知内容 | 仍需核实的内容与可接受证据 |
| --- | --- | --- |
| 根与 scope | ~/.kiro/powers；无 project；Agent 通过 includePowers 使用。 | 安装叶子目录、是否复制或引用源路径；以官方路径说明、官方随附 schema/实现为先。第三方记录只能作为搜索线索。 |
| 注册与身份 | manifest name/version；包由本地目录或 registry 导入。 | 客户端实际记录文件/键、唯一 id、来源字段、同名覆盖/升级规则；不能捏造 marketplace 后缀。 |
| 管理状态 | 按关键词自动激活、内部 MCP 跟随 Power。 | 是否有独立的持久启停，以及记录与 activation 的区别。未证实持久开关不阻断安装器：使用 enabled 未知、switchable:false。 |
| 卸载 | 官方有 uninstall。 | 只删记录还是连 payload、引用共享源时的处理、客户端能否自动恢复声明；“文件复制成功”不足以证明卸载完备。 |
| KIRO_HOME | 官方明确 CLI V3 覆盖全局状态且有无效值回退规则。 | IDE 适用面，以及 Host 根解析是否与客户端一致；无效值不能解析到客户端忽略的根。 |
| 安装一致性 | 新格式 MCP 不写用户 mcp.json。 | 安装包与发现记录是否需要其他原子更新；只按已证实字段写入，不创造 Power MCP 内部记录。 |

证据获取顺序：继续检索官方统一文档、官方 Powers 仓库和 Agent Plugins schema；必要时只读检索官方发布包随附的配置/schema/实现，下载内容独立暂存且不运行其脚本；最后才是有授权、有环境时的隔离对照。客户端缺席不妨碍前两种取证。无法取得具体写入 schema 时保留明确缺口，不用 mock 里的自造 JSON 冒充协议。

### 通用宿主依赖与已具备能力

| 能力 | 当前状态与动作 |
| --- | --- |
| 根 plugin.json 收录 | PLUGIN_MANIFESTS 已支持；无需 Kiro 专属 manifest 白名单。 |
| 目录安装与事务 | PluginDiskDeclaration 已有 directories/homeEnv/stateEnv，PluginDisk 已有 snapshotDirectory、commit(copy/remove)、并发快照和回滚。拿到真实目录模板后直接声明，不能为了 Kiro 在 Host 加硬编码。 |
| 未知启停 | PluginHeld.enabled 已可省略、readOnly 已存在；阶段 5 可先提供未知状态、不暴露未证实开关，不需要为了布尔值猜客户端状态。 |
| Agent Plugins MCP 内容读取 | readPackContents 默认只读 .mcp.json，缺少 mcp.json。由 Host 维护者补通用标准路径或组件声明，并测试收录、预览、详情一致；Kiro 扩展不改包清单来迎合详情。 |
| 普通资产环境根 | PlaceFiles/SkillPlace 无 env root；作为跨客户端通用需求交给 Host 维护者。阶段 1–4 只支持默认根，不借 PluginDisk 绕过。 |
| 环境根接受策略 | installer-files.ts:environmentRoot 目前只检查绝对路径；Kiro 会忽略 filesystem root、home 及祖先，并对相对路径回退。直接写 homeEnv:KIRO_HOME 不代表语义一致。阶段 5 先验证默认根；自定义根需要通用“可声明的根接受/无效值策略”或等价的宿主安全校验，测试相对路径、根、home/祖先和正常独立绝对根。该能力不能写入 Kiro 字面量。 |
| 手动导入交付结果 | PluginInstaller.install/remove 都必需，缺少只交付可导入包的 handoff 状态；不注册假的安装器。若用户以后需要一键导入指引/交付路径，由 Host 统一设计跨客户端 handoff，不拿成功安装报告代替。现有插件库保留原包不依赖此新能力。 |
| payload 转换 | 本计划只装原生 Agent Plugins 包，不需要 copy 后改 manifest；如未来需要通用 overlay，应纳入 sourceSnapshot/hash，不能在 copy 后改 cache。首版不加入这种无需求能力。 |

上述是共享依赖说明，不授权 Kiro 作者顺手改 Host。开发者给 Host 维护者提交准确契约/fixture 需求；原生安装目录和记录证据齐全、现有事务能表达时直接实现，不能以“尚未在真机验证”拒绝推进。确有协议缺口时记录到阶段 5，不影响阶段 1–4 的正式交付。

### 当前协议不等于版本探测

验收文档基于当前统一文档与 CLI V3。首版不维护 CLI V1/V2、旧 agent schema、`.kiro.hook` 等历史格式。普通 provider 没有查询二进制版本的接口，不能声称日常 UI 已能检测旧客户端。用户使用旧客户端时，README 说明不保证这些当前文件协议被消费；真实客户端缺席不阻断开发、单测或构建。

### 六个注入点的覆盖

| 注入点 | 首版覆盖 |
| --- | --- |
| skills | Kiro 全局/项目原生技能目录。 |
| mcp | 两处独立 mcp.json 的顶层声明、启停、移除和定位。 |
| prompts | 全局/项目 Steering 与 agent，及全局 AGENTS.md 标记段；项目 AGENTS.md 使用宿主共享入口。 |
| plugins | 阶段 1–4 暂不注册；阶段 5 在磁盘协议证据齐全后接入原生文件安装器，不以真机验收为编码前置。 |
| targets | Kiro 名称、原图、真实交付路径及 skill/mcp/memory/agent 能力。 |
| locales | en、zh-CN；只增加实际使用的菜单和错误键。 |

## 固定交付位置

内部 target/provider id 为 `hub.target.kiro`；各服务内部 place id 可使用 `kiro`、`kiro-global`，不同服务有独立注册表。scope `global` 始终相对用户 home，`workspace` 始终相对当前 Hub 所选工作区，不以 dev server cwd 或任意祖先仓库代替。

| 内容 | workspace | global | 表达 |
| --- | --- | --- | --- |
| Skills | `.kiro/skills/<name>/SKILL.md` | `~/.kiro/skills/<name>/SKILL.md` | 两个非 shared SkillPlace。 |
| MCP | `.kiro/settings/mcp.json` | `~/.kiro/settings/mcp.json` | 两个固定 McpPlace，installable 默认 true，switchable true。 |
| Rule | `.kiro/steering/context-hub-<slug>.md` | `~/.kiro/steering/context-hub-<slug>.md` | auto Steering。 |
| Agent | `.kiro/agents/context-hub-<slug>.md` | `~/.kiro/agents/context-hub-<slug>.md` | Markdown agent，name 与文件名 stem 一致。 |
| Instructions | 项目根 `AGENTS.md`，共享入口 | `~/.kiro/steering/AGENTS.md` | 全局只增删当前 prompt 的持有标记段。 |

workspace prompt place 只提供 rule、agent；global 提供 rule、agent、instructions。instructions 固定 option id `agents`。不添加 Commands、Hooks、Workflows 菜单，不把 manual Steering 冒充独立 command 格式。

Rule frontmatter 固定 `inclusion: auto`、`name: context-hub-<slug>`、`description`。Agent frontmatter 固定 `name: context-hub-<slug>`、`description`。description 使用 `prompt.description.trim()`，为空时复用 `tools.describeBody`，最后用 prompt.name；用合法 YAML 字符串形式保留换行、引号和中文。正文保留用户内容语义，只统一 BOM/换行和末尾换行。

## 影响文件、调用关系与协作范围

新增 `D:/work-space/context-hub-extensions/plugins/kiro/`：

- 元数据与工具链：`package.json`、`plugin.yaml`、`build.mjs`、`tsconfig.json`、`vitest.config.ts`。
- 运行时：`src/index.tsx`、`src/contracts.ts`、`src/locations.ts`、`src/provider.ts`、`src/prompts.ts`、`src/messages.ts`。
- 资产与说明：`assets/icon.svg`、`README.md`。
- 测试：`__test__/registration.test.ts`、`provider.test.ts`、`prompts.test.ts`、`fixtures.ts`、`react-jsx.ts`；fixture 文本可直接放对应测试，不为样例另加无用目录。

阶段 1–4 不新增 installer.ts、plugin-state.ts 或完整插件契约副本；阶段 5 只在证据足以定义真实记录后新增最小 `src/installer.ts` 和相应测试，解析逻辑确实需要复用时才抽 helper。`index.tsx:apply` 调用本地 provider 工厂，并从内核注入的 tools 取得 JSONC/标记工具；主入口只导出 apply，package main/exports 均指向 lib/index.js。目标浏览器代码不 import node:*、Host 源码或其他插件目录。

`plugin.yaml`：`id: kiro`，`category: agent`，`icon: assets/icon.svg`，阶段 1–4 的 `inject: [skills, prompts, mcp, targets, locales]`；阶段 5 实际注册 installer 时再增加 plugins 注入。权限沿用所需的 assets.read/assets.write/filesystem，不加入执行进程权限。package 采用已存在的 build/test/typecheck 脚本和开发依赖版本，开发基线为本地 Host `0.2.0`，engines 用 `^0.2.0`；发布前确认所用 API 的实际支持版本，不编造未来发布版本。

实现只写本产品目录。共享 `pnpm-lock.yaml`、`marketplace.json`、仓库总览与全量检查由集成负责人负责；开发 Agent 报告所需依赖元数据，不因等待锁文件或客户端环境把目录放入 wip。每个包独立依赖缓存与构建现状由实施时只读检查决定，不升级或增加生产依赖。

## 阶段 1：建立独立扩展包

目标：在正式 `plugins/kiro` 建立可构建的包，先完成技能、target、locales 注册。

改动文件：本节列出的元数据与工具链、`src/index.tsx`、`contracts.ts`、`locations.ts`、`messages.ts`、`assets/icon.svg`、初始 README、`__test__/registration.test.ts` 与 `react-jsx.ts`。

执行：

1. 开工前检查目录是否已被其他任务建立；有现成内容先读，不覆盖。按本计划五阶段建立可见任务，进入阶段前标 in_progress，通过验收后立刻 completed。阶段 5 的取证可与资产阶段并行；未知 schema 不阻塞前四阶段，也不把阶段 5 提前标完成。
2. 参考 Cursor 的包形状、esbuild React externals 和 Vitest JSX alias，只保留 Kiro 所需最小契约。此阶段暂不 import 后续尚未创建的 mcp/prompts 工厂。
3. 注册两处原生技能，不重复注册共享 `.agents/skills`；注册 target 与双语文案。target 仅列最终会实现的四类能力，最终发布前再核对 provider 已齐。
4. 从本计划记录的 `docs/research/agent-icons/kiro.svg` 原样复制到扩展 assets，不改颜色、形状或 SVG 字节；图标组件使用 `/hub/extensions/kiro/assets/icon.svg`，alt 为空，接收 className/aria-hidden。
5. registration 测试捕获 target、skill places 和 locales，断言无 plugins 注入、无 Powers place，名称和路径无其他产品残留。

验收（工作目录 `D:/work-space/context-hub-extensions`）：

```sh
pnpm --filter kiro typecheck
pnpm --filter kiro test
pnpm --filter kiro build
```

这些脚本来自已读取的 Cursor/skills.sh 模板，Kiro package 使用同样的 `tsc --noEmit`、`vitest run`、`node build.mjs`。构建产生可导入的 `plugins/kiro/lib/index.js`，不要求安装 Kiro，也不提交生成文件。

## 阶段 2：实现独立 MCP 交付

目标：两处 mcp.json 的声明、开关、卸载、定位都通过同一物理文件，保留用户无关内容。

改动文件：`src/provider.ts`、所需 contracts/messages、`src/index.tsx` 的注册、`__test__/provider.test.ts`、`fixtures.ts`、registration 测试。

执行：

1. 工厂使用注入的 mcp tools；place id 映射固定 scope/file，不动态换文件，不访问 home 或环境变量。不存在的文件读为空，安装才创建。
2. 读取顶层 mcpServers；对象/条目/disabled 的类型异常不能被当成空配置覆盖。无效 JSONC、空白已存在文本、同名未知结构、command/url 同时存在等冲突，拒绝写入并保持原文。
3. 新建 stdio 写 command，按声明写 args/env；新建 http 写 url/headers；新建默认 disabled:false。不写未经文档验证的 type/transport。sse 投递明确报本扩展未提供该写法，文件不变。
4. 更新同种传输只改该声明拥有的字段，保留 disabled、autoApprove、disabledTools、oauth/oauthScopes、其他 server、注释和未知字段；remote 的原有 env 不因为通用声明不含它而删除。遇到已有不同传输类型的同名条目拒绝自动转换，先由用户明确移除旧条目。
5. setEnabled 仅编辑 mcpServers[name].disabled。卸载仅删除该 server 的顶层声明，保留其他 server、顶层 powers 和未知根字段。未存在条目的开关不创建半条配置。
6. locate 使用相同 scope/file 与顶层路径；read 返回 disabled 的反义值，不声称工具已连接或 Kiro 最终加载。环境占位符仅作为字符串保留，不读取、批准或展开用户环境变量。
7. 测试使用实际 Host JSONC 工具和临时文件端口，显式传 home、userHome、folder 三根；`KIRO_TEST_HUB_SOURCE` 仅是测试导入路径，不是产品配置根。

验收：provider 测试覆盖 stdio/http roundtrip、两个 scope 同名 server、启停只影响所选文件、注释/未知根字段/已有 powers 段保留、凭证占位符不展开、无效结构与 sse 零写入、切换传输零写入、卸载后不误删其他项、locate 行数指向所选 server。

```sh
pnpm --filter kiro typecheck
KIRO_TEST_HUB_SOURCE=D:/work-space/dsh-context-hub pnpm --filter kiro test
pnpm --filter kiro build
```

本轮环境的真实 Host 源码可用就运行这条集成测试。若其他执行环境缺少它，默认纯注册单测仍运行，Host 集成测试明确标记 skipped 并报告；不得把全套跳过写成通过。该缺失不阻止独立包的开发和构建。

## 阶段 3：实现 Steering 与代理交付

目标：提示词生成 Kiro 原生 Steering/agent 文件与全局持有标记段，避免覆盖手写内容。

改动文件：`src/prompts.ts`、所需 contracts/messages、index 注册、`__test__/prompts.test.ts`、fixtures 与 registration 测试。

执行：

1. 按固定交付表注册 workspace/global 两个 prompt place，不重复提供项目 AGENTS.md form。未知 place/form/option 均在任何写入前拒绝。
2. 使用 tools.slugOf 生成文件名，再校验非空、无目录分隔/点段/Windows 保留设备名/控制字符。只生成本计划固定的 context-hub 前缀路径，不把 Prompt.name 当相对路径。
3. 独立 rule/agent 文件在 frontmatter 后的固定位置写持有标记 `<!-- context-hub:<slug> -->`。只覆盖或删除本 prompt 的标记文件；相同路径的手写文件或其他标记不得覆盖。read/held 与 install/remove 使用同一 target 计算。
4. 全局 `.kiro/steering/AGENTS.md` 复用 withSection/withoutSection；写前检查当前 prompt 的开闭标记是否缺半、重复或顺序错乱，异常时原文不变。移除只删当前段，保留前后手写文字；只有移除后全文为空才删文件。
5. Rule 使用 auto inclusion 和 description；Agent 只写 name/description/正文，不添加未经需求要求的 tools/model/permissions/includePowers。不保留历史 frontmatter parser，不自动迁移其他文件。
6. 补齐 apply 对五个资产服务的调用和测试；本阶段的插件模块不在 inject/契约/运行时中出现，Powers 接入由阶段 5 单独验收。

验收：覆盖两个 scope 的 rule/agent 安装、再次安装幂等、held/remove 对称；中文、引号、换行和 BOM；不覆盖未标记文件；全局段保留相邻手写内容；重复/半截标记零写入；危险名字、未知 place/form/option 零写入；卸载一次成功再卸载返回 false；项目共享 AGENTS.md 不被 provider 修改。

```sh
pnpm --filter kiro typecheck
KIRO_TEST_HUB_SOURCE=D:/work-space/dsh-context-hub pnpm --filter kiro test
pnpm --filter kiro build
```

## 阶段 4：完成资产文档与独立验收

目标：给集成负责人交付可直接链接的正式包和可核查的边界，不把文件测试结果写成 Kiro 已加载。

改动文件：`plugins/kiro/README.md` 及本产品前述文件的必要修正；不编辑共享索引、锁文件或他人目录。

执行：

1. README 逐项列出管理的物理位置、当前协议、KIRO_HOME 默认根限制、MCP 文件级开关语义、SSE 未覆盖、项目 AGENTS.md 共享入口，以及“资产交付已实现，Powers 原生文件接入另按协议证据推进”的状态。POWER.md 仍受客户端支持，但 Hub 不实现其兼容。阶段 5 完成后同步改写这一能力声明，不能长期保留与实现相反的“插件不做”。
2. 写明 Kiro 最终加载、权限批准、连接和云同步状态不由这些文件直接证明；全局/项目/agent 的优先级仍由 Kiro 处理。UI 成功反馈只表示文件写入成功。
3. 附官方来源、图标来源与版权限制。说明 root plugin.json 可由现有插件库收录，但详情中 mcp.json 的共享读取缺口不在本包修复。
4. 运行本产品最终检查；通过后不为增加次数重复测试。测试失败由本产品作者修复；缺依赖/Host/客户端环境的具体未验内容单独报告，不阻断已完成的开发工作。
5. 检查本产品 diff 和生成物，不包含密钥、用户路径、node_modules、lib、市场构建噪音。通知集成负责人包名/目录、五项注入、检查结果；由其统一处理 pnpm 锁、marketplace 构建和全仓检查。

验收命令（扩展仓库工作目录）：

```sh
pnpm --filter kiro typecheck
KIRO_TEST_HUB_SOURCE=D:/work-space/dsh-context-hub pnpm --filter kiro test
pnpm --filter kiro build
pnpm exec eslint plugins/kiro
```

最后一条来自仓库已配置的 `pnpm lint` 所调用的 eslint，仅把范围收窄为本产品，避免每个并行作者反复跑全仓。无新增生产依赖；若 pnpm 依赖链接尚不可用，报告 package 元数据和缓存实况，由集成负责人统一链接，不私自修改共享锁。

资产阶段可观察结果：Kiro 注册为单一 target；Skills 两个原生位置；MCP 每 scope 一处；prompt 菜单只有本计划 forms；该交付批次暂不显示 Powers 安装入口；tests 的写入全部位于测试临时根；构建产物可加载；README 边界与测试一致。Powers 完整目标继续按阶段 5 推进，不把资产阶段验收当作 Powers 已完成或已取消。

真实客户端和浏览器验收由后续独立验收者或用户执行，缺席不使本阶段回退为“无法开发”。若能隔离并获准进行客户端写入，先记录 `kiro-cli --version` 与 `kiro-cli powers --help`，确认所用客户端，使用无副作用的测试技能/声明观察实际加载；清理只针对自己创建的夹具。涉及浏览器操作按仓库规则使用 ego-browser skill，不点会写真实用户配置的菜单。

## 阶段 5：接入 Powers 原生文件安装

目标：把 Powers 保留为本产品原生能力，以真实磁盘协议实现用户级安装、发现和卸载；持久启停有证据才提供，没有证据就明确未知。取证可与阶段 1–4 并行，编码不以真机运行通过为前提。

改动文件：取证期间更新本计划的协议证据表；协议足够后新增 `plugins/kiro/src/installer.ts`、`__test__/installer.test.ts`，扩充 contracts、fixtures、index、plugin.yaml、messages、README 和 registration 测试。Host 通用依赖只提交需求和 fixture 给对应维护者，不由 Kiro 作者混入改动。

执行：

1. 先补齐上述“阶段 5 需要补齐的具体证据”表，给每个实际目录、记录键、身份与卸载行为附官方来源或官方随附实现位置。继续只读取证，不要求先装好 Kiro；第三方 `installed.json` 示例不能单独成为写入依据。只确认了根目录时先完成包收录/可导入资产交付，仍不将其登记为客户端已安装。
2. 从协议选择最小文件方案：若客户端复制 payload，则用其真实目录模板和登记记录；若客户端原生记录一个外部源路径，则保留 Host 管理的 payload，并只写官方已证实的源声明与身份。两种情况都要确认卸载时的引用处理。方案不是按实现方便程度选，不把两条猜测路径都写成兼容分支。
3. Installer 仅提供 `scope:global`、`scopeWord:user`，不增加项目安装。默认 config 根 `.kiro`、Powers 状态根 `powers` 来自已证实路径；具体 directories/config/stateFiles 只能填写经证实的模板/文件。自定义 KIRO_HOME 需要先与通用根接受策略对齐；在未对齐前明确只支持默认根，不直接传 homeEnv 然后声称等同 Kiro。
4. 只接受当前根 plugin.json 的 Agent Plugins 包；校验 name 与 Hub 包名一致，使用 manifest version/description，保留原包文件。POWER.md-only、当前协议以外的 manifest，以及冲突身份拒绝且零写入，不生成双清单、不 copy 后改包。客户端 id/marketplace 根据原生记录返回；没有原生 marketplace 就返回 null，不捏造 `name@context-hub`。
5. 优先复用 PluginDisk 的 roots/run/read/list/path/snapshotDirectory/commit，多文件更改绑定 before 与 sourceSnapshot。安装只替换本 Hub 持有且快照匹配的目标，手工/未知/已修改目录只读且不覆盖。卸载只撤自己可证明的原生声明和 payload；共享引用、恢复来源或所有权无法排除时保留 payload 并如实报告，不能为“卸载成功”删掉用户数据。
6. held 从真实客户端记录/发现位置读取，必要时用 readOnly/sourceAvailable 表达未受管或来源不可验证；未知 enabled 省略。只有官方持久开关已确认才实现 switches/setEnabled 和 switchable:true；关键词 activation 不作为 persisted enabled。Powers MCP 仍随包交给 Kiro，不向独立 mcp.json 伪造服务。
7. 实际 adapter 可运行后才在 index 和 plugin.yaml 加 plugins 注入及 register；不以返回成功但只给出一个目录的占位 installer 提前展示安装入口。若磁盘 schema 仍不足，阶段 1–4 的包继续正式可交付，README 明确“Powers 包可准备/导入，Hub 原生文件安装尚未实现”，保留该阶段未完成与缺证字段，而不是把 Powers 从目标中删除。
8. 对 Host 的 mcp.json 详情读取、普通 env root 或根接受策略需求分别提供协议无关 fixture。缺少确实必要的通用 API 时注明具体缺口；已有 directories、快照事务、enabled 未知等能力直接用，不重复要求宿主再做一次。发布版本不是实现和测试的前置，README 标明本地开发 API 基线。

文件测试验收：按有来源的真实 schema 准备 fixture，覆盖 install → held 可见 → remove 后无自有发现记录；重复安装幂等；同名手工目录与修改后目录零覆盖；身份/版本冲突、无效清单、记录解析失败时零写入；并发变更与事务失败回滚；未知 enabled 不显示假开关；已确认开关只改其真实持久字段；源引用消失和共享 payload 的保护；默认根与自定义根接受策略分别断言。所有 home/userHome/workspace/library 都临时化，`tools.run` 在测试中直接抛错以证明没有 CLI 安装回退。

```sh
pnpm --filter kiro typecheck
KIRO_TEST_HUB_SOURCE=D:/work-space/dsh-context-hub pnpm --filter kiro test
pnpm --filter kiro build
pnpm exec eslint plugins/kiro
```

完成判据：磁盘方案每个关键字段都有证据，安装/发现/卸载文件测试通过，注入与 README 和实际覆盖一致；实测缺席则写“文件协议与测试已实现，客户端组件加载未验证”，不能据此拒绝交付 adapter。若关键写入 schema 经官方取证仍未取得，这个阶段不能被标完成，但资产阶段不受影响；交付缺口表和所缺证据，不编造协议、mock 或数据库写法来制造完成。

## 图标来源与版权记录

| 字段 | 记录 |
| --- | --- |
| 官方入口 | `https://kiro.dev/` 的 `<link rel="icon">` 指向下列 SVG。 |
| 原始来源 URL | `https://kiro.dev/icon.svg?fe599162bb293ea0` |
| 本地文件 | `D:/work-space/dsh-context-hub/docs/research/agent-icons/kiro.svg` |
| 获取日期 | 2026-11-03 |
| 格式 | SVG；响应 Content-Type 为 image/svg+xml。 |
| 尺寸 | 1200 × 1200，viewBox 0 0 1200 1200。 |
| 文件大小 | 1527 bytes。 |
| SHA-256 | `774cbc1c7ecec8c935a6091595583d7a92fc8289d6f1db3f071c0f50c61c369f` |
| 原始性 | 按响应原始字节保存；独占创建目标文件，不覆盖已有文件；无改色、重绘、压缩或格式转换。 |
| 静态检查 | SVG 根有效，无 script、foreignObject 或 on* 事件属性；没有运行下载内容。 |
| 版权限制 | 图标未附独立 license，未从官方找到允许该图标任意再分发的单独授权。Kiro 标识的版权/商标属于相应权利人；不能因 Powers 示例仓库的代码许可证推定网站图标同样可重许可。保留原图仅用于产品识别，不表示官方背书；公开分发前确认相应商标和素材使用依据。官网链接的条款入口为 https://aws.amazon.com/terms/ 与 https://aws.amazon.com/legal/。 |

本次只下载这个已从官网页面定位的图标，不用第三方图标库、搜索缩略图或生成图替代。

## 待验证事项与非阻断处理

| 未确认项 | 验证方式 | 当前边界 |
| --- | --- | --- |
| Powers 根内的当前安装目录、发现/启停/卸载记录 | 阶段 5 先检索官方文档、官方随附 schema/实现；CLI 有环境时先 `kiro-cli --version`、`kiro-cli powers --help`，授权后才在独占隔离根做安装/卸载对照；不假设 list/status/--json 参数。 | 原生文件安装保留为目标；缺具体 schema 时先交付资产，缺真机不阻断基于可靠协议的适配器开发。 |
| IDE 是否遵守 KIRO_HOME | 由用户/验收者确认 IDE 启动环境，在空配置根操作无副作用夹具，比较写入路径与真实 home 是否未变。 | 默认根以外明确未覆盖。 |
| 明确区分 HTTP/SSE 的原生字段 | 获取更新的官方 MCP 字段说明，或在获准隔离客户端中对比两类连接保存的配置和诊断结果。 | 不猜 type；SSE 投递拒绝。 |
| Kiro 是否加载 Hub 写入的 skill/auto Steering/Markdown agent | 缺二进制时记录“未验证”；有环境后用唯一测试标记，观察技能或 agent 列表及模型读取结果，测试后仅清理自己的夹具。 | 文件测试与构建可独立验收，不宣称客户端已加载。 |
| Agent Plugins mcp.json 的 Hub 详情读取 | 共享维护者为内容读取增加通用协议/组件文件声明或标准路径识别，再以 Agent Plugins fixture 验证详情。 | 不在 Kiro 扩展写宿主特判；不阻塞独立 MCP provider。 |

目录状态与变量值的检查优先用现有只读工具；本计划不执行任何 powers install/uninstall，不借这些待验证步骤修改用户机器。后续安装实验必须另有用户授权，并显式隔离 home、workspace 和配置根。

## 阶段 5 实施取证补充（2026-11-03）

- Context7 再次查询 Kiro CLI 与官方 `kirodotdev/powers`，以及官方 Powers 安装/创建资料；未找到当前 Agent Plugins 格式完整的安装登记字段、发现和卸载协议。官方 Powers 仓库的 Databricks `POWER.md` 示例提及 `~/.kiro/powers/installed/databricks`，但它是该 Power 自己的操作说明，不能据此证明当前格式的注册与卸载流程。
- [Kiro issue #11161](https://github.com/kirodotdev/Kiro/issues/11161) 是用户报告而非官方协议，提及安装目录和用户添加 registry；[JFrog 文档](https://docs.jfrog.com/ai-ml/docs/troubleshoot-plugins) 又称本地文件夹导入引用原路径。第三方描述涉及不同安装来源且相互不足以证明当前文件事务，不能以此构造成功路径。
- 随后只读检查官方 IDE 1.4.86 Linux 安装包（[版本元数据](https://prod.download.desktop.kiro.dev/stable/metadata-linux-x64-stable.json)，归档 2026-11-02 发布），未启动程序。随附 `Kiro/resources/app/extensions/kiro.kiro-agent/dist/extension.js` 内 `getKiroPowersHome/getInstalledDir/getInstalledJsonPath/getUserAddedRegistryPath` 指向默认 `~/.kiro/powers`、`installed/<name>`、`installed.json`、`registries/user-added.json`；`addPowerToUserAddedRegistry` 写 `powers` 条目（`name`、`description`、`source:{type:"local",path:<绝对路径>}`），`installPowerFromRepository` 对 `plugin.json` 包递归复制常规文件到安装目录并跳过 `.git`，再通过 `addInstalledPower` 写 `{name,registryId:"user-added"}`。`InstalledPowersManager` 使用 `{version:"1.0.0",installedPowers:[],dismissedAutoInstalls:[]}`；`uninstallPowerV2` 删除 installed payload 和安装记录，但不删除用户来源目录，用户添加 registry 另由 `removePowerFromUserAddedRegistry` 管理。发现器 `scanConfigBase` 以 installedPowers 名称查安装目录并解析 `plugin.json`；持久开关仍未发现。`KIRO_POWERS_HOME` 为 IDE 代码中另一个独立根覆盖变量，首版同样只支持默认根。
- [Agent Plugins 1.0 schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json) 与上面的 IDE 校验一起约束插件名和字段；IDE 的 user-added registry 名称限小写字母、数字和连字符。源包有 `.git` 时无法与原生递归复制及快照所有权保持一致，应在写入前拒绝。默认根的安装/发现/卸载协议具备实现依据；`KIRO_HOME` / `KIRO_POWERS_HOME`、客户端最终加载仍未验证。
- 独立持久开关未确认，适配器按未知状态处理。文件适配器实现默认根安装/发现/卸载，使用 Hub 快照与多文件事务，拒绝改动未知或已修改文件；存在其他 registry 或其他来源引用时移除登记并保留 payload。源码和隔离文件测试已实现；未经授权未运行真实客户端或执行安装实验，Kiro 实际加载尚未验证。`KIRO_HOME` 和 `KIRO_POWERS_HOME` 自定义根未覆盖。

## 自审结果

- 已对照真实源码，不沿用旧研究的 homeEnv/directories/未知 enabled 缺口，也不把根 plugin.json 当未识别清单。
- 已把“Powers 用户根已证实”与“安装和启停记录未知”分开，删除项目 `.kiro/powers` 自动发现假设；原生文件安装保留为阶段 5，资产阶段可先交付。
- 已区分 POWER.md 仍有效与当前新包格式推荐，未把文件名或历史摘要当废弃证据；无旧版兼容成功路径。
- 五阶段均有目标、改动文件、实际工具链命令和结果判据；前三阶段建立包与 provider，阶段 4 验收资产批次，阶段 5 独立推进 Powers 取证与实现；取证可并行，没有前向依赖。
- 已覆盖调用入口、contracts、messages、icon、配置、exports、fixture 和 provider 测试；Powers 阶段明确需要 installer/registration/事务与所有权测试，只有协议证据足够才生成相应状态解析，不写自造 schema。
- 已将项目 AGENTS.md 共享入口、未知环境根、SSE、Hooks/Workflows 和 mcp.json 详情缺口写成明确范围；已识别 Host 环境根与 Kiro 无效值策略的差异，未把 homeEnv 的存在写成语义已等价。
- 测试要求三个文件根均临时化；没有把真实 Kiro、已发布 Host 或隔离客户端作为开发前置，符合并行独立交付要求。缺少真机只影响实测声明，缺少真实 schema 才限制相应原生写入。
- 官方图标已按原始字节取样并记录格式、尺寸、大小、SHA-256 和授权不确定性；只新增本计划与本产品图标。

审批范围：阶段 1–4 的 Kiro 默认路径资产扩展，以及阶段 5 的 Powers 官方协议取证、基于可靠 schema 的原生文件适配器和文件测试。若取证后需要新增通用宿主契约，Kiro 作者只交需求/fixture，由宿主维护者独立安排；不暗中扩大改动面。审批不包含客户端安装实验、发布、提交或推送。
