# 接入 ZCode Agent 扩展

- 状态：已获按计划执行授权；开发产物暂存扩展仓库 `wip/zcode`，阶段二至五本地实现及阶段六隔离宿主回归通过，正式市场版本/目录按最新调度规则确认；真实客户端和 GUI 未验证。
- 核对日期：2026-11-03。
- 实施仓库：`D:/work-space/context-hub-extensions`，目标目录 `plugins/zcode/`。
- Hub 契约仓库：`D:/work-space/dsh-context-hub`。下面列出的通用契约前置须由总计划单独纳入审批，不能在 ZCode 扩展里绕过。
- 客户端范围：同一台 Host 上的 ZCode Desktop 与 standalone CLI；官网当前下载入口为 3.16.3，官方源码 README 标记 2026-10-30 更新到 3.17.1。此次未安装或运行 ZCode；不能把 main 源码事实写成两个发布版都已通过。
- 阶段数：7。批准后用 TaskCreate 按七个阶段建任务，逐阶段 TaskUpdate；用户确认完成后再归档本计划。

## 1. 背景与真实上下文

ZCode 同时提供 Desktop、Web 和 CLI，Agent runtime 源码在官方仓库 `apps/zcode-cli/`。本次接的是 ZCode Agent 的资产文件，不是把 GLM 模型接进 Hub，也不是 ZCode 的 UI Plugin SDK。

已完整阅读扩展仓库 `plugins/claude.code/`、`plugins/codex/` 的源码、测试、manifest、构建及配置；它们都通过 `apply(ctx)` 注册 skills、prompts、MCP、plugins、targets、locales。插件只在运行时 import React，JSON/TOML 编辑器、提示词生成器、文件操作从服务注入，不依赖 Hub 包在安装目录存在。

当前没有 `plugins/zcode/`。扩展仓库已有 `icons/zcode.svg`，其字节与本次从官网提取的品牌 SVG 相同；按本任务要求，实施输入仍固定使用本轮 `docs/research/agent-icons/zcode.svg`。

Hub 已核对的契约与调用点：

| 文件（相对 Hub 根） | 真实符号与约束 |
| --- | --- |
| `packages/extensions/src/types.ts` | `AgentTargetDescriptor`、`AgentAssetKind`；target 路径是展示信息，不会自动形成安装通道 |
| `packages/resources/skills/src/provider.ts` | `SkillProvider`、`SkillPlace`、`readablePlaces`；provider id 与 target id 一致，未选择 agent 时其两种作用域都不读 |
| `packages/resources/skills/src/extension.ts` | `SHARED_PLACE` 只注册 workspace `.agents/skills`；目前没有 shared global `~/.agents/skills` |
| `packages/resources/mcp/src/provider.ts` | `McpProvider.read/install/uninstall/setEnabled/locate`；`McpPlace.switchable` 只能表达开关能力，不能表达整个位置只读 |
| `packages/resources/prompts/src/provider.ts` | `PromptProvider.held/install/remove`；位置声明哪些 form，界面就提供哪些操作 |
| `packages/resources/prompts/src/workspace-provider.ts` | shared workspace 已负责 `AGENTS.md`、`.agents/commands`、`.agents/agents`，不得重复注册 |
| `packages/resources/plugins/src/provider.ts` | `PluginInstaller`、`PluginPlace`、`PluginDiskDeclaration`、`PluginTools.disk`；install 收 name，remove/setEnabled 收完整 id |
| `packages/resources/plugins/src/host/installer-files.ts` | `declarationOf` 将 home/state 都限制为单路径段；`commit(copy)` 要求 `cache/<market>/<name>/<version>` 四段目的地 |
| `packages/resources/plugins/src/contract.ts`、`src/host/describe.ts` | `PLUGIN_MANIFESTS` 当前仅 Claude、根 plugin.json、Codex；`readManifestFields` 可按标准组件 fallback，但不读取 `.zcode-plugin` 元数据 |
| `packages/resources/plugins/src/rows.ts` | `placeReached` 默认把每个 place 当作可安装位置；`placesShown` 已能通过 `overrides` 为未持包的项目提供开关 |
| `packages/resources/plugins/src/install-actions.tsx`、`detail-dialog.tsx`、`page.tsx` | 单包菜单、详情位置行、批量安装均遍历 places，目前没有“只启停，不安装/卸载”的表达 |

同类历史计划只作格式参考，不能继承其旧结论。`docs/memory.md` 2026-11-02/03 已明确：文件化必须覆盖安装、查询、启停、卸载；列表可见不等于组件可加载；宿主不增加具体 Agent 分支。

## 2. 官方证据与已纠正的起点

使用 Context7 `/zai-org/zcode` 定位官方资料，再直接读取官方文档及源码。下面链接是本计划的事实依据；可执行文件验证另列第 9 节。

| 编号 | 官方来源 | 用途 |
| --- | --- | --- |
| S1 | https://zcode.z.ai/en/docs/plugin | 插件目录、manifest、marketplace、组件格式、用户界面 |
| S2 | https://raw.githubusercontent.com/zai-org/ZCode/main/docs/plugins/workspace-level-plugin-architecture.md | User/Workspace 配置、Host inventory、启用优先级、缺包、项目 dirs 当前已忽略 |
| S3 | https://raw.githubusercontent.com/zai-org/ZCode/main/apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts | `InstalledPluginsState`、`KnownMarketplaceRecord`、读写格式、版本、缓存与卸载 |
| S4 | https://raw.githubusercontent.com/zai-org/ZCode/main/apps/zcode-cli/packages/bootstrap/src/plugins.ts | `installZCodeMarketplacePlugin` 固定 scope=user；`resolvePluginConfigPath`；卸载与 enable/options |
| S5 | https://raw.githubusercontent.com/zai-org/ZCode/main/apps/zcode-cli/packages/adapters/src/plugins/index.ts | manifest 优先级、发现安装缓存、默认开关、Hook、组件运行 |
| S6 | https://raw.githubusercontent.com/zai-org/ZCode/main/packages/desktop/src/main/mcpUserDirectory/index.ts | Desktop 原生与 `.agents` fallback、`enabled`、严格读写、旧字段迁移 |
| S7 | https://raw.githubusercontent.com/zai-org/ZCode/main/apps/zcode-cli/docs/usage/07-mcp.md | CLI `mcp.servers`、显式 type、同名 user 优先 |
| S8 | https://raw.githubusercontent.com/zai-org/ZCode/main/apps/zcode-cli/docs/usage/08-skills.md | 两级 `.zcode/skills`/`.agents/skills`、列表命令 |
| S9 | https://raw.githubusercontent.com/zai-org/ZCode/main/docs/settings-directory-sources.md | Desktop commands/MCP 同 scope fallback；其中旧 `enable` 描述被 S6 修正 |
| S10 | https://raw.githubusercontent.com/zai-org/ZCode/main/apps/zcode-cli/packages/bootstrap/src/subagents.ts | `loadZCodeAgentProfiles` 两级 agents 目录、`loadPluginAgentTemplates` 真实插件 agents 加载 |
| S11 | https://zcode.z.ai/en/docs/subagents | Markdown frontmatter、用户级 Settings、字段大小写、模型继承 |
| S12 | https://raw.githubusercontent.com/zai-org/ZCode/main/apps/zcode-cli/docs/usage/11-memory.md | 用户与项目 AGENTS.md 的指令装配 |
| S13 | https://zcode.z.ai/en/docs/memory | 自动记忆目录、功能开关与 AGENTS.md 的区别 |
| S14 | https://raw.githubusercontent.com/zai-org/ZCode/main/docs/plugin-hooks-compat.md | Claude/Codex manifest 回退、Hook 变量与运行差异 |
| S15 | https://raw.githubusercontent.com/zai-org/ZCode/main/docs/cli-plugins-command-parity.md | CLI scope/命令、JSON 输出、`--keep-data --force`、默认安装 user |
| S16 | https://raw.githubusercontent.com/zai-org/ZCode/main/apps/zcode-cli/docs/usage/03-config.md | 配置路径、环境变量、JSON 不支持注释 |
| S17 | https://raw.githubusercontent.com/zai-org/ZCode/main/apps/zcode-cli/docs/usage/02-cli-reference.md | `--cwd`、doctor、version、无通用 MCP headless 命令 |
| S18 | https://raw.githubusercontent.com/zai-org/ZCode/main/docs/subagent-runtime-refresh.md | Desktop/Host agents 快照、独立 CLI 磁盘来源、项目目录和下一父轮 |
| S19 | https://raw.githubusercontent.com/zai-org/ZCode/main/apps/zcode-cli/docs/design/zcode-guide-builtin-plugin.md | CLI 不读取 `.agents/mcp.json` 与 Desktop fallback 的分工 |

