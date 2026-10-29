# 市场插件（Market）实施计划

> **2026-10-29 结构修正（已执行）**：市场不是单个 `packages/market` 包。每个来源是一个
> 独立内置插件，放在 `packages/market/<source>` 下；当前只实现
> `packages/market/skills-sh`（`@context-hub/market-skills-sh`）。插件自己注册 nav /
> route / service / messages；外壳只提供 `market` 导航组。本文下面按单体
> `packages/market` 写的包结构、`MarketSource` 抽象与安装目标已作废；具体实现以
> `packages/market/skills-sh` 为准。

## 背景与方向变更

上一版计划 `docs/plans/skills-sh-market.md` 把 skills.sh 市场做成 Skills 模块的子页（`/skills/market`）。方向已经改变：

- 市场是**新的顶层菜单组**，不是任何资产模块的子页。侧栏新增「市场」，组内第一行是「Skills 市场」；后续再加「Plugins 市场」「Remotion 市场」「Video 市场」。
- 市场是**新的内置扩展模块**（`packages/market`，包名 `@context-hub/market`），和 `packages/resources/skills` 一样通过内核的 `ctx.nav.register` / `ctx.routes.register` 注册页面。
- 外部仓库 `D:\work-space\context-hub-extensions\plugins\skills.sh` 不再使用。删除/停用它是那个仓库的单独变更，不在本仓库的计划里直接改。
- 本轮只实现 Skills 市场（数据源 skills.sh）。其他市场来源只在侧栏与设计里留位，不实现假页面、不注册路由。

旧计划里的 API 实测事实、URL、参数、返回结构、解析规则、缓存 TTL、错误处理、fixture/curl 命令继续有效；适配层位置、路由、安装目标、设计文件按本文调整。

## 为什么必须是内置模块

这不是偏好，是被现有插件 API 限制住的选择：

1. 外部仓库 `context-hub-extensions/plugins/skills.sh/src/contracts.ts` 里，类型化的 `PluginScope` 只有 `{ host, skillRegistries }`。它没有声明 `nav`、`routes`，也没有页面组件的契约，因此旧插件只能注册 `SkillRegistry`。
2. 运行时 scope 的原型确实是内核 `ctx`（`packages/extensions/src/plugin.ts:214-221`），所以理论上外部插件能在运行时摸到 `nav` / `routes`；但这不是一份可依赖的外部 API：没有类型、没有文档承诺，`ui` 的类型仍是 `unknown`，外部仓库也没有镜像这些形状。把“原型上刚好能摸到”当成页面插件契约，会让任何内核重构都可能悄悄破坏它。
3. 市场需要三样外部插件当前没有正式承诺的东西：一个侧栏入口、一个可渲染的路由页面、以及页面内的 React 组件。把这三样正式化并同步到外部仓库是另一个项目，本轮不做。
4. 内置模块已经是本仓库的既有路径：`packages/resources/skills/src/extension.ts` 的 `apply` 里同时注册 `ctx.nav`、`ctx.routes`、`ctx.locales`，`apps/web/src/lib/hub.ts` 在 `extensions` 数组里组装所有内置模块。市场照这条路径走；内核只加导航组 id 与灰态标记，不加新的网络/路由能力。

结论：本轮做内置模块。若将来要运行时外部插件，先扩展插件 API（nav/routes/UI 契约），再讨论迁移；不在本计划里预留半套抽象。

## 目标

1. 侧栏出现顶层「市场」组；「Skills 市场」可进入 `/market/skills`，页面标题为「Skills 市场」。
2. Skills 市场能看三个榜单（All Time / Trending / Hot）、搜索、详情、文件树、安全审计。
3. 搜索至少 2 字符、单次最多 200 行、支持 owner 过滤；结果逐行补描述，不阻塞列表。
4. 安装只写技能库；已安装 / 可更新状态以库里的 `upstream` + `checked` 为准，不用 skills.sh 的下载 hash。
5. 官方精选作为可选最后阶段：HTML 解析成功才显示入口，失败隐藏。
6. 设计落在 `designs/market.pen`，沿用 `designs/README.md` 的 shell 与 token；设计里给「市场」组和后续来源留位。
7. 删除 Skills 页的旧远程搜索弹窗与入口；「探索」改为指向 `/market/skills`。
8. 不新增仓库里没有的第三方包；市场包复用 `apps/web` 已有的 `react-router`。所有网络请求经 `host.net`；所有渲染内容走现有 sanitize。

## 非目标

- 不实现 Plugins / Remotion / Video 市场页面。它们只有侧栏灰态行和设计画板，不注册路由。
- 不做 `/market` 落地页；侧栏组标签「市场」不带链接。
- 不做 Pack / Topic / Agent 浏览、作者页下钻、官方 owner 内部筛选：没有公开 JSON 列表接口。
- 不创建 Vercel OIDC token，不使用 `sk_live_` key；不调用任何 401 的 `/api/v1` 列表/搜索路由。
- 不用 `/api/download` 的 `hash` 做版本号、更新判据或缓存键。
- 不做同名覆盖、自动改名、批量安装、批量更新、无限滚动、自动轮询。
- 不把 `/api/download` 的文件写到磁盘；它只用于预览。
- 不改外部仓库 `context-hub-extensions`，不改 `SkillRegistry` 契约与贡献点。
- 不改 `createNetHandler`（GET / 10 s / 4 MB 已够），不新增 host 路由。
- 不给市场接全局搜索：`SearchContribution` 必须同步且不能发 I/O，市场数据在远端。
- 不为画板改顶栏高度或布局；侧栏只按本计划加一个「市场」导航组。
- 不清理 `SkillRegistry` 变成无消费者之后的契约代码；这是公共 API，单独一轮处理。

## 现状（按真实代码）

| 位置 | 当前行为 |
| --- | --- |
| `packages/extensions/src/types.ts` | `NavGroupId = "assets" \| "operate"`；`NavContribution` 有 `path/labelKey/icon/group/order`，没有 `soon`。 |
| `apps/web/src/lib/navigation.ts` | `navGroups` 只有 `assets`、`operate`；`useNavGroups` 合并扩展贡献；`useNavItem` 用最长前缀匹配。 |
| `apps/web/src/components/app-sidebar.tsx` | 只渲染 `assets`、`WorkspaceGroup`、`AgentGroup`、`operate` 四块。 |
| `apps/web/src/components/sidebar-rows.tsx` | `SidebarRow` 要么是 `Link`，要么是 `button`；没有禁用态。 |
| `apps/web/src/lib/hub.ts` | `extensions` 数组组装 `skillsExtension`、`promptsExtension`、`mcpExtension`、`pluginsExtension`、`variablesExtension`、`globalSearchExtension`、中文包。 |
| `apps/web/src/App.tsx` | 所有 `route` contribution 渲染为 `<Route path>`；`paths` 里没有 `route` 的导航项落到 `PlaceholderPage`。 |
| `packages/resources/skills/src/page.tsx` | 右上「探索」`setSearchOpen(true)`；页尾挂 `SearchSkillsDialog`；`useContributions("skillRegistry")` 取第一个 registry。 |
| `packages/resources/skills/src/search-dialog.tsx` | 640px 弹窗，每页 6 行，只消费 `SkillRegistry`；`use-immer` 的唯一使用者。 |
| `packages/resources/skills/src/index.ts` | hooks 只导出 `useSkillAgents`；没有导出 `useSkillLibrary` / `useReadablePlaces`，也没有导出 `parseSkillFile` / `SkillFileTree`。 |
| `packages/resources/skills/src/store.ts` | 导出 `SkillStore`、`SkillSummary`、`outdated`、`modified` 等；根入口通过 `export * from "./store.ts"` 暴露。 |
| `packages/resources/skills/src/host/skills-cli.ts` | `downloadPackageSkills` 在临时目录跑 `npx skills add <source> --skill <name> -a universal --copy -y --json`；well-known 源不支持 `--json`。 |
| `packages/resources/skills/src/host/upstream.ts` | 更新判据读 `skills-lock.json` 的 `computedHash` + `git ls-remote`。 |
| `packages/core/handlers.ts` | `createNetHandler` 的 `/hub/net` 只做 GET、HTTPS、公网主机、10 s、4 MB，返回 `{status,body}`，没有响应头。 |
| `designs/skills-sh.pen` | 空画布，1787 bytes，未被 git 跟踪。 |
| `designs/README.md` | 导航与画板清单仍是旧 shell；②e 是旧的 skills.sh 下载弹窗。 |

## 架构设计

### 包与模块

新建 `packages/market`（`@context-hub/market`）。`pnpm-workspace.yaml` 的 `packages/*` 已经覆盖它，不需要改 workspace 配置。

```
packages/market/
  package.json
  tsconfig.json
  eslint.config.js
  vitest.config.ts
  src/
    index.ts                 // marketExtension = marketModuleWith(MARKET_SOURCES)
    extension.ts             // 无 JSX：manifest、nav/routes/locales 注册
    types.ts                 // MarketSource
    messages.ts              // market.* 英文默认值
    page.tsx                 // 共享外壳：标题、说明、空/错/加载块
    sources/
      index.ts               // MARKET_SOURCES（含未实现来源的占位行）
      skills-sh/
        source.tsx           // skillsShSource
        types.ts
        client.ts
        cache.ts
        service.ts
        rows.ts
        page.tsx             // SkillsMarketPage
        detail-dialog.tsx
        install-dialog.tsx
        official-dialog.tsx  // 阶段 9，可砍
  __test__/
    extension.test.ts
    market-client.test.ts
    market-cache.test.ts
    market-service.test.ts
    market-rows.test.ts
    market-official.test.ts  // 阶段 9，可砍
    fixtures/skills-sh/*.json|html
```

`extension.ts` 不 import `.tsx`，保持可被普通 Node 检查加载；`index.ts` 组装 `MARKET_SOURCES` 并传给 `marketModuleWith`。

### 市场来源接口

```ts
// packages/market/src/types.ts
import type { ComponentType } from "react"
import type { ExtensionIcon } from "@context-hub/extensions"

export interface MarketSource {
  /** Stable id; the nav row's key and the source's identity. */
  id: string
  /** Route the source's page mounts at. */
  route: string
  /** Message key for the nav row and the page title. */
  labelKey: string
  icon: ExtensionIcon
  /**
   * The page this source opens. Absent while the source is only planned:
   * the sidebar row renders disabled and no route is registered.
   */
  Component?: ComponentType
}
```

