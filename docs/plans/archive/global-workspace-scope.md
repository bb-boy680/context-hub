# 全局入口与资源位置作用域统一

- 日期：2026-11-04
- 状态：已实施，用户验收通过；AOCI 维护受阻
- 验收：2026-11-04 用户确认「我验证了，任务通过，收尾」。
- 执行：主会话完成开发与验证；不创建子 Agent。

## 目标与范围

将侧栏系统创建的「默认工作区」默认名称改为「全局」/「Global」。选中这个入口时，Skills、MCP、Plugins、Prompts 只把全局位置纳入当前资源视图；安装菜单、批量安装、安装位置筛选、扫描持有状态、头像、数量和详情弹窗保持一致。切回普通工作区后，恢复当前工作区与全局两组位置。

本次行为约定：

1. 以当前 `WorkspaceView.default === true` 判断全局入口，不能比较显示名称、路径字符串或数组下标；用户重命名后仍然是全局入口。
2. 沿用 `workspace.defaultName`、持久化 `default`、系统 alias 和现有重命名规则，只修改中英文默认文案。已经设置的自定义字符串 alias 保留，清空名称后恢复为「全局」。不改工作区 ID、路径、置顶和不可删除规则，不直接编辑用户的 `workspaces.json`。
3. 全局入口不提供任何 `scope: "workspace"` 位置，包括模块自身声明的共享工作区位置；`shared: true` 仍表示不受 Agent 选择限制，但不能绕过作用域限制。普通工作区中的共享位置仍按现有规则可读、可收录或生成。
4. 安装位置数量、安装勾选、头像和详情已安装数都基于本次有效位置。详情保留 Hub 资产库自身的一行；它不是工作区安装目标，计数沿用现有语义。
5. 同一物理目录因为「工作区根 = home」产生的两次展示，在全局入口中只留下全局那次。不同真实位置的标记仍按各模块现有规则展示，不把头像相同当成相同 Agent 或相同文件，不修改通用 `AvatarStack` 去掩盖上游重复。
6. 打开菜单或弹窗后切换工作区，失效的位置选择不得继续提交；旧扫描结果不得把已排除的工作区行、头像或数量带回全局视图。

范围包含两个市场安装流程：`packages/market/skills-sh` 与 `packages/market/plugins`，后者复用的插件市场来源一并受益。环境变量页未使用这套工作区安装位置，不做无关修改。

不新增依赖，不更改 Agent provider 声明协议，不更改底层 `PlaceFiles` / SkillStore 的根目录解析，不增加状态迁移或全局设置。这里统一的是资源模块当前允许使用的位置；底层文件 API 仍按既有 scope 协议工作，不宣称本次建立了宿主权限隔离。

## 现状与依据

以下来自本次源码、测试、配置和局部 AOCI 条目阅读；截图仅作为问题与目标依据，尚未进行运行时复现。

