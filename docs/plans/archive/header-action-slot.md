# Header 操作区插槽与仓库页移除

## 背景与现状

顶栏 `apps/web/src/components/app-header.tsx:23-71` 目前把右侧动作写死在壳里，顺序是：

1. 搜索按钮（`app-header.tsx:42-50`，`hidden lg:flex`，点击回调来自 `apps/web/src/components/app-layout.tsx:32` 的 `onOpenSearch`）。
2. 「连接仓库」按钮（`app-header.tsx:51-60`，`Button` + `render={<Link to="/repository" />}`）。
3. 「同步仓库」按钮（`app-header.tsx:61-67`，演示按钮，徽标数字来自 `app-header.tsx:20-21` 的 `pendingChanges = 3`）。
4. `ThemeToggle`（`app-header.tsx:68`）。

仓库页 `apps/web/src/pages/repository.tsx:361-387` 是纯演示页，全部数据写死在文件内。它同时被三处引用：

- `apps/web/src/App.tsx:7` 导入 `RepositoryPage`，`:13` 的 `designedPaths` 含 `"/repository"`，`:32` 挂载路由。
- `apps/web/src/lib/navigation.ts:43` 的 operate 组内置项（`order: 10`，图标 `GitBranchIcon`）。
- `apps/web/src/components/app-header.tsx:55` 的「连接仓库」链接。

扩展内核的贡献点机制：

- `packages/extensions/src/types.ts:111-123` 的 `ContributionMap` 是点 id 到值类型的唯一映射；`ExtensionPointId` 由它推导（`:126`）。
- `packages/extensions/src/contributions.ts:75-81` 的 `POINT_SERVICES` 把点 id 映射到服务名（例如 `route → routes`、`locale → locales`）；`:83-96` 是 `Context` 增补；`:104-110` 在 `createContributionPoints` 中发布每个点。
- `packages/extensions/src/react.tsx:49-56` 的 `useContributions(point)` 返回当前贡献，内部经 `ctx.extensions.contributions(point)`（`packages/extensions/src/service.ts:187-194`），按 catalog 顺序返回。
- `packages/extensions/__test__/services.test.ts:102-126` 的 `contributor` 只注册 nav；`:199-216` 有三条 nav 生命周期断言。

中英文案：

- `packages/extensions/src/builtin/locale-en.ts:17` 的 `nav.repository`，`:64-65` 的 `header.connectRepo` / `header.syncRepo`。
- `packages/i18n/zh-cn/src/messages.ts:14` 的 `nav.repository`，`:62-63` 的 `header.connectRepo` / `header.syncRepo`。
- `packages/i18n/zh-cn/__test__/messages.test.ts:75-89` 只对「英文表有、中文表缺」报失败；中文表多出的死键只打印，不失败。

包名与命令（已核对）：

- `packages/extensions/package.json:2` 名称是 `@context-hub/extensions`，脚本 `typecheck` / `test` / `lint` 在 `:6-10`。
- `apps/web/package.json:2` 名称是 `web`，不是 `@context-hub/web`；脚本 `typecheck` / `test` / `lint` 在 `:6-14`。
- `packages/i18n/zh-cn/package.json:2` 名称是 `@context-hub/zh-cn`。
- 根 `vitest.config.ts:16-29` 已登记 `packages/extensions/vitest.config.ts` 与 `apps/web/vitest.config.ts`；两个项目的 `name` 分别是 `extensions`（`packages/extensions/vitest.config.ts:11`）和 `web`（`apps/web/vitest.config.ts:13`）。

## 目标

1. 在扩展内核新增贡献点 `header`，值类型 `HeaderContribution = { id: string; order: number; Component: ComponentType }`，生命周期与 nav/target 一致。
2. `AppHeader` 在搜索控件之后、`ThemeToggle` 之前渲染 `useContributions("header")`，按 `order` 升序，组件不传 props。
3. 删除仓库页、`/repository` 路由、侧栏仓库项、header 的「连接仓库 / 同步仓库」按钮，以及只服务它们的 i18n 键和 `pendingChanges`。
4. 为 `header` 贡献点补最小生命周期测试。
5. 全量验证后用一次 `aoci_maintain` 收尾。