不能继续采用的旧说法：

1. **“桌面 MCP 写 `~/.agents/mcp.json`，CLI 写 `.zcode`”不准确。** 目前两个客户端新增配置都可消费 `.zcode` 主文件；Desktop 仅在同 scope 没有任何 `.zcode` server 时读取 `.agents/mcp.json#mcpServers`。不是逐名称合并，不能双写或偷偷加一个原生 server 使整组 fallback 消失。
2. **“MCP 开关是 enable”已过时。** S6 当前 canonical 字段为 `enabled`；迁移旧 `enable` 时只要任一字段为 false 就保持关闭。重新启用删除这两个旧/新字段，默认开启。S7 CLI 也使用 `enabled`。
3. **“project 插件安装在项目目录”错误。** S4 安装总写 Host user inventory；项目只有 `.zcode/config.json#plugins.enabledPlugins/options`。旧记录中的 workspace scope 没有 workspace identity，不能当作项目归属。
4. **“项目 `.zcode/plugins` 可无条件自动发现”不能照旧提案实现。** S2 最新条款说明项目 `plugins.dirs` 被忽略；只允许用户级显式 dirs。不能把它当作安装捷径。
5. **Claude 旧兼容矩阵写 agents diagnostic-only、第三方 Hook 不执行，已经不是当前源码。** S10 现在会加载已启用插件的 agents；S5 `canRunPluginHooks` 返回 true。不同事件/字段仍不代表完全兼容。
6. **卸载默认保留 data 的旧说明不可靠。** S3/S4 当前 CLI 默认可删除 data；本扩展明确选择保留 data/options，不调用 CLI 卸载，不冒称与默认 CLI 完全相同。

## 3. 目标、身份与目录清单

- Hub marketplace id / `plugin.yaml.id` / 目录名 / package name：`zcode`。
- provider / target / installer id：`hub.target.zcode`；名称 `ZCode`。
- 初始包版本：`0.1.0`。
- `plugin.yaml.inject`：`[skills, prompts, mcp, plugins, targets, locales]`。
- permissions：`[assets.read, assets.write, filesystem]`；文件方案不申请 network。
- `package.json.main`/exports 指向 `lib/index.js`；manifest 不写 version/entry。
- 以现有 `>=0.2.0 <0.7.0` 作为脚手架参考，正式发布必须把最低版本调整为实际包含第 6 节通用能力的 Hub 发布版；版本号尚未产生，不能杜撰。运行时缺 `disk` 或必需能力必须报兼容错误，不回退 CLI。
- `supports` 仅声明 `skill`、`mcp`、`memory`、`agent`。Hook 由插件包携带，v1 无独立 Hook 编辑器，不用 supports 冒充可独立交付。
- **v1 范围写死**：插件安装器只提供 `zcode-user` 安装/卸载/启停；不提供 project 安装或 project 启停 place。project 启停是 H2/H3 落地后的独立增量，不在本计划验收。MCP 只注册两个 native place；`.agents` fallback 只识别、不注册、不写。只支持原生 `.zcode-plugin` 包，N1 是 v1 前置。

`D:/work-space/context-hub-extensions/plugins/zcode/` 完整预计文件清单：

```text
plugin.yaml
package.json
build.mjs
tsconfig.json
vitest.config.ts
README.md
assets/icon.svg
src/index.tsx
src/contracts.ts
src/locations.ts
src/messages.ts
src/provider.ts
src/prompts.ts
src/plugin-state.ts
src/installer.ts
__test__/registration.test.ts
__test__/provider.test.ts
__test__/prompts.test.ts
__test__/installer.test.ts
lib/index.js                         # 构建生成；不手写、不提交源分支
```

fixture 在测试里生成到内存或独占临时目录，不需要额外静态 fixture 文件。脚手架沿用既有 esbuild/TypeScript/Vitest，不新增生产依赖。根 `pnpm-workspace.yaml` 已覆盖 `plugins/*`，不改 workspace、CI、marketplace.yaml。为新 workspace 链接已有 devDependencies 所产生的 `pnpm-lock.yaml` importer 在实施获批后正常生成，不手改锁文件、不升级工具链。

**实施第一步**：把 `D:/work-space/dsh-context-hub/docs/research/agent-icons/zcode.svg` 原样复制为 `D:/work-space/context-hub-extensions/plugins/zcode/assets/icon.svg`。不要重绘、描摹或另找第三方替代图。

## 4. 资产面与作用域

| 资产 | 用户级 | 工作区级 | v1 交付与重复规则 |
| --- | --- | --- | --- |
| Skills 主目录 | `~/.zcode/skills/<name>/SKILL.md` | `.zcode/skills/<name>/SKILL.md` | 注册 `zcode-global`/`zcode` 两个 SkillPlace，dir 都是 `.zcode/skills`，order 20 |
| Skills 共享目录 | `~/.agents/skills/<name>/SKILL.md` | `.agents/skills/<name>/SKILL.md` | 客户端两端均可读取；workspace 已属 Hub shared place，不再注册；global 当前无 shared place，也不冒充 ZCode 专属，列在 README 支持来源，不增加重复安装目标 |
| MCP 主配置 | `~/.zcode/cli/config.json#mcp.servers` | `.zcode/config.json#mcp.servers` | 注册两原生 McpPlace；读/装/卸/开关/locate；Desktop、CLI 共用，不双写 |
| MCP Desktop 共享 fallback | `~/.agents/mcp.json#mcpServers` | `.agents/mcp.json#mcpServers` | 仅 Desktop fallback；解析用于当前共享 fallback 遮蔽预检，v1 不冒充 CLI 资产，不提供可写安装位；见下文 |
| Commands | `~/.zcode/commands/<slug>.md` | `.zcode/commands/<slug>.md` | prompts `commands` form，YAML frontmatter + 正文；`.agents/commands` 是兼容来源，不重复注册共享 workspace |
| Instructions | `~/.zcode/AGENTS.md` | 工作区 `AGENTS.md` | global prompts `instructions` form 用标记段落；workspace 已属 shared prompts，不重复生成菜单 |
| 自动 Memory | `~/.zcode/cli/memories/projects/<project>/memory/MEMORY.md` 及事实文件 | 按项目身份隔离，物理落盘仍在用户数据根 | 记录路径、区别与开关；v1 不生成 project id、不写运行时记忆、不改变 features.memory/memory.use |
| Agents | `~/.zcode/agents/<slug>.md` | `.zcode/agents/<slug>.md` | prompts `agent` form，两作用域均有 runtime 源码证据；Settings 用户级编辑限制不等于 runtime 不支持 project |
| Hooks | `~/.zcode/cli/config.json#hooks` | `.zcode/config.json#hooks` | 配置文件 Hook 受 `hooks.enabled` 门控；v1 只说明，独立 Hook 编辑不做；插件 `hooks/hooks.json` 原样交付。具体事件键以所用发布版为准，不凭旧文档写死 |

