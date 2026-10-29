已被 docs/plans/market-plugin.md 取代（方向变更：市场是顶层菜单 + 新内置插件）

# skills.sh 市场集成

## 背景

Skills 页右上角的「探索」当前打开 `SearchSkillsDialog`（`packages/resources/skills/src/search-dialog.tsx`）：640px 弹窗、每页 6 行，只消费外部插件 `skills.sh` 通过 `SkillRegistry` 贡献的 `/api/search`，描述靠逐行抓 HTML `<meta name="description">`。它没有榜单、详情、文件树、安全审计，也没有可回退/可分享的页面地址。

本次要把 skills.sh 做成 Skills 模块内置的市场页：

- 公开只看三个榜单（All Time / Trending / Hot）、搜索、详情、文件树、描述、审计；
- 不创建 Vercel OIDC token，不使用 `sk_live_` key，不碰任何 401 的 `/api/v1` 列表/搜索路由；
- 安装沿用现有 `skills` CLI，更新沿用 `skills-lock.json` 的 `computedHash` + `git ls-remote`；
- 设计画在 `designs/skills-sh.pen`（当前为空画布，1787 bytes），沿用 `designs/README.md` 的 shell 与 token。

### 已核实的 API 事实（2026-10-29 实测）

以下均用 `curl` 实测；与任务给定的事实冲突的地方已单列。

| 端点 | 实测 | 用途 |
| --- | --- | --- |
| `GET https://skills.sh/api/skills/{view}/{page}` | 200；all-time page 0 共 200 行；`total` 是滚动值（实测 hot 3826 / 6657 在不同时刻，all-time 9911），代码不依赖它 | 市场榜单 |
| `GET https://skills.sh/api/search?q=&limit=&owner=` | 200；`q` 1 字符 400；`limit=999` 仍回 200 行 | 市场搜索 |
| `GET https://skills.sh/api/download/{owner}/{repo}/{slug}` | 200；`find-skills` 5.7 KB / 1 文件；`anthropics/skills/pdf` 62 KB / 12 文件；well-known 源 404 | 详情内容 + 文件树 + 描述 |
| `GET https://skills.sh/api/v1/skills/audit/{source}/{skill}` | 匿名 200；无审计 404；well-known `mintlify.com/mintlify` 200 | 详情安全审计 |
| `GET https://www.skills.sh/tele/audit?source=&skills=` | 200；未审计返回 `{skill:{}}`，不报错 | 审计兜底 |
| `GET https://www.skills.sh/official` | 200 HTML ≈ 514 KB；owner 行 + 两个计数列 | 官方精选（可选） |
| `GET https://www.skills.sh/{owner}/{repo}/{skill}` | 200 HTML ≈ 83 KB；含 JSON-LD `SoftwareApplication` 和安装命令 | 详情元数据 / 搜索描述兜底 |
| `GET https://www.skills.sh/site/{domain}/{skill}` | 200 HTML；well-known 的 canonical 形式 | well-known 详情 |
| `GET https://www.skills.sh/{domain}/skills/{slug}` | 200 HTML；与上一条等价，页面只含 `WebSite` JSON-LD | well-known 旧地址 |

关键实测细节：

- **榜单语义**：All Time 的 `installs` 是总安装量（`ui-taste` 807,713），并带 8 个 `weeklyInstalls`；Trending 的 `installs` 是 24h 安装量（同一条 24,216）；Hot 的 `installs` 是 1h 安装量（同一条 295），站点列头是 `1H / Change`，`change` 是 `+285`。`installsYesterday` 是另一列。`isOfficial` 在三个视图里都可能出现，按可选字段处理。
- **榜单分页**：`page` 从 0 开始，每页 200；`hasMore` 是权威判据。越界页（如 `hot/999`）返回 `skills: []`、`hasMore: false`、200，不是 404。不传 `page` 会落到 HTML 页面（200 `text/html`），所以客户端必须永远带 page。
- **搜索没有 offset**：一次最多 200 行；`count` 等于本次返回的行数（`limit=200` 时 `count=200`），不是命中总数。分页只能一次要 200、客户端切片。
- **下载 hash 不可当版本**：`/api/download` 的 `hash` 与 `skills-lock.json` 的 `computedHash` 算法不一致；更新判据仍用 `packages/resources/skills/src/host/upstream.ts` 的 `skillFolderHash` + `git ls-remote`。
- **审计 `riskLevel` 是开放集合**：实测出现 `SAFE`、`MEDIUM`，不是任务里列的 `NONE|LOW|MEDIUM|HIGH|CRITICAL`。解析时保留未知值，按 `safe/none/low`、`medium`、`high/critical` 三档着色，未知走中性。
- **well-known 详情页没有可用的技能描述**：`/site/uizze.sh/ui-taste` 和 `/uizze.sh/skills/ui-taste` 的 JSON-LD 只有 `WebSite`，`<meta name="description">` 是通用句（`Install the ui-taste skill...`），不是 SKILL.md 摘要。不要把它当描述。
- **well-known 安装命令**：页面里是 `npx skills add https://uizze.sh/`；GitHub 页面里是 `npx skills add https://github.com/vercel-labs/skills --skill find-skills`。CLI 对 well-known 源不支持 `--json`，hub 无法确认安装结果。
- **无 CORS**：所有页面/接口都不能由浏览器直连，必须走 `host.net`。`createNetHandler` 只做 GET、10 s 超时、4 MB 上限，不返回响应头。

### 与任务给定事实不一致的地方

| 给定 | 实测 | 处理 |
| --- | --- | --- |
| hot 总量 9989 | 总量是滚动值（实测 3826 / 6657 / 9989 在不同时刻） | 不硬编码总量；只信 `hasMore` 和实际行数 |
| `riskLevel` 枚举到 `CRITICAL` | 还出现 `SAFE` | 类型用 `string`，映射表开放 |
| well-known 详情 `/{domain}/skills/{slug}` | canonical 是 `/site/{domain}/{slug}`，旧地址也 200 | 先试 canonical，404 再试旧地址 |
| 搜索返回含 `count` | `count` 是本次返回行数，不是命中总数 | 不用于分页或“共 N 条” |

## 目标

1. 市场首页能看三个榜单，All Time 带 8 周折线，Hot 带 1h 安装量与 `+change`。
2. 搜索满足至少 2 字符、200 条上限、owner 过滤；结果行逐步补描述，不阻塞列表。
3. 详情弹窗有内容 / 文件 / 安全审计三个 tab；GitHub 源能渲染 SKILL.md 和文件树，well-known 源明确说明不可在此读取文件。
4. 安装确认能选目标位置、识别同名冲突、显示执行中与逐条失败原因；安装后市场行和 Skills 库同步。
5. 已安装 / 可更新状态以库里的 `upstream` + `checked` 为准，不用 skills.sh 的下载 hash。
6. 官方精选做成可选模块：HTML 解析成功才显示；失败隐藏入口。
7. 设计稿落在 `designs/skills-sh.pen`，每块画板有数据来源和串联路径。
8. 不新增依赖；所有网络请求经 `host.net`；所有渲染内容经过现有 sanitize。

## 非目标

- 不做 Pack 浏览、Topic/Agent 浏览、作者页浏览：这些没有公开 JSON 列表接口，本次不设计无数据来源的页面。
- 不创建 Vercel OIDC token，不使用 `sk_live_` key；不调用 `/api/v1/skills`、`/api/v1/skills/search`、`/api/v1/skills/curated`、`/api/v1/skills/{source}/{skill}`（全部 401）。
- 不用 `/api/download` 的 `hash` 做版本号、更新判据或缓存键的一部分。
- 不做同名覆盖、自动改名、批量安装、批量更新。
- 不做无限滚动和自动预取；榜单用「加载更多」，搜索一次取 200 行客户端切片。
- 不改外部仓库 `D:\work-space\context-hub-extensions\plugins\skills.sh`，也不改 `SkillRegistry` 契约。
- 不改 `createNetHandler`（GET/10 s/4 MB 已够）；不改 `apps/web` 的 shell、路由或 header。
- 不新增依赖：HTML 用正则、折线用内联 SVG、Markdown/YAML/文件树都用现有实现。
- 不把 `/api/download` 的文件写到磁盘；它只用于预览。
- 不设计官方 owner 的内部下钻或筛选：没有 JSON 接口，owner 行只做外链。
- 不做市场页的自动刷新/轮询；缓存过期后由重新进入页面或切换榜单触发。
- 不清理旧弹窗留下的 `use-immer` 依赖（skills 包内它只被 `search-dialog.tsx` 使用；删弹窗后变成未使用依赖）。为免本轮改 `pnpm-lock.yaml`，只在收尾报告里记录，下一轮单独清理。

## 现状（按真实代码）

