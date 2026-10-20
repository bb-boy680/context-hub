# 桌面端创建工作区：原生目录对话框与路径回传

## 背景

桌面端点击“创建工作区”有两个用户可见现象：

1. 第一次选择文件夹后，工作区没有创建成功。
2. 第二次点击“创建工作区”完全没有反应，必须重启桌面端。

当前链路：

- 侧栏入口在 `apps/web/src/components/workspace-group.tsx:139-152` 的 `create()`：调用 `pickFolder()`，只取 `picked.name`，然后 `add(picked.name)`（`:151`）。
- 页面侧选择器在 `apps/web/src/lib/folder-picker.ts:25-35`：使用 `window.showDirectoryPicker()`，只返回 `{ name: handle.name }`（`:30`）。catch 在 `:31-34` 把所有 rejection 都当成“用户取消”，所以失败没有任何提示。
- 服务端定位在 `packages/core/src/host/workspaces-fs.ts:213-232` 的 `locate()`：
  - 绝对路径直接接受并检查存在性（`:214-216`）；
  - 非绝对路径只会在 `foldersNamed()`（`:186-205`）给出的根目录中按名字查找：host folder 的父目录，以及每个已知工作区路径的父目录；
  - 找不到就抛 `no folder named ... sits beside a folder this hub knows`（`:224-228`）。
- 所以“浏览器只给名字”的设计本身就无法添加任意目录；桌面端本来可以给出绝对路径，但页面从未向载体要过。

第一次失败可能是 `locate()` 拒绝了不在已知根目录下的名字，也可能是 Electron 的 `showDirectoryPicker()` 没有可靠返回 handle；本方案把桌面端从这条链路上移除，两个原因都不再成立。

第二个现象的证据来自用户在本机的探针（Electron 44.9.0，`apps/desktop/node_modules/electron`）：第一次 `showDirectoryPicker()` 打开系统对话框后，后续调用抛出 `NotAllowedError: Failed to execute 'showDirectoryPicker' on 'Window': File picker already active.`，再往后抛 `AbortError`。`folder-picker.ts` 的 catch 把这些错误全部吞掉，界面看起来就是“点了没反应”，只能重启。本次计划没有重跑该探针，把它作为用户提供的复现证据；实现后的手工验收必须覆盖“连续点击仍能打开对话框”。

服务端不需要改：`WorkspaceStore.add()` 已经明确支持绝对路径（`packages/core/src/workspace.ts:94-100` 的契约，`packages/core/src/host/workspaces-fs.ts:292-303` 的实现），HTTP handler 也把 `body.path` 原样交给 `store.add`（`packages/core/handlers.ts:589-593`）。问题只在载体与页面之间没有传递路径。

## 期望行为

1. 桌面端点击“创建工作区”时打开系统原生目录对话框；选中目录后，侧栏出现该工作区并切换到它。
2. POST `/hub/workspaces` 的 `path` 是绝对路径；`<hub home>/state/workspaces.json` 中该行写入绝对 `path`。
3. 任意目录都能添加，包括不在“host folder 父目录”和“已知工作区父目录”范围内的目录。
4. 取消对话框不新增行、不显示错误提示。
5. 连续点击“创建工作区”每次都能重新打开对话框，不需要重启；不会再出现 `File picker already active`。
6. 重启桌面端后工作区仍在；再次添加同一个目录不会产生重复行。
7. 浏览器分支保持现状：仍然使用 `showDirectoryPicker()`，仍然只拿到目录名；`unsupported` 与“取消”语义不变。
8. 桌面桥不可用时回退：普通浏览器没有 `window.contextHub.desktop`，走浏览器分支；旧桌面壳存在 `desktop` 但没有 `pickFolder` 时，也走浏览器分支。
9. 对话框打开期间的重复 IPC 调用复用同一个 Promise，不打开第二个对话框，也不让第二次调用直接报错。

## 已确认事实

以下均为本次读取代码、类型声明或配置得到的事实。

