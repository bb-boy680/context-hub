# Skills 市场安装弹窗支持安装到指定 Agent

## 背景

`/market/skills` 的安装弹窗在 `packages/market/skills-sh/src/install-dialog.tsx`。当前它只有一条「技能库」目标行、一条 `npx skills add ...` 复制行、冲突/无库提示，以及页脚的「取消 / 安装」。安装动作只做一件事：`library.store.installPackage(row.source, [row.skillId])`，成功后 `library.reload()`、toast、关闭弹窗。

用户要的是弹窗里再列出所有可写的 Agent 位置，每行右侧能直接「+ 安装」，布局与 Skills 详情弹窗的「位置」块一致：分组「工作区」/「全局 Agent」，每行 Agent 图标 + 名称 + 等宽路径，右侧 30px 药丸按钮。

仓库里已经有完全同形的实现，不要自己搭：

- `packages/resources/skills/src/skill-detail-dialog.tsx` 的 `PlacesSection`（511 行起）与它的 `PlaceList` 调用（643 行起）。
- 共享组件 `PlaceList`：`packages/extensions/src/components/place-picker.tsx`（485 行起），从 `@context-hub/extensions/components` 导出。
- 行按钮的 30px 药丸样式：`skill-detail-dialog.tsx` 的 `pill` / `soft`（557–561 行）。

安装到位置的底层能力也已经存在：`useSkillLibrary` 返回的 `install(id, ref)` 调用 `store.installInto(id, ref, installMode)`，随后 `reload()`（`packages/resources/skills/src/library.ts:596`）。它要求技能已经在 hub 技能库里。

## 已核实的事实

| 事实 | 位置 |
| --- | --- |
| 弹窗只接收 `row / open / onOpenChange / library`，`library` 类型是 `MarketLibrary` | `packages/market/skills-sh/src/install-dialog.tsx:17-27` |
| `MarketLibrary` 目前只有 `store / rows / reload / update` | `packages/market/skills-sh/src/rows.ts:16-21` |
| 市场页已有 `places = useReadablePlaces()`，并用 `useSkillLibrary(places) as unknown as MarketLibrary` | `packages/market/skills-sh/src/page.tsx:87-88` |
| `useSkillLibrary` 的返回还包含 `install(id, ref)`、`places`、`workspaceId` | `packages/resources/skills/src/library.ts:67-101`、`727-741` |
| `installPackage` 返回 `SkillImport`，其中 `installed: string[]` 是技能落盘后的目录名 | `packages/resources/skills/src/store.ts:211-218`、`359` |
| `installedRow(rows, source, skillId)` 按「同名 + 同 upstream source」找库内行 | `packages/market/skills-sh/src/rows.ts:46-57` |
| `Skill.places` 是该行被哪些位置持有（`id/scope/dir`） | `packages/resources/skills/src/types.ts:19-25`、`50` |
| `SkillPlace` 自带 `id / labelKey / icon / scope / dir / order` | `packages/resources/skills/src/provider.ts:30-45` |
| `placePath(place)` 已存在（global 加 `~/`），但未从 skills 包入口导出 | `packages/resources/skills/src/library.ts:231-233`、`packages/resources/skills/src/index.ts` |
| 分组/折叠/无工作区文案键已存在，且 i18n 会把同一 locale 的多个包合并 | `packages/resources/skills/src/messages.ts:34-42,79`、`packages/i18n/zh-cn/src/messages.ts:208-216,275`、`packages/extensions/src/i18n.ts:111-121` |
| market 包已依赖 `@context-hub/skills` 与 `@context-hub/extensions` | `packages/market/skills-sh/package.json` |
| 现有测试只覆盖纯函数，配置为 `__test__/**/*.test.ts` | `packages/market/skills-sh/vitest.config.ts`、`__test__/market-rows.test.ts` |

复用文案键：`skills.group.workspace`、`skills.group.global`、`skills.place.expand`、`skills.place.collapse`、`skills.workspace.none`、`market.action.install`、`market.state.installed`、`market.install.running`、`market.install.done`、`market.install.failed`、`market.state.conflict`、`market.state.noLibrary`。不新增语言键，不改 `packages/market/skills-sh/src/i18n/*`。

