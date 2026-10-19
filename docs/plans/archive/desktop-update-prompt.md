# 桌面形态、侧栏版本与无感更新

## 假设（批准前请确认）

以下是本计划对需求的理解；如果有一条与你的本意不同，请在批准前指出。

1. “客户端形态”指 Electron 载体。设置页「关于 → 宿主」显示 `Desktop`；普通浏览器继续显示 `Web · Browser`。
2. 侧栏版本号取 `app.getVersion()`，只在 Electron 窗口里显示。开发模式（未打包）也显示版本，但不显示更新入口。
3. “无感更新”按原话执行：点击侧栏的更新提示后静默下载，下载完成立即停掉 hub server 并 `quitAndInstall(true, true)` 重启安装，中途不再弹确认框。
4. 自动检查（启动 10 秒后、每 4 小时）发现新版本时不再弹「Download / Later」对话框，只更新侧栏提示。菜单/托盘的「Check for Updates…」仍保留现有的下载确认、安装确认、无更新提示和错误弹窗。
5. 桌面窗口只把“载体信息 + 更新生命周期”走 IPC；页面业务数据仍走 loopback HTTP。这与 `docs/plans/archive/backend-boundary-and-preload.md` 已定的边界一致。
6. 不支持“检查到更新后自动下载、无需点击”。自动检查只提示，下载必须由用户点击触发。

## 背景与现状

### 桌面载体

- `apps/desktop/src/main.ts:204-216` 的 `createWindow` 设置 `contextIsolation: true, nodeIntegration: false, sandbox: true`，没有 preload。
- `apps/desktop/src/main.ts:153-157` 用 `utilityProcess.fork` 启动 server，server 不知道自己是桌面壳启动的；页面因此只能读 `apps/web/src/lib/hub.ts:156-165` 硬编码的 `form: "Web"`。
- `apps/desktop/src/main.ts:400-423` 在 `app.whenReady()` 里创建 updater、托盘和菜单，再 `open()`；窗口创建晚于 updater。
- `apps/desktop/bundle.ts:16-50` 只构建 `dist/server.mjs`（ESM）与 `dist/main.cjs`（CJS）；`apps/desktop/dev.ts:151-165` 复用同一份配置进入 watch；`apps/desktop/build.ts` 只调用 `buildBundles()`。
- `apps/desktop/electron-builder.config.mjs:32` 的 `files` 只列 `dist/main.cjs` 与 `assets/*.png`。asar 里的路径保持 `dist/main.cjs` 这一相对结构，因此 preload 也必须显式加入。
- Electron 的 sandboxed preload 只能 `require("electron")`，不能拆成多个 CommonJS 文件，也没有完整 Node 环境；preload 必须是一个打包后的 CJS 文件。`contextBridge` 与 `ipcRenderer` 在该环境可用。

### 更新流程

- `apps/desktop/src/update.ts` 当前只有 `enabled/check(manual)/dispose`；`autoDownload=false`、`autoInstallOnAppQuit=false`。
- 自动检查发现更新会走 `onUpdateAvailable` → `askDownload()` 弹「Download / Later」；下载完成走 `install()` 弹「Restart now / Later」；安装前 `markQuitting()` + `stopServer()` + `quitAndInstall(true, true)`。
- `promptedVersion` 只用于避免自动检查对同一个被拒绝的版本重复弹窗；改为侧栏提示后不再需要。
- `electron-updater@6.8.9` 的 `quitAndInstall(isSilent?, isForceRunAfter?)` 已确认存在（`out/BaseUpdater.d.ts`）。Windows NSIS 下 `isSilent=true` 是静默安装；macOS 的 Squirrel 不使用该参数，`docs/building.md:187-192` 已说明本机无法真实验证下载/安装。

### 页面与侧栏