- 侧栏 `create()` 在 `apps/web/src/components/workspace-group.tsx:139-152`；`pickFolder()` 调用在 `:140`，`add(picked.name)` 在 `:151`。`null`（取消）在 `:142-145` 直接返回，`"unsupported"` 在 `:146-149` 显示文案。
- `PickedFolder` 当前是 `{ name: string } | "unsupported" | null`（`apps/web/src/lib/folder-picker.ts:17`）。
- `pickFolder()` 当前用 `window.showDirectoryPicker`（`apps/web/src/lib/folder-picker.ts:25-30`），catch 吞掉所有错误（`:31-34`）。
- `locate()` 在 `packages/core/src/host/workspaces-fs.ts:213-232`；绝对路径分支在 `:214-216`；按名字查找的根目录在 `foldersNamed()`（`:186-205`）。
- `WorkspaceStore.add()` 契约在 `packages/core/src/workspace.ts:94-100`；`folderId(folder) = folder.path ?? folder.name` 在 `:157-159`；`workspaceName(path)` 在 `:167-170`，已有 Windows 路径测试（`packages/core/__test__/workspaces.test.ts:253-255`）。
- `createWorkspaceHandler` 的 `add` 分支在 `packages/core/handlers.ts:590-593`；`openWorkspaceStore` 在 `:524-536`。
- 桌面桥通道与接口在 `apps/desktop/src/bridge.ts:9-26`、`:47-55`；当前方法只有 `info` / `updateState` / `update` / `onMenuAction` / `subscribe`。
- preload 实现在 `apps/desktop/src/preload.ts:22-42`，用 `ipcRenderer.invoke` 调用主进程；`contextBridge.exposeInMainWorld("contextHub", { desktop })` 在 `:44`。
- 主进程的 `APP_MENU_CHANNEL` handler 在 `apps/desktop/src/main.ts:465-503`，其中 `event.sender !== window.webContents` 的校验在 `:470-476`，可作为新 IPC 的写法参照。`dialog` 已在 `:19` 从 `electron` 导入。
- 渲染端镜像 `DesktopBridge` 在 `apps/web/src/lib/desktop.ts:31-38`；`desktopBridge()` 在 `:47-49`，是唯一读取 `window.contextHub?.desktop` 的入口。
- 本机 Electron 版本是 `44.9.0`（`apps/desktop/node_modules/electron/package.json`）。已安装的类型声明里：
  - `dialog.showOpenDialog(window: BaseWindow, options: OpenDialogOptions): Promise<OpenDialogReturnValue>` 在 `apps/desktop/node_modules/electron/electron.d.ts:8243`；
  - `OpenDialogOptions.properties` 包含 `openDirectory`，在 `:23674`；
  - `OpenDialogReturnValue` 是 `{ canceled: boolean; filePaths: string[] }`，在 `:23689-23698`。
- 现有测试：`apps/web/__test__/folder-picker.test.ts:31-51` 覆盖 unsupported / 成功 / 取消三分支；`packages/core/__test__/workspaces.test.ts:59-63` 覆盖绝对路径添加，`:87-90` 覆盖不存在的目录，`:113-139` 覆盖按名字查找；`apps/web/__test__/bridge.test.ts:140-163` 通过真实 HTTP 覆盖 `add`。
- 脚本：根 `package.json:6-16`；桌面端 `apps/desktop/package.json:9-19`；web `apps/web/package.json:6-15`。
- 桌面 dev watcher 在 `apps/desktop/dev.ts:245-257` 监听 main/preload 的 esbuild 输出并在重建后重启 Electron；页面源码由 Vite 提供（同文件 `:9-13`）。`apps/web/dev.ts:41-45` 启动 hub server 子进程。
- `CONTEXT_HUB_HOME` 的解析在 `packages/core/src/host/home.ts:10-15`。
- dev 形态的 host folder 是仓库根：`apps/web/dev.ts` 的 hub server cwd 是 `apps/web`，`hostFolder()` = `projectRoot(process.cwd())`（`packages/core/src/host/fs-browse.ts:26-41`），会向上找到本仓库的 `.git`。`foldersNamed()` 因此会把 `D:\work-space` 当作一个查找根。
- dev watcher 在 `apps/desktop/dev.ts:228-233` 会复用已经在 `DEV_APP_PORT`（5271）上运行的 web dev server；如果复用，`CONTEXT_HUB_HOME` 的隔离不会生效。

## 方案评估

保留 `showDirectoryPicker()` 不可行：它在 Electron 里没有公开 API 清除“已有 picker 活跃”的状态，而且即使第一次成功，返回值也只有目录名，无法满足“任意目录”的需求。用户已明确要求不要为了省事保留它。

评估过的替代方案：

