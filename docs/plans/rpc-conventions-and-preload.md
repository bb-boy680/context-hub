# 桥的检查网 → 统一 RPC 约定 → 启动预加载与共享状态

**状态**：进行中。P0 已完成，阶段 A 起。

本文档的**上一版写作时 HEAD 是 `75cf7a4`**，此后仓库经历了目录按领域分组重命名
（`@workspace` → `@context-hub`）、后端从 Vite 插件抽成 `createHubServer`、
贡献点变成服务、以及 **27 个自制 `check-*.ts` 全部迁入 vitest**。
用户要求重新调研后再动，所以下面第一节是**重新调研后仍然成立与已经不成立的前提**，
旧版里那节「开始前必须核对」已被它取代。

---

## 一、这次重新调研改了什么结论

| 旧文档里的说法 | 现在的实际 |
|---|---|
| "四套约定共 1205 行"（skills 481 / plugins 389 / prompts 207 / mcp 128） | skills 726（handler 453 + 客户端 273）、plugins 397、mcp 412、prompts 275。**另外 core 的 6 条路由是第五套**，旧文档没算 |
| "prompts 是纯 REST" | 只剩 `/<id>` 那一族（`PATCH`/`DELETE`/`/source`/`/assets`），其余是 `POST /hub/prompts` |
| "prompts 的语义已变，动手前要重读" | **仍然成立**：`name` + 不透明 `id` + `PromptPage{items,total,tags,root}`（`packages/resources/prompts/src/store.ts:30-95`） |
| "统一约定的收益是让载体只有一条代码路径" | 仍然错。载体看到的是 `(request,response,next)`，四套对它零成本。真实收益只有两条：加 action 的人不用先学这个模块用哪套；检查网不用为每个模块特判 |
| "store 归插件自己（它知道传输），调度归 form" | **反了**。知道传输的是 **form**：`hub.skills` / `hub.prompts` 由 `apps/web/src/lib/hub.ts:165,168` 注册，四个插件一个都没注册过 |
| "四个 hook 各自持 generation ref" | skills / prompts / mcp 有，**plugins 没有**（`packages/resources/plugins/src/library.ts:444-492`），并发 `read()` 会互相覆盖 |
| "桥的检查脚本 `packages/*/scripts/check-bridge.ts`" | 现在是 vitest，检查网写在 `__test__/` 下 |
| "prompts 有 GET 写盘" | **错**。`list()`（`src/host/prompts-fs.ts:250-260`）纯读 |
| "plugins 的 `describe` 名义读、实际写" | 对，但它**已经是 POST**（`packages/resources/plugins/handlers.ts:311-321`） |

**仍然成立的一条（最重要）**：`apps/web/src/lib/hub.ts:172` 的 `void workspaces.refresh()`
不 await；`ExtensionService.start()` 是**串行 await**（`packages/extensions/src/service.ts:135-142`）。
所以预加载只能在 `kernel.start()` **之后**并发开火且不 await，而且必须自己等 workspace 落地。

## 二、这次新查出来的事实

- **`startsWith` 派发有洞**：skills / prompts / plugins / core 都用 `url.pathname.startsWith(ROUTE)`，
  于是 `/hub/skillsXYZ` 被当成 id=`XYZ`；`/hub/stateX` 被当成文档名 `X`。只有 mcp 用精确相等。
- **prompts 的路径只切两段**（`prompts/handlers.ts:59`），`/<id>/files/a/b` 的第三段被静默丢弃。
- **`decodeURIComponent` 在 `try` 之外**（skills `handlers.ts:91`、prompts `:60`）：
  `GET /hub/skills/%E0%A4%A` 今天抛 `URIError` 冲出 middleware，被载体接成 **500**（`host/server.ts:114-119`），
  而不是 400 `{error}`。
- **plugins 的 GET 从 query 读 action、非 GET 只从 body 读**，query 上的 action 对 POST 无效。
- **`GET /hub/skills/<id>/update` 每次调用都写盘并起子进程**：`handlers.ts:379` →
  `host/skills-fs.ts:773 checkUpdate` → `:788 recordChecks` → `:415 mutate` → `:336 saveCatalog`
  （写 `<home>/skills/catalog.json`），途中 `askSources` 还会走网络。同模块的复数版
  `check-updates` 是 POST（`handlers.ts:285`）——单数版是 GET 是漏改。
- **`loadCatalog()` 首次调用会建索引**（`host/skills-fs.ts:344-351`）：这是**进程内一次**、
  幂等、内容与「文件系统现在是什么」一致，**保留**，加注释说明即可。
- **资产上传四种编码**：skills / prompts 裸字节；plugins 是 JSON 里塞 data URL 数组；
  mcp 没有上传。`readSource`（`core/src/assets.ts:87-110`）是唯一统一的一层。
- **错误体三种**：`sendError` 只有 skills / prompts / mcp 用；plugins 与 core 手写
  `sendJson(400,{error})`（core 有 12 处）；405/404 到处是**空 body**；plugins 有全仓唯一的 502。
