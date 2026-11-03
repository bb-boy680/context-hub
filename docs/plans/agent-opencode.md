# 接入 OpenCode 扩展

状态：待审批。本文只制定计划；尚未改动扩展源码、安装依赖或启动服务。

调研日期：2026-11-03。实施仓库为 `D:/work-space/context-hub-extensions`，宿主契约参考仓库为 `D:/work-space/dsh-context-hub`。下文没有根前缀的 `plugins/` 路径均属于扩展仓库。

## 背景与目标版本

OpenCode 是 P0 接入对象：skills、MCP、commands、agents 和持久指令都有官方文件接口，可以直接落到现有 `skills`、`mcp`、`prompts`、`targets`、`locales` 服务，不需要宿主识别 OpenCode，也不需要运行 OpenCode 才能交付文件。这里的 P0 是交付优先级判断，不是对使用量的统计结论。

当前参考实现：

- `plugins/claude.code/src/index.tsx:apply` 注册 skills、prompts、MCP、插件安装器、target 和双语文案；`provider.ts:createClaudeCodeMcp` 通过 `ctx.mcp.tools` 编辑 JSONC。
- `plugins/codex/src/prompts.ts:createCodexPrompts` 用持有标记保护手写文件、复用 `withSection` / `withoutSection`，并避免重复注册项目 `AGENTS.md`。
- 宿主 `packages/extensions/src/types.ts:AgentTargetDescriptor` 的资产种类只有 `skill | mcp | memory | hook | agent`，没有 `command` 或 `plugin`。命令通过 prompt form 表达，不扩展枚举。
- 宿主 `packages/resources/skills/src/provider.ts:readablePlaces` 按 provider id 过滤位置，只有 shared provider 恒读；`extension.ts:SHARED_PLACE` 目前仅提供工作区 `.agents/skills`。
- 宿主 `packages/resources/mcp/src/provider.ts:McpProvider` 以一个确定文件为一个 place；`src/library.ts:423-431` 的原文面板直接读取 `found.place`，因此 provider 不能背着它在 `.json` 与 `.jsonc` 之间换文件。
- 宿主 `packages/resources/prompts/src/workspace-provider.ts:workspacePromptProvider` 已负责项目 `AGENTS.md`。`PromptProvider` 支持任意 forms，由扩展决定文件格式。
- 宿主 `packages/resources/plugins/src/provider.ts:PluginInstaller` 面向 Hub 收录的插件包。它提供文件操作原语，不会把声明式资产包变成 OpenCode 代码插件。

**版本决策：本扩展首版以 OpenCode 2 为目标，文档验收基线为 v2.2.5；“扩展首版”与“OpenCode v1”不是一回事。** 官方 changelog 列出 v2.2.5（2026-10-30），但 GitHub `latest release` 返回 v1.19.5（2026-10-28），两者不能混为一个版本频道。真实验收必须记录所用二进制的版本，不能凭 latest 接口推断。

**目标客户端与配置都只支持 OpenCode V2，验收基线 v2.2.5。** 不实现 V1 扁平 MCP、旧 `enabled` 开关、目录别名、插件 API 或配置迁移。即使 V2 客户端仍能读取历史格式，Hub 也不为它增加读写适配；发现旧格式时明确报错并保持文件原样，交由用户在客户端之外处理后重试。

`plugin.yaml` 的 `engines.contextHub` 只约束 Hub 版本，不能表达 OpenCode 版本。OpenCode v2.2.5 基线必须同时写入本计划、扩展 README 和测试 fixture 的目标版本标签。真实验收先运行 `opencode --version`；输出不是已选定的 V2 验收版本就停止并报告“此扩展仅支持 OpenCode V2；检测到 <version>，未继续写入验证”。当前 `McpIo` / `PromptIo` 没有运行程序或查询版本的接口，首版不能在日常安装点击时自动识别并拦截 V1；不得根据配置形状或 Hub engines 猜版本。此限制必须公开说明，自动版本阻断需要后述通用诊断契约。

| 资产 | 唯一支持的 V2 形式 | 首版处理 |
| --- | --- | --- |
| MCP 节点 / 开关 | `mcp.servers.<name>` / `disabled` | 只读写原生 V2；默认 `disabled:false` |
| MCP 超时 / OAuth | `timeout` 对象 / snake_case OAuth 字段 | 原位更新保留，不增加编辑 UI、不读取 token |
| Skills | `.opencode/skills`、`~/.config/opencode/skills` | `<name>/SKILL.md`；不扫描旧单数目录 |
| Commands / Agents | `commands/*.md` / `agents/*.md` | 仅复数目录；agent 明确 `mode: subagent` |
| 指令 | 项目 `AGENTS.md`、`~/.config/opencode/AGENTS.md` | 项目共享入口、全局 provider；不回退 `CLAUDE.md` |
| 代码插件 | V2 `plugins` 与 `@opencode/plugin` | 不由本扩展管理 |

## 已核实的官方依据

先通过 Context7 解析 `/anomalyco/opencode`，查询迁移、配置与文件资产文档，再打开官方页面复核；Context7 的同一仓库结果可能混有不同代际文档，本文只采用 V2 页面。

