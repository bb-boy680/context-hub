# 下一阶段：桥的检查脚本 → 统一 RPC 约定 → 启动预加载与共享状态

> **状态：未开始。** 用户明确要求先把这一阶段抽出来、不要实现——中间还要改造别的地方。
> 开始前请先读「开始前必须核对」一节，里面有几条是在这轮里被证伪或过期的前提。

## Context

上一轮（`docs/plans/backend-boundary-and-preload.md`）立起了后端边界，已经完成：

- 10 个桥从 Vite 插件变成**载体无关的 handler**（`packages/*/handlers.ts`，
  `createXHandler(): HubMiddleware`），`packages/*/vite.ts` 已不存在。
- 唯一载体 `apps/web/server.ts`（`createHubServer` + `--static`），开发由 `apps/web/dev.ts`
  起两个进程（hub server 5270 + Vite 5271，端口钉在 `apps/web/hub-port.ts`）。
- 路由常量单一来源：`SKILL_ROUTE` / `PROMPT_ROUTE` / `PLUGIN_ROUTE`，
  全仓只剩这三处定义。
- 管道（`readBody`/`sendJson`/`sendError`/`contentTypeOf`）已收到
  `packages/core/src/host/http.ts` 一处。

剩下三件事，按下面的顺序做，理由是**安全网先于重写**。

## 开始前必须核对（过期/被证伪的前提）

1. **prompts 的语义已经变过，本节里凡涉及 prompts 的描述都要重读再动。**
   本文件写作时 HEAD 是 `75cf7a4`；`edfb1d2`（"give a prompt a name of its own"）把
   prompts 从「`description` 就是名字、`id` 由 description 算 slug」改成了
   **「独立 `name` 字段 + 不透明 `id`、可由 `update`/`remove` 定位」**。
   凡是按旧口径写的地方（`PromptPage` 的键、去重键、投递文件名、幂等标记）
   都要按 `packages/plugin-prompts/src/store.ts` 的**当前**内容重新核。
2. **"统一 RPC 约定是为了让载体只有一条代码路径"是错的**，别再用这个理由。
   载体看到的是不透明的 `(request, response, next)`，四套约定对载体**零成本**。
   真实收益只有两条：加 action 的人不用先学这个模块用哪套；检查脚本不用为每个模块特判。
3. **先量再动**：四套约定共 1205 行（`plugin-skills` 481 行/28 处 `searchParams`、
   `plugin-plugins` 389 行/6 个 action 分支、`plugin-prompts` 207 行、`plugin-mcp` 128 行）。
   最重的是 skills，也是功能最多、最承重的——它是这一步的主要风险来源。
4. 路由常量**已经做完**，不要重做。

---

## 阶段 A：桥的检查脚本（安全网，必须最先）

`packages/*/scripts/check-bridge.ts`（新）。

做法：用真 server（`port: 0`，`CONTEXT_HUB_HOME=<temp>`，绝不碰 `~/.context-hub`），
逐个 action 真打一遍。断言表 `{ route, action, params, expectKeys }`，每条断言：

- 不是 404/405 —— 路由挂上了；
- 不是 `400 missing …` —— **两端参数名一致**（漂移的名字正好落在这里）；
- 响应是 JSON 且含 `expectKeys`。

**自证**（`docs/memory.md`："扫描 / 审查类脚本必须先自证"）：先种一个故意写错的参数名，
确认脚本**会红**，再改回。否则"全绿"和"这个检查根本不会失败"长得一样。

**验收**：全绿，**且种入错误参数名时确实变红**。

## 阶段 B：统一 RPC 约定

统一为：**读** `GET <route>?action=<name>&<params>`；**写** `POST <route>`，
body 是 `{ action: <name>, ...args }`；响应一律 JSON，失败 4xx + `{ error: string }`。

选它的理由：GET 读**可直接 curl**，而 curl 是这套桥当前唯一的验证手段
（`docs/memory.md` 明写）；它是 `plugin-plugins` 的现有约定，最大的模块不用动。

现状四套（改前先按当前代码核对一遍）：

| 模块 | 现状 |
|---|---|
| `plugin-skills` | GET 与 POST 都用 query 里的 `?action=`；路径子路由（`/<id>/assets`、`/<id>/files/<path>`）再叠 REST 方法；资产上传走裸字节 |
| `plugin-plugins` | 读用 query、写用 body（**目标约定**） |
| `plugin-prompts` | 纯 REST（`PATCH`/`POST`/`DELETE`） |
| `plugin-mcp` | POST + body 里的 `action` |