- **mcp 客户端把 `{error}` 丢掉**（`mcp/src/probe.ts:207` 只报状态码）——六个 `call` 里唯一一个。
- **`extensions/changed` 能从插件 ctx 收到**（实测：child ctx 上 `ctx.on` 注册的监听会收到 root emit）。
  这条决定了 catalog 可以自己订阅它，而不必让 hook 代劳。
- **`base` 在两个 remote-store 里含义不同**：`createRemoteSkillStore(base = "")` 的 `base` 是
  **源前缀**，`createRemotePromptStore(base = PROMPT_ROUTE)` 的 `base` 是**路由本身**。
  统一 helper 时最容易在这里踩错。
- **四个「探活读」只看状态码**：`apps/web/src/lib/hub.ts:97`（`GET /hub/skills?limit=0`）、
  `:108`（`GET /hub/prompts`）、`apps/web/src/lib/place-files.ts:14`（`POST {action:"workspace"}`）、
  `mcp/src/probe.ts:187`（`GET /hub/mcp`）。它们一旦不再返回 2xx，对应页面会**静默降级**
  而不是报错——这是阶段 B 最容易出的错。

### 上一轮遗留：plugins 的测试没被根配置收集（P0，已修）

`packages/resources/plugins/vitest.config.ts` 存在，但不在根 `vitest.config.ts` 的
`projects` 列表里，所以从根跑的 `pnpm test` 跳过它的三个文件（含 136 个用例的
`library.test.ts`）。已补上并实测：**29 个文件 / 792 个用例 / 15.3 秒**。

### 为什么阶段 A 必须最先

现有 29 个测试文件里**没有一个 import 过那四个客户端工厂**
（`createRemoteSkillStore` / `createRemotePromptStore` / `createRemoteProbe` /
`createRemotePluginTools`），也没有一个碰过 HTTP handler——它们全部测的是宿主侧逻辑。
唯一挂真服务器的是 `core/__test__/server.test.ts`，它挂的是**假** middleware。
也就是说阶段 B 要改的那一层今天**完全没有断言**。

`docs/memory.md:197` 记的就是这类事故的成品：客户端发 `?action=files&id=<name>`，
handler 读 `searchParams.get("name")`，每次 400 而面板 `catch` 掉后渲染空树——
"这个功能没工作"和"这个包没数据"长成同一个现象，坏了很久没人发现。

## 三、用户已定的口径

1. **阶段 B 范围**：四条资产桥 + **core 里"带 action"的三条**（workspaces / place-files / net）。
   裸字节路由（`/hub/files`、`/hub/extensions/<id>/<file>`）与 `/hub/state` **保持路径形态**，
   但**失败体也统一成 `{ error }`**。
2. **catalog 落点**：**插件在 `apply` 里构造并发布**（构造不发请求）；**form 只负责调度**
   ——`kernel.start()` 之后并发 `load()`。
3. **依赖按原计划三个都加**：`immer` / `use-sync-external-store` / `use-immer`。
4. 预加载范围不变：全部启动时加载，含 MCP 的 probe 与 plugins 的安装器探测两档。
5. Ctrl+K 面板**不接**真实数据。
6. 不引入 React Provider；状态走 kernel 服务。

---

## 阶段 A：桥的检查网（安全网，必须最先）

**状态：完成。** 六份 `__test__/bridge.test.ts` 全部落地，`pnpm test`
**35 个文件 / 874 个用例**（15.3 秒 → 19.6 秒），typecheck 11/11、lint 11/11、build 通过。

| 文件 | 覆盖 | 提交 |
|---|---|---|
| `packages/resources/prompts/__test__/bridge.test.ts` | 7 条调用 | `c051262` |
| `packages/resources/mcp/__test__/bridge.test.ts` | 探活 + 记录 + 缓存 + 探测 | `0a16867` |
| `packages/resources/plugins/__test__/bridge.test.ts` | 12 条调用 + 安装器工具集 | `0927395` |
| `packages/core/__test__/bridge.test.ts` | state / files / extensions / net | `f971da5` |
| `apps/web/__test__/bridge.test.ts` | place-files / workspaces | `4b79c22` |
| `packages/resources/skills/__test__/bridge.test.ts` | 22 条调用 | `b254d22` |

**自证（五份各做一次，都变红并指名了原因）**：prompts 的 `?ref=` 改 `?reference=`；
mcp 的 `records` 改 `entries`；plugins 的 `path` 改 `directory`；core 的 `asked.url`
改 `asked.target`；web 的 `/rename` 改 `/renamed`；skills 的 `path` 改 `file`。

### 这张网第一次跑就抓到的四件事（都是既存缺陷，都已修）

1. **`startsWith` 派发在九条路由上都漏**：`/hub/skillsXYZ` 被读成 id=`XYZ`、
   `/hub/stateX` 被读成文档名 `X`、`/hub/workspacesX` 被读成工作区 `X`，
   而 **plugins 那条更重：`/hub/pluginsX` 直接答 200 整个库**（action 在 query 里，
   游荡路径读成了默认动作）。九处守卫统一换成 `under()`（要求分隔符），
   解码移进 `try`（畸形百分号从载体的 500 变成 400）。实测九条都落到 404。

2. **`check-update` 对本地收来的包是正当拒绝**（"this source cannot be asked about"）——
   它没有可问的来源。检查里如实断言成"拒绝"，而不是当成失败。

