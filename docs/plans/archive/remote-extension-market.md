# 远程扩展插件市场

## 假设

以下是本计划对已确定设计的落实方式；其中标「需要拍板」的点在最后一节列出，不阻塞其余阶段。

1. 远程仓库是独立 git 仓库，路径 `D:\work-space\context-hub-extensions`，当前为空目录；不加入 `pnpm-workspace.yaml`，不进入本仓库的构建。
2. 仓库结构固定为根 `marketplace.json`、`icons/`、`plugins/<id>/`，目录名等于 manifest 的 `id`。
3. 索引格式参考 DeepSeek Harness 的市场索引，但按第一期收窄：`format: 1`、多语言 `title`/`description`、`versions` 数组、每个版本固定 `source`（仅 `git`）和 `integrity`（目录哈希）。列表页展示所需的 `title`/`description`/`icon`/`author` 必须由索引自带。
4. 第一期只支持第一方/可信仓库：索引 URL 必须是 `https:`，git 源必须是 `https:` 且固定 40 位 commit，安装时校验目录哈希；不做签名，不做第三方沙箱，`permissions` 只展示不强制。
5. 安装由宿主进程完成：git 抓取固定 commit 到临时目录，校验后原子移动到 `<hub-home>/extensions/<id>`；不引入 npm/pnpm 安装。
6. 标准 `import React` 通过 `apps/web/index.html` 的静态 import map + `/hub/extensions/_runtime/*.js` shim 实现；插件构建只需把 react 系列标为 external。
7. 第一期范围：索引 + 宿主安装/更新/卸载 + `/extensions` 市场列表与安装确认 + 刷新页面生效；不做运行时动态注册。
8. 安装后自动启用：首次安装由宿主把 `<hub-home>/state/extensions.json` 中该 id 写为 `true`；更新已有插件时保留原值；卸载时删除该键。理由见「设计 5」。
9. 市场索引源 URL 存在 `SettingsService` 的 `HubSettings` 中；页面每次请求把 URL 发给宿主，宿主不读配置文件。
10. 页面只做第一方 UI；索引里的文本按纯文本渲染，不渲染 HTML；索引图标由浏览器直接加载。

## 背景与现状

### 扩展空间与内核

- 扩展目录：`<hub-home>/extensions/<id>`，常量在 `packages/core/src/plugins.ts:19-31`（`EXTENSION_ROUTE = "/hub/extensions"`、`EXTENSION_DIR`、`PLUGIN_MANIFEST = "plugin.json"`、`EXTENSION_RECORDS = "index.json"`）。
- id 校验：`assertPluginId`（`packages/core/src/plugins.ts:50-64`）要求每段匹配 `/^[a-z0-9][A-Za-z0-9-]*$/`，因此以下划线开头的 `_runtime` **不是合法插件 id**；`createFsPluginStore.list()`（`packages/core/src/host/plugins-fs.ts:139-156`）也会跳过这类目录。
- 磁盘读写：`createFsPluginStore`（`packages/core/src/host/plugins-fs.ts:126-189`）提供 `list`/`read`/`write`/`remove`/`records`/`setRecord`；`remove` 会删除目录和记录（`:168-175`）。
- 目录哈希：`folderHash`（`packages/core/src/host/folder-hash.ts:54-64`）按相对路径排序、跳过 `.git` 与 `node_modules`，对 `relative + bytes` 做 SHA-256。算法与 skills 锁文件共用，不能改。
- 扩展 HTTP 路由：`createExtensionHandler`（`packages/core/handlers.ts:281-311`）目前**只接受 GET**（`:291-293`），把路径第一段当插件 id；文件服务 `sendExtensionFile`（`:256-274`）用 `resolveStoredFile(root, `${id}/${file}`)` 解析，路径只保证不逃出 `<home>/extensions`，**不保证不逃出该插件目录**。
- `under(route, pathname)`（`packages/core/handlers.ts:51-55`）要求路由后带 `/`，所以 `/hub/extensionsX` 不会被当作本路由。
- 已安装插件加载：`discoverPlugins`（`packages/extensions/src/plugin.ts:167-230`）读 `plugin.json`、校验、`import()` 入口模块；入口只拿到 `ctx.react`/`icons`/`icon`/`ui`（`:202-221`），插件代码里写 `import React from "react"` 目前会在浏览器里失败。
- 清单校验：`parsePluginManifest`（`packages/extensions/src/plugin.ts:104-146`）与 `PluginManifestFile` 定义在 `plugin.ts`，该文件顶部 `import * as React from "react"`、`import type { LucideIcon } from "lucide-react"`（`:13-14`），Node 宿主无法直接复用。
- 内核目录只在启动时组装：`startHub` 在 `apps/web/src/lib/hub.ts:147-208` 里把 `builtinExtensions` 与 `installedPlugins()`（`:124-144`）一起传给 `createHubKernel`；`ExtensionService` 构造时读 `state/extensions.json`（`packages/extensions/src/service.ts:114-126`），之后没有新增目录项的 API。
- 启用状态写回：`ExtensionService.persist()`（`service.ts:325-329`）把每个已知条目的布尔值整体写回 `extensions` 状态文档；`readState()`（`:331-343`）只保留布尔值。
- 设置：`HubSettings`/`DEFAULT_SETTINGS`/`readSettings`/`SettingsService.set` 在 `packages/extensions/src/settings.ts:30-51,67-82,119-131`；`set` 的「无变化就不写」判断逐字段比较，新增字段必须同步加进这个判断。
- `/extensions` 页面：`apps/web/src/pages/extensions.tsx:130-208`，数据只来自 `useExtensionSnapshot()`（`:132`），按分类区块渲染；详情弹窗 `apps/web/src/components/extension-detail-dialog.tsx` 的「安装/卸载」实际是 `ctx.extensions.toggle`（`:191`），只启用/停用，不删文件。
- 宿主路由挂载：`apps/web/server.ts:118-138` 的 `middlewares` 列表；桌面端 `apps/desktop` 启动的是同一个 `apps/web/server.ts` 打包产物（`apps/desktop/bundle.ts:19-23`），所以新增宿主路由不需要改桌面端。

### 市场相关缺口

- 没有市场索引读取、校验或安装路由。
- 没有写扩展目录的 HTTP 入口：`createFsPluginStore` 的 `write`/`setRecord`/`remove` 目前只有测试调用。
- 没有 import map；插件无法使用标准 `import React`。
- `/extensions` 页面没有索引源配置，也没有「未安装插件」的数据来源。
- `SettingsService` 没有市场 URL 字段。

### 参考实现（DeepSeek Harness）

- `D:\work-space\deepseek-harness\docs\user\guide\plugin-market.zh.md`：索引的 `format`、`LocalizedText`、版本 `source`、相对图标解析、拒绝重定向、大小上限。
- `D:\work-space\deepseek-harness\.agents\notes\implemented\feature\2026-10-02-plugin-market-index-format.zh.md`：每个版本固定 `source` 与 `version`，校验失败拒绝整份索引并给 JSON 路径。
- `D:\work-space\deepseek-harness\packages\boot\plugin-market\README.zh.md`：超时 15s、读取上限、缓存 TTL、并发读取共享一次 fetch、相对图标在读取时解析为绝对 URL。
- 本计划只复用这些规则，不复用它的 npm 源、`engines` 兼容范围、分类/标签/排序键、搜索索引和生成器。

## 目标

1. 定义并实现一份可发布、可校验、可增量维护的 `marketplace.json` 格式。
2. 宿主提供市场读取、安装、更新（与安装同一动作）、卸载；安装固定 commit、校验目录哈希、原子替换、失败回滚。
3. 在 `/extensions` 页面显示市场列表、索引源配置、安装确认、已安装/可更新状态和卸载入口。
4. 提供标准 `import React` / `react/jsx-runtime` / `react/jsx-dev-runtime` / `react-dom` 的浏览器运行时映射，并用自动检查盯住 shim 的命名导出面。
5. 首次安装后刷新页面即可启用；更新保留用户原来的启用选择。
6. 有机械可验收的单测、宿主路由测试和一次隔离 home 的 headless Edge 端到端验收。

## 非目标（不做）

- 不做索引签名、证书校验、第三方沙箱、权限强制。
- 不支持 npm/pnpm/tarball/本地目录作为市场版本源；第一期只有 `{ "type": "git", ... }`。
- 不做自动检查更新、后台定时器、自动下载。
- 不做运行时动态注册；安装/更新/卸载后必须刷新页面。
- 不实现 SemVer 解析与排序：`versions[0]` 是推荐版本；「可更新」只比较版本字符串是否不同。
- 不支持 `dist-tags`、`metadata` 分类/标签/排序键、`publishedAt`、`engines` 范围。
- 不做市场搜索/排序/分页；只沿用页面现有的文本过滤。
- 不映射 `react-dom/client`、`react-router`、`lucide-react`、`@context-hub/shadcn-ui` 等裸导入；插件继续用 `ctx.ui`/`ctx.icons`。
- 不改 `packages/resources/plugins` 的 agent 插件库、它的市场、路由和索引。
- 不改扩展详情弹窗的启用/停用语义，也不把 `ExtensionDetailDialog` 的按钮改成删文件。
- 不代理索引图标；浏览器直接加载 `<img src>`。
- 不预置默认索引源，不支持多个索引源。
- 不改桌面端/CLI 打包配置；它们复用同一份 `server.ts` 和构建后的页面。
- 不引入生产依赖；不改 `pnpm-lock.yaml`。

## 设计

### 1. 市场索引格式

文件：远程仓库根 `marketplace.json`，UTF-8 JSON。

```json
{
  "format": 1,
  "title": { "en": "Context Hub Extensions", "zh-cn": "Context Hub 扩展" },
  "description": { "en": "First-party extensions for Context Hub." },
  "plugins": [
    {
      "id": "demo.counter",
      "title": { "en": "Counter", "zh-cn": "计数器" },
      "description": { "en": "A counter in the header.", "zh-cn": "标题栏里的计数器。" },
      "icon": "icons/demo.counter.svg",
      "author": "Context Hub",
      "category": "integration",
      "permissions": ["storage.self"],
      "versions": [
        {
          "version": "1.0.0",
          "source": {
            "type": "git",
            "url": "https://github.com/<org>/context-hub-extensions",
            "commit": "<40 位小写十六进制>",
            "path": "plugins/demo.counter"
          },
          "integrity": "<64 位小写十六进制目录哈希>"
        }
      ]
    }
  ]
}
```