| 依据 | 用途 |
| --- | --- |
| https://opencode.ai/v2/docs/config/ | 全局、项目、系统位置及配置优先级 |
| https://opencode.ai/v2/docs/mcp-servers/ | 原生 V2 MCP 字段、Streamable HTTP、整条 server 覆盖 |
| https://opencode.ai/v2/docs/skills/ | 六组技能位置、同 ID 优先级、V2 的额外文件形态 |
| https://opencode.ai/v2/docs/commands/ | Markdown frontmatter、参数与 shell 模板语义 |
| https://opencode.ai/v2/docs/agents/ | 代理文件与 `mode: subagent` |
| https://opencode.ai/v2/docs/instructions/ | 全局/项目 `AGENTS.md`、V2 无 CLAUDE 回退 |
| https://opencode.ai/v2/docs/plugins/ | 代码插件、本地目录、npm/Git 包与原生管理命令 |
| https://opencode.ai/v2/docs/cli/commands/ | 后续诊断命令，不能拿 V1 CLI 参数套 V2 |
| https://opencode.ai/docs/troubleshooting/ | Windows 默认 `%USERPROFILE%\.config\opencode` |
| https://opencode.ai/changelog | v2.2.5 的发布记录 |
| https://github.com/anomalyco/opencode/issues/40993 | Agent Plugins 标准支持请求仍 open，无关闭 PR，更新于 2026-10-28 |
| https://github.com/anomalyco/opencode/blob/805a42ffaa56b29a88baef87c7567f1ab9a40a8f/packages/util/src/global-roots.ts | XDG 环境变量与默认路径，无 APPDATA 分支 |
| https://github.com/anomalyco/opencode/blob/805a42ffaa56b29a88baef87c7567f1ab9a40a8f/packages/util/src/global.ts | `OPENCODE_CONFIG_DIR` 覆盖全局配置目录，`OPENCODE_TEST_HOME` 只控制 home |
| https://github.com/anomalyco/opencode/blob/805a42ffaa56b29a88baef87c7567f1ab9a40a8f/packages/core/src/config/discovery.ts | JSON/JSONC 名称、项目目录与系统目录发现 |

## 资产面与作用域

### 配置根

默认全局根是 `~/.config/opencode`；Windows 为 `%USERPROFILE%\.config\opencode`，不是 `%APPDATA%\opencode`。系统管理目录另为 Windows `%ProgramData%\opencode`、Linux `/etc/opencode`、macOS `/Library/Application Support/opencode`，首版不读写系统管理目录。

OpenCode 自身支持 `$XDG_CONFIG_HOME/opencode` 和 `OPENCODE_CONFIG_DIR` 等覆盖。当前 Hub `PlaceFiles`、`SkillPlace` 只有相对于 workspace/global 的路径，不能获取或解析客户端环境变量；`PluginDisk` 的环境根能力属于插件安装器，不能借它为普通 provider 偷渡文件访问。

**首版只覆盖默认全局根和当前 Hub 所选工作区。** 不扫描祖先仓库、不把环境变量写成字面路径、不声称自定义配置根已支持。README 必须明确：“自定义根目前需要手动处理。”Hub 显示的安装状态是所列物理文件的状态；自定义根、祖先配置、组织策略可能让 OpenCode 的最终状态不同。

### 宿主共同前置（不在首版实施）

OpenCode 的 `XDG_CONFIG_HOME` / `OPENCODE_CONFIG_DIR` 与 Copilot 的 `COPILOT_HOME` 属于同一个宿主契约缺口：普通资产 provider 无法声明由宿主解析的环境根。未来统一设计一个与具体 Agent 无关的根声明/解析能力，扩展只给声明；不得分别在每个扩展增加 Node 访问、CLI 绕行或私有环境读取桥。本计划只记录该共同前置，不实现它，也不把它列为默认路径交付的阻断项。

客户端版本自动诊断也应由通用宿主能力提供执行结果，再由扩展校验版本；当前没有该契约。首版 README 给出 `opencode --version` 检查步骤和 V1 不支持提示，验收入口硬性核验版本；不声称 UI 已能自动拒绝错误版本。

### Skills

| OpenCode 读取路径 | 作用域 | 首版 place | 与现有共享位置关系 |
| --- | --- | --- | --- |
| `.opencode/skills/<name>/SKILL.md` | workspace | `opencode`，dir `.opencode/skills` | 独立物理位置 |
| `~/.config/opencode/skills/<name>/SKILL.md` | global | `opencode-global`，dir `.config/opencode/skills` | 独立物理位置 |
| `.agents/skills/<name>/SKILL.md` | workspace | 复用 Hub `workspace` | 已有共享位置，禁止重复注册 |
| `~/.agents/skills/<name>/SKILL.md` | global | 不新增 | 当前 Hub 没有共享 global place；这是首版覆盖缺口，不能写成“已由共享层支持” |
| `.claude/skills/<name>/SKILL.md` | workspace | 不新增 | Claude Code 扩展已声明同一物理路径；重复注册会重复位置与计数 |
| `~/.claude/skills/<name>/SKILL.md` | global | 不新增 | 同上；仅启用 OpenCode 时不会额外扫描这里 |

保留 target locations/README 中的完整“客户端可读取路径”和“Hub 可管理路径”区分。对 `.claude/skills` 与 `.agents/skills` 明确写“兼容读取，本 OpenCode 扩展不提供写入口、不重复注册、不重复计数”；共享工作区和 Claude 扩展自己的入口继续由原 provider 计数。两个原生 place 使用同一个 provider id `hub.target.opencode`，不设置 `shared: true`。只选 OpenCode 时保留共享工作区位置和两处原生位置；再选 Claude Code 不产生额外 `.claude` 副本。不同物理位置同名技能各有安装数，列表仍遵循宿主已有的同名行合并逻辑，不能把位置记录一起去掉。

V2 还读取顶层 `skills/*.md`、分组目录中的 `SKILL.md`，现有 Hub skill 存储以 `<name>/SKILL.md` 为契约。首版交付这一兼容子集，不修改宿主扫描器，不声称完全枚举 V2 的全部技能形态。

### MCP

每个精确文件注册一个 place，保证列表计数、查看原文、行定位与写入一致。下表六个 place 都是 `switchable: true`，**开关表达该文件中记录的配置，不表达 OpenCode 最终生效或连接状态**。每个 label 直接写具体文件名，目录内的两个 workspace 变体连 `.opencode/` 一起显示，让用户一眼看出这一行改哪个文件；不加泛化后缀。label 由扩展的 `McpPlace.label` 提供，沿用现有菜单与详情的位置标签；不为本 Agent 增加宿主特判。provider 不能动态改文件，否则详情会读取错误文件。首版接受六行位置，不为隐藏空文件改宿主 UI；README 逐行解释对应文件。

