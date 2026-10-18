# plugins 更新设置：检查时机、每天时刻、自动下载

## 假设

以下是本计划对需求的理解；如果其中一条与你的本意不同，请在批准前指出，不要按错误方向实施。

1. “和 skill 模块差不多”指同样三个设置项、同样的默认值：`manual`、`14:00`、`autoDownload: false`；没有每小时。
2. “手动检查”指页面工具栏的 `Check updates` 和详情弹窗里的单包 `Check`。已有的 `Update all` 批量按钮不在自动下载的范围内，保持现有行为：它仍然更新所有 `outdated` 行，包括本地手改过的行。
3. “只更新 `outdated && !modified` 的包”中的 `modified` 以最近一次检查记录在 `PluginRecord.checked.currentHash` 与 `record.hash` 的比较为准。检查之后、更新之前发生的手改不在这个判据内；这与 skills 现有实现一致。要防住这段竞态，需要让宿主更新接口在替换前再次比对哈希并拒绝，属于另一个改动。
4. “每天”是本地墙钟时间。应用在当天时刻之后才启动时补跑一次；应用在时刻之前关闭时不会在后台运行，下一次打开再补跑。这与 skills 的调度语义一致。
5. 调度器只在这个插件启用期间存在；在 web 形态里内核运行在浏览器，因此也只在应用页面打开期间运行。关闭页面后定时器随之消失。
6. `PLUGINS_ID` 放在无 import 的 `contract.ts`，而不是字面地放在 `index.ts`。原因是 `settings-section.tsx` 和 `library.ts` 都需要这个 id；如果它们反向 import `index.ts`，会形成 `index.ts → page.tsx → library.ts → index.ts` 的循环。`index.ts` 继续使用它，并通过已有的 `export * from "./contract.ts"` 对外暴露。行为不变，只是常量的落点。
7. 新增的英文文案与中文文案一一对应；`packages/i18n/zh-cn/__test__/messages.test.ts` 会强制这一点，缺键会红。

## 背景与现状

### 已有设置基础设施（上一个任务已完成）

- `packages/extensions/src/types.ts:135-144` 定义 `SettingsSectionContribution { id, titleKey, descriptionKey, Component }`。
- `packages/extensions/src/contributions.ts:79-88` 的 `POINT_SERVICES.settingsSection = "settingsSections"`；`ContributionPoint.register` 是原型方法，贡献寿命跟随调用方插件，停用时自动回卷。
- `packages/extensions/src/settings.ts:30-40` 的 `HubSettings.plugins: Record<string, unknown>`；`settings.plugin(id)` / `settings.setPlugin(id, value)`（`:133-152`）；同值写入被丢弃，写入后发 `settings/change`。
- `packages/extensions/src/react.tsx:151-165` 的 `usePluginSettings<T>(id, fallback)`；`fallback` 必须是稳定值，当前值按 `settings/change` 重绘。
- `packages/extensions/src/components/settings-row.tsx` 提供 `SettingRow`、`Segmented`、`SettingSwitch`，并从 `@context-hub/extensions/components` 导出（`packages/extensions/src/components/index.ts:31`）。
- `apps/web/src/pages/settings.tsx:358` 读取 `useContributions("settingsSection")`，`:645-655` 自动渲染；壳不需要改。
- `packages/search/global-search/src/search.ts:114-121` 的 `settingsContribution(t, sections)` 与 `:155-167` 的 `searchSettings` 会读取 settingsSection 贡献；搜索不需要改。
- 参考实现：`packages/resources/skills/src/update-settings.ts`、`settings-section.tsx`、`extension.ts:59,81-87`、`library.ts:600-641`。

### plugins 模块现状

- `packages/resources/plugins/src/index.ts`：
  - `name: "hub.plugin.catalog"` 是内联字符串（`:46`），没有独立常量。
  - `inject: ["nav", "routes", "locales", "search", "i18n"]`（`:59`）。
  - `apply` 中先 `new PluginService(...)`，再 `new PluginLibrary(ctx)`（`:67-74`），然后注册 search/nav/routes/locales（`:78-95`）。
  - 该文件已经静态 import `PluginsPage`（`page.tsx`），不要求 Node-only 可加载。
- `packages/resources/plugins/src/library-store.ts`：
  - `PluginLibrary` service（`catalog.plugins`），`load()` / `reload()` / `state()` / `subscribe()`。
  - `read()`（`:200-271`）先 `GET /hub/plugins?action=list`，再 `probeInstallers` 询问被选中的 agent；`reload()` 可能运行客户端命令行，因此不能在每个包更新后各调一次。
- `packages/resources/plugins/src/library.ts`：
  - `usePluginLibrary()`（`:402-599`）是页面唯一的数据钩子。
  - `write()`（`:442-455`）每次写入后 `reload()`。
  - `checkUpdates: () => write<PluginUpdateSummary>({ action: "check-updates" })`（`:553`）。
  - `checkUpdate: (name) => write<PluginUpdateCheck>({ action: "check-update", name })`（`:554`）。
  - `update: (name) => write<PluginUpdateOutcome>({ action: "update", name })`（`:555`）。
  - `call<T>(path, body?)` 已导出（`:229-244`），错误会还原为 `Error`/`PluginNameTakenError`。
- `packages/resources/plugins/src/revision.ts`：
  - `outdated(record)`（`:49-54`）：`record.checked.latest !== installedRevision(record.source)`。
  - `modified(record)`（`:61-65`）：`record.checked.currentHash !== record.hash`。
  - `PluginUpdateSummary`（`:73-92`）：`checked/outdated/modified/failed/unanswerable`。
  - `PluginUpdateCheck`（`:95-106`）：`recordedRevision/latestRevision/currentHash/outdated/modified`。
- `packages/resources/plugins/handlers.ts`：
  - `GET ?action=list` 返回 `{ root, plugins, missing }`（`:146-153`）。
  - `POST check-updates` 返回 `PluginUpdateSummary`（`:304-306`）。
  - `POST check-update` 返回 `PluginUpdateCheck`（`:307-314`）。
  - `POST update` 返回 `PluginUpdateOutcome` 并写入库（`:315-317`）。
- `packages/resources/plugins/src/contract.ts`：`PLUGIN_ROUTE = "/hub/plugins"`（`:23`）、`installedRevision`（`:160-163`）、`hasUpstream`（`:174-176`）。该文件不 import 任何模块。
- `packages/resources/plugins/src/messages.ts`：`pluginsMessages`，命名空间 `plugins.*`，目前没有 `plugins.settings.*`。
- `packages/i18n/zh-cn/src/messages.ts:344` 起是 `plugins.*` 中文文案；`skills.settings.*` 在 `:244-255` 可作为措辞参考。
- `packages/resources/plugins/vitest.config.ts` 的 include 是 `__test__/**/*.test.ts`；已有测试：`bridge`、`library`、`library-store`、`rows`、`scan`、`search`。
- 页面工具栏的 `Check updates` 调 `library.checkUpdates()`（`page.tsx:1222-1249`）；详情弹窗的单包 `Check` 调 `library.checkUpdate(name)`，返回值被丢弃（`page.tsx:1348`，`detail-dialog.tsx:722-747`）。
- `page.tsx:1045,1063-1080` 的 `Update all` 直接更新所有 `outdatedRows`；本计划不改。
- `packages/resources/plugins/src/host/update.ts:73-85`：当新下载的目录哈希与记录相同时，只写 `checked`，不推进 `record.source.revision`；因此这样的记录在下一次检查仍会显示为 `outdated`。这是既有行为，本计划不改，见“风险”。

