# 插件市场实施计划

> 状态：已完成（2026-10-30）。详情弹窗的 UI 重构另起新任务。
> 设计稿：`designs/market/plugins.pen`，预览见 `designs/market/market-main.png`、
> `market-detail.png`、`market-detail-states.png`、`market-install.png`、
> `market-states.png`、`market-architecture.png`
> 本轮只做两个内置来源：Claude Code 官方、Codex 官方。不做用户添加来源。

## 目录结构

用户确认的工程结构，按现有 `packages/market/skills-sh` 的同级方式放置：

```
packages/market/
  skills-sh/                   已有，不动
  plugins/                     @context-hub/market-plugins
    src/
      index.ts                 export marketPluginsExtension
      extension.ts             manifest / nav / route / locales / registry
      contract.ts              MarketEntry / MarketSource / MarketSourceRegistry
      cache.ts                 TTL + single-flight
      apis/                    页面调 host 的接口层，组件不直接 fetch
        library.ts             GET /hub/plugins?action=list、POST market-install
        index.ts
      page.tsx                 目录页
      rows.ts                  合并 / 分类 / 搜索 / 来源筛选
      hooks.ts                 registry 订阅、来源读取、来源状态
      icons.tsx                分类图标兜底、可见行富化
      detail-dialog.tsx
      install-dialog.tsx
      i18n/en.ts
      i18n/zh-cn.ts
    __test__/
  claude-plugins-official/     @context-hub/market-claude-plugins-official
    src/
      index.ts                 extension
      source.ts                缓存、注册、enrich 编排
      apis/
        client.ts              NetPort → JSON，状态码/解析错误
        marketplace.ts         .claude-plugin/marketplace.json → MarketEntry[]
        types.ts               原始索引类型
    __test__/
  codex-plugins/               @context-hub/market-codex-plugins
    src/
      index.ts                 extension
      source.ts                缓存、注册、enrich 编排
      apis/
        client.ts              NetPort → JSON
        marketplace.ts         .agents/plugins/marketplace.json → MarketEntry[]
        manifest.ts            .codex-plugin/plugin.json → logo + description
        types.ts               原始索引/manifest 类型
    __test__/
```

`@context-hub/plugins`（`packages/resources/plugins`）仍然是插件库与安装引擎，不承载
市场页面。市场页面包依赖它；它不反向依赖市场页面包，避免包循环。

## 目标

1. 侧栏 `market` 组新增「插件市场」，路由 `/market/plugins`，由
   `@context-hub/market-plugins` 扩展注册。
2. 两个来源以独立扩展注入：
   `@context-hub/market-claude-plugins-official`、`@context-hub/market-codex-plugins`。
   每个扩展负责自己的格式适配，把来源 JSON 归一化成同一个 `MarketEntry`。
3. 页面默认合并全部来源，按规范化分类分组，两列目录；左侧来源栏可收窄来源；
   搜索在当前来源集合内跨源过滤；无分页，整页滚动。
4. 行内展示真实图标；Codex 图标与描述按需从 manifest 富化，Claude 使用仓库 owner
   头像或分类图标兜底；全部懒加载并缓存。
5. 详情使用居中弹窗（`DialogSplit`），安装使用居中弹窗；安装走
   `POST /hub/plugins { action: "market-install" }`，索引有 sha 时按 sha 钉住。
6. 覆盖加载、来源失败、无结果、无来源、安装失败五类状态。
7. 中文文案、可访问性、测试、AOCI 维护随代码一起交付。

## 非目标

- 不做 `Add source`、用户自定义来源、来源编辑/删除 UI。来源由扩展启用/禁用决定。
- 不支持第三种格式，也不为「未来任意格式」预建插件注册协议；新增格式是新增一个
  source 扩展，复用本计划定义的 `MarketSource` 契约。
- 不做服务端搜索/分页；两个来源合计 380 条，客户端处理。
- 不做市场内批量安装、批量更新、无限滚动。
- 不把市场条目写进全局搜索；市场数据在远端，`SearchContribution` 是同步契约。
- 不改 `docs/plans/market-plugin.md` 里已作废的单体 `packages/market` 方案；
  本计划遵循当前 `packages/market/skills-sh` 的「每来源一个内置扩展」结构。

## 当前代码事实