- `apps/web/src/components/app-sidebar.tsx:126-133` 的 `SidebarHeader` 只有一行 logo + “Context Hub”。
- `apps/web/src/pages/settings.tsx:486-491` 的 `hostLabel`：`form === "Web"` 显示 `settings.about.hostWeb`，其他形态直接显示 `host.form`。因此把 form 改成 `Desktop` 后无需改设置页。
- `apps/web/src/components/extension-detail-dialog.tsx:129` 也直接显示 `ctx.host.form`，会同步变成 `Desktop`；这是期望行为，不需要改。
- `packages/extensions/src/host.ts:59-61` 的 `PlatformHost.form` 注释写明“供界面显示，扩展应读 capabilities”；本次只改显示值，不改 capabilities。

### 文案与测试

- 英文基础表：`packages/extensions/src/builtin/locale-en.ts`；中文：`packages/i18n/zh-cn/src/messages.ts`。`packages/i18n/zh-cn/__test__/messages.test.ts` 强制中文覆盖所有英文键。
- desktop 测试只收 `apps/desktop/__test__/**/*.test.ts`（`apps/desktop/vitest.config.ts`），environment 是 node，不能加载 Electron 运行时。纯逻辑要抽出来后测。根 `vitest.config.ts` 已经包含 `apps/desktop/vitest.config.ts`，不需要新增 project。
- web 测试只收 `apps/web/__test__/**/*.test.ts`，environment 是 node，没有组件渲染环境。
- `apps/desktop/__test__/version.test.ts` 已保证 `apps/desktop/package.json` 的版本镜像根版本；本次不改版本来源。

## 目标

1. Electron 窗口通过 preload 暴露最小 `window.contextHub.desktop`，页面据此把 `PlatformHost.form` 设为 `Desktop`。
2. 侧栏 header 在桌面窗口显示 `v<app version>`；浏览器不显示。
3. updater 增加可订阅的状态机；自动检查不再弹窗，侧栏显示可点击的更新提示。
4. 点击提示：`available` → 静默下载 → 下载完成自动停 server 并重启安装；`ready` 状态可再次点击安装。
5. 保持手动检查、菜单、托盘、定时检查间隔和现有安装前的停 server 逻辑不变。
6. 打包产物包含 preload；文档与 AOCI 同步。

## 行为变化

- 打包应用自动检查发现新版本时不再弹「Download / Later」，改为侧栏出现「有更新，点击更新」。
- 点击侧栏提示后静默下载，下载完成自动停 server 并重启安装，没有第二次确认。
- 菜单/托盘的「Check for Updates…」保持原样：下载确认、安装确认、无更新提示、错误弹窗都继续存在。
- 未打包开发模式只显示版本号，不显示更新入口；普通浏览器两者都不显示。

## 非目标（不做）

- 不改 `apps/web/server.ts`、`/hub/about` 的返回结构或 `PlatformHost` 接口/能力位。
- 不在设置页新增更新按钮；更新入口只在侧栏。
- 不改菜单/托盘文案与结构（`apps/desktop/src/menu.ts`、`menu.test.ts` 保持原样）。
- 不改检查时机（启动 10 秒、每 4 小时）与 `autoDownload=false` / `autoInstallOnAppQuit=false`。
- 不做下载取消、更新频道、预发布版本、增量更新。
- 不新增生产依赖；不引入状态管理库。
- 不重构 web 的 `apps/web/src/lib/preload.ts`（它预加载资产库，与 Electron preload 无关）。
- 不调查、不修改既有的 `assets/*.png` 打包行为；本计划只保证 `dist/preload.cjs` 进入。若打包验收发现 assets 也未进入 asar，只记录，不顺手修。
- 不修改发布工作流 `.github/workflows/release.yml` 或更新源格式。

## 设计

### 1. 桌面桥

新增 `apps/desktop/src/bridge.ts`（纯模块，无 Electron 副作用，main 与 preload 共同引用，避免跨进程通道名写错；`UpdateState` 只用 `import type`，不要把 reducer 打进 preload）：

