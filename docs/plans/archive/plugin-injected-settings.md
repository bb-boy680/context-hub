# 插件注入设置项（skills 更新设置）

## 背景与现状

### 设置页

`apps/web/src/pages/settings.tsx` 目前把全部分组写死在页面里：

- 行样式是页面私有组件：`SettingText`（`:210-230`）、`SettingRow`（`:233-250`）、`Segmented`（`:282-311`）。
- 分组卡片是页面私有组件 `Group`（`:253-280`），`id` 就是全局搜索滚动的锚点。
- 固定分组依次是 `appearance`（`:566`）、`install`（`:638`）、`images`（`:668`）、`about`（`:703`）。
- 页面用 `useLocation().hash` 在 `:418-424` 主动滚动到锚点；`useSearchPage()` 的 `needle` 用于 `<Highlighted>` 标出搜索词。

### 设置存储

`packages/extensions/src/settings.ts`：

- `HubSettings` 固定为 `layout` / `installMode` / `downloadRemoteImages`（`:29-34`），`readSettings` 只读这三个字段（`:51-65`）。
- `SettingsService.set` 用 `readSettings({ ...this.current, ...patch })` 归一化后写 `settings` 状态文档，并只在固定字段变化时写盘、发 `settings/change`（`:102-114`）。
- 因为 `readSettings` 丢弃未知字段，任何直接塞进文档的插件数据都会在下一次 `set()` 时消失。
- 状态文档落在 `<home>/state/settings.json`（`packages/core/src/host/state-fs.ts:23-24`）。
- React 侧 `useSettings` 在 `packages/extensions/src/react.tsx:114-135`，订阅 `settings/change`。

### 贡献点

`packages/extensions/src/contributions.ts` + `types.ts`：

- `ContributionMap`（`types.ts:175-191`）是点 id 到值类型的唯一映射，`ExtensionPointId` 由它推导（`:194`）。
- `POINT_SERVICES`（`contributions.ts:78-86`）、`Context` 增补（`:88-105`）、`createContributionPoints`（`:113-121`）三处必须同步登记。
- `ContributionPoint.register` 是原型方法，贡献寿命跟随调用方插件的 fiber，停用插件时自动回收。
- React 侧 `useContributions(point)`（`react.tsx:51-57`）已通用，按 catalog 顺序返回。

### skills 更新链路

- 插件定义在 `packages/resources/skills/src/extension.ts:37-93`，`inject` 目前只有 `["nav", "routes", "locales", "search"]`（`:52`）。
- `skillsModuleWith(page)` 的调用方只有两处：`packages/resources/skills/src/index.ts:34` 和 `packages/agents/claude-code/__test__/registration.test.ts:65,126`。页面作为参数传入，是为了让 `extension.ts` 在纯 Node 下也能加载。
- `SkillStore.checkUpdate` / `checkUpdates` / `updateFromUpstream` 在 `packages/resources/skills/src/store.ts:395-424`，实现分别在 `src/host/skills-fs.ts:977-1074` 与 `src/remote-store.ts:237-248`。
- `checkUpdates()` 会把每个能回答的检查结果写回行（`skills-fs.ts:1003-1026`）；`updateFromUpstream()` 覆盖文件并记录新 hash（`:1028-1074`）。
- `store.list()` 不传 `limit` 时返回全部行（`skills-fs.ts:691` 的 `query.limit ?? rows.length`），自动更新不会只处理第一页。
- `outdated()` / `modified()` 目前定义在 `packages/resources/skills/src/library.ts:173-188`：`outdated` = `checked.latest !== upstream.hash`，`modified` = `checked.currentHash !== upstream.hash`。`library.ts` 是页面层，含 React；调度器要复用同一判据，必须把这两个纯函数移到 `store.ts`。
- `SkillStore` 由 `apps/web/src/lib/hub.ts:170-172` 在 `startHub` 中按 host 可用性 provide；内核先构造服务再 `start()` 插件（`packages/extensions/src/kernel.ts:38-54`），所以插件 `apply` 时 `ctx.settings` 一定存在，`hub.skills` 可能不存在。

### 全局搜索

`packages/search/global-search/src/search.ts` 的 `settingsContribution(t)` 用一张手写静态表 `SETTINGS`（`:33-101`），只覆盖壳自己的设置行。新增的插件设置组如果不接进去，搜索不到。

## 目标