| Place id | scope | label | `file` |
| --- | --- | --- | --- |
| `opencode-global-jsonc` | global | `OpenCode · opencode.jsonc` | `.config/opencode/opencode.jsonc` |
| `opencode-global-json` | global | `OpenCode · opencode.json` | `.config/opencode/opencode.json` |
| `opencode-workspace-jsonc` | workspace | `OpenCode · opencode.jsonc` | `opencode.jsonc` |
| `opencode-workspace-json` | workspace | `OpenCode · opencode.json` | `opencode.json` |
| `opencode-dotdir-jsonc` | workspace | `OpenCode · .opencode/opencode.jsonc` | `.opencode/opencode.jsonc` |
| `opencode-dotdir-json` | workspace | `OpenCode · .opencode/opencode.json` | `.opencode/opencode.json` |

新建配置推荐用户选 `opencode.jsonc` 的对应作用域。缺失文件读取为零条，不自动创建；明确安装到哪个 place 就只改那个文件。某个文件失效必须报错，不能退到另一文件并报成功。多个文件同名服务器按物理位置分别报告；不把六处合并成“客户端最终生效状态”。V2 的高优先级配置会替换同名 server 整体，局部 `disabled` 覆盖不能代替完整声明。

README 的开关说明必须使用明确句子：“MCP 开关仅修改这一行对应文件的声明。系统、全局、项目或 `.opencode` 的更高优先级配置可能覆盖它；开关状态不是 OpenCode 的最终连接状态。”UI 行标签直接显示文件名；成功反馈不得声称已连接、已断开或已改变最终生效状态。

验收加入跨层反例：全局同名 server `disabled:false`、项目完整同名 server `disabled:true`；切换全局开关后，断言只有全局文件变化，项目文件不变，OpenCode V2 `mcp list` 仍报告项目层决定的状态。该用例同时核对两个 place 分别读取各自文件状态，不能把最终状态回填成两处同值。

### 已知边界

- 只支持 OpenCode V2，基线 v2.2.5；运行时 provider 无法自动查询版本，不用文件形状猜测、不借 `plugins` 执行 CLI。验收先运行 `opencode --version`，遇到 V1 明确拒绝继续；安装前自动硬拦需要通用客户端诊断/版本查询宿主能力。
- 只支持默认根；`XDG_CONFIG_HOME` / `OPENCODE_CONFIG_DIR` 等自定义根目前需要手动处理，不能用 `engines.contextHub` 表达客户端版本或根位置。
- 兼容 `.claude/skills` / `.agents/skills` 不产生 OpenCode 自己的写入口或重复计数；global `~/.agents/skills` 当前没有宿主 place，首版不覆盖。
- 六处 MCP 开关是文件级声明；最终配置优先级、系统策略和实际连接状态由 OpenCode 决定。

### Prompts、命令、代理与 memory

| Form | workspace | global | 去重/语义 |
| --- | --- | --- | --- |
| `commands` | `.opencode/commands/<slug>.md` | `~/.config/opencode/commands/<slug>.md` | 明确的可调用命令，不改 JSON command 映射 |
| `agent` | `.opencode/agents/<slug>.md` | `~/.config/opencode/agents/<slug>.md` | 写 `mode: subagent`，不隐式替换主代理 |
| `instructions` | 使用 Hub shared `workspace` → `AGENTS.md` | `~/.config/opencode/AGENTS.md` 标记段 | 项目入口不重复注册；全局由 OpenCode provider 管理 |

Prompt place 仍用 `opencode`、`opencode-global`（各服务独立的注册表）；workspace 提供 `[commands, agent]`，global 提供 `[commands, agent, instructions]`。不提供 `rule`，因为 `.opencode/rules` 不是这里已核实的自动发现面；不写 `.agents/commands` / `.agents/agents` 并称 OpenCode 会读取。

命令 frontmatter 最小形式：

```markdown
---
description: "Review the current changes"
---

<!-- context-hub:code-review -->
Review the diff.
```

代理最小形式：

```markdown
---
description: "Review the current changes"
mode: subagent
---

<!-- context-hub:code-review -->
Review the diff.
```

- 命令名、代理 id 来自文件名，**不写 `name` frontmatter**。命令支持的元数据为 `description`、`agent`、`model`、`subagent`，正文提供 template；首版只生成 description。代理只生成 description 与 mode。
- `commandFile({frontmatter:true})` 会强制生成 `name`，不能直接当成 OpenCode 原生模板。复用 `commandFile({frontmatter:false})` 规范化正文、`slugOf` 生成安全文件名、`describeBody` 生成描述；扩展内只写这一小段 frontmatter，description 用单行化后 `JSON.stringify` 的双引号标量，不引入 YAML 依赖。
- 所有权标记固定在 frontmatter 后的首个正文行，只认可该位置的完整匹配；不要用正文任意处 `includes(marker)` 认领手写文件。无标记同名文件拒绝覆盖、拒绝删除；有标记文件可幂等更新。
- 全局 memory 用既有 `withSection` / `withoutSection`。安装/移除之前若同 slug 的起止标记不完整，明确拒绝；避免既有 section helper 将不完整区块后的手写内容吞掉。移除仅清理本段；空文档可按已有 provider 惯例删除。
- 保留用户正文里的 `$ARGUMENTS`、`$1` 和 shell 模板原文。安装不执行模板；后续真机测试只用不含 shell 注入的本地 fixture。

## 插件安装器的边界

**扩展 v1 不做插件包安装器，不注册 `ctx.plugins`，manifest 不 inject `plugins`。** 这不代表 OpenCode 没有插件：

- V2 有新的代码插件 API，`plugins` 支持 npm/Git 包与本地插件目录，也有 `opencode plugin add/list/check/update/remove`；这些管理的是 OpenCode 代码插件。
- Hub Plugins 当前收录的是 manifest + skills/commands/agents/MCP 等资产包。官方 Issue #40993 仍 open；把其目录拷进 OpenCode 的代码插件目录不会产生等价加载。

以后支持包有两条前置路径：

1. 官方实现 Agent Plugins：先确认具体 release、manifest/schema、发现路径、启停/卸载与原生加载诊断，再实现纯文件 installer。
2. 用户明确选用并授权桥接层：优先评估已有社区实现，不为接一个客户端就自建一个完整包运行时。`oc-agent-plugins` 的作者仓库明确支持 OpenCode v2 和 Agent Plugins/Claude/Codex/Cursor 包（https://github.com/theacrat/oc-agent-plugins）；`@sulesky/opencode-plugger` 的公开说明主要针对 Claude Code 包且示例仍用 V1 `plugin`，不能据此声称支持 V2 或全部包格式。