| 位置 | 当前行为及影响 |
| --- | --- |
| `packages/core/src/workspace.ts`：`DEFAULT_WORKSPACE_NAME`、`WorkspaceView` | 已有 `default` 与 `nameKey`，系统名称 key 为 `workspace.defaultName`，无需增加新的全局工作区身份字段。 |
| `packages/core/src/host/workspaces-fs.ts`：`ensureHostWorkspace`、`view` | 系统 alias、默认标记、置顶和保护已落盘；已有字符串 alias 不覆盖。`docs/memory.md` 记录默认路径已与 cwd 解耦，不能照归档旧计划把它重新绑定到启动目录。 |
| `apps/web/src/components/workspace-group.tsx`、`src/lib/workspaces.ts` | `workspaceLabel` 已翻译 `nameKey`；默认行已隐藏路径 hint。无需硬编码侧栏文案。 |
| `packages/extensions/src/agents.ts`：`chosenAgents`、`chosenProviders`；`src/react.tsx`：`useChosenAgents` | 只统一 Agent 选择，没有全局入口的作用域判断。共享 provider 不受 Agent 选择过滤。这里适合放最小共享判断与订阅。 |
| `packages/resources/skills/src/provider.ts`：`readablePlaces`；`library.ts`：`useReadablePlaces`、`selectablePlaces`、`useSelectablePlaces` | 返回所选 provider 的两种作用域。`library-store.ts:targets` 也直接使用 `readablePlaces` 发起扫描，必须与 UI 使用相同规则。 |
| Skills `library.ts`：行合并；`provenance-line.tsx`：`ProvenanceLine` | 行从有效位置组合 `places` 和 `takenAt`；头像使用 `placedIn` 按位置生成。只隐藏菜单或只按图标去重都不能修正扫描、计数与详情。 |
| `packages/core/src/host/place-files.ts`：`baseOf`；Skills `host/skills-fs.ts`：`currentWorkspace`、`placeBase` | global 使用用户 home，workspace 使用当前行的 path。默认行指向 home 时，两类引用可能解析到同一目录，解释截图中的重复路径。此事实不等于每个客户端的全部位置都物理相同。 |
| MCP `src/catalog.ts`：`placesOf`、`resolvePlaces`、`scanPlaces` | 静态和动态 `placesFor` 都会产生位置；应在扫描前过滤解析结果，不能只过滤静态 `provider.places`。 |
| MCP `src/library-store.ts`、`src/library.ts` | 共享读、页面读、搜索和写入查找共用扫描数据，但扫描 key 目前只有当前 ID 与 Agent 列表；全局身份也应纳入相关有效性判断。 |
| Plugins `src/scan.ts`：`probeInstallers`；`library-store.ts` | Installer 一次报告整组 `held`、`switches`，并可动态解析位置。不能假设简单修改 `installer.places` 就能限制其内部读取。 |
| Plugins `src/rows.ts`：`collectScanned` | 持有记录用 `placeId`，否则用 `scopeWord` 匹配声明，并有未声明 scope 的只读回退。若只删 `client.places`，被删作用域的 pack 仍可能通过回退生成行。过滤必须同时覆盖持有记录，且在选择源目录、描述及启用状态之前发生。 |
| Prompts `src/provider.ts`：`promptPlaces`；`src/library.ts`：`usePromptPlaces`、`useHolds`、`useHoldsMap` | 位置由共享 hook 提供，扫描按位置调用 provider；`heldInWorkspace` 已检查扫描的 workspace、places 和 files 身份，优先沿用。 |
| Prompts `src/held.ts`：`heldMarks`；Plugins `src/parts.tsx`：`HolderStack` | 已按 Agent 聚合头像，无需再做图标去重；仍要排除全局视图之外的安装状态。MCP `parts.tsx` 则明确按文件展示头像，普通工作区不改这一语义。 |
| `packages/extensions/src/components/place-picker.tsx`：`PlaceMenu`、`PlaceList` | 两者已经过滤空组，并基于实际选项计算菜单位置数；上游位置过滤正确后，空的工作区标题和分隔线自然消失。 |
| `packages/market/skills-sh/src/page.tsx`、`src/install-dialog.tsx` | 使用 `useReadablePlaces`、`useSelectablePlaces`，安装对话框的选择与提交仍需核对切换后的有效性。 |
| `packages/market/plugins/src/install-dialog.tsx` | 使用 `usePluginLibrary().clients`，一 Agent 可有多个 scope/place；需要继承同一位置与持有状态过滤。 |
| 各资源 `src/search.ts` | Skills 搜索读取共享 `held`，MCP 读取共享 `rows()`，Plugins 读取共享 `scanned`；只改页面会导致搜索与页面不一致。 |

相关测试已阅读：Extensions `__test__/agents.test.ts`、Skills `__test__/library-store.test.ts`、MCP `__test__/library-store.test.ts`、Plugins `__test__/scan.test.ts`，以及 Web `__test__/workspace-name.test.ts`。现有工作区夹具有 `folders: []` 或 `current: null` 的形态，不得为了让新增测试通过就静默把这些场景都解释为「全局」。

