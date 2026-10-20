# 桌面「应用」菜单与托盘菜单同步实施计划

## 背景与现状

### 当前行为

- **标题栏「应用」菜单**（用户所说的「应用菜单」）：`apps/desktop/src/app-menu.ts` 的 `appMenuTemplate` 生成，`apps/desktop/src/main.ts` 的 `APP_MENU_CHANNEL` handler 用 `Menu.buildFromTemplate(...).popup(...)` 弹出。当前顺序是：关于 context-hub → 分割线 → 检测更新 / 重新加载 / 刷新插件 → 分割线 → 退出。`zh` 由 `apps/desktop/src/preload-menu.ts` 在点击时从 `document.documentElement.lang` 读出并传入；更新不可用时该行保留并 `enabled: false`。
- **托盘菜单**：`apps/desktop/src/menu.ts` 的 `trayMenuTemplate` 生成，`apps/desktop/src/main.ts` 的 `createTray` 设置。当前条目是 Open Context Hub →（更新可用时）Check for Updates →（仅 dev）Restart App → 分割线 → Quit。只有英文；没有关于/重新加载/刷新插件；更新不可用时直接省略该行；重启只在开发构建出现。
- **重启能力已存在**：`apps/desktop/src/main.ts` 的 `restartApp()` 已实现。dev watcher 下 `app.exit(RESTART_EXIT_CODE)`，否则 `app.relaunch()` + `app.quit()`。目前只有原生 File/View 菜单（仅 dev）和托盘（仅 dev）能触发。
- **页面侧动作**：`apps/web/src/components/desktop-menu-actions.tsx` 监听 `APP_MENU_ACTION_CHANNEL`，通过 `apps/web/src/lib/app-menu.ts` 的 `runAppMenuAction` 执行 `about` / `reload-resources` / `refresh-plugins`。桥接类型在 `apps/desktop/src/bridge.ts` 与 `apps/web/src/lib/desktop.ts` 各镜像一份；preload 的 `onMenuAction` 在页面订阅时才注册监听（`apps/desktop/src/preload.ts`）。
- **语言状态**：页面语言来自 `useI18n().state.active`（`packages/extensions/src/react.tsx:97-112`，值来自 `<hub-home>/state/locale.json`）。`desktop-menu-actions.tsx:26-30` 只把 `document.documentElement.lang` 同步为 `zh-CN`/`en`；主进程和托盘不知道语言。原生 File/Edit/View 菜单（`applicationMenuTemplate`）是英文，Windows 上 `autoHideMenuBar: true`，不属于本次同步范围。
- **测试与文档**：`apps/desktop/__test__/app-menu.test.ts`、`apps/desktop/__test__/menu.test.ts`；`README.md:51-55` 的 Application menu 段落；`docs/building.md:73-78`、`:100-102`、`:192-201` 的托盘/更新描述。

### 问题归纳

1. 两套模板各写一份，条目、语言、更新不可用时的处理都已经分叉。
2. 托盘没有关于/重新加载/刷新插件，也没有所有构建都可用的重启。
3. 主进程不知道页面语言，托盘无法跟着页面切换。
4. 托盘一旦承载页面侧动作，必须处理窗口隐藏、窗口重建、页面加载中三种情况；`did-finish-load` 之后页面里的 React 监听未必已经注册，直接 `webContents.send` 可能丢动作。

## 目标

1. 标题栏「应用」菜单顺序固定为：关于 context-hub → 分割线 → 检测更新 / 重新加载 / 刷新插件 → 分割线 → 重新启动 → 退出。
2. 托盘菜单 = 打开 Context Hub → 分割线 → 与应用菜单完全相同的行。
3. 两个菜单使用同一份行定义，并以同一个页面语言为准；托盘通过新增的语言通道跟随页面切换。
4. 「重新启动」在所有构建的「应用」菜单和托盘中都出现，位置在「退出」之前。
5. 「检测更新」在不可用时两边都保留并置灰；原生 File/View 菜单的既有省略行为不变。
6. 托盘点击关于/重新加载/刷新插件时，窗口隐藏则显示并聚焦，窗口被销毁则重建，正在加载则等主框架加载完成；动作不能丢。
7. 原生 File/Edit/View 菜单结构、更新流程、窗口外观和关闭到托盘行为不变。

## 假设与边界

