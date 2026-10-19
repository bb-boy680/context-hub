# 桌面端应用菜单（应用）

## 最终实现（2026-10-20 修正）

初版把「应用」放进了 web 的 `AppSidebar`，这是错的：用户要求菜单在桌面外壳的标题栏里，参考 deepseek-harness。最终实现取代下文「设计决策 2/5」和「阶段二」里的 web 侧栏方案：

- Windows：`titleBarStyle: "hidden"` + `titleBarOverlay`（40px、透明底色、原生最小化/最大化/关闭）。
- macOS：`titleBarStyle: "hiddenInset"` + `trafficLightPosition`，保留原生交通灯，菜单从左侧 84px 开始。
- Linux：`frame: false`，preload 自绘最小化/最大化/关闭三个按钮。
- `apps/desktop/src/preload-menu.ts` 的 `installTitlebarMenu()` 用 Shadow DOM 在 `top: 0` 注入 40px 菜单条（整条可拖动，按钮和窗口控件 `no-drag`），点击后 `ipcRenderer.invoke(APP_MENU_CHANNEL, x, y, zh)`。
- `apps/desktop/src/app-menu.ts` 的 `appMenuTemplate()` 生成原生菜单：关于 / 检测更新 / 重新加载 / 刷新插件 / 退出，两条分割线。
- 主进程直接执行检测更新与退出；关于、重新加载、刷新插件通过 `APP_MENU_ACTION_CHANNEL` 发回渲染进程。
- 渲染进程 `apps/web/src/components/desktop-menu-actions.tsx` 不渲染任何东西，只监听动作并执行；web 只额外做两件事：把 `html.lang` 同步为当前语言，以及用 `--context-hub-titlebar-height` 把侧栏/主内容下移 40px。
- 初版新增的 `checkForUpdates()` / `quit()` 页面桥已移除；`DesktopBridge` 现在只多一个 `onMenuAction()`。

## 假设（批准前请确认）

1. **菜单栏位置**：放在侧栏顶部、品牌行上方，左对齐。参考实现把菜单放在无边框窗口的标题栏里；本仓窗口仍是系统标准标题栏（`apps/desktop/src/main.ts:212-224` 的 `BrowserWindow` 没有 `frame: false` / `titleBarStyle`），页面内能对应的「左上角」就是侧栏顶部。要做真正的标题栏内菜单，需要先把窗口改成无边框并重做拖拽区，属于单独任务。
2. **`重新加载` 的含义**：重新读取 SKILLS 和 Plugins 两个资产库（`catalog.skills`、`catalog.plugins`），不是刷新整个页面。设置页在下载完远程图片后已经这样做（`apps/web/src/pages/settings.tsx:464-471`）。提示词、MCP、环境变量三个库不在这个动作里；需要时把它们的 `reload()` 加进同一个列表即可。
3. **`刷新插件` 的含义**：强制重新拉取内置的扩展市场索引（`OFFICIAL_MARKET_URL`），绕过主进程的缓存；不是重读本机插件库，也不是重新发现 `<hub-home>/extensions` 下的 Hub 扩展。市场页打开时拿到的列表也要在刷新后更新。
4. **`关于 context-hub` 的落点**：跳转到 `/settings#about`，复用设置页已有的「关于」分组（版本、Hub home、宿主），不新建 About 弹窗。`/hub/about` 是 HTTP 读取接口，不是页面路由。
5. **`检测更新` 在不可用时禁用**：未打包开发形态、或没有 `app-update.yml` 的构建里 `updatesEnabled === false`（`apps/desktop/src/main.ts:419-423`、`apps/desktop/src/update.ts:58-70`）。菜单项保留在固定位置但置灰，避免点了没有任何反应。
6. **只做「应用」，不做「编辑」**：参考实现还有一个「编辑」菜单；本仓的 Electron 原生应用菜单已经包含 `{ role: "editMenu" }`（`apps/desktop/src/menu.ts:55`、`:87`），复制/粘贴等由系统菜单负责。
7. **只在桌面窗口显示**：以 `window.contextHub?.desktop` 是否存在为准（`apps/web/src/lib/desktop.ts:39-41`）。普通浏览器、CLI 形态不显示这个菜单。

## 参考实现调查（deepseek-harness）

参考仓库路径：`D:\work-space\deepseek-harness`。

### 菜单栏与组件结构

- `apps/desktop/src/preload-menu.ts:10-113` 的 `installWindowsMenu()` 在 **preload** 里创建一个 `div` + Shadow DOM，内部是一个 `role="menubar"` 的容器和两个 `<button role="menuitem">`（`application`、`edit`）。
- 它只在 Windows 桌面壳里安装，位置固定在标题栏：
  - `:host { position: fixed; top: 0; left: var(--dsh-windows-menu-start, 48px); z-index: 1100; ... -webkit-app-region: no-drag; }`
  - 按钮高 28px、左右 10px、6px 圆角，hover / `aria-expanded=true` 时显示背景，`:focus-visible` 有描边。
- 挂载时机：`MutationObserver` 等到页面出现 `[data-shell-overlay]` 后再 `document.body.append(host)`（`preload-menu.ts:89-97`），保证菜单在应用壳渲染之后出现。
- 键盘：左右方向键在「应用」「编辑」两个按钮之间移动焦点，向下方向键打开菜单（`preload-menu.ts:72-83`）。
- 菜单的起点由 `--dsh-windows-menu-start` 控制，默认距左边 48px；菜单本身只有两个文字按钮，没有 chevron。

