# 桌面端自动更新与开发回路实施计划

## 背景与现状

本仓桌面端目前只有最小外壳：

- `apps/desktop/src/main.ts`（222 行）负责 utilityProcess 起 hub server、解析 stdout 里的地址、开窗口、托盘与退出。当前 `before-quit` 同步 `server?.kill()`（`main.ts` 第 204-209 行），没有优雅停止协议。
- `apps/desktop/build.ts` 用 esbuild 一次性构建两个 bundle：`dist/server.mjs`（ESM，入口 `../web/server.ts`）与 `dist/main.cjs`（CJS，external 只有 `electron`）。
- `apps/desktop/electron-builder.yml` 只有 Windows NSIS、macOS dmg、Linux AppImage；没有 publish、没有更新元数据、没有签名/公证。
- `apps/desktop/__test__/server-output.test.ts` 只覆盖 `serverUrlFrom`。
- `apps/web/server.ts` 第 24 行从 `apps/web/package.json` 读版本，第 110-114 行传给 About；第 143-147 行只处理 SIGINT/SIGTERM。
- `apps/web/dev.ts` 用固定端口 5270/5271，hub server 作为真实子进程；`CONTEXT_HUB_DEV_URL` 可让桌面端跳过 server 直接加载 Vite。
- `.github/workflows/release.yml` 用 `electron-builder --publish never`，只上传 `.exe` / `.dmg` / `.AppImage`，并在第 48 行写死 grep `0.0.1`。
- 根 `package.json`、`apps/web/package.json`、`apps/desktop/package.json` 当前都是 `0.0.1`。
- 根 `vitest.config.ts` 已登记 `apps/desktop/vitest.config.ts` 与 `apps/web/vitest.config.ts`；桌面端测试只收集 `__test__/**/*.test.ts`。

已核实的外部事实（实施时仍以实际安装版本为准）：

