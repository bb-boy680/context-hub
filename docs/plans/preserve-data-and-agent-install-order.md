# Agent 拖拽排序与扩展列表顺序

- 日期：2026-11-04
- 状态：待用户审批，尚未实施
- 仓库：主仓库 `D:/work-space/dsh-context-hub`；扩展市场仓库 `D:/work-space/context-hub-extensions`
- 执行：主会话完成计划；获批后每阶段建立一个任务并持续更新，不自行创建子 Agent。

## 目标与范围

移除 Agent 和 Hub 扩展列表中的固定展示排序。Agent 侧边栏默认按安装顺序显示，支持拖拽调整，手动顺序刷新后保持；资源页的 Agent 头像堆叠同步遵循侧边栏顺序。扩展页沿用市场数据顺序。

**范围修正**：资源条目排序与 Agent 排序没有直接关系。此前计划把 Skills、Prompts、Plugins、MCP、Variables 的资源条目顺序一起纳入，属于扩大范围，现已移除。上一轮已做的 Skills 时间排序修改保持现状，本计划不继续改其读写、扫描和名称排序。

用户截图中的 Agent 是 Hub 的 Agent 集成扩展；资源页交付给 Agent 的 plugin pack 属于另一类数据，不能混用安装记录。

| 对象 | 最终规则 |
| --- | --- |
| Agent 侧边栏 | 默认按所属扩展安装顺序，允许对单个 Agent 拖拽；保存后优先采用手动顺序，刷新、重启及切换工作区后保持。勾选、停用再启用和更新不改变相对位置；有手动记录的 Agent 卸载后重装恢复该位置，未手动记录的按新安装追加。 |
| Agent 头像堆叠 | Skills、Prompts、Plugins、MCP 中展示 Agent 的卡片、列表、详情及位置筛选堆叠，按侧边栏可见 Agent 的有效顺序从左到右排列；现有去重、显示数量上限、提示标签和图标保持原有语义。未能关联到侧边栏的标记保留在后面并保持相对顺序。 |
| 资源页 Agent 选项 | 安装菜单、详情位置和批量入口中的 Agent 使用侧边栏有效顺序；同一 Agent 的多个 place 保留声明顺序。移除与 Agent 选项相关的数字权重排序，保留作用域分组、可安装范围、数量和选择状态。资源条目本身的顺序不在本次范围。 |
| 扩展页 | 保留分类卡片；分类按合并数据首次出现顺序生成，组内保留输入原序。移除固定 `categoryOrder`；市场条目安装后原位更新状态，不因已安装而被前置。 |
| 扩展市场索引生成 | 移除目录名和插件 id 的两次排序，按目录发现结果生成 `plugins` 数组，消费者保留该数组原序。 |

不在本次范围：

- Skills、Prompts、Plugins、MCP、Variables 的资源条目排序，以及插件资源市场的分类/插件包排序。
- 文件树、上游榜单、版本选择、缓存淘汰、配置覆盖优先级、哈希规范化和逆序文本 patch。
- 应用导航/header 的布局优先级、Agent 以外列表的拖拽排序和排序切换设置。唯一计划新增的生产依赖是 Web 包的拖拽 SDK，理由和版本见下方调研。

### 安装顺序与手动顺序约定

1. 默认安装顺序以成功写入扩展安装记录的先后为准，不从目录名、mtime、激活先后、Agent 勾选数组或 `installedAt` 推导。
2. 手动顺序使用 **Agent target id**，不使用扩展包 id，也不复用勾选列表 `agents`。同一个扩展内的多个 Agent 可以分别拖拽，甚至移动到其他 Agent 两侧。未手动排序时采用安装顺序；手动排序后，已有条目按用户顺序显示，新安装的 Agent 在末尾按安装顺序追加。
3. 顺序作为这台 Hub 的全局偏好保存一次，所有工作区共享；切换工作区、刷新、重启不重置。停用、卸载或暂时未注册的 Agent 在手动记录中保留位置，重新启用或重装后恢复；没有手动记录的 Agent 重新安装则按新安装追加。保留缺席 id 可避免禁用状态下无法识别扩展所属 target 时误删用户顺序。
4. 旧记录没有独立顺序数组，`installedAt` 还会被更新覆盖，无法可靠还原完整历史。本次以现存记录枚举顺序作为默认安装顺序初始值，无记录的合法扩展按首次发现顺序追加；之后稳定持久化。
5. 拖拽不修改已勾选状态、安装记录和资源数据。取消拖拽或保存失败时恢复上一次已持久化的顺序并提示；快速连续调整按顺序写入，不能被慢响应覆盖。
6. 无宿主的纯浏览器形态沿用内置模块装配原序；如果没有可持久化的宿主服务，禁止把仅内存顺序显示为已经保存，并明确提示失败。一个扩展提供多个 Agent 时默认按包级安装顺序及包内声明顺序排列。
7. 开发和验证只使用隔离 home 与本地 fixture，不修改用户真实 Agent 配置或插件安装，不发布市场。