## 已确认的决策

1. **点 id 与服务名都用 `"header"`**：点 id 用于 `ContributionMap`、`useContributions("header")`、`ExtensionView.points`；服务名用于 `POINT_SERVICES.header`、`ctx.header`、插件 `inject: ["header"]`。仓库里的 `nav` 就是点 id 与服务名相同的先例；`headers` 容易被读成 HTTP 头，不适合做公开 API。
2. **排序在壳里做**：`useContributions` 返回 catalog 顺序；`AppHeader` 复制数组后按 `order` 升序排序。`Array.prototype.sort` 是稳定排序，`order` 相同时保持 catalog 顺序。
3. **key 用 `${id}:${index}`**：`useContributions` 只返回值、不暴露贡献者 owner，跨插件 `id` 可能重复，所以不能只用 `id`。排序结果稳定时 key 稳定；贡献集合变化导致位置移动时会重新挂载，这是当前 hook 形状下的已知限制。
4. **不加 wrapper**：贡献组件直接作为 `<header>` 的 flex 子元素渲染，沿用现有的 `gap-4`。组件自己负责尺寸与 `shrink-0`；这条写进 `HeaderContribution.Component` 的 JSDoc。
5. **搜索框保留在原位，主题切换留在插槽之后**：本次不把搜索改成插件贡献，也不把 `ThemeToggle` 放进插槽。
6. **导航 order 不动**：删除 `order: 10` 的仓库项后，`/settings` 保持 20、`/extensions` 保持 30。不重排成 10/20，以免破坏扩展用 `order` 插值的约定。

## 不做

- 不把搜索框改成插件贡献，不删除 `apps/web/src/components/search-palette.tsx` 或 `Ctrl/Cmd+K`。
- 不改 `apps/web/src/components/app-layout.tsx` 的 `searchOpen` 状态与快捷键传播；搜索框仍由壳持有。
- 不把 `ThemeToggle` 移进插槽，不改主题逻辑。
- 不为 header 贡献点增加 props、`className`、可见性、去重或校验逻辑。
- 不新增 slot 容器组件、Toolbar 抽象或通用插件区域框架。
- 不更新 `packages/extensions/examples/*` 示例插件来演示 header 贡献。
- 不调整 `/settings`、`/extensions` 的 order，也不改任何资源扩展的 nav order。
- 不修改 `designs/*.pen`、历史计划文档 `docs/plans/archive/*`、README。
- 不手工编辑 `aoci.code.txt` / `.aoci/baseline.json`；只通过阶段六的 AOCI 工具维护。
- 不新增依赖，不顺手清理与本任务无关的死代码。
- 不提交 git（用户未要求）。

## 阶段一：新增 header 贡献点

**改动文件**

- `packages/extensions/src/types.ts`
- `packages/extensions/src/contributions.ts`

**具体改动**

1. `types.ts` 在 `NavContribution`（`:88-100`）之后新增：

```ts
/** One control contributed to the shell's header row. */
export interface HeaderContribution {
  /** The contributor's own id for this control; may repeat across plugins. */
  id: string
  /**
   * Sort rank inside the header; smaller comes first. Equal ranks keep the
   * catalog order `useContributions` returns.
   */
  order: number
  /**
   * Rendered with no props as a direct child of the header's flex row. The
   * component owns its size and spacing, including `shrink-0` when it must
   * not be squeezed by the breadcrumb.
   */
  Component: ComponentType
}
```

2. `types.ts` 的 `ContributionMap`（`:111-123`）在 `nav` 与 `route` 之间新增：

```ts
  /** One control in the shell's header row. */
  header: HeaderContribution
```

`ExtensionPointId` 由 `keyof ContributionMap` 推导，`DeclarativeContributions` 也会自动包含 `header`，不需要额外改 `service.ts` 或 `react.tsx`。