### 关键差异

- skills 的 `startUpdateSchedule` 直接拿 `ctx.get("hub.skills")`（进程内 store）；plugins 的检查与更新走 HTTP 路由，因此调度器需要一个 `PluginUpdateSource` 适配层。
- plugins 的 `PluginLibrary.reload()` 会读客户端安装器，可能跑命令；定时检查结束后只调用一次 `reload()`，不能在每个包更新后各调一次。
- 监控/触发方式不同，但纯逻辑（设置解析、到期计算、可更新包筛选、逐个更新、单次检查）与 skills 同构。允许在 plugins 内复制约 60 行纯函数，理由是两个 package 独立、避免为了两个消费者在内核 `@context-hub/extensions` 新增公共 API。这是有意选择，不是遗漏。

## 目标

1. 在设置页新增 `plugins-updates` 区块，包含：
   - 检查时机：`manual`（默认）/ `startup` / `daily`；没有 `hourly`。
   - 选 `daily` 时显示本地时间输入（`HH:MM`，默认 `14:00`）。
   - 有更新时是否自动下载（默认关闭）。
2. 自动下载同时作用于定时检查和两个手动检查入口（工具栏批量检查、详情单包检查）。
3. 自动下载只更新 `outdated && !modified` 的包；`modified` 的包绝不自动覆盖。
4. 定时检查在插件启用期间运行；`daily` 按本地墙钟时间，错过当天则补跑一次；失败也写 `lastCheckAt`，避免每次设置变化都重试。
5. 不新增生产依赖；不改设置页壳、全局搜索、skills 模块或内核公共 API。

## 非目标（不做）

- 不做每小时检查；存储里出现 `"hourly"` 时按 `manual` 处理。
- 不改 plugins 页面布局、卡片、详情弹窗、`Update all` 批量按钮的行为。
- 不改 skills 的 `update-settings.ts` / `settings-section.tsx`，也不把它们抽成共享包。
- 不新增服务端定时任务或后台常驻进程；web 形态只在页面打开期间调度。
- 不自动更新 `modified` 的包，不改变手动 `Update all` 覆盖手改文件的既有行为。
- 不新增依赖，不改 `package.json` / `pnpm-lock.yaml`。
- 不改 `apps/web/src/pages/settings.tsx`、`packages/search/global-search/src/search.ts`（它们已经通用地消费 settingsSection）。
- 不为设置项生成新的全局搜索行；现有 settingsSection 搜索已经覆盖区块标题/描述。
- 不重构 `PluginLibrary` 的客户端探测，不减少或增加探测范围。
- 不修 `host/update.ts` 的“文件相同但 revision 未推进”问题；只作为风险记录。

## 设计

### 1. 新文件 `packages/resources/plugins/src/update-settings.ts`

该文件只依赖类型与纯函数，不 import React、不 import `library.ts`、不直接发请求。测试可在纯 Node 下加载。

```ts
import type { Context } from "@deepseek-ai/cordis"

import { modified, outdated, type PluginRecord, type PluginUpdateSummary } from "./revision.ts"

export type PluginCheckTiming = "manual" | "startup" | "daily"

export interface PluginUpdateSettings {
  check: PluginCheckTiming
  /** Local time of the daily check, `HH:MM`. */
  dailyAt: string
  autoDownload: boolean
  /** When the last daily check ran; absent for the other timings. */
  lastCheckAt?: string
}

export const DEFAULT_PLUGIN_UPDATE_SETTINGS: PluginUpdateSettings = {
  check: "manual",
  dailyAt: "14:00",
  autoDownload: false,
}

export function readPluginUpdateSettings(value: unknown): PluginUpdateSettings

export function msUntilDue(
  timing: PluginCheckTiming,
  lastCheckAt: string | undefined,
  now: number,
  dailyAt: string
): number | null

/** The packs an automatic update may replace: ahead upstream, untouched here. */
export function updatableNames(records: readonly PluginRecord[]): string[]

export interface PluginUpdatePass {
  updated: string[]
  failed: { name: string; reason: string }[]
}

/**
 * The calls a check pass makes. `reload` is the shared read's, because a pass
 * ends by refreshing every page watching the library.
 */
export interface PluginUpdateSource {
  list(): Promise<readonly PluginRecord[]>
  checkUpdates(): Promise<PluginUpdateSummary>
  update(name: string): Promise<void>
  reload(): Promise<void>
}

export async function updateOutdated(
  source: Pick<PluginUpdateSource, "list" | "update">
): Promise<PluginUpdatePass>

export async function runScheduledCheck(
  source: Pick<PluginUpdateSource, "checkUpdates" | "list" | "update">,
  autoDownload: boolean
): Promise<PluginUpdatePass>

/** Fold an automatic pass into the summary the page's toast reports. */
export function mergeUpdatePass(
  summary: PluginUpdateSummary,
  pass: PluginUpdatePass
): PluginUpdateSummary

export function startUpdateSchedule(
  ctx: Context,
  pluginId: string,
  source: PluginUpdateSource
): void
```

行为要求：

