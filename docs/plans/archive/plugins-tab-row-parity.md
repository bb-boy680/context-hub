# Plugins 页 Tab 行对齐 Skills

## Context

`/plugins` 页的页签行（`packages/plugin-plugins/src/page.tsx:990-1007`）目前只有 4 个平铺页签：
全部 / 已安装 / 未安装 / 未收录，全部是普通 `TabsTrigger`，计数恒显、空集不隐藏。

同仓的 `/skills`（`packages/plugin-skills/src/page.tsx:1373-1447`）和 `/mcp`
（`packages/plugin-mcp/src/page.tsx:161-247`）的页签行已经多出三件事：

1. **缺失集页签悬停出批量动作**：`未收录` 悬停出「一键收录」、`需要更新` 悬停出「一键更新」，
   运行时页签图标转 spinner，别处正跑则置灰。
2. **按位置（scope）分组的页签**：`工作区` / `全局`，用 `PlaceScopePicker` 画各 place 的头像堆叠，
   点开是 place 列表，选中即把该 scope 收窄到那一个 place。
3. **空集页签自动隐藏**，当前页签变空时回落到 `全部`。

用户要求把这三件事补到 Plugins 页，位置轴只做 `工作区` / `全局` 两个。

预期结果：`/plugins` 页签行 = 全部 / 已安装 / 未安装 / 未收录 / 需要更新 / 工作区 / 全局，
行为与 `/skills` 一致。

## 已确认的前提

- **`工作区` / `全局` 的映射（本计划的假设，需在执行时留意）**：插件的三个安装位置
  （`PluginInstallScope = "user" | "project" | "local"`，`packages/plugin-plugins/src/contract.ts:70`）
  按现有中文文案分成两轴——`user` 的文案是「整台机器」→ `全局`；`project`「这个仓库」和
  `local`「这个仓库，只对我」→ `工作区`。与 Skills 的 工作区=仓库内、全局=机器级 一致。
- **place 是什么**：插件的 place = 一个能安装插件的 agent（`PluginInstaller`，`provider.ts:108-145`），
  不是目录。所以 place 列表用客户端自己的 mark 与名字，第二行用 scope 自己的文案当 note
  （没有客户端根目录路径可用）。`plugin-claude-code` 声明 `["user","project","local"]`，
  `agents-extensions/codex` 声明 `["user"]` —— 所以 Codex 只出现在 `全局`，不会退化成空列表。
- **数据已经够了，`library.ts` 不用改**：`PluginRow.held: readonly PluginHeldBy[]`
  （`types.ts:59`）已带每个客户端自己的 scope 词表；`PluginClient.scopes` 带该 agent 会往哪些 scope 装。

## 不做（超出本次范围，已知）

- 设计稿 `designs/plugins.pen` 里的 `已启用 / 已停用` 轴：代码里 `PluginHeld.enabled`
  （`provider.ts:91`）和 `PluginInstaller.setEnabled`（`provider.ts:139`）存在，但本侧全部丢弃
  （`library.ts:86-93`、`rows.ts:133-164`），`PluginClient.switchable` 全仓无人使用。
  这是新增能力，不是对齐 Skills，本次不碰。
- `plugin-mcp` 的 `UnstoredTab` 保持不动（它是另一个变体：菜单里带计数、没有 running/blocked 态）。
- 窄屏下页签行横向滚动（mcp 的 `w-fit` + 滚动包裹）：本次不做。

---

## 阶段一：把 `ActionTab` 提到共享包

`ActionTab` 现在只在 `packages/plugin-skills/src/page.tsx:910-1003` 内定义、未导出。
它已经是通用形态（icon / label / count / action / actionIcon / state / active / onTab / onAction），
`@workspace/extensions` 已依赖 `@workspace/ui`、`lucide-react`、`react`，可以直接搬进
`PlaceScopePicker` 隔壁。

**改动**

- 新建 `packages/extensions/src/components/action-tab.tsx`：把 `ActionTab`（连同它的文档注释）
  从 `plugin-skills/src/page.tsx:910-1003` 原样搬过来并 `export`。类型 `ExtensionIcon` 改从
  `../types.ts` 取，`LucideIcon` 从 `lucide-react`，`DropdownMenu*` 从 `@workspace/ui/components/dropdown-menu`。
