# 接入 Cursor Agent 扩展

状态：按用户要求直接实现；Cursor 客户端实机发现与页面验收交用户进行。共同宿主已提供未知启用态、原生 manifest 与目录快照事务。调研日期：2026-11-03。

实施仓库为 `D:/work-space/context-hub-extensions`，Hub 契约仓库为 `D:/work-space/dsh-context-hub`。下文 `EXT/`、`HUB/` 分别指这两个绝对路径。不得把 Cursor 集成写进 Hub 的客户端分支；确实缺失的宿主能力先作为通用前置交付。

## 背景与现状

Cursor 可消费 Skills、MCP、规则、命令、子 Agent、项目 `AGENTS.md`，并支持原生 Cursor Plugins。此处的插件包不等同于 VS Code 扩展；不能用编辑器的 `--install-extension` 安装它们。

| 包格式 | 识别文件 | 组件 | 唯一输入决策 |
| --- | --- | --- | --- |
| Cursor Plugins | `.cursor-plugin/plugin.json` | skills、MCP、rules、agents、commands、hooks、variables | 只接受原生清单，保留完整包及指定路径；不提供 Agent Plugins 1.0 或 Claude/Codex 格式兼容 |

现在做的原因是现有扩展已证明注册式接入可行：`EXT/plugins/codex/src/index.tsx:apply`、`EXT/plugins/claude.code/src/index.tsx:apply` 分别向 skills、prompts、mcp、plugins、targets、locales 注册，页面与侧栏自动消费，新增 Agent 无须复制 UI。Cursor 的专用路径与 JSON MCP 格式已具备官方依据；插件生命周期尚有明确的契约缺口，不能照搬 Claude/Codex 的状态文件。

已读完整参考实现的源码、单测、构建配置与 README。关键复用点与差异：

- `EXT/plugins/claude.code/src/provider.ts:createClaudeCodeMcp` 使用宿主 JSONC 编辑器改一个节点；Cursor 可复用方法形状，不能复制 Claude 的 `disabledMcpServers` 状态逻辑。
- `EXT/plugins/claude.code/src/prompts.ts:createClaudeCodePrompts` 实现 `held/install/remove`；Cursor 的规则必须生成 `.mdc`，不能复制其纯 `.md` 规则输出。
- `EXT/plugins/codex/src/prompts.ts` 的已有生成文件标记与手写文件冲突处理适合借用；不要覆盖用户同名手写命令、规则或 Agent。
- `HUB/packages/resources/skills/src/provider.ts:readablePlaces` 随侧栏选择过滤两种 scope，`SkillPlace` 只有固定目录；不在扩展中另写扫描器。
- `HUB/packages/resources/prompts/src/workspace-provider.ts` 已负责项目根 `AGENTS.md`。不得让 Cursor 再注册一份相同文件。
- `HUB/packages/resources/skills/src/extension.ts:SHARED_PLACE` **只有工作区** `.agents/skills`，没有全局 `~/.agents/skills` 位置。不能把全局覆盖说成现成功能。
- `HUB/packages/resources/plugins/src/provider.ts` 的 `PluginHeld.enabled` 现允许省略；无法证明启用状态时保留未知，不能用目录存在伪造 `true`。`install` 收包名，`remove/setEnabled` 收完整客户端身份。

## 已核实事实与证据层级

以下官方文档经 Context7 与官方网页复核；论坛条目仅作为特定版本行为的证据，不提升为稳定协议。