`plugin-mcp` 的读改成 GET；两端 client 侧各收一个 `callGet` / `callPost`。

**验收**：每改完一个模块，用 curl 真打读写各一条，并确认该模块页面照常工作。
**逐个模块做，不一次改完**——这是本阶段唯一有功能回归风险的地方。

## 阶段 C：启动时并行预加载 + 共享状态

### 起因

四个资产页面（Skills / MCP / Plugins / Prompts）今天都**只在进入页面时**才读数据，
读取逻辑住在各自的 React hook 里（mount 时 `queueMicrotask(() => void read())`）。
组件卸载 state 一起丢，再进来重读一遍。于是全局 Ctrl+K
（`apps/web/src/components/search-palette.tsx`，今天是一份写死的假数据）
在任何"从未进过那四个页面"的会话里查不到任何真实资产——数据根本没被读过。

### 用户已定的口径（仍有效）

1. 预加载范围：**全部启动时立即加载**，含 MCP 的 probe（每 server 一个子进程）与
   Plugins 的安装器探测（每客户端跑 CLI）两档。用户在了解代价后确认过。
2. 预加载后页面**改**成读共享状态（一份数据一个来源）。
3. Ctrl+K 面板**不接**真实数据，只做加载层与状态管理。
4. 状态：**服务 + immer 做转换**（不上 React Provider）；
   `use-immer` 只用在**两处**嵌套/键控的本地 state。
5. 读取层上 **`useSyncExternalStoreWithSelector`**。

### 依赖新增（版本已核实）

| 包 | 版本 | 装在哪 | 为什么不够 |
|---|---|---|---|
| `immer` | `^11`（当前 `11.1.21`） | `packages/extensions` | 按键合并 + "没改就返回原引用"这个判据；手写 spread 两者都给不了 |
| `use-sync-external-store` | `^1.7.0`（lockfile 已在，peer `react ^19` ✓） | `packages/extensions` | React 内置只有裸 `useSyncExternalStore`；selector 版让"只在该 slice 变化时重渲染"成立 |
| `use-immer` | `^0.11.0`（peer `react ^19` ✓） | `plugin-skills`、`plugin-mcp` | 两处本地表单 state 的按键/多字段更新 |

**不需要 `enableMapSet()`**（不对 `Set` 做 immer 化）。
安装一律带 `dangerouslyDisableSandbox: true`（`docs/memory.md` 已记两次沙箱丢包导致 pnpm 挂死）。

### C.1 通用目录（新）`packages/extensions/src/catalog.ts`

React-free 的可订阅单源加载器，内部转换全走 `produce`。**single-flight 与代际守卫收在这里**
——这是相对参照实现（deepseek-harness）的唯一改进：它每个域各抄一份
（`settings-mirror.ts:114-124`、`manager-store.ts:760-770`），我们只写一处。

```ts
export type CatalogStatus = "idle" | "loading" | "ready" | "error"

export interface CatalogState<S> {
  status: CatalogStatus
  value: S | null        // 上一次成功读到的快照，reload 期间保留
  failure: string | null
  at: number
}

export interface Catalog<S> {
  state(): CatalogState<S>
  subscribe(listener: () => void): () => void
  load(): Promise<void>      // single-flight；已 ready 直接返回
  reload(): Promise<void>    // 丢旧值重读；页面写完之后调
  update(recipe: (draft: S) => void): void   // recipe 无改动 → immer 返回原引用 → 不 announce
}

export function createCatalog<S>(options: {
  initial: S
  read: (commit: (recipe: (draft: S) => void) => void) => Promise<S>
}): Catalog<S>

export function mapLimit<T, R>(limit: number, items: readonly T[],
  run: (item: T, at: number) => Promise<R>): Promise<R[]>   // 子进程那一档的并发上限
```

代际守卫内置，**四个库不再各自持 generation ref**
（`plugin-plugins/src/library.ts:443-491` 今天根本没有，并发 `read()` 会互相覆盖——顺带修掉）。
失败只写 `failure`，**`value` 不清空、不抛给调用方**（后端可能不存在，降级必须是默认行为）。

