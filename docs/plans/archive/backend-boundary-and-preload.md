# 立起后端边界（第一轮，已完成）

## Context

四个资产页面（Skills / MCP / Plugins / Prompts）今天都**只在进入页面时**才读数据，
读取逻辑住在各自的 React hook 里（mount 时 `queueMicrotask(() => void read())`）。
组件卸载 state 一起丢，再进来重读一遍。于是全局 Ctrl+K
（`apps/web/src/components/search-palette.tsx`，今天是一份写死的假数据）
在任何"从未进过那四个页面"的会话里查不到任何真实资产——数据根本没被读过。

调研过程中先暴露了更要紧的一层：**这个项目的后端边界不存在。** 用户确认后续要做
**Electron 与 CLI**，于是先立边界、再做数据层。

### 为什么后端这一轮必须在前

1. **仓库自己的架构早就为多形态准备了**，不是推测。`packages/extensions/src/host.ts:59-70`
   的 `PlatformHost` 带 `form: "Web"` 与 `capabilities: {code, filesystem, network}`；
   `packages/plugin-mcp/src/tools.ts:4-8` 的注释明写：

   > An installer never touches a disk or a process: it names the program and its arguments,
   > and this side carries that to the host. A browser form talks to the dev bridge or the
   > host's own server; **a desktop form swaps this for one that calls its main process.**

2. **Vite-中间件-当后端是其中唯一无法被其他形态复用的一块**，而且只实现了
   `configureServer`、零 `configurePreviewServer`——`vite build` 的产物**根本没有后端**。

3. **抽离的代价比看起来小得多**。全仓 10 个中间件插件对 Vite 的专有耦合只有 **1 处**：
   `packages/core/vite.ts:200` 的 `server.config.logger.warn`。其余注册签名统一是
   `configureServer(server: { middlewares: { use: (handler: unknown) => void } })`——结构类型；
   挂进去的 handler 是 `(request, response, next) => void`，**本来就是 node:http 的处理器**。

4. **漂移已经在发生，而且是可量化的**：

   | 路由 | 共享常量 | 两端各写的字面量 |
   |---|---|---|
   | `/hub/state`、`/hub/workspaces`、`/hub/net`、`/hub/files`、`/hub/extensions`、`/hub/place-files` | ✅ `packages/core/src/*.ts` 导出，两端 import 同一份 | — |
   | `/hub/mcp` | ✅ `packages/plugin-mcp/src/probe.ts:16` 导出（**正确样板**） | — |
   | `/hub/plugins` | ❌ | **3 处**：`plugin-plugins/src/library.ts:39`、`plugin-plugins/src/tools.ts:13`、`plugin-plugins/vite.ts:39` |
   | `/hub/prompts` | ❌ | **2 处**：`plugin-prompts/src/remote-store.ts:44`、`plugin-prompts/vite.ts:18` |
   | `/hub/skills` | ❌ | **2 处**：`plugin-skills/src/remote-store.ts:89`、`plugin-skills/vite.ts:23` |

   规律：core 与 MCP 用共享常量，其余三个插件两端各写一份——**正是零测试、出过 bug 的那三个**。
   `docs/memory.md` 那条"客户端发 `?action=files&id=<name>`，host 读
   `url.searchParams.get("name")`，『查看文件』坏了很久"就是这么长出来的。

### 定的口径

1. **顺序**：先后端抽离，再预加载。
2. **Electron 传输**：**统一 loopback HTTP**。一台 node server 三种载体共用
   （web / Electron / CLI）；Electron 主进程 spawn 子进程、IPC 只做生命周期控制。
3. 预加载范围：**全部启动时立即加载**，含 MCP 的 probe 与 Plugins 的安装器探测两档
   （用户了解代价后确认）。
4. 预加载后页面**改**成读共享状态（一份数据一个来源）。
5. Ctrl+K 面板**本轮不接**真实数据。
6. 状态：**服务 + immer 做转换**（不上 React Provider）；`use-immer` 只用在**两处**本地 state。
7. 读取层上 **`useSyncExternalStoreWithSelector`**。

### 参照 deepseek-harness 的结论

