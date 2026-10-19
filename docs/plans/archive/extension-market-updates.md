# 扩展市场：`engines` 兼容、更新与卸载

## 背景

当前扩展市场只解决“第一次安装”，没有“已安装的包是否落后”。同时，兼容性由 `plugin.yaml` 的 `apiVersion` 表达，并且被当成整份市场索引的校验条件：只要某个版本面向未来的内核 API，整个市场页就读不出来。

本次按用户要求改成 `package.json` 的 `engines` 模型：

- 移除 `apiVersion`。
- 插件在 `plugin.yaml` 用 `engines.contextHub` 声明兼容的 **Context Hub 应用版本**范围。
- 支持 npm semver 区间，例如 `">=0.1.0 <0.7.0"`。
- 安装和更新前检测范围；不适配就不安装、不更新，并在插件页面直接显示。

### 补充需求（2026-10-20）

用户看到 `<hub-home>/state/extensions.json` 里有 `"skills.sh": true`、`"claude.code": true`，认为扩展目录已经描述了插件，状态文件里不该再有这些条目。这里需要澄清：

- `state/extensions.json` **不是描述或元数据**，它只存每个扩展的启用/停用布尔值。插件描述在 `extensions/<id>/plugin.yaml`；安装来源、版本与时间在 `extensions/index.json`。两处没有重复的描述字段。
- 这个布尔值是“用户选择”的唯一记录：市场插件的 `defaultEnabled` 是 `false`，删掉键后重启就会变成停用；用户手动停用也必须记在这里。
- 本次不改变状态文件的语义。卸载时会把对应键一起删掉（见下），所以文件只保留“仍在磁盘上或随构建发布”的扩展及其开关。

同时，用户要求卸载时把 clone 下来的代码一并删除。当前 UI 的「卸载」实际只做停用，目录和 `index.json` 记录都保留。本次改为：

- 磁盘上的扩展（`stored`）卸载 = 删除 `<hub-home>/extensions/<id>` 目录 + 删除 `index.json` 记录 + 删除状态键 + 从运行中的 catalog 撤下。
- 随构建发布的扩展（内置/编译模块）不能删代码，动作文案改为「停用」，行为仍是切换 enablement。

### 补充需求：更新检查设置（2026-10-20）

用户要求扩展这一块也有和 SKILL 模块一样的设置：

- 什么时候检查远程市场：`手动 / 启动时 / 每天`（每天可指定本地时间）。
- 发现更新时是否自动安装。
- 扩展页提供手动「检查更新」入口。

设置放在 `state/settings.json` 的 `plugins["hub.extensions"]` 命名空间里（与技能/插件模块同一机制），不写进 `state/extensions.json`。调度器只在 hub 页面打开期间运行，与 SKILL 模块一致；关闭页面不会继续定时。

## 现状（按真实代码）

| 位置 | 当前行为 |
| --- | --- |
| `packages/core/src/extension-manifest.ts` | `EXTENSION_API_VERSION = "0.1"`；`isCompatible(apiVersion)` 去掉 `^`/`~` 后与它精确比较；`parsePluginManifest` 遇到不适配的 `apiVersion` 直接抛错。 |
| `packages/core/src/extension-market.ts` | `readMarketIndex()` 的 `version()` 校验 `apiVersion`，不适配就 `fail()`，整份索引读取失败。`recommendedVersion(plugin)` 返回 `versions[0]`。 |
| `packages/core/src/host/extension-market.ts` | `installExtensionFromMarket` 克隆默认分支、复制目录、校验 `package.json` 版本与索引一致、权限一致、entry 存在，再 `replaceDirectory` 原地替换。已有目录时 `fresh=false`，enablement 取 `state.extensions[id] ?? defaultEnabled`。它不单独校验 `apiVersion`（依赖索引读取时已校验）。 |
| `packages/extensions/src/service.ts` | `ExtensionService.add(module)` 对已存在 id 抛错；有 `enable`/`disable`/`toggle`；没有替换已存在模块的方法。`status: "incompatible"` 已存在。 |
| `packages/extensions/src/plugin.ts` | `discoverPlugins` 先读 `plugin.yaml`，再 import 入口模块。manifest 解析失败（含旧 `apiVersion` 不适配）时报告 `problem`，插件不再出现在 catalog。 |
| `apps/web/src/lib/extension-market.ts` | `marketEntriesFor(installed, index)` 排除已安装 id，用 `recommendedVersion` 填 manifest。 |
| `apps/web/src/pages/extensions.tsx` | 内核快照行与未安装市场行合并；安装成功后调用 `ctx.extensions.add(module)`；`detailMarket` 用 `recommendedVersion`。 |
| `apps/web/src/components/extension-detail-dialog.tsx` | 展示安装版本、市场来源；footer 只有一个主按钮。 |
| 版本来源 | `apps/web/server.ts:113-117` 从仓库根 `package.json` 读 `version`（当前 `0.0.1-beta.5`），传给 `createAboutHandler`。浏览器内核目前不知道这个版本。 |
| `D:\work-space\context-hub-extensions` | `scripts/build-marketplace.mjs` 从 `plugin.yaml.apiVersion` 生成 `marketplace.json.versions[].apiVersion`；两个插件都写 `apiVersion: "^0.1"`。 |

### 两个具体问题

1. **没有更新路径。** 已安装行只提供卸载/启用；详情弹窗用 `recommendedVersion`，对“已安装但停用”的市场插件仍走安装分支。安装器替换完目录后，`ctx.extensions.add(module)` 因 id 已存在而抛错，用户看到失败但文件已经被替换。
2. **兼容性范围错了。** 一个面向未来内核的版本会 `fail()` 整份索引，导致同一市场里其他仍可安装的插件、以及该插件自己更旧的兼容版本全部消失。兼容性应该是“选择哪个版本/能不能安装”的问题，不是“整份文档是否可读”的问题。

## 目标

