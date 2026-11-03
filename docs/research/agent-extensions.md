# Agent 扩展深度调研

日期：2026-11-03。范围：`context-hub-extensions` 里 `claude.code`、`codex` 之外的 Agent 扩展。

> 上一版的错误：把「hub 目前只给 Claude Code / Codex 写了安装器」写成了「这些 Agent 不支持插件系统」。
> 实际上几乎所有主流 Agent 都有插件/扩展系统，只是格式、安装根和作用域不同。本版逐个核对。

## 结论

### P0：先做这六个

1. **Antigravity CLI（`agy`）** —— Google 用它在 2026-06-18 取代了消费版 Gemini CLI。插件、Skills、MCP、Hooks、子代理全都有，官方市场 `antigravity-plugins-official`，插件目录 `~/.gemini/antigravity-cli/plugins/<name>/`。
2. **Cursor** —— 完整的插件市场：`.cursor-plugin/plugin.json`（或 Agent Plugins 根 `plugin.json`），组件含 rules / skills / agents / commands / hooks / MCP，用户级装在 `~/.cursor/plugins/local`。
3. **GitHub Copilot** —— 插件系统成熟，兼容 Agent Plugins 1.0 和 Claude 插件格式；装在 `~/.copilot/installed-plugins/<marketplace>/<plugin>`，适用 CLI / VS Code / Copilot Chat。
4. **OpenCode** —— 资产面完整（skills、MCP、commands、agents、`AGENTS.md`），用户量大。插件系统是 JS/TS 代码插件，没有可移植插件包市场；hub 先交付资产，插件包要等官方支持 Agent Plugins 或自带桥接插件。
5. **WorkBuddy** —— 腾讯桌面 Agent，`.codebuddy-plugin` 插件体系、市场、依赖、缓存、`enabledPlugins` 全齐；国内覆盖面大。Coding 模式复用 `.codebuddy/` 项目配置。
6. **ZCode（Z.ai / GLM）** —— 插件清单 `.zcode-plugin/plugin.json`，并回退 `.claude-plugin/plugin.json`；插件商店预装 Claude Code 市场；安装根 `~/.zcode/cli/plugins/`，`zcode plugins` 支持 user/project 作用域。

### P1：第二批

- **Qwen Code** —— 原生加载 Agent Plugins v1，同时支持 Gemini 式 `qwen-extension.json`；国内覆盖面大，和 Antigravity/Gemini 的资产面高度重合。
- **CodeBuddy** —— 和 WorkBuddy 共用 `.codebuddy-plugin` 插件体系，用户级根是 `~/.codebuddy`；做完 WorkBuddy 后边际成本低。
- **Qoder** —— `.qoder-plugin/plugin.json`，命令/子代理/技能/Hook/输出样式/工作流/MCP 全支持，且格式与 Claude 插件互通。
- **TraeCode CLI 2.0** —— 基于 Codex 分支，插件格式与 Codex 兼容；`$TRAE_HOME/plugins/cache/...`，配置在 `traecli.toml`。Trae IDE / 插件版 / CLI 三种形态路径不同，需要分开处理。
- **Kiro** —— Powers 已支持 Agent Plugins 格式（`plugin.json`），旧格式 `POWER.md` 也还在；AWS 系。
- **Factory Droid** —— `.factory-plugin/plugin.json`，能直接翻译 Claude 插件；三作用域 org/project/user。

### P2：资产可交付，但插件系统不是可移植包

- **Cline** —— 插件是 SDK 代码插件（`cline plugin install`），没有声明式资产包；skills / MCP / rules 可交付。
- **Kilo Code** —— 有 Marketplace，但插件是 npm 代码；skills / agents / MCP 可以按文件安装。
- **Amp** —— 插件是 TS 代码，没有包市场；skills / AGENTS.md / MCP 可交付。
- **Continue** —— 不是插件目录，是 YAML block + Hub 配置组合；MCP 配置是 YAML。
- **Windsurf** —— 没有原生插件系统，只有 skills / rules / workflows / MCP。

### 不做的

- **Roo Code** —— 2026-05-15 已关停并归档。
- **Aider** —— 没有 Agent Skills 与原生 MCP。
- **纯云代理（Devin、Replit 等）** —— 没有本地客户端文件可写。

---

## 三个决定性事实

### 1. 插件格式正在向 Agent Plugins 1.0 收敛

2026-08-06，AWS、Cursor、GitHub、Microsoft、OpenAI、Vercel 共同发布 **Agent Plugins 1.0**（`agent-plugins.org`），Google 随后加入维护者。

- 包结构：根 `plugin.json` + `skills/<name>/SKILL.md` + `mcp.json`。
- 已支持或宣布支持：**VS Code、Cursor、GitHub Copilot、ChatGPT/Codex、Kiro、Qwen Code、OpenHands、OpenClaw、NanoClaw、Hermes Agent**。
- Claude Code 不在这份名单里，它走自己的 `.claude-plugin/plugin.json`，但两者结构高度相似。

这意味着：**包的生成可以共用一份**，但标准只定义包格式（skills + MCP），不定义安装、分发、启用和更新；这些仍在 portable spec 之外。安装器仍要按客户端的安装根、市场和启用文件各写一份。