1. 新增设置区块贡献点 `settingsSection`，设置页在 `images` 与 `about` 之间渲染贡献的区块。
2. `SettingsService` 增加按插件 id 命名的设置命名空间与 React hook，插件数据与固定设置共用一份 `settings` 文档且互不丢失。
3. skills 插件注入一个设置区块，包含两个配置项：
   - 检查更新时机：`manual`（默认）/ `startup` / `daily` / `hourly`；
   - 发现更新后自动下载：默认关闭，只更新 `outdated && !modified` 的技能；定时检查与手动 Check updates 都会触发。
4. 调度器只在 skills 插件内运行，默认不联网；没有 `hub.skills` 的形态不启动调度。
5. 全局搜索能搜到贡献的设置区块并跳到 `#<id>`。
6. 不新增生产依赖，不重写设置页，不做与需求无关的重构。

## 已确认的决策

1. **贡献点值不引入 `order`。** 设置页只有一个插件插槽，`useContributions` 的 catalog 顺序已经是稳定顺序；等出现第二个插槽需求再加 `order`。值形状：
   ```ts
   interface SettingsSectionContribution {
     id: string          // 设置页锚点：小写、连字符，唯一且不与 appearance/install/images/about 重名
     titleKey: string
     descriptionKey: string
     Component: ComponentType  // 无 props，渲染在 Group 的卡片内部
   }
   ```
2. **插件设置放进现有 `settings` 文档的 `plugins` 字段。** 不新建状态文档：`SettingsService` 已经拥有这份文档、读写和通知，新增一份只会多一套生命周期。`HubSettings` 增加 `plugins: Record<string, unknown>`；`set()` 的入参类型收窄为 `SettingsPatch = Partial<Omit<HubSettings, "plugins">>`，只有 `setPlugin()` 能写插件命名空间。
3. **自动下载对定时检查与手动检查都生效。** 设置页的 “Check updates” 与详情弹窗里的单行 Check 在发现 `outdated && !modified` 的技能后，会立即调用 `updateFromUpstream`；手改过的技能绝不自动覆盖。默认 `autoDownload: false` 时，手动检查仍只检查。
4. **默认值保持现状。** `manual` + `autoDownload: false` 表示升级后不产生任何自动联网或自动写技能文件的行为。
5. **共享设置行样式放在 `@context-hub/extensions/components`。** 下沉 `SettingText` / `SettingRow` / `Segmented`，并加一个 `SettingSwitch` 包住设置页当前那段长 className；`Group` 留在设置页，因为插件只负责卡片内部。
6. **skills 设置组件作为参数传入。** `skillsModuleWith(page, settingsSection)` 保持 `extension.ts` 不含 JSX，纯 Node 的注册测试仍可加载；两个调用方同步更新。
7. **调度器用 `lastCheckAt` 判断 daily/hourly 是否到期。** 该时间写在同一个插件命名空间里；`startup` 不写。定时器用单个 `setTimeout`，不用 `setInterval`，清理挂在 `ctx.effect` 上。到期判断统一由 `msUntilDue(timing, lastCheckAt, now)` 返回剩余毫秒数（`manual` 返回 `null`）。
8. **贡献区块 id 用 `skills-updates`，不加前缀。** 类型 JSDoc 写明不得与壳的四个锚点重名；本次不做运行时校验。

## 不做

- 不新增依赖，不改 `package.json` / `pnpm-lock.yaml`。
- 不把设置页改造成 schema 驱动的通用表单；贡献值就是一个 React 组件。
- 不移动 `Group`，不重画主题/布局预览，不改设置页现有视觉。
- 不改 `checkUpdates` / `updateFromUpstream` 的 hash 规则、覆盖规则和手动更新流程；自动下载只是复用 `updateFromUpstream`，并且绝不碰 `modified` 的技能。
- 不做服务端定时任务或后台常驻进程；调度只在 skills 插件激活期间存在。
- 不为插件设置的每个控件生成全局搜索行；只搜区块标题和描述，结果跳到 `#skills-updates`。
- 不新增锚点命名空间、重复 id 校验或 `order` 字段。
- 不改 README / DESIGN.md：README 只概述原型，不列举贡献点；DESIGN.md 是视觉规范。只更新 `settings.tsx` 与 `global-search/src/search.ts` 的文件头注释。

## 阶段

### 阶段 1：新增 settingsSection 贡献点