## 实施阶段

### 1. 定义全局入口规则并更新名称

**目标**：所有模块能使用同一判断，侧栏默认名称通过现有 i18n 机制变为「全局」。

**文件**：

- `packages/extensions/src/agents.ts`、`src/react.tsx`、`__test__/agents.test.ts`
- `packages/extensions/src/builtin/locale-en.ts`
- `packages/i18n/zh-cn/src/messages.ts`
- `apps/web/__test__/workspace-name.test.ts`
- 按实际需要扩展 `apps/web/__test__/bridge.test.ts`，仅验证已有 alias 与新文案的接线。

**步骤**：

1. 在 `agents.ts` 增加纯函数 `isGlobalWorkspace(page)`（拟定名），通过 `page.current` 查找当前行并检查 `default === true`。`null`、缺失服务或未知当前行返回 false，保持已有宿主行为；首次扫描继续等待现有 `refresh()`。
2. 在 `react.tsx` 增加最小订阅 hook `useGlobalWorkspace()`（拟定名），复用 `hub.workspaces` 和 `useSyncExternalStore` 既有模式，服务对象用 `useMemo` 固定，返回稳定布尔值。非 React 的共享读直接调用纯函数，不另写第二份识别条件。
3. `agents.ts` 已由 `src/index.ts` 的 `export *` 导出；React 入口已由包 exports 暴露。核对新符号的类型引用和导出，不新增入口文件或配置。
4. `workspace.defaultName` 的中英文值改为「全局」/「Global」，保留字面量 key、`DEFAULT_WORKSPACE_NAME` 和原 alias 协议。更新名称测试，增加默认标记不依赖翻译、自定义 alias 不改变身份、清空恢复新系统名的用例。
5. 测试同一当前 ID 的 default 元数据变化会使订阅者得到新布尔值；普通工作区恰好命名为「全局」也不能被误识别。

**依赖**：无。

**完成判据**：共享判断和文案检查通过；原有工作区持久化契约保持可用，其余模块可逐步接入，仓库仍可运行。

### 2. 对齐 Skills 与 Prompts 的位置来源

**目标**：两模块从位置读取到卡片、批量操作和详情使用同一份有效位置。

**主要文件**：

- Skills `src/provider.ts`、`src/library-store.ts`、`src/library.ts`
- Prompts `src/provider.ts`、`src/library.ts`
- 必要调用方：Skills `src/page.tsx`、`src/provenance-line.tsx`、`src/skill-detail-dialog.tsx`、`src/index.ts`；Prompts `src/page.tsx`、`src/install-menu.tsx`、`src/prompt-detail-dialog.tsx`
- Skills `__test__/registry.test.ts`、`__test__/library-store.test.ts`、`__test__/rows.test.ts`、`__test__/search.test.ts`
- Prompts `__test__/held.test.ts`，并在相邻测试目录增加必要的位置过滤断言。

**步骤**：