3. `contributions.ts` 的类型导入（`:19-26`）加入 `HeaderContribution`；`POINT_SERVICES`（`:75-81`）加入：

```ts
  header: "header",
```

4. `contributions.ts` 的 `Context` 增补（`:83-96`）加入：

```ts
    /** Controls the shell renders in its header, in their own `order`. */
    header: ContributionPoint<HeaderContribution>
```

5. `contributions.ts` 的 `createContributionPoints`（`:104-110`）加入：

```ts
  new ContributionPoint<HeaderContribution>(ctx, POINT_SERVICES.header)
```

**验收**

- `pnpm --filter @context-hub/extensions typecheck` 通过。
- `pnpm --filter @context-hub/extensions test` 仍全绿（此阶段尚未加新测试）。
- `packages/extensions/src/service.ts`、`packages/extensions/src/react.tsx` 没有改动；`ExtensionService.buildSnapshot` 通过遍历 `POINT_SERVICES`（`service.ts:348-351`）自动把 `header` 计入 `points`。

## 阶段二：顶栏接入插件插槽

**改动文件**

- `apps/web/src/components/app-header.tsx`

**具体改动**

1. 第 18 行的导入改为同时取 `useContributions`：

```ts
import { useContributions, useI18n } from "@context-hub/extensions/react"
```

2. 在 `AppHeader` 内、`useI18n()` 之后加：

```ts
  const contributions = useContributions("header")
  /* Catalog order breaks ties; sort is stable, so equal orders keep it. */
  const headerItems = [...contributions].sort((a, b) => a.order - b.order)
```

3. 在 `<ThemeToggle />`（`:68`）之前插入：

```tsx
      {headerItems.map((item, index) => {
        const Component = item.Component
        return <Component key={`${item.id}:${index}`} />
      })}
      <ThemeToggle />
```

本阶段保留「连接仓库 / 同步仓库」两个按钮（阶段三删除）。因此本阶段的中间顺序是「搜索 → 连接 → 同步 → 插件控件 → 主题」；阶段三删掉两个按钮后即为最终顺序「搜索 → 插件控件 → 主题」。

**验收**

- `pnpm --filter web typecheck` 通过。
- 当前没有任何扩展贡献 `header`，`headerItems` 为空，页面 DOM 与改动前一致；不需要为看到空插槽而造临时贡献。
- `AppHeader` 仍在 `HubProvider` 下渲染（`apps/web/src/main.tsx:17-19`），`useContributions` 不会抛 `useHub: no HubProvider`。

## 阶段三：删除仓库页与入口

**改动文件**

- 删除 `apps/web/src/pages/repository.tsx`（整文件，387 行）。
- `apps/web/src/App.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/components/app-header.tsx`
- `packages/extensions/src/types.ts`
- `packages/extensions/src/builtin/locale-en.ts`
- `packages/i18n/zh-cn/src/messages.ts`

**具体改动**

1. `apps/web/src/pages/repository.tsx`：删除。文件内只有 `RepositoryPage` 及其私有组件/常量，没有其他文件从它导入除 `App.tsx:7` 之外的符号（已全仓搜索确认）。

2. `apps/web/src/App.tsx`：
   - 删除 `:7` 的 `import { RepositoryPage } from "@/pages/repository"`。
   - `:13` 改为 `const designedPaths = ["/extensions", "/settings"]`。
   - 删除 `:32` 的 `<Route path="/repository" element={<RepositoryPage />} />`。

3. `apps/web/src/lib/navigation.ts`：
   - `:1-5` 的图标导入去掉 `GitBranchIcon`，改为一行 `import { BlocksIcon, SettingsIcon } from "lucide-react"`。
   - 删除 `:43` 的 `{ labelKey: "nav.repository", path: "/repository", icon: GitBranchIcon, order: 10 }`。
   - `:17-20` 的 `NavItem.order` 注释把示例 `(10, 20, 30 …)` 改为 `(20, 30 …)`，与删除后的内置项一致。

