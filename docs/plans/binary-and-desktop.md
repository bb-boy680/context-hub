# CLI 多平台二进制与 Electron 桌面端

状态：待审批（2026-10-18）

## 背景

仓库现在只有两种运行形态：

- 开发：`apps/web/dev.ts` 起两个进程，Vite（5271）代理 `/hub` 到 `apps/web/server.ts`（5270）。
- 构建后：`pnpm --filter web start` → `node server.ts --static dist`。

`apps/web/server.ts` 是唯一 server 入口，挂载全部 `@context-hub/*/handlers`，监听 loopback。没有 CLI 二进制、没有桌面端、`.github/` 下也没有 CI workflow（只有 `prompts/`）。

要新增两种发布形态，先有两个真实的阻塞点：

1. **版本读取绑在 `import.meta.url` 上。** `apps/web/server.ts:90-94`：

   ```ts
   const manifest = JSON.parse(
     await fs.readFile(new URL("./package.json", import.meta.url), "utf8")
   ) as { version?: unknown }
   ```

   - esbuild 把 `server.ts` bundle 到 `apps/desktop/dist/server.mjs` 后，`import.meta.url` 指向 bundle 文件，旁边没有 `package.json`。
   - Bun `--compile` 后文件位于虚拟目录（本机实测 `import.meta.dir = B:\~BUN\root`），运行时读取路径不可靠。
   - 结果：文件不存在时顶层 `await` 直接以 ENOENT 退出（不是回退到 `0.0.0`）；只有 JSON 读到了但 `version` 不是字符串才会回退。

2. **静态服务用 `createReadStream`。** `packages/core/src/host/server.ts:157-178` 的 `sendFile` 在 `stat` 之后 `writeHead`，再 `createReadStream(file).pipe(response)`。本机实测：Bun 编译产物里 `fs.readdir` / `fs.stat` / `fs.readFile` 能读嵌入的虚拟目录，但 `fs.createReadStream` 会 ENOENT；而这个 stream 错误没有被 `pipe` 的调用方接住，会让进程崩溃。

   `packages/core/handlers.ts` 里另外三处 `createReadStream` 读的是 hub home / 扩展目录下的真实磁盘文件，不是嵌入资源，不受此限制，本轮不改。

现有构建产物的形态（`pnpm --filter web build`）：

- `apps/web/dist/index.html` + `apps/web/dist/assets/**`（约 3.0MB，含字体与代码高亮 chunk）。
- `apps/web/dist/agent-icons/`、`apps/web/dist/mcp-icons/` 来自 `apps/web/public/`，当前为空目录。
- `apps/web/vite.config.ts` 输出绝对路径 `/assets/...`，所以窗口必须通过 `http://127.0.0.1:<port>` 加载，不能用 `file://`。

## 已确认决策（不再论证方向）

- CLI 用 Bun `bun build --compile`；本机 Bun 1.4.2 已实测可交叉编译：`bun-windows-x64`、`bun-linux-x64`、`bun-linux-arm64`、`bun-darwin-arm64`、`bun-darwin-x64`。
- 桌面端用 Electron，不用 Tauri；server 跑在 Electron `utilityProcess` 里，窗口加载 `http://127.0.0.1:<port>`。
- 不新建 `packages/hub`。`apps/web/server.ts` 仍是唯一 server 入口：
  - CLI 二进制直接 `bun build --compile apps/web/server.ts`。
  - 桌面端用 esbuild 把 `apps/web/server.ts` bundle 成单文件，由 `utilityProcess.fork` 启动。
- 实测产物体积：Windows 约 90MB raw / 41MB gz；macOS ARM 约 62MB / 26MB gz。不作为门禁，只用于文档预期。

## 关键决策

1. **版本改为 JSON import，在打包期内联。**
   `apps/web/server.ts` 改成：

   ```ts
   import manifest from "./package.json" with { type: "json" }
   const version = manifest.version
   ```

   Node 24、Bun 1.4.2 都已在本机验证可直接运行这个 import 形态；esbuild 0.28.2 在仓库依赖树中且能 bundle 当前 `server.ts`，JSON import 的具体组合由阶段 3 的 build 验收。这样 dev、Bun 编译、esbuild bundle 三种形态共用一份事实来源，不再需要把 `package.json` 作为 asset 嵌进去，也不再依赖 `import.meta.url`。
   若第 2 阶段验收发现 Bun 没有把 JSON 内联（`/hub/about` 不是 `0.0.1`），才退回 `--asset package.json` + `import.meta.dir` 读取；不要退回 `import.meta.url`。

2. **静态文件改为先 `readFile` 再写响应。**
   `sendFile` 先读完整文件，失败答 404；`Content-Length` 用 `body.byteLength`（不信任嵌入文件的 `stat.size`）；`HEAD` 写同样的头但不写 body。构建页面约 3MB，整文件读取的代价可接受；换来的是嵌入文件可读、stream 错误不再能崩进程。

3. **构建脚本放在各自的 app 下。**
   - `apps/web/build-cli.ts`：与 `server.ts`、`dist/`、`package.json` 同一目录，`--asset dist` 的相对路径不需要算，`pnpm --filter web build:cli` 从任何目录都能跑。
   - `apps/desktop/build.ts`：与 `electron-builder.yml`、`dist/` 同一目录。
   仓库没有根 `scripts/`，不为两个脚本新建一层。

4. **Electron 两个 bundle 格式不同。**
   - `src/main.ts` → `dist/main.cjs`（CJS，`electron` 标为 external）。主进程不需要 top-level await，CJS 是 Electron main 最稳的入口形态。
   - `../web/server.ts` → `dist/server.mjs`（ESM）。`server.ts` 顶层有 await，CJS 输出会失败；Electron 的 `utilityProcess.fork` 已确认支持 `.mjs` 入口（Electron 仓库 `api-utility-process.spec.ts` 的 `import-main.mjs` 用例）。
   - server 的版本已由 JSON import 内联；`import.meta.dir` 只出现在 `process.versions.bun` 守卫内，Node/Electron 下不会执行。