```ts
export const DESKTOP_INFO_CHANNEL = "context-hub:desktop-info"
export const UPDATE_STATE_CHANNEL = "context-hub:update-state"
export const UPDATE_START_CHANNEL = "context-hub:update-start"
export const UPDATE_CHANGED_CHANNEL = "context-hub:update-changed"

export interface DesktopInfo {
  version: string
  /** Whether this build has an update feed (`enabled`). */
  updatesEnabled: boolean
}

export interface DesktopBridge {
  info(): Promise<DesktopInfo>
  updateState(): Promise<UpdateState>
  /** available → start download; ready → install now. */
  update(): Promise<void>
  subscribe(listener: (state: UpdateState) => void): () => void
}
```

上面是**最终形状**。阶段 1 只实现 `info()`；`updateState/update/subscribe` 与 `UPDATE_*` 通道在阶段 2 加入，避免阶段 1 暴露没有 handler 的方法。

新增 `apps/desktop/src/preload.ts`：用 `contextBridge.exposeInMainWorld("contextHub", { desktop })` 暴露上述方法。`subscribe` 内部用固定的 `UPDATE_CHANGED_CHANNEL` 注册 `ipcRenderer.on`，返回移除该 listener 的函数；不暴露 `ipcRenderer` 本身，也不把 `IpcRendererEvent` 传给页面。

`apps/desktop/src/main.ts`：

- `createWindow` 的 `webPreferences` 增加 `preload: path.join(__dirname, "preload.cjs")`，保留 `contextIsolation: true, nodeIntegration: false, sandbox: true`。main 以 CJS 打包，`__dirname` 在开发（`apps/desktop/dist`）与 asar（`app.asar/dist`）里都指向 preload 所在目录。
- `app.whenReady()` 中，`createUpdater(...)` 之后注册：
  - `ipcMain.handle(DESKTOP_INFO_CHANNEL, () => ({ version: app.getVersion(), updatesEnabled: updates?.enabled === true }))`
  - `ipcMain.handle(UPDATE_STATE_CHANNEL, () => updates?.state ?? initialUpdateState)`
  - `ipcMain.handle(UPDATE_START_CHANNEL, () => updates?.update())`
  - `updates.subscribe((state) => { window 存在且未销毁时 window.webContents.send(UPDATE_CHANGED_CHANNEL, state) })`
- 这些注册必须在 `open()` 之前。

`apps/web/src/lib/desktop.ts`（新增，web 侧独立声明，不依赖 `apps/desktop`）：

- 镜像 `DesktopInfo` / `UpdateState` / `DesktopBridge` 类型，并用 `declare global { interface Window { contextHub?: { desktop?: DesktopBridge } } }` 声明。
- `desktopBridge(): DesktopBridge | undefined` 是唯一读取 `window.contextHub?.desktop` 的入口。
- `useDesktopInfo()`：effect 内调用 `info()`，返回 `{ version: string | null, updatesEnabled: boolean }`；浏览器里保持 `null/false`。

`apps/web/src/lib/hub.ts`：用 `desktopBridge()` 判断形态：

```ts
const desktop = desktopBridge()
const webHost: PlatformHost = {
  form: desktop === undefined ? "Web" : "Desktop",
  ...
}
```

`packages/extensions/src/host.ts`：只把注释里的形态示例补成 `"Web"`、`"Desktop"`，不改类型。

### 2. 更新状态机

新增 `apps/desktop/src/update-state.ts`（无 Electron 依赖）：

```ts
export type UpdateStatus = "idle" | "available" | "downloading" | "ready"

export interface UpdateState {
  status: UpdateStatus
  version?: string
  /** 0–100 while downloading. */
  percent?: number
}

export type UpdateEvent =
  | { type: "none" }
  | { type: "available"; version: string }
  | { type: "downloading" }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "failed" }

export function applyUpdateEvent(state: UpdateState, event: UpdateEvent): UpdateState
```

规则：

- `available` 记版本；`downloading` 保留版本并把 percent 归 0；`progress` 把 percent 夹到 0–100 后四舍五入（`Math.round`）；`downloaded` 变 `ready`；`none` 回到 idle；`failed` 在已知版本时回到 `available`（提示保留、可重试），未知版本时回到 idle。
- 导出 `initialUpdateState: UpdateState = { status: "idle" }`，供 main 的 `UPDATE_STATE_CHANNEL` 兜底。
- 不引入 `checking`/`error` 状态：侧栏不渲染它们，手动检查的错误仍由对话框报告。