4. `apps/web/src/components/app-header.tsx`：
   - 删除 `:20-21` 的 `pendingChanges` 常量及其注释。
   - 删除 `:51-67` 的「连接仓库」和「同步仓库」两个 `Button` 块。
   - 删除因此不再使用的导入：`GitForkIcon`、`RefreshCwIcon`（`:1`），`Link`（`:2`），`Button`（`:12`）。保留 `SearchIcon`、`useLocation`、`Breadcrumb*`、`Kbd`、`SidebarTrigger`、`ThemeToggle`。
   - 保留阶段二加的 header 插槽，最终顺序为搜索 → 插件控件 → `ThemeToggle`。
   - 保留 `header.search` 与 `header.workspace` 两个键的调用。

5. `packages/extensions/src/types.ts`：
   - `NavContribution.order` 的注释（`:95-99`）同样把示例 `(10, 20, 30 …)` 改为 `(20, 30 …)`。

6. i18n 删除以下键，两个文件同步删：
   - `packages/extensions/src/builtin/locale-en.ts`：`"nav.repository"`（`:17`）、`"header.connectRepo"`（`:64`）、`"header.syncRepo"`（`:65`）。
   - `packages/i18n/zh-cn/src/messages.ts`：`"nav.repository"`（`:14`）、`"header.connectRepo"`（`:62`）、`"header.syncRepo"`（`:63`）。
   - 不删除 `plugins.source.repo`（它是插件来源词，与仓库页无关）。

**验收**

- `pnpm --filter web typecheck` 通过（`noUnusedLocals` 会抓住任何漏删的导入）。
- `pnpm --filter @context-hub/extensions typecheck` 通过。
- `pnpm --filter @context-hub/zh-cn test` 通过；中文包不再多出这三个死键。
- 在仓库根执行 `grep -rn --exclude-dir=node_modules -E 'RepositoryPage|/repository|nav\.repository|header\.connectRepo|header\.syncRepo|pendingChanges' apps packages`，无输出（`grep` 无命中时退出码为 1，属于预期）。
- 直接访问 `/repository` 时的行为在阶段五浏览器验收：现有 catch-all（当前 `App.tsx:45`）会 `Navigate to="/"`，`/` 的 index 路由再重定向到首个导航页。

## 阶段四：补贡献点生命周期测试

**改动文件**

- `packages/extensions/__test__/services.test.ts`

**具体改动**

1. `contributor` 的 `inject`（`:114`）从 `["nav"]` 改为 `["nav", "header"]`。
2. 在 `contributor.apply` 的 `ctx.nav.register(...)`（`:117-123`）之后加：

```ts
    ctx.header.register({
      id: "test.header",
      order: 50,
      Component: () => null,
    })
```

3. 在现有 `describe("a contribution", ...)`（`:199-216`）之后新增一组三条，与 nav 的三条同构：

```ts
  describe("a header contribution", () => {
    const header = () => kernel.ctx.extensions.contributions("header")

    it("is there, and belongs to the extension that made it", () => {
      expect(header().map((one) => one.id)).toContain("test.header")
      expect(entryOf(kernel, "test.contributor")?.points).toContain("header")
    })

    it("goes out with its extension when it is disabled", async () => {
      await kernel.ctx.extensions.disable("test.contributor")
      expect(header().map((one) => one.id)).not.toContain("test.header")
    })

    it("comes back when the extension is enabled again", async () => {
      await kernel.ctx.extensions.enable("test.contributor")
      expect(header().map((one) => one.id)).toContain("test.header")
    })
  })
```

测试顺序依赖与现有 nav 组相同：nav 组最后把 contributor 重新启用，header 组随后执行；header 组自己也以「启用」结束。

**验收**