### 2. Gemini CLI 已经被 Antigravity CLI 取代

- 2026-05-19 公告，2026-06-18 起消费版 / Google One 停止服务。
- 付费 API key、Gemini Code Assist Standard/Enterprise 仍可用旧 Gemini CLI。
- 新目标应是 **Antigravity CLI（`agy`）**：保留 Skills、Hooks、子代理，扩展（Extensions）改名为插件（Plugins）。
- 旧 Gemini 扩展可用 `agy plugin import gemini` 迁移。

### 3. 「有插件系统」不等于「能装同一个包」

插件系统分三类：

| 类型 | 例子 | hub 能做什么 |
|---|---|---|
| 可移植资产包 | Agent Plugins 1.0、Claude 插件 | 生成一份包，按客户端格式落盘 |
| 客户端私有资产包 | Antigravity、WorkBuddy/CodeBuddy、Trae | 每家一个适配器，但组件语义相近 |
| 代码插件 | OpenCode、Cline、Amp、Kilo 的 plugin | 只能交付 skills / MCP / rules，装不了包 |

---

## 插件系统矩阵

| 客户端 | 清单文件 | 安装根（用户级） | 作用域 | 组件 | 市场 | 启用状态 |
|---|---|---|---|---|---|---|
| **Claude Code** | `.claude-plugin/plugin.json` | `~/.claude/plugins` | user / project / local | commands、agents、skills、hooks、MCP、LSP、output-styles | `.claude-plugin/marketplace.json` | `~/.claude/settings.json` → `enabledPlugins` |
| **Codex** | `.codex-plugin/plugin.json`；0.147.0 起根 `plugin.json`（Agent Plugins） | `~/.codex/plugins/`，缓存 `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/` | user / project | skills、hooks、MCP | `~/.agents/plugins/marketplace.json`、`.agents/plugins/marketplace.json`；兼容 `.claude-plugin/marketplace.json` | `.codex/config.toml` → `[plugins."x@y"] enabled` |
| **Cursor** | `.cursor-plugin/plugin.json`；或根 `plugin.json`（Agent Plugins） | `~/.cursor/plugins/local/<name>`；市场缓存 `~/.cursor/plugins/cache/...` | user / workspace / team | rules、skills、agents、commands、hooks、MCP、variables | `.cursor-plugin/marketplace.json`；Cursor Marketplace | Customize 页；按 user/project 安装 |
| **GitHub Copilot** | 根 `plugin.json`（Agent Plugins）或 legacy `.plugin/plugin.json` / `.github/plugin/plugin.json` / `.claude-plugin/plugin.json` | `~/.copilot/installed-plugins/<marketplace>/<plugin>`；直接安装 `~/.copilot/installed-plugins/_direct/<source-id>` | user / repo | agents、skills、commands、hooks、MCP、LSP、extensions | `.github/plugin/marketplace.json`、`.claude-plugin/marketplace.json` | `settings.json` → `enabledPlugins`；仓库层 `.github/copilot/settings.json` |
| **Antigravity CLI** | 根 `plugin.json`（也接受 `.antigravity-plugin/`、`.gemini-plugin/`） | `~/.gemini/antigravity-cli/plugins/<name>/` | 用户级为主；项目走 `.agents/` | skills、agents、rules、hooks、MCP（`mcp_config.json`） | 官方 `antigravity-plugins-official`；`/plugin` 管理器 | 启用清单 + `import_manifest.json` |
| **Gemini CLI（旧）** | `gemini-extension.json` | `~/.gemini/extensions/<name>/` | user / workspace | commands、hooks、skills、subagents、themes、MCP | geminicli.com/extensions | `extension-enablement.json` |
| **Qwen Code** | `qwen-extension.json`（原生）或根 `plugin.json`（Agent Plugins v1） | `~/.qwen/extensions/<name>/` | user / workspace | skills、commands、agents、workflows、hooks、MCP、settings | Claude 插件市场源；`/extensions manage` | 扩展启用状态 |
| **WorkBuddy** | `.codebuddy-plugin/plugin.json` | 运行时读 `~/.workbuddy/plugins/cache/<marketplace>/<plugin>/<version>/`；`plugins/marketplaces/<m>/` 只是源快照 | user / project / local / managed（team 是分发概念，不是 scope） | skills、commands、agents、hooks、MCP、output-styles（themes/monitors 仅识别、不执行） | `.codebuddy-plugin/marketplace.json`、SkillHub | `~/.workbuddy/settings.json` → `enabledPlugins`；`installed_plugins.json`、`known_marketplaces.json` |
| **CodeBuddy** | `.codebuddy-plugin/plugin.json` | `~/.codebuddy/plugins/marketplaces/...`，缓存 `plugins/cache/<marketplace>/<plugin>/<version>` | user / project / local | 同上 | `.codebuddy-plugin/marketplace.json` | `enabledPlugins`、`extraKnownMarketplaces`；`.codebuddy/settings.json` |
| **Qoder** | `.qoder-plugin/plugin.json` | `~/.qoder/plugins` | user / project / local | commands、agents、skills、hooks、output-styles、workflows、MCP | marketplace schema；与 Claude 插件格式互通 | 插件管理器 / settings |
| **ZCode** | `.zcode-plugin/plugin.json`；回退 `.claude-plugin/plugin.json` | `~/.zcode/cli/plugins/`（市场索引、安装记录、`cache/`、`data/`） | user / workspace | commands、skills、agents、hooks、MCP（`.mcp.json`） | `marketplace.json`；插件商店预装 Claude Code 市场 | `~/.zcode/cli/config.json` → 插件启用态；`zcode plugins enable/disable` |
| **TraeCode CLI 2.0** | 与 Codex 兼容（`.codex-plugin`） | `$TRAE_HOME/plugins/cache/<marketplace>/<plugin>/<version>/`（`TRAE_HOME` 默认 `~/.trae`） | user / project | commands、skills、hooks、MCP | `traecli plugin marketplace add` | `$TRAE_HOME/traecli.toml` → `[plugins."x@y"]` |
| **Trae IDE / 插件版** | 插件市场条目 | IDE `~/.trae-cn/`，插件版 `~/.marscode/`；项目 `.trae/`、`.marscode/` | user / project | skills、rules、MCP、插件 | Trae 插件市场 | 客户端管理 |
| **Kiro** | 根 `plugin.json`（Agent Plugins）或旧 `POWER.md` | 用户 Powers 目录；项目 `.kiro/powers/<name>/` | user / project | skills、MCP、steering、hooks | Kiro Powers 注册表 + 本地导入 | Powers 面板 |
| **Factory Droid** | `.factory-plugin/plugin.json`；兼容 Claude 布局 | `~/.factory/plugins/`；项目 `.factory/plugins/`；缓存 `plugins/cache/<marketplace>/<plugin>/<version>` | org / project / user | skills、commands、droids、hooks、MCP、output-styles | `.factory-plugin/marketplace.json`；回退 `.claude-plugin/marketplace.json` | `enabledPlugins`、`extraKnownMarketplaces` |
| **OpenCode** | 无资产包；JS/TS 代码插件 | `.opencode/plugins/`、`~/.config/opencode/plugins/`；npm 包写在 `opencode.json` | global / project | hooks、tools、auth、providers | 无；npm / ecosystem | 配置 `plugin` 数组 |
| **Cline** | 无资产包；SDK 代码插件 | `~/.cline/plugins`（`cline plugin install`） | user | tools、hooks、commands、providers | npm / git / 本地 | 插件安装记录 |
| **Kilo Code** | Marketplace 条目；插件是 npm 代码 | 项目 / 全局配置 | project / global | skills、agents、MCP、plugins、rules | Kilo Marketplace | 配置 |
| **Amp** | 无资产包；TS 代码插件 | `.amp/plugins/`（项目）、`~/.config/amp/...`（全局） | workspace / personal | hooks、commands、tools、UI | 无 | 配置 |
| **Continue** | 无插件目录；YAML blocks | `.continue/{rules,prompts,mcpServers,agents}` + `config.yaml` | project / user | models、rules、prompts、MCP、docs | Continue Hub（Mission Control） | 配置组合 |
| **Windsurf** | 无原生插件系统 | — | — | skills、rules、workflows、MCP | 仅 MCP Marketplace | — |