桥接不是“只加 installer.ts”：要维护两端版本、桥接代码安装与加载、包 receipt/版本/命名空间、路径变量、skills 与 MCP 注册、commands/agents 语义、hooks/monitors 信任与执行、配置所有权、失败回滚以及 uninstall 后数据保留。官方加载诊断必须独立证明组件加载，不以包列表有一行充当成功。静态拆包转换是另一种产品能力，会失去包生命周期与部分语义，首版同样不做。不得把社区能力描述为 OpenCode 官方支持。

## 复用与 MCP 字段适配

复用宿主 `ctx.mcp.tools` 的 `readJsonObject`、`valueAt`、`editJson`、`jsonValueLines`、`McpError`；保留 JSONC 注释、CRLF、尾逗号和无关节点，插件 bundle 不运行时导入 `@context-hub/*` 或 Node 模块。

`mcp` 与 Claude 常见的 `mcpServers` 不只是根键不同：

| Hub 通用声明 / 常见 mcpServers 条目 | OpenCode 字段 | 处理 |
| --- | --- | --- |
| `transport: stdio` | `type: local` | 显式映射 |
| `command: string` + `args: string[]` | `command: [program, ...args]` | 数组拆合，不 shell split/join |
| `env` | `environment` | 字符串映射，不展开真实环境值 |
| `transport: http` | `type: remote` | url/headers 直接保留 |
| `transport: sse` | V2 官方描述为 Streamable HTTP，无可指定 SSE 的字段 | 安装明确报“不支持该 transport”；不悄悄转成 HTTP |
| 开关 | V2 entry.disabled | 只改所在条目的反向布尔 |
| Hub 不含 `cwd/oauth/timeout/codemode/protocol` | OpenCode 原生扩展字段 | 原位更新保留，不给库模型编造字段 |

`readDeclaration` 只认字符串 command，不认 OpenCode 数组；必须先验证 local/remote 形状再适配。远程可复用 `readDeclaration({url,headers})`；本地先变成 `{command: argv[0], args: argv.slice(1), env: environment}`。`writeDeclaration` 同样不能原样塞进 `mcp`。remote 读回视为 HTTP；不能从 `type: remote` 推测旧服务只支持 SSE。

MCP 操作约束：

1. 只从 `mcp.servers` 读取 server；`mcp` 与 `mcp.servers` 存在时必须是对象。缺文件/缺容器返回空；损坏容器报错，不当作空表覆盖。
2. 检测到扁平 `mcp.<name>` server 或目标 server 含旧 `enabled`、数字 timeout、camelCase OAuth 字段时，报“仅支持原生 V2 配置”。该文件的所有修改操作在写入前拒绝，包括混合配置；不归一化、不迁移、不删除旧字段。识别旧字段仅用于拒写，不形成第二套 parser。
3. 安装、更新、启停、卸载和 locate 统一使用 `["mcp", "servers", name]`；不按已有文件形状切换路径。新建缺失父节点，默认开启；已存在 server 保留 `disabled` 和其它当前原生选项。
4. 更新只 patch 与交付有关的叶节点。local/remote 类型切换移除互斥字段：local 的 command/environment/cwd 与 remote 的 url/headers/oauth 不能相互残留；共享 timeout/protocol/codemode 和未知字段不改。
5. `setEnabled` 要求该精确文件已存在完整 server，只写 `disabled = !on`，拒绝生成影子条目；scope 必须与 place 一致。
6. `uninstall` 只删该 server；配置文件、其它 server 与无关设置保留。`locate` 使用同一实际 JSON 路径。
7. `{env:...}` / `{file:...}` 原样保存；不读取引用文件、token 或 auth.json，不转换其它客户端变量。
8. `McpDeclaration` 不携带全部客户端字段；跨客户端再安装与宿主先卸后装的重命名可能丢高级选项，README 写明限制，本任务不改重命名协议。

只实现一套 V2 路径和 `disabled` 开关，不建立版本检测分支、迁移器或配置形状适配层。

必过文件测试（目标标签均为 `OpenCode v2.2.5`）：

1. 空/新建文件只生成 `mcp.servers.<name>`。
2. 原生 V2 文件更新指定节点，保留其它服务、注释和无关键。
3. 纯扁平旧文件、混合文件、新旧状态字段并存均明确拒写，原文件逐字节不变。
4. 原生 server 可以名为 `servers`，实际路径为 `mcp.servers.servers`，不能误判成旧扁平格式。

## 文件清单与改动范围

实施后的扩展目录完整清单如下。测试 fixtures 直接放在测试代码里，或由测试在临时目录生成，不提交用户目录样本。

```text
plugins/opencode/
  package.json
  plugin.yaml
  build.mjs
  tsconfig.json
  vitest.config.ts
  README.md
  assets/icon.svg
  assets/LICENSE.opencode.txt
  src/index.tsx
  src/contracts.ts
  src/locations.ts
  src/messages.ts
  src/provider.ts
  src/prompts.ts
  __test__/index.test.ts
  __test__/provider.test.ts
  __test__/prompts.test.ts
  __test__/host.test.ts
  lib/index.js                 # build 生成，源码分支不提交
```

仓库级只允许 `pnpm-lock.yaml` 增加新 workspace importer，以及必要时根 README 的扩展列表说明；不改通用构建脚本、CI、现有 Claude/Codex 实现和宿主生产代码。`pnpm-workspace.yaml` 已是 `plugins/*`，`scripts/build-marketplace.mjs` 已自动扫描，所以无需加入手写市场记录或手改 `marketplace.json`。

`package.json` 使用 `name: opencode`、`version: 0.1.0`、`main/exports: lib/index.js`；复用当前 `@types/react`、esbuild、TypeScript、Vitest 开发依赖版本，不新增生产依赖。`plugin.yaml` 使用 `id: opencode`、`engines.contextHub: ">=0.2.0 <0.7.0"`、`category: agent`、现有 filesystem/assets 权限、`inject: [skills, prompts, mcp, targets, locales]`，不声明 version/entry。