| 位置 | 现状 |
| --- | --- |
| `packages/resources/plugins/src/index.ts` | `pluginsExtension` 注册 `/plugins`、nav、locale、settings、search；`apply` 里构造 `PluginService` 和 `PluginLibrary`。`manifest.provides` 只有 `PLUGIN_SERVICE` 与 `PLUGIN_LIBRARY_SERVICE`。 |
| `packages/resources/plugins/src/provider.ts` | `PluginService` 是 agent installer 注册表，`register` 用 `ctx.effect` 注销。 |
| `packages/resources/plugins/src/library.ts` | `call()` 是 `PLUGIN_ROUTE` 的统一 fetch；`usePluginLibrary()` 读库并 probe 各 agent CLI，返回 `clients`、`rows`、`install/uninstall/setEnabled`。只在安装弹窗内挂载。 |
| `packages/resources/plugins/handlers.ts` | 唯一路由 `/hub/plugins`；GET 用 query action，POST 用 body action；`add` 只接受字符串地址；`program` 在 workspace 里执行 agent CLI。 |
| `packages/resources/plugins/src/host/collect.ts` | `collector.add(source)` → `parsePluginSource` → `collect(spec)`；`take` 用 pack manifest 定名并写记录。 |
| `packages/resources/plugins/src/host/fetch.ts` | `fetchPlugin(spec)` 支持 `url/git-subdir/archive/local`；git 分支只按 `ref` 浅克隆，不支持按 sha 固定。 |
| `packages/resources/plugins/src/inspect.ts` | `PluginSourceSpec` 四种 kind；`parsePluginSource` 不产出 `git-subdir`。 |
| `packages/extensions/src/host.ts` | `PlatformHost.net: NetPort \| null`；扩展必须通过 `ctx.host.net.request(url)` 取网络，不能自己 `fetch`。 |
| `packages/market/skills-sh/src/service.ts` | 现成市场服务模式：`ctx.host.net`、TTL 缓存、single-flight、`ctx.host.storage`。 |
| `packages/market/skills-sh/src/extension.ts` | 现成每来源内置扩展模式：manifest、nav、route、locales、service。 |
| `apps/web/src/lib/hub.ts` | 组装内置扩展；`pluginsExtension` 已在列表中。 |
| `packages/i18n/zh-cn/src/messages.ts` | 全局中文键表；市场包可以像 skills-sh 一样自带 en / zh-CN messages。 |
| `designs/market/` | 设计稿与图标资源；实现时只读参考，不改。 |

## 架构

### 包与依赖方向

```
@context-hub/market-plugins（页面 + 契约 + 注册表）
  ├── 依赖 @context-hub/plugins（库/安装 API、market-install 类型）
  └── 不被 @context-hub/plugins 依赖

@context-hub/market-claude-plugins-official
  ├── 依赖 @context-hub/market-plugins（MarketSource 契约）
  └── 依赖 @context-hub/plugins（MarketInstallSource 类型）

@context-hub/market-codex-plugins
  └── 同上
```

这样 `@context-hub/plugins` 只负责库与 host 安装，市场页面和来源扩展都在
`packages/market/`；host 校验器放在 `@context-hub/plugins/market-install`，
市场页和来源扩展都依赖它，不产生循环。

### 激活顺序

`apps/web/src/lib/hub.ts` 的 `extensions` 数组：

```ts
pluginsExtension,                    // 先提供 plugins / catalog.plugins
marketPluginsExtension,              // 提供 marketSources；页面依赖 plugins
marketClaudePluginsOfficialExtension,// inject marketSources
marketCodexPluginsExtension,         // inject marketSources
```

- `marketPluginsExtension.manifest.provides = [MARKET_SOURCE_SERVICE]`。
- `marketPluginsExtension.inject = ["nav","routes","locales","plugins","catalog.plugins"]`；
  页面和安装弹窗需要 `plugins` 的库服务与 installer 注册表。
- 源扩展 `inject = ["marketSources"]`，`apply` 里
  `ctx.marketSources.register(source)`。
- 源扩展不设 `locked`，可以在扩展页开关；禁用后 `ctx.effect` 注销，页面收到订阅
  通知，来源与行消失，已安装到 agent 的包不受影响。
- 市场页面扩展设 `locked: true`（内置功能，不提供开关），避免页面本身被关掉后
  源扩展的 `inject` 失效。

### 数据契约

**host 校验器**放在 `packages/resources/plugins/src/market-install.ts`，通过
`@context-hub/plugins/market-install` 导出：