3. **place 的 `dir` 是相对 scope 根的目录，不是绝对路径**（`host/place-skills.ts`）。
   这条对**测试安全**是硬的：工作区 place 会解析进宿主自己的文件夹，
   把宿主留在默认值（进程 cwd → 仓库根）就会**往被测的仓库里写链接**。
   skills 的夹具因此显式 `folder` 指向临时目录。

4. **客户端的 `base` 参数现在六个客户端一致**：新增 `createRemoteProbe` /
   `createRemoteRecords` / `createRemotePluginTools` / `createRemotePlaceFiles` /
   `createRemoteWorkspaceService` 的 `base = ""`（`createRemoteSkillStore` 与
   `createRemotePromptStore` 本来就有）。理由与那条现成的一样：不同源也要能驱动同一份客户端。

### 顺带的结构改动

- `apps/web` 的测试拿到**自己的 tsconfig 程序**（`tsconfig.test.json`，
  `types: ["node", "vite/client"]`），`tsconfig.app.json` 的 `include` 缩回 `["src"]`。
  测试要同时够到应用的浏览器代码与 hub 的 Node 侧模块，而应用那份程序是**故意只给浏览器**的
  ——为了让它编译过去而加 `types: ["node"]`，等于让 `process` / `Buffer` 在 Vite 不 polyfill
  的浏览器源码里通过类型检查。

---

## 阶段 B：统一 RPC 约定

### 目标，七行

```
读（参数都是标量）   GET  <route>?action=<name>&<params>      裸 GET = 该模块默认读
读（参数是结构化对象） POST <route>  body { action, ... }
写                    POST <route>  body { action, ... }
身份读                GET  <route>/<id>
裸字节下载            GET  <route>?action=<name>&<params>      响应不是 JSON
裸字节上传            POST <route>?action=<name>&<id>&<name>   请求体不是 JSON，参数只能进 query
失败                  4xx + { error: string }                  （不再有空 body）
```

**第 2 行不是糖**：`net` 的 `headers`、`mcp` 的 `declaration`、`place-files` 的 `ref`
三个对象没有合理的 query 表示法，写成 GET 只会逼出「URL 里塞 JSON」。

### 三条命名决策（先说清，因为跨模块）

- **新起的 action 名**（路径段原本没有名字）：`check-update`、`file`、`write-file`、
  `create`、`update`、`remove`、`update-from-upstream`、`add-asset-source`、
  `put-asset`、`delete-asset`、`fetch`（net）。
- **已有的 query action 名一个不改，参数名一个不改**（`place` / `place-skill` / `place-file` /
  `tags` / `package` / `refresh` / `check-updates` / `install` / `import` / `install-place` /
  `adopt-place` / `delete-place` / `remove-place`）。
- `update` = 改字段，`update-from-upstream` = 装上游，对齐 `SkillStore.update` /
  `SkillStore.updateFromUpstream`。**代价**：plugins 的 `update`（`handlers.ts:273`）是装上游，
  同名不同义。不换名字，因为 `store.ts` 是两端的共同语言。

### 留在路径形态的，只有两类

**（a）`GET <route>/<id>` —— 身份读，留。**
`id` 是「某个东西」的地址，不是一个操作；skills 的 id 本身就是目录名。
折成 `?action=get&id=` 只会造出一个内容等于 id 的假动作，而且今天
`GET /hub/skills/<id>` 是全仓唯一能被 curl 或书签指向**单个资源**的地址。

**（b）裸字节的两条 —— 它们不是路径形态，是信封的两个例外。**
- `?action=raw`（plugins）：留 action、留 GET，只让**响应不是 JSON**。插件封面就靠它当
  `<img src>` 前缀（`library.ts:159-166` 的 `packImageBase`）；塞进 JSON 要 base64，体积涨 1/3 且 `<img>` 用不了。
- `?action=put-asset&id=&name=`（skills、prompts）：**请求体就是 File**，所以
  `action` / `id` / `name` 只能进 query。这是全仓唯一「参数不在 body 里的写」。

**降为 action 的**：`/<id>/files/<path>`、`/<id>/assets`、`/<id>/source`、`/<id>/update`。
`/<id>/files/<path>` 看起来最该留，实际最该折，四条理由：
名字里一个 `%2F` 解码后与真分隔符无法区分（先按 `/` 切再逐段解码、又 `tail.join("/")` 重拼）；
客户端**根本没编码**（`skills/src/remote-store.ts:114,120` 直接插 `${file}`，
`extensions/src/remote.ts:35` 用了正确写法而这里漏了），带 `#`/`?`/空格的文件今天就是坏的；
同模块内 `place-file` 已经是 `&id=&path=` 这个形态，折进去让 skills 内部一致；
写的那一半（`write-file`）全仓没有调用者，折掉它同时消掉全仓最后一个非 POST 的写动词。

### 逐条目标表

**skills**（`SKILL_ROUTE = /hub/skills`）