## 方案

### 数据流

1. 市场页把已经算好的 `places`（`SkillPlace[]`）传给安装弹窗，同时让 `library` 带上 `install` 与 `workspaceId`。
2. 弹窗把 `places` 按 `workspace` / `global` 分组，每行是一个可勾选的卡片：左侧圆形勾选标记、名称、等宽路径，与「技能库」目标行同形。
3. 勾选若干 Agent 后点页脚的「安装」，一次性完成：
   - 技能已在库：直接用 `installed.name`；技能不在库：先 `store.installPackage(row.source, [row.skillId])`，取 `result.installed[0]` 作为库内目录名。
   - 依次调 `library.install(name, ref)`，把选中的每个位置链接进去（`installMarketSkill` 支持多个 ref）。
   - 全部成功：toast 并关闭弹窗；有失败：toast 列出失败原因，弹窗保留。
4. 一个都没勾选时，页脚「安装」维持旧行为：只装到 hub 技能库。
5. 技能已在库且一个都没勾选时，页脚按钮禁用并显示「已安装」。

### 行状态

| 条件 | 行 |
| --- | --- |
| `installedRow(...).places` 里有这个 place id | 已勾选且禁用：这个位置已经由 hub 装好 |
| `installedRow(...).takenAt` 里有这个 place id | 禁用，右侧小字 `market.state.conflict`：位置里有同名技能，链接不进去 |
| `conflict`（库里有同名异源技能） | 所有行禁用；弹窗下方沿用 `market.state.conflict` |
| `library.store === null` | 所有行禁用；沿用 `market.state.noLibrary` |
| `place.scope === "workspace"` 且 `library.workspaceId === null` | 该行禁用，`title` 用 `skills.workspace.none` |
| 安装进行中 | 所有行与关闭按钮禁用；页脚按钮显示 `Loader2Icon` + `market.install.running` |
| 其余 | 可勾选；`aria-checked` 跟随选择 |

### 「技能已在库」与「库里有同名异源技能」是两件事

- `installedRow` 命中：技能在库，位置行必须仍可勾选（这是本次新增的主要路径）。
- `nameConflict` 命中：不能装，沿用现有整窗 blocked 行为。
- 不要用 `nameConflict` 去禁用「已在库」时的位置行；那会把本次功能整个挡掉。

## 阶段 1：导出 placePath 并加安装编排

**执行目标**：把「市场技能 → 库 → 位置」的安装顺序抽成可单测的纯编排，并让市场包能复用 `placePath`。本阶段不改变任何 UI 行为。

### 改动文件

1. `packages/resources/skills/src/index.ts`
   - 把 `placePath` 加进现有的 `./library.ts` 命名导出：
     ```ts
     export { placePath, useSkillAgents, useSkillLibrary, useReadablePlaces } from "./library.ts"
     ```
   - 这是新增导出，不删改现有符号。先 `rg -n "placePath" packages apps` 确认没有同名导出冲突。