```ts
export type MarketInstallSource =
  | { kind: "url"; url: string; ref?: string; sha?: string }
  | { kind: "git-subdir"; url: string; path: string; ref?: string; sha?: string }

export function assertMarketInstall(value: unknown): MarketInstallSource
```

**市场模型**放在 `packages/market/plugins/src/contract.ts`，通过
`@context-hub/market-plugins/contract` 导出：

```ts
import type { MarketInstallSource } from "@context-hub/plugins/market-install"

export const MARKET_SOURCE_SERVICE = "marketSources"

export interface MarketEntry {
  /** `${sourceId}:${indexName}`，页面 key 与缓存键。 */
  id: string
  /** 索引里的名称；最终安装名以 pack manifest 为准。 */
  name: string
  description?: string
  author?: string
  /** 索引原始分类；页面用 normalizeCategory 分组。 */
  category?: string
  homepage?: string
  sourceId: string
  install: MarketInstallSource
}

export interface MarketSource {
  id: string
  name: string
  repo: string
  index: string
  list(options?: { refresh?: boolean }): Promise<MarketEntry[]>
  /**
   * 可见行按需富化。Codex 取 manifest 的 interface.logo + description；
   * Claude 返回仓库 owner 头像；undefined 表示用页面分类图标兜底。
   */
  enrich?(entry: MarketEntry): Promise<{ icon?: string; description?: string }>
}
```

`MarketSourceRegistry` 也在这个文件：

```ts
export class MarketSourceRegistry extends Service {
  register(source: MarketSource): () => void   // ctx.effect 注销并通知
  sources(): readonly MarketSource[]
  subscribe(listener: () => void): () => void
}
```

- service 名 `marketSources`，在 `Context` 上声明。
- `marketPluginsExtension.apply` 先构造 registry，再注册 nav/route/locales。
- 页面用 `ctx.get("marketSources")` 读取并订阅。

### 分类归一化

`packages/market/plugins/src/contract.ts` 或 `categories.ts`：

- 合并同义分类：
  - `development` / `Developer Tools` → `development`
  - `design` / `Creativity` → `design`
  - `productivity` / `Productivity` → `productivity`
  - `communication` / `Communication` → `communication`
  - `security` / `Security` → `security`
- 其余已知分类保留：`database`、`monitoring`、`deployment`、`learning`、`automation`、
  `testing`、`math`、`location`、`migration`、`Education & Research`、
  `Data & Analytics`、`Finance`、`Scientific Research`、`Business & Operations`。
- 缺失或未知 → `other`。
- 顺序按显示名排序，`other` 最后。设计稿只画了 5 个主分类；真实页面会显示所有
  非空分类，这是设计稿的有意裁剪，不是实现范围缩减。
- 每个分类一个 i18n key：`market.plugins.category.<id>`。

### 图标与富化

- `MarketSource.enrich(entry)` 只对进入视口的行调用，页面用 `IntersectionObserver`
  触发；结果按 `entry.id` 缓存在页面级 Map。
- **Claude Code**：
  - 索引和 `.claude-plugin/plugin.json` 都没有 icon 字段（已实测）。
  - 外部仓库：`https://github.com/<owner>.png?size=64`，`<owner>` 从 `install.url` 解析。
  - owner 为 `anthropics`（官方仓库内条目）：返回 `undefined`，页面用分类图标兜底。
  - description 直接来自索引，不需要额外请求。
- **Codex**：
  - 索引没有 description/icon；`enrich` 读取
    `https://raw.githubusercontent.com/openai/plugins/main/<path>/.codex-plugin/plugin.json`，
    取 `interface.logo`、`description`、`author.name`。
  - logo 路径相对插件目录解析成 raw URL；失败或缺字段时返回 `undefined`。
  - `enrich` 结果同时补 description，行在 promise 落地后更新；首屏先显示
    `market.plugins.noDescription`（「No description in this source.」）。
- 页面兜底：分类图标（lucide）+ `surface-strong` 40×40 圆角 10 方块。
- 图标请求不得一次性拉全量：Claude 头像用 `<img loading="lazy">`；Codex manifest
  只在行进入视口时请求。

### 目录与筛选

- 默认来源集合 = 全部注册来源。
- 左栏 `All sources` 是合并视图；点单源只收窄来源集合，不换路由。
- 搜索同时匹配 `name/description/author/category`；有查询时打平分类分组，按结果
  列表渲染；清空后恢复分组。