1. **「应用菜单」指标题栏「应用」按钮弹出的原生 popup**，不是 Electron 的原生 application menu（File/Edit/View）。原生菜单保持英文、保持现有结构；更新项与 dev 的 Restart App / Toggle DevTools 逻辑原样保留。
2. **托盘保留「打开 Context Hub / Open Context Hub」这一行**，永远在顶部，后面跟一条分割线；它不参与「与应用菜单相同」的比较。
3. **语言跟随页面语言**（`useI18n().state.active` 是否为中文），不跟随操作系统语言，也不在 main 里读 `state/locale.json`。页面首次挂载并上报之前，托盘短暂保持英文；页面挂载后立即对齐，之后随语言切换更新。
4. **页面侧动作一律把窗口带到前台**：关于、重新加载、刷新插件都会 `showWindow()`（恢复最小化、显示、聚焦；窗口已销毁且已知 URL 时重建）。这样导航和 toast 可见。检测更新、重新启动、退出不强制显示窗口。
5. **关于**导航到 `/settings#about`；重新加载继续重读 skills/plugins；刷新插件继续强制读取扩展市场索引。三者语义不变。
6. **更新不可用**：应用菜单和托盘都保留「检测更新」并置灰；原生 File/View 菜单继续省略该行。
7. **重启**：应用菜单/托盘在所有构建出现；原生 File/View 菜单仍只在 dev 出现。两者都调用同一个 `restartApp()`。
8. **不新增页面 i18n 键**：主进程菜单文案继续像 `app-menu.ts` 现在这样硬编码中英文；页面 i18n 只负责告诉主进程「当前是不是中文」。
9. **不新增依赖**，不改更新检查/下载/安装、托盘图标、单实例、标题栏 overlay、`autoHideMenuBar`。
10. 当前工作树有与本任务无关的修改：`apps/web/src/components/extension-detail-dialog.tsx`、`apps/web/src/pages/extensions.tsx`。实施时不要碰、不要 stage 这两个文件。`.aoci/baseline.json`、`aoci.code.txt` 当前也有未提交改动；不要手工编辑，阶段四通过 AOCI 工具维护，并在维护前确认没有其他 session 正在写同一仓库。

## 跨平台说明（Windows / macOS / Linux）

本次改动不新增平台分支：共享行定义、语言通道和托盘重建都是平台无关的；平台差异只沿用现有行为。

| 平台 | 标题栏「应用」菜单 | 托盘 | 重启 | 本次验收 |
| --- | --- | --- | --- | --- |
| Windows | `titleBarStyle: "hidden"` + 原生 overlay；preload 注入「应用」按钮，popup 为原生菜单 | 左键点击显示窗口；右键弹出 `setContextMenu`；脚本改动后调用 `setContextMenu` 重建即可生效 | `app.relaunch()` + `app.quit()`；dev watcher 下走 `RESTART_EXIT_CODE` | 本机真机验收 |
| macOS | `titleBarStyle: "hiddenInset"`，菜单从交通灯右侧 84px 开始；popup 同样是原生菜单 | 菜单栏状态项使用 `trayTemplate.png` 模板图；macOS 点击状态项直接展开菜单，不依赖 `click` 事件显示窗口，因此顶部的「打开 Context Hub」行是回到窗口的入口 | 同上；`app.relaunch()` 走 macOS 应用包重启 | 本机无法运行 macOS，只做模板单测 + 代码审查 |
| Linux | `frame: false`，preload 自绘最小化/最大化/关闭；「应用」菜单同样存在 | 使用 `tray.png`；Electron 要求 Linux 托盘通过 `setContextMenu` 提供菜单（AppIndicator 不保证响应点击），因此托盘行必须完整，不能依赖点击托盘图标打开窗口。语言切换通过同一 `setContextMenu` 重建 | 同上；打包为 AppImage 时 `app.relaunch()` 的进程替换依赖 Electron 的 AppImage 启动器，未在本机验证 | 本机无法运行 Linux，只做模板单测 + 代码审查 |

跨平台注意事项：

1. **菜单行完全一致**：三个平台上 `appMenuTemplate` 和 `trayMenuTemplate` 使用同一份行定义，不存在“Windows 有、macOS 没有”的分支；唯一的平台分支仍是既有的窗口外观、托盘图标和原生 role 菜单。
2. **原生 File/Edit/View 菜单**：macOS 保留 `appMenu` / `editMenu` / `windowMenu` role；Windows/Linux 保留 File/Edit/View 结构。本次只删除旧托盘专用的 `MenuActions.openWindow`，不改变这些菜单在任一平台的条目和 dev 判断。
3. **重启的可用范围变大**：`restartApp()` 原本在打包态没有入口（托盘和原生菜单都只在 dev 出现），本次把它放进所有构建的「应用」菜单和托盘。Windows 打包态可按真机验收验证；macOS 打包态、Linux AppImage 的 `app.relaunch()` 本次不实测，风险表里单列。
4. **语言来源一致**：托盘跟随页面语言，不跟随操作系统语言；三个平台都通过同一个 `APP_LANGUAGE_CHANNEL` 更新，不存在 macOS 读系统语言、Windows 读页面语言的差异。
5. **托盘动作的窗口行为一致**：关于 / 重新加载 / 刷新插件都会先显示并聚焦窗口；macOS 上即使状态项点击本身不会显示窗口，这些行也会把窗口带回前台。

## 设计决策

### 1. `appMenuTemplate` 是唯一行定义

- `apps/desktop/src/app-menu.ts` 的 `AppMenuOptions` 增加 `restartApp(): void`。
- `appMenuTemplate` 在第二条分割线之后、退出之前插入：
  `{ label: zh ? "重新启动" : "Restart App", click: options.restartApp }`。
- 新增 `TrayMenuOptions extends AppMenuOptions { openWindow(): void }` 和 `trayMenuTemplate(options)`。实现只做一件事：
  `[打开项, 分割线, ...appMenuTemplate(options)]`。
- `trayMenuTemplate` 从 `apps/desktop/src/menu.ts` 移到 `apps/desktop/src/app-menu.ts`；`menu.ts` 只保留 `applicationMenuTemplate`。同时从 `MenuActions` 删除只被旧托盘使用的 `openWindow`。
- 更新不可用时不再从托盘省略：共享行里的「检测更新」带 `enabled: options.updatesEnabled`，两边一致。