| 位置 | 当前行为 |
| --- | --- |
| `packages/resources/skills/src/page.tsx` `SkillsPage` | `useContributions("skillRegistry")` 取第一个 registry；右上「探索」`setSearchOpen(true)`；`<SearchSkillsDialog>` 挂在页尾。 |
| `packages/resources/skills/src/search-dialog.tsx` | 640px、每页 6 行；`source.search({query,offset,limit})`；`fillDetails` 并发 3 调 `registry.describe`；安装走 `store.installPackage(skill.package,[skill.name])`。 |
| `packages/extensions/src/skill-registry.ts` | `RemoteSkill` 只有 name/source/description/package/installs/tag；`SkillRegistry` 只有 `search` + 可选 `describe`。 |
| `D:\work-space\context-hub-extensions\plugins\skills.sh\src\index.ts` | 用 `scope.host.net.request` 调 `/api/search`，逐行抓 `/{source}/{name}` 的 `<meta name="description">`；`known` Map 做进程内缓存。 |
| `packages/resources/skills/src/remote-store.ts` | `listPackage(source)` → `/hub/skills?action=package`；`installPackage(source, skills)` → `POST {action:"install"}`；`installInto(name, ref)` → `{action:"install-place"}`。 |
| `packages/resources/skills/handlers.ts` | `/hub/skills` 的 GET/POST 派发；`under()` 要求路由分隔符；`install` 调 `api.installPackage`。 |
| `packages/resources/skills/src/host/skills-cli.ts` | `downloadPackageSkills` 在临时目录跑 `npx skills add <source> --skill <name> -a universal --copy -y --json`；`assertSkillName` 在 `adopt` 前校验；well-known 的 `--json` 不被 CLI 支持。 |
| `packages/resources/skills/src/host/upstream.ts` | 读 `skills-lock.json` 的 `computedHash`；`skillFolderHash` 复用 `@context-hub/core/host/folder-hash`。 |
| `packages/resources/skills/src/host/git-source.ts` | `parseGitSource` + `readRemoteRevision`（`git ls-remote`）；不解析 `#ref`。 |
| `packages/resources/skills/src/host/skills-fs.ts` | 安装时先读 `revisionOf(source)`，把 revision 写进 `SkillUpstream`；`checkUpdate` 用 `parseGitSource` + `readRemoteRevision`。 |
| `packages/resources/skills/src/frontmatter.ts` | `parseSkillFile(text)` → `{frontmatter,body}`；YAML 用 `js-yaml`；解析失败只损失字段，不丢技能。 |
| `packages/resources/skills/src/skill-detail-dialog.tsx` | 详情弹窗骨架：`DialogSplit` + `MediaPane`；`InfoPanel` 是 plugins/prompts 各自的局部实现，不是共享组件；文件面板用 `SkillFileTree` + `CodeCard`；`Markdown` 渲染正文。 |
| `apps/web/src/lib/hub.ts` | `createRemoteNet()` 赋给 `webHost.net`；`skillStoreAvailable()` 探测 `/hub/skills?limit=0`；`skillsExtension` 是内置模块。 |
| `packages/core/handlers.ts` `createNetHandler` | POST `/hub/net`，只 GET、HTTPS、公网主机、手动 redirect、10 s、4 MB；返回 `{status,body}`，无响应头。 |
| `packages/resources/skills/src/extension.ts` | `skillsModuleWith(page, settingsSection)` 注册 nav `/skills`、route `/skills`、locale、search、settings；`provides: [SKILL_SERVICE, SKILL_LIBRARY_SERVICE]`；`permissions: ["assets.read","assets.write"]`。 |
| `apps/web/src/App.tsx` | 所有 `route` contribution 都映射到 `<Route path={route.path}>`；`useNavItem` 用最长前缀匹配，`/skills/market` 会显示 Skills。 |
| `designs/README.md` §3b | 旧画板 ②e「下载 Skill（skills.sh 注册表）」是 1040px 的下载弹窗：搜索 + 归类 + 结果列表 + 页脚「下载 N 个」。 |
| `designs/skills-sh.pen` | 空画布，1787 bytes，无既有 id 可复用。 |

## 适配层设计

### 放在哪里

**建议：新建 `packages/resources/skills/src/market/`，由 Skills 模块在 `extension.ts` 里构造一个 `SkillMarket` 服务（名字 `market.skills`）。**

理由：

1. 市场页就是 Skills 模块的子页；页面、库、安装路径都已经在这个包里，放在这里不需要跨包发布。
2. 它只需要 GET + 解析，`ctx.host.net` 已经是现有的跨域通道；不需要新的 host 路由，也不需要把数据落到磁盘。
3. `SkillRegistry` 的契约只有 `search` + `describe`，装不下榜单、文件树、审计、official；扩展它等于改一个已发布插件 API，还要外部仓库同步发版。
4. 放进 `src/host/` 是把 Node 侧磁盘代码和网络读混在一起；市场不写盘，页面又需要类型化数据，放 host 只会多一层 `/hub/skills` 动作。
5. 作为服务而不是页面内 `useMemo`：缓存、并发去重、审计与文件包在页面卸载后仍然存在；也方便用假 `NetPort` 做单测。
6. 页面通过 `useHub().get("market.skills")` 读取服务；可以包一个 `useSkillMarket()`，与 `useSkillLibrary` 同层，避免每个组件各自 `ctx.get`。

被否掉的选项：

- **扩展现有外部插件**：需要改 `D:\work-space\context-hub-extensions` 的 `contracts.ts` 和 `index.ts`，且 hub 内置页面会依赖一个可选插件；本轮不改。
- **放进 `packages/resources/skills/src/host/`**：host 侧没有“页面打开”的生命周期，缓存和错误展示都要再设计一套路由。
- **放进 `apps/web`**：Skills 是模块，`apps/web` 只负责 shell；把市场放进 shell 会让模块不能再被其他 carrier 复用。

外部插件保留：`SkillRegistry` 契约和 `skills.sh` 插件都不删不改。旧弹窗在新市场页落地后移除，插件暂时没有页面消费者；这是公共 API 的兼容选择，不是本次要清理的范围。

### 类型

新建 `packages/resources/skills/src/market/types.ts`：

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
  total: number
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

export interface MarketFile {
  path: string
  contents: string
}

export interface MarketBundle {
  files: MarketFile[]
  /** 服务端给的目录 hash；只用于调试，不能当版本号或更新判据。 */
  hash: string
}

export type MarketAuditStatus = "pass" | "warn" | "fail" | (string & {})

export interface MarketAuditEntry {
  provider: string
  slug: string
  status: MarketAuditStatus
  summary: string
  auditedAt: string
  /** 开放集合；实测有 SAFE、MEDIUM 等。 */
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
  /** 页面里 `npx skills add ...` 的原文，用于 well-known 的“仅 CLI”提示。 */
  installCommand?: string
}

export interface MarketOwner {
  owner: string
  repo?: string
  repos?: number
  skills?: number
}
```

### 客户端函数与端点

新建 `packages/resources/skills/src/market/client.ts`，直接复用内核已有的 `NetPort`（`@context-hub/extensions` 的 `host.ts`；`packages/resources/skills` 已经依赖它），不新造网络类型：

```ts
import type { NetPort } from "@context-hub/extensions"

export interface MarketClient {
  rank(view: MarketView, page: number): Promise<MarketRankPage>
  search(query: string, owner?: string): Promise<MarketSearchPage>
  download(source: string, skill: string): Promise<MarketBundle | null>
  audit(source: string, skill: string): Promise<MarketAudit | null>
  teleAudit(source: string, skills: readonly string[]): Promise<MarketTeleAudit>
  pageMeta(source: string, skill: string): Promise<MarketPageMeta | null>
  officialOwners(): Promise<MarketOwner[]>
}

export function createMarketClient(net: NetPort): MarketClient
```

所有 URL 都从两个常量拼：`MARKET_ORIGIN = "https://skills.sh"`、`MARKET_SITE = "https://www.skills.sh"`。`source` 含 `/` 时按路径段逐段 `encodeURIComponent`；不含 `/` 时视为域名。禁止把原始 `source` 直接插进 URL 或 CLI。

#### 1. 榜单

- **URL**：`GET https://skills.sh/api/skills/{view}/{page}`
- **参数**：`view` ∈ `all-time|trending|hot`；`page` 整数 ≥ 0，必须显式给。
- **返回**：`{ skills, total, hasMore, page }`；行字段见上；All Time 带 `weeklyInstalls`（8 个数），Hot 带 `installsYesterday` / `change`，`isOfficial` 任意视图可选。
- **解析**：
  - `skills` 必须是数组；不是数组直接抛 `skills.sh 返回了无法解析的榜单`。
  - 每一行要求 `source` 非空字符串、`skillId` 字符串（缺失时用 `name`）、`name` 字符串；缺任一就丢弃该行。
  - `installs` 用 `Number.isFinite` 校验，否则 0；`weeklyInstalls` 只收长度 8 的有限数字数组；`installsYesterday`/`change` 只收有限数字；`isOfficial` 只收布尔。
  - `total` 用有限数字，否则 0；`hasMore` 只收布尔，否则 `false`。
- **边界**：非法 view → 400 `{"error":"Invalid view"}`；跨过末页 → 200 空数组 + `hasMore:false`；不传 page → 200 HTML，客户端永远带 page；`total` 是活的，不写死、不当分页判据。
- **缓存**：`rank:{view}:{page}`，5 分钟。
- **错误**：非 200 用 `{error,message}` 里的文字；body 不是 JSON 报“返回了 HTML/无法解析”；网络异常原样上抛给页面。
- **页面**：① 市场首页榜单。

#### 2. 搜索

