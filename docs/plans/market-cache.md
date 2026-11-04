# skills.sh 市场缓存计划

- 日期：2026-10-29
- 状态：草稿，待用户审批
- 范围：`packages/market/skills-sh`，以及必要的插件内测试和 i18n
- 不改：`packages/core`、`/hub/net` 的 10 秒超时、非市场模块、依赖

## 1. 问题

skills.sh 的公共 API 没有边缘缓存（`X-Vercel-Cache: MISS`、`Age: 0`），榜单首包实测 2–4 秒，偶发超过 `/hub/net` 的 10 秒上限。当前 `SkillMarket` 只有进程内 TTL 缓存：

- 页面刷新后内存缓存丢失，又得等 2–4 秒；
- 超时后即使之前看过榜单，也没有可显示的数据。

目标：**打开市场页先用上次结果立即渲染，再后台刷新；刷新失败时保留旧数据。**

## 2. 调研结论

实际查看了以下文件：

| 文件 | 结论 |
| --- | --- |
| `packages/extensions/src/host.ts:16` | `StoragePort` 提供同步 `read(key): unknown` 和 `write(key, value): void`，值由 form 持久化。 |
| `apps/web/src/lib/hub.ts:172` | web/desktop 的 `storage.read` 在 kernel 启动前从 `/hub/state` 一次性读入内存；`write` 先改内存，再异步 `PUT /hub/state/<name>`。 |
| `packages/core/src/state.ts:22` | state 名必须是 `^[a-z][a-z0-9-]*$`；一个名字对应 `<hub home>/state/<name>.json`。 |
| `packages/core/handlers.ts:146` | `GET /hub/state` 会把所有 state 文档读出来，所以缓存文档要有体积上限。 |
| `docs/memory.md`（主题/localStorage 教训） | 桌面 hub server 端口每次可能不同，localStorage 按 origin 隔离；持久缓存不能只放 localStorage。 |
| `packages/market/skills-sh/src/service.ts` | rank/search 5 分钟、files 30 分钟、audit 24 小时；`createTtlCache` 只在内存。 |
| `packages/market/skills-sh/src/page.tsx` | 榜单/搜索用 `useState(null)` + effect 请求；切 view 时旧数据不会立即清空。 |
| `packages/market/skills-sh/src/detail-dialog.tsx` | 打开时并发请求 download 和 audit，失败各自 toast。 |
| `apps/web/src/lib/preload.ts` | 已有 `PRELOADED` 启动预取模式，但它会为未打开的页面也发网络请求。 |

判断：

- 用 `ctx.host.storage`，不用 localStorage。前者跨 origin/端口、跨 web/desktop 共用，且启动时可同步读到。
- 缓存文档控制在 200KB 以内，避免明显拖慢 `/hub/state` 的启动读取。
- 不新增启动预取：持久缓存已经能让首屏立即有内容；再加启动请求会重新引入超时噪音，收益只在“第一次安装后首次打开”这一种情况。

## 3. 缓存什么

### 持久化

| 数据 | 范围 | 体积估计 | 理由 |
| --- | --- | --- | --- |
| 榜单第一页 | 三个 view（all-time / trending / hot）各一条 | 约 35KB × 3 ≈ 105KB | 首屏最慢、最常用，收益最大 |
| 审计 | 按 skill 缓存成功/404，最多 50 条 | 约 1KB × 50 ≈ 50KB | 详情弹窗每次打开都请求；体积小 |

只持久化榜单 `page === 0`。`加载更多` 翻到的第 1、2… 页继续走现有内存缓存，不落 state，避免文档无限增长。

### 不持久化

- **搜索**：查询基数大，单条结果约 30KB；继续用 5 分钟内存缓存。
- **文件预览**：单个包可能几十 KB 到数 MB，落 state 会污染启动读取；继续用 30 分钟内存缓存。
- **搜索结果和文件预览的 404/空结果**：不落盘。

## 4. 缓存到哪里

### 文档名

`market-skills-sh`，满足 `assertStateName` 的 `^[a-z][a-z0-9-]*$`。

实际位置：

```
<hub home>/state/market-skills-sh.json
```

### 文档结构

新增 `packages/market/skills-sh/src/cache-document.ts`：

```ts
export const MARKET_CACHE_DOCUMENT = "market-skills-sh"
export const MARKET_CACHE_VERSION = 1
export const MARKET_CACHE_MAX_STALE = 7 * 24 * 60 * 60_000

export interface MarketCacheDocument {
  version: 1
  rank: Partial<
    Record<MarketView, { at: number; page: MarketRankPage }>
  >
  audit?: Record<
    string,
    { at: number; audit: MarketAudit | null }
  >
}
```

约束：