2. `packages/market/skills-sh/src/rows.ts`
   - 从 `@context-hub/skills` 增加类型导入：`SkillInstall`、`SkillPlaceRef`。
   - 扩展 `MarketLibrary`：
     ```ts
     export interface MarketLibrary {
       store: SkillStore | null
       rows: Skill[]
       workspaceId: string | null
       reload(): Promise<void>
       update(id: string): Promise<void>
       install(id: string, ref: SkillPlaceRef): Promise<SkillInstall>
     }
     ```
   - 文件头注释补一句：新增的编排只调用调用方传进来的函数，模块本身仍然不直接碰网络或磁盘，避免原注释“None of this touches the network or the disk”被读成对安装行为的保证。
   - 新增可单测的安装编排（放在 `installedRow` 之后）：
     ```ts
     /** The calls an install into one place needs; the market dialog passes its library. */
     export interface MarketInstallLibrary {
       store: Pick<SkillStore, "installPackage"> | null
       rows: readonly Skill[]
       install(id: string, ref: SkillPlaceRef): Promise<SkillInstall>
     }

     /**
      * Put a market skill into every chosen place, through the hub library when
      * the library does not hold it yet. One place failing does not stop the
      * rest; their reasons are reported together. `library.install` reloads.
      */
     export async function installMarketSkill(
       library: MarketInstallLibrary,
       row: Pick<MarketRow, "source" | "skillId">,
       refs: readonly SkillPlaceRef[],
       failure: string
     ): Promise<void> {
       const held = installedRow(library.rows, row.source, row.skillId)
       let name = held?.name
       if (name === undefined) {
         if (library.store === null) throw new Error(failure)
         const result = await library.store.installPackage(row.source, [row.skillId])
         name = result.installed[0]
         if (name === undefined) throw new Error(result.failed[0]?.reason ?? failure)
       }
       const failed: string[] = []
       for (const ref of refs) {
         try {
           await library.install(name, ref)
         } catch (error) {
           failed.push(error instanceof Error ? error.message : String(error))
         }
       }
       if (failed.length > 0) throw new Error(failed.join(" · "))
     }
     ```
   - `MarketLibrary` 结构上会被 `useSkillLibrary(places)` 的返回值满足（后者本来就含 `install` / `workspaceId`）。
   - 改接口前先 `rg -n "MarketLibrary" packages/market/skills-sh` 确认只有 `page.tsx`、`install-dialog.tsx`、`detail-dialog.tsx` 三处引用，没有测试或 fixture 构造它；`detail-dialog.tsx` 只读旧字段，不需要改。

3. `packages/market/skills-sh/__test__/market-rows.test.ts`
   - 增加 `describe("installMarketSkill")`，至少五条：
     1. 技能不在库：`skillId` 用 `"find-skills"`，但 `installPackage` 返回 `installed: ["find-skills-copy"]`（故意与 `skillId` 不同）；断言调用顺序是先 `installPackage`、后 `install("find-skills-copy", ref)`。把实现里的 `installed[0]` 改成 `row.skillId` 时这条必须红。
     2. 技能已在库：`installPackage` 若被调用就抛错；勾两个位置时 `install` 依次收到这两个 ref。
     3. `installPackage` 返回 `installed: []` 且带 `failed[0].reason`：`install` 不被调用，reject 的 message 等于该 reason。
     4. `store === null` 且库内无行：reject 的 message 等于传入的 `failure` 兜底文案。
     5. 第一个位置链接失败：第二个位置仍被尝试，reject 的 message 含第一个位置的失败原因。

