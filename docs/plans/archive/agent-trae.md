# 接入 Trae IDE 与 TRAE CLI 2.0

状态：待用户审批；仅完成调研、计划与官方图标下载，尚未修改扩展源码。核对日期：2026-11-03。

本计划可由一名专属开发 Agent 独立执行。实施仓库为 `D:/work-space/context-hub-extensions`，宿主仓库为 `D:/work-space/dsh-context-hub`；下文 `plugins/` 均指实施仓库。本计划只创建 `plugins/trae/`，不修改其他产品的扩展。

## 实施结论与范围

采用**一个扩展包、两个独立 target**：`hub.target.trae-ide` 显示为 `Trae IDE (CN)`，`hub.target.trae-cli` 显示为 `TRAE CLI 2.0`。两者分别注册 provider，允许单独选择，不能把 CLI 的 `~/.trae` 当作国内 IDE 的全局根，也不能把 IDE 项目目录直接推导成 CLI 目录。

首版完成以下可由官方文档证实的资产交付：

- 国内 IDE：全局和项目 skills；项目 `.trae/mcp.json`；项目 `.trae/rules/<slug>.md`。根 `AGENTS.md` 与工作区 `.agents/skills` 复用宿主共享入口。
- CLI 2.0：默认 `~/.trae/traecli.toml` 中的 stdio MCP。项目 `AGENTS.md` 仍使用宿主共享入口，不新增另一份副本。
- 两个 target、英文/简体中文 locale、官方图标，以及文件边界、幂等和冲突保护测试。

**CLI 与 IDE 的插件安装保留为本产品的接入目标，另设插件协议阶段推进。** 上述基础资产可先在正式 `plugins/trae/` 开发、验证和构建；插件路线与基础资产并行取证，不以缺真实客户端、缺隔离环境或实现复杂为由自动删除。当前文档没有完整给出安装记录、市场条目、启用字段和版本选择规则，因此阶段 5 必须先列清能安全实现的部分及证据，再实现经证据支持的**纯文件**安装；本计划不允许 shell 或 `traecli` 回退。证据不足时交付明确的协议缺项与后续决策，不编造写入协议或用 Codex fixture 证明 Trae 兼容。CLI skills 同样保留为待确认入口，不能由 IDE 目录推导。

VS Code/JetBrains 插件版（TraeCode Plugin，原 MarsCode）不在首版交付范围。官方只确认 AI 编程助手功能和日志目录，没有确认可供 Hub 写入的 skills/rules/MCP 入口；表述必须是“未确认”，不能据文档缺失断言产品不支持。

当前版本策略：只面向现行 CN IDE 文档和 CLI 2.0，不实现 CLI 1.0 YAML、旧目录迁移、跨客户端 manifest 回退或任何旧版适配。当前公开资料不足以给 CLI 2.0 锁定精确二进制版本，README 写明“文档基线，真实客户端未验证”，不得编造版本号。

## 证据与不确定性

Context7 已先以 `TRAE` 查询；只返回 `/bytedance/trae-agent`，这是独立的开源 Trae Agent，不能用来证明闭源 Trae IDE/CLI 的协议。以下采用官方产品文档和官方安装脚本；第三方资料单独标注。