---

## 逐个客户端的资产面

### Antigravity CLI（P0）

- Skills：项目 `.agents/skills/<name>/SKILL.md`；全局 `~/.gemini/config/skills/`、`~/.gemini/skills/`、`~/.gemini/antigravity-cli/skills/`。
- MCP：`~/.gemini/config/mcp_config.json`（全局）、`.agents/mcp_config.json`（项目）。
- 指令：`~/.gemini/AGENTS.md`、`~/.gemini/GEMINI.md`；项目 `AGENTS.md`。
- 插件：`~/.gemini/antigravity-cli/plugins/<name>/`，内含 `plugin.json`、`mcp_config.json`、`hooks.json`、`skills/`、`agents/`、`rules/`。
- 插件管理：`agy plugin list/install/disable/enable/uninstall`；市场 `@antigravity-plugins-official`；`/plugin` 交互管理器。
- 启用态：只在 `config.json`；`plugin.json.disabled` 仅首次初始化，`plugins.json` 是发现清单、不是开关。
- 文件安装：复制到受控 `cache/<market>/<name>/<version>`，再用 `plugins.json` 的 `entries.path` 指向它；不要直接写 `.agents/plugins/<name>` 或 `config/plugins/<name>`。
- 迁移：`agy plugin import gemini`。

### Cursor（P0）

- Skills：`.cursor/skills/`、`~/.cursor/skills/`、`.agents/skills/`、`~/.agents/skills/`。
- MCP：`.cursor/mcp.json`、`~/.cursor/mcp.json`；插件内 `mcp.json`。
- 指令：`.cursor/rules/*.mdc`（frontmatter：`description`、`globs`、`alwaysApply`）；`AGENTS.md`。
- 命令：`.cursor/commands/*.md`。
- 插件：`~/.cursor/plugins/local/<name>`（本地开发/用户级）；市场安装由 Customize 管理，缓存出现过 `~/.cursor/plugins/cache/`。
- 两种格式：Agent Plugins（根 `plugin.json`，只含 skills + MCP）和 Cursor Plugins（`.cursor-plugin/plugin.json`，含 rules/agents/commands/hooks/variables）。
- 变量：`${CURSOR_PLUGIN_ROOT}`；不展开 Agent Plugins 标准的 `${PLUGIN_ROOT}`。

