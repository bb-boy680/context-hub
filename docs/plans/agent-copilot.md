# 接入 GitHub Copilot 扩展（CLI 与 VS Code）

状态：待审批；本次仅调研、下载官方图标和编写计划，尚未实现。核对日期：2026-11-03。本版已按反馈收敛：单 target、只支持 Agent Plugins 1.1.0、声明式 live-load 为唯一安装路径、`PluginHeld.enabled` 未知态为宿主前置、CLI 验收改为用户手动步骤。

实施仓库：`D:/work-space/context-hub-extensions`；宿主契约仓库：`D:/work-space/dsh-context-hub`。

## 背景与结论

现有扩展 `plugins/claude.code/src/index.tsx:apply` 和 `plugins/codex/src/index.tsx:apply` 都通过 `skills`、`mcp`、`prompts`、`plugins`、`targets`、`locales` 注册能力。它们没有导入宿主包；JSONC/TOML 编辑和提示词文本工具从服务取得。新扩展沿用这条边界。

Copilot 有三种需要区分的消费端：Copilot CLI、VS Code 的 Copilot harness、VS Code 的 Local harness。当前官方文档已经说明：

- CLI 与 VS Code Copilot harness 共用大量 `.github/` 与 `~/.copilot/` 资产；VS Code 能发现 CLI 的 `installed-plugins`。
- `.github/prompts/*.prompt.md` 只在 VS Code Local harness 执行；CLI 和 VS Code Copilot harness 的可复用工作流应使用 skills。
- CLI 的 MCP 是 `mcpServers`；VS Code Local 的 `.vscode/mcp.json` 是 `servers`。当前 VS Code Copilot harness 也直接读取便携的 `.mcp.json` 和 `~/.copilot/mcp-config.json`，并有条件转发 Local MCP 配置。
- 插件包只支持 Agent Plugins 1.1.0 canonical `$schema`；当前仍为 Working Draft。客户端能读取其它格式不构成本扩展的交付范围；1.0 和 legacy 输入均明确拒绝。

**target 决策：一个扩展 `plugins/copilot/`、一个 target `hub.target.copilot`，显示名 `GitHub Copilot`。** 用具体 place 的标签、路径和 forms 区分 `Copilot` 与 `VS Code Local`。两个 target 会把 `.github/skills`、`.github/agents` 等同一物理位置注册两遍，还会让侧栏选择看似隔离实际共享的文件。首版不做两个重复 provider，也不改变宿主选择模型。若将来必须拆成双 target，选择器必须显示两行不同名字（如 `Copilot CLI` 与 `VS Code Copilot`）并在副标题写明共享/独立位置；本计划不实施该方案。

单 target 不代表两套客户端状态相同：Plugins 页首版管理 **Copilot CLI 的持久安装与启停**；VS Code 对这些包的发现是另一条验收。VS Code 自己安装的 profile 插件及其 enablement storage 不伪装成 CLI 状态。

## 已核实的真实契约与缺口

| 文件 / 符号 | 当前能力与实施约束 |
| --- | --- |
| 宿主 `packages/extensions/src/types.ts:AgentTargetDescriptor` | `supports` 只有 `skill/mcp/memory/hook/agent`，没有 `prompt/plugin`；本扩展声明 `skill/mcp/memory/agent`。插件包可带 hooks，但首版没有独立 hook 编辑器，不增加伪能力枚举。 |
| `packages/resources/skills/src/provider.ts:SkillPlace/readablePlaces` | 一个 place 是一个 `scope + dir`；两个作用域都受所选 target 过滤。没有 read-only 或文件根环境变量字段。 |
| `packages/resources/skills/src/extension.ts:SHARED_PLACE` | 宿主只注册了 **工作区** `.agents/skills`；没有全局 `~/.agents/skills` 的 shared place。不能把全局路径也误称成已被宿主注册。 |
| `packages/resources/mcp/src/provider.ts:McpProvider` | 每次调用只操作指定文件；`switchable` 可为 false；`locate` 返回 `[start, end]`。复用 `ctx.mcp.tools` JSONC 编辑器，保留无关字段。 |
| `packages/resources/prompts/src/provider.ts:PromptProvider` | methods 为 `held/install/remove`，forms 自定义；`held` key 为 form 或 `form:option`。不需要给宿主写 Copilot 分支。 |
| `packages/core/src/place-files.ts:PlaceFiles` | 全局路径相对真实/注入的 `userHome`，工作区相对所选目录。普通资产通道不解析 `COPILOT_HOME`，也不识别 VS Code profiles。 |
| `packages/resources/plugins/src/provider.ts:PluginDisk` | 有声明式 roots、读取、目录列举、快照提交、目录复制/删除；可通过 `homeEnv` 支持 `COPILOT_HOME`，缺少文件通道的旧宿主应报不兼容，不回退 CLI。v1 只读取 settings/市场、写 settings 与市场索引，不复制目录。 |
| `packages/resources/plugins/src/provider.ts:PluginHeld` | `enabled` 现为必填 `boolean`。Copilot 的 CLI 安装记录可能与 settings 声明分离，未知时不能猜；需通用改为 `enabled?: boolean` 并让 UI 显示未知。 |
| `packages/resources/plugins/src/host/installer-files.ts:commit` | `copy.destination` 只允许 `cache/<market>/<name>/<version>`，`removeDirectory` 只允许 `cache/...`。它只影响“复制安装”方案；v1 不复制，因此不改这条路径。 |
| `packages/resources/plugins/src/host/installer-files.ts:treeHash` | copy 前后校验 source 与 staged 的 tree hash。若将来复制安装，不能在复制后往树内写生成清单；v1 无 copy，清单只写在 Hub 库根或客户端 settings。 |
| `packages/resources/plugins/src/contract.ts:PLUGIN_MANIFESTS` | 目前只有 `.claude-plugin/plugin.json`、`plugin.json`、`.codex-plugin/plugin.json`。标准根 manifest 已可收录，本扩展只选择这一入口。 |
| `packages/resources/plugins/src/host/contents.ts` | MCP 预览目前只读 `.mcp.json`。标准 `mcp.json` 会随包完整保留，但当前详情页不完整展示；不能把“没有预览”说成“包没有 MCP”。 |

已阅读两套现有插件的 `src/`、测试、manifest、package、build、tsconfig、vitest config 和 README。扩展仓库未发现额外 AGENTS/CLAUDE 说明。相关经验来自 `docs/memory.md`：文件安装必须覆盖装/停/卸与组件加载、状态不能用 Hub 投递账替代、数量按位置统计、测试三个根都用临时目录、宿主不认识具体 Agent。

## 资产面与首版落点

### Skills

| 官方读取路径 | 作用域 / 消费端 | 首版交付 | 与共享位置关系 |
| --- | --- | --- | --- |
| `.github/skills/<name>/SKILL.md` | workspace；CLI、VS Code | 注册 `copilot-skills` | 不重复 |
| `~/.copilot/skills/<name>/SKILL.md` | global；CLI、VS Code | 注册 `copilot-skills-global` | 不重复 |
| `.agents/skills/<name>/SKILL.md` | workspace；CLI、VS Code | 复用宿主 `workspace` place | 不再注册；否则计数与卸载入口重复 |
| `~/.agents/skills/<name>/SKILL.md` | global；CLI、VS Code | 记录兼容读取，不新增交付入口 | 当前宿主没有 shared global；添加它是跨 Agent 功能，留给单独任务 |
| `.claude/skills/<name>/SKILL.md` | workspace；CLI、VS Code | 记录兼容读取，不注册 | 已可能由 `claude.code` 提供；避免同目录换标再计一次 |
| `~/.claude/skills/<name>/SKILL.md` | global；VS Code 文档列出 | 仅描述 VS Code 兼容性 | CLI 的当前优先级表未列此路径，不外推 |