| 现在 | 改成 | 参数来源 |
|---|---|---|
| `GET ?action=place&scope&dir` | 不变 | query |
| `GET ?action=place-skill&id&scope&dir` | 不变 | query |
| `GET ?action=place-file&id&path&scope&dir` | 不变 | query |
| `GET ?action=tags` | 不变 | — |
| `GET ?action=package&source` | 不变 | query |
| 裸 `GET ?offset&limit&q&tag&enabled&source&sort` | 不变 | query |
| `GET /<id>` | 不变 | path |
| **`GET /<id>/update`**（写盘 + 起子进程） | **`POST {action:"check-update", id}`** | body |
| `GET /<id>/files/<path>` | `GET ?action=file&id&path` | query |
| `POST ?action=refresh` | 不变 | — |
| `POST ?action=check-updates` | 不变 | — |
| `POST ?action=install` body`{source,skills}` | `POST {action:"install", source, skills}` | body |
| `POST ?action=import` body`{skills}` | `POST {action:"import", skills}` | body |
| `POST ?action=install-place` body`{id,scope,dir}` | `POST {action:"install-place", id, scope, dir}` | body |
| `POST ?action=adopt-place` | `POST {action:"adopt-place", …}` | body |
| `POST ?action=delete-place` | `POST {action:"delete-place", …}` | body |
| `POST ?action=remove-place` | `POST {action:"remove-place", …}` | body |
| 裸 `POST` body=draft | `POST {action:"create", name, description, tags}` | body |
| `PATCH /<id>` body=patch | `POST {action:"update", id, description?, tags?, enabled?}` | body |
| `DELETE /<id>` | `POST {action:"remove", id}` | body |
| `POST /<id>/update` | `POST {action:"update-from-upstream", id}` | body |
| `POST /<id>/source` body`{source}` | `POST {action:"add-asset-source", id, source}` | body |
| `POST /<id>/assets?name` 裸字节 | `POST ?action=put-asset&id&name` 裸字节 | query + 裸 body |
| `DELETE /<id>/assets?ref` | `POST {action:"delete-asset", id, ref}` | body |
| `PUT /<id>/files/<path>` body=text | `POST {action:"write-file", id, path, text}` | body |

**plugins**（`PLUGIN_ROUTE = /hub/plugins`）——已经就是目标约定，只有三处要动：

| 现在 | 改成 |
|---|---|
| `GET ?action=list`（裸 GET 亦可） | 不变（`handlers.ts:129` 已容忍 `action === null`） |
| `GET ?action=files / file / contents / raw` | 不变 |
| `POST {action:"root"}` | `GET ?action=root` |
| `POST {action:"program-exists", program}` | `GET ?action=program-exists&program` |
| 非 GET/POST → 405 空 body | 405 `{error}` |
| 其余十二个 POST action | 不变 |

**prompts**（`PROMPT_ROUTE = /hub/prompts`）——改完**路径段归零**，
`handlers.ts:59` 那个两段解析连同「第三段被静默丢弃」一起消失：

| 现在 | 改成 |
|---|---|
| 裸 `GET /hub/prompts` | 不变 |
| `POST` body=`{name,description,prompt,tags}` | `POST {action:"create", name, description, prompt, tags}` |
| `PATCH /<id>` body=patch | `POST {action:"update", id, name?, prompt?, description?, tags?}` |
| `DELETE /<id>` | `POST {action:"remove", id}` |
| `POST /<id>/source` `{source}` | `POST {action:"add-asset-source", id, source}` |
| `POST /<id>/assets?name` 裸字节 | `POST ?action=put-asset&id&name` 裸字节 |
| `DELETE /<id>/assets?ref` | `POST {action:"delete-asset", id, ref}` |

**mcp**（`MCP_ROUTE = /hub/mcp`）

| 现在 | 改成 |
|---|---|
| 裸 `GET /hub/mcp` → `{ok:true}` | **不变**（探活；让它去读 records 文件会把"文件坏了"误判成"没有宿主"，probe 功能整体消失） |
| `POST {action:"records"}` | `GET ?action=records` |
| `POST {action:"cache", names}` | `GET ?action=cache&names=a&names=b`（重复参数） |
| `POST {action:"save-records", records}` | 不变（写） |
| `POST {action:"probe", declaration, scope, …}` | 不变（`declaration` 是对象） |
| 非 GET/POST → 405 空 body | 405 `{error}` |
| 客户端 `callMcp` 丢掉 `{error}` | 读 `{error}` |

**core**

| 现在 | 改成 |
|---|---|
| 裸 `GET /hub/workspaces` | 不变 |
| `POST /hub/workspaces/<add\|select\|agent\|rename\|remove>` | `POST /hub/workspaces {action:"<verb>", …}` |
| workspaces 其它 → 405 空 body | 405 `{error}` |
| `POST /hub/place-files`（已经是 `{action,ref,text}`） | **形态不变**；`:178` 的 405 空 body → `{error}` |
| `POST /hub/net` `{url, headers}`（无 action） | `POST /hub/net {action:"fetch", url, headers}` |
| net 非 POST → 405 空 body | 405 `{error}` |
| core 12 处手写 `sendJson(400,{error})` | 收敛到 `sendError` |

`place-files` 的 `workspace` / `read` 是读，但 `ref` 是 `{scope,file}` 对象 → 按第 2 行规则留 POST。
严格「读走 GET」的代价是多一个 query reader + `PlaceCall` 拆成读写两支，收益是
`curl '…?action=read&scope=global&file=.claude.json'`——**判断：不值**。