1. `plugin.yaml` 用 `engines.contextHub` 声明兼容的 Context Hub 版本范围，移除 `apiVersion`。
2. 支持 npm semver 区间（比较器、`^`、`~`、空格 AND、`||` OR、预发布）。
3. 市场索引保留所有版本，按当前 Context Hub 版本选择第一个兼容版本。
4. 安装器在克隆前拒绝不兼容的索引版本，并在包内 manifest 再次校验。
5. 已安装插件出现兼容新版本时能检测、原地更新文件并替换运行中的模块，不刷新页面。
6. 插件列表和详情弹窗一眼区分：可更新、不兼容、普通已安装/未安装。
7. 已安装但当前版本不兼容的插件仍然出现在列表里（标记不兼容），但**不 import 它的入口代码**。
8. 测试覆盖正反例，文档与远程市场仓库同步。
9. 磁盘扩展卸载时删除目录、安装记录与状态键；内置扩展的对应动作改叫「停用」。
10. 设置页提供与 SKILL 模块一致的更新检查时机（手动/启动时/每天）与自动更新开关。
11. 扩展页提供手动「检查更新」入口；调度只在 hub 打开期间运行。

## 非目标

- 不做页面关闭后仍运行的守护进程或系统计划任务；调度器跟随页面/内核生命周期，与 SKILL 模块一致。
- 不实现“一个插件同时发布多个版本”的生成器；索引格式继续支持 `versions[]`，但远程生成器仍只生成一个版本，多版本可由发布方手写索引提供。
- 不把页面重构为设计稿里的“工具栏安装扩展 + 只显示已装项”；`designs/extensions.pen` 的结论保留为后续任务。
- 不做更新回滚/备份 UI；`replaceDirectory` 现有的文件级回滚保持不变。
- 不做 SemVer 版本排序或“哪个更新”的判断；更新目标仍是“第一个满足 `engines` 的索引版本”，版本串比较只用于判断是否不同。
- 不改权限、签名、沙箱或市场信任模型。
- 不碰 `apps/desktop/src/*`、`apps/web/src/lib/desktop.ts`、`apps/web/src/lib/app-menu.ts`、`apps/web/__test__/app-menu.test.ts`、`docs/plans/desktop-app-menu.md`：这些属于工作树里另一个未完成任务。

## 契约设计

### 1. 字段形状

`plugin.yaml`：

```yaml
engines:
  contextHub: ">=0.1.0 <0.7.0"
```

`marketplace.json` 的每个版本条目同样携带 `engines`：

```json
{
  "version": "0.1.0",
  "engines": { "contextHub": ">=0.1.0 <0.7.0" },
  "source": { "type": "git", "url": "https://…", "path": "plugins/claude.code" }
}
```

选择 `engines.contextHub` 而不是顶层字符串的理由：与 npm `engines` 同形，目标运行时写在键上，未来若出现第二个运行时不需要改结构。`contextHub` 为必填键；其他键忽略。

### 2. 类型与判定

在 `packages/core/src/extension-manifest.ts`：

```ts
/** Runtime versions this package supports, keyed by runtime name. */
export interface Engines {
  /** Context Hub versions this package runs on, as an npm semver range. */
  contextHub: string
}

/** Whether this hub version satisfies the package's declared range. */
export function isCompatible(
  engines: Engines | undefined,
  hubVersion: string
): boolean
```

- `engines === undefined` 视为兼容。它只用于随构建发布的编译模块（内置语言包）；磁盘包和市场包必须有 `engines`。
- `hubVersion` 用 `semver.valid()` 校验；无效时返回 `false`（fail closed）。
- 判定用 `semver.satisfies(hubVersion, engines.contextHub, { includePrerelease: true })`。当前应用版本是 `0.0.1-beta.5`，默认 semver 规则会把预发布版本排除在 `>=0.0.0` 之外；`includePrerelease` 让区间按用户直觉工作。这一点写进文档。
- 区间语法在解析时用 `semver.validRange()` 校验；非法区间直接报错，不进入运行期。

移除 `EXTENSION_API_VERSION` 和旧的 `isCompatible(apiVersion)` 语义。

### 3. 各层职责

| 层 | 行为 |
| --- | --- |
| `parsePluginManifest` / `parsePluginManifestYaml` | 只校验结构与区间语法；不知道当前版本，不做兼容判断。`engines` 必填。 |
| `discoverPlugins({ hubVersion })` | 读到 manifest 后先判 `isCompatible`。不兼容时**不 import 入口模块**，返回只带 manifest 的 `ExtensionModule`；`ExtensionService` 把它标成 `incompatible`。 |
| `ExtensionService` | 用 `host.version` 判定；不兼容的条目保留在 snapshot 里、`enabled=false`、不可启用；`add`/`replace` 同样处理。 |
| `installExtensionFromMarket({ hubVersion })` | 克隆前拒绝索引 `version.engines` 不适配的版本；读完包内 manifest 后再用 `manifest.engines` 校验一次。 |
| `readMarketIndex` | 只校验结构与区间语法，不因某个版本不适配而拒绝整份索引。 |
| `compatibleVersion(plugin, hubVersion)` | 第一个满足 `engines` 的版本，没有则 `null`。 |
| `updateFor(plugin, installedVersion, hubVersion)` | 见下表。 |

`updateFor` 的规则：

| 情况 | 返回 |
| --- | --- |
| 第一个兼容版本存在且版本串 ≠ 已装版本 | `{ latest, target }`，有更新 |
| 第一个兼容版本存在且版本串 = 已装版本 | `null`，已是最新（即使 `versions[0]` 是更新的不兼容版本） |
| 没有兼容版本，`versions[0].version` ≠ 已装版本 | `{ latest, target: null }`，只有不兼容的新版本 |
| 没有兼容版本，`versions[0].version` = 已装版本 | `null` |

`latest` 永远是 `versions[0]`，只用于展示。

### 4. 应用版本从哪来

- `apps/web/server.ts` 已经算出 `version`（仓库根 `package.json`）。新增：
  - `createExtensionMarketHandler({ version, ... })`
  - `createAboutHandler({ version, ... })` 保持现状。