1. 在现有 `readablePlaces` / `promptPlaces` 计算中接入全局入口规则；可增加有默认值的布尔参数，现有不传参调用保持原行为。过滤发生在 provider 的 Agent 选择之后，统一排除所有 workspace scope，包括共享 provider 的 workspace 位置。
2. Skills 的 `SkillLibrary.targets()`、`useReadablePlaces()`、`selectablePlaces()` / `useSelectablePlaces()` 都传入当前全局判断，避免共享读和 UI 分别计算。查询、库摘要和 tags 的读取不受此过滤影响。
3. 核对 Skills 合并行时只使用有效 targets 构造 `places`、`takenAt` 和位置独有行。头像、数量、顶部位置筛选和详情 `PlacesSection` 读取过滤后的结果；正常全局持有不丢失收录、删除位置副本、卸载或文件读取来源。
4. Prompts 的 `usePromptPlaces()` 依赖新增的全局布尔值，从而让页级扫描、详情扫描、安装与生成菜单、头像和数量同步变化。沿用 `heldInWorkspace` 和生成动作对当前位置的检查；确保切换时旧 holds 不给新位置打勾。
5. 核对四类动作入口：单项安装、批量安装、详情安装/移除、提示词生成/移除。动作提交前使用当前服务快照核对作用域与位置，防止打开菜单后切换到全局仍提交旧 workspace 目标。复用现有错误与 toast，不新增说明段落。
6. 沿用页面现有失效筛选清理，确认 workspace 选择消失时回到全部，并清掉相关批量选择、重置必要的页码。普通工作区切换仍重新读取对应目录。
7. 检查共享扫描的中间状态与异步旧结果：若现有数据缺少读取所属 workspace 信息，增加最少的扫描身份信息用于判定有效性；库内记录可保留，过期的位置持有状态不再展示。读取与订阅 key 包含影响本次作用域的身份，不能因每次 `refresh` 形成重读循环。

**依赖**：阶段 1。

**完成判据**：全局下两模块不发起 workspace 位置的扫描调用；仅全局持有只生成对应全局状态；普通工作区保留两种作用域及共享位置。详情、菜单、头像与数量一致，新增逻辑和原有扫描/收录测试通过。

### 3. 对齐 MCP 与 Plugins 的扫描结果

**目标**：静态/动态位置、持有记录、详情状态和操作目标在全局下都受同一规则限制。

**主要文件**：

- MCP `src/catalog.ts`、`src/library-store.ts`、`src/library.ts`
- 核对 MCP `src/page.tsx`、`src/menus.tsx`、`src/server-dialog.tsx`、`src/parts.tsx`、`src/installs.ts`、`src/detail-files.tsx`
- Plugins `src/library-store.ts`、`src/library.ts`、`src/rows.ts`，必要时 `src/scan.ts`
- 核对 Plugins `src/page.tsx`、`src/install-actions.tsx`、`src/detail-dialog.tsx`、`src/parts.tsx`
- MCP `__test__/library-store.test.ts` 与已有 catalog/installs 测试；Plugins `__test__/library-store.test.ts`、`__test__/scan.test.ts`、`__test__/rows.test.ts`、`__test__/library.test.ts`；两模块搜索测试。

**步骤**：

1. MCP 对动态 `placesFor` 的解析结果与静态 `placesOf` 应用相同过滤，在 `scanPlaces` 前排除 workspace；尽量在无效位置的路径展示解析前排除，避免不需要的位置导致全局扫描失败。保留重复 ID 校验、失败状态和动态根校验。
2. MCP 的共享 `places()`、读扫描、`rows()` 和 React hook 的 fallback 位置使用同一规则；扫描 key 与 `providerAt` 的有效性检查包含全局身份，不能只改其中一端。详情的配置文件列表、安装数、状态开关、头像和搜索来自同一有效扫描。
3. 保留 MCP `installable: false` 的全局位置扫描和已安装行，不把“只显示全局”误写为“只扫描可安装位置”；读取失败保留未知/不可写含义，不能伪报 0。MCP 探测 `targetScope` 继续沿用既有含义，本次不扩展为探测执行上下文重构。
4. Plugins 先按完整声明解析持有记录所属 scope（有 `placeId` 优先，没有则 `scopeWord`，未声明按现有只读回退），再排除 workspace 记录。过滤应在 `collectScanned` 选择版本、来源、可读目录和 enabled 等元数据之前完成，避免工作区副本污染保留的全局行。
5. Plugins 输出的 `clients[].places`、`switches` 与 `scanned` 同步收敛；不能只删位置，让 `collectScanned` 的未声明回退重新生成工作区持有。保留全局 managed/只读/非默认安装位置与多身份拒绝猜测规则。优先在现有扫描聚合边界处理，不改写每个 Agent installer。
6. Plugins 的安装、卸载、启停、clear override 与按 placeId 操作，提交前检查当前有效位置。确保传入 installer 的 scope/ID 与验证的 place 相符，拒绝旧 workspace 目标；保留文件写入验证、错误处理和多身份校验。
7. 对工作区切换中的旧快照和未完成读取应用最小有效性检查，保证旧 clients / scanned 不在全局视图继续提供可操作目标；搜索也不能重新引入 workspace 独有资源。