- **URL**：`GET https://skills.sh/api/search?q={q}&limit=200[&owner={owner}]`
- **参数**：`q` 去空格后至少 2 字符；`limit` 固定 200（API 上限）；`owner` 可选，按 source 的 owner 过滤。
- **返回**：`{ query, searchType, searchVersion, skills, count, duration_ms, timings_ms, ... }`；行是 `{ id, source, skillId, name, installs }`。
- **解析**：`skills` 必须是数组；行要求 `source`/`skillId`/`name` 非空字符串，`installs` 有限数字否则 0；`id` 缺失时用 `${source}/${skillId}`。`count` 忽略（实测等于返回行数）。
- **边界**：1 字符 → 400 `{"error":"Query must be at least 2 characters"}`；`limit` 大于 200 仍只回 200；无 offset；无结果 → 空数组。
- **分页**：一次取 200 行并缓存；页面按 10 行/页客户端切片，翻页不再发请求；`rows.length === 200` 时提示“只显示前 200 条，请细化关键词”。
- **缓存**：`search:{q}:{owner}`，5 分钟；`q` 去空格、`owner` 去空格。
- **错误**：同榜单；400 的文字直接展示。
- **页面**：③ 市场搜索 · 结果态；owner 过滤。

#### 3. 下载（文件树 + 内容 + 描述）

- **URL**：`GET https://skills.sh/api/download/{owner}/{repo}/{slug}`
- **参数**：只支持 GitHub 源；well-known 源（source 是域名）返回 404。
- **返回**：`{ files: [{ path, contents }], hash }`；文件路径相对 skill 目录，`SKILL.md` 不一定在根、不一定只有一个文件（`anthropics/skills/pdf` 实测 12 个文件，含 `scripts/`）。
- **解析**：
  - `files` 必须是数组；每个 `path` 非空、`contents` 字符串；拒绝绝对路径、`..` 段、反斜杠路径；不合法的条目跳过。
  - 找 `SKILL.md`：任一路径的 basename 为 `SKILL.md`（大小写不敏感），优先根目录；用 `parseSkillFile` 取 frontmatter 和 body。
  - 文件树用 `treeFromFiles(files)` 生成 `SkillFileEntry[]`（类型在 `store.ts`，helper 新建在 `market/rows.ts`），目录节点补齐、按路径排序、`bytes` 用 `TextEncoder` 计算。
  - `hash` 原样保留但**不参与任何判断**。
- **边界**：404 → `null`（well-known、已下架）；4 MB 上限触发 host 的 `net:` 错误；非 JSON → 抛错；没有 `SKILL.md` 仍然是有效结果（内容 tab 显示说明，文件 tab 仍可用）。
- **缓存**：`files:{source}:{skill}`，30 分钟；详情页与搜索描述共用。
- **错误**：404 不报错；其他非 200 抛可展示文字；路径不安全的文件跳过而不是整包失败。
- **页面**：③ 搜索行描述（仅 GitHub）、④ 详情内容/文件。

#### 4. 审计（v1）

- **URL**：`GET https://skills.sh/api/v1/skills/audit/{source}/{skill}`
- **认证**：匿名可用；这是唯一公开的 v1 路由。
- **返回**：`{ id, source, slug, audits: [{ provider, slug, status, summary, auditedAt, riskLevel?, categories? }] }`。
- **解析**：`audits` 必须是数组；`provider`/`slug`/`status`/`summary`/`auditedAt` 收字符串；`riskLevel` 收字符串（**不校验枚举**）；`categories` 只收字符串数组。未知 `status`/`riskLevel` 保留原值，UI 走中性色。
- **边界**：无审计 → 404 `{error:"not_found", message:"No security audits found..."}` → 返回 `null`；空数组也按无审计处理；well-known 源可用。
- **缓存**：`audit:{source}:{skill}`，24 小时；`null` 负缓存 10 分钟（新审计能较快出现）。
- **错误**：404 → `null`；其他非 200 / 解析失败抛错，审计 tab 显示“审计读取失败 + 重试”。
- **页面**：④ 详情 · 安全审计（主）。

#### 5. 审计（tele 兜底）

- **URL**：`GET https://www.skills.sh/tele/audit?source={source}&skills={a,b,c}`
- **参数**：`source` 一个；`skills` 逗号分隔，本次只传当前详情的一个 skill。
- **返回**：`{ [skill]: { ath?: {risk,analyzedAt}, socket?: {risk,alerts,score,analyzedAt}, snyk?: {risk,analyzedAt} } }`；未审计返回 `{ [skill]: {} }`，不报错。
- **解析**：对象；每个 provider 的 `risk` 字符串、`analyzedAt` 字符串；`alerts`/`score` 有限数字；不存在的 provider 留空。
- **边界**：v1 返回 404 时才调用；tele 返回空对象就显示“暂无审计”，不再重试。
- **缓存**：`tele:{source}:{skill}`，6 小时。
- **错误**：非 200 / 解析失败不阻塞详情，按空审计处理。
- **页面**：④ 详情 · 安全审计（v1 404 时的兜底，标“部分审计”）。

#### 6. 官方精选（HTML）

- **URL**：`GET https://www.skills.sh/official`（≈514 KB HTML，无 JSON 等价物）。
- **解析**：在 `<a ... href="/{owner}" ...>` 块内取 owner 名（`font-semibold` span）、repo 标签（`font-mono` span）和右侧两个数字列（`text-right font-mono`）；只收 href 恰为一段的 owner 行；去重；按 skills 数降序。
- **边界**：结构变化、解析出 0 行、或任意行缺计数 → 返回 `[]`，市场页隐藏“官方精选”入口；不让整页失败。
- **缓存**：`official`，6 小时。
- **错误**：网络/解析失败都按 `[]` 处理；入口隐藏。
- **页面**：⑥ 官方精选（可选）。

#### 7. 详情页 HTML（元数据 + 安装命令）

- **URL**：
  - GitHub：`https://www.skills.sh/{owner}/{repo}/{skill}`；
  - well-known：先 `https://www.skills.sh/site/{domain}/{skill}`，404 再试 `https://www.skills.sh/{domain}/skills/{skill}`。
- **解析**：
  - 用正则取所有 `<script type="application/ld+json">`，`JSON.parse` 后找 `@type === "SoftwareApplication"`；取 `description`、`publisher.name`、`interactionStatistic.userInteractionCount`。
  - 取 `<meta name="description">`，解 `&quot;`/`&#x27;`/`&#39;`/`&lt;`/`&gt;`/`&amp;`；**只作为 GitHub 的兜底描述**，well-known 的通用句丢弃。
  - 取 `<code>` 里以 `npx skills add` 开头的文本作为 `installCommand`，解 HTML 实体。
- **边界**：well-known 没有 `SoftwareApplication`，只返回 `installCommand`，不返回描述；JSON-LD 坏掉返回 `null` 而不是抛错；404 → `null`。
- **缓存**：`page:{source}:{skill}`，24 小时。
- **页面**：③ 搜索行描述（download 失败时的 GitHub 兜底）、④ 详情元数据 / well-known 的“仅 CLI”命令。

#### 8. 安装与更新（不是 HTTP API）

- **安装**：沿用 `downloadPackageSkills` → `npx skills add <source> --skill <name> -a universal --copy -y --json`。市场只把行里的 `source`/`skillId` 传进去；不自己写文件。
- **well-known**：`--json` 不被 CLI 支持，且 `/api/download` 404；市场行标记 `仅 CLI`，安装按钮禁用，详情显示页面里的 `npx skills add ...` 命令和外链。
- **更新**：沿用 `skills-lock.json` 的 `computedHash` + `git ls-remote`；市场页只读 `outdated(skill)` / `checkUpdate` / `updateFromUpstream`，不用 `/api/download.hash`。
- **页面**：⑤ 安装确认；④ 详情 footer；③ 结果行徽标。

### 缓存

新建 `packages/resources/skills/src/market/cache.ts`：一个带 `now: () => number` 的 TTL Map，供测试注入时间。

| 键 | TTL | 负缓存 | 说明 |
| --- | --- | --- | --- |
| `rank:{view}:{page}` | 5 min | 无 | 榜单页 200 行；切换 tab 在 TTL 内不重复请求 |
| `search:{q}:{owner}` | 5 min | 无 | 原始 200 行；客户端切片 |
| `files:{source}:{skill}` | 30 min | 10 min | 与详情共用；404 的 `null` 也缓存 10 分钟，避免 well-known 行反复打 404 |
| `audit:{source}:{skill}` | 24 h | 10 min | `null` 也算值 |
| `tele:{source}:{skill}` | 6 h | 无 | v1 404 才用 |
| `page:{source}:{skill}` | 24 h | 10 min | HTML 描述/命令 |
| `official` | 6 h | 10 min | 解析失败也缓存空数组，避免每次重试 |

实现细节：

- 同一个键的并发请求只发一次（in-flight Map）；后到的调用共享同一个 Promise。
- 缓存只存成功答案；网络/解析失败不写缓存，也不清掉旧值。审计 404、下载 404、官方解析失败返回的 `null`/`[]` 是有效答案，按上表的负缓存写入。页面自己保留上一次的行，失败时用 toast/横幅提示，列表不清空。
- 条目上限 200；超过时删最早写入的条目。缓存只活在 `SkillMarket` 服务实例里，页面卸载不丢，进程退出即清。
- 不缓存 `NetPort` 的响应头（拿不到），也不做 ETag/If-None-Match。

### 错误与降级