### GitHub Copilot（P0）

- Skills：`.github/skills/`、`.agents/skills/`、`.claude/skills/`、`~/.copilot/skills/`、`~/.agents/skills/`。
- MCP：`~/.copilot/mcp-config.json`；项目 `.mcp.json` / `.github/mcp.json`。
- 指令：`.github/copilot-instructions.md`、`.github/instructions/*.instructions.md`、`~/.copilot/copilot-instructions.md`、`~/.copilot/instructions/`。
- 命令 / 代理：`.github/prompts/*.prompt.md`（IDE）、`.github/agents/`、`~/.copilot/agents/`。
- 插件：见矩阵；组件 `agents`、`skills`、`commands`、`hooks`、`mcpServers`、`lspServers`。
- 插件 CLI：`copilot plugin install/uninstall/list/enable/disable/update`；`copilot plugin marketplace add/list/browse/update/remove`；`copilot plugin list --json`。
- 配置根：`COPILOT_HOME` 可覆盖 `~/.copilot`；`--config-dir` 已 deprecated。`PlaceFiles` 没有 env root，v1 只能支持默认 `~/.copilot`，自定义根要单列宿主前置。
- 纯文件安装：`settings.json` + 本地目录 marketplace 有 live-load 支持；但删掉声明后是否会被 `config.json` 的 installed metadata 复活，必须用隔离 `COPILOT_HOME` 探针验「装 → 列表可见 → 删 → 重启不复活」。装得进、卸不净不算完成。
- 优先级：项目/个人 skills 覆盖插件 skills；MCP 后加载的插件覆盖先加载的。

### Gemini CLI（旧，P1 可选）

- Skills：`.gemini/skills/`、`~/.gemini/skills/`、`.agents/skills/`。
- MCP：`~/.gemini/settings.json` → `mcpServers`；项目 `.gemini/settings.json`。
- 命令：`.gemini/commands/**/*.toml`、`~/.gemini/commands`。
- 指令：`GEMINI.md`、`~/.gemini/GEMINI.md`。
- 插件：`gemini-extension.json`；`~/.gemini/extensions/<name>/`；启用记录 `extension-enablement.json`。
- 结论：只在企业/付费 API 场景保留；新用户应做 Antigravity。

### OpenCode（P0）

- Skills：`.opencode/skills/`、`~/.config/opencode/skills/`，以及 `.claude/skills/`、`~/.claude/skills/`、`.agents/skills/`、`~/.agents/skills/`。
- MCP：`opencode.json(c)`；v1 是扁平的 `mcp.<name>`，v2 是 `mcp.servers.<name>`（不是 `mcpServers`）。服务结构含 `type` + `command` 数组；v2 把 `enabled` 换成反义的 `disabled`，`timeout` 数字换成 `{ catalog, execution }`，OAuth 字段改 snake_case（`client_id`、`client_secret`、`callback_port`、`redirect_uri`）。
- 配置根：默认 `~/.config/opencode`（Windows 也是；源码走 `XDG_CONFIG_HOME` 或 `homedir()+.config`，没有 APPDATA 分支）；`OPENCODE_CONFIG_DIR` 可覆盖。`PlaceFiles` 没有 env root，v1 只支持默认根，自定义 XDG / CONFIG_DIR 明确不覆盖。
- 指令：`AGENTS.md`、`~/.config/opencode/AGENTS.md`。
- 命令 / 代理：`.opencode/commands/*.md`、`.opencode/agents/*.md`。
- 插件：JS/TS 代码插件；`.opencode/plugins/`、`~/.config/opencode/plugins/`，或 `opencode.json` → `plugin` 数组（npm 包）。
- 插件包：**没有**原生 Agent Plugins / Claude 插件支持（官方 Issue #40993 仍开放）；社区桥接插件（`oc-agent-plugins`、`opencode-plugger`）能读 Claude / Codex / Cursor 包，但不是官方能力。
- 结论：P0 的理由是用户量和资产面，不是插件包。先做 skills / MCP / commands / agents / memory 的直接交付；插件包要么等官方支持，要么把桥接作为可选依赖。
- 注意：OpenCode 2.0 重写了插件 API，v1 插件全部失效。v1/v2 的差异不止插件：`mcp` 结构、`enabled` → `disabled`、`timeout`、OAuth 字段、`skills.paths/urls` → 数组、`command` → `commands`、`agent` → `agents` 都变了。v2 仍读 v1 配置并在内存里归一化，但 hub 写回时应按目标版本写成原生形状，不能一份 provider 声称同时兼容两版。

### Qwen Code（P1）

