# 统一资源页面的瀑布流组件

## 背景与范围

- `packages/resources/skills/src/page.tsx` 的 `SkillMasonry` 已使用 `react-responsive-masonry@2.9.0`，技能卡片和加载骨架共用它。组件按内容区宽度设置 1–5 列，断点为 556、846、1136、1426px；`sequential`、24px 横向间距、列宽和卡片高度监听均由当前实现指定。`SkillCard` 和骨架卡片还带 `mb-5`、`break-inside-avoid`。
- `packages/resources/plugins/src/page.tsx` 的 `PluginGrid` 和 `packages/resources/prompts/src/page.tsx` 的网格使用 `@container` + `columns-*`，卡片依靠 `mb-5` 和 `break-inside-avoid` 排列。这两处需要换成与 Skills 相同的 SDK 组件。
- `packages/resources/mcp/src/card-view.tsx` 的 `ServerCardView` 使用 CSS Grid 组织服务卡片，`variables` 的网格用于表单或列表；这些不是现有瀑布流，保持原样。
- Skills 的 SDK 依赖当前只声明在 `packages/resources/skills/package.json`。三页已有的共享组件入口是 `@context-hub/extensions/components`，其导出位于 `packages/extensions/src/components/index.ts`。
- 当前安装的 SDK 实现中，`gutter` 同时影响列之间与列内的 `gap`，且空列不渲染；直接保留 `mb-5` 会与列内 `gap` 叠加，少卡片时则必须验证列宽。节点高度变化、排序和列数改变也要实测，不能仅以源码推断视为验收。

## 阶段一：提取共享 SDK 瀑布流

**文件**：`packages/extensions/src/components/masonry.tsx`（新建）、`packages/extensions/src/components/index.ts`、`packages/extensions/package.json`、`packages/resources/skills/package.json`、`pnpm-lock.yaml`、`packages/resources/skills/src/page.tsx`。

1. 将 `SkillMasonry` 中 SDK 调用及其必要的容器宽度、列宽与高度变化处理迁至共享组件，Skills 正式卡片和 `GridSkeleton` 同时改用该组件。由 `extensions` 直接声明已使用的 `react-responsive-masonry@2.9.0`；删除 Skills 不再直接使用的依赖，使用现有 pnpm 工具更新 lockfile，不添加新库或升级版本。
2. 保留按内容区宽度变化的 1–5 列断点及单张卡片不撑满整行的行为；保留现有 `sequential` 排序，迁移时不更换算法。检查 SDK 对空列的处理；仅保留达到这些行为所需的列宽设置，不设置与 SDK 默认样式重复的 `style`。
3. 清除 Skills 正式卡片和骨架卡片上的 `break-inside-avoid` 及用于旧布局的 `mb-5`；统一由 SDK 的 `gutter` 控制间距，避免额外包装样式重复设置宽度、间距或分栏。若高度监听对现有 `sequential` 行为无实际作用，应通过运行验证后删除；不能为删代码牺牲图片、视频或内容变化后的正确排布。
4. 比对原有 `skillKey`、卡片点击/键盘操作、封面及骨架生命周期；保持列表视图和现有数据流程不变。检查所有 `SkillMasonry` 调用及 imports，SDK 只由声明依赖的包直接导入。

**验收**：`pnpm --filter @context-hub/extensions typecheck`、`pnpm --filter @context-hub/skills typecheck` 和各自 `lint` 通过；在真实浏览器检查 Skills 加载骨架与正式卡片、单条搜索结果、窄/宽内容区及侧栏宽度变化。检查不同高度媒体加载后卡片不重叠、无双重间距、单张卡片列宽与同宽完整列表一致；观察控制台没有循环更新或运行时错误。

## 阶段二：替换 Plugins 和 Prompts 瀑布流

**文件**：`packages/resources/plugins/src/page.tsx`、`packages/resources/prompts/src/page.tsx`。

1. `PluginGrid` 和 Prompts 的 `view === "grid"` 分支改为使用共享组件；保留当前行数据、稳定 key、分页、排序、过滤、空态、详情入口和卡片操作。
2. 删除两处 `@container`、`columns-*`、`gap-x-6` 及对应卡片上的 `mb-5`、`break-inside-avoid` 等仅服务旧分栏的样式。卡片自身颜色、边框、圆角、内容、焦点样式和可访问行为保留，不额外覆盖 SDK 的排列样式。
3. 核对 `PluginCard`、`PromptCard` 的图片/视频宽高更新，验证 SDK 重排后不会改变卡片内按钮和键盘交互；不复制一份 SDK 包装组件，也不让资源包分别引入相同依赖。

**验收**：`pnpm --filter @context-hub/plugins typecheck`、`pnpm --filter @context-hub/prompts typecheck` 及各自 `lint` 通过。检索 `packages/resources/{skills,plugins,prompts}/src`，确认旧瀑布流 `columns-*`、`break-inside-avoid` 和卡片底部间距不再参与布局；仅检查本次瀑布流相关样式，不删除无关 `mb-5`。

## 阶段三：验证页面与收尾

**文件**：仅在需要维护时更新 AOCI 正式索引；`docs/memory.md` 记录本轮用户对计划流程的纠正。保留工作区已有的无关改动。

1. 根据现有项目脚本运行 `pnpm --filter @context-hub/extensions test`、`pnpm --filter @context-hub/skills test`、`pnpm --filter @context-hub/plugins test`、`pnpm --filter @context-hub/prompts test`，并运行 `pnpm --filter web build`。若某包现有检查与本次无关而失败，记录实际错误并区分基线。
2. 使用浏览器验证三页：完整列表、单条搜索结果、无结果及表格切换；在 556、846、1136、1426px 断点两侧检查实际内容区列数，改变侧栏宽度复测。准备高度不同、含图片及视频的隔离测试数据，确认媒体加载前后不重叠；逐页检查列宽、行列间距、键盘打开详情和卡片内操作。使用隔离数据，不操作真实安装、卸载或配置写入。
3. 检查浏览器控制台与服务日志，记录实际验证覆盖和无法构造的数据。以 `git diff --check` 和 `git diff` 复查本次修改，不覆盖已有脏文件。受管文件在本次最终稳定后按仓库 AOCI 规则维护；若工具权限、并发改动或证据不足阻断，说明未完成项，不猜写索引。
4. 只有用户明确确认计划已经完成后，才将本计划移入 `docs/plans/archive/`。

**验收**：上述检查通过；Skills、Plugins、Prompts 的网格均由同一个共享组件调用 SDK；无重复卡片间距或旧 CSS 分栏；列数、单卡宽度及交互均经浏览器核实。记录未覆盖的情况，不把构建通过当作视觉验收。

## 不做

- 不把 MCP 的普通 CSS Grid 或其他表单、表格布局改造成瀑布流。
- 不改资产数据、安装逻辑、搜索过滤逻辑、卡片内容、设计系统主题或其他无关页面。
- 不改 SDK 源码、不添加新的瀑布流依赖、不做与本任务无关的组件重构。

## 自审

- 已按现有搜索结果列出两个旧分栏调用方、Skills 的正式卡片和骨架、共享导出、依赖与 lockfile；MCP 的普通网格明确排除。
- 阶段一先让共享组件在 Skills 中可运行，阶段二再迁移两个调用方，阶段三统一做真实页面与回归验证。
- SDK 安装目录中观测到的实现仅作为当前环境事实，阶段一必须以实际浏览器及安装结果核对，不能把本地依赖实现假定为所有安装环境的保证。