| 情况 | 页面行为 |
| --- | --- |
| `ctx.host.net === null` | 市场页显示“此形态无法访问网络”，不请求；榜单/搜索为空态 |
| 榜单/搜索 HTTP 非 200 | 保留上次结果；顶部横幅/Toast 显示 `refusal()` 文字；提供「重试」 |
| 返回 HTML 而不是 JSON | 报“skills.sh 返回了页面而不是数据”；不重试 |
| 10 s 超时 / 4 MB 上限 | 显示 host 的错误文字；详情文件 tab 显示“内容过大，无法在此预览” |
| 下载 404 | 详情文件 tab 显示“此来源不提供文件 API”；内容 tab 显示 well-known 说明；不报错 |
| 审计 404 | 调 tele；tele 空 → “暂无审计”；tele 失败 → “暂无审计”，不阻塞 |
| 官方 HTML 解析失败 | 隐藏「官方精选」入口；市场首页正常 |
| npx 不存在 | 安装弹窗显示 `npx is not on PATH; install Node.js or add it to PATH` |
| 同名冲突 | 安装确认里禁用安装，说明“技能库已有同名技能（来源不同），请先移除或改名” |

所有请求都走 `host.net`；组件里不出现 `fetch(`。验收时用 `rg -n "fetch\\(" packages/resources/skills/src/market packages/resources/skills/src/market-*.tsx` 检查。

### 安装、更新与安全边界

- **来源校验**：安装前校验 `source`：GitHub 形态 `^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$`；well-known 形态 `^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$`；两种形态都拒绝 `..` 段、空段、以点开头的段。其他形态只浏览、不安装。来源来自远端，不能直接拼进 CLI。
- **同源归一化**：`sameSource` 把 `https://github.com/owner/repo`、`github.com/owner/repo`、`owner/repo`、带 `.git` 或尾 `/` 的形式统一成 `owner/repo` 再比较；大小写不敏感。well-known 域名保留原样、小写比较。
- **技能名校验**：安装前和 `adopt` 前都调 `assertSkillName`（`packages/resources/skills/src/host/names.ts`）；拒绝空、`.`、`..`、以点开头、含 `/` 或反斜杠、Windows 设备名。`downloadPackageSkills` 已有的 `adopt` 校验保留。
- **不写远端文件**：`/api/download` 的 `contents` 只在内存里渲染；写盘只发生在 `npx skills add` 的临时目录和 `adopt`，路径由 `assertSkillName` 约束。
- **渲染**：`Markdown` 组件已经 `rehypeRaw` + `rehypeSanitize`；SKILL.md 是不可信内容，不绕过它。相对图片没有 base，现有 `Markdown` 会省略；不新增远程图片加载。
- **凭据**：请求不带 Authorization、不带 cookie、不带 token；只用公开路由。401 路由一律不调用。
- **路径**：文件树条目的 `path` 拒绝绝对路径和 `..`；只用于显示和选择，不拼磁盘路径。
- **网络**：`host.net` 只允许 HTTPS + 公网主机；市场不需要新增出口。

## 页面与画板

### 路由与返回

**建议：市场是 Skills 的子页，路由 `/skills/market`，不是全屏弹窗。**

理由：

- 榜单 200 行 + 搜索 + 详情三 tab，640px 弹窗放不下；现有 `SearchSkillsDialog` 每页 6 行就是容量证据。
- 子页有 URL：刷新、浏览器后退、从详情返回都能回到原榜单/搜索词；弹窗没有地址。
- 详情仍然是弹窗，叠在市场页上；关闭详情回到列表，滚动位置天然保留。
- `App.tsx` 已经渲染所有 `route` contribution；`useNavItem` 用前缀匹配，`/skills/market` 的顶栏仍显示 Skills，不需要改 shell。
- 页面自己画返回入口：标题行左侧 `← Skills`（`Link to="/skills"`），右侧「安装到…」等动作。顶栏不改，不画一个实现不出来的三级面包屑。

状态放 URL 查询参数：`?view=all-time|trending|hot&q=&owner=`。`q`/`owner` 用 300 ms 防抖后 `replace: true` 写回，避免每个按键一条历史；`view` 用 `replace`。详情 key、安装弹窗、加载中的页数放组件状态，不写 URL。

### 画板清单

第一批 7 块，1440×900，沿用 `designs/README.md` §4 的 token 与 §1 的 shell（侧栏 248 / 顶栏 52 / 二级导航 44 / 内容 1192）。注意：现有 `AppHeader` 实际是 64px（`h-16`），与 README 的 52px 不一致；画板按哪个高度画需要先确认。市场是 Skills 的子页，二级导航的 Skills 保持激活，类型强调色仍用 Skills 的 `#A78BFA`。

| # | 画板 | 内容 | 数据来源 | 状态 / 串联 |
| --- | --- | --- | --- | --- |
| ① | 市场首页 · 榜单 | 返回 + 标题「skills.sh 市场」；All Time / Trending / Hot 分段；搜索框；owner 过滤；官方精选次按钮；表头（# / Skill / 来源 / 安装量 / 8W 折线或 1H+change / 动作）；约 10 行；页脚「加载更多」与已加载数 | `/api/skills/{view}/{page}`；`library.rows` 判已安装/可更新 | 切 tab 重载；点行 → ④；加载更多追加；无网络/失败/空态在 ⑦ |
| ② | 市场搜索 · 空态 | 大搜索框（autofocus）、至少 2 字符提示、示例词胶囊（`find-skills` / `pdf` / `browser`）、说明“搜索的是 skills.sh，不是本地库”；不画假榜单 | 无（不发请求） | 输入 ≥2 字符 → ③；返回 → ① |
| ③ | 市场搜索 · 结果态 | 搜索框 + owner 胶囊；结果计数/截断提示；10 行结果（与实现一致）：名称、owner/repo、安装量（搜索行只有 `installs`，用中性「安装」标签，不声称时间窗）、描述（骨架 → 文本）、已安装/可更新/仅 CLI 徽标、安装按钮；空/失败/加载内嵌 | `/api/search?...&limit=200`；描述用 `/api/download` frontmatter（GitHub），失败再试 HTML meta；`library.rows` | 点行 → ④；点 owner → 写入 owner 过滤（well-known 行不响应）；安装 → ⑤；翻页/加载更多不发新请求 |
| ④ | Skill 详情 | 1040×640 弹窗，背景压暗的市场列表；头部名称、owner/repo 外链、官方徽标、安装量、主操作；tab：内容 / 文件 / 安全审计 | `/api/download`（GitHub）；`pageMeta`（well-known）；`audit` + `tele`；`library.rows` | 安装 → ⑤；已安装且可更新 → 更新（`updateFromUpstream`）；关闭回列表；审计外链 |
| ⑤ | 安装确认 | 640×~520 弹窗；summary（名称、来源、安装量）；目标：技能库（默认） + 工作区/全局位置列表（带路径、已存在标记、无工作区禁用）；同名冲突警示；执行中步骤；结果逐条（成功/失败原因）；「重试写入位置」 | 本地 `hub.skills` store；`useReadablePlaces`；无 skills.sh 请求 | 确认 → `installPackage` → 可选 `installInto`；成功 → 关闭并刷新库；部分失败 → 留在弹窗；well-known → ⑦ 的“仅 CLI”状态 |
| ⑥ | 官方精选（可选） | 640×~560 弹窗：owner 行（名称、repo 标签、repos 数、skills 数、外链）；不画 owner 内部技能列表 | `/official` HTML（best-effort） | 点行 → 外链 `https://www.skills.sh/{owner}`；解析失败 → 入口隐藏；不进入内部搜索 |
| ⑦ | 状态集 | 3×3 网格（9 个代表状态）：加载骨架、无结果、网络失败、npx/CLI 缺失、审计未生成、well-known 不可装、已安装/可更新、同名冲突、部分失败 | 各页面的真实状态 | 每个状态给出下一步按钮（重试 / 返回 / 去 Skills 页） |

画布布局：两行。

- 第 ① 行「市场浏览」：①②③，x = 0 / 1500 / 3000，y = 100。
- 第 ② 行「详情与安装」：④⑤⑥⑦，x = 0 / 1500 / 3000 / 4500，y = 1100。
- 每块 1440×900；列距 60；行距 100；每行上方 22px 组标题 + 一行灰字说明 + 通宽分隔线；每块上方一个编号标签。顶层节点预期 = 7 块画板 + 2 组标题 + 2 行说明 + 2 分隔线 + 7 标签 = 20 个。
- 画板只表达内容区；顶栏/侧栏按 README 的 shell 画，不引入新导航项。实现时用现有 `AppHeader`（64px）与 `AppLayout`，不为了对齐画板改 shell。

### 串联与状态

```
Skills 页「探索」──> /skills/market
                         │
        ┌────────────────┼─────────────────┐
        ▼                ▼                 ▼
   ① 榜单          ② 空态 ──> ③ 结果      ⑥ 官方精选（可选）
        │                │                 │
        └────── 点行 ────┴────────> ④ 详情 ──> ⑤ 安装确认
                                         │
                                         └── 成功：关闭 ⑤，库刷新，行变「已安装」
                                             失败：留在 ⑤，逐条原因
```