- Skills：`.qwen/skills/`、`~/.qwen/skills/`；Agent Plugins 的 `skills/*/SKILL.md` 直接加载。
- MCP：`~/.qwen/settings.json` → `mcpServers`；Agent Plugins 的 `mcp.json`。
- 命令：`.qwen/commands/`（Markdown，支持子目录）。
- 指令：`QWEN.md`。
- 插件：原生 `qwen-extension.json`（commands/agents/skills/workflows/hooks/MCP/settings）；Agent Plugins v1 的根 `plugin.json` 保持原样，不重写。
- 安装：`qwen extensions install/link/uninstall`；支持本地目录、Git、archive、npm 包。
- 注意：Agent Plugins v1 里 commands/agents/hooks/workflows 会被忽略；只加载 skills + MCP。

### WorkBuddy（P0）/ CodeBuddy（P1）

- Skills：`~/.workbuddy/skills/`、`.workbuddy/skills/`（WorkBuddy）；`~/.codebuddy/skills/`、`.codebuddy/skills/`（CodeBuddy）。
- MCP：`~/.workbuddy/mcp.json`、`.workbuddy/mcp.json`；`~/.codebuddy/mcp.json`（待核）。
- 指令：`AGENTS.md`；CodeBuddy 还有 `CODEBUDDY.md`、`.codebuddy/CODEBUDDY.md`。
- 插件：`.codebuddy-plugin/plugin.json`；市场 `.codebuddy-plugin/marketplace.json`；运行时读 `plugins/cache/<marketplace>/<plugin>/<version>`，`plugins/marketplaces/<marketplace>/` 只是源快照，不是安装根；`installed_plugins.json`、`known_marketplaces.json`、`settings.json` → `enabledPlugins`。
- 作用域：`user | project | local | managed`；team 是产品分发概念，不是 `PluginPlace.scopeWord`。
- 组件：skills、commands、agents、hooks、MCP、output-styles；themes/monitors 只被识别、不加载/不运行。
- 插件能力：依赖声明、传递安装、semver、`bin/` PATH、`${CODEBUDDY_PLUGIN_ROOT}`、`defaultEnabled`。
- WorkBuddy 的 Coding 模式复用 `.codebuddy/` 项目配置；用户级根分别是 `~/.workbuddy` 与 `~/.codebuddy`。

### Qoder（P1）

- Skills：`.qoder/skills/`、`~/.qoder/skills/`。
- MCP：`~/.qoder/mcp.json` 或 `settings.json`（版本间有差异，实施前核）。
- 指令：`AGENTS.md`；项目 `.qoder/rules/`。
- 插件：`.qoder-plugin/plugin.json`；组件 commands、agents、skills、hooks、output-styles、workflows、MCP。
- 安装：`qodercli plugin install`；作用域 user / project / local；已安装清单读 `~/.qoder/plugins`。
- 兼容：插件格式与 Claude 插件互通；市场名取自 `.claude-plugin/marketplace.json`。

### ZCode（P0）

- Skills：`~/.zcode/skills/`、`.zcode/skills/`；同时读 `~/.agents/skills/`、`.agents/skills/`；同级 `.zcode` 优先于 `.agents`。
- 子代理：`~/.zcode/agents/*.md`、`.zcode/agents/*.md`（Claude 风格 frontmatter）；`loadZCodeAgentProfiles` 两处都读，插件 agents 已真实运行，旧文档的 diagnostic-only 已过时。
- MCP：CLI 用 `~/.zcode/cli/config.json` 与 `.zcode/config.json` 的 `mcp.servers`；桌面端用户级走 `~/.agents/mcp.json`（`mcpServers` 键，Claude 兼容）。
- 指令：`~/.zcode/AGENTS.md`、`AGENTS.md`。
- 插件：`.zcode-plugin/plugin.json`（推荐），回退 `.claude-plugin/plugin.json`；组件 `commands/`、`skills/`、`agents/`、`hooks/hooks.json`、`.mcp.json`；manifest 支持 `dependencies` 与 `userConfig`。
- 安装：`~/.zcode/cli/plugins/`（市场索引、安装记录、`cache/`、`data/`）；`zcode plugins install/enable/disable/update/uninstall`，作用域 `user | workspace`；`zcode plugins list --json`。
- 安装记录：`installed_plugins.json` 是 `{version:1, plugins:[{id,name,marketplace,version,installPath,installedAt,updatedAt,scope}]}`；`known_marketplaces.json` 是 `{version:1, marketplaces:[...]}`。与 Claude 的 map-of-arrays 不同，不能复用同一份读写。
- 作用域模型：install/uninstall 是 Host user 动作；project 只有 enable/options。`PluginPlace` 没有 switch-only 能力，v1 只提供 user 安装 place，project place 列为宿主前置。
- MCP 字段：新格式用 `enabled`（旧资料里的 `enable` 已过时）。
- 市场：`marketplace.json`；插件商店预装 Claude Code 市场，可直接浏览安装 Claude 插件。
- 关键：ZCode 的清单回退路径和插件商店都吃 Claude 格式，**Claude 插件包基本可以直接复用**；差异在安装根、安装记录、启用文件和 `mcp.servers` 的 MCP 结构。
- native-only 分级：只带 `.zcode-plugin/plugin.json` 的包不在 `PLUGIN_MANIFESTS` 里；标准布局（默认 commands/skills 等）可能被 `hasStandardComponents` 收录，但 `readManifestFields` 读不到 name/version/description；manifest 自定义路径或 inline MCP 的包会漏。v1 用双清单/Claude/Codex 包，完整原生收录列为宿主共享契约前置。