**目标**：内核能登记、回收设置区块贡献；还没有任何消费者，仓库保持可运行。

**改动文件**

- `packages/extensions/src/types.ts`
  - 在 `HeaderContribution` / `RouteContribution` 附近新增 `SettingsSectionContribution`。
  - 在 `ContributionMap` 增加 `settingsSection: SettingsSectionContribution`。
- `packages/extensions/src/contributions.ts`
  - 类型导入加 `SettingsSectionContribution`。
  - `POINT_SERVICES` 增加 `settingsSection: "settingsSections"`。
  - `Context` 增补 `settingsSections: ContributionPoint<SettingsSectionContribution>`。
  - `createContributionPoints` 增加 `new ContributionPoint<SettingsSectionContribution>(ctx, POINT_SERVICES.settingsSection)`。
- `packages/extensions/__test__/services.test.ts`
  - `contributor` 的 `inject` 增加 `"settingsSections"`，`apply` 注册一个最小值（`Component: () => null`）。
  - 仿照现有 header 的三条断言，增加 “存在且归属正确 / 停用后消失 / 重新启用后回来”。

**验收**

```bash
pnpm --filter @context-hub/extensions typecheck
pnpm --filter @context-hub/extensions test
pnpm --filter @context-hub/extensions lint
```

通过判据：测试里 `settingsSection` 贡献与 nav/header 一样随插件启停；`ExtensionView.points` 能报告该点。

### 阶段 2：下沉设置行组件并接入设置页

**目标**：设置行的样式只有一个来源；设置页能在 `images` 与 `about` 之间渲染贡献区块。

**改动文件**

- 新建 `packages/extensions/src/components/settings-row.tsx`
  - 迁入 `SettingText`（`settings.tsx:210-230`）、`SettingRow`（`:233-250`）、`Segmented`（`:282-311`）；`Group`（`:253-280`）留在设置页。
  - `Segmented` 改成 `Segmented<T extends string>`，让插件传入 `"manual" | "startup" | "daily" | "hourly"` 不需要 cast。
  - 新增 `SettingSwitch`：接收 `{ checked, onCheckedChange, label }`，内部渲染 `Switch`，沿用设置页图片行现有的 `className`（`settings.tsx:686`），并补 `aria-label={label}`。
  - `SettingText` 继续使用 `./highlight.tsx` 的 `Highlighted`，保留 `needle` 参数。
- `packages/extensions/src/components/index.ts`
  - 导出 `./settings-row.tsx`；文件头说明补一句“设置页与插件设置区块共用的行”。
- `apps/web/src/pages/settings.tsx`
  - 删除私有 `SettingText` / `SettingRow` / `Segmented` 定义，改从 `@context-hub/extensions/components` 导入（这三个组件目前只有本文件使用，已用 grep 确认）。
  - `images` 行的 `Switch` 换成 `SettingSwitch`，传 `t("settings.images.download.title")` 作为 `label`；删除因此不再使用的 `Switch` 导入（`noUnusedLocals` 会报）。
  - 从 `@context-hub/extensions/react` 额外导入 `useContributions`；在组件顶部取 `const sections = useContributions("settingsSection")`。
  - 在 `images` 的 `<Group>` 之后、`about` 的 `<Group>` 之前渲染：
    ```tsx
    {sections.map((section) => (
      <Group
        key={section.id}
        id={section.id}
        title={t(section.titleKey)}
        description={t(section.descriptionKey)}
        needle={needle}
      >
        <section.Component />
      </Group>
    ))}
    ```
  - 文件头注释补充“插件可以贡献设置区块；壳只负责分组外壳与锚点”。

**验收**

```bash
pnpm --filter @context-hub/extensions typecheck
pnpm --filter web typecheck
pnpm --filter @context-hub/extensions lint
pnpm --filter web lint
```

浏览器检查（不写真实 home）：打开 `/settings`，确认 `appearance` / `install` / `images` / `about` 四个分组、图片开关、语言分段控件的外观与改动前一致；此时没有贡献者，页面应保持原样。

### 阶段 3：增加插件设置命名空间与 hook

**目标**：插件可以按自己的 id 读写设置，固定设置写入不会丢插件数据，React 侧能订阅变化。

**改动文件**