| 状态 | 存在哪里 | 返回后是否保留 |
| --- | --- | --- |
| 当前榜单 tab | URL `?view=` | 保留（刷新/后退都在） |
| 搜索词 / owner | URL `?q=` / `?owner=` | 保留 |
| 已加载的榜单页数 | `market-page.tsx` 本地 state | 离开市场页丢失；回来从 page 0 重读，可接受 |
| 搜索翻页位置 | 本地 state（200 行已缓存） | 离开丢失；回来按 q 重读缓存 |
| 列表滚动位置 | DOM（详情是弹窗，列表不卸载） | 打开/关闭详情保留；离开页面丢失 |
| 已安装 / 可更新 | `catalog.skills` 共享读 + `library.rows` | 保留；安装后 `library.reload()` |
| 审计 / 文件 / 描述缓存 | `SkillMarket` 服务 | 保留；页面卸载不丢 |
| 安装中 / 部分失败 | 安装弹窗本地 state | 关闭即丢；执行中禁用关闭 |
| 详情打开的是哪一行 | 本地 `detailKey` | 不写 URL；关闭回列表 |

### 旧画板 ②e

- **结论：被新市场页取代，不保留为快速搜索入口。**
- `designs/skills.pen` 里的 ②e（id `hm9Mn`）保留为历史记录，不在新画布里重画；`designs/README.md` §2 的表格和 §3b 的“下载”段落标注“已被 `skills-sh.pen` 的市场页取代（2026-10-29）”。
- 代码上，Phase 4 把「探索」改成 `Link to="/skills/market"`，并删除 `SearchSkillsDialog` 的使用与 `search-dialog.tsx`。`SkillRegistry` 契约与外部 `skills.sh` 插件保留（公共 API），但本轮不再有页面消费者；不把它伪装成“还在用”。
- 不保留“快速搜索”第二入口：市场页搜索就是唯一远程搜索，两个搜索框会让 owner/描述/安装语义分叉。

### 搜索行描述的取舍

**建议：GitHub 行用 `/api/download` 解析 SKILL.md frontmatter；well-known 行不显示描述；HTML `<meta>` 只做 GitHub 的兜底。**

理由（实测）：

- `find-skills` 的 `/api/download` 是 5.7 KB，而它的 skill 页面是 83.3 KB；`anthropics/skills/pdf` 的下载是 62 KB/12 文件，页面也在 80 KB 量级。对 GitHub 行，download 往往更小且是 JSON。
- download 直接给 `SKILL.md`，用现有 `parseSkillFile` 就是权威描述；HTML meta 是二手文案，well-known 的 meta 还是通用句（不是技能描述）。
- download 的包可以缓存 30 分钟，打开详情直接复用，不会为同一技能再请求。
- 代价是每行一次下载：只对当前搜索页的 10 行做，并发 3，缓存 30 分钟；榜单行不做描述，避免 200 次请求。超过 4 MB 或 404 时回退 HTML meta（GitHub），仍失败就不显示描述。
- well-known 行不调用 download（必 404），也不把通用 meta 当描述；行上只显示来源域名，详情里给外链和 CLI 命令。

### 官方精选

- 只读 `/official` HTML；解析出 owner 行才显示入口，失败/空则整个入口隐藏。
- owner 行只做展示 + 外链 `https://www.skills.sh/{owner}`；不做内部下钻，因为搜索 API 的 `q` 最少 2 字符且按技能文本匹配，不能用空 q + owner 得到 owner 的技能列表。
- 入口请求在榜单第一页渲染后后台发起（514 KB，6 小时缓存）；解析失败时按钮消失，不影响榜单/搜索。
- 画板 ⑥ 是可选批次；实现放在最后，可以整段砍掉而不影响前六块。

### 安装确认

- **目标**：第一行固定「技能库」（默认选中）；下面按 `workspace` / `global` 分组列出 `useReadablePlaces()` 的位置，带 `placePath`、是否已存在同名技能、无工作区时禁用。
- **默认**：只写技能库。选位置时先 `installPackage` 再 `installInto`；两步是两次写，部分失败要分开报。
- **冲突**：市场行的 `source + skillId` 与库里的 `name + upstream.source` 比对：
  - 同名 + 同来源 → 已安装；可更新时显示「更新」，否则「已安装」；
  - 同名 + 不同来源 / 库里无 `upstream` → 冲突，禁用安装；
  - 无同名 → 可安装。
- **执行**：
  1. 校验 `source` / `skillId`；
  2. `installPackage(source,[skillId])`；
  3. `installed.length === 0` → 展示 `failed[]` 每条原因；
  4. 选了位置 → `installInto(installed[0], ref)`；失败显示“已下载到技能库，但未写入 <path>：<reason>”，保留「重试写入位置」；
  5. 成功 → `library.reload()`，关闭弹窗，详情/行变已安装。
- **well-known**：不进入安装流程；显示页面解析出的 `npx skills add ...` 命令 + 复制按钮 + 外链；文案说明“CLI 对这类源不返回 --json，hub 无法确认安装结果”。
- **不做**：覆盖、改名、批量选择、取消正在跑的 CLI（CLI 没有取消 API；执行中禁用关闭）。

## 受影响文件

### 新增

- `packages/resources/skills/src/market/types.ts`
- `packages/resources/skills/src/market/client.ts`
- `packages/resources/skills/src/market/cache.ts`
- `packages/resources/skills/src/market/service.ts`
- `packages/resources/skills/src/market/rows.ts`（`marketKey`、`isWellKnown`、`rowState`、`treeFromFiles`、`sparkPoints`、`sameSource`、`conflictOf`）
- `packages/resources/skills/src/market-page.tsx`
- `packages/resources/skills/src/market-detail-dialog.tsx`
- `packages/resources/skills/src/market-install-dialog.tsx`
- `packages/resources/skills/src/market-official-dialog.tsx`（Phase 8；可砍）
- `packages/resources/skills/__test__/market-client.test.ts`
- `packages/resources/skills/__test__/market-cache.test.ts`
- `packages/resources/skills/__test__/market-service.test.ts`
- `packages/resources/skills/__test__/market-rows.test.ts`
- `packages/resources/skills/__test__/market-official.test.ts`（可并入 client 测试）
- `packages/resources/skills/__test__/fixtures/market/*.json|html`
- `apps/web/__test__/market-probe.ts`（可选，手工 CDP 探针）

### 修改

- `packages/resources/skills/src/extension.ts`：`skillsModuleWith(page, settingsSection, marketPage?)`（第三参可选，保持已导出的函数对旧调用方兼容；`marketPage` 存在时才注册 `/skills/market`）；构造 `new SkillMarket(ctx)`；`provides` 加 `SKILL_MARKET_SERVICE`；`permissions` 加 `"network"`；`inject` 不变。
- `packages/resources/skills/src/index.ts`：`skillsModuleWith(SkillsPage, SkillSettingsSection, MarketPage)`；导出 `SkillMarket` / `SKILL_MARKET_SERVICE` 与 market 类型。
- `packages/resources/skills/src/page.tsx`：删除 `SearchSkillsDialog` 的 import、状态、组件和 `useContributions("skillRegistry")`；「探索」改为 `Link`/`navigate` 到 `/skills/market`。
- `packages/resources/skills/src/messages.ts`：新增 `skills.market.*` 英文文案。
- `packages/i18n/zh-cn/src/messages.ts`：新增同名中文文案（`pnpm --filter @context-hub/zh-cn test` 会强制成对）。
- `designs/README.md`：新增市场章节；②e 标注被取代；画板 id 写入表格。
- `designs/skills-sh.pen`：7 块画板（Phase 3；本计划不画）。

### 删除

- `packages/resources/skills/src/search-dialog.tsx`（Phase 4；仅在市场页通过验收后删）。

### 不改

- `packages/extensions/src/skill-registry.ts`、`contributions.ts`、`types.ts`。
- `D:\work-space\context-hub-extensions\plugins\skills.sh`（外部仓库）。
- `apps/web/src/App.tsx`、`app-header.tsx`、`app-layout.tsx`、`lib/navigation.ts`。
- `packages/core/src/host/*`、`createNetHandler`。
- `packages/resources/skills/src/host/skills-cli.ts`、`upstream.ts`、`git-source.ts`、`skills-fs.ts`（除非测试暴露必须修的根因；不在本轮范围）。

## 阶段

### 阶段 1：定义市场 API 契约与解析

**执行目标**：把 7 个读取端点变成纯函数 + 类型，全部可用 fixture 测试，不接 UI、不发真网。

**改动文件**

- 新增 `market/types.ts`、`market/client.ts`
- 新增 `__test__/market-client.test.ts`、`__test__/fixtures/market/`

**关键实现点**

1. 类型照上文；`riskLevel`/`status` 用开放字符串。
2. `createMarketClient(net)` 实现 `rank/search/download/audit/teleAudit/pageMeta/officialOwners`。
3. 统一 `refusal(status, body)`：读 `{error,message}`，优先 `message`，其次 `error`，最后 `skills.sh answered {status}`。
4. URL 拼装：`source` 按 `/` 拆段、逐段 encode；well-known 用 `/site/{domain}/{skill}`，404 再试 `/{domain}/skills/{slug}`。
5. `download` 的路径校验：拒绝绝对路径、`..`、反斜杠；`contents` 非字符串跳过；`hash` 保留但不使用。
6. `treeFromFiles` 可以先放 `rows.ts`（本阶段一起测），也可以延后到阶段 6；如果延后，本阶段只解析文件数组。
7. 测试：正常、缺字段、非法 view、1 字符搜索、400、404、非 JSON、非法路径、`SAFE` risk、空 tele、official 0 行、JSON-LD 缺失。