- **`<input type="file" webkitdirectory>` + `webUtils.getPathForFile`**：需要再引入一个 preload API；选中空目录时拿不到可靠的文件项；语义是“选文件”而不是“选目录”。放弃。
- **让用户粘贴路径**：不是系统对话框流程，用户体验与现有入口不一致。放弃。
- **新增原生 IPC 调用 `dialog.showOpenDialog`**：复用现有 `DesktopBridge` 模式，返回绝对路径，服务端已经支持。改动面最小，选它。
- **让主进程直接写 `workspaces.json` 或直接 POST hub 路由**：会绕过页面的 workspace service，失败提示和列表刷新都要在 main 里再做一份，耦合更大。放弃。

## 设计决定

### 1. 新 IPC 通道与桥方法

`apps/desktop/src/bridge.ts`：

```ts
/** Renderer → main: ask the carrier for a folder, answered with its path. */
export const PICK_FOLDER_CHANNEL = "context-hub:pick-folder"
```

`DesktopBridge` 增加：

```ts
/** Ask the carrier for a folder; its absolute path, or null when dismissed. */
pickFolder(): Promise<string | null>
```

通道常量放在 `bridge.ts`，main 和 preload 都 import 同一个值，两边不会拼错。`apps/web/src/lib/desktop.ts` 只需要镜像方法，不需要通道常量。preload 仍然只暴露这个方法，不把 `ipcRenderer` 交给页面。

### 2. 主进程处理器

在 `apps/desktop/src/main.ts` 的模块级状态里增加一个“正在进行的目录请求”：

```ts
/** The folder dialog in flight, so a second ask joins it instead of opening another. */
let picking: Promise<string | null> | null = null
```

在 `app.whenReady()` 里与现有 handler 一起注册：

```ts
ipcMain.handle(PICK_FOLDER_CHANNEL, (event): Promise<string | null> | null => {
  if (
    window === null ||
    window.isDestroyed() ||
    event.sender !== window.webContents
  ) {
    return null
  }
  if (picking !== null) return picking

  const target = window
  const pending = dialog
    .showOpenDialog(target, { properties: ["openDirectory"] })
    .then(({ canceled, filePaths }) => (canceled ? null : (filePaths[0] ?? null)))
    .catch(() => null)
    .finally(() => {
      picking = null
    })
  picking = pending
  return pending
})
```

判断：

- **sender 校验**沿用 `APP_MENU_CHANNEL` 的写法（`main.ts:470-476`），只接受当前窗口的 WebContents。
- **只用一个 in-flight Promise** 是最小做法。窗口被模态对话框遮住时正常 UI 不会产生第二次点击；这个判断兜住的是程序化重复调用或极短时间内的重复 invoke。复用同一个 Promise 比“直接返回 `null`”更好：两个调用方得到同一个答案，不会出现一个成功、一个被当成取消。
- `dialog.showOpenDialog` 失败时 `.catch(() => null)`，保证 IPC 的契约始终是 `string | null`，不会把 rejection 抛回页面。页面的 catch 仍然保留，用于“handler 没注册”这类传输错误。
- 不设置 `title`、`defaultPath`、`buttonLabel`，使用系统默认文案；不添加 `multiSelections`、`createDirectory` 等属性。本次只解决“选一个目录并拿到路径”。

### 3. 渲染端优先使用桌面桥

`apps/web/src/lib/folder-picker.ts` 改成：

```ts
import { workspaceName } from "@context-hub/core/workspace"

import { desktopBridge } from "./desktop"

/** The picker Chromium exposes; other browsers leave it out. */
type DirectoryPicker = () => Promise<FileSystemDirectoryHandle>

/** What the dialog answered: a folder, a dismissal, or no dialog at all. */
export type PickedFolder = { name: string; path?: string } | "unsupported" | null

export async function pickFolder(): Promise<PickedFolder> {
  const bridge = desktopBridge()
  if (bridge !== undefined && typeof bridge.pickFolder === "function") {
    try {
      const path = await bridge.pickFolder()
      return path === null ? null : { name: workspaceName(path), path }
    } catch {
      /* The native dialog could not answer; report it as a dismissal rather
         than falling back to the page's own picker, which the desktop carrier
         cannot open twice. */
      return null
    }
  }

  const pick = (window as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker
  if (pick === undefined) return "unsupported"
  try {
    const handle = await pick()
    return { name: handle.name }
  } catch {
    return null
  }
}
```