规则（全部由 `packages/core/src/extension-market.ts` 校验）：

| 字段 | 必填 | 规则 |
|---|---|---|
| `format` | 是 | 整数 `1`。 |
| `title` | 是 | `LocalizedText`。 |
| `description` | 否 | `LocalizedText`。 |
| `plugins` | 是 | 数组，可为空；数组顺序即推荐顺序。 |
| `plugins[].id` | 是 | 通过 `assertPluginId`；大小写不敏感地唯一；必须等于 manifest 的 `id` 和安装目录名。 |
| `plugins[].title` | 是 | `LocalizedText`。 |
| `plugins[].description` | 是 | `LocalizedText`。 |
| `plugins[].icon` | 是 | `data:image/(svg+xml\|png\|jpeg\|webp);base64,...`（解码后 ≤ 32 KiB）或 URL；URL 相对于索引 URL 解析后必须是 `https:`，不能带凭据或片段。 |
| `plugins[].author` | 是 | 非空白字符串。 |
| `plugins[].category` | 否 | `ExtensionCategoryId` 之一。 |
| `plugins[].permissions` | 否 | `ExtensionPermission` 数组；只展示。 |
| `plugins[].versions` | 是 | 非空数组；`version` 字符串唯一；`versions[0]` 是推荐版本。 |
| `versions[].version` | 是 | 非空、≤ 64 字符、不含空白；不按 SemVer 解析。 |
| `versions[].source.type` | 是 | 只接受 `"git"`。 |
| `versions[].source.url` | 是 | `https:`，无凭据/查询/片段，至少两个路径段，不以 `/` 结尾，不以 `.tgz`/`.tar.gz` 结尾。 |
| `versions[].source.commit` | 是 | `/^[0-9a-f]{40}$/`。 |
| `versions[].source.path` | 否 | `/` 分隔的相对目录；每段 `/^[A-Za-z0-9._@+-]+$/`，不是 `.`/`..`，不以 `/` 开头，不含 `\`。缺省表示仓库根。 |
| `versions[].integrity` | 是 | `/^[0-9a-f]{64}$/`，与 `folderHash` 的结果一致。 |

`LocalizedText` 是字符串，或以小写语言 id 为键的对象；对象必须含非空 `en`，键匹配 `/^[a-z]{2,8}(-[a-z0-9]{1,8})*$/`。解析顺序：请求 locale 小写后精确匹配 → 语言前缀（`zh-CN` → `zh`）→ `en`。未知成员在每一层忽略；未知 `source.type` 拒绝整份索引。错误信息带 JSON 路径，例如 `plugins[0].versions[0].source.commit`。

索引读取边界（`packages/core/src/host/extension-market.ts`）：

- 只接受 `https:`；`username`/`password`/`hash` 为空；主机名通过 `isPublicHostname`（`packages/core/src/host/remote-image.ts:25-40`），与 `/hub/net` 同一策略。
- `redirect: "manual"`；任何 3xx 拒绝并提示配置最终 URL。
- `AbortSignal.timeout(15_000)`；响应体流式读取，上限 2 MiB；严格 UTF-8 解码；JSON 解析失败直接报错。
- 成功结果按规范化 URL 缓存 5 分钟；`refresh: true` 绕过缓存；同一 URL 的并发读取共享一个 in-flight Promise；失败不缓存文档。
- 相对 `icon` 在读取时解析为绝对 URL；返回给页面的索引只含已校验字段。
- `fetchMarketIndex(url, options?)` 暴露 `allowHttp`、`allowPrivate`、`timeoutMs`、`maxBytes` 作为测试注入点；生产默认 `https` + 公网主机 + 15s + 2 MiB。`createMarketReader(options?)` 另外接受 `cacheTtlMs` 与 `fetch` 实现，测试用它构造小上限/短 TTL 的读取器。

### 2. 清单校验拆分

目标：Node 宿主能复用 `parsePluginManifest`，而 `packages/extensions` 的公开 API 不变。

新建 `packages/core/src/extension-manifest.ts`，内容为从 `packages/extensions/src/types.ts` 与 `packages/extensions/src/plugin.ts` 原样搬过来的纯逻辑：

- `EXTENSION_API_VERSION = "0.1"`
- `EXTENSION_PERMISSIONS`、`ExtensionPermission`
- `EXTENSION_CATEGORIES`、`ExtensionCategoryId`
- `isCompatible(apiVersion)`
- `PluginManifestFile`
- `parsePluginManifest(value, id)`

该文件不 import React、lucide-react、Node API 或 `@context-hub/extensions`（core 不能反向依赖 extensions）。

调用方与导出：

- `packages/extensions/src/types.ts` 删除上述重复定义，改为从 `@context-hub/core/extension-manifest` 导入并 `export` 同名类型/常量/函数；`index.ts` 的 `export * from "./types.ts"` 继续把 `EXTENSION_API_VERSION`、`isCompatible`、`ExtensionPermission`、`ExtensionCategoryId` 暴露给现有调用方。
- `packages/extensions/src/plugin.ts` 从 core 导入 `parsePluginManifest`、`PluginManifestFile`，并 `export { parsePluginManifest, type PluginManifestFile } from "@context-hub/core/extension-manifest"`；React/lucide 的 import 留在该文件，`discoverPlugins` 继续使用。
- `packages/core/package.json` 新增 `"./extension-manifest": "./src/extension-manifest.ts"`。
- 搜索范围：`parsePluginManifest`、`PluginManifestFile`、`EXTENSION_API_VERSION`、`isCompatible`、`ExtensionPermission`、`ExtensionCategoryId`。现有直接调用点只有 `plugin.ts:153` 与 `service.ts`/`plugin.ts` 对 `isCompatible` 的导入；re-export 后不需要改其它调用方。
- 行为必须逐字保持：id 必须等于目录名、`apiVersion` 必须兼容、`permissions`/`category` 拒绝未知值、`locked` 拒绝、`defaultEnabled` 只认 `true`、未知字段忽略。用新测试钉住。

### 3. 宿主市场读取、安装、更新、卸载

#### 3.1 路由

在 `packages/core/src/plugins.ts` 新增：

```ts
/** Route a form serves the extension market on. */
export const EXTENSION_MARKET_ROUTE = "/hub/extension-market"
```

放在 `EXTENSION_ROUTE` 附近。它不在 `/hub/extensions` 下，避免与插件 id 命名空间混用；`_runtime` 的冲突问题因此只影响扩展文件路由。

`createExtensionMarketHandler` 放在 `packages/core/handlers.ts`，挂载到 `apps/web/server.ts` 的中间件列表（`createExtensionHandler` 之后）。请求/响应契约固定为：

```text
POST /hub/extension-market
{ "action": "list", "url": "https://…/marketplace.json", "refresh": false }
→ 200 { "index": ExtensionMarketIndex }

{ "action": "install", "url": "...", "id": "demo.counter", "version": "1.0.0" }
→ 200 { "id": "demo.counter", "version": "1.0.0", "enabled": true, "fresh": true }

{ "action": "remove", "id": "demo.counter" }
→ 200 { "ok": true }

失败 → 4xx { "error": "…" }
```

- 只接受 POST；其它方法 405；`under(EXTENSION_MARKET_ROUTE, pathname) !== ""` 时 `next()`，所以 `/hub/extension-marketX` 仍是 404。
- 请求体用 `readJson`（`packages/core/src/host/http.ts:84-92`）。
- `install` 从 `reader` 读取索引（缓存未过期则用缓存，否则重新抓取）并解析 `id` + `version`，**不接受页面传入的 source**；索引中没有该 id/版本时 400。
- 安装/卸载串行执行（与 `ExtensionService.run` 相同的 tail Promise），避免两个请求同时改同一目录。
- handler 选项：`{ home?: string; reader?: MarketReader }`。`reader` 是测试注入点，不通过 HTTP 暴露；生产默认 `createMarketReader()`。
- `MarketReader` 的形状：
  ```ts
  export interface MarketReader {
    read(url: string, refresh: boolean): Promise<ExtensionMarketIndex>
  }
  ```
- handler 在构造时创建 `createFsPluginStore(home)` 与 `createFsStateStore(home)`，把两者传给安装/卸载函数。`createExtensionHandler` 也会创建自己的 `createFsPluginStore`，两个 `migrateExtensionSpace` 会并发；把迁移改成按 home 去重的模块级 Promise（`Map<string, Promise<void>>`），或在 `apps/web/server.ts` 创建一次 store 并注入两个 handler。计划采用前者：改动最小，幂等性由同一个 Promise 保证。

#### 3.2 固定 commit 的 git 抓取

`packages/core/src/host/extension-market.ts` 用 `execFile("git", …)`，参数与超时参照 `packages/resources/plugins/src/host/fetch.ts:51-95`：

```text
cwd = <work>
1. git init --quiet .
2. git -c advice.detachedHead=false fetch --quiet --depth 1 --no-tags -- <url> <commit>
3. git -c advice.detachedHead=false -c core.autocrlf=false -c core.eol=lf \
       -c core.symlinks=false checkout --quiet --detach FETCH_HEAD