- `readPluginUpdateSettings`：`check` 只认 `"startup"`/`"daily"`，其余（含 `"hourly"`）为 `"manual"`；`dailyAt` 只认 `^([01]\d|2[0-3]):[0-5]\d$`，否则 `14:00`；`autoDownload === true` 才是真；`lastCheckAt` 只在是字符串且 `Date.parse` 不是 `NaN` 时保留。整体照抄 `skills/src/update-settings.ts:36-63` 的校验方式。
- `msUntilDue`：`manual` 返回 `null`；`startup` 返回 `0`；`daily` 以本地 `dailyAt` 为当天的槽位，槽位未到返回差值；槽位已过且 `lastCheckAt` 缺失/不可解析/早于槽位返回 `0`（补跑一次）；否则返回“明天槽位 - now”。照抄 `skills/src/update-settings.ts:79-94`。
- `updatableNames`：`records.filter((row) => outdated(row) && !modified(row)).map((row) => row.name)`。`local` 和 `git-subdir` 因 `installedRevision` 为 `null` 或 `outdated` 恒 false 而不在结果里。
- `updateOutdated`：先 `await source.list()`，对 `updatableNames` 逐个 `await source.update(name)`；每个包单独 `try/catch`，失败放进 `failed` 并继续。返回 `{ updated, failed }`。
- `runScheduledCheck`：先 `await source.checkUpdates()`；`autoDownload` 为 false 返回 `{ updated: [], failed: [] }`（只检查，不下载）；为 true 返回 `updateOutdated(source)`。检查摘要里的单源失败不进入返回值，见“风险”。
- `mergeUpdatePass`：返回 `{ ...summary, outdated: Math.max(0, summary.outdated - pass.updated.length), failed: [...summary.failed, ...pass.failed] }`。
- `startUpdateSchedule`：
  - `read()` = `readPluginUpdateSettings(ctx.settings.plugin(pluginId))`。
  - 局部状态：`timer`、`running`、`startupDone`、`disposed`、`lastTiming`、`lastDailyAt`。
  - `report(message)` 调用 `ctx.get("host")?.log("warn", "plugins: " + message)`；web host 的 `log` 就是 `console[level]`（`apps/web/src/lib/hub.ts:156-165`）。
  - `run()`：`running || disposed` 直接返回；置 `running = true`；`try` 中执行 `runScheduledCheck(source, read().autoDownload)`，有 `outcome.failed` 时逐个名字 `report`；检查调用成功返回后 `await source.reload()`（一次；单个包更新失败不影响这一步）。路由级检查抛错时进入 `catch` 并跳过 `reload`，与 skills 一致。`finally` 中：读最新设置；`!disposed && latest.check === "daily"` 时 `ctx.settings.setPlugin(pluginId, { ...latest, lastCheckAt: new Date().toISOString() })`（失败也写）；`running = false`；`!disposed` 时 `tick()`。
  - `tick()`：`stopTimer()`；`disposed || running` 返回；`manual` 返回；`startup` 若 `startupDone` 已 true 返回，否则置 true 并 `void run()`；`daily` 用 `msUntilDue(...)`，`null` 返回，否则 `setTimeout(() => { timer = undefined; void run() }, wait)`。
  - `onChange()`：读当前设置；`lastTiming` 与 `check`、`lastDailyAt` 与 `dailyAt` 都没变就返回；否则更新这两个记录并 `tick()`。`autoDownload` 改变不重新 arm（下一次 run 现读）。
  - `ctx.effect(() => { ...; const off = ctx.on("settings/change", onChange); tick(); return () => { disposed = true; off(); stopTimer() } })`。
  - 只有 `daily` 写 `lastCheckAt`；`startup` 和 `manual` 不写。
  - 单次 `setTimeout`，不用 `setInterval`；`running` 防止重叠；插件停用时 `ctx.effect` 清理定时器与监听。

### 2. 新文件 `packages/resources/plugins/src/settings-section.tsx`

照 `packages/resources/skills/src/settings-section.tsx` 的结构，不引入 `useHub` 与“没有库”的提示：

```tsx
import { useI18n, usePluginSettings } from "@context-hub/extensions/react"
import {
  Segmented,
  SettingRow,
  SettingSwitch,
} from "@context-hub/extensions/components"
import { Input } from "@context-hub/shadcn-ui/components/input"

import { PLUGINS_ID } from "./contract.ts"
import {
  DEFAULT_PLUGIN_UPDATE_SETTINGS,
  readPluginUpdateSettings,
  type PluginCheckTiming,
  type PluginUpdateSettings,
} from "./update-settings.ts"

export function PluginsSettingsSection() {
  const { t } = useI18n()
  const stored = usePluginSettings<PluginUpdateSettings>(
    PLUGINS_ID,
    DEFAULT_PLUGIN_UPDATE_SETTINGS
  )
  const settings = readPluginUpdateSettings(stored.value)

  const update = (patch: Partial<PluginUpdateSettings>): void => {
    /* Replace the whole namespace value; keep the internal timestamp. */
    stored.set({ ...settings, ...patch })
  }

  const timings: { id: PluginCheckTiming; label: string }[] = [
    { id: "manual", label: t("plugins.settings.check.manual") },
    { id: "startup", label: t("plugins.settings.check.startup") },
    { id: "daily", label: t("plugins.settings.check.daily") },
  ]

  return (
    <div className="flex flex-col divide-y divide-border">
      <SettingRow
        title={t("plugins.settings.check")}
        description={t("plugins.settings.check.description")}
      >
        <Segmented
          value={settings.check}
          options={timings}
          onChange={(check) => update({ check })}
        />
      </SettingRow>
      {settings.check === "daily" ? (
        <SettingRow
          title={t("plugins.settings.dailyAt")}
          description={t("plugins.settings.dailyAt.description")}
        >
          <Input
            type="time"
            value={settings.dailyAt}
            onChange={(event) => update({ dailyAt: event.target.value })}
            aria-label={t("plugins.settings.dailyAt")}
            className="h-10 w-32"
          />
        </SettingRow>
      ) : null}
      <SettingRow
        title={t("plugins.settings.autoDownload")}
        description={t("plugins.settings.autoDownload.description")}
      >
        <SettingSwitch
          checked={settings.autoDownload}
          onCheckedChange={(autoDownload) => update({ autoDownload })}
          label={t("plugins.settings.autoDownload")}
        />
      </SettingRow>
    </div>
  )
}
```

要点：

- `stored.set({ ...settings, ...patch })` 必须展开 `settings`，否则 `lastCheckAt` 会被丢掉。
- `settings` 是 `readPluginUpdateSettings` 归一化后的对象；写入的值永远是当前 build 认识的形状。
- 输入框清空时 `event.target.value` 是 `""`；下一次渲染会回落到 `14:00`，与 skills 相同。
- 区块 id 用 `plugins-updates`；不得与 `appearance` / `install` / `images` / `about` 重名。

### 3. `packages/resources/plugins/src/contract.ts`

新增：

```ts
/** This module's own id; the kernel matches it against the manifest. */
export const PLUGINS_ID = "hub.plugin.catalog"
```

放在 `PLUGIN_ROUTE` 附近。该文件无 import，`settings-section.tsx`、`library.ts`、`index.ts` 都可以安全引用。

### 4. `packages/resources/plugins/src/index.ts`

- `name: PLUGINS_ID` 替代内联字符串。
- `inject` 增加 `settings`、`settingsSections`：
  ```ts
  inject: ["nav", "routes", "locales", "search", "i18n", "settings", "settingsSections"],
  ```
  `settings` 是 `startUpdateSchedule` 读 `ctx.settings` 所需；`settingsSections` 是 `ctx.settingsSections.register` 所需。Cordis 在运行时按 `inject` 放行属性访问，漏了会在 apply 里抛 `without inject`。
- import：`PLUGINS_ID`（contract）、`PluginsSettingsSection`（settings-section）、`pluginUpdateSource`（library）、`startUpdateSchedule`（update-settings）。
- 在 `const library = new PluginLibrary(ctx)` 之后、`ctx.search.register(...)` 之前插入：
  ```ts
  ctx.settingsSections.register({
    id: "plugins-updates",
    titleKey: "plugins.settings.title",
    descriptionKey: "plugins.settings.description",
    Component: PluginsSettingsSection,
  })
  startUpdateSchedule(ctx, PLUGINS_ID, pluginUpdateSource(() => library.reload()))
  ```
- `manifest.provides` 不变。
- 不新增 barrel 导出：`PLUGINS_ID` 随已有的 `export * from "./contract.ts"` 自动可见；`update-settings.ts` 是包内实现，测试按相对路径导入。

### 5. `packages/resources/plugins/src/library.ts`

#### 5.1 `pluginUpdateSource` 工厂

在 `call` 与 `PluginUpdateOutcome` 定义之后新增：