Skills 同级 `.zcode` 比 `.agents` 优先。Hub 位置数量显示磁盘持有，不伪称最终 runtime 胜出的同名 Skill 数；验证分别看位置 id/scope/dir 与 `zcode skills list --json`。用户目录与项目目录整体优先级、Git 上溯行为必须交给 ZCode 判断，不在 Hub 重造加载器。

### 4.1 MCP provider

`createZCodeMcp(ctx.mcp.tools)` 使用两个 place：

- `zcode-global`：scope global、file `.zcode/cli/config.json`、switchable true。
- `zcode`：scope workspace、file `.zcode/config.json`、switchable true。

复用 `readDeclaration`、`writeDeclaration`、`editJson`、`jsonValueLines`、`McpError`，对 `['mcp','servers',name]` 做局部更新。ZCode 配置是严格 JSON：先严格验证 JSON object，空文件、坏 JSON、错误中间节点应报错，不能当 `{}` 冲掉同文件 plugins/hooks/provider 字段。

- stdio 明确写 `type:'stdio'`、command、args、env；HTTP/SSE 明确 type、url、headers。不依赖 Claude 的省略 type 行为。
- 只读写 canonical `env`、`headers`、`enabled` 和 `type:'stdio'|'http'|'sse'`；不实现 `environment`、`http_headers`、`enable`、`type:'remote'` 的兼容或归一化。目标 server 含这些旧字段（包括新旧字段并存）时，读取返回不支持的声明，安装/启停/卸载拒绝且保持文件原字节；不自动迁移。保留当前原生 oauth、timeoutMs、protocolVersion 等不归本次管理的字段。
- 更新已有 canonical server 保留禁用状态；`setEnabled(false)` 写 `enabled:false`，`setEnabled(true)` 删除 `enabled`，使用当前默认开启语义。绝不改另一作用域或 features.mcp。
- 同名 user MCP 盖 project，和插件开关的 project 盖 user 不是一个规则；provider 报自己文件的值，README 说明运行时覆盖。
- 只检查共享 fallback 的 mcpServers 是否非空，不解析/归一化旧字段。v1 不把 `~/.agents/mcp.json` 或项目 `.agents/mcp.json` 注册成 McpPlace：只识别它作为 Desktop 同 scope fallback，用于当前共享 fallback 遮蔽预检，**识别但拒绝写入，交给 ZCode 原生设置迁移**。首次向某 scope 的空 `mcp.servers` 增加 server 前读取对应 `.agents/mcp.json`；若存在 fallback servers，拒绝写入并报告冲突路径与需在 ZCode 原生设置完成迁移，避免整组 fallback 被遮蔽。不要自动复制秘密、修改其他 agent 共用文件。CLI 不读取该 fallback，README 明确写「不覆盖」。
- 当前 `McpPlace` 没有全位置 readOnly 能力；v1 只注册两个 native place，不注册看起来可安装但调用必失败的 共享 fallback place。完整 fallback 目录只读展示是后续通用契约（`McpPlace.readOnly?: boolean`）工作，本版 README 明确这一限制。
- `locate` 返回原生文件节点真实行号；不把 fallback 行号映射到 config.json。

### 4.2 Prompts、指令与 Agents

`createZCodePrompts(icon, ctx.prompts.tools)` 两个 place。workspace forms 为 commands/agent；global 为 commands/agent/instructions。不提供未经官方确认的 `.zcode/rules`。

命令文件名遵守 `^[a-z0-9][a-z0-9_:-]{0,63}$`；Hub slug 支持 Unicode，不能直接假设兼容。使用既有 `slugOf` 后检查 ZCode 限制，中文或超长结果明确报命名错误，不悄悄截断或音译造成冲突。首次 v1 输出平铺安全 slug，不为无需求的嵌套命令新增路径语法。

Agents 输出 YAML frontmatter `name`、必填非空 description 与正文，name 取已验证 slug；description 使用 prompt.description → describeBody(prompt.prompt) → prompt.name。不写未经用户选择的 tools/model/thoughtLevel/maxTurns；拒绝覆盖保留名 `general-purpose`、`Explore`。项目 profile 的权限限制由 ZCode runtime 决定，不写额外授权字段。官方源码 `loadZCodeAgentProfiles` 同时读取 `~/.zcode/agents` 与 `<workspace>/.zcode/agents`，`loadPluginAgentTemplates` 会加载已启用插件的 agents；README 必须写成“真实运行”，删掉旧文档的 “diagnostic-only” 说法。Settings 当前只提供用户级编辑入口，是 UI 限制，不是 runtime 只读项目 agents。

复用 `commandFile`；生成文件带 Hub ownership 标记，读取 held 以本 prompt 标记为准。复用 Codex 的冲突策略：同名非 Hub 文件拒绝覆盖/删除，重复安装同一 prompt 幂等更新；未知 place/form/option 先拒绝再写。

指令复用 withSection/withoutSection，保留用户正文，只删除自身标记区块；文件仅含该区块时才可删除。项目 AGENTS.md 仍由共享 provider 负责，不创建第二身份。

## 5. 插件包：文件安装而非 CLI

**安装路径决策（写死）**：v1 选择**文件安装**，不把 `zcode plugins install`、`zcode plugins enable/disable/uninstall` 作为 Hub 的安装、启停或卸载路径，也不在失败时回退 CLI。CLI 只在阶段七作为隔离环境里的参考观察者，用来生成 expected state，不参与 Hub 的实际写入。理由是安装器必须统一 `held`/`switches`、快照冲突、原子提交和失败回滚；把客户端命令变成写入路径会把 ZCode 二进制版本、项目 cwd 和 stdout 解析引入 Hub 的核心状态。

如果 H1（安全多段状态根）或 N1（通用原生清单收录）未交付，v1 不提供插件安装器，只保留 skills、prompts、MCP 与 target；不能用 CLI 或把包复制到近似目录来假装完成。

### 5.1 清单、组件与 v1 包范围

v1 只接受带 `.zcode-plugin/plugin.json` 的 ZCode 原生包。安装器固定读取这一份清单，不回退 `.claude-plugin`、`.codex-plugin` 或根 `plugin.json`。缺失或损坏立即拒绝，不通过另一个清单继续安装。

当前 Hub 不完整识别原生清单，因此 N1「通用 manifest 路径声明/收录」调整为 v1 安装器的阻断前置，由扩展贡献 `.zcode-plugin/plugin.json`，宿主只处理通用声明。同步浏览器导入、磁盘扫描、describe 和元数据测试；不为绕过宿主缺口要求发布者提供双清单。

Hub 库名、原生 manifest.name、安装记录 name 必须一致。完整复制源包，不生成或翻译清单，不在 cache 追加文件；copy 前后 treeHash 必须相同。未来若需要生成 payload，须另立通用 overlay 计划，本版不做。

标准组件目录为 `commands/*.md`、`skills/<name>/SKILL.md`、`agents/*.md`、`hooks/hooks.json`、根 `.mcp.json`；manifest 还可声明路径、数组或内联对象。原样复制完整目录，保留可执行位、隐藏文件、资源；不拆成独立 skills/MCP 投递，否则会丢掉插件统一启停、命名空间和变量语义。

只复用 Markdown/frontmatter、完整目录复制与 JSON 编辑工具，不建立 Claude 清单、变量别名或组件翻译层。原生字段以 ZCode 当前协议为准：ZCode 的 userConfig/defaults/required、plugins.options、依赖 closure、MCP 命名空间、Agent `thoughtLevel`、Hook event 支持集、UI surfaces，以及 lspServers/outputStyles/channels/settings 的 diagnostic-only 语义。安装成功不意味着每个 Claude 字段都执行。