- registry 当前版本：`electron-updater@6.8.9`、`electron@44.9.0`、`electron-builder@26.15.3`。
- electron-updater 的 macOS 更新只认 `.zip`（`MacUpdater.ts` 排除 pkg/dmg；找不到 zip 报 `ERR_UPDATER_ZIP_FILE_NOT_FOUND`）。当前 mac target 只有 dmg。
- electron-builder 支持 `--config <path>` 显式指定 JS/MJS 配置；`mac.notarize` 需要显式 `true`，Apple ID 凭证来自 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`；签名凭证来自 `CSC_LINK` / `CSC_KEY_PASSWORD`。
- electron-builder 在 `--publish never` 下仍会写 `latest*.yml` 与资源目录里的 `app-update.yml`（Context7 的 electron-builder 文档与 `PublishManager` 说明一致）。
- Electron utilityProcess 子进程可用 `process.parentPort.on("message", e => ...)`，主进程用 `child.postMessage(...)`。

本计划只改桌面端、版本来源、发布配置与相关文档；不改业务页面、路由、数据存储。

## 关键决策

1. **版本唯一来源是根 `package.json` 的 `version`。**
   - `apps/web/server.ts` 改为 `import manifest from "../../package.json" with { type: "json" }`。JSON import 在 Node 源码、esbuild bundle、Bun 编译三种形态都由打包器内联。
   - `apps/desktop/electron-builder.config.mjs` 从根 `package.json` 读版本，写入 `extraMetadata.version`，让安装包、`app.getVersion()`、更新 feed 使用同一个值。
   - `apps/desktop/package.json` 的 `version` 保留，作为开发形态 `app.getVersion()` 的镜像；新增测试断言它与根版本一致。它不是可编辑来源，只是镜像。
   - `apps/web/package.json` 的 `version` 不再被任何代码读取；保留字段但不参与用户可见版本。
   - **不**改 `apps/web/src/components/extension-detail-dialog.tsx` 第 129 行的 `manifest.version`：那是扩展自己的清单版本，不是应用版本。

2. **删除 `apps/desktop/electron-builder.yml`，只保留 `apps/desktop/electron-builder.config.mjs`。**
   - JS 配置是唯一打包配置来源，避免 yml 与 mjs 两份配置分叉。
   - 所有脚本与 workflow 显式传 `--config electron-builder.config.mjs`。
   - 脚本不再在 CLI 重复写 target（`--mac dmg` 会覆盖配置里的 zip），改为 `electron-builder --win|--mac|--linux`，target 只写在配置里。

3. **自动更新只使用 `electron-updater`，不引入 electron-log。**
   - 只有 `app.isPackaged` 且 `resources/app-update.yml` 存在时启用。
   - `autoDownload = false`、`autoInstallOnAppQuit = false`、`allowPrerelease = false`。
   - 启动后延迟检查一次，之后每 4 小时检查；手动检查从菜单/托盘触发。
   - 自动检查失败只写 console；手动检查失败弹窗；同一版本不重复询问。
   - 下载完成先在询问重启，确认后先 `stopServer()` 再 `quitAndInstall(true, true)`。

4. **主进程 bundle 把 `electron-updater` 标为 external。**
   - 理由：走 electron-builder 的标准生产依赖复制路径，避免把更新器的动态 require 打进 bundle。
   - 判据：`pnpm --filter @context-hub/desktop package:win` 后启动 `win-unpacked/Context Hub.exe`，主进程能加载且菜单出现。如果报 `Cannot find module 'electron-updater'`，改为 esbuild 内联：从 `bundle.ts` 的 `external` 去掉 `electron-updater`，重新打包验证。实施时把实际选择写进 `docs/building.md` 的桌面端依赖说明。

5. **开发回路由 `apps/desktop/dev.ts` 拥有。**
   - `build.ts` 保持一次性构建；esbuild 配置抽到 `bundle.ts`。
   - `dev.ts` watch 两个 bundle，任一成功重建后防抖重启 Electron。
   - 菜单里的 Restart App 在 watcher 下不直接 `app.relaunch()`，而是以退出码 75 退出，由 `dev.ts` 重新 spawn，避免 watcher 失去对 Electron 的控制；直接 `electron .`（无 watcher）时仍用 `app.relaunch()` + `app.quit()`。
   - `CONTEXT_HUB_DEV_URL` 继续原样透传；根 `pnpm dev` 仍会通过 turbo 启动桌面端，不改变这个语义。

6. **优雅停止统一走 `stopServer(timeoutMs)`。**
   - 主进程发 `{ type: "shutdown" }` 给 utility process；server 收到后 `listener.close()` 再 `process.exit(0)`。
   - 3 秒未退出则 `child.kill()`，再等最多 1 秒。退出、重启、安装更新三条路径都调用它。
   - `before-quit` 改为可异步等待；用 `quitting` 标志放行第二次 `before-quit`，避免死锁。
   - 不改 `packages/core` 的 `HubListener.close` 语义。

7. **崩溃日志是纯函数模块，Electron 只负责传路径和元数据。**
   - `app.getPath("logs")` 下写 `crash-<UTC时间>-<source>.log`，含版本、平台、arch、packaged、错误 message/stack、server stderr 尾部（最多 64 KiB）。
   - 只清理匹配 `crash-*.log` 的文件，保留最近 10 个。
   - 主进程保留 server stdout/stderr 的有界尾部缓冲；server 提前退出、15 秒启动超时、页面加载失败、renderer `render-process-gone` 都写日志并在错误对话框里给日志路径与诊断尾部（对话框只放最近 2 KiB）。

## 阶段

### 阶段 1：统一版本来源

**目标**：应用版本只从根 `package.json` 读取；About、安装包、开发形态与更新 feed 不再各读一份。

**改动文件**

- `apps/web/server.ts`
- `apps/web/tsconfig.node.json`（只在需要时补 `shutdown.ts` 的 include，见阶段 4；本阶段可不动）
- `apps/desktop/__test__/version.test.ts`（新增）
- `docs/building.md`（版本说明；完整文档收尾在阶段 6）

**具体做法**

1. 把 `apps/web/server.ts` 第 24 行改为：

   ```ts
   import manifest from "../../package.json" with { type: "json" }
   ```

   更新第 110-113 行注释：版本来自根清单，所有载体在构建期内联。

2. 新增 `apps/desktop/__test__/version.test.ts`：

   ```ts
   import { readFileSync } from "node:fs"
   import { describe, expect, it } from "vitest"

   function manifest(relative: string): { version?: string } {
     return JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8")) as {
       version?: string
     }
   }

   describe("desktop version", () => {
     it("mirrors the root version so the dev app reports the same number", () => {
       const root = manifest("../../../package.json")
       const desktop = manifest("../package.json")
       expect(root.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
       expect(desktop.version).toBe(root.version)
     })
   })
   ```

   路径核对：测试文件在 `apps/desktop/__test__/`，`../../../package.json` 是仓库根，`../package.json` 是 `apps/desktop/package.json`。

3. 不改 `apps/web/package.json` 与 `apps/desktop/package.json` 的 `version` 值（当前都是 `0.0.1`）；后续发布时只把根版本当权威，desktop 镜像由测试守住。

4. 不改 `apps/web/src/components/extension-detail-dialog.tsx` 的 `manifest.version`；它是扩展清单版本。

**验收**

```bash
node -p "require('./package.json').version"
# 预期：0.0.1

pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter @context-hub/desktop test
# 预期：退出码 0；desktop 的 version 测试通过

pnpm --filter web build
node apps/web/server.ts --port 5299 --static apps/web/dist &
SERVER_PID=$!
# 另开一个 shell：
curl -s http://127.0.0.1:5299/hub/about
# 预期：JSON 里的 version 等于 `node -p "require('./package.json').version"`
# 停止：只 kill 自己记录的 $SERVER_PID；不要按端口猜进程
```

补充：如果本机有 `bun`，执行 `pnpm --filter web build:cli bun-windows-x64`，运行 `apps/web/release/cli/context-hub-windows-x64.exe --port 5298`，`curl /hub/about` 的 version 也应等于根版本。没有 Bun 就在汇报里标注“Bun 编译形态未验证”。

**本阶段不做**：不改 desktop 打包配置、不加 electron-updater、不改 workflow。

---

### 阶段 2：迁移打包配置

**目标**：用 `electron-builder.config.mjs` 取代 `electron-builder.yml`，从根版本写 `extraMetadata.version`，配置 GitHub publish 与 macOS zip target，并确保本地 `--publish never` 产出更新元数据。

**改动文件**

- `apps/desktop/electron-builder.config.mjs`（新增）
- `apps/desktop/electron-builder.yml`（删除）
- `apps/desktop/package.json`（`package:win|mac|linux` 脚本）
- `docs/building.md`（打包与已知限制；完整收尾在阶段 6）

**具体做法**

1. 新增 `apps/desktop/electron-builder.config.mjs`，内容按当前 yml 迁移并增加：

   ```js
   import { readFileSync } from "node:fs"

   const root = JSON.parse(
     readFileSync(new URL("../../package.json", import.meta.url), "utf8")
   )

   const notarize =
     Boolean(process.env.CSC_LINK) &&
     Boolean(process.env.APPLE_ID) &&
     Boolean(process.env.APPLE_APP_SPECIFIC_PASSWORD) &&
     Boolean(process.env.APPLE_TEAM_ID)

   export default {
     appId: "com.contexthub.desktop",
     productName: "Context Hub",
     directories: { output: "release" },
     files: ["dist/main.cjs", "assets/*.png"],
     extraResources: [
       { from: "dist/server.mjs", to: "server.mjs" },
       { from: "../web/dist", to: "web" },
     ],
     extraMetadata: { version: root.version },
     publish: [
       { provider: "github", owner: "bb-boy680", repo: "context-hub" },
     ],
     win: { target: ["nsis"] },
     mac: {
       target: ["dmg", "zip"],
       category: "public.app-category.developer-tools",
       ...(notarize ? { notarize: true } : {}),
     },
     linux: { target: ["AppImage"], category: "Development" },
   }
   ```

   - 不设置 `hardenedRuntime`：electron-builder 对签名 darwin 构建默认 `true`，无凭证时不强制打开。
   - `publish` 显式 owner/repo，保证 `app-update.yml` 指向公开仓库。
   - `extraMetadata.version` 让 asar 里的 `package.json` 版本等于根版本。

2. 删除 `apps/desktop/electron-builder.yml`。

3. 修改 `apps/desktop/package.json`：

   ```json
   "package:win": "pnpm --filter web build && node build.ts && electron-builder --win --config electron-builder.config.mjs",
   "package:mac": "pnpm --filter web build && node build.ts && electron-builder --mac --config electron-builder.config.mjs",
   "package:linux": "pnpm --filter web build && node build.ts && electron-builder --linux --config electron-builder.config.mjs"
   ```

   不再在 CLI 写 target；否则 `--mac dmg` 会覆盖配置里的 zip。

4. 不改 `build` 与 `dev` 脚本。

**验收**

```bash
pnpm --filter @context-hub/desktop package:win
# 预期：退出码 0

VERSION=$(node -p "require('./package.json').version")

test -f apps/desktop/release/latest.yml
grep -qF "version: $VERSION" apps/desktop/release/latest.yml
test -f apps/desktop/release/win-unpacked/resources/app-update.yml
grep -q "provider: github" apps/desktop/release/win-unpacked/resources/app-update.yml
grep -q "owner: bb-boy680" apps/desktop/release/win-unpacked/resources/app-update.yml
grep -q "repo: context-hub" apps/desktop/release/win-unpacked/resources/app-update.yml
test -f apps/desktop/release/win-unpacked/resources/server.mjs
test -f apps/desktop/release/win-unpacked/resources/web/index.html
ls apps/desktop/release/"Context Hub Setup $VERSION.exe"
# 预期：以上全部通过；安装包名称包含根版本

node --check apps/desktop/electron-builder.config.mjs
# 预期：无输出，退出码 0
```

如果 `extraMetadata.version` 没有影响安装包文件名或 `latest.yml` 的 version，先检查 electron-builder 实际使用的 appInfo；必要时在配置里显式写 `artifactName: "${productName} Setup ${version}.${ext}"` 并重新验证。不要退回“手工改 `apps/desktop/package.json` 版本作为发布步骤”。

**本阶段不做**：不接 electron-updater、不改 workflow、不配置 mac 签名 secrets。

---

### 阶段 3：建立开发回路

**目标**：`pnpm --filter @context-hub/desktop dev` 变成 watch + 自动重启；`build.ts` 仍只做一次性构建；Ctrl+C 或 Electron 自行退出时不留下孤儿进程。

**改动文件**

- `apps/desktop/bundle.ts`（新增）
- `apps/desktop/build.ts`（改为调用 bundle.ts）
- `apps/desktop/dev.ts`（新增）
- `apps/desktop/src/restart.ts`（新增，退出码常量）
- `apps/desktop/package.json`（`dev` 脚本）
- `apps/desktop/tsconfig.json`（include）
- `docs/building.md`（Development 段落；完整收尾在阶段 6）

**具体做法**

1. 新增 `apps/desktop/bundle.ts`，把 `build.ts` 里的两个 esbuild 配置抽成导出：

   ```ts
   export const serverBuildOptions: BuildOptions = { ... }  // 现有 server.mjs 配置
   export const mainBuildOptions: BuildOptions = { ... }    // 现有 main.cjs 配置
   export async function buildBundles(): Promise<void> {
     await build(serverBuildOptions)
     await build(mainBuildOptions)
   }
   ```

   - `mainBuildOptions.external` 暂时保持 `["electron"]`；阶段 4 再加 `electron-updater`。
   - `absWorkingDir`、`entryPoints`、`outfile`、`banner` 等原样保留。

2. `apps/desktop/build.ts` 改为：

   ```ts
   import { buildBundles } from "./bundle.ts"
   await buildBundles()
   ```

   保持一次性构建行为与输出路径 `dist/main.cjs`、`dist/server.mjs`。

3. 新增 `apps/desktop/src/restart.ts`：

   ```ts
   /** The watcher respawns Electron when the app exits with this code. */
   export const RESTART_EXIT_CODE = 75
   ```

4. 新增 `apps/desktop/dev.ts`：

   - 先 `await buildBundles()`，确保首次启动前两个 bundle 都在。
   - 用 esbuild `context({ ...serverBuildOptions, plugins: [notify] })` 与 `context({ ...mainBuildOptions, plugins: [notify] })` 建立两个 watch；`notify` 在 `onEnd(result)` 里判断 `result.errors.length === 0`。
   - 每个 watcher 的第一次 `onEnd` 只标记就绪，不触发重启；之后成功重建用 250ms 防抖调用 `restartElectron()`。
   - `restartElectron()`：child 为 `null`（尚未启动或已退出）时直接 spawn；若正在重启，置 `queued = true`；否则把当前 child 记为 `restarting = true`，`kill()`，等待退出；退出后 spawn 新 Electron。若 `queued`，spawn 后再重启一次。
   - spawn Electron 使用 `createRequire(import.meta.url)("electron")` 取二进制路径，参数为 `[here]`（等价于 `electron .`，不能只给 `cwd`），`cwd: here`（`apps/desktop`），`stdio: "inherit"`，env 为 `{ ...process.env, CONTEXT_HUB_DEV_WATCH: "1" }`。这样 `CONTEXT_HUB_DEV_URL` 原样透传。
   - child 退出处理：
     - `stopping`：直接结束。
     - `code === RESTART_EXIT_CODE`：spawn 新 Electron，不退出 watcher（菜单 Restart 路径）。
     - `restarting`：spawn 新 Electron。
     - 其他：`await stop()` 关闭 watcher 并以该 code 退出。
   - `stop()`：`stopping = true`；`await context.dispose()`；停 child；`process.exit(code)`。只执行一次。
   - `SIGINT` / `SIGTERM` 调 `stop(0)`。
   - 停 child 先 `child.kill()`，3 秒未退出时：Windows 用 `spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"])`，其他平台 `child.kill("SIGKILL")`。**禁止 `taskkill //IM` / `//T` 按镜像名清场**；只按自己 spawn 的 PID。

5. `apps/desktop/package.json`：

   ```json
   "dev": "node dev.ts"
   ```

   `build`、`start` 不变。根 `pnpm dev` 通过 turbo 仍会启动桌面端，语义不变。

6. `apps/desktop/tsconfig.json` 的 `include` 改为：

   ```json
   "include": ["src", "build.ts", "bundle.ts", "dev.ts", "__test__"]
   ```

7. `docs/building.md` 的 Development 段落补充：dev 会 watch 两个 bundle 并重启 Electron；`CONTEXT_HUB_DEV_URL` 仍可指向 Vite；首次运行前需要 `pnpm --filter web build` 生成 `apps/web/dist`（与现状一致）。

**验收**

```bash
pnpm --filter web build
pnpm --filter @context-hub/desktop build
# 预期：dist/main.cjs 与 dist/server.mjs 都存在

pnpm --filter @context-hub/desktop typecheck
pnpm --filter @context-hub/desktop lint
pnpm --filter @context-hub/desktop test
# 预期：退出码 0
```

手工验证 dev：

1. 后台启动 `pnpm --filter @context-hub/desktop dev`，记录 PID 和日志文件；等待日志出现 `context hub server listening on http://127.0.0.1:<port>`，并确认 Electron 窗口打开。
2. 用 Edit 工具在 `apps/desktop/src/main.ts` 末尾加一行注释，保存；观察：
   - esbuild 重建 `dist/main.cjs`；
   - 旧 Electron 退出、新 Electron 启动；
   - 日志出现新的 server listening 行，页面仍能加载。
   随后删除这行注释。
3. 用 Edit 工具在 `apps/web/server.ts` 末尾加一行注释，保存；观察同样的重启；随后删除。
4. 按 Ctrl+C 或 `kill -INT <dev-pid>`；等待 watcher 退出。用 `tasklist`/`ps` 确认没有该 Electron PID 及其子进程残留；用 `curl` 访问刚才的 server 端口，预期连接失败（`000`）。
5. 可选：先跑 `pnpm --filter web dev`，再用 `CONTEXT_HUB_DEV_URL=http://127.0.0.1:5271 pnpm --filter @context-hub/desktop dev` 启动；确认窗口加载 Vite 页面，且改 main 文件仍会重启 Electron。

清理只按自己记录的 PID/端口；不要按 `electron.exe` 镜像名杀进程。

**本阶段不做**：不加菜单、不加 updater、不改 `apps/web/server.ts` 的退出协议。

---

### 阶段 4：接入优雅停止、菜单与自动更新

**目标**：退出/重启/安装更新三条路径都先优雅停止 server；主进程有原生菜单与托盘入口；打包应用能检查、下载、重启安装更新。

**改动文件**

- `apps/web/shutdown.ts`（新增）
- `apps/web/server.ts`（parentPort + 统一 shutdown）
- `apps/web/__test__/shutdown.test.ts`（新增）
- `apps/web/tsconfig.node.json`（include `shutdown.ts`）
- `apps/desktop/src/main.ts`（stopServer、before-quit、菜单/托盘、启动 updater、重启）
- `apps/desktop/src/menu.ts`（新增）
- `apps/desktop/__test__/menu.test.ts`（新增）
- `apps/desktop/src/update.ts`（新增）
- `apps/desktop/src/restart.ts`（阶段 3 已建，本阶段在 main 中使用）
- `apps/desktop/bundle.ts`（main external 加 `electron-updater`）
- `apps/desktop/package.json`（新增 production dependency）
- `docs/building.md`（自动更新与菜单说明；完整收尾在阶段 6）

**具体做法**

1. 新增 `apps/web/shutdown.ts`：

   ```ts
   export function isShutdownMessage(event: unknown): boolean {
     if (typeof event !== "object" || event === null) return false
     const data = (event as { data?: unknown }).data ?? event
     return (
       typeof data === "object" &&
       data !== null &&
       (data as { type?: unknown }).type === "shutdown"
     )
   }
   ```

   同时接受 `{ type: "shutdown" }` 与 `{ data: { type: "shutdown" } }`（Electron `parentPort` 的 message event 形状）。

2. 修改 `apps/web/server.ts` 第 138-147 行区域：

   ```ts
   type ParentPort = {
     on(event: "message", listener: (event: unknown) => void): void
   }

   const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort
   let closing = false

   async function shutdown(): Promise<void> {
     if (closing) return
     closing = true
     await listener.close()
     process.exit(0)
   }

   if (parentPort !== undefined) {
     parentPort.on("message", (event) => {
       if (isShutdownMessage(event)) void shutdown()
     })
   }

   for (const signal of ["SIGINT", "SIGTERM"] as const) {
     process.on(signal, () => void shutdown())
   }
   ```

   不改 `packages/core` 的 `HubListener.close`。`apps/web/dev.ts` 仍用 `hub.kill()`；它不受 parentPort 分支影响。

3. `apps/web/tsconfig.node.json` 的 `include` 加 `"shutdown.ts"`；`apps/web/__test__/shutdown.test.ts` 覆盖：
   - `{ data: { type: "shutdown" } }` → true
   - `{ type: "shutdown" }` → true
   - `{ data: { type: "other" } }` → false
   - `null` / `"shutdown"` / `{}` → false

4. `apps/desktop/src/menu.ts` 导出纯模板函数，不 import Electron 运行时（只 `import type`）：

   ```ts
   export interface MenuActions {
     openWindow: () => void
     reloadPage: () => void
     checkForUpdates: () => void
     restartApp: () => void
     toggleDevTools: () => void
     quit: () => void
   }

   export function applicationMenuTemplate(options: {
     platform: NodeJS.Platform
     packaged: boolean
     updatesEnabled: boolean
     dev: boolean
     actions: MenuActions
   }): MenuItemConstructorOptions[]

   export function trayMenuTemplate(options: {
     updatesEnabled: boolean
     dev: boolean
     actions: MenuActions
   }): MenuItemConstructorOptions[]
   ```

   - 打包时：`Check for Updates…`（仅 `updatesEnabled`）、`Reload Page`（`CmdOrCtrl+R`）、`Quit`。
   - 开发时额外：`Restart App`、`Toggle DevTools`（`CmdOrCtrl+Shift+I`）。
   - macOS 保留 `role: "appMenu"`、`role: "editMenu"`、`role: "windowMenu"`；自定义的 View 菜单放 Reload/Check/Restart/DevTools。
   - Windows/Linux：File 菜单放 Reload/Check/Restart/Quit，Edit 用 `role: "editMenu"`，View 放 DevTools（开发时）。
   - 托盘：`Open Context Hub`、分隔线、`Check for Updates`（仅启用时）、`Restart`（仅开发时）、分隔线、`Quit`。
   - `Check for Updates…` 在 updater 未启用时省略，不画一个永远失败的菜单项。

5. `apps/desktop/__test__/menu.test.ts`：
   - 打包 win32：包含 `Check for Updates…`、`Reload Page`、`Quit`，不含 `Restart App` / `Toggle DevTools`。
   - 开发 win32：包含 `Restart App`、`Toggle DevTools`，不含 `Check for Updates…`（updatesEnabled=false）。
   - 打包 darwin：含 `appMenu` / `editMenu` / `windowMenu` 角色与 `Check for Updates…`。
   - 托盘：打包含 `Check for Updates`；开发含 `Restart`；始终有 `Open Context Hub` 与 `Quit`。
   - 测试只检查模板里的 label/role，不执行回调。

6. `apps/desktop/src/update.ts`：

   - 新增生产依赖 `apps/desktop/package.json`：

     ```json
     "dependencies": {
       "electron-updater": "^6.8.9"
     }
     ```

     这是本次唯一新增的生产依赖。

   - `bundle.ts` 的 `mainBuildOptions.external` 改为 `["electron", "electron-updater"]`。

   - 导出：

     ```ts
     export interface Updater {
       readonly enabled: boolean
       check(manual: boolean): void
       dispose(): void
     }

     export function createUpdater(options: {
       getWindow: () => BrowserWindow | null
       stopServer: () => Promise<void>
       markQuitting: () => void
     }): Updater
     ```

   - 启用条件：`app.isPackaged && existsSync(path.join(process.resourcesPath, "app-update.yml"))`。不设置 `forceDevUpdateConfig`。
   - 配置：`autoDownload = false`、`autoInstallOnAppQuit = false`、`allowPrerelease = false`。
   - 定时：启动后 10 秒检查一次；之后 `CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000`。`dispose()` 清理 timer 与监听器。
   - 并发：`checking` 标志；检查进行中忽略新的自动/手动检查。`prompting` 标志避免重复对话框。
   - 事件：
     - `update-available`：自动检查且同一版本已提示过则跳过；否则原生 `dialog.showMessageBox` 询问下载。手动检查总是询问。用户确认后 `downloadUpdate()`，失败走 error 处理。
     - `download-progress`：`getWindow()?.setProgressBar(progress.percent / 100)`；`error` / `update-cancelled` 时复位为 `-1`。
     - `update-downloaded`：`setProgressBar(-1)`；记录 `downloadedVersion`；询问重启。确认后 `markQuitting()` → `await stopServer()` → `autoUpdater.quitAndInstall(true, true)`。
     - `update-not-available`：手动检查弹信息框；自动检查静默。
     - `error`：手动检查弹错误框（每次检查最多一次）；自动检查 `console.error`。
   - 同一版本已下载但用户选择稍后：后续 `update-available` 直接询问重启，不重复下载；自动检查不重复弹同一个版本。
   - `update.ts` 不引入 electron-log；日志走 console。

7. `apps/desktop/src/main.ts`：

   - 新增 `stopServer(timeoutMs = 3000)`：
     - 已有 stopping promise 则复用。
     - 无 server 直接 resolve。
     - 设 `serverStopping = true`，`child.postMessage({ type: "shutdown" })`；3 秒后 `child.kill()`；再 1 秒后强制 resolve。
     - `finish` 里清 timer、`server = null`、`stopping = null`、`serverStopping = false`。
   - `server.on("exit")` 遇到 `quitting || serverStopping` 直接返回；否则写诊断并 `report`/reject。
   - `before-quit` 改为：

     ```ts
     app.on("before-quit", (event) => {
       if (quitting) return
       event.preventDefault()
       quitting = true
       tray?.destroy()
       tray = null
       void stopServer().finally(() => app.quit())
     })
     ```

   - `restartApp()`：
     - `CONTEXT_HUB_DEV_WATCH === "1"`：`quitting = true`，销毁 tray，`await stopServer()`，`app.exit(RESTART_EXIT_CODE)`。由 `dev.ts` 重新 spawn。
     - 否则：`quitting = true`，销毁 tray，`await stopServer()`，`app.relaunch()`，`app.quit()`。
   - `reloadPage()`：window 存在且未销毁则 `webContents.reload()`；否则 `showWindow()`（若 `loadedUrl` 有值会重建窗口；没有则 no-op）。
   - `toggleDevTools()`：window 存在且未销毁则 `webContents.toggleDevTools()`；否则 no-op。
   - `app.whenReady()` 顺序：
     1. `const updates = createUpdater({ getWindow: () => window, stopServer, markQuitting: () => { quitting = true; tray?.destroy(); tray = null } })`
     2. `createTray(updates)`
     3. `Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuTemplate({ ... })))`
     4. `void open()`
   - `createTray(updates)` 用 `trayMenuTemplate`；保留现有图标为空/托盘创建失败时的回退。
   - `createWindow` 的 `autoHideMenuBar: true` 保持不变。

8. 验收时的真实更新路径不要求本机可下载；只验证菜单、版本、元数据与退出。

**验收**

```bash
pnpm install
# 必须关掉 Bash 沙箱（见 docs/memory.md：默认沙箱无外网，pnpm 会卡住）

pnpm --filter web typecheck
pnpm --filter @context-hub/desktop typecheck
pnpm --filter web test
pnpm --filter @context-hub/desktop test
pnpm --filter web lint
pnpm --filter @context-hub/desktop lint
# 预期：全部退出码 0

pnpm --filter @context-hub/desktop package:win
# 预期：退出码 0
```

打包运行验收（Windows）：

1. 建临时 hub home：

   ```bash
   HUB_HOME=$(mktemp -d)
   export CONTEXT_HUB_HOME="$(cygpath -w "$HUB_HOME")"
   ```

2. 启动 unpacked 应用，带主进程 inspector 与 renderer 调试端口（先用 `netstat -ano | grep -E ":(9229|9333)"` 确认端口空闲；被占用就换端口，不要杀别人的进程）：

   ```bash
   "apps/desktop/release/win-unpacked/Context Hub.exe" \
     --inspect=9229 --remote-debugging-port=9333 \
     > "$HUB_HOME/desktop.log" 2>&1 &
   ```

3. 用 Node 24 的全局 `WebSocket` 连接 `http://127.0.0.1:9229/json/list`，对主进程 target 发 `Runtime.evaluate`，依序断言：

   ```js
   require('electron').app.getVersion()
   // 预期：等于根 package.json 的 version

   require('electron').app.isPackaged
   // 预期：true

   (() => {
     const { Menu } = require('electron')
     const walk = (items) =>
       items.flatMap((item) => [
         item.label,
         ...(item.submenu ? walk(item.submenu.items) : []),
       ])
     return walk(Menu.getApplicationMenu().items)
   })()
   // 预期：包含 "Check for Updates…"、"Reload Page"、"Quit"
   // Windows/Linux 下位于 File 菜单；macOS 下 Check/Reload 在自定义 View 菜单

   require('electron').BrowserWindow.getAllWindows()[0].webContents.getURL()
   // 预期：以 http://127.0.0.1: 开头
   ```

4. 用 renderer CDP（`http://127.0.0.1:9333/json/list`）执行：

   ```js
   document.querySelector('#root').childElementCount
   // 预期：> 0
   ```

   同时从页面 URL 记录 server 端口。

5. 在主进程 inspector 执行：

   ```js
   require('electron').app.quit()
   ```

   等待 2-3 秒；然后用 `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:<server-port>/`，预期 `000`（端口已释放）。这一步同时验证 `before-quit` 的异步 `stopServer`。

6. 检查 `apps/desktop/release/win-unpacked/resources/app-update.yml` 与 `latest.yml` 仍存在；应用启动日志中没有 `Cannot find module 'electron-updater'`。

**如果 external 解析失败**：按关键决策 4 改为内联，重新 `package:win` 并重复上述启动检查；在 `docs/building.md` 记录最终选择。

**本阶段不做**：不做真实下载/安装验收；不配置 CI 签名；不改 renderer 崩溃日志。

---

### 阶段 5：补齐崩溃日志与诊断

**目标**：主进程在关键失败路径上留下可读日志，并在错误对话框里给出日志路径与诊断尾部；server 的 stdout/stderr 不再无界增长。

**改动文件**

- `apps/desktop/src/crash-log.ts`（新增）
- `apps/desktop/__test__/crash-log.test.ts`（新增）
- `apps/desktop/src/main.ts`（有界缓冲、错误路径、renderer 崩溃）
- `docs/building.md`（日志位置与已知限制；完整收尾在阶段 6）

**具体做法**

1. 新增 `apps/desktop/src/crash-log.ts`，只 import `node:fs` / `node:path`：

   ```ts
   export interface CrashLogInput {
     dir: string
     source: string
     error: unknown
     version: string
     platform: string
     arch: string
     packaged: boolean
     stderrTail?: string
     now?: Date
   }

   export function crashLogName(source: string, now: Date): string
   export function tailOf(text: string, maxBytes: number): string
   export function appendTail(current: string, chunk: Buffer | string, maxBytes: number): string
   export function pruneCrashLogs(dir: string, keep: number): void
   export function writeCrashLog(input: CrashLogInput): string | null
   ```

   - 文件名：`crash-<ISO时间去冒号/点>-<净化的 source>.log`，例如 `crash-2026-10-18T12-34-56-789Z-server.log`。
   - `source` 只保留 `[a-z0-9-]`，空则 `unknown`。
   - 内容：time、source、version、platform、arch、packaged、error message、stack（有则写）、`server stderr (last 65536 bytes):` 与尾部。
   - `writeCrashLog` 先 `mkdirSync(dir, { recursive: true })`，写失败返回 `null`，不抛。
   - 写完调用 `pruneCrashLogs(dir, 10)`；只删匹配 `^crash-.*\.log$` 的普通文件，按文件名里的 UTC 时间从新到旧保留 10 个（文件名同秒时再按 mtime），其他文件与目录不动；删除失败忽略。
   - `tailOf` 按 UTF-8 字节截尾；`appendTail` 先拼接再截尾。允许截断处出现替换字符。

2. `apps/desktop/__test__/crash-log.test.ts` 用 `mkdtemp(path.join(os.tmpdir(), "hub-crash-"))`：
   - `crashLogName` 对 `source: "server stderr"` 产出 `crash-...-server-stderr.log`。
   - `writeCrashLog` 写出的文件包含版本、平台、arch、packaged、`boom`、stack、stderr 尾部；文件名符合模式。
   - `tailOf("x".repeat(100), 10)` 长度为 10；`appendTail` 保留最后 maxBytes。
   - 造 12 个 `crash-*.log` + `keep.txt` + 一个子目录，`pruneCrashLogs(dir, 10)` 后正好 10 个 crash 日志，最旧的 2 个被删，`keep.txt` 与子目录还在。
   - 测试只写临时目录，不碰 `app.getPath("logs")`。

3. `apps/desktop/src/main.ts`：

   - 新增 `const TAIL_BYTES = 64 * 1024`、`const DIALOG_TAIL_BYTES = 2 * 1024`。
   - `startServer()` 每次重置 `stdoutTail` / `stderrTail`。
   - stdout：`stdoutTail = appendTail(stdoutTail, chunk, TAIL_BYTES)`，用 `serverUrlFrom(stdoutTail)` 解析；stderr：`stderrTail = appendTail(...)`，并继续 `process.stderr.write(chunk)`。
   - 新增 `describeFailure(source, message, error?)`：
     - 调 `writeCrashLog`，参数取 `app.getPath("logs")`、`app.getVersion()`、`process.platform`、`process.arch`、`app.isPackaged`、`stderrTail`。
     - 返回给对话框的字符串：原始 message、`log: <path>`（写失败则 `log: unavailable`）、`tailOf(stderrTail, DIALOG_TAIL_BYTES)`（无内容则省略）。
   - `report(message)` 保持 `dialog.showErrorBox` + `app.quit()`，但调用方传入 `describeFailure(...)` 的返回值。
   - 以下路径都走 `describeFailure`：
     - `webRoot()` 缺 `index.html`：source `startup`。
     - `utilityProcess.fork` 同步抛错：source `server`。
     - 15 秒未报告端口：source `startup-timeout`，先 `child.kill()`。
     - child 提前退出：source `server`；`loadedUrl === null` 时 reject，否则 `report`。
     - `loadURL` 失败：source `page`。
   - `render-process-gone`：source `renderer`，记录 reason/exitCode；`details.reason === "clean-exit"` 只写日志不弹窗；其他 reason 用 `dialog.showMessageBox` 给 `Reload` / `Quit`，detail 用 `describeFailure` 的返回值。用一个 `handlingRendererGone` 标志避免连续弹窗；`reload` 时复位。
   - 不把 crash 日志写进仓库；`logs` 目录由 Electron 决定。

4. `docs/building.md` 的 Known limits 增加：日志位置由 `app.getPath("logs")` 决定；错误对话框显示最近 2 KiB，完整尾部在日志文件里。

**验收**

```bash
pnpm --filter @context-hub/desktop typecheck
pnpm --filter @context-hub/desktop lint
pnpm --filter @context-hub/desktop test
# 预期：退出码 0，crash-log 测试通过
```

打包运行验收：

1. 重新 `pnpm --filter @context-hub/desktop package:win`。
2. 启动 unpacked 应用（带 `--inspect=9229`），在主进程 inspector 读取：

   ```js
   require('electron').app.getPath('logs')
   ```

   记录该目录。
3. 在主进程 inspector 执行：

   ```js
   require('electron').BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer()
   ```

   预期：出现错误对话框（含日志路径与尾部）；在 logs 目录出现新的 `crash-*-renderer.log`，内容含版本/platform/arch/packaged/reason/exitCode/stack。关闭对话框或选择 Quit。
4. 启动失败路径：把 `apps/desktop/release/win-unpacked/resources/web` 临时改名为 `web.bak`，启动应用；预期出现 “built page is missing” 对话框，含日志路径；logs 目录出现 `crash-*-startup.log`。随后恢复目录名。
5. server 提前退出路径：把 `resources/server.mjs` 临时改名为 `server.mjs.bak`，启动应用；预期出现启动失败对话框与 `crash-*-server.log`；随后恢复。
6. 15 秒超时路径无法用现有 server 稳定触发；在汇报里标注“仅代码路径与日志函数测试覆盖，超时分支未真机触发”。如果要强制验证，可临时把 `startServer` 的 15_000 改为 200 并让 `serverEntry` 指向一个 sleep 脚本，验证后改回；这属于临时探针，不得留在提交里。

**本阶段不做**：不引入 electron-log、不上报崩溃、不做日志轮转以外的清理。

---

### 阶段 6：更新发布流程与文档

**目标**：tag 构建校验版本一致；CI 上传安装包、`latest*.yml` 与 `.blockmap`；mac 签名/公证凭证只在提供时启用；文档与已知限制同步。

**改动文件**

- `.github/workflows/release.yml`
- `docs/building.md`
- `README.md`
- `docs/plans/desktop-updates-and-dev-loop.md`（本文件，获批后归档，不在实施中归档）

**具体做法**

1. `.github/workflows/release.yml` 增加 `version` job：

   ```yaml
   version:
     runs-on: ubuntu-latest
     outputs:
       version: ${{ steps.read.outputs.version }}
     steps:
       - uses: actions/checkout@v4
       - uses: actions/setup-node@v4
         with:
           node-version: 24
       - id: read
         run: |
           VERSION=$(node -p "require('./package.json').version")
           echo "version=$VERSION" >> "$GITHUB_OUTPUT"
           if [ "$GITHUB_REF_TYPE" = "tag" ]; then
             test "$GITHUB_REF_NAME" = "v$VERSION"
           fi
   ```

   - `cli` 与 `desktop` 都加 `needs: version`；`cli` 的 smoke 用 `VERSION="${{ needs.version.outputs.version }}"`，把 `grep -q '0.0.1'` 改为：

     ```bash
     curl -sf http://127.0.0.1:5299/hub/about | grep -qF "\"version\":\"$VERSION\""
     ```

   - `desktop` 的 build 命令改为：

     ```bash
     pnpm --filter @context-hub/desktop exec electron-builder \
       --config electron-builder.config.mjs --publish never
     ```

   - mac 签名/公证：
     - job 级 `env: CSC_IDENTITY_AUTO_DISCOVERY: "false"`。
     - 在 build 前加一个 `if: runner.os == 'macOS'` 的步骤，把 `secrets.CSC_LINK` / `secrets.CSC_KEY_PASSWORD` 放进该步 env；`run` 里若 `CSC_LINK` 非空，写 `CSC_IDENTITY_AUTO_DISCOVERY=true` 到 `$GITHUB_ENV`，否则写 false。
     - build 步骤 env 按平台给值（GitHub Actions 的 secrets 不能直接用在 `if:`，但可以放在 env 表达式里）：

       ```yaml
       CSC_LINK: ${{ runner.os == 'macOS' && secrets.CSC_LINK || '' }}
       CSC_KEY_PASSWORD: ${{ runner.os == 'macOS' && secrets.CSC_KEY_PASSWORD || '' }}
       APPLE_ID: ${{ runner.os == 'macOS' && secrets.APPLE_ID || '' }}
       APPLE_APP_SPECIFIC_PASSWORD: ${{ runner.os == 'macOS' && secrets.APPLE_APP_SPECIFIC_PASSWORD || '' }}
       APPLE_TEAM_ID: ${{ runner.os == 'macOS' && secrets.APPLE_TEAM_ID || '' }}
       ```

     - `electron-builder.config.mjs` 的 `notarize` 只在这些变量齐全时为 true；未配置 secrets 时仍产出未签名包。

   - desktop artifact 上传改为：

     ```yaml
     path: |
       apps/desktop/release/*.exe
       apps/desktop/release/*.dmg
       apps/desktop/release/*.zip
       apps/desktop/release/*.AppImage
       apps/desktop/release/latest*.yml
       apps/desktop/release/*.blockmap
     if-no-files-found: error
     ```

     不再用 matrix 的 `artifact` 单 glob；删除 matrix 里的 `artifact` 字段。`latest*.yml` 只匹配 `latest.yml` / `latest-mac.yml` / `latest-linux.yml`，不会带上 `builder-debug.yml`。

   - `publish` job 不变（`gh release upload ... --clobber`），但现在 `dist-artifacts/*` 会包含 `.zip`、`latest*.yml`、`.blockmap`。

2. `docs/building.md`：
   - 版本：根 `package.json` 是唯一来源；About 由 `apps/web/server.ts` 的根 JSON import 提供；`apps/desktop/package.json` 是开发形态镜像，测试守住；`apps/web/package.json` 的 version 不再读取。
   - 桌面开发：dev watch/重启、菜单（Reload/Restart/DevTools/Check for Updates）、`CONTEXT_HUB_DEV_URL` 仍透传。
   - 打包：mac 同时产出 dmg 与 zip；`latest*.yml` 与 `app-update.yml` 的位置；`release/win-unpacked` 不是安装版，不能用来验证 NSIS 更新安装。
   - 发布：tag 必须是 `v` + 根版本；上传 `latest*.yml` 与 `.blockmap`；mac secrets 名称与作用。
   - Known limits：真实下载/安装未本机验证；签名/公证需 secrets；`macos-latest` 仍是 arm64；Linux AppImage 更新未验证；未签名包的 SmartScreen/Gatekeeper 警告。
   - 删除旧的 “Version numbers are per package” 条目。

3. `README.md` 的 Desktop app 段落补充：`pnpm --filter @context-hub/desktop dev` 会 watch 并自动重启；版本以根 `package.json` 为准。

4. 文档中的更新验证步骤（写进 `docs/building.md`，本轮不执行）：
   - 在根 `package.json` 提升版本，同步 `apps/desktop/package.json`，提交并推 `v<version>` tag。
   - 安装上一个版本的 NSIS 包；启动应用；等自动检查或用菜单 `Check for Updates…`；确认下载进度、重启提示、重启后版本变化。
   - 若要验证未签名 Windows 包：SmartScreen 会警告；macOS 未公证包会被 Gatekeeper 拦。
   - Linux AppImage 更新需要由 AppImage runtime 设置 `APPIMAGE` 环境变量；本机不验证。

5. 本阶段结束时跑一次完整验收矩阵（见下），然后只调用一次 `aoci_maintain`。

**验收**

```bash
pnpm install   # 关沙箱
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter web build
pnpm --filter @context-hub/desktop build
pnpm --filter @context-hub/desktop package:win
# 预期：全部退出码 0

VERSION=$(node -p "require('./package.json').version")
test -f apps/desktop/release/latest.yml
grep -qF "version: $VERSION" apps/desktop/release/latest.yml
test -f apps/desktop/release/win-unpacked/resources/app-update.yml
test -f apps/desktop/release/win-unpacked/resources/server.mjs
test -f apps/desktop/release/win-unpacked/resources/web/index.html
# 预期：全部通过
```

Workflow 无法在本机完整执行；至少做：
- 人工通读 `release.yml` 的 `needs`、`if`、artifact 路径与 secrets 引用；
- 在合并后用一次 `workflow_dispatch` 跑通 `version` + `cli` + `desktop`（`publish` 会跳过）；再推一个与实际版本一致的 tag 验证 publish。若没有权限，在汇报里明确“CI 未执行”。

## 搜索范围（实施前后都要查）

1. **版本读取点**：

   ```bash
   rg -n 'manifest\.version|from "\.\/package\.json"|from "\.\.\/\.\.\/package\.json"|app\.getVersion|0\.0\.1' \
     apps packages .github docs README.md
   ```

   - 预期只保留：根 `package.json`、`apps/desktop/package.json`（镜像）、`apps/desktop/electron-builder.config.mjs`（读根）、`apps/web/server.ts`（读根）。
   - `apps/web/src/components/extension-detail-dialog.tsx` 的 `manifest.version` 是扩展清单版本，不要改。
   - `packages/*/package.json` 的 `0.0.0` 是内部包版本，不要改。
   - `designs/settings.pen` 的 `0.0.1` 是设计稿样例，不要改。
   - `docs/plans/binary-and-desktop.md` 是历史计划，不要改；`aoci.code.txt` 由 AOCI 维护，不要手改。

2. **server 退出与 listener.close 调用方**：

   ```bash
   rg -n 'SIGINT|SIGTERM|listener\.close|\.close\(\)' apps packages
   ```

   - 预期：`apps/web/server.ts`（新增 shutdown）、`apps/web/dev.ts`（child.kill）、`packages/core/__test__/server.test.ts`、`packages/core/__test__/bridge.test.ts`。
   - 不改 `packages/core/src/host/server.ts` 的 `HubListener.close`；不改 core 测试语义。

3. **desktop 构建调用方**：

   ```bash
   rg -n 'build\.ts|build:desktop|node build\.ts|electron-builder' \
     package.json apps .github docs README.md
   ```

   - 更新 `apps/desktop/package.json`、`.github/workflows/release.yml`、`docs/building.md`。
   - `docs/plans/binary-and-desktop.md` 历史记录不改。

4. **打包配置引用**：

   ```bash
   rg -n 'electron-builder\.yml|electron-builder\.config\.mjs' \
     --glob '!node_modules/**' --glob '!apps/desktop/release*/**' .
   ```

   - 预期：除历史计划外，所有 live 引用都指向 `electron-builder.config.mjs`。

5. **workflow artifact 路径与版本断言**：

   ```bash
   rg -n 'release/|latest|artifact|0\.0\.1|desktop-' .github/workflows/release.yml docs/building.md README.md
   ```

   - 核对每一处 `apps/desktop/release/...` 都能在对应 runner 产出；`latest*.yml` / `.blockmap` 必须出现在 upload 路径里。

6. **菜单、托盘、退出、更新**：

   ```bash
   rg -n 'Menu|Tray|before-quit|quitAndInstall|autoUpdater|stopServer' apps/desktop/src
   ```

   - 预期只有 `main.ts`、`menu.ts`、`update.ts` 三处拥有这些职责；不要在 `createWindow` 里再建第二套菜单。

## 完整验收矩阵

| 检查 | 命令/观察 | 预期 |
|---|---|---|
| 安装依赖 | `pnpm install`（关沙箱） | 退出码 0，lockfile 更新 |
| 类型检查 | `pnpm typecheck` | 退出码 0 |
| Lint | `pnpm lint` | 退出码 0 |
| 测试 | `pnpm test` | 退出码 0；新增 desktop/web 测试被收集 |
| Web 构建 | `pnpm --filter web build` | `apps/web/dist/index.html` 存在 |
| 桌面 bundle | `pnpm --filter @context-hub/desktop build` | `dist/main.cjs`、`dist/server.mjs` 存在 |
| 版本来源 | `node apps/web/server.ts ...` + `curl /hub/about` | version 等于根版本 |
| Windows 打包 | `pnpm --filter @context-hub/desktop package:win` | 安装包、`latest.yml`、`app-update.yml`、`server.mjs`、`web/index.html` 存在 |
| 打包版本 | 主进程 inspector `app.getVersion()` | 等于根版本 |
| 菜单 | 主进程 inspector 读 `Menu.getApplicationMenu()` | 含 `Check for Updates…`、`Reload Page`、`Quit` |
| 页面 | renderer CDP 读 `#root.childElementCount` | > 0 |
| 退出释放端口 | inspector `app.quit()` 后 curl server 端口 | `000`，无 server 残留 |
| Renderer 崩溃日志 | `forcefullyCrashRenderer()` | 出现 `crash-*-renderer.log`，对话框含路径与尾部 |
| 启动失败日志 | 临时移走 `resources/web` / `server.mjs` | 出现对应 `crash-*-startup.log` / `crash-*-server.log` |
| Dev watch | 启动 dev，改 main/server 一行注释 | Electron 自动重启，日志出现新 server 行 |
| Dev 清理 | Ctrl+C 后查 PID/端口 | 无孤儿 Electron/server；端口释放 |
| Tag 版本一致性 | 本地模拟：`VERSION=$(node -p ...)` | `release.yml` 的 `version` job 逻辑在 `GITHUB_REF_NAME=v$VERSION` 时通过 |
| CI | `workflow_dispatch` / 推 tag | 未在本机执行；合并后验证 |

## 风险与未验证项

1. **真实下载/安装更新未验证**：本机没有已发布的更高版本；`win-unpacked` 不是安装版，不能代替 NSIS 安装后的更新流程。必须发布一个更高版本 tag、安装旧版 NSIS 包后验证。未验证前不要声称“自动更新可用”。
2. **签名/公证未验证**：没有 Apple 证书与 Apple ID secrets；未配置时仍产出未签名包。macOS Gatekeeper 与 Windows SmartScreen 会警告。CI 的 `CSC_IDENTITY_AUTO_DISCOVERY` 动态设置需在真实 secrets 下跑一次才能确认。
3. **macOS/Linux 安装包未运行**：`macos-latest` 是 arm64；dmg/zip/AppImage 只在 CI 构建。Linux AppImage 更新还依赖 runtime 的 `APPIMAGE` 环境变量。
4. **electron-updater external 解析**：pnpm 的符号链接 + electron-builder 26 可能在打包时漏拷依赖。判据是启动是否报 `Cannot find module 'electron-updater'`；失败则按关键决策 4 改为 esbuild 内联。
5. **`extraMetadata.version` 对 artifact 名称的影响**：以 `package:win` 后的文件名与 `latest.yml` 为准；若未生效，显式设置 `artifactName`，不要退回手工改 desktop 版本。
6. **`app.getPath("logs")` 的实际路径**：受应用名/平台影响；验收时从主进程 inspector 读取，不要凭猜测拼路径。
7. **原生菜单/托盘无法通过 renderer CDP 读取**：用主进程 `--inspect` 读 `Menu.getApplicationMenu()`；托盘用纯模板单测 + 目视确认。若主进程 inspector 在该 Electron 版本不可用，退回菜单模板测试，并在汇报里标注“托盘/菜单目视未验证”。
8. **15 秒启动超时分支未真机触发**：只由代码路径与日志函数测试覆盖。要真机触发需临时缩短超时或用不输出端口的假 server；探针不得留在提交里。
9. **Windows 进程清理**：dev.ts 的 fallback 只允许按自己 spawn 的 PID 执行 `taskkill /PID <pid> /T /F`；禁止 `taskkill /IM`（Git Bash 下也不要写 `//IM`）。收尾只清自己记录的 PID/端口。
10. **CI workflow 未在本机执行**：合并后至少跑一次 `workflow_dispatch`，再推 tag 验证 publish；否则只声明“YAML 已人工核对，未执行”。

## 明确不做

- 不做本地 hub API 鉴权（当前 loopback 无鉴权）。
- 不做 `dsh://` 深链、shell i18n、NSIS 自定义 UI、强制更新、更新渠道、回滚、任务 drain/admission locking。
- 不验证 Linux AppImage 的真实更新；不运行 macOS/Linux 安装包。
- 不改业务页面、路由、数据存储。
- 不新增除 `electron-updater` 外的生产依赖；不引入 electron-log。
- 不改 `packages/core` 的 `HubListener.close` 语义。
- 不改 `autoHideMenuBar: true` 的窗口外观。
- 不改 `CONTEXT_HUB_DEV_URL` 的语义；不改 turbo `dev` 同时启动 web 与 desktop 的现状。
- 不改 `apps/web/src/components/extension-detail-dialog.tsx` 的扩展版本显示。
- 不手工编辑 `pnpm-lock.yaml`、`aoci.txt`、`.aoci`。
- 不在实施过程中归档本计划；只有用户明确确认计划完成后再移到 `docs/plans/archive/`。
- 不在中间阶段反复调用 `aoci_maintain`。

## 收尾

所有受 AOCI 管理对象达到本次任务的最终稳定状态后，只调用一次 `aoci_maintain`。先确认工作树没有其他 session 正在写（`git status --short` 与近期 mtime），再按返回候选逐项阅读当前源码与关系，创作 Tag/F/R/A/S，并通过 `aoci_update_entry` 提交完整候选集合。不要手改 `aoci.txt` / `aoci.code.txt` / `.aoci`。维护完成后如果又改了受管理对象，按合同在新的稳定状态重新收尾。

## 自审记录

- 阶段依赖：1 → 2 → 3 → 4 → 5 → 6；阶段 4 使用阶段 1 的根版本与阶段 2 的配置；阶段 3 的 `bundle.ts` 是阶段 4 加 external 的落点；阶段 5 使用阶段 4 的 `stopServer`；阶段 6 只改 workflow/文档。
- 每阶段都有可执行验收；真实更新、签名、mac/Linux、CI 明确列为未验证，并给出应运行的命令或步骤。
- 版本读取点已搜到 `apps/web/server.ts`、`apps/desktop/package.json`、`apps/web/package.json`、workflow、历史计划、设计稿；明确区分扩展版本与内部包版本。
- `listener.close` / SIGINT / SIGTERM 调用方已列出；没有改 core。
- `build.ts`、`electron-builder.yml`、workflow artifact 路径、docs/README 引用都在搜索范围内。
- 没有把猜测写成事实：`mac.notarize` / `hardenedRuntime` / update-info 生成已用 electron-builder 文档核对；electron-updater API 以安装版本为准；本机无法验证的项目已单列。