```ts
/**
 * The calls a check pass makes over this route.
 *
 * The schedule and the page's own button share this, so the action names and
 * the list shape have one spelling. `reload` is the shared read's, because a
 * pass ends by refreshing every page watching it.
 */
export function pluginUpdateSource(
  reload: () => Promise<void>
): PluginUpdateSource {
  return {
    list: async () => {
      const answer = await call<{ plugins: PluginRecord[] }>(
        `${ENDPOINT}?action=list`
      )
      return answer.plugins
    },
    checkUpdates: () => call<PluginUpdateSummary>(ENDPOINT, { action: "check-updates" }),
    update: async (name) => {
      await call<PluginUpdateOutcome>(ENDPOINT, { action: "update", name })
    },
    reload,
  }
}
```

同文件新增 import：

```ts
import { PLUGINS_ID } from "./contract.ts"
import {
  DEFAULT_PLUGIN_UPDATE_SETTINGS,
  mergeUpdatePass,
  readPluginUpdateSettings,
  updateOutdated,
  type PluginUpdateSource,
} from "./update-settings.ts"
```

`usePluginSettings` 加到已有的 `@context-hub/extensions/react` import 中。

#### 5.2 `usePluginLibrary` 读取 autoDownload

在 hook 顶部（`useSettings` 附近）新增：

```ts
const updateSettings = usePluginSettings(
  PLUGINS_ID,
  DEFAULT_PLUGIN_UPDATE_SETTINGS
)
const autoDownload = readPluginUpdateSettings(updateSettings.value).autoDownload
```

`usePluginSettings` 订阅 `settings/change`，所以设置页切换后这个 hook 会重绘；下一次检查立即使用新值。`autoDownload` 不参与调度 arm，调度器的 `run()` 每次现读。

#### 5.3 `checkUpdates`

把 `:553` 的内联实现替换为：

```ts
const source = React.useMemo(
  () => pluginUpdateSource(reload),
  [reload]
)

const checkUpdates = React.useCallback(async (): Promise<PluginUpdateSummary> => {
  setBusy(true)
  try {
    const summary = await source.checkUpdates()
    if (!autoDownload) {
      await reload()
      setWriteFailure(null)
      return summary
    }
    const applied = await updateOutdated(source)
    await reload()
    setWriteFailure(null)
    return mergeUpdatePass(summary, applied)
  } finally {
    setBusy(false)
  }
}, [autoDownload, reload, source])
```

- 走 `call`/`source` 而不是 `write()`，是为了在 autoDownload 时只 `reload()` 一次：检查一次 + 全部更新之后一次。`write()` 会在检查后立刻 reload，导致 autoDownload 路径多一次客户端探测。
- `updateOutdated(source)` 内部会在检查后重新 `list()` 一次，拿到检查刚写入的 `checked`；然后逐个更新。
- `mergeUpdatePass` 把 `outdated` 减去已更新数，并把更新失败合并进 `failed`；`Math.max(0, ...)` 防止边界负数。
- 检查失败时 `setBusy(false)`，错误照原样抛给页面/弹窗的 `.catch`。

#### 5.4 `checkUpdate(name)`

替换 `:554`：

```ts
const checkUpdate = React.useCallback(
  async (name: string): Promise<PluginUpdateCheck> => {
    setBusy(true)
    try {
      const result = await call<PluginUpdateCheck>(ENDPOINT, {
        action: "check-update",
        name,
      })
      if (autoDownload && result.outdated && !result.modified) {
        await source.update(name)
        await reload()
        setWriteFailure(null)
        /* The row is re-read from the library; this answer is rewritten so a
           caller that does read it does not keep offering what is now on disk.
           `currentHash` stays the pre-update measurement because the update
           outcome carries no new hash and no caller reads this field. */
        return {
          ...result,
          recordedRevision: result.latestRevision,
          outdated: false,
          modified: false,
        }
      }
      await reload()
      setWriteFailure(null)
      return result
    } finally {
      setBusy(false)
    }
  },
  [autoDownload, reload, source]
)
```

- `page.tsx:1348` 目前丢弃这个返回值；`detail-dialog.tsx` 只等它完成，然后从库重读行。改写是防御性的，不影响现有 UI。
- `modified` 的包只检查、不更新，返回原始 `result`；页面会显示“上游动了，本地也改过”的状态。

#### 5.5 返回值

把 return 对象中的：

```ts
checkUpdates: () => write<PluginUpdateSummary>({ action: "check-updates" }),
checkUpdate: (name) => write<PluginUpdateCheck>({ action: "check-update", name }),
```

改为：

```ts
checkUpdates,
checkUpdate,
```

`PluginLibrary` 接口的函数签名不变，`page.tsx` / `detail-dialog.tsx` 不需要改。

### 6. 文案

`packages/resources/plugins/src/messages.ts` 新增（放在其他 `plugins.update.*` 附近）：

| key | English |
|---|---|
| `plugins.settings.title` | `Plugin updates` |
| `plugins.settings.description` | `When this hub asks each plugin's source for a newer revision, and what it does when one exists.` |
| `plugins.settings.check` | `Check for updates` |
| `plugins.settings.check.description` | `Scheduled checks run while the Plugins extension is enabled.` |
| `plugins.settings.check.manual` | `Manually` |
| `plugins.settings.check.startup` | `At startup` |
| `plugins.settings.check.daily` | `Daily` |
| `plugins.settings.dailyAt` | `Check time` |
| `plugins.settings.dailyAt.description` | `The local time of the daily check.` |
| `plugins.settings.autoDownload` | `Download updates automatically` |
| `plugins.settings.autoDownload.description` | `After a check finds a newer revision, install it over plugins you have not edited here. Edited copies are left for you to update.` |

`packages/i18n/zh-cn/src/messages.ts` 在 `plugins.*` 段新增对应中文：

| key | 中文 |
|---|---|
| `plugins.settings.title` | `插件更新` |
| `plugins.settings.description` | `这个 hub 何时向插件的上游查询新版本，以及查到后做什么。` |
| `plugins.settings.check` | `检查更新` |
| `plugins.settings.check.description` | `定时检查只在插件扩展启用期间运行。` |
| `plugins.settings.check.manual` | `手动` |
| `plugins.settings.check.startup` | `启动时` |
| `plugins.settings.check.daily` | `每天` |
| `plugins.settings.dailyAt` | `检查时间` |
| `plugins.settings.dailyAt.description` | `每天检查的本地时间。` |
| `plugins.settings.autoDownload` | `自动下载更新` |
| `plugins.settings.autoDownload.description` | `检查发现新版本后，自动覆盖没有在这里手改过的插件；手改过的留给你手动更新。` |

配套一处现有文案（把“只问不出来源”改成也覆盖更新失败）：

- EN：`plugins.notice.checkFailed` → `"{count} packs could not be checked or updated."`
- ZH：`plugins.notice.checkFailed` → `"有 {count} 个插件检查或更新失败。"`

同时把 `revision.ts:85-86` 的 `PluginUpdateSummary.failed` 文档改为：

```ts
/**
 * Packs whose source could not be read, or whose automatic update failed,
 * each with the reason; the rest still ran.
 */
```

### 7. 导出与依赖

- `contract.ts` 的 `PLUGINS_ID` 通过已有 `export *` 暴露。
- `update-settings.ts` 不进入 package `exports`；内部消费者用相对路径，测试用 `../src/update-settings.ts`。
- 新增依赖：无。`@deepseek-ai/cordis` 已在 `packages/resources/plugins/package.json` 的 dependencies 中；`Input` 来自已有的 `@context-hub/shadcn-ui`。

