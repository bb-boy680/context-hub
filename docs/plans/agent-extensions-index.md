# 六个 Agent 扩展计划总览

状态（当前）：六个扩展已并行完成本地实现，直接落在扩展仓库正式 `plugins/` 目录，全仓检查与显式宿主源码集成通过；真实客户端验收由用户后续进行，未作为开发前置。开发基线是本地 Host `0.2.0` 工作树。修订日期：2026-11-03。

## 当前并行执行状态

| 扩展 | 代码位置 | 本地代码状态 | 真实客户端 |
| --- | --- | --- | --- |
| OpenCode | `plugins/opencode` | 实现完成；typecheck/test/build 通过；显式宿主集成 12 passed（默认套件 68 passed / 12 skipped） | 未验证 |
| WorkBuddy | `plugins/workbuddy` | 实现完成，目录保持原位；typecheck/test/build 通过；默认套件 30 passed（含宿主文件测试） | 未验证 |
| ZCode | `plugins/zcode` | 实现完成，原 `wip/zcode` 已不存在，移除原因不明；typecheck/test/build 通过；显式宿主集成 8 passed（默认套件 51 passed / 8 skipped） | 未验证；缺可靠隔离环境 |
| Cursor | `plugins/cursor` | 实现完成；typecheck/test/build 通过；`CURSOR_TEST_HUB_SOURCE` 下 17 passed（默认 2 passed / 15 skipped） | 未验证 |
| Copilot | `plugins/copilot` | 实现完成；typecheck/test/build 通过；`COPILOT_HOST_TEST` 下宿主集成 1 passed（默认 19 passed / 1 skipped） | 未验证 |
| Antigravity | `plugins/antigravity` | 实现完成；typecheck/test/build 通过；默认套件 7 passed（含跨仓集成） | 未验证 |

全仓检查已完成：`pnpm lint`、`pnpm typecheck`（9 个 workspace 包）、`pnpm test`、`pnpm build`（含 9 插件市场生成）均通过；显式宿主集成按上表单独运行并通过。真实客户端是否加载、启用或生效仍未有隔离环境证据，本地检查与宿主源码集成通过都不改写这一列。

## 已废弃的串行调度（历史）

以下内容记录 2026-11-03 早些时候的串行方案与原阻塞口径，已被用户当前政策取代，只用于解释历史记录，不代表当前约束。

| 顺序 | 任务 | 当时状态 |
| --- | --- | --- |
| 0 | 共同宿主前置 | awaiting-review |
| 1 | OpenCode | blocked：阶段 1–5 独立验收通过；阶段 6 缺可靠隔离客户端环境 |
| 2 | WorkBuddy | blocked：脚手架自测通过；V1–V6 缺真实隔离客户端证据，engines 发布版本待锁定 |
| 3 | ZCode | queued |
| 4 | Cursor | queued |
| 5 | Copilot | queued |
| 6 | Antigravity | queued |

当时的 `blocked` 指“缺真实隔离客户端证据”和“engines 待已发布版本”，二者现在都不再阻塞开发。代码落位、本地检查和后续统一构建不等待这些条件。

## 版本与 engines 策略

按用户要求，六个新扩展只支持各自选定的当前客户端协议，不提供旧版本兼容、历史配置解析、清单回退、自动迁移或缺能力时的替代后端。

- `plugin.yaml` 的 `engines.contextHub` 统一以本地真实 Host 版本 `0.2.0` 为开发基线，当前写作 `">=0.2.0 <0.7.0"`。
- 各插件 README 必须注明：依赖本轮尚未发布的通用契约 API（原生清单声明、声明式安装目录、未知启用状态等）；不能声称已发布的 `0.2.0` 已包含这些 API。
- 不虚构未来发布版本号。发布前再把 `engines` 下限调整为实际提供所需能力的那一版；版本尚未发布不阻塞当前开发和集成检查。
- 旧格式明确报告不支持；修改前拒绝，保留原文件字节，不当成空配置覆盖。
- 旧格式 fixture 只用于零写入拒绝测试，不再有“原位编辑旧形状”的成功用例。
- 只保留当前原生/标准格式，不因现有 Hub 收录缺口要求发布者加第二份清单；缺少原生收录能力由共同通用契约补齐。
- 当前仍使用的共享目录（例如 Antigravity 的 `.gemini/config`、WorkBuddy Coding 的 `.codebuddy`）不等于旧版本适配，不按目录名删除。
- 读到未知字段时保留它们、保护用户数据，仍是必要约束。ZCode 当前 Desktop 的 `.agents/mcp.json` 遮蔽预检、Copilot 当前覆盖链的只读冲突检测保留，用于阻止无效或破坏性写入，不作为旧格式交付入口。

## 计划、图标与输入格式

| Agent | 计划 | 阶段 | 唯一包输入 | 插件安装路径 |
| --- | --- | --- | --- | --- |
| Cursor | [agent-cursor.md](agent-cursor.md) | 8 | `.cursor-plugin/plugin.json` | 用户级 `~/.cursor/plugins/local/<name>` |
| GitHub Copilot | [agent-copilot.md](agent-copilot.md) | 7 | Agent Plugins **1.1.0** 根 `plugin.json` | 声明式 live-load：库市场 + extraKnownMarketplaces + enabledPlugins |
| WorkBuddy | [agent-workbuddy.md](agent-workbuddy.md) | 7 | `.codebuddy-plugin/plugin.json` | 纯文件 cache + registry + settings，协议探针先行 |
| OpenCode | [agent-opencode.md](agent-opencode.md) | 6 | 本版无资产包安装器 | 原生 **V2** MCP/skills/commands/agents/instructions |
| Antigravity | [agent-antigravity.md](agent-antigravity.md) | 9 | 当前原生 `plugin.json` 或 `.antigravity-plugin/plugin.json` | 受控 cache + plugins.json entries.path |
| ZCode | [agent-zcode.md](agent-zcode.md) | 7 | `.zcode-plugin/plugin.json` | 纯文件；本版仅 user 安装/卸载/启停 |