`src/contracts.ts` 仅镜像实际用到的宿主类型，`locate` 为 `[number, number] | null`，不要照抄 Claude 当前过宽的 `any` 或错误字符串返回类型。target/provider id 均为 `hub.target.opencode`；supports 为 `[skill, mcp, memory, agent]`，不加 hook。

## 图标及条款

已下载文件：`D:/work-space/dsh-context-hub/docs/research/agent-icons/opencode.svg`。

- 固定来源：https://raw.githubusercontent.com/anomalyco/opencode/805a42ffaa56b29a88baef87c7567f1ab9a40a8f/services/www/public/favicon.svg
- 官方品牌页：https://opencode.ai/brand
- 已确认是品牌 mark，不是占位图：同 commit 的 `packages/ui/src/components/logo.tsx` 导出 `Mark`，其 `data-component="logo-mark"` 下两条图形路径与 favicon 的两条路径一致，仅做 16 倍缩放并平移 `(128,96)`；favicon 另加官方深色方形背景。核对依据：https://github.com/anomalyco/opencode/blob/805a42ffaa56b29a88baef87c7567f1ab9a40a8f/packages/ui/src/components/logo.tsx 。此处只比对官方形状，下载文件保持原样。
- 613 字节，开头为 `<svg`，SHA-256 `14fba64b47167d4b47d25712a8471e850dff72f3a63621e6049d208a019d8ed1`。
- 下载方式：`curl -L --fail`，先放独立空临时目录，检查 SVG 头及 32 KiB 大小限制后原样复制，临时目录已清理。未描摹、改色或重绘。
- 来源仓库根 LICENSE 为 MIT，Copyright (c) 2025 opencode，要求保留版权和许可声明。实施时在 `assets/LICENSE.opencode.txt` 附原许可全文和来源链接；使用原图识别客户端，不暗示官方背书。官网条款明确开源软件以仓库许可为准（https://opencode.ai/legal/terms-of-service）。品牌页未在此次文本抓取中给出额外的独立商标授权；不能把 MIT 描述成商标授权。

## 分阶段实施

计划获批后、动手前创建六条可见任务，subject 使用以下阶段名；开始标 `in_progress`，验收通过立即标 `completed`。只有用户确认整份计划完成后才归档本文。

以下 `pnpm` 命令均来自已读的扩展根与 Claude/Codex `package.json`；新包复制相同 `build/test/typecheck` scripts 后，`--filter opencode` 才有对象。本轮没有运行这些未来实现的检查。

### 阶段 1：建立扩展脚手架

**目标**：独立包可被构建和市场索引识别。

**改动文件**：`plugins/opencode/{package.json,plugin.yaml,build.mjs,tsconfig.json,vitest.config.ts,README.md}`、`assets/{icon.svg,LICENSE.opencode.txt}`、`src/{index.tsx,contracts.ts,locations.ts,messages.ts}`、`__test__/index.test.ts`；需要时新增 lockfile importer。

**具体动作**：

1. **第一步将 `D:/work-space/dsh-context-hub/docs/research/agent-icons/opencode.svg` 原样复制到 `D:/work-space/context-hub-extensions/plugins/opencode/assets/icon.svg`**，核对上述 hash。可执行文件复制命令为 `node -e 'const f=require("node:fs");const p=require("node:path");f.mkdirSync(p.dirname(process.argv[2]),{recursive:true});f.copyFileSync(process.argv[1],process.argv[2]);' D:/work-space/dsh-context-hub/docs/research/agent-icons/opencode.svg D:/work-space/context-hub-extensions/plugins/opencode/assets/icon.svg`。
2. 按完整清单创建最小骨架；只先注册 target 和 locale，不注册尚未实现的 provider，不留下会抛错的占位动作。
3. 沿用 esbuild 的 `absWorkingDir` 与四个 React external。图标组件用 `<img src="/hub/extensions/opencode/assets/icon.svg">`，保留 className、aria-hidden 和合适的 alt，不复制图形路径到 JSX。
4. 添加 identity/locale/manifest 的首批断言。只使用既有开发工具，不新增运行时依赖。若新 workspace 需要链接依赖，审批执行阶段后按仓库既有 `pnpm install` 更新 lockfile。

**验收**（工作目录为扩展仓库）：

```sh
pnpm --filter opencode typecheck
pnpm --filter opencode test
pnpm --filter opencode build
```

构建入口可导出 `apply`；bundle 无 Node/Hub runtime import；图标小于 32 KiB、许可文件齐全。此阶段宿主仍能加载 extension，未实现能力不出现。

### 阶段 2：注册身份与技能位置

**目标**：目标描述、全局/工作区位置和技能计数遵循既有注册表。

**改动文件**：`src/index.tsx`、`src/locations.ts`、`src/contracts.ts`、`src/messages.ts`、`__test__/index.test.ts`、`README.md`。

**具体动作**：注册两处原生 skills place；补全 target 的资产面和格式说明；双语 locale 均使用 `opencode.*`。在说明中明确兼容来源与 Hub 管理来源的差别。注册时不得重复声明 `.agents/skills`、`.claude/skills`，也不得设置 shared。

**验收**：

```sh
pnpm --filter opencode test __test__/index.test.ts
pnpm --filter opencode typecheck
pnpm --filter opencode build
```

断言两处 place 的 `(id,scope,dir)` 正确，两个 provider 与 target 同 id；注册/注销引用符合宿主效果生命周期。记录只选 OpenCode、同时选 Claude Code、禁用 OpenCode 三种场景的预期位置集合，供阶段 5 用真实宿主核验。

### 阶段 3：实现 MCP 文件适配

**目标**：六个物理文件都能独立读、安装、启停、移除和定位，只支持原生 V2，旧格式拒写且不迁移。

**改动文件**：`src/provider.ts`、`src/contracts.ts`、`src/locations.ts`、`src/messages.ts`、`src/index.tsx`、`__test__/provider.test.ts`、`README.md`。