- `packages/extensions/src/components/index.ts`：加一行 `export * from "./action-tab.tsx"`（其余各行同格式）。
- `packages/plugin-skills/src/page.tsx`：删掉本地定义，改从 `@workspace/extensions/components` import
  `ActionTab`；清理因此不再使用的 `LoaderCircleIcon`（`:15`，`:976` 是 ActionTab 内部唯一的用处）。

**验收**：`/skills` 页行为不变（页签、悬停菜单、spinner 与改前逐像素一致）。

## 阶段二：消息键

英文默认值在 `packages/plugin-plugins/src/messages.ts`，中文在 `packages/locale-zh-cn/src/messages.ts:282-392`
的 `plugins.*` 段。两处都要加，否则 zh 包回落英文。

| key | en | zh |
| --- | --- | --- |
| `plugins.tab.updates` | Updates | 需要更新 |
| `plugins.tab.workspace` | Workspace | 工作区 |
| `plugins.tab.global` | Global | 全局 |
| `plugins.action.adoptAll` | Adopt all | 一键收录 |
| `plugins.action.updateAll` | Update all | 一键更新 |
| `plugins.place.which` | Places | 位置 |
| `plugins.place.all` | All places | 全部位置 |
| `plugins.place.search` | Search places | 搜索位置 |
| `plugins.place.searchClear` | Clear the search | 清除搜索 |
| `plugins.place.searchEmpty` | No place matches. | 没有匹配的位置。 |
| `plugins.location.count` | {count} places | {count} 个位置 |

中文取值直接抄同义的 `skills.*` / `mcp.*` 现有文案（`locale-zh-cn/src/messages.ts:99-118, 396-440`）。
`PlaceWords.empty` 不传（Skills 也不传，`plugin-skills/src/page.tsx:163-170`）。

批量动作的提示不复用新增键：成功不弹（徽章与计数自己会变，与 Skills 一致），
有覆盖复用现有 `plugins.update.overwritten`，失败弹自身 message（同 `checkAll` 的写法，
`page.tsx:1237-1242`）。

**验收**：切到中文时这 11 个键不再回落英文。

## 阶段三：`rows.ts` 的页签轴

`packages/plugin-plugins/src/rows.ts`

- `PluginTab` 扩成 `"all" | "installed" | "available" | "unstored" | "updates" | AssetScope`
  （`AssetScope` 从 `@workspace/extensions` 取；`"workspace" | "global"`）。
- `rowsForTab` 签名加一个收窄参数，对齐 Skills：`rowsForTab(rows, value, delivered, place: string | null)`。
- 新增一个小判据（放 `rowsForTab` 上方，带一行注释说明 scope 词表来自客户端自己）：

```ts
/** A client's own word for a place inside the repository in use, and for a machine-wide one. */
const WORKSPACE_SCOPES = ["project", "local"]
const USER_SCOPES = ["user"]

function holdsIn(row: PluginRow, scopes: readonly string[], place: string | null): boolean {
  return row.held.some(
    (hold) =>
      (place === null || hold.client === place) &&
      hold.scopes.some((scope) => scopes.includes(scope))
  )
}
```

- `case "updates": return rows.filter((row) => row.outdated === true)`
- `case "workspace": return rows.filter((row) => holdsIn(row, WORKSPACE_SCOPES, place))`
- `case "global": return rows.filter((row) => holdsIn(row, USER_SCOPES, place))`

`outdated` 只在有库记录的行上是 `true`，`heldRow` 根本不带这个字段（`rows.ts:167-189`），
所以 `=== true` 天然排除只有 agent 持有的行；且 `outdated === true` 蕴含来源是 url 或有校验值的
archive，`local` 永不入集，批量更新不会撞上 `host/update.ts:59-61` 的拒绝。

**必须同步改的自检脚本**：`packages/plugin-plugins/scripts/check-plugin-rows.ts` 直接调
`rowsForTab(catalog, "all", delivered)`（`:271-292`，5 处），签名加参数后会编译不过。同时补新判据的用例
（fixture 里已有 `scope: "user"` / `"project"` 与两个客户端，`:48-103`）：

- `updates`：给一个 `record` 加 `checked: { at, latest: "def456", currentHash: "hash" }`，
  断言它进 `updates` 而没检查过的记录不进。