4. git rev-parse HEAD
```

依据与注意点：

- `clone --depth 1` 不保证任意 commit 可达；`fetch <url> <commit>` 直接按 SHA 请求，固定 commit 必须是能从某个 ref 到达的提交。发布流程要求索引里的 commit 在分支历史上；不可达时 git 自己会报错，原样带回最后 8 行输出。
- 不建 `origin` remote：`fetch` 直接接收 URL 并写 `FETCH_HEAD`，少一步，也不会把远程地址留在临时工作目录的 git config 里。
- 第 4 步断言输出等于索引里的 40 位 commit，防止服务端给出别的东西。
- `core.autocrlf=false`、`core.eol=lf` 是为了让检出字节与索引生成器看到的字节一致；`.gitattributes` 的 `text` 归一化仍可能改变字节，发布仓库应避免对插件文件启用强制换行转换，`integrity` 不匹配即拒绝安装。
- `folderHash` 用 `relative.localeCompare` 排序；发布机与 hub 运行机的 ICU locale 不同可能得到不同顺序。发布仓库的插件文件名全部使用小写 ASCII，`tools/hash-extension.mjs` 与 hub 使用同一个 `localeCompare` 调用；`integrity` 不匹配即拒绝安装。
- 环境变量与 `fetch.ts` 相同：`GIT_TERMINAL_PROMPT=0`、`GIT_ASKPASS=""`、`SSH_ASKPASS=""`、`SSH_ASKPASS_REQUIRE=never`、`LC_ALL=C`、`windowsHide:true`；超时 120s，输出上限 4 MiB。
- 只接受索引校验过的 `https:` URL；`file://` 只出现在测试的注入索引里（绕过解析器），生产路径不会走到。
- 目录选择：`source.path` 缺省为仓库根；否则按 `/` 段解析，`path.resolve(work, ...segments)` 必须仍在 `work` 下。
- 复制到 staging 时排除 `.git` 与 `node_modules`（与 `folderHash` 的跳过集合一致），然后逐项 `lstat`：符号链接、设备、socket 一律拒绝；文件数上限 5000、总字节上限 64 MiB。
- `folderHash(stage)` 必须等于索引的 `integrity`；`parsePluginManifest(plugin.json, id)` 必须通过；`manifest.version` 必须等于索引版本；`manifest.entry ?? "index.js"` 必须存在且是 staging 内的普通文件（拒绝 `..`、绝对路径、反斜杠）。
- 索引声明了 `permissions` 时，必须与 `manifest.permissions` 集合完全一致；否则拒绝安装。否则索引可以展示比实际更少的权限，而详情弹窗读的是 manifest。
- staging 目录放在 `<hub-home>/extensions/.staging-<uuid>`，与目标同盘，保证 `rename` 不跨设备；`list()` 因 `assertPluginId` 拒绝点开头的名字而看不见它。

#### 3.3 原子替换与回滚

`installExtensionFromMarket` 的步骤：

1. 建 staging，抓取、校验、哈希。
2. 若 `<root>/<id>` 已存在：`rename(<id>, .old-<uuid>)`；再 `rename(stage, <id>)`。
3. 第二步失败：尝试 `rename(.old-<uuid>, <id>)` 回滚；回滚也失败时抛错并给出 `.old-*` 的绝对路径，说明旧文件还在。
4. 第二步成功：尽力删除 `.old-*`；删除失败不影响安装结果（该目录不会被 `list()` 看到）。
5. 目录不存在时直接 `rename(stage, <id>)`。
6. 失败路径在 `finally` 里删除仍存在的 staging；`.staging-*`/`.old-*` 不自动清理，错误信息给出路径。

`rename` 使用与 `packages/core/src/host/atomic.ts:14-44` 相同的可重试错误集合（`EACCES`/`EBUSY`/`EPERM`）和 20/40/60/80ms 退避。`replaceDirectory` 允许注入 `rename`（默认 `fs.rename`），测试用它模拟第二步失败并断言回滚。

安装顺序：移动目录 → `store.setRecord(id, { version, source: "git+<url>#<commit>" (+ "&path:/<path>"), installedAt, integrity })` → 写启用状态。记录写失败不让安装失败，返回 warning；状态写失败时 `enabled:false`，插件仍安装成功。

#### 3.4 启用状态

- 首次安装（目标目录此前不存在）：读 `<home>/state/extensions.json`，保留已有布尔值，写入 `{ ..., [id]: true }`，`state.write("extensions", next)`（`createFsStateStore` 已用 `writeFileAtomic`）。
- 更新（目标目录已存在）：不写状态文档；返回 `enabled = stored[id] ?? manifest.defaultEnabled ?? false`。
- 卸载：`store.remove(id)` 后读状态文档，删除该 id 再写回；文档不存在或格式坏了就跳过，不让卸载失败。
- 为什么首次安装自动启用：用户点「安装」的意图就是使用它，装完还要再找一次开关是多余的一步；更新不覆盖用户后来手动关掉的选择，因为更新不是「重新同意启用」。
- 该判断的并发注意点：页面内核在内存里也有一份 state，安装后如果用户马上切换其它开关，浏览器会把旧快照整体写回，覆盖安装写入的 `true`。页面在安装成功后会同步自己的内存快照（见「设计 5」），但两个标签页同时操作仍是最后写入者胜出；这一点写进风险。

#### 3.5 卸载

`removeInstalledExtension`：`assertPluginId(id)`；`store.list()` 不含该 id 时 400；`store.remove(id)`；删除启用状态键。插件代码已经加载在当前页面里的部分要刷新页面才消失，UI 会提示。

#### 3.6 扩展文件路由的两个配套加固

- `sendExtensionFile` 改为以 `path.join(root, id)` 为根调用 `resolveStoredFile`，拒绝读到自己插件目录之外的文件；这是市场引入第三方内容后必须补的边界。
- `createExtensionHandler` 在解析 id 前处理 `_runtime`：`rest === "_runtime"` 或 `rest.startsWith("_runtime/")` 时只查 `RUNTIME_FILES`，查不到 404。因为 `_runtime` 不可能是合法 id（见背景），不需要额外保留名表。

### 4. import map 与 `_runtime` shim

#### 4.1 路由与 shim

新建 `packages/core/src/host/extension-runtime.ts`：

```ts
export const RUNTIME_FILES: Readonly<Record<string, string>> = {
  "react.js": REACT_SHIM,
  "jsx-runtime.js": JSX_RUNTIME_SHIM,
  "jsx-dev-runtime.js": JSX_DEV_RUNTIME_SHIM,
  "react-dom.js": REACT_DOM_SHIM,
}
export function runtimeSource(name: string): string | undefined
```

shim 是从 `globalThis` 读取内核实例的普通 ES module 字符串：

- `react.js`：`const React = globalThis.__CONTEXT_HUB_REACT__;`，缺失时抛 `Context Hub: the React runtime is not ready`；`export default React`；其余命名导出逐个写成 `export const X = React.X;`。初始列表由 React 19.2.8 的 `Object.keys` 生成（`Activity`、`Children`、`Component`、`Fragment`、`Profiler`、`PureComponent`、`StrictMode`、`Suspense`、`act`、`cache`、`cacheSignal`、`captureOwnerStack`、`cloneElement`、`createContext`、`createElement`、`createRef`、`forwardRef`、`isValidElement`、`lazy`、`memo`、`startTransition`、`unstable_useCacheRefresh`、`use`、`useActionState`、`useCallback`、`useContext`、`useDebugValue`、`useDeferredValue`、`useEffect`、`useEffectEvent`、`useId`、`useImperativeHandle`、`useInsertionEffect`、`useLayoutEffect`、`useMemo`、`useOptimistic`、`useReducer`、`useRef`、`useState`、`useSyncExternalStore`、`useTransition`、`version`，以及两个 `__…INTERNALS…` 键）。
- `jsx-runtime.js`：`export const Fragment/jsx/jsxs`。
- `jsx-dev-runtime.js`：`export const Fragment/jsxDEV`。
- `react-dom.js`：`export default ReactDOM` + 明确保证的 `createPortal`、`flushSync`、`version`；其它 React 19 资源预载 API 不在第一期契约内。

`createExtensionHandler` 的 `_runtime` 分支返回 `text/javascript; charset=utf-8` 和 `Cache-Control: no-store`，与扩展文件一致。

#### 4.2 页面侧

`apps/web/index.html` 在 `<head>` 里加入（放在模块脚本之前；已用 headless Edge 验证静态 import map 即使排在 Vite 注入的 dev client 之后也生效）：

```html
<script type="importmap">
  {
    "imports": {
      "react": "/hub/extensions/_runtime/react.js",
      "react/jsx-runtime": "/hub/extensions/_runtime/jsx-runtime.js",
      "react/jsx-dev-runtime": "/hub/extensions/_runtime/jsx-dev-runtime.js",
      "react-dom": "/hub/extensions/_runtime/react-dom.js"
    }
  }
</script>
```

新建 `apps/web/src/lib/extension-runtime.ts`：

```ts
import * as React from "react"
import * as ReactDOM from "react-dom"
import * as JsxRuntime from "react/jsx-runtime"
import * as JsxDevRuntime from "react/jsx-dev-runtime"

export function installExtensionRuntime(): void {
  const shared = globalThis as typeof globalThis & Record<string, unknown>
  shared.__CONTEXT_HUB_REACT__ = React
  shared.__CONTEXT_HUB_REACT_DOM__ = ReactDOM
  shared.__CONTEXT_HUB_REACT_JSX_RUNTIME__ = JsxRuntime
  shared.__CONTEXT_HUB_REACT_JSX_DEV_RUNTIME__ = JsxDevRuntime
}
```

`apps/web/src/lib/hub.ts` 的 `startHub()` **第一行**调用 `installExtensionRuntime()`，保证在 `installedPlugins()` → `discoverPlugins()` 的 `import()` 之前全局已就位。插件仍可继续使用 `ctx.react`/`ctx.ui`。

#### 4.3 漂移检查

`apps/web/__test__/extension-runtime.test.ts`：

- 把 `RUNTIME_FILES["react.js"]` 写到临时 `.mjs`，设置 `globalThis.__CONTEXT_HUB_REACT__ = React`，动态 import；断言 `Object.keys(shim).filter(k => k !== "default").sort()` 等于 `Object.keys(React).filter(k => k !== "default").sort()`。
- 同样检查 `jsx-runtime.js` / `jsx-dev-runtime.js` 的键集合（同样去掉 interop 可能带出的 `default`）。
- 断言 `react-dom.js` 至少导出 `default`、`createPortal`、`flushSync`、`version`（不做全量比较：Node 下 `react-dom` 是 server 构建，浏览器构建的导出面可能不同）。
- 读 `apps/web/index.html`，解析 import map，断言四个键与四个 `RUNTIME_FILES` 目标一一对应；目标都以 `${EXTENSION_ROUTE}/${EXTENSION_RUNTIME_DIR}/` 开头。
- 调用 `installExtensionRuntime()`，断言四个全局存在。