**具体动作**：实现 `createOpenCodeMcp(tools)`；用固定 place 表选择文件；按“复用与 MCP 字段适配”实现单一 V2 路径、声明映射、保留字段、旧格式拒写和错误本地化。六个 label 直接使用具体文件名，README 同步文件级开关说明，不承诺最终连接状态。完成后才在 apply 注册 MCP provider。边写分支边补对应的反例，不把 JSONC 编辑器复制进扩展。

**验收**：

```sh
pnpm --filter opencode test __test__/provider.test.ts
pnpm --filter opencode typecheck
pnpm --filter opencode build
```

至少覆盖 local/remote × JSON/JSONC × workspace/global；“复用与 MCP 字段适配”中的四条原生/拒写测试必须全部通过。另对六个固定文件逐个断言 label 直接是对应文件名、IO ref 和定位路径。每次写失败、格式不明、SSE 不支持都保持原文件内容不变。所有成功读写固定使用 `mcp.servers`；旧扁平和混合输入只有拒写反例，不保留成功路径。

### 阶段 4：实现命令代理与记忆交付

**目标**：提示词菜单只展示真正能被 OpenCode 消费的 forms。

**改动文件**：`src/prompts.ts`、`src/contracts.ts`、`src/locations.ts`、`src/messages.ts`、`src/index.tsx`、`__test__/prompts.test.ts`、`README.md`。

**具体动作**：实现 `createOpenCodePrompts(icon, tools)`；生成最小 command/agent Markdown；全局 memory 写标记段。复用 slug、正文规范化和 section 工具；加入精确所有权检查、手写文件冲突、缺失工作区、未知 form、损坏 marker 的拒绝路径。agent 默认明确为 subagent，不设置模型、权限或工具列表。

**验收**：

```sh
pnpm --filter opencode test __test__/prompts.test.ts
pnpm --filter opencode typecheck
pnpm --filter opencode build
```

命令/代理分别安装到两个 scope 后 held 正确；同一 prompt 更新不多出文件；卸载后只撤回本扩展写入的文件/段；工作区没有第二个 AGENTS.md form；YAML 描述中的中文、冒号、引号、换行不会生成新字段，正文参数字面量不变。

### 阶段 5：验证真实宿主与回归

**目标**：证明真实工具、文件端口、计数和注册生命周期能一起工作；所有写入都在临时根内。

**改动文件**：`__test__/host.test.ts` 和前三个测试文件；`README.md` 记录可复现命令。宿主源码不改。

**新增测试基础设施**：`CONTEXT_HUB_CHECKOUT` 和 `__test__/host.test.ts` 目前都不存在，这是本计划明确新增的本地集成入口，不是仓库现有机制。选择这一入口是为了在不复制 JSONC 编辑器、不改宿主生产代码的前提下验证真实工具。

**具体动作**：

- `host.test.ts` 读取 `process.env.CONTEXT_HUB_CHECKOUT`，缺省时用 Vitest 的显式 skip suite；给值时必须为绝对路径，并先验证目标文件存在。`beforeAll` 内用 `node:path.resolve` 与 `node:url.pathToFileURL` 构造文件 URL，再动态导入该 checkout 的 `packages/resources/mcp/src/toolkit.ts`、`packages/resources/prompts/src/toolkit.ts`、`packages/core/src/host/place-files.ts`、`packages/resources/skills/src/{provider,library}.ts` 和 `packages/resources/skills/src/host/skills-fs.ts`；不从 `src/index.tsx` 或任何产品源码引用它，也不加入 package.json runtime dependencies。
- `__test__/host.test.ts` 自带 `OpenCode v2.2.5` 目标标签、原生 fixture 及旧格式拒写反例；普通扩展 CI 继续跑单元测试，在未设置变量时明确报告集成套件 skipped，不下载 Hub、不把 skip 当通过。发布前本地门禁必须执行下面带变量的命令，目标文件缺失、导入失败或依赖不可用均直接失败，不自动转 skip。无需改 CI 工作流；README 记录这一分工。
- 所有用例先 `mkdtemp` 创建 `hubHome`、`workspace`、`userHome`；调用 `createFsPlaceFiles({home,folder,userHome})`、`createFsSkillStore({home,folder,userHome})` 必须三根显式传入。文件端口测试另断言每次路径均落在所属临时根。
- JSONC 必须用真实工具证明保留注释和无关节点，不能用 JSON.parse/stringify 的 mock 宣称通过；mock 仅验证映射与调用目标。
- 实际读取三处 SKILL.md：共享 workspace、OpenCode workspace、OpenCode global；各一份不同名称，另造同名跨位置例。验证同名列表行合并但各 place count/卸载位置保留；加 Claude provider 后其两个目录只读一次；`~/.agents/skills` 不计入本扩展并有明确限制。
- 测试最后清理自己创建的目录；失败也通过 afterEach/finally 清理，不删除用户根、不杀已有进程。

**验收**：