- 浏览器侧 `startHub()` 在启动时 `GET /hub/about` 取同一个值，放进 `PlatformHost.version`，并传给 `discoverPlugins({ hubVersion })`。取不到时回退 `"0.0.0"` 并写一条 `console.warn`（此时所有声明了区间的磁盘包都会判为不兼容，属于 fail closed）。
- `packages/extensions/src/host.ts` 的 `PlatformHost` 增加 `readonly version: string`；所有测试 host 显式给值。
- 页面通过 `useHub().host.version` 读取，不再单独请求 About。

### 5. 依赖

新增生产依赖：`packages/core` 加 `semver@^7.8.5`，并加 `@types/semver@^7.8.0` 到 devDependencies。

理由：仓库与标准库都没有 semver 区间解析；在信任边界上手写比较器、`^`/`~`、`||` 和预发布排序很容易出错。`semver` 无运行时依赖，浏览器与 Node 都可用。这是本计划唯一的新依赖。

### 6. 更新检查设置与调度

设置形状（存在 `state/settings.json` 的 `plugins["hub.extensions"]`，与 SKILL 模块同一机制）：

```ts
export type ExtensionCheckTiming = "manual" | "startup" | "daily"

export interface ExtensionUpdateSettings {
  check: ExtensionCheckTiming
  /** Local time of the daily check, `HH:MM`. */
  dailyAt: string
  autoUpdate: boolean
  /** When the last scheduled check ran; internal, not shown. */
  lastCheckAt?: string
}
```

默认值：`manual` / `14:00` / `autoUpdate: false`，与 SKILL 模块一致。读取时逐字段归一化，未知值回落默认。

调度逻辑：

- `runExtensionCheck(ctx)`：
  1. `refreshExtensionMarket(OFFICIAL_MARKET_URL)` 强制重读索引（绕过宿主 5 分钟缓存），并广播给已打开的扩展页。
  2. `marketUpdatesFor(ctx.extensions.snapshot().entries, index, ctx.host.version)` 算出有兼容更新目标的插件。
  3. `autoUpdate === false` 时到此为止，页面徽章更新；`true` 时逐个 `installMarketExtension`（安装 → `discoverPlugins` → `ctx.extensions.replace`），收集失败。
  4. 返回 `{ checked, updated, failed }`，供手动按钮做 toast；调度器只写 `host.log`。
- `startExtensionUpdateSchedule(ctx)`：
  - `manual` 不装定时器；`startup` 每次页面加载跑一次；`daily` 按本地 `dailyAt` 定时，错过则补跑一次。
  - `daily` 每次运行后写 `lastCheckAt`（失败也写，避免每分钟重试）。
  - 监听 `settings/change`，`check` 或 `dailyAt` 变化时重新装定时器。
  - 用 `ctx.effect` 清理定时器；`running` 标志避免重叠。
  - 调度器在 `startHub()` 里 `kernel.start()` 之后启动，与 `preloadMarket()` 并列。
- `msUntilDue` 不再复制第三份：抽到 `packages/extensions/src/update-check.ts`（`UpdateCheckTiming` + `msUntilDue`），`packages/resources/skills/src/update-settings.ts` 与 `packages/resources/plugins/src/update-settings.ts` 改为从 `@context-hub/extensions` 导入并 re-export，现有测试的 import 不变。
- 手动入口：扩展页工具栏（搜索框右侧）加「检查更新」按钮，调用 `runExtensionCheck(ctx)`；运行中禁用。`autoUpdate` 开启时手动检查也会安装，和 SKILL 的手动检查一致。
- 自动更新的保护：只更新 `target !== null` 的兼容版本；没有内容哈希，**无法识别本地手改**。`autoUpdate` 默认关闭，文档写明“自动更新会覆盖该插件目录下的本地修改”。

## 受影响文件

| 文件 | 改动 |
| --- | --- |
| `packages/core/package.json` | 新增 `semver`、`@types/semver`。 |
| `packages/core/src/extension-manifest.ts` | `Engines`、`parseEngines`、新 `isCompatible`；移除 `EXTENSION_API_VERSION` 与解析期兼容拒绝。 |
| `packages/core/src/extension-market.ts` | 版本条目改为 `engines`；新增 `compatibleVersion`、`updateFor`、`MarketUpdate`；保留 `recommendedVersion`。 |
| `packages/core/src/host/extension-market.ts` | `InstallDependencies` 增加 `hubVersion`；克隆前与 manifest 后各校验一次。 |
| `packages/core/src/host/plugins-fs.ts` | `looksLikeExtension` 改用 `engines`（迁移识别可兼容旧 `apiVersion`）。 |
| `packages/core/src/handlers.ts` | `createExtensionMarketHandler` 增加 `version` 选项并传给安装器。 |
| `apps/web/server.ts` | 把根版本传给市场处理器。 |
| `packages/extensions/src/host.ts` | `PlatformHost.version`。 |
| `packages/extensions/src/service.ts` | 兼容判定改用 `isCompatible(manifest.engines, host.version)`；新增 `replace(module)`、`remove(id)`；`ExtensionView` 增加 `stored`。 |
| `packages/extensions/src/plugin.ts` | `discoverPlugins` 增加 `hubVersion`；不兼容时不 import 入口；返回的 module 标记 `stored: true`。 |
| `packages/extensions/src/types.ts` | `ExtensionManifest.engines?`；`ExtensionModule.stored?`；移除 `EXTENSION_API_VERSION` 再导出。 |
| `packages/extensions/src/builtin/locale-en.ts` | 移除 `apiVersion`（编译模块可省略 `engines`）。 |
| `packages/extensions/examples/*/plugin.yaml` | 改为 `engines`。 |
| `apps/web/src/lib/hub.ts` | 启动时读 `/hub/about`；`PlatformHost.version`；`discoverPlugins({ hubVersion })`；`kernel.start()` 后启动更新调度。 |
| `apps/web/src/lib/extension-market.ts` | `marketEntriesFor(installed, index, hubVersion)`、`marketUpdatesFor(installed, index, hubVersion)`；`MarketEntry.version` 可为 `null`；新增共享的 `installMarketExtension`（安装 → 加载 → `replace`）。 |
| `apps/web/src/lib/extension-updates.ts`（新） | 更新设置类型/默认值/读取、`runExtensionCheck`、`startExtensionUpdateSchedule`。 |
| `apps/web/src/components/extension-update-settings.tsx`（新） | 设置页的更新检查控件（Segmented / time input / SettingSwitch）。 |
| `apps/web/src/pages/settings.tsx` | 增加「扩展更新」设置分组。 |
| `packages/search/global-search/src/search.ts` | 设置表增加 `extensions` 分组的三行；`SettingEntry.anchor` 增加 `"extensions"`。 |
| `apps/web/src/pages/extensions.tsx` | 更新检测、徽章、按钮、统一 `replace`、卸载删文件/内置停用、手动「检查更新」、详情传 `installed`/`update`。 |
| `apps/web/src/components/extension-detail-dialog.tsx` | 兼容提示、适用版本行、更新/卸载/停用按钮。 |
| `packages/extensions/src/update-check.ts`（新） | 共享 `UpdateCheckTiming` 与 `msUntilDue`。 |
| `packages/resources/skills/src/update-settings.ts`、`packages/resources/plugins/src/update-settings.ts` | 改为从 `@context-hub/extensions` 导入并 re-export `msUntilDue`，去掉各自副本。 |
| `packages/extensions/src/builtin/locale-en.ts`、`packages/i18n/zh-cn/src/messages.ts` | 新增/修改文案键。 |
| 测试（见各阶段） | 全部 `apiVersion` fixture 改为 `engines`；新增兼容/更新/替换测试；新增 `apps/web/__test__/extension-updates.test.ts`。 |
| `apps/web/__test__/e2e-server.ts`、`e2e-probe.ts` | 挂 `/hub/about`；市场 fixture 用 `engines`；按钮文案断言。 |
| `docs/extensions.md` | 契约、兼容、更新与迁移说明。 |
| `D:\work-space\context-hub-extensions` | 两个 `plugin.yaml`、`scripts/build-marketplace.mjs`、`README.md`、重新生成的 `marketplace.json`。 |