- `version` 不匹配：整份文档忽略，按空缓存处理。
- `rank` / `audit` 不是对象，或单条记录缺 `at` / `page` / `rows`：跳过该条，不影响其他条。
- 读取时丢弃 `now - at > MARKET_CACHE_MAX_STALE`（7 天）的条目；7 天是“兜底可用年龄”，不是刷新 TTL。
- 写入前裁剪：`rank` 最多 3 条；`audit` 最多 50 条，按 `at` 保留最新的。
- 只写 `version: 1` 的完整文档，不做字段补丁。

### 为什么不用 localStorage

`docs/memory.md` 已记录：桌面端端口可能每次启动不同，localStorage 跟着 origin 走，重启后读不到。`ctx.host.storage` 落在 hub home，是这台机器上的持久状态，符合缓存的语义。

## 5. 怎么获取

### 服务层

修改 `SkillMarket`：

```ts
constructor(ctx: Context) {
  ...
  this.storage = ctx.host.storage
  this.document = readMarketCache(this.storage.read(MARKET_CACHE_DOCUMENT))
  this.hydrate()
}

/** 上次榜单第一页；没有或超过 7 天返回 null。 */
peekRank(view: MarketView): MarketRankPage | null

/** 上次审计；`undefined` 表示没缓存过，`null` 表示缓存过 404。 */
peekAudit(source: string, skill: string): MarketAudit | null | undefined
```

- `hydrate()`：把仍在 rank TTL（5 分钟）内的持久化榜单写回内存 `cache`，让 `rank()` 直接命中，不发网络请求；审计按自身的 TTL 回填（有审计 24 小时，404 为 10 分钟）。
- `rank(view, page)` 成功且 `page === 0` 时：更新 `document.rank[view] = { at: Date.now(), page }`，裁剪后 `storage.write(MARKET_CACHE_DOCUMENT, document)`。
- `audit()` 成功或 404 时：更新 `document.audit[key] = { at, audit }`，裁剪后写回。
- 网络失败**不写**缓存；`document` 保持原值。
- 读到的文档结构不合法：`readMarketCache` 返回空文档；不抛错、不覆盖磁盘上的旧文档（等下一次成功请求自然重写）。

不加 `load()`，也不把市场服务加入 `PRELOADED`。页面自己会在需要时请求。

### 页面层

`page.tsx` 的榜单：

```ts
const cached = market?.peekRank(view) ?? null
const activeRank = rank !== null && rank.view === view ? rank : cached
```

- 首次渲染：`activeRank` 来自磁盘缓存，直接渲染表格，不显示骨架屏。
- 同一个 view 的缓存仍在 5 分钟内：`market.rank(view, 0)` 命中内存，不发网络请求。
- 缓存过期：先显示旧表格，effect 后台请求；成功后替换，失败则保留旧表格并 toast。
- 没有缓存：保持现有骨架屏 → 失败空态 + 重试。
- 切换 view：`activeRank` 取该 view 自己的缓存；没有缓存时显示骨架屏，不沿用上一个 view 的行。

搜索保持现状：无持久缓存，输入后请求。

详情弹窗：

- audit 用 `peekAudit` 初始化；有缓存时先显示审计，再后台刷新。
- download 继续走 30 分钟内存缓存，不落盘。
- 404 缓存：`peekAudit` 返回 `null` 表示“上次确认没有审计”，详情显示现有空态，不重复请求直到 TTL 过期。

## 6. 怎么兜底

| 情况 | 行为 |
| --- | --- |
| 刷新成功 | 覆盖内存和 state，页面显示新数据 |
| 刷新失败/超时，且有缓存 | 保留缓存数据，页面不进入失败态；toast 提示使用了上次结果 |
| 刷新失败/超时，且无缓存 | 保持现有失败空态 + 重试按钮；toast 显示超时文案 |
| 缓存超过 7 天 | 视为不存在，走无缓存路径 |
| state 文档损坏/版本不匹配 | 忽略整份文档，走无缓存路径；不崩溃 |
| 部分条目损坏 | 只跳过损坏条目 |
| state 写入失败 | 内存缓存仍有效；不向用户报错（缓存是尽力而为，不影响当前页面） |
| 页面在请求期间关闭/切换 | 现有 `live` 标记阻止过期结果写回 UI；缓存写入仍可发生，不影响正确性 |

新增 i18n 文案（插件自己的 `src/i18n`）：

- `market.state.cached`
  - 中文：`skills.sh 响应超时，显示上次结果`
  - 英文：`skills.sh timed out. Showing the last result.`

超时且无缓存时继续用已有的 `market.state.timeout`。

## 7. 分阶段

### 阶段 1：缓存文档与服务层

**目标**：持久化榜单第一页和审计，服务启动时 hydrate，读缓存不发网络。

**改动文件**

- 新增 `packages/market/skills-sh/src/cache-document.ts`
  - 文档类型、版本、`MARKET_CACHE_MAX_STALE`、`readMarketCache()`、`pruneMarketCache()`。