### 验收判据

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/market-skills-sh typecheck
pnpm --filter @context-hub/market-skills-sh test
```

- 五条新测试全绿；测试能失败（把 `installed[0]` 换成 `row.skillId` 时第 1 条应红）。
- 阶段结束时市场页仍可正常渲染（本阶段没有改 UI）。

## 阶段 2：接通弹窗的位置列表

**执行目标**：安装弹窗按「技能库」目标行的同款卡片列出工作区 / 全局 Agent 的位置，逐行勾选；点页脚的「安装」一次性装到技能库并链接进所有勾选的位置。

### 改动文件

1. `packages/market/skills-sh/src/install-dialog.tsx`
   - 新增导入：
     - `placePath`、`type SkillPlace` 从 `@context-hub/skills`。
     - `installMarketSkill`、`installedRow` 从 `./rows.ts`。
     - 不再引入 `PlaceList`：它的行没有勾选语义，勾选卡片直接用目标行的类名拼。
   - props 增加 `places: readonly SkillPlace[]`。
   - 状态：
     - `running` 覆盖整次批量安装。
     - `const [selected, setSelected] = React.useState<readonly string[]>([])` 记录勾选的位置 id；`toggle(id)` 增删。
   - 派生值：
     ```ts
     const conflict = nameConflict(library.rows, row.source, row.skillId)
     const installed = installedRow(library.rows, row.source, row.skillId)
     const held = installed?.places ?? []
     const taken = installed?.takenAt ?? []
     const belongs = (id: string) => held.some((hold) => hold.id === id)
     const takenAt = (id: string) => taken.some((hold) => hold.id === id)
     const unavailable = conflict || library.store === null
     const targets = places.filter(
       (place) => selected.includes(place.id) && !belongs(place.id) && !takenAt(place.id)
     )
     ```
     在模块作用域定义 `const SCOPES = ["workspace", "global"] as const`。
   - 删掉原来的 `blocked` 变量；`install()` 的 guard 改用 `unavailable`，并保留显式的 `library.store === null` 供 TypeScript 窄化。
   - 行卡片（「技能库」目标行同样换成图标 + 右侧勾选）：
     - 结构：`flex w-full items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-left`。左侧是 28px Agent 图标砖（与 skills 页位置列表同款 `size-7 rounded-lg bg-surface-raised ring-1 ring-border ring-inset`），中间名称 + 等宽路径，**最右侧才是 20px 圆形勾选标记**。
     - 「技能库」行用 `LibraryIcon` 图标砖、名称 `market.install.target`、右侧固定勾选，不参与选择。
     - 用 `<button type="button" role="checkbox" aria-checked={checked}>`，`aria-label` 带上名称与路径。
     - `checked = belongs(place.id) || selected.includes(place.id)`。
     - 禁用条件：`belongs`（已由 hub 装好）、`takenAt`（位置有同名技能，勾选标记左侧显示 `market.state.conflict` 小字）、workspace 且 `library.workspaceId === null`（`title` 用 `skills.workspace.none`）、`unavailable`、`running`。
     - 分组标题沿用 `skills.group.workspace` / `skills.group.global`，空分组不画。
   - 折叠：每组最多显示 `PLACES_VISIBLE = 8`（与 skills 页位置列表一致），多出来的收在「再展开 {count} 个 / 收起」按钮后；展开状态按 scope 记录，`aria-expanded` 跟随。
   - 安装处理：
     ```ts
     const install = () => {
       if (unavailable || running || library.store === null) return
       if (installed !== undefined && targets.length === 0) return
       setRunning(true)
       installMarketSkill(
         library,
         row,
         targets.map((place) => ({ scope: place.scope, dir: place.dir })),
         t("market.install.failed")
       )
         .then(() => {
           toast.add({
             type: "success",
             title: t("market.install.done").replace("{name}", row.name),
           })
           onOpenChange(false)
         })
         .catch((error: unknown) => {
           toast.add({
             type: "error",
             title: error instanceof Error ? error.message : String(error),
           })
           /* Some places may have landed before one failed; re-read so the
              checked rows and the library agree with the disk. */
           return library.reload().catch(() => undefined)
         })
         .finally(() => setRunning(false))
     }
     ```
   - 页脚：
     - 取消：`disabled={running}`。
     - 安装：`disabled={unavailable || running || (installed !== undefined && targets.length === 0)}`；`running` 时 `Loader2Icon` + `market.install.running`，技能已在库且没勾选时 `market.state.installed`，否则 `market.install.confirm`。
   - 弹窗加最大高度与滚动：`DialogContent` 加 `max-h-[calc(100vh-2rem)]`，中间内容区加 `min-h-0 overflow-y-auto`，位置多时只滚列表，页脚不被顶出视口。
   - 保留：标题、关闭按钮、`npx skills add` 命令行与复制按钮、冲突/无库提示、「取消」按钮。

2. `packages/market/skills-sh/src/extension.ts`
   - 插件图标改用包内的 `../assets/icon.ico`：用 `new URL("../assets/icon.ico", import.meta.url).href` 取 Vite 资产地址，包成一个 `ExtensionIcon`（`<img alt="" className=…>`），manifest 与侧栏 nav 共用。
   - 路径相对 `src/`，写成 `./assets/...` 会指向不存在的 `src/assets`；浏览器里表现为 `naturalWidth = 0`。

3. `packages/market/skills-sh/src/page.tsx`
   - `const library = useSkillLibrary(places) as unknown as MarketLibrary` 改为
     `const library: MarketLibrary = useSkillLibrary(places)`。
   - `<MarketInstallDialog ... library={library} places={places} />`。
   - `detail-dialog.tsx` 不需要改：它只读 `MarketLibrary` 的旧字段；接口加字段是增量。

### 验收判据

```bash
pnpm --filter @context-hub/market-skills-sh typecheck
pnpm --filter @context-hub/market-skills-sh lint
pnpm --filter @context-hub/market-skills-sh test
pnpm --filter web typecheck
```

- 上一条 `useSkillLibrary` 的赋值如果 typecheck 失败，保留原 `as unknown as MarketLibrary` 并在阶段报告里写明原因；不要为此改 `library.ts` 的返回类型。
- `rg -n 'skills\.(group|place|workspace)|market\.(action\.install|state\.installed|install\.running)' packages/market/skills-sh/src` 只能看到复用键，`packages/market/skills-sh/src/i18n/{en,zh-cn}.ts` 没有新增键。
- 页面仍能正常打开，市场表格行与详情弹窗不受影响（详情弹窗只用到旧字段）。

## 阶段 3：验收安装路径（受端口与真实目录约束）

目的：验证「市场行 → 弹窗 → 位置行 → 库 → 位置」的链路，同时不碰真实 `~/.claude/skills`、真实 hub home 和仓库工作区。

**已核实的约束（2026-10-30）**：用户自己的 dev server 正在 `5270`（hub）与 `5271`（Vite）上监听；`apps/web/dev.ts` 与 `hub-port.ts` 把端口写死并 `strictPort`，没有环境变量可覆盖。因此本阶段**不能再起一台隔离 dev server**，也**不能杀掉正在跑的进程**（`docs/memory.md`：只杀自己起的端口）。

据此把验收拆成两层，按「能不能隔离」分工：

### 3a. 逻辑层（必须做，完全隔离）

- `pnpm --filter @context-hub/market-skills-sh test`：阶段 1 的四条 `installMarketSkill` 断言覆盖「不在库 → 先 installPackage 再 install」「已在库 → 只 install」「部分失败 → 用 failed[0].reason」「无 store → 兜底文案」。
- 这些用例用假 store / 假 install，不写任何磁盘；它们是本次新增编排的唯一真相来源。

### 3b. UI 层（只读断言，用用户正在跑的那台）

用 `ego-browser` skill 打开 `http://localhost:5271/market/skills`，**只做不写盘的断言**：