- `bridge.pickFolder` 用 `typeof ... === "function"` 判断，覆盖“旧桌面壳只有 info/update/menu”的情况；缺方法时走浏览器分支。
- 桌面分支仍然填 `name`（`workspaceName(path)`），保持 `PickedFolder` 的形状；侧栏有 `path` 时用 `path`，服务端 `add` 会自己再算一次工作区名。
- 桌面桥 rejection 不回退到浏览器分支：在 Electron 里那正是会卡住的 picker。这里把它当成“取消”处理，与现有浏览器分支的错误处理一致。这个“静默”是已知风险，见后文。
- 浏览器分支逐字保持现有逻辑，不改变 `unsupported` 和取消语义。
- 文件头和 `PickedFolder` 的注释要改：浏览器只报告目录名；桌面载体能报告绝对路径。

### 4. 侧栏把路径交给 hub

`apps/web/src/components/workspace-group.tsx` 只改一行：

```ts
setNotice(await add(picked.path ?? picked.name))
```

同时更新 `create()` 上方 `:133-138` 的注释：桌面壳可以报告路径；浏览器仍只报告名字，服务端按名字在已知目录旁查找。

### 5. 测试

`apps/web/__test__/folder-picker.test.ts`：

- 保留现有三条浏览器分支用例。
- 新增：桌面桥返回 `"D:\\work\\marketing-site"` → `{ name: "marketing-site", path: "D:\\work\\marketing-site" }`。
- 新增：桌面桥返回 `null` → `null`。
- 新增：桌面桥存在但没有 `pickFolder` → 回退到 `showDirectoryPicker`，返回 `{ name }`。
- 新增：桌面桥 reject → `null`（不把 rejection 抛给 `void create()`）。
- 测试仍然用 `withWindow()` 替身，不引入 DOM 或组件测试。

## 受影响文件

| 文件 | 改动 |
| --- | --- |
| `apps/desktop/src/bridge.ts` | 新增 `PICK_FOLDER_CHANNEL`；`DesktopBridge.pickFolder()` |
| `apps/desktop/src/preload.ts` | 暴露 `pickFolder`，通过 `ipcRenderer.invoke(PICK_FOLDER_CHANNEL)` |
| `apps/desktop/src/main.ts` | 注册 `PICK_FOLDER_CHANNEL` handler；sender 校验；单 in-flight Promise；`dialog.showOpenDialog` |
| `apps/web/src/lib/desktop.ts` | 镜像 `DesktopBridge.pickFolder()` |
| `apps/web/src/lib/folder-picker.ts` | 桌面桥优先；`PickedFolder` 增加可选 `path`；注释更新 |
| `apps/web/src/components/workspace-group.tsx` | `add(picked.path ?? picked.name)`；注释更新 |
| `apps/web/__test__/folder-picker.test.ts` | 桌面桥返回路径 / 取消 / 旧桥回退 / reject 四条用例 |

不需要改动：

- `packages/core/src/host/workspaces-fs.ts`、`packages/core/src/workspace.ts`、`packages/core/handlers.ts`：绝对路径已经支持。
- `apps/web/src/lib/workspaces.ts`：`add(path)` 的参数本来就叫 `path`，HTTP body 也是 `path`。
- `packages/resources/skills/src/add-skill-dialog.tsx`：另一个 `showDirectoryPicker` 用法，本次只在风险里记录。
- `package.json`、`vitest.config.ts`、`electron-builder.config.mjs`：不需要新依赖或新测试项目。

## 阶段一：桌面端暴露原生目录选择

**目标**：主进程能安全地打开系统目录对话框并返回绝对路径；preload 把 `pickFolder()` 暴露给页面。此阶段页面还不调用它，运行时行为不变。

**改动文件**

- `apps/desktop/src/bridge.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/main.ts`

**具体步骤**

1. `bridge.ts`：
   - 在 `DESKTOP_INFO_CHANNEL` 附近新增 `PICK_FOLDER_CHANNEL = "context-hub:pick-folder"`。
   - `DesktopBridge` 增加 `pickFolder(): Promise<string | null>`，注释写明“绝对路径，取消时为 null”。
2. `preload.ts`：
   - 从 `./bridge.ts` 的 import 列表加入 `PICK_FOLDER_CHANNEL`。
   - `desktop` 对象加入 `pickFolder: () => ipcRenderer.invoke(PICK_FOLDER_CHANNEL) as Promise<string | null>`。