### 下拉菜单用原生 popup

- 点击按钮后读取 `button.getBoundingClientRect()`，把 `rect.left`、`rect.bottom` 通过 IPC 发给主进程（`preload-menu.ts:62-71`）：
  ```ts
  await ipcRenderer.invoke(DESKTOP_IPC.windowsMenu, name, rect.left, rect.bottom)
  ```
- 主进程处理器在 `apps/desktop/src/main.ts:1017-1047`，校验 sender / 坐标后：
  ```ts
  Menu.buildFromTemplate(items).popup({
    window,
    x: Math.round(x * zoom),
    y: Math.round(y * zoom),
    callback: resolve,
  })
  ```
- 也就是说：**触发按钮是 HTML/Shadow DOM，下拉本身是 Electron 原生 `Menu.popup`**。原生菜单负责点击外部关闭、键盘导航和系统外观。
- 应用菜单项在 `main.ts:954-978` 的 `applicationItems()`：About、Check Updates、CLI command、开发期的 Reload / Restart、macOS 的隐藏项、Quit。全部是主进程动作；「编辑」菜单里的剪切/复制/粘贴则通过 `shortcuts.sendEditingKey()` 发回渲染进程。Windows 上的原生应用菜单只保留隐藏的 DevTools 项（`main.ts:979-991`），所以页面内的这个菜单才是主入口。

### 可复用的模式

- 「菜单只在桌面壳出现」由 preload 决定，网页本身不判断平台。
- 触发按钮的 `aria-expanded` 在 `popup` 的 Promise 结束前保持 `true`，菜单关闭后复位。
- 菜单位置以触发按钮的矩形为准，并按 `webContents.getZoomFactor()` 缩放。

### 不照搬的部分

- 本仓没有无边框标题栏，也不需要在菜单打开时保存编辑器选区；不需要 Shadow DOM 和 `focusout` 选区恢复。
- 参考实现的菜单动作全在主进程；本仓的「关于」「重新加载」「刷新插件」都是渲染进程能力，用原生 popup 反而要为每个动作再做反向 IPC。因此本计划选择 **HTML 下拉菜单**（见「设计决策」）。

## 本仓现状

### 桌面主进程与 preload

- `apps/desktop/src/bridge.ts:9-35`：通道常量与 `DesktopBridge` 接口。现有能力只有 `info()`、`updateState()`、`update()`、`subscribe()`。
- `apps/desktop/src/preload.ts:19-33`：`contextBridge.exposeInMainWorld("contextHub", { desktop })`，页面只能看到这几个方法。
- `apps/desktop/src/main.ts:419-430`：`ipcMain.handle` 注册 `desktop-info`、`update-state`、`update-start`，并向渲染进程推送更新状态。
- `apps/desktop/src/update.ts:252-262`：`check(manual)`；手动检查会走 `askDownload()`、`install()`、无更新提示和错误弹窗。原生菜单/托盘已经调用 `updates?.check(true)`（`main.ts:330-338`）。
- `apps/desktop/src/main.ts:297-304`：`reloadPage()` 用 `window.webContents.reload()`；`:391-399` 的 `before-quit` 会先停 hub server 再 `app.quit()`。
- `apps/desktop/src/main.ts:244-248`：关闭窗口是隐藏到托盘，不是退出，所以「退出」不能调用 `window.close()`。
- `apps/desktop/src/menu.ts:36-103`：原生应用菜单（File / Reload Page / Check for Updates / Quit，macOS 的 role 菜单，开发期 Restart App / Toggle DevTools）；`:106-128` 是托盘菜单。两者本次都不改。

### 页面布局

- `apps/web/src/App.tsx:21-49`：`Toaster` → `BrowserRouter` → `AppLayout`；`/settings` 是壳自己的路由（`:31`）。
- `apps/web/src/components/app-layout.tsx:15-29`：`SidebarProvider` → `AppSidebar` + `SidebarInset`（`AppHeader` + `Outlet`）。
- `apps/web/src/components/app-sidebar.tsx:148-179`：`SidebarHeader` 里是品牌行（logo + “Context Hub” + 版本 + 更新提示），`SidebarContent` 里是资产、工作区、Agent、运维分组。
- `apps/web/src/lib/desktop.ts:55-81`：`useDesktopInfo()` 返回 `version`、`platform`、`updatesEnabled`；浏览器里默认 `null/false`。
- `apps/desktop/src/main.ts:419-423`：`info` 的 `version` 来自 `app.getVersion()`；`/hub/about` 的版本来自根 `package.json`（`apps/web/server.ts:117`、`:125`），`apps/desktop/__test__/version.test.ts` 保证桌面包与根版本一致。

### 「关于」现状

- `packages/core/src/about.ts:7-14`：`ABOUT_ROUTE = "/hub/about"`，返回 `{ version, home }`。
- `packages/core/handlers.ts:197-216`：`createAboutHandler`。
- `apps/web/server.ts:125` 挂载该 handler。
- `apps/web/src/pages/settings.tsx:399-410` 读取 `/hub/about`；`:662-695` 的 `Group id="about"` 渲染版本、Hub home、宿主。页面已有 hash 滚动逻辑（`:359-368`），`/settings#about` 会滚到该分组。
- 仓库里**没有** About 弹窗或 `/about` 页面路由。