v1 只安装无 dependencies 且 required userConfig 能由已有 options 或 defaults 满足的包。不实现安装时下载依赖、不运行 npm/pip、不自动填凭证；有未满足项在复制前列出具体项并失败。未知敏感项不进入日志。关闭/卸载前检查已安装包的依赖声明，无法验证时拒绝，不能破坏其他包。

### 5.2 真实存储、启用状态与写入约束

```text
~/.zcode/
  cli/config.json                  plugins.enabledPlugins / options / enabled / dirs
  cli/plugins/
    known_marketplaces.json
    installed_plugins.json
    marketplaces/context-hub/marketplace.json
    cache/context-hub/<name>/<version>/...
    data/<plugin-id>/...
<workspace>/.zcode/config.json      plugins.enabledPlugins / options
```

- `installed_plugins.json` 只读写当前 schema `{version:1,plugins:[record,...]}`。客户端 record 的 scope 类型为 user/workspace，但本扩展只接受 user 记录；新写 record 字段为 id/name/marketplace/version/installPath/installedAt、scope:user 与可选 updatedAt/dependencies/source/cacheTransactionId。历史 map、map-of-arrays、旧 workspace scope、其它版本或错误字段类型均报不支持，阻断该 registry 的写入，不归入用户库存、不迁移。
- `known_marketplaces.json` 只读写 `{version:1,marketplaces:[record,...]}`；record 含 id、name、source、addedAt、pluginCount，可选 description/lastUpdated/cacheTransactionId。历史 map、其它版本或错误形状均拒写，原字节不变。这里的 `version:1` 是当前 ZCode registry schema，不是旧客户端兼容。
- 两个注册表都必须**保留未知字段**；写入通过宿主原子写，失败时回滚到原字节。不能因为解析一次就重排 JSON、丢 `cacheTransactionId`/`dependencies`/未来字段，或在写失败后留下只改了一半的记录。测试必须覆盖未知字段、原子替换和失败回滚。
- 项目覆盖链：`workspace.plugins.enabledPlugins[id] ?? user.plugins.enabledPlugins[id] ?? candidate/default`。`plugins.enabledPlugins` 是**对象映射** `Record<pluginId, boolean>`，不是数组；键是完整 id `<name>@<marketplace>`，值是布尔，缺 key 表示继承，显式 false 是有效覆盖。`plugins.options` 同样是按完整 id 分组的对象；项目配置里的 `plugins.dirs` 按 ZCode 当前规则忽略，不作为安装目录。v1 只读/解释该链，不创建项目安装记录。user 操作被当前项目/总门覆盖时，写前报出控制文件，不假报已生效。
- 旧 workspace scope 不具备项目身份，本版拒绝修改含这类记录的 registry；不映射为 user/project，不做 scope 迁移。
- 市场只使用当前客户端支持的 `.claude-plugin/marketplace.json` 索引；这是当前市场目录协议，不是插件清单回退，不搜索第二种历史位置；缓存 catalog 为 `marketplaces/<market>/marketplace.json`。`context-hub` 源可登记 `{source:'directory',path:<Hub plugin library>}`；已存在同名但不同源必须报冲突。
- 插件身份为 `<name>@<market>`；metadata 只读取原生 manifest，收录依赖 N1 的通用声明，不以其它格式回填。第三方包保持真实 id，不改成 `@context-hub`。
- 新安装默认补 user enabled=true，但重装/更新必须保留用户显式 false。有效值是 project override → user override → candidate/default；installed cache 缺省 false，inline 缺省 true，官方默认还由内置名单参与，不能简化成所有包默认 true。v1 只有 user 安装 place 仍须读当前项目覆盖计算有效态；未来 project place 读取 `switches.project` 的显式布尔，缺 key 继承。
- 不仅 `plugins.enabledPlugins`，还有总门 `plugins.enabled`。总门显式 false 时不可悄悄打开；安装/启用应报告全局关闭，held/switches 不宣称 runtime 已开启。
- `PluginHeld.enabled?` 允许未知（H3）：包可能只有项目覆盖、manifest 默认不可读或记录缺失；这种时候不能猜 true/false，也不能用 `switchable:false` 冒充。v1 只提供 user 安装行，但 held.enabled 仍需解释当前工作区的项目覆盖和总门；不能确定即 undefined，不能用 user 默认值冒充有效状态。switches.user 只返回该文件显式布尔；project 没有写入口。

### 5.3 PluginPlace 映射与 v1 范围

目标模型是一个 user 安装 place + 一个 project 启停 place，但 **v1 只实现 user place**。project place 依赖 H2/H3，未落地不在 v1 注册，避免假装项目能装文件。

| place id | Hub scope | scopeWord | file | switchable | v1 |
| --- | --- | --- | --- | --- | --- |
| `zcode-user` | global | user | `.zcode/cli/config.json` | true | 注册；默认可安装（H2 前不写 `installable` 字段）；唯一物理安装/卸载入口 |
| `zcode-project` | workspace | project | `.zcode/config.json` | true | 不注册；H2/H3 后作为 `installable:false` 的启停 place，`overrides:['user']` |

`held` 只返回当前数组 registry 的 user 记录；历史 map/workspace scope 报不支持，不生成迁移后的持包行，不为配置 override 增加安装数。`switches` 只返回文件显式布尔，缺 key 保持继承。

v1 操作：

- install(name,user)：严格验证源、状态、依赖/options、版本段 → 写 Hub 市场索引 → 在 disk.run 读取快照 → 复制缓存及提交两个 registry、cached catalog、user 开关 → 返回路径。
- install/remove(project)：v1 没有 project place，防御性拒绝；项目开关不触碰包字节、不新增 inventory、不修改用户配置。
- setEnabled(id,user,on)：只改指定文件 `['plugins','enabledPlugins',id]`，保留 options、hooks、MCP 和其他 id。project 开关留到 H2/H3 后实现。
- remove(id,user)：检查 reverse dependencies，先原子移除安装记录和用户启用 key，再删除本安装器拥有、规范边界内的对应 cache；删除失败要报告残留路径。保留 data、options、其他工作区 override、市场注册；不全盘扫描/删除别的项目声明，ZCode 会把其缺包状态视为 missing。
- 同 version 内容冲突先拒绝，不默认 replace 用户改动；跨 version 更新写新缓存并保留旧缓存，v1 不垃圾回收；不得在复制后追加清单或 overlay。
- `tools.run`、`tools.has` 在测试里设为直接抛错；安装器全过程不得调用 zcode。CLI 仅作之后隔离实验的独立观察者。

**H2/H3 落地后的 project 启停 place（非 v1 验收）**：只写 `.zcode/config.json` 的 `plugins.enabledPlugins[id]`，不装包、不卸载、不触碰 `installed_plugins.json`；用 `installable:false` 让 UI 只显示开关；`PluginHeld.enabled?` 未知时不猜。项目卸载不能实现成删除 user package，项目缺失包显示 missing，由 ZCode 自己处理。

### 5.4 文件访问声明与根路径冲突

当前宿主契约与 ZCode 真实路径的冲突：

| 层 | 当前宿主契约 | ZCode 真实目标 | 结论 |
| --- | --- | --- | --- |
| `home` | 只接受单段，如 `.zcode` | `~/.zcode` | 可表达 |
| `state` | 只接受单段，如 `cli` | `~/.zcode/cli/plugins` | 当前无法表达，需 H1 允许 `cli/plugins` |
| `copy.destination` | 必须 `cache/<market>/<name>/<version>`，相对 state root | `~/.zcode/cli/plugins/cache/<market>/<name>/<version>` | H1 后成立；无需改 copy 四段规则 |
| `config` | home + `cli/config.json` | `~/.zcode/cli/config.json` | 可表达 |
| `workspace` | selected workspace + `.zcode/config.json` | `<workspace>/.zcode/config.json` | 可表达 |