读了 `D:\work-space\deepseek-harness`（同源：本仓 `packages/extensions/src/cordis.ts` 用的就是
它那套 `@deepseek-ai/cordis`）。**它是纯前端 SPA（CSR），不是 SSR**——全仓零页面级 SSR
（`react-dom/server` 只出现在 katex 公式转 HTML 与一个测试文件里），`apps/web/index.html`
是 `<div id="root"></div>` 空壳，服务端做的是往静态 HTML 文本里 splice 注入行
（`packages/host/webserver/src/injections.ts`），`hydrateRoot` 是无框架启动页的 DOM 交接。
所以差别不在 SSR vs CSR，而在**服务端是不是一个真正的进程**。

采用的：`port: 0` + loopback + 拒绝通配地址（`packages/host/webserver/src/index.ts:80-88`）；
Electron 只把 IPC 用于生命周期、URL 经 IPC 回传、业务 RPC 全走 HTTP；
共享状态用 `useSyncExternalStoreWithSelector` + `produce`（它全客户端只有一个 hook 构造点
`packages/client/ui-renderer/src/client/bind.ts:20-26`，全仓 `use-immer` **零命中**）；
取数是"一次全量 + single-flight + 代际守卫"而非通用 query cache。

**不采用**：`typert` 构建期契约生成、host/client 双 tsconfig 构建面、`@Remote` 装饰器、
多 seat 的 webserver 规模。那套是为几十个包 + Electron + 三种交付形态准备的。

### 「多线程」这条要更正

用不上 Web Worker。贵的是 I/O 与**宿主侧子进程**，浏览器主线程只是在等网络。
参照实现里 Worker 只用在文件上传与 excel/pdf 解析，`requestIdleCallback` 全仓 0 命中。
真正的并行来自：① 独立请求并发发出；② 宿主 Node 的 fs 线程池；③ 对子进程那一档限并发。

---

# 第一轮：立起后端边界

目标：handlers 能挂到任意载体；一条 RPC 约定；路由常量单一来源；桥可测且已有测试。

## 1.1 载体：`packages/core/src/host/server.ts`（新）

```ts
export type HubMiddleware = (
  request: IncomingMessage, response: ServerResponse, next: () => void
) => void | Promise<void>

export interface HubServerOptions {
  middlewares: readonly HubMiddleware[]
  static?: { root: string; index?: string }   // 省略即纯 API
  host?: string    // 默认 127.0.0.1；通配地址拒绝
  port?: number    // 0 = OS 分配，Electron/CLI 载体用
  log?: (level: "warn" | "error", message: string) => void
}

export function createHubServer(options: HubServerOptions): {
  listen(): Promise<{ url: string; port: number; close(): Promise<void> }>
}
```

- `host` 默认 `127.0.0.1`，通配地址**拒绝**——这台 server 会 spawn 子进程、写用户磁盘。
- `static` 做路径越界拒绝（`resolve` 后必须仍在 root 内）；明确的 MIME 表。

## 1.2 每个插件暴露一个 handler，Vite 壳整个不要（**已按 B 决定改**）

用户选定 **B：所有环境同一载体**。所以 Vite 不再挂载任何桥，"保留 3 行壳"那条被推翻：
`packages/*/vite.ts` 已 `git mv` 成 `packages/*/handlers.ts`，导出 `createXHandler(): HubMiddleware`。

```ts
// packages/plugin-mcp/handlers.ts
export function createMcpHandler(options: { home?: string } = {}): HubMiddleware {
  …
  return async (request, response, next) => { /* 现中间件正文 */ }
}
```

十个 handler 一个形状。唯一要改的 Vite 专有点：旧的 `packages/core/vite.ts:200`
`server.config.logger.warn` → `createStateHandler({ log })`，默认 `console.warn`。

两层各自的职责：**handler 不认识载体**（普通 `node:http` 形状），**载体只负责挂载**。

## 1.2b 唯一载体：`apps/web/server.ts`（新）

所有环境的入口，一个进程挂全部十个 handler：

```
node apps/web/server.ts [--port <n>] [--host <addr>] [--folder <path>]
                        [--static <dir>] [--home <dir>]
```