### 「重新加载」与「刷新插件」现状

- `packages/resources/skills/src/library-store.ts:98` 和 `packages/resources/plugins/src/library-store.ts:175-178` 各有一个 `reload()`；服务名分别是 `catalog.skills`、`catalog.plugins`。两者都通过 `createCatalog` 发布新值，已打开的 Skills / Plugins 页会跟着更新。
- `apps/web/src/pages/settings.tsx:464-471` 已经示范了同一动作：下载完远程图片后对这两个服务调用 `reload()`。
- 扩展市场：`apps/web/src/lib/extension-market.ts:88` 的模块级 `createRemoteExtensionMarket()`；`useExtensionMarket(url)`（`:102-141`）在挂载时读取，`list(url, refresh)` 在 `packages/extensions/src/remote.ts:99-105`；`refresh=true` 会绕过主进程缓存（`packages/core/src/host/extension-market.ts:268-277`，TTL 5 分钟）。
- `OFFICIAL_MARKET_URL` 在 `packages/extensions/src/settings.ts:26-27`，是唯一的内置市场源，没有覆盖设置。
- 市场页（`apps/web/src/pages/extensions.tsx:165`）没有刷新按钮；`useExtensionMarket` 返回的 `refresh()` 目前没有被页面使用。页面自己持有 index，别处强制刷新后它不会自动更新——这是「刷新插件」要补的一小段。
- `packages/extensions/src/service.ts` 的 `ExtensionService` 只有 `enable/disable/add/toggle`，**没有**重新发现全部 Hub 扩展的入口。
- `apps/web/src/lib/hub.ts:125-145` 的 `installedPlugins()` 只在 `startHub()` 时扫描一次 `<hub-home>/extensions`；要让磁盘上的新扩展生效，目前只能刷新页面。

## 菜单项落点

| 菜单项 | 现有能力 | 缺口 | 本计划的落点 |
| --- | --- | --- | --- |
| 关于 context-hub | `/hub/about` + 设置页 `#about` 分组 | 没有页面路由/弹窗 | `navigate("/settings#about")` |
| 检测更新 | 主进程 `updater.check(true)`，原生菜单/托盘已用 | 渲染进程没有 IPC | 新增 `checkForUpdates()` 桥方法 + IPC |
| 重新加载 | `catalog.skills.reload()`、`catalog.plugins.reload()` | 没有菜单入口 | 依次调用两个服务的 `reload()` |
| 刷新插件 | `createRemoteExtensionMarket().list(url, true)` | 没有菜单入口；已打开的市场页不会收到新 index | 新增 `refreshExtensionMarket()`，强制读取并广播新 index |
| 退出 | 主进程 `app.quit()`，托盘/原生菜单已用 | 渲染进程没有 IPC | 新增 `quit()` 桥方法 + IPC |

## 目标

1. 在桌面窗口左上角（侧栏顶部）增加「应用」下拉菜单，顺序固定：
   `关于 context-hub` → 分割线 → `检测更新`、`重新加载`、`刷新插件` → 分割线 → `退出`。
2. 菜单只在 Electron 窗口显示；浏览器和 CLI 形态不显示。
3. 每个菜单项都调用仓库里已有的真实能力；新增的只有「检测更新」和「退出」两个 IPC。
4. `重新加载` 用共享服务重读 SKILLS / Plugins，已打开的页面跟着更新；`刷新插件` 强制重读市场索引，已打开的市场页也拿到新 index。
5. 不引入新依赖，不改原生应用菜单/托盘，不改更新调度和安装流程。
6. 补一个不依赖 DOM 的动作映射测试，并在真实 Electron 窗口里做验收。

## 非目标（不做）

- 不做「编辑」菜单，不改 `apps/desktop/src/menu.ts` 的原生菜单结构。
- 不把窗口改成无边框 / `titleBarStyle: "hidden"` / `titleBarOverlay`。
- 不新增「重新发现全部 Hub 扩展」的 kernel API；`刷新插件` 只重新拉取市场索引，不安装或更新任何扩展。
- 不让 `重新加载` 覆盖提示词、MCP、环境变量三个库；只重读 skills 和 plugins。
- 不新增市场源选择或覆盖设置；`刷新插件` 只读内置的 `OFFICIAL_MARKET_URL`。
- 不新建 About 弹窗，不改 `/hub/about` 的返回结构。
- 不改更新检查时机、下载/安装确认流程、`autoDownload` / `autoInstallOnAppQuit`。
- 不为菜单项新增全局快捷键；`Ctrl+R` 仍由原生菜单的 `Reload Page` accelerator 负责（`apps/desktop/src/menu.ts:59-63`）。
- 不新增 IPC sender 校验；新 handler 与现有 `desktop-info` / `update-state` 风格一致（页面已 sandbox + contextIsolation，导航被限制在同源）。
- 不改 `apps/desktop/bundle.ts` / `electron-builder.config.mjs`（preload 已经在构建和打包列表里）。
- 不顺手清理无关死代码，不提交 git。

## 设计决策

### 1. 用 HTML 下拉菜单，不用 Electron 原生 `Menu.popup`

选 HTML（`@context-hub/shadcn-ui/components/dropdown-menu`，Base UI）的理由：

