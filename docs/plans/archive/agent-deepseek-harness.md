# 接入 DeepSeek Harness

状态：待审批。日期：2026-11-03。本轮只形成独立实施计划并下载官方图标；不执行下述开发，不安装依赖、不改客户端配置、不启动服务、不提交 Git。**本次必须交付 Skills、指令和 MCP 的安装、读取、卸载及声明启停；阶段一至六全部属于本次范围，MCP 不是可选后续或只读能力。** 原生 bundle 的路线保留在阶段七、八，未闭合的依赖写协议另行列明。复杂性、缺少本机客户端或未做真机验证不能成为静默删除能力的理由。计划只有用户确认完成后才归档。

实施仓库：`D:/work-space/context-hub-extensions`。宿主参考仓库：`D:/work-space/dsh-context-hub`。下文 `plugins/` 均位于扩展仓库，`packages/` 位于宿主仓库。

## 目标与版本证据

目标是 DeepSeek AI 官方的 **DeepSeek Harness（dsh）**，包含官方桌面程序及 CLI 启动的本地 Web，不是 DeepSeek 模型 API，也不采用第三方同名壳的协议。官网原文为 “Run me as a desktop app or launch the web UI from code”。

2026-11-03 查询官方 npm registry：`latest`、`next` 为 `0.2.1-rc.5`，`alpha` 为 `0.2.2-alpha.2`。本计划以 **0.2.1-rc.5 的默认文件协议**为基线，不兼容旧版、不跟随 alpha 新增能力。已只读下载并核对同版本的 `@deepseek-ai/dsh-skill-filesystem`、`@deepseek-ai/dsh-agent-instructions`、`@deepseek-ai/dsh-mcp-client` 发布包 README，与以下官方文档吻合。没有执行这些包。

| 官方来源 | 已核实事实与原文短引 |
| --- | --- |
| https://www.deepseek.com/en/harness/ | 官方产品身份、桌面/Web 两种载体；“Run me as a desktop app or launch the web UI from code”。 |
| https://registry.npmjs.org/%40deepseek-ai%2Fdsh | `dist-tags.latest` 为 `0.2.1-rc.5`；不要把 alpha 当 latest。 |
| https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md | “THERE WILL BE COMPATIBILITY-BREAKING CHANGES.”；仍为 developer preview。 |
| https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill-filesystem/README.md | “Default roots are scanned in this provider's rank order”；项目 `.dsh/skills`、`.agents/skills`，custom，用户 `<dshHome>/skills`、`<agentsHome>/skills`。支持目录 `SKILL.md` 或顶层 `<name>.md`；目录扫描只有一层。 |
| https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/context/agent-instructions/README.md | “user-global chain — `$DSH_HOME/AGENTS.md`, then `<agentsHome>/AGENTS.md`”；项目基础候选 `AGENTS.md`、`CLAUDE.md`，附加 `AGENTS.local.md`、`CLAUDE.local.md`。 |
| https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/util/home-paths/README.md | 默认根为 `~/.dsh`、`~/.agents`，分别可由 `DSH_HOME`、`DSH_AGENTS_HOME` 改写。 |
| https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/mcp-memory.md | MCP 持久化使用 `$DSH_HOME/profiles/<name>/cordis.patch.yml` 或 `$DSH_HOME/cordis.patch.yml`，显式 `--patch` 也可加载；不是 mcpServers JSON 文件。 |
| https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md | 每 server 一个 Cordis 插件行；`config.serverName`、`transport: stdio`（command/args/env/cwd）或 `streamable-http`（url/headers）。 |
| https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md | “A bundle is an npm package that ships a configuration layer”；`package.json` 的 `dsh.bundle.patch` 绑定配置层，profile 的 `dependencies`、`dsh.profile.bundles` 管理依赖和选择。 |
| https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md | `dsh plugin --profile <name> <pnpm args>` 转发包管理操作；不据此臆造 `enable/disable` CLI。 |

以上是官方文档或官方发布包证据。未采用第三方下载站、博客的版本与路径。master 文档可能继续变化；开发时保留本计划的发布版基线，更新目标版本需显式说明差异。

## 真实宿主契约与首版范围

### 参考实现

- `plugins/claude.code/src/index.tsx:apply` 展示六类服务注册；本扩展本次使用 skills/prompts/mcp/targets/locales 五类服务，插件安装器由阶段七、八单独说明。
- `plugins/opencode/src/index.tsx:apply`、`locations.ts`、`prompts.ts:createOpenCodePrompts` 展示独立资产扩展、路径常量和全局指令标记段管理。复用其模式，不抽取跨产品 helper、不改旧扩展。
- `packages/resources/skills/src/provider.ts:SkillPlace` 只有 `scope` 与相对 `dir`；`readablePlaces` 根据 target id 过滤。`extension.ts:SHARED_PLACE` 仅覆盖 **workspace** `.agents/skills`，不覆盖 global `~/.agents/skills`。
- `packages/resources/prompts/src/provider.ts:PromptProvider` 的 `held/install/remove` 可处理指令段；`workspace-provider.ts:workspacePromptProvider` 已有项目 `AGENTS.md` 的 instructions/agents 操作。
- `packages/resources/prompts/src/toolkit.ts:promptTools` 提供 `slugOf/withSection/withoutSection`。`instruction.ts` 对未闭合标记会处理到文件末尾，因此扩展必须像 OpenCode provider 一样先拒绝损坏标记，避免吞掉手写正文。
- `packages/core/src/host/place-files.ts:createFsPlaceFiles` 的普通文件根仅有 workspace/global（用户 home）；插件 `PluginDiskDeclaration.homeEnv` 不能推导为普通资产的环境根能力。
- `packages/extensions/src/types.ts:AgentAssetKind` 只有 `skill | mcp | memory | hook | agent`；本次最终 `supports` 为 `['skill', 'memory', 'mcp']`，不添加 prompt/plugin 枚举。
- `packages/resources/mcp/src/toolkit.ts:McpTools` 当前只有 JSONC/TOML 编辑器。阶段五补齐安全 YAML/位置访问通用能力，阶段六实现并注册可安装的 MCP provider，二者是本次交付必需依赖。
- `packages/resources/plugins/src/provider.ts:PluginDiskDeclaration.directories` 已允许目录模板，不能再以“文件端口只支持 cache 四段”作为阻断理由；但 DSH npm bundle 的依赖解析、profile 选择和加载语义仍未被本首版覆盖。

### 能力表