`apps/desktop/src/update.ts` 的 `Updater` 增加：

```ts
readonly state: UpdateState
update(): void
subscribe(listener: (state: UpdateState) => void): () => void
```

行为：

| 触发 | 自动检查 `check(false)` | 手动检查 `check(true)` / 菜单 |
|---|---|---|
| 发现更新 | 状态置 `available`，不弹窗 | 保留现有「Download / Later」对话框 |
| 无更新 | 状态置 idle，不弹窗 | 保留「You're up to date」 |
| 检查出错 | 状态按 `failed` 规则回落，只写 console | 保留错误对话框 |
| 菜单下载完成 | — | 保留现有「Restart now / Later」对话框 |
| 侧栏下载完成 | — | — |

侧栏触发的路径：

1. `update()` 在 `available` 时置 `downloading`、`progress(0)`，调用 `autoUpdater.downloadUpdate()`；`silentInstall = true`。
2. `update-downloaded`：状态 `ready`；若 `silentInstall`，直接 `markQuitting()` → `stopServer()` → `autoUpdater.quitAndInstall(true, true)`，不弹窗（这是“侧栏下载完成”的实际行为，不在上表两列中）。
3. `update()` 在 `ready` 时直接执行同一段安装（用于手动下载后选了 “Later” 的情况）。
4. `check()` 在 `disposed || checking || prompting || downloading` 时直接返回；`update()` 在 `downloading`、`prompting`、`installing` 期间重复调用直接返回。
5. 删除 `promptedVersion` 逻辑；自动检查不再有“拒绝后不再提示”的状态，侧栏提示由当前 state 决定。
6. `update-available` 的版本若等于 `downloadedVersion`，状态置 `ready` 而不是退回 `available`；只有手动检查（`manual=true`）才重新弹安装确认。
7. `askDownload` 在用户确认下载后把 `manualCheck = true`，这样即使用户是在自动检查之后通过菜单下载，下载失败仍会弹错误框（与今天一致）。
8. `update-not-available` 不覆盖 `downloading` / `ready`。`update-cancelled` 按 `failed` 处理：清掉 `downloading`/`silentInstall`、`progress(-1)`，提示回到 `available`。`manualCheck` 在每个事件读取后立即复位，避免一次手动检查的标记泄漏到之后的自动错误。
9. `useDesktopInfo()` 的 `info()` 失败时保持 `version=null, updatesEnabled=false`；`useDesktopUpdate()` 的 `updateState()` 失败时保持 idle，不抛到渲染。

保持：`autoUpdater.autoDownload = false`、`autoInstallOnAppQuit = false`、启动 10 秒后与每 4 小时的定时器、`dispose()` 清理定时器和监听器。`reportError` 只负责 progress 复位与 console/对话框，状态由 `onError` 统一更新；`onError` 同时复位 `installing`，避免一次安装失败后永久拒绝重试。disabled 分支同样实现完整接口：`state` 为 `initialUpdateState`、`update`/`subscribe`/`dispose` 均为 no-op。

### 3. 侧栏 UI

`apps/web/src/lib/desktop.ts` 增加 `useDesktopUpdate()`：

- effect 内先 `subscribe()`，再 `updateState()`；若 `updateState()` 返回前已有推送，忽略返回值，避免旧值覆盖新值。
- 状态归主进程所有：页面重载或窗口重建后，新页面靠 `updateState()` 恢复当前状态，不能依赖页面内存。
- 返回 `{ state, start }`；`start()` 调 `bridge.update()`，失败时 catch 掉，不抛到点击事件。
- cleanup 调 `unsubscribe`，兼容 React StrictMode 的重复挂载。

`apps/web/src/components/app-sidebar.tsx`：