- 仓库已经有这个组件和一致的行菜单外观（`apps/web/src/components/workspace-group.tsx:180-201`、`packages/resources/plugins/src/install-actions.tsx:110-124`）。
- 五个动作里有三个只在渲染进程有意义：`/settings#about` 跳转、两个资产库的 `reload()`、市场索引的强制读取。用原生 popup 需要主进程再发 IPC 回渲染进程，或把菜单模板复制到主进程。
- Base UI 自带点击外部关闭、Escape、方向键、焦点回到触发器，和参考实现的交互等价。
- 只需要为「检测更新」「退出」各加一个单向 IPC。

代价：菜单外观是应用自己的，不是 Windows 系统菜单外观；这与本仓其余菜单一致，属于有意选择。

### 2. 菜单位置与可见性

- 组件放在 `AppSidebar` 的 `SidebarHeader` 内、品牌行之前：
  ```
  SidebarHeader
    └─ DesktopAppMenu（仅桌面）
    └─ 品牌行（logo + Context Hub + 版本）
  ```
- `AppSidebar` 已经调用 `useDesktopInfo()`（`app-sidebar.tsx:150`），把 `updatesEnabled` 传给菜单，避免第二次 `info()` IPC。
- 是否显示由 `desktopBridge() === undefined` 判断；`desktopBridge()` 是唯一读取 `window.contextHub?.desktop` 的入口。
- 触发器是文字按钮「应用」，不带 chevron，样式对齐参考实现和侧栏行：
  `h-7 rounded-sm px-2 text-[13px] font-medium text-copy transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-sidebar-accent`。
- 下拉内容宽 200px。**必须显式覆盖宽度**：`DropdownMenuContent` 默认 `w-(--anchor-width)`，不覆盖会变成触发器那么窄。使用与 `workspace-group.tsx` 相同的 `w-[200px] ... p-1.5 ring-1 ring-border shadow-soft`。
- 视觉规范以 `DESIGN.md` 和 `packages/shadcn-ui/src/styles/{theme,globals}.css` 为准，见「设计决策 8」。

### 3. 桌面桥新增两个单向调用

`apps/desktop/src/bridge.ts`：

```ts
export const UPDATE_CHECK_CHANNEL = "context-hub:update-check"
export const QUIT_CHANNEL = "context-hub:quit"

export interface DesktopBridge {
  // ...existing
  /** The manual check the native menu/tray already use. */
  checkForUpdates(): Promise<void>
  /** Quit the application, stopping the hub server first. */
  quit(): Promise<void>
}
```

`apps/desktop/src/preload.ts` 暴露：

```ts
checkForUpdates: () =>
  ipcRenderer.invoke(UPDATE_CHECK_CHANNEL) as Promise<void>,
quit: () => ipcRenderer.invoke(QUIT_CHANNEL) as Promise<void>,
```

`apps/desktop/src/main.ts` 在 `UPDATE_START_CHANNEL` 之后注册：

```ts
ipcMain.handle(UPDATE_CHECK_CHANNEL, () => updater.check(true))
ipcMain.handle(QUIT_CHANNEL, () => app.quit())
```

`apps/web/src/lib/desktop.ts` 的 `DesktopBridge` 镜像这两个方法。页面侧不新增 helper，菜单直接通过 `desktopBridge()` 调用。

### 4. 动作映射抽成纯函数

新增 `apps/web/src/lib/app-menu.ts`：

```ts
export const ABOUT_PATH = "/settings#about"

export interface AppMenuActions {
  about(): void
  checkForUpdates(): void
  /** Re-reads the skill and plugin libraries. */
  reloadResources(): Promise<void>
  /** Fetches the official market index again. */
  refreshPlugins(): Promise<void>
  quit(): void
}

export interface AppMenuDependencies {
  bridge: Pick<DesktopBridge, "checkForUpdates" | "quit"> | undefined
  navigate(to: string): void
  reloadResources(): Promise<void>
  refreshPlugins(): Promise<void>
}

export function createAppMenuActions(deps: AppMenuDependencies): AppMenuActions
```

- `about` → `deps.navigate(ABOUT_PATH)`
- `checkForUpdates` → `void deps.bridge?.checkForUpdates().catch(() => undefined)`（IPC 调用失败时不留未处理的 rejection）
- `reloadResources` → `deps.reloadResources()`
- `refreshPlugins` → `deps.refreshPlugins()`
- `quit` → `void deps.bridge?.quit().catch(() => undefined)`

异步动作的 rejection 由菜单组件接住并弹失败 toast；这样动作映射本身还是纯粹的、能在 node 环境里测。`app-menu.ts` 只 `import type { DesktopBridge } from "./desktop.ts"`，测试导入时不会加载浏览器桥的实现。

### 5. 组件

新增 `apps/web/src/components/app-menu.tsx`，核心结构：

