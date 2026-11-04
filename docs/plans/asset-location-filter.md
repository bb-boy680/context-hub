# MCP、Plugins、Prompts 安装位置筛选对齐

- 日期：2026-11-02
- 状态：用户已批准，执行中
- 范围：三页的顶部位置筛选、相关计数与状态、双语文案、必要测试及用户文档。
- 参照：`packages/resources/skills/src/page.tsx:1304` 的「安装位置」菜单，以及 `docs/memory.md` 开头关于计数的记录。

## 目标与需要确认的边界

1. MCP、Plugins、Prompts 三页各用一个「安装位置」入口，将原来分开的工作区、全局入口合并成一个菜单；菜单沿用 Skills 的 `PlaceMenu` 外观、两组顺序、路径、数量、勾选、键盘和搜索行为。
2. 点击一个具体位置，列表只显示该位置持有的资源；点击顶部「全部」回到全部资源。其他已有业务页签仍保留。Skills 的菜单没有“全部工作区 / 全部全局”选项，因此三页原有的**按整个作用域汇总筛选**会随旧入口一起移除。
3. 用户指定的 Prompt 元素是 `PlaceScopePicker` 内的菜单行，但提供的 HTML 截在图标处，没有行文字或路径；动态生成的 `id` 无法从源码反推是哪一行。当前可确认的行包括“全部位置”、共享工作区 `.agents` 和各 Agent 位置。本计划确定移除旧的两个筛选入口及其“全部位置”行；如果用户另指共享工作区或某个 Agent 行，须先明确其名称和移除范围。**在确认前不改 provider、安装菜单或已有文件。**
4. 只改顶部筛选及其必要的状态/文案；卡片、列表、批量、详情中的安装、生成、移除和启用动作保持现有数据与契约。不会读写或清理用户真实 Agent 配置来制造测试数据。

## 已核实的现状

- Skills 把同一 Agent 的工作区和全局目录作为独立选项，以 `id + scope + dir` 识别；从未过滤的位置快照取数量，未读显示 `—`、空位置显示 `0`；选中位置消失后回到全部并清掉旧选择，避免重新启用时复活。对应 `packages/resources/skills/src/page.tsx`、`src/library.ts` 和 `__test__/rows.test.ts`。
- MCP 的 `McpPlace.id` 在 provider 间唯一，实际持有状态在 `server.detail.installs`，已停用或单条声明不可解析仍可能属于已安装；现有位置行已有路径和按全量服务器计算的数量。整个文件读取失败记录在 `catalog.problems`，不能当成已知的空位置。
- Plugins 当前每行是 **Agent + 工作区 / 全局**，不是每个 `PluginPlace` 文件一行；`row.held` 是 Agent 报告的真实持有信息，不能用 Hub 自己的投递记录替代。不同 Agent 和不同作用域须分别筛选；installer 的 `file` 是启用开关配置文件，不保证是插件安装目录，不能伪造位置路径。
- Prompts 的持有信息由 `useHoldsMap` 按 prompt 和 place 扫描；同一提示词在同一位置有多个 form 时只计一次。共享 `.agents` 由本模块的 workspace provider 注册，并同时参与投递和扫描，不能从 `usePromptPlaces` 全局移除。
- `PlaceMenu` 已具备分组、路径、数量三态、选中勾和 `currentSelection`；合计达到 8 项时提供搜索。`PlaceScopePicker` 是旧的范围包装，本轮优先复用 `PlaceMenu`，只有不再有调用者且确认导出用途后才考虑清理旧组件。
- 三页没有现成页面渲染测试；Plugins `__test__/rows.test.ts` 覆盖作用域和 Agent 筛选，MCP `__test__/mcp.test.ts` 有跨作用域、禁用和不可读声明夹具，Prompts `__test__/held.test.ts` 已覆盖持有状态。三模块各用 pnpm 包脚本运行 Vitest、lint、typecheck。

## 阶段一：MCP 安装位置

**目标**：将顶部两个作用域入口改为 Skills 同款的一个位置菜单。

**文件**：`packages/resources/mcp/src/page.tsx`、`src/messages.ts`、`packages/i18n/zh-cn/src/messages.ts`；根据测试落点扩展 `packages/resources/mcp/__test__/mcp.test.ts` 或新增同目录的 `*.test.ts`。

**做法**：复用当前 `places` / `scopePlaces` 和 `PlaceMenu`，保留实际路径与每位置安装数；以 `place.id` 精确筛选，状态与普通业务页签互斥。选择位置或切换业务页签时重置页码和批量勾选；原位置消失时立即回到全部并清除旧选择。首次未读或该位置明确读取失败时显示 `—`；成功读取但为空显示 `0`。筛选依据仍是 `installed` 而不是 `enabled`。