注意：工作树里 `apps/web/src/lib/extension-market.ts`、`apps/web/__test__/extension-market.test.ts`、`packages/extensions/src/builtin/locale-en.ts`、`packages/i18n/zh-cn/src/messages.ts` 已有桌面菜单任务的未提交改动。本计划只做增量编辑，不整文件还原。

## 阶段

### 阶段 1：引入 `engines` 契约（core）

**执行目标**：manifest 与市场索引的类型、解析、区间判定切到 `engines`；包能通过 typecheck（此时上层调用方仍需同步改签名，见阶段 2）。

**改动文件**

- `packages/core/package.json`、`pnpm-lock.yaml`（`pnpm install` 生成）
- `packages/core/src/extension-manifest.ts`
- `packages/core/src/extension-market.ts`
- `packages/core/__test__/extension-manifest.test.ts`
- `packages/core/__test__/extension-market-index.test.ts`

**关键实现点**

1. `pnpm --filter @context-hub/core add semver@^7.8.5`，`pnpm --filter @context-hub/core add -D @types/semver@^7.8.0`（需要外网时带 `dangerouslyDisableSandbox`）。
2. 定义 `Engines`，新增 `parseEngines(value)`：
   - 必须是对象；`contextHub` 必须是非空字符串；`semver.validRange` 必须非 `null`。
   - 其他键忽略。
3. `parsePluginManifest` 读取 `engines`（必填），不再检查兼容性；移除 `EXTENSION_API_VERSION`。
4. `isCompatible(engines, hubVersion)` 按上文实现；`engines === undefined` 为 true。
5. `extension-market.ts`：`ExtensionMarketVersion.apiVersion` → `engines: Engines`；`version()` 用同样的结构/区间校验，但不再因不适配拒绝；新增 `compatibleVersion`、`updateFor`、`MarketUpdate`。
6. 测试：
   - `isCompatible`：`"0.0.1-beta.5"` 对 `">=0.0.0 <0.7.0"` 为 true（证明 `includePrerelease`）；对 `">=0.1.0 <0.7.0"` 为 false；`"0.5.0"` 对 `">=0.1.0 <0.7.0"` 为 true；`"0.7.0"` 为 false；`"0.0.1"` 对 `"^0.0.1"` 为 true；`undefined` 为 true；非法 `hubVersion` 为 false。
   - `parsePluginManifest`：缺 `engines` 报错；`contextHub` 非字符串报错；非法区间报错；合法区间通过；旧 `apiVersion` 字段被忽略（未知字段）。
   - 市场索引：`apiVersion` 换成 `engines`；旧的“refuses an incompatible apiVersion”改成“keeps a range this kernel does not satisfy”，断言索引仍可读。
   - `compatibleVersion` / `updateFor` 用显式 hubVersion 覆盖四种情况。

**验收**

```bash
pnpm --filter @context-hub/core typecheck
pnpm --filter @context-hub/core test
```

### 阶段 2：内核按应用版本判定兼容

**执行目标**：内核知道自己的版本；不兼容的磁盘扩展保留在 catalog 里并标为 `incompatible`，但入口代码不被 import。

**改动文件**

- `packages/extensions/src/host.ts`
- `packages/extensions/src/types.ts`
- `packages/extensions/src/plugin.ts`
- `packages/extensions/src/service.ts`
- `packages/extensions/src/builtin/locale-en.ts`
- `apps/web/src/lib/hub.ts`
- 相关测试：`packages/extensions/__test__/{plugins,services,i18n,search,catalog}.test.ts`、`packages/core/__test__/bridge.test.ts`、`packages/search/global-search/__test__/search.test.ts` 等所有 `apiVersion` fixture

**关键实现点**

1. `PlatformHost` 增加 `readonly version: string`；测试 host 给 `"0.1.0"` 或与 fixture 区间匹配的值。
2. `startHub()` 用 `GET /hub/about` 取版本（`ABOUT_ROUTE`），失败回退 `"0.0.0"` 并 warn；`webHost.version` 使用它；`installedPlugins(hubVersion)` 传给 `discoverPlugins`。
3. `discoverPlugins({ source, importModule, hubVersion, route, ids })`：
   - 读到 manifest 后先 `isCompatible(manifest.engines, hubVersion)`。
   - 不兼容：构造只含 `name`、`manifest`、`inject`、`stored: true` 的 `ExtensionModule`（不 import 入口），加入结果。
   - 兼容：沿用现有 import 与 `apply` 包装，并在 module 上标记 `stored: true`。
   - 抽一个 `manifestOf()` 小函数，让两条路径共用 manifest 组装（含图标解析）。