- `packages/extensions/src/settings.ts`
  - `HubSettings` 增加 `plugins: Record<string, unknown>`（JSDoc 写明：值对壳不透明，由各自的插件校验/归一化）；`DEFAULT_SETTINGS` 增加 `plugins: {}`。
  - 导出 `SettingsPatch = Partial<Omit<HubSettings, "plugins">>`。
  - `readSettings` 增加：
    ```ts
    plugins:
      typeof record.plugins === "object" &&
      record.plugins !== null &&
      !Array.isArray(record.plugins)
        ? (record.plugins as Record<string, unknown>)
        : {}
    ```
  - `set(patch: SettingsPatch)` 保持现有三字段比较；`readSettings({ ...this.current, ...patch })` 会保留 `plugins`。
  - 新增 `plugin(id: string): unknown` 与 `setPlugin(id: string, value: unknown): void`：
    - `setPlugin` 用 `JSON.stringify(before) === JSON.stringify(value)` 跳过相同值（值本身必须可 JSON 序列化，因为最终写进状态文档）；
    - 写入时构造 `{ ...this.current, plugins: { ...this.current.plugins, [id]: value } }`，且只写盘一次、发一次 `settings/change`。
  - 更新文件头注释：设置文档现在同时保存壳的固定设置和插件自己的命名空间。
- `packages/extensions/src/react.tsx`
  - `SettingsControl.set` 的入参改为 `SettingsPatch`（从 `./settings.ts` 类型导入）。
  - 新增：
    ```ts
    interface PluginSettingsControl<T> {
      value: T
      set(value: T): void
    }
    function usePluginSettings<T>(id: string, fallback: T): PluginSettingsControl<T>
    ```
    订阅仍是 `ctx.on("settings/change", onChange)`；快照是 `ctx.settings.plugin(id)`，为空时返回 `fallback`；`set` 调 `ctx.settings.setPlugin(id, next)`，JSDoc 写明它替换整个命名空间值，调用方要先合并再写。
- `packages/extensions/__test__/settings.test.ts`
  - 所有精确对象断言补 `plugins: {}`（包括 `readSettings(null)`、完整文档、写盘文档）。
  - 新增：
    1. 旧文档没有 `plugins` 时读成 `{}`；`plugins` 是数组/字符串时也回落 `{}`。
    2. `setPlugin("hub.skill.catalog", value)` 写一次、通知一次，`plugin(id)` 返回同一个值。
    3. 先 `setPlugin` 再 `set({ layout: "list" })`，写盘文档仍保留插件值（回归点：`readSettings` 不再丢字段）。
    4. `setPlugin` 写入相同值不写盘、不通知。
    5. 重新构造 kernel 后插件值仍在。

**验收**

```bash
pnpm --filter @context-hub/extensions typecheck
pnpm --filter @context-hub/extensions test
pnpm --filter @context-hub/extensions lint
pnpm --filter web typecheck
```

### 阶段 4：接入 skills 更新设置与调度

**目标**：skills 插件贡献一个设置区块；四个时机选项与自动下载开关生效；默认行为不变。

**改动文件**

- `packages/resources/skills/src/store.ts`
  - 从 `library.ts` 迁入 `outdated()` / `modified()`（参数类型用 `Pick<SkillSummary, "upstream" | "checked">`，`Skill` 结构兼容）。
- `packages/resources/skills/src/library.ts`
  - 删除 `outdated()` / `modified()` 的实现，改为 `import { modified, outdated } from "./store.ts"` 并 `export { modified, outdated } from "./store.ts"`；`page.tsx:28` 的导入不变。
  - `useSkillLibrary` 用 `usePluginSettings<SkillUpdateSettings>(SKILLS_ID, DEFAULT_SKILL_UPDATE_SETTINGS)` 取得设置，并 `readSkillUpdateSettings` 归一化出 `autoDownload`。
  - `checkUpdate(id)`：检查后若 `autoDownload && result.outdated && !result.modified`，`await store.updateFromUpstream(id)`；返回 `{ ...result, recordedHash: result.latestHash, currentHash: result.latestHash, outdated: false }`，让详情弹窗不再显示“可更新”。
  - `checkAll()`：检查后若 `autoDownload`，`const applied = await updateOutdated(store)`；把 `applied.updated.length` 从 `summary.outdated` 扣除，把 `applied.failed` 并入 `summary.failed`；随后已有的 `reload()` 刷新行。
  - 自动更新失败不向页面抛出，随 `summary.failed` 或 `console.warn` 报告。
