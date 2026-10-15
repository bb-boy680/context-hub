# Plugins 引入 places，两处各自能启用/禁用

## Context

用户要求两件事：

1. plugins 要和 MCP 一样有 **`places`** 声明（MCP 的每个 place 自带 `switchable`）。
2. Claude Code 的**全局（user）与工作区（project）两处都要能启用和禁用**，包括
   「全局装了的插件，工作区也能禁用它」。

### 起点：没有 places，且开关是假的

- `PluginInstaller` 只有扁平的 `scopes: readonly PluginInstallScope[]`，`switchable` 挂在 **client 一级**
  （`PluginClient.switchable`）。「哪个 scope 能拨」没地方声明，于是**硬编码进了 UI**：
  `install-actions.tsx` 的 `place.scope !== "project"`。
- 客户端对每个插件只报**一个** `enabled`，不按文件区分。

## 实测（隔离环境，`CLAUDE_CONFIG_DIR` 指向空目录，未碰真实配置）

| 步骤 | `~/.claude/settings.json` | `<ws>/.claude/settings.json` | 两条记录报的 `enabled` |
| --- | --- | --- | --- |
| 两处都装 | true | true | true / true |
| **`disable --scope user`** | **false** | true | **true / true** ← 读不出来 |
| `disable --scope project` | true | **false** | false / false |
| **只在 user 装，再 `disable --scope project`** | true | **false（新建）** | **false** |

三条结论：

- **两处写入独立**，各自写各自的文件。
- **`enabled` 不按记录区分**：user 文件已是 `false` 时两条记录仍报 `true`（被 project 盖住）。
  所以按记录显示 `enabled` 会在全局那行**说谎**，必须自己读文件。
- **全局装的插件，工作区确实能禁用它**：`.claude/settings.json` 里的 `false` 覆盖全局的 `true`，
  而且**不需要**在 project 有安装记录。这是 Claude Code 的文件链（`user < project`）决定的。

**路径规则**：全局 = `join(CLAUDE_CONFIG_DIR ?? ~/.claude, "settings.json")`；
工作区 = `<workspace>/.claude/settings.json`。两者同一个相对路径 `.claude/settings.json`，
拼在不同的根上。

## 设计

### `PluginPlace`

```ts
export interface PluginPlace {
  id: string
  label: string
  scope: AssetScope            // 相对哪个根：workspace 还是 global
  scopeWord: PluginInstallScope // 客户端自己的词，它的记录与命令都用这个
  switchable: boolean           // 每个 place 各自回答，不是一个 agent 一个
  file?: string                 // 记录本处开关的文件，相对该 scope 的根
  overrides?: readonly string[] // 本处的文件能压过哪些 place（按它们自己的词）
}
```

`overrides` 是这次的关键：文件链是「窄的压宽的」，所以**包所在处之外的、能压过它的 place 也是真开关**。
明写而不是从声明顺序推——菜单的展示顺序和文件的判定顺序是两件事。

claude-code 的两处：

| id | scope | scopeWord | switchable | overrides |
| --- | --- | --- | --- | --- |
| `claude-code-user` | `global` | `user` | true | — |
| `claude-code-project` | `workspace` | `project` | true | `["user"]` |

Codex 一个 place、`switchable: false`（它没有开关）。`local` scope 仍不提供（写的是 hub 读不到的个人文件）。

### 读：`PluginInstaller.switches(tools)`

```ts
export type PluginSwitches = Record<string /* place 词 */, Record<string /* pack id */, boolean>>
```

新增的可选方法。host 侧走**已存在的** `/hub/place-files` 路由（`ctx.host.files`，MCP 就是这么读的），
没有新造动作。文件里**没有**该插件的键时不产生条目——「没说」与「说了 false」是两回事，
调用方对前者回退到客户端自己的答案。

### 数据形状

- `PluginHeld.enabledHere`：**删掉**（换成下面的 `switches`，一个来源）。
- `PluginHeldBy.places[].enabled`：该 place 看到的值 = `switches[词][id] ?? 客户端的答案`。
- `PluginHeldBy.enabled`：客户端自己的答案（`enabled`），作为「文件沉默」时的回退。
- `PluginClient.places` + `PluginClient.switches`：client 一级声明与开关表。
- `ScannedAnswer.places` + `ScannedAnswer.switches`：折叠时用来给每个 place 定组与定值。

### UI：状态菜单列出「在玩的」位置

一个 place 出现在菜单里，当且仅当：

- 包**在**那里（有安装记录），或
- 那里的文件**能压过**包所在的某个 place（`declared.overrides` 命中）。

于是全局装的包会有工作区那一行——那正是用户要的「工作区禁用」。反过来，
只装在 project 的包不会冒出 user 那一行（user 压不过 project，那个开关是假的）。

行尾：`switchable` 且客户端可达 → `<Switch>`；否则「自管」胶囊。
`count` 数的是**文件显式开着**的处数，不含继承。

## 验收

```
npx turbo typecheck lint --filter=...@workspace/plugin-plugins   # 44/44
npx turbo build --filter=web
node packages/plugin-plugins/scripts/check-plugin-rows.ts         # 62
node packages/plugin-claude-code/scripts/check-installer.ts       # 31
node packages/plugin-plugins/scripts/check-plugin-scan.ts         # 19
node packages/plugin-plugins/scripts/check-plugin-library.ts      # 197
node packages/locale-zh-cn/scripts/check-messages.ts              # 593/593
```

新断言（三条都按本仓规矩**自证**过：改坏 → 确认变红 → 恢复）：

1. **每个 place 报自己那份文件的值**（桩：user 开、project 关）→ 坏掉时报两个 `true`
   （就是 CLI 原本的行为）。
2. **真实文件系统**：临时树里建两份 settings，用真的 `createFsPlaceFiles` 跑 → 坏掉时 3 条变红。
3. **places 声明**：两处、都可拨、project 的 `overrides` 含 `user`。
4. **静默文件回退**：文件没提这个包时，该 place 取客户端的答案。

## 已知边界

- **`CLAUDE_CONFIG_DIR` 不跟随**：全局路径用 `userHome()`，与 MCP 同一套解析、
  同一个边界（MCP 的 `.claude.json` 同样如此）。沿用而非新造，边界写在代码注释里。
- **继承与显式分不开**：一个 place 的文件沉默时，显示的是它看到的值（继承来的），
  开关本身分不出「显式开着」和「没提过」。两态开关的固有限制，MCP 同样如此；
  `count` 用「显式开着」规避了计数上的歧义。
- **渲染层无测试**（`plugin-plugins` 下没有 `*.test.*`），两个菜单只能靠打开页面看。

## 明确不做

- **不改 `place-files.ts`**（含上面的 `CLAUDE_CONFIG_DIR` 边界）。
- **不重做详情弹窗的 places 面板**（MCP 的详情面板也没有状态开关）。
- **不提供 `local` scope**：写的是 hub 读不到的个人文件。