- `pnpm --filter @context-hub/extensions test` 全绿，包含原有 nav 三条与新 header 三条。
- 反向自证：临时注释掉 `ctx.header.register({ ... })`，再跑同一命令，header 第一条（存在）与第三条（重新启用后回归）必须失败；恢复注册块后重新跑绿。第二条「停用后消失」在从未注册时会平凡通过，这是预期。
- 不新增 DOM 测试：`apps/web/vitest.config.ts:9-16` 的 `environment` 仍是 `node`，本仓没有 jsdom/testing-library。当前没有可渲染的 header 贡献，排序只能由代码审查保证；若以后要求测试真实贡献的渲染顺序，再引入 DOM 测试环境，不在本次范围。

## 阶段五：全量验证与浏览器验收

**命令验证**

在仓库根依次执行：

```bash
pnpm typecheck
pnpm test
pnpm --filter @context-hub/extensions lint
pnpm --filter web lint
pnpm --filter @context-hub/zh-cn lint
```

`pnpm typecheck` 与 `pnpm test` 是根脚本，分别经 turbo 覆盖全部包与全部 vitest 项目——本次改动触碰了 `ContributionMap` 这个公开契约，值得跑一遍全量，而不是只看三个包。前面阶段仍可用 `pnpm --filter <pkg> typecheck` 做快速反馈。

**浏览器验收**

本仓 dev 是两个固定端口：hub `5270`、Vite `5271`（`apps/web/hub-port.ts:15-19`）。启动前先查这两个端口：`netstat -ano | grep -E ":527[01]" | grep LISTENING`。若已被占用，不要杀进程；先用 `curl http://localhost:5271/` 确认是不是本工作区的 dev server，是则直接用它验收，不是则报告端口冲突并停止浏览器步骤。Vite 默认监听 `localhost`（本机实测解析到 `[::1]`），不要用 `127.0.0.1:5271` 判断它是否在。用 `pnpm --filter web dev` 启动时，按 `AGENTS.md` 使用 `ego-browser` skill 打开 `http://localhost:5271/`。

先把视口设到宽度 ≥ 1024（例如 1440×900）：搜索按钮是 `hidden … lg:flex`（`app-header.tsx:45`），窄视口下它本来就不显示，不能拿窄屏结果判断搜索控件丢了。

检查项：

1. 页面正常渲染，控制台无未捕获错误。
2. 顶栏右侧只剩搜索控件与一个主题切换按钮；页面中不存在 `Connect repo` / `连接仓库` / `Sync repo` / `同步仓库` 文本。
3. 侧栏 operate / 运维 组里没有仓库行；该组仍有环境变量、设置、扩展等运营项（`packages/resources/variables/src/index.ts:55-56` 在 `order: 15` 注册变量页，不能把「只有设置与扩展」当作判据）。
4. 直接访问 `http://localhost:5271/repository`，最终离开 `/repository` 并落到首个导航页（当前预期 `/skills`，由已启用扩展的 nav order 决定），页面不是空白。
5. 当前没有扩展贡献 header 控件，所以搜索与主题按钮之间没有额外控件；这不代表插槽失效——插槽的生命周期由阶段四的测试证明。

收尾：只停自己启动的进程。用 `netstat -ano | grep ":5270" | grep LISTENING` 找到 PID，再 `taskkill //F //PID <pid>`；`dev.ts:55-57` 说明 hub 退出会带停 Vite。不要用 `//IM` 按镜像名杀进程，也不要动其他端口。

**验收**

- 上述命令全绿。
- 浏览器五项检查全部符合。

## 阶段六：AOCI 收尾

**前置检查**

按 `docs/memory.md` 的「AOCI 收尾前先看仓库有没有别人在写」：

```bash
git status --short
find packages apps docs -newermt "-20 minutes" -type f -not -path "*/node_modules/*"
```

出现不属于本次任务的文件或改动时，停止并询问用户，不继续作者化。确认工作树已到达本任务的最终稳定状态后再维护；不要在中间状态调用。

**维护**