最终条目：

| 菜单 | 中文 | 英文 |
| --- | --- | --- |
| 应用 | 关于 context-hub / --- / 检测更新 / 重新加载 / 刷新插件 / --- / 重新启动 / 退出 | About Context Hub / --- / Check for Updates / Reload / Refresh Plugins / --- / Restart App / Quit |
| 托盘 | 打开 Context Hub / --- / 关于 context-hub / --- / 检测更新 / 重新加载 / 刷新插件 / --- / 重新启动 / 退出 | Open Context Hub / --- / About Context Hub / --- / Check for Updates / Reload / Refresh Plugins / --- / Restart App / Quit |

### 2. 托盘页面动作的分派与窗口行为

在 `apps/desktop/src/main.ts` 增加 `sendPageAction(action: DesktopMenuAction)`：

1. `showWindow()`（现有函数：恢复最小化、show、focus；窗口已销毁且 `loadedUrl !== null` 时重建）。
2. 取当前 `window`；为空或已销毁则返回。
3. `window.webContents.isLoadingMainFrame()` 为真时，`once("did-finish-load", ...)` 后再发；否则立即 `webContents.send(APP_MENU_ACTION_CHANNEL, action)`。
4. 回调里再次检查窗口未销毁。

`APP_MENU_CHANNEL` 的 `send` 和托盘的 `send` 都指向这个函数；应用菜单路径本来窗口就可见，行为不变。

**preload 缓冲**：`did-finish-load` 只保证页面加载完成，不保证 `DesktopMenuActions` 的 React effect 已经订阅；而且 `desktop-menu-actions.tsx` 的 effect 依赖 `actions`/`report`，语言切换时会先 cleanup 再重新订阅，中间存在空窗。为避免丢动作：

- 新增纯函数模块 `apps/desktop/src/menu-action-queue.ts`，提供 `createMenuActionQueue<T>()`：
  - `push(action)`：没有订阅者时入队，有订阅者时立即分发。
  - `subscribe(listener)`：成为当前唯一订阅者，并按顺序冲出已缓冲的动作；返回取消函数。取消函数只在当前订阅者仍是自己时才清除订阅，避免旧组件的 cleanup 误删新订阅。新订阅者到来时不重放已分发过的动作。
- `apps/desktop/src/preload.ts` 在模块加载时（早于页面脚本）注册 `ipcRenderer.on(APP_MENU_ACTION_CHANNEL, ...)`，把动作 `push` 进队列；`onMenuAction` 改为 `queue.subscribe(listener)`。
- 不改变页面拿到的 `DesktopBridge.onMenuAction` 语义：仍然是订阅一个动作回调，返回取消函数。

边界：窗口从未成功创建（`loadedUrl === null`）或页面加载失败时，动作没有接收方，这是既有的启动失败路径；不做额外弹窗。

### 3. 语言同步

- `apps/desktop/src/bridge.ts` 新增：
  `APP_LANGUAGE_CHANNEL = "context-hub:app-language"`。
  `DesktopBridge` 新增 `setLanguage(zh: boolean): void`（renderer → main，fire-and-forget）。
- `apps/desktop/src/preload.ts` 用 `ipcRenderer.send(APP_LANGUAGE_CHANNEL, zh)` 实现。
- `apps/desktop/src/main.ts`：
  - 模块级 `let menuZh = false`，默认英文。
  - `refreshTrayMenu()`：`tray` 存在时用 `trayMenuTemplate({ zh: menuZh, ... })` 重建并 `setContextMenu`；不重建 Tray 本身。
  - `setMenuLanguage(zh)`：值与 `menuZh` 相同直接返回，否则更新并 `refreshTrayMenu()`。
  - `ipcMain.on(APP_LANGUAGE_CHANNEL, ...)`：先判 `window === null || window.isDestroyed()`，再校验 `event.sender === window.webContents` 且 `typeof zh === "boolean"`，然后 `setMenuLanguage(zh)`。
  - `APP_MENU_CHANNEL` handler 在 `typeof zh === "boolean"` 时也调用 `setMenuLanguage(zh)`；这样即使用户先打开应用菜单，托盘也会在同一次点击后对齐。
- `apps/web/src/lib/desktop.ts` 镜像 `setLanguage(zh: boolean): void`。
- `apps/web/src/components/desktop-menu-actions.tsx` 的语言 effect 改为：
  计算 `const zh = state.active.toLowerCase().includes("zh")`；
  设置 `document.documentElement.lang = zh ? "zh-CN" : "en"`；
  调用 `desktopBridge()?.setLanguage(zh)`。
- 应用菜单仍然在每次打开时由 preload 读取 `document.lang` 传 `zh`，保证与标题栏「应用」按钮文案同步；主进程记录同一个值并重建托盘，保证两边最终一致。

### 4. 原生 File/Edit/View 菜单不变

- `applicationMenuTemplate` 的条目、accelerator、dev 判断都不改。
- 只从 `MenuActions` 删除 `openWindow`（旧托盘专用），并更新 `main.ts` 的 `menuActions()`。
- Windows 的 `autoHideMenuBar: true`、macOS 的 role 菜单、Linux 的 frameless 按钮都不动。