**明确不动、只换失败体的三条**

| 位置 | 今天 | 改成 |
|---|---|---|
| `/hub/files` 405、404（缺文件与兜底 catch） | 空 body | `{error}` |
| `/hub/files` **416** | 带 `Content-Range` | **不要动**——这是协议应答不是失败 |
| `/hub/extensions` 405、404（两处） | 空 body | `{error}` |
| `/hub/state` 405 | 空 body | `{error}` |

三个客户端都不读这些 body（`extensions/src/remote.ts:29,38`、`apps/web/src/lib/hub.ts:52`
只报状态码；`assetRef` 是 `<img src>`），所以这是纯统一，零行为变化。

### 转换规则

**`under()` —— 最短的正确派发器**（5 行，同时容纳「精确」与「`<route>/<id>`」，
顺手关掉 `/hub/skillsXYZ`；core 的六条前缀路由一并换掉）：

```ts
/**
 * The path under one route, or null when this handler does not own the request.
 * `""` is the route itself; anything else is one identity segment.
 */
function under(route: string, pathname: string): string | null {
  if (pathname === route) return ""
  if (!pathname.startsWith(`${route}/`)) return null
  return pathname.slice(route.length + 1)
}
```

用法（skills；prompts 同形）：

```ts
const rest = under(SKILL_ROUTE, url.pathname)
if (rest === null) { next(); return }
const id = rest === "" ? "" : decodeURIComponent(rest)   // ← 解码必须在 try 内
```

`rest` 里带 `/` 就是「已经折掉的多段路径」→ 直接 `400 {error: "unknown route"}`。

**客户端侧收拢到 `packages/core/src/http.ts`（新文件）**，`package.json` 的
`exports` 加一行 `"./http": "./src/http.ts"`：

- `callJson<T>(url, init?)`：`!ok` 时按各处一致的写法 `response.json().catch(() => ({}))`
  取 `{error}`，抛 `new Error(body.error ?? \`${status} ${statusText}\`)`；`ok` 时返回 `response.json()`。
- `callGet<T>(route, action | null, params?)`：标量参数走 `URLSearchParams`，可重复键，
  值一律 `encodeURIComponent`（顺手修 skills 那两处不编码的 bug）。
- `callPost<T>(route, action, args?)`：`body = JSON.stringify({ action, ...args })`。

两处裸字节（skills / prompts 的 `put-asset`）用 `callJson` 手拼 URL 就够——为此加参数是过度设计。
`apps/web/src/lib/hub.ts:47,68` 的 state 调用**不要**收进来：它是「一个名字一个文件」的另一种形状。

放 `core/src/http.ts` 而不是别处，因为它正好是 `core/src/host/http.ts` 的镜像——
同一个包、同名的两个文件把「一套约定的两端」摆在明面上；放 `resources/*` 任何一包都会
造成跨包依赖，放 `packages/extensions` 会让 `core/src/net.ts` 反过来依赖内核，方向是错的。
apps/web、skills、prompts、plugins、mcp、extensions **全部**已经依赖 `@context-hub/core`
并已在用子路径，加一个子路径不需要任何构建配置。

### 每模块改动清单

**skills** — `handlers.ts` 改动最大，建议照 plugins 的形状重排成「先算 rest，再 GET 分支表 / POST switch 两段」：
派发换 `under()` 且解码进 `try`；`:102-143` 三条 place 读保留；`:145-225` 五条 place 写删掉
query action 判断交给 switch；`:227-250` tags / package 保留；`:253-271` 裸 GET list 保留；
`:273-292` refresh / check-updates 挪进 switch；`:295-344` install / import / create 加 action 字段
（`create` 只取具名字段）；`:361-374` 只留 GET，PATCH / DELETE 两分支删除；
`:376-429` 与 `:431-446` 整段删除，由 `check-update` / `update-from-upstream` /
`add-asset-source` / `put-asset` / `delete-asset` / `file` / `write-file` 在 switch 里承接。
`src/remote-store.ts` 按目标表改各方法；**`src/library.ts`（hooks）零改动**——store 方法签名全不变，
这是 `skills/__test__/*` 直接测 store 所依赖的。`apps/web` 零改动。

**plugins** — `handlers.ts`：派发换 `under()`；五条 GET 读不变；`root` 与 `program-exists`
从 switch 搬到 GET 段（`program` 改读 `url.searchParams`）；`:204-207` 改 `sendError(…, 405)`。
`src/tools.ts`：`:20-31` 拆成 GET/POST；注意 `:28` 抛的是 `PluginInstallError`，
全仓没有任何地方 `instanceof` 它，换成普通 `Error` 行为等价。`src/library.ts`
`:220-232` 的 `call` 换共用 helper，其余零改动。

**prompts** — `handlers.ts`：派发与两段解析整段换成 `under()`（只接受 `""`）；
list 不变；create / PATCH→update / source / assets / remove 五处改；`:115-119` 的
「空 patch 要拒」逻辑照搬。`src/remote-store.ts` 六处改，其余零改动。