1. 调用一次 `aoci_maintain`。预期候选覆盖本次受管对象变化：
   - 修改：`packages/extensions/src/types.ts`、`packages/extensions/src/contributions.ts`、`apps/web/src/components/app-header.tsx`、`apps/web/src/App.tsx`、`apps/web/src/lib/navigation.ts`、`packages/extensions/src/builtin/locale-en.ts`、`packages/i18n/zh-cn/src/messages.ts`。
   - 删除：`apps/web/src/pages/repository.tsx`（预期为 orphan/remove 候选）。
   - `packages/extensions/__test__/services.test.ts` 若在索引中，也按候选处理。
2. 对每个候选，先完整阅读当前源码与必要关联证据，再创作完整的 Tag 与 F/R/A/S；通过 `aoci_update_entry` 一次提交当前机器签发的完整批次，原样保留每项 `source_sha256`、`candidate_id` 与批次身份。
3. 不得手工编辑 `aoci.code.txt`、`.aoci/baseline.json` 或 `aoci.meta.txt`。
4. 若返回 `repair_required`，只修复 findings 明确命中的候选后重提；若 `stopped`，按 AOCI 合同检查 `failed_step`、错误、写入证据与 Recovery，不猜测、不绕过。
5. 维护完成后不再修改任何受管对象；若又改了，重新在最终稳定状态收尾。

**验收**

- `aoci_maintain` 返回 aligned（或工具明确表示无需继续处理）。
- `aoci.code.txt` 不再包含仓库页条目，`app-header.tsx` 的 S 不再写 `pendingChanges`，`navigation.ts` 的 order 说明与实际一致。
- 不为了消除剩余漂移而重复调用维护工具。

## 影响文件清单

| 文件 | 动作 |
| --- | --- |
| `packages/extensions/src/types.ts` | 新增 `HeaderContribution`、`ContributionMap.header`；更新 nav order 注释 |
| `packages/extensions/src/contributions.ts` | 登记 `POINT_SERVICES.header`、`Context.header`、`createContributionPoints` |
| `apps/web/src/components/app-header.tsx` | 加 header 插槽；删两个按钮、`pendingChanges` 与不再使用的导入 |
| `apps/web/src/App.tsx` | 删 `RepositoryPage` 导入、`designedPaths` 项、`/repository` 路由 |
| `apps/web/src/lib/navigation.ts` | 删仓库导航项与 `GitBranchIcon`；更新 order 注释 |
| `apps/web/src/pages/repository.tsx` | 删除 |
| `packages/extensions/src/builtin/locale-en.ts` | 删三个文案键 |
| `packages/i18n/zh-cn/src/messages.ts` | 删三个文案键 |
| `packages/extensions/__test__/services.test.ts` | contributor 注入 `header` 并注册 header；新增三条生命周期断言 |
| `aoci.code.txt` / `.aoci/baseline.json` | 由阶段六 AOCI 工具更新，不手工改 |

## 风险

1. **key 的稳定性有限**：`useContributions` 不暴露 owner，跨插件同 id 只能靠排序后的 index 区分。若以后要求「插件增删时不重挂载其他控件」，需要改 hook 暴露 `{ owner, value }`；本次不做。
2. **插槽组件没有 props**：组件必须自己处理尺寸与 `shrink-0`。这是刻意的契约，已写进 JSDoc；如果后续发现需要统一间距，再加 wrapper 或 props，不在本次提前设计。
3. **浏览器看不到真实 header 贡献**：仓库内没有内置扩展注册 header。浏览器验收只能证明删除结果与空插槽不报错；贡献点生命周期由 `services.test.ts` 证明。
4. **`/repository` 旧链接重定向到首个导航页**：`/repository` 命中 catch-all 后先到 `/`，再由 index 路由转到 `paths[0]`（当前预期 `/skills`），不新增 404 页。
5. **包名易写错**：web 包名是 `web`，不是 `@context-hub/web`；计划中的命令已按真实 `package.json` 写。
6. **AOCI 在阶段六之前是过期状态**：`aoci.code.txt` 仍描述仓库页与 `pendingChanges`，这是预期中间态；不要在阶段一至五中途维护。