## 受影响文件

| 文件 | 类型 | 改动 |
|---|---|---|
| `packages/resources/plugins/src/update-settings.ts` | 新建 | 设置类型/解析、到期计算、可更新筛选、自动更新、调度器 |
| `packages/resources/plugins/src/settings-section.tsx` | 新建 | 设置页区块组件 |
| `packages/resources/plugins/__test__/update-settings.test.ts` | 新建 | 纯逻辑与调度器测试 |
| `packages/resources/plugins/src/contract.ts` | 修改 | 新增 `PLUGINS_ID` |
| `packages/resources/plugins/src/index.ts` | 修改 | 使用 `PLUGINS_ID`；`inject` 加 `settings`/`settingsSections`；注册 `plugins-updates`；启动调度 |
| `packages/resources/plugins/src/library.ts` | 修改 | `pluginUpdateSource`；读取 `autoDownload`；重写 `checkUpdates`/`checkUpdate` |
| `packages/resources/plugins/src/revision.ts` | 修改 | 只改 `PluginUpdateSummary.failed` 文档 |
| `packages/resources/plugins/src/messages.ts` | 修改 | 新增 `plugins.settings.*`；调整 `plugins.notice.checkFailed` |
| `packages/i18n/zh-cn/src/messages.ts` | 修改 | 同步全部新键与 `checkFailed` |

调用方/测试/fixture/配置/导出的核对结果：

- `pluginsExtension.name` 的唯一字面量出现点是 `index.ts:46`（全仓 grep 确认；`apps/web/src/lib/hub.ts:24,187` 只是 import/数组引用）。改成 `PLUGINS_ID` 不影响任何匹配。
- `usePluginLibrary()` 的调用点只有 `packages/resources/plugins/src/page.tsx:783`；返回类型与 `checkUpdates`/`checkUpdate` 签名不变。
- `library.checkUpdates()` 的调用点只有 `page.tsx:1223`；`library.checkUpdate()` 只有 `page.tsx:1348`（经 `detail-dialog.tsx:1125`）。
- `settingsSection` 的消费者是 `apps/web/src/pages/settings.tsx:358,645-655` 与 `packages/search/global-search/src/search.ts:114-167`；两者都不需要改。
- `pluginsMessages` 的键由 `packages/i18n/zh-cn/__test__/messages.test.ts` 强制覆盖；`plugins.settings.*` 必须同时出现在中英文表。
- 没有 fixture、配置文件、构建脚本需要改；`vitest.config.ts` 已登记 plugins 项目；`__test__/update-settings.test.ts` 会被 `include` 直接收集。
- 不新增 package `exports`；不新增依赖；不修改 lockfile。

## 阶段

阶段依赖：1 → 2 → 3 → 4 → 5。阶段 2 依赖 1；阶段 3 依赖 1、2；阶段 4 依赖 1、3；阶段 5 依赖前四阶段。没有任何阶段依赖后面才创建的东西。

### 阶段 1：新增更新设置纯逻辑与单测

**执行目标**：把设置解析、到期计算、可更新筛选、逐个更新、单次检查、调度器全部落到一个无 React/无请求的模块，并用测试钉住行为；此时还没有消费者。

**改动文件**

- 新建 `packages/resources/plugins/src/update-settings.ts`：
  - 实现上面“设计 1”的全部类型与函数。
  - `readPluginUpdateSettings`/`msUntilDue` 对照 `packages/resources/skills/src/update-settings.ts:36-94`。
  - `updateOutdated` 逐包 `try/catch`，一个失败不阻止其余。
  - `startUpdateSchedule` 的 `running`/`disposed` 守卫、`lastCheckAt` 只在 daily 写、失败也写、`ctx.effect` 清理、`settings/change` 只在 timing/dailyAt 变化时 re-arm。
- 新建 `packages/resources/plugins/__test__/update-settings.test.ts`：
  - 设置解析：默认值；完整字段；未知 timing（含 `"hourly"`）/坏时间/非布尔/坏时间戳；只丢坏时间戳。
  - `msUntilDue`：manual 返回 `null`；startup 返回 0；daily 当天未到、已过未跑、已过已跑、`lastCheckAt` 不可解析。
  - `updatableNames`：outdated+unmodified、outdated+modified、同 revision、未检查、local。
  - `updateOutdated`：两个可更新包 + 一个失败包，断言成功项、失败项、失败后继续。
  - `runScheduledCheck`：autoDownload false 只调用 `checkUpdates`；true 在检查后调用更新。
  - `mergeUpdatePass`：`outdated` 递减、失败合并、已更新数大于 `outdated` 时夹到 0。
  - `startUpdateSchedule`（fake `Context` + `ctx.provide("settings", ...)`）：
    - startup：一次 `check` + 一次 `reload`，不写 `lastCheckAt`。
    - daily：`vi.useFakeTimers()`，13:00 启动、14:00 到期，时间推进后 `check` + `reload`，并写入可解析的 `lastCheckAt`。
    - daily 失败：`checkUpdates` 抛错时写 `lastCheckAt`；路由级失败不要求 `reload`（与 skills 一致）。
  - `afterEach` 恢复真实计时器，避免假定时器泄漏。

**验收**

```bash
pnpm --filter @context-hub/plugins typecheck
pnpm --filter @context-hub/plugins test
pnpm --filter @context-hub/plugins lint
```

通过判据：上述测试全绿；`update-settings.ts` 不 import React、`library.ts` 或设置页；仓库其它部分未改，应用仍可启动。

### 阶段 2：注册插件更新设置区块

**执行目标**：设置页出现 `plugins-updates` 区块，三个控件能读写 `settings.plugins["hub.plugin.catalog"]`；此时定时器还未接通。

**改动文件**

- `packages/resources/plugins/src/contract.ts`：新增 `PLUGINS_ID`。
- 新建 `packages/resources/plugins/src/settings-section.tsx`：完整实现“设计 2”。
- `packages/resources/plugins/src/index.ts`：
  - `name: PLUGINS_ID`。
  - `inject` 加 `settings`、`settingsSections`。
  - 注册 `plugins-updates`，`Component: PluginsSettingsSection`。
  - 本阶段先不调用 `startUpdateSchedule`。
- `packages/resources/plugins/src/messages.ts`：新增 11 个 `plugins.settings.*` 英文键。
- `packages/i18n/zh-cn/src/messages.ts`：新增对应中文键。

**验收**

```bash
pnpm --filter @context-hub/plugins test
pnpm --filter @context-hub/plugins typecheck
pnpm --filter @context-hub/plugins lint
pnpm --filter @context-hub/zh-cn test
```

UI 验收（隔离 hub home，见“UI 验证”的启动方式）：

- 打开 `/settings`，确认 `Plugin updates` / `插件更新` 区块可见，位于 `images` 与 `about` 之间。
- 点 `Daily`，时间输入出现；点回 `Manually`，时间输入消失。
- 选 `Daily`，把时间改成晚于当前时间；打开自动下载；等待设置写入后读取 `<HUB_HOME>/state/settings.json`，断言 `plugins` 子树为：
  ```json
  {
    "plugins": {
      "hub.plugin.catalog": {
        "check": "daily",
        "dailyAt": "<设置的时间>",
        "autoDownload": true
      }
    }
  }
  ```