**mcp** — `handlers.ts`：`:46` 精确匹配保留；探活保留；405 改 `{error}`；
`:61-100` 重排成「GET → records / cache（`getAll("names")`）；POST → save-records / probe」。
`src/probe.ts`：`callMcp` 拆 `callGet` / `callPost` 并**读 `{error}`**；cache → GET，probe → POST。
`src/records.ts`：read → GET，save 不变。`src/failure.ts` / `library.ts` 零改动
（`mcpFailure:47-51` 把未知消息放进 `detail`，key 不变，所以错误文案变化不上屏）。

**core** — `handlers.ts`：place-files 与 net 的 405 改 `{error}`；net 读 body 后校验
`asked.action === "fetch"`；workspaces 派发换 `under()` 且 action 从 body 读，
五个 if 合并成 `switch (body.action)`；七处手写 400 收敛到 `sendError`（加进 `:27-32` 的 import）。
`src/net.ts`：body 加 `{action:"fetch"}`，`NetRequest` 加字段。
`apps/web/src/lib/workspaces.ts` 六个调用点改。`place-files.ts` 与 `hub.ts` 零改动。

### 阶段 B 验收

每改完一个模块：跑该模块的 `bridge.test.ts` + **curl 真打读写各一条**。
**逐个模块做，不一次改完**——这是本阶段唯一有功能回归风险的地方。
顺序：prompts → mcp → plugins → skills → core。

---

## 阶段 C：启动时并行预加载 + 共享状态

起因不变：四个资产页面今天都**只在进入页面时**才读数据，读取逻辑住在各自的 React hook 里。
组件卸载 state 一起丢，再进来重读一遍。于是全局 Ctrl+K 在任何"从未进过那四个页面"的
会话里查不到任何真实资产。

### C.1 通用目录 `packages/extensions/src/catalog.ts`（新，React-free）

```ts
export type CatalogStatus = "idle" | "loading" | "ready" | "error"

export interface CatalogState<S> {
  status: CatalogStatus
  value: S | null        // 上一次读到的快照，reload 期间保留
  failure: string | null
  at: number
}

export interface Catalog<S> {
  state(): CatalogState<S>
  subscribe(listener: () => void): () => void
  load(): Promise<void>      // single-flight；已 ready 且无待办 rerun 时直接返回
  reload(): Promise<void>    // 丢旧值重读；页面写完之后调
  update(recipe: (draft: S) => void): void   // immer produce；无改动 → 原引用 → 不 announce
}

export function createCatalog<S>(options: {
  initial: S
  read: (commit: (recipe: (draft: S) => void) => void) => Promise<S>
}): Catalog<S>

export function mapLimit<T, R>(limit: number, items: readonly T[],
  run: (item: T, at: number) => Promise<R>): Promise<R[]>
```

- **single-flight + 代际守卫收在这一处**，四个库不再各持 generation ref；
  顺带修掉 plugins 今天完全没有守卫的问题。
- 借鉴 `deepseek-harness/packages/client/ui-settings/src/client/settings-mirror.ts` 的
  `inFlight` / `rerun` / `generation` 三件套，**但 `load()` 的语义按本仓需要写成
  "ready 就不重读"**（参照实现里那是 `ensure()`，`load()` 是无条件刷新）；
  单源失败只写 `failure`，**`value` 不清空、不 reject 给调用方**（后端可能不存在，降级是默认行为）。
- `update` 走 immer `produce`，因此"没改就返回原引用 → 不 announce"由 immer 保证。

**`packages/extensions/__test__/catalog.test.ts`** 的断言：并发 `load()` 只调一次 `read`；
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
`use-sync-external-store` 现在只在 lockfile 里由 `react-redux` 传递带进来，直接依赖它必须显式声明，
连 `@types/use-sync-external-store` 一起（它带 `shim/with-selector.d.ts`，不必像参照实现那样手写 `.d.ts`）。

### C.3 四个库：把「读」搬进各自的 catalog

**落点**：每个包新增 `src/library-store.ts`（`mcp` 包已经有 `src/catalog.ts`，名字被占，
它是 `buildCatalog` / `scanPlaces` 那套合并逻辑，不重命名）。构造在 `apply` 里、
**不发任何请求**；作为自己的服务发布（每包 +1 个服务常量、+1 条 `provides`、+1 行 module augmentation）。

- **Reload keys**：catalog 订阅 `hub.workspaces` 与 `extensions/changed`
  （后者从插件 ctx 能收到，已实测）；`places` 由 catalog 自己算——
  `readablePlaces(ctx.get("skills").providers(), ctx.get("hub.workspaces").current()?.agents)`
  （`skills/src/provider.ts:106` 已是导出纯函数）。
- **四个 hook 的返回形状不变**，因此四个 `page.tsx`（合计 4,594 行）基本不动。
- **Prompts**（最简，先做）：`rows` / `tags` / `root` / `loading` / `error` → 一次 `store.list()`。
  ⚠ 动手前重读 `prompts/src/store.ts`（见第一节）。