5. **桌面端以“真实启动路径”为默认开发方式。**
   - 默认（dev 和 packaged）：main 启动 utilityProcess server（`--port 0`，由 server 报回随机端口），窗口加载该 URL。这样开发时也在走生产的那条路。
   - `CONTEXT_HUB_DEV_URL=http://127.0.0.1:5271`：main 不启动 server，直接加载 Vite，用于 HMR；需要另一个终端先跑 `pnpm dev`。
   - 页面静态根：packaged 用 `process.resourcesPath/web`；dev 用 `apps/desktop/../web/dist`。

6. **打包资源布局。**
   - `dist/main.cjs` 进 asar。
   - `dist/server.mjs` 放 `extraResources` → `resources/server.mjs`，避免从 asar 里 fork 入口的兼容问题。
   - `apps/web/dist` 放 `extraResources` → `resources/web`，由 server 的 `--static` 指向。
   - `apps/desktop/package.json` 没有生产依赖；main 与 server 都已 bundle，Electron 由运行时提供。

7. **新增依赖只加两个仓库级包，esbuild 从传递依赖提升为直接依赖。**
   - `electron@^44.9.0`、`electron-builder@^26.15.3`：桌面端运行时与安装包。版本为 2026-10-18 的 registry 当前值。
   - `esbuild@^0.28.2`：已在仓库依赖树中（Vite 的 peer，`node_modules/.bin/esbuild` 存在），这里只是把它提升为 `apps/desktop` 的直接 devDependency，用于 bundle main/server。没有引入 electron-vite / Forge / concurrently。
   - `apps/desktop` 里其余 devDependencies（`@types/node`、`typescript`、`vitest`、eslint 相关）与现有包保持同版本，是工具链的重复声明，不是新依赖。
   - `pnpm-workspace.yaml` 的 `allowBuilds` 需要加 `electron: true`，否则 pnpm 10 会拦掉 Electron 的 postinstall（二进制下载）。`esbuild` 已在 allowlist 里。

## 受影响文件

| 文件 | 动作 |
|---|---|
| `apps/web/server.ts` | 版本 JSON import；Bun 编译形态的默认静态根；help 文案 |
| `apps/web/tsconfig.node.json` | `resolveJsonModule`；把 `build-cli.ts` 加入 include |
| `apps/web/package.json` | 新增 `build:cli` |
| `apps/web/build-cli.ts` | 新增：五目标交叉编译 |
| `packages/core/src/host/server.ts` | `sendFile` 改为 readFile；移除 stream 相关注释 |
| `packages/core/__test__/server.test.ts` | 新增 GET body/length、HEAD 用例 |
| `packages/resources/skills/src/host/skills-cli.ts` | `npxCli` 改为可空；找不到 Node 自带 npm 时回退 PATH 上的 `npx` |
| `packages/resources/skills/__test__/skills-cli.test.ts` | 新增：`npxInvocation` 的三种形态用例 |
| `package.json` | 阶段 2 新增 `build:cli`；阶段 3 新增 `build:desktop` |
| `pnpm-workspace.yaml` | `allowBuilds.electron: true` |
| `vitest.config.ts` | 加入 `apps/desktop/vitest.config.ts` |
| `.gitignore` | 忽略 `apps/web/release/`、`apps/desktop/release/` |
| `apps/desktop/package.json` | 新增：main 入口、scripts、devDependencies |
| `apps/desktop/tsconfig.json` | 新增 |
| `apps/desktop/eslint.config.js` | 新增，抄 `apps/web/eslint.config.js` 的 node 版本 |
| `apps/desktop/vitest.config.ts` | 新增，project 名 `desktop` |
| `apps/desktop/build.ts` | 新增：esbuild 两个 bundle |
| `apps/desktop/electron-builder.yml` | 新增 |
| `apps/desktop/src/main.ts` | 新增：单实例、utilityProcess、端口解析、窗口、清理 |
| `apps/desktop/src/server-output.ts` | 新增：从 server stdout 解析 URL |
| `apps/desktop/__test__/server-output.test.ts` | 新增 |
| `.github/workflows/release.yml` | 新增：CLI + desktop matrix + Release |
| `README.md` | 新增构建/发布入口，链接到 docs |
| `docs/building.md` | 新增：完整构建与发布说明 |
| `pnpm-lock.yaml` | 由 `pnpm install` 更新 |

搜索范围（改行为前要看的调用方）：

- `createHubServer` / `static` / `sendFile`：`apps/web/server.ts`、`packages/core/__test__/server.test.ts`、`README.md`。
- `import.meta.url` + `package.json`：只在 `apps/web/server.ts:92`；`packages/core/__test__/bridge.test.ts` 的 about 用例显式传 `version: "9.9.9"`，不受影响。
- `createReadStream`：`packages/core/src/host/server.ts` 与 `packages/core/handlers.ts`；后者读真实磁盘，保持不动。
- `pnpm-workspace.yaml` 的 `allowBuilds`：影响整个 workspace 的 install，不只 desktop。
- 根 `vitest.config.ts` 的 project 列表：新包必须显式加入，否则测试不会被收集。

---

## 阶段一：改造可打包路径

### 目标

让 `server.ts` 在 Node、esbuild bundle、Bun 编译三种形态下都能拿到版本；让静态服务读得动 Bun 嵌入的虚拟文件，并且读不到时只答 404，不崩进程。

### 改动

1. `apps/web/server.ts`
   - 删除 `import { promises as fs } from "node:fs"`（该文件没有其他 fs 使用）。
   - 顶部新增 `import manifest from "./package.json" with { type: "json" }`。
   - 把第 90-94 行的 manifest 读取替换为 `const version = manifest.version`。
   - 更新文件头注释里“version 从 manifest 读”的说明为“构建期内联”。

2. `apps/web/tsconfig.node.json`
   - `compilerOptions` 增加 `"resolveJsonModule": true`（`module` 已是 `esnext`，`moduleResolution` 已是 `bundler`）。