```tsx
export function DesktopAppMenu({ updatesEnabled }: { updatesEnabled: boolean }) {
  const { t } = useI18n()
  const ctx = useHub()
  const navigate = useNavigate()
  const bridge = desktopBridge()

  /* `get` 的返回类型依赖模块增补是否可见，显式收窄成这里真正用到的 reload。 */
  const services = ["catalog.skills", "catalog.plugins"].map(
    (name) => ctx.get(name) as { reload?: () => Promise<void> } | undefined
  )

  const run = (action: () => Promise<void>, done: string, failed: string): void => {
    void action().then(
      () => toast.add({ type: "success", title: t(done) }),
      (error: unknown) =>
        toast.add({
          type: "error",
          title: t(failed).replace(
            "{reason}",
            error instanceof Error ? error.message : String(error)
          ),
        })
    )
  }

  const actions = createAppMenuActions({
    bridge,
    navigate,
    reloadResources: () =>
      Promise.all(services.map((service) => service?.reload?.())).then(() => undefined),
    refreshPlugins: () =>
      refreshExtensionMarket(OFFICIAL_MARKET_URL).then(() => undefined),
  })

  if (bridge === undefined) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-7 items-center rounded-sm px-2 text-[13px] font-medium text-copy transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-sidebar-accent"
          />
        }
      >
        {t("menu.application")}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="flex w-[200px] flex-col gap-0.5 rounded-md p-1.5 ring-1 ring-border shadow-soft"
      >
        <DropdownMenuItem
          className="h-9 rounded-sm px-2.5 text-[13px] font-medium"
          onClick={actions.about}
        >
          {t("menu.about")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="h-9 rounded-sm px-2.5 text-[13px] font-medium"
          disabled={!updatesEnabled}
          onClick={actions.checkForUpdates}
        >
          {t("menu.checkUpdates")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="h-9 rounded-sm px-2.5 text-[13px] font-medium"
          onClick={() =>
            run(actions.reloadResources, "menu.reload.done", "menu.reload.failed")
          }
        >
          {t("menu.reload")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="h-9 rounded-sm px-2.5 text-[13px] font-medium"
          onClick={() =>
            run(
              actions.refreshPlugins,
              "menu.refreshPlugins.done",
              "menu.refreshPlugins.failed"
            )
          }
        >
          {t("menu.refreshPlugins")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="h-9 rounded-sm px-2.5 text-[13px] font-medium"
          onClick={actions.quit}
        >
          {t("menu.quit")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

细节：

- `重新加载` 同时调用 `catalog.skills.reload()` 和 `catalog.plugins.reload()`。两者都通过 `createCatalog` 发布新值，已打开的 Skills / Plugins 页会跟着更新，不需要刷新页面。
- `刷新插件` 调用 `refreshExtensionMarket(OFFICIAL_MARKET_URL)`（设计决策 7），成功/失败各弹一个 toast。
- 两个异步动作的失败都用 `menu.reload.failed` / `menu.refreshPlugins.failed` 并替换 `{reason}`。`reload()` 的失败通常写在 catalog 的 `failure` 里而不是 reject，但 `Promise.all` 仍会把真正的 rejection 交给 toast。
- `AppSidebar` 本身通过 `useNavGroups()` 订阅了扩展快照，扩展启停会带着菜单一起重渲染，所以菜单组件不需要再订阅一次。
- 菜单项不放入图标，和参考实现以及原生菜单一致；「退出」不用 `variant="destructive"`。
- 用户明确要求两条分割线：About 之后、Quit 之前各一条。这覆盖 `docs/memory.md` 中「行内 ⋯ 菜单不加分割线」的旧结论——那次说的是行菜单，这次是应用菜单且用户点名要线。

### 6. 文案

在英文基础表 `packages/extensions/src/builtin/locale-en.ts` 与中文表 `packages/i18n/zh-cn/src/messages.ts` 增加同一组键：

| 键 | 英文 | 中文 |
| --- | --- | --- |
| `menu.application` | `Application` | `应用` |
| `menu.about` | `About Context Hub` | `关于 context-hub` |
| `menu.checkUpdates` | `Check for Updates` | `检测更新` |
| `menu.reload` | `Reload` | `重新加载` |
| `menu.refreshPlugins` | `Refresh Plugins` | `刷新插件` |
| `menu.quit` | `Quit` | `退出` |
| `menu.reload.done` | `Resources reloaded` | `资源已重新加载` |
| `menu.reload.failed` | `Resources could not be reloaded: {reason}` | `资源重新加载失败：{reason}` |
| `menu.refreshPlugins.done` | `Plugin market refreshed` | `插件市场已刷新` |
| `menu.refreshPlugins.failed` | `The plugin market could not be refreshed: {reason}` | `插件市场刷新失败：{reason}` |

`packages/i18n/zh-cn/__test__/messages.test.ts` 会自动检查中文表覆盖所有英文键，两个文件必须同一阶段改完。

### 7. 「刷新插件」：强制读取并广播新 index

市场页的 index 保存在 `useExtensionMarket` 的组件状态里；菜单在侧栏，不能直接调用页面里的 `refresh()`。因此由菜单发起强制读取，再把结果广播给已打开的市场页：

`apps/web/src/lib/extension-market.ts` 新增：

```ts
const MARKET_REFRESHED_EVENT = "context-hub:market-refreshed"

interface MarketRefreshed {
  url: string
  index: ExtensionMarketIndex
}

/** Read the market again, ignoring the host's cache, and tell an open page. */
export async function refreshExtensionMarket(url: string): Promise<ExtensionMarketIndex> {
  const index = await market.list(url, true)
  window.dispatchEvent(
    new CustomEvent<MarketRefreshed>(MARKET_REFRESHED_EVENT, {
      detail: { url, index },
    })
  )
  return index
}
```

`useExtensionMarket` 增加一个监听 effect，收到同一 `url` 的 index 时直接写入状态：

```ts
const latest = React.useRef(0)