- **Skills**：`page` / `held` / `tags` / `loading` / `error`；`list` + 每 place 一次 `placeSkills` + `tags`。
  ⚠ 今天 `reload` 的依赖里有 `needle`（`skills/src/library.ts:475`），即**每敲一个字都重读一次**。
  **catalog 只持不过滤的那一份**；页面带 query 时仍走自己的一次 `store.list({q})`。
  进页面（query 为空）因此不会产生第二个请求，而"服务端过滤"这条既有语义不动。
- **MCP**：`records` / `scan` / `checks` / `testing` / `busy` / `failure` / `canProbe`；
  `probeAll` 从 `read()` 拆成独立一步、每个答案用 `commit` 逐条落定；
  保留 `PROBE_CONCURRENCY = 3`（`mcp/src/library.ts:50`）与"只 probe 缓存无答案的"两条既有语义。
- **Plugins**：`records` / `scanned` / `clients` / `root` / `missing` / `busy` / `failure`；
  `probeInstallers`（`plugins/src/scan.ts:102-108` 今天是无上限 `Promise.all`）改走 `mapLimit`。

### C.4 `use-immer` 的落点（只有两处）

| 位置 | 现状 | 换成 |
|---|---|---|
| `skills/src/search-dialog.tsx:303,356` | `Record<string, Partial<RemoteSkill>>` + `setDetails(c => ({...c, [key]: detail}))` | `useImmer` + 按键赋值 |
| `mcp/src/add-server-dialog.tsx:67,79` | `values: ServerFormValues`，子表单算好整个新值交回 | `useImmer` + 逐字段赋值 |

两处今天都是**浅层**的，换 immer 不会让代码更短——按用户决定照做，但**不为了用而用**：
实施中若发现更多同型落点一并换，没有就到此为止。

### C.5 启动编排

`apps/web/src/lib/preload.ts`（新，约 20 行）：

```ts
await kernel.start()                       // 必须之后：registry providers 要等扩展 activate 完
await ctx.get("hub.workspaces").refresh()  // 不 await 的话四个库算不到 places
void Promise.allSettled(names.map((n) => ctx.get(n)?.load()))
return kernel                              // .then 立刻渲染，加载在后台继续
```

- `apps/web/src/lib/workspaces.ts` 的 `refresh()`（`:69-77`）**改成 single-flight**
  （返回在飞的那个 promise）。否则 `hub.ts:172` 的 `void refresh()` 与预加载各发一次 GET。
- 不影响首屏靠的不是让路，而是：`load()` 不被 await + 子进程两档各自限并发 + 每个 store 独立落定。

### 阶段 C 验收

- **C-一 通用目录层**：`catalog.test.ts` 全绿；`packages/extensions` typecheck / lint 通过。
- **C-二 Prompts**：不进 `/prompts` 时 `GET /hub/prompts` 已发出；进页面**不再产生第二个**请求。
- **C-三 Skills**：切 workspace 后列表跟着重读；预加载已发 `list` + `tags` + 每 place 一次 `place`；
  在筛选框打字仍然只重读一次（既有语义不变）。
- **C-四 MCP**：启动后 `cache.json` 出现缓存无答案的名字，**已有答案的不被重探**；并发 ≤3。
  **这一档会真的起 MCP 服务器进程，验证用 `CONTEXT_HUB_HOME=<temp>` 的第二台 dev server。**
- **C-五 Plugins**：`probeInstallers` 并发不超上限；`restore` 仍只由页面的 `missing` 触发
  （**不因预加载而自动下载**）。
- **C-六 接线 + 文档**：冷启动后首屏可见时间与改动前相当；四个库的 `list` 类请求
  首屏前后各只出现一次；收尾走一次 `aoci_maintain`。

---

## 不做

- **不接 Ctrl+K 面板**（用户已定）。
- **不引入 `typert` / 双构建面 / `@Remote`**（那是为几十个包 + 三种交付形态准备的）。
- **不做 `configurePreviewServer`**：有 `createHubServer` 再维护第二个非 dev 载体是重复。
- **不实现 Electron**，只保证前置条件成立。
- **不把 Plugins 的 `restore` 移进预加载**：那是网络下载 + 写盘，是修复动作，留在页面。
- **不上 React Provider**：共享状态走 kernel 服务，与 `hub.workspaces` 同一形状。
- **不对 `Set` / `Map` 做 immer 化**，因此**不调 `enableMapSet()`**。
- **不把标量 state**（`view` / `tab` / `page` / `query`）**包进 `produce`**。
- **不动 `remote-store.ts` 的 `subscribe`**（`skills/src/remote-store.ts:264-267` 是空实现）：
  桥不推送，多标签页不同步，本轮不管。
- **不把 mcp / plugins 客户端里写死的 `createRemote*` 传输搬到 form**：那是另一件事，
  本轮只加 `base` 参数。
- **不统一资产上传的编码**（plugins 的 data URL 数组是另一个功能，不是"上传一个文件"）。
- **不把 `loadCatalog()` 的首次建索引挪走**：进程内一次、幂等，写一条注释即可。
- **不引入 Worker / Suspense / React.lazy / requestIdleCallback / 路由级拆包**。
  贵的从来是 I/O 与宿主侧子进程。
- **不预加载行级细节**：`useSkillDocument`、`usePackReadme`、`useInstalled`——
  进预加载会把请求数从"每库一次"放大到"每行一次"。

## 风险