### 5. 设置与页面数据流

#### 5.1 索引源配置位置

选择 `SettingsService`：

```ts
export interface HubSettings {
  layout: LayoutMode
  installMode: InstallMode
  downloadRemoteImages: boolean
  /** URL of the extension market index; empty when no market is configured. */
  extensionMarketUrl: string
  plugins: Record<string, unknown>
}
```

- `DEFAULT_SETTINGS.extensionMarketUrl = ""`。
- `readSettings`：非字符串一律回落为空串。
- `SettingsService.set` 的「无变化」逐字段比较必须加上 `next.extensionMarketUrl === this.current.extensionMarketUrl`，否则只改 URL 的 patch 会被丢掉。
- 理由：它已经持久化到 `<home>/state/settings.json`，跨刷新和跨载体共享，页面通过 `useSettings()` 订阅；页面 state 刷新即丢，环境变量浏览器读不到且不能由用户修改，单独文件会重复现有机制。
- 页面每次请求把 URL 放在请求体里发给宿主；宿主不读设置文件，也不需要与浏览器状态同步。

#### 5.2 客户端

`packages/extensions/src/remote.ts` 增加 `createRemoteExtensionMarket(base = "")`，与 `createRemotePluginSource` 放在一起：

```ts
export interface RemoteExtensionMarket {
  list(url: string, refresh: boolean): Promise<ExtensionMarketIndex>
  install(url: string, id: string, version: string): Promise<MarketInstallResult>
  remove(id: string): Promise<void>
}
```

- 统一 POST `EXTENSION_MARKET_ROUTE`，失败时解析 `{ error }` 并抛 `Error`，与 `createRemoteNet` 的写法一致。
- 类型从 `@context-hub/core/extension-market` 导入；该模块必须保持无 Node API，浏览器可安全加载。

#### 5.3 页面合并

新建 `apps/web/src/lib/extension-market.ts`：

```ts
export type MarketRowState = "available" | "update" | "installed"
export interface MarketRow {
  plugin: ExtensionMarketPlugin
  version: ExtensionMarketVersion
  title: string
  description: string
  author: string
  installed: ExtensionView | null
  state: MarketRowState
}

export function marketRows(
  entries: readonly ExtensionView[],
  index: ExtensionMarketIndex,
  locale: string
): MarketRow[]

export function marketMatches(row: MarketRow, query: string): boolean
```

- `installed` 按 `entry.manifest.id === plugin.id` 精确匹配 `snapshot.entries`。
- `state`：无 installed → `available`；`installed.manifest.version === version.version` → `installed`；否则 `update`。
- 已安装行用 `installed.manifest.icon`；未安装行用索引的 `icon`（`<img>`）。
- 页面把**未过滤**的 `snapshot.entries` 传给市场区；市场区自己按 `needle` 过滤。若传过滤后的 `entries`，搜索时已安装项会被误判为未安装。
- `useExtensionMarket(url)` hook 负责读取/刷新：URL 为空时 idle；有 URL 时首次进入显示 loading；刷新按钮在事件处理里置 loading 并递增 nonce；effect 里用 `cancelled` 标志，避免 `react-hooks/set-state-in-effect`（同步 setState 不放在 effect 顶部）。

### 6. 页面 UI

新建 `apps/web/src/components/extension-market.tsx`，并在 `apps/web/src/pages/extensions.tsx` 的搜索框之后、分类区块之前渲染 `<ExtensionMarketSection entries={snapshot.entries} needle={needle} />`。

结构：

- 区块外壳复用页面已有的 `cardSurface`：把 `apps/web/src/pages/extensions.tsx:26-27` 的常量移到 `apps/web/src/lib/extensions.ts` 并在两处导入，避免新组件反向 import 页面。标题为索引的 `title`（未加载时用 `extensions.market.title`），副标题为索引的 `description`。
- 未配置 URL：显示索引源输入框 + 「连接」按钮；`Input type="url"`，保存前用 `isMarketIndexUrl` 校验，非法时显示 `extensions.market.sourceInvalid`；空串表示断开。
- 已配置 URL：标题行右侧显示「刷新」「更改来源」；「更改来源」展开同一个输入框。输入框组件用 `key={url}` + `defaultValue` 重置草稿，避免在 effect 里同步 setState。
- 行沿用现有 `ExtensionRow` 的 64px 形状：
  - 已安装：`manifest.icon` 组件 + 分类底色；显示已安装版本。
  - 未安装：索引 `icon` 的 `<img>`（`alt=""`、`aria-hidden`），加载失败时回退到 `StoreIcon`。
  - 标题、描述来自索引的多语言字段；作者行显示 `extensions.market.author`；`category` 有值时显示 `Badge`。
  - 动作：`available` → 安装（复用 `extensions.action.install`）；`update` → 更新（`extensions.market.update`）+ 「可更新」`Badge`；`installed` → 「已安装」`Badge` + 「移除」。
- 安装确认用 `Dialog`：版本、source URL、commit（等宽、可断行）、path、integrity、声明的 permissions、第三方代码警告；底部取消 + 安装。安装中禁用按钮；失败留在对话框并 toast。
- `ExtensionDetailDialog` 不改：市场行的安装/移除在自己的组件里；已安装行点开详情仍然走原来的弹窗和启用/停用按钮。
- 移除确认照抄 `packages/resources/plugins/src/detail-dialog.tsx:1212-1258` 的 `DeleteBubble` 形状：锚在按钮上的 `Popover`，写清会删除 `<home>/extensions/<id>`，确认按钮执行移除。
- 安装/移除成功后：
  - toast；
  - 渲染「刷新页面」提示条（`extensions.market.installedNotice` / `removedNotice` + `reload` 按钮调用 `window.location.reload()`）；
  - 首次安装时同步浏览器内存 state：读 `ctx.host.storage.read("extensions")`，合并 `[id]: true` 后 `ctx.host.storage.write("extensions", next)`；移除时删除该键。这样用户刷新前再切别的开关，不会把安装结果覆盖掉。`fresh` 由安装响应给出，更新时不写。
- 文案：`packages/extensions/src/builtin/locale-en.ts` 与 `packages/i18n/zh-cn/src/messages.ts` 同步新增下列键（英文 / 中文）：
  - `extensions.market.title` / 市场
  - `extensions.market.description` / 来自可信远程仓库的扩展。
  - `extensions.market.sourceLabel` / 索引地址
  - `extensions.market.sourcePlaceholder` / https://…/marketplace.json
  - `extensions.market.sourceSave` / 连接
  - `extensions.market.sourceInvalid` / 请输入 `marketplace.json` 的 https 地址。
  - `extensions.market.refresh` / 刷新
  - `extensions.market.changeSource` / 更改来源
  - `extensions.market.loading` / 正在读取市场…
  - `extensions.market.failed` / 市场读取失败：{reason}
  - `extensions.market.empty` / 这个市场没有列出扩展。
  - `extensions.market.author` / 作者：{author}
  - `extensions.market.update` / 更新
  - `extensions.market.installed` / 已安装
  - `extensions.market.remove` / 移除文件
  - `extensions.market.removeTitle` / 移除 {name}？
  - `extensions.market.removeBody` / 这会删除这台机器上的扩展文件；刷新页面后生效。
  - `extensions.market.confirmTitle` / 安装 {name}？
  - `extensions.market.confirmVersion` / 版本
  - `extensions.market.confirmSource` / 来源
  - `extensions.market.confirmCommit` / 提交
  - `extensions.market.confirmPath` / 目录
  - `extensions.market.confirmIntegrity` / 完整性
  - `extensions.market.confirmPermissions` / 声明权限
  - `extensions.market.thirdParty` / 扩展会在这台机器上运行代码，只安装你信任的来源。
  - `extensions.market.installFailed` / 安装失败：{reason}
  - `extensions.market.installedNotice` / {name} 已安装，刷新页面后加载。
  - `extensions.market.removedNotice` / {name} 已移除，刷新页面后完成。
  - `extensions.market.reload` / 刷新页面
  - `extensions.market.cancel` / 取消

### 7. 远程仓库结构

`D:\work-space\context-hub-extensions`（独立仓库，不加入本仓库 workspace）：

```text
marketplace.json
icons/
  demo.counter.svg
plugins/
  demo.counter/
    plugin.json
    index.js
    README.md
tools/
  hash-extension.mjs
README.md
.gitignore
```

- `demo.counter/plugin.json`：`id: "demo.counter"`、`version: "1.0.0"`、`apiVersion: "^0.1"`、`entry: "index.js"`、`category: "integration"`、`permissions: ["storage.self"]`、`inject: ["header"]`。`inject` 必须包含 `header`，否则运行时读 `ctx.header` 会抛 `without inject`（见 `docs/memory.md` 2026-10-18）。
- `demo.counter/src/index.tsx`：标准 `import React, { useState } from "react"` + JSX；组件是带 `data-testid="demo-counter"` 的按钮，文本 `count: {n}`，点击 `setN(n => n + 1)`；`apply(ctx)` 里 `ctx.header.register({ id: "demo.counter", order: 50, Component })`。
- `demo.counter/index.js`：`tools/build-extension.mjs` 的构建产物（esbuild，`format=esm`、`bundle`、react 系列 external）。产物提交进仓库，hub 端不需要构建工具；`src/` 与构建脚本保留，作为“新插件怎么开发”的真实示例。
- `tools/hash-extension.mjs`：与 `folderHash` 相同的算法（跳过 `.git`/`node_modules`、按 `relative.localeCompare` 排序、`relative + bytes` 喂 SHA-256），只依赖 Node 内置模块。插件文件名保持 ASCII，避免不同 locale 的排序差异。
- 发布顺序：先提交 `plugins/demo.counter/`，拿到第一个 commit SHA；用 `hash-extension.mjs` 算 `integrity`；把 SHA 和哈希写进 `marketplace.json` 后再提交一次。索引引用的第一个 commit 在分支历史上，满足固定 commit 抓取。
- 仓库 README 写清楚：目录约定、`plugin.json` 字段、标准 React 导入、如何计算哈希、如何更新索引、commit 必须可达。
- 推送到远程主机需要用户提供 HTTPS URL；**待定输入**，本地先 `git init` + commit，不 push。