首版 Skills 位置数为 2。兼容路径不会因为选中 Copilot 就自动变为可扫描入口；README 写清“客户端能读”与“Hub 提供交付入口”的差别。已有共享位置仍可使用。

### MCP

| place id / 标签 | 文件 / root key | 作用域 | 首版处理 |
| --- | --- | --- | --- |
| `copilot-mcp-global` / Copilot | `~/.copilot/mcp-config.json` / `mcpServers` | global | CLI 与 VS Code Copilot 共用；标准 stdio/http/sse |
| `copilot-mcp` / Copilot | `.mcp.json` / `mcpServers` | workspace | 便携首选；VS Code Copilot workspace-root 支持有实验设置门槛，不能替用户开启 |
| `copilot-mcp-github` / Copilot CLI | `.github/mcp.json` / `mcpServers` | workspace | CLI 的共享仓库路径；与 `.mcp.json` 同级时后者优先 |
| `copilot-mcp-vscode` / VS Code Local | `.vscode/mcp.json` / `servers` | workspace | JSONC；写显式 `type`，保留 `inputs`、`sandbox` 和无关服务 |

- CLI 的项目配置仅在可信目录生效；子目录到仓库根有覆盖链。provider 报告自己文件的内容，不能假称已经解析整个仓库继承链。
- CLI 文件只读写 `mcpServers` envelope，Local 只读写 `servers` envelope；缺文件可新建，非空 bare map 拒绝且原字节不变，不迁移。
- 新 CLI stdio 使用 `type: "stdio"`（官方支持），远程使用 `http/sse`；旧 `type:local` 只报告不支持，目标条目拒写。已有 `tools`、`timeout`、`cwd` 等 Hub 的 `McpDeclaration` 尚不能编辑的字段必须保留。VS Code 的 `inputs/envFile/oauth/dev/sandbox` 同样保留；无法无损理解的条目应报告 `declaration: null`，不假装已经完整转换。
- 首版 MCP places 均 `switchable: false`，由客户端管理启停。CLI 确实有 `disabledMcpServers`，但它是 user/repository/local 的并集合并，且有 managed 层；本次不实现一个会“显示启用但仍被上层禁用”的局部开关。这不影响 MCP 安装/卸载，也不影响下文插件包的启停实现。
- VS Code 用户 profile `mcp.json` 没有单一跨平台 HOME 相对落点，首版不自动选择 profile，不写 `AppData`、`Library/Application Support` 等猜测路径。

### Prompts、memory/instructions、agents

`createCopilotPrompts` 提供以下 forms，**一次动作只写所选一种形式**，不同时写 prompt 和常驻指令。

| place / form | 路径 | 行为 / 消费端 |
| --- | --- | --- |
| `copilot-prompts` / `instructions` | `.github/copilot-instructions.md` | workspace；CLI、VS Code；`withSection/withoutSection` 幂等增删 Hub 标记块，保留手写正文 |
| `copilot-prompts` / `rule` | `.github/instructions/<slug>.instructions.md` | workspace；带 `description` 和 `applyTo: "**"`，当前 Prompt 无 glob 字段，固定为整个项目的规则；菜单标明“项目规则” |
| `copilot-prompts` / `agent` | `.github/agents/<slug>.agent.md` | workspace；YAML `name/description` + Markdown，不虚构 tools/model；不写 `target`，使用双方默认支持 |
| `copilot-prompts-global` / `instructions` | `~/.copilot/copilot-instructions.md` | global；CLI、VS Code Copilot harness；标记块 |
| `copilot-prompts-global` / `rule` | `~/.copilot/instructions/<slug>.instructions.md` | global；CLI、VS Code Copilot harness；规则语义同上 |
| `copilot-prompts-global` / `agent` | `~/.copilot/agents/<slug>.agent.md` | global；CLI、VS Code Copilot harness |
| `copilot-prompts-vscode` / `commands` | `.github/prompts/<slug>.prompt.md` | workspace；明确标为 VS Code Local；`commandFile` 生成可选 `name/description` frontmatter |

首版不把 prompt 自动转 skill：Skills 页已有完整技能交付能力；这个转换会引入新的生成资产语义。项目 `AGENTS.md` 继续由宿主共享表单负责。自动记忆数据库、会话状态、GitHub 网站个人指令和 cloud agent secrets 均不属于这些 Markdown forms。

所有 `<slug>` 用宿主 `slugOf`；独立生成文件用正文中的 Hub ownership marker 防止覆盖或删除手写同名文件。`description` 对 agent 必填，依次取 prompt.description、`describeBody`、name。新建规则文件可复用 `commandFile` 的 frontmatter，补固定 `applyTo`；不添加 YAML 依赖。held/remove 以 marker 为准，取消安装只删自己的内容。

### 每个 place 支持的资产（v1 矩阵）

`✓` = Hub 提供交付入口；`读` = 客户端能读但 Hub 不新增入口；`—` = 该消费端不消费此文件。矩阵按当前官方文档与上表落点，不把“能用某个入口”外推到全部 harness。

| 资产 / 路径 | Copilot CLI | VS Code Copilot harness | VS Code Local harness | Hub place |
| --- | --- | --- | --- | --- |
| `.github/skills/<name>/SKILL.md` | ✓ | ✓ | ✓ | `copilot-skills` |
| `~/.copilot/skills/<name>/SKILL.md` | ✓ | ✓ | —（Local 用 profile） | `copilot-skills-global` |
| `.agents/skills/<name>/SKILL.md` | 读 | 读 | 读 | 宿主 shared `workspace` |
| `.github/copilot-instructions.md` | ✓ | ✓ | ✓ | `copilot-prompts` / instructions |
| `.github/instructions/*.instructions.md` | ✓ | ✓ | ✓ | `copilot-prompts` / rule |
| `.github/agents/*.agent.md` | ✓ | ✓ | ✓ | `copilot-prompts` / agent |
| `~/.copilot/copilot-instructions.md` | ✓ | ✓ | —（profile） | `copilot-prompts-global` / instructions |
| `~/.copilot/instructions/*.instructions.md` | ✓ | ✓ | —（profile） | `copilot-prompts-global` / rule |
| `~/.copilot/agents/*.agent.md` | ✓ | ✓ | —（profile） | `copilot-prompts-global` / agent |
| `.github/prompts/*.prompt.md` | — | — | ✓ | `copilot-prompts-vscode` / commands |
| `~/.copilot/mcp-config.json` | ✓ | ✓ | —（profile `mcp.json`） | `copilot-mcp-global` |
| `.mcp.json` | ✓ | ✓（实验设置门槛） | — | `copilot-mcp` |
| `.github/mcp.json` | ✓ | —（未列为 Copilot harness 入口） | — | `copilot-mcp-github` |
| `.vscode/mcp.json` | —（明确不读） | —（不直接读） | ✓ | `copilot-mcp-vscode` |
| CLI 插件（本地市场声明） | ✓ | 发现 `installed-plugins` | 未承诺 | `copilot-plugin-*` |