- 无分页；380 行一次渲染，图标懒加载。若未来超过约 1000 行，再加虚拟化。
- 来源标签在每行显示（`Claude Code` / `Codex`），All sources 下必须有。
- 已入库判断：页面挂载时通过 `apis/library.ts` 调
  `GET /hub/plugins?action=list` 取记录名与来源；
  按 `name + source url/path` 匹配，避免不同来源同名误判。安装/刷新后再读一次。
  只有这个轻量读取，不在页面顶层挂 `usePluginLibrary`。
- 行操作：
  - 未入库：`+` 打开安装弹窗。
  - 已入库：`…` 打开详情弹窗（详情里的安装面板显示状态并提供「在 Plugins 中管理」）。
  - 安装中：`loader-circle`，按钮禁用。
- 详情：`DialogSplit`，左内容（描述/来源 repo/path/commit/主页），右面板
  （状态、默认目标、说明、Install 按钮）。
- 安装弹窗：`Dialog`，agent 单选 + scope 分段控件 + source 摘要 + Cancel/Install。
  agent 列表来自弹窗内挂载的 `usePluginLibrary()`；没有 agent 时给出明确空态。

### 安装路径

1. 页面 `+` → 打开安装弹窗。
2. 弹窗选中 agent/scope，确认：
   - 若库记录里没有这个包：`apis/library.ts` 的 `collectMarketInstall(spec)` 发
     `POST /hub/plugins { action: "market-install", spec }`。
   - host 校验 spec → `collector.addSpec(spec)` → 记录写入库。
   - `library.refresh()` → `library.install(record.name, clientId, scope)`。
3. 已入库：跳过 collect，直接 `library.install`。
4. 失败：`PluginNameTakenError` 走现有 code 翻译；其他错误显示 host 的原话。
5. 安装成功：行变已入库；详情状态更新；弹窗关闭并 toast。

### 安全边界

- `market-install` 只接受 `url` / `git-subdir`，拒绝 `local`、`archive`。
- URL 必须 `https:`，不带 credentials/query/fragment（`.git` 后缀允许）。
- `path` 必须过 `assertPackRelative`（不允许绝对路径、`..`、反斜杠）。
- `sha` 必须 40 位 hex；有 sha 时按 sha fetch 并校验 `git rev-parse HEAD`。
- `ref` 不允许空白/控制字符；`path` 不能为空。
- 索引数据不可信：单个条目的 source 不合法时跳过该条目并 `ctx.host.log("warn", ...)`；
  顶层 JSON 结构错误时整源失败。
- 页面只渲染文本和 raw 图标 URL，不执行来源内容。

## 阶段

### 阶段 1：契约、注册表、两个来源扩展

**目标**：三个新包可加载；`marketSources` 注册表可用；两个扩展能把来源索引解析成
`MarketEntry[]` 并注册；页面和安装尚未接入。

**改动文件**

- 新增 `packages/market/plugins/{package.json,tsconfig.json,eslint.config.js}`
- 新增 `packages/market/plugins/src/index.ts`（export extension）
- 新增 `packages/market/plugins/src/extension.ts`（构造 registry、manifest；
  nav/route 在阶段 2 加）
- 新增 `packages/market/plugins/src/contract.ts`（类型、registry、分类归一化）
- 新增 `packages/market/plugins/src/cache.ts`（TTL + single-flight，参考
  `packages/market/skills-sh/src/cache.ts`）
- 新增 `packages/market/plugins/__test__/contract.test.ts`
- 新增 `packages/market/claude-plugins-official/{package.json,tsconfig.json,
  eslint.config.js,src/index.ts,src/source.ts,src/apis/client.ts,
  src/apis/marketplace.ts,src/apis/types.ts,__test__/source.test.ts}`
- 新增 `packages/market/codex-plugins/{package.json,tsconfig.json,eslint.config.js,
  src/index.ts,src/source.ts,src/apis/client.ts,src/apis/marketplace.ts,
  src/apis/types.ts,__test__/source.test.ts}`
- 新增 `packages/resources/plugins/src/market-install.ts`（`MarketInstallSource` +
  `assertMarketInstall`）
- 修改 `packages/resources/plugins/package.json`：exports 增加
  `"./market-install": "./src/market-install.ts"`
- 修改 `apps/web/package.json`：加三个 workspace 依赖
- 修改 `apps/web/src/lib/hub.ts`：import 三个扩展，按 `pluginsExtension →
  marketPluginsExtension → 两个 source` 顺序加入，并加注释说明顺序原因

