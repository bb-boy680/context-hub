# 接入 WorkBuddy Agent 扩展

状态：按用户最新要求直接开发，真实客户端调试与验收由用户执行。核对日期：2026-11-03。

实施记录：已实现 Skills、stdio MCP、Coding commands/全局指令、原生清单注册以及纯文件插件安装和状态管理。`engines` 使用宿主当前版本 0.2.0 作为本地开发基线；所需 manifest 注册和未知态 API 尚未发布，发布前必须改为实际包含这些 API 的版本。未运行 WorkBuddy、未触碰真实配置；用户自行验证组件发现、项目设置、优先级和市场注册。公开 WorkBuddy 本地样本支持 version 2 registry、cache 和用户 enabledPlugins；known marketplace 具体格式与项目设置路径仍为底座协议推断，详见扩展 README。后文原计划中要求客户端探针作为开发前置及独立验收的限制已由用户最新要求覆盖。

## 背景与范围

实施仓库：`D:/work-space/context-hub-extensions`，新增 `plugins/workbuddy/`。宿主仓库：`D:/work-space/dsh-context-hub`。

当前 `plugins/claude.code/src/index.tsx:apply`、`plugins/codex/src/index.tsx:apply` 通过 skills/prompts/mcp/plugins/targets/locales 注册能力；JSONC、提示词生成和文件事务从服务注入。新扩展沿用该边界，不新建页面、不在宿主增加 WorkBuddy 分支。`PluginInstallScope` 当前只有 user/project；local/managed 只读。

**仅支持当前原生协议，不提供旧版本兼容、清单回退或配置迁移。** 插件唯一清单为 `.codebuddy-plugin/plugin.json`；不回退 `.workbuddy-plugin`、Claude/Codex 或标准根清单。虽然目录名含 CodeBuddy，它是官方共用底座当前的原生协议，不能因名字而改成自创 `.workbuddy-plugin`。代码开发场景当前仍消费的 `.codebuddy/commands`、`CODEBUDDY.md` 保留；它们不属于旧版本适配。

安装器固定为 **PluginDisk 纯文件通道**；不选择 CLI 后端，不运行 codebuddy，不做 CLI 回退。registry/schema、运行根与组件实际加载未通过探针前，安装器阻塞；不得用手造 fixture 宣称协议成立。其余资产可独立完成，但不能将安装器标为完成。

## 已有依据与必须确认的边界

先前调研使用 Context7 `/websites/codebuddy_cn_workbuddy`，再读取官方文档：