**验收**：同一服务器安装在工作区和全局时，各位置均能单独筛到；停用的已安装服务器仍能筛到；搜索、标签和分页与位置筛选一起工作；关闭某个 Agent 后不会留下空白或在重开时恢复旧筛选。

## 阶段二：Plugins 安装位置

**目标**：将两个作用域入口合并为一个菜单，同时保留每个 Agent 在各作用域的现有筛选含义。

**文件**：`packages/resources/plugins/src/page.tsx`、`src/rows.ts`、`src/messages.ts`、`__test__/rows.test.ts`，以及中文语言表。

**做法**：按作用域分组，分别提供每个 Agent 的一行，用 `(scope, client.id)` 生成菜单身份和保存选择，避免同一个 Agent 的两行发生 key 碰撞。继续复用 `rowsForTab` / `row.held` 和按全量 catalog 计算的行数；已知读取失败显示 `—`，成功为空显示 `0`。位置选项无真实安装目录时不额外画路径。只改需要的筛选分支与调用方，保留资产库、未收录、更新及其批量动作；位置消失时清掉旧选择并回到全部。

**验收**：同一 Agent 的工作区和全局分别能筛到对应资源；只被 Agent 持有、未收录的插件依然显示；停用与已安装的含义不混淆；不同位置的数量、勾选和无重复 key 正确。

## 阶段三：Prompts 安装位置

**目标**：移除顶部两个旧 `PlaceScopePicker`，换成一个按作用域分组的「安装位置」菜单。

**文件**：`packages/resources/prompts/src/page.tsx`、`src/messages.ts`、中文语言表；必要时调整 `src/library.ts` 中仅由页面调用的持有扫描结果，并扩展 `__test__/held.test.ts` 或新增相邻的 `*.test.ts`。

**做法**：以唯一 `PromptPlace.id` 区分位置，复用已有 `holdsSomething` 按完整提示词库计数；保留每行名称、真实 `where`、数量和选中状态。扫描尚未回答或明确失败时显示 `—`，已读为空显示 `0`；如果现有扫描结果不能区分失败与空，记录最小必要的读取状态，同时保持现有卡片/详情持有信息与失败提示语义。点“全部”清除筛选，选中位置消失时清除旧选择、重置页码与勾选。页脚总数与新位置筛选后的结果一致。

**验收**：同一提示词由该位置生成多个 form 仍只计一条；工作区和全局位置能独立筛选；搜索/标签、空态和分页正确；旧的作用域菜单不再出现。共享 `.agents` 的具体处理以用户对所指菜单行的说明为准；未确认前保留 provider、扫描、投递和移除能力。

## 阶段四：文档与验证

**文件**：`README.md`、`README.zh-CN.md`；如有受管源码变化，最终根据 `aoci_maintain` 的候选维护对应条目。

**验证**：

1. 分别对 `@context-hub/mcp`、`@context-hub/plugins`、`@context-hub/prompts` 执行 `pnpm --filter <包名> test`、`pnpm --filter <包名> lint` 和 `pnpm --filter <包名> typecheck`；语言表执行 `pnpm --filter @context-hub/zh-cn test`。保留失败输出并处理本次引入的问题。
2. 为新增的筛选/计数逻辑补可失败的断言，覆盖同 Agent 跨作用域、不同位置同名资源、未知与零、失效选择；保留现有与具体业务行为有关的测试。
3. 使用 `ego-browser` 检查 `/skills`、`/mcp`、`/plugins`、`/prompts` 的桌面和窄屏：菜单分组、路径、数量、勾选、键盘焦点、位置切换、全部、搜索及分页；准备可区分正反结果的隔离数据。以独立 hub home、workspace 和 Windows `USERPROFILE` 隔离三个目录，选择空闲端口且只清理由本次启动的进程；不点击真实安装、卸载或开关。
4. 核对工作树与本次改动范围，保留原有未提交内容；确认状态稳定且无其他会话正在修改受管文件后，再执行 AOCI 收尾。用户确认任务完成后，将本计划移入 `docs/plans/archive/`。

## 自审

- 本计划以已读源码为依据，未新增依赖、存储格式、后端 API 或独立设计系统。
- 合并后失去整个作用域的聚合视图是照 Skills 当前交互产生的明确变化，不会静默发生。
- Prompt 被点名的具体行仍不明确，不能据动态 id 或无文字的 HTML 猜测；审批时需同时明确该行和是只从筛选菜单移除，还是从所有投递入口移除。
- Plugins 的“位置”目前是 Agent + scope 的聚合；不把不同 installer 的配置文件误写成安装目录，也不在这次引入更细的安装位置模型。
- 本阶段只完成调研和计划，未经用户明确批准不修改源码；也尚未运行测试或启动应用。