## 受影响文件

| 文件 | 类型 | 改动 |
|---|---|---|
| `packages/core/src/extension-manifest.ts` | 新建 | 纯清单校验、API 版本、权限/分类常量 |
| `packages/core/src/extension-market.ts` | 新建 | 纯索引类型、URL 校验、索引校验、LocalizedText 解析 |
| `packages/core/src/host/extension-market.ts` | 新建 | 索引抓取/缓存、git 固定 commit、哈希、原子替换、安装/卸载、启用状态 |
| `packages/core/src/host/extension-runtime.ts` | 新建 | 四个 shim 的源文本与文件名表 |
| `packages/core/src/plugins.ts` | 修改 | `EXTENSION_MARKET_ROUTE`、`EXTENSION_RUNTIME_DIR` |
| `packages/core/handlers.ts` | 修改 | `createExtensionMarketHandler`；`createExtensionHandler` 的 `_runtime` 分支；`sendExtensionFile` 以插件目录为根 |
| `packages/core/package.json` | 修改 | 新增 `./extension-manifest`、`./extension-market`、`./host/extension-market`、`./host/extension-runtime` 导出 |
| `packages/extensions/src/types.ts` | 修改 | 删除重复定义，re-export core 的清单常量/类型/`isCompatible` |
| `packages/extensions/src/plugin.ts` | 修改 | 从 core 导入并 re-export `parsePluginManifest`/`PluginManifestFile` |
| `packages/extensions/src/settings.ts` | 修改 | `extensionMarketUrl` 字段、默认值、读取、`set` 比较 |
| `packages/extensions/src/remote.ts` | 修改 | `createRemoteExtensionMarket` |
| `packages/extensions/src/builtin/locale-en.ts` | 修改 | `extensions.market.*` 英文键 |
| `packages/i18n/zh-cn/src/messages.ts` | 修改 | 对应中文键 |
| `packages/extensions/__test__/settings.test.ts` | 修改 | 补 `extensionMarketUrl` 的读取/写入/无变化用例；更新完整对象 |
| `packages/extensions/__test__/plugins.test.ts` | 修改 | 增加 `assertPluginId("_runtime")` 拒绝断言 |
| `packages/core/__test__/extension-manifest.test.ts` | 新建 | 清单校验行为保持 |
| `packages/core/__test__/extension-market-index.test.ts` | 新建 | 索引校验与 LocalizedText/图标解析 |
| `packages/core/__test__/extension-market-fetch.test.ts` | 新建 | 本地 HTTP 索引：重定向、大小、保活缓存、并发 |
| `packages/core/__test__/extension-market-install.test.ts` | 新建 | 本地 git 仓库安装、哈希、替换、回滚、符号链接、路径逃逸 |
| `packages/core/__test__/extension-market-handler.test.ts` | 新建 | 路由契约、注入 reader、安装/卸载 |
| `apps/web/index.html` | 修改 | 静态 import map |
| `apps/web/src/lib/extension-runtime.ts` | 新建 | 挂四个全局 |
| `apps/web/src/lib/hub.ts` | 修改 | `startHub()` 首行调用 `installExtensionRuntime()` |
| `apps/web/src/lib/extension-market.ts` | 新建 | 市场行合并、匹配、读取 hook |
| `apps/web/src/components/extension-market.tsx` | 新建 | 市场区块、源表单、确认/移除对话框 |
| `apps/web/src/lib/extensions.ts` | 修改 | 接收 `cardSurface` 常量 |
| `apps/web/src/pages/extensions.tsx` | 修改 | 渲染市场区块，传未过滤的 entries；`cardSurface` 改为导入 |
| `apps/web/server.ts` | 修改 | 挂载 `createExtensionMarketHandler` |
| `apps/web/__test__/extension-runtime.test.ts` | 新建 | shim 漂移、import map、全局安装 |
| `apps/web/__test__/extension-market.test.ts` | 新建 | `marketRows`/`marketMatches` 纯逻辑 |
| `apps/web/__test__/e2e-server.ts` | 新建 | 测试专用服务器：注入市场 reader、静态页、隔离 home |
| `apps/web/__test__/fixtures/demo.counter/plugin.json` | 新建 | 端到端用的示例插件 manifest |
| `apps/web/__test__/fixtures/demo.counter/index.js` | 新建 | 标准 `import React` + `useState` 示例 |
| `docs/extensions.md` | 新建 | 扩展包、市场索引、标准 React、安全模型 |
| `README.md` | 修改 | 加一节简短说明并链接 `docs/extensions.md` |
| `D:\work-space\context-hub-extensions\**` | 新建 | 远程仓库结构（不在本仓库内） |

## 调用方、测试、fixture、配置、导出核对

- `parsePluginManifest`：直接定义 `packages/extensions/src/plugin.ts:104`，调用点 `:153`；其余是 `@context-hub/extensions` 的导出使用。拆分后 `plugin.ts` re-export，`packages/extensions/__test__/plugins.test.ts` 与 `packages/resources/mcp/__test__/plugin.test.ts` 的 import 不需要改。
- `PluginManifestFile`：只作为 `plugin.ts` 的返回/参数类型和公开导出；re-export 保持。
- `EXTENSION_API_VERSION`：只在 `packages/extensions/src/types.ts:12,285` 出现；re-export 后 `index.ts` 的星号导出不变。
- `isCompatible`：`packages/extensions/src/service.ts:18`、`plugin.ts:18` 从 `./types.ts` 导入；re-export 后不改调用方。
- `ExtensionCategoryId`：`apps/web/src/lib/extensions.ts:2,5,16` 等从 `@context-hub/extensions` 导入；re-export 保持。
- `createExtensionHandler`：调用点 `apps/web/server.ts:125`、`packages/core/__test__/bridge.test.ts:63`。`_runtime` 与路径加固由这两个测试文件覆盖。
- `createExtensionMarketHandler`：唯一生产调用点 `apps/web/server.ts`；`apps/desktop` 打包同一个 server，不需要改。
- `HubSettings`/`SettingsPatch`/`useSettings`：`packages/extensions/src/react.tsx:117` 与设置页只读字段，新增字段是加法；`packages/extensions/__test__/settings.test.ts:61-66,128-133` 的显式对象必须补 `extensionMarketUrl: ""`，否则会红。
- `extensions.market.*`：`packages/i18n/zh-cn/__test__/messages.test.ts` 会扫描 `locale-en.ts` 并要求中文表全覆盖；新增键必须两边同时加。
- `apps/web/index.html`：只有这一份入口；Vite dev、`apps/web/server.ts --static dist`、CLI 内嵌页面、桌面端都复用它。
- `EXTENSION_MARKET_ROUTE`：新增路由不在 `/hub/extensions` 下，不改变 `createRemotePluginSource` 或现有扩展文件的 URL。
- 配置/依赖：不新增依赖；不改 `pnpm-workspace.yaml`、`vitest.config.ts`、`pnpm-lock.yaml`；测试会落在已登记的 core/web/extensions 项目里。
- 当前工作树：`git status --short` 只有本计划文件未跟踪；当前分支是 `feat/plugins-tab-row`（主题不同）。实施前从当前 HEAD 新建 `feat/remote-extension-market`，不要把两个特性混在一个 commit。

## 阶段

依赖关系：阶段 1、2 可并行；阶段 3 依赖 2；阶段 4 依赖 1、2；阶段 5 依赖 1（并需要阶段 4 的 `handlers.ts` 改动完成后再动同一文件）；阶段 6 依赖 2、4 的接口；阶段 7 最后。没有任何阶段依赖后面才创建的文件。

### 阶段 0：新分支与任务列表

**执行目标**：从当前 HEAD 新建 `feat/remote-extension-market`；计划获批后按阶段建 `TaskCreate` 任务，开始时标 `in_progress`、验收通过后标 `completed`。

**改动文件**：无（git 操作与任务列表）。

**验收**：`git branch --show-current` 输出 `feat/remote-extension-market`；`git status --short` 只有本计划相关文件；任务列表与阶段一一对应。

**并行/串行**：最先执行。

### 阶段 1：拆分清单校验模块

**执行目标**：`parsePluginManifest` 及其常量/类型搬到一个无 React、无 lucide、无 Node API 的 core 模块；`@context-hub/extensions` 的公开 API 与行为不变。

**改动文件**

- 新建 `packages/core/src/extension-manifest.ts`：按「设计 2」搬移。
- 修改 `packages/core/package.json`：加 `"./extension-manifest": "./src/extension-manifest.ts"`。
- 修改 `packages/extensions/src/types.ts`：删除 `EXTENSION_API_VERSION`、`ExtensionCategoryId`、`ExtensionPermission`、`isCompatible` 的定义，改为从 core 导入并 re-export。
- 修改 `packages/extensions/src/plugin.ts`：从 core 导入 `PluginManifestFile`/`parsePluginManifest`，并 re-export；保留 React/lucide import 供 `discoverPlugins` 使用。
- 新建 `packages/core/__test__/extension-manifest.test.ts`：合法清单、id 不匹配、缺失字段、非空字符串、`apiVersion` 不兼容、未知 permission/category、`locked`、`defaultEnabled`、未知字段忽略。
- 修改 `packages/extensions/__test__/plugins.test.ts`：增加 `assertPluginId("_runtime")` 拒绝断言（为阶段 5 的冲突依据钉住）。

**验收**

```bash
pnpm --filter @context-hub/core test
pnpm --filter @context-hub/extensions test
pnpm --filter @context-hub/core typecheck
pnpm --filter @context-hub/extensions typecheck
pnpm --filter web typecheck
```

通过判据：上述命令全绿；`rg "react|lucide" packages/core/src/extension-manifest.ts` 无命中；`rg "parsePluginManifest|PluginManifestFile|EXTENSION_API_VERSION|isCompatible"` 的现有调用点无需修改；应用可启动。

