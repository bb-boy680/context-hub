# Plugins 页跟随工作区

## Context

用户在 `/plugins` 页点侧栏「工作区」列表切到另一个文件夹（截图：工作区 / dsh-context-hub ✓ / new-api / deepseek-harness），
**页面毫无变化**。同仓的 `/skills`、`/mcp-servers` 切同一行时内容会变（实测 MCP 页底部从「3 处声明」变成「4 处声明」）。

## 已实测确认的前提

**1. 切换本身是好的。** headless Edge + CDP 真点一下，`GET /hub/workspaces` 的 `current`
从 `D:\work-space\dsh-context-hub` 变成 `D:\work-space\new-api`，✓ 也跟着换行。侧栏与宿主都没坏。

**2. 变的是插件页该读的东西。** 经开发桥实测（自己的 5273）：

| 工作区 | `.claude/settings.json`（工作区那个文件） | `claude plugin list --json` 的 ponytail（project 记录） |
| --- | --- | --- |
| dsh-context-hub | `{"enabledPlugins":{"ponytail@ponytail":true}}` | `enabled: true`、`projectEnabled: true`、`projectPath: D:\work-space\dsh-context-hub` |
| new-api | 文件不存在（`null`） | `enabled: true`、`projectEnabled: false`、`projectPath: D:\work-space\dsh-context-hub` |

**3. 根因一：`usePluginLibrary` 没有任何工作区依赖。**
`packages/plugin-plugins/src/library.ts` 的 `read` 只以 `service / revision / iconFor / tools` 为 key；
而 `/mcp-servers`（`plugin-mcp/src/library.ts:128` 的 `useCurrentWorkspace`）与
`/skills`（`plugin-skills/src/library.ts:419`）都把当前工作区当**重载键**。
plugins 是唯一漏掉这个键的页面，客户端的 `held` / `switches` 一直停在挂载时读过的那一份。

**4. 根因二：客户端列出的 project 记录不分是谁的。**
`claude plugin list --json` 在 new-api 里**照样**列出 `projectPath` 指向 dsh-context-hub 的那条记录，
而 `readHeld` 只读 `scope`、不读 `projectPath`——于是每个工作区都看到同一份「本仓库装了什么」。
在 new-api 里那一行写着「已装」，点「卸载」会去删一个这里不存在的 project 记录。

## 改动

### 一、当前工作区成为 plugins 的重载键（`packages/plugin-plugins/src/library.ts`）

照 `plugin-mcp` 抄 `NO_LISTENERS` + `useCurrentWorkspace()`，`usePluginLibrary` 里读出 `workspace`，
`read` 里 `void workspace` 并加进依赖。外加 `src/index.ts` 的
`declare module "@deepseek-ai/cordis"` 补 `"hub.workspaces"?: WorkspaceService`（与 mcp / skills 同一写法）。

### 二、只认本仓库的 project 记录（`packages/plugin-claude-code/src/installer.ts`）

`readHeld(output, folder)` 多收一个「在用的文件夹」：一条记录**自己报了 `projectPath` 且不等于**它时跳过；
没报 `projectPath` 的保留（机器级的位置不是文件夹）。`held()` 通过
`tools.files?.workspace()` 拿这个文件夹（拿不到就 `null`，此时一条都不丢，不靠猜）。

`normalize` 从 `provider.ts` 挪到 `locations.ts` 的 `normalizeProjectPath`
（同一个集成里两处都要用它比较文件夹写法：MCP 的项目键、插件的 project 记录）。

## 不做（以及为什么否掉了「用 projectEnabled 兜底」）

**否掉：** 工作区那一处的状态现在读「该文件的值 ?? 客户端对整个包的答案」。我一度打算把兜底换成
`projectEnabled`（归档计划 `plugins-status-menu.md` 里叫 `workspaceEnabled`），让 new-api 读成「未启用」。
**实测证明这是错的**：`~/.claude/settings.json` 里 `enabledPlugins` 有 `ponytail@ponytail: true`，
即这个包是**机器级启用**的，在本机每个仓库都生效——`projectEnabled` 只是「本仓库这一层的文件」，
拿它当答案会把一个真实生效的包报成未启用。`enabled` 才是整条文件链解析后的答案，页面的兜底用它是对的。
new-api 里那行读「这个仓库 · 已启用」是实话，切工作区能看出的差别是**有几个文件这么说**（2 → 1）。

**不做：** 客户端把自己所属项目之外的项目记录也列出来这件事，本次只做了「不认别人的记录」；
若还要在页面上说明「这条记录属于哪个仓库」，属于另一件事。

## 验收

```
npx turbo typecheck lint --filter=...@workspace/plugin-plugins --filter=...@workspace/plugin-claude-code --filter=web  # 44/44
cd packages/plugin-claude-code && node scripts/check-installer.ts   # 34
cd packages/plugin-plugins     && node scripts/check-plugin-rows.ts # 67 / check-plugin-scan.ts 19 / check-plugin-library.ts 209
```

新加的三条断言做过自证：把过滤去掉后「a record naming another folder is left out」立刻变红，恢复后 34 条全绿。

真机（自己的 5273 + headless Edge/CDP，只点侧栏工作区行与开关菜单，用户那台 5173 全程不碰）：

| 工作区 | 插件页「工作区」页签跨度 | ponytail 的位置菜单 |
| --- | --- | --- |
| dsh-context-hub | 工作区 **1** | 启用 **2 个已启用**（本仓库文件 + 机器文件） |
| new-api | 工作区 **0** | 启用 **1 个已启用**（只有机器文件） |

改之前两边都一样（页面文本逐字相同）——现在切一行就换一份读数。

`readHeld` 还单独拿真实 CLI 输出核过一次（`node` 直调，folder 用两个真实路径）：

```
D:/work-space/dsh-context-hub -> ["claude-hud@user","ponytail@user","ponytail@project","warp@user"]
D:/work-space/new-api        -> ["claude-hud@user","ponytail@user","warp@user"]
```