| 注入点 | 本次必须交付的行为 | 边界 |
| --- | --- | --- |
| skills | 注册 workspace `.dsh/skills` 与 global `.dsh/skills` 两个位置，provider id 与 target 一致。 | 不新增 global `.agents/skills`，不交付 flat skill 文件；项目 `.agents/skills` 复用宿主现有位置。默认物理目录的局限见下文。 |
| prompts | 管理 global `.dsh/AGENTS.md` 的 Hub 标记段；项目 `AGENTS.md` 复用共享 instructions/agents 操作。 | 不创建 `.dsh/commands`、rules、agents 或私有 prompt 目录；不接管项目/嵌套 CLAUDE/local 指令；不写 `~/.agents/AGENTS.md`。 |
| mcp | **必须注入并注册可写 provider。** 默认向 `<DSH_HOME>/cordis.patch.yml` 新安装，stdio/streamable HTTP 可安装、读取、卸载、字面量 disabled 启停和定位；扫描已有 profile patch，展示并管理安全可识别的原声明。 | 只有 home patch 是新安装入口；profile patch 的 `installable:false` 不妨碍原声明安全启停/移除。profile 不是 workspace。复杂表达式/歧义节点拒写，不生成伪 JSON。 |
| plugins | 阶段七、八保留原生 bundle 收录、profile 目的地和依赖准备路线。 | 原生 npm 依赖写协议未闭合，不把它作为 MCP 延后的理由，不把资产/任意 npm 包冒认为 DSH bundle。 |
| targets | `hub.target.deepseek-harness`，展示 DeepSeek Harness，最终 supports 为 skill/memory/mcp，locations 与实际管理文件相符。 | MCP 声明启用不等同客户端连接成功；不把 bundle 未来能力写成已实现。 |
| locales | 注册 en 与 zh-CN 文案，键使用 `deepseekHarness.*`。 | 不改其他扩展的语言表。 |

首版交付目录式 `<name>/SKILL.md`，写入的技能需有有效的 kebab-case name、description，复用宿主现有技能流程。DSH 的 flat `<name>.md` 是当前原生能力，但不在现有 Hub 技能目录交付范围；这是覆盖限制，不是旧版兼容。

Skills 与指令位置仍相对用户 home 的 `.dsh`；自定义根的覆盖以阶段五共享契约实际接入为准，未接入的资源必须在 README 如实列明。**MCP 本次通过阶段五的声明根支持 `DSH_HOME`，默认 fallback 为 `~/.dsh`**，不会把环境变量名拼成字面目录，也不读取任意环境变量。项目根方面，DSH 自行取最近 `.git` 祖先，Hub 写入当前所选工作区；README 要明确选择仓库根以对应默认发现规则，不自动爬祖先。此仓库根规则不改变 MCP 的 home/profile global 作用域。

**本次验收截止阶段六，必须包含 MCP 安装，不能以阶段一至四结束任务。** 阶段一至四仅为可运行的中间检查点；阶段五是必需共享宿主能力，阶段六是可写 MCP 交付及最终验收。阶段七、八保留 bundle 具体路线和已知未决写协议，不能与本次已确定的 MCP 范围混淆。公共文件由通用宿主负责人协调，再由本产品 Agent 实现适配；宿主不得硬编码 DSH 路径、模块名或 YAML 行语义。

## 官方图标与品牌限制

图标已于 2026-11-03 原样下载到：

`D:/work-space/dsh-context-hub/docs/research/agent-icons/deepseek-harness.svg`

- 来源为官方仓库桌面资源 `apps/desktop/resources/icon.svg`，固定到 commit `ce7073d51254c26cd63b22a60835b8f948deb447`。
- 原始下载 URL：https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/ce7073d51254c26cd63b22a60835b8f948deb447/apps/desktop/resources/icon.svg
- 浏览 URL：https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/apps/desktop/resources/icon.svg
- 格式：SVG；原始 width/height：1104 × 1104；字节数：**7281**。
- SHA-256：`0458ed5e4825846a6560e90d3e4de767cd75842f7eb53539dc87a5db380d9146`。
- Git blob SHA-1：`ae3e8c2c2cc8ad04a5ecd3c367d0dfbae10f5b1b`；下载字节已与 GitHub API 提供的 blob SHA 核对。未重绘、裁剪、压缩或转换，使用排他创建避免覆盖已有文件。
- 官方 [BRAND_GUIDELINES.md](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/BRAND_GUIDELINES.md) 允许准确描述兼容关系，建议项目命名用 DSH，要求避免以官方品牌物料造成授权、合作或背书错觉，并称 DeepSeek Harness 为 DeepSeek 注册商标。仓库 MIT 许可不能推导为不受限的商标授权；未找到该图标单独的版权/再分发授权条款。
- 实施时原样复制到扩展 `assets/icon.svg`，以本地 `<img>` 引用；名称如需体现关系，在 README 写“适用于 DeepSeek Harness 的 Context Hub 资产集成”，不称官方出品。README 记录 URL、摘要、上游 MIT 与品牌限制链接，并保留上游 LICENSE notice；不发明授权声明。图标使用限于准确标识目标客户端，外部正式发布前单列商标授权不确定性，不能声称已获许可。

图标为 7281 字节，满足已读 `scripts/build-marketplace.mjs` 的 SVG 与 32 KiB 上限；不需要转换格式。

## 文件、调用方与并行边界

新增文件均属于 `D:/work-space/context-hub-extensions/plugins/deepseek-harness/`：

- `package.json`、`plugin.yaml`、`build.mjs`、`tsconfig.json`、`vitest.config.ts`：独立包构建与注册，参考 OpenCode 当前配置。
- `src/contracts.ts`：镜像 skills/prompts/mcp/targets/locales 实际使用类型，阶段五、六同步真实新增通用契约；运行时从 context 取服务，不导入宿主包，尚未实现 bundle 时不复制 PluginDisk 合约。
- `src/locations.ts`：统一导出 `DEEPSEEK_HARNESS_ID`、`.dsh/skills`、`.dsh/AGENTS.md`、supports、管理路径描述。
- `src/index.tsx`：导出 `apply`，最终注册 skills/prompts/mcp/targets/locales 五类服务；渲染官方图标，透传 className/aria-hidden，隐藏时 alt 为空。
- `src/prompts.ts`：导出 `createDeepSeekHarnessPrompts`，只实现全局 instructions 的 held/install/remove。
- `src/messages.ts`：双语位置名、指令菜单与精确错误键。
- `assets/icon.svg`、`assets/LICENSE.deepseek-harness.txt`、`README.md`：原始图标、上游 MIT notice、范围与品牌说明。
- `__test__/index.test.ts`、`__test__/prompts.test.ts`、`__test__/host.test.ts`、`__test__/react-jsx.ts`：注册、核心读写、真实宿主接口与 JSX stub。

调用方由既有服务接入：skills 目录列表及计数、prompts 交付菜单、targets 目录说明、locales 字符串。无需修改宿主页面、barrel、核心 API。扩展仓 `pnpm-workspace.yaml` 已发现 `plugins/*`；`scripts/build-marketplace.mjs` 自动读取新目录，**不手改 marketplace.json**。

六个产品可以并行开发，每个专属 Agent 仅改自己的扩展目录，主 Agent 只调度。root lockfile、市场生成文件以及宿主公共文件由共享集成负责人统一处理，避免并行写入冲突。本产品阶段一至四的资源实现可与阶段五的通用宿主改动并行，阶段六依赖后者；MCP 仍是本次必交付项，公共契约复杂不等于从范围删除。不要沿用过去任务中“严格串行”的经验作为本轮默认。