`packages/extensions/scripts/check-catalog.ts` 的断言：并发 `load()` 只调一次 `read`；
`reload` 期间 `value` 不变；`read` 抛错 → `error` + 旧 `value` 保留 + promise 不 reject；
**迟到的旧代际答案被丢弃**；`subscribe` 每次真实变更恰好一次；
**`update` 传空 recipe 时 `value` 引用不变且不触发 subscribe**；`mapLimit` 并发不超上限、
顺序稳定、单项失败不吞掉其它项。

### C.2 React 读取层：`useCatalog`（追加到 `packages/extensions/src/react.tsx`）

```ts
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector"

export function useCatalog<S, T>(catalog: Catalog<S>,
  select: (state: CatalogState<S>) => T, isEqual?: (a: T, b: T) => boolean): T
```

`isEqual` 省略时按 `Object.is`。这样"某一条 MCP 探测答案落定"只让读那一行的组件重渲染。

### C.3 四个库：把「读」从 hook 搬进 Catalog

**关键约束**：页面读到的必须**就是**启动时读出来的那一份，不能是第二个请求。
所以 store 归**插件自己**（它知道传输），由插件在 activate 时发布在自己的服务上；
调度归 **form**（`apps/web`）。**四个 hook 的返回形状不变**，因此 `page.tsx` 四个大文件基本不动。

每个包新增 `src/catalog.ts`，把现在住在 hook 里的 state / generation / `Promise.all`
**原样搬进去**（机械搬移），hook 缩成 `useCatalog(...)`，无编排时自己兜底 `load()` 一次。

`places` 从"组件传给 hook"改成"store 从 `ctx` 自己算"——`readablePlaces`
（`plugin-skills/src/library.ts`）已是导出纯函数。store 自己订阅 `hub.workspaces` 与
`extensions/changed` 做 reload（今天页面就是靠它们当 reload key，语义不变）。

- **Prompts**（最简，先做）：`rows`/`tags`/`root`/`loading`/`error`/generation →
  一次 `store.list()`。**⚠ 动手前重读 `plugin-prompts/src/store.ts`**——见「开始前必须核对」第 1 条。
- **Skills**：`page`/`held`/`tags`/`loading`/`error`/generation；
  `list` + 每 place `placeSkills` + `tags` 照旧 `Promise.all`。
- **MCP**：`records`/`scan`/`checks`/`testing`/`busy`/`failure`/`canProbe`；
  **把 `probeAll` 从 `read()` 拆成独立一步**、每个答案用 `commit` 逐条落定；
  保留 `PROBE_CONCURRENCY = 3` 与"只 probe 缓存无答案的"两条既有语义。
- **Plugins**：`records`/`scanned`/`clients`/`root`/`missing`/`busy`/`failure`；
  `probeInstallers`（现在无上限 `Promise.all`）改走 `mapLimit`。

### C.4 `use-immer` 的落点（只有两处）

| 位置 | 现状 | 换成 |
|---|---|---|
| `plugin-skills/src/search-dialog.tsx:303,356` | `details: Record<string, Partial<RemoteSkill>>` + `setDetails(c => ({...c, [key]: detail}))` | `useImmer` + 按键赋值 |
| `plugin-mcp/src/add-server-dialog.tsx:67` | `values: ServerFormValues` 多字段表单对象 | `useImmer` + 逐字段赋值 |

（行号是写作时的；动手前按当前代码核对。）实施中若又发现同型的按键/多字段 state 一并换；
**没有就到此为止，不为了用而用**。

### C.5 启动编排（`apps/web/src/lib/catalog.ts` + `hub.ts`）

`kernel.start()` **之后**并发开火、**不 await**：

```ts
void Promise.allSettled(catalogs.map((one) => one.load()))
return kernel          // .then 立刻渲染，加载在后台继续
```

- 必须在 `kernel.start()` 之后：registry providers 要等各 agent 扩展 activate 完才注册。
- `load()` 内部先 `await workspaces.refresh()` 再算 places——今天这步是 fire-and-forget
  （`apps/web/src/lib/hub.ts` 的 `void workspaces.refresh()`），不 await 会让四个库算不到 places。
- 不影响首屏靠的不是让路，而是：`load()` 不被 await + 子进程两档各自限并发 +
  每个 store 独立落定。单个源失败只写它自己的 `failure`。

### 阶段 C 验收