| 范围 | 已核对内容与原文摘句 | 来源与可信度 | 实施决策 |
| --- | --- | --- | --- |
| CN IDE skills | “项目技能：项目所在路径下的 `.trae/skills/` 目录”；全局 `~/.trae-cn/skills`，Windows `%userprofile%/.trae-cn/skills` | [官方 skills](https://docs.trae.cn/ide_skills.md)，高 | 注册 workspace/global 两处，均使用 `<name>/SKILL.md` |
| IDE 共享技能 | `.agents/skills` 需在设置中启用；同名优先 `.trae/skills` | [官方 skills](https://docs.trae.cn/ide_skills.md)，高 | 不重复注册宿主共享工作区 place；README 记设置条件，不声称默认生效 |
| IDE 项目 MCP | “在项目根目录下的 `.trae/` 目录中，创建 `mcp.json` 文件”；顶层 `mcpServers`；使用前开启项目级 MCP 开关 | [官方添加 MCP](https://docs.trae.cn/ide_add-mcp-servers.md)，高 | 只注册项目位置，文件写入不等于服务已连接 |
| IDE MCP 字段 | stdio 用 `command/args/env`，HTTP 用 `url/headers`；示例没有 `type`；command 不含空格，支持 `${workspaceFolder}` | 同上，高 | 写原生字段，变量不展开；不添加通用客户端的 `type`/`disabled`/`autoApprove` |
| IDE 项目规则 | “项目所在路径下的 `.trae/rules/` 目录”；Markdown；`alwaysApply`、`description`、`globs` 决定应用方式 | [官方规则](https://docs.trae.cn/ide_rules.md)，高 | 只提供智能生效规则：`alwaysApply: false` + 非空 description |
| IDE 全局规则/指令 | 全局位置 `~/.trae-cn/user_rules`，未给完整目录内协议；`AGENTS.md` 需启用“将 AGENTS.md 包含在上下文中” | 同上，高 | 不写全局 user_rules；共享 AGENTS 不重复注册，并记开关条件 |
| IDE 插件与扩展 | “部分插件还集成了 MCP Server 和 Skill”；插件在设置市场安装、详情页开关。扩展市场另支持 `.vsix` | [插件市场](https://docs.trae.cn/ide_marketplace.md)、[扩展管理](https://docs.trae.cn/ide_manage-extensions)，高 | 两类市场分别取证；阶段 5 寻找可公开确认的本地包、市场导入和状态协议，不由 `.vsix` 推导 Agent 插件目录 |
| CLI 配置/MCP | “用户级配置文件默认位于” `~/.trae/traecli.toml`；示例 `[mcp_servers.docs] command/args` | [官方配置](https://docs.trae.cn/cli_config-file.md)，高 | 一个用户级 stdio MCP place；不外推 HTTP 或 enabled 字段 |
| CLI 根 | `TRAE_HOME` “覆盖 CLI 配置和运行时目录”；脚本 `TRAE_HOME_DIR="${TRAE_HOME:-${TRAEX_HOME:-$HOME/.trae}}"` | [官方环境变量](https://docs.trae.cn/cli_environment-variables)、[官方安装脚本](https://trae.cn/trae-cli/install_v2.sh)，高 | 默认根确认；首版普通资产只支持默认根，不实现脚本中的旧别名处理 |
| CLI 命令 | `plugin`：“管理插件”；`traecli exec`：“非交互式（脚本 / CI）运行”；TUI `/plugins`、`/skills`、`/mcp` | [官方参数](https://docs.trae.cn/cli_command-line-parameters)、[官方扩展说明](https://docs.trae.cn/cli_tools-and-extensions)，高 | 记录产品能力；Hub 首版不调用这些命令写入或回退 |
| CLI 与 Codex | 官方开源声明列 `@openai/codex` 和 `codex`，未声明分支关系或与当前 Codex 全协议相同 | [官方开源声明](https://docs.trae.cn/cli_open-source-software-notice)，高但仅为依赖证据 | 不能把血缘证据当作配置兼容保证 |
| CLI 插件已核验实现 | Chorus @ `f7395d6a9009340d838518cd0859dd18b2475d35`：`traecli plugin marketplace add <source>` → `traecli plugin install <id> --yes`；缓存 `$TRAE_HOME/plugins/cache/<market>/<plugin>/<version>/`；配置写 `[marketplaces.<name>]` 与 `[plugins."name@market"] enabled = true`；本地路径市场可用 | [Chorus CONNECT_TRAE](https://github.com/Chorus-AIDLC/Chorus/blob/f7395d6a9009340d838518cd0859dd18b2475d35/docs/CONNECT_TRAE.md)、[测试](https://github.com/Chorus-AIDLC/Chorus/blob/f7395d6a9009340d838518cd0859dd18b2475d35/cli/__tests__/init-trae-adapter.test.mjs)、[0.209.1 验证](https://github.com/Chorus-AIDLC/Chorus/blob/f7395d6a9009340d838518cd0859dd18b2475d35/docs/verification/trae-app-server-0.209.1.md)，第三方、中高 | 阶段 5 的已验证安装路线；纯文件直写仍未证明 |
| CLI 插件包清单 | Chorus 包为 `plugins/chorus/.codex-plugin/plugin.json`；市场 `.agents/plugins/marketplace.json` 指向 `./plugins/chorus` | 同 commit 两文件，第三方、高 | Hub 包可按同一 Codex 布局收录；Trae 是否只接受这一入口仍无官方文档 |
| CLI 插件缺口 | 本地市场表字段、多个版本的选择、卸载时缓存与配置的安全处理、依赖求解均无客户端产出或测试证据 | 上述来源的未覆盖部分 | 保持阶段 5 未完成；继续取证，不以 CLI 安装/卸载回退 |
| CLI 实测资产位置 | 第三方测试记录 CLI 读取 `~/.agents/skills`、读取 `~/.trae/AGENTS.md`；`TRAECLI_HOME` 只移动 `cli/` 运行目录；其他 skills 目录未证实 | [deja-vu @ 797b9f2](https://github.com/vshulcz/deja-vu/blob/797b9f29a91c2597fa69e1a7f8fe80cae95bee0c/docs/registry/trae.md)，第三方实测 0.207.1/0.208.1 | 不据此否定其他目录；不注册未经确认的 `~/.trae/skills`，共享全局入口另行协调 |
| IDE 用户级 MCP | `<user data>/User/mcp.json`；Windows `%APPDATA%\Trae\User\mcp.json`，CN 为 `Trae CN`；无 `type` | 同 deja-vu，第三方实测 | 记录为待验证路径；普通资产端口无法表达 AppData 根，不强行注册 |
| 插件版 | “本文档记录使用 TraeCode Plugin 时可能遇到的问题”；日志 `~/.marscode/logs` | [官方 FAQ](https://docs.trae.cn/plugin_faq)、[产品能力](https://docs.trae.cn/plugin_what-is-trae-plugin)，高 | 日志目录不是 skills 或配置根证据，不注册 `.marscode` 资产 |

版本和路径不得混用：

1. CLI 1.0 的 `traecli.yaml` 与 CLI 2.0 的 `traecli.toml` 是不同协议；[迁移说明](https://docs.trae.cn/cli_upgrade-trae-cli)只作背景，首版不迁移。
2. `~/.traecli` 没有得到本次官方来源确认，不能列为有效写入位置；也不能凭一次未搜索到就断言所有历史版本都不用它。
3. 官方迁移文档提到用户级与项目级迁移写入“对应的 traecli.toml”，却未明确项目文件的准确路径。只能说项目文件路径未确认，不能断言项目配置不存在，也不能自行注册 `.trae/traecli.toml`。
4. 国际版 IDE 的 `~/.trae/skills` 只有本次第三方材料，官方英文页正文未成功提取，首版不覆盖国际版。其与 CLI 同名根的关系未知。
5. CLI skills、全局指令和角色文件的具体路径未确认；不能由 `~/.trae/agents` 的单个迁移示例推出全部文件布局。

## 真实源码与可复用边界

已阅读的调用链与约束如下，执行者应在开工时确认文件未被并行任务改变：

- `plugins/codex/src/index.tsx:apply` 与 `plugins/opencode/src/index.tsx:apply` 是服务注入和 target/locale 注册模式；`contracts.ts` 只镜像扩展实际使用的类型，不把宿主包打入浏览器 bundle。
- `plugins/codex/src/provider.ts:createCodexMcp` 是 `[mcp_servers]` 的 TOML 适配参考。但其 `enabled` 读写、固定 `.codex/config.toml`、Agent 角色与插件注册均不能直接带入 Trae。
- `plugins/opencode/__test__/host.test.ts` 已支持 `CONTEXT_HUB_CHECKOUT` 动态导入宿主真实 toolkit 和文件端口；复用这一测试方式，不复制 JSON 当 TOML 的模拟来证明字节保留。
- `packages/resources/mcp/src/toolkit.ts:mcpTools` 已提供 `readJsonObject/editJson/jsonValueLines` 和 TOML 的 `parseToml/setTomlEntry/setTomlField/clearTomlEntry/tomlEntryLines`。使用其无损编辑器，不增加生产 parser 依赖。
- `packages/resources/skills/src/extension.ts:SHARED_PLACE` 已注册 workspace `.agents/skills`；`packages/resources/prompts/src/workspace-provider.ts` 已提供共享 `AGENTS.md`。两者不重复创建 Trae 专属副本。
- `packages/core/src/place-files.ts:PlaceRef` 与 `host/place-files.ts:createFsPlaceFiles` 仅有 workspace/global 两个根，global 固定用户 home，没有环境变量根。普通 CLI MCP 首版只管理默认 `.trae/traecli.toml`，README 明示不跟随 `TRAE_HOME`；不通过绝对路径、`..`、改 `$HOME` 或借插件磁盘通道绕过边界。
- `packages/resources/plugins/src/provider.ts:PluginDiskDeclaration.homeEnv` 与 `host/installer-files.ts:roots` 已支持声明环境变量根；插件安装器将来可用 `{ home: '.trae', homeEnv: 'TRAE_HOME', state: 'plugins' }`，这不表示普通 provider 同样支持。
- `packages/resources/plugins/src/provider.ts:PluginHeld.enabled` 已可未知，`snapshotDirectory`/`commit(copy/remove)` 已可绑定目录快照，目录模板也已可声明。旧调研中“必须新增这些宿主能力”的描述已过期。
- `apps/web/src/components/app-sidebar.tsx:AgentGroup` 用 `useSkillAgents()` 筛 target；`packages/resources/skills/src/library.ts:useSkillAgents` 只读取 provider.id，`SkillService.register` 不要求非空 places。因此 CLI 注册 `{ id: CLI_ID, places: [] }` 仅为当前侧栏选择契约，不提供任何技能位置；target supports 不得声称 CLI skill。用测试锁住这个真实边界，不为本任务改侧栏。
- `packages/extensions/src/plugin.ts:manifestIcon` 以 `/hub/extensions/<id>/<asset>` 服务原图。Trae target 图标沿此路由，避免 `new URL('../assets/...', import.meta.url)` 在 bundle 后指向错误路径。

### 插件安装路线、复用与通用宿主依赖

CLI 的目标路线是 **Codex 兼容包的原生纯文件交付**；第三方已实测 `traecli` 自己的安装命令，这只是协议线索，不授权在本扩展使用 CLI 写入或回退。纯文件直写 cache 与 `traecli.toml` 尚无客户端验证，且本地市场字段与安全卸载语义仍缺证据。IDE 的路线为其**自身 Agent 插件包/市场协议**，目前只有 UI 市场，未发现本地导入协议。两者不能共用假定的安装根；不能因为缺真机就阻断基础资产开发或把插件从产品目标删除。

`plugins/codex/src/installer.ts` 可复用的是服务注入、TOML 单项编辑、磁盘声明、包名/路径校验与事务组织模式；不修改现有 Codex 扩展，不先抽跨产品框架。`home: '.trae'`、`homeEnv: 'TRAE_HOME'`、`state: 'plugins'` 可表达第三方材料描述的 CLI 根，`config` 只授权已确认的 `traecli.toml`。缓存、library manifest 和 marketplace 的读写白名单必须由阶段 5 证据决定，不能先放 `**` 写权限来掩盖未知协议。

CLI 的目标文件流程：验证有证据支持的当前原生 manifest 与版本 → 写入客户端实际识别的 Hub 市场索引 → `disk.run` 捕获根、旧文本和目录摘要 → `disk.commit` 原样复制经证据支持的缓存布局并写入登记/声明 → 根据文件报告可确认的来源与开关 → 安全移除 Hub 自己的记录和已确认不再引用的副本。第三方资料确认 CLI 生成过 `[marketplaces.<name>]` 与 `[plugins."<name>@<market>"] enabled = true`，但没有提供本地市场表的完整实际字段或卸载事务，不能直接照 Codex 字段补齐。`PluginInstaller.install` 和 `remove` 均为必需方法；安全移除未定义时不能注册只有 install/held 的安装器。`setEnabled` 为可选方法，未知启用态保持未知。

纯文件直写仍**未经客户端验证**：没有来源展示手工放置缓存并写入 `traecli.toml` 后，客户端如何列出与加载。继续收集公开源码、客户端生成的脱敏样本或明确测试；可用证据足以限定安全协议时开发文件适配，真实客户端与隔离环境不是开发阻断。若仍无法定义市场登记、版本选择及安全移除，基础资产可先交付，阶段 5 继续标记未完成。后续隔离探针可用于客户端验收，不能作为开发前置，也不能用 CLI 回退代替文件化。

必须独立核对并在 Trae 适配器实现的差异：`traecli.toml` 文件名、marketplace schema/清单路径、启用布尔与默认值、多个缓存版本的实际选择、作用域和依赖机制。已核验的 Chorus 实现只确认 `[marketplaces.<name>]` 与 `[plugins."name@market"] enabled = true` 的读取，以及安装后缓存位于 `.../cache/<market>/<plugin>/<version>/`；本地路径市场可用，但具体表字段与多版本选择规则未确认。不能沿用 Codex 的 `versions.sort().at(-1)` 当版本选择规范；不能因 TOML 有条目就报告组件已加载；缺 enabled 不能猜成 true。`.codex-plugin/plugin.json` 与根 `plugin.json` 哪个是 Trae 当前入口尚缺官方完整证据，阶段 5 必须选有来源支撑的当前协议，不能加 legacy/Claude 清单回退。已有第三方集成源码或来源明确的 fixture 可以增加协议证据，不要求先装本机客户端才能阅读或开发。

IDE 必须先查明是否存在本地 Agent 插件导入、包 manifest/组件目录、市场描述和启用存储。如果只有官网 UI 插件市场或依赖云端授权，没有本地文件导入协议，阶段 5 应记录该约束和继续调查入口，并先交付已证实的 skills/MCP/rules；不得把它伪装成“已装插件包”。也不能把编辑器 `.vsix` 扩展当 Agent 插件用，或写猜测的 `~/.trae-cn/plugins`、数据库键、客户端内部缓存。

| 通用宿主能力 | 当前状态 | 与 Trae 的关系及责任边界 |
| --- | --- | --- |
| 环境变量插件根 `homeEnv` | 已有 | CLI 插件可使用 TRAE_HOME；无需新增客户端特判或要求 Host 先发布 |
| 目录模板、复制/删除摘要、原子写与回滚 | 已有 | CLI 如果实际采用已描述的四段 cache，可直接复用；若为其它布局，优先用现有 directories 声明，不先改宿主 |
| 可声明 manifest 路径 `registerManifests` | 已有 | 当前内置列表已有 Codex/根 manifest；若 Trae 证据表明使用另一原生路径，先通过扩展声明注册，不强制双清单或翻译清单 |
| 未知插件启用态 `PluginHeld.enabled?` | 已有 | 未确认开关可诚实展示未知；不应因此删除可证明安全的安装能力 |
| 普通 assets 的环境变量/AppData 根 | 缺少 | 后续完整支持 CLI 自定义根或 IDE 用户级 MCP 时可能需要；由公共任务设计文件/skills/桥接与路径校验，基础交付不等待它 |
| 多副本/多个配置与缓存根、声明所不能表达的状态存储 | 尚未证明需要 | 若阶段 5 的实际 IDE/CLI 协议需要，只记录具体读写对象、事务与权限缺口，由共享任务协调通用契约，不先新增 Trae 分支、任意 shell 或通用数据库写入口 |
| 仅查询或仅开关的插件位置 | 当前 PluginPlace 无完整动作能力声明 | 若协议只允许该部分，先分析 held 的 readOnly 与省略 setEnabled 能否正确表达；确实不足时提出通用动作声明，不能用总是抛错的 install/remove 空壳冒充支持 |

没有任何尚未证明需要的宿主能力自动成为基础资产的开发前置。公共契约若需调整，由主 Agent 协调一个明确的共享作者；Trae 作者只更新自己的 contracts 和 provider 消费端。

## 实现文件与边界

新建以下完整独立包，不创建 `wip/` 或等待其他产品完成：

```text
plugins/trae/
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
  __test__/registration.test.ts
  __test__/provider.test.ts
  __test__/prompts.test.ts
  __test__/host.test.ts
  __test__/fixtures/ide-mcp.jsonc
  __test__/fixtures/cli-mcp.toml
  __test__/fixtures/ide-rule.md
  lib/index.js                     # 构建产物，源码分支不提交
```

基础资产不创建猜测的插件 registry fixture 或 `.marscode` provider。阶段 5 如取得足够的当前协议证据，按实际范围补充 `src/installer.ts`、必要的 `src/plugin-state.ts`、`__test__/installer.test.ts` 和来源明确的当前协议 fixture；未取得证据则不建立假实现。所有合成 fixture 都写清来源与假设，不能伪称真实客户端采样。

manifest：`id: trae`、category agent、`permissions: [assets.read, assets.write, filesystem]`；基础资产 `inject` 为 skills/prompts/mcp/targets/locales，阶段 5 只有实际注册了插件安装器才增加 plugins。package name `trae`、初始版本 `0.1.0`、main/exports 指向 `lib/index.js`，工具和 scripts 沿用 Codex 现有包，不新增生产依赖。`engines.contextHub` 以本地真实宿主 `0.2.0` 作开发下限，使用现有 `<0.7.0` 上限；README 明确开发基线不等于已发布 API 保证，发布前由集成者核实实际最低版本。

`pnpm-workspace.yaml` 已含 `plugins/*`，无需作者修改。锁文件、根脚本、市场索引和全仓构建由集成负责人统一处理。新增包需要的依赖链接由协调者使用已有缓存/锁文件完成，不因缺真实客户端或未发布宿主版本阻塞代码开发。

### 固定位置与行为

| provider/target | place | scope | 文件或目录 | 能力 |
| --- | --- | --- | --- | --- |
| `hub.target.trae-ide` | `trae-ide-skills` | workspace | `.trae/skills` | 交付标准目录技能 |
| 同上 | `trae-ide-skills-global` | global | `.trae-cn/skills` | 同上，国内 IDE |
| 同上 | `trae-ide-mcp` | workspace | `.trae/mcp.json` | stdio + HTTP 声明，switchable false |
| 同上 | `trae-ide-rules` | workspace | `.trae/rules/<slug>.md` | 智能生效规则 |
| `hub.target.trae-cli` | 无 Trae 专属 skills place | — | 共享 `~/.agents/skills`（第三方实测可达） | 其他 CLI skills 目录未确认；全局共享入口归宿主统一处理，不重复归给 CLI |
| 同上 | `trae-cli-mcp-global` | global | `.trae/traecli.toml` | stdio MCP 声明，switchable false |

- MCP 每个 scope 只有一个新安装入口。IDE 和 CLI 是不同文件、不同 provider，不合并成一个“Trae 全局”操作。`McpEntry.enabled: true` 只满足宿主对无开关声明的契约，不表示客户端全局开关已开或服务在线；不实现 `setEnabled`。
- IDE MCP 只写 `mcpServers[name]` 的原生字段，拒绝同名非对象或 `command` 与 `url` 同时存在的歧义项；保留其它 server、未知字段、注释与配置。切换 stdio/HTTP 时只清理不再适用的已知 transport 字段；若未知字段会使含义不明确则拒绝该条写入，不覆盖。
- IDE HTTP 无明确 SSE 判别字段，本版只接 Hub 的 `http`，拒绝 `sse` 新交付，不把它静默写成 HTTP。stdio command 含空格则在写前按官方限制拒绝，args 保留空格、引号与 `${workspaceFolder}` 原文；不执行命令。
- CLI 只处理 `[mcp_servers.<name>]` 的 stdio command/args，采用已有 toolkit；官方 CLI 页面未确认 env 字段，首版对非空 env 的新交付明确拒绝，不静默丢掉环境变量。远程项及带未确认 env/transport/认证形状的已有项保留原文，返回 `declaration: null`，允许定位，不覆盖或归一化。不推导 `enabled`、OAuth、timeout 或项目级覆盖链。
- MCP 读取错误结构、坏 JSONC/TOML 时明确报错，零写入；定位必须返回实际文件里的目标条目行号。安装同名条目保留与目标无关的属性，不用“重新生成整文件”替代局部编辑。
- 规则只生成 `.trae/rules/<slug>.md`：`description` 来自 prompt.description、正文首句或名称；frontmatter `alwaysApply: false`。标记位于 frontmatter 后的首个非空正文行，格式 `<!-- context-hub:<slug> -->`。复用 `slugOf/commandFile` 等工具；创建时没有完整所有权标记的同名文件拒绝覆盖，删除只删除自己的文件，单纯正文包含同样标记不算所有权。
- 不生成 CLI 的 TOML Agent 角色、独立 commands、全局规则、Hook 配置；不把 `.agents/rules` 或 DESIGN.md 宣称为 Trae 已确认入口。共享 AGENTS 的生成仍由宿主原有 provider 负责。

## 六阶段实施

计划获批后，开发者按以下阶段名建立六条可见任务；开工前 `in_progress`，该阶段验收后立即 `completed`。可与其他产品并行；阶段 1 后，阶段 5 的协议取证可与基础资产阶段 2–4 并行，不要求等待真机。源码写入仍由同一 Trae 作者协调，阶段 6 汇合已完成能力。主 Agent 只调度，共享文件由集成负责人写。

### 阶段 1：建立双形态扩展骨架

**目标**：包可独立构建，两个 target 可以单独选择；正式路径和图标固定。

**文件**：package/plugin/build/tsconfig/vitest/README、assets/icon.png、src/index/contracts/locations/messages，registration.test.ts。

**动作**：首先把本计划记录的原图原样复制到 `plugins/trae/assets/icon.png`；完成当前脚手架和类型镜像，仅使用已存在的 React 外部依赖。注册 IDE 与 CLI 两个 target、locale 及各自 skill provider（此阶段 places 可为空；后续补 IDE 两处），明确 CLI 不支持技能交付。图标组件使用原图、保留 className/aria-hidden，装饰图片 `alt=""`。target 的 supports 随阶段实际交付增加，最终 IDE 是 skill/mcp/memory，CLI 是 mcp，不能声明 agent 或 plugin。

**验收**：在扩展仓运行 `pnpm --filter trae typecheck`、`pnpm --filter trae test __test__/registration.test.ts`、`pnpm --filter trae build`。测试断言两个 target/provider id 一致、彼此不同、CLI places 为空、locale 键齐全、图标路径为自己的资源且原图哈希不变；停止扩展后注册能随服务 effect 摘除。构建可运行，不要求先安装 Trae 客户端。

### 阶段 2：交付 IDE 技能与项目 MCP

**目标**：国内 IDE 两个技能位置与一个项目 MCP 入口可读写。

**文件**：locations/index/contracts/provider/messages、provider.test.ts、fixtures/ide-mcp.jsonc、README。

**动作**：注册表中两个 skill place；不重复共享 `.agents/skills`。实现 `createTraeIdeMcp`，使用原生 `mcpServers` 和 stdio/HTTP 字段；switchable false，不伪造 enabled 配置。将“项目 MCP”和“.agents 技能目录”需要 IDE 设置打开记录到 README，避免在产品界面增加常驻教学段落。

**验收**：`pnpm --filter trae test __test__/provider.test.ts`、`pnpm --filter trae typecheck`、`pnpm --filter trae build`。覆盖无文件、正常 stdio/HTTP、变量与有空格 args、含空格 command 拒写、SSE 拒写、重复安装、单项删除、坏根/坏条目零写、未知属性保留及 locate；注册测试核对 scope/dir、位置独立计数和共享入口无重复。阶段结束只有 IDE provider 已实现，不注册 CLI 的占位 MCP provider。

### 阶段 3：交付 IDE 项目规则

**目标**：提示词可安装为当前项目智能生效规则，可安全重复安装和移除。

**文件**：prompts/index/contracts/messages、prompts.test.ts、fixtures/ide-rule.md、README。

**动作**：实现 `createTraeIdePrompts`，仅提供 workspace `rule` form；沿用现有 PromptProvider 方法，不新增全局规则或 AGENTS 副本。处理 frontmatter、标记和生成正文时匹配仓库风格，保留 prompt 内容，不执行 `$ARGUMENTS` 或内嵌命令。slug 和目标路径使用既有安全工具，并对危险路径反例拒绝。

**验收**：`pnpm --filter trae test __test__/prompts.test.ts`、`pnpm --filter trae typecheck`、`pnpm --filter trae build`。覆盖 frontmatter 可读、description 引号/换行、BOM/CRLF、幂等写入、无标记同名冲突、伪标记不认领、仅删除 Hub 文件、未知 form/place 和路径穿越零写入。共享 AGENTS 仍只有宿主一处，CLI 没有专属 prompts provider。

### 阶段 4：交付 CLI 默认根 MCP

**目标**：在用户默认目录准确读写 `traecli.toml` 的 stdio MCP，与 IDE 隔离。

**文件**：provider/locations/contracts/index/messages、provider.test.ts、fixtures/cli-mcp.toml、README。

**动作**：实现 `createTraeCliMcp`，固定 global `.trae/traecli.toml` 与 `mcp_servers`；只支持 stdio，不引入从 Codex 拷贝的 enabled 操作。保留 model、permissions、projects、marketplaces、plugins 等无关段，不修改项目 trust_level。README 标清自定义 `TRAE_HOME` 不受本版普通资产端口管理、安装路径可能只影响默认根；没有检测环境变量的端口时不能声称会自动拒绝自定义根。

**验收**：`pnpm --filter trae test __test__/provider.test.ts`、`pnpm --filter trae typecheck`、`pnpm --filter trae build`。真实 TOML 测试覆盖 dotted/quoted server name、args、非空 env 拒写、缺文件、可保留的未知字段、坏表、远程声明不写、不碰项目信任及插件段、定位行号。相同 server 名分别交付 IDE/CLI，只改变各自文件；单选任一 target 时另一 target 的文件不读取。

### 阶段 5：核定并接入插件协议

**目标**：分别推进 CLI 与 IDE 的纯文件插件安装；协议证据足够时实现，缺少本地登记或安全移除语义时如实记录并保持本阶段未完成。基础资产继续交付，客户端未安装或未真机加载不是开发阻断。

**文件**：README 的 CLI/IDE 协议证据矩阵、contracts/locations/index/messages；协议明确时新增 installer.ts、必要的 plugin-state.ts、installer.test.ts、当前协议 fixtures，并扩展 host.test.ts。只做取证结论时不创建虚构实现文件；宿主通用需求更新本计划对应表，由公共作者另行实施。

**动作**：

1. 并行只读核查官方配置/插件文档、官方可用的 schema 或安装脚本，以及上文 OpenViking/Chorus 的当前集成源码和来源明确的 fixture。逐项记录来源 URL/提交、适用形态和具体版本，独立填清：manifest 与组件布局、库/市场索引结构、本地市场登记、安装记录/缓存选择、启停字段/默认值、作用域、依赖与外部引用。CLI 和 IDE 各一行证据，不能互相借路径。官方未写但第三方可审阅实现支持的项标明中等可信度及真实客户端未验证，不伪称官方确认。
2. CLI 依据“插件安装路线”推进 `PluginDisk` 适配：user 范围、`TRAE_HOME` 声明、当前原生 manifest 原样复制、市场登记、事务与幂等。先补齐本地市场字段、多个缓存版本的实际选择与安全卸载语义；没有足够证据时不注册虚假的安装器、不猜字段，也不调用 `tools.run` 或 shell。安装器契约要求同时实现 install 和 remove，`setEnabled` 才可省略。真机或隔离环境不可用不阻断基于可靠公开证据的开发，也不阻断基础资产；缺失的协议事实如无法安全推出则保持阶段 5 未完成。
3. IDE 若存在已确认的本地 Agent 插件导入/发现协议，则实现独立 `createTraeIdeInstaller` 与自己的根和状态。只有云端 UI 市场时继续记录能力和官方导入/分发入口，基础资产先交付；不得尝试自动授权、向私有 API 发送数据或绕用 `.vsix`。
4. 只有当前安装、移除和安全边界都能定义时才注册对应 installer；不是要求全部可选组件都已真机验证。缺依赖求解可对明确声明未满足依赖的包拒绝交付，README 说明支持的包范围，不静默漏装依赖；已安装的外部条目保留原 id/source 并按协议决定 readOnly。所有修改保留其他市场/插件声明，未知 schema 零写入。
5. 每种形态必须得出可审阅的状态：`已实现协议，客户端加载未验证`，或 `基础资产已交付，插件协议仍缺 <明确字段/来源>`。后者附下一步获取途径与拟改文件，不把产品插件目标删除，也不创建总是失败的空壳注册。若需要新的通用宿主能力，记录最小契约和测试范围，交主 Agent 协调，不在宿主中加 Trae 专用分支。

**验收**：协议足够并实现安装器时运行 `pnpm --filter trae test __test__/installer.test.ts`、`pnpm --filter trae typecheck`、`pnpm --filter trae build`。覆盖 install/held/remove、确认可写时的 switches/setEnabled、纯文件执行且 `tools.run` 不被调用、`TRAE_HOME` 独立根、两形态互不读取、原生 manifest、市场冲突、未知启用态、多版本不猜选、外部只读、源/目标目录变化拒绝和事务失败不误删。真实文件端口集成放阶段 6；手造 fixture 不能证明真实客户端加载。协议仍缺安全写入依据时，保持本阶段未完成并写清缺口，不因基础检查通过而将插件安装标为完成。

若仍缺协议证据，README/本计划保留每形态缺项表、可先交付清单和后续决策；基础资产可在 `pnpm --filter trae test`、`typecheck`、`build` 通过后独立交付。此时只能报告“已评估，插件安装尚未实现”，阶段 5 保持未完成；可由主 Agent 继续安排协议工作，基础交付不等待。

### 阶段 6：完成源码集成与文档验收

**目标**：用宿主真实编辑器与文件端口证明磁盘交付正确，交付一个完整可构建扩展；真实客户端结果保留为未验证。

**文件**：host.test.ts、registration/provider/prompts 测试及 fixtures、README；必要时只修本扩展源码。不修改公共 lockfile、marketplace.json、宿主或其他扩展。

**动作**：参考 OpenCode host.test.ts，用 `CONTEXT_HUB_CHECKOUT` 导入真实 `mcpTools`、`promptTools`、`createFsPlaceFiles`、skills 的选择/目录读取实现。所有写入显式传临时 `home`、`folder`、`userHome`，清理只删除测试自己创建的路径；不运行真实 Trae 或访问凭证。集成测试必须覆盖真实 JSONC/TOML 注释与无关段保持、规则所有权和三个 IDE/CLI 文件落点。阶段 5 已实现安装器时，再按宿主 `packages/resources/plugins/__test__/installer-files.test.ts` 和扩展 `plugins/copilot/__test__/host-integration.test.ts` 的真实方式导入 `createFsPluginLibrary/createInstallerFiles/writeMarketplaceIndexes`，传入显式临时 env，覆盖原样复制、TRAE_HOME、安装/移除事务及外部并发变化拒绝。未设置源码路径时 suite 明确 skipped，不能报告 passed。

**验收**：先运行 `CONTEXT_HUB_CHECKOUT=D:/work-space/dsh-context-hub pnpm --filter trae test __test__/host.test.ts`，再运行 `pnpm --filter trae typecheck`、`pnpm --filter trae test`、`pnpm --filter trae build`。这些命令基于现有 Codex/OpenCode package scripts，Trae 脚手架应提供同名 scripts。只运行自己的包；所有产品 ready 后由集成负责人统一执行根 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`，不由 Trae 作者抢写市场索引。

验收还需检查：README 的支持矩阵与实际注册完全一致；plugins injection 只在真实安装器已注册时出现，无 shell fallback、无 `.marscode`/`.traecli` 猜测位置；阶段 5 缺项有来源与下一步，不能只写“暂不支持”；没有真实客户端目录残留或无关 diff。UI 显示若需浏览器由集成负责人按 ego-browser 工作流检查，当前不启动服务。宿主源码未改，不运行全量 AOCI 维护；若集成阶段另改通用宿主能力，由其作者在最终稳定状态维护索引。

## 后续用户可选的真实客户端检查

以下只用于后续实测，不是以上开发阶段的前置，也不是本次计划阶段授权执行的命令。版本检查、help 是官方已知命令；对未知子命令先看 help，不预设参数。

```bash
traecli --version
traecli --help
traecli plugin --help
```

- CLI stdio MCP：以后在用户自己选择的隔离配置根执行 `/mcp`，确认自建无副作用 fixture 被发现；本版 Hub 的默认根限制与隔离根实验是两件事。
- CLI 插件：从 `plugin --help` 再确定市场、安装、列表和启停命令；采样安装前后 `traecli.toml` 和 `plugins/` 差异。记录 exact version、是否有版本目录、多个版本的实际选择、enabled/default 字段、marketplace 路径和组件加载结果。没有采样时不把第三方示例当支持承诺。
- CLI skills：先在 `/skills` 或界面查看实际“打开目录”入口；只有确认当前扫描路径后才做隔离探针，不能把 IDE 的 `.trae/skills` 预写成结论。
- IDE：设置 > MCP > 原始配置（JSON）可确认真实用户级路径；分别启用项目 MCP、`.agents` 技能目录、AGENTS 上下文开关后，验证自己创建的项目 fixture。插件市场安装与授权仍由客户端完成。
- 插件版：从当前设置/官方更新说明确认是否出现技能、规则或 MCP 管理入口；`~/.marscode/logs` 仅能用来找日志，不当配置路径。

## 官方图标与版权记录

- 来源页面：<https://www.trae.cn/> 的 `<link rel="icon">`。
- 原始下载 URL：<https://lf-cdn.trae.com.cn/obj/trae-com-cn/trae_website_prod_cn/favicon.png>；响应地址与原地址相同，HTTP 200，Content-Type `image/png`。
- 本地原图：`D:/work-space/dsh-context-hub/docs/research/agent-icons/trae.png`。
- 格式：PNG，48 × 48 像素；大小：488 字节。
- SHA-256：`49d523938a22af5a70dd79923725df38674823026e2f917e76337319969f4af4`。
- 处理方式：原始响应字节保存，写入使用独占创建、无覆盖；未重绘、转换或优化。实施第一步原样复制至 `plugins/trae/assets/icon.png`，复制后再次对比此哈希。
- 版权限制：官网可下载不等于授予开源许可或再分发权。本次未找到图标开放许可证/品牌再分发授权；图标与品牌相关权利仍归权利人。这里只保留产品识别原图，不声称获得官方背书；发布前由发布者核实品牌使用条款，README 保留来源及“授权未确认”说明。

## 不做与完成判据

本计划阶段只写本文件与上述原图，不改代码、安装依赖、改客户端配置、启动服务、创建分支、提交或推送；未审批前不执行六阶段。

确定不做：CLI 1.0 兼容/迁移、跨客户端 legacy manifest 回退、私有云端 API/连接器授权、自动修改 IDE 开关、与 Trae 无关的重构。国际 IDE、VS Code/JetBrains 插件版、未知 CLI skills/角色路径、IDE 全局 MCP/user_rules 和普通资产环境根，在本计划中保留为证据或通用契约不足的待决项，不能冒充已覆盖；取得证据时按既有通道评估，不因缺真机永久排除。CLI/IDE 原生包与市场接入按阶段 5 推进，不能列入“明确不做”。

基础交付完成指包位于正式 `plugins/trae/`，阶段 1–4 的单测、源码集成、类型检查、构建通过；阶段 5 的插件实现或尚缺协议必须分开报告。阶段 5 没有足够证据时可以先交付基础能力，并明确插件安装尚未实现和后续决策，不能宣称产品全部接入完成。README 如实区分“已实现磁盘交付”“依赖 IDE 手动设置”“真实客户端未验证”“协议尚缺证据”。不能把真实客户端未测写成通过，也不因未测阻断已经有协议依据的开发。计划只有用户确认完成后再归档。

## 自审记录

- 对照实际 sidebar/skills 选择链，补上 CLI 空 skill provider 与两个 target 的隔离测试，避免 CLI target 被过滤；未添加虚构技能路径。
- 删除前次调研的过强结论：不再断言项目 traecli.toml 不存在、插件版不支持 Agent 能力，或国际 IDE 已确认使用某个根。
- 将 Codex 血缘、插件目录、marketplace/enable/版本选择与 CLI skills 全部与官方已证实 MCP 分离；插件安装保留为阶段 5 的产品目标，证据不足只说明缺项与后续决策，不用猜写代码或 fixture 通过条件冒充实现。
- 保留 CLI/IDE 原生插件安装目标及通用宿主能力分析；遵照用户要求采用纯文件路线，不使用 CLI 驱动或 shell 回退。市场登记、版本选择和安全移除证据不足时阶段 5 保持未完成。
- 每阶段列明目标、具体文件和真实项目脚本；阶段 1 后插件取证可与基础资产开发并行，阶段 6 汇合。源码集成缺参数必须 skipped，不计 passed。
- 未以真实客户端、隔离环境、独立验收或宿主发布作为开发依赖；作者只负责自己的正式包，公共锁文件/索引交集成负责人。
- 核对图标来自官方页面链接，原始 PNG 大小/哈希已记录，未覆盖任何既有文件；版权无证据则明确未确认。