`src/sources/skills-sh/source.tsx` 定义已实现来源：

```ts
export const skillsShSource: MarketSource = {
  id: "skills",
  route: "/market/skills",
  labelKey: "market.source.skills",
  icon: SparklesIcon,
  Component: SkillsMarketPage,
}
```

`MARKET_SOURCES`（`src/sources/index.ts`）：

```ts
import { skillsShSource } from "./skills-sh/source.tsx"

export const MARKET_SOURCES: readonly MarketSource[] = [
  skillsShSource,
  { id: "plugins",  route: "/market/plugins",  labelKey: "market.source.plugins",  icon: BlocksIcon },
  { id: "remotion", route: "/market/remotion", labelKey: "market.source.remotion", icon: ClapperboardIcon },
  { id: "video",    route: "/market/video",    labelKey: "market.source.video",    icon: VideoIcon },
]
```

`extension.ts` 的注册循环（无 JSX）：

```ts
export function marketModuleWith(sources: readonly MarketSource[]): ExtensionModule {
  return {
    name: MARKET_ID,
    manifest: { /* 见阶段 1 */ },
    inject: ["nav", "routes", "locales"],
    apply(ctx) {
      sources.forEach((source, index) => {
        const order = (index + 1) * 10
        ctx.nav.register({
          path: source.route,
          labelKey: source.labelKey,
          icon: source.icon,
          group: "market",
          order,
          ...(source.Component === undefined ? { soon: true } : {}),
        })
        if (source.Component !== undefined) {
          ctx.routes.register({ path: source.route, Component: source.Component })
        }
      })
      ctx.locales.register({ id: "en", label: "English", messages: marketMessages })
    },
  }
}
```

说明：

- 这不是内核 contribution point，只是市场模块自己的静态来源表。加一个市场来源 = 加一个 `source.tsx` + 在数组里加一项；不需要改内核。
- 未实现来源没有 `Component`，因此不注册路由、侧栏行禁用。这样不会出现空壳市场页。
- nav 的 `order` 按数组下标 `(index + 1) * 10`：Skills 10、Plugins 20、Remotion 30、Video 40。
- 图标名已在本仓库或 lucide-react 1.48 中存在：`SparklesIcon`、`BlocksIcon`、`ClapperboardIcon`、`VideoIcon`。

### 壳层改动

1. `packages/extensions/src/types.ts`
   - `NavGroupId` 加 `"market"`。
   - `NavContribution` 加可选字段：
     ```ts
     /** A row the shell draws but does not navigate to: the source is planned. */
     soon?: boolean
     ```
2. `apps/web/src/lib/navigation.ts`
   - `navGroups` 加一项（顺序：assets → market → operate）：
     ```ts
     { id: "market", labelKey: "nav.group.market", items: [] }
     ```
   - `NavItem` 加 `soon?: boolean`；`useNavGroups` 映射贡献项时带上 `soon: item.soon`。
3. `apps/web/src/components/app-sidebar.tsx`
   - 取 `navGroups.find((group) => group.id === "market")`。
   - 渲染顺序：`assets` → `market` → `WorkspaceGroup` → `AgentGroup` → `operate`。
   - `NavGroup` 把 `item.soon` 传给 `SidebarRow` 的 `disabled`，禁用行的 `hint` 用 `t("nav.soon")`。
4. `apps/web/src/components/sidebar-rows.tsx`
   - `SidebarRow` 加 `disabled?: boolean`。
   - 禁用时渲染非 `Link`、非 `button` 的 `<div aria-disabled="true">`，不加 `role`/`tabIndex`，用 `opacity-50` 和 `cursor-default`；`title` 用 `hint`。
5. `apps/web/src/App.tsx`
   - `paths` 只收集非 `soon` 的导航项：`group.items.filter((item) => item.soon !== true).map(...)`。这样 `/market/plugins` 直接访问会落到 `*` 重定向，而不是 `PlaceholderPage` 假页。
6. i18n
   - `packages/extensions/src/builtin/locale-en.ts`：`"nav.group.market": "Market"`、`"nav.soon": "Coming soon"`。
   - `packages/i18n/zh-cn/src/messages.ts`：`"nav.group.market": "市场"`、`"nav.soon": "即将推出"`。
   - 市场模块自己的 `messages.ts` 通过 `ctx.locales.register({ id: "en", ... })` 提供 `market.*`；中文包必须镜像每一个键（`packages/i18n/zh-cn/__test__/messages.test.ts` 会强制）。

   市场文案键（英文默认值在 `packages/market/src/messages.ts`，中文镜像到 zh-cn）：

   ```
   market.source.skills / plugins / remotion / video
   market.skills.title / description
   market.view.allTime / trending / hot
   market.rank.column.rank / skill / source / installs / trend / action
   market.rank.installs.allTime / trending / hot
   market.rank.empty / emptyHint / failed / retry / loadMore / loaded
   market.search.placeholder / label / clear / hint / truncated / count / owner / ownerClear / loadMore
   market.row.install / installed / update / updating / cliOnly / conflict / conflictHint
   market.detail.title / close / installs / by / official
   market.detail.content / files / audit
   market.detail.noSkillFile / noFiles / noFilesHint / wellKnown / wellKnownHint
   market.detail.openPage / copyCommand / copied
   market.audit.empty / emptyHint / failed / retry / partial / provider / risk / summary / auditedAt
   market.install.title / description / summary / target / library / libraryHint / placeHint
   market.install.conflict / conflictHint / running / done / partial / retry / cancel / confirm / goSkills
   market.official.title / description / open / empty / close
   market.state.loading / noNetwork / noLibrary / rateLimited
   market.error.html / parse / generic
   ```

侧栏位置推荐：**资产组之下、工作区之上**。理由：市场是发现来源，不是当前工作区的资产操作；先看自己的资产，再逛市场，再回到工作区/Agent 配置。代价是市场比「工作区/Agent」更靠上，若用户更常切工作区可调整。

### Skills 来源的数据层

数据流：

```
SkillsMarketPage
  ├─ useSkillLibrary(useReadablePlaces())  // 已安装 / 可更新 / 冲突
  ├─ ctx.get("market.skills")              // 远端读取 + 缓存
  │    ├─ rank(view, page)
  │    ├─ search(query, owner)
  │    ├─ download(source, skill)
  │    ├─ audit(source, skill) / teleAudit(...)
  │    ├─ pageMeta(source, skill)
  │    └─ officialOwners()                 // 阶段 9
  └─ ctx.get("hub.skills")                 // 安装：store.installPackage(...)
```

`market.skills` 是市场模块自己的服务（`SkillMarket extends Service`），不是 Skills 模块的服务。它只做网络读取与缓存，不写盘。

要复用 Skills 已有的行状态，给 `packages/resources/skills/src/index.ts` 补这些公开导出：

```ts
export { useSkillAgents, useReadablePlaces, useSkillLibrary } from "./library.ts"
export { parseSkillFile } from "./frontmatter.ts"
export { SkillFileTree, fileTreeKey } from "./file-tree.tsx"
```

如市场需要 `useSkillLibrary` 的返回类型，直接使用 hook 的推断类型即可；不需要额外改名导出（`useSkillLibrary` 与 `library-store.ts` 的 `SkillLibrary` 类是两个名字）。

理由：`library.ts` 已经算好了 `rows`（含 `upstream`、`checked`、`places`），`store.ts` 已经导出 `outdated` / `modified`；市场不重新实现一遍库状态。

### 客户端与服务

`src/sources/skills-sh/types.ts` 定义市场行与解析结果（沿用旧计划）：

```ts
export type MarketView = "all-time" | "trending" | "hot"

export interface MarketRankRow {
  source: string
  skillId: string
  name: string
  installs: number
  weeklyInstalls?: number[]
  installsYesterday?: number
  change?: number
  isOfficial?: boolean
}

export interface MarketRankPage {
  view: MarketView
  page: number
  hasMore: boolean
  rows: MarketRankRow[]
}

export interface MarketSearchRow {
  id: string
  source: string
  skillId: string
  name: string
  installs: number
}

export interface MarketSearchPage {
  query: string
  rows: MarketSearchRow[]
  /** 本次是否触到 200 条上限；界面据此提示“结果被截断”。 */
  truncated: boolean
}

export interface MarketFile { path: string; contents: string }
export interface MarketBundle { files: MarketFile[]; hash: string }

export interface MarketAuditEntry {
  provider: string
  slug: string
  status: string
  summary: string
  auditedAt: string
  riskLevel?: string
  categories?: string[]
}
export interface MarketAudit {
  id: string
  source: string
  slug: string
  audits: MarketAuditEntry[]
}
export interface MarketRisk {
  risk: string
  alerts?: number
  score?: number
  analyzedAt: string
}
export type MarketTeleAudit = Record<
  string,
  { ath?: MarketRisk; socket?: MarketRisk; snyk?: MarketRisk }
>
export interface MarketPageMeta {
  description?: string
  installs?: number
  publisher?: string
  installCommand?: string
}
export interface MarketOwner {
  owner: string
  repo?: string
  repos?: number
  skills?: number
}
```

`client.ts`：

```ts
import type { NetPort } from "@context-hub/extensions"

export interface MarketClient {
  rank(view: MarketView, page: number): Promise<MarketRankPage>
  search(query: string, owner?: string): Promise<MarketSearchPage>
  download(source: string, skill: string): Promise<MarketBundle | null>
  audit(source: string, skill: string): Promise<MarketAudit | null>
  teleAudit(source: string, skills: readonly string[]): Promise<MarketTeleAudit>
  pageMeta(source: string, skill: string): Promise<MarketPageMeta | null>
  /** 阶段 9 才实现；砍掉官方精选时一并删除。 */
  officialOwners?(): Promise<MarketOwner[]>
}

export function createMarketClient(net: NetPort): MarketClient
```

URL 常量：`MARKET_ORIGIN = "https://skills.sh"`，`MARKET_SITE = "https://www.skills.sh"`。`source` 含 `/` 时按段 `encodeURIComponent`；不含 `/` 时视为域名。禁止把原始 `source` 直接拼进 URL 或 CLI。

### 端点、解析、缓存

以下事实来自旧计划在 2026-10-29 的 `curl` 实测；本轮不重新验证，执行阶段如需复核用文末命令。