- **C-一 通用目录层**：`check-catalog.ts` 全绿（断言见上）；该包 typecheck / lint 通过。
- **C-二 Prompts**：不进 `/prompts` 时 `GET /hub/prompts` 已发出；进页面**不再产生第二个**请求。
- **C-三 Skills**：切 workspace 后列表跟着重读；预加载已发 `list` + `tags` + 每 place 一次 `place`。
- **C-四 MCP**：启动后 `cache.json` 出现缓存无答案的名字，**已有答案的不被重探**；并发 ≤3。
  **这一档会真的起 MCP 服务器进程，验证用 `CONTEXT_HUB_HOME=<temp>` 的第二台 dev server。**
- **C-五 Plugins**：`probeInstallers` 并发不超上限；`restore` 仍只由页面的 `missing` 触发
  （**不因预加载而自动下载**）。
- **C-六 接线 + 文档**：冷启动后首屏可见时间与改动前相当；四个库的 `list` 类请求
  首屏前后各只出现一次；收尾走一次 `aoci_maintain`（树静下来之后，见风险 6）。

---

## 不做

- **不接 Ctrl+K 面板**（用户已定）。共享状态建好，面板另说。
- **不引入 `typert` / 双构建面 / `@Remote`**（那是为几十个包 + 三种交付形态准备的）。
- **不做 `configurePreviewServer`**：有 `createHubServer` 再维护第二个非 dev 载体是重复。
- **不实现 Electron**，只保证前置条件成立（handler 可挂任意载体、`port: 0` 可用）。
- **不把 Plugins 的 `restore` 移进预加载**：那是网络下载 + 写盘，是修复动作，留在页面。
- **不上 React Provider**：共享状态走 kernel 服务，与 `hub.workspaces` 同一形状。
- **不对 `Set`/`Map` 做 immer 化**，因此**不调 `enableMapSet()`**。
- **不把标量 state**（`view`/`tab`/`page`/`query`）**包进 `produce`**。
- **不动 `remote-store.ts` 的 `subscribe`**：桥不推送；多标签页不同步，本轮不管。
- **不引入 Worker / Suspense / React.lazy / requestIdleCallback / 路由级拆包**。
  贵的从来是 I/O 与宿主侧子进程，浏览器主线程只是在等网络。
- **不预加载行级细节**：`useSkillDocument`、`usePackReadme`、`useInstalled`——
  进预加载会把请求数从"每库一次"放大到"每行一次"。

## 风险

1. **统一 RPC 约定要动 `plugin-prompts` 的整个 store 与页面**（REST → action 信封），
   是阶段 B 唯一有功能回归风险的一步。对策：逐个模块做、每步 curl 真打读写各一条。
2. **MCP probe = 启动用户配置的 MCP 服务器进程**（每 server 一个子进程、30s 超时，
   `plugin-mcp/src/host/probe.ts`），并写 `cache.json`。只对缓存无答案的名字跑，
   但**这是行为变更**：以前"进页面才起服务器"，以后"应用一起来就起"。
   参照实现（deepseek-harness）根本不做这件事。实施后要实测首屏代价。
3. **Plugins 的 `describe` 名义是读、实际写盘**：`plugin-plugins/src/host/describe.ts` →
   `host/logo.ts` 的 `assets.put()`。预加载会把这次写提前并放大（每 pack 一次）。
4. **`use-immer` 实际落点只有两处**，做完只出现在两个文件里是**预期内的**。
   参照实现连 `use-immer` 都没装。不要为了让依赖"值回票价"去 immer 化标量 state。
5. **四个 hook 是仓库里最大的几个文件**（skills 的 `library.ts` 500+ 行），搬移机械但面大；
   每个阶段单独跑 typecheck + 该包 `check-*.ts`，不一次改完再验。
6. **`aoci_maintain` 必须等树静下来再跑**：本仓有多个 session 同时在写
   （见 `docs/memory.md` 末两条）。跑之前先确认：
   `find packages apps docs -newermt "-20 minutes" -type f -not -path "*/node_modules/*"`
   出现**不属于本次任务**的文件就停下问用户。
7. **收尾杀进程只杀 `apps/web/hub-port.ts` 里那个 `DEV_HUB_PORT`**，Vite 会跟着退出；
   **永远不要按端口去杀 Vite**（本仓已因此误杀三次，见 `docs/memory.md`）。