4. `ExtensionService`：
   - 构造期、`addNow` 用 `isCompatible(manifest.engines, this.host.version)`；`replaceNow` 在阶段 5 新增时同样处理。
   - `add` / 构造期遇到不兼容条目：`status="incompatible"`、`enabled=false`、不激活，条目保留在 snapshot 里。
   - `replace` 用于“已存在条目换新模块”，市场更新路径只会传兼容模块；若传入不兼容模块，在 deactivate 之前抛错，保留旧条目（见阶段 5）。
   - snapshot 的 `ExtensionView` 增加 `stored: entry.module.stored === true`，页面据此区分“磁盘包”和“随构建发布的包”。
5. 测试：
   - `discoverPlugins` 的 incompatible fixture：`importModule` 不被调用；返回的 module 存在但无 `apply`。
   - `ExtensionService` 快照里该 id 的 `status === "incompatible"`；`enable` 抛错。
   - 兼容 fixture 照旧激活。

**验收**

```bash
pnpm --filter @context-hub/extensions typecheck
pnpm --filter @context-hub/extensions test
pnpm --filter web typecheck
```

### 阶段 3：安装器双重校验

**执行目标**：主机在克隆任何文件之前拒绝索引里不兼容的版本；包内 manifest 再次校验。

**改动文件**

- `packages/core/src/host/extension-market.ts`
- `packages/core/src/handlers.ts`
- `apps/web/server.ts`
- `apps/web/__test__/e2e-server.ts`
- `packages/core/__test__/extension-market-{install,handler,fetch}.test.ts`

**关键实现点**

1. `InstallDependencies` 增加 `hubVersion: string`；开头：
   ```ts
   if (!isCompatible(options.version.engines, options.hubVersion)) throw new Error(...)
   ```
2. 读完 manifest 后：
   ```ts
   if (!isCompatible(manifest.engines, options.hubVersion)) throw new Error(...)
   ```
   这覆盖“索引说兼容、包说不兼容”的不一致。
3. `createExtensionMarketHandler(options: { version: string; ... })`，把 `version` 传给安装器。
4. `apps/web/server.ts` 的 `createExtensionMarketHandler({ ...placed, version })`。
5. `e2e-server.ts` 挂 `createAboutHandler({ version: "0.1.0", home })`，市场处理器同样传版本。
6. 测试：索引 `engines` 不适配 → 拒绝且目标目录不存在；manifest 不适配 → 拒绝且旧目录不变；handler 传版本。

**验收**

```bash
pnpm --filter @context-hub/core typecheck
pnpm --filter @context-hub/core test
pnpm --filter web typecheck
```

### 阶段 4：市场选择与更新计算

**执行目标**：数据层能为每个未安装/已安装插件算出目标版本与更新状态。

**改动文件**

- `apps/web/src/lib/extension-market.ts`
- `apps/web/__test__/extension-market.test.ts`

**关键实现点**

1. `marketEntriesFor(installed, index, hubVersion)`：
   - `version = compatibleVersion(plugin, hubVersion)`。
   - `view.manifest.version/engines` 用 `version ?? versions[0]` 的对应值。
   - `version === null` 时 `view.status = "incompatible"`，否则 `"inactive"`。
   - `MarketEntry.version` 改为 `ExtensionMarketVersion | null`。
2. 新增 `marketUpdatesFor(installed, index, hubVersion): Map<string, MarketUpdateEntry>`；`MarketUpdateEntry = MarketUpdate & { plugin }`。
3. 测试：
   - 未安装、无兼容版本 → status incompatible，version 为 null，但展示最新版本。
   - 第一个不兼容、第二个兼容 → 选第二个。
   - 已装 1.0.0、索引 2.0.0 兼容 → map 中有 target 2.0.0。
   - 已装最新 → 不在 map。
   - 已装 1.0.0、只有 2.0.0 不兼容 → 在 map，target 为 null。
   - 未安装的插件不出现在 map。

**验收**

```bash
pnpm --filter web typecheck
pnpm --filter web test
```

### 阶段 5：扩展生命周期：原地替换与移除

**执行目标**：同一 id 更新后，不刷新页面即可运行新代码；卸载磁盘扩展时从 catalog 撤下并删除对应状态键。

**改动文件**

- `packages/extensions/src/service.ts`
- `packages/extensions/__test__/services.test.ts`

**关键实现点**

1. 新增 `replace(module)`：
   - id 不存在 → `addNow`。
   - `locked` → 抛错。
   - `isCompatible` 不通过 → 抛错（在 deactivate 之前）。
   - 记录 `enabled` → `deactivate(existing)` → `entries.set(id, replacement)`（`Map.set` 保留插入顺序）→ 按需 `activate` → `persist` + `publish`。
2. 新增 `remove(id)`：
   - 未知 id → 抛错；`locked` → 抛错。
   - 已激活则 `deactivate`（dispose fiber，撤销贡献）。
   - `entries.delete(id)` → `persist()`（写出的 map 不再含该 id）→ `publish()`。
   - 不删磁盘文件：`persist()` 让状态文档不再包含该 id；宿主侧的 `removeInstalledExtension` 再删目录、`index.json` 与状态键兜底。service 只负责运行中的 catalog。
3. 测试：
   - `replace`：v1 带 `/v1` nav，`add` 后 `replace` v2 带 `/v2` nav；断言版本、贡献切换、enablement 保持；不存在的 id 等价 add；locked 拒绝。
   - `remove`：已启用的磁盘扩展被移除后，snapshot 不再含该 id、贡献撤销、`persist` 写出的状态不再含该键；对不存在的 id 抛错；locked 拒绝。

**验收**

```bash
pnpm --filter @context-hub/extensions typecheck
pnpm --filter @context-hub/extensions test
```