**实施要点**

- `@context-hub/market-plugins` 的 dependencies：
  `@context-hub/plugins`、`@context-hub/extensions`、`@context-hub/shadcn-ui`、
  `@deepseek-ai/cordis`、`lucide-react`、`react`；devDeps 照 skills-sh。
  包导出 `"."` 与 `"./contract"`。
- 两个 source 包的 dependencies：`@context-hub/market-plugins`、
  `@context-hub/plugins`（market-install 类型）、`@context-hub/extensions`、
  `@deepseek-ai/cordis`、`lucide-react`、`react`；exports `"."`。
- Claude 适配：
  - 顶部 `plugins` 必须是数组；`name` 必填；description/author/category/homepage 可选。
  - `source` 字符串 → `{ kind: "git-subdir", url: 官方仓库, path: normalize(source) }`。
  - `{ source: "url", url, sha? }` → `{ kind: "url", url, sha? }`。
  - `{ source: "git-subdir", url, path, ref?, sha? }` → 原样归一化。
  - 其他形态 → 跳过并 log。
- Codex 适配：
  - 顶部 `plugins` 数组；`source: { source: "local", path }` →
    `{ kind: "git-subdir", url: "https://github.com/openai/plugins", path, ref: "main" }`。
  - 其他 source 形态 → 跳过并 log。
  - description 先留空（`enrich` 阶段补）。
- 两个 source 都用 `ctx.host.net.request()`；`net === null` 时 `list()` 抛出可读错误；
  HTTP 非 200 也抛出。
- API 相关代码只放各自 `src/apis/`：`client.ts` 负责 `NetPort → JSON`，
  `marketplace.ts` 负责原始 JSON → `MarketEntry[]`；`source.ts` 只做缓存、注册和
  `enrich` 编排。页面组件不直接 `fetch` / `call`。
- TTL 10 分钟；`refresh: true` 清缓存；single-flight 同一时刻只发起一次。
- 每个条目产出前跑一次 `assertMarketInstall`；不合法条目跳过并 log，
  不把坏 spec 交给页面。
- 源扩展 manifest：`kind: "code"`、`category: "source"`、`defaultEnabled: true`、
  `permissions: ["network"]`、`inject: ["marketSources"]`；**不要设 `locked`**。
- 市场页面扩展 manifest：`kind: "code"`、`category: "source"`、
  `defaultEnabled: true`、`locked: true`、`provides: [MARKET_SOURCE_SERVICE]`、
  `inject: ["nav","routes","locales","plugins","catalog.plugins"]`。

**验收判据**

- `pnpm install`（链接三个新 workspace 包并更新 lockfile）
- `pnpm --filter @context-hub/market-plugins typecheck test lint`
- `pnpm --filter @context-hub/market-claude-plugins-official typecheck test lint`
- `pnpm --filter @context-hub/market-codex-plugins typecheck test lint`
- `pnpm --filter @context-hub/plugins typecheck test`
- `pnpm --filter web typecheck`
- 单测覆盖：三种 Claude source 形态、Codex local 形态、未知形态跳过、sha 校验、
  `assertMarketInstall` 拒绝 local/archive/http/路径逃逸/短 sha；
  注册表 register → sources 可见、注销 → 消失并通知。

### 阶段 2：市场页面骨架与目录

**目标**：`/market/plugins` 能显示两个来源的合并目录、来源栏、搜索、分类分组。

**改动文件**

- 新增 `packages/market/plugins/src/page.tsx`
- 新增 `packages/market/plugins/src/rows.ts`（合并/分组/过滤/计数）
- 新增 `packages/market/plugins/src/hooks.ts`（registry 订阅、来源读取、来源状态）
- 新增 `packages/market/plugins/src/apis/library.ts`（`GET /hub/plugins?action=list`
  的记录读取；安装调用在阶段 4 补）
- 新增 `packages/market/plugins/src/icons.tsx`（分类图标兜底）
- 新增 `packages/market/plugins/src/i18n/en.ts`、`i18n/zh-cn.ts`
- 修改 `packages/market/plugins/src/extension.ts`：注册 nav `/market/plugins`
  （group `market`, order 20）、route、locales
- 新增 `packages/market/plugins/__test__/rows.test.ts`
- 不改 `packages/resources/plugins/src/index.ts`；市场页面不再由它注册

**实施要点**