**依赖**：阶段 1；可按模块逐个完成，每个模块完成后仓库保持可运行。

**完成判据**：MCP 全局扫描只调用全局位置；Plugins 全局结果和菜单不含 workspace 持有，只有工作区副本且未收录的插件不出现在全局资源视图，同名全局副本元数据正确。两模块详情、开关、菜单、计数、搜索和有效性测试通过。

**明确限制**：Plugins 的 `installer.held(tools)` / `switches(tools)` 是整客户端调用，本次不能据结果过滤就声称其内部完全不读取工作区文件。交付保证是模块对外的有效位置、状态和操作一致；若需要从文件端口禁止所有 workspace 访问，需要独立的宿主协议调整，不在本计划混入。

### 4. 回归市场与全部展示入口并收尾

**目标**：覆盖跨模块的实际交互、双语文档和最终验证。

**文件**：

- `packages/market/skills-sh/src/page.tsx`、`src/install-dialog.tsx` 与 `__test__/market-rows.test.ts`
- `packages/market/plugins/src/install-dialog.tsx` 与现有市场测试
- `packages/resources/plugins/src/market-install.ts` 及 `__test__/market-install.test.ts`（核对提交使用的实际 targets）
- 四资源模块本阶段确有遗漏的调用点，以及对应测试
- `README.md`、`README.zh-CN.md`

**步骤**：

1. 核对 skills.sh 使用的新位置 hooks，以及插件市场使用的新 clients；静态/动态目标、分组标题、总数、已安装勾选、折叠项和安装按钮状态都以有效位置为准。已有共享 `PlaceMenu` / `PlaceList` 能处理空组，不另造菜单。
2. 市场自绘分组也要跳过空 workspace 组；对话框打开后切换全局，要清理或忽略已选 workspace ID，实际批量提交不得含隐藏目标。详情打开期间切换工作区，同样重新核对目标和持有状态。
3. 在 README 使用流程中说明侧栏「全局」只管理全局 Agent 位置，选择项目后才加入项目位置；保留现有公共目录可读但不可作为 Skills 安装目标的说明。不批量改写历史归档计划。
4. 执行下方测试与浏览器矩阵，调查并修复本次引入的失败；核对控制台与失败请求。
5. 检查 diff 仅包含本任务改动。最终稳定后按 AOCI 规则维护本任务源码条目；候选含其他会话在途文件时不代写。用户确认实施完成后再归档本计划。

**依赖**：阶段 2、3。

**完成判据**：所有受影响入口通过验证矩阵，文档与可见行为一致；未验证的环境或客户端限制明确记录。

## 验证安排

开发交付与验证均由主会话执行。规划阶段不运行测试、构建、服务或浏览器，仅核实检查入口。

### 自动检查

每阶段先运行相应包的既有 `test`、`typecheck`、`lint`。已核实相关包均配置这些脚本，沿用 pnpm。最终汇总测试使用根 Vitest 已登记的 project：

```bash
pnpm exec vitest run --project extensions --project web --project zh-cn --project skills --project prompts --project mcp --project plugins --project market-skills-sh --project market-plugins
```

最终类型与 lint 检查：

```bash
pnpm --filter @context-hub/extensions --filter @context-hub/zh-cn --filter @context-hub/skills --filter @context-hub/prompts --filter @context-hub/mcp --filter @context-hub/plugins --filter @context-hub/market-skills-sh --filter @context-hub/market-plugins --filter web typecheck
pnpm --filter @context-hub/extensions --filter @context-hub/zh-cn --filter @context-hub/skills --filter @context-hub/prompts --filter @context-hub/mcp --filter @context-hub/plugins --filter @context-hub/market-skills-sh --filter @context-hub/market-plugins --filter web lint
pnpm --filter web build
```