- 刷新页面，确认区块仍是 `Daily`、时间仍是刚才的值、开关仍为开；再读一次文件，值不变。
- 此阶段没有调度器，不会自动发 `check-updates` 请求；不要把“没有自动检查”当失败。

### 阶段 3：接通定时检查调度

**执行目标**：插件启用时按设置启动 `startup`/`daily` 检查；检查结束只 reload 一次；daily 失败也写 `lastCheckAt`；插件停用时清理。

**改动文件**

- `packages/resources/plugins/src/library.ts`：新增 `pluginUpdateSource(reload)` 工厂（“设计 5.1”）。
- `packages/resources/plugins/src/index.ts`：
  - import `startUpdateSchedule` 与 `pluginUpdateSource`。
  - 在注册设置区块之后调用：
    ```ts
    startUpdateSchedule(ctx, PLUGINS_ID, pluginUpdateSource(() => library.reload()))
    ```
- `inject` 已在阶段 2 加好，不需要再改。

**验收**

```bash
pnpm --filter @context-hub/plugins typecheck
pnpm --filter @context-hub/plugins test
pnpm --filter @context-hub/plugins lint
```

UI 验收（隔离 hub home）：

1. 先把 `<HUB_HOME>/state/settings.json` 写成 daily 且 `dailyAt` 是当前时间前一分钟：
   ```bash
   mkdir -p "$HUB_HOME/state"
   PAST="$(node -e 'const d=new Date(Date.now()-60000); console.log(`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`)')"
   printf '{"plugins":{"hub.plugin.catalog":{"check":"daily","dailyAt":"%s","autoDownload":false}}}\n' "$PAST" > "$HUB_HOME/state/settings.json"
   ```
   若当前时间在 00:00 且“前一分钟”落到昨天，今天的 daily 槽位尚未到，补跑无法成立；改用 `startup` 验证接线，daily 补跑由阶段 1 的单测覆盖。
2. 启动隔离 dev server（见“UI 验证”），等待 5270/5271 监听。
3. 轮询最多 15 秒（每秒读一次 `settings.json`），断言 `plugins["hub.plugin.catalog"].lastCheckAt` 存在且 `Date.parse` 有效。没有这个字段就说明调度没有接通/没有补跑；这是本阶段的正向判据。
4. 打开 `/settings`，确认 daily 区块显示的是 seed 的时间；浏览器 console 里没有以 `plugins: ` 开头的 warn（空库检查应当成功）。
5. 记下当前 `lastCheckAt`；把设置切到 `Manually`，等 2 秒，再读文件，断言 `lastCheckAt` 与切换前相同。文件 mtime 会因为设置写入而变化，不能作为判据；manual 不 arm 的结论同时由阶段 1 的 `msUntilDue("manual") === null` 与 `onChange` 测试覆盖。

说明：定时器本身、startup/daily 的纯逻辑由阶段 1 的 fake-context 测试覆盖；本阶段不构造真实上游更新，也不依赖网络。真实 `outdated && !modified` 的筛选由阶段 1 的 `updatableNames`/`updateOutdated` 测试覆盖。

### 阶段 4：手动检查接入自动下载

**执行目标**：工具栏 `Check updates` 与详情单包 `Check` 在 `autoDownload` 开启时，检查完立即更新未手改的包；关闭时保持只检查。`PluginUpdateSummary` 的计数与失败列表反映实际发生的更新。

**改动文件**

- `packages/resources/plugins/src/library.ts`：
  - 新增 `usePluginSettings`（`@context-hub/extensions/react`）与 `updateOutdated`/`mergeUpdatePass`/`readPluginUpdateSettings`/`DEFAULT_PLUGIN_UPDATE_SETTINGS`/`type PluginUpdateSource`（`./update-settings.ts`）的 import；`pluginUpdateSource` 在阶段 3 已定义在同一文件，不需要 import。
  - 读取 `autoDownload`。
  - 用“设计 5.3 / 5.4”的 `checkUpdates`、`checkUpdate` 替换内联实现。
  - return 对象改为引用这两个回调。
- `packages/resources/plugins/src/revision.ts`：更新 `PluginUpdateSummary.failed` 的文档。
- `packages/resources/plugins/src/messages.ts` / `packages/i18n/zh-cn/src/messages.ts`：把 `plugins.notice.checkFailed` 改成“检查或更新失败”的口径。
- 不需要改 `page.tsx` / `detail-dialog.tsx`；它们只消费 `PluginUpdateSummary` / `Promise<void>`。

**验收**

```bash
pnpm --filter @context-hub/plugins typecheck
pnpm --filter @context-hub/plugins test
pnpm --filter @context-hub/plugins lint
pnpm --filter @context-hub/zh-cn test
```

通过判据：

- 阶段 1 的 `updateOutdated` 测试证明 `modified` 的包不会被调用 `update`；`mergeUpdatePass` 测试证明 summary 的 `outdated` 与 `failed` 修正。
- `checkUpdates`/`checkUpdate` 的签名不变，`page.tsx` 与 `detail-dialog.tsx` 不需要改；typecheck 证明调用方仍成立。
- 浏览器里在空库上打开 autoDownload，点 `Check updates`，不出现错误；toast 仍是原有的 “Checked 0 packs…”，不新增 UI。
- 不构造真实上游更新；真实更新路径由 `host/update.ts` 的既有测试与阶段 1 的 fake source 覆盖。

### 阶段 5：端到端验收与清理

**执行目标**：在隔离 hub home 里验证设置区块、持久化、daily 补跑与全局搜索；跑完整门禁；确认没有污染真实用户目录。

**步骤**

1. 跑完整门禁：
   ```bash
   pnpm --filter @context-hub/plugins test
   pnpm --filter @context-hub/plugins typecheck
   pnpm --filter @context-hub/plugins lint
   pnpm --filter @context-hub/zh-cn test
   pnpm typecheck
   pnpm lint
   pnpm test
   ```
2. 按“UI 验证”起隔离 dev server，完成：
   - 设置区块可见；
   - Daily 显示时间输入；
   - 改值后 `settings.json` 有 `plugins["hub.plugin.catalog"]`，刷新后仍在；
   - daily 补跑写入 `lastCheckAt`；
   - 全局搜索 `plugin updates` / `插件更新` 能找到该区块并跳到 `#plugins-updates`。
3. 收尾：
   - 只停自己启动的 `node apps/web/dev.ts`（按 PID；或只按 5270 端口停，dev.ts 会带走 Vite）。不得按镜像名杀进程，不得杀 5173/其它端口。
   - 删除临时 `HUB_HOME`；确认没有进程还占着它。
   - 对比真实 `~/.context-hub/state/settings.json` 的 mtime：测试前后不变，或该文件本来不存在且测试后仍不存在。
   - `git status --short` 只显示本次计划和源码/测试/文案改动；没有生成物、临时目录或锁文件。
4. AOCI：所有受 AOCI 管理的源码/测试/文案达到最终稳定状态后，按 `AGENTS.md` 调用一次 `aoci_maintain`，只处理工具返回的候选；不要在中间阶段逐文件维护。本计划阶段只读，不调用。