| 端点 | 用途 | 关键实测 |
| --- | --- | --- |
| `GET https://skills.sh/api/skills/{view}/{page}` | 榜单 | `view ∈ all-time\|trending\|hot`；`page` 从 0 开始，每页 200；`hasMore` 是权威判据；越界页返回空数组 + `hasMore:false`；不传 `page` 会返回 HTML。 |
| `GET https://skills.sh/api/search?q=&limit=&owner=` | 搜索 | `q` 至少 2 字符；`limit` 上限 200；没有 offset；`count` 是本次返回行数，不是命中总数。 |
| `GET https://skills.sh/api/download/{owner}/{repo}/{slug}` | 内容 + 文件树 + 描述 | GitHub 源返回 `{files:[{path,contents}],hash}`；well-known 源 404。 |
| `GET https://skills.sh/api/v1/skills/audit/{source}/{skill}` | 安全审计（主） | 匿名 200；无审计 404；well-known 也可用；`riskLevel` 是开放集合（出现过 `SAFE`、`MEDIUM`）。 |
| `GET https://www.skills.sh/tele/audit?source=&skills=` | 审计兜底 | v1 404 时调用；未审计返回 `{skill:{}}`，不报错。 |
| `GET https://www.skills.sh/official` | 官方精选 | HTML ≈ 514 KB；owner 行 + 两个计数列；无 JSON 等价物。 |
| `GET https://www.skills.sh/{owner}/{repo}/{skill}` | GitHub 详情元数据 | 含 JSON-LD `SoftwareApplication` 和安装命令。 |
| `GET https://www.skills.sh/site/{domain}/{skill}` | well-known 详情 | canonical；404 再试 `/{domain}/skills/{slug}`。 |

1. **榜单**
   - 解析：`skills` 必须是数组；行要求 `source` / `skillId`（缺失用 `name`）/ `name` 非空字符串；`installs` 用 `Number.isFinite`，否则 0；`weeklyInstalls` 只收长度 8 的有限数字数组；`installsYesterday` / `change` 只收有限数字；`isOfficial` 只收布尔；`hasMore` 只收布尔，否则 `false`。
   - 语义：All Time 的 `installs` 是总安装量，带 8 个 `weeklyInstalls`；Trending 是 24h；Hot 是 1h，带 `change`。`total` 是滚动值，不写死、不当分页判据。
   - 缓存：`rank:{view}:{page}`，5 分钟。
2. **搜索**
   - URL：`/api/search?q={q}&limit=200[&owner={owner}]`。
   - 解析：`skills` 必须是数组；行要求 `source` / `skillId` / `name` 非空字符串，`installs` 有限数字否则 0，`id` 缺失用 `${source}/${skillId}`；忽略 `count`。
   - 分页：一次取 200 行；页面按 10 行/页客户端切片，「加载更多」不再发请求；`rows.length === 200` 时提示“只显示前 200 条”。
   - 缓存：`search:{q}:{owner}`，5 分钟；`q` / `owner` 去空格。
3. **下载**
   - 只支持 GitHub 源；well-known 返回 404。
   - 解析：`files` 必须是数组；每个 `path` 非空、`contents` 是字符串；拒绝绝对路径、`..` 段、反斜杠路径；不合法的条目跳过。
   - 找 `SKILL.md`：basename 大小写不敏感，优先根目录；用 `parseSkillFile` 取 frontmatter 和 body。
   - `hash` 原样保留但**不参与任何判断**。
   - 缓存：`files:{source}:{skill}`，30 分钟；404 负缓存 10 分钟。
4. **审计（v1）**
   - `audits` 必须是数组；`provider` / `slug` / `status` / `summary` / `auditedAt` 收字符串；`riskLevel` 收字符串，不校验枚举；`categories` 只收字符串数组。
   - 404 或空数组 → `null`；缓存 24 小时，`null` 负缓存 10 分钟。
5. **审计兜底（tele）**
   - 只在 v1 返回 404 时调用；`source` 一个，`skills` 逗号分隔一个。
   - 对象里每个 provider 的 `risk` / `analyzedAt` 字符串，`alerts` / `score` 有限数字；没有 provider 留空。
   - 缓存 6 小时；失败不阻塞详情，按空审计处理。
6. **详情 HTML（元数据 + 安装命令）**
   - GitHub：`https://www.skills.sh/{owner}/{repo}/{skill}`；well-known：先 `/site/{domain}/{skill}`，404 再试 `/{domain}/skills/{skill}`。
   - 取所有 `<script type="application/ld+json">`，找 `@type === "SoftwareApplication"`；取 `description`、`publisher.name`、`interactionStatistic.userInteractionCount`。
   - 取 `<meta name="description">`，只作为 GitHub 的兜底描述；well-known 的通用句丢弃。
   - 取 `<code>` 里以 `npx skills add` 开头的文本作为 `installCommand`，解 HTML 实体。
   - 缓存 24 小时；404 负缓存 10 分钟。
7. **官方精选（阶段 9）**
   - 解析 `/official` HTML 里的 owner 行：`<a href="/{owner}">`、`font-semibold` owner 名、`font-mono` repo 标签、右侧两个 `text-right font-mono` 数字列；只收 href 恰为一段的 owner 行；去重；按 skills 数降序。
   - 解析出 0 行或缺列 → `[]`，界面隐藏入口；缓存 6 小时，空/失败负缓存 10 分钟。

### 缓存服务

`cache.ts`：带 `now: () => number` 的 TTL Map，`get/set/delete/clear`，条目上限 200，超过删最早写入。

| 键 | TTL | 负缓存 | 说明 |
| --- | --- | --- | --- |
| `rank:{view}:{page}` | 5 min | 无 | 榜单页 200 行 |
| `search:{q}:{owner}` | 5 min | 无 | 原始 200 行 |
| `files:{source}:{skill}` | 30 min | 10 min | 详情与搜索描述共用 |
| `audit:{source}:{skill}` | 24 h | 10 min | `null` 也算值 |
| `tele:{source}:{skill}` | 6 h | 无 | v1 404 才用 |
| `page:{source}:{skill}` | 24 h | 10 min | HTML 描述/命令 |
| `official` | 6 h | 10 min | 解析失败缓存空数组 |

同一个键的并发请求只发一次（in-flight Map）。缓存只存成功答案；网络/解析失败不写缓存；404 的有效 `null` 与官方解析失败的 `[]` 按上表负缓存。条目上限 200，进程退出即清。

`service.ts`：

```ts
export const MARKET_SKILLS_SERVICE = "market.skills"

export class SkillMarket extends Service {
  readonly available: boolean
  constructor(ctx: Context) { super(ctx, MARKET_SKILLS_SERVICE); ... }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    "market.skills"?: SkillMarket
  }
}
```

`service.ts` 必须 `import { Service } from "@deepseek-ai/cordis"` 和 `import type { Context } from "@deepseek-ai/cordis"`。声明了 `Context` 的文件必须真的引用这个包，否则整个包的类型会崩（见 `docs/memory.md` 的同类记录）。

- 构造时读 `ctx.host.net`；`available = net !== null`。
- `net === null` 时每个读取方法抛 `this form cannot reach the network`。
- `extension.ts` 的 `apply` 里 `new SkillMarket(ctx)`；manifest `provides: [MARKET_SKILLS_SERVICE]`，`permissions: ["network", "assets.read", "assets.write"]`（权限目前只做展示，不强制；声明是为了诚实）。
- 页面通过 `useHub().get("market.skills")` 读服务。

### 页面与交互

路由：`/market/skills`。页面标题「Skills 市场」。侧栏行就是来源切换，页面内不再套一层来源 tab。

共享外壳 `MarketPage` 的签名固定为：

```ts
export function MarketPage({
  titleKey,
  descriptionKey,
  children,
}: {
  titleKey: string
  descriptionKey: string
  children: React.ReactNode
})
```

它只画标题、说明和内容槽；加载/空/失败块作为同文件的小组件导出，由各来源页复用。

**市场页状态**

- 榜单默认 `all-time`；分段控件切换 `all-time | trending | hot`。
- 搜索框：输入 300 ms 防抖；`q` 为空时显示榜单；1 个字符时显示“至少 2 个字符”的提示、不发请求；`>= 2` 时显示搜索结果，榜单隐藏。
- owner 过滤：结果工具栏里的输入框 + 行内 owner 可点（只对 GitHub 行）；写入 URL `?owner=`；清空按钮。
- URL 查询参数：`?view=all-time|trending|hot&q=&owner=`。`view` 用 `replace: true`；`q` / `owner` 防抖后用 `replace: true`，避免每个按键一条历史。详情、安装弹窗、已加载页数放组件状态。
- 已加载榜单页数、搜索翻页位置放组件状态；离开页面丢失，回来从 page 0 重读，可接受。
- 详情是弹窗，叠在列表上；关闭回列表，滚动位置保留。

**榜单行**

- 列：`#`、Skill（名称 + 官方徽标）、来源、安装量、趋势（All Time 8 周折线 / Trending 24h / Hot 1H + `+change`）、动作。
- 折线用内联 SVG：`sparkPoints(weeklyInstalls, 96, 24)`；全 0 画平线；缺失不画。
- 动作按 `rowState`：安装 / 已安装 / 更新 / 仅 CLI / 同名冲突。
- 页脚「加载更多」读 `pages.length`；末页按钮消失或禁用。

**搜索结果行**

- 列：名称、来源（owner/repo 或域名）、安装量、描述、徽标、动作。
- 描述：只对当前展示的 GitHub 行请求 `/api/download`，取 `SKILL.md` 的 `frontmatter.description`；并发 3；结果按行键写入 `Record<string, string | null>`；骨架 → 文本。
- 下载失败/404/超过 4 MB → 对 GitHub 行再试 `pageMeta` 的 JSON-LD/meta；再失败则不显示描述。well-known 行直接不请求、不显示描述。
- 徽标：已安装、可更新、仅 CLI；翻页/加载更多不发新的 `/api/search`。

**详情弹窗**