- 新建 `packages/resources/skills/src/update-settings.ts`（无 JSX，纯 Node 可加载）
  - 类型与默认值：
    ```ts
    type SkillCheckTiming = "manual" | "startup" | "daily" | "hourly"
    interface SkillUpdateSettings {
      check: SkillCheckTiming
      autoDownload: boolean
      lastCheckAt?: string
    }
    const DEFAULT_SKILL_UPDATE_SETTINGS: SkillUpdateSettings = {
      check: "manual",
      autoDownload: false,
    }
    const HOUR_MS = 60 * 60 * 1000
    ```
  - `readSkillUpdateSettings(value: unknown)`：未知 `check` 回落 `manual`，`autoDownload` 只接受 `true`，非法 `lastCheckAt` 丢弃。
  - `msUntilDue(timing, lastCheckAt, now): number | null`：`manual` → `null`；`startup` → `0`（激活时立即检查）；`daily` / `hourly` → 无有效 `lastCheckAt` 时为 `0`，否则 `Math.max(0, lastCheckAt + 周期 - now)`。
  - `updatableNames(rows: readonly SkillSummary[])`：返回 `outdated(row) && !modified(row)` 的 `name`。
  - `updateOutdated(store)`：`store.list()` 后逐个 `updateFromUpstream(name)`；单个更新失败继续下一个，返回 `{ updated: string[], failed: { name, reason }[] }`。参数用 `Pick<SkillStore, "list" | "updateFromUpstream">`，便于测试替身。
  - `runScheduledCheck(store, autoDownload)`：`store.checkUpdates()` 后，`autoDownload` 为 true 时再 `updateOutdated(store)`；参数用 `Pick<SkillStore, "checkUpdates" | "list" | "updateFromUpstream">`。手动检查不经过这里，直接复用 `updateOutdated`。
  - `startUpdateSchedule(ctx, pluginId)`（`pluginId` 由 `extension.ts` 传入 `SKILLS_ID`，避免 `update-settings.ts` 反向 import `extension.ts` 形成循环）：
    - `const store = ctx.get("hub.skills"); if (store === undefined) return`；
    - 读当前设置；`manual` 不建定时器；`startup` 激活时跑一次；`daily` / `hourly` 用 `msUntilDue`：返回 `0` 立刻跑，否则按剩余毫秒 `setTimeout`；
    - 激活不等待检查：用 `void run()`，避免启动被网络阻塞；
    - 单个 `running` 标志防重入；每次跑完在 `finally` 里重新 `schedule()`；
    - `daily` / `hourly` 在 `finally` 里、且当前模式仍是同一档时写 `{ ...current, lastCheckAt: new Date().toISOString() }`，检查失败也写，避免每次刷新重试；随后 `await ctx.get("catalog.skills")?.reload()`（失败只记录，不阻止重排）；
    - 监听 `settings/change`：只有 `check` 变化时才重排（`manual` 清定时器，`startup` 跑一次，`daily` / `hourly` 按 `msUntilDue` 决定）；`autoDownload` 变化不重排；
    - 清理：`ctx.effect(() => { const off = ctx.on("settings/change", onChange); ...; return () => { off(); clearTimeout(timer); disposed = true } })`；`disposed` 后 `run()` 不再写设置、不再 `reload`、`schedule()` 不再建定时器，避免插件卸载后定时器复活；
    - 捕获并 `console.warn` 一次检查失败，不让异常终止后续定时。
- 新建 `packages/resources/skills/src/settings-section.tsx`
  - 组件 `SkillSettingsSection`（从 `./extension.ts` 取 `SKILLS_ID`；`extension.ts` 不 import 本文件，因此不构成循环）：
    - `useI18n()`、`useHub()`、`usePluginSettings<SkillUpdateSettings>(SKILLS_ID, DEFAULT_SKILL_UPDATE_SETTINGS)`；
    - 用 `readSkillUpdateSettings(stored.value)` 归一化；写入时展开当前设置再覆盖一个字段，保留 `lastCheckAt`；
    - 两行：`SettingRow` + `Segmented<SkillCheckTiming>`（manual/startup/daily/hourly）、`SettingRow` + `SettingSwitch`（自动下载；描述写明定时与手动检查后都会下载）；
    - 外壳 `<div className="flex flex-col divide-y divide-border">`，与设置页其他卡片一致；
    - 当 `ctx.get("hub.skills") === undefined` 时，在行下方用已有键 `skills.empty.noLibraryHint` 显示一行提示；控件仍可保存。
