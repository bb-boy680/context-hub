# 接入 Qoder CLI Agent 扩展

- 状态：阶段一至六源码已完成并注册，阶段七验证未执行（用户要求停止全部验证）；阶段五、六的运行时行为尚未验证，Windows 上已有 settings 的修改仍因 ACL 不可证明而拒绝。
- 核对日期：2026-11-03。
- 实施仓库：`D:/work-space/context-hub-extensions`，独占目录 `plugins/qoder/`；宿主仓库：`D:/work-space/dsh-context-hub`。
- 客户端范围：当前官方 **Qoder CLI**。不把 Qoder Desktop、旧 IDE、JetBrains 插件或 Qoder CN 的目录和协议混入同一 provider。
- 阶段数：7。获批后由一个 Qoder 专属开发 Agent 按阶段维护 TaskCreate / TaskUpdate；其他产品可同时开发，主 Agent 只调度及协调公共文件。阶段一至四可先形成资产与原生清单收录交付；阶段五、六推进原生插件完整生命周期，阶段七验证实际交付范围。用户确认完成后再归档本计划。

## 1. 目标与交付边界

完整目标包含当前 Qoder CLI 的默认目录 Skills、MCP、commands、rules、agents、用户级指令，以及**原生插件的库收录、库存、文件安装、启停、卸载**。user/project/local 都是官方已支持的安装作用域；项目级不是 switch-only，不因其他客户端的限制为 Qoder 添加 `PluginPlace.installable`。

分层交付：阶段一至四先交付证据充分的资产与原生清单收录，注册 `skills`、`prompts`、`mcp`、`plugins`、`targets`、`locales` 六服务；此时 `plugins` 只调用 `registerManifests`，尚不注册 `PluginInstaller`。这只是可先交付范围，不代表原生插件目标被删除或已完成。