React.useEffect(() => {
  const handle = (event: Event): void => {
    const detail = (event as CustomEvent<MarketRefreshed>).detail
    if (detail.url !== url) return
    latest.current += 1 // 让仍在路上的旧读取作废
    setState({ url, nonce, index: detail.index, failure: null })
  }
  window.addEventListener(MARKET_REFRESHED_EVENT, handle)
  return () => window.removeEventListener(MARKET_REFRESHED_EVENT, handle)
}, [url, nonce])
```

同时给现有的读取 effect 加一个 ticket：`const ticket = ++latest.current`，两个 `.then` 回调都先检查 `ticket === latest.current`。否则菜单刷新时恰好有一个旧的 market 读取在飞行中，旧结果会覆盖刚广播的新 index。

效果：菜单点击后一定发出一次真实网络读取（`refresh=true` 绕过 5 分钟缓存）；市场页开着就立即更新，没开着则下次挂载读到的是刚写入主进程缓存的 index。

### 8. 视觉规范（DESIGN.md）

本仓 UI 以 `DESIGN.md` 为准；颜色、圆角、字体和唯一的一层阴影已经落在 `packages/shadcn-ui/src/styles/theme.css` 与 `globals.css` 的 token 里。菜单只使用这些 token，不引入新颜色、第二套阴影或新字体：

- **颜色**：白底 `bg-popover`（dark 为 `#16181c`），文字 `text-popover-foreground`；触发器用 `text-copy`（`#5b616e`），hover 用 `bg-sidebar-accent` / `text-foreground`。Coinbase Blue `#0052ff` 只出现在 focus ring（`ring-sidebar-ring`），不做菜单项背景或选中填充——品牌蓝要保持稀缺。
- **分割线**：`bg-border`（`#dee1e6`，dark 为 `#ffffff1f`），1px。
- **阴影**：只用唯一一层 `shadow-soft`（`0 4px 12px rgb(0 0 0 / 0.04)`），不叠加其他阴影。
- **圆角**：弹出层 `rounded-md`（12px），菜单项和触发器 `rounded-sm`（8px）。这是菜单/导航，不是主 CTA；`rounded-pill`（100px）只留给真正的 CTA。
- **字体**：菜单文字是给人读的标签，用 `font-sans`（Inter Variable）、`text-[13px] font-medium`，不加字距；`font-mono` 只给数字/路径/命令，这里没有。
- **层级**：菜单项 `h-9 px-2.5`；不放入图标，保持参考实现和原生菜单那种纯文字列表。
- **危险项**：「退出」用普通 ink 文字，不用 `variant="destructive"`——`DESIGN.md` 的红/绿只做交易语义，不做按钮。
- **深色模式**：全部走 `popover` / `border` / `copy` token，dark 下自动切换，不写死 `#fff` / `#000`。

## 阶段一：扩展桌面桥

**目标**：让页面能够触发主进程的「检测更新」和「退出」，不改变现有界面。

**改动文件**

- `apps/desktop/src/bridge.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/main.ts`
- `apps/web/src/lib/desktop.ts`

**具体改动**

1. `bridge.ts` 增加 `UPDATE_CHECK_CHANNEL`、`QUIT_CHANNEL` 和 `DesktopBridge` 的两个方法。
2. `preload.ts` 用 `ipcRenderer.invoke` 实现这两个方法。
3. `main.ts` 在 `UPDATE_START_CHANNEL` 的 handler 之后注册：
   - `ipcMain.handle(UPDATE_CHECK_CHANNEL, () => updater.check(true))`
   - `ipcMain.handle(QUIT_CHANNEL, () => app.quit())`
4. `apps/web/src/lib/desktop.ts` 的 `DesktopBridge` 镜像两个方法（只加类型，不加新 hook）。

**验收**

- `pnpm --filter @context-hub/desktop typecheck` 通过。
- `pnpm --filter web typecheck` 通过。
- `pnpm --filter @context-hub/desktop test` 通过（现有 `menu.test.ts` 不受影响）。
- 浏览器形态 `pnpm dev` 页面无变化。
- Electron 开发窗口里，DevTools 执行 `await window.contextHub.desktop.checkForUpdates()` 能 resolve（开发形态 updater 未启用，是 no-op）；`quit()` 的验证放到阶段二结束时做，避免提前关掉验收窗口。

## 阶段二：实现应用菜单

**目标**：在桌面窗口左上角显示「应用」菜单，五个菜单项按指定顺序工作。

**改动文件**

- 新增 `apps/web/src/lib/app-menu.ts`
- 新增 `apps/web/src/components/app-menu.tsx`
- `apps/web/src/components/app-sidebar.tsx`
- `apps/web/src/lib/extension-market.ts`
- `packages/extensions/src/builtin/locale-en.ts`
- `packages/i18n/zh-cn/src/messages.ts`

**具体改动**

1. 按「设计决策 4」实现 `createAppMenuActions`。
2. 按「设计决策 5/6」实现 `DesktopAppMenu`，加入文案键。
3. 按「设计决策 7」在 `extension-market.ts` 增加 `refreshExtensionMarket()` 与市场页的监听、ticket 保护。
4. `app-sidebar.tsx` 的 `SidebarHeader` 中、品牌行之前渲染：
   ```tsx
   {desktopBridge() === undefined ? null : (
     <div className="pb-2">
       <DesktopAppMenu updatesEnabled={updatesEnabled} />
     </div>
   )}
   ```
   导入 `desktopBridge`；`updatesEnabled` 复用已有的 `useDesktopInfo()` 返回值。