- `workspace`：`hud` 被 claude-code 在 `project` 持有 → 进；codex 只在 `user` → 不进。
- `global`：两个客户端都进。
- 收窄：`rowsForTab(catalog, "workspace", delivered, "hub.target.codex")` 为空集。

**验收**：`node scripts/check-plugin-rows.ts`（在 `packages/plugin-plugins` 下跑，Node 24 直接跑 `.ts`）
全绿，且失败时先自证——故意改坏一条判据确认它会 FAIL。

## 阶段四：`page.tsx` 接线

`packages/plugin-plugins/src/page.tsx`

1. **`SHELL_TABS`（:77-82）** 追加三项，顺序与 Skills 一致：
   `updates`（`CircleArrowUpIcon`）、`workspace`（`ContainerIcon`）、`global`（`GlobeIcon`）。
   加 `const SCOPE_TABS: PluginTab[] = ["workspace", "global"]`。
2. **状态**：加 `const [narrowed, setNarrowed] = useState<string | null>(null)`
   与 `const [batch, setBatch] = useState<"adopt" | "update" | null>(null)`。
3. **`counts`（:814-822）** 增加 `updates`，其余四项改成传 `null` 作 place
   （计数发生在收窄之前，同 Skills `:1110-1118` 的注释）。
4. **可见页签**：`SHELL_TABS.filter(...)` 掉 `unstored` / `updates` 计数为 0 的项
   （Skills `:1374-1377`）；再加一个 `screenTab` 回落（Skills `:1123-1127`）：
   当前页签若是被隐藏的缺失集，就按 `all` 渲染。
5. **`chosen`**：`narrowed` 只在它属于当前 scope 的客户端时才生效
   （Skills `:1131-1134`，插件没有 `workspaceId`，去掉那半条判据）。
   收窄后的行：`rowsForTab(filtered, screenTab, installed, chosen)`。
6. **`scopePlaces`**：`useMemo`，两个 scope 各一份 `PlaceOption[]`——遍历
   `library.clients`，只留声明了本 scope 内某个 scope 的客户端；
   `{ id, icon, label, note: 该 scope 自己的文案, count: 该客户端在此 scope 持有的包数 }`。
   `count` 从 `catalog` 各行的 `held` 里数（不能用 `client.delivered`，那只覆盖本库安装的包）。
   `note` 用现有 `plugins.scope.*` 文案（全局→「整台机器」；工作区→「这个仓库 · 这个仓库，只对我」）。
7. **`placeWords(t)`**：本包内一个 6 行私有函数（Skills、MCP 各有一份同形实现，照此办理），
   返回 `PlaceWords`，`count` 走 `plugins.location.count`。
8. **页签渲染（:991-1006）** 改成按 `item.value` 分三支，与 Skills `:1379-1446` 同构：
   - `unstored` / `updates` → `ActionTab`（`action` 取 `plugins.action.adoptAll` / `updateAll`，
     `actionIcon` 取 `PackagePlusIcon` / `DownloadIcon`，
     `state={batch === null ? "idle" : batch === own ? "running" : "blocked"}`）
   - `workspace` / `global` → `PlaceScopePicker`（`places={scopePlaces[scope]}`、
     `chosen={active ? chosen : null}`、`allLabel={t("plugins.place.all")}`、
     `title={t("plugins.place.which")}`、`onChoose` 里 `setTab(scope); setNarrowed(id)`）
   - 其余 → 现在的 `TabsTrigger`
9. **批量动作**，照 Skills `adoptAll` / `updateAll`（`:1284-1309`）写：
   - `adoptAll`：`setBatch("adopt")`，顺序遍历未收录行 `await library.adopt(row.name)`，
     第一个失败即停并 toast；`finally` 清 `batch`。
   - `updateAll`：`setBatch("update")`，顺序遍历 `outdated === true` 的行
     `await library.update(row.id)`，收集每个 `PluginUpdateOutcome`；
     有过 `overwroteEdits` 的行则弹一次 `plugins.update.overwritten`（warning），
     失败则弹错误（title 用其 message）。
   - 两者都从 `catalog`（未收窄的整表）取行，不是当前页签能看到的那些（Skills `:1276-1277` 同）。
10. **`Tabs value` / `TabsContent value`** 换成 `screenTab`。
11. 空态分支（`:1086-1117`）保持：`plugins.empty.tab` 仍服务 已安装/未安装 这两个恒显页签。