- 1040×640 的 `Dialog`，头部：名称、来源外链、官方徽标、安装量、主操作。
- 页签用 `TabsList variant="line"`（照 `packages/resources/plugins/src/detail-dialog.tsx` 的形状）：内容 / 文件 / 安全审计。
- 内容：GitHub 走 `/api/download` 的 `SKILL.md` body → 现有 `Markdown`；没有 `SKILL.md` 时说明但文件 tab 仍可用。well-known 显示“此来源不提供文件内容 API”+ 外链 + 安装命令。
- 文件：`treeFromFiles(bundle.files)` 生成 `SkillFileEntry[]`，用导出的 `SkillFileTree` + `CodeCard`；选中文件从 `bundle.files` 取 `contents`，不读盘。404/过大显示说明 + 外链。
- 审计：v1 provider 行（名称、status chip、riskLevel、summary、auditedAt）；`status` 的 `pass` 绿 / `warn` 琥珀 / `fail` 红 / 未知中性；`riskLevel` 开放集合，`safe` / `none` / `low` 绿、`medium` 琥珀、`high` / `critical` 红、未知中性；v1 `null` → tele 三行 + “部分审计”；都空 → “暂无审计”+ 外链；失败 → “审计读取失败”+ 重试。
- footer：可安装 → 打开安装弹窗；已安装且 `outdated` → 更新（`library.update(held.name)`，用库里那一行的名字，不用市场 `skillId`）；已安装且最新 → 禁用「已安装」；冲突 → 禁用「同名冲突」；well-known → 「仅 CLI」+ 复制命令。

**安装确认**

- 默认且唯一目标：**技能库**。不再列 `useReadablePlaces()` 的位置列表；位置写入留在 Skills 页。
- 代价：市场安装后不能直接投递到 Agent；弹窗和详情给一个「去 Skills 页」链接。用普通 `<a href="/skills">`，不引入 `Link` 的用法（市场包已经因为 `useSearchParams` 依赖 react-router，但这处不需要它）。
- 冲突：市场行的 `source + skillId` 与库里的 `name + upstream.source` 比对：
  - 同名 + 同来源 → 已安装；`outdated` 时显示「更新」，否则「已安装」；
  - 同名 + 不同来源 / 库里无 `upstream` → 冲突，禁用安装并说明原因；
  - 无同名 → 可安装。
- 执行：校验 `source` / `skillId` → `store.installPackage(source, [skillId])` → `installed.length === 0` 时逐条显示 `failed[]` → 成功 `library.reload()`、关闭、toast；部分失败留在弹窗。
- 执行中禁用关闭/Esc；CLI 没有取消 API。
- well-known：不打开安装弹窗；详情里给 `npx skills add ...` 命令 + 复制 + 外链。

### 安装、更新与安全边界

- **只写技能库**：市场不写 Agent 目录，不设置位置；`installPackage` 就是 Skills 页「下载」用的同一条路径。
- **来源校验**：安装前校验 GitHub 形态 `^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$`；拒绝空段、`.`、`..`、以点开头的段。well-known 形态只展示、不安装。
- **技能名校验**：安装前拒绝空、`.`、`..`、以 `.` 或 `-` 开头、含 `/` 或 `\` 的名字；`downloadPackageSkills` 内部已有 `assertSkillName` 兜底。
- **同源归一化**：`sameSource` 把 `https://github.com/owner/repo`、`github.com/owner/repo`、`owner/repo`、带 `.git` 或尾 `/` 统一成 `owner/repo` 再比较；大小写不敏感；well-known 域名小写比较。
- **不写远端文件**：`/api/download` 的 `contents` 只在内存里渲染；写盘只发生在 `npx skills add` 的临时目录和库的 `adopt`。
- **渲染**：`SKILL.md` 是不可信内容，走现有 `Markdown`（`rehypeRaw` + `rehypeSanitize`），不 `dangerouslySetInnerHTML`；相对图片没有 base，不加载远程图片。
- **凭据**：请求不带 Authorization / cookie / token，只用公开路由。
- **路径**：文件树条目的 `path` 拒绝绝对路径和 `..`，只用于显示和选择。
- **网络**：全部经 `host.net`；市场源码里不出现 `fetch(`。

### 错误与降级

| 情况 | 页面行为 |
| --- | --- |
| `ctx.host.net === null` | 显示“此形态无法访问网络”，不请求；榜单/搜索空态 |
| 榜单/搜索 HTTP 非 200 | 保留上次结果；横幅显示 `refusal()` 文字；提供「重试」 |
| 429 限流 | 与其它非 200 同一条路径；文案写“请求过于频繁，请稍后重试”；不做自动退避 |
| 返回 HTML 而不是 JSON | 报“skills.sh 返回了页面而不是数据”；不自动重试 |
| 10 s 超时 / 4 MB 上限 | 显示 host 的错误文字；详情文件 tab 显示“内容过大，无法在此预览” |
| 下载 404 | 详情文件 tab 显示“此来源不提供文件 API”；内容 tab 显示 well-known 说明；不报错 |
| 审计 404 | 调 tele；tele 空 → “暂无审计”；tele 失败 → “暂无审计”，不阻塞 |
| 官方 HTML 解析失败 | 隐藏「官方精选」入口；榜单正常 |
| npx 不存在 | 安装弹窗显示 `npx is not on PATH; install Node.js or add it to PATH` |
| 同名冲突 | 安装禁用，说明“技能库已有同名技能（来源不同），请先移除或改名” |
| 无技能库 | 只浏览；安装按钮禁用并说明 |

### 页面状态矩阵

- 加载骨架（榜单/搜索/详情各自一套）
- 空榜单
- 搜索空态（< 2 字符）
- 搜索无结果
- 网络失败 / 限流
- 无网络
- 无技能库
- npx/CLI 缺失
- 审计未生成 / 审计失败
- well-known 不可装
- 已安装 / 可更新
- 同名冲突
- 安装执行中 / 部分失败
- 内容过大

## 设计画板

文件：`designs/skills-sh.pen` 重命名为 `designs/market.pen`。它是空画布、未被 git 跟踪，直接 `mv` 即可；`.pen` 是加密文件，只能用 pencil MCP 工具，禁止 Read/Grep。

画板 7 块（阶段 9 保留官方精选时再加 ⑦）：

| # | 画板 | 内容 | 数据来源 | 状态/串联 |
| --- | --- | --- | --- | --- |
| ① | 市场导航 / 来源总览 | 侧栏「市场」组：Skills 激活，Plugins/Remotion/Video 灰态「即将推出」；标注“新增来源 = 一个 `MarketSource` + 一个页面” | 无 | 说明 `/market` 不落地；点 Skills → ② |
| ② | Skills 市场 · 榜单 | 标题「Skills 市场」；All Time / Trending / Hot 分段；搜索框；官方精选次按钮（条件显示）；表头（# / Skill / 来源 / 安装量 / 趋势 / 动作）；约 10 行；页脚「加载更多」 | `/api/skills/{view}/{page}`；`library.rows` | 切 tab 重载；点行 → ⑤；加载更多追加；失败/空态在 ⑧ |
| ③ | Skills 市场 · 搜索空态 | 大搜索框（autofocus）、至少 2 字符提示、示例词胶囊（`find-skills` / `pdf` / `browser`）、“搜索的是 skills.sh，不是本地库”；不画假榜单 | 无 | 输入 ≥2 字符 → ④ |
| ④ | Skills 市场 · 搜索结果 | 搜索框 + owner 胶囊；结果计数/截断提示；10 行（名称、来源、安装量、描述骨架→文本、已安装/可更新/仅 CLI、安装按钮） | `/api/search?...&limit=200`；`/api/download` frontmatter；`pageMeta` 兜底；`library.rows` | 点行 → ⑤；点 owner 写过滤；安装 → ⑥；翻页不发新请求 |
| ⑤ | Skill 详情 | 1040×640 弹窗；头部名称、来源外链、官方徽标、安装量、主操作；页签：内容 / 文件 / 安全审计 | `/api/download`；`pageMeta`；`audit` + `tele`；`library.rows` | 安装 → ⑥；可更新 → 更新；关闭回列表 |
| ⑥ | 安装确认 | 640×~520 弹窗；summary（名称、来源、安装量）；目标只有「技能库」（选中且不可改）；同名冲突警示；执行中步骤；结果逐条；“去 Skills 页”链接 | 本地 `hub.skills` store | 确认 → `installPackage`；成功 → 关闭并刷新库；部分失败 → 留弹窗；well-known → ⑧ 的仅 CLI |
| ⑦ | 官方精选（可选） | 640×~560 弹窗：owner 行（名称、repo 标签、repos 数、skills 数、外链）；不做 owner 内部列表 | `/official` HTML（best-effort） | 点行 → 外链；解析失败 → 入口隐藏 |
| ⑧ | 状态集 | 3×3 网格：加载骨架、无结果、网络失败/限流、无网络、审计未生成、well-known 仅 CLI、已安装/可更新、同名冲突、部分失败 | 各页面真实状态 | 每格一个下一步按钮（重试 / 返回 / 去 Skills 页） |

布局：两行。

- 第 1 行「市场壳与榜单」：①②③④，x = 0 / 1500 / 3000 / 4500，y = 100。
- 第 2 行「详情、安装与状态」：⑤⑥⑧，x = 0 / 1500 / 3000，y = 1100；阶段 9 的 ⑦ 放 x = 4500。
- 每块 1440×900；列距 60；行距 100；行上方 22px 组标题 + 一行灰字 + 通宽分隔线；每块上方一个编号标签。
- 顶层节点预期：7 块画板 + 2 组标题 + 2 行说明 + 2 条分隔线 + 7 个标签 = 20；加 ⑦ 后 = 21。

Shell 与 token：

- 侧栏 248、内容 1192、页面 padding 24；`AppHeader` 实际是 `h-16`（64px），`designs/README.md` §1 写的 52px 是旧值。画板按**实际 64px** 画，并在 README 注明这个差异；不要为了对齐画板改 shell。
- 类型强调色沿用 Skills 的 `#A78BFA`；不新增色板。风险只用 success/warning/danger；机制类胶囊保持中性。
- 字体 `Noto Sans SC` / `JetBrains Mono`；圆角/间距照 README §4。
- 画板只表达内容区；顶栏/侧栏按实际 shell 画。

`designs/README.md` 需要更新：

- §1 导航：加入「市场」组（资产之下、工作区之上）与 4 行；注明顶栏实际 64px。
- §2 画板清单：加 `designs/market.pen` 的 7/8 块（画完补真实 id）；②e 标注“已被 `market.pen` 取代（2026-10-29）”。
- §2 分组：加一行「⑨ 市场」。
- §3b：把旧的下载弹窗段落标注为被市场页取代。
- §8：「插件市场未出稿」改为「Plugins/Remotion/Video 市场未出稿；Skills 市场见 `market.pen`」。
- 不重写 README 的其他章节。