- 页面布局按设计稿：标题/搜索横跨内容区；下方
  `grid-cols-[232px_minmax(0,1fr)]`；左侧来源卡片，右侧分类目录。
- 分类目录：`grid-cols-1 xl:grid-cols-2`，每个分类一个 section；行包含 40px 图标、
  名称、来源标签、单行描述、右侧操作。
- 来源状态：每个源 `{ status: "loading" | "ready" | "failed", entries, error }`；
  `Promise.allSettled` 读取；部分失败时保留成功源，并显示失败提示。
- 计数：来源栏用 `entries.length`；加载中显示 `—`；标题总数是成功源之和。
- 搜索：有查询时打平分组；来源栏选择先过滤来源，再搜索。
- 无来源（两个源扩展都禁用）显示空态和「打开扩展」链接。
- 刷新：对每个源 `list({ refresh: true })`，重新读取。
- 页面不挂 `usePluginLibrary`；通过 `apis/library.ts` 的 `listLibraryRecords()`
  取记录名与来源，用于已入库状态；组件里不直接 `call`。
- 文案：导航、标题、搜索、来源、分类、状态、空态、错误、动作全部走
  `market.plugins.*` i18n；市场包注册 en + zh-CN，不改全局 zh-cn 包。
- nav label key：`market.plugins.nav`；route `/market/plugins`；图标 `Store`。

**验收判据**

- `pnpm --filter @context-hub/market-plugins typecheck test lint`
- `pnpm --filter web typecheck`
- 单测：分类归一化、合并去重、来源筛选、搜索打平、计数。
- 浏览器：`pnpm dev:web` 打开 `/market/plugins`，两个来源加载，显示 380 条对应的
  分类；搜索命中；切单源只显示该源；刷新不报错。
- 部分源失败时有提示，另一源仍可浏览。
- 键盘可达：来源栏、搜索、行操作都有可见 focus。

### 阶段 3：详情弹窗与图标/描述富化

**目标**：点击行打开详情弹窗；可见行按需显示真实图标和 Codex 描述。

**改动文件**

- 新增 `packages/market/plugins/src/detail-dialog.tsx`
- 修改 `packages/market/plugins/src/icons.tsx`：`useMarketEnrichment`
  （IntersectionObserver + 页面级缓存）
- 修改 `packages/market/plugins/src/hooks.ts`：富化队列/缓存
- 修改 `packages/market/claude-plugins-official/src/source.ts`：`enrich` 返回 owner 头像
- 新增 `packages/market/codex-plugins/src/apis/manifest.ts`（plugin.json →
  `interface.logo` + description）
- 修改 `packages/market/codex-plugins/src/source.ts`：`enrich` 调 `apis/manifest.ts`，
  返回 icon + description
- 单测：owner 解析、Codex manifest logo 解析、缺字段兜底

**实施要点**

- 详情用 `DialogSplit`（1136×740）：header 名称（mono）+ 来源/分类徽章 + 关闭；
  左 pane 描述、SOURCE 元数据（source/repo/path/commit）、HOME 链接；右 panel
  状态、默认目标、说明、Install 按钮。
- `enrich` 只在行进入视口时调用；结果缓存在页面级 Map；刷新来源时清空条目缓存，
  图标缓存可保留。
- Codex 行先显示 `market.plugins.noDescription`；manifest 到达后替换。
- 图标 `<img loading="lazy" decoding="async" alt="" />`；失败时回退分类图标。
- 详情中的 Install 按钮打开安装弹窗；已入库时显示「在 Plugins 中管理」链接。

**验收判据**

- `pnpm --filter @context-hub/market-plugins typecheck test lint`
- 浏览器：滚动时可见行逐步出现图标/描述；未滚动到的行不发起 manifest 请求
  （用 Network 面板确认）；点行打开详情，来源字段与索引一致；关闭/Esc 正常。
- Codex 行显示真实 logo 与描述；Claude 外部仓库显示 owner 头像；官方仓库条目
  显示分类图标。

### 阶段 4：安装链路

**目标**：从市场行安装到 agent；有 sha 时按 sha 钉住；失败/冲突可读。

**改动文件**

- 修改 `packages/resources/plugins/src/inspect.ts`：`PluginSourceSpec` 的
  url/git-subdir 增加可选 `sha`