1. 打开任一未安装市场的安装弹窗。
2. 断言弹窗里同时存在：
   - 「技能库」目标行与 `npx skills add` 命令行（保留的既有行为）；
   - 分组标题「工作区」（有全局位置时再断言「全局 Agent」）；
   - 每个位置是一张与「技能库」行同款的勾选卡片：边框/圆角/`bg-muted/40`、左侧 28×28 的 Agent 图标砖、名称 + 等宽路径、**最右侧** 20px 圆形勾选标记（离行右边缘约 13px）；`role="checkbox"` 且 `aria-checked=false`。
3. 断言路径文案：workspace 行是 `.agents/skills` 这类相对路径，global 行带 `~/` 前缀。
4. 点一张卡片，断言 `aria-checked` 变 true、圆形标记出现勾；页脚「安装」仍可用。再点一次恢复 false。
5. 断言弹窗 `max-height` 等于视口减 32px，中间容器 `overflow-y: auto` 且 `min-height: 0`。
6. 折叠分支在真实 Agent 少于 8 个时不可达：临时把 `PLACES_VISIBLE` 调成 2，确认出现「再展开 1 个」、点击后 `aria-expanded=true` 且行数增加、文案变「收起」，然后**立刻还原成 8** 并重跑 typecheck/lint/test。
7. **不要按页脚「安装」**：这台服务器连的是用户真实的 hub home 与真实工作区，确认会写真实目录（`docs/memory.md`：真机验收会写进用户的真实目录）。落盘行为由 3a 的假 store 用例与既有 `installSkillInto` 测试共同覆盖。

### 3c. 可选：需要完整真机链路时先问用户