**验收**

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
```

判据：`market-client.test.ts` 全绿；测试只注入假的 `NetPort`，运行 `pnpm test` 时不发真实网络请求；断言 fake 的调用次数符合预期。

### 阶段 2：建立市场缓存服务

**执行目标**：把纯客户端包成 `market.skills` 服务，带 TTL、并发去重、上限和 `available`；页面以后只读服务。

**改动文件**

- 新增 `market/cache.ts`、`market/service.ts`
- 修改 `src/extension.ts`、`src/index.ts`
- 新增 `__test__/market-cache.test.ts`、`__test__/market-service.test.ts`

**关键实现点**

1. `createTtlCache({ now, limit = 200 })`：`get/set/delete/clear`；`get` 过期即删；超过上限删最早写入。
2. `SkillMarket extends Service`，服务名 `market.skills`；构造时读 `ctx.host.net`；`available` 为 `net !== null`；`net === null` 时方法抛 `this form cannot reach the network`。
3. 每个方法用缓存键和 TTL 表；同键并发共享 Promise。
4. `extension.ts` 构造 `new SkillMarket(ctx)`；`provides` 加服务名；`permissions` 加 `"network"`；`index.ts` 导出。
5. 测试：第二次调用不增加 fake net 计数；TTL 过期后重新请求；并发两次只请求一次；`null` 负缓存；上限淘汰；无 net 的报错。

**验收**

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
rg -n "fetch\\(" packages/resources/skills/src/market
```

判据：测试全绿；`rg` 无输出（market 目录内没有直接 fetch）；`extension.ts` 的 `provides`/`permissions` 已更新。

### 阶段 3：绘制市场画板

**执行目标**：在空画布 `designs/skills-sh.pen` 画出 7 块画板，内容、状态、串联与数据来源按上文；不改源码。

**改动文件**

- `designs/skills-sh.pen`
- `designs/README.md`（画完后补市场表与 ②e 的取代说明）

**关键实现点**

1. 两行布局：①②③ / ④⑤⑥⑦；1440×900，列距 1500，行距 1000；组标题、说明、分隔线、编号标签按 README v11 的家具规则。
2. shell：侧栏 248、顶栏 52、二级导航 44、内容 1192、页面 padding 24；Skills 导航激活；市场标题行带 `← Skills`。
3. token 照 README §4；Skills 强调色 `#A78BFA`；风险只用 success/warning/danger；不引入新色板。
4. ① 榜单：表头 + 10 行；All Time 画 8W 折线（96×24 SVG），Trending 画 24h 安装量，Hot 画 `1H` + `+285` 绿色；官方徽标只画在 `isOfficial` 行。
5. ③ 结果：描述行同时画「骨架」和「已加载」两种，说明逐行加载；owner 胶囊可点。
6. ④ 详情：1040×640 弹窗；内容 tab 画 Markdown 正文；文件 tab 画 224px 文件树 + `CodeCard`；审计 tab 画 `pass/warn/fail` 三种 provider 行和“暂无审计”空态。
7. ⑤ 安装：目标列表画「技能库」+ 两个位置；冲突态单独一行；执行中/部分失败各画一个状态。
8. ⑦ 状态集：3×3 网格，每格一个状态 + 一个下一步按钮。
9. 导出：`export_nodes` 传 `document`，按顶层节点逐个导出 PNG；核对 7 张 1440×900、文字不越界、家具不压屏。

**验收**

- pencil 工具导出 `document`，得到全部 20 个顶层节点；其中 7 张画板 PNG 尺寸均为 1440×900，另 13 个是组标题/说明/分隔线/编号标签。
- `ctx.problems` 中非“文档封面有意裁切”的越界/裁切为 0；无 placeholder。
- `designs/README.md` 的市场表列出 7 块画板、id、数据来源；§2 的 ②e 有“已被取代”的标注。
- 本阶段不改源码；`pnpm typecheck` 仍通过（作为“仓库可运行”的确认）。

### 阶段 4：接入市场页与榜单

**执行目标**：`/skills/market` 路由可用；「探索」跳转到这里；榜单三视图 + 加载更多 + 已安装徽标可用；旧搜索弹窗移除。

**改动文件**

- 新增 `market-page.tsx`
- 修改 `src/extension.ts`、`src/index.ts`、`src/page.tsx`、`src/messages.ts`
- 删除 `src/search-dialog.tsx`
- 新增 `__test__/market-rows.test.ts`（先放 `sameSource`/`rowState`/`sparkPoints` 的测试）

**关键实现点**

1. `skillsModuleWith(page, settingsSection, marketPage?)`；`index.ts` 传 `MarketPage`；`extension.ts` 在 `marketPage !== undefined` 时注册 route `/skills/market`。
2. `page.tsx` 删除 `SearchSkillsDialog` 的 import、`searchOpen` 状态、`registry` 读取和组件；「探索」以及两个空态里的「探索远程技能」按钮都用 `Link` 或 `useNavigate` 去 `/skills/market`（否则会留下 `setSearchOpen` 的悬空引用）。
3. `MarketPage`：
   - `useSearchParams` 读 `view/q/owner`；非法 `view` 回落 `all-time`。
   - `useSkillLibrary(useReadablePlaces(), "")` 取 `store/rows/reload`；无 store 时只浏览，安装按钮禁用并说明。
   - 榜单 state：`pages: MarketRankPage[]`、`status`、`failure`、`loadingMore`；`view` 变化时清空并读 page 0；「加载更多」读 `pages.length`。
   - 行渲染：rank、名称（等宽）、官方徽标、来源、安装量、折线/change、动作；动作按 `rowState` 显示安装/已安装/更新/仅 CLI/冲突。
   - 折线用内联 SVG：`sparkPoints(weeklyInstalls, 96, 24)`；全 0 画平线；缺失不画。
   - 失败不清空：保留 `pages`，顶部/Toast 显示失败，提供重试。
4. i18n：`skills.market.*` 英文 + 中文成对。
5. 旧的 `SkillRegistry` contribution 不再被页面读取；契约和外部插件不动。

**验收**

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/zh-cn test
```

手工：

1. `pnpm --filter web dev`（端口 5270/5271；被占就停下，不要杀别的进程）。
2. 打开 `http://127.0.0.1:5271/skills`，点「探索」，地址应为 `/skills/market`，顶栏仍显示 Skills。
3. 看到至少 5 行榜单；切 Trending / Hot，Hot 行出现 `1H` 与带符号的 change；All Time 行出现 8 段折线。
4. 点「加载更多」，行数增加；末页按钮消失或禁用。
5. 浏览器后退回到 `/skills`；再前进回市场，`view` 仍在。
6. 库里已有同名技能时，对应行显示「已安装」；有 `outdated` 记录时显示「可更新」（本阶段不做安装动作，安装留到阶段 7）。

### 阶段 5：实现搜索与逐行描述

**执行目标**：搜索满足 2 字符下限、200 条上限、owner 过滤；结果行描述逐行加载，不阻塞列表；翻页不再发网络请求。

**改动文件**

- `market-page.tsx`、`market/client.ts`、`market/rows.ts`
- `__test__/market-client.test.ts`、`__test__/market-rows.test.ts`

**关键实现点**

1. 搜索框 300 ms 防抖；`q.trim().length < 2` 时不请求，显示空态提示。
2. 每次 q/owner 变化请求一次 `search(query, owner)`；用 generation ref 丢弃过期答案（照 `search-dialog.tsx` 的 `generation` 模式）。
3. 结果 200 行缓存在服务里；页面按 10 行/页切片，「加载更多」只增加 slice，不发请求。
4. 描述：
   - 对当前已展示、尚未缓存的 GitHub 行调 `market.download(source, skill)`；取 `SKILL.md` 的 `parseSkillFile(...).frontmatter.description`；
   - 并发 3；结果写 `Record<rowKey, string | null>`；骨架 → 文本；
   - download 失败/404/过大 → `market.pageMeta(source, skill)`（仅 GitHub）；再失败 → `null`；
   - well-known 行直接 `null`，不请求。
5. owner：输入框 + 行内 owner 可点（只对 GitHub 行；well-known 行不响应）；写入 URL `?owner=`；清空按钮。
6. 截断：`rows.length === 200` 时显示“只显示前 200 条，请细化关键词”；计数只显示本次返回的行数（≤200），不声称命中总数。
7. 空态：0 结果、失败、加载中各一套；失败保留上一次结果。