3. `packages/core/src/host/server.ts`
   - import 从 `{ createReadStream, promises as fs }` 改为 `{ promises as fs }`。
   - `sendFile` 改为：

     ```ts
     const body = await fs.readFile(file).catch(() => null)
     if (body === null) {
       response.writeHead(404).end()
       return
     }
     response.writeHead(200, {
       "Content-Type": contentTypeOf(file),
       "Content-Length": body.byteLength,
       "Cache-Control": "no-store",
     })
     response.end(request.method === "HEAD" ? undefined : body)
     ```

   - 注释写清为什么不是 stream：Bun 编译产物只对 `readFile` 暴露嵌入文件，`createReadStream` 会 ENOENT；`Content-Length` 取 buffer 长度，因为嵌入文件的 `stat.size` 不作为契约。
   - 更新 `answered()` 的注释：现在没有 handler 会 pipe，`headersSent || writableEnded` 只保留为“响应已被占用”的判据。

4. `packages/core/__test__/server.test.ts`
   - 把 fixture 内容提成常量，例如 `const appJs = "export default 1\n"`，`writeFile` 用它。
   - 新增两个用例：
     - GET `/assets/app.js` → 200，body 等于 `appJs`，`content-length` 等于 `Buffer.byteLength(appJs)`。
     - HEAD `/assets/app.js` → 200，同样的 `content-length`，body 为空。
   - 现有 404、403、405、目录 landing、client route 用例保持原样。

### 验收

```bash
# 1. 核心 server 契约（含新增 GET/HEAD）
npx vitest run --project core

# 2. web 的类型检查（JSON import + tsconfig）
pnpm --filter web typecheck

# 3. 测试文件本身的类型检查
pnpm --filter @context-hub/core typecheck

# 4. Node 形态仍然能起、能读版本、能服务构建页面
pnpm --filter web build
node --input-type=module -e "const {spawn}=await import('node:child_process'); const p=spawn(process.execPath,['apps/web/server.ts','--port','5299','--static','apps/web/dist'],{stdio:'inherit'}); await new Promise(r=>setTimeout(r,1200)); const home=await fetch('http://127.0.0.1:5299/'); const text=await home.text(); const about=await (await fetch('http://127.0.0.1:5299/hub/about')).json(); console.log(home.status, text.includes('id=\"root\"'), about.version); p.kill();"
```

预期：`npx vitest run --project core` 全绿；`pnpm --filter web typecheck` 与 `pnpm --filter @context-hub/core typecheck` 退出码 0；最后一行输出 `200 true 0.0.1`。

如第 3 步输出 `0.0.0`，说明 JSON import 没有按预期内联，按“关键决策 1”的兜底处理，并在计划里记录实际方案。

### 不在本阶段

- 不动 `packages/core/handlers.ts` 的三处 stream（真实磁盘）。
- 不改 `HubServerOptions` / `HubMiddleware` 的公开形状。
- 不改 `pnpm start` 的行为（它仍显式传 `--static dist`）。

---

## 阶段二：构建 CLI 二进制

### 目标

一条命令产出五个平台的独立可执行文件；Windows 产物在本机跑起来，能服务嵌入的页面和 `/hub/about`。Bun 编译形态下没有 `--static` 时，默认服务嵌入在 `import.meta.dir/dist` 的页面。同时让「从包安装 skill」在二进制与 Electron 形态下可用：`process.execPath` 不再是 Node 时，回退到 PATH 上的 `npx`。

### 改动

1. 新增 `apps/web/build-cli.ts`
   - 目标表：

     ```ts
     const TARGETS = [
       { target: "bun-windows-x64", name: "context-hub-windows-x64.exe" },
       { target: "bun-linux-x64", name: "context-hub-linux-x64" },
       { target: "bun-linux-arm64", name: "context-hub-linux-arm64" },
       { target: "bun-darwin-arm64", name: "context-hub-darwin-arm64" },
       { target: "bun-darwin-x64", name: "context-hub-darwin-x64" },
     ]
     ```

   - 若 `dist/index.html` 不存在，打印 `run pnpm --filter web build first` 并以非 0 退出。
   - 位置参数可选：`node build-cli.ts bun-windows-x64` 只构建一个；无参数构建全部。未知 target 退出 2。
   - 输出目录 `apps/web/release/cli/`（`mkdir -p`）。
   - 每个 target 执行（`cwd` 固定为 `apps/web`）：

     ```bash
     bun build --compile --target=<target> --asset=dist --outfile=<out> server.ts
     ```

     `--asset dist` 会把目录按相对路径嵌到 `import.meta.dir` 下（Bun 文档的 “Files/directories to embed under import.meta.dir”）；本机已实测该形态可被 `fs.readFile` 读取。
   - 构建后打印每个文件路径与大小。
   - 使用 `spawnSync("bun", ...)`；不引入新依赖。`spawnSync` 返回 `error`（`bun` 不在 PATH）或非 0 状态时，打印 `bun 1.4.2+ must be on PATH` 并以非 0 退出。

2. `apps/web/server.ts`
   - 新增 `embeddedRoot()`：

     ```ts
     function embeddedRoot(): string | undefined {
       if (process.versions.bun === undefined) return undefined
       const here = (import.meta as ImportMeta & { dir?: string }).dir
       if (here === undefined) return undefined
       const root = path.join(here, "dist")
       return existsSync(path.join(root, "index.html")) ? root : undefined
     }

     const root = pathOf(given, "static") ?? embeddedRoot()
     ```

   - `--static` 仍然优先。
   - Node 源码形态不命中（`process.versions.bun` 为 `undefined`），所以 `pnpm dev` / `node server.ts` 的行为不变。
   - `import { existsSync } from "node:fs"`、`import path from "node:path"`。
   - 文件头注释补充：编译形态不传 `--static` 时服务嵌入页面。
   - `--help` 文案从 `node apps/web/server.ts ...` 改为中性的 `usage: context-hub [--port <n>] ...`。
   - Bun 编译产物的 `process.argv` 已由 Bun 源码确认是 `[bun, /$bunfs/root/server.ts, ...用户参数]`，所以现有 `process.argv.slice(2)` 不需要改。

3. `apps/web/package.json`
   - `scripts` 增加 `"build:cli": "node build-cli.ts"`。

4. `apps/web/tsconfig.node.json`
   - `include` 增加 `"build-cli.ts"`。

5. 根 `package.json`
   - `scripts` 增加：

     ```json
     "build:cli": "pnpm --filter web build && pnpm --filter web build:cli"
     ```

   - `build:desktop` 留到阶段 3（包存在之后再添加，避免阶段 2 结束时留下失效脚本）。