- 修改 `packages/resources/plugins/src/host/fetch.ts`：有 sha 时 pinned fetch
- 修改 `packages/resources/plugins/src/host/collect.ts`：`PluginCollector.addSpec`
- 修改 `packages/resources/plugins/handlers.ts`：`market-install` action
- 修改 `packages/market/plugins/src/apis/library.ts`：增加
  `collectMarketInstall(spec)`（POST `market-install`）
- 新增 `packages/market/plugins/src/install-dialog.tsx`
- 修改 `packages/market/plugins/src/page.tsx`：行操作、安装后刷新
- 新增 `packages/resources/plugins/__test__/market-install.test.ts`
- 单测：pinned fetch 的 git 命令序列（可用临时本地仓库）、collector 测试、
  handler 校验测试

**实施要点**

- `fetchAt(url, sha, work)`：
  - `git init`、`git remote add origin <url>`、`git fetch --depth 1 origin <sha>`、
    `git checkout FETCH_HEAD`。
  - `git-subdir`：在 fetch 后 `git sparse-checkout init --cone`、
    `git sparse-checkout set <path>`、再 checkout。
  - 校验 `git rev-parse HEAD === sha`；删除 `.git` 后复制。
  - 现有无 sha 的 ref 路径保持原行为。
- `collector.addSpec(spec)`：复用内部 `collect(spec)`；记录 origin.revision 为
  实际 sha；`PluginCollected` 返回。**若库中已有相同 url/path/ref、但记录 revision
  与 `spec.sha` 不同，必须重新 collect/replace，不能直接返回 `already`。**
- handler：
  - `case "market-install"`：`assertMarketInstall(body.spec)` → `addSpec` →
    `sendJson(200, collected)`。
  - 校验失败走现有 catch → 400；名称冲突保留 `PluginNameTakenError` 的 code。
- 安装弹窗：
  - 只在打开时挂载；内部 `usePluginLibrary()` 取 `clients`。
  - agent 单选：`client.available === false` 显示禁用。
  - scope 分段：`project`（当前仓库）/`user`（这台机器），默认 `project`。
  - 确认：未入库先 `market-install`，再 `library.refresh()`、`library.install`。
  - 安装中禁用按钮，显示进度；失败显示 host 原话；成功后关闭并 toast。
- 页面已入库判断按 `name + source url/path`；安装后重新读列表。

**验收判据**

- 单测：`assertMarketInstall` 拒绝 local/archive/http/`..`/短 sha；pinned fetch
  在本地临时仓库上拿到指定 commit；无 sha 路径不回归。
- `pnpm --filter @context-hub/plugins typecheck test lint`
- `pnpm --filter @context-hub/market-plugins typecheck test lint`
- 浏览器：
  - 安装一个 Claude `git-subdir`（例如 `adobe-for-creativity`），库记录
    `origin.revision` 等于索引 sha。
  - 安装一个 Codex `local`（例如 `linear`），落到 `openai/plugins` 子目录。
  - 同名冲突显示可翻译错误；无 agent 时显示空态；安装失败保留弹窗。
- `pnpm --filter web typecheck`

### 阶段 5：状态、可访问性、文档与 AOCI

**目标**：补齐五类状态、中文、可访问性、测试与索引维护，达到可交付状态。

**改动文件**

- `packages/market/plugins/src/page.tsx`：加载/失败/无结果/无来源/安装失败状态
- `packages/market/plugins/src/i18n/en.ts`、`i18n/zh-cn.ts`
- `packages/market/plugins/__test__/*`
- `packages/resources/plugins/__test__/*`
- `docs/market.md` 或 `packages/market/plugins/README.md`：用户可见行为与安装说明
  （按项目文档规则，不重复 AGENTS.md）
- `aoci.code.txt` / `aoci.meta.txt`（通过 `aoci_maintain` 生成）
- `docs/plans/archive/plugin-market.md`：完成后归档本计划

**实施要点**

- 状态：
  - 加载：分类骨架（不是表格骨架）。
  - 源失败：失败源留在来源栏，显示 warning + Retry；其他源继续。
  - 无结果：保留搜索框，显示「没有匹配」+ 清除搜索。
  - 无来源：说明两个源扩展被禁用，链接到 `/extensions`。
  - 安装失败：弹窗内错误、保留选择、Retry/Cancel。
- 可访问性：来源栏 `aria-pressed`；行操作 `aria-label`；图标 `alt=""`；
  focus ring；颜色对比不低于 AA；Esc/焦点陷阱由 shadcn Dialog 提供。