**并行/串行**：可与阶段 2 并行；两者都改 `packages/core/package.json`，合并时把 exports 加在一起。

**风险**：re-export 造成重复导出或 `noUnusedLocals` 报错。逐个文件跑 typecheck，不等到最后。

### 阶段 2：定义市场索引格式

**执行目标**：索引格式、URL 规则、LocalizedText、图标解析、版本选择全部落到纯模块与测试；此时还没有网络和 UI。

**改动文件**

- 新建 `packages/core/src/extension-market.ts`：
  - `LocalizedText`、`ExtensionMarketIndex`、`ExtensionMarketPlugin`、`ExtensionMarketVersion`、`MarketSource`
  - `isMarketIndexUrl(text): string`（失败抛错，成功返回规范化 `href`）
  - `readMarketIndex(value: unknown, indexUrl: string): ExtensionMarketIndex`
  - `localized(text: LocalizedText, locale: string): string`
  - `recommendedVersion(plugin): ExtensionMarketVersion`（`versions[0]`）
  - 纯字符串/正则校验；base64 长度用算术计算，不 import `Buffer`。
- 修改 `packages/core/package.json`：加 `"./extension-market": "./src/extension-market.ts"`。
- 新建 `packages/core/__test__/extension-market-index.test.ts`：覆盖「设计 1」表格中的每条规则、相对图标解析、data URL 上限、未知成员忽略、错误路径、`localized` 的回退顺序。

**验收**

```bash
pnpm --filter @context-hub/core test
pnpm --filter @context-hub/core typecheck
pnpm --filter @context-hub/core lint
```

通过判据：测试逐条覆盖表格规则；`extension-market.ts` 不 import `node:*`、React 或 `@context-hub/extensions`；浏览器侧导入该模块不会拉起 Node 代码。

**并行/串行**：可与阶段 1 并行。

**风险**：字段过严会让发布索引变难。未知成员一律忽略，只有「会影响安装来源或列表展示」的字段才拒绝整份索引。

### 阶段 3：建立远程扩展仓库

**执行目标**：在 `D:\work-space\context-hub-extensions` 建出可发布结构、示例插件、哈希工具和第一版索引；本仓库只新增测试 fixture，不改实现代码。

**改动文件**

- 按「设计 7」创建远程仓库全部文件，包括 `plugins/demo.counter/src/index.tsx`、`tools/build-extension.mjs`（esbuild，react 系列 external）和提交的 `index.js` 产物。
- 新建 `apps/web/__test__/fixtures/demo.counter/plugin.json` 与 `index.js`：只包含运行所需文件，内容与远程仓库的同名文件一致；远程仓库可以额外带 `README.md`，其目录哈希以远程仓库实际内容为准。改动示例插件时必须同步这两份文件。

**验收**

- `node tools/hash-extension.mjs plugins/demo.counter` 与 hub 的 `folderHash` 对同一目录输出相同。验证命令（一次性，不提交脚本；在本仓库根执行，Node 24 的 type stripping 可直接跑 `.ts`）：

  ```bash
  node --experimental-strip-types --input-type=module -e \
    "import { folderHash } from './packages/core/src/host/folder-hash.ts'; console.log(await folderHash(process.argv[1]))" \
    "D:/work-space/context-hub-extensions/plugins/demo.counter"
  ```

  两行输出的十六进制必须相同；相同之后再把它写进 `marketplace.json` 的 `integrity`。
- `git log --oneline` 至少两次提交；`marketplace.json` 的 `source.commit` 等于第一次提交的完整 SHA，`source.path` 是 `plugins/demo.counter`。
- 用阶段 2 的 `readMarketIndex` 手工校验 `marketplace.json`（一次性 `node` 脚本，不提交；`indexUrl` 传 `https://example.test/marketplace.json`，只用于解析相对图标）。判据：无异常，且 `versions[0].integrity` 等于哈希工具输出。
- 本仓库 `git status --short` 不因阶段 3 产生变化（fixture 除外）。

**并行/串行**：依赖阶段 2 的格式定稿；与阶段 1、4、5 的文件不冲突，可并行。

**风险**：换行转换导致哈希不一致；提交不可达；远程 URL 未定。处理方式见「设计 3.2」「风险」。

### 阶段 4：实现宿主安装与市场路由

**执行目标**：宿主能读取/校验索引、从固定 commit 安装、校验哈希、原子替换、写入记录和启用状态、卸载；路由契约可被页面独立实现。

**改动文件**

- 新建 `packages/core/src/host/extension-market.ts`：按「设计 3」实现 `createMarketReader`、`fetchMarketIndex`、`installExtensionFromMarket`、`removeInstalledExtension`、`replaceDirectory`、`assertRegularTree`、状态读写。
- 修改 `packages/core/src/plugins.ts`：`EXTENSION_MARKET_ROUTE`。
- 修改 `packages/core/handlers.ts`：`createExtensionMarketHandler`；`sendExtensionFile` 以插件目录为根。
- 修改 `packages/core/package.json`：加 `"./host/extension-market": "./src/host/extension-market.ts"`。
- 修改 `apps/web/server.ts`：在 `createExtensionHandler(placed)` 之后挂 `createExtensionMarketHandler(placed)`。
- 新建 `packages/core/__test__/extension-market-fetch.test.ts`：本地 HTTP 服务（测试时传 `allowHttp: true, allowPrivate: true`）覆盖 200、404、3xx、超限、坏 JSON、缓存命中/过期/`refresh`、并发共享一次请求。
- 新建 `packages/core/__test__/extension-market-install.test.ts`：
  - 本地 git 仓库（`file://`，测试直接构造已校验的 `MarketIndex` 对象，绕过 URL 解析）：固定 commit 安装、`folderHash` 匹配、manifest id/version 匹配、记录写入、首次安装写 `true`。
  - 再次安装新 commit + 新哈希：替换成功、旧目录消失、启用值保持不变。
  - 错误哈希/manifest 不匹配/缺失入口/路径逃逸：目录不落盘、staging 清掉、旧版本仍在。
  - `replaceDirectory` 注入 rename：第二步失败时旧目录恢复；恢复失败时错误信息含 `.old-*` 路径。
  - 符号链接：在支持创建符号链接的平台断言拒绝；Windows 无权限时 `it.skip`，并在测试里写明原因。
- 新建 `packages/core/__test__/extension-market-handler.test.ts`：注入 reader；list/install/remove 契约；unknown action；GET 405；`/hub/extension-marketX` 404；install 的 id/version 不在索引中 400；客户端传入的 source 被忽略。
- 修改 `packages/core/__test__/bridge.test.ts`：增加扩展文件路径逃逸返回 404，普通文件仍 200。URL 解析器可能先归一化 `..`，所以同时直接断言 `resolveStoredFile(path.join(root, id), "../<other>/plugin.json")` 抛错；HTTP 侧至少覆盖 `%2e%2e` 编码变体与普通文件 200。

**验收**

```bash
pnpm --filter @context-hub/core test
pnpm --filter @context-hub/core typecheck
pnpm --filter @context-hub/core lint
pnpm --filter web typecheck
```

手工路由检查（隔离 home）：

```bash
HUB_HOME=$(mktemp -d)
node apps/web/server.ts --port 5281 --home "$HUB_HOME" &
curl -s -X POST http://127.0.0.1:5281/hub/extension-market \
  -H 'Content-Type: application/json' \
  -d '{"action":"list","url":"https://example.invalid/marketplace.json"}'
```

判据：返回 4xx `{ "error": "..." }`（该 URL 不可达），而不是 404/500；`curl -s -X GET ...` 返回 405；`curl -s http://127.0.0.1:5281/hub/extension-marketX` 返回 404。收尾只杀该 PID（不要按端口或进程名猜）。

**并行/串行**：依赖 1、2；与阶段 5 都要改 `packages/core/handlers.ts`，**不要同时进行**，建议先完成本阶段再进入阶段 5。

**风险**：git 按 SHA 抓取在最终远程主机上的行为；Windows rename 的 EBUSY；CRLF 哈希；状态文档并发。

### 阶段 5：接入标准 React 运行时

**执行目标**：插件入口里的 `import React from "react"`、`react/jsx-runtime`、`react/jsx-dev-runtime`、`react-dom` 在浏览器里解析到内核的实例；`_runtime` 路由不与插件 id 冲突；漂移有自动检查。

**改动文件**

- 新建 `packages/core/src/host/extension-runtime.ts`：四个 shim 源文本、`RUNTIME_FILES`、`runtimeSource`。
- 修改 `packages/core/package.json`：加 `"./host/extension-runtime": "./src/host/extension-runtime.ts"`，供 `apps/web/__test__/extension-runtime.test.ts` 导入。
- 修改 `packages/core/src/plugins.ts`：`EXTENSION_RUNTIME_DIR = "_runtime"`。
- 修改 `packages/core/handlers.ts`：`createExtensionHandler` 的 `_runtime` 分支（放在 id 解析之前）。
- 修改 `apps/web/index.html`：静态 import map。
- 新建 `apps/web/src/lib/extension-runtime.ts`：`installExtensionRuntime()`。
- 修改 `apps/web/src/lib/hub.ts`：`startHub()` 首行调用。
- 新建 `apps/web/__test__/extension-runtime.test.ts`：按「设计 4.3」。
- 修改 `packages/core/__test__/bridge.test.ts`：`GET ${EXTENSION_ROUTE}/_runtime/react.js` 返回 200 + `text/javascript` + shim 内容；`_runtime` 无文件名返回 404。

**验收**

```bash
pnpm --filter web test
pnpm --filter @context-hub/core test
pnpm --filter web typecheck
pnpm --filter @context-hub/core typecheck
pnpm --filter web build
grep -c 'type="importmap"' apps/web/dist/index.html   # 期望 1
node apps/web/server.ts --port 5281 --home "$(mktemp -d)" &
curl -s http://127.0.0.1:5281/hub/extensions/_runtime/react.js | head -3
```