6. `.gitignore`
   - 增加 `/apps/web/release/`（`dist` 已被现有规则忽略）。

7. `packages/resources/skills/src/host/skills-cli.ts`
   - `npxCli(): string` 改为 `string | null`，找不到 Node 自带的 `npx-cli.js` 时不再抛错。
   - 新增并导出纯函数 `npxInvocation(args, options)`，返回 `{ file, argv }`：
     - 找到 Node 自带的 `npx-cli.js` → `{ file: options.execPath, argv: [cli, ...args] }`，开发形态行为不变。
     - 找不到且 `options.platform === "win32"` → `{ file: options.comspec ?? "cmd.exe", argv: ["/d", "/s", "/c", "npx", ...args] }`。
     - 找不到且其他平台 → `{ file: "npx", argv: args }`。
     - `options` 注入 `platform`、`execPath`、`comspec`、`exists`，单测不碰真实磁盘或 PATH。
   - `runCli` 改用 `npxInvocation`；执行环境仍保留现有 `env`、`cwd`、`timeout`、`maxBuffer`。
   - 注释说明：打包形态下 `process.execPath` 是 hub/Electron 可执行文件，不是 Node，所以必须回退到 PATH；Windows 的 `.cmd` 经 `cmd.exe` 启动。
   - 两条候选都不存在且不在 PATH 时，错误文案改为「Node.js / npx is not on PATH」。

8. `packages/resources/skills/__test__/skills-cli.test.ts`（新增）
   - 找到 `npx-cli.js` → `file` 是 `execPath`，`argv` 以它开头（现有行为）。
   - POSIX 找不到 → `file === "npx"`，`argv` 不含额外前缀。
   - Windows 找不到 → `file` 是 `ComSpec`（缺省 `cmd.exe`），`argv` 以 `/d /s /c npx` 开头。
   - 不执行真实 npx。

### 验收

```bash
# 1. 五个目标全部构建（第一次会下载各 target 的 Bun runtime）
pnpm build:cli
ls -l apps/web/release/cli
```

预期：五个文件名齐全，均非 0 字节；Windows 约 90MB、macOS ARM 约 62MB（允许浮动）。

```bash
# 2. 本机 Windows 产物：不传 --static，验证嵌入页面、版本、参数解析
node --input-type=module -e "const {spawn}=await import('node:child_process'); const p=spawn('apps/web/release/cli/context-hub-windows-x64.exe',['--port','5299'],{stdio:'inherit'}); let done=false; p.on('exit',c=>{if(!done)console.log('exited early',c)}); await new Promise(r=>setTimeout(r,1800)); const home=await fetch('http://127.0.0.1:5299/'); const text=await home.text(); const about=await (await fetch('http://127.0.0.1:5299/hub/about')).json(); const route=await fetch('http://127.0.0.1:5299/skills'); console.log(home.status, text.includes('id=\"root\"'), about.version, route.status); done=true; p.kill();"
```

预期：`200 true 0.0.1 200`。`/skills` 返回 landing document（client router 路由）。

```bash
# 3. 参数错误路径
apps/web/release/cli/context-hub-windows-x64.exe --unknown ; echo $?   # 预期 2
apps/web/release/cli/context-hub-windows-x64.exe --help ; echo $?      # 预期 0
```

```bash
# 4. 类型检查与 lint（build-cli.ts 在 tsconfig.node.json 里）
pnpm --filter web typecheck
pnpm --filter web lint
npx vitest run --project skills
pnpm --filter @context-hub/skills typecheck
```

Windows 上 `kill` 不保证优雅退出；验收只要求端口随进程退出释放（下一次同端口启动不报 EADDRINUSE）。

`--asset` 嵌入路径以实际 `/` 返回 200 为准；skills 的 npx 回退用纯函数单测覆盖，真实 `npx --version` 执行在实施时用一条隔离命令再确认一次（Windows 的 `cmd.exe /d /s /c` 参数引用）。

### 不在本阶段

- 不做压缩包、校验和、安装脚本；Release 资产先放原始二进制。
- 不构建 musl / Windows ARM / macOS universal。
- 不把 CLI 发布到 npm。

---

## 阶段三：搭建 Electron 桌面端

### 目标

`apps/desktop` 能 bundle server 与 main，Electron 通过 `utilityProcess` 起 server，窗口加载随机端口上的页面；开发时既能走真实路径，也能接 Vite HMR。

### 改动

1. `pnpm-workspace.yaml`
   - `allowBuilds` 增加 `electron: true`。
   - `apps/*` 已覆盖新包，不需要改 `packages` 列表。

2. 新增 `apps/desktop/package.json`

   ```json
   {
     "name": "@context-hub/desktop",
     "version": "0.0.1",
     "private": true,
     "description": "Context Hub desktop",
     "author": "Context Hub",
     "type": "module",
     "main": "dist/main.cjs",
     "scripts": {
       "build": "node build.ts",
       "dev": "node build.ts && electron .",
       "start": "electron .",
       "lint": "eslint",
       "test": "vitest run",
       "typecheck": "tsc --noEmit"
     },
     "devDependencies": {
       "@eslint/js": "^10",
       "@types/node": "^24",
       "electron": "^44.9.0",
       "electron-builder": "^26.15.3",
       "esbuild": "^0.28.2",
       "eslint": "^10",
       "globals": "^17",
       "typescript": "~6",
       "typescript-eslint": "^8",
       "vitest": "^5.0.5"
     }
   }
   ```

   安装用 `pnpm install`（网络；本仓沙箱会丢包，必须关沙箱）。`electron` / `electron-builder` 的版本以 2026-10-18 registry 为准；实施时若已更新，用 `pnpm view electron version`、`pnpm view electron-builder version` 重取，不要凭记忆写。

   同时在根 `package.json` 的 `scripts` 增加：

   ```json
   "build:desktop": "pnpm --filter @context-hub/desktop build"
   ```

3. 新增 `apps/desktop/tsconfig.json`
   - 对齐 `apps/web/tsconfig.node.json`：`target es2023`、`module esnext`、`moduleResolution bundler`、`allowImportingTsExtensions`、`verbatimModuleSyntax`、`noEmit`、`strict`、`noUnusedLocals`、`noUnusedParameters`、`types: ["node"]`。
   - `include: ["src", "build.ts", "__test__"]`。