- 中文：市场包自带 `market.plugins.*` 的 en / zh-CN，导航和分类都覆盖。
- 测试：分类归一化、搜索/分组、adapter、install 校验、pinned fetch、注册表。
- 浏览器 QA：用 `ego-browser` 跑主流程（加载、搜索、切源、详情、安装成功/失败）。
- AOCI：受管文件稳定后运行 `aoci_maintain`，按返回候选更新条目；不要凭猜测填语义。

**验收判据**

- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`（或至少
  `pnpm --filter web build` + 受影响的包）。
- 浏览器 QA 全流程通过；截图与设计稿一致（差异记录在最终汇报里）。
- 中文页面无英文漏键（除品牌名/代码标识）。
- `aoci_maintain` 无新增未解释文件；`docs/plans/plugin-market.md` 移到 archive。

## 验证与提交

- 最小的相关检查优先：三个新包 typecheck/test/lint → plugins 包 → web typecheck →
  根 build。
- 浏览器验证用 `pnpm dev:web`（或根 `pnpm dev`）打开 `/market/plugins`；用
  `ego-browser` 操作并截图。
- 提交前 `git diff --check` 和 `git diff`；确认不包含用户未提交的 `AGENTS.md`、
  `docs/memory.md`、`designs/` 改动。
- 当前分支 `feat/react-compiler` 有用户未提交改动；本计划的实现只暂存/提交自己
  的文件，不 push，不重写历史。若用户要求提交，使用语义化 message。

## 风险与开放问题

1. **包循环**：`MarketInstallSource` 放在 `@context-hub/plugins`，`MarketEntry` /
   注册表放在 `@context-hub/market-plugins`；市场页面依赖 plugins，plugins 不依赖
   市场页面。新增任何跨包类型时先检查依赖方向。
2. **pinned sha 在 Windows 的 git 行为**：`git fetch --depth 1 origin <sha>` 已在
   GitHub 上实测可行；sparse checkout + sha 的组合要在阶段 4 先写一个小脚本验证，
   再改 `fetchPlugin`。
3. **`/hub/net` 的限制**：现有 `createNetHandler` 只允许 HTTPS、公网主机、10s、
   4MB。两个官方索引分别约 187KB / 19KB，远低于上限；raw.githubusercontent.com
   是公网主机。若代理拒绝，需要带着测试和理由调整 host net 白名单，不能直接放开。
4. **Codex 索引没有 sha**：安装按 `main` 拉取，记录实际 commit；更新检查仍受
   `hasUpstream` 对 `git-subdir` 返回 false 的现有限制。
5. **图标质量是混合的**：Codex 真 logo；Claude owner 头像/分类图标。不要承诺
   统一品牌图标。
6. **市场页面扩展 locked**：页面扩展锁定，源扩展可开关。若把页面扩展也放开，
   必须处理两个源扩展 `inject: ["marketSources"]` 在页面关闭时的行为。
7. **380 行一次渲染**：可接受；图标懒加载。若行数增长到 1000+，再考虑虚拟化。
8. **旧的 `docs/plans/market-plugin.md`**：其中单体 `packages/market` 方案已作废；
   本计划不修改它，只在归档时注明被本计划取代的部分。

## 自审

- **调用方**：`apps/web` 依赖与 `hub.ts` 扩展顺序；三个新包的 exports；市场包
  i18n；nav/route；AOCI 受管文件；新包的 tsconfig/eslint。已列。
- **兼容性**：`PluginSourceSpec` 加可选 `sha` 不破坏现有调用；`fetchPlugin` 无 sha
  路径保持原行为；`collector.add` 不变；`/plugins` 页面不动；`@context-hub/plugins`
  不新增对市场包的依赖。
- **安全**：只允许 https + url/git-subdir；path 过 `assertPackRelative`；sha 40 hex；
  host 侧重新校验，不信任浏览器传的 spec。
- **数据丢失**：安装只写库，不删除已有记录；同名冲突拒绝而非覆盖。
- **测试**：adapter、分类、搜索、注册表、安装校验、pinned fetch、页面关键行为。
- **设计一致性**：目录布局、居中详情/安装弹窗、混合图标策略、无 Add source。
- **未验证内容**：pinned sparse checkout 在 Windows 的实际命令；`/hub/net` 对 raw
  GitHub 的放行；Codex manifest 的图标在全量条目上的覆盖率。这三项在阶段 1/4
  先用真实请求验证，再继续。