## 受影响文件

### 新增

- `packages/market/package.json`
- `packages/market/tsconfig.json`
- `packages/market/eslint.config.js`
- `packages/market/vitest.config.ts`
- `packages/market/src/index.ts`
- `packages/market/src/extension.ts`
- `packages/market/src/types.ts`
- `packages/market/src/messages.ts`
- `packages/market/src/page.tsx`
- `packages/market/src/sources/index.ts`
- `packages/market/src/sources/skills-sh/source.tsx`
- `packages/market/src/sources/skills-sh/types.ts`
- `packages/market/src/sources/skills-sh/client.ts`
- `packages/market/src/sources/skills-sh/cache.ts`
- `packages/market/src/sources/skills-sh/service.ts`
- `packages/market/src/sources/skills-sh/rows.ts`
- `packages/market/src/sources/skills-sh/page.tsx`
- `packages/market/src/sources/skills-sh/detail-dialog.tsx`
- `packages/market/src/sources/skills-sh/install-dialog.tsx`
- `packages/market/src/sources/skills-sh/official-dialog.tsx`（阶段 9，可砍）
- `packages/market/__test__/extension.test.ts`
- `packages/market/__test__/market-client.test.ts`
- `packages/market/__test__/market-cache.test.ts`
- `packages/market/__test__/market-service.test.ts`
- `packages/market/__test__/market-rows.test.ts`
- `packages/market/__test__/market-official.test.ts`（阶段 9，可砍）
- `packages/market/__test__/fixtures/skills-sh/*.json|html`
- `designs/market.pen`（由 `designs/skills-sh.pen` 重命名）

### 修改

- `packages/extensions/src/types.ts`：`NavGroupId` 加 `"market"`；`NavContribution.soon?`。
- `apps/web/src/lib/navigation.ts`：市场组；`NavItem.soon?`。
- `apps/web/src/components/app-sidebar.tsx`：渲染市场组；传 `soon`。
- `apps/web/src/components/sidebar-rows.tsx`：`SidebarRow.disabled`。
- `apps/web/src/App.tsx`：`paths` 排除 `soon`。
- `apps/web/src/lib/hub.ts`：import `marketExtension` 并加入 `extensions`。
- `apps/web/package.json`：加 `"@context-hub/market": "workspace:*"`。
- `packages/extensions/src/builtin/locale-en.ts`：`nav.group.market`、`nav.soon`。
- `packages/i18n/zh-cn/src/messages.ts`：`nav.group.market`、`nav.soon` + 全部 `market.*`。
- `vitest.config.ts`（仓库根）：加 `packages/market/vitest.config.ts`。
- `packages/resources/skills/src/index.ts`：导出 `useSkillLibrary` / `useReadablePlaces` / `parseSkillFile` / `SkillFileTree` / `fileTreeKey`。
- `packages/resources/skills/src/page.tsx`：删旧搜索弹窗的 import/状态/registry；「探索」改 `<Button render={<a href="/market/skills" />}>`。
- `packages/resources/skills/src/messages.ts`：删除 `skills.search.*` 键（保留 `skills.action.explore` / `skills.action.exploreRemote`）。
- `packages/resources/skills/package.json`：删除 `use-immer`（只有 `search-dialog.tsx` 用它）。
- `pnpm-lock.yaml`：`pnpm install` 后的自然变更。
- `designs/README.md`：市场导航、画板清单、②e 取代说明。
- `docs/plans/skills-sh-market.md`：开头加“已被 `docs/plans/market-plugin.md` 取代（方向变更：市场是顶层菜单 + 新内置插件）”。

### 删除

- `packages/resources/skills/src/search-dialog.tsx`（阶段 10；市场页验收通过后删）。

### 不改

- `packages/extensions/src/skill-registry.ts`、`contributions.ts`。
- `D:\work-space\context-hub-extensions\plugins\skills.sh`（外部仓库，单独变更）。
- `packages/core/src/host/*`、`createNetHandler`。
- `packages/resources/skills/src/host/*`（除非测试暴露必须修的根因）。
- `apps/web/src/components/app-header.tsx`、`apps/web/src/components/app-layout.tsx`、`apps/web/vite.config.ts`、`apps/web/server.ts`。
- `apps/web/__test__/e2e-probe.ts`：仍引用 `extension-skills.sh` 这个扩展市场条目；外部插件从市场移除后同步改这个手工探针，不在本轮阶段 1-10 里改。
- `apps/web/server.ts` 的路由与参数（市场不需要新 host 路由）。

## 阶段

### 阶段 1：搭建市场包骨架与侧栏入口

**执行目标**：新包可安装、可 typecheck；侧栏出现「市场」组；`/market/skills` 渲染一个真实的市场外壳（标题 + 说明 + 接入中状态）；未实现来源显示灰态且不注册路由。

**改动文件**

- 新增 `packages/market/*` 骨架：`package.json`、`tsconfig.json`、`eslint.config.js`、`vitest.config.ts`、`src/index.ts`、`src/extension.ts`、`src/types.ts`、`src/messages.ts`、`src/page.tsx`、`src/sources/index.ts`、`src/sources/skills-sh/source.tsx`、`src/sources/skills-sh/page.tsx`（先把 `SkillsMarketPage` 写成返回 `MarketPage` 外壳的占位实现）。
- `package.json` 依赖：`@context-hub/extensions`、`@context-hub/shadcn-ui`、`@context-hub/skills`、`@deepseek-ai/cordis`、`lucide-react`、`react`、`react-router`（与 `apps/web` 相同的 `^8.4.0`）；devDependencies 照 `packages/resources/skills/package.json`（eslint / typescript / vitest / types）。`react-router` 从阶段 5 开始使用，但阶段 1 一次装好，避免二次 `pnpm install`。
- `package.json` 的 `exports` 至少写 `".": "./src/index.ts"` 与 `"./extension": "./src/extension.ts"`；`tsconfig.json` / `eslint.config.js` / `vitest.config.ts` 照 skills 包同名文件，`vitest.config.ts` 的 `name` 用 `market`、`include: ["__test__/**/*.test.ts"]`。
- 修改 `packages/extensions/src/types.ts`、`apps/web/src/lib/navigation.ts`、`apps/web/src/components/app-sidebar.tsx`、`apps/web/src/components/sidebar-rows.tsx`、`apps/web/src/App.tsx`、`apps/web/src/lib/hub.ts`、`apps/web/package.json`、`packages/extensions/src/builtin/locale-en.ts`、`packages/i18n/zh-cn/src/messages.ts`、根 `vitest.config.ts`。
- 新增 `packages/market/__test__/extension.test.ts`。

**关键实现点**

1. `marketModuleWith(sources)` 的 `apply`：按数组顺序注册 `ctx.nav`；有 `Component` 的注册 `ctx.routes`；未实现的注册 `soon: true` 且不注册路由；注册英文 `marketMessages`。
2. `MARKET_SOURCES` 四项；只有 Skills 带 `Component`。
3. manifest：`name: "hub.market"`、`version: "0.1.0"`、`kind: "code"`、`category: "integration"`、`description: { en: "Browse and install from external markets." }`、`icon: CompassIcon`、`defaultEnabled: true`、`locked: true`、`permissions: ["network", "assets.read", "assets.write"]`。阶段 1 **不写** `provides`；阶段 3 构造 `SkillMarket` 时再加 `provides: ["market.skills"]`。
4. `SkillMarketPage` 阶段 1 只渲染 `MarketPage`（标题「Skills 市场」、说明、`market.state.loading` 的空态），不造假数据。
5. 未实现来源的 nav 行：`Item.soon` → `SidebarRow disabled`；`App.tsx` 的 `paths` 排除 `soon`，直接访问 `/market/plugins` 落到 `*` 重定向。
6. `src/messages.ts` 先定义阶段 1 实际用到的键（至少 `market.source.*`、`market.skills.title` / `description`、`market.state.loading`）；`packages/i18n/zh-cn/src/messages.ts` 同步这些键，并在 base pack 同步加 `nav.soon`。后续阶段新增的 `market.*` 键在每个阶段同步补中文，不要等到最后。
7. 在仓库根跑 `pnpm install`，让 workspace 识别新包并链接依赖；如果沙箱拦截 registry，按 `docs/memory.md` 用非沙箱执行。

**验收**

```bash
pnpm install
pnpm --filter @context-hub/market typecheck
pnpm --filter @context-hub/market test
pnpm --filter @context-hub/zh-cn test
pnpm --filter web typecheck
```

手工：

1. `pnpm --filter web dev`（端口 5270/5271；被占就停下，不要杀别的进程）。
2. 打开 `http://127.0.0.1:5271/market/skills`：侧栏有 Market/市场 组；Skills 市场行激活；Plugins/Remotion/Video 是灰态、不可点；顶栏和 H1 一致（中文「Skills 市场」/ 英文「Skills market」）。
3. 直接访问 `http://127.0.0.1:5271/market/plugins`：被重定向到默认页，不出现 `PlaceholderPage`。

### 阶段 2：定义 Skills 市场 API 契约与解析

**执行目标**：把 6 个读取端点（榜单/搜索/下载/审计 v1/tele/页面元数据）变成纯函数 + 类型；全部用 fixture 测试；不接 UI、不发真网。官方精选留到阶段 9。

**改动文件**

- 新增 `packages/market/src/sources/skills-sh/types.ts`、`client.ts`、`rows.ts`（先放 `sameSource`、`sparkPoints`、`isWellKnown`、`safeSource`、`safeSkillArg`）。
- 新增 `packages/market/__test__/market-client.test.ts`、`market-rows.test.ts`、`fixtures/skills-sh/*`。

**关键实现点**

1. 类型照上文；`riskLevel` / `status` 用开放字符串。
2. `createMarketClient(net)` 实现 `rank/search/download/audit/teleAudit/pageMeta`；`officialOwners` 在阶段 9 补。
3. 统一 `refusal(status, body)`：读 `{error,message}`，优先 `message`，其次 `error`，最后 `skills.sh answered {status}`。
4. URL 拼装：`source` 按 `/` 拆段、逐段 encode；well-known 用 `/site/{domain}/{skill}`，404 再试 `/{domain}/skills/{slug}`。
5. `download` 路径校验：拒绝绝对路径、`..`、反斜杠；`contents` 非字符串跳过；`hash` 保留但不使用。
6. 测试：正常、缺字段、非法 view、1 字符搜索、400、404、非 JSON、非法路径、`SAFE` risk、空 tele、JSON-LD 缺失、`safeSkillArg` 拒绝 `../x` / `a/b` / `-x`。