`.prompt.md` 在矩阵里只属于 Local，不是 CLI 命令，也不是 VS Code Copilot harness 的可复用工作流。CLI/VS Code Copilot 需要可复用工作流时用 skills；需要常驻规则时用 instructions/rules。矩阵中“读”的路径不增加 Hub 计数或卸载入口。

### 配置根限制

普通 skills/MCP/prompts 首版使用表中默认 HOME 路径。当前 `PlaceFiles/SkillPlace` 没有 env root 能力，**v1 明确不支持 `COPILOT_HOME` 下的普通资产**：扩展无法探测该变量，若用户设置它，写默认 `~/.copilot` 的资产客户端不会读取。target 位置说明和 README 必须标注这个限制；不猜测、不把默认路径写成“已覆盖自定义根”。

把“通用 env root（`PlaceRef`/`SkillPlace` 可声明环境变量根，并与工作区、HOME 根一起校验）”列为宿主前置/后续，不在本计划的七个阶段里夹带实现。它若要做，必须同时覆盖 skills、MCP、prompts，不新增 Copilot 特判。插件安装器是唯一例外：它通过 `PluginDisk.homeEnv = "COPILOT_HOME"` 支持自定义绝对根；不能因此声称整套扩展都支持自定义 Copilot home。

## 插件包安装器

### 格式与组件

首版**只接受 Agent Plugins 1.1.0**，清单固定为根 `plugin.json`。不读取 Agent Plugins 1.0、无 schema 的历史根清单、`.plugin`、`.github/plugin` 或 Claude 清单作为替代输入，不转换旧包。

**唯一格式与拒绝规则：**

1. 根 `plugin.json.$schema` 必须精确等于 `https://agent-plugins.org/schemas/1.1.0/plugin.schema.json`；缺失、其它值或其它清单位置均拒绝，不继续寻找替代清单。
2. 存在 `mcp.json` 时，其 `$schema` 必须精确等于 `https://agent-plugins.org/schemas/1.1.0/mcp.schema.json`。Hub 安装准入要求整个交付包通过校验；不一致或无效时，在任何市场/settings 写入之前拒绝安装，不交付部分组件。
3. 1.1.0 目前仍为 Working Draft；这是本计划明确选定的格式基线。支持它的客户端构建必须在真机验收中记录，不承诺旧客户端支持，不因客户端过旧而降级。
4. 已存在但不符合上述格式的客户端包只显示为不支持、只读；不把它们解析成可编辑的 1.1 包，不改原文件。

| 组件 | 唯一支持的布局 |
| --- | --- |
| manifest | 根 `plugin.json`，精确 1.1.0 `$schema` |
| skills | 固定 `skills/<name>/SKILL.md`，无根 SKILL.md 回退 |
| MCP | 根 `mcp.json`，精确 1.1.0 `$schema` |
| agents | `com.github.copilot/agents/` |
| commands / rules | `com.github.copilot/commands/`、`com.github.copilot/rules/` |
| hooks | `com.github.copilot/hooks/hooks.json` |
| LSP | `com.github.copilot/lsp.json` |
| extensions | manifest 的反域名对象及对应顶层目录 |