判据：shim 返回 200 且包含 `__CONTEXT_HUB_REACT__`；漂移测试在当前 React 版本上绿；构建后的 `index.html` 保留 import map；收尾只杀本次 PID。

**并行/串行**：依赖阶段 1 的公开类型不变；与阶段 4 串行改 `handlers.ts`；与阶段 6 可并行（不同文件）。

**风险**：React 导出面漂移（测试兜底）；`react-dom` 只保证小集合；Vite 未来版本改变 import map 处理（端到端会抓到）；Node 与浏览器 `react-dom` 导出面不同（不做全量比较）。

### 阶段 6：实现市场页面

**执行目标**：`/extensions` 能配置索引源、读取市场、显示未安装/已安装/可更新行、打开安装确认、移除已安装文件，并提示刷新。

**改动文件**

- 修改 `packages/extensions/src/settings.ts`：`extensionMarketUrl` 字段、默认值、`readSettings`、`set` 比较。
- 修改 `packages/extensions/src/remote.ts`：`createRemoteExtensionMarket`。
- 新建 `apps/web/src/lib/extension-market.ts`：`marketRows`、`marketMatches`、`useExtensionMarket`。
- 新建 `apps/web/src/components/extension-market.tsx`：按「设计 6」。
- 修改 `apps/web/src/lib/extensions.ts`：接收从页面移出的 `cardSurface`。
- 修改 `apps/web/src/pages/extensions.tsx`：渲染市场区块，传未过滤的 `snapshot.entries`；`cardSurface` 改为从 `@/lib/extensions` 导入。
- 修改 `packages/extensions/src/builtin/locale-en.ts`、`packages/i18n/zh-cn/src/messages.ts`：新增键。
- 修改 `packages/extensions/__test__/settings.test.ts`：补 URL 字段用例与显式对象。
- 新建 `apps/web/__test__/extension-market.test.ts`：`marketRows` 的 available/installed/update、未过滤 entries、版本相同、索引里没有的已安装项不重排；`marketMatches` 的大小写/作者匹配。

**验收**

```bash
pnpm --filter @context-hub/extensions test
pnpm --filter web test
pnpm --filter @context-hub/zh-cn test
pnpm --filter @context-hub/extensions typecheck
pnpm --filter web typecheck
pnpm --filter @context-hub/extensions lint
pnpm --filter web lint
```

UI 验收（隔离 home）：

- 未配置 URL 时：`/extensions` 出现市场区块与索引地址输入框；输入 `http://…` 显示非法提示；输入合法 https 后保存，再刷新页面地址仍在（读 `<HUB_HOME>/state/settings.json`）。
- 有索引数据时的行、安装确认和移除交互在阶段 7 的测试服务器上验收；本阶段以 `apps/web/__test__/extension-market.test.ts` 的 `marketRows` 纯逻辑测试保证数据合并正确，不依赖阶段 7 才创建的文件。

**并行/串行**：依赖阶段 2 的类型与阶段 4 的路由契约；与阶段 5 可并行。

**风险**：同一状态两处读取（已安装版本、更新状态）必须只算一次（用 `MarketRow` 字段）；搜索时误用过滤后的 entries；浏览器内存 state 覆盖安装结果（已在设计 5/6 处理）；中文键缺失（zh 测试兜底）。

### 阶段 7：端到端验收、文档与 AOCI 收尾

**执行目标**：在隔离 hub home 和隔离浏览器 profile 里验证「标准 import React + useState」与市场列表/确认框；补齐文档；最后做一次 AOCI 维护。

**改动文件**

- 新建 `apps/web/__test__/e2e-server.ts`：测试专用入口，使用 `createHubServer` 挂载 `createStateHandler`、`createExtensionHandler`、`createWorkspaceHandler`、`createExtensionMarketHandler({ home, reader })`，静态根为 `apps/web/dist`。在静态根之前加一个 `/hub/` 兜底中间件：未被前面 handler 领取的 `/hub/*` 一律返回 JSON 404，避免 `createHubServer` 的静态回退把 `index.html` 当成 `/hub/skills` 之类的答案（否则 `skillStoreAvailable()` 会误判为真）。`reader` 返回内联 fixture：`demo.counter` v1.1.0（已安装 v1.0.0）+ `demo.other` v0.1.0（未安装），图标用 `data:` URL，source 用 `https://example.test/repo.git` + 40 位假 commit + 64 位假 integrity。该文件不以 `.test.ts` 结尾，不会被 vitest 收集。
- 使用阶段 3 已建的 `apps/web/__test__/fixtures/demo.counter/**` 作为端到端示例插件。
- 新建 `docs/extensions.md`：扩展包结构、manifest、标准 React 导入与 external 配置、`_runtime` 与全局、市场索引格式、安装位置与启用、安全模型（第一方/可信、无签名、权限只展示）、限制。
- 修改 `README.md`：加「Remote extension market」小节并链接 `docs/extensions.md`。
- 远程仓库 `README.md` 在阶段 3 已完成，本阶段只校对与代码一致。

**端到端验收步骤**

```bash
pnpm --filter web build
HUB_HOME=$(mktemp -d)          # Git Bash 下给 Node 传绝对路径时可用 cygpath -w 包一层
WORKSPACE=$(mktemp -d)
# seed：复制 fixture 到 $HUB_HOME/extensions/demo.counter
# seed：写 $HUB_HOME/state/extensions.json = {"demo.counter": true}
node apps/web/__test__/e2e-server.ts --port 5281 --home "$HUB_HOME" --folder "$WORKSPACE" &
```

测试服务器也接受 `CONTEXT_HUB_HOME`（`resolveHubHome` 的既有行为）；用 `--home` 只是让本次进程的隔离根一眼可见。

然后用 headless Edge + CDP（`docs/memory.md` 的方法）：

```bash
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
"$EDGE" --headless=new --disable-gpu --remote-debugging-port=9333 \
        --user-data-dir="$HUB_HOME/profile" --no-first-run about:blank &
```

探针脚本用 Node 全局 `WebSocket`，点击必须用 `Input.dispatchMouseEvent`，不要用 `element.click()`。断言：

1. 打开 `/extensions`，`window.__CONTEXT_HUB_REACT__` 存在且 `typeof useState === "function"`。
2. header 里的 `[data-testid="demo-counter"]` 文本是 `count: 0`；真实鼠标点击后变成 `count: 1`。这证明 import map + `_runtime/react.js` + `useState` 全部生效。
3. 配置 `https://example.test/marketplace.json`（宿主注入的 reader 忽略实际 URL）；市场区出现 `demo.counter`（已安装、可更新）与 `demo.other`（可安装）。
4. `demo.other` 行有 `<img>` 且 `src` 是 fixture 的 data URL；`demo.counter` 行是 manifest 图标的 `<svg>`。
5. 点 `demo.other` 的安装：确认框文本包含 `0.1.0`、`https://example.test/repo.git`、commit 与 integrity；关闭后 `<HUB_HOME>/extensions/demo.other` 不存在（浏览器端到端只验证到确认，因为真实安装需要可达的 https git 源；安装写盘由阶段 4 的 handler 测试覆盖）。
6. 收尾：杀掉本次启动的 server/Edge PID；删除 `$HUB_HOME`/`$WORKSPACE`；`git status --short` 无测试残留；对比 `stat -c '%Y' ~/.context-hub` 前后不变（目录不存在时记录 `missing`），证明没有写真实用户目录。

**文档验收**

- `docs/extensions.md` 里的每条命令都能直接复制运行；索引字段表与阶段 2 的校验器一致；标准 React 的 external 配置示例与 shim 的实际导入面一致。
- `README.md` 只在入口处链向 `docs/extensions.md`，不重复整篇内容。

**AOCI 收尾**

- 先确认树是静的：`find packages apps docs -newermt "-20 minutes" -type f -not -path "*/node_modules/*"`，出现不属于本次任务的文件就停下问用户。
- 对所有受管对象达到最终稳定状态后只调用一次 `aoci_maintain`；对返回的候选逐条基于证据写 F/R/A/S，用 `aoci_update_entry` 提交。
- FRAS 上限按 `docs/memory.md` 的表格先用脚本量（A ≤ 6、F ≤ 160 字、R ≤ 8、S 按 C 分档），不要凭记忆。
- 预计需要更新的条目：`packages/core/src/plugins.ts`、`packages/core/src/extension-manifest.ts`、`packages/core/src/extension-market.ts`、`packages/core/src/host/extension-market.ts`、`packages/core/src/host/extension-runtime.ts`、`packages/core/handlers.ts`、`packages/extensions/src/types.ts`、`packages/extensions/src/plugin.ts`、`packages/extensions/src/settings.ts`、`packages/extensions/src/remote.ts`、`apps/web/index.html`、`apps/web/src/lib/hub.ts`、`apps/web/src/pages/extensions.tsx`、`apps/web/server.ts`、`docs/extensions.md`。
- 用户确认完成后，把本计划移到 `docs/plans/archive/`。