- 修改 `packages/market/skills-sh/src/service.ts`
  - 注入 `ctx.host.storage`，构造时 hydrate。
  - 新增 `peekRank()` / `peekAudit()`。
  - `rank()` / `audit()` 成功后写回文档。
- 修改 `packages/market/skills-sh/__test__/market-service.test.ts`
  - 测试 context 增加 fake storage。
- 新增 `packages/market/skills-sh/__test__/market-cache-document.test.ts`
  - 坏文档、版本不匹配、条目裁剪、7 天过期。

**验收**

- 持久化文档里有一条 1 分钟前的榜单：`rank("all-time", 0)` 不调用 `net.request`。
- 持久化文档里有一条 6 分钟前的榜单：`rank` 会请求网络；成功后 storage 收到新 `at`。
- 网络失败时 storage 内容不变。
- 文档结构损坏时服务可正常构造，`peekRank` 返回 `null`。
- `pnpm --filter @context-hub/market-skills-sh typecheck/lint/test` 通过。

### 阶段 2：页面首屏与兜底

**目标**：刷新页面后先用缓存渲染；刷新失败保留缓存。

**改动文件**

- 修改 `packages/market/skills-sh/src/page.tsx`
  - 用 `peekRank` 初始化/派生 `activeRank`。
  - 切 view 时不沿用上一个 view 的行。
  - 失败时根据是否有 `activeRank` 决定“保留 + toast”还是失败空态。
- 修改 `packages/market/skills-sh/src/detail-dialog.tsx`
  - audit 用 `peekAudit` 初始化。
  - download 仍按现有内存缓存。
- 修改 `packages/market/skills-sh/src/i18n/en.ts`、`zh-cn.ts`
  - 增加 `market.state.cached`。
- 必要时新增 `packages/market/skills-sh/__test__/market-page-state.test.ts`
  - 把“当前 view 的有效榜单”抽成纯函数再测；如果不抽纯函数，则本阶段用浏览器验收。

**验收**

- 成功加载一次后刷新页面：表格立即出现，不经过 10 行骨架屏。
- 5 分钟内再次刷新：Network 里没有新的 `/hub/net` 榜单请求。
- 超过 5 分钟刷新：先显示旧表格，网络成功后替换。
- 用 DevTools 阻断/超时 `/hub/net` 后刷新：旧表格保留，出现 `market.state.cached` toast。
- 从没成功加载过时阻断网络：显示失败空态 + 重试。
- 三个 view 切换互不串数据。
- `pnpm --filter @context-hub/market-skills-sh typecheck/lint/test` 通过。

### 阶段 3（可选）：审计缓存验收

**目标**：确认详情弹窗的审计也能跨刷新复用，并验证 50 条上限。

**改动文件**

- `packages/market/skills-sh/src/detail-dialog.tsx`（如果阶段 2 没接完）
- `packages/market/skills-sh/__test__/market-service.test.ts`
- `packages/market/skills-sh/__test__/market-cache-document.test.ts`

**验收**

- 打开过详情的 skill，刷新后再打开：审计直接显示，不先显示加载行。
- 没有审计的 skill 缓存 `null`，TTL 内不重复请求。
- 超过 50 条时最旧的被裁掉。

## 8. 不做的事

- 不改 `/hub/net` 的 10 秒超时，不改 `createNetHandler`。
- 不用 localStorage，不改 `PlatformHost` / `StoragePort` 契约。
- 不持久化搜索和文件预览。
- 不做启动预取（`PRELOADED` 不加入市场服务）。
- 不新增依赖。
- 不改非市场模块；`apps/web` 不需要改动。

## 9. 风险

1. **state 体积**：榜单 3 条约 105KB，审计最多约 50KB；`GET /hub/state` 启动时全量读取，增加约 150KB。可接受；如果实测启动变慢，把审计上限降到 25 条。
2. **写入顺序**：`StoragePort.write` 没有返回 Promise，多个 view 同时成功时可能出现 PUT 乱序。榜单第一页只在打开/刷新时请求，且写入的是累积快照，风险低；如果实际出现丢条目，再加防抖/串行写。
3. **旧数据误导**：最长保留 7 天，榜单会明显过时。页面只在刷新失败时使用兜底，并 toast 说明；不会把旧数据伪装成最新。
4. **UI 测试缺口**：当前包没有 React DOM 测试环境。阶段 2 的页面行为以浏览器验收为主；可把有效榜单选择逻辑抽成纯函数补单测。

## 10. 需要拍板

1. 持久化范围是否按“榜单第一页 + 审计”执行，搜索和文件预览不落盘？
2. 兜底 toast 是否使用 `skills.sh 响应超时，显示上次结果`，还是失败时静默保留旧数据？
3. 7 天的兜底最大年龄是否合适？