## 阶段

### 阶段一：统一菜单模板

**目标**：应用菜单和托盘共用 `appMenuTemplate` 的行；新增「重新启动」；托盘保留并置灰「检测更新」；托盘页面动作具备显示/重建/等待加载的能力；补 preload 缓冲。

**改动文件**

- `apps/desktop/src/app-menu.ts`
- `apps/desktop/src/menu.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/menu-action-queue.ts`（新增）
- `apps/desktop/src/preload.ts`
- `apps/desktop/__test__/app-menu.test.ts`
- `apps/desktop/__test__/menu.test.ts`
- `apps/desktop/__test__/menu-action-queue.test.ts`（新增）

**实现要点**

1. `app-menu.ts`：按「设计决策 1」增加 `restartApp`、重启行、`TrayMenuOptions`、`trayMenuTemplate`；文件头注释说明它同时拥有标题栏 popup 和托盘共享行。
2. `menu.ts`：删除 `trayMenuTemplate` 和 `MenuActions.openWindow`；更新文件头注释，说明原生菜单仍会在不可用时省略更新/开发项，而应用菜单/托盘改为置灰。
3. `main.ts`：
   - 从 `./app-menu.ts` 导入 `trayMenuTemplate`（和现有 `appMenuTemplate`），从 `./menu.ts` 只导入 `applicationMenuTemplate` 与 `MenuActions`；从 `./bridge.ts` 补 `type DesktopMenuAction`（`sendPageAction` 的参数类型）。
   - 增加 `let menuZh = false`。
   - 增加 `sendPageAction`（见「设计决策 2」）。
   - 增加 `refreshTrayMenu()`：内部调用 `menuActions()` 取 `checkForUpdates` / `restartApp` / `quit`，外加 `openWindow: showWindow`、`send: sendPageAction`，用共享模板构建并 `tray.setContextMenu(...)`。`createTray()` 改为创建 Tray 后调用 `refreshTrayMenu()`，不再接收 `actions` 参数；原生 application menu 仍使用 `whenReady` 里单独创建的 `const actions = menuActions()`。
   - `menuActions()` 删除 `openWindow`；`whenReady` 里的 `createTray(actions)` 改为 `createTray()`。
   - `APP_MENU_CHANNEL` 的 `appMenuTemplate` 选项补 `restartApp: () => void restartApp()`，`send` 改用 `sendPageAction`。
4. `menu-action-queue.ts` + `preload.ts`：按「设计决策 2」实现队列；preload 在模块顶层注册 `APP_MENU_ACTION_CHANNEL` 监听，`onMenuAction` 使用队列订阅。
5. 测试：按「测试清单」更新 `app-menu.test.ts`、`menu.test.ts`，新增 `menu-action-queue.test.ts`。

**验收**

```bash
pnpm --filter @context-hub/desktop test
pnpm --filter @context-hub/desktop typecheck
pnpm --filter @context-hub/desktop lint
pnpm --filter @context-hub/desktop build
```

预期全部退出码 0。此阶段托盘仍是英文（语言同步在阶段二），但条目已与应用菜单一致，重启和置灰更新项已生效。

### 阶段二：同步菜单语言

**目标**：页面语言变化时主进程知道，并重建托盘；应用菜单与托盘在稳态下使用同一语言。

**改动文件**

- `apps/desktop/src/bridge.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/main.ts`
- `apps/web/src/lib/desktop.ts`
- `apps/web/src/components/desktop-menu-actions.tsx`
- `apps/desktop/__test__/app-menu.test.ts`（补语言一致性断言）

**实现要点**

1. `bridge.ts`：新增 `APP_LANGUAGE_CHANNEL` 和 `DesktopBridge.setLanguage(zh: boolean): void`。
2. `preload.ts`：实现 `setLanguage`（`ipcRenderer.send`）。
3. `main.ts`：
   - `setMenuLanguage` / `refreshTrayMenu` / `ipcMain.on(APP_LANGUAGE_CHANNEL, ...)`；后者放在 `whenReady` 里与其他 `ipcMain` 注册放在一起。
   - `APP_MENU_CHANNEL` handler 记录 `zh`（仅在 `typeof zh === "boolean"` 时）。
   - `createTray` 调用 `refreshTrayMenu`，初始语言取当前的 `menuZh`。
4. `apps/web/src/lib/desktop.ts`：镜像 `setLanguage`。
5. `desktop-menu-actions.tsx`：语言 effect 按「设计决策 3」调用桥方法；浏览器形态 `desktopBridge()` 为 undefined，不产生额外行为。更新 effect 注释，说明这个值同时供标题栏与托盘使用。
6. 测试：`app-menu.test.ts` 增加中文/英文两组断言，并断言 `trayMenuTemplate(...).slice(2)` 与 `appMenuTemplate(...)` 的 label/type/enabled 完全一致。

**验收**

```bash
pnpm --filter @context-hub/desktop test
pnpm --filter @context-hub/desktop typecheck
pnpm --filter @context-hub/desktop lint
pnpm --filter web typecheck
pnpm --filter web lint
```

另做一次定向 Electron 验收：用隔离 hub home 预置 `state/locale.json` 为 `"zh-CN"`，启动后确认页面、标题栏「应用」菜单为中文，托盘目视为中文；在设置页切到 English 后，两处都变英文，再切回中文。具体命令见「真机验收步骤」。