## 现状与依据

已阅读主仓相关项目说明、`docs/memory.md`、`docs/extensions.md`、局部 AOCI 条目、源码和测试，以及扩展仓 README、构建脚本和 CI。目标目录没有更近的项目说明；扩展仓没有找到 `AGENTS.md` / `CLAUDE.md`。规划阶段未运行测试、构建、服务或浏览器。

| 路径与符号 | 已确认行为与约束 |
| --- | --- |
| `packages/core/src/plugins.ts`：PluginSource、PluginStore、PluginRecord | `list()` 注释承诺 sorted；安装记录在 `extensions/index.json`。`records()` 对外返回按 id 索引的对象，可以保持此 API 不变。合法 id 包含纯数字，不应以对象键枚举规则充当严格安装顺序协议。 |
| `packages/core/src/host/plugins-fs.ts`：list、setRecord、remove | `list()` 对磁盘 id 做 `localeCompare`；安装记录对象已有键原位替换、新键追加，尚无显式顺序。多个 store 实例可指向同一 home。 |
| `packages/core/src/host/extension-market.ts`：installMarketExtension、removeInstalledExtension | 文件替换后才 `setRecord`，记录写失败通过 warning 返回；每次安装/更新都刷新 `installedAt`。卸载调用 `store.remove` 后清理启用状态。 |
| `packages/extensions/src/plugin.ts`：discoverPlugins；`apps/web/src/lib/hub.ts`：installedPlugins、startHub | 按 `source.list()` 顺序发现，内置模块在前、磁盘扩展在后进入内核。 |
| `packages/extensions/src/service.ts`：entries、replaceNow、contributions | Map 保留目录原序，replace 原位 set；contributions 按 owner 目录 rank 排序，用于抵抗重新激活造成的注册顺序变化。不能直接返回裸注册数组，否则停用/更新会让 Agent 跳位。 |
| `packages/extensions/src/contributions.ts`：Placement、register | 已按调用方 `ctx.fiber?.name` 记录 owner，并以 effect 回卷。注册必须保持原型方法。 |
| `apps/web/src/components/app-sidebar.tsx`：AgentGroup；`sidebar-rows.tsx` | 消费 `useContributions("target")` 且按 `useSkillAgents()` 过滤；没有独立 comparator。通用 SidebarRow 已支持点击和键盘选择，新增拖拽手柄不能触发选择；保留默认 8 行折叠及勾选行为。 |
| `packages/core/src/workspace.ts`、`src/host/workspaces-fs.ts`、`packages/core/handlers.ts`、`apps/web/src/lib/workspaces.ts` | workspace 文档的 `agents` 是全局勾选集合，并不是全部已安装 Agent 的顺序。已有 host 读改写串行队列、POST 动作及共享订阅可承载独立排序字段；多个写入路径显式构造 `WorkspaceState`，必须逐一保留新字段。 |
| `apps/web/src/lib/hub.ts`、`packages/extensions/src/settings.ts` | 通用设置的 storage.write 通过 `void storeDocument` 异步写入并吞掉失败；不能仅靠 settings 的同步返回宣称拖拽已持久化。工作区 POST 能返回真正的写入成功/失败。 |
| `packages/extensions/src/components/avatar-stack.tsx`；Skills `src/provenance-line.tsx`；Prompts `src/held.ts`；Plugins `src/parts.tsx`；MCP `src/parts.tsx` | AvatarStack 只按传入顺序绘制且最多显示 5 个；Skills marks 的 id 是 place id，Prompts 是 Agent id，Plugins 是 client id，MCP 是具体文件 place id。需要在业务调用处映射到 Agent id，再保序映射图标与可访问标签，不能让通用 AvatarStack 猜 id 或统一去重。 |
| `packages/resources/{skills,prompts,mcp,plugins}/src/provider.ts` | 注册表注册时 push、停用时 splice，重新激活会改变顺序。provider id 不等于扩展包 id：`trae` 一个包注册 IDE/CLI 多个目标，Claude Code 的 provider id 与 `plugin.yaml` id 也不同。 |
| Skills/Prompts provider 的 order 字段 | `readablePlaces` 与 `promptPlaces` 仍按数字 order / scope 排序；只需处理 Agent 位置这一层，不改资源条目。 |
| MCP `src/catalog.ts`：placesOf/resolvePlaces | 扁平位置按 scopeRank 排序，供 Agent 位置列表使用。本计划只改依赖该顺序的 Agent 选项，不修改服务条目顺序和声明副本选择逻辑。 |
| `apps/web/src/lib/extensions.ts`、`src/pages/extensions.tsx` | `categoryOrder` 是固定分类表；页面把已安装条目放在市场未安装条目前，安装后会改变条目的合并位置。 |
| `apps/web/src/lib/extension-market.ts` | `marketEntriesFor` 已保留 `index.plugins` 原序，但跳过已安装项；`installMarketExtension` 未把完整磁盘安装序传回运行中的内核。 |
| 扩展仓 `scripts/build-marketplace.mjs:main` | `fs.readdir` 后 `dirs.sort()`，随后 `plugins.sort(id)`；README 明确宣称按 id 排序。 |