**验收**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter web build
```

通过判据：全绿；端到端 6 条断言全部通过；AOCI maintain 后无未处理候选或明确记录未覆盖项。

**并行/串行**：依赖 3、4、5、6；串行最后执行。

**风险**：端到端端口/进程清理；AOCI 与其它 session 并发；真实网络不可用（测试服务器注入 reader，不依赖外网）。

## 测试计划

| 测试文件 | 覆盖 |
|---|---|
| `packages/core/__test__/extension-manifest.test.ts` | 清单校验行为保持、unknown 字段、id/版本/权限/分类 |
| `packages/core/__test__/extension-market-index.test.ts` | 索引每条规则、LocalizedText、图标解析、错误路径 |
| `packages/core/__test__/extension-market-fetch.test.ts` | 重定向、超时/大小/UTF-8/JSON、缓存、并发共享 |
| `packages/core/__test__/extension-market-install.test.ts` | 本地 git 固定 commit、哈希、manifest、原子替换、回滚、符号链接、路径逃逸、启用状态 |
| `packages/core/__test__/extension-market-handler.test.ts` | 路由契约、注入 reader、安装/卸载、405/404/400 |
| `packages/core/__test__/bridge.test.ts` | `_runtime` 路由、扩展文件路径逃逸、既有路由 |
| `packages/extensions/__test__/settings.test.ts` | `extensionMarketUrl` 读取/写入/无变化 |
| `packages/extensions/__test__/plugins.test.ts` | `_runtime` 不是合法 id |
| `apps/web/__test__/extension-runtime.test.ts` | shim 导出面漂移、import map、全局安装 |
| `apps/web/__test__/extension-market.test.ts` | `marketRows`/`marketMatches` |
| `packages/i18n/zh-cn/__test__/messages.test.ts` | 新键的中文覆盖（既有测试） |
| `apps/web/__test__/e2e-server.ts` + 临时 CDP 探针 | 标准 React 渲染/useState、市场列表/确认框、隔离目录 |

不在自动化测试里覆盖、需要手工或后续确认的：

- 最终远程主机（GitHub/GitLab）对 `fetch <url> <commit>` 的支持；用「待验证」命令在 URL 确定后跑一次。
- 真实 https git 源安装到浏览器环境的完整链路；浏览器端到端停在确认框，写盘由 handler 测试覆盖。
- Windows 真实 EBUSY 锁下的 rename 重试；回滚逻辑用注入 rename 覆盖，真实锁行为由端到端/手工观察。
- 桌面端与 CLI 打包后的页面加载；它们复用同一份构建产物，本计划不改打包配置，但发布前应在桌面端打开一次 `/extensions` 验证 import map。

## 端到端验收（汇总）

见阶段 7。三条硬判据：

1. 示例插件用标准 `import React, { useState } from "react"`，在构建后的页面里渲染并通过真实鼠标点击完成状态更新。
2. 市场列表能区分未安装/已安装/可更新，未安装行使用索引头像，已安装行使用 manifest 图标；安装确认框显示固定 commit 与 integrity。
3. 整个验收只使用临时 `--home`/`--folder`/浏览器 profile；`~/.context-hub`、`~/.claude` 的 mtime 不变；收尾只杀本次 PID。

## 风险与回滚

| 风险 | 影响 | 处理 |
|---|---|---|
| `git fetch --depth 1 <url> <commit>` 在最终主机上拒绝不可达 SHA | 安装失败 | 发布流程 commit 必须在分支历史上；错误原样带回 git 输出；URL 确定后先跑待验证命令。 |
| CRLF/`.gitattributes` 改变检出字节 | integrity 不匹配 | 固定 `core.autocrlf=false`、`core.eol=lf`；发布仓库避免强制换行转换；哈希不匹配即拒绝。 |
| Windows 目录 rename EBUSY/EPERM | 更新失败或旧目录暂时消失 | 可重试错误退避；两步 rename + 回滚；失败信息给出 `.old-*` 路径。 |
| 崩溃发生在两次 rename 之间 | 插件目录暂时缺失 | `.old-*` 仍在磁盘、`list()` 不可见；重新安装可恢复；不自动删除旧目录。 |
| 浏览器内存 state 覆盖安装写入的启用值 | 安装后仍显示未启用 | 首次安装后页面同步内存 state；更新不写状态；最后写入者胜出仍写进风险。 |
| React/shim 导出面漂移 | 插件命名导入失败 | 漂移测试；新增 React 版本时测试先红。 |
| `react-dom` 只保证小集合 | 插件使用其它命名导出失败 | 文档写明；插件应通过 `ctx.ui` 使用组件。 |
| Vite 未来改变 import map 处理 | 标准 import 失效 | 构建后检查 `dist/index.html` + 端到端点击；失败时退回「插件用 ctx.react」。 |
| 索引/扩展体积过大 | 宿主内存或磁盘压力 | 索引 2 MiB、图标 32 KiB、插件 5000 文件/64 MiB。 |
| 索引内容是不可信文本 | XSS/钓鱼 | 只按纯文本渲染；不渲染 HTML；显示固定 commit 与 source；权限只展示；不做签名（明确告知）。 |
| 私有/内网索引被 `isPublicHostname` 拒绝 | 内网仓库不可用 | 第一期只支持公网 https；需要内网时单独放开并审计。 |
| 两个标签页同时安装/卸载 | 最后写入者胜出 | 宿主串行化自身安装；跨标签页并发作为已知限制记录。 |

回滚方式：去掉 `apps/web/server.ts` 的市场 handler 挂载、`index.html` 的 import map 和页面市场区块；设置字段可以保留（无消费者）或一起回退。已安装的插件文件仍在 `<home>/extensions`，可用文件系统或卸载动作删除；import map 回退后，依赖标准导入的插件不再加载，但使用 `ctx.react` 的插件不受影响。

## 待验证事项

- `git fetch --depth 1 <https-url> <commit>` 对最终远程主机可用。验证命令（URL 确定后执行）：
  ```bash
  TMP=$(mktemp -d)
  git init --quiet "$TMP"
  git -C "$TMP" fetch --depth 1 --no-tags <URL> <COMMIT>
  git -C "$TMP" rev-parse FETCH_HEAD   # 必须等于 <COMMIT>
  ```
- 构建后的 `dist/index.html` 保留 import map，且浏览器按它解析插件模块；阶段 7 的 CDP 断言是最终判据。
- 示例插件在最终远程仓库的 `integrity` 与本仓库 `folderHash` 一致；阶段 3 用远程插件目录对比。
- React 版本升级后 shim 导出面是否漂移；`apps/web/__test__/extension-runtime.test.ts` 会先红。

## 需要拍板的遗留点

1. **远程仓库 URL**：最终 push 到哪个 HTTPS 主机、仓库是否公开。计划先用本地 `git init` + commit，`source.url` 用占位符；URL 确定后替换并验证 git 抓取。
2. **自动启用**：计划采用「首次安装写 `true`、更新保留原值、卸载删键」。如果希望安装后保持禁用，改 UI 文案与宿主写入逻辑即可。
3. **市场区块位置**：计划放在 `/extensions` 搜索框之后、分类区块之前；如果希望放在分类之后，只改 `extensions.tsx` 的渲染顺序。
4. **内网索引**：计划沿用 `/hub/net` 的「只允许公网主机」策略；如果第一期就需要内网 GitLab 索引，需要单独放开 `isPublicHostname` 并说明风险。
5. **索引图标直连**：未安装行的 `<img>` 由浏览器直接请求索引给出的 URL，会暴露用户 IP；计划接受这一点，因为它与普通网页图片一致。若要避免，需要增加宿主代理路由（不在第一期）。
6. **更新判定**：计划只比较版本字符串是否不同，不解析 SemVer；如果以后要「只在更高版本时提示更新」，需要引入 SemVer 解析或要求索引按版本降序排列并只取第一条（当前已是第一条）。
7. **启动时清理 `.old-*`/`.staging-*`**：计划不自动清理，只在失败信息里给出路径；如果希望自动清理，需要决定保留时长。
8. **市场区是否重复显示已安装项**：计划在索引列表里保留已安装行（显示「已安装」徽章），与上方已安装分类区块重复。如果希望市场区只显示 `available`/`update`，改 `marketRows` 的过滤一行即可。

## 自审

- 每个阶段都有可执行的命令或可观察结果；没有「验证一下」这类表述。
- 依赖顺序：1/2 可并行；3 依赖 2；4 依赖 1、2；5 依赖 1 且与 4 串行改 `handlers.ts`；6 依赖 2、4；7 最后。没有阶段依赖后创建的东西。
- 调用方/测试/fixture/配置/导出已逐项核对；特别标出了 `settings.test.ts` 的显式对象、zh 文案覆盖测试、`apps/web/server.ts` 的挂载点、`apps/desktop` 复用同一 server、`pnpm-workspace.yaml` 不纳入远程仓库。
- 没有把猜想写成事实：git 按 SHA 抓取对最终主机的行为、Vite import map 的长期行为、Windows 真实 EBUSY 都标为待验证/风险，并给出验证命令或端到端判据。
- 范围没有超出用户请求：「不做」列表覆盖签名、沙箱、npm 源、自动更新、运行时注册、多索引、搜索分页、桌面打包改动等顺手项。
- 现有工作树只有本计划文件未跟踪；当前分支主题不同，实施前新建 `feat/remote-extension-market`。

## 实施调整（2026-10-19）

- **新增本地市场源**：设置里的索引地址除 HTTPS URL 外，也接受绝对目录或 `.json` 文件路径。原因是第一期只有远程 HTTPS 时，没有可发布的 host 就无法自测。实现：`isLocalMarketPath` / `isMarketSource`；host 的 `fetchMarketIndex` 增加本地读取分支；本地索引允许 `source.url` 为绝对仓库路径（`readMarketIndex` 的 `allowLocalGit`），仍然走完整的 `git fetch <path> <commit>`、目录哈希和原子替换。
- 本地索引的 `icon` 仍必须是 data URL 或 HTTPS URL；相对图标在本地索引里会被拒绝，因为浏览器读不到本地文件。
- 远程仓库新增 `plugins/demo.other`，用于端到端验证“未安装 → 确认 → 真实安装 → 刷新后已安装”的完整链路。`marketplace.json` 当前指向本地 checkout（`D:/work-space/context-hub-extensions`），发布前替换为 HTTPS URL。
- 端到端探针保留为 `apps/web/__test__/e2e-probe.ts`（不是 `.test.ts`，不被 vitest 收集），与 `e2e-server.ts` 一起可重复运行。
- 页面文案与表单校验同步支持本地路径；`sourceInvalid` 改为“https 地址或本地目录”。
- **市场条目并入目录页**（2026-10-19 修正）：不再有独立的“扩展市场”区块、安装确认 Dialog 或移除 Popover。市场索引里未安装的插件转换成目录行，进入现有分类、搜索和 `ExtensionDetailDialog`；底部按钮对未安装条目执行下载 + `discoverPlugins({ ids })` + `ctx.extensions.add`，对已启用条目执行 `ctx.extensions.toggle`，全程不刷新页面。卸载沿用内核语义：停用并撤回贡献，文件保留。
- 市场索引的每个版本增加 `apiVersion`，用于在未安装时构造目录行和过滤兼容性。