若实际修改扩展到此清单外的源码/公开接口，再增加对应包检查；不通过修改无关用例或全仓格式化消除基线失败。

关键测试输入与判据：

- **身份**：default 当前行、普通行、同名「全局」普通行、自定义 alias 默认行、空快照、未知当前 ID、同 ID default 标记变化。
- **位置**：一 Agent 两 scope、不同 Agent 相同图标、只支持 workspace 的 Agent、只支持 global 的 Agent、无 Agent 选择、shared workspace provider、动态解析出的两 scope、全局不可安装但已持有的位置。
- **扫描**：Skills / MCP / Prompts 的调用 spy 证明未请求 workspace 位置；Plugins 同名两 scope 与仅 workspace pack 证明结果过滤发生在元数据聚合前。未知读取与真实空目录区分不丢失。
- **切换**：普通工作区 A → 全局 → B，带延迟的旧扫描最后返回、对话框已选目标、旧筛选与旧回调。全局不能恢复 workspace 行、勾选、数量或提交目标；B 不复用 A 的持有状态。
- **真实同目录**：临时夹具中让默认工作区 path 与测试 userHome 相同，并声明同一相对路径的 workspace/global 两位置；全局只留全局持有和头像来源，普通工作区仍保留其真实双作用域。
- **动作**：使用 stub installer/provider 或临时文件端口验证全局安装只提交 global，旧 workspace 操作被拒绝；库内资源依然保留且能正常操作，不用源码字符串匹配冒充行为测试。

### 浏览器验收

使用 `ego-browser`。实施时先核对当前 `apps/web/dev.ts`、`hub-port.ts` 和启动配置，再选择自己管理的服务；不使用规划阶段的旧归档命令猜测端口。

准备隔离的 Hub home、userHome、工作区 A/B 和代表性资源。文件端口构造显式提供 `home`、`folder`、`userHome`，不能只隔离 Hub home。UI 验证以查看菜单、详情和切换为主；需要点击安装/卸载/启停时，必须确认所有实际根已隔离，不能碰真实 Agent 配置或签入文件。

| 流程 | 预期 |
| --- | --- |
| 默认入口中文 / 英文，刷新与重命名恢复 | 显示「全局」/「Global」；自定义 alias 保留，身份判断不变。 |
| `/skills`、`/mcp`、`/plugins`、`/prompts` 的卡片、表格和顶部安装位置 | 全局下无工作区组或空分隔线；总数、路径、勾选与有效全局位置一致。截图中的四位置示例变为两个全局位置。 |
| 同一 Agent 的双作用域扫描结果 | 全局下不再因为工作区根与全局根相同而重复头像；不同真实全局文件或不同 Agent 不被误合并。 |
| 四模块详情弹窗 | Hub 库行保留；Agent 位置仅显示全局；已安装数、状态开关、查看文件和安装/移除对应实际位置。 |
| 单项与批量安装、提示词生成 | 全局下只能选有效全局目标；普通工作区仍有两组；移除、收录和失败提示保持可用。 |
| skills.sh 与插件市场安装对话框 | 全局下只有全局目标；切换后清理隐藏选择，实际提交与显示一致。市场数据可用 fixture，不为验收要求联网安装真实资源。 |
| 弹窗/菜单打开时切换，以及快速 A → 全局 → B | 不留旧工作区头像、安装勾选、数量、筛选或可提交目标。 |
| 搜索、窄窗口、键盘与空态 | 搜索与页面资源范围一致，布局与焦点可用，无多余标题或微文案。 |

本任务没有新增桌面 preload 或主进程行为，主要 UI 用 Web 实际验收；如果在桌面载体复查，则独立记录结果，不以 Web 验收代称桌面已验证。收尾只停止本次启动的进程，检查工作树与测试文件残留。