4. 新增 `apps/desktop/eslint.config.js`
   - 抄 `apps/web/eslint.config.js` 的结构，去掉 React 插件，`globals` 用 `globals.node`，忽略 `dist`、`release`。

5. 新增 `apps/desktop/vitest.config.ts`
   - `defineProject({ test: { name: "desktop", include: ["__test__/**/*.test.ts"] } })`。
   - 根 `vitest.config.ts` 的 `projects` 增加 `"apps/desktop/vitest.config.ts"`。

6. 新增 `apps/desktop/build.ts`
   - 使用 esbuild JS API（`import { build } from "esbuild"`）。
   - `absWorkingDir` 必须是绝对路径：`path.dirname(fileURLToPath(import.meta.url))`（即 `apps/desktop`），不要写相对字符串。
   - server：

     ```ts
     await build({
       entryPoints: ["../web/server.ts"],
       outfile: "dist/server.mjs",
       bundle: true,
       platform: "node",
       format: "esm",
       target: "node20",
       sourcemap: true,
       logLevel: "info",
     })
     ```

   - main：

     ```ts
     await build({
       entryPoints: ["src/main.ts"],
       outfile: "dist/main.cjs",
       bundle: true,
       platform: "node",
       format: "cjs",
       target: "node20",
       sourcemap: true,
       external: ["electron"],
       logLevel: "info",
     })
     ```

   - `target: node20` 是保守下限；Electron 44 的 Node 高于它。

7. 新增 `apps/desktop/src/server-output.ts`
   - `serverUrlFrom(text: string): string | null`：只解析**已经换行结束**的行，避免 stdout 分块时把 `http://127.0.0.1:52` 误认成完整端口。

     ```ts
     export function serverUrlFrom(text: string): string | null {
       const lines = text.split("\n")
       lines.pop() // 最后一段可能还没收到换行
       for (const line of lines) {
         const match = /^context hub server listening on (http:\/\/\S+)$/.exec(line.trim())
         if (match !== null) return match[1]
       }
       return null
     }
     ```

   - 对应 `server.ts` 的 `console.log(\`context hub server listening on ${listener.url}\`)`。

8. 新增 `apps/desktop/__test__/server-output.test.ts`
   - 完整行 → 返回 URL。
   - 不带换行的半行 → `null`。
   - 多行输出（后面还有 `serving the built page from ...`）→ 仍返回 URL。

9. 新增 `apps/desktop/src/main.ts`
   - 路径：
     - `serverEntry = app.isPackaged ? path.join(process.resourcesPath, "server.mjs") : path.join(app.getAppPath(), "dist", "server.mjs")`
     - `webRoot = app.isPackaged ? path.join(process.resourcesPath, "web") : path.resolve(app.getAppPath(), "..", "web", "dist")`
   - 单实例：`app.requestSingleInstanceLock()`；失败 `app.quit()`；成功监听 `second-instance`，把已有窗口 `restore()` + `focus()`。
   - `app.whenReady()` 后：
     - 若 `process.env.CONTEXT_HUB_DEV_URL` 有值，直接用它，不 fork server。
     - 否则 `startServer()`。
   - `startServer()`：
     - 启动前检查 `existsSync(path.join(webRoot, "index.html"))`，缺失时用 `dialog.showErrorBox` 报 “run pnpm build first” 并退出。
     - `utilityProcess.fork(serverEntry, ["--port", "0", "--static", webRoot], { cwd: app.getPath("home"), stdio: "pipe", serviceName: "Context Hub Server" })`。
       `cwd` 必须显式给：`createWorkspaceHandler` 在没收到 `--folder` 时用 `hostFolder()`，后者是 `projectRoot(process.cwd())`；packaged 应用从快捷方式启动时 cwd 可能是应用目录甚至 system32，会把一个无关目录当成工作区。用用户 home 作为桌面端的默认工作区，用户仍可在界面里切换。
     - 累积 stdout，用 `serverUrlFrom` 解析；成功后清掉 15 秒超时。
     - stderr 原样转发到主进程 stderr。
     - 子进程提前退出：未拿到 URL → reject；已拿到 URL 且不是主动退出 → 错误对话框并 `app.quit()`。
   - `createWindow(url)`：
     - `new BrowserWindow({ width: 1280, height: 820, show: false, autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })`。
     - `ready-to-show` 时 `show()`；`loadURL(url)` 失败时错误对话框并退出。
     - `setWindowOpenHandler`：与窗口同 origin 的 URL 返回 `{ action: "allow" }`（应用内部的 `target=_blank` 仍留在 Electron 里）；其他 origin 交给 `shell.openExternal` 并返回 `{ action: "deny" }`。不要把所有 URL 都甩给系统浏览器。
     - `will-navigate`：目标 origin 与加载 origin 不同则 `preventDefault()` 并 `shell.openExternal`。
     - `closed` 时清空窗口引用。
   - 生命周期：`window-all-closed` 在非 macOS 上 `app.quit()`；macOS `activate` 时若没有窗口则用记录的 URL 重建；`before-quit` 设 `quitting = true` 并 `server?.kill()`。
   - main 不读 `process.execPath`、不用 `import.meta`，避免 CJS 输出下的路径问题。

10. `pnpm-workspace.yaml`、`apps/desktop/package.json` 修改后执行 `pnpm install`。检查 install 输出里有没有被忽略的 build script；除 `electron` 外的包若也被列出，把那个包按名字写进 `allowBuilds`（直接编辑 YAML，不要运行交互式的 `pnpm approve-builds`，避免 agent 卡在提示上）。

### 验收

```bash
# 1. 安装与静态检查（网络命令，沙箱外执行）
pnpm install
pnpm --filter @context-hub/desktop typecheck
pnpm --filter @context-hub/desktop lint
npx vitest run --project desktop

# 2. 先有构建页面，再 bundle 桌面端
pnpm build
pnpm --filter @context-hub/desktop build
ls apps/desktop/dist   # 预期 main.cjs、server.mjs（以及 .map）
```