### TraeCode CLI 2.0（P1）

- 形态：IDE、VS Code 插件版、CLI 三种，路径不同：
  - IDE：`~/.trae-cn/`（全局）、`.trae/`（项目）
  - 插件版：`~/.marscode/`（全局+项目）
  - CLI：`~/.traecli/` 或 `$TRAE_HOME`（默认 `~/.trae`，版本间有差异）
- Skills：`<root>/skills/`。
- MCP：Trae IDE 走 `.trae/mcp.json`；CLI 走 Codex 式配置。
- 插件：`traecli plugin install`；市场 `traecli plugin marketplace add`；安装到 `$TRAE_HOME/plugins/cache/<marketplace>/<plugin>/<version>/`；`traecli.toml` 记录 `[marketplaces.*]` 和 `[plugins."name@marketplace"]`。
- 关键：CLI 2.0 是 Codex 分支，插件格式与 Codex 兼容，可复用 Codex 安装器的结构。

### Kiro（P1）

- Skills：`.kiro/skills/`、`~/.kiro/skills/`。
- MCP：`~/.kiro/settings/mcp.json`（旧 Powers 会把 MCP 写这里）。
- 指令：`.kiro/steering/`。
- 插件：Powers；Agent Plugins 格式（根 `plugin.json` + `skills/` + `mcp.json`）或旧 `POWER.md`。
- 安装：IDE 面板 / `kiro.dev/powers` / GitHub URL / 本地目录；用户级 powers 目录（路径待核）。
- 注意：Agent Plugins 格式的 MCP 由 Kiro 内部管理，不写 `mcp.json`；旧格式才写 `~/.kiro/settings/mcp.json`。

### Factory Droid（P1）

- Skills：`.factory/skills/`、`~/.factory/skills/`。
- MCP：`~/.factory/mcp.json`、`.factory/mcp.json`。
- 指令：`.factory/rules/`、`FACTORY.md`。
- 插件：`.factory-plugin/plugin.json`；项目 `.factory/plugins/`、用户 `~/.factory/plugins/`；缓存 `<...>/cache/<marketplace>/<plugin>/<version>`。
- 市场：`.factory-plugin/marketplace.json`，回退 `.claude-plugin/marketplace.json`；兼容 Claude 插件并翻译布局。
- 作用域：org / project / user；`enabledPlugins` + `extraKnownMarketplaces`。

### Cline / Kilo / Amp / Continue / Windsurf（P2）

- **Cline**：skills（`.cline/skills`）、MCP、`.clinerules`；插件是 SDK 代码插件，`cline plugin install` 到 `~/.cline/plugins`。
- **Kilo**：skills（`.kilocode/skills`）、MCP、agents、rules；Marketplace 有 skills/agents/MCP，但 plugin 是 npm 代码。
- **Amp**：skills（`.agents/skills`、`~/.config/amp/skills`）、AGENTS.md、MCP（`~/.config/amp/settings.json`）；插件是 TS 代码。
- **Continue**：`.continue/skills`、`.continue/prompts`、`.continue/rules`、`.continue/mcpServers`；配置是 `config.yaml`，MCP 是 YAML 数组，现有 JSONC/TOML 工具不支持。
- **Windsurf**：skills（`.windsurf/skills`）、rules（`.windsurf/rules`）、workflows、MCP（`~/.codeium/windsurf/mcp_config.json`）；没有原生插件系统。

---

## 对 hub 的实现含义

现有 `PluginInstaller` 契约（`packages/resources/plugins/src/provider.ts`）已经支持：
- `PluginPlace`：作用域 + 客户端自己的 scope 词 + 是否可切换 + 切换文件 + 覆盖链；
- `install / remove / setEnabled / list / held`；
- 文件落盘（`PluginDisk`）或调客户端的 CLI（`tools.run`）；
- 市场索引写入（`syncMarketplace`）。

所以要接一个新 Agent 的插件系统，只需要一个安装器实现，不需要改插件模块。

**环境根限制：** `PlaceFiles` 只有 home / workspace 两个根，没有 env root。客户端用环境变量改配置根时（Copilot 的 `COPILOT_HOME`、OpenCode 的 `XDG_CONFIG_HOME` / `OPENCODE_CONFIG_DIR`），普通 places 无法透传；v1 只支持默认根，自定义根单列宿主前置。

**Place 能力缺口：** `PluginPlace` 没有 `installable` / `readOnly`，UI 默认对每个 place 提供安装 / 卸载；ZCode 这类「项目级只能启停、不能安装」的客户端无法诚实表达。`PluginHeld.enabled` 又是必填 `boolean`，Cursor 这类无法从文件确定启停态的客户端只能猜。通用修法是 `PluginPlace.installable?: boolean`（默认 true）、`McpPlace.readOnly?: boolean` 和 `PluginHeld.enabled?: boolean`（UI 显示未知）；v1 未落地前，ZCode 只提供 user 安装 place，MCP 只注册 native 两处，Cursor 的 installer 保持阻塞。