## 风险与交接

- 全局入口将不再把 home 当成一个项目读取 workspace-only 的资产位置。这是本次明确的视图行为变化；文件留在原处，不删除或搬迁。若 provider 没有声明相应全局位置，它不会因路径相似而被自动升级成 global。
- 保留现有自定义 alias，因此用户曾手动起名的默认入口不会被强行覆盖。系统默认名统一为「全局」。
- Plugins 的未知 scope / managed 只读回退不能在精简菜单时丢失；过滤前后都需用真实形状的夹具验证。不能先删声明，再把被过滤的记录当成“未知 scope”保留下来。
- 当前工作树已存在对 Skills `src/page.tsx`、`src/library.ts` 和共享 `tag-editor.tsx` 的未提交修改；`docs/plans/skills-card-lazy-detail.md` 也覆盖前两个文件。本任务以实施时的最新内容为基础做局部修改，不回滚或覆盖已有工作，不顺手改卡片媒体、标签或详情懒加载。
- 开始实施前按阶段创建 task 列表；每阶段结束更新进度。每次编辑前核对最近项目说明和源码；修改函数签名后复查直接调用、类型、barrel、动态导入、测试、mock、文档和生成引用。现有 API 尽量通过有默认值的参数扩展，避免迫使 Agent 扩展改写。
- 本计划基于已读仓库代码，不依赖外部库新增 API 或升级，规划阶段无需外部文档查询。实际实施若涉及未核实的库行为，再按项目规则使用 Context7。
- 尚未执行编码、自动检查或实际页面复现；实施时如发现与源码推断不同，先修正根因判断及本计划对应步骤，不把推断当成运行结果。

## 实施与验收记录（2026-11-04）

- 已实现共享 `isGlobalWorkspace` 与 `useGlobalWorkspace`，系统名称更新为「全局」/「Global」。Skills、Prompts、MCP 的位置在扫描前按作用域过滤；Plugins 在选择副本元数据前过滤持有记录，并同步过滤可用位置与开关。
- 工作区切换时撤下过期位置状态，延迟旧扫描不再重新发布工作区数据；安装、移除、启停和生成提交前校验当前有效目标。四资源模块的菜单、数量、头像和详情继续复用上游位置来源；市场两个安装对话框已有空组过滤与从当前有效位置构建 targets 的逻辑，无需为本次显示规则另改 UI。
- 已补充全局身份、自定义名称、共享工作区排除、动态位置、Plugins 元数据来源与 scope/placeId、切换恢复和旧扫描延迟返回等测试。中英文 README 使用流程已更新。
- 最终自动验证：`pnpm exec vitest run --project extensions --project web --project zh-cn --project skills --project prompts --project mcp --project plugins --project market-skills-sh --project market-plugins`，75 个测试文件、1219 项测试通过；本计划列出的 9 个包 `typecheck` 与 `lint` 均通过；`pnpm --filter web build` 通过；`git diff --check` 通过。
- 构建仍有 Vite 配置 `__dirname` 和大于 500 kB chunk 的提示，本任务未更改相关配置。
- 用户已自行验证并确认通过。按用户最新指示直接收尾，不再启动浏览器或隔离服务，因此未由本会话执行完整浏览器矩阵、真实目录写入或桌面载体验收；未启动需要回收的应用或浏览器进程。
- AOCI：最终调用一次 `aoci_maintain`，返回 `stopped/blocked`，有 11 项 observe 待审查和包含其他任务改动的 37 个目标，未签发可提交候选。本次不确认其他任务的批次、不改正式索引；尝试 `aoci_report` 返回 `volume_read_only`，未登记成功。后续需在工作树稳定、完成 scope review 后统一维护。
- 原有与其他会话的未提交修改保留；未创建分支、未提交或推送 Git。用户已明确确认任务完成，本计划归档至 `docs/plans/archive/`。