**验收**

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
```

手工：

1. 输入 1 个字符：不请求，显示提示；输入 2 个字符：出现结果。
2. 搜索 `find`：`find-skills` 行先出骨架，随后出现描述；同一行重复搜索不再请求（服务缓存）。
3. `owner=vercel-labs`：只剩该 owner 的行；清空后恢复。
4. 快速连续输入：只有最后一个 query 的结果落到界面（generation 丢弃旧答案）。
5. 用 CDP/Network 或服务单测确认描述并发不超过 3；翻页不发 `/api/search`。

### 阶段 6：实现详情三页签

**执行目标**：点行打开详情；内容 / 文件 / 安全审计三块按数据来源工作；well-known 有明确说明；已安装技能可更新。

**改动文件**

- 新增 `market-detail-dialog.tsx`
- 修改 `market-page.tsx`、`market/rows.ts`、`src/messages.ts`
- `__test__/market-rows.test.ts`（`treeFromFiles`）

**关键实现点**

1. `Dialog` 1040×640（照 `DialogSplit` 的弹窗骨架；不需要媒体面板，市场详情用普通 Dialog + 内容区）。
2. 打开时并行：
   - `market.download(source, skill)`（GitHub）或 `market.pageMeta`（well-known）；
   - `market.audit(source, skill)`；404 再 `market.teleAudit(source,[skill])`；
   - 已安装状态从 `library.rows` 找同名行。
3. 内容 tab：
   - GitHub：`parseSkillFile(SKILL.md).body` → `<Markdown>`；frontmatter.name/description 填头部；
   - 没有 SKILL.md：显示“此技能没有 SKILL.md”，文件 tab 仍可用；
   - well-known：显示“此来源只提供 skills.sh 页面，不提供文件内容 API”+ 外链 + 安装命令。
4. 文件 tab：
   - `treeFromFiles(bundle.files)` → `SkillFileTree`（224px）+ `CodeCard`；
   - 选中文件从 `bundle.files` 取 `contents`，不读盘；
   - 404/过大：说明 + 外链。
5. 审计 tab：
   - v1：provider 行（名称、status chip、riskLevel、summary、auditedAt）；`pass` 绿 / `warn` 琥珀 / `fail` 红 / 未知中性；
   - v1 null → tele：显示 ath/socket/snyk 三行 + “部分审计”；
   - 都空 → “暂无审计” + 外链；
   - 失败 → “审计读取失败” + 重试。
6. footer：
   - 可安装 → 「安装」→ ⑤；
   - 已安装且 `outdated` → 「更新」→ `library.update(held.name)`（用库里那一行的目录名，不用市场的 `skillId`），完成后 `library.reload()`；
   - 已安装且最新 → 禁用「已安装」；
   - 冲突 → 禁用「同名冲突」；
   - well-known → 「仅 CLI」+ 复制命令；
   - 关闭回列表。
7. 渲染安全：所有 SKILL.md 走现有 `Markdown`（已 sanitize）；不 `dangerouslySetInnerHTML`。

**验收**

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
```

手工：

1. 打开 `find-skills` 详情：内容 tab 有 Markdown；文件 tab 有 `SKILL.md`；审计 tab 至少有 provider 行（Gen Agent Trust Hub / Socket / Snyk 等）。
2. 打开 `anthropics/skills/pdf`：文件树出现 `scripts/` 和多个文件；点 `SKILL.md` 显示正文。
3. 打开 `uizze.sh/ui-taste`（well-known）：内容/文件显示“不提供文件 API”，审计 tab 显示“暂无审计”（v1 404 且 tele 空）；安装按钮显示「仅 CLI」。
4. 先在 Skills 页跑一次「检查更新」，让库里有 `outdated` 记录；打开对应技能详情，footer 显示「更新」，点后库刷新，徽标消失。
5. 关闭详情，列表滚动位置不变。

### 阶段 7：接入安装确认流程

**执行目标**：从市场行或详情安装一个 GitHub 技能；可选写入一个位置；冲突/执行中/部分失败都有明确反馈；安装后库刷新。

**改动文件**

- 新增 `market-install-dialog.tsx`
- 修改 `market-page.tsx`、`market/rows.ts`、`src/messages.ts`
- `__test__/market-rows.test.ts`（`conflictOf`/`sameSource`）

**关键实现点**

1. `conflictOf(row, library.rows)`：
   - 同名同来源 → `installed`；
   - 同名不同来源/无 `upstream` → `conflict`；
   - 无同名 → `none`。
2. 目标列表：`技能库` + `useReadablePlaces()` 按 scope 分组；每个位置显示 `placePath`、是否已存在同名技能、无工作区时禁用。
3. 确认：
   - 校验 `source`/`skillId`（见安全边界）；
   - `installPackage(row.source,[row.skillId])`；
   - `installed.length === 0` → 逐条显示 `failed[]`；
   - 有目标 → `installInto(result.installed[0], ref)`；失败显示部分成功与原因，保留「重试写入位置」；
   - 成功 → `library.reload()`，关闭，toast。
4. 执行中禁用关闭/Esc；步骤文案“正在下载到技能库…”/“正在写入 <path>…”。
5. well-known：不打开安装弹窗；详情里给命令 + 复制 + 外链。
6. 安装成功后，详情保持打开并把主按钮变「已安装」；列表行同步。

**验收**

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
```

手工（**必须用临时 hub home，不碰真实 `~/.context-hub` 和用户工作区**）：

1. `TEMP_HOME=$(mktemp -d)`；`TEMP_WORK=$(mktemp -d)`；`pnpm --filter web build`；`node apps/web/server.ts --port 5283 --static apps/web/dist --home "$TEMP_HOME" --folder "$TEMP_WORK"`。
2. 搜索 `find`，安装 `vercel-labs/skills/find-skills`，目标只选技能库；确认后 `$TEMP_HOME/skills/find-skills/SKILL.md` 存在。
3. 回到市场行，状态为「已安装」；详情 footer 为「已安装」。
4. 再次安装同一行：预检为已安装，不发起 CLI。
5. 在临时库里放一个同名本地技能目录（无 `upstream`），或安装一个同名但来源不同的技能，确认冲突态禁用安装并说明原因。
6. 要测位置写入，只选 `--folder "$TEMP_WORK"` 下的工作区位置；**不要点全局位置**——全局位置写真实 home，`CONTEXT_HUB_HOME` 隔离不了它。收尾删 `$TEMP_HOME` 和 `$TEMP_WORK`。
7. well-known 行：安装按钮为「仅 CLI」，显示命令；不写盘。

### 阶段 8：解析官方精选

**执行目标**：可选入口可用；解析成功显示 owner 分组，失败隐藏；不影响榜单/搜索。

**改动文件**

- `market/client.ts`（`officialOwners`）、`market-official-dialog.tsx`、`market-page.tsx`、`src/messages.ts`
- `__test__/market-official.test.ts`、fixture `official.html`

**关键实现点**

1. 正则解析 owner 行；只收 href 恰一段的链接；owner/repo/两个计数齐全才收；去重、按 skills 降序。
2. 入口在榜单第一页渲染后后台读 `officialOwners()`；空数组/失败隐藏按钮；成功缓存 6 小时，空/失败缓存 10 分钟。
3. 弹窗或区块只展示 owner 行 + 外链；不调用搜索 API。
4. fixture 用一条真实 owner 行的 HTML 片段；测试解析成功、缺列跳过、0 行返回 `[]`。

**验收**

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
curl -s https://www.skills.sh/official | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(/href="\/[A-Za-z0-9._-]+"/.test(s)))'
```

判据：fixture 测试全绿；live curl 打印 `true`；把 fixture 改成坏结构时测试断言返回 `[]`；市场首页在坏结构下没有「官方精选」入口。若本阶段不做，删除入口与代码即可，①②③④⑤⑦ 不受影响。

### 阶段 9：补齐状态、文案与文档

**执行目标**：所有状态有文案和下一步；中英文成对；设计文档更新；全仓检查通过。

**改动文件**

- `src/messages.ts`、`packages/i18n/zh-cn/src/messages.ts`
- `designs/README.md`
- 需要的话，`packages/resources/skills/src/market-page.tsx` 的状态文案

**关键实现点**

1. 状态清单逐条落地：加载骨架、无结果、网络失败、无 net、无技能库、npx 缺失、审计未生成、审计失败、well-known 不可装、同名冲突、执行中、部分失败、已安装、可更新、内容过大。
2. 文案键统一 `skills.market.*`；英文和中文成对；不把旧 `skills.search.*` 改坏（旧弹窗删除后这些键可以保留，等后续清理）。
3. `designs/README.md`：
   - §2 表格加 `designs/skills-sh.pen` 的 7 块画板（编号、id、名称）；
   - §3b 的「下载」改成“已被市场页取代”，保留历史说明；
   - 新增“skills.sh 市场”一节：路由、榜单/搜索/详情/安装的判据、well-known 限制、审计数据来源。
4. 全仓检查：`pnpm typecheck`、`pnpm test`、`pnpm --filter @context-hub/skills lint`、`pnpm --filter @context-hub/zh-cn test`。

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
```

判据：全部 0 failed；中文包测试无 “not in the pack”；设计文档的表与实际画板 id 一致。若 `pnpm test` 里依赖外网/`skills` CLI 的既有用例因环境失败，记录失败项与命令，不把它算成本轮改动通过或失败。

## 测试与验证

### 单测矩阵

| 文件 | 覆盖 |
| --- | --- |
| `market-client.test.ts` | 三榜单解析、可选字段、非法 view、400/404、非 JSON、搜索 1 字符/200 上限/owner、download 路径校验、audit `SAFE`、tele 空、pageMeta JSON-LD/meta/命令、official 0 行 |
| `market-cache.test.ts` | TTL 命中/过期、in-flight 去重、上限淘汰、`null` 负缓存 |
| `market-service.test.ts` | 无 net 报错、缓存复用、服务名与 available |
| `market-rows.test.ts` | `sameSource` 归一化、`rowState` 五种状态、`treeFromFiles` 目录补齐/排序/bytes/危险路径、`sparkPoints` 8 点/全 0/缺失 |
| `market-official.test.ts` | owner 行解析、缺列跳过、0 行 |

组件层没有 DOM 测试环境（`apps/web/vitest.config.ts` 的 `environment` 是 node），本轮不引入 jsdom；UI 走 CDP 探针。

### fixture 与可复现 curl

fixtures 放 `packages/resources/skills/__test__/fixtures/market/`，**只存裁剪后的形状**，不提交 514 KB 的 official 页；每个 fixture 在测试文件里注明来源 URL 和抓取日期。测试用 `readFileSync` + `JSON.parse` 读 fixture，不依赖 `resolveJsonModule`。

```bash
# 榜单：取 3 行裁剪
curl -s https://skills.sh/api/skills/all-time/0 \
  -o packages/resources/skills/__test__/fixtures/market/all-time-0.json