- `--port 0` 让 OS 分配，桌面宿主就是靠它把端口经自己的通道回传。
- `--static` 给构建形态伺服 `apps/web/dist`（含 SPA 深链回退：无扩展名的路径给 landing
  document，缺失的**文件**给 404——否则缺模块会拿到一段 HTML，报的是解析错而不是 404）。
- 不带 `--static` 就是纯 API，开发形态用这个。

## 1.2c 开发：两个进程，与其它形态同一份 handler

`apps/web/dev.ts`（`pnpm dev` 走它）同时起 hub server 与 Vite：

- hub server 是**真的子进程**（`spawn`），不是进程内调用——开发就跑同一个入口、同一组选项。
- Vite 只服务源码 + HMR，`vite.config.ts` 用 `server.proxy` 把 `/hub` 转给 hub server。
- 两个端口写在唯一一处 `apps/web/hub-port.ts`（`DEV_HUB_PORT = 5270`、
  `DEV_APP_PORT = 5271`），Vite 用 `strictPort: true`（被占就报错，不静默换端口）。
  理由见 `docs/memory.md`「收尾杀进程只能杀自己选的那个端口」——那是本轮踩出来的。
- 收尾**只需杀 5270**：`dev.ts` 里 `hub.on("exit")` 会把 Vite 一起关掉（已实测）。

## 1.3 路由常量单一来源

`/hub/plugins`、`/hub/prompts`、`/hub/skills` 照 `MCP_ROUTE` 样板：从各插件自己的 `src/`
导出，两端 import 同一份。不放 `packages/core`——core 拥有的是 core 服务的路由，
插件路由归插件自己。落在各自的 seam 模块（core 的 `STATE_ROUTE` 与 seam 类型同住 `state.ts`，
同例）：`SKILL_ROUTE` 进 `plugin-skills/src/store.ts`、`PROMPT_ROUTE` 进
`plugin-prompts/src/store.ts`、`PLUGIN_ROUTE` 进 `plugin-plugins/src/contract.ts`。

## 1.4 一条 RPC 约定 + 抽掉重复管道

**顺序已按用户决定改为：排在 1.5 的桥测试之后。** 今天桥零测试，在没有安全网的情况下
重写 1205 行、四种约定的桥，正是本轮最该避免的一步。

统一为：**读** `GET <route>?action=<name>&<params>`；**写** `POST <route>`，
body 是 `{ action: <name>, ...args }`；响应一律 JSON，失败 4xx + `{ error: string }`。

理由（**更正**：原写的"载体只有一条代码路径"是错的，载体看的是不透明的
`(req, res, next)`，四种约定对载体零成本）：真实收益只有两条——加 action 的人不用先
学这个模块用哪套（`docs/memory.md` 那条「跨进程字段名」bug 的来源），以及 `check-bridge.ts`
不用为每个模块特殊处理。

代价要说清：**先量过的真实规模是四套约定、共 1205 行**
（`plugin-skills` 481 行 28 处 `searchParams`、`plugin-plugins` 389 行 6 个 action 分支、
`plugin-prompts` 207 行、`plugin-mcp` 128 行 3 个 action 分支）；最重的那一个是 skills，
也是功能最多、最承重的。

`readBody` / `sendJson` / `sendError` / `bodyOf` 三处各抄一份，已抽到
`packages/core/src/host/http.ts`（顺带把 MIME 表收成一处，`contentTypeOf` 从 `core/vite`
搬到 `core/host/http`）；两端 client 侧各收一个 `callGet` / `callPost`。

## 1.5 桥的检查脚本：`packages/*/scripts/check-bridge.ts`（新）

起真 server（`port: 0`，`CONTEXT_HUB_HOME=<temp>`），逐个 action 真打一遍。
断言表 `{ route, action, params, expectKeys }`：不是 404/405；不是 `400 missing …`
（**两端参数名一致**——漂移的名字正好落在这里）；响应是 JSON 且含 `expectKeys`。

**自证**（`docs/memory.md`："扫描类脚本必须先自证"）：先种一个故意写错的参数名，
确认脚本**会红**，再改回。

## 1.6 非 dev 载体