H1 后的 declaration 样例（实施时按实际类型落盘）：

```ts
const ZCODE_PLUGIN_ROOTS = {
  home: ".zcode",
  state: "cli/plugins",
  config: { write: ["cli/config.json"], read: ["cli/config.json"] },
  stateFiles: {
    write: [
      "installed_plugins.json",
      "known_marketplaces.json",
      "marketplaces/context-hub/marketplace.json",
      "cache/context-hub/*/*",
    ],
    read: [
      "installed_plugins.json",
      "known_marketplaces.json",
      "marketplaces/*/marketplace.json",
      "cache/*",
      "cache/*/*",
      "cache/*/*/*/.zcode-plugin/plugin.json",
    ],
  },
  workspace: { write: [], read: [".zcode/config.json"] },
  library: {
    write: [],
    read: ["*/.zcode-plugin/plugin.json", ".claude-plugin/marketplace.json"],
  },
  external: [".zcode-plugin/plugin.json", ".claude-plugin/marketplace.json"],
} as const
```

- `stateFiles.write` 只允许安装器真正拥有的四个模式；`read` 额外允许逐级 `cache/*`、`cache/*/*` 用于列举，不授予 `data/` 写权限。
- `external` 只为 manifest/依赖读取；卸载只认本安装器 cache 范围，不因 `installPath` 字符串合法就允许删外部目录。
- H1 必须逐段拒绝空段、`.`、`..`、绝对路径、反斜杠/盘符、通配符，并检查 `config -> state` 中间目录的 symlink/junction，不能只检查最终 plugins root。
- `ZCODE_DATA_BASE_DIR`、`ZCODE_STORAGE_DIR` 会改变不同层根，而当前 PluginDisk 环境覆盖只支持直接绝对 root；v1 只承诺默认 `~/.zcode` 根，自定义根另立通用解析契约，不把 base env 塞进 homeEnv。

## 6. 复用与必须先解决的通用前置

直接复用既有模式：Codex 的强类型 contracts/ownership 检查、Claude 的 JSON 节点编辑与状态分离、现有 `disk.run/commit` 快照和失败回滚、`syncMarketplace` 的扩展自供 catalog、服务生命周期注册、两语言表和构建脚本。不要从 Claude 包跨目录运行时 import，不抽第三套通用安装框架。

必须自写：ZCode canonical array registries、嵌套 plugins.enabledPlugins、user/default 视图、单一原生 manifest 校验、userConfig 检查、MCP canonical 解析与 Desktop 当前共享 fallback 遮蔽预检。Claude 的 installed index parser、project/local install record 和 orphan marker 策略不可照搬。

**H1（阻塞 v1 文件安装）**：`PluginDiskDeclaration.state` 接受安全的相对多段路径，如 `cli/plugins`；home 仍可单段。保留 `copy.destination=cache/<market>/<name>/<version>` 的四段规则，让最终路径成为 `cli/plugins/cache/...`。验收：`cli/plugins` 可用；`..`、绝对路径、盘符、反斜杠、通配符、空段、中间 symlink/junction 全部拒绝；写入/复制失败回滚；不出现任何 ZCode 字面量。

**H2（阻塞 project 启停 place，非 v1 阻塞）**：通用 `PluginPlace.installable?: boolean`，缺省 true；`false` 只显示启停，不显示安装/卸载。安装菜单、详情安装/卸载按钮、批量安装、调用侧防御都按该能力过滤；状态菜单保留 `switchable`+`overrides`。位置计数只算实际持包记录，项目 override 不算第二份安装。

**H3（v1 共用未知态前置）**：PluginHeld.enabled 可为 undefined；当前工作区有效值无法证明时显示未知，不猜 true/false。与其它扩展统一交付；project place 仍只由 H2 决定是否提供，本版不提供。

**N1（阻塞 v1 原生包安装）**：交付通用 manifest 路径声明/收录契约，由扩展贡献 `.zcode-plugin/plugin.json`。同步浏览器导入、磁盘扫描、describe、声明生命周期和元数据测试；标准布局、自定义目录、inline MCP 均按原生清单解析。Cursor/WorkBuddy 共用此契约，不要求双清单，不在宿主加客户端字面量。

**后续通用能力（v1 不做）**：`McpPlace.readOnly?: boolean`，用于将来展示 `.agents` fallback 而不误写；v1 不注册该 place。以及「install payload overlay」——如果将来需要自动补 `.zcode-plugin` 清单，overlay 必须参与 `commit(copy)` 的 copy 快照/hash，并在复制前准备，不能在复制后写；v1 不实现 overlay，只接受已有原生清单。

可能涉及的 Hub 文件已查到：

- `packages/resources/plugins/src/provider.ts`
- `packages/resources/plugins/src/host/installer-files.ts`
- `packages/resources/plugins/src/rows.ts`
- `packages/resources/plugins/src/install-actions.tsx`
- `packages/resources/plugins/src/detail-dialog.tsx`
- `packages/resources/plugins/src/page.tsx`
- `packages/resources/plugins/src/library.ts`、`library-store.ts`（传递/调用校验）
- `packages/resources/plugins/__test__/installer-files.test.ts`、`rows.test.ts`、`library.test.ts`
- `docs/extensions.md`（通用契约说明）

这些是前置影响清单，不是给本轮写源码的授权。H1/N1/H3 未交付时 v1 不提供插件安装器；H2/H3 未获批时 v1 不提供 project place；不能用 CLI 或把 project install 映射 user 安装凑数。

## 7. 分阶段实施

命令约定：以下扩展命令在 `D:/work-space/context-hub-extensions` 运行。根 scripts 已确认存在 lint/typecheck/test/build/build:marketplace；新包沿用 claude.code/codex 已有 build/test/typecheck 三脚本。没有捏造 `pnpm lint:zcode`、`pnpm check` 或 format check。

### 阶段一：建立扩展脚手架

**目标**：生成可构建、可被市场读取的独立包；第一动作复制本轮官方图标。

**文件**：`plugins/zcode/{assets/icon.svg,plugin.yaml,package.json,build.mjs,tsconfig.json,vitest.config.ts,README.md,src/index.tsx,src/contracts.ts}`，必要时根 pnpm-lock.yaml workspace importer。

**动作**：先复制图标；按已有 package/build 配置建包，保持 React external；index 只注册当前已完成能力，不提前 import 后续尚未创建模块。记录 H1/H2/H3/N1 所属总计划和版本门禁。需要依赖链接时仅在实施获批后使用仓库现有 pnpm 与锁定 devDependencies。

**验收**：`pnpm --filter zcode typecheck`、`pnpm --filter zcode build`；产物存在并只允许 React 外部 import；复制前后图标 SHA-256 相同，598 bytes，低于市场 32 KiB 限制。不会生成 zcode 的配置/用户目录。

### 阶段二：注册身份与安装位置

**目标**：选择 ZCode 后出现一致的 target 与两级原生 Skill 位置，卸载扩展时注册可回收。

**文件**：`src/index.tsx`、`src/locations.ts`、`src/contracts.ts`、`src/messages.ts`、`__test__/registration.test.ts`、README。

**动作**：实现 target/provider id 与 `.zcode` 位置表；图标用原始 path 的机械 JSX 转写或引用 assets，保持几何和颜色不变，正确接受 className/aria-hidden；注册 en/zh-CN；只注册 .zcode/skills 两个 SkillPlace。所有 source/target 路径来自 locations 单一事实。

**验收**：`pnpm --filter zcode test`、`pnpm --filter zcode typecheck`；断言两个 skills 位置、无重复 `.agents/skills`、target id 一致、manifest inject 覆盖服务；空目录数量 0、未知数量不伪装 0 的 UI 验收留阶段七。

