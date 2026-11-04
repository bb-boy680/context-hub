# 修复语言切换与 Agent 动态安装后的侧栏更新

- 日期：2026-11-04
- 状态：已完成，用户已验收（2026-11-04）
- 执行者：主 Agent；不创建子 Agent。

## 目标与范围

1. 在设置中切换中英文后，侧栏分组和菜单文字立即跟随语言变化，无须刷新或切换路由。
2. 安装并激活 Agent 扩展后，侧栏立即显示该 Agent；停用、重新启用和卸载也立即反映到列表。
3. 继续启用项目的 React Compiler，只修复与可变服务读取不兼容的共享 Hook。

源码改动限于：

- `packages/extensions/src/react.tsx`：`useI18n`、`useContributions`、`useExtensionContributions`。
- `packages/resources/skills/src/library.ts`：`useSkillProviders`。

不改侧栏布局、Agent 选择规则、安装协议、语言包内容、公共类型、导出、依赖或编译器全局配置；不操作用户真实 Agent 的安装目录。不处理其他模块中尚未实测的类似缓存问题。

## 已确认的现状与依据

### 语言切换

在用户启动的 `http://localhost:5271/` 使用 `ego-browser` 实测：

- 初始语言为 `zh-CN`。
- 点击 English 后，`html.lang` 为 `en`，设置页标题为 `Settings`，但侧栏仍显示「技能」「设置」「扩展」等中文。
- 测试结束已切回原来的中文。

`apps/web/src/components/app-sidebar.tsx` 的 `NavGroup` 只取 `useI18n()` 的 `t`。Vite 实际生成的代码把 `useI18n` 内的翻译函数按稳定的 `ctx` 缓存，语言快照变化时 `t` 的引用不变；编译后的 `NavGroup` 因此复用旧的翻译结果。原有 `useMemo([ctx, state])` 未能阻止编译器单独缓存内层函数。

### Agent 动态注册

通过浏览器在仅使用内存存储的隔离内核中挂载真实 `AppSidebar`，调用安装流程同样使用的 `extensions.replace()`：

- 测试扩展状态为 `active`，`skills.providers()` 已包含测试 Agent。
- 现有侧栏仍无该 Agent。
- 在同一个内核上重新挂载侧栏后，出现 `Agents / Probe Agent`。
- 复现容器已移除，未安装磁盘包，也未修改真实 Agent 配置。

`useSkillProviders` 忽略了 `useExtensionSnapshot()` 的返回值，编译器把 provider 读取结果按 `ctx` 缓存。此外，`SkillService.providers()` 返回内部原位修改的数组；即使重新读取，编译后的 `useSkillAgents()` 仍可能复用按数组引用缓存的 id 列表。因此必须同时保证重新读取和返回新的数组引用。

`useContributions` 和 `useExtensionContributions` 同样通过稳定 Context 读取内部可变注册信息，属于这条动态注册链路的共享边界。

### 已核对的影响范围

- 侧栏：`AppSidebar`、`AgentGroup`、`NavGroup`。
- 扩展贡献消费者：`apps/web/src/lib/navigation.ts`、`apps/web/src/App.tsx`、`app-header.tsx`、设置页、扩展详情以及 MCP 的 target 图标读取。
- 技能位置消费者：`useSkillAgents`、`useReadablePlaces`、`useSelectablePlaces`；仍保持原有过滤和排序语义。
- 安装调用方：`apps/web/src/lib/extension-market.ts` 的 `installMarketExtension` 在导入后调用 `ctx.extensions.replace`，本次不改安装器。
- 既有测试：extensions 的 i18n、services、plugins 测试，以及 skills、web 项目测试。
- 配置：`apps/web/vite.config.ts` 已开启 `react({ compiler: true })`；测试目前使用 Node 环境，没有已配置的组件 DOM 测试环境。

已通过 Context7 核对 React 官方的内部可变对象与自动缓存不兼容说明，以及局部 `"use no memo"` 指令；也用项目已安装的 Oxc 编译器在内存中确认该指令生效，未写入源码。

## 实施阶段

### 阶段一：修复语言订阅

目标：语言状态更新时，翻译函数引用随状态更新，使编译后的消费者重新计算文字。

改动文件：`packages/extensions/src/react.tsx`。

步骤：

1. 给 `useI18n` 添加局部 `"use no memo"`，保留现有基于 `[ctx, state]` 的显式 `useMemo`。
2. 用一行中文注释说明外部服务内部可变，自动缓存会固定翻译函数。
3. 不改变 `I18n` 接口、语言回退、语言持久化或桌面语言同步。

验收：

- `pnpm --filter @context-hub/extensions typecheck` 通过。
- 读取 Vite 实际输出，确认 `useI18n` 保留以语言快照为依赖的显式 memo。
- 使用 `ego-browser` 在同一页面连续切换中文、英文、中文；断言侧栏分组、设置/扩展菜单、页面标题同步变化，全程不刷新。

### 阶段二：修复 Agent 注册信息更新

前置：阶段一完成；同一个共享 Hook 文件继续由主 Agent 编辑。