1. **阶段 B 逐个模块做**，每步跑该模块的 `bridge.test.ts` + curl。skills 最重也最承重。
2. **四个「探活读」只看状态码**（见第二节）：裸 GET 一旦不再等于「默认读」，
   skills 页与 prompts 页会**没有库且没有任何错误信息**；place-files 的探活 body 是
   `{action:"workspace"}`，把 `workspace` 改成 GET 必须同步改，否则 `host.files` 恒为 null，
   文件页 / MCP 安装 / prompts 投递全部静默降级。
3. **参数名不一致的高危配对**（改 helper 时最容易顺手"统一"错）：
   `plugins/src/tools.ts:60` 客户端变量叫 `directory` 但发的键是 `path`，handler 读 `body.path`；
   `plugins/src/library.ts:621` 发 `sources` ↔ `handlers.ts:251` 读 `body.sources`；
   `plugins/src/library.ts:617` 发 `files` ↔ `handlers.ts:224` 的 `uploadsOf(body.files)`，
   元素键是 `path` / `base64`；skills 的 `place-file` 参数名就是 `path`，别在新代码里改成 `file`。
4. **`decodeURIComponent` 在 try 之外**：改完 500 → 400 是**可见变化**。
5. **MCP probe = 启动用户配置的 MCP 服务器进程**（每 server 一个子进程、30s 超时），
   并写 `cache.json`（`mcp/handlers.ts:94-96`）。**这是行为变更**：以前"进页面才起服务器"，
   以后"应用一起来就起"。参照实现根本不做这件事。实施后要实测首屏代价。
   **已核对：plugins 那条不会写盘**——`describe`（`plugins/handlers.ts:311-321`）与
   `recordOf` 里的 `storePicture`（`host/library.ts:354`）都只在**收包**时走，
   唯一的客户端调用方是 `agents/claude-code/src/installer.ts:235`，不在读路径上。
6. **四个 hook 是仓库里最大的几个文件**（skills 711 行）。搬移机械但面大；
   每个阶段单独跑 typecheck + 该包测试，不一次改完再验。
7. **`aoci_maintain` 必须等树静下来再跑**。跑之前先确认
   `find packages apps docs -newermt "-20 minutes" -type f -not -path "*/node_modules/*"`
   出现**不属于本次任务**的文件就停下问用户。
8. **收尾杀进程只杀 `apps/web/hub-port.ts` 里那个 `DEV_HUB_PORT`**，Vite 会跟着退出；
   **永远不要按端口去杀**（本仓已因此误杀三次）。

## 落地顺序与提交

| 步子 | 内容 | 完成判据 | 状态 |
|---|---|---|---|
| P0 | plugins 的 project 补进根 vitest 配置 | `pnpm test` 收满 | ✅ `2e66267` |
| A | 6 份 `bridge.test.ts`；五个客户端加 `base` | 全绿；种错参数名变红 | ✅ `c051262`…`b254d22` |
| B | 逐模块统一（prompts → mcp → plugins → skills → core） | 该模块 `bridge.test.ts` 绿 + curl 读写各一条 | |
| C-一 | `extensions/src/catalog.ts` + `useCatalog` + 三个依赖 + `catalog.test.ts` | 该包 typecheck / lint / 测试绿 | |
| C-二 | Prompts（最简，先做） | 进页面不产生第二个请求 | |
| C-三 | Skills | 切 workspace 重读；打字仍只重读一次 | |
| C-四 | MCP | 并发 ≤3；已有答案不重探 | |
| C-五 | Plugins | `mapLimit` 生效；`restore` 仍只在页面触发 | |
| C-六 | `preload.ts` 接线 + README + `docs/memory.md` + `aoci_maintain` | 见验收 | |

**每一步单独提交**，commit message 按仓库现有风格。跨包改动要按 `AGENTS.md` 的
"搜索与代码修改"把两端、类型引用、字符串字面量、测试、文档都搜一遍。
完成后归档到 `docs/plans/archive/`。

## 验证

```bash
pnpm install                      # 必须 dangerouslyDisableSandbox: true
pnpm test                         # 全部 project 全绿
pnpm typecheck && pnpm lint       # 11/11 + 11/11
pnpm build
```

**跨载体的冒烟**（改了派发就要做，不必开浏览器）：
`node apps/web/server.ts --port 0 --home <tmp> --folder <tmp>`，然后 curl 打十一个路由
（state / extensions / workspaces / skills / prompts / mcp / plugins / place-files / net 与
九条游荡路径）。`--port 0` 是关键：**永远不要占一个固定的开发端口**，
收尾只按自己拿到的那个 URL 对应的 PID 杀。

端到端（阶段 C 需要，浏览器）：起隔离 hub home
（`CONTEXT_HUB_HOME=<temp>`，**必须绕过 turbo**——turbo 2 默认 `envMode: "strict"`
会过滤掉未声明的环境变量），核对预加载发出的请求数、进页面不产生第二个请求、
切 workspace 后重读。按 `AGENTS.md`，浏览器自动化走 `browser-automation` skill 的 `--bridge` 模式。

收尾：树静下来之后跑一次 `aoci_maintain`（先查有没有别人的文件在动，见风险 7）。