### 阶段三：实现 MCP 配置读写

**目标**：两原生 MCP 文件只管理当前字段，Desktop 当前共享 fallback 不被遮蔽。

**文件**：`src/provider.ts`、contracts/locations/messages/index、`__test__/provider.test.ts`、README。

**动作**：按 4.1 实现严格 JSON、canonical type、旧字段拒写、enabled 开关、保留未知字段、fallback 预检；不注册错误的桌面-only 写入位置，不自动迁移凭证或全局开关。旧字段和新旧并存只设零写入拒绝测试，不做归一化或兼容分支。

**验收**：`pnpm --filter zcode test`、`pnpm --filter zcode typecheck`；覆盖 user/workspace 独立、stdio/http/sse、坏文件零写入、相邻 plugins/hooks 字节保留、enabled=false 重装不翻转、旧字段和新旧并存明确拒写、最后 server 删除与 fallback 重现、locate 精确路径。fallback 非空时首次原生写入必须先拒绝且所有文件字节不变；`.agents` 不注册为 place、不被写入。

### 阶段四：交付提示词与子代理

**目标**：commands、global instructions、两级 agents 实现可逆且幂等的文件交付。

**文件**：`src/prompts.ts`、contracts/locations/messages/index、`__test__/prompts.test.ts`、README。

**动作**：按 4.2 复用工具生成 Markdown 与指令标记；检查 ZCode slug 限制、保留名称、description；保护手写文件；明确 workspace AGENTS.md 已由 shared provider 提供。自动 Memory 仅描述，不改运行时文件。

**验收**：`pnpm --filter zcode test`、`pnpm --filter zcode typecheck`；安装两次只留一份，held/remove 对应本 prompt，指令删除保留用户正文；Unicode/超长 slug、未知 form、手写同名、保留 agent 名都在写入前失败；无 `.zcode/rules` 或重复 workspace AGENTS.md 操作。

### 阶段五：实现插件文件安装器（v1 user-only）

**目标**：v1 只实现用户级包生命周期；project 启停 place 留给 H2/H3 后的独立增量，不用 project 安装冒充。

**前置**：H1、N1 与 H3 已交付并通过测试；H2 只影响未来 project place。H1/N1/H3 任一未满足即阻塞，不用兼容清单或 CLI 绕过。

**文件**：`src/installer.ts`、`src/plugin-state.ts`、contracts/locations/messages/index、`__test__/installer.test.ts`、README；Hub 文件仅由共享前置计划维护。

**动作**：落实第 5 节 canonical registries、缓存、市场、自有包用户级启停/卸载、用户 false 保留、依赖/options 检查、snapshot 冲突、错误恢复；配置 parser 严格拒绝未来 schema；不生成/翻译 `.zcode-plugin` 清单，不在复制后 overlay。v1 不注册 project place，不实现项目安装/卸载/启停。省略对官方 builtin seed/suppression 的模拟。将只管理本 Hub 安装记录的边界写进 README，第三方行仍展示真实状态。

**验收**：`pnpm --filter zcode test`、`pnpm --filter zcode typecheck`、`pnpm --filter zcode build`。安装/重装/关闭/开启/卸载完整循环；同包只留一个 user record；项目 place 不在安装器注册表；`installed_plugins.json`/`known_marketplaces.json` 未知字段保留、原子写、失败回滚；cache 与源树 hash 一致、没有多出的清单；CLI run/has spy 调用次数必须 0。H1 的宿主验收使用真实 scripts：在 Hub 根运行 `pnpm --filter @context-hub/plugins test`、`pnpm --filter @context-hub/plugins typecheck`，并执行其批准计划指定的相关 UI 检查。

### 阶段六：补齐隔离回归测试

**目标**：证明跨资产共享 config 不丢字段、所有文件操作落在临时根、构建与市场可交付。

**文件**：全部 `__test__/*.test.ts`、README；必要的 fixtures 在测试运行时创建。只修本扩展失败，不改同类插件掩盖既有失败。

**动作**：执行第 8 节矩阵；为 H1 用真实 createInstallerFiles 的宿主测试核对嵌套路径，不只测 fake Disk；同一 config 交替改 MCP 与 plugin 后验证各自字段；实现失败注入与 unchanged assertions；对两个 registry 的未知字段、原子写、失败回滚分别断言。

**验收**：依次运行 `pnpm --filter zcode test`、`pnpm --filter zcode typecheck`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。`pnpm build` 真实执行所有包构建及 build-marketplace；生成索引含 zcode/id/version/icon/engines/source.path，lib 无 Hub 包运行时 import。生成物按仓库规则忽略，不做顺手格式化。若共享契约改动进入 Hub，另跑总计划要求的更广检查。

### 阶段七：验证真实客户端加载

**目标**：用独立临时用户与工作区证明文件已落盘、列表可见、实际组件可加载；确认 Hub 位置 UI 正确。

**文件**：README 记录实际版本、哈希、结果、限制；修复只限本扩展及已获批共享前置。测试目录全部为独占临时目录。

**动作**：按第 9 节命令先确认所用 CLI；建立隔离 HOME/USERPROFILE、ZCode data/storage、Hub home、workspace A/B；只用原生单清单无执行组件 fixture；另用 Claude/Codex-only 包做零写入拒绝反例。CLI 原生安装只用于在参考隔离根生成 expected state，另一个根用 Hub 文件安装器生成实际结果，比较 schema 与组件；v1 只安装原生 `.zcode-plugin` 包。Desktop 使用独立用户 profile，打开同一测试工作区；用运行时 definitions/agents 诊断确认 `~/.zcode/agents` 与 `.zcode/agents` 的 profile 实际可加载，不能只看 Settings 列表。浏览器 UI 自动化按 ego-browser skill，不连接用户现有真实数据服务。

**验收**：CLI skills/commands/plugins 清单返回 fixture，并给出正确名称、来源/位置与诊断；新会话或当前版本支持的刷新后可见；停用后 fixture 不再进入组件目录；卸载移除 package、保留 data/options fixture。Hub 仅 user 位置提供插件安装/卸载，不出现 project place；技能空位置为 0、读取失败为未知、不重复 `.agents`；卡片、详情、批量菜单结果一致；原生包的 name/version/commands/skills/agents/hooks/mcp 各项被客户端识别，否则按 5.1 拒绝而不是声称支持。

需要实际调用模型、真实 MCP 或联网登录的验证必须另获用户授权；本阶段可用受控本地 replay/mock 或仅目录/协议诊断，未跑实际加载的组件明确标未验，不把 plugins list 存在当加载通过。记录本次进程 PID，只停止自己启动的进程；先卸测试包再清临时目录，复查真实目录快照无差异。用户确认计划完成后才归档。

## 8. 必须覆盖的测试矩阵

所有测试使用内存端口或 `mkdtemp` 独占目录。构造 PlaceFiles/InstallerFiles 时显式传 `home`、`folder/workspace`、`userHome` 与受控 env；不使用默认 homedir、不向真实 `~/.zcode`、`~/.agents` 或当前仓库 `.zcode` 写入。禁止把客户端配置、token、OAuth 数据拷入测试根。