| 编号 | 来源 | 本计划采用的事实 |
| --- | --- | --- |
| D1 | [Plugins](https://cursor.com/docs/plugins) | 原生插件；Customize 安装到 user/project；按 user/workspace/team 查看；本地开发路径 `~/.cursor/plugins/local/<name>`；重启或 Reload Window 后发现；同名市场安装优先于本地；Enterprise 本地导入可被管理员禁用 |
| D2 | [Plugins reference](https://cursor.com/docs/reference/plugins) | manifest 字段、默认目录、覆盖式组件发现、MCP 占位符、`.cursor-plugin/marketplace.json` |
| D3 | [Skills](https://cursor.com/docs/skills) | 原生与共享 skills 根；递归和嵌套发现；全局 `.cursor/skills` 可选择云同步 |
| D4 | [MCP](https://cursor.com/docs/mcp) | `.cursor/mcp.json`、`~/.cursor/mcp.json`；`mcpServers`；stdio/SSE/HTTP；变量插值；GUI 启停，但没有公开对应状态文件协议 |
| D5 | [Rules](https://cursor.com/docs/rules) | 项目规则只认 `.mdc`；`description/globs/alwaysApply`；根与嵌套 `AGENTS.md`；User Rules 由 Customize 管理 |
| D6 | [Subagents](https://cursor.com/docs/subagents) | `.cursor/agents` 与 `~/.cursor/agents`；Markdown frontmatter；项目优先、`.cursor` 优先于兼容目录 |
| D7 | [Deeplinks](https://cursor.com/docs/reference/deeplinks) | `.cursor/commands` 是项目命令落点；命令内容需用户确认才执行 |
| D8 | [CLI parameters](https://cursor.com/docs/cli/reference/parameters)、[Slash commands](https://cursor.com/docs/cli/reference/slash-commands) | `agent --plugin-dir <path>` 为会话加载；`/plugin` 为交互管理；MCP 有 list/enable/disable 命令；没有文档化的非交互插件 install/remove/enable/disable 命令 |
| D9 | [Agent Plugins specification](https://agent-plugins.org/specification)、[Build an Agent Plugin](https://agent-plugins.org/plugin-authors/build-an-agent-plugin) | 标准定义包与加载格式，安装、分发、启停和更新明确在可移植规范之外 |
| O1 | [Cursor 论坛 CLI 安装答复，2026-07-19](https://forum.cursor.com/t/unable-to-find-a-cli-command-to-install-a-cursor-plugin-after-adding-its-marketplace-repository/166016) | 支持答复：没有非交互 `cursor-agent plugin install`；交互 `/plugin` 可安装；user scope 与账户后端同步 |
| O2 | [Cursor 论坛启停报告与纠正，2026-06](https://forum.cursor.com/t/disabled-plugin-slash-commands-still-appear-in-cursor-cli-menu-plugins-shows-no-enabled-disabled-state/163847) | Linux 2026.06.19 构建观察到 `~/.config/Cursor/User/globalStorage/state.vscdb`、`cursor.plugins.installedIds.no-team\|no-workspace`；作者纠正不存在 CLI 禁用入口；官方回复明确直接修改 DB 非受支持流程 |
| O3 | [Cursor 论坛缓存报告，2026-10-31](https://forum.cursor.com/t/add-plugin-github-imports-can-get-stuck-on-stale-plugin-versions/163895/16) | macOS/Linux `cursor-agent 2026.10.22-27dcf5f` 的具体例子：`~/.cursor/plugins/cache/thrum/thrum/ff14f07a04651f163dccb5de32d5cd6882778823`；说明缓存按市场/包/提交分层，不能当作 `<version>` 规范 |

本机只读 `command -v cursor cursor-agent agent` 无输出：本轮没有可在 PATH 中调用的 Cursor CLI，不能声称完成实机协议验证。项目插件实体路径、project 启用状态及 Windows/macOS 市场状态路径仍待验证。

## 扩展目录与文件清单

`EXT/plugins/cursor/` 是 Context Hub 扩展目录，自己的清单为 **`plugin.yaml`**；它管理的 Cursor 插件包才使用 `.cursor-plugin/plugin.json` 或根 `plugin.json`。

```text
plugins/cursor/
  package.json
  plugin.yaml
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
  src/installer.ts
  src/plugin-state.ts
  __test__/registration.test.ts
  __test__/provider.test.ts
  __test__/prompts.test.ts
  __test__/installer.test.ts
  __test__/fixtures.ts
  lib/index.js                 # build 生成，不手写、不提交
```

- `package.json`：name `cursor`、初始 version `0.1.0`、main/exports 指向 `lib/index.js`；scripts 沿用 `build: node build.mjs`、`test: vitest run`、`typecheck: tsc --noEmit`；devDependencies 采用现有同仓版本，不添加生产依赖。
- `plugin.yaml`：id `cursor`、category `agent`、icon `assets/icon.svg`、中英文元数据、permissions `[assets.read, assets.write, filesystem]`；不含 version/entry。engines 下限只绑定实际交付必需通用能力的宿主发布版；不沿抄旧范围、不预填未来版本、不安排旧宿主降级。
- `src/index.tsx`：target/provider id `hub.target.cursor`；使用现有 `apply(scope)` 模式。阶段 5 探针及阶段 6 实现门槛通过后才注册 installer 并在 inject 中加入 `plugins`；其余 inject 为 `[skills, prompts, mcp, targets, locales]`。
- `src/contracts.ts`：镜像当前实际使用的契约；不从 Hub 包运行时 import，不机械照抄参考扩展中的宽泛 `any`。
- `src/locations.ts`：路径、place id、target identity 与 supports 的单一来源。target `supports` 使用现有枚举，v1 为 `skill/mcp/memory/agent`；完整包会保留 hooks，但不虚报独立 hooks 管理能力。
- `src/messages.ts`：`cursor.*` 的 en/zh-CN 文案，覆盖未知 place/form、解析失败、冲突、宿主能力不足与不支持的插件输入。
- `src/plugin-state.ts`：只承载被验证过的 Cursor 文件解析；不复制 Claude 的安装索引、marketplace registry、scope override 优先级。
- `__test__/fixtures.ts`：内存端口与临时根 fixture，生成测试包；不签入机器配置或下载的第三方可执行包。
- 根 `pnpm-workspace.yaml` 已包含 `plugins/*`，无需修改；根 scripts 自动递归；`pnpm-lock.yaml` 只记录新 workspace 包链接。`marketplace.json`、`lib/` 均由已有构建生成。

## 资产面与位置映射

| 资产 | 官方位置 / scope | v1 Hub 映射 | 与共享位置的关系 |
| --- | --- | --- | --- |
| Skills | `<workspace>/.cursor/skills/<name>/SKILL.md`，workspace | `SkillPlace { id: "cursor", scope: "workspace", dir: ".cursor/skills" }` | 独立目录，注册 |
| Skills | `~/.cursor/skills/<name>/SKILL.md`，global | `SkillPlace { id: "cursor-global", scope: "global", dir: ".cursor/skills" }` | 独立目录，注册 |
| Skills | `<workspace>/.agents/skills`，workspace | 已有 `SHARED_PLACE` | 不重复注册、不复制同一 skill 两次 |
| Skills | `~/.agents/skills`，global | 官方支持；当前 Hub 未提供共享 global place | v1 在 README/target locations 记录，暂不作为 Cursor 专属 place；共享全局入口由独立共同改动解决，不能伪称已覆盖 |
| MCP | `<workspace>/.cursor/mcp.json`，workspace | `McpPlace id: "cursor"` | 独立文件 |
| MCP | `~/.cursor/mcp.json`，global | `McpPlace id: "cursor-global"` | 独立文件 |
| Prompts → commands | `.cursor/commands/<slug>.md`，workspace | `form: "commands"`，显式调用工作流的默认形式 | 不写 `.agents/commands`；Cursor 未被证实会读后者 |
| Prompts → rules | `.cursor/rules/<slug>.mdc`，workspace | `form: "rule"`，默认 Agent Decides | 不复制 Claude 的 `.md` 规则格式 |
| Prompts → agents | `.cursor/agents/<slug>.md`、`~/.cursor/agents/<slug>.md` | workspace/global 的 `form: "agent"` | 只注册原生目录 |
| Memory / 项目指令 | `AGENTS.md`、子目录 `AGENTS.md` | 根文件使用现有共享 `instructions:agents`；嵌套只描述，不加目录选择器 | 根文件只能有一个交付入口 |
| User Rules / 全局 memory | Customize → Rules | 无已公开文件写入协议；v1 不添加全局 rule/memory form | 不发明 `~/.cursor/AGENTS.md` 或 `~/.cursor/rules` |
| 全局 commands | `~/.cursor/commands` | 当前官方页面未核实独立文件落点，v1 暂不声明；保留待验证项 V4 | 不能由项目路径类推 |
| Hooks | 插件 `hooks/hooks.json`、manifest 路径/内联对象 | 作为完整插件包保留 | 不新增独立 hooks provider，不执行 hooks |

嵌套 skills 是 Cursor 能力，当前 `SkillPlace` 不表达多个嵌套工作区根。v1 用已有扫描与交付范围，README 明确“当前工作区根 + 用户根”，不承诺遍历仓库内所有 `.cursor/skills`。

### MCP 的具体行为

`createCursorMcp(ctx.mcp.tools)` 注册两个 place，均通过 `PlaceFiles` 读取对应 `.cursor/mcp.json`。

- 顶层为 `{ "mcpServers": { "<name>": <entry> } }`。支持 Hub 已有 stdio、sse、http；写入显式 `type`，stdio 使用 `command/args/env`，远程使用 `url/headers`。
- 复用 `readJsonObject/valueAt/readDeclaration/writeDeclaration/editJson/jsonValueLines/McpError`，不再引入 JSON parser。官方示例含注释，现有 JSONC 编辑器适用。
- `install` 修改 `["mcpServers", name]` 的已管理字段；保留同一 entry 未建模的 `envFile`、`cwd`、`auth` 等字段，以及其他 server、根字段、注释。转换 transport 时不能留下互斥的 `command/args/env` 或 `url/headers`；遇到会破坏非兼容额外字段的转换，报明确冲突，不静默删除。
- `uninstall` 只删除目标 server 节点；不删除整份文件。`locate` 用 `jsonValueLines`。
- 配置变量以原字符串保存：`${env:NAME}`、`${userHome}`、`${workspaceFolder}`、`${workspaceFolderBasename}`、`${pathSeparator}`、`${/}`。Hub 不读取或插入真实 secret。
- `envFile` 仅 stdio 支持；当前 `McpDeclaration` 不建模它、`cwd` 或 OAuth 配置，v1 保留已有值，不增加表单。
- 独立 MCP 文件与插件 MCP 分开：`${CURSOR_PLUGIN_ROOT}` 在**插件** MCP 的 `command/args/env` 值及 `cwd` 展开；不能承诺 standalone `.cursor/mcp.json` 同样展开，也不能把该规则外推到 headers/url。
- 两个 MCP places 初始 `switchable: false`，不实现文件 `setEnabled`；Cursor 本身有 GUI/CLI 开关，但对应的稳定文件协议尚未核实。当前 `McpEntry.enabled` 没有 unknown：按现有无开关契约返回声明存在的默认 `true`，README 必须注明这是声明视图，不代表 GUI 中批准/连接状态，不能报告“运行中”。V3 完成后另行决定是否提供实际状态。

### Prompts 的具体行为

提供 workspace `cursor`（commands、rule、agent）和 global `cursor-global`（agent）。普通工作流优先 commands；长期指导由用户显式选择 rule；不把每条 prompt 自动变成 always-on 规则。

- 文件名统一来自 `tools.slugOf(prompt.name)`。命令用 `tools.commandFile`；Agent 用该工具生成 `name: <slug>`、description 与正文，不写固定模型名，继承 Cursor 默认模型。
- `.mdc` 由 Cursor 扩展自己生成最小 frontmatter：`description: <经过字符串编码的描述>`、`alwaysApply: false`，不填 `globs`。description 优先 prompt.description，其次 `describeBody`，再 fallback 到名称。无 globs + description + false 对应 Agent Decides。
- 不给现有 `commandFile()` 增加 Cursor 分支。它没有可配置额外 frontmatter 的能力，简单 `.mdc` 序列化留在 `prompts.ts`；JSON 字符串字面量作为 YAML 双引号字符串时覆盖换行/冒号/引号测试。
- 生成文件在 frontmatter 之后放 `<!-- context-hub:<slug> -->` 标记，保持 frontmatter 仍为首块。相同标记允许幂等更新；同名无标记文件拒绝覆盖，`remove` 不删除。
- `held` 从实际目标文件及标记计算。`commands/rule/agent` 分别计数，不使用 Hub 投递记账替代实际存在状态。
- 项目 `AGENTS.md` 的 section 更新、移除直接复用共享 provider；Cursor 不新增入口，不把 shared `.agents/rules` 误报为 Cursor 规则。

## 插件安装器决策与前置条件

### 格式与目录

v1 只接受 **Cursor Plugins 原生完整包**，清单固定为 `.cursor-plugin/plugin.json`。不读取标准根清单或 Claude/Codex 清单作回退，不生成第二份 manifest，不翻译组件。

当前 Hub 对 native-only 包的元数据识别不完整，必须先交付通用的「扩展声明 manifest 路径」契约，由 Cursor 扩展声明 `.cursor-plugin/plugin.json`，贯通宿主磁盘收录、浏览器导入与 describe。不得为规避宿主缺口要求发布者加旧格式/双清单，也不在宿主增加 Cursor 特判。

探针只验证这一种原生包的 skills/rules/commands/agents/MCP 加载。通用收录前置或真实组件发现未通过时，installer 保持阻塞；不改用标准 1.0 输入。

Cursor Plugins 默认发现位置：

| 组件 | 默认位置 | manifest 覆盖 |
| --- | --- | --- |
| skills | `skills/*/SKILL.md` | `skills: string \| string[]` |
| rules | `rules/`，插件发现支持 `.md/.mdc/.markdown`，生成新规则用 `.mdc` | `rules` |
| agents | `agents/`，Markdown 类扩展名 | `agents` |
| commands | `commands/`，`.md/.mdc/.markdown/.txt` | `commands` |
| hooks | `hooks/hooks.json` | `hooks: path \| object` |
| MCP | `mcp.json` | `mcpServers: path \| object \| array` |
| 单 skill 包 | 根 `SKILL.md` | 无 `skills/` 且未显式指定 skills 时才发现 |
| 配置变量 | `.cursor-plugin/plugin.json` 的 `variables` JSON Schema | 值由 Dashboard Configure 提供，扩展不接管 secret |

manifest 指定组件路径会**替换**默认扫描，不是追加。只复制某几个默认目录会丢组件，应完整复制包。所有显式路径不得绝对化或逃逸包根。`variables` 未配置时也不能报告对应 MCP 已可用。

原生包只使用 Cursor 文档规定的变量；不支持的标准/Claude 变量在写盘前拒绝，不改源文件。没有原生清单的标准包直接拒绝。

### 安装、市场与启停

| 对象 | 已知行为 | v1 决策 |
| --- | --- | --- |
| 本地用户插件 | `~/.cursor/plugins/local/<name>`，原生包支持，重载后发现 | 纯文件安装的唯一已公开目标；必须复制，不能符号链接到 Hub 库外 |
| 市场缓存 | 已观察 `~/.cursor/plugins/cache/<market>/<name>/<git-ref>`；未公开稳定 layout | 不向 cache 造记录，不把缓存存在当安装或启用状态 |
| workspace 插件 | GUI 支持 project scope，实际实体/状态路径未公开 | 不发明 `.cursor/plugins` 或 `.cursor/settings.json`；V2 通过后才能加入 place |
| user/team 市场状态 | 支持答复说明 user 账户同步；部分构建观察到 SQLite cache/state | 不写 DB、不调用私有后端、不复制 Claude 的 installed_plugins/enabledPlugins |
| 市场 manifest | `.cursor-plugin/marketplace.json`，含 name/owner/plugins/source 等 | 可由扩展通过 `syncMarketplace` 生成格式，但生成索引不等于注册市场；v1 local 安装不调用这个无必要动作 |
| 安装/卸载官方入口 | Customize 或 CLI 交互 `/plugin` | 用作实机验收；Hub 不自动操纵 GUI，不以 CLI 回退伪装文件化 |
| CLI 会话输入 | `agent --plugin-dir <path>` | 可作隔离组件诊断，不当持久安装 |
| 启用/禁用 | 本地包开关及持久文件协议未验证；部分市场启用态只观察到 SQLite | **v1 不支持 Hub 启停**；没有可核实文件协议或状态仅在 SQLite 的 place 一律 `switchable: false`。Hub 只负责文件，启停由 Cursor UI 负责，不写 DB、不用移动/删除包冒充禁用 |

`PluginPlace` 的候选映射：

| place id | scope | scopeWord | switchable / file |
| --- | --- | --- | --- |
| `cursor-user` | `global` | `user` | 对应本地 user 安装；未核实开关前 `false` 且不写 `file` |
| `cursor-project` | `workspace` | `project` | **v1 不支持，不注册**；V2 是未来发布该能力的门槛，必须确认实际路径/状态/优先级 |
| team | 无 | 无 | 现有 `PluginInstallScope` 仅 user/project；不伪装为 user，政策拥有的条目只读且不能靠缓存枚举推断 |

`cursor-user` 固定声明 `switchable: false`，不提供 Hub 启停；**Hub 只负责文件，启停由 Cursor UI 负责**。项目作用域与启停均是能力发布门槛，本轮没有实证，所以明确为 **v1 不支持**；不得用 CLI 回退或猜路径。

无开关不意味着可以编造 `PluginHeld.enabled`。阶段 5 的真实探针与阶段 6 的安装器必须证明本地目录发现、管理员允许导入、市场同名覆盖及用户禁用后的实际行为。无法从受支持文件表达真实状态时，安装器还依赖共同契约正确表达“文件存在但启用态未知”；此契约未获批并实现前保持阻塞，不能填 `true` 或 `false`。当前接口不满足时发布版不注册 installer；skills/MCP/prompts 可以独立交付，但必须明确“v1 插件文件安装阻塞”。

### 三项通用宿主前置

这三项由多 Agent 接入的共同基础改动统一负责，不能让各扩展重复修改。阶段 5 只探针和确认前置；阶段 6 实现安装器前必须验收。若目录操作或未知启用态前置不进 v1，则 Cursor 插件文件安装明确阻塞，v1 只交付 skills/MCP/prompts。

1. **通用 manifest 路径声明。** 当前 `PLUGIN_MANIFESTS` 只有三种文件，`host/describe.ts:readManifestFields` 与 `src/add-plugin-dialog.tsx:manifestOf` 都消费它。先扩充通用格式贡献契约，由扩展声明原生 manifest 路径，三处统一消费同一组声明；不直接把客户端清单字面量追加进宿主。测试覆盖 native-only 包、标准组件及自定义目录、name/version/description/icon 元数据、声明生命周期与不安全路径拒绝。Cursor 扩展声明 `.cursor-plugin/plugin.json`；不再准备双 manifest 方案。
2. **整包复制/移除仍硬限 cache 形状。** `host/installer-files.ts:commit` 第 232 行要求 `cache/<market>/<name>/<version>` 四段；`removeDirectory` 第 403 行同样限 cache。因此当前 API 不能投递 `local/<name>`。共同前置应在 `PluginDiskDeclaration` 中声明目录目标模板，表达 `cache/:market/:name/:version` 和 `local/:name`；宿主只解析模板参数并做通用段校验、越界/符号链接校验、原子写与失败回滚，不能加 Cursor 特判。具体字段名由共同宿主计划确定，扩展同步镜像。保留租约、快照、复制前后整树摘要；不通过 `config/workspace` 根逐文件写绕过整包事务。`provider.ts`、`tools.ts`、`handlers.ts` 与 `installer-files.test.ts` 同步，既有 Codex/Claude 行为保持。

3. **`PluginHeld.enabled` 允许未知。** `HUB/packages/resources/plugins/src/provider.ts:PluginHeld` 把 `enabled` 定为必填 `boolean`；Cursor 的启停态只观察到 GUI / SQLite / 账户后端依据，无法从已公开文件协议确定。共同前置采用 `enabled?: boolean`，无值时 UI 显示「未知」，不显示开/关。此未知值必须贯通 `src/types.ts:PluginHeldPlace/PluginHeldBy`、`src/rows.ts:HeldBuilder/collectScanned/PluginPlaceStatus/placesShown`、`src/install-actions.tsx` 及中英语言表；不能在 `collectScanned` 继续以 `false` 初始化并用 truthy 判断折叠未知。聚合规则：任一确定 true 则 true；全部明确 false 才 false；其余 undefined。单个 place 保留自己的未知值。未知时不渲染 Switch、不计入已启用数量，仍保留文件安装位置和卸载入口。`rows.test.ts`、扫描/bridge 测试与 UI 验收覆盖 true/false/undefined 及混合 scope。未落地前 installer 保持阻塞，不填 `true` / `false`。

**复制后不能改树：** `HUB/packages/resources/plugins/src/host/installer-files.ts:240-247` 在 copy 前算 `sourceHash`，copy 后必须等于 source；`changes` 在 copy 之后写。安装器不得在 `local/<name>` 内生成或改写任何清单/文件，否则下一次同版本安装会判 cache/source 不同。只使用原生清单；本版不生成清单或 overlay。

前置验收至少包含：原生单清单 fixture 在浏览器/宿主收录同名同版本；声明 `local/:name` 的 fixture 可完整复制/删除 `local/demo`；允许的 cache/local 模板均通过；模板与展开参数中的 `..`、绝对路径、反斜杠越界、未知 token、未声明目标、符号链接均拒绝；不允许删除 `local` 根；复制中途失败和状态写入失败均恢复旧目录，源文件仍完整；既有 Claude/Codex installer 测试通过。这里的 `local` 和 `cache` 是扩展声明数据，宿主不持有客户端身份。

### 原生包与宿主的复用边界

只复用包内路径检查、完整目录复制和 `PluginDisk` 事务原语。原生 manifest/组件校验由 Cursor 扩展负责，不构建标准 1.0 parser。

标准本身不规定安装根、市场注册、账户同步、启停、更新，因此通用标准解析器**不能直接覆盖 Cursor 安装器**。Cursor 的 `.mdc` frontmatter、commands/agents/hook 发现、variables 和本地发现路径都必须由 Cursor 扩展解释。保留完整包不等于执行 hooks，也不需要写各组件迁移器。

## 分阶段实施

批准本计划后才创建八条 `TaskCreate`，subject 为下列阶段名；开工前更新 `in_progress`，验收后即更新 `completed`。共同宿主前置若尚未就绪，先更新主任务依赖与本计划，不提前让阶段 6 宣告完成。

仓库脚本已经核实：EXT 根有 `lint/typecheck/test/build/build:marketplace`；两个参考插件都有 `typecheck/test/build`。以下 `--filter cursor` 是新包沿用的真实脚本，不引入虚构脚本。Shell 示例均在指定根目录执行；本次未运行这些实现验收命令。

### 阶段 1：建立扩展脚手架

**目标**：最小可构建目录，官方图标是第一份实施产物。

**文件**：`EXT/plugins/cursor/assets/icon.svg`、`package.json`、`plugin.yaml`、`build.mjs`、`tsconfig.json`、`vitest.config.ts`、`src/index.tsx`、`src/contracts.ts`、`README.md`；必要的 workspace lockfile 记录。

**动作**：

1. 第一步复制 `HUB/docs/research/agent-icons/cursor.svg` 到 `EXT/plugins/cursor/assets/icon.svg`，保持字节一致，不重绘。创建目标目录后执行 `cp D:/work-space/dsh-context-hub/docs/research/agent-icons/cursor.svg D:/work-space/context-hub-extensions/plugins/cursor/assets/icon.svg`。
2. 从 Codex/Claude 的构建与 TypeScript 配置复制最小骨架，名称改为 cursor；保留四个 React external 与 `absWorkingDir`。
3. `index.tsx` 优先使用 `<img src="/hub/extensions/cursor/assets/icon.svg" ...>` 展示下载资源，传递 className/aria-hidden；当前 Codex/Claude 图标是 inline SVG，因此 `<img>` 必须另验资源路由。深色主题用现有浅色图标底保证对比度，不修改商标颜色/几何。如果 dev 或已安装形态的路由不可用，回退为原始官方 SVG 的等价 JSX，保留 path/viewBox/颜色；去除未被引用的 `Ebene_1` 根 id，并将 `.st0` 的固定填色等价写为 path fill，避免 inline 多实例重复 id 与全局 CSS 污染，不重绘图形。
4. 注明品牌来源与条款；不在 `plugin.yaml` 放 version/entry，不把构建产物提交。

**依赖与命令顺序**：先完成新包 `package.json`，再从 workspace 根执行现有 `pnpm install` 工作流，使 lockfile importer 与新包 node_modules 链接就绪，然后才运行过滤脚本。pnpm 10 官方文档确认默认 recursiveInstall 覆盖 workspace，filter 可用 `--fail-if-no-match` 避免选不中包却假绿（[install/settings](https://pnpm.io/10.x/settings)、[filtering](https://pnpm.io/10.x/filtering)）。执行顺序为：

```sh
pnpm --dir D:/work-space/context-hub-extensions install
pnpm --dir D:/work-space/context-hub-extensions --filter cursor --fail-if-no-match typecheck
pnpm --dir D:/work-space/context-hub-extensions --filter cursor --fail-if-no-match build
```

安装时不升级生产依赖；审查 lockfile 只增加预期 workspace importer/链接，保留现有版本。`--fail-if-no-match` 失败时先核对 package name 与 `pnpm-workspace.yaml` 的 `plugins/*`，不能把未选中包当成构建通过。

**验收**：上述 typecheck/build 通过；源/目标图标 SHA-256 相同；产物只外部导入允许的 React 模块。将包挂到隔离 Hub 的 dev 形态与构建后已安装形态各验一次，实际启动方式使用项目既有 `dev:web`/构建工作流并按隔离规则选根与端口。分别执行 `curl --fail -s -o /dev/null -w '%{http_code}\n' "$PROBE_DEV_ORIGIN/hub/extensions/cursor/assets/icon.svg"` 与同式的 `$PROBE_INSTALLED_ORIGIN` URL，均须 200，且响应体是 SVG；浏览器侧用 `ego-browser` 检查 light/dark 两主题下 sidebar/menu/catalog 图标尺寸、无拉伸、无丢图和对比度。路由有任一不可用即使用上述 inline fallback，再验证两形态/两主题和多实例无重复 id。不能仅凭 typecheck/build 宣称图标可用。

### 阶段 2：注册身份与技能位置

**目标**：Cursor 出现在现有 Agent 列表；位置选择与计数保持既有语义。

**文件**：`src/index.tsx`、`src/contracts.ts`、`src/locations.ts`、`src/messages.ts`、`plugin.yaml`、`__test__/registration.test.ts`。

**动作**：注册 target、两个 `.cursor/skills` places、中英文文案；target locations 记录表中能力边界；不重复 shared workspace，不替其他 Agent 注册目录。两种 scope 都受 Cursor 选择控制。使用既有 `skillPlaceKey([scope,id,dir])` 对应的元数据，不改 page 菜单。

**验收**：`pnpm --dir D:/work-space/context-hub-extensions --filter cursor test -- __test__/registration.test.ts` 与 typecheck；断言 target/provider identity 相同、place id 唯一、两个根正确、没有重复 `.agents/skills` 注册。Hub 集成中未选 Cursor 时两 scope 均不读，选择后都出现。

### 阶段 3：实现 MCP 文件交付

**目标**：两个 scope 的 MCP 声明独立读写，不损伤原配置。

**文件**：`src/provider.ts`、`src/contracts.ts`、`src/index.tsx`、`src/messages.ts`、`__test__/provider.test.ts`、`__test__/fixtures.ts`、README。

**动作**：按 MCP 小节实现 `read/install/uninstall/locate`；保留变量字面量与未知字段；错误走 `McpError`；缺文件是空列表，格式错误不能当空文档覆盖。设置 `switchable: false`，不在 JSON 中添加未经确认的 `disabled/enabled` 字段。

**验收**：`pnpm --dir D:/work-space/context-hub-extensions --filter cursor test -- __test__/provider.test.ts` 与 typecheck；stdio/http/sse 往返、同名不同 scope、保留其他 server/额外字段/注释、损坏文档零写入、未知 place 拒绝、locate 行号正确。真机审批/启停语义留 V3，不伪报已验证。

### 阶段 4：实现提示词与规则交付

**目标**：commands、MDC rules、agents 能生成、识别与撤回，且不覆盖手写文件。

**文件**：`src/prompts.ts`、`src/contracts.ts`、`src/locations.ts`、`src/messages.ts`、`src/index.tsx`、`__test__/prompts.test.ts`、`__test__/fixtures.ts`、README。

**动作**：注册 workspace 三种 form、global agent；按标记保护手写文件；描述和名称编码测试覆盖多行、引号、冒号与中文；规则默认 false + description，不添加 globs 编辑器。AGENTS.md 继续走现有共享入口。

**验收**：`pnpm --dir D:/work-space/context-hub-extensions --filter cursor test -- __test__/prompts.test.ts` 与 typecheck；生成规则以合法 frontmatter 开始且扩展名 `.mdc`；重复安装无重复内容；撤回只删自己的文件；global rule/commands 和 Cursor 专属 AGENTS form 被拒；共享 AGENTS section 保留已有正文。

### 阶段 5：探测真实插件发现行为

**目标**：用 Cursor 的实际组件发现结果证明文件投递有效，并确定前置是否允许进入安装器实现。该阶段不能用单测、目录存在或 CLI 列表替代。

**文件**：`__test__/fixtures.ts` 维护无执行组件 fixture；`README.md` 记录构建号、每种组件的发现结果与不支持能力；测试包只生成到隔离 OS 用户/VM 的临时 home/workspace，不写真实用户目录。

**动作**：

1. 执行 V0，确认隔离用户的 `~`、Cursor 数据目录和 workspace 全部独立。造最小包 `zz-context-hub-cursor-probe`，含 `.cursor-plugin/plugin.json`、一个 `skills/probe/SKILL.md`、`rules/probe.mdc`、`commands/probe.md`、`agents/probe.md` 与 `mcp.json`；每个文件放唯一可观察名称。MCP 使用不含凭证的本地回环测试声明，不连接第三方服务、不自动批准或执行。
2. 把完整包放到**隔离用户的** `~/.cursor/plugins/local/zz-context-hub-cursor-probe`，运行 GUI **Developer: Reload Window**，在 **Customize** 逐项检查 skills/rules/commands/MCP（Agent 也记录）。每项记录“已发现 / 未发现 / 未验证”、显示名称与来源路径，不能用一个总的“插件出现了”代替。
3. 只验证原生单清单包的组件发现；另用缺原生清单的标准 1.0/Claude 包断言复制前拒绝，不作为成功加载候选。
4. 通过 Cursor UI 操作可用的启停，记录组件消失/重现与文件差异；不写 SQLite。若真实状态仅在 DB/后端，标为 v1 不支持 Hub 启停，并记录 `switchable: false`。项目 scope 未经 V2 证明仍为 v1 不支持。
5. 移除仅本次 fixture，重载并开新会话，逐项确认组件消失，排除历史命令缓存；清理自身临时进程与目录。

**验收**：`pnpm --dir D:/work-space/context-hub-extensions --filter cursor test -- __test__/installer.test.ts` 验 fixture 结构（新增该测试文件，不依赖下一阶段的 installer 实现）；真机命令 V0/V1/V5 与上述 Customize 逐组件记录共同构成门槛。**“重载后 Customize 实际发现哪些组件”是文件安装生效的唯一证据**。没有可用客户端/隔离环境则阶段 blocked，不把“官方文档说支持”写成实测通过。探针通过也只证明该构建的发现行为，不自动证明启停可由文件管理。

### 阶段 6：接入本地插件安装器

**目标**：在已证明的本地协议范围内提供纯文件安装/卸载；Hub 只负责文件，启停由 Cursor UI 负责。v1 仅用户级 local 完整 Cursor Plugins 原生包，不做项目 scope 与 Hub 启停。

**文件**：`src/installer.ts`、`src/plugin-state.ts`、`src/contracts.ts`、`src/locations.ts`、`src/messages.ts`、`src/index.tsx`、`plugin.yaml`、`__test__/installer.test.ts`、`__test__/fixtures.ts`、README。共同宿主前置涉及的 HUB 文件见上节，由主计划统一安排。

**动作**：

1. 先验收三项通用宿主前置与阶段 5 的真实探针；构建号、实际状态依据和每项组件发现结果必须已记录。不把论坛路径直接写成常量。目录模板前置未进入本版则 installer blocked，v1 只交付 skills/MCP/prompts。
2. 本地候选声明 `home: ".cursor"`、`state: "plugins"`；不发明 `CURSOR_HOME`/`CURSOR_CONFIG_DIR`，无官方依据不填 homeEnv/stateEnv。stateFiles 只声明 `local` 列举、必要 manifest 读取及精确 pack 目录写入模式；实际新增目录权限字段以共同契约为准。
3. `createCursorInstaller()` 的 `available` 校验 `tools.disk` 与通用目标目录能力，缺失时报告宿主不兼容，不通过 `tools.has("cursor")` 判断文件能否写。`held` 只从已核实的安装/状态依据计算，`PluginHeld.id` 保留来源身份；本地身份格式在 V1 记录后确定，不能借用市场的 `name@context-hub` 冒充 Cursor 官方 ID。
4. 安装验证 name/manifest/path、格式与变量兼容后整体复制到 `local/<name>`；已有非 Hub 管理同名目录拒绝覆盖。ownership 信息保存在 pack 目录外的 Hub 管理文件（由作用域声明明确授权），不得把标记写入 `local/<name>` 改变已复制整树；该记录只证明管理权，不用于推断 enabled。复制失败回滚，成功报告目标与“需重载”，不声称当前会话已加载。
5. 卸载只删除自身拥有的 local 目录，先读再检查，无副作用地拒绝市场/team/policy 包；不能删除市场 cache。外部本地包若状态可完整证明则只读展示，无法辨认则报告读取限制。
6. v1 不提供 `setEnabled/switches`，`switchable: false`；README 明文写“Hub 只负责文件，启停由 Cursor UI 负责”。`held.enabled` 不填猜测值；若只有 GUI/后端能确定状态且共同契约仍不能表达未知，保留 installer 不注册并将该阶段标记 blocked。不能借删除/改名做禁用，也不能调用 CLI 回退。
7. v1 不注册 workspace/team place。V2 作为今后发布项目能力的门槛，结果未通过明确写“v1 不支持”，不在当前实现里试探路径。非原生包必须在复制前拒绝，不能落一半组件。

**验收**：`pnpm --dir D:/work-space/context-hub-extensions --filter cursor test -- __test__/installer.test.ts`；fixtures 的 `tools.run/has` 一调用就抛错；安装/重复安装/替换冲突/卸载幂等、完整资源树、所有拒绝路径与回滚通过。启用/禁用用例必须分别证明真实成功或者明确未提供能力、零写入；不能用只验证文件存在的测试替代组件加载。阶段完成须 V1 有确定答案，否则不得发布 installer。

### 阶段 7：验证契约与回归

**目标**：检查扩展产物、跨仓能力、位置计数与现有 Agent 不回退。

**文件**：本扩展四个测试文件与 fixtures、README；共同宿主前置的 `installer-files.test.ts`、`library.test.ts`、`scan.test.ts`、`bridge.test.ts` 由主计划同步。

**动作**：以真实宿主 JSONC/Prompt toolkit 和 `createFsPlaceFiles`/`createInstallerFiles` 跑至少一次跨仓契约用例，防止只有仿真编辑器通过。实现 fixture 时显式传 `home`、`folder`、`userHome`、library root、env，全部位于本次临时目录。根本缺失的状态不能以空列表掩盖。

**验收命令**（已存在 scripts）：

```sh
pnpm --dir D:/work-space/context-hub-extensions --filter cursor typecheck
pnpm --dir D:/work-space/context-hub-extensions --filter cursor test
pnpm --dir D:/work-space/context-hub-extensions --filter cursor build
pnpm --dir D:/work-space/context-hub-extensions --filter codex test
pnpm --dir D:/work-space/context-hub-extensions --filter claude.code test
pnpm --dir D:/work-space/context-hub-extensions lint
pnpm --dir D:/work-space/context-hub-extensions typecheck
pnpm --dir D:/work-space/context-hub-extensions test
pnpm --dir D:/work-space/context-hub-extensions build
pnpm --dir D:/work-space/dsh-context-hub --filter @context-hub/plugins test
pnpm --dir D:/work-space/dsh-context-hub --filter @context-hub/plugins typecheck
```

没有新增共享宿主改动则最后两项只作为前置交付证据引用，不无理由重跑全仓。构建市场含 cursor、inline SVG 小于 32 KiB，包入口可导入；不手改 marketplace.json。

### 阶段 8：验证隔离真机并收尾

**目标**：磁盘、Hub 页面、Cursor Customize 三侧结果一致，再报告可交付范围。

**文件**：`EXT/plugins/cursor/README.md` 补验证的客户端版本与限制；本计划更新实际完成状态，只有用户确认完成才归档。

**动作**：在临时 OS 用户/VM 或已证实独立的 Cursor profile 中使用唯一 `zz-context-hub-cursor-probe` fixture。所有实际 home/配置/数据/工作区均在隔离根内；不能仅把 Hub home 换掉便操作真实 `.cursor`。浏览器侧按 `ego-browser` skill 验 Hub，Cursor 原生 Customize 由隔离桌面操作检查；本阶段若需登录、计费或云同步先由主上下文获用户授权，不能借研究权限隐式操作账户。

**验收**：

- 本地原生包至少含 rule、skill、agent、command 和一个不含实际凭证的 MCP 声明；重载后 Customize 显示预期组件及来源路径。无原生清单的标准 1.0 包必须拒绝且零写入。只检查发现，不执行不受信任 hook/script。
- commands 在 `/` 可找到，rule 出现在正确模式，Agent 可被发现；standalone MCP 声明出现在正确 scope。缺少登录导致不能连接时明确只验证发现，不宣称调用可用。
- 同名市场覆盖、本地导入被政策禁用、全局/workspace 冲突、插件移除后新会话组件消失、真实启停若支持则状态一致。重载与新会话必须区分，不拿历史 slash 缓存作现状。
- Hub skills 位置计数按 id/scope/dir：空目录 `0`、读取失败/未知 `—`；一个 skill 在两处有两个位置但资产行不重复，仍保留 Agent 标记和各位置卸载动作。
- prompts 与 plugin 位置计数基于 held。卸载不会删 shared `.agents/skills` 或 `AGENTS.md` 中其他内容。
- 先卸本次 fixture，再关闭自己创建的进程，再删除自己临时目录；用两仓 `git status --short`、`git diff --check` 确认无额外变更。真实用户目录从始至终零写入。

## 测试清单

| 范围 | 必测输入 / 可观察结果 |
| --- | --- |
| 注册 | provider/target id 一致；manifest inject 完整；卸载扩展后注册摘除；无 workspace/global 重复 place |
| Skills | 两个 Cursor 根；shared workspace 不重复；空/失败/一个/多个目录计数；选择/取消选择；同名跨位置保留动作 |
| MCP | 缺文件、空文档、坏 JSONC、非法 mcpServers；三 transport；重复安装；卸单项；同名跨 scope；保留未知字段与插值；无虚构开关 |
| Prompts | 三种 workspace form、global agent；MDC metadata；特殊字符；幂等；手写冲突；仅删除自己标记；共享 AGENTS 不重复 |
| 插件输入 | 原生单清单 + 自定义目录；缺原生清单/仅标准 1.0/仅 Claude 清单拒绝；缺 name；manifest path traversal；`${PLUGIN_ROOT}`/`${PLUGIN_DATA}`；variables 原样保留 |
| 安装/卸载 | 完整复制不运行代码；非 Hub 同名目录拒绝；失败回滚；缺 host.disk 具体报错；local 目录被移除；外部市场/team 只读；缓存不是安装证据 |
| 启用/禁用 | 支持协议则磁盘与新会话一致；缺协议则按钮/方法不提供且零写入；不以删除、改名或伪造 enabled 通过测试 |
| 隔离 | 所有 filesystem 工厂显式临时 userHome/folder/home/env；任何真实根读写哨兵直接失败；Windows/Posix 路径测试，不复用用户真实目录 |
| 宿主通道 | 声明目录目标、越界、符号链接、根删除、冲突、回滚；浏览器/host scanner 识别一致；现有 Claude/Codex 当前功能无回归 |
| 成品 | 构建入口、React external、market icon/metadata；Hub 页面位置计数；Cursor 实际组件加载与未加载反例 |

## 待验证项与命令

下列是外部产品的诊断命令/可观察步骤，不冒充仓库 scripts。先在**隔离 OS 用户或 VM**准备 `probe-root`；不要在当前真实 HOME 上运行会创建状态的 Cursor 命令。`${PROBE_*}` 表示实施者预先创建并记录的临时绝对路径，变量名不得复用系统 HOME。

| 编号 | 待验证事项 | 验证命令与判据 |
| --- | --- | --- |
| V0 | 可用客户端与隔离参数 | `command -v cursor cursor-agent agent`；在隔离用户下 `cursor --version`、`cursor --help`、`agent --version`、`agent --help`。仅按本机 help 确认 profile/data 参数后使用；若不能证明 home 隔离，使用 VM，不猜 `CURSOR_HOME`。本轮只有 PATH 查询已做 |
| V1 | local 插件安装/卸载是否可由文件独立管理、启停状态来源、双向覆盖 | 将无执行组件 fixture 放进隔离 `~/.cursor/plugins/local`，GUI Reload Window；`rg --files --hidden "$PROBE_HOME/.cursor"` 记录变化；GUI 依次启用/禁用/卸载后再次快照并比对；每一步同时检查 Customize 与新会话。如落 SQLite/账户后端，停止文件开关设计，不修改 DB |
| V2 | project 安装目录、缓存精确格式、scope 状态与优先级 | 在隔离账户 Customize 安装到临时 workspace，分别用 `rg --files --hidden "$PROBE_WORKSPACE/.cursor"`、`rg --files --hidden "$PROBE_HOME/.cursor/plugins"` 枚举；对安装前/后、项目禁用/删除后快照执行 `git diff --no-index -- "$PROBE_BEFORE" "$PROBE_AFTER"`。diff 的退出码 1 表示有差异，非脚本失败；观察是否实体仍在全局 cache、scope 仅在状态层。无持久文件则不注册 project place |
| V3 | MCP 开关与 approval 的持久状态、是否仅限 CLI | 在隔离用户下 `agent mcp --help`、`agent mcp list`，再执行文档已列的 `agent mcp disable zz-context-hub-cursor-probe` / `agent mcp enable zz-context-hub-cursor-probe`；快照比对后与 GUI toggle 对照。MCP fixture 不连接外部服务，state 只能从实际差异识别；不要把 approved 当 connected |
| V4 | 全局 commands 支持、项目 commands 可见性 | 官方 `https://cursor.com/docs/commands.md` 本次 404；改用 D7 证明项目落点。隔离用户放 `~/.cursor/commands/zz-context-hub-cursor-probe.md` 后 Reload Window，命令 `/` 选择器查名；再移除对照。`rg --files --hidden "$PROBE_HOME/.cursor/commands"` 只证明落盘，不是加载判据；未通过不增加 global form |
| V5 | 原生清单和变量加载 | 隔离 fixture 仅生成原生清单包，使用 D8 已文档化的 `agent --workspace "$PROBE_WORKSPACE" --plugin-dir "$PROBE_PACK"` 进入交互；不提交模型请求，检查 `/plugin`/组件诊断。结合 GUI 重载检查。若这会加载可执行组件，先删掉 fixture 的 hook/MCP 启动项；不调用真实包脚本 |
| V6 | 最低支持版本与新宿主能力 | `pnpm --dir D:/work-space/context-hub-extensions --filter cursor typecheck`、`pnpm --dir D:/work-space/dsh-context-hub --filter @context-hub/plugins test`；核实实际 release 的 `package.json.version` 再更新 engines。旧宿主缺能力须报“不支持”，不能静默 CLI fallback |
| V7 | 官方图标条款与视觉适配 | `curl -L --fail https://cursor.com/brand`；核对下载原件 SHA-256 与品牌名称。用 Hub 两主题截图检查尺寸/对比度；不修改原始标志。若发布前需要额外商标授权，由发布负责人确认；不假定品牌包采用仓库 MIT 许可证 |

## 不做

- 不写源代码于当前规划任务，不安装依赖、启动服务、创建分支或提交 git。
- 不改真实 `.cursor`、真实 Cursor profile、真实仓库 `AGENTS.md`、用户账户或 team 配置。
- 不把 VS Code 扩展命令当 Agent Plugin 命令，不杜撰 `cursor plugin install`。
- 不写 `state.vscdb`、不调用私有后端、不通过 GUI 自动点击替代文件安装，不伪造市场安装记录。
- 不发明项目插件目录、global rules/memory 文件、Cursor 专有环境变量。
- 不把 Agent Plugins 标准当通用安装生命周期，不自动将 Claude/Codex 插件转换为 Cursor 插件。
- 不为互操作而静默改写标准占位符，不重写下载包，不删除未识别的私有组件。
- 不加 team 管理、云同步、OAuth/secret 表单、hook 编辑器、MDC globs 编辑器、嵌套 skills 扫描器或自动发布市场。
- 不改既有页面布局、位置去重策略、未知状态枚举；若真实状态无法表达，先更新共同契约计划。
- 不顺手修改参考扩展、不升级生产依赖、不抽取尚无复用调用方的通用 installer 框架。

## 官方图标记录

- 本次产物：`HUB/docs/research/agent-icons/cursor.svg`。
- 官方品牌页面：[Cursor brand guidelines](https://cursor.com/brand)。
- 官方下载：[cursor-brand-assets.zip](https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/brand/cursor-brand-assets.zip)。
- 取自 ZIP 内 `General Logos/Cube/SVG/CUBE_2D_LIGHT.svg`；原样保存，没有重绘、裁切或改色。
- 原始文件 793 bytes，viewBox `0 0 466.73 532.09`，SHA-256 `c483c02f78eb2619778fdd959e72a9adfac4844854472cd2653d4cbfd60e4d71`。
- 已检查以 `<?xml` 开头、XML 根为 SVG、没有 script/foreignObject。压缩包在内存中按精确成员读取，未解压执行任何代码。
- 品牌指南要求称为 **Cursor**，不是 Cursor AI 或 Cursor Code；采用官方默认 2D cube。页面提供品牌资源供一致准确地表示 Cursor，但未提供单独的开源图标许可证；[Terms of Service](https://cursor.com/terms-of-service) §5.1 保留未明确授予的权利。README 保留来源与商标归属，不把该资源标注为本项目原创或自行重新授权。

## 自审记录

- [x] 八阶段都有具体改动文件、可执行命令或可观察判据；真实发现探针独立于安装器实现，没有用文件存在替代 Customize 组件发现。
- [x] 第一阶段先复制已下载官方图标；注册 precedes providers；插件安装依赖真实状态和三个通用宿主前置，未把后置依赖藏在收尾里。
- [x] 覆盖调用方 apply/inject、类型镜像、浏览器与宿主扫描入口、bridge/tools、fixture、脚本、lockfile、生成索引及两种 scope 的计数。
- [x] 将缓存/SQLite 论坛观察与正式文档区分；project 目录、global commands、启停、原生清单、版本都给出验证命令；没有凭类比补文件名。
- [x] 修正“PluginDisk 已支持任意 local 目录复制”和“全局 .agents/skills 已共享”的错误假设；修正“只有 .cursor-plugin 的包一律无法收录”为“可能借 layout fallback 收录但 metadata/自定义目录识别不完整”。
- [x] 不做列表覆盖 DB 修改、CLI fallback、客户端特判、其它 Agent 目录重复、云/team 管理和无关 UI 改造；所有真实目录写入排除在测试之外。

当前实现按用户要求直接交付；阶段 5 与阶段 8 的 Cursor 实机发现和界面验收由用户自行完成。项目插件与 Hub 启停当前均为 v1 不支持，启停交给 Cursor UI；文件事务测试通过不代表 Cursor 已加载插件组件。