| 来源 | 采用内容 |
| --- | --- |
| [官方入口](https://www.workbuddy.cn/llms.txt) | WorkBuddy 与 CodeBuddy 共底座；本地文件与云端产品对象不同 |
| [MCP](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide) | 用户 `~/.workbuddy/mcp.json`、项目 `.workbuddy/mcp.json`；根键 mcpServers |
| [项目](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Project)、[设置](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Setting) | Coding 当前读取 `.codebuddy` 的技能、命令、指令；不据此推导原生 MCP 文件名 |
| [插件](https://www.workbuddy.cn/docs/workbuddy/Plugins)、[底座参考](https://www.workbuddy.cn/docs/cli/plugins-reference)、[市场](https://www.workbuddy.cn/docs/cli/plugin-marketplaces) | 原生清单、cache/data/marketplace、defaultEnabled 与 user/project/local/managed |
| [命令](https://www.workbuddy.cn/docs/cli/slash-commands) | Markdown commands 与参数原文 |
| [技能](https://open.workbuddy.cn/docs/skill) | SKILL.md；原生扫描目录仍需实机确认 |
| [记忆](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Memory) | 自动记忆没有已确认的可写文件协议，本版不接 |

约束：`marketplaces/` 是源快照，运行时读 registry 指向的 `cache/<market>/<name>/<version>`；不删除源快照来卸载。team 是分发概念，不造 scope。themes/monitors 当前仅识别、不运行；文件原样保留，不计交付能力。registry 的文件名、精确 schema、项目 settings 根必须由当前发布客户端采样，不套用 Claude 的 map-of-arrays。

## 资产面

| 资源 | 用户级 | 工作区级 | 决策 |
| --- | --- | --- | --- |
| Skills | `~/.workbuddy/skills/<name>/SKILL.md` | `.workbuddy/skills/<name>/SKILL.md` | V1 确认发现后注册 workbuddy-global/workbuddy；未通过不注册 |
| 共享 Skills | `~/.agents/skills` | `.agents/skills` | workspace 已有共享 provider，不重复；global 当前无共享入口，本版不新增 |
| MCP | `~/.workbuddy/mcp.json` | `.workbuddy/mcp.json` | 两个原生 place；不读取/写入未经证实的 .mcp.json 别名或 Coding MCP |
| Coding commands | `~/.codebuddy/commands/<slug>.md` | `.codebuddy/commands/<slug>.md` | 当前官方目录；prompts 的 commands form，标签明确 Coding |
| Coding 静态指令 | `~/.codebuddy/CODEBUDDY.md` | 共享 `AGENTS.md` | 全局只写 Hub 标记段；项目不另注册 |
| 自动记忆/团队/连接器 | 客户端或云端管理 | 客户端或云端管理 | 无文件写入协议，不接入 |

MCP 复用 `readJsonObject/editJson/readDeclaration/writeDeclaration/jsonValueLines/McpError`，只改 `mcpServers[name]`。V2 锁定当前 transport 与开关字段，只支持该形式；未证实 transport 不写，未证实开关则 `switchable:false`。旧字段/形状不归一化，目标条目不支持时明确拒写。保留未知字段、其它 server、注释及用户已禁用状态；坏 JSON 不当空文件覆盖。

Prompts 的 `workbuddy-coding`（workspace）提供 commands；`workbuddy-coding-global`（global）提供 commands/instructions。使用 `slugOf/commandFile/withSection/withoutSection`；文件标记放在 frontmatter 后。无 Hub 标记的手写同名文件拒绝覆盖/删除；正文的 `$ARGUMENTS`、`$1`、`@file` 原样保存，不执行。全局 Coding 文件会被共底座产品消费，README 写清影响范围。

## 原生包与宿主前置

当前宿主 `packages/resources/plugins/src/contract.ts:PLUGIN_MANIFESTS` 仅识别 Claude、根清单和 Codex；`host/describe.ts:readManifestFields` 与 `src/add-plugin-dialog.tsx:manifestOf` 共用该入口。不能用双清单绕过这个缺口。

1. **通用 manifest 路径声明/收录（阻断安装器）**：由扩展声明 `.codebuddy-plugin/plugin.json`，统一供浏览器导入、磁盘扫描、describe 使用。测试 native-only 标准布局、自定义目录、inline MCP、名称/版本/描述/图标完整性和声明卸载；宿主不持有客户端清单字面量。Cursor/ZCode 共用这一前置。
2. **未知启用态（共同前置）**：`PluginHeld.enabled?: boolean`，undefined 显示未知，不等同 false。同步 types/rows/UI/locale，聚合任一 true 得 true、全部明确 false 才 false、其余未知；已有布尔提供者回归通过。
3. **目录布局**：`host/installer-files.ts:commit` 当前只复制到 cache 四段，removeDirectory 同样受 cache 限制。V5 必须确认 WorkBuddy 符合；不符合则阻塞并另审通用目录目标声明，不增加 WorkBuddy 特判。

只使用 `.codebuddy-plugin/plugin.json`，Hub 不生成、翻译或补写其它清单。`commit(copy)` 比较源树与副本 hash，复制后不能增加清单或 ownership 文件。包名/版本/组件路径/依赖必须在复制前校验；缺版本或不安全段拒绝。只保留当前 schema 的成功路径，历史 registry/schema 一律拒写且原字节不变。

## 文件安装与状态

候选 `home:'.workbuddy'`、`state:'plugins'`，实施前由 V4/V5 锁定，不发明 WORKBUDDY_HOME。声明最小权限：config 的已证实 settings；plugins 的 installed registry、known marketplaces 与 cache；workspace 的已证实 project settings；library/external 只读原生 manifest 与 `.codebuddy-plugin/marketplace.json`。不授予 data/marketplaces 源快照写权限。

- install：验证当前原生 manifest、registry 与市场来源 → `syncMarketplace` 写库根 `.codebuddy-plugin/marketplace.json` → `disk.run` 取快照 → 原样复制 cache，并在同一 commit 提交 registry、市场登记与所选 scope settings。写成功只报告磁盘安装，启动 WorkBuddy 后的组件发现另验。
- held：registry 证明安装、settings 链证明开关；保留完整 `name@marketplace` 和真实 scope/source。`switches` 只返回文件明确布尔；`held.enabled` 为当前工作区能确定的有效值。local/project/user/default 的优先级必须由 V4 验证；不可确定返回 undefined，不能从 registry 存在猜 true。
- setEnabled：只改目标 user/project 文件的当前字段；重装保留已有显式选择，首次采用已验证的 defaultEnabled。local/managed 不可写；受更高层控制而无法产生目标效果时，在写前报告控制文件。
- remove：只移除目标 scope/项目的安装声明与开关；其它 scope、工作区、data/options 保留。只操作本 Hub 管理记录，外部条目保留真实身份且只读。无引用 cache 保留交给客户端清理，不移植 Claude orphan 标记，不删除市场源快照。
- 依赖、专家团 dependencies 对象、connector/userConfig 交互不实现求解；未满足时安装/启用前拒绝。不能证明反向依赖安全时拒绝停用/卸载。
- 全部写入走 disk.run/commit 的快照、原子写和失败补偿；缺能力报错，不回退。Hub 不能锁住客户端 reconcile，冲突时保留磁盘并报告重试。

PluginPlace：workbuddy-user 为 global/user；workbuddy-project 为 workspace/project，路径和 overrides 经 V4 确认后注册；local/managed 仅作为只读记录参与有效状态计算。team 不注册。

## 完整文件清单

```text
plugins/workbuddy/
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
  __test__/locations.test.ts
  __test__/provider.test.ts
  __test__/prompts.test.ts
  __test__/installer.test.ts
  __test__/fixtures/workbuddy-state.json
  lib/index.js                       # 构建生成，不提交源码分支
```

registry fixture 只有 V4 采样完成才创建，含脱敏合成状态、版本和采样步骤。installer 阻塞时不注册、不留空壳。根 workspace 已覆盖 plugins/*；只按实际链接需要增加 lockfile importer。既有脚本自动生成 marketplace，不手改生成物；不新增生产依赖。

## 七阶段实施

按下列阶段名维护七条实施任务，开工前 in_progress，验收后立即 completed；受阻阶段保留未完成并记录原因。

### 阶段 1：建立扩展脚手架

目标：可构建并被市场发现。

文件：package/plugin/build/tsconfig/vitest/README、assets/icon.svg、src/index.tsx/contracts.ts/messages.ts。

动作：第一步将 `D:/work-space/dsh-context-hub/docs/research/agent-icons/workbuddy.svg` 原样复制到 `D:/work-space/context-hub-extensions/plugins/workbuddy/assets/icon.svg`。沿用现有脚手架，name/id workbuddy、version 0.1.0、main lib/index.js、category agent，provider/target/installer id 为 hub.target.workbuddy。inject 随已完成注册添加；engines 下限必须绑定实际交付前置的 Hub 版本，不照抄旧下限、不编造版本。

图标使用 `/hub/extensions/workbuddy/assets/icon.svg` 的 img；保留 className/aria-hidden。资源路由必须在 dev 与已安装两种形态返回 SVG/200；失败则修复受支持资源交付，不增加旧宿主分支。

验收：扩展根 `pnpm --filter workbuddy typecheck`、`pnpm --filter workbuddy build`；原图/目标 hash 相同，bundle 仅允许现有 React externals，README 记录图标来源和条款。

### 阶段 2：注册身份与技能位置

目标：Agent 可选择，已验证目录可独立计数。

文件：locations/index/contracts/messages、locations.test.ts、README。

动作：完成 V1 后只注册实际被消费的两种 `.workbuddy/skills`；shared workspace 不重复，global shared 不谎称已覆盖。target supports 用现有 skill/mcp/memory/agent；不虚报独立 hook 管理。

验收：`pnpm --filter workbuddy test`、`pnpm --filter workbuddy typecheck`；断言 id/scope/dir、生命周期注销、两位置独立 0/1/2 和未知数量。V1 失败则对应位置 blocked，不擅自换到猜测目录。

### 阶段 3：实现原生 MCP 交付

目标：两个明确文件可读、安装、移除和定位。

文件：provider/locations/contracts/index/messages、provider.test.ts、README。

动作：完成 V2，固定当前 transport 与开关字段；只改目标节点，不双写其它文件，不生成旧形状。不支持的目标条目拒写，损坏文档零写入。

验收：`pnpm --filter workbuddy test`、`pnpm --filter workbuddy typecheck`；stdio、已证实远程 transport、缺文件、坏 JSON、旧形状拒写、未知字段/注释保留、单项删除、scope 隔离和 locate；开关只有协议验证后提供。

### 阶段 4：交付 Coding 命令与指令

目标：当前官方 Coding 文件可幂等交付并保护手写内容。

文件：prompts/contracts/locations/index/messages、prompts.test.ts、README。

动作：完成 V3；实现上述两个 prompts places，复用 commandFile 和标记段落工具。项目 AGENTS 归共享 provider；不创建 `.workbuddy/commands` 或臆测全局 AGENTS。

验收：`pnpm --filter workbuddy test`、`pnpm --filter workbuddy typecheck`；两 scope、幂等更新、手写冲突、撤回只删 Hub 内容、BOM/CRLF、参数字面保留、未知 form/place 拒写。记录 Coding 与办公场景的实际消费边界。

### 阶段 5：验证协议并实现文件安装器

目标：纯文件实现当前原生包的 user/project 生命周期。

文件：installer/plugin-state/locations/contracts/index/messages、installer.test.ts、fixtures/workbuddy-state.json、README；宿主文件由共同前置计划统一维护。

动作：先完成 V4/V5/V6，锁定当前 registry/settings/cache schema 与启用链；验收通用 manifest 声明和未知态前置后，按上文文件安装流程编码。只解析原生清单和当前 registry；历史 map、旧 schema、替代清单全部拒绝。tests 的 tools.run/has 一调用即抛错。registry/settings、copy 的成功与失败必须一并验收，不把只写开关当安装。

验收：`pnpm --filter workbuddy test`、`pnpm --filter workbuddy typecheck`、`pnpm --filter workbuddy build`；重复安装不重复记录、显式 false 保留、managed 只读、反向依赖保护、完整 id、版本/路径拒绝、快照冲突及失败回滚。当前原生单清单包必须在 Hub 元数据完整，在隔离 WorkBuddy 实际发现组件。任一前置不通过，阶段 blocked，不注册 installer；其它能力完成也不能报告完整插件接入。

### 阶段 6：验证回归与发布物

目标：真实文件通道、构建和市场索引通过。

文件：全部测试与 README；仅必要 lockfile importer。

动作：用真实宿主工具补临时 IO，显式注入 home/userHome/folder/library/env；不能仅替换 Hub home。覆盖当前成功路径和旧格式零写入拒绝，核对未知态、位置计数与原生收录。

验收：扩展根依次 `pnpm --filter workbuddy test`、`pnpm --filter workbuddy typecheck`、`pnpm --filter workbuddy build`、`pnpm lint`、`pnpm test`、`pnpm typecheck`、`pnpm build`。宿主共同前置按其批准计划执行 plugins 与受影响 UI 测试。`git diff --check`；生成索引含 workbuddy/icon，lib/marketplace 不提交。

### 阶段 7：验证隔离客户端并清理

目标：磁盘、Hub 与真实 WorkBuddy 组件一致。

文件：README 的已验证版本、路径、限制；必要 fixture 证据。

动作：使用隔离 OS 用户/VM、临时工作区和 Hub 根，先证明所有实际路径隔离；浏览器按 ego-browser 验收。最小原生包只含无执行副作用组件，安装→停用→启用→scope 覆盖→卸载后用客户端自己的列表及新会话逐项检查；不以 CodeBuddy CLI 成功替代 WorkBuddy。MCP 只用受控本地 fixture，无凭证/远程服务。Skills/MCP/Prompts/Plugins 核对两 scope 路径、计数、未知状态和扩展注销。

验收：记录当前发布客户端精确版本、组件来源和正反结果；没有客户端或无法隔离时标未验证，不发布/不称完成。先卸测试包复查 registry/settings，再关闭自己持有 PID、删除自己临时目录；真实 .workbuddy/.codebuddy/.agents 零写入。用户确认完成后才归档。

## 待验证项

只在隔离 OS 用户/VM 执行；PROBE_HOME 为测试账户真实 home，PROBE_WORKSPACE 为独占工作区。GUI 没有已验证 profile 参数，不用 shell 环境变量假装隔离。

| 编号 | 方法与通过条件 |
| --- | --- |
| V1 原生 Skills | 用 `rg --files --hidden "$PROBE_HOME/.workbuddy/skills" "$PROBE_WORKSPACE/.workbuddy/skills"` 对照磁盘；分别放唯一 SKILL，客户端列表/新会话确认发现。未发现不注册 |
| V2 MCP | 测试账户 UI 新建、关闭、移除本地 MCP；`rg -n 'mcpServers|enabled|disabled|"type"' "$PROBE_HOME/.workbuddy" "$PROBE_WORKSPACE/.workbuddy" -g '*mcp*.json'` 对照字段及 transport；不记录真实账户数据 |
| V3 Coding 资产 | `rg --files --hidden "$PROBE_HOME/.codebuddy" "$PROBE_WORKSPACE/.codebuddy" -g '*.md'`；用唯一纯文本 command/memory 在 Coding 场景确认菜单与上下文来源 |
| V4 registry/settings | 测试账户 UI 安装/启停/卸载最小原生包，每步读取候选 installed_plugins.json/known_marketplaces.json；settings 只提取 enabledPlugins。比较 user/project/local 相反值、defaultEnabled 与 managed；不打印认证配置。官方未给完整 schema，样本不确定即阻塞 |
| V5 cache/加载 | `rg --files --hidden "$PROBE_HOME/.workbuddy/plugins" -g 'plugin.json' -g 'SKILL.md' -g 'installed_plugins.json'`；registry installPath 必须指向当前 cache 四段。启动同账户 WorkBuddy 检查组件及来源；目录或列表存在不能替代加载 |
| V6 原生收录 | `pnpm --filter workbuddy test`；通用声明前置后导入只含 .codebuddy-plugin 的标准/自定义布局，元数据完整；Claude-only/workbuddy-plugin-only 拒绝。treeHash 无额外生成文件 |
| V7 图标使用依据 | 阅读官方开发者公约与条款并记录来源；当前无独立品牌再分发许可，不标 MIT/CC0 |

## 图标

研究文件：`D:/work-space/dsh-context-hub/docs/research/agent-icons/workbuddy.svg`。来源：官网引用的 `https://assets.workbuddy.cn/web/workbuddy/873deebfa9e3b25b5cfe6abc7bb5a77678dbf3e5/assets/logo.svg`。

4142 bytes，viewBox 0 0 40 40；SHA-256 `10ccbc099e7bc3d5ff12c315c4edd7b21386aa7166c1ec19997b3d55010d5c7d`。原样下载，已检查 SVG 头和无脚本/foreignObject/外部 href/事件属性。无独立再分发授权，不标本项目原创或开源许可；README 保留来源和商标归属，发布前确认使用依据。[开发者公约](https://open.workbuddy.cn/docs/developer-agreement)、[服务协议](https://rule.tencent.com/rule/202603180001)。

## 不做

- 不兼容旧客户端、历史 registry、替代清单、旧字段或自动迁移；遇到旧格式明确拒绝并保留原文件。
- 不采用 CLI 安装/读取后端或回退，不借独立 CodeBuddy CLI 声称 WorkBuddy 成功。
- 不做云端项目、团队分发、专家团、连接器、自动记忆、登录、计费或密钥管理。
- 不做依赖求解/下载、payload overlay、prune、市场升级、data 清理或自动更新。
- 不改真实用户配置、不发布、不提交 Git、不重绘图标、不扩大共享 provider/页面改造。

## 自审

七阶段均列出目标、文件、动作和真实 pnpm 脚本/客户端观察判据；先协议样本再 parser，先通用 manifest 声明再原生安装。清单、fixture、测试和验收全部收为单一当前格式。已删除 CLI/文件双通道和双清单绕行；保留当前 Coding 目录、数据保护、未知字段与真实加载门槛。实施状态见文首，计划未归档。