**文件安装端口的限制：** `packages/resources/plugins/src/host/installer-files.ts` 的 `PluginDisk.commit(copy)` 只接受 `cache/<market>/<name>/<version>` 四段，`removeDirectory` 只接受 `cache/...`。因此 `local/<name>`（Cursor）、`installed-plugins/<market>/<name>`（Copilot）、`plugins/<name>`（Antigravity）、`~/.zcode/cli/plugins/...`（ZCode）、WorkBuddy 的非标准 cache 形状都不能直接用文件端口安装。v1 优先走客户端自己的 CLI；没有非交互 CLI 的（Cursor，可能还有 WorkBuddy），要么把安装目标做成声明驱动的段模板（宿主共同前置），要么 v1 不做插件安装。

**复制后不能改 cache：** `installer-files.ts:240-247` 在 copy 前算 `sourceHash`，copy 后 staged 必须等于 source；`changes` 在 copy 之后写。所以安装器不能在 cache 里生成或改写客户端清单（`.codebuddy-plugin`、`.zcode-plugin`、`.cursor-plugin` 等），否则下一次同版本安装会判 cache/source 不同而失败。v1 只能原样复制客户端也能读的包（Claude / Agent Plugins / 双清单）；自动生成清单要作为通用「install payload overlay」前置，overlay 必须参与 copy 快照与 hash，不能在 copy 后另写。

**Skills 共享入口只有 workspace：** `packages/resources/skills/src/extension.ts` 的 `SHARED_PLACE` 是 `scope: "workspace"`、`dir: ".agents/skills"`，没有 global `~/.agents/skills` 的内置 place。读取 global `.agents/skills` 的 Agent 需要自己注册对应的 global place，不能声称内核已经有。

**包发现的前置条件：** `packages/resources/plugins/src/contract.ts` 的 `PLUGIN_MANIFESTS` 当前只认 `.claude-plugin/plugin.json`、根 `plugin.json`、`.codex-plugin/plugin.json`。客户端私有 manifest（`.cursor-plugin`、`.codebuddy-plugin`、`.qoder-plugin`、`.factory-plugin`、`.zcode-plugin`）不会被 hub 的插件库扫描识别。标准布局包（默认 `skills/commands/agents/hooks/.mcp.json`）仍可能被 `hasStandardComponents` 收录，但 `tools.describe` 拿不到私有 manifest 的元数据；自定义组件路径的包可能在收录入口就被拒绝。v1 要么让包同时带一个已识别的 manifest，由安装器翻译成客户端格式；要么把「识别该私有 manifest」列为宿主侧独立改动，不在扩展里暗改宿主。

**建议的复用顺序：**

1. **先写 Agent Plugins 1.0 的包生成**。一份 `plugin.json` + `skills/` + `mcp.json` 可以被 Cursor、Copilot、Codex、Kiro、Qwen Code、VS Code 读取；安装 / 启用 / 更新仍按客户端各写一个安装器。包生成覆盖 P0 的 Cursor、Copilot 和 P1 的 Kiro、Qwen。
2. **再写 Claude 格式的安装器**。Claude Code 已经在用；Codex、Copilot、Factory、Qoder 能读或翻译 `.claude-plugin`；ZCode 的清单直接回退到 `.claude-plugin/plugin.json`，插件商店还预装了 Claude Code 市场。这一份覆盖 ZCode 和 Qoder 的插件包。
3. **客户端私有格式各写一个薄适配器**：Antigravity、WorkBuddy/CodeBuddy、Trae。它们组件语义相近（skills / commands / agents / hooks / MCP），差异主要在清单路径、安装根和启用文件。
4. **代码插件（OpenCode / Cline / Amp）不接插件包**。OpenCode 是 P0，但只交付 skills / MCP / commands / agents / memory；Cline 和 Amp 同理。插件包要等它们支持 Agent Plugins，或把桥接插件作为可选依赖。

**成本参考：**
- Codex 插件：`src/` 约 970 行，`__test__/` 约 625 行（含 MCP provider、prompt provider、安装器）。
- Claude Code 插件：约 3,300 行（多出安装器和状态解析）。
- 纯资产插件（无安装器）：5–8 个源文件 + 测试，明显低于上面两个。
- 插件安装器的主要成本不在写文件，而在**核对客户端自己怎么记录启用状态**（`enabledPlugins`、`installed_plugins.json`、`known_marketplaces.json`、`traecli.toml` 各不相同）。

**一次性收益：**
- Agent Plugins 1.0 安装器写一次，覆盖多家；
- Codex 安装器改一个 `TRAE_HOME` / 配置路径即可服务 TraeCode CLI；
- Claude 格式包可被 Qoder、Factory、Copilot 直接读取或翻译。

---

## 待验证清单（实施前必须核）