已有明确顺序断言：Extensions `__test__/plugins.test.ts`、`services.test.ts`；Web `__test__/extension-market.test.ts`、`extension-updates.test.ts`；Skills `__test__/registry.test.ts` 及 Prompts/MCP 相邻 provider 测试。不能只删 comparator 而不更新契约测试。

### 并行改动与依赖

- 工作区有用户或其他任务的未提交修改，包括上一轮 Skills 排序改动，以及已批准实施中的 `global-workspace-scope.md`。
- 本计划与全局入口计划共享 `packages/extensions/src/agents.ts`、`src/react.tsx`、资源 provider/library 文件及测试。执行前核对最新状态，合并时保留 `globalOnly`、Agent 选择过滤、扫描 key 和过期结果保护。
- 不新建分支、不回滚其他 diff、不批量重写历史计划。扩展仓调查时工作树干净，实施前重新确认。

## 拖拽 SDK 调研与选择

调研时间：2026-11-04。查阅各项目官方文档，并通过 `pnpm view` 只读核对 npm 包的版本、peerDependencies、依赖与许可证；本轮没有安装或运行它们。

| 候选 | 已核实能力与取舍 |
| --- | --- |
| **`@hello-pangea/dnd` 18.0.1（推荐）** | 面向 React 列表，提供 `DragDropContext`、`Droppable`、`Draggable`、拖拽手柄及 mouse/touch/keyboard 传感器；支持键盘移动、取消、自动滚动和屏幕阅读器播报。npm peerDependencies 声明支持 React/React DOM 18 或 19；Apache-2.0。与当前单列侧栏最贴合，免去自行实现传感器和排序交互。代价是新增一个直接依赖，并引入其声明的 `react-redux`、`redux` 等间接依赖。 |
| `@dnd-kit/react` 0.5.3 | 提供 `DragDropProvider`、`useSortable`，默认 PointerSensor 支持鼠标/触摸，另有 KeyboardSensor 与无障碍插件；peerDependencies 支持 React 18 或 19，MIT。可满足需求，且更适合需要扩展复杂拖放的场景；当前 React 适配包是 0.x，新旧 API 不同，针对本次单列表暂不选它。 |
| 现有 `@headless-tree/core` / `@headless-tree/react` 1.7.0 | 已在 Skills 和 Plugins 的文件树使用；官方提供 dragAndDropFeature 和 keyboardDragAndDropFeature。但当前用例是普通列表，复用需引入 tree root、tree item、树形语义及多项 feature，现有文件树尚未启用拖拽；官方资料未核实该版本的触摸拖拽体验。它适合树形数据，此处优先采用列表专用方案。 |

**采用方案**：获批后仅向 `apps/web/package.json` 增加 `@hello-pangea/dnd@18.0.1`，并更新根 `pnpm-lock.yaml`。新增依赖的理由是它直接覆盖侧边栏排序所需的鼠标、触摸和键盘交互，而现有 Headless Tree 面向树形结构；不自行实现 Pointer Events、拖拽碰撞检测或键盘传感器。使用项目包管理器执行 `pnpm --filter web add @hello-pangea/dnd@18.0.1`，这是实施命令，不在规划时运行。