```sh
pnpm --filter opencode test
CONTEXT_HUB_CHECKOUT=D:/work-space/dsh-context-hub pnpm --filter opencode test __test__/host.test.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`CONTEXT_HUB_CHECKOUT` 是本计划新增的测试专用变量，不是 OpenCode 或 Hub 的产品配置。脚本必须在变量存在但路径无效时失败，不能再次 skip。`pnpm build` 自动生成的市场记录 id/source.path/icon/main/version 正确；不手改生成物。

在宿主仓库用已配置的项目测试验证既有契约：

```sh
pnpm test --project skills --project mcp --project prompts --project extensions
```

这些测试不证明新扩展的集成，集成证据来自上一条显式 host.test 命令。最后 `git diff --check`，确认没有无关源码、凭证或生成文件进入改动。

### 阶段 6：核验隔离客户端与界面

**目标**：在真实 OpenCode v2 与真实 Hub 载入结果中核对交付；不修改用户真实目录。

**改动文件**：正常只更新 `plugins/opencode/README.md` 中的已验证版本与限制；发现问题回到对应实现/测试文件修正并重跑相关检查，不扩展范围。

**准备与隔离**：

- 使用独立临时 workspace、Hub home、系统用户目录（一次性测试 OS 用户/容器优先）。CLI 必须是单独指定的 OpenCode v2 二进制，不替换用户已安装版本。
- 如通过子进程环境隔离：给子进程 env 对象显式设置 HOME、USERPROFILE、XDG_CONFIG_HOME、XDG_DATA_HOME、XDG_CACHE_HOME、XDG_STATE_HOME、OPENCODE_CONFIG_DIR、OPENCODE_TEST_HOME、TMP/TEMP/TMPDIR；这些都是指向同一测试树下的不同目录，不改父 shell 的 HOME。不要只设置 OPENCODE_TEST_HOME，它不会单独隔离 XDG 状态根。
- **先运行 `opencode --version` 并记录输出**，必须证明是本次锁定的 V2 验收二进制；不是 V2 或不是预定版本就停止并给出版本不支持/基线不匹配提示，不继续写入 fixture。然后先看每条诊断命令的 `--help`，确认它不会连接用户已有后台服务；采用实际支持的私有 server/standalone 或显式 loopback server 参数，不能默认所有子命令支持 `--standalone`。
- 以相同 env/cwd 运行 Node `os.homedir()` 和 `opencode debug paths`，任一路径落到真实用户目录就停止。不读取真实 auth，不运行 login、upgrade、plugin add 或付费模型请求。所有进程显式 cwd 为临时 workspace；记录自己 spawn 的句柄/PID，只关这些进程。

**已核实的命令与观察点**（全部在隔离 env/cwd 中）：

```sh
opencode --version
opencode debug --help
opencode debug paths
opencode debug config
opencode debug agents
opencode mcp --help
opencode mcp list
```

- **先读真实写入文件，再看客户端结果**。每次 Hub 安装/启停/卸载后，使用只读命令 `node -e 'process.stdout.write(require("node:fs").readFileSync(process.argv[1],"utf8"))' <本次临时目标文件>` 保存前后文本对照，检查准确节点、开关字段和无关字节；`opencode debug config` 再确认客户端实际读取的来源。原生 fixture 由同一个 V2 二进制验证；旧格式只验 Hub 拒写且无文件变化；页面看起来正确不算配置验收。
- 同目录 `.json` 与 `.jsonc` 的优先级尚未做运行时探针，不先假设：在临时同目录分别放同名、不同 loopback URL 且 disabled 的完整 MCP server，再执行 `opencode debug config` 与 `opencode mcp list`，对照两份原文确定实际来源。另测 direct 与 `.opencode/` 文件并存，记录真实结果。
- MCP 只用无凭证、本地的测试 server 或保持 disabled 的声明；`mcp list` 能证明发现/启停，若只跑 disabled 场景不能报告连接成功。连接测试使用本地 fixture，不能 npx 下载远程服务。
- `debug agents` 中出现生成的 agent id，description 与 subagent mode 正确。TUI 命令选择器中出现生成命令；skills 可通过 `@<测试 skill-id>` 的发现入口确认。无需实际调用模型；memory 的模型采纳不在无模型验收的证明范围内。
- Hub 使用自己的隔离用户根和三根临时目录加载已构建 `opencode` 扩展。先 `pnpm --filter web build`，再按宿主真实脚本 `node apps/web/server.ts --home <临时 hubHome> --folder <临时 workspace> --port <自选空闲端口> --static apps/web/dist` 启动。普通 `--home` 不能隔离 global place，因此没有先核对测试进程 userHome 时不得点击 global 写入。
- 浏览器操作必须使用 `ego-browser` skill。核对 Agent 选择项、官方图标、中英文、技能位置计数、MCP 六个文件路径和原文、command/agent 安装与卸载、global memory 的独立入口。Plugins 页不出现 OpenCode 包安装目标。切换/禁用扩展后位置随生命周期移除。
- 优先用隔离 OS 用户完成整个 UI；如果没有可靠 userHome 隔离，UI 只做只读观察，写入全部由阶段 5 的真实文件端口测试覆盖，并在报告中记为 UI 写流程未验收。

**验收判据**：记录实际 OpenCode 版本、路径诊断、至少一个真实命令/代理/skill 发现结果、原生 V2 MCP 读取和旧格式拒写结果，以及 Hub UI 实际状态；清理前后测试树和两个仓库 `git status --short` 无残留。不能把“文件存在”“列表有包名”写成“运行时组件已加载”。

## 测试清单

| 范围 | 必须覆盖 |
| --- | --- |
| 身份/注入 | manifest、target/provider id、准确 inject、双语 key、资产 icon URL、无 plugin installer |
| Skills | 两处原生与共享 workspace；未选 agent 不读；与 Claude 共存不重复；0 与未知数量区分；同名多物理位置计数和撤回不丢 |
| MCP 读取 | local 数组命令、带空格参数、remote headers、V2 disabled 默认值、畸形条目、server 名为 servers；旧扁平/混合/旧 enabled 明确拒写 |
| MCP 写入 | 六个 ref、JSON/JSONC、BOM/CRLF/注释/尾逗号、补父节点、现有 disabled 保留、无关字段不变、transport 切换、SSE 明确拒绝 |
| MCP 启停/删除 | 正反布尔、missing entry 拒绝、scope 不匹配拒绝、删除最后一项保留文件、locate 准确、IO 失败不假成功；全局开启/项目禁用时分别读文件值，切换低优先级文件不宣称最终连接改变 |
| Prompts | commands/agent 两个 scope；全局 memory；project AGENTS 共享入口；描述转义；同名手写文件保护；marker 精确匹配；损坏 section 拒绝；幂等/更新/移除 |
| 文件隔离 | 显式 home/folder/userHome、三根临时目录、禁止真实 HOME 回退、非法名字沿用宿主 slug 拒绝 |
| 运行时 | 不导入 Hub 包/Node、禁用后注册卸载、官方图标 URL 可读、原文和物理 place 一致、真实客户端发现，不依赖模型回合 |

## 不做

- 不实现插件包 installer，不安装 npm/OpenCode JS 插件，不安装/执行桥接插件，不把 Claude hooks 转成 OpenCode hooks。
- 不支持 OpenCode V1 客户端及其配置；不适配旧扁平 MCP、enabled、单数目录或插件 API，不迁移配置、不升级或替换用户 OpenCode。
- 不改宿主生产代码、枚举、UI、通用文件端口或既有 Claude/Codex 扩展；不顺手重构共享 schema。
- 不支持自定义 XDG/OPENCODE_CONFIG_DIR/OPENCODE_CONFIG 路径，不写系统管理目录、远程组织配置、凭证或服务状态库。
- 不扫描祖先目录，不重现 OpenCode 的最终配置合并和策略计算；place 状态只对应那一份文件。
- 不重复注册 `.agents/skills` / `.claude/skills`；不扩充共享 global 技能位置，不支持 V2 扁平或分组 skills 扫描。
- 不增加规则目录、模型/工具/权限表单、AI 自动生成 agent 参数、命令模板执行、shell 注入解析。
- 不安装依赖来做本轮调研，不启动服务、不运行模型、不提交或 push；实施期发布/部署另按用户授权处理。

## 待验证与待确认

以下为计划批准后的验收项，不是本轮已完成的实验；每项都有命令或明确可观察判据。

| 项目 | 验证命令/方法 | 决策与阻断条件 |
| --- | --- | --- |
| 用户目标客户端是否为 V2 | 隔离环境先执行 `opencode --version`，再读临时配置原文；官方频道复核 `gh release list -R anomalyco/opencode --limit 10` | 锁定 V2/v2.2.5；V1 明确不支持，验收停止并报告版本；首版 UI 无自动版本检测契约，README 明示限制 |
| Windows 默认根和自定义根实际落点 | 同 env `opencode debug paths`、`node -p 'require("node:os").homedir()'`；再设置测试 XDG_CONFIG_HOME/OPENCODE_CONFIG_DIR 对照 | 默认根应为测试用户 `.config/opencode`；覆盖不在首版管理范围 |
| CLI 是否隔离后台服务 | `opencode debug --help`、`opencode debug config --help`、`opencode mcp list --help` | 没有验证私有服务/目标服务方式前，不使用可能连接真实 daemon 的诊断 |
| JSON/JSONC 同时存在及嵌套项目优先级 | 临时文件放同名不同 url/server，`opencode debug config`、`opencode mcp list` | 六处按物理文件分别管理；只在观察后记录实际优先级，不凭扩展遍历顺序假设 |
| command/agent 最小 frontmatter 与 marker | `opencode debug agents`；TUI 命令选择器；`pnpm --filter opencode test __test__/prompts.test.ts` | 不显示或有格式警告则修模板，不向宿主加专用分支 |
| skills 的链接/Windows junction 是否被 V2 发现 | `pnpm test --project skills`；隔离 Hub 安装后在 OpenCode `@<测试 id>` 发现入口观察 | 只有复制用例通过不能宣称 link 模式通过 |
| JSONC 与真实宿主组合 | `CONTEXT_HUB_CHECKOUT=D:/work-space/dsh-context-hub pnpm --filter opencode test __test__/host.test.ts` | 明确执行且不 skip，所有写入仅在临时三根 |
| 上游 Agent Plugins 状态 | `gh issue view 40993 -R anomalyco/opencode --json state,closedAt,url` | 仍 open 则保持不做；将来关闭也需核对对应 release 和加载行为 |
| 桥接层的未来版本契约 | `gh api repos/theacrat/oc-agent-plugins/contents/package.json`；查 README/compatibility audit | 仅评估，不安装；未经独立授权不进入首版 |
| 图标来源与条款 | `curl -L --fail https://raw.githubusercontent.com/anomalyco/opencode/805a42ffaa56b29a88baef87c7567f1ab9a40a8f/LICENSE`；校验本地 SVG hash | 附 MIT 原文；不把代码许可扩写成官方背书或商标授权 |