### 阶段 6：页面展示、更新与卸载动作

**执行目标**：列表和详情弹窗一眼看出可更新/不兼容；更新走原地替换并立即生效；磁盘扩展卸载时删除文件，内置扩展显示「停用」。

**改动文件**

- `apps/web/src/pages/extensions.tsx`
- `apps/web/src/components/extension-detail-dialog.tsx`
- `packages/extensions/src/builtin/locale-en.ts`
- `packages/i18n/zh-cn/src/messages.ts`
- `apps/web/__test__/e2e-probe.ts`

**关键实现点**

1. 页面：
   - `const hubVersion = ctx.host.version`。
   - `marketEntriesFor(snapshot.entries, market.index, hubVersion)`、`marketUpdatesFor(snapshot.entries, market.index, hubVersion)`。
   - 行动作优先级：`update?.target` → 更新；否则未安装市场行 → 安装；否则已启用且 `stored` → 卸载；否则已启用且非 `stored` → 停用；否则 → 启用。
   - 新增 `uninstall(entry)`：
     - `stored === true`：
       1. 已启用时先 `await ctx.extensions.disable(id)`，停止运行中的代码；
       2. `await marketClient.remove(id)` 删目录、`index.json` 记录与状态键；
       3. `await ctx.extensions.remove(id)` 从运行中的 catalog 撤下并 publish。
     - 第 2 步失败时扩展仍是“已安装但停用”，用户可重试或重新启用；第 3 步失败只影响当前页面，刷新后消失。
     - `stored === false`：只 `ctx.extensions.disable(id)`，文案为「停用」。
     - 失败用 toast 报出来；不吞错。
   - `install(item)`：`item.version === null` 直接返回；成功后统一 `ctx.extensions.replace(loaded.module)`；`result.fresh` 决定安装/更新 toast。
   - 行徽章：`update.target !== null` → 「可更新」（`extensions.market.updateAvailable`）；`update !== null && target === null` → 「不兼容」（`extensions.status.incompatible`）。
   - `ExtensionRow` 的无按钮条件改为“没有可更新目标、status 为 incompatible 且不是 `stored`”；`stored` 的不兼容插件仍给「卸载」。
2. 详情弹窗：
   - 新增 props `installed: boolean`、`update: MarketUpdateEntry | null`。
   - 来源区显示目标版本与 `engines.contextHub`（`extensions.market.confirmRequires`）。
   - `market.version === null` 时显示 `extensions.market.incompatible`，占位 `{range}`（最新版本的范围）与 `{version}`（`ctx.host.version`）。
   - footer：
     - 始终「关闭」。
     - 有更新 → 「更新」主按钮。
     - 已启用且 `stored` → 「卸载」；已启用且非 `stored` → 「停用」。
     - 已停用且 `stored` → 「卸载」；已停用且非 `stored` → 「启用」。
     - `status === "incompatible"` 且 `stored` → 仍显示「卸载」；非 `stored` 的 incompatible 不显示动作。
     - 未安装且兼容 → 「安装」。
     - `data-testid="extension-action"` 保留在更新/安装主按钮上；卸载作为次要按钮排在它左边。
3. i18n（en + zh 成对）：
   - 新增 `extensions.action.enable`、`extensions.action.disable`、`extensions.market.updatedNotice`、`extensions.market.incompatible`、`extensions.market.confirmRequires`。
   - `extensions.market.installedNotice` 去掉“刷新页面后加载”。
4. e2e 探针：
   - 卸载后断言 `extensions/skills.sh` 目录不存在、`state/extensions.json` 中该键不存在。
   - 旧断言 “uninstall keeps the installed files” 改为 “uninstall removes the files and the state key”，这是本次的语义变更。
   - 停用内置扩展后的按钮文案改为「启用」；市场 fixture 的 `engines` 与 e2e 版本匹配；更新注释里的“需要刷新”。

**验收**

```bash
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter @context-hub/zh-cn test
pnpm --filter @context-hub/extensions typecheck
```

手工验收（可选，依赖外部市场仓库和 headless Edge）：

1. `pnpm --filter web build`。
2. `node apps/web/__test__/e2e-server.ts --home <临时目录> --market <marketplace.json 或 checkout> --port 5283`。
3. headless Edge + `CDP` 探针走安装 → 卸载 → 重新安装；卸载后目录与 `state/extensions.json` 键都应消失。
4. 更新路径：安装 v1 后把 fixture 的 `package.json` 与索引都升到 v2 且 `engines` 兼容，重启 e2e server，刷新页面；行上出现「可更新」，点击后版本变 v2、徽章消失、无需刷新。
5. 不兼容路径：索引只有 `engines.contextHub: ">=9.0.0"` 的版本；行显示「不兼容」、无安装按钮；详情显示“需要 Context Hub >=9.0.0；当前版本是 0.1.0”。

### 阶段 7：更新检查设置与调度

**执行目标**：设置页提供与 SKILL 模块一致的检查时机（手动/启动时/每天）和自动更新开关；扩展页提供手动「检查更新」；调度只在 hub 打开期间运行。

**改动文件**

- `packages/extensions/src/update-check.ts`（新）
- `packages/extensions/src/index.ts`
- `packages/resources/skills/src/update-settings.ts`
- `packages/resources/plugins/src/update-settings.ts`
- `apps/web/src/lib/extension-updates.ts`（新）
- `apps/web/src/components/extension-update-settings.tsx`（新）
- `apps/web/src/pages/settings.tsx`
- `packages/search/global-search/src/search.ts`、`packages/search/global-search/__test__/search.test.ts`
- `apps/web/src/lib/hub.ts`
- `apps/web/src/pages/extensions.tsx`
- `apps/web/src/lib/extension-market.ts`
- `packages/extensions/src/builtin/locale-en.ts`、`packages/i18n/zh-cn/src/messages.ts`
- `apps/web/__test__/extension-updates.test.ts`（新）

**关键实现点**