1. **Cursor 项目级插件安装目录**：官方只写了 `~/.cursor/plugins/local`，项目级市场安装的实际落点未确认。
2. **Qoder 用户级安装目录**：`~/.qoder/plugins` 来自第三方工具，官方文档未直接写死。
3. **Kiro 用户级 Powers 目录**：官方只说「用户 powers 目录」，未给出绝对路径。
4. **Trae 三种形态的根目录**：`~/.trae-cn`、`~/.marscode`、`~/.traecli`、`~/.trae` 在不同版本/文档里不一致。
5. **CodeBuddy / WorkBuddy 的 `mcp.json` 用户级路径**：官方只明确了 `.codebuddy-plugin` 与插件缓存，MCP 文件仍以 `~/.workbuddy/mcp.json` 为主，CodeBuddy 侧待核。
6. **Antigravity 插件启用状态文件**：`/plugin` 管理器和 `import_manifest.json` 的分工未完全确认。
7. **各客户端的 `enabledPlugins` 键名格式**：`name@marketplace` 还是别的，需用真实安装验证。
8. **ZCode 桌面端与 CLI 的 MCP 路径**：桌面端用户级是 `~/.agents/mcp.json`（`mcpServers`），CLI 是 `~/.zcode/cli/config.json` 的 `mcp.servers`；两套结构都要覆盖。
9. **OpenCode 目标版本**：已确认 v2 是主线；v1/v2 的 MCP 结构、`enabled`/`disabled`、timeout、OAuth、`skills`/`commands`/`agents` 键都不同。计划锁定 v2，v1 单列。仍需在本机用 `opencode --version` 和一个真实配置验证写入后能被 v2 读取。

---

## 来源

- Agent Plugins 1.0 兼容客户端：https://agent-plugins.org/compatible-clients
- Agent Plugins 发布报道：https://agentmarketcap.ai/blog/2026/08/07/agent-plugins-1-0-open-standard-agent-add-ons
- Gemini CLI → Antigravity CLI：https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
- Antigravity 插件：https://antigravity.google/docs/cli/plugins
- Antigravity 自定义发现：https://antigravity.google/docs/customization-discovery?tab=cli
- Antigravity 迁移：https://antigravity.google/docs/cli/gcli-migration
- Cursor 插件：https://cursor.com/docs/plugins.md?raw=1
- Cursor 插件参考：https://cursor.com/docs/reference/plugins.md?raw=1
- GitHub Copilot CLI 插件参考：https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference
- GitHub Copilot 配置目录：https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference
- Qwen Code 扩展：https://qwenlm.github.io/qwen-code-docs/en/users/extension/introduction/
- Qwen Code Agent Plugins：https://qwenlm.github.io/qwen-code-docs/en/users/extension/agent-plugins/
- WorkBuddy 插件市场：https://www.workbuddy.cn/docs/cli/plugin-marketplaces
- WorkBuddy 插件体系（社区复盘）：https://release-assets.githubusercontent.com/github-production-release-asset/1335574883/aaa080ad-6748-42d2-935e-e685c6218586
- CodeBuddy 插件市场：https://www.codebuddy.cn/docs/cli/plugin-marketplaces
- CodeBuddy 插件系统：https://www.codebuddy.cn/docs/enterprise/219308991782588416
- CodeBuddy `.codebuddy` 目录：https://www.tencentcloud.com/document/product/1316/84431
- Qoder 插件参考：https://docs.qoder.com/cli/plugins-reference
- Qoder 配置作用域：https://docs.qoder.com/cli/config-scope
- TraeCode CLI：https://docs.trae.cn/cli_get-started-with-trae-code-cli-2
- Trae 插件/技能/MCP：https://docs.trae.cn/cli_tools-and-extensions
- Trae 插件市场：https://docs.trae.cn/ide_marketplace
- Kiro Powers 安装：https://kiro.dev/docs/powers/installation/
- Factory Droid 插件：https://docs.factory.ai/harness/plugins
- Factory 插件作用域（DeepWiki）：https://deepwiki.com/factory-ai/factory/6-extensibility
- OpenCode 插件：https://opencode.ai/docs/plugins/
- OpenCode Agent Plugins Issue：https://github.com/anomalyco/opencode/issues/40993
- Cline 插件：https://docs.cline.bot/sdk/plugins
- Cline 插件安装：https://docs.cline.bot/sdk/plugin-install
- Kilo 插件：https://kilo.ai/docs/automate/extending/plugins
- Kilo Marketplace：https://kilocode-landing.vercel.app/docs/customize/marketplace
- Amp 插件：https://ampcode.com/docs/customize/plugins
- Continue config.yaml：https://docs.continue.dev/reference
- Windsurf 无插件系统（第三方对照）：https://cdn.jsdelivr.net/npm/aiwg@2026.9.20/docs/providers/marketplace.md
- ZCode 插件：https://zcode.z.ai/en/docs/plugin
- ZCode CLI 插件：https://raw.githubusercontent.com/zai-org/ZCode/master/apps/zcode-cli/docs/usage/10-plugins.md
- ZCode CLI Skills：https://raw.githubusercontent.com/zai-org/ZCode/master/apps/zcode-cli/docs/usage/08-skills.md
- ZCode CLI MCP：https://raw.githubusercontent.com/zai-org/ZCode/master/apps/zcode-cli/docs/usage/07-mcp.md
- ZCode 路径实测（Tencent teamai-cli）：https://github.com/Tencent/teamai-cli/issues/461
- OpenCode 2.0 插件 API 变更：https://agenticcontrolplane.com/blog/opencode-2-plugin-api-changes