建议审批时确认本计划整体；目标 V2、默认根、插件包后置与两处原生 skills 已按本轮协调收敛。剩余产品限制是版本误装无法由现有 provider 自动诊断、自定义根需要手动处理；若要自动硬拦这两类场景，应另行批准通用宿主前置，不临时加每 Agent 私有通道。其余实现按本文既定选择执行，不逐项重复询问。

## 自审结果

- [x] 六阶段均有改动文件、真实脚本来源的验收命令和具体判据；测试注入明确标为新增基础设施，写清文件、读取路径和 CI skip/本地门禁行为。
- [x] 先建立可构建骨架，再注册已实现 provider；所有测试工具/文件在使用前建立，阶段结束可加载。
- [x] 覆盖调用方 apply、manifest inject、contracts、双语 messages、构建入口、lockfile、市场生成、测试 fixtures 与文档；未漏 lifecycle。
- [x] 目标和成功读写都仅 V2/v2.2.5；旧扁平、混合和旧字段只用于零写入拒绝测试，没有原位兼容分支。
- [x] 已修正共享 skills 仅 workspace 的事实；不把 global .agents 未覆盖写成去重完成。
- [x] 已确认原文面板直接读 McpPlace.file，采用六个固定文件 place；label 直接显示具体文件名，开关不代表最终连接状态，README 与跨层反例同步；同时存在时的优先级保留真实探针。
- [x] 已确认通用 commandFile 强制 name；生成符合 OpenCode 字段的最小 frontmatter，继续复用命名/正文/section 工具。
- [x] 未把社区桥接写成原生能力；明确不做插件包且记录未来前置条件。
- [x] 未以 mock 验证宣称 JSONC 格式保留；真实宿主集成有独立执行命令，skip 不算通过。
- [x] 真机验收先证明 OpenCode 版本再读取真实配置前后文本；三根、系统用户目录、XDG 和后台服务均隔离；不以页面外观代替文件结果。
- [x] 环境根缺口归入宿主共同前置，不给每个扩展造私有桥；错误客户端的自动诊断缺口如实说明。
- [x] 图标与官方 UI `logo-mark` 源码同形核对，不是占位图；下载的官方 SVG 未改写。
- [x] 待验证事项均有命令或确切界面观察点；本轮仅计划与图标，没有伪称源码或真机已验收。