1. 共享调度判据：
   - 新建 `packages/extensions/src/update-check.ts`，放入 `UpdateCheckTiming` 与 `msUntilDue`（从 `skills/update-settings.ts` 原样搬移，逻辑不变）。
   - `packages/extensions/src/index.ts` 导出。
   - `skills/update-settings.ts` 与 `plugins/update-settings.ts` 改为 `import { msUntilDue } from "@context-hub/extensions"` 并 re-export；各自测试的 import 路径不变。
2. 设置读写（`apps/web/src/lib/extension-updates.ts`）：
   - `EXTENSION_UPDATES_ID = "hub.extensions"`。
   - `ExtensionUpdateSettings`、`DEFAULT_EXTENSION_UPDATE_SETTINGS`、`readExtensionUpdateSettings`：逐字段归一化，`dailyAt` 用与 SKILL 相同的 `HH:MM` 校验，未知值回落默认。
3. `runExtensionCheck(ctx)`：
   - `refreshExtensionMarket(OFFICIAL_MARKET_URL)` 强制重读并广播。
   - `marketUpdatesFor(ctx.extensions.snapshot().entries, index, ctx.host.version)`。
   - `autoUpdate === false` 直接返回 `{ checked, updated: [], failed: [] }`。
   - `true` 时对每个 `target !== null` 的更新调用 `installMarketExtension`；单个失败不阻断其余。
4. `startExtensionUpdateSchedule(ctx)`：
   - `manual` 不装定时器；`startup` 每次页面加载跑一次；`daily` 按 `msUntilDue` 定时，错过补跑一次。
   - 每次 daily 运行后写 `lastCheckAt`（失败也写）。
   - `ctx.on("settings/change", ...)` 在 `check`/`dailyAt` 变化时重新装定时器；`ctx.effect` 清理；`running` 防重叠。
   - `hub.ts` 在 `kernel.start()` 之后、`preloadMarket()` 之后调用 `startExtensionUpdateSchedule(kernel.ctx)`。
5. 共享安装动作（`apps/web/src/lib/extension-market.ts`）：
   - 新增 `installMarketExtension({ ctx, plugin, version })`：宿主安装 → `discoverPlugins`（带缓存穿透的 import）→ `ctx.extensions.replace`。
   - 页面现有的安装/更新回调改用它；调度器也用它。
6. 设置页：
   - 新建 `ExtensionUpdateSettings` 组件，结构照 `packages/resources/skills/src/settings-section.tsx`：`Segmented` 三个时机、`daily` 时显示 `Input type="time"`、`SettingSwitch` 自动更新。
   - `settings.tsx` 在 `#images` 之后加 `Group id="extensions"`，标题/描述走 `settings.extensions.*`。
   - `packages/search/global-search/src/search.ts` 的 `SETTINGS` 表增加三行（检查时机、每天时间、自动更新），`SettingEntry.anchor` 增加 `"extensions"`；测试补一条按 `#extensions` 命中的断言。
7. 扩展页手动检查：
   - 搜索框右侧加 `Button variant="outline"`，文案 `extensions.market.check`，图标 `RefreshCwIcon`；运行中禁用。
   - 点击 `runExtensionCheck(ctx)`；成功 toast 汇总 `{checked}/{updated}/{failed}`，失败逐条 toast。
8. i18n（en + zh 成对）：
   - 设置页：`settings.extensions.title/description/check/check.description/check.manual/check.startup/check.daily/dailyAt/dailyAt.description/autoUpdate/autoUpdate.description`。
   - 扩展页：`extensions.market.check/checked/checkFailed`。
9. 测试：
   - `readExtensionUpdateSettings`：null、字符串、空对象、部分字段、非法 `dailyAt`、非布尔 `autoUpdate`。
   - `runExtensionCheck`：用 `vi.mock` 假造 `refreshExtensionMarket` 与 `installMarketExtension`；`autoUpdate` 关闭时不安装、打开时只安装 `target !== null`、单个失败不影响其余。
   - 现有 skills/plugins 的 `msUntilDue` 测试经 re-export 继续覆盖共享实现。

**验收**

```bash
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter @context-hub/extensions test
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/plugins test
pnpm --filter @context-hub/global-search test
pnpm --filter @context-hub/zh-cn test
```

手工验收：设置页出现「扩展更新」；选择「启动时」后刷新页面，市场索引被强制读取一次；打开自动更新后，用一个本地 fixture 把版本升到 v2，刷新页面后行显示「可更新」并自动变为 v2；手动「检查更新」按钮显示汇总。

### 阶段 8：远程市场仓库

**执行目标**：`D:\work-space\context-hub-extensions` 发布 `engines`，生成器与 README 同步。

**改动文件**

- `plugins/claude.code/plugin.yaml`
- `plugins/skills.sh/plugin.yaml`
- `scripts/build-marketplace.mjs`
- `README.md`
- `marketplace.json`（生成）

**关键实现点**

1. 两个 `plugin.yaml`：`apiVersion: "^0.1"` 改为
   ```yaml
   engines:
     contextHub: ">=0.0.1-beta.5 <0.7.0"
   ```
   下界用当前出版本，确保现状可安装；上界沿用用户示例的 `<0.7.0`。
2. `build-marketplace.mjs`：
   - 删除 `text(manifest.apiVersion, …)`。
   - 校验 `manifest.engines.contextHub` 是非空字符串。
   - 版本条目输出 `engines: { contextHub }`，不再输出 `apiVersion`。
3. `README.md` 的 `plugin.yaml` 示例与规则改为 `engines`。
4. `pnpm build` 重新生成 `marketplace.json` 与 `plugins/*/lib/index.js`；检查 `marketplace.json` 每个版本条目只有 `version/engines/source`，两次构建 `sha256sum` 相同。
5. 不提交、不 push 该仓库，除非用户明确批准；汇报时说明需要先合并/重建远程 main，否则线上索引仍是旧格式。

**验收**

```bash
cd /d/work-space/context-hub-extensions
pnpm lint
pnpm typecheck
pnpm build
node -e 'const j=require("./marketplace.json"); console.log(j.plugins.map(p=>[p.id,p.versions[0].version,p.versions[0].engines]))'
```

### 阶段 9：文档与收尾

**执行目标**：文档不再提 `apiVersion`，写清 `engines`、版本来源、更新语义与迁移。