- `AppSidebar` 调 `useDesktopInfo()`；`version === null` 时不渲染新行。
- 在 logo 行下面增加一行（`flex h-5 items-center justify-between gap-2 text-[12px] leading-4`；`SidebarHeader` 自带 `gap-2`，不要再加 `mt-*`）：
  - 左侧：`font-mono`、muted 色的 `v{version}`，`shrink-0`。
  - 右侧：仅当 `updatesEnabled === true` 时渲染 `<UpdateNotice />`；`min-w-0 truncate`。
- `UpdateNotice` 是 `app-sidebar.tsx` 内的局部组件，调 `useDesktopUpdate()`：
  - `idle`：不渲染。
  - `available`：`<button type="button" onClick={start}>`，文案 `sidebar.update.available`，accent 色（`text-ring`），hover 下划线。
  - `downloading`：不可点击文本 `sidebar.update.downloading`，`{percent}` 用当前值的整数。
  - `ready`：`<button type="button" onClick={start}>`，文案 `sidebar.update.ready`。
  - 容器加 `aria-live="polite"`，让动态出现和进度变化可被读屏读到。
- 浏览器、未打包桌面（`updatesEnabled=false`）都不渲染通知。

新增 i18n 键（英文表与中文表都要加，放在 `header.search` 之后）：

| 键 | 英文 | 中文 |
|---|---|---|
| `sidebar.update.available` | `Update available` | `有更新，点击更新` |
| `sidebar.update.downloading` | `Downloading {percent}%` | `正在下载 {percent}%` |
| `sidebar.update.ready` | `Restart to finish` | `重启以完成更新` |

`settings.about.hostWeb` 保持不变；`Desktop` 直接显示 `form`，不新增 `hostDesktop`。

### 4. 构建与打包

- `apps/desktop/bundle.ts`：新增 `preloadBuildOptions`（entry `src/preload.ts`、outfile `dist/preload.cjs`、CJS、`platform: "node"`、`external: ["electron"]`、sourcemap），并让 `buildBundles()` 依次构建 server、main、preload。
- `apps/desktop/dev.ts`：为 preload 建第三个 watch context，复用 `restartPlugin("preload-watch")`；初次 `buildBundles()` 已覆盖，watch 日志改为 “watching main, preload and server bundles”。
- `apps/desktop/electron-builder.config.mjs`：`files` 改为 `["dist/main.cjs", "dist/preload.cjs", "assets/*.png"]`。
- `apps/desktop/tsconfig.json` 的 `include` 已包含 `src`、`bundle.ts`、`dev.ts`、`__test__`，无需改。
- 文档：`docs/building.md` 的 bundle 列表加 `dist/preload.cjs`，Development 段“watches both bundles”改为三个；Updates 段改写为“自动检查只提示，侧栏点击后下载并安装；菜单检查仍询问”。`README.md:47-56` 同步一句。

## 阶段

### 阶段 1：接通桌面预加载

执行目标：Electron 窗口带 preload，页面识别 `Desktop` 形态，侧栏显示版本号。

改动文件：

- 新增 `apps/desktop/src/bridge.ts`（本阶段只有 `DESKTOP_INFO_CHANNEL`、`DesktopInfo`、只含 `info()` 的 `DesktopBridge`）。
- 新增 `apps/desktop/src/preload.ts`。
- `apps/desktop/src/main.ts`：import `ipcMain`；`createWindow` 加 preload 路径；`whenReady` 注册 `DESKTOP_INFO_CHANNEL` handler。
- `apps/desktop/bundle.ts`、`apps/desktop/dev.ts`、`apps/desktop/electron-builder.config.mjs`：按上文加入 preload 构建与打包；同步更新 `bundle.ts` 与 `dev.ts` 的头注释（三个 bundle，preload 也用 CJS）。
- 新增 `apps/web/src/lib/desktop.ts`（类型、`desktopBridge()`、`useDesktopInfo()`）。
- `apps/web/src/lib/hub.ts`：`form` 判定改 `desktopBridge() === undefined ? "Web" : "Desktop"`；文件头的 “Web form” 措辞改为页面形态（同一份页面跑在浏览器与桌面壳里）。
- `apps/web/src/components/app-sidebar.tsx`：header 第二行显示版本。
- `packages/extensions/src/host.ts`：只更新注释。
- `docs/building.md`、`README.md`：bundle 数量与 preload 描述。