**验收**

```bash
pnpm --filter @context-hub/market typecheck
pnpm --filter @context-hub/market test
rg -n "fetch\\(" packages/market/src/sources
```

判据：测试全绿；测试只注入假的 `NetPort`，运行时零真实网络；`rg` 在 `sources/` 内无输出（client 只用 `net.request`）。

### 阶段 3：建立市场缓存服务

**执行目标**：把纯客户端包成 `market.skills` 服务，带 TTL、并发去重、上限和 `available`；页面以后只读服务。

**改动文件**

- 新增 `packages/market/src/sources/skills-sh/cache.ts`、`service.ts`。
- 修改 `packages/market/src/extension.ts`（构造服务、`provides`）、`packages/market/src/index.ts`。
- 新增 `packages/market/__test__/market-cache.test.ts`、`market-service.test.ts`。

**关键实现点**

1. `createTtlCache({ now, limit = 200 })`：`get/set/delete/clear`；`get` 过期即删；超过上限删最早写入。
2. `SkillMarket extends Service`，服务名 `market.skills`；构造时读 `ctx.host.net`；`available` 为 `net !== null`；无 net 时方法抛 `this form cannot reach the network`。
3. 每个方法用缓存键和 TTL 表；同键并发共享 Promise。
4. `extension.ts` 里 `new SkillMarket(ctx)`；manifest `provides` 加 `MARKET_SKILLS_SERVICE`；`index.ts` 导出服务与常量。
5. 测试：第二次调用不增加 fake net 计数；TTL 过期后重新请求；并发两次只请求一次；`null` 负缓存；上限淘汰；无 net 的报错。

**验收**

```bash
pnpm --filter @context-hub/market typecheck
pnpm --filter @context-hub/market test
```

判据：测试全绿；服务在 `new Context()` 下能通过 `ctx.get("market.skills")` 取到；`available` 正确。

### 阶段 4：绘制市场画板

**执行目标**：在 `designs/market.pen` 画出 7 块画板（①-⑥、⑧；⑦ 阶段 9 再补），内容、状态、串联与数据来源按上文；不改源码。

**改动文件**

- `designs/market.pen`（由 `designs/skills-sh.pen` 重命名）
- `designs/README.md`

**关键实现点**

1. `mv designs/skills-sh.pen designs/market.pen`；文件未被 git 跟踪，不需要 `git mv`。不要用 Read/Grep 读 `.pen`，只用 pencil MCP 的 `open` / `execute` / `export_nodes`。
2. 两行布局：①②③④ / ⑤⑥⑧；1440×900；列距 1500、行距 1000；组标题、说明、分隔线、编号标签按 README 的家具规则。
3. shell：侧栏 248、顶栏 64（实际）、内容 1192、页面 padding 24；Skills 市场行激活；市场组 3 行灰态。
4. token 照 README §4；Skills 强调色 `#A78BFA`；风险只用 success/warning/danger。
5. ② 榜单：表头 + 10 行；All Time 画 8W 折线（96×24 SVG）；Trending 画 24h；Hot 画 `1H` + `+285` 绿色；官方徽标只画在 `isOfficial` 行。
6. ④ 结果：描述行同时画「骨架」和「已加载」两种，说明逐行加载；owner 胶囊可点。
7. ⑤ 详情：1040×640 弹窗；内容 tab 画 Markdown 正文；文件 tab 画 224px 文件树 + `CodeCard`；审计 tab 画 `pass/warn/fail` 三种 provider 行和“暂无审计”空态。
8. ⑥ 安装：目标只有「技能库」；冲突态、执行中、部分失败各画一个状态。
9. ⑧ 状态集：3×3 网格，每格一个状态 + 一个下一步按钮。
10. 导出：`export_nodes` 传 `document`，按顶层节点逐个导出 PNG；核对 7 张 1440×900、文字不越界、家具不压屏。
11. 画完后把真实画板 id 写回 `designs/README.md`；`designs/skills-sh.pen` 不在 README 里留旧条目。

**验收**

- pencil 工具导出 `document`，得到 20 个顶层节点；其中 7 张画板 PNG 尺寸均为 1440×900，另 13 个是组标题/说明/分隔线/编号标签。
- `ctx.problems` 中非“文档封面有意裁切”的越界/裁切为 0；无 placeholder。
- `designs/README.md` 的市场表列出 7 块画板、id、数据来源；②e 有“已被取代”标注；§1 有「市场」组。
- 本阶段不改源码；`pnpm typecheck` 仍通过。

### 阶段 5：实现榜单页

**执行目标**：`/market/skills` 的榜单三视图可用；加载更多、已安装/可更新徽标可用；URL 的 `view` 可刷新/后退。

**改动文件**

- `packages/market/src/sources/skills-sh/page.tsx`（替换阶段 1 的占位内容）
- `packages/market/src/page.tsx`（共享外壳与状态块）
- `packages/market/src/sources/skills-sh/rows.ts`（加 `rowState` / `conflictOf`）
- `packages/market/src/messages.ts`
- `packages/resources/skills/src/index.ts`（导出 `useSkillLibrary` / `useReadablePlaces`）
- `packages/market/__test__/market-rows.test.ts`（`sparkPoints` / `rowState` / `conflictOf`）

**关键实现点**

1. `useSearchParams` 读 `view`；非法值回落 `all-time`；`view` 用 `replace: true`。
2. `useSkillLibrary(useReadablePlaces())` 取 `store/rows/reload`；无 store 时只浏览，安装按钮禁用。
3. 榜单 state：`pages: MarketRankPage[]`、`status`、`failure`、`loadingMore`；`view` 变化时清空并读 page 0；「加载更多」读 `pages.length`。
4. 行渲染：rank、名称（等宽）、官方徽标、来源、安装量、折线/change、动作；动作按 `rowState`。
5. 折线用内联 SVG：`sparkPoints(weeklyInstalls, 96, 24)`；全 0 画平线；缺失不画。
6. 失败不清空：保留 `pages`，顶部横幅显示失败，提供重试。
7. `rowState` 先判 well-known（`isWellKnown(source)` → `cli-only`），再按 `conflictOf` 判 `installed` / `update` / `conflict` / `install`；`conflictOf` 在阶段 5 就位，阶段 8 只消费它。

**验收**

```bash
pnpm --filter @context-hub/market typecheck
pnpm --filter @context-hub/market test
pnpm --filter @context-hub/zh-cn test
```

手工：

1. 打开 `/market/skills`，默认 All Time，至少 5 行。
2. 切 Trending / Hot：Hot 行出现 `1H` 与带符号 `change`；All Time 行出现 8 段折线。
3. 点「加载更多」，行数增加；末页按钮消失或禁用。
4. 浏览器后退/前进，`view` 保留。
5. 库里已有同名技能时，对应行显示「已安装」；有 `outdated` 记录时显示「可更新」。

### 阶段 6：实现搜索与逐行描述

**执行目标**：搜索满足 2 字符下限、200 条上限、owner 过滤；结果行描述逐行加载；翻页不再发网络请求。

**改动文件**

- `packages/market/src/sources/skills-sh/page.tsx`
- `packages/market/src/sources/skills-sh/client.ts`（如需要补 owner 参数）
- `packages/market/src/sources/skills-sh/rows.ts`
- `packages/market/src/messages.ts`
- `packages/resources/skills/src/index.ts`（导出 `parseSkillFile`）
- `packages/market/__test__/market-client.test.ts`、`market-rows.test.ts`

**关键实现点**

1. 搜索框 300 ms 防抖；`q` 为空时回到榜单；只有 1 个字符时不请求，显示提示。
2. 每次 q/owner 变化请求一次 `search(query, owner)`；用 generation ref 丢弃过期答案。
3. 结果 200 行缓存在服务里；页面按 10 行/页切片，「加载更多」只增加 slice。
4. 描述：对当前已展示、尚未缓存的 GitHub 行调 `market.download(source, skill)`；取 `SKILL.md` 的 `parseSkillFile(...).frontmatter.description`；并发 3；结果写 `Record<rowKey, string | null>`；骨架 → 文本。
5. download 失败/404/过大 → `market.pageMeta(source, skill)`（仅 GitHub）；再失败 → `null`；well-known 行直接 `null`。
6. owner：输入框 + 行内 owner 可点（只对 GitHub 行）；写入 URL `?owner=`；清空按钮。
7. 截断：`rows.length === 200` 时显示“只显示前 200 条，请细化关键词”；计数只显示本次返回行数。
8. 空态：0 结果、失败、加载中各一套；失败保留上一次结果。

**验收**

```bash
pnpm --filter @context-hub/market typecheck
pnpm --filter @context-hub/market test
```

手工：

1. 输入 1 个字符：不请求，显示提示；输入 2 个字符：出现结果。
2. 搜索 `find`：`find-skills` 行先出骨架，随后出现描述；同一行重复搜索不再请求。
3. `owner=vercel-labs`：只剩该 owner 的行；清空后恢复。
4. 快速连续输入：只有最后一个 query 落到界面。
5. 翻页不发 `/api/search`（用服务单测或 CDP Network 确认）。

### 阶段 7：实现详情三页签

**执行目标**：点行打开详情；内容 / 文件 / 安全审计三块按数据来源工作；well-known 有明确说明；已安装技能可更新。

**改动文件**

- 新增 `packages/market/src/sources/skills-sh/detail-dialog.tsx`
- 修改 `packages/market/src/sources/skills-sh/page.tsx`、`rows.ts`、`messages.ts`
- `packages/resources/skills/src/index.ts`（导出 `SkillFileTree` / `fileTreeKey`；`parseSkillFile` 已在阶段 6 导出）
- `packages/market/__test__/market-rows.test.ts`（`treeFromFiles`）

**关键实现点**