来源：[hello-pangea Draggable](https://github.com/hello-pangea/dnd/blob/v18.0.1/docs/api/draggable.md)、[键盘](https://github.com/hello-pangea/dnd/blob/v18.0.1/docs/sensors/keyboard.md)、[触摸](https://github.com/hello-pangea/dnd/blob/v18.0.1/docs/sensors/touch.md)、[dnd-kit React](https://dndkit.com/react/quickstart/)、[Headless Tree 拖拽](https://headless-tree.lukasbach.com/llm/dnd/overview.md)。包的 React peer 范围和版本以本次 npm 元数据为依据，实施前重新核对。

## 实施阶段

### 1. 持久化扩展安装顺序

**目标**：扩展源自身提供稳定安装顺序，更新和重启不改变已有位置。

**文件**：`packages/core/src/plugins.ts`、`packages/core/src/host/plugins-fs.ts`、`packages/core/src/host/extension-market.ts`（按需接线）、`packages/extensions/__test__/plugins.test.ts`、`packages/core/__test__/extension-market-install.test.ts`

**步骤**：

1. 复用 `<home>/extensions/index.json`，升级为带版本文档 `{ format: 1, order: string[], records: Record<string, PluginRecord> }`。安装信息仍只有一份，不新增顺序文件；`records()` 返回值保持原样。
2. 读取旧对象形态时保留现存记录的枚举顺序；合法且实际存在、未记入 order 的目录按原始发现顺序补到末尾。order 去重、验证 id、跳过已不存在目录；纯数字 id 按原序保留。
3. 删除 `list()` 的 id 排序，输出已记录 order 加本次新增发现。需要补齐 migrate 时把 order 与 records 一起原子写入；不可解析或读取失败的现存文件不能被空记录覆盖，保留原文件并报告顺序持久化失败，扫描降级为当前发现原序。
4. `setRecord` 对已有 id 原位更新且不动 order；新 id 仅在安装成功记录提交时追加。`remove` 同时删除记录和 order 项。
5. 把顺序补齐、`setRecord`、`remove` 的读改写串行化，队列在 store 实例间共享；不扩大到跨进程锁。更新记录失败不得宣称顺序已可靠保存。
6. 保留文件替换、失败回滚和 warning 语义；不按 `installedAt` 排序。更新 `PluginSource.list` 的 sorted 注释与 fixture。

**依赖**：实施前确认扩展空间协议和用户在途修改。

**完成判据**：隔离 home 按 z→a→m 安装后 `list()` 返回 z→a→m；更新 a、重建 store、第二个 store 实例仍保持；卸载 a 重装为 z→m→a。旧记录、无记录目录、数字 id、重复/失效 order、记录写失败和并发写都有覆盖。

### 2. 贯通内核目录与 Agent 注册顺序

**目标**：提供侧边栏的默认安装顺序；手动顺序和头像联动由后续阶段接入，重新激活不会被误当作新安装。

**文件**：`packages/extensions/src/{service,contributions,index}.ts`；Web `src/lib/extension-market.ts`、`src/lib/hub.ts`、`src/components/app-sidebar.tsx`；`packages/resources/{skills,prompts,mcp,plugins}/src/provider.ts` 及必要 library 调用方；Skills `src/extension.ts`、Prompts `src/legacy.ts`、`src/workspace-provider.ts`；扩展仓 `plugins/*/src/{index.tsx,prompts.ts,contracts.ts}` 中实际存在的 Agent 位置 order 声明；两仓相邻 provider/registry 测试和 fixture。

**步骤**：

1. 保持启动顺序“内置装配原序 + source.list 磁盘扩展原序”。Map 原位 replace 不移动旧 id；不按 manifest 名称、category、target id 或加载完成先后重建目录。
2. 在 contributions 模块复用现有 `Placement` 形状，提供一个按目录 owner 序列分组、组内保留声明顺序、目录外裸测注册按原输入序追加的读取函数。遍历分组，不保留 rank comparator。
3. `ExtensionService.contributions` 使用该函数；不能直接返回 `placements()`，以免停用/启用后行跳位。函数从现有 index 导出，不新增服务层。
4. 四类 provider/installer 注册表记录调用方 owner，沿用 effect 回卷；`providers()`/`installers()` 使用同一顺序函数。有内核时以扩展安装序为准，单独 Context 测试下保留注册原序。
5. `installMarketExtension` 在安装并发现后读取 `source.list()` 的完整最新安装序，传给 `ExtensionService.replace(module, installedIds?)` 可选参数。内核在同一串行变更中应用到已加载 stored 扩展后发布 snapshot；内置模块保持原序，未知或加载失败 id 不产生虚假模块。普通 replace 不传参仍原位保留。
6. 后续并发安装以记录提交后的完整 source 顺序为准；remove 删除目录项，后续 add 才追加。
7. AgentGroup 继续消费 target contribution，并保留 `useSkillAgents()` 过滤、勾选、8 行折叠和展开状态；不以 `page.agents` 勾选先后排序。
8. 删除 SkillPlace/PromptPlace 的数字 order 字段及 Agent 选项中的权重 comparator，同步模块自带声明、legacy adapter 映射、扩展仓本地 contracts、注册 fixture 和测试。作用域继续由现有 UI 分组；MCP 现有 scope 排列和声明副本选择不改。同一作用域内的 Agent 选项依所属扩展安装序展示，资源条目合并与排序不动。
9. 搜索 replace 调用、上下文 mock、导出、owner 类型和字符串引用；保留 manifest inject、依赖等待和 incompatible 行为。

**依赖**：阶段 1；与全局入口计划共享的文件先协调到稳定状态。

**完成判据**：默认 z→a→m 的侧栏与资源页 Agent 选项顺序一致；停用/启用 a、更新 z、依赖服务重新出现、重建内核都不改变默认相对顺序；一个扩展提供多个不同 id 的 target/provider 时按声明原序；卸载全部回卷。

### 3. 保存手动顺序并实现拖拽

**目标**：用户可在 Agent 侧边栏直接拖拽，排序持久化并由统一展示顺序驱动；不改资源和 Agent 勾选状态。

**文件**：`packages/core/src/workspace.ts`、`src/host/workspaces-fs.ts`、`packages/core/handlers.ts`；`apps/web/package.json`、根 `pnpm-lock.yaml`、`apps/web/src/lib/workspaces.ts`、`src/components/app-layout.tsx`、`src/components/app-sidebar.tsx`、`src/components/sidebar-rows.tsx`；`packages/extensions/src/agents.ts`、`src/react.tsx`；`packages/extensions/src/builtin/locale-en.ts`、`packages/i18n/zh-cn/src/messages.ts`；`packages/core/__test__/workspaces.test.ts`、`apps/web/__test__/bridge.test.ts`、`packages/extensions/__test__/agents.test.ts` 和必要的侧栏交互测试。

**步骤**：

1. 在现有 `WorkspaceState` / `WorkspacePage` 增加独立的 `agentOrder: string[]`；旧文档默认空数组，解析时过滤空字符串、非字符串和重复 id。`agents` 继续只表达勾选集合。该文档本来是全局的，此字段不按当前工作区分叉。检查 `NO_WORKSPACES`、所有 `WorkspaceState` 显式对象构造、`page()` 和默认工作区修复/迁移写入，使用已有 state 展开保留新字段，避免用户改名、选择、添加或修复工作区时把排序擦掉。
2. 给 `WorkspaceStore` / `WorkspaceService` 增加最小排序写入方法，复用 `WORKSPACE_ROUTE` 的 POST action 和 host 现有 `run` 队列、原子文档写入；验证输入是非空 id 组成且无重复的数组，允许保存暂时不可见的 id。请求成功后才以服务返回的顺序作为已保存状态；失败通过现有错误通道反馈并还原。`samePage` 必须比较 `agentOrder`，否则其他订阅者收不到更新。
3. 客户端排序写入与工作区的其他修改串行；刷新中的旧响应不得覆盖已成功写入的新状态。拖拽放下后保持草稿直到写入成功，期间锁定新的排序提交；失败恢复上一次服务确认值并通过现有 toast 提示。客户端无宿主时同样提示未保存，不使用仅内存状态冒充持久化。
4. 在 `packages/extensions/src/agents.ts` 放最小纯顺序函数：输入“当前侧边栏可见 target 的默认安装序”和已保存 id 数组，先按已保存顺序选取当前可见 target，再把尚未记录的 target 按默认安装序追加。按 id 去重、不丢失源数组，未出现在侧边栏的 id 不产生新行。新建状态合并函数，以已保存顺序为骨架，将当前参与拖拽的可见行按新顺序替换各自的原有可见槽位；隐藏、停用和未加载 id 的相对位置保留。首次拖拽时把当前完整有效列表纳入保存，不能只保存折叠时可见的前 8 项。
5. 通过 `packages/extensions/src/react.tsx` 提供最小共享展示顺序 context/hook，由 `apps/web/src/components/app-layout.tsx` 挂载：边界读取 `useContributions("target")` 与 `useSkillAgents()`，使用与 AgentGroup 完全相同的可见性过滤，再结合 `hub.workspaces` 的已保存顺序。侧边栏和各资源页面从该 hook 获得同一个有效 Agent id 序列；无此边界的独立组件按输入原序回退。排序变更只触发展示重算，不改变 kernel contributions、provider 注册顺序、资源共享库 key 或重新扫描。
6. AgentGroup 内提供可聚焦的拖拽手柄，使用现有浏览器 Pointer Events 实现桌面鼠标和触摸拖动，不新增依赖。拖动前超过阈值才进入排序，拖拽过程有落点指示；拖手柄不触发行点击/勾选。避免把按钮嵌入另一个 button/`role=button`：调整 Agent 行结构，让选择控件与手柄成为独立同级可交互元素，其他 SidebarRow 的导航与工作区行为不变。支持键盘聚焦手柄，以 Space/Enter 开始或提交、上下方向键调整、Escape 取消；以本地化的可访问名称和 live region 说明位置变化，并保持焦点。
7. 保留 8 行折叠和展开行为。折叠状态下可在显示的 Agent 之间拖动，不允许“展开更多”行成为排序目标；需要跨越隐藏区域时先展开再拖。排序完成后仍保留当前折叠状态；隐藏 target、不可见标记及其顺序不得丢失。对同一扩展的多个 target 验证可分别移动和交错。
8. 搜索 `WorkspacePage` / `WorkspaceState` 的所有直接构造、类型、mock、RPC action、客户端回退、tests 和文档；补齐不中断原有工作区选择、重命名和迁移的 fixture。新增 UI 文案同时维护 English 与简体中文。

**依赖**：阶段 1、2 的默认安装顺序。

**完成判据**：安装顺序 z→a→m，拖动 m 到 z 前得到 m→z→a；点击与键盘选择仍正常，刷新/重启/切换工作区均保持。禁用再启用、重装、折叠、隐藏 target、同一包多个 target、保存失败和连续写入均符合上述约定；排序不触发资源扫描或改变数据。

### 4. 对齐 Agent 头像堆叠

**目标**：所有 Agent 头像从左到右跟随侧边栏顺序，保留各模块对头像数量、作用域和去重的现有定义。

**文件**：`packages/extensions/src/components/avatar-stack.tsx`、`src/components/place-picker.tsx`（核对调用契约）；Skills `src/provenance-line.tsx`、`src/library.ts`、`src/page.tsx`、`src/skill-detail-dialog.tsx`；Prompts `src/held.ts`、`src/parts.tsx`、`src/page.tsx`、`src/prompt-detail-dialog.tsx`；Plugins `src/parts.tsx`、`src/page.tsx`、`src/detail-dialog.tsx`；MCP `src/parts.tsx`、`src/card-view.tsx`、`src/list-view.tsx`、`src/server-dialog.tsx`；四模块现有相邻测试和必要的堆叠展示测试。

**步骤**：

1. 复用阶段 3 的展示顺序 hook，并在 `packages/extensions/src/agents.ts` 提供一个最小稳定重排函数：输入每个展示项对应的 target id 和共享 Agent 序列，已知 Agent 按侧边栏顺序排列，同一 Agent 的多个项保留原相对顺序；无法关联的 place/共享标记追加并保留原相对顺序。只返回展示用数组，不修改来源数据、provider 顺序、资源库顺序或安装副本选择。
2. Skills：在 `ProvenanceLine` 将 `placedIn(skill)` 的 place id/scope/dir 与当前 SkillProvider 映射为 target id 后重排 marks；不能直接把 place id 当 Agent id。保留 `holdsOf + takenAt`、不可读取位置的回退图标与标签。同一 Agent 的多个标记仍按现有规则显示。卡片、列表、详情都复用该行。
3. Prompts：对 `heldMarks` 已按 `place.agent` 合并的 marks 做展示排序；卡片 `PromptMarks`、列表 `MarksLine`、详情 `MarksLine` 均使用同一有序结果；不改变合并、计数或读取失败语义。
4. Plugins：用 `PluginHeldBy.client` 映射 target id，在 `HolderStack` 与详情 `MarksLine` 的展示数据处统一重排；不更改 `collectScanned` 的来源/目录选择、插件记录或库行顺序。
5. MCP：通过 `McpAgentPlace.client` 关联 target id，仅对 `AgentStack` 和详情 `MarksLine` 的 held 视图排序；保留每客户端文件一枚头像、不做跨文件去重。`heldPlaces` 若同时用于读取/交付，保留原用途，通过独立展示映射避免改变默认声明与冲突语义。
6. 检查 `PlacePicker`/scope 头像堆叠的上游 `PlaceOption` 构造，利用 provider/place 对应的 Agent id 生成有序展示视图；保持 workspace/global 分组、菜单选项、数量及目标选择的现有语义。不要给通用 `AvatarStack` 添加对业务 Agent 的推断，也不通过 icon 相同来去重。
7. marks、tooltip、`aria-label` 与顺序使用同一份有序数据；`max=5` 截断及 `+N` 必须在排序后计算。测试包含反向手动序、部分 Agent 未安装该资源、同 Agent 多位置、共享/未知标记、超过 5 个头像和排序后即时更新。

**依赖**：阶段 3 的单一有效 Agent 序列。

**完成判据**：侧边栏从 A→B 拖为 B→A 后，四类资源的卡片、列表、详情与位置筛选中的相关头像立即从 B→A 显示，刷新后仍一致；资源行顺序、数量、图标、详情和安装结果不变。

### 5. 对齐扩展页面与市场索引

**目标**：去掉固定分类/名称顺序，扩展安装后行不跳位，两仓契约一致。

**主仓文件**：`apps/web/src/lib/extensions.ts`、`apps/web/src/lib/extension-market.ts`、`apps/web/src/pages/extensions.tsx`、`apps/web/__test__/extension-market.test.ts`，必要时新增扩展页顺序测试。

**扩展仓文件**：`scripts/build-marketplace.mjs`、`README.md`、`package.json` 测试接线；生成器顺序用例放入 `scripts/__test__/build-marketplace.test.mjs`（拟新增，使用 Node 自带测试，不加依赖）。

**步骤**：

1. 扩展页复用现有数据转换，形成保序合并：内置条目保持 snapshot 原序；市场数组逐条映射成已安装视图或未安装视图；未被市场列出的本地 stored 扩展按安装序追加。按 id 去重，状态和 manifest 仍以 kernel 为准。
2. 安装市场条目只替换对应位置的 view，不从市场子序列移动到已安装前缀；更新、卸载、详情、搜索和错误提示保持现有逻辑。
3. 删除 `categoryOrder` 及全部引用，按合并数据首次遇到的分类用 Map 分组；保留分类标签、空组跳过、两列栅格；组内保持原序。
4. 生成器删除 `dirs.sort()` 和 `plugins.sort(id)`，保留 `fs.readdir` 有效目录原序并串行生成。不手工编辑 `marketplace.json`、`lib/` 等生成物。
5. 为生成器提供最小可测边界，用受控非字母序目录结果验证最终 `plugins` 数组；新测试接入扩展仓 `pnpm test`，CI 能实际运行；原有 CLI 与校验路径不变。
6. 扩展仓 README 删除“按 id 排序、跨构建字节一致”的承诺，写明保留发现顺序以及不同文件系统的 `readdir` 不保证相同。
7. 旧已安装插件即使仍携带额外 order 字段，宿主也不使用，无需重装即可获得新行为。两仓源码同步；市场发布仍需另行授权，不写成已上线。

**依赖**：阶段 2。

**完成判据**：非字母序市场数据按原序展示，分类首现序保留；安装/更新/卸载只更新对应条目；扩展页中的 Agent 条目沿用市场输入原序，侧边栏按安装序或手动顺序排列；生成器不再两次重排，文档与测试一致。

### 6. 验证与交付

**目标**：以可执行回归和隔离界面验收证明顺序稳定，完成文档与清理。

**文件**：`docs/extensions.md`、`docs/memory.md`（更新既有列表顺序条目并记录展示排序与协议优先级边界，不新建重复经验）、两仓本次测试与 README；最终稳定后按 AOCI 候选维护。

**步骤**：

1. 每阶段完成后执行下节最小检查；全部完成后运行两仓整体检查。当前源码有其他任务修改，不沿用旧一轮 TS6133 结果，也不静默修复无关在途实现。
2. 使用隔离 hub home、临时扩展 fixture 和本地市场 fixture，确认迁移与写入未触及真实配置。
3. 按 ego-browser 在自有实例验证交互矩阵；重启只影响本次实例，不需要真实 Agent 客户端或联网安装。
4. 最终搜索被移除的 order 字段、`categoryOrder`、相关 comparator、文档旧承诺、re-export、动态 import 与 mock；只清理本次产生的未使用符号。
5. 更新安装记录、手动顺序的作用范围、保存失败反馈及旧数据初始顺序文档。完成 AOCI 维护；若因其他任务 stale 或批次阻塞，记录结果，不擅自维护无关文件。
6. 交付两仓 diff、重要路径、检查结果和未验证限制；不提交、不 push、不发布，不自动归档本计划。

**依赖**：阶段 1–5。

**完成判据**：相关测试、类型和构建通过，浏览器矩阵有实际结果；有既有失败时明确输出与归属，不以“已移除 sort”代替流程验收。

## 验证安排

开发和验证均由主会话执行。规划阶段不运行以下命令。

```sh
# 阶段 1
pnpm --filter @context-hub/core test
pnpm --filter @context-hub/extensions test __test__/plugins.test.ts
pnpm --filter @context-hub/core typecheck

# 阶段 2
pnpm --filter @context-hub/extensions test
pnpm --filter web test __test__/extension-market.test.ts __test__/extension-updates.test.ts
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/prompts test
pnpm --filter @context-hub/mcp test
pnpm --filter @context-hub/plugins test
pnpm --filter @context-hub/extensions typecheck

# 阶段 3：持久化、事件与侧栏交互
pnpm --filter @context-hub/core test __test__/workspaces.test.ts
pnpm --filter @context-hub/extensions test __test__/agents.test.ts
pnpm --filter web test __test__/bridge.test.ts
pnpm --filter @context-hub/core typecheck
pnpm --filter web typecheck

# 阶段 4：头像展示与现有持有逻辑
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/prompts test
pnpm --filter @context-hub/mcp test
pnpm --filter @context-hub/plugins test

# 阶段 5
pnpm --filter web test
pnpm --filter web typecheck

# 最终（共享注册与持久化契约变化）
pnpm test
pnpm typecheck
pnpm --filter web build
```

扩展仓工作目录：

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

新生成器测试接入后，`pnpm test` 应覆盖脚本测试和插件现有测试；`pnpm build` 负责先构建插件再生成 `marketplace.json`，不单独运行会因缺少 `lib` 失败的生成步骤。生成物不暂存、不覆盖用户原有产物。

### 核心回归矩阵

| 输入/操作 | 应观察的结果 |
| --- | --- |
| 按 z→a→m 安装，未设置手动顺序 | 宿主 list、内核目录、Agent 侧边栏和资源页 Agent 选项默认顺序一致，区别于字母序。 |
| 把 m 拖到 z 前，刷新、重启并切换工作区 | 侧边栏保留 m→z→a；四类资源的 Agent 头像及位置选择即时采用此顺序。 |
| 拖动/取消、空目标放下、点击手柄、键盘排序 | 只有有效提交改变顺序；不会触发 Agent 勾选，Escape 取消并恢复焦点。 |
| 同一扩展两个 target 手动交错 | 两个 target 可独立移动到其他 Agent 两侧，不被包级顺序强行合并。 |
| 保存失败、慢响应和连续操作 | 提示失败并还原到服务确认值；旧刷新/写响应不覆盖新排序，其他工作区动作不抹掉顺序。 |
| 折叠超过 8 行、禁用或卸载后重装 | 隐藏项排序不丢；展开后可跨隐藏区域拖动；已记录的 Agent 重新出现回原位置。 |
| 卡片、列表、详情及位置筛选头像 | 相对顺序与侧边栏一致；同 Agent 多位置保留原语义、未知标记不丢，tooltip、读屏名称、5 个上限与 +N 对应排序结果。 |
| 更新 a、停用再启用 z、依赖重新激活 | 相对顺序不变；停用期间行消失，启用后回原位置。 |
| 刷新、重启、第二个 store 读同一 home | 使用同一持久化安装顺序。 |
| 卸载 a 再安装 | z→m→a；删除失败不先抹掉顺序；记录写失败有 warning。 |
| 旧 index、无记录扩展、纯数字 id、失效 order | 记录与扩展不丢失，首次补齐后不再依赖目录枚举。 |
| 两个安装/更新并发、list 与记录写入并发 | 不丢记录、不重复 order，运行目录最终与 source 一致。 |
| 一个扩展包含两个 Agent/provider | 相邻且按声明原序，包级更新/停用/卸载正确回卷。 |
| 全局入口与普通工作区切换、取消/重选 Agent | 过滤、数量、头像、安装目标和旧扫描结果仍正确，剩余顺序保持。 |
| 市场分类首现为 z 类→a 类，条目非字母序 | 分类与组内条目按原序；安装不前置；语言切换不按翻译名称重排。 |
| 非字母序目录结果生成市场 | `plugins` 与发现原序相同，校验和版本选择仍正常。 |

浏览器检查覆盖侧栏超过 8 行的展开/折叠、安装菜单、详情位置、批量入口和扩展页搜索；按 ego-browser 规则启动自有实例，启动命令取项目 `dev.ts` 或已有工作流，不在计划中猜隔离 home 参数。

## 风险与待确认项

1. **旧历史无法补回**：已存在记录只能提供初始可观察顺序，不能可靠重建真实安装先后；升级后开始保证。
2. **index.json 格式变化**：加入显式 order。实施前搜索绕过 PluginStore 直接解析该文件的脚本/fixture 并同步；不改 `state/extensions.json` 布尔协议。旧宿主不保证读取新格式，文档需说明。
3. **发现顺序不等于创建顺序**：上游本身可能按名称提供数据；移除 comparator 后仍可能看起来像字母序，但这是源顺序。市场索引跨系统不再保证字节一致。
4. **展示顺序不能改变协议语义**：资源页 Agent 菜单的展示排序与各客户端安装器覆盖规则、MCP 声明副本选择没有关系，后者保持原样。
5. **并发范围**：保证同一进程内同一 home 的 store 读改写串行；不扩建跨进程事务系统。
6. **共享文件在途改动**：全局入口计划会继续改相同文件；实施前以最新内容为准，不把当前类型错误或测试数量当作基线。
7. **扩展仓发布**：本次只改本地两仓，不发布市场；真实 Agent 客户端和生产用户 home 迁移不作为无授权验收。

待审批的是本次收窄后的范围、旧记录初始化规则和复用 `index.json` 持久化安装顺序的方案；审批前不修改源码或执行验证。