3. `main.ts`：
   - import 列表加入 `PICK_FOLDER_CHANNEL`。
   - 模块级状态加入 `picking`。
   - 在 `app.whenReady()` 的现有 `ipcMain.handle` 附近注册新 handler，按“设计决定 2”实现。
   - 不改现有 `DESKTOP_INFO_CHANNEL` / `UPDATE_*` / `APP_MENU_CHANNEL` / `WINDOW_*` 的行为。

**验收判据**

```bash
pnpm --filter @context-hub/desktop typecheck
pnpm --filter @context-hub/desktop lint
pnpm --filter @context-hub/desktop build
grep -c "context-hub:pick-folder" apps/desktop/dist/main.cjs apps/desktop/dist/preload.cjs
pnpm exec vitest run --project desktop
```

期望：

- typecheck、lint、desktop 测试全绿；
- `grep -c` 对 `main.cjs` 和 `preload.cjs` 各输出一个非零数字（esbuild 不做 minify，字符串应各出现一次）；
- 此阶段 `pnpm dev:desktop` 的“创建工作区”仍是旧行为，这是预期的，阶段三才切换页面调用。

## 阶段二：渲染端优先使用桌面桥并补测试

**目标**：`pickFolder()` 在桌面载体里返回 `{ name, path }`，在浏览器里保持原样；旧桌面壳没有 `pickFolder` 时回退到浏览器分支。

**改动文件**

- `apps/web/src/lib/desktop.ts`
- `apps/web/src/lib/folder-picker.ts`
- `apps/web/__test__/folder-picker.test.ts`

**具体步骤**

1. `desktop.ts`：在镜像 `DesktopBridge` 里加入 `pickFolder(): Promise<string | null>`。只加类型，不加 hook。
2. `folder-picker.ts`：按“设计决定 3”实现；import `workspaceName` 和 `desktopBridge`；更新文件头与 `PickedFolder` 注释。
3. `folder-picker.test.ts`：
   - 更新文件头，说明现在覆盖“桌面原生对话框或浏览器对话框”；
   - 新增四条用例：桌面返回路径、桌面返回 `null`、旧桥缺方法回退、桌面 reject 返回 `null`；
   - 现有三条用例不改断言。
4. 不修改 `workspace-group.tsx`；此阶段侧栏仍传 `picked.name`。

**验收判据**

```bash
pnpm exec vitest run --project web folder-picker
pnpm exec vitest run --project web
pnpm --filter web typecheck
pnpm --filter web lint
```

期望：

- `folder-picker` 的新旧用例全部通过；
- 整个 web project 的测试通过，没有因为 `desktop.ts` 的类型扩展而失败；
- typecheck、lint 通过。

此阶段结束时桌面端仍然加不了任意目录，因为侧栏还在用 `picked.name`；仓库可运行，后续阶段只改一处调用。

## 阶段三：侧栏传路径并完成端到端验收

**目标**：桌面端“创建工作区”真正把绝对路径交给 hub；连续点击可用；工作区持久化。

**改动文件**

- `apps/web/src/components/workspace-group.tsx`
- 可选：`docs/memory.md`（如果验收暴露了新的可复用教训）

**具体步骤**

1. `workspace-group.tsx:151` 改为 `setNotice(await add(picked.path ?? picked.name))`。
2. 更新 `create()` 上方注释（`:133-138`）：桌面壳能报告路径，浏览器仍只报告名字。
3. 跑下方“验证命令”里的 scoped 检查。
4. 按下面的手工步骤做真实 Electron 验收。
5. 代码稳定后按 `AGENTS.md` 调用一次 `aoci_maintain`，只维护本任务涉及的文件。本次规划会话里 AOCI MCP 未连接；实施会话如果仍不可用，如实报告，不要手工编辑 `aoci.txt`。

**手工验收（dev 形态）**

先准备一个隔离的 hub home 和一个“不在已知查找根下”的目录。不要使用用户真实的 `~/.context-hub`：

```bash
TMP="$(node -p 'require("node:path").join(require("node:os").tmpdir(), "context-hub-folder-picker-check")')"
# 本任务专用临时目录，先清掉上一次的残留
rm -rf "$TMP"
mkdir -p "$TMP/hub-home" "$TMP/picked-outside"
CONTEXT_HUB_HOME="$TMP/hub-home" pnpm dev:desktop
```