### 阶段三：更新桌面文档

**目标**：文档不再描述旧的托盘条目和“更新不可用时省略”的行为；明确标题栏「应用」菜单与原生 File/View 菜单的区别。

**改动文件**

- `README.md`（Desktop app 段落，约 51-60 行）
- `docs/building.md`（Desktop app 约 73-78 行、Development 约 100-102 行、Updates 约 192-201 行）

**实现要点**

1. README 的 Application menu 句子改为：应用菜单包含 About、Check for Updates、Reload、Refresh Plugins、Restart、Quit；托盘在 Open Context Hub 之下重复同样的行；应用菜单和托盘跟随页面语言；没有更新 feed 时 Check for Updates 保留但置灰。
2. `docs/building.md` 的托盘句子改为：托盘重复应用菜单的行（含 About/Restart），跟随页面语言；更新不可用时保留并置灰。
3. README 和 `docs/building.md` 的 Development 段落把 “the application menu adds Restart App and Toggle DevTools” 明确为原生 File 菜单（macOS 为 View），避免和标题栏「应用」菜单混淆。
4. Updates 段落写明：标题栏应用菜单和托盘在无 feed 时显示置灰项；原生 File/View 菜单继续省略该项。

**验收**

```bash
rg -n "tray menu|Application menu|Check for Updates|Restart App|Open Context Hub" README.md docs/building.md
```

逐条核对：不再出现“托盘只提供 Open Context Hub/更新/Quit”或“应用菜单只有五项”的旧描述；不存在把标题栏应用菜单和原生 File/View 菜单混为一谈的句子。此阶段不改代码。

### 阶段四：完成验收与认知同步

**目标**：全量检查通过，真实 Electron 窗口完成菜单/托盘/语言/动作验收，最后按仓库 AOCI 流程收尾。

**步骤**

1. 运行「验证命令」里的全量命令。
2. 按「真机验收步骤」逐项验收，记录未验证项。
3. 确认工作树稳定、没有其他 session 正在写同一仓库后，调用一次 `aoci_maintain`；按返回候选基于真实源码提交完整批次，不手改 `aoci.txt` / `aoci.code.txt` / `.aoci`。若返回 `remaining` 非零，在当前批次成功应用后重新调用 Maintain，并按新的 preimage 继续，不要截断批次。若 AOCI 工具不可用或返回需要人工裁决/停止的状态，按工具状态停止并汇报，不手写索引。
4. `git status --short` 核对：包含本任务文件、AOCI 托管产物，以及已知的无关改动（保持原样）；不提交、不 push。

**验收**

- 全量命令退出码 0。
- 真机验收清单全部通过，或明确列出未验证项及原因。
- AOCI 没有未处理候选，或候选已成功 apply；AOCI 工具不可用时已在汇报中注明未完成及原因。
- `git status --short` 中没有意外文件；`apps/web/src/components/extension-detail-dialog.tsx`、`apps/web/src/pages/extensions.tsx` 等既有改动保持原样。

## 测试清单

### `apps/desktop/__test__/app-menu.test.ts`（修改）

- `options()` 增加 `restartApp: vi.fn()`。
- 应用菜单中文顺序：关于 / --- / 检测更新 / 重新加载 / 刷新插件 / --- / 重新启动 / 退出。
- 应用菜单英文顺序：About / --- / Check for Updates / Reload / Refresh Plugins / --- / Restart App / Quit。
- 点击回调：关于 → `send("about")`；检测更新 → `checkForUpdates`；重新加载 → `send("reload-resources")`；刷新插件 → `send("refresh-plugins")`；重新启动 → `restartApp`；退出 → `quit`。
- `updatesEnabled: false` 时应用菜单「检测更新」仍存在且 `enabled === false`。
- 托盘中文顺序：打开 Context Hub / --- / 关于 / --- / 检测更新 / 重新加载 / 刷新插件 / --- / 重新启动 / 退出。
- 托盘英文顺序：Open Context Hub / --- / About / --- / Check for Updates / Reload / Refresh Plugins / --- / Restart App / Quit。
- 托盘一致性：托盘数组长度 = 应用菜单数组长度 + 2；第 0 行是打开项，第 1 行是 separator；`trayItems.slice(2)` 与 `appMenuTemplate(...)` 的 label/type/enabled 逐项相等（中文和英文各一次）。
- 托盘 `updatesEnabled: false` 时「检测更新」仍存在且 `enabled === false`，不是被省略。
- 托盘重启项在 `updatesEnabled` 为 true/false 时都存在（已没有 `dev` 选项）。
- 托盘回调：打开 → `openWindow`；关于/重新加载/刷新插件 → `send`；检测更新 → `checkForUpdates`；重新启动 → `restartApp`；退出 → `quit`。

### `apps/desktop/__test__/menu.test.ts`（修改）

- 从 `MenuActions` fixture 删除 `openWindow`。
- 删除 `trayMenuTemplate` 的 import 和整个 `describe("trayMenuTemplate")`。
- 保留并确认现有 `applicationMenuTemplate` 断言：打包 Windows 有 Check for Updates…/Reload Page/Quit，无 Restart App/Toggle DevTools；dev 有 Restart App/Toggle DevTools，无更新项；macOS 保留 appMenu/editMenu/windowMenu。