**验收判据**：所有命令退出 0；上面 5 个 UI 观察点都成立；`git status` 只含预期文件。任何一项无法执行（例如 ego-browser 不可用），必须在汇报里写明“未验证”及应运行的命令，不能声称通过。

## 测试计划

新增 `packages/resources/plugins/__test__/update-settings.test.ts`，覆盖：

夹具约定：`record.hash` 是收录时的目录哈希；`record.source.revision` 是记录到的 revision；`record.checked.latest` 是检查到的 revision，`record.checked.currentHash` 是检查时的本地哈希。`record.hash === record.checked.currentHash` 表示未手改；`record.source.revision !== record.checked.latest` 表示上游已前进。

1. 设置解析
   - `readPluginUpdateSettings(null)`、字符串、`{}` → 默认值。
   - 完整字段保留。
   - `"hourly"` / `"weekly"` / `25:00` / `"yes"` / `"never"` → 逐项回落。
   - 只丢坏 `lastCheckAt`，其余字段保留。
2. 到期计算
   - `manual` → `null`。
   - `startup` → `0`，即使有 `lastCheckAt`。
   - daily 当天未到 → 差值；已过且未跑 → `0`；已过且上次在槽位后 → 次日差值；`lastCheckAt` 不可解析 → `0`。
3. 可更新包筛选
   - `outdated && !modified` 才入选；`modified`、同 revision、未检查、local、git-subdir 都不入选。
4. 自动更新
   - 失败包不阻止后续包；`updated`/`failed` 准确。
5. 单次调度检查
   - `autoDownload: false` 只调用 `checkUpdates`，不调用 `update`。
   - `autoDownload: true` 在检查后调用 `update`。
6. 调度器
   - startup 一次 `check` + 一次 `reload`，不写 `lastCheckAt`。
   - daily 在选定时间触发，写 `lastCheckAt`。
   - daily 检查抛错时仍 `reload` 一次并写 `lastCheckAt`。
7. `mergeUpdatePass`
   - `outdated` 减去已更新数；失败合并；已更新数大于 `outdated` 时夹到 0。

可能受影响的现有测试与要运行的命令：

- `packages/i18n/zh-cn/__test__/messages.test.ts` 会因新增英文键缺中文而失败；阶段 2 必须同步 `zh-cn/src/messages.ts`。运行 `pnpm --filter @context-hub/zh-cn test`。
- `packages/resources/plugins/__test__/library-store.test.ts` 与 `library.test.ts` 不触碰 `library.ts` 的 React hook；当前改动不应影响它们，但仍跑 `pnpm --filter @context-hub/plugins test`。
- `packages/resources/plugins/__test__/search.test.ts` 不读 settings；不应受影响。
- 根 `pnpm test` 会跑全部项目，包括 zh-cn 与 plugins；最终必须全绿。
- 不改 `package.json` / `vitest.config.ts`；新测试文件在已有 include 下自动收集。

## UI 验证

使用 `ego-browser` skill（不是内置浏览器/其他 web 工具）。

### 隔离 hub home

在仓库根目录、Git Bash：

```bash
HUB_HOME="${TEMP:-/tmp}/hub-plugin-settings-verify-$$"
mkdir -p "$HUB_HOME/state"
# 可选：seed daily 补跑（阶段 3/5）
PAST="$(node -e 'const d=new Date(Date.now()-60000); console.log(`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`)')"
printf '{"plugins":{"hub.plugin.catalog":{"check":"daily","dailyAt":"%s","autoDownload":false}}}\n' "$PAST" > "$HUB_HOME/state/settings.json"

CONTEXT_HUB_HOME="$HUB_HOME" node apps/web/dev.ts > "$HUB_HOME/dev.log" 2>&1 &
DEV_PID=$!
```

- 绕过 `turbo`（直接 `node apps/web/dev.ts`），避免 turbo 2 的 strict env 过滤；`CONTEXT_HUB_HOME` 是 `resolveHubHome` 的第一优先级环境变量（`packages/core/src/host/home.ts:10-16`）。
- 端口来自 `apps/web/hub-port.ts`：hub `5270`，Vite `5271`，均 `strictPort`。等到两个端口都 LISTENING 再打开页面：
  ```bash
  until netstat -ano | grep -q ':5270 .*LISTENING' && netstat -ano | grep -q ':5271 .*LISTENING'; do sleep 1; done
  ```
- 不要用真实的 `~/.context-hub`；不要在这个测试里点会写 agent 目录（`~/.claude`、工作区 `.claude`）的动作。

### 设置页

1. ego-browser 打开 `http://127.0.0.1:5271/settings`。
2. 滚动到 `#plugins-updates`，确认：
   - 标题 `Plugin updates`（英文环境）或 `插件更新`（中文环境）；
   - 一行三段的检查时机，默认 `Manually`；
   - 一行自动下载开关，默认关。
3. 点 `Daily`，确认出现 `input[type="time"]`；如果 seed 了“前一分钟”，值为 seed 的 `dailyAt`，否则为默认 `14:00`。
4. 如果 seed 的是“前一分钟”，轮询最多 15 秒（每秒读一次 `settings.json`），直到出现可解析的 `lastCheckAt`；这是调度接通的判据。没有出现就是未接通/未补跑。
5. 把时间改成晚于当前本地时间，打开自动下载；等待设置写入。
6. 读取 `<HUB_HOME>/state/settings.json`：
   ```bash
   node -e 'const s=require(process.argv[1]); console.log(JSON.stringify(s.plugins["hub.plugin.catalog"]))' "$HUB_HOME/state/settings.json"
   ```
   期望 `check: "daily"`、`dailyAt` 是设置值、`autoDownload: true`；`lastCheckAt`（如果第 4 步已经补跑）仍在。
7. 刷新页面，确认三个控件仍是刚才的值；再读一次文件，值不变。
8. 可选：Ctrl+K 打开全局搜索，输入 `plugin updates` / `插件更新`，确认出现 Settings 分组的结果，点击后 URL 带 `#plugins-updates`。

### 收尾

```bash
kill "$DEV_PID"        # 只杀自己启动的 dev.ts；它会带走 hub server 与 Vite
rm -rf "$HUB_HOME"     # 确认没有进程还占着它
```

- 如果 `DEV_PID` 已退出，不要按端口或镜像名猜杀；用 `netstat -ano | grep ":5270" | grep LISTENING` 确认没有残留，再按 PID 处理。
- 测试前后对比真实设置文件：
  ```bash
  REAL="$HOME/.context-hub/state/settings.json"
  test -f "$REAL" && stat -c '%Y' "$REAL" || echo missing
  ```
  两次输出必须相同；没有真实文件时两次都应是 `missing`。
- 最后 `git status --short`，确认只有本次计划与预期源码/测试/文案文件。

## 风险与回滚