1. `Dialog` 1040×640；头部名称、来源外链、官方徽标、安装量、主操作；页签用 `TabsList variant="line"`。
2. 打开时并行：`market.download`（GitHub）或 `market.pageMeta`（well-known）；`market.audit`；404 再 `market.teleAudit`；已安装状态从 `library.rows` 找同名行。
3. 内容 tab：GitHub 用 `parseSkillFile(SKILL.md).body` → `Markdown`；没有 `SKILL.md` 显示说明；well-known 显示“不提供文件内容 API”+ 外链 + 安装命令。
4. 文件 tab：`treeFromFiles(bundle.files)` → `SkillFileTree`（224px）+ `CodeCard`；选中文件从 `bundle.files` 取 `contents`；404/过大显示说明 + 外链。
5. 审计 tab：v1 provider 行；v1 `null` → tele 三行 + “部分审计”；都空 → “暂无审计”+ 外链；失败 → “审计读取失败”+ 重试。
6. footer：可安装 → 安装弹窗；已安装且 `outdated` → `library.update(held.name)`；已安装且最新 → 禁用；冲突 → 禁用；well-known → 复制命令。
7. 所有 SKILL.md 走现有 `Markdown`（已 sanitize）；不 `dangerouslySetInnerHTML`。

**验收**

```bash
pnpm --filter @context-hub/market typecheck
pnpm --filter @context-hub/market test
```

手工：

1. 打开 `find-skills` 详情：内容 tab 有 Markdown；文件 tab 有 `SKILL.md`；审计 tab 至少有 provider 行。
2. 打开 `anthropics/skills/pdf`：文件树出现 `scripts/` 和多个文件；点 `SKILL.md` 显示正文。
3. 打开 `uizze.sh/ui-taste`（well-known）：内容/文件显示“不提供文件 API”，审计显示“暂无审计”，安装按钮为「仅 CLI」。
4. 先在 Skills 页跑一次「检查更新」，让库里有 `outdated` 记录；打开对应技能详情，footer 显示「更新」，点后库刷新、徽标消失。
5. 关闭详情，列表滚动位置不变。

### 阶段 8：接入安装与更新

**执行目标**：从市场行或详情安装一个 GitHub 技能；只写技能库；冲突/执行中/部分失败都有明确反馈；安装后库刷新。

**改动文件**

- 新增 `packages/market/src/sources/skills-sh/install-dialog.tsx`
- 修改 `packages/market/src/sources/skills-sh/page.tsx`、`messages.ts`
- `packages/market/__test__/market-rows.test.ts`（补安装目标/部分失败的断言；`conflictOf` / `rowState` 已在阶段 5 覆盖）

**关键实现点**

1. 消费阶段 5 的 `conflictOf(row, library.rows)`：
   - 同名同来源 → `installed`；
   - 同名不同来源 / 无 `upstream` → `conflict`；
   - 无同名 → `none`。
2. 目标列表只有「技能库」一行（选中、不可改）；文案说明“安装后可去 Skills 页投递到 Agent”。
3. 确认：校验 `source` / `skillId`；`store.installPackage(row.source, [row.skillId])`；`installed.length === 0` 时逐条显示 `failed[]`；成功 `library.reload()`、关闭、toast。
4. 执行中禁用关闭/Esc；步骤文案“正在下载到技能库…”。
5. well-known：不打开安装弹窗；详情里给命令 + 复制 + 外链。
6. 安装成功后，详情保持打开并把主按钮变「已安装」；列表行同步。

**验收**

```bash
pnpm --filter @context-hub/market typecheck
pnpm --filter @context-hub/market test
```

手工（**必须用临时 hub home，不碰真实 `~/.context-hub` 和用户工作区**）：

1. `TEMP_HOME=$(mktemp -d)`；`TEMP_WORK=$(mktemp -d)`；`pnpm --filter web build`；`node apps/web/server.ts --port 5283 --static apps/web/dist --home "$TEMP_HOME" --folder "$TEMP_WORK"`。
2. 搜索 `find`，安装 `vercel-labs/skills/find-skills`；确认后 `$TEMP_HOME/skills/find-skills/SKILL.md` 存在。
3. 回到市场行，状态为「已安装」；详情 footer 为「已安装」。
4. 再次安装同一行：预检为已安装，不发起 CLI。
5. 在临时库里放一个同名本地技能目录（无 `upstream`），确认冲突态禁用安装并说明原因。
6. well-known 行：安装按钮为「仅 CLI」，显示命令；不写盘。
7. 收尾删 `$TEMP_HOME` 和 `$TEMP_WORK`；不要点任何全局位置（本轮没有位置列表）。

### 阶段 9：解析官方精选（可选）

**执行目标**：可选入口可用；解析成功显示 owner 分组，失败隐藏；不影响榜单/搜索。排期紧时整段砍掉，同时删除 `client.ts` 的 `officialOwners` 与 `MarketOwner` 类型，画板 ⑦ 也后补。

**改动文件**

- `packages/market/src/sources/skills-sh/client.ts`（`officialOwners`）
- 新增 `packages/market/src/sources/skills-sh/official-dialog.tsx`
- 修改 `packages/market/src/sources/skills-sh/page.tsx`、`messages.ts`
- 新增 `packages/market/__test__/market-official.test.ts`、fixture `official.html`

**关键实现点**

1. 正则解析 owner 行；只收 href 恰一段的链接；owner/repo/两个计数齐全才收；去重、按 skills 降序。
2. 入口在榜单第一页渲染后后台读 `market.officialOwners?.()`；空数组/失败隐藏按钮；成功缓存 6 小时，空/失败缓存 10 分钟。
3. 弹窗只展示 owner 行 + 外链；不调用搜索 API。
4. fixture 用一条真实 owner 行的 HTML 片段；测试解析成功、缺列跳过、0 行返回 `[]`。

**验收**

```bash
pnpm --filter @context-hub/market typecheck
pnpm --filter @context-hub/market test
curl -s https://www.skills.sh/official | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(/href="\/[A-Za-z0-9._-]+"/.test(s)))'
```

判据：fixture 测试全绿；live curl 打印 `true`；把 fixture 改成坏结构时测试断言返回 `[]`；榜单页在坏结构下没有「官方精选」入口。

### 阶段 10：清理旧入口、补齐文案与文档

**执行目标**：Skills 页不再有旧远程搜索弹窗/registry 读取；「探索」指向市场；中英文成对；设计文档更新；全仓检查通过。

**改动文件**

- 删除 `packages/resources/skills/src/search-dialog.tsx`。
- 修改 `packages/resources/skills/src/page.tsx`、`messages.ts`、`package.json`、`packages/i18n/zh-cn/src/messages.ts`、`designs/README.md`、`pnpm-lock.yaml`。

**关键实现点**

1. 先删 `search-dialog.tsx` 和 `page.tsx` 里对它的 import/状态/组件，连同不再使用的 `useContributions` import；再把三处「探索」/「探索远程技能」改成 `<Button render={<a href="/market/skills" />}>`（普通链接，不给 skills 包加 react-router 依赖）。
2. 然后删 `skills.search.*` 键（只被旧弹窗使用）；保留 `skills.action.explore` / `skills.action.exploreRemote`（现在是市场链接的文案）。
3. 中文包删除同名 `skills.search.*` 键；新增的 `market.*` 与 `nav.group.market` 全部补齐。
4. `packages/resources/skills/package.json` 删除 `use-immer`（`search-dialog.tsx` 是唯一使用者）；在仓库根跑 `pnpm install` 更新 `pnpm-lock.yaml`。如果环境无法跑安装，就**不要删** `package.json` 里的依赖，并在报告里记录，不要手改 lockfile。
5. `designs/README.md` 完成阶段 4 的条目；②e 标注被取代。
6. 文档：`docs/plans/skills-sh-market.md` 开头那行在写本计划时已经加上，不需要再改。

**验收**

```bash
pnpm --filter @context-hub/skills lint
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/zh-cn test
pnpm --filter web typecheck
pnpm --filter web test
pnpm typecheck
pnpm test
rg -n "SearchSkillsDialog|searchOpen" packages/resources/skills/src
rg -n "skills\\.search\\." packages/resources/skills/src packages/i18n/zh-cn/src
```

判据：全部 0 failed；`rg` 两条都无输出；中文包测试无 “not in the pack”；`designs/README.md` 的表与实际画板 id 一致。若 `pnpm test` 里依赖外网/`skills` CLI 的既有用例因环境失败，记录失败项与命令，不把它算成本轮改动通过或失败。

## 测试与验证

### 单测矩阵

| 文件 | 覆盖 |
| --- | --- |
| `extension.test.ts` | `apply` 注册 4 个 nav、只对 Skills 注册 1 个 route、未实现来源带 `soon`、英文 locale 注册 |
| `market-client.test.ts` | 三榜单解析、可选字段、非法 view、400/404、非 JSON、搜索 1 字符/200 上限/owner、download 路径校验、audit `SAFE`、tele 空、pageMeta JSON-LD/meta/命令 |
| `market-cache.test.ts` | TTL 命中/过期、in-flight 去重、上限淘汰、`null` 负缓存 |
| `market-service.test.ts` | 服务名与 `available`、无 net 报错、缓存复用 |
| `market-rows.test.ts` | `sameSource` 归一化、`rowState` 五种状态、`safeSource`/`safeSkillArg`、`treeFromFiles` 目录补齐/排序/bytes/危险路径、`sparkPoints` 8 点/全 0/缺失、`conflictOf` |
| `market-official.test.ts` | owner 行解析、缺列跳过、0 行（可并入 client 测试） |

组件层没有 DOM 测试环境（`apps/web/vitest.config.ts` 的 `environment` 是 node），不引入 jsdom；UI 走手工/CDP。

### fixture 与可复现 curl

fixtures 放 `packages/market/__test__/fixtures/skills-sh/`，只存裁剪后的形状，不提交 514 KB 的 official 页；每个 fixture 在测试文件里注明来源 URL 和抓取日期。测试用 `readFileSync` + `JSON.parse`，不依赖 `resolveJsonModule`。