2026-11-03 补证：官方 npm 发行包 `@qoder-ai/qodercli@1.1.81` 的 bundle（[原文件](https://unpkg.com/@qoder-ai/qodercli@1.1.81/bundle/qodercli.js)，35,653,383 字节，SHA-256 base64 `3Ku8rs4cBoPuSSmsfAzw6gC76k0xn1q+qughYIi5iI8=`）静态代码给出 version 2 registry、local 身份和 cache 目录、三作用域记录与移除规则；未运行发行代码。根据当前任务协调，新增通用持久 ownership 事务和可声明的安全复制过滤，拒绝覆盖无法证明归属的已有包。其他仍未证实的写入语义继续拒绝猜测，CLI 不代替 Hub 文件写入。

普通资产端口只有用户 home / workspace 两种根，可先交付部分明确管理默认 `~/.qoder` 与工作区目录，不声称支持普通资产的 `QODER_CONFIG_DIR` 自定义根。插件完整目标使用已有 `homeEnv` 支持用户配置根覆盖；local scope 的通用宿主前置由 Qoder Agent 实施并与共享文件作者协调。

## 2. 已阅读的真实上下文

| 仓库与文件 | 实际符号、调用点及实施约束 |
| --- | --- |
| 扩展仓 `plugins/claude.code/src/index.tsx`、`locations.ts`、`prompts.ts`、`installer.ts` | `apply` 通过服务注册；六注入点不是六项功能都已完成的证明。复用组织方式，不复制 Claude 路径或 registry。 |
| 扩展仓 `plugins/zcode/src/index.tsx`、`locations.ts`、`prompts.ts`、`contracts.ts`、`__test__/registration.test.ts` | `registerManifests`、文件 ownership 标记、同名手写文件拒绝覆盖、用户指令标记段与图标 hash 检查可作模式参考；ZCode 的插件状态结构不适用于 Qoder。 |
| 扩展仓 `plugins/opencode/__test__/host.test.ts` | `CONTEXT_HUB_CHECKOUT` 控制真实宿主 toolkit 集成测试；缺省明确 skipped，路径错误失败；文件端口显式传临时 `home/folder/userHome`，不触碰用户真实目录。 |
| 扩展仓 `package.json`、`pnpm-workspace.yaml`、`eslint.config.js`、`scripts/build-marketplace.mjs` | workspace 自动包含 `plugins/*`；根脚本 `lint/typecheck/test/build` 已存在；市场生成器读取 `plugin.yaml` 和 `package.json`，图标限制 `32 * 1024` bytes，支持 PNG。不手改生成索引。 |
| 宿主 `packages/resources/skills/src/provider.ts`、`src/extension.ts` | `SkillPlace` 使用 scope/dir；`readablePlaces` 根据已选 agent 过滤；shared 只提供 workspace `.agents/skills`，不能误称覆盖 Qoder 的专属目录。 |
| 宿主 `packages/resources/mcp/src/provider.ts`、`toolkit.ts`、`declaration.ts` | `McpPlace.installable` 区分新安装入口与扫描；`McpTools` 有 JSONC 局部编辑和 locate。通用 `readDeclaration` 会推断传输并过滤错误字段，Qoder provider 必须先验证当前原生条目，避免静默归一化。 |
| 宿主 `packages/resources/prompts/src/provider.ts`、`toolkit.ts`、`workspace-provider.ts` | `PromptProvider.held/install/remove`；`commandFile/withSection/withoutSection/slugOf` 从服务注入；项目根 `AGENTS.md` 已归 shared，不重复注册。 |
| 宿主 `packages/resources/plugins/src/provider.ts`、`contract.ts`、`host/describe.ts`、`host/installer-files.ts` | 已有 `registerManifests`、`pluginManifestPaths`、`PluginHeld.enabled?`、`homeEnv`、`directories` 和事务快照；本轮 `PluginInstallScope` 已在源码扩展为 user/project/local，尚未验证；`registerManifests` 只扩展收录/元数据，不自动构成安装器或完整组件解析器。 |
| 宿主 `packages/core/src/place-files.ts`、`packages/extensions/src/types.ts` | `PlaceRef` 只有 global/workspace；`ExtensionIcon` 可用 img 组件；target `supports` 仅有 skill/mcp/memory/hook/agent，没有 plugins 枚举。 |
| 宿主 `docs/memory.md`、`docs/research/agent-extensions.md`、同类计划 | 执行用户最新约束：产品开发可并行、不做旧版兼容、主 Agent 只调度。既有调研的 Qoder 安装根、Claude 互通和迁移历史仅是待核假设。 |

本任务最初计划只新增 `plugins/qoder/`；2026-11-03 协调后，Qoder Agent 还负责通用持久归属与安全复制过滤前置，并与共享文件作者协调。其他产品计划或研究文档仍不修改。

## 3. 官方证据与未知项

已使用 Context7 `/websites/qoder` 定位并直接阅读官方文档。下列资料描述当前网站，不等于某个已安装二进制版本的实测结果；本机 PATH 未找到 `qoder` 或 `qodercli`，不虚构版本号。

| 编号 | 官方来源与原文依据 | 可落地事实 |
| --- | --- | --- |
| S1 | https://docs.qoder.com/cli/Skills ：“User-level Skills override project-level Skills.” | 用户 `~/.qoder/skills/<name>/SKILL.md`、项目 `.qoder/skills/<name>/SKILL.md`；name/description 必填。 |
| S2 | https://docs.qoder.com/cli/mcp-reference ：“MCP servers are configured under the mcpServers field in settings.json” | 用户 `~/.qoder/settings.json#mcpServers`；项目 `.qoder/settings.json#mcpServers`、根 `.mcp.json#mcpServers`；local `.qoder/settings.local.json#mcpServers`。 |
| S3 | https://docs.qoder.com/cli/mcp-servers | `qoder mcp add` 的 project 目标为项目根 `.mcp.json`；user 写用户 settings；默认 scope 为 local。Hub 可主动选择项目共享入口，不跟随 CLI 的默认 local。 |
| S4 | https://docs.qoder.com/cli/settings 、https://docs.qoder.com/cli/config-scope | settings 支持注释；优先级 user→project→local→CLI；项目配置依赖目录信任。`QODER_CONFIG_DIR` 覆盖用户配置根，项目 `.qoder` 固定。 |
| S5 | https://docs.qoder.com/cli/memory ：“AGENTS.md is the default context file name” | 用户 `~/.qoder/AGENTS.md`；项目 `AGENTS.md`/`AGENTS.local.md`；两级 `.qoder/rules/**/*.md`。无加载 frontmatter 的规则默认 always active。 |
| S6 | https://docs.qoder.com/cli/commands | 两级 `.qoder/commands/*.md`；description 必填，调用名来自文件路径；命令同名 user 优先。 |
| S7 | https://docs.qoder.com/cli/subagent | 两级 `.qoder/agents/*.md`；name/description 必填，正文为系统提示词；project 来源优先于 user；不用命令的优先级规则类推 agents。 |
| S8 | https://docs.qoder.com/cli/plugins-reference ：“only name is required”“must not be placed in the plugin root directory” | 原生清单 `.qoder-plugin/plugin.json`，可省略按约定目录发现；允许 metadata 和显式组件声明；Hub 首版只声明清单收录，不宣称所有组件内容都可解析。 |
| S9 | https://docs.qoder.com/cli/plugins ：“Plugins can be installed at three scopes” | user/project/local 均可安装；相应 settings 的 `enabledPlugins`，local 为 settings.local.json；本地 ID 为 `name@local`；官方命令为 `qoder plugins`。 |
| S10 | https://docs.qoder.com/cli/plugins-reference | registry 属于 user level，project/local 记录带 `projectPath`；list 的 enabled 是当前 cwd 的 effective 状态，不是所有项目的文件值。 |

MCP 当前原生字段：stdio `command/args/env/cwd`，远程 `type/url/headers`；禁用字段 `disabled`。`type` 支持 stdio/sse/http/streamable-http/ws/sdk，其中本轮 Hub 仅能表达前三类及当前 http 同义类型。`qoder_url` 可覆盖其他传输字段，不能当作普通 URL 条目重写。保留 `timeout/description/trust/includeTools/excludeTools/alwaysAllow/oauth` 等未管理字段；不主动写信任、OAuth 或自动审批设置。

Qoder 插件 metadata 包括 `version/displayName/description/author/homepage/repository/license/keywords/dependencies`；组件声明包括 `commands/agents/skills/hooks/outputStyles/workflowsPath/workflowsPaths/mcpServers/settings`，当前 `settings` 仅支持 `agent`。插件内 `.mcp.json` 优先、`mcp.json` 是当前官方回退且不合并。这是产品事实，首版不会实现插件组件加载器或回退 parser。

以下是最初调研时未确认的项目；其中第一项已在 2026-11-03 静态检查官方 `@qoder-ai/qodercli@1.1.81` 发行包后部分确认，证据摘要见扩展 README 和第 5 节。其余仍未确认：

- registry `plugins/installed_plugins_v2.json` 的 v2 结构、本地 `cache/local/<name>/<version>`、缺版本 `local`、范围匹配及同 ID 最后一条记录移除后的缓存清理已在该版本的发行代码中确认；Hub 归属与可恢复事务不由客户端自动提供。
- 直接读取 `.claude-plugin/plugin.json`、Claude marketplace 路径或 Claude/Codex 插件格式互通。
- 用户 MCP 曾从 `mcp.json` 迁移到 `settings.json` 的版本边界；不得据此添加旧格式 parser 或迁移。
- CLI 三作用域协议对 Qoder Desktop/IDE 的精确磁盘兼容性。

## 4. 身份、文件清单与能力映射

- 扩展目录、manifest id、package name：`qoder`；provider/target id：`hub.target.qoder`；显示名：`Qoder CLI`。
- 初始版本 `0.1.0`；最终 `inject: [skills, prompts, mcp, plugins, targets, locales]`；permissions 沿既有文件扩展使用 `[assets.read, assets.write, filesystem]`，不申请 network。
- `supports: [skill, mcp, memory, agent]`。不声明独立 Hook 编辑能力，也不增加插件枚举。
- `package.json` 使用当前仓库已有的 build/test/typecheck 模式和依赖约束，不升级或新增生产依赖。`engines.contextHub` 以现有扩展范围作为本地开发基线，README 明示必需 `registerManifests` API 尚待实际宿主发布版本绑定，发布前修正最低兼容版，不能伪造已发布支持。
- `main`/exports 指向 `lib/index.js`；version/entry 不放入 `plugin.yaml`。

预计仅新增以下扩展文件：

```text
plugins/qoder/
  plugin.yaml
  package.json
  build.mjs
  tsconfig.json
  vitest.config.ts
  README.md
  assets/icon.png
  src/index.tsx
  src/contracts.ts
  src/locations.ts
  src/messages.ts
  src/assets.d.ts
  src/provider.ts
  src/prompts.ts
  __test__/helpers.ts
  __test__/registration.test.ts
  __test__/provider.test.ts
  __test__/prompts.test.ts
  __test__/host.test.ts
  lib/index.js                    # 构建产物，不手写
```

阶段一至四不创建 `installer.ts`、`plugin-state.ts` 或 registry fixture，也不注册用户看起来能点但必然失败的安装入口。阶段六在阶段五取得协议证据后，新增 `src/installer.ts`、`src/plugin-state.ts`、`__test__/installer.test.ts`；需要固定 fixture 时放 `__test__/fixtures/` 并逐条绑定官方证据。fixture 可在测试内生成，禁止凭相似客户端造 registry。

| 能力 | 用户级 | 工作区级 | 阶段一至四动作 |
| --- | --- | --- | --- |
| Skills | `.qoder/skills` | `.qoder/skills` | 两个 SkillPlace；按 scope 保留数量与读取选择。 |
| MCP 默认安装 | `.qoder/settings.json` | `.mcp.json` | 每个 scope 一个 installable 入口；read/install/uninstall/setEnabled/locate。 |
| MCP 其他当前来源 | — | `.qoder/settings.json`、`.qoder/settings.local.json` | `installable:false`，继续扫描、定位、修改已有条目、启停和移除；不生成重复安装菜单。 |
| Commands | `.qoder/commands/<slug>.md` | 同路径 | prompts commands；必填 description。 |
| Rules | `.qoder/rules/<slug>.md` | 同路径 | prompts rule；生成无触发 frontmatter 的 always-active Markdown，不新建规则触发编辑器。 |
| Agents | `.qoder/agents/<slug>.md` | 同路径 | prompts agent；name/description 与正文，不加工具、模型或权限字段。 |
| Instructions | `.qoder/AGENTS.md` | 根 `AGENTS.md` 归 shared | global instructions 使用 Hub 标记段；不单独写 AGENTS.local.md。 |
| 原生插件包 | Hub library 中 `.qoder-plugin/plugin.json` | 同一 Hub 库 | `registerManifests` 收录声明；不查询或修改 Qoder 客户端插件状态。 |

位置建议 id：skills/prompts 的 `qoder`、`qoder-global`；MCP 的 `qoder-global`、`qoder-project`、`qoder-project-settings`、`qoder-project-local`。scope、file、where、target locations 都从 `locations.ts` 同一份事实生成。各 provider 的 id 均与 target 一致。

## 5. 分阶段实施与验收

### 阶段一：建立扩展与位置注册

**目标**：建立可构建的 Qoder 包，只注册已完成的 Skills、target、locale；后续阶段逐项增加真实 provider，不放空实现占位。

**文件与动作**：创建 package/build/tsconfig/vitest/manifest，`src/contracts.ts` 只镜像实际使用服务；创建 `locations.ts`、`messages.ts`、`index.tsx`；两级 `.qoder/skills` 使用现有 SkillPlace 模式。以现有 `plugins/zcode/build.mjs` 的绝对 package 根构建方式组织脚本。复制第 6 节选定的 PNG 为 `assets/icon.png`，在 esbuild 配置 `.png` 为 `dataurl`，`src/assets.d.ts` 声明字符串 import；icon 组件使用 img 并透传 className/aria-hidden、保留必要可访问名称，不重绘图案。

**验收**：新增注册测试断言 provider/target id、两个 scope/dir/order、target supports、locale 键对齐、图标原始 hash；真实 `readablePlaces` 对未选 agent 的过滤在阶段七的宿主集成测试覆盖。运行 `pnpm --filter qoder typecheck`、`pnpm --filter qoder test`、`pnpm --filter qoder build`。bundle 除 React runtime 外无宿主包或新增运行依赖 import；构建产物图标可离线使用。

### 阶段二：实现当前 MCP 文件读写

**目标**：管理四个已证实的物理文件，只把用户 settings 与项目根 .mcp.json 提供为新安装目标，报告对应文件状态。

**文件与动作**：新增 `src/provider.ts`，补充 contracts/messages/index/README 和 `__test__/provider.test.ts`。复用 `McpTools.editJson/readJsonObject/parseJsonc/jsonValueLines/readDeclaration/writeDeclaration/McpError`，路径固定 `['mcpServers', name]`。settings 按官方支持使用 JSONC；新建 `.mcp.json` 写严格 JSON，现有 `.mcp.json` 未经官方证实的注释/非标准 JSON 不作支持承诺，验证失败时保持原字节。

- 文件缺失时列表为空，安装可创建；坏 JSON、非对象根、错误 mcpServers 类型和错误目标条目不得当空对象覆盖。
- 先验证类型：command 非空、args 为字符串数组、env/headers 为字符串映射；stdio 允许省略 type，远程要求当前明确的 sse/http/streamable-http。写入用 stdio/sse/http 原生形状，不用通用 parser 推断另一协议。
- ws/sdk、含 qoder_url 的托管 Gateway、矛盾传输或错误字段类型显示 `declaration:null`，本轮不改写其条目；不创建旧字段别名或迁移分支。
- 重装保留现有 `disabled` 和非管理字段；停用写 `disabled:true`、启用写 `disabled:false`；坏 disabled 类型先拒绝。修改只落在当前 file，保留同文件 hooks/enabledPlugins/permissions、其他 server 及注释。
- 不设置项目自动审批、目录信任或 OAuth，不把“存在于文件”写成“当前已连接”。`locate` 返回本文件节点行号；`installable:false` 位置仍可操作已有声明。

**验收**：覆盖四物理文件、默认安装入口数量、stdio/http/sse/streamable-http、disabled true/false/缺省、重装保留关闭态和未知字段、相邻节点不变、异常类型/不支持传输拒写、locate、作用域不串写。执行 package typecheck/test/build。菜单依赖现有通用 installable 过滤，不改宿主 UI。

### 阶段三：实现提示词与用户指令

**目标**：两级 commands/rules/agents 和用户 AGENTS.md 可安装/查询/移除，避免覆盖手写同名文件。

**文件与动作**：新增 `src/prompts.ts`，补充 contracts/messages/index/README 和 `__test__/prompts.test.ts`。workspace forms 为 commands/rule/agent；global 另有 instructions。复用 `slugOf/commandFile/describeBody/withSection/withoutSection`，不增加嵌套路径、模型/工具选项或触发条件 UI。

commands/agents 的 name 采用生成文件 slug，description 从 prompt.description、正文摘要、名称顺序得到非空值；不得省略官方要求的 description。rules 使用普通 Markdown，对应当前默认 always-active 语义。每个独立文件有 Hub ownership 标记；非本 prompt 的现有文件拒绝覆盖/删除，重复安装幂等。用户指令只更新自身完整标记段，坏标记拒绝修改；移除仅删除自身区块，清空后才能删文件。未知 place/form/option 在写前拒绝。项目 AGENTS.md、AGENTS.local.md 和自动 memory 不另注册。

**验收**：测试两级三种独立文件、global 指令段、中文/特殊名称经宿主 slug 的确定结果、description 兜底、手写冲突、重复安装/移除、坏标记、不相关正文保留、非法调用零写入。测试确认没有 workspace instructions form。执行 package typecheck/test/build。

### 阶段四：声明原生清单与发布边界

**目标**：让原生 Qoder 清单可被 Hub 库识别，并准确呈现未实现的客户端插件管理边界。

**文件与动作**：在 `src/index.tsx` 调用 `ctx.plugins.registerManifests(['.qoder-plugin/plugin.json'])`，更新最终 inject、contracts、registration/host 测试和 README。缺少必需宿主方法时报告明确兼容错误，不生成其他清单绕过。**不调用 `ctx.plugins.register`，不使用 tools.run/has，不创建 CLI 回退。**

制作仅带 `.qoder-plugin/plugin.json`、自定义组件路径的最小 fixture，证明收录依赖 manifest 声明而不是标准目录偶然命中。宿主当前只读取通用 name/version/description，不为 displayName/组件自定义路径虚构完整解析支持；原包字节不转换。不改变全局 PLUGIN_MANIFESTS，也不让 Qoder 适配器宣称全局 Claude/Codex 收录回退是自己的兼容能力。

README 写清当前 CLI 证据日期、默认根、四个 MCP 文件与两个安装入口、项目审批、各资产同名优先级由客户端决定；“插件清单可收录”和“不能管理 Qoder 已装插件”分开说明。列出第 3 节未知项，不写 ~/.qoder/plugins 为确定路径。记录图标来源/摘要/版权和开发版宿主 API 限制。

**验收**：注册测试断言六服务与最终 supports，插件安装器注册次数为 0；原生清单 fixture 收录得到 name/version/description，卸载扩展后贡献回卷。README 和 target 不承诺插件安装、Qoder IDE 路径或自定义配置根。执行 package typecheck/test/build。

### 阶段五：补全原生安装记录证据

**目标**：主动推动原生插件完整能力，区分足以实现的已知协议与缺失写入契约。此阶段可以与阶段二至四并行；不以真机或额外隔离环境作为前置。

**文件与动作**：只在 Qoder 的 README、locations 和测试输入说明中固化取得的证据，不提前创建猜测 parser。优先查询第 3 节当前官方文档及其链接的公开 schema、官方源码或公开发行说明；记录 URL、版本/commit、原文或字段声明。若官方资料继续缺失，具体列出下表未知项，保持原生文件安装待证据；不是把原生插件从目标移除。

| 层次 | 当前已证实 | 实现前还必须确定 |
| --- | --- | --- |
| 包入口 | `.qoder-plugin/plugin.json`；name 必填、约定组件及显式路径可用 | manifest dependencies 数组元素的当前形状、无版本包的实际处理；不把其他客户端默认版本写进 Qoder。 |
| 库存归属 | 1.1.81 发行包证实 `plugins/installed_plugins_v2.json`、version 2、ID 到记录数组、scope 与 projectPath 唯一键 | 将协议固化为绑定版本的 fixture；区分 Hub 自有记录和已有第三方记录，不向原生 registry 增加 Hub 字段。 |
| 安装载荷 | 1.1.81 本地安装复制至 `cache/local/<name>/<version>`，缺版本用 `local`，并过滤顶层敏感文件 | 实现受控过滤、源/目标快照与相同版本内容冲突保护；按实际引用保守保留共享载荷。 |
| 启用状态 | 对应 settings 的 enabledPlugins，ID 精确匹配；user→project→local 深合并 | 新安装缺省开关、卸载删 key 或写 false 的语义、缺记录但有声明的加载规则、依赖拒绝条件。 |
| 移除与数据 | 官方 uninstall 有 `--keep-data` | data 目录、默认删除行为、共享 cache 引用与其他项目开关如何处理；Hub 选择保留 data 也必须有可证明路径。 |
| 市场 | 当前文档描述 marketplace.json 与 `name@marketplace` | 目录入口/登记文件/schema；没有证据时先实现已证实的本地包路径，不强行沿用 Claude marketplace。 |
| 项目身份 | project/local 为当前项目，list.enabled 是当前 cwd 有效值 | projectPath 的规范化/匹配规则；不要因主 registry 列出其他项目就允许在当前项目卸载它们。 |

**2026-11-03 协调更新**：静态发行代码证实本地载荷复制会过滤顶层 `.git`、`node_modules`、`.env` 和 `.env.*`；Hub 保留此安全边界，不复制敏感文件，其他隐藏文件和执行位保持。对嵌套 `.env`、`.env.*`，在任何写入前明确拒绝并说明文件路径，避免复制潜在凭据，不静默删除；用户处理后可重试。共享宿主新增与客户端无关的事务化持久归属记录和可声明过滤；该工作由 Qoder Agent 与 Qwen Agent 直接协调共享事务文件。已有同名条目若不能证明由 Hub 所有则拒绝覆盖；过滤后源、目标与记录均须纳入并发和失败回滚测试。

**2026-11-03 Windows ACL 限制**：Node 官方文档说明 Windows 的 `fs.open` mode/`chmod` 不提供 DACL 控制；现有宿主临时文件 `fs.rename` 不能据此证明保留目标 ACL。Microsoft `ReplaceFileW` 可保留原文件 DACL，但不得忽略合并错误，且错误 1176/1177 时目标可能改名或消失，需同卷备份、临时文件写入前的安全 DACL、加密属性及恢复处理。仓库现无 Win32 FFI，且用户已要求停止验证；不猜测实现，Windows 已存在 settings 的修改保持拒绝。源码依据：[ReplaceFileW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew)、[Node fs](https://nodejs.org/docs/latest-v24.x/api/fs.html)。

可能的通用宿主依赖及责任：

1. **已具备，不重建**：`PluginDiskDeclaration.homeEnv`、多段 state、directories、读写白名单、源/目标快照、补偿提交和原生 manifest 声明。证据确认后以数据声明具体目录，不向宿主加入 Qoder 名称或路径。
2. **local scope 公共前置**：`PluginInstallScope` 源码已加入 local；详情位置按物理 scope 分行，市场与状态文案区分 project/local，卸载按精确 scope 取身份。该改动保留 Qwen policy-only 过滤及 Kiro 的 MCP 路径显示；依据用户最新要求尚未验证。
3. **无需 switch-only 前置**：Qoder 官方 project 也能 install，不增加 PluginPlace.installable 作为伪前置。
4. **2026-11-03 已确认的公共前置**：客户端 native ID 不能证明 Hub 归属；复用现有受声明白名单约束的 Hub 资产库文件事务，在保留隐藏目录记录持久归属，增加带声明过滤的目录复制能力，并把两者纳入现有事务和快照。先与共享文件作者协调，再改宿主，不引入产品特判。
5. 普通资产环境根仍是独立通用议题，不拖住默认根资产，也不影响已有插件 `homeEnv` 的使用。

**验收**：每个准备写入的原生文件都有官方路径、schema、身份、默认值、移除语义与证据出处；未知项明确保持未实现。取得足够证据则形成只覆盖当前协议的最小 fixture 和精确文件声明，进入阶段六；否则记录具体尚缺哪个写入契约，阶段五/六不得标完成，但允许先交付阶段一至四并完成其阶段七检查。不要求先跑 CLI 探针，不把没有真机当阻断理由。

### 阶段六：实现原生插件生命周期

**目标**：在可靠当前协议与所需公共契约具备时，完成 Qoder 原生库存、安装、启停、卸载的文件实现。依赖阶段五的协议证据，不依赖真实客户端实测。三作用域安装器与 journal recipe 已注册；共享 journal 的 before===after 只读 guard 与复制过滤已交付。用户要求停止测试，因此本轮源码未验证。

**文件与动作**：新增 `src/installer.ts`、`src/plugin-state.ts`、`__test__/installer.test.ts`，更新 `locations.ts/contracts.ts/index.tsx/messages.ts/README.md` 与 host 测试；只读参考 Claude/ZCode 对宿主端口的调用模式，不复用其 registry parser。安装器 id 与 target 一致，已实现的 user/project/local place 才注册；其他产品与宿主源码由协调任务负责。

- held 严格读取当前 schema，绑定真实 ID/source/projectPath；不把其他项目记录当当前项目库存，不把开关声明当已安装包。switches 只返回各物理 settings 的显式布尔，effective 状态按已证实继承链计算；不能确定时用 undefined，第三方或不具备管理证据的记录只读。
- install 只接受原生 `.qoder-plugin/plugin.json` 且库名/name 一致；依官方 1.1.81 的安全边界过滤包顶层 `.git`、`node_modules`、`.env`、`.env.*`，保留其余隐藏文件、资源和执行位；被投递部分的符号链接拒绝而不跟随。过滤后的源载荷与目标各自参与事务快照校验，不读取或复制被排除的敏感 `.env`。缺版本、同版本不同内容、依赖和 user config 等处理全部以当前实际协议为准；未满足依赖/凭证在任何写入前明确拒绝，不自动下载或运行脚本。
- setEnabled 只改目标 scope 的 `enabledPlugins[完整ID]`，保留 hooks/MCP/权限/其他开关；重装保留用户显式 false。不得为了达到“开启”偷偷修改更高优先级文件。project/local 覆盖 user，报告文件配置与有效状态的区别。Qoder 安装器已编码该行为但尚未注册。
- remove 只移除目标安装身份及本次拥有的记录/开关；保留 data/options/秘密和其他项目声明，依据真实共享引用规则决定是否可移除载荷。不凭缺乏证据的路径删 cache，不把项目卸载变成删除其他作用域库存。
- 源目录、目标载荷、registry 与 settings 的 before/sourceSnapshot 在现有 disk.run/commit 中校验；写前有变化则拒绝；注入任一写失败后保持原字节或明确报告恢复材料。不要向原生 registry 添加未经证实可扩展的 Hub 字段；ownership/持久快照必须使用已有可靠记录机制或另交通用宿主议题。
- 安装器测试把 tools.run/has 设为抛错，证明没有 CLI 写入回退；不增加历史 schema parser、Claude 清单转换或 guessed 默认开关。

**验收**：用绑定官方证据的 fixture 完成 user/project 的 install→held/switches→disable/enable→remove 全链；公共 local 契约具备时同样覆盖 local，不具备时只报告其待办，不能声称全量完成。覆盖两项目同 ID 的归属、覆盖链、未知格式零写入、第三方只读、依赖拒绝、源/目标/config 并发变化、目录链接拒绝与每个事务故障点。运行 Qoder package typecheck/test/build；阶段七用真实宿主文件端口重跑相关回归。新会话是否实际加载由用户后续调试，不能以没有运行客户端否定离线实现，也不能将离线通过表述为运行时已加载。

### 阶段七：验证集成并清理交付

**目标**：用现有工具链验证实际改动，提交清晰结果给主 Agent；保持其他并行产品目录和公共文件不变。

**文件与动作**：完成 `__test__/host.test.ts`，参照 OpenCode 现有模式调用真实 `mcpTools/promptTools/createFsPlaceFiles`；已提供 `CONTEXT_HUB_CHECKOUT` 时额外覆盖真实 manifest 收录与作用域筛选。测试输入使用内存或临时文件根，不启动客户端、MCP 服务或浏览器，不读取真实 ~/.qoder。缺少额外宿主运行条件时，测试明确 skipped 并报告，不把“隔离环境/真实客户端不可用”作为开发阻断。

阶段六已实现时，host 测试还必须通过真实 `PluginDisk` 文件端口验证对应生命周期、源/目标快照与补偿；显式提供临时 userHome/workspace/library 和受控 `env:{}`，不得继承真实 QODER_CONFIG_DIR。阶段六仍待证据时，这组测试与能力标记为未实现，报告为阶段一至四的部分交付，不把 registry 未知包装成全量通过。

在扩展仓执行已存在或阶段一按既有模式建立的脚本：

```sh
pnpm --filter qoder typecheck
pnpm --filter qoder test
pnpm --filter qoder build
CONTEXT_HUB_CHECKOUT=D:/work-space/dsh-context-hub pnpm --filter qoder test __test__/host.test.ts
pnpm lint
```

root `pnpm lint` 检查全部 plugins；如发现他人并行代码错误，只报告归属，不顺手修改。扩展根 `pnpm typecheck`、`pnpm test`、`pnpm build`（包含市场生成）由主 Agent 协调集成任务统一执行，避免并发改写 `marketplace.json`。不为减少检查增加第二套验证脚本或生产依赖。依赖缺失仅报告现有命令与原因，不在未经授权的本计划阶段安装。

**验收**：Qoder 自有检查通过；真实宿主源码测试已运行或明确记录未运行原因；清理本任务产生的无用 import/fixture/临时文件，检查 diff 只含自己的包与应由协调任务生成的结果；不提交或创建分支。报告改动文件、通过/跳过/失败检查、未验证的客户端行为。真实 GUI、运行时组件加载和独立人工验收留给用户后续调试，不设置为本轮完成门槛。

## 6. 已下载的官方图标

官方入口 https://qoder.com/ 的 HTML 同时声明 `rel="icon" type="image/svg+xml" href="/favIcon.svg"`，以及下表 PNG favicon。两个文件均先下载至各自新建的空临时目录，再按原始字节以独占创建写入研究目录；没有覆盖已有文件、压缩、改色或重绘。

| 文件 | 官方资源 URL | 原格式与尺寸 | 大小 | SHA-256 |
| --- | --- | --- | --- | --- |
| `D:/work-space/dsh-context-hub/docs/research/agent-icons/qoder.svg` | https://qoder.com/favIcon.svg | SVG，viewBox 0 0 206 206 | 73,379 bytes | `5e1843cb50c4613855024453e76d5c06d2ca5562efebc12b4fcd80cf9ece1dd0` |
| `D:/work-space/dsh-context-hub/docs/research/agent-icons/qoder.png` | https://img.alicdn.com/imgextra/i4/O1CN01QkSxiCocd3D0prc8_!!6000000008124-2-tps-412-412.png | PNG，412 × 412 | 4,990 bytes | `2276f0f8e6240959e70b83ebc48ec1dac1c0180e24528794f9a52b7386026f3d` |

**实施输入固定选 PNG**，原样复制为 `plugins/qoder/assets/icon.png`。理由是现有市场 `ICON_LIMIT=32 KiB`，原始 SVG 超限，PNG 未超限；不修改市场上限，不改原图。SVG 只保留官方原始研究材料。已检查 PNG 文件签名、尺寸并打开确认图案；SVG 根元素为 svg，未发现 script/foreignObject，不执行其内容。

构建 `.png` dataurl loader 依据 Context7 `/evanw/esbuild` 及官方文档 https://esbuild.github.io/content-types/#data-url ：导入图片生成默认导出的 data URL 字符串；不引入图标运行时服务或网络请求。

版权：官网页脚标示 © 2026 BRIGHT ZENITH PRIVATE LIMITED。https://qoder.com/product-service 的 4.1 保留 Services 及相关知识产权，原文“All rights not expressly granted to you under these Terms are reserved by us.”；当前没有找到独立品牌素材再分发许可。下载自官网不等于获得商标或再分发授权，README 必须标注来源和权利归属，不暗示官方背书；公开发布前另核使用依据，不虚称 MIT 授权。

## 7. 后续验证命令与不确定性

以下客户端命令是用户后续可选的观察入口，**不作为七个阶段的真机前置条件**。阶段五优先从当前官方文档、公开 schema 或官方源码补全协议；仅在这些资料不足且用户另行选择实测时使用命令观察。本次未安装/运行客户端，不从列表可见推断组件加载。

只读查询：

```sh
qoder --version
qoder plugins --help
qoder plugins list --json
qoder mcp --help
qoder mcp list
```

若以后专门调查 registry，应使用用户选定的可弃置配置根、项目和只含声明资源的 fixture，并显式设置 `QODER_CONFIG_DIR`，分别执行当前官方命令：

```sh
QODER_CONFIG_DIR="$probe_config" qoder plugins install "$fixture" --scope user
QODER_CONFIG_DIR="$probe_config" qoder plugins install "$fixture" --scope project
QODER_CONFIG_DIR="$probe_config" qoder plugins install "$fixture" --scope local
QODER_CONFIG_DIR="$probe_config" qoder plugins list --json
QODER_CONFIG_DIR="$probe_config" qoder plugins list --plugin-dir "$native_fixture" "$claude_only_fixture" --json
```

project/local 命令的 cwd 必须是上述专用项目。比较安装前后文件树、开关与卸载，再独立观察 skills/commands/agents 的发现；CLI 列表不足以证明运行时加载。变量是调用者提供的绝对路径，不能指向真实用户目录；具体 enable/disable/uninstall 参数先按该版本 `--help` 确认。不因探针产生近似目录就推断稳定写 API，也不把 Claude-only fixture 的目录名回退误认为已读取其 metadata。迁移历史只能由对应版本官方 release notes 或官方源码证明，不能靠现版本行为反推。

## 8. 不做与自审

不做旧版兼容、mcp.json 迁移、跨客户端清单转换、猜测 registry、CLI 安装回退、插件依赖下载、自动授权/OAuth、自动 Memory、Hook/输出样式/工作流编辑器、规则触发配置界面、Qoder Desktop/IDE/CN 混合支持、普通资产自定义环境根或其他产品重构。通用 local scope 如由独立协调任务完成则直接复用，不从目标静默删除。不改真实客户端、根锁文件/生成索引，不安装依赖、不启动服务、不提交 Git。

自审已修正：

1. 将“六注入点”与“插件管理完成”分开：阶段一至四先交付 manifest 收录，阶段五、六保留原生插件完整生命周期目标、证据补全和实施步骤；不因复杂或未真机验证删掉目标，可靠写入协议缺失时也不猜写。
2. 删除旧调研的确定安装根、Claude 兼容、迁移历史与 qodercli 命令假设，所有未知项都给官方查询/后续观察入口。
3. 使用当前宿主已落地的 registerManifests 和 MCP installable，不重提已解决的目录模板前置，不为 Qoder 增宿主特判。
4. 补齐调用方、contracts、locale、fixture、图标、构建 loader、类型声明、注册与真实宿主测试；各阶段均可独立构建验证。
5. 发现原始 SVG 超过市场 32 KiB 限制后，保留原件并选官网同时声明的 4,990-byte PNG，不重绘或扩大限制。
6. 逐项核对命令来自真实 package 脚本，根市场构建交协调任务串行处理；真实客户端、额外隔离环境和未发布宿主不是开发阻断，未验证项如实报告。

本计划及图标等待用户审批实施；本次不执行上述七阶段。