标准 `mcp.json` 必须是：

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.1.0/mcp.schema.json",
  "mcpServers": {
    "example": {
      "type": "stdio",
      "command": "node",
      "args": ["${PLUGIN_ROOT}/server.js"],
      "cwd": "${PLUGIN_DATA}"
    }
  }
}
```

schema 顶层只允许 `$schema/mcpServers`。stdio 必填 `type/command`，允许 `args/env/cwd`，不能在 `env` 重定义 `PLUGIN_ROOT/PLUGIN_DATA`。远程为 `streamable-http` 或 `sse`，必填 `type/url`，可带 headers；这与普通 Copilot MCP 文件中的 `http` 不同。首版原样传递这些文件，不拿 `writeDeclaration` 将其重写成普通 MCP 格式。

CLI 对标准 stdio 的 `args/env/cwd` 展开 `${PLUGIN_ROOT}`、`${PLUGIN_DATA}`，并注入同名环境变量，data 有 `COPILOT_PLUGIN_DATA/CLAUDE_PLUGIN_DATA` 别名；远程配置不展开。plugin agent frontmatter 里的 `mcp-servers` 是另外一套规则，仅 PLUGIN_ROOT 及其 root 别名有效，不支持 data/env 置换。Hub 不提前展开路径，也不启动 MCP、hooks、LSP 或包脚本。

### 安装根、市场与启用状态

- 配置根：`$COPILOT_HOME`，默认 `~/.copilot`；`--config-dir` 已弃用，不作为实现接口。
- 市场安装目录：`<config>/installed-plugins/<marketplace>/<plugin>`；直接安装目录：`<config>/installed-plugins/_direct/<source-id>`。
- 持久数据：`<config>/plugin-data/`，卸载不删除用户数据。
- 市场 manifest 发现顺序：根 `marketplace.json` → `.plugin/marketplace.json` → `.github/plugin/marketplace.json` → `.claude-plugin/marketplace.json`。
- Hub 写入自己的市场索引 `tools.syncMarketplace([{ path: "marketplace.json", document }])`，包含 `name: "context-hub"`、`owner`、`plugins`，各 source 为 `./<name>`；与 Context Hub **扩展市场仓库**的 `marketplace.json` 是不同目录、不同协议，不能混用。
- 使用 `extraKnownMarketplaces.context-hub.source = { source: "directory", path: <Hub plugin library root> }`，已存在同名其它来源就报冲突。local directory marketplace 中 path source 会 live-load；所以 Hub 库被移除会影响运行，缓存存在不等于源还可用。
- `enabledPlugins` 键是 `<plugin>@<marketplace>`，例如 `review@context-hub`。官方也允许其它 plugin specs，但首版自己新建的只用确定的市场身份。
- User：`<config>/settings.json`；project：`<workspace>/.github/copilot/settings.json`；个人覆盖：`.github/copilot/settings.local.json`。local 高于 project，project 高于 user；managed 对 enabledPlugins/marketplaces 的对应 entry 锁定。CLI 也读取 `.claude/settings*.json` 的共享子集，同键优先级必须用隔离夹具验证。
- 官方说明仅仓库启用的包会自动安装，且只在声明它的仓库激活；客户端是否在 `installed-plugins` 留副本由其自身决定。v1 不依赖也不写该目录。没有 `copilot plugin install --scope project` 的已证实选项，禁止编造。
- `config.json` 持有安装 metadata 和其它内部状态（也可能包含认证数据）。官方明确不推荐手工改它；**v1 不读取、不写、不重写、不打印它**，安装/启停/卸载只依赖 settings 与 `installed-plugins` 目录。不能用 Claude 的 `installed_plugins.json` 套用。

### PluginPlace 映射

| id | scope | scopeWord | switch file | overrides |
| --- | --- | --- | --- | --- |
| `copilot-plugin-user` | global | user | `.copilot/settings.json`（实际由 roots.config 定位） | 无 |
| `copilot-plugin-project` | workspace | project | `.github/copilot/settings.json` | `["user"]` |

`PluginInstallScope` 目前仅 `user | project`。首版 local 作为只读覆盖读取，不新增第三个写入 scope；某个 id 被 local/兼容文件/managed 状态实际控制时，不宣称更低层写入已经改变运行状态。由于当前 UI 不能表达“该包在这个 place 的单独开关不可写”，操作必须在写前拒绝并指出控制文件；held 的整体只读项仍用现有 `readOnly`。

held 至少区分客户端安装记录（`origin: record`）和存在有效 local source 的配置声明（`origin: declaration`）。`switches()` 只返回每个文件自己明确写下的布尔值；`held.enabled` 是当前工作区可确定的启用状态，不能确定时为 `undefined`，不是 `false`。相同包名不同市场不得合并 id；删除/启停接收完整 id。来源不明、managed、direct 的内部 source-id 暂未验证者先只读，绝不能拼成 `name@context-hub` 去删。

### 唯一安装路径（v1）：Hub 库作为本地市场，声明式 live-load

**v1 只做这一条路径，不做复制安装。** 官方支持 local directory marketplace 的 path source 直接从真实目录加载；Hub 库本来就已经持有包目录，所以不再复制到 `installed-plugins`，也不写 `config.json`。这样同时避开未验证的内部 metadata schema 和 `PluginDisk.commit(copy)` 的固定 `cache/` 布局。

安装一个包（`install(name, scope)`）：

1. 在 Hub 库中确认包存在且格式可读；只校验根清单 1.1.0（见上节）。
2. 用 `tools.syncMarketplace([{ path: "marketplace.json", document }])` 在 Hub 库根写/刷新市场索引；`name` 为 `context-hub`，条目 `source` 为 `./<name>`。索引只列通过 Copilot 格式校验的包，Hub 库里其它 Agent 的包不暴露给这个市场。这是 Hub 库自己的索引，和扩展市场仓库的 `marketplace.json` 无关。
3. 在 user settings（`<config>/settings.json`）确保 `extraKnownMarketplaces["context-hub"] = { source: { source: "directory", path: <Hub 库根绝对路径> } }`。已有同名但指向别的目录时拒绝，不覆盖。这个绝对路径只出现在 user settings，不写进项目共享文件。
4. 在目标 scope 的 `enabledPlugins` 写 `"<name>@context-hub": true`：user 用 `<config>/settings.json`，project 用 `<workspace>/.github/copilot/settings.json`。项目文件因此只含市场名，不含本机绝对路径，可以安全提交。
5. 不复制文件、不读不写 `config.json`、不直接写 `installed-plugins`。`install` 返回的 `location` 是 Hub 库里的 `<library>/<name>`，不是客户端缓存路径。客户端在下次会话按声明从 Hub 库加载；Hub 只报告“已声明”，不声称组件已加载。

**用户可见语义（UI 与 README 必须一致）**：

- 安装 = 在 Hub 库根写市场索引 + 在 user settings 写 `extraKnownMarketplaces` + 在目标 scope 写 `enabledPlugins` 键。**不是复制安装**，没有 `installed-plugins` 副本。
- 卸载 = 只删除目标 scope 的 `enabledPlugins` 键；Hub 库里的包、市场索引和客户端缓存都保留。按钮/菜单/README 不写“删除文件”或“删除副本”。
- 行上的状态若来自声明，用通用 `origin: "declaration"` 标识（现有字段）；UI 不把它画成与复制安装完全相同。README 用一句话说明“库在那里，客户端下次会话读取”。
- 来源不可用（库目录被移走/删掉、市场索引缺失、声明指向的包不存在）时，行仍显示该声明和预期路径，状态为「来源不可用」，不能当作未安装而消失。扩展在确实检查了本地来源时提供通用 `sourceAvailable`；未检查的外部来源保持未知。

卸载一个包（`remove(id, scope)`）：

- 只删除目标 scope 的 `enabledPlugins[id]`。Hub 库里的包、市场索引、`extraKnownMarketplaces` 都保留：库是 Hub 自己的资产，不因一次客户端卸载而删除。
- 不删除客户端可能缓存的 `installed-plugins`；那由客户端管理，且在 metadata 未验证前删除有复活/破坏风险。`plugin-data` 永不删除。
- 若另一个 scope 仍启用同一个 `id`，保留该 scope；若没有 scope 再启用，包在客户端不再激活。卸载完成判据是“新会话不再激活、不会被 config.json 复活”，不是“磁盘缓存文件消失”。
- 非 `context-hub` 市场、managed/direct 身份只读；不能拼成 Hub 市场 id 删除。

启停（`setEnabled(id, scope, on)`）：只写目标 scope 的 `enabledPlugins[id]`。`false` 是停用，不是卸载；`remove` 才删除该 scope 的键。项目 `false` 覆盖 user `true`，这与官方 local > project > user 一致；managed 可能继续压过这些文件，因此 `held.enabled` 在无法确认时保持未知。

Hub 库移动或删除：市场声明仍指向旧绝对路径。`held` 必须返回该声明，而不是空列表或“未安装”：`source` 保留预期路径、`origin: "declaration"`、`readOnly: true`、`enabled: undefined`、`sourceAvailable: false`，pack 为满足当前必填契约的空描述对象。宿主按 `sourceAvailable` 显示「来源不可用」及路径，不能从空 pack 推断来源是否可用；市场索引缺失或索引里没有该包时同样处理。已检查且存在的本地来源返回 true；外部或未检查来源不填此字段。用户需要重新安装/更新声明；不自动猜测新路径，也不改 user settings 之外的位置。

**`config.json` 边界**：v1 不读取、不写、不重写、不打印。若阶段 5/7 的用户手动检查发现某条 `enabledPlugins` 声明在移除后仍被客户端内部 metadata 复活，v1 判定失败，按 Option A 重新审批；不改成“只写 enabledPlugins 就算安装完成”，也不去猜 metadata schema。

### 宿主共同前置（v1）

共同前置交付 `PluginHeld.enabled` 未知态与通用 `sourceAvailable` 来源可用性字段，不新增客户端分支。

- `PluginHeld.enabled?: boolean`；`undefined` 表示客户端有效状态无法确定。不得用 `false` 代替。
- `PluginHeldBy.enabled` / `PluginHeldPlace.enabled` 跟随为可选；`rows.ts` 保留 `undefined`。聚合规则：任一 place 明确 `true` → `true`；全部已知且都为 `false` → `false`；没有 `true` 且至少一个 `undefined` → `undefined`。
- `placesShown` 的 `on` 可为 `undefined`；UI 对未知状态显示「未知/由客户端管理」，不显示可切换的开关。`PluginSwitches` 仍只收文件中明确写下的布尔值。新增通用 locale 键，不写 Copilot 文案进宿主。
- 行的声明来源用现有 `origin: "declaration"` 显示；来源可用性由扩展按实际检查结果提供 `sourceAvailable?: boolean`，false 显示「来源不可用」及路径，undefined 不推断。安装/卸载按钮文案在 README 和 UI 中都说明「声明」语义，不写「复制/删除副本」。
- 现有 `claude.code`/`codex` 继续返回布尔，行为不变；补一条“undefined 不会被当成关闭”的测试。

**明确不改** `packages/resources/plugins/src/host/installer-files.ts`：v1 不复制目录，不需要段模板、`removeDirectory` 放宽或 `stateDirectoryLayout` 能力。若将来改走“复制到 `installed-plugins`”的方案，再把「声明驱动的安装段模板」作为独立宿主前置重新审批；它和“复制后不往树里写生成清单”一起属于后续 Option A，不属于 v1。

**普通资产 `COPILOT_HOME`** 仍是独立宿主前置（env root 能力，见「配置根限制」）；v1 不实现，也不静默声称覆盖。

Copilot 安装器的 `PluginDiskDeclaration` 只需覆盖声明式路径：`home: ".copilot"`、`homeEnv: "COPILOT_HOME"`、`state: "installed-plugins"`；config 读写 `settings.json`；stateFiles 只读 `*/*`（用于列出客户端已有的安装记录，不写）；workspace 读写 `.github/copilot/settings.json`、只读 `.github/copilot/settings.local.json` 与 `.claude/settings*.json`；library 只读包 manifest 与市场条目，市场索引经 `syncMarketplace` 写在库根。`available()` 只要求 `tools.disk`，`tools.run`/`tools.has` 一次都不调用。测试里的这两个函数调用即抛错。

### live-load 探针判据与手动验收

本机没有 `copilot`，所以自动化**只验文件状态与 metadata 形状**：settings 的键、市场索引、source 路径、包 manifest、`held`/`switches` 的输出、未知 enabled 的传播、来源不可用的行状态。以下三项 CLI 检查是 live-load 是否成立的**发布门槛**，写成用户手动步骤，不安装 CLI：

1. **只写 declaration 能加载**：临时 `COPILOT_HOME`/workspace 下只写 Hub 市场索引 + `extraKnownMarketplaces` + `enabledPlugins`，不写 `installed-plugins`；新会话 `copilot plugin list --json` 能看到 `probe@context-hub`，且 skills/MCP 组件真实可用。
2. **删键不复活**：只删目标 scope 的 `enabledPlugins` 键，重启新会话再跑 `copilot plugin list --json` 和组件诊断；确认不会被 `config.json` 的 installed metadata 复活。
3. **project 覆盖真实生效**：project `false` 能压过 user `true`；换到另一个临时工作区确认 project 不泄漏为全局。若 project `enabledPlugins` 看不到 user 的 `extraKnownMarketplaces` 声明，视为第 3 项失败，不把本机绝对路径写进项目共享文件。

**三项全过才算 live-load 成立。** 任一项失败时，v1 不标完成、不发布；按 **Option A（复制到 `installed-plugins`）** 重新审批，并保留“声明驱动的安装段模板”宿主前置、`treeHash` 复制后不写生成清单的约束。不得静默改成 CLI 写入，也不得把只写 `enabledPlugins` 当成完成。Option A 不在本计划的七个阶段里实现。

## 复用判断

| 现有能力 | 可复用内容 | 不能直接复用的部分 |
| --- | --- | --- |
| Agent Plugins 1.1.0 | 原始包、skills/mcp 的固定布局、manifest/schema 与占位符规则 | 当前仓库没有通用 Agent Plugins 安装器；标准不定义 Copilot 的 config.json、作用域、市场注册与缓存 |
| 现有 MCP provider | JSONC `readJsonObject/editJson/jsonValueLines`、declaration 映射和错误风格 | root key、canonical type、保留扩展字段要由 Copilot 自写；bare map 拒写 |
| 现有 prompt providers | `slugOf/commandFile/withSection/withoutSection/PromptError`、Codex ownership 保护 | 文件后缀、`applyTo`、IDE-only forms 和 `.github` 路径要自写 |
| PluginDisk | roots、原子写、快照、锁、settings 读写、市场索引 | v1 不使用 copy/removeDirectory；内部 metadata 与启停语义归扩展 |

不为三套扩展再抽一个大安装框架；先让 Copilot 的不同协议在自己的文件内清楚表达。

## 完整目录与改动面

在扩展仓库新增：

```text
plugins/copilot/
  package.json
  plugin.yaml
  build.mjs
  tsconfig.json
  vitest.config.ts
  README.md
  assets/icon.svg
  src/index.tsx
  src/icon.tsx
  src/contracts.ts
  src/locations.ts
  src/messages.ts
  src/provider.ts
  src/prompts.ts
  src/plugin-format.ts
  src/plugin-state.ts
  src/installer.ts
  __test__/registration.test.ts
  __test__/provider.test.ts
  __test__/prompts.test.ts
  __test__/plugin-format.test.ts
  __test__/plugin-state.test.ts
  __test__/installer.test.ts
  __test__/fixtures/plugin-layouts.ts
  lib/index.js                 # 构建生成，源分支不提交
```

`fixtures/plugin-layouts.ts` 用小字符串树表达 1.1 包、旧格式拒绝反例、市场与声明；只放无害本地内容，不放真实用户 config。无需提交下载代码或可执行第三方脚本。

扩展仓库其它影响：`pnpm-lock.yaml` 新 workspace importer（开发依赖只复用同版本）；根 `README.md` 只有必要入口链接；`marketplace.json` 自动生成，不手改；`pnpm-workspace.yaml` 的 `plugins/*` 已覆盖新目录，不改它。

宿主共同前置统一交付；阶段 5 先验收通用 `enabled?: boolean` 契约、`rows.ts`/类型/UI 未知态及测试，并更新 `docs/extensions.md` 的能力说明。v1 不改 `installer-files.ts` 的 copy/removeDirectory。调用链检查 `packages/resources/plugins/src/provider.ts` → `src/types.ts` → `src/rows.ts` → `src/install-actions.tsx`，以 `rows.test.ts` 与两个已有扩展回归为保护。包格式扫描和详情 UI 暂不扩张；根 plugin.json 已覆盖首版唯一格式。

## 七阶段实施

计划获批后按以下七个阶段创建七条 `TaskCreate`；阶段开始/验收立刻 `TaskUpdate`，不等最后一起更新。任何需要调整的阶段先改任务和本计划。当前不执行源码改动，也不归档计划。

### 阶段 1：建立扩展脚手架

**目标**：可独立构建、能被市场生成器校验的空扩展。

**第一步**：把 `D:/work-space/dsh-context-hub/docs/research/agent-icons/copilot.svg` 原样复制到 `D:/work-space/context-hub-extensions/plugins/copilot/assets/icon.svg`，不描画、不改 path、不拿第三方重绘替换。该文件同时是市场条目内联图标的唯一来源；README 记录 SHA-256、MIT 和商标限制。

**运行时图标决策**：采用**内联 SVG**（从官方 `copilot.svg` 的 path 原样搬入 `src/icon.tsx`），不依赖 `new URL(...)`，也不依赖 `/hub/extensions/copilot/assets/icon.svg` 在 dev 与已安装两种形态都能解析。若阶段 7 改用 asset URL，必须分别验证 dev server 与安装后的路由，任一失败就回退内联；本计划默认不启用该 URL 方案。

**文件与动作**：新增 package/plugin/build/tsconfig/vitest/README、最小 `src/index.tsx`。package name `copilot`、起始 version `0.1.0`、main/exports `lib/index.js`；复制现有 esbuild 脚本与 React externals；manifest category agent、permissions `[assets.read,assets.write,filesystem]`、inject `[skills,prompts,mcp,plugins,targets,locales]`。首版依赖阶段 5 的通用 `PluginHeld.enabled?: boolean` 能力，engines 最低版本必须绑定实际发布该能力的宿主版本，不能沿抄 `>=0.2.0` 就宣布旧宿主可用。

**验收**：在扩展仓库运行 `pnpm --filter copilot typecheck`、`pnpm --filter copilot build`、`pnpm build:marketplace`；生成条目 id 为 copilot、图标与源文件一致且小于 32 KiB、bundle 仅 external React。现有脚本已核实；新包 scripts 与 codex 相同。没有必要新增生产依赖。

### 阶段 2：注册身份与位置

**目标**：一个 target、两处 skills、正确的服务生命周期与语言表。

**文件与动作**：`src/index.tsx/contracts.ts/locations.ts/messages.ts`、`__test__/registration.test.ts`。一次注册 `hub.target.copilot`；使用 `src/icon.tsx` 的内联官方 SVG，不复制第二份手绘图，也不用未验证的 asset URL。两套 locale 键一一对应。每种资源的 place id 全局唯一，采用上文表格，不重复注册 `.agents/skills` 或 `.claude/skills`。`locations` 只描述对应真实消费端，不把显示路径当 IO 根。

**验收**：`pnpm --filter copilot test`、`pnpm --filter copilot typecheck`、`pnpm --filter copilot build`。registration fixture 断言 1 个 target、2 个 skills places；选择/停用扩展后注册能随生命周期摘掉；不同 scope/dir 的计数身份不混用。阶段 1 的市场图标断言 asset 被原样内联、字节数与 SHA-256 与源文件一致；阶段 2 的 target 图标在 dev（未安装）和已安装两种形态都由内联组件渲染。脚手架阶段创建的 provider 文件只在实现后注册，不能有半实现的服务贡献。

### 阶段 3：实现 MCP 文件交付

**目标**：四个 MCP places 的读/装/卸与行定位无损工作。

**文件与动作**：`src/provider.ts/contracts.ts/messages.ts/index.tsx`、`__test__/provider.test.ts`、fixture。实现上文四路径映射和 root key 分支；复用 JSONC toolkit；只使用 envelope，bare map 和旧 type 拒写；保留已有 unknown fields 和用户注释；未知 place/损坏文件给扩展 namespace 的 McpError。首版不暴露未经完整状态解析的开关。

**验收**：`pnpm --filter copilot test`、`pnpm --filter copilot typecheck`。用 fixture 检查 stdio/http/sse 成功，local/bare map 拒写且字节不变、空文件、坏 JSON、同名更新、注释、inputs/tools/cwd 保留、卸载只删一个节点、定位行号；`.vscode` 绝不被写成 `mcpServers`，标准插件 `mcp.json` 绝不送入普通 provider。

### 阶段 4：实现提示词与指令交付

**目标**：三处 prompt places 的 forms 都有对应真实消费文件。

**文件与动作**：`src/prompts.ts/contracts.ts/messages.ts/index.tsx`、`__test__/prompts.test.ts`。实现表格中的 7 类落点；memory 标记块、rule frontmatter、agent description、IDE `.prompt.md`、ownership 冲突保护。forms 明确说明 VS Code Local；不把同一 prompt 同步成多个常驻形式。

**验收**：`pnpm --filter copilot test`、`pnpm --filter copilot typecheck`、`pnpm --filter copilot build`。逐个 form 测写入→held→重复安装→更新→移除→再次移除；手写文件不覆盖、标记外正文保留、中文/危险名字经宿主 slugOf、未知 form/option/place 拒绝。CLI places 不含 `.prompt.md` commands；project AGENTS.md 不重复注册。

### 阶段 5：接通声明式插件安装器

**目标**：文件与 metadata 自动验收通过；安装/启停/卸载都走 settings 声明，没有运行时 CLI 依赖，也不伪造状态。

**先定 fixture，不读真实认证数据**：在独立临时 HOME、COPILOT_HOME、hub home、workspace 中构造标准 1.1 包及 1.0/legacy 拒绝反例，只用最小 skills/MCP 组件。自动化只写/读临时 settings、市场索引、包 manifest 和 `held` 输出；不运行 `copilot`，不读真实 `config.json`，不输出任何认证字段。

**宿主文件与动作**：先验收共同前置，不在多个扩展计划重复实现。共同变更在 `packages/resources/plugins/src/provider.ts` 把 `PluginHeld.enabled` 改为可选；同步 `src/types.ts`、`src/rows.ts`、`src/install-actions.tsx` 的未知态、「声明/来源不可用」展示和安装/卸载文案；更新 `__test__/rows.test.ts` 等测试和 `docs/extensions.md`。不新增 Copilot 字面量。`installer-files.ts` 不动。

**扩展文件与动作**：新增 `plugin-format.ts/plugin-state.ts/installer.ts`，完善 contracts、messages、index、README、对应三组测试与 fixtures。实现上文唯一安装路径：验证包→写库根 `marketplace.json`→确保 user `extraKnownMarketplaces.context-hub` 指向库根→写目标 scope 的 `enabledPlugins["<name>@context-hub"]`。`remove` 只删目标 scope 的键；`setEnabled` 只写目标 scope 的布尔值。不复制、不读不写 `config.json`、不删除客户端缓存。`available` 只要求 `tools.disk`；`run/has` 不调用。direct/managed/外部市场只读。`held.enabled` 在 settings 链可确定时给布尔，在仅有客户端安装记录、没有声明、或兼容文件冲突未定时给 `undefined`。库根/索引/包缺失时返回可识别的声明条目（`origin: "declaration"`、无元数据的 pack、`source` 路径、`enabled: undefined`），不返回空列表。

**验收**：扩展仓库 `pnpm --filter copilot test`、`pnpm --filter copilot typecheck`、`pnpm --filter copilot build`；宿主仓库 `pnpm --filter @context-hub/plugins test`、`pnpm --filter @context-hub/plugins typecheck`、`pnpm --filter @context-hub/plugins lint`。旧扩展 `pnpm --filter claude.code test`、`pnpm --filter codex test`。测试中的 `tools.run/has` 一调用就 throw。自动化断言：user/project settings 的键、市场索引 source、source 路径、包 manifest、`held`/`switches` 输出、`enabled: undefined` 不被当成 `false`、移除声明后不再出现在 `held` 的活动声明中。CLI 的 `plugin list --json` 结果只作为阶段 7 的用户手动验收，不写成自动化已通过。

### 阶段 6：补齐隔离回归与市场验证

**目标**：发布物和用户可见状态都有覆盖，不依赖 mock 自证。

**文件与动作**：完善 `__test__/*.test.ts`、fixtures 与 README；仅因新 workspace importer 更新 lockfile。添加真实临时目录 IO 集成：显式注入 home、folder、userHome；宿主 PluginDisk env 也显式隔离。验证标准包原样读取、声明写入/移除、两个项目引用、一处 false 与其它 scope 的区别、安装位置计数、Hub 库移动/包删除/索引缺失后的「来源不可用」行、未知 enabled 的 UI/派生值。

**验收**：扩展仓库运行已存在的 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。涉及共享宿主契约，宿主运行 `pnpm test`、`pnpm typecheck`、`pnpm lint`。生成 marketplace id 唯一，icon 可读，源码分支不提交 lib/index.js/marketplace.json。所有实际测试文件都在临时根内，测试后无残留。

### 阶段 7：完成真机验收与清理

**目标**：Hub 与可用的真实客户端都消费成功，并把无法自动化的 CLI 检查明确交给用户。

**文件与动作**：只按实测更新 `plugins/copilot/README.md`（客户端版本、已验路径、限制、图标许可），必要时修正实现后重跑受影响检查。Hub 浏览器验收使用 `ego-browser`；使用新建的隔离环境，不碰现有用户服务或真实 HOME。VS Code 使用独立 user-data-dir/extensions-dir 与临时 workspace，记录所选 harness；若无法安装/授权 Copilot，标明此项未验收，不伪装完成。

**自动化与用户手动验收分开：**

- Hub 侧和市场/图标、设置键、市场索引、source 路径、held/未知状态由阶段 6 的自动化覆盖。
- CLI 侧需要用户已安装的 `copilot`；本计划不安装。用户在隔离 `COPILOT_HOME` 下手动执行：安装最小包 → 新会话 `copilot plugin list --json` 看到并启用 → 删除目标 scope 的 `enabledPlugins` 键 → 重开会话确认不复活；再用 project `false` 和第二个工作区确认覆盖不泄漏。
- VS Code 侧检查 Copilot harness 的原生技能/指令/agents 与 CLI 安装包发现；Local harness 检查 `.github/prompts` slash entry 与 `.vscode/mcp.json`。目录发现不是实际使用，另用无害 marker 技能/指令确认消费。

**验收顺序**：

1. Hub 本地市场安装 copilot 扩展，target、图标、语言与资源入口出现；停用后贡献消失、启用恢复。
2. Skills 全局/工作区各装 1 个，数量各为 1，共享 `.agents/skills` 只出现一次；未知显示 `—`、空目录显示 0。
3. 按上文三项手动步骤完成 CLI 安装/卸载/启停；任一项失败，v1 不发布，按 Option A 重新审批。
4. VS Code Copilot harness 检查原生技能/指令/agents、CLI 安装包发现；Local harness 检查 `.github/prompts` slash entry 与 `.vscode/mcp.json`。MCP 如需启动只用明确审核过的本地无副作用 fixture。
5. 插件 user install→disable→enable→project override→remove，分别核对 scope 自身开关、有效状态与实际组件；换到第二个临时工作区检验 project 不泄露为 global。重开会话确认卸载不会自动安装回来。
6. 先卸测试包、停自己启动的进程，再删除自己的临时根；核对两个仓库 `git status --short`，不删用户或其它 agent 的文件。

计划完成仍不自行归档；用户明确确认完成后才移入 archive。

## 测试清单

- Registration：一个 target、place id 唯一、locale 完整、卸载生命周期、标准 `.agents/skills` 不重复。
- Skills：两处安装/卸载/计数；scope/dir/id 配对；同名但不同来源有独立状态，不因“Hub 没投递过”隐藏持有者。
- MCP：四文件 root key、bare map 拒写、合法 type、unknown 字段保留、无破坏卸载、损坏 JSON 拒写；不处理/泄露凭证，仅原样保留环境变量占位符。
- Prompts：三 places、所有 forms、幂等、held key、marker 所有权、手写同名拒绝、标记块移除、agent 必填 description、CLI 没有 IDE-only commands。
- Format：只接受精确 1.1.0 `$schema`、缺失/1.0/legacy/未知版本拒绝、mcp schema 与 transport、不提前展开 PLUGIN_ROOT/DATA、不悄悄把包格式改写。
- Installer：available 无 CLI、声明式 install/disable/enable/remove、settings 写前校验、市场 source 冲突、包 source 缺失、local shadow、外部市场真实 id、direct/managed 只读、项目 false 覆盖、卸载只删目标 scope。
- 来源状态：库根移动/删除、市场索引缺失、索引缺包时，`held` 仍返回声明条目并显示「来源不可用」，不变成空列表；正常声明显示「已声明」，不与复制安装混淆。
- 宿主未知态：`PluginHeld.enabled: undefined` 不被当成 `false`；`rows.ts`/UI 显示未知且不显示可切换开关；现有布尔返回者行为不变；Copilot 未知项不被计为启用或停用。
- 隔离：memory fake 无 IO；真实 IO 显式传临时 `home/folder/userHome/env`。`COPILOT_HOME` 单独隔离不等于 HOME 已隔离；Windows 同时让子进程 HOME/USERPROFILE 指向测试 home，缓存另设根，不继承账号/token 状态。
- 计数：安装态来自 held，不用 delivered 代替；CLI 与 VS Code 共用的同一路径只计一份；停止状态与同一行开关使用同一个派生值；未知状态不计入启用数量。

## 待验证项与可执行检查

下面是实施阶段的验证步骤，**本次未运行**。所有命令中的 `$probe_*` 由测试 harness 创建为独占临时绝对路径；不要把 `$HOME` 变量改成任务工作目录。子进程使用显式 env 字典设置 HOME、USERPROFILE、COPILOT_HOME，cwd 固定为临时工作区；这里只给该子进程内的命令。先 `--help` 核对本机版本提供的参数，不使用猜出的 flag。标为“用户手动”的步骤不在自动化里执行，也不安装 CLI。

| 待验证项 | 命令 / 观察判据 |
| --- | --- |
| 安装的 CLI 版本与命令面（用户手动） | `copilot --version`；`copilot plugin install --help`、`copilot plugin uninstall --help`、`copilot config --help`；当前机器没有 copilot，安装须另行取得用户授权 |
| 声明式安装的组件加载（用户手动） | 空 HOME/COPILOT_HOME 写入 Hub 市场声明与 user `extraKnownMarketplaces`，在临时 workspace 启动新会话，运行 `copilot plugin list --json`、`copilot skill list --json`、`copilot mcp list --json`；确认 marker 组件可用，不只看 list |
| 声明式卸载不复活（用户手动） | 删除目标 scope 的 `enabledPlugins["probe@context-hub"]`，重开新会话，再运行 `copilot plugin list --json` 和组件诊断；确认不会被 `config.json` 的 installed metadata 复活。失败则 v1 不发布，按 Option A 重新审批 |
| project-only 与 local override（用户手动） | `copilot config --repo enabledPlugins`、`copilot config --local enabledPlugins`（不存在 `get` 子命令；先核对 help）；在 workspace A/B 各跑 `copilot plugin list --json`，并比较新会话组件，只有 A 激活；局部 false 压过共享 true |
| `.claude` 兼容设置与 Copilot 同键优先级（用户手动） | 临时 `.claude/settings*.json` 和 `.github/copilot/settings*.json` 分别种相反值；`copilot plugin list --json` 与新会话组件诊断；未确定优先级前拒绝对有冲突的身份写入 |
| 唯一 1.1.0 格式（自动 + 用户手动） | 只有精确 1.1.0 成功；1.0/legacy/无 schema/未知版本/mcp schema 不一致均安装前拒绝且零写入；用户手动对照原生组件 |
| MCP 占位符与数据保留（用户手动） | `copilot mcp list --json` 检查标准 plugin server；受控无副作用 stdio fixture 回报 env/cwd，验证 PLUGIN_ROOT/DATA；update/remove 前后比较 plugin-data，不删其内容 |
| 指令/技能命令及 agent 发现（用户手动） | `copilot skill --help`、`copilot instruction --help`；可用时 `copilot skill list --json`、`copilot instruction list --json`；agent 用 `/agent` 选择器和新会话 marker 检查 |
| VS Code 真实支持版本/harness | `code --version`；`code --help` 后使用独立 `--user-data-dir` / `--extensions-dir` 打开临时项目；在 Agent Customizations 中分别选 Copilot 与 Local 检查路径与组件 |
| COPILOT_HOME 普通资产边界（用户手动） | 设置偏离默认的 COPILOT_HOME 后 `copilot skill list --json`、`copilot instruction list --json`、`copilot mcp list --json` 对照默认路径；确认 README 的“普通资产仅默认 HOME”限制，禁止声称完整支持 |

计划审批需接受：单 target、VS Code Local 单独 forms/place、MCP 首版启停由客户端管理、插件 v1 只做声明式 live-load（不复制、不写 config.json、不调 CLI）、`PluginHeld.enabled` 未知态是宿主共同前置、CLI 验收由用户手动完成；若必须首版支持所有配置根/profile 或复制安装，应扩大计划后另审。

## 不做

- 不提交、不建分支、不 push、不发布市场、不登录账号、不启动用户真实客户端会话。本次不安装依赖或 CLI。
- 不接 GitHub 网站 cloud agent 的远程 secrets、组织策略管理或 MCP 云端配置 API。
- 不新增全局 `.agents/skills` 共享入口，不把 `.claude/skills` 再包装成 Copilot 位置。
- 不扫描所有 VS Code profiles、Insiders、远程容器、WSL 或任意用户自定义路径；不自动迁移 Local harness 资产。
- 不写 `plugin-data`、会话数据库、认证状态、auto-update 设置、模型或 tool 权限。
- 不通过 CLI 兜底安装；v1 不复制到 `installed-plugins`、不写 `config.json`、不删除客户端缓存。若将来改走复制安装，另批“声明驱动的安装段模板 + 复制后不写生成清单”的通用宿主前置，不在本计划夹带。
- 不给宿主新增 `.copilot`/Copilot 参数分支，不绕过符号链接与快照保护。
- 不写 hook/LSP 编辑器，不安装 Node/Python 组件依赖，不运行包脚本，不自动转写 Claude 私有组件。
- 不用通用 Agent Plugins 的名义抽大框架；不顺手重构两个既有扩展；不在 v1 实现普通资产的 `COPILOT_HOME` env root。
- 不手改生成的 marketplace，不扩张包详情 UI、不新增 legacy-only manifest 的收录规则；局限要写清。

## 官方图标与许可

已下载文件：`D:/work-space/dsh-context-hub/docs/research/agent-icons/copilot.svg`。

- 官方源：<https://raw.githubusercontent.com/primer/octicons/main/icons/copilot-24.svg>（GitHub 官方 Primer / Octicons）。
- 1689 bytes；已校验首字节为 `<svg`；SHA-256：`eeafb3c2f333e04ccf7d031ae215f7adafaed4c6352556b0bf79496e048bcdd7`。
- MIT：<https://github.com/primer/octicons/blob/main/LICENSE>，Copyright (c) 2026 GitHub Inc.；分发时在插件 README 的 Third-party notices 中保留完整版权与 MIT 许可声明。
- 市场图标：`assets/icon.svg` 原样被 `build-marketplace.mjs` 内联，不再生成第二份图形。运行时 target 图标采用 `src/icon.tsx` 的内联 SVG（从该官方文件 path 原样搬入）；若改用 `/hub/extensions/copilot/assets/icon.svg`，必须在 dev 与安装后两种形态分别验证，失败即回退内联。`new URL(...)` 方案默认视为未验证，不采用。
- 品牌说明：<https://brand.github.com/brand-identity/copilot> 指出 2025 起不再用旧独立 mascot lockup 作为产品主 logo。此处采用官方 UI Copilot icon 识别集成，搭配明确的 GitHub Copilot 标签；不把它重绘成自有品牌标志，不暗示 GitHub 官方出品或背书。MIT 不是商标授权。
- 商标政策：<https://docs.github.com/en/site-policy/content-removal-policies/github-trademark-policy>。

## 证据来源

Context7 已先解析 `/github/copilot-cli` 与 `/microsoft/vscode-docs` 并查询，再用官方原文复核；若索引摘要与现行官方正文不一致，以正文为准。

1. CLI plugins、manifest、市场、路径、参数、组件：<https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference>
2. 安装与 repo-local false：<https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-finding-installing>
3. settings/config 区分、COPILOT_HOME、项目与管理覆盖：<https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference>
4. CLI MCP 文件、bare map、project trust 与 `.vscode` 不兼容：<https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers>
5. CLI instructions：<https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions>
6. agents 格式：<https://docs.github.com/en/copilot/reference/custom-agents-configuration>
7. VS Code plugins/独立状态与 inventory：<https://code.visualstudio.com/docs/agent-customization/agent-plugins.md>
8. VS Code 插件组件与标准格式：<https://code.visualstudio.com/docs/agents/reference/agent-plugin-reference.md>
9. VS Code MCP schema 和便携能力差异：<https://code.visualstudio.com/docs/agents/reference/mcp-configuration.md>
10. VS Code Local-only prompt：<https://code.visualstudio.com/docs/agent-customization/prompt-files.md>
11. VS Code instructions：<https://code.visualstudio.com/docs/agent-customization/custom-instructions.md>
12. VS Code skills 位置：<https://code.visualstudio.com/docs/agent-customization/agent-skills>
13. Agent Plugins 1.1 规范（Working Draft）：<https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.1.0.md>
14. Agent Plugins 1.1 manifest/schema：<https://raw.githubusercontent.com/agentplugins/agent-plugins-spec/main/schemas/1.1.0/plugin.schema.json>、<https://raw.githubusercontent.com/agentplugins/agent-plugins-spec/main/schemas/1.1.0/mcp.schema.json>

## 自审记录

- [x] 每阶段有具体文件、动作和可执行验收；脚本来自两仓实际 package.json，新 copilot scripts 复制已存在模式。
- [x] 顺序为脚手架→身份/位置→MCP→提示词/指令→声明式安装器→测试→真机；安装器不依赖未实现的目录复制，普通 providers 不依赖 installer。
- [x] 已补调用链、wire、fixtures、配置、构建输出、locale、scope 计数与原扩展回归；没有让宿主写具体 Agent 分支。
- [x] 修正“VS Code 一定只读 .vscode/mcp.json”“prompt.md 所有 Copilot 都可执行”“全局 .agents/skills 已共享”四个容易沿用旧知识的假设；v1 安装路径已写死为声明式 live-load，复制安装与目录段模板移入 Option A。
- [x] 唯一成功格式为 Agent Plugins 1.1.0；旧包、无 schema、bare map、旧 type 都有零写入拒绝测试，没有 legacy parser 或降级链。
- [x] 已写死 UI/README 的声明语义、库根/索引失效时的「来源不可用」状态、三项 live-load 探针与失败回 Option A 的处置。
- [x] config.json 不读取/不写入；当前覆盖链冲突、组件加载、VS Code 实际版本均保留实测门槛；CLI 检查改为用户手动步骤，自动化只验文件与 metadata；CLI 不存在与未真机验证已明示。
- [x] 不做列表覆盖相邻扩展、UI、远程配置、CLI 兜底、复制安装、自动迁移与用户数据；源文件尚未改动，计划尚未执行或归档。