```bash
# 3. 真实路径：Electron 起 utilityProcess，窗口加载随机端口的页面
#    在后台启动（Bash 工具用 run_in_background，或另开一个终端）
#    用临时 hub home 隔离，避免验收写真实的 ~/.context-hub
CONTEXT_HUB_HOME="$TEMP/context-hub-desktop-smoke" pnpm --filter @context-hub/desktop exec electron --remote-debugging-port=9222 .
# 另开一个终端：
curl -s http://127.0.0.1:9222/json/list
```

预期：`/json/list` 里有一个 page，URL 是 `http://127.0.0.1:<随机端口>/`，title 为 `vite-monorepo`（当前 `apps/web/index.html` 的标题）。同一个 CDP 会话里执行 `document.querySelector("#root").childElementCount > 0` 为 `true`。

```bash
# 4. 退出清理：关掉窗口后，上一步拿到的 server URL 应连接失败
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:<那个端口>/
# 预期 000（连接失败）
```

```bash
# 5. HMR 路径：终端 A 跑 pnpm dev；终端 B：
CONTEXT_HUB_DEV_URL=http://127.0.0.1:5271 pnpm --filter @context-hub/desktop exec electron .
```

预期：窗口加载 5271 的 Vite 页面；`/hub` 请求经 Vite 代理到 5270。关掉 Electron 后 `pnpm dev` 不受影响（没有 fork 自己的 server）。

### 不在本阶段

- 不写 electron-builder 配置、不产出安装包。
- 不做 autoUpdater、托盘、菜单定制、图标、快捷键。
- 不改 `apps/web/src` 的任何业务代码或页面标题。

---

## 阶段四：配置安装包

### 目标

Windows 本机能产出 NSIS 安装包和可直接运行的 unpacked 目录；macOS/Linux 的构建配置就位但只由 CI 验证。

### 改动

1. 新增 `apps/desktop/electron-builder.yml`

   ```yaml
   appId: com.contexthub.desktop
   productName: Context Hub
   directories:
     output: release
   files:
     - dist/main.cjs
   extraResources:
     - from: dist/server.mjs
       to: server.mjs
     - from: ../web/dist
       to: web
   win:
     target:
       - nsis
   mac:
     target:
       - dmg
     category: public.app-category.developer-tools
   linux:
     target:
       - AppImage
     category: Development
   ```

   - `electron-builder.yml` 由 electron-builder 自动发现，不需要在 package.json 里另设 `build` 字段。
   - `files` 只列 main；`package.json` 由 electron-builder 自动包含。server 与页面走 `extraResources`，在 asar 外。
   - `extraResources` 的 `from: ../web/dist` 相对 `apps/desktop`，因此打包前必须有 `apps/web/dist`。如果该版本 electron-builder 拒绝项目目录之外的 `from`，改成在 `build.ts` 里把 `apps/web/dist` 复制到 `apps/desktop/dist/web`，并把配置改为 `from: dist/web`；不要在打包脚本里手工 `cp`。

2. `apps/desktop/package.json` 增加：

   ```json
   "package:win": "pnpm --filter web build && node build.ts && electron-builder --win nsis",
   "package:mac": "pnpm --filter web build && node build.ts && electron-builder --mac dmg",
   "package:linux": "pnpm --filter web build && node build.ts && electron-builder --linux AppImage"
   ```

   这样本地单条命令就能完成页面构建 + bundle + 安装包。

3. `.gitignore` 增加 `/apps/desktop/release/`（`dist` 已被忽略）。

### 验收

```bash
# 1. Windows 安装包（本机）
pnpm --filter @context-hub/desktop package:win
ls -l apps/desktop/release
```

预期：存在 NSIS 安装包（默认名 `Context Hub Setup 0.0.1.exe`；以 electron-builder 实际输出为准）与 `apps/desktop/release/win-unpacked/Context Hub.exe`。

```bash
# 2. 打包后的资源布局
ls apps/desktop/release/win-unpacked/resources
# 预期包含 server.mjs、web/index.html、web/assets/
```

```bash
# 3. 运行 unpacked 版本（不经过安装器），验证页面来自 resources/web
#    在后台启动（Bash 工具用 run_in_background，或另开一个终端）
#    同样用临时 hub home 隔离
CONTEXT_HUB_HOME="$TEMP/context-hub-desktop-smoke" "apps/desktop/release/win-unpacked/Context Hub.exe" --remote-debugging-port=9222
# 另一个终端：
curl -s http://127.0.0.1:9222/json/list
```

预期：page URL 为 `http://127.0.0.1:<随机端口>/`；CDP 执行 `document.querySelector("#root").childElementCount > 0` 为 `true`。关闭窗口后 server 端口释放。

4. `Context Hub Setup 0.0.1.exe` 本身只验证“生成成功 + 文件大小非 0”。运行安装器会写入当前用户的应用目录，属于改机器状态；除非用户明确要求，不自动执行安装。

5. macOS / Linux：本机是 Windows，**无法验证**。验收只要求配置存在、`package:mac` / `package:linux` 命令可被 CI 调用；实际产物由第 5 阶段的 matrix 构建。

### 不在本阶段

- 不做代码签名、公证、Windows SmartScreen 信誉。
- 不做 dmg 背景/图标、NSIS 自定义页面、安装目录选择。
- 不做 deb/rpm/snap/portable，只 AppImage。
- 不做自动更新与 `latest.yml`。

---

## 阶段五：接入 GitHub Actions

### 目标

推 `v*` tag 时，一个 workflow 产出五个 CLI 二进制和三个平台的桌面安装包，并上传到同一个 GitHub Release；手动触发时只构建并保留 Actions artifacts。

### 改动

新增 `.github/workflows/release.yml`：

- 触发：

  ```yaml
  on:
    push:
      tags: ["v*"]
    workflow_dispatch:
  permissions:
    contents: write
  concurrency:
    group: release-${{ github.ref }}
    cancel-in-progress: false
  ```