### `apps/desktop/__test__/menu-action-queue.test.ts`（新增）

- 先 `push` 后 `subscribe`：订阅时按顺序收到全部缓冲动作，且只收到一次。
- 先 `subscribe` 后 `push`：立即收到。
- `unsubscribe` 后 `push`：旧订阅者不再收到；下一个订阅者收到该动作。
- 新订阅者替换旧订阅者后，旧订阅者返回的取消函数不会清除新订阅。
- 连续 `push` 多个动作：顺序保持。
- 断言队列不会把已分发的动作重放给新订阅者。
- `preload.ts` 本身会 import `electron`，不在 node 单测里加载；它的顶层 `ipcRenderer.on` 注册由真机验收覆盖。

### Web 侧

不新增 DOM 测试：`apps/web/vitest.config.ts` 目前是 node 环境，没有渲染组件的基础；`desktop-menu-actions.tsx` 的语言 effect 由阶段二的定向 Electron 验收覆盖。`apps/web/__test__/app-menu.test.ts` 的动作映射语义未变，不需要改动。

## 搜索范围（实施前后都查）

```bash
rg -n "trayMenuTemplate|appMenuTemplate|MenuActions|openWindow" apps packages
rg -n "APP_MENU_ACTION_CHANNEL|APP_LANGUAGE_CHANNEL|onMenuAction|DesktopMenuAction|DesktopBridge" apps packages
rg -n "setLanguage|desktopBridge|document\\.documentElement\\.lang" apps/web/src apps/desktop/src
rg -n "Check for Updates|Open Context Hub|Restart App|Refresh Plugins|About Context Hub|tray menu|Application menu" apps README.md docs/building.md
```

预期：

- `trayMenuTemplate` 只出现在 `apps/desktop/src/app-menu.ts`、`apps/desktop/src/main.ts`、`apps/desktop/__test__/app-menu.test.ts`。
- `MenuActions.openWindow` 在源码和测试中都没有残留。
- `APP_MENU_ACTION_CHANNEL` 只由 `bridge.ts` 定义，`main.ts` 发送，`preload.ts` 接收/缓冲。
- `APP_LANGUAGE_CHANNEL` 只由 `bridge.ts` 定义，`preload.ts` 发送，`main.ts` 接收。
- `DesktopBridge` 两端（`apps/desktop/src/bridge.ts`、`apps/web/src/lib/desktop.ts`）方法集合一致。
- `document.documentElement.lang` 只在 `desktop-menu-actions.tsx` 设置，`preload-menu.ts` 只读取它；`state.active` 的其他用途是页面翻译，不属于本任务的同步点。
- 当前文档（`README.md`、`docs/building.md`）中不再有旧的托盘条目描述；原生 File/View 菜单的描述已明确区分。历史计划（`docs/plans/archive/`）不改。

## 验证命令

最小相关范围（按阶段执行）：

```bash
pnpm --filter @context-hub/desktop test
pnpm --filter @context-hub/desktop typecheck
pnpm --filter @context-hub/desktop lint
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
```

构建（真机验收前必须执行）：

```bash
pnpm --filter web build
pnpm --filter @context-hub/desktop build
```

最终全量：

```bash
pnpm test
pnpm typecheck
pnpm lint
```

说明：

- 不运行 `pnpm install`，本任务不新增依赖。
- `pnpm --filter web build` 会执行 `tsc -b && vite build`，产出 `apps/web/dist`；桌面端启动前必须有这个目录。
- `pnpm --filter @context-hub/desktop build` 产出 `dist/main.cjs`、`dist/preload.cjs`、`dist/server.mjs`。
- 如果全量 `pnpm lint` 被与本任务无关的既有问题挡住，先确认问题文件不在本任务 diff 中，再在汇报里写明；不要顺手修无关文件。

## 真机验收步骤

前置：先停掉正在运行的 dev watcher / 旧 Electron 实例。dev watcher 和打包应用共用单实例锁；同一个 `CONTEXT_HUB_HOME` 同时只能有一个 hub server。只操作自己启动的进程，不要按 `electron.exe` 镜像名清场。

1. 构建：

   ```bash
   pnpm --filter web build
   pnpm --filter @context-hub/desktop build
   ```

2. 准备隔离 home 和 profile，并预置中文：

   ```bash
   HUB_HOME=$(mktemp -d)
   PROFILE=$(mktemp -d)
   mkdir -p "$HUB_HOME/state"
   printf '"zh-CN"\n' > "$HUB_HOME/state/locale.json"
   ```

   `state/locale.json` 的格式来自 `packages/core/src/host/state-fs.ts`：state 文档是一个 JSON 值一个文件，`locale` 存的是 JSON 字符串。

3. 启动 Electron（从 `apps/desktop` 目录，页面用刚构建的 `apps/web/dist`）：

   ```bash
   cd apps/desktop
   CONTEXT_HUB_HOME="$(cygpath -w "$HUB_HOME")" \
     pnpm exec electron --remote-debugging-port=9222 \
     --user-data-dir="$(cygpath -w "$PROFILE")" .
   ```