启动日志必须是 `desktop dev: starting the web dev server`。如果出现 `desktop dev: reusing the dev server on port 5271`，说明有一个已存在的 dev server 被复用，`CONTEXT_HUB_HOME` 的隔离不成立；先停掉自己启动的那台 dev server，再重跑。也不要在当前 shell 里设置 `CONTEXT_HUB_DEV_URL`：`apps/desktop/dev.ts:36-37` 读取它，`:227-243` 会因此跳过自带的 web dev server，隔离同样不成立。不要按端口或进程名杀未知进程。

在弹出的 Electron 窗口里：

1. 点击“创建工作区”，确认打开的是系统原生目录对话框（不是页面内的 picker）。
2. 选择 `D:\work-space\dsh-context-hub`（用户报告的实际例子），确认侧栏出现该行并成为当前工作区。
3. 再点一次“创建工作区”，选择 `$TMP/picked-outside`。这个目录的父目录不在 `foldersNamed()` 的查找根里，旧代码按名字一定找不到，是能区分“修好”和“碰巧找到”的用例。
4. 再点一次“创建工作区”，直接取消。确认没有新增行，也没有错误提示。
5. 取消后立刻再点一次，确认对话框仍能打开。这是第二个症状的直接验收。
6. 检查落盘：

```bash
node -e 'const fs=require("node:fs"); const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); for (const f of s.folders) console.log(JSON.stringify({name:f.name,path:f.path,default:f.default===true})); console.log("current", s.current)' "$TMP/hub-home/state/workspaces.json"
```

期望本次新增的两行（仓库与 `picked-outside`）都有绝对 `path`（Windows 下是 `D:\\...` 这类 JSON 转义形式），`current` 指向最后添加的那一行；再次添加同一个目录不会产生重复行。

7. 退出 Electron，重新执行同一个 `CONTEXT_HUB_HOME=... pnpm dev:desktop`，确认两行仍在。有托盘时窗口关闭只是隐藏（`main.ts:265-271`），要用托盘菜单的退出项或 Ctrl-C 停掉 watcher；收尾只停自己启动的 watcher。

**手工验收（构建形态，发布前建议做）**

dev 形态已经能覆盖 main/preload 与页面源码；构建形态再证明一次静态页面 + 打包后的 preload：

```bash
pnpm --filter web build
pnpm --filter @context-hub/desktop build
cd apps/desktop
CONTEXT_HUB_HOME="$TMP/hub-home" pnpm exec electron --user-data-dir="$TMP/profile" .
```

重复上面的步骤 1-3、5-7；其中步骤 3 先 `mkdir -p "$TMP/picked-built"`，改选这个新目录，确认真实新增一行（而不是只切换到已存在的行）。`--user-data-dir` 使用临时目录，避免与正在运行的 dev 实例争单实例锁；如果仍然启动到已有窗口，先停掉 dev watcher，不要杀未知进程。

**验收判据**

```bash
grep -n "add(picked.path ?? picked.name)" apps/web/src/components/workspace-group.tsx
pnpm --filter web typecheck
pnpm --filter web lint
pnpm exec vitest run --project web --project core
```

期望：

- `grep` 命中 `workspace-group.tsx:151`；
- typecheck、lint、web/core 测试全绿；
- 手工步骤 1-7 全部观察到预期结果；
- 如果环境跑不了 Electron，明确记录“桌面端未验证”并保留上面的命令，不要用浏览器结果冒充。

## 验证命令

日常迭代（范围最小）：

```bash
pnpm exec vitest run --project web folder-picker
pnpm --filter web typecheck
pnpm --filter @context-hub/desktop typecheck
```

阶段验收（完整）：

```bash
pnpm exec vitest run --project web
pnpm exec vitest run --project core
pnpm exec vitest run --project desktop
pnpm --filter web typecheck
pnpm --filter @context-hub/desktop typecheck
pnpm --filter web lint
pnpm --filter @context-hub/desktop lint
pnpm --filter @context-hub/desktop build
```

说明：

- `web`、`core`、`desktop` 是根 `vitest.config.ts:16-31` 里注册的 project 名。
- 本次不改 core/server 的 HTTP 契约，变更集中在 desktop 的 main/preload 与 web 侧适配；不需要跑根 `pnpm typecheck` / `pnpm lint` 的全仓 turbo，如果实施时顺手改了别的包，再补全仓检查。
- `apps/desktop/vitest.config.ts:4-6` 明确说 desktop 只测纯函数，窗口和子进程需要真实 Electron；新 IPC 的覆盖只能靠手工验收。