如果必须看到「点击 → 文件落盘」的完整链路，先征得用户同意二选一：

- 用户临时停掉自己的 dev server，我们按 `CONTEXT_HUB_HOME=<临时目录>` 起一台隔离的（端口 5270/5271，仍是本次启动的进程，收尾只按 PID 杀它）。启动后先 `POST /hub/workspaces {"action":"add","path":"<临时工作区>"}` 把当前工作区指到一个临时目录，**只点 workspace 行（`.agents/skills`），不点带 `~/` 的 global 行**——`CONTEXT_HUB_HOME` 隔离不了 Agent 的真实 home 路径；或
- 用户允许在真实环境装一个**一眼能认出的测试技能**（如 `zz-probe-*`），收尾时删除并复查 `ls -a ~/.context-hub/skills ~/.claude/skills <repo>/.agents/skills`。

两条路都用 GitHub source 的技能；well-known 源的 `npx skills add --json` 不可用。未经同意不做其中任何一项。

### 收尾

```bash
rm -rf <本阶段创建的临时目录>   # 3a 没有临时目录，3b 不产生文件
git status --short             # 只应出现本次源码改动
```

### 验收判据

- 3a 全绿，且故意把 `installed[0]` 换成 `row.skillId` 时对应用例变红。
- 3b 的 DOM 断言全部成立（不是只看「页面没坏」：要看到分组、路径文案与药丸按钮）。
- 收尾后 `git status --short` 没有多出 `.agents/`、`.claude/` 或 `~/.context-hub` 下的改动。
- 汇报里明确区分：3a 覆盖了安装编排，3b 只验证了渲染；「点击安装的真实落盘链路」在 3c 未获批准前**未验证**。
- 隔离 home 下没有外部 Agent 插件，所以「全局 Agent」分组可能不出现；Claude Code 行来自用户环境里注册 `SkillPlace` 的插件，数据驱动同一段代码，不在本阶段强行构造。

### 收尾维护

对本次改动的受管文件跑一次 `aoci_maintain`，按返回候选更新 `packages/resources/skills/src/index.ts`、`packages/market/skills-sh/src/rows.ts`、`install-dialog.tsx`、`page.tsx` 的认知条目；证据不足时用 `aoci_report` 登记，不猜写。

## 不做

- 不改市场表格行的安装按钮、详情弹窗、`npx skills add` 命令行与复制行为。
- 不给安装弹窗加「移除 / 卸载 / 更新」动作；位置行已持有即只读显示「已安装」。
- 不改 `useSkillLibrary`、`installInto`、`installPackage`、skills 的 host handlers 或 Skills 页。
- 不新增 i18n 键，不改 `packages/market/skills-sh/src/i18n/*`；复用 `skills.*` 与 `market.*` 现有键。
- 不新增依赖，不改 `pnpm-lock.yaml`。
- 不做批量安装、自动关闭、安装后跳转 Skills 页。
- 不重构 `install-dialog.tsx` 的其余部分，不顺手清理 `detail-dialog.tsx`。
- 不在真实 `~/.claude/skills`、真实工作区 `.claude/skills` 或 `.agents/skills` 上做点击验收。

## 风险与待确认

1. **`useSkillLibrary` 与 `MarketLibrary` 的结构兼容性**：按接口字段应可赋值，但这是由阶段 2 的 `typecheck` 判定的；失败时保留原 cast，不影响功能。
2. **`installMarketSkill` 的失败顺序**：`installPackage` 成功、`installInto` 失败时，库已写入但行未刷新；阶段 2 的 catch 里补一次 `library.reload()`。这是额外的一次重读，只发生在失败路径。
3. **外部 Agent 插件**：Claude Code 等行依赖用户环境里注册 `SkillPlace` 的插件。隔离验收只能覆盖 shared place；真实环境的行是否出现，取决于插件是否启用，不是本次代码能决定的。
4. **网络与 CLI**：阶段 3 依赖 skills.sh 与 `npx skills`。环境不满足时只能完成代码级验收，汇报里必须写明未验证范围。