## 实施阶段

审批通过后、动源码前，为**本次必须完成的阶段一至六**各建一个 TaskCreate，阶段四仅中间检查，阶段六通过才可报告本次交付完成。阶段七、八为原生 bundle 的具体路线，按其审批与协议闭合状态另行安排。开始阶段用 TaskUpdate 标记 in_progress，达到验收后立即 completed；不预注册尚未实现的 provider，每阶段保持可构建。

### 阶段一：建立独立扩展包

目标：建立可构建且只声明资产能力的包，不提前承诺写入功能。

文件：新增 package.json、plugin.yaml、build.mjs、tsconfig.json、vitest.config.ts、src/contracts.ts、src/locations.ts、src/messages.ts、src/index.tsx、assets/、README.md、__test__/index.test.ts、__test__/react-jsx.ts。

动作：

1. 包名及 manifest id 为 `deepseek-harness`，初始扩展版本 `0.1.0`；构建输出与 main 为 `lib/index.js`。React/runtime external 方式沿用 OpenCode，不加生产依赖。开发工具版本沿用当前参考包，不猜最新版。
2. scripts 采用当前参考实现的 `build: node build.mjs`、`test: vitest run`、`typecheck: tsc --noEmit`。`plugin.yaml` 不写 version/entry，category 为 agent，权限为 assets.read/assets.write/filesystem，初始 inject 只列实际注册的 targets/locales。
3. `engines.contextHub` 采用已读参考扩展的 `>=0.2.0 <0.7.0`，仅表达宿主 API 基线，不能当客户端版本约束；本轮不引入未发布 API。
4. 复制已核验图标字节，保存上游 LICENSE 原文 notice；名称/文案明确资产集成。target 的支持项随实现阶段增加：本阶段未交付 skills/prompts 时不预报完成能力。

验收（在扩展仓）：`pnpm --filter deepseek-harness typecheck`、`pnpm --filter deepseek-harness test`、`pnpm --filter deepseek-harness build`。注册测试检查 target id、双语键、图标 URL、原始图标 SHA-256、清单 identity/main/inject 与 README 一致。不得通过只有转发 pnpm 命令而无客户端加载证据宣称已支持 bundle。

### 阶段二：注册两处技能目录

目标：把两处原生默认目录接入宿主技能交付、扫描和计数。

文件：修改 src/index.tsx、locations.ts、contracts.ts、messages.ts、plugin.yaml、README.md、__test__/index.test.ts；新增 __test__/host.test.ts 的 skills 用例。

动作：

1. SkillProvider id 为 `hub.target.deepseek-harness`，不设 shared；workspace place id 为 `deepseek-harness`，global 为 `deepseek-harness-global`。dir 均为 `.dsh/skills`，scope 分别 workspace/global，order 沿用 20，labelKey 为 `deepseekHarness.tab`。
2. inject 加 skills，apply 调 `ctx.skills.register`。target supports 增加 skill，并展示两处受管理位置和宿主共享项目 `.agents/skills`；README 单列全局共享目录、flat 文件、环境覆盖等不支持项。
3. 不注册 workspace `.agents/skills`、global `.agents/skills` 或 `.claude/skills`；不增加私有磁盘逻辑。宿主现有安装/移除路径承担目录技能的文件操作。

验收：运行本包 typecheck/test/build。内存注册测试断言恰好两个 native places、唯一 id、scope 不混淆、没有重复共享路径；通过真实 `readablePlaces` 验证 target 未选时不读取这两处、选中后出现两处且项目共享目录只有一处。host 测试用临时 home/workspace 的有代表性 SKILL.md 验证各自扫描/移除，不读真实用户目录；只覆盖本轮受管理目录，不声称扫描了 DSH flat 或 `.system` 特例。

### 阶段三：实现全局指令标记段

目标：让 prompt 通过 `.dsh/AGENTS.md` 持久交付，保留用户正文。

文件：新增 src/prompts.ts、__test__/prompts.test.ts；修改 contracts.ts、index.tsx、plugin.yaml、messages.ts、README.md 和 host.test.ts。

动作：

1. PromptProvider id 同 target，唯一 place `deepseek-harness-global`、scope global、where `~/.dsh`、order 20，唯一 form 为 instructions（无 option），路径固定 `.dsh/AGENTS.md`。设置 generatedOnly，避免 UI 提供不存在的“原始 prompt 文件”安装动作。
2. 使用传入工具 `slugOf` 产生段名，`withSection` 写入、`withoutSection` 移除；不重新实现正文归一化。先校验 place/form/option，只接受声明的单一路径，拒绝未知操作。
3. 同一 slug 的开/闭标记缺失、顺序错误或重复时，held/install/remove 统一拒绝，不让 toolkit 吞掉尾部用户正文。正常 held 根据完整标记段判断；首次添加、更新已有段、重复安装保持幂等。仅持有该段时 remove 可删除空文件；仍有正文时保存剩余正文。读写异常包装为本扩展 PromptError 并携带文件路径，不隐藏失败。
4. inject 加 prompts，此中间阶段 target supports 为 skill/memory，阶段六再加入必需的 mcp。项目 AGENTS.md 已由 shared provider 提供，不重复注册；不因此声称 workspace shared 的 DESIGN.md/commands/rules 被 DSH 识别。

验收：运行本包 typecheck/test/build；用当前真实 promptTools 测试缺文件、纯手写文件、已有多段、重复安装、更新、删除、自有段之外内容保留、CRLF、不完整/重复/反序 marker、未知 form/place/option、I/O 错误。按 toolkit 实际行为核对正文与换行，不虚报其 BOM/尾部空白为完全字节不变；坏标记文件必须整文件保持不变。确认绝不创建 commands/rules/agents 目录或改项目 AGENTS.md。

### 阶段四：检查资产中间状态

目标：验证资源部分可构建，为必需阶段五、六准备集成 fixture；此阶段不构成本次完成验收。

文件：完善 __test__/host.test.ts、README.md 与本扩展必要测试；仅修复本产品引入的问题。公共集成脚本由共享集成负责人运行，不改其他 Agent 目录。

动作与验收：

1. host.test.ts 参考 OpenCode 同名测试，通过显式绝对 `CONTEXT_HUB_CHECKOUT` 导入 `packages/resources/prompts/src/toolkit.ts`、`packages/core/src/host/place-files.ts`、`packages/resources/skills/src/{provider.ts,library.ts}`、`packages/resources/skills/src/host/skills-fs.ts`。fixtures 全部在测试临时根，结束清理。未设置 checkout 则明确 skipped；本地设置后必须实际跑，错误路径要失败而非静默跳过。
2. 扩展仓执行：

   ```sh
   pnpm --filter deepseek-harness typecheck
   pnpm --filter deepseek-harness test
   CONTEXT_HUB_CHECKOUT=D:/work-space/dsh-context-hub pnpm --filter deepseek-harness test __test__/host.test.ts
   pnpm --filter deepseek-harness build
   ```

