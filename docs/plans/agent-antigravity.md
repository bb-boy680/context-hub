# 接入 Antigravity Agent 扩展

状态：已按用户最新指示直接实现，源码位于正式 `plugins/antigravity`。核对日期：2026-11-03。阶段 0.5 与 7 的客户端实机探针交用户后续调试，不作为开发前置，也未标通过。阶段 0 引用已交付共同前置；阶段 1–6 运行本包检查。计划不归档，等待用户确认完成。

实施仓库：`D:/work-space/context-hub-extensions`；宿主仓库：`D:/work-space/dsh-context-hub`。

## 背景与唯一协议

Antigravity App、IDE、CLI 共用 agent harness，CLI 命令为 agy。本扩展只接当前原生 Antigravity Plugins/Skills/Rules/Agents/MCP；不接 Gemini CLI extension、不运行 import、不转换旧 commands/workflows。

当前参考为 `plugins/claude.code/src/index.tsx:apply`、`plugins/codex/src/index.tsx:apply` 以及两者 provider/prompts/installer；通过服务注册接入，不增加页面或宿主 Agent 分支。`packages/resources/skills/src/extension.ts:SHARED_PLACE` 只有工作区 .agents/skills，`prompts/src/workspace-provider.ts` 已负责项目 AGENTS.md 与共享 agents；不重复注册。

**只支持当前原生格式。** 原生 manifest 为根 `plugin.json` 或 `.antigravity-plugin/plugin.json`；不读取旧 `.gemini-plugin`、Claude/Codex 清单作为回退。两份原生清单同时存在但身份/组件冲突时拒绝，不猜优先级。根清单必须是 Antigravity 格式，不能把其它标准的同名 plugin.json 当作原生包。

`.gemini/config` 是当前 Antigravity 仍使用的共享根，`antigravity-cli` 是当前 CLI 专用目录；保留它们不等于兼容 Gemini CLI。默认写入只选当前共享根，文档冲突的额外发现目录经阶段 0.5 验证后才读取；不为旧版本额外扫描别名。

## 证据与未知项

本轮 Context7 已复核 `/websites/antigravity_google` 的原生 plugin.json 与 MCP serverUrl；官方正文优先于索引摘要。来源：