**改动文件**

- `docs/extensions.md`

**关键实现点**

1. `plugin.yaml` 规则：`engines.contextHub` 必填、npm semver 区间、`includePrerelease` 语义、非法区间拒绝。删除 `apiVersion` 与 `EXTENSION_API_VERSION`。
2. Market index 规则：每个版本携带 `engines`；`compatibleVersion` 选第一个兼容版本；`versions[0]` 只是展示用的最新版本；不因单个版本不适配拒绝整份索引。
3. Installing/更新段：安装器双重校验；已安装不兼容仍显示但不 import 代码；更新是原地替换 + `replace`；保持 enablement；不解析版本高低。
4. 卸载段：磁盘扩展卸载删除目录、`index.json` 记录与状态键；内置/编译扩展只能「停用」。写清 `state/extensions.json` 只存启用状态，不存描述；描述在 `plugin.yaml`，安装来源在 `index.json`。
5. 迁移段：旧 `apiVersion` 包不再被读取；从更新后的市场重装。
6. 更新设置段：检查时机（手动/启动时/每天）、每天时间、自动更新；设置存放在 `state/settings.json` 的 `plugins["hub.extensions"]`；调度只在页面打开期间运行；自动更新会覆盖插件目录内的本地修改。
7. 部署顺序：远程市场仓库必须先合并并由 CI 重建 `marketplace.json`，再发布新 Hub；否则新 Hub 读不到旧索引（旧索引没有 `engines`）。

**验收**

```bash
grep -rn "apiVersion\|EXTENSION_API_VERSION" packages apps docs --include="*.ts" --include="*.tsx" --include="*.md" --include="*.yaml" | grep -v node_modules
```

预期只剩“迁移说明”或历史计划文档中的文字；源码与契约文档无命中。

## 自审

### 改断言/改语义的正当性

1. `extension-manifest.test.ts` 的“refuses an incompatible apiVersion”被删除，换成“接受任意语法合法区间 + `isCompatible` 表驱动测试”。旧断言把“结构校验”和“与当前版本比较”绑在解析器里，导致解析器需要知道运行时版本；新契约把两者分开，兼容判定在安装器、loader 和 service 三个真实决策点执行。
2. `extension-market-index.test.ts` 的“refuses an incompatible apiVersion”改为“保留不满足当前范围的版本”。旧语义会让一个未来插件拖垮整个市场页；新语义把保护放到 `compatibleVersion` 与安装器。
3. `plugins.test.ts` 的“refuses an incompatible apiVersion before its code runs”改为“不 import 不兼容插件的入口，但保留其 manifest 行”。这既保留了“代码不运行”的保护，又满足“页面一眼看到不兼容”的需求。

### 依赖

- 唯一新增依赖 `semver` / `@types/semver`，理由见 §契约设计 5。没有替代的既有工具。

### 阶段依赖

- 阶段 1 先建立类型与判定；阶段 2–3 再改调用方，保证每个阶段 typecheck 可绿。
- 阶段 3 必须在阶段 1 之后：索引开始保留不兼容版本时，安装器已经能拒绝。
- 阶段 4 依赖阶段 1 的纯函数；阶段 5 独立；阶段 6 依赖 2/4/5。
- 阶段 7 依赖 4/5/6（需要 `marketUpdatesFor`、`installMarketExtension` 和页面数据）。
- 阶段 8 可在阶段 1 之后并行，但发布顺序必须先于新 Hub 上线。
- 阶段 9 最后做。

### 迁移与兼容

- 已安装的旧包（只有 `apiVersion`）在解析时缺 `engines` → 不会被 loader 接受，页面看不到；从更新后的市场重装即可。这是明确的破坏性变更，文档要写。
- `looksLikeExtension` 在迁移旧 `<home>/plugins` 目录时仍可识别 `apiVersion`，避免旧目录被留在原地；识别后加载失败属于预期。
- 同 id 的非市场安装会被市场更新覆盖；市场是第一方内容，保持既有信任模型。
- 已安装且不兼容的磁盘扩展：页面显示不兼容，并仍提供「卸载」；内置/编译扩展不兼容时没有动作（正常情况下不会出现）。

### 风险

- **预发布版本与区间**：使用 `includePrerelease: true`，并用当前 `0.0.1-beta.5` 做正反例测试。若未来改变语义，测试会先红。
- **远程 index 的发布顺序**：见阶段 8。新 Hub 与旧索引不兼容，必须协调上线。
- **更新无代码回滚**：文件替换成功后，新模块 `apply` 抛错会标成 error，旧代码已 dispose。
- **Windows 删除目录可能失败**：卸载顺序是“先停用、再删文件、最后撤 catalog”。删目录失败时扩展保持“已安装但停用”，用户可重试或重新启用；不会出现代码仍在跑、文件已删的窗口。
- **状态文件并发写**：kernel 的 `persist()` 与宿主的 `removeInstalledExtension` 都会写 `state/extensions.json`。两者写出的 map 都不含被删 id，最终结果一致；实现时不要额外把 id 写回。
- **自动更新会覆盖本地手改**：扩展安装记录没有内容哈希，无法像技能那样区分“手改过”的文件。`autoUpdate` 默认关闭；开启后，市场版本更新会直接替换整目录。文档要写明。
- **调度只在页面打开期间运行**：与 SKILL 模块一致，没有系统级守护进程；关闭页面后不会按时检查。
- **版本高低不比较**：索引里出现更旧的兼容版本也会提示更新；已装版本不在索引里也会提示更新。这是既有约定。
- **e2e 探针不在 vitest 里**：UI 视觉状态最终仍需手工探针或真实页面确认。

## 建议任务拆分

1. 引入 `engines` 契约（core）
2. 内核按应用版本判定兼容
3. 安装器双重校验
4. 市场选择与更新计算
5. 扩展生命周期：原地替换与移除
6. 页面展示、更新与卸载动作
7. 更新检查设置与调度
8. 远程市场仓库同步
9. 文档与收尾

全部完成后按 `AGENTS.md` 的 AOCI 规则，在受管对象稳定后调用一次 `aoci_maintain`。