3. 此中间点运行本包脚本并核对图标/清单；共享集成负责人在阶段六完成后执行扩展仓现有 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`（含 build:marketplace）。最终索引须包含 deepseek-harness、正确来源和有效 SVG data URL，inject 必须含 mcp，target.supports 必须含 mcp；尚未实现的 plugins 安装器不得预注册。若其他并行包失败，归属报告清楚，只修本包。
4. README 写清目标客户端基线、可管理默认目录、共享项目入口、未覆盖环境根/flat/root discovery/profile、官方来源与图标限制、安装后实际加载由用户调试。真实客户端、额外隔离客户端实例及独立验收都不是开发阻断；上述临时目录宿主单测不等于已在 DSH 中加载。
5. 检查自己的 diff，清理自己产生的未用 import/文件，不改现有无关代码、运行服务、客户端目录。源码范围仅扩展目录；不手改生成物、不提交。宿主源码未改则不调用 AOCI 维护；文档和研究图标不作为源码索引更新理由。

阶段通过条件：本包资源检查通过，设置 checkout 的 host 测试确实执行，所有跳过与未运行项如实列出；随后继续阶段五、六，不能结束为“仅资产完成”。真实 DSH 没安装不阻断 MCP 实现与文件写入验收，最终报告不得据此虚称已连接/加载。

## 必需的 MCP 实施及原生 bundle 路线

MCP 是本次必交付能力，阶段五、六不是未来可选项。原生 bundle 是另一项官方真实能力，阶段七、八保留具体路线及未决协议，不能因此延后已确定的 MCP 实现。下列 API 名与字段若未注明“现有”，均为**拟新增的通用契约**，审批后需先实现再消费，不能宣传为宿主已存在。

### 官方源码补证与具体缺口

除前述文档，已进一步只读核对固定 commit `ce7073d51254c26cd63b22a60835b8f948deb447` 的源码：

- [app-boot/src/profile.ts](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/boot/app-boot/src/profile.ts)：`bundlePatchFiles` 接受单路径或有序路径数组；profile 初始化创建 package.json、cordis.patch.yml、pnpm-workspace.yaml，pnpm 为 hoisted、autoInstallPeers:false；`resolveBundleDir` 先查安装提供的包、再查 profile 安装。不能仅见 profile dependency 就判其生效，也不能用本地目录覆盖安装自身提供的同名 bundle。
- [plugin-manager/src/patch.ts](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/boot/plugin-manager/src/patch.ts)：`writePluginEnabled` 用 YAML Document 编辑最后一个匹配 id/name 的 override；仅写 `disabled`，必要时追加 `{id, disabled}`，有 alias/anchor 时不能随意删 override。读取 `!!js` 时只解析其文本，不执行。此为**单条插件行启停**。
- [plugin-manager/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/boot/plugin-manager/README.md)：**bundle 整包启停**改变 package.json 的 `dsh.profile.bundles` 有序选择，禁用不移除 dependency，启用追加到末尾；不要把它与上述 `disabled` 混成同一开关。
- [plugin-manager/src/operations.ts](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/boot/plugin-manager/src/operations.ts)：官方依赖安装由 pnpm 处理，并在 profile 锁内做 manifest/lockfile 保护、选择 reconciliation、版本兼容检查；失败或启动失败不都能等同“完全未安装”。普通复制目录不具备这些行为。

这几处源码基于 master 的固定 commit；阶段五、六开发时须与目标 **0.2.1-rc.5 的对应发布包源码**交叉，建立只读 fixture。两者不同则以发布基线为准记录差异，不做旧版双分支；源码比对不要求安装客户端或启动运行时。MCP 的 home/profile patch 与 transport 形状已由发布版 README 确认，当前没有“等待真实客户端后再决定是否开发”的前置。

### 阶段五：补充通用文件根与 YAML 编辑能力

目标：本次必须补齐供阶段六使用的声明根、受限 profile 枚举、YAML 编辑与状态契约；阶段结束后既有客户端行为保持不变。此阶段可以由通用宿主专属 Agent 并行实现，但不能从本次依赖清单删掉。

**文件与拟新增契约**：

1. `packages/core/src/place-files.ts`、`host/place-files.ts`、`packages/core/handlers.ts` 与 `/hub/place-files` 的远程消费端、对应 `__test__/place-files.test.ts`：给普通 `PlaceRef` 提供可选、声明式 client root（home-relative fallback、允许的环境变量名），新增受限目录枚举与展示路径能力。当前 readPlaceCall 会剥离未知字段，必须同步扩展 wire 校验与序列化，不然声明无法到达宿主。实施前搜索 `PLACE_FILES_ROUTE/createFsPlaceFiles/readPlaceCall` 的所有引用，补齐 Web/Desktop/开发桥和 mock。宿主解析绝对根、目录边界与 symlink，向浏览器只返回根内结果；不返回任意环境变量或密钥。既有无 root 的 home/workspace 行为不变。`SkillPlace`、`PromptRef` 若接该根能力，在同阶段更新各自序列化与读写调用方，不能只改类型。另新增可选 expected-before commit 原语：同一操作捕获 root/旧文本，持有通用文件 lease，在原子替换前复核根和文本，不匹配即冲突；不能把当前无 before 条件的 PlaceFiles.write 宣称为 CAS。没有新端口的旧宿主对新 mutation 明确报不支持，不退回无保护写入；不承诺能与不遵循相同锁的任意外部编辑器实现严格线性化。
2. 拟新增 `PlaceFiles.list`（受声明根/目录白名单限制）供扩展枚举 `profiles/*/package.json`；profile 必须由真实 manifest 的 `dsh.profile.bundles` 证实，不能仅见同名目录就提供写入口。MCP/provider 动态位置采用可选 `placesFor(io)`，旧 provider 继续用静态 places。`McpService`/`catalog.ts:placesOf`、`scanPlaces`、`library-store.ts` 和所有 `provider.places` 消费处统一用解析后的同一位置快照，原文、locate、安装和删除都指向同一物理文件。profile 在操作中消失或被换根时拒绝，不能退回 web。
3. 拟新增通用 `McpYamlTools`（语义中立的 Document/CST 读取、节点范围定位、受控 splice；core 提供基础编辑并在 MCP toolkit 暴露），新增 `packages/core/src/yaml-document.ts`、`packages/core/__test__/yaml-document.test.ts`、`packages/resources/mcp/src/yaml.ts`、`packages/resources/mcp/__test__/yaml.test.ts`，修改 core/package.json 的公共 export、MCP toolkit.ts/contract.ts 的类型与值导出。新增字段必须通过 `ctx.mcp.tools` 到达已安装扩展，不能要求它运行时直接导入宿主源码。宿主不含 `dsh-mcp-client`、profiles、serverName 等产品判断，行识别留在扩展。
4. 现有 core 的 js-yaml 适合解析值，不能满足评论/标签/原文范围编辑。建议引入 **yaml** 到拥有 Document 工具的包，不在每个扩展 bundle parser；版本在实施时查官方发布信息并写入 lockfile，不猜“最新版”。已通过 Context7 核对 [yaml v2.9.1 的 Parse Options](https://github.com/eemeli/yaml/blob/v2.9.1/docs/03_options.md) 与 [Custom Tags](https://github.com/eemeli/yaml/blob/v2.9.1/docs/06_custom_tags.md)：`parseDocument` 支持 `keepSourceTokens`、node range、customTags；`!!js` resolver 仅返回字符串并保留 tag。此工具不调用 eval、Function 或上游执行型 overlay loader。
5. 不把 `String(document)` 当作全文件无损保证：用节点范围替换所拥有字段/行，保留前后原文，并在编辑后重解析检查结构和目标之外字节。遇到目标节点被 alias/merge 共享、重复键、多文档、无法证明边界的未知标签，拒绝修改并保留原文件；未编辑的 `!!js` 原文不得去标签或求值。注释、flow/block scalar、CRLF、指令和 anchor 都要有反例 fixture。
6. `McpEntry` 拟增 `readOnly?: boolean` 与未知开关表达（选定 `enabled: boolean | null`，null 明确表示未知，不用 undefined 伪装 true）；既有 boolean 值仍兼容。同步 `packages/resources/mcp/src/types.ts:McpInstall`、catalog.ts 的 scan/merge、library.ts/library-store.ts、详情与开关组件、hooks/action dispatch 及对应 fixture/mock，搜索 `.enabled`/`setEnabled` 全部消费者后逐项改。声明为 readOnly 或 enabled:null 的条目保留路径、原文、定位与诊断，但禁用写动作；正常 literal 条目安装/启停/移除必须可用，不能把整个 provider 降级为只读。宿主未知状态只是通用表示，判断 !!js 或 override 的产品语义留在扩展。

**验收**：复用已有测试入口，在宿主根执行 `pnpm test packages/core/__test__/place-files.test.ts packages/resources/mcp/__test__/mcp-tools.test.ts packages/resources/mcp/__test__/mcp.test.ts packages/resources/mcp/__test__/install-places.test.ts`，新增 YAML/root 测试随包 suite 运行；执行 `pnpm --filter @context-hub/core typecheck`、`pnpm --filter @context-hub/mcp typecheck`。覆盖默认根/绝对环境根/空值 fallback、越界/相对环境根/敏感变量拒绝、profile 枚举失败、未知状态不触发 mutation、YAML 目标外 bytes 不变与 `!!js` 零执行。测试中用抛错 getter/计数器证明未执行表达式，不能靠肉眼看字符串。

**依赖**：通用负责人独占这些共享文件和 lockfile；本产品对照真实接口更新 contracts.ts。该阶段可与其他产品私有开发并行，完成前不注册尚未存在的 MCP 动态位置；但阶段六仍是本次必须完成的下游。新宿主 API 可先在源码 checkout 开发和验证，不以“尚未发布”阻断开发；正式市场发布时 `engines.contextHub` 必须绑定实际包含这些 API 的宿主版本，不能沿用阶段一旧范围冒充兼容。

### 阶段六：实现 DSH MCP 配置管理

目标：在已证实的 home/profile YAML patch 中完成 read、install、uninstall、setEnabled、locate；不混淆文件声明与最终组合状态。

文件：本扩展新增 `src/mcp.ts`、`__test__/mcp.test.ts` 与 YAML fixtures，修改 contracts.ts、index.tsx、locations.ts、messages.ts、plugin.yaml、README.md 和 host.test.ts。

**具体读写方案**：

1. 依赖阶段五。MCP 根由宿主按声明 `.dsh` / DSH_HOME 解析并捕获。**唯一新安装入口确定为 `<DSH_HOME>/cordis.patch.yml`，默认即 `~/.dsh/cordis.patch.yml`**；官方明确此 home 层作用于全部 profile。该文件缺失时创建有效 YAML patch 序列，不要求用户先启动 DSH；文件存在且不安全时拒写，不能另造 JSON 或绕写其他文件。已初始化 profile 的 `profiles/<name>/cordis.patch.yml` 全部扫描，但 `installable:false`，不出现在新安装菜单；已有安全声明仍可在原文件启停/移除。所有 MCP places 的物理 scope 都是 global，不注册 workspace place，不自动创建/reset profile，不猜 desktop/web 是当前运行项。

   | MCP place | 文件（相对捕获的 DSH root） | 新安装 | 读取与现有声明操作 |
   | --- | --- | --- | --- |
   | `deepseek-harness-home` | `cordis.patch.yml` | `installable:true`，唯一入口 | 静态安全条目可读、更新、卸载、启停、locate。 |
   | `deepseek-harness-profile-<stable-id>` | `profiles/<实际profile>/cordis.patch.yml` | `installable:false` | 根据 manifest 枚举，保持实际 profile 标签；安全条目原位启停/移除，复杂项只显示未知及诊断。 |

   修改 home 层前预检扫描文件中的 literal serverName/id：同名已在任一 profile 存在时返回冲突并指出文件，避免 home 再插入一次造成 Cordis 同 scope 重复注册。id 已占用、MCP 相关 name/serverName/config 由表达式生成无法判重，或同文件 override 链不明确时拒写；无关模块中的 !!js 不影响其原文保留。扫描范围是这两类 patch 文件，**不声称已枚举上游 bundle/运行时 `--patch` 带来的全部有效配置**；它们可能影响最终组合，所以页面表示“本文件声明”，不表示最终连接状态。
2. 官方形状示例（写入单个 literal `insert` 行；此示例是实际协议，不是拟新增 JSON）：

   ```yaml
   - insert:
       - id: context-hub-mcp-example
         name: '@deepseek-ai/dsh-mcp-client'
         config:
           serverName: example
           transport: stdio
           command: example-mcp
           args: []
           env: {}
   ```

   HTTP 映射为 `transport: streamable-http`、url、headers；SSE 单独 transport 不获该客户端文档支持，明确拒绝并不写文件。serverName 必须符合 `[A-Za-z0-9_-]{1,32}`，不静默改名；id 用固定前缀加稳定摘要，名称相同幂等，不以用户输入拼路径。
3. `read` 解析本文件 literal insert 中模块名匹配的 MCP 行，使用 config.serverName 作为 Hub 名称，disabled 缺省为 false；静态 stdio/http 映射到 McpDeclaration。标记为 `!!js` 的 config、disabled、name、serverName 不求值；可定位但不能静态理解的条目显示未知/客户端管理。相同 serverName 多条或同 id 覆盖链不明确时报冲突，不能挑一条偷偷改。不能把 base bundle 带来的 server 假装成这份 patch 文件声明。
4. `install` 必须在 home place 完成新增，并可更新当前文件中已确认唯一的 literal 行；profile place 只允许更新已有可写行，若不存在目标则明确报“此位置仅扫描，不接受新安装”，不能绕过 installable。替换同名 server 的 owned transport 字段时保留 disabled、未知 options、timeout、cwd、comments，并删除另一个 transport 独有字段。stdio 写 command/args/env；HTTP 写 url/headers，映射 `McpDeclaration.transport:http` 到 DSH `streamable-http`。当前 Hub 声明不含 cwd，新建时省略采用 DSH 默认，更新 stdio 时原值保留；转 HTTP 后移除 stdio-only cwd。目标 owned 字段带 !!js 时拒写，不把表达式转成字符串。新增 insert patch 追加，不改既有 group 的 Cordis scope；nested group 或复杂 override 保留为只读诊断，不扁平化、不移动到顶层扩大权限。
5. `setEnabled` 只改变同一可写 declaration 的 literal `disabled`：enabled=true 对应 false、enabled=false 对应 true；缺省 disabled 为 false，表达式状态为 unknown，不自动执行或覆盖。它不执行 profile composer，不把 home/profile 最终组合状态写成文件开关。`uninstall` 只删明确目标行；insert 变空时可删空块但保留相邻注释与其他配置，不删整个文件里的用户内容。已存在非 Hub 手写行仅在唯一且结构安全时允许显式采用，歧义、alias 或表达式控制拒绝；用户移除行后重试同操作是幂等无变更。`locate` 返回真实声明节点的 1-based 行号。未声明、声明关闭、声明开启、状态未知、读取失败五种状态必须区别展示，读取失败不能当未安装。
6. 操作读取最新文本并使用通用快照比对/原子写；并发修改导致失败后不覆盖。完成后 inject 加 mcp，target supports 加 mcp；README 说明 HMR/重启取决于运行 profile，本扩展只保证配置交付，不声称连接成功。

**验收（本次必过）**：在扩展仓执行 `pnpm --filter deepseek-harness typecheck`、`pnpm --filter deepseek-harness test`、`pnpm --filter deepseek-harness build` 和 `CONTEXT_HUB_CHECKOUT=D:/work-space/dsh-context-hub pnpm --filter deepseek-harness test __test__/host.test.ts`。host.test 必须用真实宿主 YAML 工具与文件端口向临时 home 写出至少一条 stdio 和一条 HTTP 声明，重读、关/开、切换 transport、卸载后复核文件；仅断言注册或 parser 能读不算“支持安装”。

fixture 必须覆盖：文件缺失首次创建、两个 profile 扫描不重复且 installable:false、唯一 home 新安装菜单、stdio/streamable-http/不支持 SSE、用户注释与未知 timeout 保留、无关 !!js 原文字节不变且零执行、目标字段 !!js 拒写、重复名/id/override 歧义、nested group/alias/merge/multi-doc 拒写、同名幂等、scope 假称 workspace 拒绝、locate 行号、unknown/readOnly UI、profile 列表变动、home 与 profile 同名冲突、写前快照冲突及失败不覆盖。网络不参与此安装验收。

**本次完成判据**：阶段一至六通过；plugin.yaml 的 inject 包含 skills/prompts/mcp/targets/locales，apply 实际注册五类服务，target supports 包含 mcp；真实宿主端口完成“写入→重读→关闭→开启→卸载”文件闭环；共享宿主全量 lint/typecheck/test/build 和扩展市场构建通过。若共享检查受其他 Agent 改动影响，报告归属并由主 Agent 调度修复，不能删除 MCP 来通过检查。只有复杂/不安全条目按条拒写，不能用“全 provider 只读”作为通过条件。客户端未安装、未启动、未连外部 server 均不阻断上述实现与测试；最终报告明确未验证真实连接，不把该限制误写成未开发 MCP。

### 阶段七：扩展原生清单与 profile 安装目标契约

目标：让 Hub 能诚实收录 DSH bundle，并区分同一物理 user scope 下多个 profile，保留已有插件工作流。

**宿主文件与拟新增通用契约**：

1. `packages/resources/plugins/src/{provider.ts,contract.ts}`、`host/describe.ts`、`host/contents.ts`、`add-plugin-dialog.tsx`、相关 host 收录/更新路径：保留现有 `registerManifests(paths)`，新增结构化 manifest 规则（例如 file、必要 JSON 路径、值类型/非空数组条件），DSH 扩展声明 package.json 中 `dsh.bundle.patch` 为字符串或非空字符串数组，metadata 仍从 name/version/description 取。所有入口、拖入、Git/子目录/archive、本地、更新、describe 必须用同一规则；**不能只加泛用 package.json 路径，把任何 npm 包当 bundle**。
2. 当前 Hub 库名是单安全段，而 npm name 可能是 `@scope/name`。不要放宽 `assertSafeSegment` 接受 `/`。拟新增可选“库目录安全 id 与原生清单名分开”的元数据：原生 name 保留用于 profile、包路径和展示；库目录仍安全单段并有重名冲突判定。写端由宿主校验包名分解为至多 scope/name 两段，禁止任意穿越。测试同原生 name/不同目录、不同 scope 同尾名、版本更新、library copy 查找的映射。
3. 现有 PluginInstaller.places 为静态，操作只带 user/project；**不把 profile 名塞进 scopeWord 或把不同 profile 都映成同一 user**。拟新增可选 `placesFor(tools)` 与 destination/place-id 形式操作方法；旧 install(name,scope)/remove(id,scope)/setEnabled 保持。新 provider 使用唯一 place id（含 profile 标识），物理 scope 仍 global，displayLabel 为 profile 名。`PluginHeld` 各持有位置可带对应 placeId，避免仅凭 scopeWord 合并。
4. 迁移消费链：`scan.ts`、`library-store.ts:probeInstallers 结果映射`、`rows.ts`、`library.ts` 的安装/卸载/启停 action、`install-actions.tsx`、`detail-dialog.tsx`、`page.tsx` 使用同一个 resolved-place 快照并按 place.id 区分菜单/持有状态。新 install/remove/switch 的 dispatch 只传声明的 place id，未知 id 拒绝；旧 provider 无新方法仍走已有 scope 路径。`overrides` 不套用到 profile：profile 彼此独立，home patch 是运行时更高层配置，不能虚构两个 profile 互相覆盖。
5. 复用 PluginDisk 的声明根、目录模板、源/目标快照与 rollback。如 scoped package 名对应的 node_modules 目录与库名不一致，给 copy 声明增加经过 native-name 规则校验的 destination identity，而不是用 `*` 白名单绕过 name 绑定；模板/identity 保持产品无关，宿主不出现 `.dsh`、DSH_HOME 或 `dsh.bundle` 特判。对 profile node_modules 中 pnpm symlink/junction 维持现有拒绝覆盖边界，标识为外部管理，不拆链接。

**本扩展文件**：新增 `src/bundle-state.ts`、`src/installer.ts`（本阶段可先只读）、对应测试。只枚举已初始化且 manifest 结构有效的 profile，保存 dependencies、bundles、known native manifests 与实际目录三方状态：dependency 存在但目录缺失记缺失，bundle 未选中记 disabled，安装自身提供/其他包管理器拥有者不被 Hub 冒认为自管。绝不把 `disabled` 插件行开关当 bundle 选择。

**验收**：宿主运行 `pnpm test packages/resources/plugins/__test__/native-manifests.test.ts packages/resources/plugins/__test__/library.test.ts packages/resources/plugins/__test__/installer-files.test.ts packages/resources/plugins/__test__/library-store.test.ts packages/resources/plugins/__test__/rows.test.ts`，新增 destination UI/manifest predicate 测试随 suite 执行；`pnpm --filter @context-hub/plugins typecheck`。涵盖两个 profile 同名 bundle、scoped 包名、普通 npm package 不收录、必需 patch 路径缺失/越界拒绝、既有 Claude/Codex 客户端无回归、新旧方法 dispatch 不串线。通用共享改动完成后，本扩展 contracts.ts 镜像实际新增接口，engines.contextHub 发布范围须绑定真实含新 API 的版本，不沿用首批版本虚报兼容。

### 阶段八：实现原生 bundle 文件交付并验证依赖边界

目标：实现官方 bundle 身份的安装、列表、整包启停和移除；承认纯文件可交付 artifact 与需要依赖解析/构建的 npm 源包不同，后者不能悄悄调用 CLI。

**依赖**：阶段五的安全 YAML 只读检查、阶段七的清单规则/原生名/动态目的地。阶段六的 MCP provider 与此阶段可由同一产品 Agent 顺序完成；共享宿主工作由专人合并。

文件：本扩展 `src/{installer.ts,bundle-state.ts,contracts.ts,index.tsx,locations.ts,messages.ts}`、plugin.yaml、README.md、`__test__/installer.test.ts`、`__test__/bundle-state.test.ts`、host.test.ts 及本地 bundle fixtures。宿主必要变更限于上阶段批准的通用文件事务，不能顺手实现 npm 客户端。

**可实施的纯文件路线**：

1. 操作目标只允许用户明确选中的已初始化 profile，不自动重置或创建 desktop/web。从 Hub 库取得原生 bundle，校验 package.json 的 name/version/engines.dsh 或 DSH peers、dsh.bundle.patch（可多个，保持顺序）、patch 路径与必需 module/asset 文件；不执行 JS、postinstall 或 YAML `!!js`。不得把普通 skills pack 改名生成一份 DSH manifest 当作原生 bundle。
2. 可直接安装的对象为**已构建、依赖闭包已就绪的自包含 artifact**：built entry/patch/assets 都在包内，runtime imports 不要求未随包提供的新依赖，无需 lifecycle build。声明新 dependencies、native addons、未随包的 executable/build output，或依赖能否解析尚不能证明时返回“需要依赖准备”，原文件不变。能力限制按原生包逐个诊断，不能一概声称所有 DSH bundle 都不支持。
3. 采用官方 profile 自己的布局：复制 artifact 到 `profiles/<profile>/node_modules/<nativeName>`，原样保留 manifest/patch，不往复制后目录偷偷改清单。用同一 PluginDisk 事务原子更新该 profile 的 package.json：dependencies 中保留可回溯的来源/版本，dsh.profile.bundles 中追加 nativeName；其他 dependency/字段与列表顺序不变。**该来源 spec 的精确形式以及与 pnpm-lock.yaml 的一致性仍需对应发布源码确认**，不能先自造 `file:`/`link:` 记录或手工伪造 lockfile。实现阶段先用发布版只读 loader/manifest fixture 验证；未确定前可完成列表/启停和“已准备 artifact”预检，但安装写路径保持关闭，不能拿列表可见当加载完成。
4. 上述依赖记录未确定的后续路径：在固定版本源码里追踪 `anchorPathSpec/reconcile/readProfileManifest/resolveBundleDir` 与包管理器生成的 literal manifest/lockfile fixture，明确原生 spec、来源目录是否不可变、Node 查找与 pnpm 后续运行是否会重写 Hub 副本。使用仓库内现有、无执行组件的 fixture 做 parser/loader 单测，不要求启动真实客户端。若必须生成 pnpm 管理记录，则走下面的依赖准备路线，不能绕过现有只读/快照边界强行写。
5. bundle 的启停仅修改 `dsh.profile.bundles`：禁用移除选择并保留 dependency/目录，启用在末尾追加，提示其顺序会影响组合但不改变其他 bundle。不对整包写 YAML disabled；单条 Cordis 插件启停不在本轮 Hub 插件粒度，后续若提供需使用官方 patch 规则另设独立操作。
6. 移除只清理确认为 Hub 所有、源/目录/manifest 快照仍匹配的 dependency、选择和 artifact。其他 profile 不动，手工安装/安装自身提供/共享被引用包不删除；非 Hub 所有者可显示只读。任何并发变化、版本不兼容、patch 越界或 alias 歧义都停止写入；事务失败补偿并保留真实错误，不写“卸载成功”掩盖残留。当前实际运行时是否已卸载取决于 HMR/重启，结果仅报告配置操作。

**一般 npm 依赖包的完整后续路线（供本计划审批，不能当已完成）**：

- 官方可执行路径是 `dsh plugin --profile <name> add <spec>` / remove，内部 pnpm 解析依赖、hoisted 链接、build approval、锁与兼容性控制；这是已证实的安装路径，不发明独立 enable CLI。
- 既有“文件化，不暗留 CLI 回退”约束仍生效：本扩展不把该 CLI 当静默 fallback。要覆盖带外部依赖或 build script 的任意 npm 源包，需另获批准把**依赖准备**作为显式能力：在 staging 中调用官方包管理流程、禁止默认 build script，得到可校验依赖闭包/lockfile，再用通用快照事务交付；不要在用户真实 profile 上先运行再靠“恢复 JSON”假装完全回滚。选择此路线之前，还要确认 upstream 对 staging profile 可迁移性的支持（绝对 link、native addon、hoist、平台/架构不可想当然）。
- 现有 `PluginTools.run(program,args)` 已能运行命令，但 remote toolkit 不提供显式 cwd/env/cancel/staging 生命周期，host program.ts 是固定超时；如审批准许依赖准备，应扩展一个与产品无关的受限 prepare/install transaction 端口，命令参数列表、声明 cwd、限定环境、取消/输出、source hash 和 result artifact hash 都可验证。不要重做已有 run，只补其缺项；不扩散到 MCP/skills 运行命令。
- 若仍要求任意 npm 源包完全零进程/纯文件处理，则必须实现完整包依赖解析、integrity/lockfile、平台可选依赖与 native build 语义；当前代码与官方文档不足以保证，不能以本扩展小改冒充完成。此项如维持原约束，应诚实标为“外部准备依赖后才能交付”，交付 self-contained artifact 支持与明确诊断，保留这一已知能力缺口，而不是说产品没有原生插件。

**验收**：本扩展 typecheck/test/build、设置 checkout 的 host.test；宿主 plugin installer-files/manifest/destination suites。成功 fixture 至少含一个纯配置 bundle（两个 patch 文件）和一个随包 built JS 的零外部依赖 bundle；反例含普通 npm 包、未构建源码包、dependencies 未就绪、install script、runtime bundle 名冲突、scoped name、包目录被 pnpm 链接占用、两个 profile 同名、外部编辑、跨 profile 引用与失败回滚。为依赖 spec 尚未确认的路径断言“不执行写入”，不能用 mock 成功替代协议证明。可选用选定发布版本的 `resolveBundleDir/bundlePatchFiles/loadProfile` 只读结果验证 artifact 可被组成；没有真实安装时注明未加载。完整 general npm 路线未获批准或未完成时，报告准确到包类型与限制，不能把该阶段标成任意 bundle 全支持。

### 本次集成与 bundle 后续边界

本次必须完成的依赖图为 **一→二→三→四；五可并行；四与五完成后→六→最终集成验收**。MCP 是阶段六的实际安装交付，不是未来可选项；阶段一至四只能报告中间进度。原生 bundle 的阶段七、八依赖阶段五通用能力及其自身写协议闭合状态，保留路线但与本次 MCP 完成条件分开。公共契约由主 Agent 调度专人开发，不能让六产品各写一套。

共享代码影响公共 API、解析/写入及构建依赖，除最小包检查外，本次最终在宿主运行已有 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`；在扩展仓运行同名全量脚本及显式 host.test。UI 新增 profile 扫描位置与未知开关状态，实施阶段按项目要求使用 ego-browser 检查可见流程；没有可用浏览器环境时如实列未验证，**不把真实客户端或隔离客户端运行当代码开发阻断**。阶段五所需 YAML 生产依赖有明确必要性，版本/lockfile/发布宿主 engines 由共享负责人确认，不在计划阶段安装。宿主受管源码变更达到最终稳定状态后，由共同宿主负责人统一执行一次 aoci_maintain，并依候选和源码摘要更新条目；不在中间状态反复维护，本次只改计划不触发该操作。

本节的未决项仅关乎 **bundle artifact 的 dependency 来源 spec/lockfile 与可迁移依赖准备协议**，不影响已证实的 MCP literal 安装协议。MCP 本次必须实现 home 默认入口的安装/读取/启停/卸载与 profile patch 扫描；bundle 列表/启停及依赖安装继续按阶段七、八的证据与范围推进，不能把它们的未决项扩散成 MCP 阻断。

## 非阻断的后续手动验证

本机 `where.exe dsh` 未找到客户端。以下仅供用户后续调试，不属于开发前置，不要求先安装、登录或启动客户端：

```sh
where.exe dsh
dsh --version
node -e "console.log({DSH_HOME:process.env.DSH_HOME,DSH_AGENTS_HOME:process.env.DSH_AGENTS_HOME})"
```

若用户已运行 DSH，在匹配默认根与仓库根的现有实例内查看生成技能是否出现在 catalog，并用新会话检查 `.dsh/AGENTS.md` 的标记段；未观察到时先比对实际根、profile 是否启用了相关 provider，再报告差异，不擅自修真实配置。不要运行会重置 profile 的 `--from-default-profile`。

未能从官方来源确认：自动发现项目 MCP 配置文件、独立非交互 bundle 启停命令、`.claude/skills` 默认读取、不同桌面版本中的内部安装布局。本轮均不使用；如未来扩围，可查询 `dsh --help`、`dsh plugin --help`、`dsh --profile web --dump-config` 并核官方源码，不能把结果预写成能力。

## 不做与分批边界

计划阶段不开发源码、安装依赖、改客户端配置、启动服务、提交或归档；误建 `docs/plans/agent-p1-integrations.md` 已按主 Agent 确认保留，无法证明无后续用户编辑，后续清理须独立处理。

阶段一至六必须交付技能、指令与 MCP 安装/读取/启停/卸载及 profile patch 扫描，不能分批把 MCP 推迟或只做只读。尚未闭合的 bundle 依赖协议由阶段七、八保留具体路线；一般 npm 依赖准备仍受文件化约束，不允许 CLI 静默 fallback，未确定 spec/lockfile 前不写 bundle 安装记录。此限制不适用于已有明确 YAML 写协议的 MCP。

全程不做旧版 parser/迁移/别名/跨产品清单转换；不执行 YAML `!!js`、不读写凭证、不自动重置 profile、不顺手重构其他扩展、不把真实客户端/额外隔离实例作为开发门槛；不发布商标授权结论、不重绘图标；不创建分支、提交、推送或擅自归档。本次新增 UI 按项目 ego-browser 要求验证，不与启动真实 DSH 客户端混淆。

## 自审记录

已按 create-plan 要求自审并修正：

1. 修正调研早稿关于 PluginDisk 只支持 cache 四段的过时说法；当前声明目录模板已存在，不为 MCP 修改插件目录复制能力。本次阶段五只补普通文件根/事务、YAML、动态扫描与 MCP 状态表示；bundle 的 manifest 谓词与安装目的地留阶段七。
2. 明确两处原生 skill 与项目共享位置，全局 `.agents/skills` 没有宿主共享 place；将缺口写成限制，未擅自注册额外写入口。
3. 确认每阶段依赖顺序与可执行命令；工具脚本来自真实 package.json，新包先建立同名脚本再运行，市场构建交给共享负责人避免并行写入冲突。
4. 检查 promptTools 不完整 marker 的行为，明确先校验并给坏标记 fixture，避免删除尾部用户正文；不承诺 toolkit 不具备的完全字节保留。
5. 把真实客户端、额外隔离客户端验证和商标再分发的不确定性如实分开，不以未验证能力阻断本轮默认资产开发，不冒充真实加载成功。
6. 图标采用固定 commit URL、原始 bytes、SHA-256 与 Git blob 双核对；未覆盖既有文件，许可证与商标限制均保留。
7. 按用户最新纠正把 MCP 从分批可选路线改为**本次必须完成的安装能力**；重写能力矩阵、阶段依赖、最终 inject/supports、验收与不做清单，删除“首批不做 MCP”的矛盾表述。确定唯一 home 新安装入口、profile patch 扫描/原位操作、stdio/streamable-http 映射、disabled 与 unknown、目标外 YAML/!!js 保留及冲突拒写。
8. 修正普通 PlaceFiles 并无 CAS 的事实，阶段五明确补 expected-before 文件事务，不声称当前 write 已有并发保护；新增共享类型、wire、toolkit、UI 消费者和测试都列入必需文件。拟新增 API 仍标注为设计提案，不能宣传为当前宿主已支持。
9. bundle 保留实际能力与未决依赖协议，整包开关与插件行 disabled 分开；未决项只限制 bundle，不被当作 MCP 延后理由。本次最终必须运行真实宿主端口的 stdio/HTTP 安装→重读→启停→卸载测试，不以 parser/只读 provider 或缺少客户端为通过条件。