5. 菜单项与动作：
   - `关于 context-hub` → `navigate("/settings#about")`
   - `检测更新` → `desktopBridge()?.checkForUpdates()`；`updatesEnabled === false` 时禁用
   - `重新加载` → `catalog.skills` 与 `catalog.plugins` 各 `reload()` 一次，完成/失败弹 toast
   - `刷新插件` → `refreshExtensionMarket(OFFICIAL_MARKET_URL)`，完成/失败弹 toast
   - `退出` → `desktopBridge()?.quit()`
6. 两条 `DropdownMenuSeparator` 的位置严格按需求。

**验收**

- `pnpm --filter web typecheck` 通过。
- `pnpm --filter web lint` 通过。
- `pnpm --filter @context-hub/extensions typecheck` 通过。
- `pnpm --filter @context-hub/zh-cn test` 通过（中文键覆盖）。
- 浏览器形态：侧栏顶部**没有**「应用」。
- Electron 形态：侧栏顶部出现「应用」；菜单项顺序为 About / 分割线 / 检测更新 / 重新加载 / 刷新插件 / 分割线 / 退出。
- 键盘：Enter/Space 打开，方向键移动，Escape 关闭，Tab 离开后焦点回到触发器；点击菜单外部关闭。
- `关于 context-hub`：进入 `/settings` 并滚到「关于」分组，版本号、Hub home、宿主都有值。
- `重新加载`：当前路由不变，页面不重载；出现成功 toast。打开 Skills / Plugins 页时，能看到各自的读取请求重新发出，列表跟着更新。
- `刷新插件`：出现成功 toast；DevTools Network 里出现 `POST /hub/extension-market`，请求体的 `refresh` 为 `true`。当时开着扩展页的话，市场行立即换成新 index。
- `检测更新`：开发形态下置灰；能拿到打包产物时再验证弹窗（见阶段三）。
- `退出`：应用退出，托盘图标消失，hub server 端口关闭，没有残留进程。

**阶段结束时的仓库状态**：可运行；浏览器和桌面都能正常启动；原生菜单/托盘未改变。

## 阶段三：补测试与文档

**目标**：把动作映射固定下来，更新桌面端说明，并完成全量检查。

**改动文件**

- 新增 `apps/web/__test__/app-menu.test.ts`
- `apps/web/__test__/extension-market.test.ts`（补一个强制读取用例）
- `README.md`（Desktop app 一节）

**测试用例**（node 环境，不渲染组件）

1. `about()` 用 `/settings#about` 调用 `navigate`。
2. `checkForUpdates()` 调用 `bridge.checkForUpdates` 一次。
3. `reloadResources()` 调用注入的 `reloadResources` 一次，并透传它返回的 Promise。
4. `refreshPlugins()` 调用注入的 `refreshPlugins` 一次，并透传它返回的 Promise。
5. `quit()` 调用 `bridge.quit` 一次。
6. `refreshExtensionMarket()`：用 `vi.stubGlobal` 替换 `fetch` 和 `window`，断言 POST 到 `/hub/extension-market` 的 body 里 `refresh: true`，并派发 `context-hub:market-refreshed` 事件携带新 index。

用 `vi.fn()` 造依赖；不引入 React 测试库或 jsdom。`useExtensionMarket` 的 ticket 保护没有 DOM 测试，由阶段二的手动验收覆盖。

桌面侧不新增单元测试：`apps/desktop/vitest.config.ts` 明确只收纯逻辑，preload/main 的两行 IPC handler 由 typecheck 和真实 Electron 验收覆盖；为两个一行 handler 抽一层工厂不值得。

**文档**

在 `README.md` 的 Desktop app 段落补一句：桌面窗口侧栏顶部有「应用」菜单，包含 About、Check for Updates、Reload、Refresh Plugins、Quit；Reload 重读技能和插件库，Refresh Plugins 重新拉取扩展市场索引；只在桌面壳显示。

**验收**

- `pnpm --filter web test` 通过。
- `pnpm --filter @context-hub/desktop test` 通过。
- `pnpm test` 全量通过。
- `pnpm typecheck` 全量通过。
- `pnpm lint` 全量通过。
- 真实 Electron 窗口手动验收（见下）。
- 打包更新检查：如果本机有可用的打包产物和 `app-update.yml`，点击「检测更新」应出现与原生菜单 `Check for Updates…` 相同的弹窗；没有打包产物时，在汇报里明确写「未验证」，不要用开发形态的 no-op 代替。

**Electron 手动验收步骤**

前置构建：

```bash
pnpm --filter web build
pnpm --filter @context-hub/desktop build
```

用隔离的 hub home 和临时 profile 启动（避免写用户真实目录）：

```bash
cd apps/desktop
CONTEXT_HUB_HOME="$TEMP/context-hub-app-menu-home" \
  pnpm exec electron --remote-debugging-port=9222 \
  --user-data-dir="$TEMP/context-hub-app-menu-profile" .
```

检查项：

1. 窗口打开后，侧栏左上角有「应用」；浏览器里没有。
2. 点开后五个菜单项与两条分割线顺序正确；菜单宽约 200px，不是触发器宽度。
3. `关于 context-hub` 跳到设置页并滚到「关于」。
4. `检测更新` 在开发形态置灰；打包形态的弹窗单独验证（见上）。
5. `重新加载` 后当前路由不变，页面没有整页刷新；Skills / Plugins 的请求重新发出，出现成功 toast。
6. `刷新插件` 出现 toast；Network 中出现 `POST /hub/extension-market`，`refresh` 为 `true`；扩展页开着时市场行更新。
7. `退出` 后应用、托盘、hub 端口都消失。
8. 点击外部、Escape、方向键、Enter/Space 的行为符合预期。