1. **路由不可用**：`source.checkUpdates()` 的 `fetch` 失败时，`run()` 捕获并 `report("update check failed: ...")`；web host 的 `log` 打到 console。daily 仍写 `lastCheckAt`，所以不会在每次设置变化/刷新时重试。startup 在 `startupDone` 置 true 后不会自动重试，直到插件重新启用。
2. **`reload()` 触发客户端探测**：`PluginLibrary.reload()` 会读共享索引并询问被选中的 agent，可能运行客户端命令行。定时检查只在全部更新结束后调用一次，不会按包重复；`running` 防止重叠。如果某个客户端命令很慢，下一次 tick 会等这次 run 结束。
3. **调度只在插件启用期间运行**：web 形态内核在浏览器，关闭页面/标签后定时器消失；重新打开时按 `msUntilDue` 补跑一次。skills 也是这个语义。没有服务端后台任务。
4. **`lastCheckAt` 是 daily 专用字段**：startup/manual 不写；失败也写；切到 manual/startup 不清除旧值，切回 daily 时如果旧值早于今天的槽位会立即补跑。设置区块写入时展开当前设置，保留该字段。
5. **手动检查的语义变化**：autoDownload 开启时，工具栏 `Check updates` 和详情单包 `Check` 可能写文件；这是设置明确要求的。`modified` 的包只检查、不更新。`Update all` 仍是原有的全量更新（包括 modified），本计划不改。
6. **更新失败与检查失败合并进 `failed`**：页面 toast 现在说“检查或更新失败”；`PluginUpdateSummary.failed` 的文档同步。调度器只记录 `outcome.failed`（更新失败）与路由级异常；单个来源在 `check-updates` 里的失败不会写日志，只体现在记录没有更新。如果需要在定时日志里看到这些，需要让 `runScheduledCheck` 返回检查摘要的 `failed`，属于后续小改动。
7. **文件相同但 revision 未推进**：`host/update.ts:73-85` 在下载内容与记录哈希相同时只写 `checked`，不更新 `record.source.revision`；`outdated()` 仍会为 true。自动下载可能每天对这样的包重复“更新”（每次 `changed: false`，不写文件）；同一原因下，`mergeUpdatePass` 会把这种包计为已更新并减掉 `outdated`，但下一次检查仍会再次选中它。这是既有行为，本计划不修；如果验收看到重复更新，单开任务修 `update.ts` 或让 `updateOutdated` 记录 `changed: false` 的 revision。
8. **检查后、更新前的手改竞态**：`modified` 以最近一次检查的 `currentHash` 为准；检查与更新之间的手改不在判据内，`host/update.ts` 仍可能覆盖并返回 `overwroteEdits`。自动 pass 丢弃该字段。要绝对防止，需要宿主更新接口在替换前比对当前哈希并拒绝，属于另一个改动。
9. **`PLUGINS_ID` 落点**：放在 `contract.ts` 是为了避开循环 import；`index.ts` 继续导出。如果坚持放在 `index.ts`，`settings-section.tsx`/`library.ts` 反向 import 会形成环，虽然只在函数体内读取、运行期可行，但维护性更差。
10. **无新增依赖/无迁移**：设置值存在 `state/settings.json` 的 `plugins["hub.plugin.catalog"]` 下，旧 build 把它当不透明值保留；回滚后调度器不再启动，已存的 `lastCheckAt` 被忽略。删除区块后，中英文表里的 `plugins.settings.*` 若不一起删，zh-cn 测试只打印 stale key、不失败，但应一起清理。
11. **定时检查与手动检查没有互斥**：`running` 只防同一条定时器重叠；定时检查与工具栏/详情的手动检查可能同时向同一批来源发问，后写入的 `checked` 覆盖先写入的。答案通常一致，但会多一次网络或子进程。若需要严格单飞，可在 `PluginUpdateSource.checkUpdates` 外再加一个 promise 锁；本计划不加。

回滚方式：

- 撤销上述 9 个文件的改动；删除新文件与测试。
- 不需要迁移或删除 `state/settings.json` 中的插件命名空间；它不影响旧 build。
- 若只回滚 UI 而保留设置键，设置页不再渲染区块（没有 contribution），全局搜索也不会出现；没有运行时错误。
- 若已启动过 dev server，按 PID 停掉并删除临时 hub home；不要清理真实的 `~/.context-hub`。

## 自审

- **阶段判据**：每个阶段都有命令或可观察结果；阶段 2 的“控件可见/文件持久化”、阶段 3 的“daily 补跑写 `lastCheckAt`”、阶段 5 的完整门禁与 UI 观察点都能执行。没有“验证一下”这类空话。
- **依赖顺序**：阶段 1 的纯逻辑先落地；阶段 2 的组件 import 它；阶段 3 的 index import 组件与调度器；阶段 4 的 hook import 阶段 1 的 `updateOutdated`/`mergeUpdatePass`；阶段 5 依赖前四阶段。没有阶段依赖后建文件。
- **调用方/测试/fixture/配置/导出**：已核对 `usePluginLibrary` 的唯一调用点、`checkUpdates`/`checkUpdate` 的调用点与签名、`pluginsExtension.name` 的唯一字面量、`inject` 的服务名、`settingsSection` 的消费者、zh-cn 的键覆盖测试、plugins 的 vitest include、根 vitest projects。没有 fixture 或配置需要改；没有新增 package exports。
- **事实与猜测**：`PluginLibrary.reload()` 会探测客户端（`library-store.ts:200-271`、`scan.ts`）；设置页自动渲染贡献（`settings.tsx:358,645-655`）；全局搜索读贡献（`search.ts:114-121,155-167`）；`host/update.ts` 的“相同哈希不推进 revision”是读代码确认的既有行为；`CONTEXT_HUB_HOME` 与端口来自 `home.ts`/`hub-port.ts`/`dev.ts`。没有依赖训练数据中的外部版本或 API。
- **范围**：没有把“每小时”、页面改版、skills 重构、`Update all` 行为、内核公共 API 顺手加进来；“不做”列表覆盖了这些。新增的 `mergeUpdatePass` 与 `pluginUpdateSource` 是为了让 summary 修正和路由 action 只有一个落点，不是额外功能。
- **待确认项**见下；这些是真实选择，不需要在实施时再猜。

## 已定的实现选择

以下是自审后按“与 skills 同构、最小改动”定下的细节；批准计划即视为接受。若不同意任一条，请在批准前指出。

1. `PLUGINS_ID` 放在 `contract.ts`，避免 `settings-section.tsx` / `library.ts` 反向 import `index.ts` 形成循环；`index.ts` 继续使用它，并通过已有的 `export *` 暴露。
2. `plugins.notice.checkFailed` 改成“检查或更新失败”的口径；自动下载让失败列表不再只代表“来源问不出来”。
3. 定时检查中单个来源的失败不单独写日志，与 skills 一致；只记录更新失败与路由级异常。
4. 详情单包 `checkUpdate` 返回的 `currentHash` 保留更新前的测量值；当前唯一调用方丢弃返回值，不在更新后多读一次。
5. daily 在应用关闭期间错过时刻、下次打开补跑一次；这是 skills 已采用的语义。

## 审批与推进

- 本计划写完后已按上面“自审”逐项检查并修正；没有改动任何源码。
- 请确认计划；未明确批准前不执行阶段、不创建任务、不改源码。
- 批准后按阶段用 `TaskCreate` 建任务、`TaskUpdate` 推进；每阶段验收通过后立即标完成。
- 批准后、开始执行前，把本文件移到 `docs/plans/archive/`（与上一个计划的归档方式一致）。