curl -s https://skills.sh/api/skills/trending/0 \
  -o packages/resources/skills/__test__/fixtures/market/trending-0.json
curl -s https://skills.sh/api/skills/hot/0 \
  -o packages/resources/skills/__test__/fixtures/market/hot-0.json

# 搜索
curl -s "https://skills.sh/api/search?q=find&limit=200" \
  -o packages/resources/skills/__test__/fixtures/market/search-find.json

# 下载（多文件技能）
curl -s https://skills.sh/api/download/anthropics/skills/pdf \
  -o packages/resources/skills/__test__/fixtures/market/download-pdf.json

# 审计（含 SAFE / MEDIUM）
curl -s https://skills.sh/api/v1/skills/audit/vercel-labs/skills/find-skills \
  -o packages/resources/skills/__test__/fixtures/market/audit-find-skills.json
curl -s "https://www.skills.sh/tele/audit?source=vercel-labs/skills&skills=find-skills" \
  -o packages/resources/skills/__test__/fixtures/market/tele-find-skills.json

# 详情页：只保留 JSON-LD + meta + 安装命令片段
curl -s https://www.skills.sh/vercel-labs/skills/find-skills \
  -o "$TEMP/page-find-skills.html"

# well-known：确认没有 SoftwareApplication
curl -s https://www.skills.sh/site/uizze.sh/ui-taste \
  -o "$TEMP/page-ui-taste.html"

# official：只截一条 owner 行
curl -s https://www.skills.sh/official \
  -o "$TEMP/official.html"
```

Windows Git Bash 下不要用 `/tmp/...`：curl 是 Windows 程序，会把 `/tmp` 当成当前盘的 `\tmp`，写到一个可能不存在的目录。

抓完后用 `node` 裁剪（例如只留 `skills.slice(0,3)`、只留一条 `<a href="/...">`），再写进 fixtures；不要在测试运行时联网。

边界检查命令：

```bash
# 非法 view / 缺 page / 1 字符 / 越界页
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

打开 `http://127.0.0.1:5283/skills/market`。用 headless Edge + CDP（`docs/memory.md` 的 `--remote-debugging-port` 方式）或人工检查：

1. 榜单默认 All Time，≥5 行；切 Trending/Hot，Hot 出现 `1H` 与带符号 change。
2. 搜索 `find`，`find-skills` 行出现描述；1 字符不出请求。
3. 打开 `find-skills` 详情：三个 tab 都有内容；文件 tab 有 `SKILL.md`；审计 tab 有 provider。
4. 安装到临时 hub home 的技能库，确认 `<临时 hub home>/skills/find-skills/SKILL.md`；市场行变已安装；再次安装不触发 CLI。
5. 打开 well-known `ui-taste`：安装按钮为仅 CLI，显示 `npx skills add https://uizze.sh/`；不写盘。
6. 断网（或改一个不可达的 host）刷新：保留上次列表，出现失败提示和重试。
7. 关闭详情：列表滚动位置不变；浏览器后退回 `/skills`；前进回市场，`view/q/owner` 保留。

**CDP 探针（可选，不进 CI）**

新建 `apps/web/__test__/market-probe.ts`，照 `e2e-probe.ts` 的 `send/evaluate/waitFor` 模式，检查：

- `[data-testid="market-row"]` 数量 ≥ 5；
- 点第一行后 `[data-testid="market-detail"]` 存在；
- 文件 tab 出现 `SKILL.md`；
- 审计 tab 出现 provider 行；
- 安装后 `[data-testid="market-row-installed"]` 存在。

探针默认连真实 skills.sh，**只在手工验收运行**；失败时先看网络/接口，不要把它当单测。

### 未验证内容

- `/api/download` 对二进制/图片文件 `contents` 的编码：目前只验证了文本文件（`anthropics/skills/pdf` 全是文本）。如果遇到非文本，文件 tab 按字符串显示，可能乱码；不阻塞。
- 429/限流行为：没有触发过；如果出现，页面按非 200 显示错误，不做退避重试。
- `/official` HTML 结构变化：解析是 best-effort；失败隐藏入口。
- `hot` 的 `total`/`change` 确切统计口径：站点列头是 `1H / Change`，只按显示值使用，不做计算。
- 搜索 `count` 是否在某些 query 下不同于返回行数：实测等于返回行数；代码不依赖它。
- `host.net` 在桌面/CLI 形态的实际 10 s/4 MB 表现：与 web 共用 `createNetHandler`，理论一致；未逐形态跑。

## 风险与待决问题

### 风险

1. **非官方 API**：skills.sh 的公开路由没有契约；字段/HTML 一变就可能失效。缓解：形状校验、可选字段、失败不清空、官方精选可隐藏、fixtures 单测固定已知形状。不能保证长期兼容。
2. **HTML 解析脆弱**：`/official` 和 well-known 页面靠正则；结构变化时只能隐藏/降级，不能自动修复。
3. **4 MB / 10 s 上限**：大技能包/慢网络会在 host.net 失败；详情文件 tab 只能提示，不能预览。榜单首包实测 3.6 s，慢网可能超时。
4. **安装写真实目录**：`installPackage` 写 hub home 的 `skills/`，`installInto` 写 Agent 目录；验收必须用 `CONTEXT_HUB_HOME`/`--home` 指向临时目录，真实环境不要点全局位置。
5. **同名冲突**：现有库没有覆盖/改名 API；市场只能拒绝，用户需要去 Skills 页处理。
6. **外部插件失去消费者**：删除旧弹窗后，`skills.sh` 插件仍注册 registry 但没人读；这是兼容保留，不是漏删。若未来要清理，单独改契约和外部仓库。
7. **well-known 体验不完整**：不能在此安装、不能读文件、没有描述；设计必须明确，否则会被当成 bug。
8. **CLI 注入面**：远端 `source`/`skillId` 进入 `npx` 参数；本计划要求安装前做严格来源校验和 `assertSkillName`，但现有外部插件路径没有这层校验，不能把本轮的校验当成全局修复。

### 待决问题（请审批时确认）

1. **市场形态**：`/skills/market` 子页（推荐）还是 1040px 全屏弹窗？
2. **旧快速搜索**：删除 `SearchSkillsDialog`、只保留市场页（推荐）还是保留双入口？
3. **搜索描述**：GitHub 行用 `/api/download` frontmatter（推荐，实测比 HTML 页小）、HTML meta 兜底；well-known 不显示描述。是否接受？
4. **官方精选**：画板 ⑥ 保留、实现放最后、解析失败隐藏（推荐）；还是本轮不画/不做？
5. **安装默认**：默认只写技能库（推荐），位置是可选项；还是每次强制选一个位置？
6. **外部插件**：保留 `skills.sh` 插件和 `SkillRegistry` 契约不动（推荐）；还是本轮一并移除消费者和插件依赖？
7. **搜索页大小**：10 行/页（推荐，控制描述请求）还是 20 行/页？

## 自审

- **API 覆盖**：`/api/skills`、`/api/search`、`/api/download`、`/api/v1/.../audit`、`/tele/audit`、`/official`、skill 页面 HTML、安装/更新 CLI 都有 URL、参数、返回、解析、边界、缓存、错误、页面归属。
- **画板覆盖**：7 块画板都有数据来源、状态和串联路径；①③④⑤⑥⑦ 都有明确的下一步；② 是纯空态，不编造榜单。
- **阶段顺序**：1 → 2 → 4 → 5 → 6 → 7 → 8 → 9；3（设计）只依赖 1 的字段形状，可与 2 并行；没有阶段依赖后面才创建的文件。每个阶段结束都有 typecheck/test 或可观察检查。
- **调用方/测试/fixture/配置**：`extension.ts`、`index.ts`、`page.tsx`、messages、zh-cn、designs/README 都列入；`SkillRegistry`、外部插件、`createNetHandler`、`apps/web` 明确不改。fixtures 与 curl 已写。
- **事实与猜想分开**：实测数字、`SAFE`、`/site/` canonical、5.7 KB vs 83 KB、`count` 语义都写明来源；未验证项单列。
- **范围**：非目标覆盖了 Pack/Topic/Agent、OIDC、hash 版本、覆盖/批量、无限滚动、新依赖、外部插件、host 路由、自动刷新；没有顺手改无关模块。
- **职责边界**：本计划只写文档，不改源码、配置或 `.pen`；执行阶段才动这些文件。