验收：

1. `pnpm --filter @context-hub/desktop typecheck`、`pnpm --filter web typecheck` 通过。
2. `pnpm --filter @context-hub/desktop lint`、`pnpm --filter web lint` 通过。
3. `pnpm --filter @context-hub/desktop build` 后 `test -f apps/desktop/dist/preload.cjs` 通过。
4. `pnpm --filter web build` 后 `pnpm --filter @context-hub/desktop start`：
   - DevTools console 里 `await window.contextHub.desktop.info()` 返回 `{ version: "0.0.1", updatesEnabled: false }`（未打包时没有更新源）。
   - 设置 → 关于 → 宿主显示 `Desktop`。
   - 侧栏 logo 下显示 `v0.0.1`。
5. `pnpm --filter web dev` 后打开 `http://127.0.0.1:5271/settings`：宿主显示 `Web · Browser`，侧栏没有版本号。
6. 关闭上面启动的进程；只杀自己启动的进程/端口（5270/5271）。
7. 以上桌面启动使用真实 hub home（`~/.context-hub`）：只做只读观察，不点击更新、不改设置。

### 阶段 2：实现更新状态机

执行目标：updater 可观察、可订阅；自动检查不弹窗；侧栏触发的下载完成后自动安装。

改动文件：

- 新增 `apps/desktop/src/update-state.ts`。
- `apps/desktop/src/update.ts`：按“设计 2”重写状态与事件处理；更新文件头注释（自动检查只提示、侧栏下载完成后自动安装）。
- `apps/desktop/src/bridge.ts`、`apps/desktop/src/preload.ts`：增加 state/update/subscribe 三个通道与方法。
- `apps/desktop/src/main.ts`：注册 `UPDATE_STATE_CHANNEL`、`UPDATE_START_CHANNEL`，订阅 updater 状态并 `webContents.send`。
- `apps/web/src/lib/desktop.ts`：镜像扩展后的 `DesktopBridge` 与 `UpdateState` 类型（钩子留到阶段 3）。
- 新增 `apps/desktop/__test__/update-state.test.ts`。
- `apps/desktop/__test__/menu.test.ts`、`apps/desktop/src/menu.ts` 不改。

验收：

1. `pnpm --filter @context-hub/desktop test` 通过；新测试至少覆盖：
   - `idle → available → downloading → progress → ready`，版本在全程保留；
   - percent 超过 100 / 小于 0 被夹到 100 / 0，并按整数输出；
   - 下载中失败回到 `available` 且版本保留（可重试）；
   - idle 时失败回到 idle；`none` 清空版本。
2. `pnpm --filter @context-hub/desktop typecheck`、`pnpm --filter web typecheck` 通过。
3. `pnpm --filter @context-hub/desktop lint` 通过。
4. 静态核对 `apps/desktop/src/update.ts`：`askDownload` 与 `installWithPrompt` 只在 `manual === true` 的分支被调用；`onUpdateAvailable` 在自动检查时只 `setState`。把 grep 结果写进执行汇报。
5. 本机无法验证真实下载/安装（未打包时 `enabled=false`，且 `docs/building.md:187-192` 说明 win-unpacked 不能替代已安装的旧版本）；不要声称已验证，留到真实发布验证。
6. 在未打包桌面窗口里验证桥本身（不依赖更新源）：
   - `pnpm --filter @context-hub/desktop build` 后 `pnpm --filter @context-hub/desktop start`；
   - DevTools console：`await window.contextHub.desktop.updateState()` 返回 `{ status: "idle" }`；
   - `const off = window.contextHub.desktop.subscribe(() => {}); off()` 不抛错，证明返回的 unsubscribe 函数能跨 contextBridge 调用；
   - `await window.contextHub.desktop.update()` 在 idle 时是 no-op。

### 阶段 3：显示侧栏更新提示

执行目标：桌面打包运行时，侧栏按状态显示更新提示；浏览器与未打包开发模式不显示。