4. 页面与语言：
   - 用 `curl http://127.0.0.1:9222/json/list` 找到页面 target，用 Node 全局 `WebSocket` 连接并执行 `Runtime.evaluate`。
   - 等待页面和语言包加载完成（侧栏出现中文、`document.documentElement.lang` 稳定为 `zh-CN`），再断言 `document.documentElement.lang === "zh-CN"`。
   - 点击标题栏「应用」按钮，目视确认菜单为中文且顺序为：关于 context-hub / 分割线 / 检测更新 / 重新加载 / 刷新插件 / 分割线 / 重新启动 / 退出。
   - 右键托盘图标，目视确认：打开 Context Hub / 分割线 / 关于 context-hub / 分割线 / 检测更新 / 重新加载 / 刷新插件 / 分割线 / 重新启动 / 退出。开发形态 `updatesEnabled === false`，「检测更新」应为灰色但仍存在。
   - 托盘和标题栏 popup 都是原生菜单，无法通过 renderer CDP 读取文本；这一项用系统截图/目视确认，不要声称已由 DOM 断言覆盖。

5. 切换语言：
   - 进入设置页，在语言分段控件选择 English（`apps/web/src/pages/settings.tsx:545-557`）。
   - 断言 `document.documentElement.lang === "en"`；打开标题栏「应用」菜单，目视为英文且顺序不变；右键托盘，目视为英文。
   - 再切回中文，重复确认。原生 File/Edit/View 菜单保持英文，这是预期边界。

6. 托盘页面动作（窗口隐藏状态）：
   - 点窗口关闭按钮，确认窗口隐藏但应用仍在托盘。
   - 托盘 → 关于 context-hub：窗口应恢复/聚焦，并导航到 `/settings#about`。
   - 再次隐藏，托盘 → 重新加载：窗口应恢复/聚焦，当前路由不变，出现成功 toast；Skills/Plugins 的读取重新发出。
   - 再次隐藏，托盘 → 刷新插件：窗口应恢复/聚焦，出现成功 toast；Network/CDP 中应有 `POST /hub/extension-market` 且 `refresh: true`。
   - 如果窗口是最小化状态，托盘动作应先 restore。

7. 加载中动作（边界）：
   - 在窗口聚焦时按 Ctrl+R 触发整页重载，随后立刻从托盘选择「关于 context-hub」。
   - 预期：重载完成后仍会导航到 `/settings#about`，动作不丢。
   - 这个时序手工难以稳定复现；`menu-action-queue.test.ts` 覆盖 preload 缓冲，`sendPageAction` 的 `isLoadingMainFrame()`/`did-finish-load` 分支由代码审查和一次尽力而为的真机操作覆盖。如果没能卡在加载中触发，汇报中写明“该时序未稳定复现”。

8. 重新启动：
   - 托盘 → 重新启动：应用退出并重新启动；新窗口仍使用同一个隔离 `CONTEXT_HUB_HOME`。检查方式：读新窗口页面 URL 的端口，请求 `GET /hub/about`（或打开设置页关于分组），确认 `home` 仍是第 2 步创建的临时目录。
   - 在 `electron .`（无 watcher）下走 `app.relaunch()` + `app.quit()`；在 `pnpm --filter @context-hub/desktop dev` 下走 `RESTART_EXIT_CODE`，由 watcher 重新 spawn。至少验证一种，并在汇报中说明验证的是哪一种。

9. 退出：
   - 托盘 → 退出：应用退出，托盘图标消失，hub server 端口关闭，没有残留进程。
   - 只按自己记录的 PID/端口停止；不要使用 `taskkill //IM` 或按镜像名清场。

10. 原生菜单回归：
    - Windows 上按 Alt 显示原生菜单，确认 File 菜单仍有 Reload Page；dev 构建仍有 Restart App / Toggle DevTools；更新项在 dev 下仍被省略。
    - 确认这次改动没有把关于/重新加载/刷新插件加进原生 File/View 菜单。

11. 清理：
    - 退出应用后删除 `HUB_HOME` / `PROFILE` 临时目录。
    - 如果启动失败，先检查是否还有旧的 dev watcher/Electron 占用单实例锁或端口，不要直接杀所有 Electron。

## 风险与待验证