`createHubServer` + `static: { root: "apps/web/dist" }`，`apps/web/package.json` 已加
`start`（`node server.ts --static dist`）。**不做 `configurePreviewServer`**——
有 `createHubServer` 再维护第二个非 dev 载体是重复。Electron 这一轮**不实现**，
只保证前置条件成立（handler 可挂任意载体、`port: 0` 可用、路由常量单一来源）。

## 阶段与验收（含实际进度）

- ✅ **R1-一 载体与管道**：`host/server.ts` + `host/http.ts` + `core/scripts/check-server.ts`，
  **31 项断言全绿**（真实端口、路由按序命中、未命中落 `static`、越界 403、静态非 GET 405、
  通配 host 被拒、handler 抛错/不答/重复 next 三种异常都被应答）。
  这个脚本第一次跑就抓到一个真 bug：`sendFile` 用 `pipe()` 交付，handler 的 promise 在
  流结束前 resolve，`writableEnded` 仍为 false → dispatch 误判"没应答"→ 写 500 撞上已发
  headers。修法是判断已应答要看 `headersSent || writableEnded`。**它就是脚本的自证。**
- ✅ **R1-三 路由常量单一来源**：三个常量已落位，7 处字面量已接过去（skills 客户端那
  25 处内联一并收掉）。验收命令：
  `grep -rn '"/hub/\(skills\|prompts\|plugins\)"'` 全仓只剩定义那三处。
- 🔄 **R1-二 handlers 抽离**：**10 个 handler 已全部完成**，`packages/*/vite.ts` 已
  `git mv` 成 `handlers.ts`，`./vite` 导出换成 `./handlers`。用带断言的 codemod
  （`scripts/extract-bridges.mjs`，锚点找不到就报错退出）做机械变换 + 按行范围 dedent，
  并用 `git diff -w` 验证"只剩结构性改动"（每个桥约 12 行）。
  **17 个既有检查脚本全绿**，全仓 23/23 typecheck、5 个包 lint 干净。
- ➡️ **R1-五 桥的检查脚本**、**R1-四 统一 RPC 约定**：**已抽到下一份计划**，本轮不实现。
  用户要求先抽出来——中间还要改造别的地方。见
  `docs/plans/rpc-conventions-and-preload.md`。
- ✅ **R1-六 非 dev 载体 + 文档**：`start` script 与 `--static` 已就位；**B 方案端到端已实测**
  （见下）；README 写明了两个进程、端口来源、以及"现在还没有统一约定"这件事。

## 后续：已抽出的阶段

剩下的三件事不在本文档，在 **`docs/plans/rpc-conventions-and-preload.md`**：

1. 桥的检查脚本（安全网，最先）；
2. 统一 RPC 约定（排在检查脚本之后）；
3. 启动时并行预加载 + 共享状态。

那份文档里同时记了三条**在本文档写作之后被证伪或过期**的前提（prompts 的 `name`/`id`
语义已变；"统一约定是为了让载体只有一条代码路径"这个理由是错的；四套约定的真实行数），
开始下一阶段前先读它开头那一节。

### B 方案端到端实测（2026-10-16）

`node dev.ts` → hub server 5270 + Vite 5271，headless Edge 经 CDP 验证：

- 启动 6 个请求（`/hub/state`、`POST /hub/place-files`、`/hub/prompts`、`/hub/skills?limit=0`、
  `/hub/workspaces`、`/hub/extensions`）**全部 200，2 秒内发完**；
- Overview 渲染出 61KB DOM（Skills 42 / MCP 8 / Plugins 17 / tokens 18.4k），**零报错**；
- SPA 深链 `/skills` 正常（Vite 的 SPA 回退 + `BrowserRouter`），页面读到真实 skill 行；
- 反例也测了：直接 `node apps/web/server.ts` 时 7 个路由全部 200 + `application/json`，
  证明后端确实不依赖 Vite。

### 测试期的临时收窄：只引入 claude-code

用户要求测试期只引入 claude-code 插件。`apps/web/src/lib/hub.ts` 已移除其余 12 个
agent 扩展的 import 与注册项（`@workspace/agent-*` 的依赖仍在 `apps/web/package.json`，
只是不再 import，所以不进模块图）；代码与包都还在，加回列表即恢复。