改动文件：

- `apps/web/src/lib/desktop.ts`：增加 `useDesktopUpdate()`。
- `apps/web/src/components/app-sidebar.tsx`：增加版本行与局部 `UpdateNotice`。
- `packages/extensions/src/builtin/locale-en.ts`、`packages/i18n/zh-cn/src/messages.ts`：三个 `sidebar.update.*` 键。
- `README.md`、`docs/building.md`：更新流程说明。

验收：

1. `pnpm --filter web typecheck`、`pnpm --filter web lint` 通过。
2. `pnpm --filter @context-hub/zh-cn test` 通过（中文键覆盖检查）；或跑根 `pnpm test`。
3. `pnpm --filter web build` 后 `pnpm --filter @context-hub/desktop start`（未打包）：侧栏只显示版本，不显示更新提示。
4. 浏览器/CDP 桩验证渲染分支（没有组件测试环境，这是唯一能验证 UI 状态的方式）：
   - 用 CDP `Page.addScriptToEvaluateOnNewDocument` 在页面脚本前注入：
     ```js
     (() => {
       let state = { status: "available", version: "9.9.9" }
       let listener = null
       let calls = 0
       window.__desktopStub = {
         push(next) { state = next; listener?.(next) },
         get calls() { return calls },
       }
       window.contextHub = {
         desktop: {
           info: async () => ({ version: "9.9.9", updatesEnabled: true }),
           updateState: async () => state,
           subscribe: (next) => { listener = next; return () => { listener = null } },
           update: async () => { calls++ },
         },
       }
     })()
     ```
   - 页面加载后断言侧栏出现 `Update available`（或中文对应文案）；
   - 用 `Runtime.evaluate` 调 `window.__desktopStub.push({status:"downloading", version:"9.9.9", percent:42})`、再 `push({status:"ready", version:"9.9.9"})`，断言显示 `Downloading 42%`、`Restart to finish`；
   - 点击提示，断言 `window.__desktopStub.calls === 1`；
   - 在同一个页面重载（桩会重新注入并返回 `available`），断言提示重新出现，证明状态来自 `updateState()` 而不是页面内存。
   - 若 CDP 无法执行，必须在汇报中明确“UI 状态分支未在浏览器验证”，不能只写 typecheck 通过。
5. 打包后真实更新提示只有在 GitHub 上存在更高版本时才会出现；本阶段不要求。

### 阶段 4：打包并全仓验收

执行目标：三个 bundle 都进入安装包，全仓检查通过，证明 packaged 窗口能识别 Desktop 并显示版本。

改动文件：无新增，只验证阶段 1-3 的产物；如果验收暴露问题，回到对应阶段修复。

验收：

1. `pnpm typecheck`、`pnpm lint`、`pnpm test` 全部通过。
2. `pnpm --filter @context-hub/desktop package:win` 成功；若命中 `docs/memory.md` 记录的 `EBUSY`（`app.asar` 被 Orca 等进程锁住），改用仓库外的临时输出目录重跑并如实汇报，不要按进程名清场：
   `pnpm --filter @context-hub/desktop exec electron-builder --win --config electron-builder.config.mjs --config.directories.output=<仓库外临时目录>`
3. 检查 asar 含 preload：
   ```
   node -e "const {createRequire}=require('node:module'); const r=createRequire(require.resolve('electron-builder/package.json',{paths:['apps/desktop']})); console.log(r('@electron/asar').listPackage('apps/desktop/release/win-unpacked/resources/app.asar').filter((p)=>p.includes('preload')))"
   ```
   期望包含 `\dist\preload.cjs`；若用了临时输出目录，把路径换成实际产物。
4. 运行 `release/win-unpacked/Context Hub.exe`（使用真实 hub home，只做只读观察，不点击更新）：
   - 设置 → 关于 → 宿主为 `Desktop`；
   - 侧栏显示 `v0.0.1`；
   - `window.contextHub.desktop.info()` 的 `updatesEnabled` 与 `resources/app-update.yml` 是否存在一致（打包配置有 publish 时通常为 true）。