图标目录：[docs/research/agent-icons](../research/agent-icons)。六个文件为 antigravity.svg、copilot.svg、cursor.svg、opencode.svg、workbuddy.svg、zcode.svg。均为此前下载的官方原件，本次未改动；来源、hash、尺寸与条款见各计划。

## 删除的兼容范围

| Agent | 已移除 |
| --- | --- |
| Cursor | Agent Plugins 1.0 第二输入、Claude/Codex 清单适配、双 manifest 绕行及其成功探针 |
| Copilot | Agent Plugins 1.0、legacy manifest 搜索链、根 SKILL 回退、bare-map MCP 原位编辑、旧 local type 归一化 |
| WorkBuddy | `.workbuddy-plugin`/Claude 清单回退、双清单要求、CLI/文件双通道选择、旧 registry 适配 |
| OpenCode | V1 扁平 mcp.<name>、enabled、flat/native/mixed 路径切换、目录旧别名、配置/插件迁移 |
| Antigravity | Gemini extension 导入、旧清单、url/httpUrl 自动迁移、未证实的项目 .gemini/skills 兼容探针 |
| ZCode | 历史 map registry、旧 workspace scope 映射、legacy MCP 字段归一化、Claude/Codex manifest fallback 和双清单输入 |

## 共同宿主前置

共同能力只交付一套，由各扩展消费，不在宿主增加客户端 if/目录白名单。相较原计划，原生清单收录从“后续”调整为安装器前置；这是去掉双清单/跨格式回退后的必要依赖。

1. **扩展声明 manifest 路径/收录**：由 Cursor、WorkBuddy、ZCode、Antigravity 扩展贡献各自原生路径，统一供浏览器导入、磁盘扫描、describe 与元数据展示使用。覆盖自定义组件路径、inline MCP、声明生命周期、安全路径与现有格式回归。
2. **声明安装目标目录**：现有 commit(copy)/removeDirectory 只认 cache 四段。Cursor 的 local/:name 需要通用目录模板，保留段校验、越界/symlink 拒绝、快照、原子写和回滚。不改成客户端特判。
3. **安全多段 state 根**：ZCode 需要 cli/plugins；逐段拒绝绝对路径、空段、..、盘符/反斜杠和中间 junction/symlink。
4. **PluginHeld.enabled 可为未知**：类型、聚合、计数、菜单、locale 和测试统一；任一明确 true 则 true，全部明确 false 才 false，其余 undefined。未知不显示为关闭、不画假开关。

四项共同前置已在本地 Host 工作树实现并完成开发自测；当前仍由宿主事务安全改动并行收尾，最终状态以统一集成检查结果为准。各安装器仍须在用户后续验收阶段完成各自真实客户端探针。

本版不做：install payload overlay、普通资产 env root、PluginPlace.installable、McpPlace.readOnly、自动客户端版本诊断；ZCode project 启停仍后置。OpenCode 只支持默认根与 V2，验收基线 v2.2.5，运行时没有自动版本查询通道；不拿配置形状猜客户端版本。

## 发布前仍需完成（不阻塞当前开发）

以下条目是发布门槛，由用户在后续真机验收阶段确认；当前并行开发不以它们为前置，也不会因为未执行而把状态写成通过。

- **Cursor**：原生单清单收录、local 目录发现与组件实际出现；本版只 user 文件安装，无 Hub 启停，不写 SQLite/账户后端。
- **Copilot**：1.1.0 仍为 Working Draft；必须锁定支持该格式的实测构建。live-load 三门槛为只写声明能加载、删键不复活、project false 覆盖及工作区隔离。失败即阻塞发布，不静默复制或调 CLI。config.json 不读写。
- **WorkBuddy**：真实 registry/settings/cache 样本、项目根和加载验证；不拿 CodeBuddy CLI 成功代替 WorkBuddy。阶段 5 固定纯文件，和总览一致。
- **OpenCode**：只有 mcp.servers + disabled 成功读写；六个 MCP place 分别管理物理文件，开关不表示最终连接状态。无资产包安装器。
- **Antigravity**：阶段 0.5 的 entries.path 必须真实加载组件；启停协议不透明则 enabled 未知、交客户端管理。已把启停实现在阶段 5 内写清，没有未定义的“阶段 5b”。
- **ZCode**：原生清单声明与 cli/plugins 根都须交付；只 user place，旧 registry/schema 拒写，项目覆盖不能伪装成第二份安装。共享 MCP 遮蔽检查保留。

真实客户端探针目前尚未完成；此前环境未发现 cursor/copilot/agy/zcode。官方文档依据不能代替真机结果。图标公开分发的品牌使用依据仍须在发布前确认，MIT 代码许可不等于商标授权。

## 本次文档验收

六份计划的输入格式、阶段、fixture、测试矩阵和待验证项保持当前协议；总览已按“并行、正式 `plugins/`、真机与发布不作为开发前置”的当前政策更新。六个扩展的真实客户端验证均未执行，不得据此文档声称任何真机通过。计划未归档。