- `packages/resources/skills/src/extension.ts`
  - `skillsModuleWith(page: ComponentType, settingsSection: ComponentType)`。
  - `inject` 改为 `["nav", "routes", "locales", "search", "settings", "settingsSections"]`。
  - `apply` 中（构造 `const library = new SkillLibrary(ctx)` 之后）：
    ```ts
    ctx.settingsSections.register({
      id: "skills-updates",
      titleKey: "skills.settings.title",
      descriptionKey: "skills.settings.description",
      Component: settingsSection,
    })
    startUpdateSchedule(ctx, SKILLS_ID)
    ```
  - 注释说明：调度只在这个插件激活期间存在；没有 `hub.skills` 时直接返回；放在 `SkillLibrary` 之后，第一次检查完成时 `catalog.skills` 已经可以 `reload()`。
- `packages/resources/skills/src/index.ts`
  - 导入 `SkillSettingsSection`，改成 `skillsModuleWith(SkillsPage, SkillSettingsSection)`。
- `packages/resources/skills/src/messages.ts`（英文）
  - `skills.settings.title` / `skills.settings.description`
  - `skills.settings.check` / `.description` / `.manual` / `.startup` / `.daily` / `.hourly`
  - `skills.settings.autoDownload` / `.description`
- `packages/i18n/zh-cn/src/messages.ts`
  - 上述键的中文。
- `packages/agents/claude-code/__test__/registration.test.ts`
  - 两处 `skillsModuleWith(() => null)` 改成 `skillsModuleWith(() => null, () => null)`。
- 新建 `packages/resources/skills/__test__/update-settings.test.ts`
  - `readSkillUpdateSettings`：缺省、未知值、部分值、非法 `lastCheckAt`。
  - `msUntilDue`：manual 返回 `null`；startup 返回 `0`；daily/hourly 的缺失/刚检查过/超过周期/非法时间。
  - `updatableNames`：只返回 `outdated && !modified`；手改过的不返回；没有 `upstream`/`checked` 的不返回。
  - `updateOutdated` / `runScheduledCheck`：用 `Pick<SkillStore, ...>` 的假 store 断言 autoDownload=false 不更新、true 只更新目标、单个更新失败不影响下一个、`list()` 取全部行。
  - 定时器接线（`startUpdateSchedule`）不写单测；它的可观察判据是下面浏览器检查里的 `lastCheckAt` 写入，决策逻辑本身已由 `msUntilDue` / `updatableNames` / `updateOutdated` / `runScheduledCheck` 覆盖。手动检查的自动下载由 `updateOutdated` 的同一组测试覆盖。

**验收**

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/skills lint
pnpm --filter @context-hub/zh-cn test
pnpm --filter @context-hub/claude-code typecheck
pnpm --filter @context-hub/claude-code test
pnpm --filter web typecheck
```

浏览器检查（隔离 home，避免写用户的 `~/.context-hub`）：

```bash
pnpm --filter web build
HOME_DIR=$(mktemp -d)
HOME_DIR=$(cygpath -w "$HOME_DIR")   # Git Bash on Windows; skip on POSIX
CONTEXT_HUB_HOME="$HOME_DIR" pnpm --filter web exec node server.ts --static dist --port 5280
```

打开 `http://127.0.0.1:5280/settings`：

1. `images` 与 `about` 之间出现 “Skill updates / 技能更新” 分组，两行控件可见。
2. 选 `Daily`、打开自动下载，刷新页面后选择仍在；`$HOME_DIR/state/settings.json` 的 `plugins["hub.skill.catalog"]` 含 `check: "daily"`、`autoDownload: true`。
3. 刷新后等待页面渲染完成，轮询 `$HOME_DIR/state/settings.json` 直到 `plugins["hub.skill.catalog"].lastCheckAt` 出现（最多几秒）：这证明 daily 调度真的跑了一次（隔离 home 没有带 upstream 的技能，因此这次检查不产生网络请求）。
4. 到 `/extensions` 停用 Skills，回到 `/settings`，该分组消失；重新启用后回来。

收尾只停止自己在 5280 上启动的进程，并删除 `$HOME_DIR`。

### 阶段 5：合并贡献设置到全局搜索