| 风险 / 待验证项 | 影响 | 处理 |
| --- | --- | --- |
| 托盘原生菜单无法通过 renderer CDP 读取 | 无法自动断言托盘文案与置灰状态 | 模板单测覆盖 label/type/enabled；真机目视确认；汇报中明确“目视而非 DOM 断言” |
| 页面首次挂载前托盘是英文 | 启动瞬间语言不一致 | 页面挂载后立即通过 `APP_LANGUAGE_CHANNEL` 对齐；这是启动瞬态，不影响稳态 |
| 页面动作强制显示窗口 | 后台点重新加载/刷新插件会弹窗 | 这是为了让导航/toast 可见的有意选择；如果以后要静默执行，需单独设计 |
| `did-finish-load` 与 React effect 的时序 | 动作可能早于页面订阅 | preload 队列在页面脚本前注册并缓冲；主进程只在主框架加载完成后发送；单测覆盖队列 |
| 打包态更新项启用未在本机验证 | 只能验证 dev 下置灰，不能验证有 feed 时的可点击状态 | 有打包产物时按 `docs/building.md` 的更新流程另验；没有则在汇报中标注未验证 |
| macOS/Linux 托盘外观与行为未实测 | 平台差异 | 本机是 Windows；模板逻辑跨平台一致，真机验收只声明 Windows 结果 |
| 打包态「重新启动」是新入口 | 此前打包用户没有重启入口，`app.relaunch()` 在 Windows 之外未经验证 | Windows 打包/非打包按真机验收；macOS 应用包与 Linux AppImage 的重启在汇报中标注未验证，不声称已通过 |
| Electron API 版本差异 | `isLoadingMainFrame`、`did-finish-load`、`Tray.setContextMenu`、`app.relaunch` 的行为 | 已用当前安装的 `apps/desktop/node_modules/electron/electron.d.ts` 核对：`isLoadingMainFrame(): boolean`、`once(event: 'did-finish-load', ...)`、`Tray.setContextMenu(menu)`、`app.relaunch(options?)` 均存在。若升级 Electron，重新跑下面的命令核对 |
| `app.relaunch()` 在隔离测试环境中的参数/环境继承 | 重启后可能丢掉 `--user-data-dir` 或 `CONTEXT_HUB_HOME` | 真机验收第 8 步检查重启后的窗口仍使用同一个 home；这是既有 `restartApp()` 路径，不是本次新逻辑 |
| AOCI 维护与其他 session 冲突 | 可能把别人正在写的代码索引进去 | 阶段四先跑 `git status --short` 和近期 mtime 检查；发现不属于本任务的写入就停下并报告 |

API 核对命令：

```bash
rg -n "isLoadingMainFrame\(\): boolean|once\(event: 'did-finish-load'|setContextMenu\(menu|relaunch\(" \
  apps/desktop/node_modules/electron/electron.d.ts
```

打包态更新项验收（可选，只有本机有打包产物和 `app-update.yml` 时执行）：

- 启动 `apps/desktop/release/win-unpacked/Context Hub.exe` 或安装后的应用。
- 打开标题栏「应用」菜单和托盘，确认「检测更新」可点击；点击后走现有更新检查弹窗。
- 没有打包产物时不要用 dev 形态的 no-op 冒充，明确写“未验证”。

## 不做

- 不修改原生 File/Edit/View 菜单的条目、accelerator、平台 role 或 dev 判断；只删除不再使用的 `MenuActions.openWindow`。
- 不在应用菜单/托盘中新增目标表以外的行（例如 DevTools、设置、帮助）。
- 不把「重新启动」加进原生 File/View 菜单；原生菜单保持现状（仅 dev 有 Restart App）。
- 不改变更新检查时机、下载/安装确认、`autoDownload` / `autoInstallOnAppQuit`、更新 feed。
- 不为菜单新增页面 i18n 键，不让主进程读取 `state/locale.json` 或操作系统语言。
- 不改变关闭窗口隐藏到托盘的行为、托盘图标、单实例锁、窗口标题栏 overlay、`autoHideMenuBar`。
- 不新增全局快捷键；`Ctrl+R` 仍归原生 Reload Page。
- 不把托盘页面动作改成静默执行；它们会显示窗口。
- 不添加新依赖，不改 `bundle.ts` 的 external 列表。
- 不碰 `apps/web/src/components/extension-detail-dialog.tsx`、`apps/web/src/pages/extensions.tsx` 等既有未提交改动。
- 不手工编辑 `aoci.txt` / `aoci.code.txt` / `.aoci`；AOCI 只通过工具维护。
- 不修改 `docs/plans/archive/` 下的历史计划。
- 不提交 git、不 push、不在实施过程中归档本计划。

## 自审记录

- 阶段依赖：阶段一建立共享模板、`menuZh` 和 `refreshTrayMenu` 的托盘重建入口，阶段二才接语言通道，阶段三只改文档，阶段四做全量验收和 AOCI。没有阶段依赖后面才创建的东西。
- 调用方已覆盖：`appMenuTemplate` 的 main handler 和测试；`trayMenuTemplate` 的 main `createTray` 和测试；`MenuActions.openWindow` 只被旧托盘和测试使用；`DesktopBridge` 两端镜像；preload 的 `onMenuAction`；web 的语言 effect；README/docs。
- 测试已覆盖核心同步语义：托盘行 = 打开项 + 应用菜单行、两边语言一致、更新不可用时两边都置灰、重启在两个菜单都存在。preload 队列单独有单测。
- 没有把猜测写成事实：`isLoadingMainFrame`、`did-finish-load`、`Tray.setContextMenu`、`app.relaunch` 已用当前 Electron 44.9.0 类型定义核对；`locale` state 文件格式已在 `packages/core/src/host/state-fs.ts` 核对；当前代码行号和符号均来自实际阅读。
- 已明确列出未验证项：托盘原生菜单只能目视、打包态更新项需要真实 feed、macOS/Linux 未实测、加载中动作的时序只能尽力复现。
- 范围控制：没有改原生菜单结构、更新流程、窗口外观、i18n 页面键；没有新增依赖；没有顺手修无关文件。
- 自审时补上的关键点：`did-finish-load` 之后 React 监听仍可能未注册，因此增加了 preload 队列；`DesktopMenuActions` 在语言切换时会重订阅，队列也覆盖这个空窗；托盘语言在页面首次上报前会短暂为英文，已写入假设和风险。
