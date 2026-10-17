# Agent 选择决定资源读取范围

状态：已实施（待确认后归档）

## 背景

四个资源模块（Skills / MCP / Plugins / Prompts）的资源都来自「某个 Agent 的目录」，但侧栏的
Agent 选择此前只影响 Skills 的全局位置：MCP、Plugins、Prompts 完全不看选择，Skills 的工作区
位置也始终读取。结果是一个 Agent 都没选时，四个页面照样读它的文件、跑 `claude plugin list`、
扫描 `.mcp.json`，作用域胶囊和头像也照样出现。

规则：**选中 Agent 才读取它的资源，取消选择就停止**；头像随之出现/消失；一个都没选时作用域
Tab 不再出现。

## 结论

- 两种作用域都停：未选中 Agent 的工作区与全局位置都不读。Hub 自己的共享位置
  （`.agents/skills`、提示词模块的 `.agents/`）继续读取。
- 未选中的 Agent 不出现在「安装到 / 交付到」菜单里，也不能写进去。
- Plugins / MCP 没有可选位置时不显示「工作区」「全局」Tab；Skills 的工作区 Tab 因共享位置保留。

## 实现

一条规则，一个实现：`packages/extensions/src/agents.ts`

- `chosenAgents(workspaces)`：侧栏选择，来自 `hub.workspaces.current().agents`；
  没有 workspace 服务就等于什么都没选。
- `chosenProviders(providers, chosen)`：`shared: true` 的 provider 永远读取，其余按 id 命中才读。
- `useChosenAgents()`（`@context-hub/extensions/react`）：四个模块共用。
- `SkillProvider` / `PromptProvider` 各加可选 `shared`，只由两个模块自己的 provider 注册处传
  `true`；MCP provider 与 PluginInstaller 没有 `shared`，天然按选择过滤。

过滤点在 provider 列表上，菜单、胶囊、详情面板、批量安装全部随之派生：

| 模块 | 过滤点 | Tab 判据 |
|---|---|---|
| Skills | `readablePlaces`；`SkillLibrary.targets()`；页面 `useReadablePlaces` | 作用域没有位置就不画，`screenTab` 同判据回落 `all` |
| MCP | `McpLibrary.places()`；页面 `useChosenAgents` + `chosenProviders` | `tabsToShow(counts, hasPlaces)`；`activeTab` 同判据回落 |
| Plugins | `probeInstallers(chosenProviders(installers, chosen))` | `SHELL_TABS` 过滤 + `screenTab` 回落 |
| Prompts | `promptPlaces(providers, chosen)` | 无作用域 Tab |

两个 store 的订阅键从「文件夹」扩成「文件夹 + 已选 Agent」，并且**比较后立刻前移**——
否则选过一次之后，每条无关 announce 都会触发一次全量重读。

## 明确不做

- 不自动替用户选中任何 Agent。
- 不改侧栏 Agent 列表（它是选择入口）。
- MCP 仍探测 Hub 自己记录里的服务器；Plugins 仍读 Hub 自己的包目录。二者都不是 Agent 资源。
- 不改 state 存储格式，不新增文案。

## 验证

- `pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿（928 条）。
- 浏览器（dev server 5271 → 5270）：未选中时 Plugins/MCP 无作用域胶囊、Skills 只剩共享工作区
  位置、提示词菜单只有 `.agents/commands`；选中 Claude Code 后三页胶囊与头像回来、提示词菜单
  变成 3 个位置；取消选择后完全复原；结束时 `workspaces.agents` 与开始时一致（`[]`）。
- 单元测试钉住「未选中的 provider 不被读取/不被探测」与「选择变化才重读」。
