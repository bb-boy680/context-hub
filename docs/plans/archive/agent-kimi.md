# 接入 Kimi Code CLI 扩展

状态：待审批。本文只写实施计划，尚未开发源码、安装依赖、修改客户端配置、启动服务或提交 Git。

日期：2026-11-03。实施仓库：`D:/work-space/context-hub-extensions`；宿主仓库：`D:/work-space/dsh-context-hub`。

## 结论与唯一协议

接入对象是 **[Kimi Code CLI](https://github.com/MoonshotAI/kimi-code)**，npm 包 `@moonshot-ai/kimi-code`，调研时官方 latest 为 **2.4.1**（2026-10-30）。它是有本地文件协议的终端 Agent，具备原生插件系统，不能只按“资产交付”处理。

只实现这一套当前协议：

- 不接已归档的 Python [Kimi CLI](https://github.com/MoonshotAI/kimi-cli)，不读 `~/.kimi/`。
- 不把 PyPI `kimi-code` 当作新产品。
- 不读 Claude / Codex / Cursor 清单作为 Kimi 插件回退。
- 不实现 `kimi.plugin.json` 与 `.kimi-plugin/plugin.json` 之外的迁移或别名。
- 不声称已在本机真实加载；本机 `kimi --version` 当前因 npm shim 目标缺失而报 `MODULE_NOT_FOUND`，只能作为后续人工验证项。

首版覆盖 **skills、MCP、instructions、agents、原生插件安装** 五个注入点。真实客户端和隔离客户端启动不是开发阻断；文件级测试、typecheck、构建和源码审查仍是完成条件。

## 现有行为与接入点

扩展通过服务注册接入，不在宿主增加 Kimi 特判：

- `plugins/opencode/src/index.tsx:apply` 只调用注入的 `skills`、`mcp`、`prompts`、`targets`、`locales`；`plugins/claude.code/src/index.tsx:apply` 额外调用 `plugins.register`。新扩展沿用同一形状。
- `packages/resources/plugins/src/provider.ts:PluginService` 提供 `register(installer)` 与 `registerManifests(paths)`；注册随扩展卸载自动摘除。
- `packages/resources/plugins/src/contract.ts:PLUGIN_MANIFESTS` 当前只认 `.claude-plugin/plugin.json`、根 `plugin.json`、`.codex-plugin/plugin.json`；`pluginManifestPaths()` 会把扩展注册的路径追加到默认列表之后。
- `packages/resources/plugins/src/host/installer-files.ts:directoryAllowed` 的目录模板是 `cache/*/:name/*` 加 `PluginDiskDeclaration.directories`；因此 Kimi 的 `managed/:name` 可以用声明表达，不需要宿主新增客户端分支。
- `installer-files.ts:commit` 已支持 `copy.before`、`replace`、`manifests`、源/目标快照、失败回滚；`roots()` 已支持 `homeEnv` 与 `stateEnv`。
- `packages/resources/mcp/src/provider.ts:McpProvider` 以 `PlaceFiles` 读写固定文件；`McpPlace.installable` 与 `switchable` 已存在。
- `packages/resources/prompts/src/provider.ts:PromptProvider` 支持目录表单和标记段指令；`workspace-provider.ts` 已负责工作区根 `AGENTS.md`，本扩展不得重复注册。
- `packages/resources/skills/src/extension.ts:SHARED_PLACE` 已负责工作区 `.agents/skills`，本扩展不得重复注册。
- `packages/core/src/host/place-files.ts:createFsPlaceFiles.write` 调用 `writeFileAtomic`；`packages/core/src/host/atomic.ts` 会递归创建父目录，因此 `.kimi-code/mcp.json` 首次写入不需要额外宿主能力。

## 证据与未知项

官方 main 文档与 `store.ts`/`manager.ts` 源码已核对，2.4.1 的 plugins 文档已抽查；未在真实客户端运行。

| 文档 | 采用内容 |
| --- | --- |
| [Skills](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/skills.md) | 用户 `$KIMI_CODE_HOME/skills/`、`~/.agents/skills/`；项目 `.kimi-code/skills/`、`.agents/skills/`；`SKILL.md` 前端字段 |
| [MCP](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/mcp.md) | 用户 `$KIMI_CODE_HOME/mcp.json`、项目 `.kimi-code/mcp.json`；`mcpServers`；`command/args/env`、`url/headers`、`transport:"sse"`、`enabled` |
| [Agents](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/agents.md) | 用户 `$KIMI_CODE_HOME/agents/`、`~/.agents/agents/`；项目 `.kimi-code/agents/`、`.agents/agents/`；agent 文件前端的 `description` 必填，`name` 可省略 |
| [Plugins](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/plugins.md) | `kimi.plugin.json` 优先、`.kimi-plugin/plugin.json` 次选；用户 `plugins/managed/<id>/`；插件只有用户级；`/plugins` 管理；安装/启停后需 `/reload` 或新会话 |
| [Data locations](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/configuration/data-locations.md) | `KIMI_CODE_HOME` 默认 `~/.kimi-code`；`plugins/installed.json` 记录安装与启用态 |
| [`store.ts`](https://github.com/MoonshotAI/kimi-code/blob/main/packages/agent-core-v2/src/app/plugin/store.ts) | `InstalledFile = {version:1, plugins: InstalledRecord[]}`；`readInstalled`/`writeInstalled` 的字段与 2 空格 JSON 格式 |
| [`manager.ts`](https://github.com/MoonshotAI/kimi-code/blob/main/packages/agent-core-v2/src/app/plugin/manager.ts) | 安装记录字段 `id/root/source/origin/enabled/installedAt/updatedAt/originalSource`；`remove` 只删记录；`setEnabled` 只改 `enabled/updatedAt`；新会话或 `/reload` 才生效 |
| [CLI](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/reference/kimi-command.md) | `kimi --version`、`kimi doctor`、`kimi -p`；插件没有非交互 `kimi plugins` 子命令 |

`main` 文档可能领先 2.4.1。阶段 0 以 2.4.1 tag 的文档和源码复核；若与 main 冲突，以 2.4.1 为准并在 README 记录 commit/tag。

## 资产与文件行为

| 资源 | 用户级 | 工作区级 | 注册范围 |
| --- | --- | --- | --- |
| Skills | `~/.kimi-code/skills/<name>/SKILL.md` | `.kimi-code/skills/<name>/SKILL.md` | 一个 global、一个 workspace；工作区 `.agents/skills` 由宿主共享 skills provider 负责；全局 `~/.agents/skills` 见 H2 |
| MCP | `~/.kimi-code/mcp.json` | `.kimi-code/mcp.json` | 两个固定文件 place，均可安装、可启停；插件内 `mcpServers` 随插件包，不由 MCP 页管理 |
| Instructions | `~/.kimi-code/AGENTS.md` | `.kimi-code/AGENTS.md` | 两个 prompt place 的 `instructions` 表单；工作区根 `AGENTS.md` 由共享 prompts provider 负责；全局 `~/.agents/AGENTS.md` 见 H3 |
| Agents | `~/.kimi-code/agents/<slug>.md` | `.kimi-code/agents/<slug>.md` | 两个 prompt place 的 `agent` 表单；工作区 `.agents/agents` 由共享 prompts provider 负责；全局 `~/.agents/agents` 见 H3 |
| Plugins | `~/.kimi-code/plugins/installed.json` + `managed/<pack>/` | 客户端当前不支持项目级插件 | 一个 user place；插件内部 commands/hooks/systemPrompt 随包交付，Hub 不单独管理 |
| 不触碰 | `~/.kimi-code/SYSTEM.md` | 根 `AGENTS.md` 的共享写入 | `SYSTEM.md` 是完整系统提示替换，风险高，本扩展不提供写入入口；根 `AGENTS.md` 不重复写 |

`KIMI_CODE_HOME` 自定义值：插件安装器可用 `homeEnv` 透传；普通 skills/MCP/prompts/agents 的位置契约只有 home/workspace，v1 只覆盖默认 `~/.kimi-code`。这不是放弃能力：H1 给出通用宿主改动，落地后同一扩展可直接支持自定义根，不需要 Kimi 特判。

## 能力矩阵

| 能力 | v1 交付 | 证据 | 缺口与后续 |
| --- | --- | --- | --- |
| Skills（原生两目录） | 完整：读取、投递、计数、删除 | [Skills 文档](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/skills.md) | 无 |
| Skills（工作区 `.agents/skills`） | 由共享 provider 覆盖，不重复注册 | `skills/src/extension.ts:SHARED_PLACE` | 无 |
| Skills（全局 `~/.agents/skills`） | v1 不注册，避免与未来共享 place 重复 | 同上 | H2：通用全局共享 skills place |
| MCP（两个原生文件） | 完整：读、装、卸、`enabled` 开关、行定位 | [MCP 文档](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/mcp.md) | 无 |
| MCP（跨文件最终生效态） | 按文件展示声明与开关 | 项目同名覆盖用户 | H5：通用 place 优先级元数据；v1 不假装知道最终合并结果 |
| MCP（插件内声明） | 随插件包安装，由 Kimi `/plugins mcp` 管理 | [Plugins 文档](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/plugins.md) | 不在 Hub MCP 页伪造条目 |
| Instructions（`.kimi-code/AGENTS.md`） | 完整：标记段增删 | [Agents 文档](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/agents.md) | 无 |
| Instructions（全局 `~/.agents/AGENTS.md`） | v1 不注册 | 同上 | H3：通用全局共享 prompts place |
| Agents（`.kimi-code/agents`） | 完整：agent 文件增删 | 同上 | 无 |
| Agents（工作区 `.agents/agents`） | 由共享 provider 覆盖 | `prompts/src/workspace-provider.ts:DELIVERY` | 无 |
| Agents（全局 `~/.agents/agents`） | v1 不注册 | 同上 | H3：通用全局共享 prompts place |
| Plugins（用户级安装/启停/移除/列表） | 完整：写 `installed.json` + 复制 `managed/` | [Plugins 文档](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/plugins.md)、`store.ts`、`manager.ts` | 无 |
| Plugins（项目级） | 不做 | 官方明确“not yet supported” | 等客户端支持后再评估，不用文件猜测 |
| Plugins（详情页内容） | 安装可用；详情页可能少显示自定义组件 | `plugins/src/host/contents.ts` 只认 `skills/`、`commands/`、根 `.mcp.json`；`PackContents` 没有 agents 字段 | H4：通用读取 manifest 声明路径与 `mcpServers`；agents 需扩展 `PackContents` |
| Plugins（hooks/systemPrompt/sessionStart） | 随包安装生效，Hub 不单独展示或开关 | [Plugins 文档](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/plugins.md) | 无写入协议；展示按需扩展 |
| Plugins（市场索引） | 可选写 `kimi-marketplace.json` | 官方 `/plugins marketplace <本地路径>` 接受 `{version:"2",plugins:[...]}` | 不驱动 TUI；用户自行打开 |
| Plugins（包图标） | 使用扩展自身图标；包行可能无图 | Kimi manifest 未见 `icon` 字段 | H6：官方若公布图标字段再接入，不猜字段 |

## 通用宿主依赖

这些改动都不含 Kimi 目录名或字段名，属于共享契约；本扩展不自行修改宿主。

| 编号 | 依赖 | 当前状态 | v1 处理 | 后续路径 |
| --- | --- | --- | --- | --- |
| H1 | 普通资产位置的环境变量根 | `PlaceFiles` 只有 home/workspace；`SkillPlace`/`McpPlace`/`PromptPlace` 没有 env root | 只覆盖默认 `~/.kimi-code` | 给 place 增加可选 `rootEnv`（或等价通用能力），由宿主统一解析；落地后 Kimi 资产自动支持 `KIMI_CODE_HOME` |
| H2 | 全局共享 skills place | 只有工作区 `.agents/skills` 的 `SHARED_PLACE` | 不重复注册全局 `~/.agents/skills` | 在 skills 模块增加一个 `scope:"global", dir:".agents/skills"` 的共享 place；所有读该目录的客户端共用 |
| H3 | 全局共享 prompts/agents place | `workspace-provider.ts` 只覆盖工作区 `.agents` 与根 `AGENTS.md` | 不硬编码全局 `~/.agents` 到 Kimi 扩展 | 在 prompts 模块增加全局 `.agents/AGENTS.md` 与 `.agents/agents` 共享 place |
| H4 | 插件详情读取声明式组件 | `host/contents.ts` 只认固定目录与 `.mcp.json`；`PackContents` 只有 skills/commands/mcp | 安装不受影响，详情页可能少列 | 让 `contents.ts` 读取已注册 manifest 的 `skills`/`agents`/`commands` 路径与 `mcpServers`；给 `PackContents` 补 agents 字段；通用解析，不区分客户端 |
| H5 | MCP 跨文件生效态 | `McpPlace` 只有 `installable`/`switchable`，没有 `overrides` | 按文件展示，不声称最终合并结果 | 参照 `PluginPlace.overrides` 增加通用优先级元数据，由 MCP 页表达 |
| H6 | 插件包图片 | `describe.ts` 只读 manifest `icon`；Kimi 文档未给该字段 | 使用扩展自身图标；包行可无图 | 等官方公布图标字段或约定后再读，不猜 `interface` 里的键 |
| H7 | 插件安装端口 | `PluginDiskDeclaration.directories`、`registerManifests`、`snapshotDirectory`、`copy.manifests`、`PluginTools.has` 均已存在 | 直接使用 | 无宿主改动 |

归纳：插件安装只依赖 H7（当前源码已具备）；MCP 只依赖现有 `McpPlace`/`PlaceFiles`；默认根资产已可交付。H1–H3 扩大配置根与共享位置，H4–H6 只改善展示，均不阻塞 v1。

## 原生插件语义（实施前必读）

1. `installed.json` 是唯一记录源，形状为 `{version:1, plugins:[...]}`。版本不是 `1` 时拒绝写入，不迁移。
2. 记录字段：`id`（manifest `name` 小写化）、`root`（`managed/<folder>` 的绝对路径）、`source:"local-path"`、`originalSource`（Hub 库中 pack 的绝对路径）、`origin:"custom"`、`enabled`、`installedAt`、`updatedAt`。保留记录中已有的 `capabilities`、`github`、`catalogId` 和未知字段。
3. Kimi 的 `remove` 只删除记录，**不删除 `managed/` 副本**。Hub 的 `remove` 必须沿用该语义，报告里写明副本仍在。
4. `setEnabled` 只改目标记录的 `enabled` 与 `updatedAt`，保留其他记录和未知字段，不重排文件。
5. 安装目录由 `PluginDiskDeclaration.directories: ["managed/:name"]` 表达；`copy.name` 必须是 Hub 库中的 pack 名，因此目标固定为 `managed/<packName>`。`id` 取 manifest `name` 小写化后的值，不假设两者相同。
6. 已存在同 `id` 记录时，只有 `source:"local-path"` 且 `originalSource` 规范化后指向 Hub 库的重装才允许继续；`root` 不同，或记录来自 Kimi 自身的 zip/GitHub 安装时拒绝，要求用户先在 Kimi 中移除；不做自动迁移或删除旧副本。
7. manifest 名必须匹配 Kimi 的 `^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:@[A-Za-z0-9_-]+)?$`。不匹配时拒绝，不生成别名。
8. 安装后用 `/reload` 或新会话才生效；Hub 不报告“已加载”。Kimi 运行中可能覆盖 `installed.json`，安装器用 `before` 文本快照拒绝并发写入，并提示关闭客户端后重试。
9. 不调用 `kimi` CLI：官方没有非交互插件管理子命令；文件写入是唯一可证实的路径。安装不依赖 marketplace；可选便利索引见阶段 5。不假设 `KIMI_CODE_PLUGIN_MARKETPLACE_URL` 接受本地 Hub 路径。
10. 插件内 MCP 的逐 server 开关由 Kimi 的 `/plugins mcp enable|disable` 管理，Hub 首版不提供该开关。

## 阶段

### 阶段 0：锁定版本与宿主 API

目标：确认后续阶段依赖的官方事实和宿主符号都存在。

动作：

- 只读执行 `npm view @moonshot-ai/kimi-code version dist-tags`，记录 2.4.1 与 canary。
- 只读读取 2.4.1 tag 的 `docs/en/customization/{plugins,skills,mcp,agents}.md`，确认与 main 无冲突；有冲突时以 tag 为准。
- 在宿主仓用 `rg -n "directories|registerManifests|snapshotDirectory|manifests|has\\(program" packages/resources/plugins/src` 确认 `PluginDiskDeclaration.directories`、`PluginService.registerManifests`、`PluginDisk.snapshotDirectory`、`copy.manifests` 与 `PluginTools.has` 均存在。
- 确认扩展仓根脚本 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 存在（`context-hub-extensions/package.json`）。
- 记录本机 `where.exe kimi` 结果；当前 shim 损坏，不作为阻断。

验收：上述命令有输出并记入实施记录；任一宿主符号不存在时停止阶段 5，先按“不做”边界降级为只交付资产，并在 README 说明。

### 阶段 1：建立扩展骨架与图标

目标：得到一个可构建、可测试、尚未注册未实现能力的空扩展。

文件：

- 新增 `plugins/kimi/{plugin.yaml,package.json,build.mjs,tsconfig.json,vitest.config.ts,README.md,assets/,src/,__test__/}`。
- `src/index.tsx` 只注册 `targets` 与 `locales`；`src/contracts.ts` 只放实际用到的类型；`src/locations.ts` 放路径常量；`src/messages.ts` 放 `kimi.*` 中英文。
- `plugin.yaml`：`id: kimi`，名称 `Kimi Code`，`icon: assets/icon.png`，`category: agent`，`permissions: [assets.read, assets.write, filesystem]`，`inject: [targets, locales]`。
- `package.json` 复刻 `plugins/opencode/package.json` 的 `build/test/typecheck` 与 devDependencies；包名 `kimi`，版本 `0.1.0`，`main: lib/index.js`。
- `build.mjs`、`tsconfig.json`、`vitest.config.ts`、`__test__/react-jsx.ts` 按 `plugins/opencode/` 同形复制。
- 图标：执行 `cp D:/work-space/dsh-context-hub/docs/research/agent-icons/kimi.png D:/work-space/context-hub-extensions/plugins/kimi/assets/icon.png`，不得重绘或改色。

验收：`pnpm --filter kimi typecheck`、`pnpm --filter kimi test`、`pnpm --filter kimi build` 通过；`lib/index.js` 存在且只把 `react*` 作为 external；源/目标图标 `sha256sum` 相同（`59f90505d585b37ea216153859bf357dd5693997316a8ab30662794236b2c273`）。

### 阶段 2：注册 target 与 skills

目标：Agent 菜单出现 Kimi Code，skills 页能读写它的两个目录。

文件：`src/locations.ts`、`src/index.tsx`、`plugin.yaml`、`src/messages.ts`、`__test__/registration.test.ts`。

动作：

- `locations.ts` 定义 `KIMI_CODE_ID = "hub.target.kimi-code"`、`KIMI_SKILL_DIR = ".kimi-code/skills"`、`KIMI_GLOBAL_SKILL_DIR = ".kimi-code/skills"`、用户/项目位置表、`SUPPORTS = ["skill","mcp","memory","agent"]`。
- `index.tsx` 调用 `ctx.skills.register({ id, places: [...] })`，workspace 与 global 各一个 place，`order: 20`，图标指向 `/hub/extensions/kimi/assets/icon.png`。
- `ctx.targets.register` 的 `locations` 列出用户与项目路径；`format` 写明 “Markdown skills and agents; JSON MCP; AGENTS.md instructions; kimi.plugin.json plugins”。
- `plugin.yaml` 的 `inject` 增加 `skills`。

验收：`pnpm --filter kimi test` 覆盖 1 个 target、2 个 skill places、scope/dir 正确、未重复注册工作区 `.agents/skills`（全局 `.agents/skills` 留给 H2）；`pnpm --filter kimi typecheck`、`build` 通过。

### 阶段 3：实现 MCP provider

目标：读写 Kimi 的两个 `mcp.json`，保留文件其余内容。

文件：`src/provider.ts`、`src/contracts.ts`、`src/locations.ts`、`src/messages.ts`、`src/index.tsx`、`plugin.yaml`、`__test__/provider.test.ts`。

动作：

- `McpPlace` 两项：`kimi-mcp-global`（`scope:"global", file:".kimi-code/mcp.json", installable:true, switchable:true`）与 `kimi-mcp-project`（`scope:"workspace"` 同文件）。
- `read`：空文件返回 `[]`；非空但非法 JSON 抛 `McpError("kimi.error.parse")`；`mcpServers` 缺失返回 `[]`，存在但不是对象（含数组）时拒绝；每项用 `readDeclaration`，`enabled = entry.enabled !== false`。
- `install`：stdio 写 `command/args/env`；HTTP 写 `url/headers`；SSE 额外写 `transport:"sse"`。不写 `enabled`（缺省即启用）；同名条目已存在时保留其现有 `enabled`。
- 项目文件的同名条目覆盖用户文件；开关只写该 place 自己文件的 `enabled`，界面不声称跨文件的最终生效状态。
- 同名条目已有 `deferred`、`startupTimeoutMs`、`toolTimeoutMs`、`enabledTools`、`disabledTools`、`environment_id`、`bearerTokenEnvVar` 等未建模字段时：传输方式不变则保留这些键，只更新已建模字段与 `enabled`；传输方式改变则拒绝并保持文件不变，因为无法判断这些键是否仍适用。不猜测、不静默丢弃。
- `uninstall` 只删 `mcpServers[name]`，保留空容器与其余条目。
- `setEnabled`：`enabled === false` 写 `false`；启用时删除该字段（缺省即启用）；不存在该条目抛 `kimi.error.missingEntry`。
- `locate` 用 `jsonValueLines(text, ["mcpServers", name])`。
- `index.tsx` 调用 `ctx.mcp.register(createKimiMcp(ctx.mcp.tools))`；`plugin.yaml` 增加 `mcp`。

验收：`pnpm --filter kimi test` 覆盖两作用域读写、注释/未知字段保留、非法 JSON 原样、SSE、`enabled` 三态、同名安装保留 `enabled`、未建模字段同传输保留/跨传输拒绝、`locate`、首次创建 `.kimi-code/mcp.json`；`typecheck`、`build` 通过。

### 阶段 4：实现 prompts

目标：把提示词交付为 Kimi agent 文件或 `AGENTS.md` 标记段。

文件：`src/prompts.ts`、`src/locations.ts`、`src/messages.ts`、`src/index.tsx`、`plugin.yaml`、`__test__/prompts.test.ts`。

动作：

- 两个 place：workspace `.kimi-code`、global `~/.kimi-code`；`where` 分别 `.kimi-code` 与 `~/.kimi-code`。
- 只提供两种表单：`agent` 与 `instructions`。**不提供** `commands`、`rule`，因为官方没有独立于插件的用户命令目录或 rules 目录。
- `agent` 写 `.kimi-code/agents/<slug>.md`；内容用 `tools.commandFile({ name: tools.slugOf(prompt.name), description, body, frontmatter: true })`，确保 `name` 是 kebab-case，满足 Kimi 的 agent 名规则。不要写显示名，否则 Kimi 会跳过非 kebab-case 名称。
- `instructions` 写 `.kimi-code/AGENTS.md`，用 `tools.withSection`/`withoutSection`，只改本提示词的标记段。
- `held`：agent 文件存在即 true；instructions 段存在即 true。
- 工作区根 `AGENTS.md` 与工作区 `.agents/agents` 由共享 provider 负责，本扩展不注册；`SYSTEM.md` 不注册。
- `plugin.yaml` 增加 `prompts`。

验收：`pnpm --filter kimi test` 覆盖两作用域的 agent/instructions、标记段只改自己、删除后空文件处理、slug 化名称、拒绝未知表单；`typecheck`、`build` 通过。

### 阶段 5：实现插件安装器

目标：用 `installed.json` + `managed/` 完成用户级安装、启停、移除和列表。

文件：`src/plugin-state.ts`、`src/installer.ts`、`src/contracts.ts`、`src/locations.ts`、`src/messages.ts`、`src/index.tsx`、`plugin.yaml`、`__test__/installer.test.ts`。

动作：

- `KIMI_PLUGIN_ROOTS`：

  ```ts
  {
    home: ".kimi-code",
    homeEnv: "KIMI_CODE_HOME",
    state: "plugins",
    config: { write: [], read: [] },
    stateFiles: { write: ["installed.json", "managed/*"], read: ["installed.json"] },
    workspace: { write: [], read: [] },
    library: { write: [], read: ["*/kimi.plugin.json", "*/.kimi-plugin/plugin.json"] },
    directories: ["managed/:name"],
    external: [],
  }
  ```

- `plugin-state.ts`：`readInstalled` 缺失文件视为空；空文本、坏 JSON、`version !== 1`、`plugins` 非数组、记录 `id/root/enabled` 类型错误时抛错，不覆盖。`writeInstalled` 用 `JSON.stringify({...document, version:1, plugins}, null, 2)`，保留未知顶层字段与记录字段，不追加尾部换行（与 Kimi `writeInstalled` 一致）。
- `installer.ts`：
  - `places` 只有 `{ id:"kimi-user", label:"Kimi Code", scope:"global", scopeWord:"user", switchable:true, file:".kimi-code/plugins/installed.json" }`。
  - `available(tools)` 返回 `await tools.has("kimi")`；程序不存在时菜单不显示，不抛错。
  - `held(tools)`：读 `installed.json`，每条生成 `PluginHeld`：`name=id`、`id=id`、`version` 由 `tools.describe(record.root, id)` 补、`scope:"user"`、`enabled`、`marketplace:null`、`origin:"record"`、`source:{kind:"local",path:record.root}`、`pack` 由 `describe` 填充；`describe` 失败时保留空字段，不让整页报错。
  - `switches(tools)` 返回 `{ user: { [id]: enabled } }`。
  - `install(name, scope, tools)`：只接受 `user`。读取库中 `kimi.plugin.json`，缺失时读 `.kimi-plugin/plugin.json`；取 `name` 字段并校验 Kimi 正则、小写化为 `id`。已有同 `id` 记录时，只有 `source:"local-path"` 且 `originalSource` 规范化后指向 Hub 库的重装才允许继续；`root` 不同、或该记录来自 Kimi 自身的 zip/GitHub 安装时拒绝，要求用户先在 Kimi 中移除，不劫持别人的记录。目标 `managed/<name>`，`root` 用 `disk.path` 取绝对路径。`before = disk.snapshotDirectory(...)`。更新记录后调用 `disk.commit(roots, [installedChange], { name, destination, replace:true, before, manifests:["kimi.plugin.json", ".kimi-plugin/plugin.json"] })`。保留已有 `installedAt`、`enabled` 与未知字段；新记录 `source:"local-path"`、`origin:"custom"`、`enabled:true`。宿主 `pluginManifestPaths` 总把默认清单排在扩展注册之前，`tools.describe` 可能先读别的清单；安装器必须自己按 Kimi 顺序读 manifest，不能把 `describe` 的 name 当 Kimi id。
  - `remove(id, scope, tools)`：只删除 `installed.json` 中该记录，不调用 `removeDirectory`，报告说明 `managed/` 副本保留。
  - `setEnabled(id, scope, on, tools)`：只改该记录 `enabled` 与 `updatedAt`；未找到抛错。
  - 所有写入前核对 `tools.root()` 与 `roots.library` 未变；并发变化由 `commit` 的 `before` 拒绝。
  - 可选市场索引：安装成功后调用 `tools.syncMarketplace([{ path: "kimi-marketplace.json", document: { version: "2", plugins: packs.filter((pack) => KIMI_PLUGIN_NAME.test(pack.name)).map((pack) => ({ id: pack.name, displayName: pack.name, description: pack.description, version: pack.version, source: `./${pack.name}` })) } }])`。`KIMI_PLUGIN_NAME` 是安装校验共用的 manifest 名正则常量（不带 `g` 标志）。这是官方 `/plugins marketplace <本地路径>` 可读的便利索引；不替代直接安装，不驱动 TUI，也不声称“已加入市场”等于“已安装”。索引写入失败只记录警告，不回滚已完成的插件安装。
- `index.tsx` 调用 `ctx.plugins.registerManifests(["kimi.plugin.json", ".kimi-plugin/plugin.json"])` 后再 `ctx.plugins.register(createKimiInstaller(...))`。
- `plugin.yaml` 增加 `plugins`。

验收：`pnpm --filter kimi test` 覆盖安装、重复安装、manifest 名与库 pack 名不同、同名不同 root、Kimi 自身安装记录拒绝劫持、移除后副本仍在、启停保留未知字段、`installed.json` 版本/坏 JSON 拒绝、`before` 变化拒绝、`available`、可选市场索引的文档形状；测试只用临时目录，不触碰真实 `~/.kimi-code`。`typecheck`、`build` 通过。

### 阶段 6：补齐本地化与 README

目标：让扩展可独立发布，并如实说明边界。

文件：`src/messages.ts`、`README.md`、`plugin.yaml`。

动作：

- `messages.ts` 覆盖所有 `kimi.*` 键：target/tab、菜单、MCP 错误、prompt 错误、installer 错误；中英文各一份。
- README 写明：支持的五个注入点、默认根、`KIMI_CODE_HOME` 只对插件安装器生效、项目级插件不支持、`SYSTEM.md` 不管理、本扩展不把 `.claude` 资产当作 Kimi 位置（宿主默认清单识别不影响 Kimi 身份读取）、卸载保留 `managed/`、安装后需 `/reload`、图标来源与商标限制。
- `plugin.yaml` 的 `inject` 最终为 `[skills, mcp, prompts, plugins, targets, locales]`；`engines.contextHub` 沿用现有扩展范围前，先核对包含 `directories`/`registerManifests`/`snapshotDirectory` 的最小发布版本；核对不到时 README 标注开发版依赖，不写猜测版本。

验收：`pnpm --filter kimi test`、`typecheck`、`build` 通过；README 中每条“支持”都能在 `src/` 找到对应注册，“不支持”与本文“不做”一致。

### 阶段 7：扩展仓集成验收

目标：确认新包进入市场索引，且没有宿主特判或真实目录写入。

动作：

- 扩展仓执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`；记录市场索引包含 `kimi`，图标内联且不超过 32 KiB。
- 在宿主仓执行 `rg -n "kimi|kimi-code" packages --glob '!**/node_modules/**'`，确认除文档/本计划外没有宿主源码命中。
- 检查 `plugins/kimi` 中所有绝对路径只出现在测试临时根或 `locations.ts` 常量，不在运行时写死用户目录。
- 单列未验证项：真实 Kimi 加载、`/plugins list`、组件实际执行、项目级插件、`KIMI_CODE_HOME` 对普通资产、可选市场索引在 TUI 中的使用。

验收：四条根命令通过；`plugins/kimi/lib/index.js` 存在；图标 SHA-256 与源一致；未验证项没有写成“已通过”。

## 自审

- 每个阶段都有可执行命令或可观察断言，没有“验证一下”。
- 阶段顺序满足依赖：骨架 → target/skills → MCP → prompts → installer → 文档 → 集成；installer 依赖阶段 0 已确认的 `directories`/`snapshotDirectory`/`manifests`。
- 已覆盖调用方与测试：`index.tsx` 注册、`plugin.yaml` inject、`package.json` 脚本、`__test__`、市场构建、图标哈希。
- 未把官方文档未证实的能力写成已实现：项目级插件、`SYSTEM.md`、`.claude` 兼容、独立 commands/rules 均列为不做或等待官方协议；可选市场索引只写文档化 JSON，不驱动 TUI。
- 未扩大范围：不修改宿主源码，不修改其他扩展，不安装依赖，不启动客户端，不提交。

## 交付顺序与后续路径

v1 按阶段 1–6 交付：原生 skills、MCP、instructions、agents，用户级插件安装/启停/移除，以及可选市场索引。这些不依赖真实客户端，也不依赖 H1–H6。

宿主通用依赖按以下顺序推进，均不在本扩展内写 Kimi 特判：

1. H7 先行确认：阶段 0 按当前宿主源码核对；若目标发布版缺 API，v1 只交付资产并在 README 说明。
2. H1 环境变量根：落地后打开 `KIMI_CODE_HOME` 下的 skills/MCP/prompts/agents，扩展只增加 place 声明。
3. H2/H3 全局共享 place：落地后补 `~/.agents/skills`、`~/.agents/AGENTS.md`、`~/.agents/agents`，同一物理目录只注册一次。
4. H4/H5/H6 展示增强：插件详情组件、MCP 跨文件生效态、包图片；不影响安装、启停和资产投递。

证据不足时不写协议：项目级插件、独立 commands/rules、插件包图标字段都等待官方文档。在此之前只提供已证实的用户级安装、两个原生 MCP 文件、原生 skills/agents 目录与 `AGENTS.md`，以及宿主已有的共享工作区位置。

## 不做

- 本阶段不开发源码、不安装依赖、不启动服务、不修改真实客户端配置、不提交 Git。
- 不接旧 Python Kimi CLI，不读 `~/.kimi`，不做配置迁移。
- 不做 `.claude` / Claude / Codex / Cursor 清单回退或跨客户端翻译。
- 不驱动 Kimi TUI 或 marketplace 安装；可选只写官方格式的本地索引文件；不调用 `kimi` CLI。
- 不管理 `SYSTEM.md`；不重复注册工作区 `.agents/skills`、根 `AGENTS.md` 和工作区 `.agents/agents`；全局 `.agents` 交由 H2/H3。
- 不为 Kimi 增加独立 commands/rules 表单；官方当前未公布该协议，公布后按实际格式接入。
- 本扩展不修改宿主；H1–H6 另立通用宿主任务。若 H7 API 缺失，v1 降级为资产交付并在 README 说明。

## 图标记录

- 文件：`D:/work-space/dsh-context-hub/docs/research/agent-icons/kimi.png`。
- 来源：`https://statics.kimi.ai/kimi-web-seo/assets/kimi-logo-CegIMkbU.png`，由官方品牌页 <https://www.kimi.com/resources/kimi-brand> 引用。
- 格式：PNG，112×112，7454 bytes。
- SHA-256：`59f90505d585b37ea216153859bf357dd5693997316a8ab30662794236b2c273`。
- 处理：原样下载，未重绘、改色、裁剪或转码；目标文件此前不存在，未覆盖任何文件。
- 版权/商标：[KIMI Brand Guidelines](https://moonshotai.github.io/Branding-Guide/) 标注 “© 2025 KIMI. All rights reserved.”；品牌页未声明可再分发许可。实施与发布前需确认商标使用依据，不标为项目原创或开源资产。品牌联系 `team@moonshot.ai`。

## 官方来源

- <https://github.com/MoonshotAI/kimi-code>
- <https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/plugins.md>
- <https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/skills.md>
- <https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/mcp.md>
- <https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/agents.md>
- <https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/configuration/data-locations.md>
- <https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/reference/kimi-command.md>
- <https://github.com/MoonshotAI/kimi-code/blob/main/packages/agent-core-v2/src/app/plugin/store.ts>
- <https://github.com/MoonshotAI/kimi-code/blob/main/packages/agent-core-v2/src/app/plugin/manager.ts>
- <https://github.com/MoonshotAI/kimi-cli>（归档公告）

## 待验证清单

1. `npm view @moonshot-ai/kimi-code version dist-tags`：确认 2.4.1 与 canary。
2. `kimi --version`、`kimi doctor`：本机 shim 当前损坏；修复安装后执行，不阻断开发。
3. `rg -n "directories|registerManifests|snapshotDirectory|manifests|has\\(program" packages/resources/plugins/src`：确认宿主 API。
4. 2.4.1 tag 的 `docs/en/customization/plugins.md`：确认 `managed/<id>`、`installed.json`、`/reload` 语义与 main 一致。
5. 隔离 `KIMI_CODE_HOME` + 无执行组件包：`/plugins install <本地目录>` → `/plugins info` → 禁用 → 移除 → 重启，核对组件加载与 `installed.json`；由用户后续执行。
6. 项目级 `.kimi-code/{skills,agents,mcp.json,AGENTS.md}` 的实际读取；真实客户端验证，不阻断。
7. `kimi.plugin.json` 自定义 `skills`/`agents`/`commands` 路径是否被 Hub 扫描收录；用 fixture 验证 `registerManifests` 与 `tools.describe`。