## 不做

- 不改服务端 `locate()`、`foldersNamed()`、`WorkspaceStore.add()` 或 `createWorkspaceHandler` 的行为；绝对路径已经支持，浏览器按名字查找的语义也保持。
- 不改服务端现有注释和 JSDoc：它们描述的是浏览器分支，`add` 的契约已经同时接受 path 和 name。
- 不保留 Electron 里的 `showDirectoryPicker` 路径；桌面载体一律走原生 IPC。
- 不改浏览器分支的返回形状、`unsupported` 文案或“取消即静默”的语义。
- 不改 `packages/resources/skills/src/add-skill-dialog.tsx` 的 `showDirectoryPicker` 用法；它在 Electron 里仍会遇到同样的问题，作为后续任务。
- 不新增“选择文件”、多选、创建目录、最近目录记忆、默认目录或路径输入框。
- 不重构现有 `info` / `update` / `updateState` / `onMenuAction` / 菜单 / 窗口 IPC；不添加通用 IPC 白名单。
- 不引入依赖，不添加 jsdom / testing-library / 组件测试。
- 不改 `workspaces.json` 格式、默认工作区语义、重命名/删除行为或侧栏样式。
- 不手工编辑 `aoci.txt` 或 `.aoci`；认知维护只通过 `aoci_maintain` / `aoci_update_entry`。
- 不在用户明确批准前实施代码，也不提前归档本计划。

## 风险、回滚与待验证

**风险**

- **dev 验收可能“假通过”**：dev 形态的 `hostFolder()` 是仓库根（`fs-browse.ts:26-41`），`foldersNamed()` 会把 `D:\work-space` 当作查找根，所以选择 `D:\work-space\dsh-context-hub` 时旧代码也可能按名字找到。必须再用 `$TMP/picked-outside` 这种父目录不在查找根里的目录做判别用例。
- **dev 端口复用会破坏隔离**：`apps/desktop/dev.ts:228-233` 会复用已在 5271 上运行的 dev server。如果复用，`CONTEXT_HUB_HOME` 不会传给那台服务，落盘检查会看错文件。启动日志必须确认是 `starting the web dev server`。
- **IPC 错误仍然静默**：桌面桥 reject 时 `pickFolder()` 返回 `null`，界面按“取消”处理，不会提示。这是为了保持最小改动和现有浏览器语义；如果后续需要区分“取消”和“载体故障”，要扩展 `PickedFolder` 并给侧栏加错误提示，属于单独任务。
- **旧桌面壳没有 `pickFolder`**：会回退到 `showDirectoryPicker`，也就是旧的坏路径。正常发行版里页面与 preload 同包构建，不会出现；dev 形态如果看到旧行为，检查 watcher 是否重建了 preload，必要时重启 `pnpm dev:desktop`。
- **preload 与 main 版本不匹配**：如果 preload 暴露了 `pickFolder` 但 main 没注册 handler（例如只重建了一半），`ipcRenderer.invoke` 会 reject，`folder-picker` 同样按取消处理，用户看不到对话框。确认 `pnpm dev:desktop` 的日志里 main/preload 都已重建并重启 Electron；发布构建里两者总是同一批产物。
- **macOS / Linux 未验证**：本次环境是 Windows；`openDirectory` 在 macOS 上是目录选择面板，在 Linux 上依赖桌面环境。实现后至少要在目标平台手工点一次。
- **没有 main/preload 的自动化测试**：`apps/desktop/vitest.config.ts` 只测纯函数。新 handler 的 sender 校验、取消返回、并发复用只能靠真实 Electron 验收。
- **重复调用会触发两次 `add`**：两个 `create()` 共享同一个对话框 Promise，选中目录后两边都会 `add`；服务端 `add` 对相同路径是幂等的（`workspaces-fs.ts:297-301`），不会产生重复行，但会写两次相同的文档。正常 UI 下窗口被模态对话框遮住，不会发生；这里不额外做按钮禁用。
- **AOCI 认知会过期**：`aoci.code.txt` 里 `folder-picker.ts`、`bridge.ts`、`preload.ts` 的条目描述的是旧行为。实现稳定后要调用一次 `aoci_maintain`；本次规划会话 AOCI MCP 未连接，实施会话需重试并如实报告。
- **skills 的 picker 仍是坏的**：`add-skill-dialog.tsx` 在桌面端仍可能遇到 `File picker already active`，本次不修。