| 文档 | 采用内容 |
| --- | --- |
| [Plugins](https://antigravity.google/docs/plugins.md)、[实时 schema](https://antigravity.google/schemas/v1/plugin.json) | 原生包、name、组件与清单字段 |
| [Discovery](https://antigravity.google/docs/customization-discovery?tab=cli) | .agents 与 ~/.gemini/config，entries.path 发现清单 |
| [MCP](https://antigravity.google/docs/mcp.md) | mcpServers、command/args/env、serverUrl、disabled |
| [Rules](https://antigravity.google/docs/rules.md) | trigger frontmatter、model_decision 的 description、24,000 字节限制 |
| [Subagents](https://antigravity.google/docs/subagents.md) | name/description 与原生 agents 目录 |
| [CLI changelog](https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md) | 1.1.11 起 config.json 是启用态唯一来源，manifest disabled 只播种首次值 |

实时 schema 的 name 必需，匹配 `^[a-zA-Z0-9_-]+$`；version/description 为字符串。displayName、logo、skills、suggestedPrompts 等只原样保留，未经当前运行时验证不承诺生效；旧导入 source/sourcePath 别名不解析、不生成。

文档的 CLI staging 为 `~/.gemini/antigravity-cli/plugins/`，列表示例却指向 `~/.gemini/config/plugins/`。本版只写受控 cache + plugins.json entries.path；两处官方列出的发现根只读展示，实际组件加载交用户调试，不能称已实测。启用态 config.json 的精确键名未公开，不读取或写入该文件，不能凭 manifest.disabled 推断。

当前机器未发现 agy。没有隔离客户端时探针 blocked；文件自动检查不等于运行时加载验证。

## 资产与文件行为

| 资源 | 用户级 | 工作区级 | 注册范围 |
| --- | --- | --- | --- |
| Skills | ~/.gemini/config/skills/<name>/SKILL.md | .agents/skills | 一个原生 global place；workspace 由共享层负责 |
| MCP | ~/.gemini/config/mcp_config.json | .agents/mcp_config.json | 两个固定文件 place，各自定位/计数/读写 |
| Rules | ~/.gemini/config/rules/context-hub-<slug>.md | .agents/rules/context-hub-<slug>.md | 两 scope，必须写 trigger frontmatter |
| Agents | ~/.gemini/config/agents/<slug>.md | .agents/agents/<slug>.md | 原生 global form；workspace 复用共享 provider |
| Instructions | ~/.gemini/AGENTS.md | 项目 AGENTS.md | 全局标记段；项目共享 provider |
| Hooks | ~/.gemini/config/hooks.json | .agents/hooks.json | 只描述包携带能力，无独立编辑入口 |

CLI 额外技能根 ~/.gemini/antigravity-cli/skills、~/.gemini/skills 只在确认是当前构建的发现根后列入 README，不新增读取/投递入口。项目 .gemini/skills 没有当前官方依据，本版不探测或注册，不拿重复 .agents/skills 填补专属安装菜单缺口。全局其它 AGENTS/GEMINI 指令位置不重复写入，避免累积两份上下文。

### MCP

provider 使用 ctx.mcp.tools 的 JSONC 编辑与行定位，只操作 mcpServers[name]：

- stdio 为 command/args/env，远程仅 serverUrl/headers。只认这两种当前形式；SSE 没有已证实独立字段则明确拒绝交付，不猜 transport。
- 旧 url/httpUrl 或新旧字段并存时，读取报告不支持，目标安装/启停/卸载均拒绝，文件原字节不变；不迁移、不删旧键。
- enabled = disabled !== true；setEnabled 只对存在的完整 server 写 disabled = !on，不生成影子条目。
- install 保留已有 disabled、cwd、timeoutSeconds、enabledTools、disabledTools、oauth、authProviderType 及未建模字段。transport 切换仅移除互斥的当前字段，不残留 command 与 serverUrl 两套配置。
- 缺文件返回空，非空损坏 JSON 或非法容器报 McpError，不当空对象覆盖。卸载只删目标 server，保留文件/其它条目/注释。locate 使用同一实际 JSON 路径。

### Prompts

global place antigravity-global 提供 skill/rule/agent/instructions，workspace place antigravity 提供 rule。路径按上表，global skill 为 ~/.gemini/config/skills/<slug>/SKILL.md。

复用 slugOf、describeBody、commandFile 的正文规范化、withSection/withoutSection、PromptError；原生 frontmatter 在扩展内最小生成：skill/agent 写 name 与 description，rule 写 trigger:model_decision 与 description。所有字符串用 JSON.stringify 编成合法 YAML 标量，不新增 YAML 依赖。description 依次取 prompt.description、describeBody、名称。

标记固定为 frontmatter 后首个正文行的 `<!-- context-hub:<slug> -->`，held/remove 只认精确位置，不能用全文 includes 认领用户文件。同名手写文件拒绝覆盖/删除，已有标记幂等更新。rule 文件、合并后的全局 instructions 按 UTF-8 检查 24,000 字节上限，超限零写入。skill remove 只删自己的 SKILL.md，保留目录其它资源。

共享 .agents/rules 的现有生成文件没有 trigger，Antigravity 不消费；本扩展使用 context-hub- 前缀生成独立文件，避免覆盖。共享 agents 与 AGENTS 已满足当前格式，不再生成第二入口。SUPPORTS 只声明 skill/mcp/memory/agent；没有独立 hook 管理就不声明 hook。

## 插件文件安装

唯一方案：复制到 `~/.gemini/context-hub/cache/context-hub/<name>/<version>`，再写 `~/.gemini/config/plugins.json` 的 entries.path。只 user/global 安装；项目 .agents/plugins 与项目 plugins.json 通过探针后只读展示。不会改为 agy 后端或其它近似安装根。

### 宿主前置与文件权限

1. 通用 `PluginHeld.enabled?: boolean`：types/rows/UI/locale 同步未知态，不能将 undefined 当 false。聚合任一 true 得 true、全部明确 false 得 false、其余未知；未知不画 Switch、不计启用数。已有 Claude/Codex 布尔返回者保持当前行为。
2. 通用 manifest 路径声明/收录：原生根清单可用现有入口；只有 .antigravity-plugin 的包由扩展贡献路径，统一供浏览器导入、磁盘收录、describe 使用。与 Cursor/WorkBuddy/ZCode 共用，不要求双清单，不把客户端字面量追加进宿主。
3. `PluginDisk.commit(copy)` 只接受 cache 四段，removeDirectory 只接受 cache 范围；本方案符合现有目录约束，不放宽。copy 前后 treeHash 必须相同，不能复制后补写 manifest、ownership 或其它文件。

roots：home .gemini，state context-hub。config 最小允许 config/plugins.json 与经探针确认的 config/config.json；只读当前已验证的 config/plugins 和 antigravity-cli/plugins 及其原生清单。workspace 只读 .agents/plugins、.agents/plugins.json 和原生清单。stateFiles 只允许必要 cache 逐级列举与自身 cache 复制/删除。library/external 只授权 plugin.json 和 .antigravity-plugin/plugin.json；不授权 Gemini/Claude/Codex 清单、data 或真实凭证文件。不发明环境根变量。

### 生命周期

- preflight：scope 必须 user；tools.root 与 roots.library 一致；原生 manifest name 合法且等于 Hub 库名。缺原生清单、其它格式、损坏清单或冲突均在写盘前拒绝。version 缺失可用 local（当前无版本本地包的约定，不是版本兼容）；版本段拒绝越界、盘符、控制符、Windows 保留名、前导点/尾随点空格等。
- install：disk.run 发放 lease，读取 plugins.json 快照，完整复制到 cache/context-hub/name/version，同一 commit 合并自身 entry。entries.path 用 disk.path 返回的平台绝对路径，不拼 HOME、不写 ~。重复安装一条 entry，升级替换自身旧 entry。源目录摘要通过 `snapshotDirectory` 与 `copy.sourceSnapshot` 绑定；目标当前快照通过 `copy.before` 校验。省略 `replace` 和 `pruneVersions`，同版本已有不同文件时拒绝覆盖，旧版本缓存保留。
- plugins.json 缺文件可建最小对象；存在时必须对象、entries 必须数组、每项 path 字符串。保留其它字段与用户 entries，不写 inherits/exclude、不把发现清单当开关。本版不跟随 inherits，README 写明读取边界。
- remove：只接收自身完整 id name@context-hub；原子删自身受控 cache 下的发现 entry，保留全部 cache，并在返回结果中报告残留路径。当前扩展没有持久所有权凭据，且不能证明其它项目未引用该副本，因此不调用 removeDirectory 或事务删除；这不阻断安装、held、卸载声明生命周期。data 和其它包/项目不动，不将客户端来源不明包拼成 Hub id 删除。
- held：读取当前已验证的个人发现根、plugins.json 顶层 entries 和项目只读来源，按规范化目录去重。保留 source 的真实路径；外部条目只读。相对路径按当前文档的清单基准解析，绝对路径经 disk.readExternal 检查；不因 path 字符串存在就扩大文件权限。缺目录/坏清单报告来源异常，不伪造可用包。
- enabled：只有 config.json 当前精确键可证明时返回布尔；没有对应状态即 undefined，绝不回退 manifest.disabled。switches 只含该文件明确布尔。探针确认可写文件协议后，阶段 5 内实现 setEnabled/switches 并开 switchable；否则无方法、switchable:false，启停交客户端。
- 不用 syncMarketplace：此方案通过发现清单加载，不生成无必要市场索引。tools.run/has/syncMarketplace 在安装器测试均设 throw，调用次数必须零。

## 完整改动清单

```text
plugins/antigravity/
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
  lib/index.js                         # 构建生成，不提交源码分支
```

package/id 为 antigravity，version 0.1.0，main lib/index.js；provider/target/installer id hub.target.antigravity。沿用既有 build/vitest/tsconfig 与 React externals，无生产依赖。plugin.yaml 的 inject 随实际注册服务添加，不提前注册空壳；engines 的本地开发基线为真实宿主工作树 0.2.0，并在 README 明确依赖本轮未发布 API，发布时再绑定实际 release。根 workspace 已覆盖 plugins/*，lockfile importer 与 marketplace 由统一集成 Agent 处理。

## 九阶段实施

### 阶段 0：验收宿主共同前置

目标：原生单清单可完整收录，未知启用态能贯通显示。

文件（由共同前置统一实现）：plugins/src/provider.ts、types.ts、rows.ts、install-actions.tsx、messages.ts、contract.ts、host/describe.ts、add-plugin-dialog.tsx、相关 tools/handlers、__test__/rows.test.ts/scan.test.ts/library.test.ts/bridge.test.ts、docs/extensions.md；具体声明字段由共同计划基于真实源码确定，本计划不臆造 API。

动作：验收上述两项共同前置，不在此扩展重复实现。声明生命周期、路径校验、浏览器/宿主元数据一致；undefined/true/false 聚合与 UI 正反覆盖。

验收：宿主根 `pnpm --filter @context-hub/plugins test`、`pnpm --filter @context-hub/plugins typecheck`、`pnpm --filter web typecheck`；已有扩展回归通过；宿主无新增 Antigravity 目录/文件名字面量。没有前置则 installer blocked。

### 阶段 0.5：核验当前客户端协议

目标：证明唯一文件安装方案可加载，锁定当前读根与启停文件。本阶段不改扩展源码。

文件：README 记录探针版本、输出与结论；无执行组件 fixture 仅在独占临时根生成。

前置：`command -v agy`、`agy --version`，按本机 help 核对命令和隔离方式。使用隔离 OS 用户/VM；若用子进程 env，必须先证明 HOME/USERPROFILE 与 agy 所有实际路径独立，不能仅隔离 Hub home。所有调用有临时 cwd；不得复制真实登录凭证。

| 探针 | 动作与观察 |
| --- | --- |
| A | 最小原生包放隔离 ~/.gemini/antigravity-cli/plugins/probe；记录是否发现及来源 |
| B | 同包单独放隔离 ~/.gemini/config/plugins/probe；同样记录；不同时放两根干扰 |
| C | 参考根执行 `agy plugin install <fixture>`，取安装前后文件清单，与 list 报告路径对照；仅协议对照，不作 Hub 后端 |
| D | 只复制到受控 cache，手写 config/plugins.json entries.path 指向该副本；不调用 install。新会话必须实际发现 fixture skill，不能只有插件列表有行 |
| E | 单独项目 .agents/plugins 与项目发现清单；核对当前版本实际发现，未通过不读作已加载项目 |
| G | 在参考根 disable/enable 前后比较 config.json、CLI settings、plugins.json，只提取插件状态键，核对新会话组件消失/恢复 |

参考命令经 help 确认后使用：`agy plugin list --json`、当前版本的技能诊断（先核对是否支持 `agy -p "/skills" --output-format json`）；需要模型请求/付费或登录时停留诊断并如实标未验，不能为探针隐式计费。root/.antigravity-plugin 两种原生清单单独验证；旧格式只做 Hub 拒绝测试。

验收：六行有版本、路径、组件发现结果或明确未验。D 失败则 installer blocked；G 未通过则启停仅客户端管理，enabled 未知；A/B 只保留当前证实根。无 agy/隔离环境则阶段 blocked，不以文件检查代替。

### 阶段 1：建立扩展脚手架

目标：独立构建并加载最小扩展。

文件：package/plugin/build/tsconfig/vitest/README、assets/icon.svg、index/contracts/messages、locations.test.ts。

动作：第一步将 `D:/work-space/dsh-context-hub/docs/research/agent-icons/antigravity.svg` 原样复制到 `D:/work-space/context-hub-extensions/plugins/antigravity/assets/icon.svg`。图标 img 指向 `/hub/extensions/antigravity/assets/icon.svg`，保留 className/aria-hidden；原图 mask/filter id 不内联复制冲突。只注册已实现能力，不预建 plugin-state 空壳。

验收：扩展根 `pnpm --filter antigravity typecheck`、`pnpm --filter antigravity build`、`pnpm --filter antigravity test`；源/目标 hash 相同、体积小于 32 KiB，dev 与已安装资源路由均 SVG/200、浅深主题可见；产物仅允许既有 React externals。需要 workspace 链接才按现有 pnpm install，不升级依赖。

### 阶段 2：注册身份与位置

目标：target 和唯一全局技能 place 出现，公共目录不重复。

文件：locations/index/contracts/messages、locations.test.ts、README。

动作：global dir .gemini/config/skills；project 技能/agents/AGENTS 复用共享位置，MCP/rules 路径如表。只列当前路径，不扫描旧别名。支持枚举 skill/mcp/memory/agent。

验收：`pnpm --filter antigravity test`、`pnpm --filter antigravity typecheck`；全局一 place，id/scope/dir 正确，没有重复 .agents/skills，选择/注销生命周期与计数身份正确。

### 阶段 3：实现原生 MCP 交付

目标：两个固定文件的当前字段可管理。

文件：provider/contracts/index/messages、provider.test.ts、README。

动作：实现上述 canonical-only MCP 行为；共用 JSONC 工具、精确节点与反向 disabled，旧 url/httpUrl 不归一化。

验收：`pnpm --filter antigravity test`、`pnpm --filter antigravity typecheck`；stdio/http、两个 scope、disabled 保留、启停正反、原文/locate 一致、transport 切换、坏 JSON/旧字段/未知 place 零写入、其它字段/注释保留。

### 阶段 4：交付提示词与规则

目标：四种全局 form 和工作区 rule 正确交付。

文件：prompts/contracts/index/messages、prompts.test.ts、README。

动作：按上文 frontmatter、所有权、24,000 字节与路径规则实现；不提供 commands、旧 workflow 迁移或重复 shared form。

验收：`pnpm --filter antigravity test`、`pnpm --filter antigravity typecheck`；每个 form 安装/held/更新/移除幂等，YAML 特殊字符、精确 marker、手写冲突、超限、未知 form 零写；skill 删除保留其它资源，section 删除保护用户正文。

### 阶段 5：实现原生插件文件安装

目标：唯一 cache+entries 路线的完整文件生命周期与诚实状态。

文件：installer/plugin-state/contracts/locations/index/messages、installer.test.ts、README。

动作：依据已交付共同前置实现 preflight→disk.run/commit(copy)→发现清单合并→held→卸载声明；按用户最新指示不以阶段 D 实机探针阻断开发。G 未实测，插件 enabled 保持未知，不提供 switches/setEnabled。只接受原生包，旧/其它清单拒绝；源副本 hash 不变。

验收：`pnpm --filter antigravity test`、`pnpm --filter antigravity typecheck`、`pnpm --filter antigravity build`；当前原生包完整收录/复制；重复安装一条 entry、版本替换不误删引用、卸载只动自身；name/version/path、源根变更、损坏清单、快照冲突、失败回滚有反例；tools.run/has/syncMarketplace 零调用。未满足前置不注册 installer，不拿其它资产完成冒充安装器完成。

### 阶段 6：验证跨仓回归与文档

目标：真实文件端口和用户可见状态一致，构建市场正确。

文件：全部测试与 README；按需 lockfile。

动作：至少一次使用真实宿主 JSONC、prompt 工具与 InstallerFiles 测试临时 IO，显式传 home/folder/userHome/library/env。覆盖未知态、源失效、越界/symlink、纯文件安装及旧格式拒写，不能只用 mock 自证。README 写清实际支持版本、专属项目技能缺口、inherits 不跟随、启停实测范围和图标归属。

验收：扩展根 `pnpm --filter antigravity test`、`pnpm --filter antigravity typecheck`、`pnpm --filter antigravity build`，再 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`；共同前置的宿主检查引用其交付结果。`git diff --check`；市场含 antigravity/图标/入口，lib 与 marketplace 生成物不提交。

### 阶段 7：验收隔离客户端并清理

目标：磁盘、Hub 与当前 Antigravity 组件发现一致。

文件：README 记录版本/结果；发现实现问题回对应文件修复并跑相关检查。

动作：沿用已证明隔离的用户与工作区；Hub 启动用既有 web build/server 工作流，自选独占端口，不占用/关闭用户服务。浏览器用 ego-browser，核对选择器、图标、中英文、Skills/MCP/Prompts/Plugins 的位置和计数、扩展注销。安装无副作用 fixture 后新会话发现 skill/rule/agent，MCP 仅受控本地 fixture；启停只有 G 已证实时操作。卸载后新会话组件消失，数据保留。

验收：逐项记“已发现/未发现/未验证”，列表一行不能代替组件。无客户端或无授权登录时保持未验证、不发布、不称完整完成。先卸测试包复查发现清单/配置，再停止自己持有 PID，最后删除独占临时目录；真实 ~/.gemini 与真实工作区零写入。用户确认完成后才归档。

## 图标

研究副本：`docs/research/agent-icons/antigravity.svg`。官方来源 `https://antigravity.google/assets/image/brand/antigravity-icon__full-color.svg`，品牌页 `https://antigravity.google/press`。5301 bytes，SHA-256 `d775965ea1f8060538c15f758a3e22487317211fcb6051333b5e023f35aa726f`，原样保存，未重绘、改色或更改 mask/filter id。

Google 产品商标，不能标为本项目原创或开源素材。README 保留来源与权属；公开分发前确认品牌使用依据，不能暗示官方背书。[品牌说明](https://partnermarketinghub.withgoogle.com/brands/google/use-cases/product-co-branding/)。

## 不做与自审

不做旧客户端、Gemini extension/commands/workflows、旧清单/路径别名/远程键兼容或自动迁移；不改真实配置、不复制凭证、不运行包脚本/依赖安装、不做 CLI 回退、payload overlay、独立 hooks、云账号或自动市场发布。

图标、target/locale、唯一 global skills、两个 MCP 位置、四种 global prompt forms 与 workspace rule、原生 cache+entries 插件生命周期已实现；卸载保留缓存。2026-11-03 本包 `typecheck`、`test`（3 files / 7 tests）、`build`（25.8 KiB）及 ESLint、diff --check 通过，真实宿主临时 IO 包含源快照与目标缓存改动拒绝。客户端实机、资源 HTTP 路由、浅深主题、全仓市场构建由用户或统一集成阶段核对，未声称通过。