- `cli` job（`ubuntu-latest`）：
  - `actions/checkout@v4`
  - `pnpm/action-setup@v4`（`version: 10.33.4`，这是根 `package.json` 的 `packageManager`）
  - `actions/setup-node@v4`（`node-version: 24`，`cache: pnpm`）
  - `pnpm install --frozen-lockfile`
  - `pnpm build`
  - `oven-sh/setup-bun@v2`（`bun-version: 1.4.2`）
  - `pnpm --filter web build:cli`
  - Linux x64 烟测：后台启动 `context-hub-linux-x64 --port 5299`，`curl` `/` 与 `/hub/about`，然后 `kill $!`
  - `actions/upload-artifact@v4`：`apps/web/release/cli/*`，artifact 名 `cli-binaries`，`if-no-files-found: error`

- `desktop` job（`strategy.matrix.os: [windows-latest, macos-latest, ubuntu-latest]`）：
  - 同样的 checkout / pnpm / node / install / `pnpm build`
  - `pnpm --filter @context-hub/desktop build`
  - `pnpm --filter @context-hub/desktop exec electron-builder --publish never`
    - env：`CSC_IDENTITY_AUTO_DISCOVERY: "false"`
    - `GH_TOKEN` 不需要，`--publish never` 不上传
  - 上传 artifact：
    - Windows：`apps/desktop/release/*.exe`
    - macOS：`apps/desktop/release/*.dmg`
    - Linux：`apps/desktop/release/*.AppImage`
    - 名 `desktop-${{ matrix.os }}`，`if-no-files-found: error`

- `publish` job（`ubuntu-latest`，`needs: [cli, desktop]`，`if: startsWith(github.ref, 'refs/tags/')`）：
  - `actions/download-artifact@v4`（`merge-multiple: true`，`path: dist-artifacts`）
  - `gh release view "$GITHUB_REF_NAME" || gh release create "$GITHUB_REF_NAME" --title "$GITHUB_REF_NAME" --generate-notes`
  - `gh release upload "$GITHUB_REF_NAME" dist-artifacts/* --clobber`
  - env：`GH_TOKEN: ${{ github.token }}`

- Action 的主版本（`checkout@v4` 等）按当前 GitHub Marketplace 为准；实施时若 action 已提示升级，按提示换主版本。它们不是项目依赖，不进 `package.json`。

### 验收

本机无法执行 GitHub Actions，验收分为两层：

1. 本地静态检查：

   ```bash
   git diff --check
   test -f .github/workflows/release.yml
   ```

   本机没有 `actionlint`，也没有 PyYAML；不要声称 YAML 已被本地解析器验证。

2. 首次真实运行（需要用户把分支/tag push 到远端，属于用户操作）：

   ```bash
   gh workflow run release.yml --ref <branch>
   gh run watch
   ```

   - `workflow_dispatch`：`cli` 与 `desktop` 三个平台全部绿；Actions artifacts 里有 1 个 CLI artifact + 3 个 desktop artifact。
   - 推 `v0.0.1` tag：`publish` job 绿；Release 资产包含 5 个 CLI 二进制 + Windows `.exe` + macOS `.dmg` + Linux `.AppImage`。
   - CLI job 里的 Linux 烟测通过，说明交叉编译出的 Linux 二进制能读嵌入页面。

### 不在本阶段

- 不新增常规 CI（typecheck/test/lint）workflow；本阶段只做发布。
- 不做签名证书、macOS notarization、Windows 代码签名。
- 不做版本号自动递增、Release notes 模板、发布到 npm。

---

## 阶段六：更新构建文档

### 目标

让另一个开发者只读 README / docs 就能复现本地构建、理解两种运行形态的边界，并知道哪些平台本地验证不了。

### 改动

1. `README.md`
   - 在 “Running” 之后新增小节 “Command-line binary” 与 “Desktop app”，每节只写最短命令与产物路径，详细内容链接 `docs/building.md`。
   - 命令必须与 `package.json` 一致：
     - `pnpm build:cli`
     - `pnpm build`
     - `pnpm --filter @context-hub/desktop dev`
     - `pnpm --filter @context-hub/desktop package:win|package:mac|package:linux`
   - 注明 `bun` 只在构建 CLI 时需要；日常开发仍是 Node + pnpm。
   - 注明默认桌面开发路径会由 Electron fork server，`CONTEXT_HUB_DEV_URL=http://127.0.0.1:5271` 才接 Vite HMR。

2. 新增 `docs/building.md`（英文，与 README 一致）
   - CLI：目标表、本机/CI 命令、输出路径、`--asset dist` 与版本内联的原理、首次构建会下载各 target runtime。
   - 桌面端：`utilityProcess` 架构、`dist/main.cjs` 与 `dist/server.mjs` 的分工、`extraResources` 布局、单实例、随机端口、退出清理。
   - 开发：默认路径 vs `CONTEXT_HUB_DEV_URL`。
   - 打包：`package:*` 命令、输出、Windows 本机验证方式、macOS/Linux 由 CI 构建。
   - 发布：tag → workflow → Release 资产清单。
   - 已知限制：未签名、macOS 架构、Linux AppImage 运行环境；skills CLI 需要 Node.js / npx 在 PATH（见风险）。

3. 不更新 `AGENTS.md`；构建细节属于项目文档，不塞进入口文件。

### 验收

```bash
# 1. 文档里的脚本都真实存在
node -e "const p=require('./package.json'); console.log(p.scripts['build:cli'], p.scripts['build:desktop'])"
node -e "const p=require('./apps/desktop/package.json'); console.log(p.scripts['package:win'], p.scripts['package:mac'], p.scripts['package:linux'])"

# 2. 文档引用的文件存在
test -f docs/building.md
test -f apps/desktop/electron-builder.yml
test -f .github/workflows/release.yml

# 3. 没有无关格式化
git diff --check
```

4. 按文档命令重跑一次 `pnpm build:cli` 与 `pnpm --filter @context-hub/desktop package:win`（如果本阶段没有改动代码，可复用第 2/4 阶段的结果，但要在汇报里说明是复用）。