**回滚**

- 代码回滚本计划的七个文件即可。新通道是增量；旧页面不会调用它。
- 只回滚主进程 handler 而保留页面新代码，会让 `pickFolder()` 的 invoke reject，`folder-picker` 按取消处理，用户点“创建工作区”没有对话框。因此两侧要一起回滚。
- `workspaces.json` 不需要迁移：新写入的绝对路径行旧版本也能读取（`readWorkspaceState` 接受 `path`，`locate` 接受绝对路径）；旧页面仍然按名字添加新行。

**待验证（实现时必须实测）**

- 用户的 `NotAllowedError` 探针本次没有重跑；实现后通过“取消后再次点击仍能打开原生对话框”验证旧路径已经不再被桌面端使用。
- `dialog.showOpenDialog` 在 Windows 上取消时返回 `canceled: true` 且 `filePaths` 为空；类型声明已确认形状，运行时由手工验收确认。
- `pnpm dev:desktop` 是否真的在 main/preload 改动后自动重启 Electron；`apps/desktop/dev.ts:245-257` 的 watcher 预期如此，验收时检查 `desktop dev: restarting Electron` 日志。若没有，手动重启 watcher，不要靠猜测。
- 构建形态的 Electron 能否在当前环境启动并加载 `apps/web/dist`；跑不了就如实标注未验证。
- AOCI MCP 在实施会话是否可用；不可用就只报告，不写入。

## 自审

**事实（已读代码/类型/配置核对）**

- 所有行号、函数名、文件路径、通道名、测试位置均来自本次读取。
- `WorkspaceStore.add` 已支持绝对路径；本次不需要改 core/server。
- `pickFolder` 的唯一调用方是 `workspace-group.tsx`；`PickedFolder` 只在 `folder-picker.ts` 定义；`DesktopBridge` 只有 `apps/desktop/src/bridge.ts` 与 `apps/web/src/lib/desktop.ts` 两个声明，preload 是唯一实现。扩展类型不会漏掉调用方。
- Electron 44.9.0 的 `showOpenDialog` / `openDirectory` / `OpenDialogReturnValue` 已在安装的 `electron.d.ts` 中核对。
- `CONTEXT_HUB_HOME` 的解析、dev server 的端口复用、dev 形态 host folder 是仓库根，这三条事实直接影响验收步骤，不是推测。

**判断（可被用户推翻）**

- 并发调用复用同一个 Promise，而不是直接返回 `null`：两个调用方得到同一个答案，行为更容易解释。
- 桌面桥 reject 按“取消”处理，不回退到浏览器 picker：在 Electron 里回退就是回到已知会卡住的实现。
- 旧桌面壳缺 `pickFolder` 时回退到浏览器分支：这是唯一可用的旧路径，但会保留旧 bug；由于页面与 preload 同包发布，正常不会出现。
- 新增的测试不渲染组件，只测 `pickFolder` 的适配逻辑：仓库的 `apps/web` 测试是 node 环境，现有测试也没有 DOM 栈。
- 手工验收把 `$TMP/picked-outside` 作为判别用例，而不是只选 `D:\work-space\dsh-context-hub`：后者在 dev 形态下可能被旧的名字查找碰巧找到。

**自审中确认或补上的点**

- dev 形态的 host folder 是仓库根，`D:\work-space` 本身是查找根；验收必须加入 `$TMP/picked-outside` 这个能区分旧名字查找的用例，否则“加了仓库目录”会假通过。
- dev watcher 会复用 5271 上已有的 web dev server，且 `CONTEXT_HUB_DEV_URL` 会跳过自带的 dev server；验收前必须确认隔离 home 真的生效，否则落盘断言会看错文件。
- 阶段二结束时桌面端仍然会失败，因为侧栏还在用 `picked.name`；验收判据必须区分“适配器测试通过”和“用户流程修好”。
- 桌面桥 reject 时仍然静默；把“区分取消与载体故障”列为独立后续，不让它悄悄扩大本次范围。
- 旧桌面壳回退到浏览器分支会保留旧 bug；由于页面与 preload 同包发布，正常不会出现，但计划里写清楚，避免声称所有情况都修好了。
- 服务端不需要改动；避免顺手重构 `locate()` / `foldersNamed()` 或改它们的注释。