```bash
TEMP=$(mktemp -d)

# 榜单：取 3 行裁剪
curl -s https://skills.sh/api/skills/all-time/0   -o "$TEMP/all-time-0.json"
curl -s https://skills.sh/api/skills/trending/0   -o "$TEMP/trending-0.json"
curl -s https://skills.sh/api/skills/hot/0        -o "$TEMP/hot-0.json"

# 搜索
curl -s "https://skills.sh/api/search?q=find&limit=200" -o "$TEMP/search-find.json"

# 下载（多文件技能）
curl -s https://skills.sh/api/download/anthropics/skills/pdf -o "$TEMP/download-pdf.json"

# 审计（含 SAFE / MEDIUM）
curl -s https://skills.sh/api/v1/skills/audit/vercel-labs/skills/find-skills -o "$TEMP/audit-find-skills.json"
curl -s "https://www.skills.sh/tele/audit?source=vercel-labs/skills&skills=find-skills" -o "$TEMP/tele-find-skills.json"

# 详情页：只保留 JSON-LD + meta + 安装命令片段
curl -s https://www.skills.sh/vercel-labs/skills/find-skills -o "$TEMP/page-find-skills.html"

# well-known：确认没有 SoftwareApplication
curl -s https://www.skills.sh/site/uizze.sh/ui-taste -o "$TEMP/page-ui-taste.html"

# official：只截一条 owner 行
curl -s https://www.skills.sh/official -o "$TEMP/official.html"
```

Windows Git Bash 下不要用 `/tmp/...`：curl 是 Windows 程序，会把 `/tmp` 当成当前盘的 `\tmp`，写到一个可能不存在的目录。用 `TEMP=$(mktemp -d)`。抓完后用 `node` 裁剪（例如只留 `skills.slice(0,3)`、只留一条 `<a href="/...">`），再写进 fixtures；不要在测试运行时联网。

边界检查：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://skills.sh/api/skills/bogus/0
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://skills.sh/api/skills/hot
curl -s -o /dev/null -w "%{http_code}\n" "https://skills.sh/api/search?q=a"
curl -s https://skills.sh/api/skills/hot/999 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.skills.length,j.hasMore)})'
```

### 手工 / 端到端验收

**仓库内命令**

```bash
pnpm --filter web build
node apps/web/server.ts --port 5283 --static apps/web/dist \
  --home <临时 hub home> --folder <临时工作区>
```

打开 `http://127.0.0.1:5283/market/skills`。用 headless Edge + CDP（`docs/memory.md` 的 `--remote-debugging-port` 方式）或人工检查：

1. 侧栏「市场」组 4 行；Skills 激活；其余灰态不可点。
2. 榜单默认 All Time，≥5 行；切 Trending/Hot，Hot 出现 `1H` 与带符号 change。
3. 搜索 `find`，`find-skills` 行出现描述；1 字符不出请求。
4. 打开 `find-skills` 详情：三个 tab 都有内容；文件 tab 有 `SKILL.md`；审计 tab 有 provider。
5. 安装到临时 hub home 的技能库，确认 `<临时 hub home>/skills/find-skills/SKILL.md`；市场行变已安装；再次安装不触发 CLI。
6. 打开 well-known `ui-taste`：安装按钮为「仅 CLI」，显示 `npx skills add https://uizze.sh/`；不写盘。
7. 断网（或改一个不可达的 host）刷新：保留上次列表，出现失败提示和重试。
8. 关闭详情：列表滚动位置不变；浏览器后退/前进，`view/q/owner` 保留。
9. `/market/plugins` 直接访问被重定向，不出现 `PlaceholderPage`。

**CDP 探针（可选，不进 CI）**

可新建 `apps/web/__test__/market-probe.ts`，照现有 `e2e-probe.ts` 的模式检查（这些 `data-testid` 要由实现加上：阶段 5 给榜单行加 `market-row`，阶段 7 给详情弹窗加 `market-detail`，阶段 8 给已安装徽标加 `market-row-installed`）：

- `[data-testid="market-row"]` 数量 ≥ 5；
- 点第一行后 `[data-testid="market-detail"]` 存在；
- 文件 tab 出现 `SKILL.md`；
- 审计 tab 出现 provider 行；
- 安装后 `[data-testid="market-row-installed"]` 存在。

探针默认连真实 skills.sh，只在手工验收运行；失败时先看网络/接口，不要把它当单测。

### 未验证内容

- `/api/download` 对二进制/图片文件 `contents` 的编码：只验证过文本文件；非文本可能乱码，不阻塞。
- 429/限流行为：没有触发过；页面按非 200 显示错误，不做退避重试。
- `/official` HTML 结构变化：解析是 best-effort；失败隐藏入口。
- `hot` 的 `total` / `change` 统计口径：只按显示值使用，不做计算。
- 搜索 `count` 是否在某些 query 下不同于返回行数：实测等于返回行数；代码不依赖它。
- `host.net` 在桌面/CLI 形态的 10 s / 4 MB 表现：与 web 共用 `createNetHandler`，理论一致；未逐形态跑。
- 外部插件通过 `ctx` 原型访问 `nav` / `routes` 的运行时行为：本计划不依赖它；若要正式支持，需要单独设计外部插件 UI 契约。

## 风险与待决问题

### 风险

1. **非官方 API**：skills.sh 的公开路由没有契约；字段/HTML 一变就可能失效。缓解：形状校验、可选字段、失败不清空、官方精选可隐藏、fixtures 单测固定已知形状。不能保证长期兼容。
2. **HTML 解析脆弱**：`/official` 和 well-known 页面靠正则；结构变化时只能隐藏/降级，不能自动修复。
3. **4 MB / 10 s 上限**：大技能包/慢网络会在 `host.net` 失败；详情文件 tab 只能提示，不能预览。榜单首包实测 3.6 s，慢网可能超时。
4. **安装写真实目录**：`installPackage` 写 hub home 的 `skills/`；验收必须用 `--home` 指向临时目录。本轮没有位置列表，不会写 Agent 目录。
5. **同名冲突**：现有库没有覆盖/改名 API；市场只能拒绝，用户需要去 Skills 页处理。
6. **well-known 体验不完整**：不能在此安装、不能读文件、没有描述；设计必须明确，否则会被当成 bug。
7. **CLI 注入面**：远端 `source` / `skillId` 进入 `npx` 参数；本计划要求安装前做严格来源校验和名字校验，但现有外部插件路径没有这层校验，不能把本轮的校验当成全局修复。
8. **公共契约变更**：`NavGroupId` 加 `"market"`、`NavContribution.soon?` 是向后兼容的增量；但外部声明式导航若误用 `soon`，会变成不可点。需要在 `types.ts` 注释里写清语义。
9. **市场依赖 Skills 的公开导出**：`useSkillLibrary` / `useReadablePlaces` / `parseSkillFile` / `SkillFileTree` 从 skills 包导出后成为跨包契约；skills 包改签名会直接坏市场。测试覆盖行状态与文件树。
10. **`use-immer` 清理**：删除 `search-dialog.tsx` 后它是 skills 包唯一使用者；移除需要 `pnpm install` 更新 lockfile。环境不允许时保留依赖并在报告里记录。

### 待决问题（请审批时确认）

1. **市场组在侧栏的位置**：资产组之下、工作区之上（推荐）；还是资产组之上，或工作区/Agent 之下？
2. **包位置与包名**：`packages/market` / `@context-hub/market`（推荐，顶层 surface，`packages/*` 已覆盖）；还是 `packages/resources/market`（跟资产模块放一起）？
3. **安装目标**：只写技能库（推荐，位置写入留在 Skills 页；代价是市场装完不能直接投递，弹窗给「去 Skills 页」链接）；还是市场也列位置（需要把位置列表接进安装弹窗，并多一步 `installInto`）？
4. **设计文件**：把 `designs/skills-sh.pen` 重命名为 `designs/market.pen`（推荐，空文件、未跟踪）；还是保留原名？本文的步骤假设重命名。
5. **旧外部插件删除时机**：本仓库市场验收/发布后，在 `context-hub-extensions` 单独提交删除或停用（推荐）；还是本轮同时改 `SkillRegistry` 契约（不做）？
6. **官方精选**：放在最后阶段、可整段砍（推荐）；还是本轮必须做，或本轮明确不做？
7. **榜单/搜索状态是否写 URL**：`?view=&q=&owner=`（推荐，市场包依赖 react-router；刷新/后退保留）；还是只用组件状态（不新增包依赖，但刷新/后退丢状态）？
8. **未实现市场行的交互**：灰态禁用、不注册路由（推荐，需要 `NavContribution.soon`）；还是本轮只在设计里留位、运行时不显示这三行？

## 自审

- **阶段顺序**：1（壳）→ 2（契约）→ 3（服务）→ 4（设计）→ 5（榜单）→ 6（搜索）→ 7（详情）→ 8（安装）→ 9（官方，可砍）→ 10（清理）。每个阶段只依赖前面已创建的文件；4 只依赖 2 的字段形状，可与 3 并行。
- **验收可执行**：每个阶段都有 `pnpm --filter` / 根脚本、手工 URL、或 pencil 导出判据；没有“验证一下”。
- **调用方/测试/fixture/配置**：`hub.ts`、`App.tsx`、`navigation.ts`、`app-sidebar.tsx`、`sidebar-rows.tsx`、`locale-en.ts`、zh-cn、根 `vitest.config.ts`、skills 的 `index.ts`/`page.tsx`/`messages.ts`/`package.json` 都列入；fixtures 与 curl 已写。
- **事实与猜想分开**：API 事实来自旧计划 2026-10-29 的实测；外部插件 API 的限制写明是外部仓库契约与未承诺的运行时能力；未验证项单列。
- **范围**：非目标覆盖了其他市场页面、`/market` 落地页、Pack/Topic/Agent、OIDC、hash 版本、覆盖/批量、无限滚动、新第三方包、外部插件、host 路由、自动刷新、全局搜索。没有顺手改无关模块。
- **职责边界**：本计划只写文档；阶段 1-10 是执行内容，获批后才动源码、配置或 `.pen`。

## 外部仓库变更（不在本仓库执行）

在本仓库市场通过验收并发布后，单独处理 `D:\work-space\context-hub-extensions`：

1. 从该仓库的市场索引/插件列表移除 `plugins/skills.sh`。
2. 归档或删除 `plugins/skills.sh` 目录。
3. 更新该仓库 README，说明 Skills 市场已内置到 Context Hub。
4. 不在本仓库删除 `SkillRegistry` 契约与贡献点；它们是公共 API，等外部仓库确认没有消费者后再单独清理。
5. 同一次外部变更后，更新 `apps/web/__test__/e2e-probe.ts` 里引用 `extension-skills.sh` 的用例，否则这个手工探针会因为市场里没有该条目而失败。

本轮不执行以上五条。