## 阶段四：同步仓库认知

**目标**：按仓库的 AOCI 流程更新受管理对象的认知条目。

**步骤**

1. 代码达到最终稳定状态后，调用一次 `aoci_maintain`（不要每改一个文件调一次）。
2. 对工具返回的候选，基于真实证据通过 `aoci_update_entry` 提交完整批次；重点文件：
   - `apps/desktop/src/{bridge,preload,main}.ts`
   - `apps/web/src/lib/{desktop,app-menu,extension-market}.ts`
   - `apps/web/src/components/{app-menu,app-sidebar}.tsx`
   - `packages/extensions/src/builtin/locale-en.ts`、`packages/i18n/zh-cn/src/messages.ts`
3. 不手工编辑 `aoci.code.txt` / `.aoci`。

**验收**

- `aoci_maintain` 没有未处理的候选，或候选已按批次成功 apply。
- `git status` 只包含本计划涉及的文件和 AOCI 托管产物。
- 不提交 git（用户未要求）。

## 风险与待确认

1. **「刷新插件」是网络动作**：离线或市场不可达时动作会失败并弹失败 toast，不会回退到旧 index；主进程缓存仍保留上一次成功的读取。已打开的市场页在失败时保持原列表。
2. **「重新加载」只覆盖 skills/plugins**：提示词、MCP、环境变量三个库不在这个动作里。如果实际需要全部重读，把服务名加进 `services` 列表即可。
3. **「关于」形态**：本计划跳转设置页。如果要独立弹窗，需要在阶段二追加一个 Dialog，并复用 `/hub/about` 的读取。
4. **菜单位置**：标准标题栏下只能放在页面顶部（侧栏顶部）。真正的标题栏内菜单需要无边框窗口改造。
5. **旧的原生菜单仍在**：按 Alt 显示的 Electron 原生菜单里还有 `Reload Page`（整页重载）和 `Check for Updates`；本次不改它。页面内的「重新加载」含义是重读资源，和原生菜单的 Reload Page 不是同一件事。
6. **打包更新检查未在开发形态覆盖**：`updater.enabled` 只在打包且存在 `app-update.yml` 时为真（`update.ts:59-60`），本机没有打包产物时只能验证 IPC 路径和置灰状态。
7. **平台覆盖**：本机是 Windows；macOS/Linux 的窗口行为和菜单外观未实测。菜单在三个桌面平台都会显示。
8. **IPC 安全边界**：新 handler 不额外校验 sender，与现有 `desktop-info` / `update-state` 一致。页面是 sandbox + contextIsolation，且窗口导航被限制在同源（`main.ts:231-239`）；如果以后允许加载第三方页面，需要补 sender 校验。

## 自审记录

- 五个菜单项都有明确落点：About 用设置页 `#about`，更新用 `updater.check(true)`，重新加载用 `catalog.skills` / `catalog.plugins` 的 `reload()`，刷新插件用 `createRemoteExtensionMarket().list(url, true)`，退出用 `app.quit()`。
- 没有猜测 API：`updater.check(manual)`、`app.quit()`、`catalog.skills.reload()`、`catalog.plugins.reload()`、`createRemoteExtensionMarket().list(url, refresh)`、`toast.add({ type, title })`、`useDesktopInfo()`、`desktopBridge()`、`DropdownMenu*` 都已在本仓源码中核对。
- `ABOUT_ROUTE` 是 HTTP 路由而不是页面路由；计划明确使用 `/settings#about`。
- 「重新加载」与「刷新插件」的区别已写清：前者重读本机的 skills/plugins 资产库，后者强制重新拉取远程市场索引；两者都不重载页面。
- 市场页的 index 是组件状态，因此计划加了 `refreshExtensionMarket()` 广播和 `useExtensionMarket` 的监听；ticket 保护保证在飞行中的旧读取不会覆盖刚广播的新 index。
- 用户已澄清两个语义（2026-10-20），计划按澄清更新，不再是待确认项。
- 阶段顺序正确：先有桥方法，再让 UI 调用；测试放在实现之后；AOCI 放在最终稳定状态之后。
- 已覆盖调用方、测试、fixture、配置和导出：`DesktopBridge` 两端镜像、preload 实现、main handler、web 菜单、i18n 两张表、web 测试、README。
- 「不做」列表覆盖了容易顺手做的相邻改动：编辑菜单、无边框窗口、扩展热重载、原生菜单调整、新依赖、快捷键。
- 待确认项集中在三个真实分叉：刷新插件语义、About 形态、菜单位置。
- 自审时修正了四处引用：`apps/web/server.ts` 的版本行号是 `:117`（不是 `:104`）；`PLUGIN_LIBRARY_SERVICE` 在 `library-store.ts:46`（不是 `:40`）；参考实现 `applicationItems()` 在 `main.ts:954-978`；参考实现的菜单位置只断言 CSS 变量默认 48px，没有猜测左侧图标属于谁。
- 打包态的「检测更新」弹窗没有本地打包产物可验证，已在阶段三和风险中明确标为「未验证」，不用开发形态的 no-op 冒充。