5. 真实“发现新版本 → 点击 → 下载 → 重启安装”本地无法验证：需要一个已安装的旧版本和一个更高的 GitHub Release。报告中明确写出这一点。

### 阶段 5：维护 AOCI 认知

执行目标：所有受管对象达到最终稳定状态后，一次性更新仓库认知。

前置检查（`docs/memory.md` 的“AOCI 收尾前先看仓库有没有别人在写”）：

- `git status --short` 只出现本任务的文件（允许已有的 `docs/plans/remote-extension-market.md` 等他人文件保持原样，不碰）。
- `find packages apps docs -newermt "-20 minutes" -type f -not -path "*/node_modules/*"` 中没有不属于本任务的近期写入；有则停下询问。

动作：

1. 调用 `aoci_rules` 取得当前会话合同。
2. 所有代码与文档稳定后只调用一次 `aoci_maintain`。
3. 按返回的批次独立创作语义，并用一次 `aoci_update_entry` 提交；保留每项 `source_sha256`、`candidate_id` 与批次身份。交之前按 `docs/memory.md` 的预算自查：F ≤ 160 字、A ≤ 6 项、R ≤ 8 项、S 按 C 档。
4. 预期受影响条目：
   - 新增：`apps/desktop/src/preload.ts`、`apps/desktop/src/bridge.ts`、`apps/desktop/src/update-state.ts`、`apps/web/src/lib/desktop.ts`；
   - 更新：`apps/desktop/src/main.ts`、`apps/desktop/src/update.ts`、`apps/desktop/bundle.ts`、`apps/desktop/dev.ts`、`apps/desktop/electron-builder.config.mjs`、`apps/web/src/lib/hub.ts`、`apps/web/src/components/app-sidebar.tsx`、`README.md`、`docs/building.md`；
   - `packages/extensions/src/host.ts` 只改注释，是否需要更新由 `aoci_maintain` 的候选决定。
5. `repair_required` 只改被点名的字段后重提；`stopped` 按工具返回的 failed_step/recovery 处理；没有足够证据且支持 `aoci_report` 时用它，不猜写。
6. 不要手工编辑 `aoci.code.txt`、`aoci.txt`、`.aoci/`。

验收：

- `aoci_maintain` 完成且没有未处理的候选；
- 新文件的条目出现在索引中，旧的“自动检查会弹下载对话框”描述已被替换；
- 若 `aoci_maintain` 返回 `remaining` 非零，按新 preimage 重新调用并提交，直到清零。

## 风险与未验证

1. **自动重启会中断正在运行的 agent 请求。** `stopServer()` 发 shutdown 后最多等 3 秒；点击更新的人应当知道应用会立即重启。这是需求要求的行为，但属于真实代价。
2. **“静默”只在 Windows NSIS 成立。** macOS 的 Squirrel 会走系统安装流程；Linux AppImage 的本地构建无法验证更新。`isSilent` 不是跨平台保证。
3. **真实更新链路本地不可验证。** 需要已安装旧版本 + 已发布新版本；`win-unpacked` 不能替代。`docs/building.md:187-192` 已有同样结论。真实的主进程 → preload → 页面状态推送也只在有更新时才会走到；本机只验证了 subscribe/unsubscribe 与页面侧状态渲染，未验证真实推送。
4. **web 侧类型与 desktop 桥接口是两份手写镜像。** 没有共享包依赖；靠 typecheck 与打包验收兜底。通道名只在 `apps/desktop/src/bridge.ts` 一处定义。
5. **沙箱 preload 的 `contextBridge` 返回值代理**按 Electron 文档可用，但“返回 unsubscribe 函数”要由阶段 2 的 DevTools 检查确认；若代理失败，改为在 preload 内维护单个 listener 并提供 `unsubscribe()` 方法，只改 `preload.ts` 与 web 镜像，不扩散到其他层。
6. **`window.contextHub` 只证明 preload 运行过**，不构成安全边界；窗口只加载本机 server 页面，且已阻止外部导航。