| 范围 | 验证输入与预期 |
| --- | --- |
| 注册与生命周期 | target/provider id 一致；inject 全；两个 skills 主位置；扩展释放回收；没有共享路径重复注册 |
| 位置计数 | 用户安装只有一份物理 record；v1 不注册 project place，项目覆盖不是第二份包；旧 workspace scope 拒写且不迁移；同名多市场真实 id 不合并成可误卸载单行；0/未知区分。H2/H3 后另测 `installable:false` 位置只显示开关 |
| MCP | 三 transport、显式 type、旧字段拒写、保留未知字段、坏 JSON/类型/EACCES 零写；原生与 fallback 不双写；同 scope fallback 遮蔽预检；旧字段和新旧并存明确拒写且原字节不变 |
| Prompts | commands/agent/instructions 路径正确；重复安装幂等；自有删除；手写保护；中文/路径穿越/超长 slug；保留 Agent 名；无 workspace instructions 重复入口 |
| Manifest | v1 只支持原生 `.zcode-plugin/plugin.json`，N1 交付后完整收录；仅 Claude/Codex/标准根清单拒绝；安装器不生成/翻译清单；manifest.name 与库名不符拒绝；缺版本按 ZCode 规则 0.0.0；无清单包拒绝 |
| 注册表 | `installed_plugins.json` 精确 schema `{version:1,plugins:[record,...]}`、新写 scope 只为 user；历史 map/workspace scope 明确拒写；`known_marketplaces.json` 精确 schema；不用 map-of-arrays；未知 version/字段类型拒绝；未知字段保留；原子写；失败回滚；损坏文件不当空表；同包重装不重复 |
| 文件安装 | market/index/cache/config 四类产物；源已变、state 已变、工作区已变都拒绝；重复同内容幂等；同版本不同内容冲突；cache 与源树 hash 完全相同、无复制后 overlay；无 CLI 调用 |
| 作用域 | v1 user-only：user=false 重装保留；旧 record.scope=workspace 拒写，不归入用户库存；project install/remove 不在注册表且防御拒绝；H2/H3 后另测 user=true/project=false、命中 override 与未知 enabled |
| 开关 | plugins.enabled 总门关闭不偷偷打开；重装保留 false；无 package 的 enabled 声明不伪造成 installed；配置与运行时加载状态分开；未知值不猜、不压成 false |
| 依赖与 options | dependencies 非空安装前拒绝；已有 enabled dependent 阻止关闭/卸载；required options 缺失拒绝；defaults 可满足；不打印 sensitive |
| 卸载 | 只删自己记录/用户 key/自己 cache；data/options/其他项目配置保留；第三方/builtin/inline 只读；删除失败返回残留路径 |
| 访问边界 | 多段 state、含空格/中文/Windows 路径；越界/绝对路径/junction/symlink 拒绝；禁止 data/ 写权限；保留脚本执行位 |
| 跨模块 | 一份 config 先 MCP 再 plugins 再 Hook 邻接数据，互不抹除；宿主旧契约报不兼容，不回退程序调用 |
| 真客户端 | 不仅 list，还比较 skills/commands 的来源与运行目录；agents/MCP/Hook 独立诊断或授权的本地加载证据；Desktop 与 CLI 分别记版本 |

## 9. 待验证项与精确检查方式

这些不是要求用户现在运行；是实施获批后执行者的验证入口。所有会启动 ZCode 的命令必须由隔离 harness 以参数数组执行，cwd 指向临时 workspace，env 显式把 HOME、USERPROFILE、ZCODE_DATA_BASE_DIR、ZCODE_STORAGE_DIR 指向临时目录。不要重新赋值当前 shell 的 HOME。先在源码确认各 env 的解析结果，无法证明隔离就用临时 OS 用户/VM，不在真实 home 试错。

| 待验证项 | 验证命令或可观察判据 |
| --- | --- |
| 本机二进制与版本 | 当前 `command -v zcode` 未发现可执行文件。实施时先 `where.exe zcode`（Windows）/`command -v zcode`，再在隔离环境运行 `zcode --version`、`zcode doctor --json`；记录绝对 executable 与 SHA-256 |
| 当前源码 vs 发布版 | 在官方参考 checkout 运行 `git rev-parse HEAD`，对照 README 版本；本机 CLI 不仅凭版本字符串判定功能 |
| 状态 schema 与组件真实加载 | 参考临时根：`zcode plugins marketplace add <fixture-market-absolute>`、`zcode plugins install demo@fixture --scope user`、`zcode plugins list --json`、`zcode skills list --json`、`zcode commands list --json`；比对安装前后隔离目录快照；Hub 文件安装另根重复后独立列表 |
| 项目是否只影响配置（H2/H3 后） | `zcode plugins disable demo@fixture --scope project --cwd <workspace-A>`，然后 `zcode plugins list --json --cwd <workspace-A>` 与 `<workspace-B>`；只 A 的 .zcode/config.json 变化，installed index 无 project identity/第二记录。v1 不提供 project place，此探针只用于设计未来增量 |
| 默认 false、总门、options | 临时 HOME 写入 `{"plugins":{"enabledPlugins":{"demo@fixture":false}}}` 这类**对象映射**（不是数组），再跑 `zcode plugins list --json --cwd <workspace>`；分别覆盖真/假/缺 key 与 `plugins.enabled=false`；记录 diagnostics；不由 Hub 擅改总门。项目覆盖链另用 A/B 工作区核对 `workspace.plugins.enabledPlugins[id] ?? user.plugins.enabledPlugins[id] ?? default` |
| MCP canonical/fallback | Desktop Settings 在隔离 HOME 仅共享 fallback、仅 native、两者都有、native 清空四组输入，核对来源和数量；CLI 不使用虚构的 `zcode mcp list --json`，TUI `/mcp` 仅交互检查；实际连接只用受控本地 MCP。旧 enable 与新旧并存只用来验证 Hub 零写入拒绝，不开发兼容分支 |
| Agents 两作用域及插件 agents | 用 S10/S18 源码与隔离 Desktop Subagents/runtime definitions 对照，fixture 名为 zz-probe-*；独立 CLI 没有已确认的 agents list 命令，不编造；需要运行 profile 时用本地 replay/provider capture 验证；README 必须写真实运行，不写 diagnostic-only |
| Plugin manifest/path 合法性 | `zcode plugins validate <fixture-pack-absolute> --json`；只测原生 manifest、inline components、坏路径；仅 Claude/Codex 清单必须被 Hub 拒绝；隔离验证原生组件；validate 不证明所有组件运行 |
| 卸载保留数据 | 隔离参考实验用 `zcode plugins uninstall demo@fixture --keep-data --force`；Hub 自己卸载必须保留 data/options fixture，检查安装记录及 cache 消失；不照搬 CLI 默认删数据语义 |
| 自定义数据根 | 先核对官方 config/storage resolver，再隔离运行 `zcode doctor --json` 与文件快照；当前计划只承诺默认 `.zcode` 根，自定义 env 支持未验，不能静默写默认路径 |
| Hub H1/H2/H3 | 在 Hub 根 `pnpm --filter @context-hub/plugins test`、`pnpm --filter @context-hub/plugins typecheck`；真实 file adapter 覆盖 `cli/plugins` 嵌套根、越界/符号链接拒绝、回滚；H2 覆盖 `installable:false` 只出开关；H3 覆盖未知 enabled 不被猜成布尔 |
| 原生-only 包完整收录 N1 | Hub import native-only 且仅 manifest 内联 MCP 的 fixture，name/version 必须来自 native manifest；失败即阻塞，不用双清单或 Claude fallback 绕过 |
| 图标发布使用 | `curl -L --fail https://zcode.z.ai/en/terms` 核对第 VI 节；品牌用于明确标识 ZCode 集成，不能暗示官方背书。若需要独立书面授权，发布前由项目方确认；当前仅保存研究资产 |

## 10. 不做