**目标**：搜索能命中插件设置分组，并滚动到正确锚点。

**改动文件**

- `packages/search/global-search/src/search.ts`
  - 类型导入加 `SettingsSectionContribution`。
  - 文件头注释改为：壳自己的行仍在静态表里；插件贡献的区块在搜索时从 `ctx.extensions.contributions("settingsSection")` 读取，不进入静态表。
  - `settingsContribution(t, sections = () => [])` 增加第二个参数。
  - `searchSettings(t, query, sections = [])`：
    - 先保留 `SETTINGS` 中非 `about` 的行；
    - 再为每个 section 用 `t(titleKey)` / `t(descriptionKey)` 匹配，结果 `id` 用 `settings-section:<id>`，`path` 用 `` `${searchPath("/settings", query)}#${section.id}` ``；
    - 最后追加 `SETTINGS` 中 `about` 的行，保持设置页的显示顺序。
- `packages/search/global-search/src/index.ts`
  - `settingsContribution((key) => ctx.i18n.t(key), () => ctx.extensions.contributions("settingsSection"))`。
  - `inject` 已含 `extensions`，不需要新增。
- `packages/search/global-search/__test__/search.test.ts`
  - `words` 表补 `skills.settings.title` / `skills.settings.description`。
  - 增加一个贡献 section 的用例：标题/描述可命中，路径为 `/settings?q=...&#skills-updates`；空查询不返回。
  - 现有 `searchSettings(t, query)` 调用因默认参数保持不变。

**验收**

```bash
pnpm --filter @context-hub/global-search typecheck
pnpm --filter @context-hub/global-search test
pnpm --filter @context-hub/global-search lint
pnpm --filter web typecheck
```

浏览器检查：在阶段 4 的隔离服务器上按 Ctrl+K 搜索 “skill updates”（或 “技能更新”），Settings 分组下出现该区块；点击后 URL 带 `?q=` 与 `#skills-updates`，页面滚动到该分组且标题命中词高亮。停用 Skills 后同样的搜索不再出现该结果。

### 阶段 6：全量验证与收尾

**目标**：确认没有跨包回归，更新注释与仓库认知。

**改动文件**

- `apps/web/src/pages/settings.tsx` 文件头注释（阶段 2 已改，这里只复核）。
- `packages/search/global-search/src/search.ts` 文件头注释（阶段 5 已改，这里只复核）。
- 不新增文档文件；README / DESIGN.md 不改，理由见“不做”。

**验收**

```bash
pnpm typecheck
pnpm lint
pnpm test
git status --short
```

- `git status --short` 里只出现本计划文件与清单中的源码/测试；没有临时目录、没有 `dist/`、没有对真实 `<home>/state/settings.json` 的修改。
- 根测试包含 `packages/resources/skills/__test__/updates.test.ts` 的真实 git 用例，耗时约 15 秒，属于预期。
- 所有受管文件达到最终稳定状态后，按 `AGENTS.md` 运行一次 `aoci_maintain`；对本任务涉及的候选逐文件创作完整 F/R/A/S，并用 `aoci_update_entry` 一次提交。中间阶段不运行维护。

## 风险与边界