5. 最后跑一次全量门禁：

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```

   预期：turbo typecheck / lint 全绿；vitest 收集到 `core`、`web`、`desktop` 等全部 project 并通过。

### 不在本阶段

- 不写中文版构建文档（README 现有正文是英文）。
- 不把计划文件移入 `archive/`；归档由用户确认计划完成后执行。

---

## 明确不做

- 不引入 Tauri、Electron Forge、electron-vite。
- 不新建 `packages/hub`，不复制 `apps/web/src` 到桌面端。
- 不改业务路由、数据存储格式、页面功能、UI 文案。
- 不改 `apps/web/dev.ts` 的双进程模型与 5270/5271 端口；不动 Vite 代理。
- 不修 `packages/resources/skills/src/host/skills-cli.ts` 之外的子进程定位问题。
- 不做自动更新、代码签名、公证、应用图标/品牌替换。
- 不做 macOS universal、Windows ARM、Linux musl、deb/rpm/snap。
- 不做 CLI 的 npm 包、shell 安装脚本、checksum 文件。
- 不跑全仓 `prettier --write`，不做无关格式化。
- 不提交 git，不 push；除非用户明确要求。

## 风险与未验证项

1. **macOS Gatekeeper / 公证（未验证，本机无法验证）**
   未签名、未公证的 `.dmg` 在用户机器上会被 Gatekeeper 拦下。CI 只证明能构建。后续需要 `CSC_LINK`、Apple ID / notarization 凭证；不在本轮。

2. **macOS 架构（未验证）**
   `macos-latest` 当前是 arm64 runner，产物是 arm64 dmg；Intel Mac 需要 `macos-13` 或 `--x64` matrix。本轮不覆盖。

3. **Linux AppImage 运行环境（未验证）**
   AppImage 只在 CI 构建，不在本机运行。Ubuntu 24.04 的 AppArmor 限制未特权 user namespace，可能导致 Electron sandbox 启动失败；实际分发前需要在目标发行版上跑一次，必要时提供 `--no-sandbox` 或 AppArmor profile。此项与 WebKit 无关；Electron 用的是 Chromium。

4. **Bun 的 Node 兼容性回归**
   `packages/resources/skills/src/host/skills-cli.ts:67-77` 的 `npxCli()` 用 `path.dirname(process.execPath)` 找 Node 自带的 `npx-cli.js`。在 Bun 编译二进制里 `process.execPath` 是 hub 二进制；在 Electron utilityProcess 里是 Electron/Context Hub 可执行文件。两个形态原本都会抛 “npm's npx CLI is missing next to node”，即“从包安装 skill”不可用。
   本轮已在阶段二改为：找不到时回退到 PATH 上的 `npx`（Windows 经 `cmd.exe /d /s /c`）。前提是用户机器上装了 Node.js 且 `npx` 在 PATH；未安装时功能仍不可用，但错误文案会明确说明。Windows 的参数引用需要真机确认一次。
   除此之外，CLI 二进制按 Bun 的 Node 兼容层运行；MCP 探测、plugins 的 git 操作、prompts 交付、variables 的 Windows 注册表读写都应在第 2 阶段后做一次手工烟测（本轮验收只覆盖静态页面、`/hub/about` 和路由回退）。

5. **嵌入静态文件的读取方式（已按实测规避）**
   Bun 编译产物对嵌入目录只保证 `readdir` / `stat` / `readFile`。本计划把 `sendFile` 改成 `readFile`；以后若有人为了大文件改回 stream，会重新触发 ENOENT 和未捕获错误崩溃。代码注释要留下这一条。

6. **Electron utilityProcess 的 ESM 入口与 argv 布局（文档已验证 ESM，本机待验收）**
   Electron 仓库测试确认 `.mjs` 入口可用；第 3 阶段验收会实际跑起来。若失败，备选方案是把 server 改成无 top-level await 的 CJS bundle（需要把启动逻辑包进 `main()`），不影响 CLI 形态。
   `utilityProcess.fork` 的 `process.argv` 布局本轮未在本机验证；server 现有 `slice(2)` 假设它与 Node 的 `[exe, script, ...args]` 一致。第 3 阶段窗口加载页面即覆盖 `--static` 是否被解析；若页面 404，先让 server 打印 `process.argv` 确认布局，再决定是否调整 slice 起点（不要改 CLI 形态已经验证过的 `slice(2)`）。

7. **Bun `--asset` 的相对路径布局（文档已验证，本机待验收）**
   计划按“`cwd=apps/web` + `--asset dist` → `import.meta.dir/dist`”实现；第 2 阶段用 `/` 返回 200 验证。若布局不同，以实际路径调整 `embeddedRoot()`，不要把 `--static` 写死到构建命令里。

8. **pnpm 拦截 Electron 的 postinstall（待安装时确认）**
   `pnpm-workspace.yaml` 当前只允许 `esbuild`；阶段 3 加 `electron: true`。不改的话 Electron 二进制不会下载，`electron .` 会报找不到可执行文件。安装后检查 pnpm 输出里的 ignored build scripts。

9. **Windows SmartScreen（未验证）**
   未签名安装包会触发 SmartScreen 警告。本轮接受，作为后续签名阶段处理。

10. **版本号三处不同步（已知）**
    `apps/web/package.json`、`apps/desktop/package.json`、git tag 目前各写各的。About 显示 web 包版本，安装包显示 desktop 包版本。后续应做单一版本来源；本轮不做。

11. **桌面端体积（预期）**
    Electron 运行时会让安装包达到数十到上百 MB，显著大于 CLI 的 60-90MB。这是选择 Electron 的既定代价，文档要写清。

12. **本地服务无鉴权（既有设计）**
   server 仍绑定 loopback、禁止 wildcard；桌面端把它暴露给本机任意进程，与现在的 dev/built 形态一致。本轮不新增鉴权。

## 执行约定

- 计划获批后，按阶段建 `TaskCreate` 任务，一个阶段一条；开始前 `in_progress`，验收通过后 `completed`。
- 依赖安装（`pnpm install`、`pnpm add`、`pnpm view`）需要外网：本仓沙箱会丢包，必须关沙箱执行。
- 不提交、不 push、不移动本计划到 `archive/`；这些都等用户明确指令。
- 所有改动达到最终稳定状态后，按 `AGENTS.md` 只调用一次 `aoci_maintain`，基于真实证据更新受影响的 AOCI 条目。
- 验证失败时先修，不要用“这是平台差异”跳过；确实无法在本机验证的（macOS/Linux 产物、GitHub Actions），在汇报里明确列出未验证项和应运行的命令。