- 不更改模型、GLM Coding Plan、登录、凭证、计费或 provider 配置。
- 不自动安装 CLI/桌面软件、不新增模型请求、不以收费 prompt 初始化插件列表。
- 不接 SSH/WSL/Docker/手机同步，不把本机路径当远端 Host 路径。
- 不做 ZCode UI Plugin、LSP、outputStyles、channels 或 settings 执行兼容层。
- 不管理自动 Memory、Agents 启停状态数据库、模型覆盖、Hook 独立编辑。
- 不重复注册共享 workspace `.agents/skills`/AGENTS.md；不把 global `.agents/skills` 归到单个 agent。
- 不双写 MCP；不把 `.agents/mcp.json` 注册成 McpPlace、不写入；不迁移 legacy MCP secret；不静默写入会隐藏整组 fallback 的 native 配置；不迁移旧 enable，目标条目含旧字段即拒写。
- 不实现依赖下载、跨市场 closure、userConfig 配置表单、凭证存储、npm/pip 安装或 Hook 执行。
- 不用 CLI 作安装/启停/卸载路径或失败回退；不在宿主写 ZCode 文件名分支。
- 不把 project override 当作 project 安装；v1 不提供 project place，不提供可误删全局包的项目卸载按钮；H2/H3 后才提供只启停位置。
- 只导入原生 `.zcode-plugin` 包；不以 Claude/Codex 清单替代，不生成、翻译或复制后 overlay 清单。
- 不实现 `McpPlace.readOnly` 或 fallback 只读展示；这是后续通用能力，v1 只识别并拒绝写入。
- 不管理 builtin suppression/inline dirs；第三方包只读；不清理 data、其他工作区、旧版本缓存。
- 不手改 generated marketplace.json/lib，不提交、不建分支、不推送、不发布、不自动归档。

## 11. 官方图标来源与校验

- 文件：`D:/work-space/dsh-context-hub/docs/research/agent-icons/zcode.svg`。
- 来源： https://zcode.z.ai/en ，官网品牌标记的原始 inline SVG，`viewBox="0 0 256 218"`。没有第三方图标站、重绘或图片生成。
- 获取过程：使用 `curl -L --fail` 读取官方页面并提取原始 SVG；后续下载调用遇到连接超时，按要求调用 web_fetch 复核官网，最终保存先前已返回的原始 SVG 字节。也与扩展仓库既有 `icons/zcode.svg` 做了逐字节比对，完全相同。
- 校验：文件以 `<svg` 开头，XML 根为 SVG，598 bytes，低于 32 KiB；不含 script/foreignObject/href/onload。
- SHA-256：`2b9d3871496471ced5a758b9ea3b6051819a108d68cb6bed503fe55a28ba8c0c`。
- 条款： https://zcode.z.ai/en/terms ，2026-06-15 生效版第 VI.1 节：logo/graphics 属 ZCode 或其关联方，展示不构成隐含许可，不得造成消费者混淆或贬损。没有发现独立开放品牌许可；官方源码 Apache-2.0 不等于官网品牌商标授权。README 保留来源、权属和“ZCode 集成”含义，发布前复核使用依据。

## 12. 自审结果

- [x] 每阶段都有真实 package scripts 或具体文件/UI 验收，未写“验证一下”。
- [x] 依赖顺序正确：先脚手架，再位置、provider、prompts；H1/N1/H3 在 installer 前阻塞，H2 只影响未来 project place。
- [x] 覆盖调用方、测试、fixture、config、exports、批量菜单、详情菜单与位置计数；没有只改类型不改动作的漏洞。
- [x] 把官方旧文档与当前源码冲突写明：MCP enabled、Host user inventory、project dirs、插件 agents/Hook、卸载 data；发布版实测仍列待验证。
- [x] 未验证项均有命令或明确的官方 UI/协议观察方法；没有杜撰 agents list/mcp list、环境变量或版本门槛。
- [x] 没有以简化为由伪造项目安装、生成清单或静默回退 CLI；MCP 只两处 native，`.agents` 只识别不写；不做列表覆盖相邻能力，保护用户真实目录。
- [x] 文件安装决策写死；CLI 只作隔离验证对照。v1 只提供 user 安装 place，project 启停等 H2/H3；H1/N1/H3 未交付则不提供安装器。
- [x] 图标是官方原始 SVG，来源、条款、哈希和实施第一步明确。

## 13. 本轮执行记录（2026-11-03，开发自测）

- 已实现产物：`D:/work-space/context-hub-extensions/wip/zcode`；只改 ZCode 源码、测试、配置、README 与本计划。启动时无包含必需契约的已发布 Hub 版本，按调度指令不新增第二个缺 engines 的正式市场包，故暂存非 workspace 草稿。`plugin.yaml` 目前故意无 engines，不可发布；若最新用户授权以本地版本作开发基线，由主 Agent 明确同步后再迁入正式目录。
- 阶段一脚手架本地通过，正式 engines/市场位置仍待协调；阶段二身份/两原生技能位置、阶段三严格 MCP/fallback 遮蔽检查、阶段四 commands/global instructions/两级 agents 已实现；阶段五为 user-only 原生单清单文件安装器，无旧格式成功路径和 CLI 后端。
- 共同四项前置已通过独立验收。安装器额外消费后续通用目录事务 API：`snapshotDirectory`、`copy.sourceSnapshot/before`、`commit` 第四参数目录删除。源 digest 持久保存在记录 `contextHubSnapshot`，同版本不同内容、源在复制前变化、缓存编辑均拒绝，卸载目录与 registry/config 同事务补偿；缺历史 digest 不强行覆盖/删除。新增契约的独立验收由主 Agent 协调，本扩展没有修改宿主源码。
- 实际命令：`CONTEXT_HUB_CHECKOUT=D:/work-space/dsh-context-hub node D:/work-space/context-hub-extensions/wip/zcode/scripts/verify.mjs test typecheck build lint marketplace`。独占临时副本 5 个测试文件、59 tests 全部 PASS（含 8 条真实宿主回归），typecheck/build/lint 通过。bundle 约 38.2 KiB，外部 import 仅 `react/jsx-runtime`。未设 checkout 时 8 条宿主回归明确 skipped。
- 真实宿主回归验证 native-only 收录、完整复制字节/执行位、nested state/data 拒写、共享 MCP/plugins/hooks config 邻接字节和真实 locate、两个 registry 未知字段与原子写失败补偿、卸载失败恢复目录+记录、源/cache/config/workspace 冲突和中间 junction。测试全部显式临时 home/folder/userHome 与 `env:{}`；无真实用户配置、客户端程序、登录、网络 MCP 或模型调用。临时验证副本均 finally 清理。
- `marketplace` 验证仅在全新临时副本注入明确测试范围 `>=0.0.0-test-only <0.0.1`，运行既有生成器并断言 id/version/icon/source.path。该范围不写入草稿、不提交、不当兼容声明；只生成 1 个 ZCode 包，绝非真实全仓根构建通过。初始真实工作区市场存在 WorkBuddy engines 失败；本 Agent 未改 WorkBuddy、市场或 lockfile，后续全仓集成由主 Agent 协调。
- 阶段七未运行：没有可靠隔离 OS 用户/VM/容器，不用临时 HOME 试探真实客户端。CLI/Desktop 版本/hash、skills/commands/plugins 清单及实际 agents/MCP/Hook 加载、GUI 0/未知计数与菜单一致性均未验证，交独立环境后续验收；不声称实机加载。
- 图标原件及复制品均 598 bytes，SHA-256 `2b9d3871496471ced5a758b9ea3b6051819a108d68cb6bed503fe55a28ba8c0c`；品牌公开使用依据仍待确认。正式发布前须完成真实版本兼容门槛、独立代码验收及品牌复核。
- AOCI 仅读本次涉及宿主契约切片；扩展草稿不受本仓索引管理，宿主和其它扩展正在并行修改，未对他人中间状态做 maintain。未 commit/push/建分支，未归档本计划。

本计划已获执行授权；旧章节中的审批措辞保留为计划历史。真实客户端未验证不能等同于开发实现缺失，也不能以本地自测冒称客户端生效。
