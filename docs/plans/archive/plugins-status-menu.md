# Plugins 卡片补齐「状态」下拉（对齐 MCP）

## Context

`/plugins` 页每一行/每张卡下方原本只有**两个东西**：「安装到」下拉（`packages/plugin-plugins/src/install-actions.tsx` 的
`ScopeMenu`，手写、灰色描边胶囊），以及包里带更新时多出的「更新」按钮。

同仓 `/mcp` 的卡片与列表是另外一套（`packages/plugin-mcp/src/card-view.tsx:203-207`、
`list-view.tsx:66`）：**「状态」（电源图标）+「安装到」（下载图标）**，两个都是填充胶囊、都带 chevron，
合起来是 `ServerControls`（`packages/plugin-mcp/src/menus.tsx:246`）。

用户要求 plugins 也对齐成这两个按钮，并给了三张设计稿截图：
未安装时的空态、已安装时的开关行、以及「安装到」菜单的布局。

`designs/plugins.pen` 里的一条 Note 说明了这条设计的用意：

> 早先的版本把状态画成开关：开关只有两态，压掉了「在哪个范围启用」；而且开关和行里的按钮会同时说一件事。
> 现在的分工是——**启用范围列说状态，操作列说下一步做什么**，永不同时表达两件事。

### 为什么这不是纯样式活

plugins 侧的「启用/禁用」能力是**半成品**：数据读到了，UI 从来没接。

- `claude plugin list --json` 每条记录带 `enabled` 与 `projectEnabled`；installer **已经**读了 per-record 的
  `scope` 与 `enabled`（`packages/plugin-claude-code/src/installer.ts`），落在 `PluginHeld.enabled`
  （`packages/plugin-plugins/src/provider.ts`）上。
- 但 `collectScanned`（`packages/plugin-plugins/src/rows.ts`）把一个 client 的多条 (pack, scope) 记录折叠成**一条**，
  只留 `scopes: string[]`，**启用态在这里丢掉**。`library.ts` 的 `read()` 是直接透传 `one.packs`，
  所以丢弃点只有这一处。
- `PluginInstaller.setEnabled`（`provider.ts`）已声明、claude-code 已实现，但**没有任何 UI 调用它**；
  `PluginClient.switchable`（`library.ts`）算了之后全仓无人读——是死字段。

> 归档计划 `docs/plans/archive/plugins-tab-row-parity.md:35-40` 当时把这条轴明确列为「不做：
> 这是新增能力，不是对齐 Skills」。本次就是补上它。

## 已实测确认的前提

**1. `claude plugin enable` / `disable` 与 `--scope` 存在**（v2.1.296 实跑 `--help`）：
两者都有 `-s, --scope <scope>  Installation scope: user, project, local (default: auto-detect)`。
`claude plugin --help` 也列出了 `enable` / `disable`。仓内代码从没用过这两个子命令，但 CLI 侧是有的。

**2. 启用状态按「插件 id」存，不按 scope 存。** `enabledPlugins` 的键是 `superpowers@context-hub`
这种 id，**没有 scope 维度**；`installed_plugins.json` 里根本没有 `enabled` 字段。`--scope` 选的是
**写哪个 settings 文件**，文件之间按 `user < project < local` 取一个生效值。

**3. `projectEnabled` 就是工作区那个 settings 文件的值。** 实测（在临时目录里跑）：

| 动作 | `.claude/settings.json` | `.claude/settings.local.json` | `enabled` | `projectEnabled` |
| --- | --- | --- | --- | --- |
| `install --scope project` | `true` | — | true | true |
| `install --scope local` | `true` | `true` | true | true |
| `disable --scope project` | **`false`** | `true` | **true** | **false** |

所以「工作区这一处的开关」可以由 `projectEnabled` 诚实表达，且**读的和写的是同一个文件**。

**4. 全局那一处 hub 改不了。** 它写的是 `~/.claude/settings.json`；而按设计稿与 MCP 的先例，
全局位置显示为「自管」而不是开关（对应 `mcp.detail.place.self` / `mcp.detail.place.selfManaged`）。

## 设计

状态菜单是**列出 agent × 位置 + 该处一个启停**；安装菜单是**列出可选的位置 + 每处已装与否**。

- **工作区（`project`）**：给真开关，写 `claude plugin enable|disable <id> --scope project`。
- **全局（`user`）**：给 `自管` 胶囊，note 是 `客户端自己管`。
- **不支持的 agent**（Codex，`packages/agents-extensions/codex/src/installer.ts` 声明不实现 `setEnabled`）：
  任何位置都不给开关，一律 `自管`。

## 改动

**scope 模型：`local` 移除。** `PluginInstallScope = "user" | "project"`
（`packages/plugin-plugins/src/contract.ts`，带注释说明为什么不留 `local`：它写的是 hub 读不到的个人文件）。
连带 `installer.ts` 的 `SCOPES`、`rows.ts` 的 `SCOPES_OF`（`workspace: ["project"]`）与 `SCOPE_LABELS`、
两份语言表里的 `plugins.scope.local`。

**`workspaceEnabled` 作为新字段。** `PluginHeld`（provider.ts）加 `workspaceEnabled: boolean`，
claude-code 从 `projectEnabled` 读、Codex 恒 `false`；`rows.ts` 的 `HeldBuilder` 与 `PluginHeldBy`
（types.ts）各带一个 `enabled: boolean`（**per agent，不是 per scope** —— 见「已实测确认」第 2 条）。