改动文件：`packages/extensions/src/react.tsx`、`packages/resources/skills/src/library.ts`。

步骤：

1. 给 `useContributions`、`useExtensionContributions` 添加局部 `"use no memo"`，保留现有订阅和服务读取。
2. 给 `useSkillProviders` 添加相同的局部指令，并返回 provider 数组的浅拷贝，使下游编译缓存可以观察到变化。
3. 用简短中文注释解释浅拷贝的必要性；保留 provider 项目本身及顺序，不修改注册服务。

验收：

- `pnpm --filter @context-hub/extensions typecheck`、`pnpm --filter @context-hub/skills typecheck` 通过。
- 用相同的内存隔离内核挂载真实侧栏，执行测试扩展的 `replace → disable → enable → replace → remove`。
- 每次操作都断言注册表和侧栏一致：新增立即出现，停用立即消失，启用立即恢复，替换后展示新名字且无重复，移除后消失；不刷新、不重新挂载。
- 通过实际 Hook 检查 target 贡献、扩展自身贡献、技能安装位置随扩展生命周期变化。

### 阶段三：完成回归与清理

前置：两个修复均已达到阶段验收判据。

源码以外的改动：仅本计划和本次源码对应的 AOCI 条目；必要时为上述浏览器流程在临时目录保存断言脚本，不添加生产依赖或自制测试框架。

步骤与验收：

1. 运行最小相关测试：`pnpm test --project extensions --project skills --project web`。
2. 因共享 Hook 影响多个模块，运行 `pnpm test`、`pnpm typecheck`、`pnpm lint`。
3. 运行 `pnpm --filter web build`，确认生产构建开启编译器时成功；在独立 Hub home 上检查构建页面的语言切换，避免只验证开发形态。
4. 浏览器自检必须含上述可失败的断言，并区分服务实际值和可见 DOM。修改前已完成失败复现，修改后重跑同一动态注册路径。
5. 恢复测试前的语言选择，移除临时渲染容器和仅由本次启动的资源，关闭本次浏览器任务；不停止用户的 5271 服务。
6. 检查最终 diff，保留用户和其他会话已有改动；在源码稳定后仅维护本次触及文件的 AOCI 条目。出现范围外候选不代写。
7. 汇报改动、检查结果与限制；待用户确认实施完成后再归档计划。

## 风险与验证边界

- 这几个 Hook 会在订阅触发后正常重新读取，provider 列表会多一次浅拷贝；数组规模很小，不修改服务内部对象。
- 单测的 Node 环境不能证明 React Compiler 下的界面更新，必须结合真实编译输出及浏览器断言，不能用服务单测全绿替代。
- 当前已复现的是 Web 侧栏。Electron 原生菜单和远程市场下载尚未验收；安装器源码未变，动态激活验证直接覆盖其导入后的 `extensions.replace` 路径。若需要真实市场下载，仅在独立 Hub home 进行。
- 工作区同时存在其他会话的计划/素材变化；不编辑侧栏布局文件，不维护无关 AOCI 候选。

## 自审结论

- 两个用户问题均有真实复现与对应阶段。
- 已补上「provider 原数组引用不变」这一条件，避免只禁用 Hook 内部缓存后，下游仍拿到旧 id 列表。
- 不采用空读 `revision` 或 `void revision` 作为依赖：实际编译输出已表明这类无数据依赖的写法可能被优化掉。
- 改动不新增 API、类型或依赖；不通过强制刷新、重挂载或全局关闭编译器修复。
- 用户已批准实施，并在修复后明确确认验收完成。

## 执行与验收记录

- 两个源码文件共新增 8 行、删除 1 行，未改 API、依赖、安装器或编译器全局配置。
- `pnpm --filter @context-hub/extensions typecheck`、`pnpm --filter @context-hub/skills typecheck` 通过。
- 开发服务器实际编译输出确认 `useI18n` 保留基于 `[ctx, state]` 的显式 memo。
- `ego-browser` 中连续「中文 → English → 中文」的断言通过：侧栏分组、菜单及设置页标题同步，`performance.timeOrigin` 不变，未刷新；已恢复原有中文并检查截图。
- Agent 的独立自动化生命周期回归未完成：临时验证容器导入了与 Vite 带时间戳依赖不同的 React 绑定模块，导致 `useHub: no HubProvider in the component tree`。该失败属于验证容器的 Context 不一致，未记为回归通过。
- 2026-11-04 用户明确表示「我刚刚验收了，任务已经完成」。据此结束开发和额外回归，未继续执行相关/全量单测、全仓 lint/typecheck、生产构建及构建页面检查。
- 已移除隔离渲染容器，关闭本次浏览器任务空间；未启动额外服务，用户的 5271 服务未停止，未安装或卸载真实 Agent 插件。
- 最终源码 `git diff --check` 通过。用户及其他会话的既有工作区改动保留。
- 最终稳定状态已调用一次 `aoci_maintain`，返回 `stopped/blocked`、`scope_change_required`，无更新候选。现有 `.aoci/config.json` 的 scope 变更不属于本任务，未调整配置、未改写索引，也未宣称索引已对齐。