**已知代价（沿用 Skills 的写法，不额外优化）**：`library.adopt` / `library.update` 都走
`write()`（`library.ts:304-317`），每次调用都会置 `busy` 并整表重读一次——重读会重新探测每个客户端。
N 个包的批量 = N 次客户端探测。Skills 的批量同样是 N 次重读，本次与之一致。
若实测卡顿，再让 `update` 像 `restore`（`library.ts:364-375`）那样不置 busy、不重读，
由页面在批量末尾 `refresh()` 一次。

**验收**：`pnpm typecheck` 与 `pnpm lint` 全绿。

## 阶段五：跑起来看

`packages/plugin-plugins` 有 assert 式自检脚本（`scripts/check-plugin-*.ts`，无框架依赖，
`node scripts/check-plugin-rows.ts` 直接跑），本次会动到 `rows.ts`，所以它是最先要跑的检查。
渲染部分没有测试（`plugin-plugins`、`plugin-skills`、`extensions` 下均无 `*.test.*`），
页签行只能靠打开页面看。

```
cd packages/plugin-plugins && node scripts/check-plugin-rows.ts
pnpm typecheck
pnpm lint
pnpm dev            # vite，打开 /plugins
```

`/plugins` 上逐条确认：

- 页签行为 全部 / 资产库 / 未收录 / 需要更新 / 工作区 / 全局；未收录、需要更新为空时消失。
- 悬停「未收录」出菜单，菜单项「一键收录」带该集计数；点它跑起来时页签图标变 spinner、
  另一个页签置灰；跑完计数与徽章自己更新。
- 「需要更新」同形，动作是「一键更新」。
- 「工作区」「全局」两个胶囊右侧有客户端头像堆叠，点开出位置菜单，列出客户端与其持有的包数；
  选一个后页签收窄、头像堆叠只剩它；选「全部位置」退回整个 scope。Codex 只出现在「全局」。
- 收窄到某客户端后再切到别的页签，收窄自动失效（同 Skills）。
- 切中文，确认新增的 11 个键都是中文。

同时打开 `/skills` 并排对照，确认两个页签行的间距、高度（44px 槽 + 36px 胶囊）、
激活态（`bg-foreground text-background`）与头像堆叠接缝一致。

## 落地顺序

阶段一 → 阶段二 → 阶段三 → 阶段四 → 阶段五。每阶段单独可编译，
阶段一是纯搬移（Skills 行为应零变化），阶段三、四才动 Plugins 页。

## 实施后的两处修正（用户反馈）

首轮做出来后用户指出两点，已改：

1. **位置菜单里的 Agent 名字没有垂直居中**。`PlaceMenu` 的行是 `items-start`，
   文字列在中日韩两行（名字 + 路径）时看着正常；插件这边 place 的信息只有名字一行，
   18px 的行盒贴在 28px 图标砖顶部，读起来偏高。
   改在共享组件 `packages/extensions/src/components/place-picker.tsx`：
   文字列加 `min-h-7`（= 砖高）并在无第二行时 `justify-center`，勾选图标同样改 `self-center`。
   两行行不受影响——它的内容本来就高过 28px，`min-h-7` 无害；勾选图标仍走原来的 `mt-1`。

2. **`已安装`/`未安装` 两个页签是错的，应该只有一个「资产库」**。
   原来按「本库是否投递过给客户端」切分，这个轴对人不成立；Skills 与 MCP 用的都是
   「资产库 = hub 自己持有文件的行」。
   改法：`PluginTab` 去掉 `installed`/`available` 换成一个 `library`；
   `rowsForTab(rows, value, place?)` 因此不再需要 `delivered` 参数（一并去掉）；
   `library` 与 `unstored` 正好把目录分成两半。
   页签行最终为：全部 / 资产库 / 未收录 / 需要更新 / 工作区 / 全局。
   `plugins.tab.installed`、`plugins.tab.available` 两个键从两份语言表删除，
   新增 `plugins.tab.library`（Library / 资产库）。

## 收尾

- 用户确认计划后，把本文件复制到 `docs/plans/` 并在完成后移入 `docs/plans/archive/`（AGENTS.md 要求）。
- 提交时 Plugins 页与 `packages/extensions` 的搬移分成两个 commit：
  一个是 `refactor(extensions): share the hover-action tab`，一个是 `feat(plugins): ...`。