**`library.setEnabled`。** 照 `install`/`uninstall` 经 `deliver` 调 `installer.setEnabled`。
id 用 agent 自己的完整 id（与 `remove` 对齐）；`installer.setEnabled` 不存在时抛
`plugins.enable.selfManaged` 而不是静默不做。

**`install-actions.tsx` 两个菜单都换成共享的 `PlaceMenu`**
（`packages/extensions/src/components/place-picker.tsx`）——按 工作区/全局 分组、带计数表头。
触发器统一成 MCP 的填充胶囊（`bg-secondary hover:bg-accent` + chevron），
原来「安装到」的透明描边样式一并换掉。

**表格 action 列 `8.5%` → `23.7%`**（`page.tsx`）：原来只放得下一个胶囊，并排两个会被压扁。
其余四列按比例让出空间，总和仍为 100%。

**顺带修的两处既有问题**（都在本次触碰范围内）：

1. `installer.ts` 的 `setEnabled` 原本拼 `` `${id}@${MARKETPLACE}` ``，会拼出
   `ponytail@ponytail@context-hub`；与 `remove` 的口径不一致（后者直接用 agent 的 id）。
   因为一直没人调用所以没暴露。已改为直接用传入的 id。
2. `page.tsx` 里有一份**重复的 `SCOPE_LABELS`**（`rows.ts` 已导出同名常量）。
   移除 `local` 时它先编译失败，现已删除改为导入。

## 验收

```
npx turbo typecheck lint --filter=...@workspace/plugin-plugins   # 44/44
npx turbo build --filter=web                                     # 全量生产编译
cd packages/plugin-plugins    && node scripts/check-plugin-rows.ts      # 60
cd packages/plugin-claude-code && node scripts/check-installer.ts       # 22
cd packages/plugin-plugins    && node scripts/check-plugin-scan.ts      # 19
cd packages/plugin-plugins    && node scripts/check-plugin-library.ts   # 197
cd packages/locale-zh-cn      && node scripts/check-messages.ts         # 592/592
```

新加的断言都做过**自证**（故意改坏 → 确认变红 → 恢复）：
`workspaceEnabled` 那条坏了报 `[false,false]`；命令行那条坏了吐出 `ponytail@ponytail@context-hub`。

真机确认（**未完成**，见下）：`pnpm dev` 打开 `/plugins`，两个按钮与 `/mcp` 并排对照；
点「状态」看到 工作区行的开关 / 全局行的「自管」；拨动开关后
`claude plugin list --json` 的 `projectEnabled` 随之变化；切中文 11 个新键都是中文。

两份语言表的增删（`git diff` 实查）：新增 11 个键
（`plugins.action.enabled`、`plugins.enable.selfManaged`、`plugins.menu.enabled.{title,tally,note,empty}`、
`plugins.place.{none,on,off,self,selfManaged}`），删除 2 个（`plugins.scope.local`、`plugins.scope.hint`）。

## 已知边界与代价

- **`plugins.scope.hint` 已删除**（两份语言表）。它是旧 `ScopeMenu` 底部的注脚，
  而 `PlaceMenu` 没有 footer 插槽，换布局后失去用处。
- **`scopeWords` 的去重规则现在不可达**。那条规则（commit `4b26593`）专为 `project` + `local` 写的
  ——「这个仓库」被「这个仓库，只对我」包含。`local` 一去，两个位置词再也不会互相包含。
  按 AGENTS.md「不擅自删既有代码」**保留**了实现与测试，仅把测试断言改成现有词表能成立的形式。
  要不要顺手删掉，待定。
- **渲染层无测试**（`plugin-plugins` 下没有 `*.test.*`），菜单只能靠打开页面看。
- **Codex 缺字段时的默认值与 claude 相反**：claude 是 `entry.enabled === true`（缺 → `false`），
  Codex 是 `entry.enabled !== false`（缺 → `true`）。既有不一致，本次未动。

## 实施中用户推翻的两版（原计划作废）

计划初稿写的是**上面第 1 条之前的版本**，实施到一半被用户纠正两次，两次都是我把设计稿读漏了：

1. **最初做成了 per-(client, scope) 的开关列表。** 错的：启用状态按插件 id 存（「已实测确认」第 2 条），
   per-scope 的开关在结构上不可能诚实 —— 同一包在 user + project 都装时，拨一处写的是同一个 settings 键。
   这正是 `designs/plugins.pen` 那条 Note 反对的做法，而且我**早先就读到过那段原文却没接上**。
2. **随后改成了完全只读的版本。** 也错：用户指出「状态这一块是设置启用和禁用的」，并给出截图
   （未装时 `启用 / 0 个已启用`；已装时工作区行一个真开关、全局行「自管」胶囊）。

教训与 `docs/memory.md` 里「设计稿里写死的结论要先读完再动手」同类。
**本次能收敛，靠的是实测 `projectEnabled` 与 settings 文件的对应关系**，而不是继续推断。

## 收尾

- 用户确认后把本文件移入 `docs/plans/archive/`（AGENTS.md 要求）。
- 提交建议分两个：一个是 `feat(plugins): ...`（UI + 数据 + 文案），
  一个是 `fix(plugin-claude-code): ...`（`setEnabled` 的 id 拼法 + 其断言）。