1. **自动更新会写技能文件。** 定时检查与手动检查后都可能发生；只更新 `outdated && !modified`，手改过的绝不碰。但 `modified` 依据的是检查时记录的 `currentHash`，检查与更新之间如果有人在另一个进程改文件，仍有小窗口会被覆盖。默认关闭自动下载；不改变 `updateFromUpstream` 的覆盖语义，因为手动 “Update” 仍需要用户确认后覆盖。
2. **自动检查会联网。** 只有用户显式选择 `startup`、`daily` 或 `hourly` 才会发生；默认 `manual` 与现状一致。daily/hourly 的 `lastCheckAt` 在检查失败时也会写入，避免每次刷新都重试。
2a. **手动检查的返回值要与自动更新后的磁盘一致。** 单行检查自动更新后返回 `outdated: false` 与新 hash；批量检查从 `outdated` 计数里扣除成功更新数。否则详情弹窗或列表会显示已经处理过的“可更新”。
3. **无 host 形态。** `hub.skills` 不存在时调度器直接返回；设置仍可保存，区块用现有 `skills.empty.noLibraryHint` 说明。不会出现“设置了但每次启动都报错”。
4. **定时器生命周期。** 只存在一个 `setTimeout`；插件停用、模式切换到 `manual` 都通过 `ctx.effect` / `settings/change` 监听清理；设置页组件卸载不停调度（调度属于插件，刻意如此）；`running` 标志阻止重入，`disposed` 标志阻止卸载后定时器复活。
5. **旧设置文档兼容。** 没有 `plugins` 的文档读成 `{}`；`set()` 保留插件命名空间；测试覆盖“先写插件值再改固定设置”的回归。
6. **全局搜索的静态表仍在。** 壳自己的设置行继续手写维护；插件区块在搜索时实时读取贡献，停用插件自动消失。插件区块内部的单个控件不单独可搜，只搜区块标题/描述。
7. **锚点与 id 冲突。** `settingsSection.id` 是页面锚点，重复 id 或与 `appearance`/`install`/`images`/`about` 重名会让滚动落到错误的组；本次不做运行时校验，类型 JSDoc 写明约束。
8. **插件 id 即命名空间。** 改名 `hub.skill.catalog` 会让旧设置留在文档里成为孤儿数据；当前没有迁移逻辑，因为本次不改插件 id。
9. **`setPlugin` 的相等判断依赖 JSON 序列化。** 值必须是可 JSON 序列化的普通数据；函数、BigInt、循环引用不支持。这与状态文档本身是 JSON 一致。
10. **`skillsModuleWith` 签名变化。** 只有 `src/index.ts` 与 claude-code 注册测试两处调用，已在阶段 4 同步；如果仓库外还有调用者，会得到编译错误而不是静默跳过设置区块。

## 受影响文件清单

| 文件 | 阶段 | 改动 |
|---|---|---|
| `packages/extensions/src/types.ts` | 1 | 新增 `SettingsSectionContribution`、`ContributionMap.settingsSection` |
| `packages/extensions/src/contributions.ts` | 1 | 登记点、服务名、`Context` 增补、发布 |
| `packages/extensions/__test__/services.test.ts` | 1 | 贡献点生命周期测试 |
| `packages/extensions/src/components/settings-row.tsx` | 2 | 新建共享设置行组件 |
| `packages/extensions/src/components/index.ts` | 2 | 导出共享组件 |
| `apps/web/src/pages/settings.tsx` | 2 | 改用共享组件、渲染贡献区块、注释 |
| `packages/extensions/src/settings.ts` | 3 | `plugins` 字段、`plugin()` / `setPlugin()`、`SettingsPatch` |
| `packages/extensions/src/react.tsx` | 3 | `usePluginSettings()`、`SettingsControl.set` 类型 |
| `packages/extensions/__test__/settings.test.ts` | 3 | 更新精确断言、插件命名空间测试 |
| `packages/resources/skills/src/store.ts` | 4 | 迁入 `outdated()` / `modified()` |
| `packages/resources/skills/src/library.ts` | 4 | 迁移纯函数、手动检查自动下载接线 |
| `packages/resources/skills/src/update-settings.ts` | 4 | 新建设置类型、纯函数、调度器 |
| `packages/resources/skills/src/settings-section.tsx` | 4 | 新建设置区块组件 |
| `packages/resources/skills/src/extension.ts` | 4 | 签名、inject、注册贡献、启动调度 |
| `packages/resources/skills/src/index.ts` | 4 | 传入设置区块组件 |
| `packages/resources/skills/src/messages.ts` | 4 | 英文键 |
| `packages/i18n/zh-cn/src/messages.ts` | 4 | 中文键 |
| `packages/agents/claude-code/__test__/registration.test.ts` | 4 | 更新 `skillsModuleWith` 调用 |
| `packages/resources/skills/__test__/update-settings.test.ts` | 4 | 新建纯函数、`updateOutdated` / `runScheduledCheck` 测试 |
| `packages/search/global-search/src/search.ts` | 5 | 合并贡献区块、更新注释 |
| `packages/search/global-search/src/index.ts` | 5 | providers 传入贡献读取器 |
| `packages/search/global-search/__test__/search.test.ts` | 5 | 贡献区块搜索测试 |

不改：`vitest.config.ts`（项目已登记）、各包 `package.json`、`apps/web/src/lib/hub.ts`、`packages/resources/skills/src/remote-store.ts`、`packages/resources/skills/src/host/skills-fs.ts`、`designs/`、`README.md`、`DESIGN.md`。
