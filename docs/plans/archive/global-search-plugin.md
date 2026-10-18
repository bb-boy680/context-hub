# 全局搜索插件（Ctrl+K）

## 背景与现状

用户要求把 Ctrl+K 做成可搜索整个 Context Hub 的全局查询，并且查询本身必须是插件，不能继续写死在 `apps/web` 外壳里。当前实现与目标之间的差距：

- `apps/web/src/components/search-palette.tsx` 是写死演示数据的弹窗（`searchGroups` 常量、未接线的输入框、筛选胶囊）。`apps/web/src/components/app-layout.tsx` 在 window 上监听 Ctrl+K 并渲染它；`apps/web/src/components/app-header.tsx` 渲染固定的搜索按钮，通过 `onOpenSearch` 传下去。
- 贡献点只有 `locale`、`target`、`skillRegistry`、`nav`、`header`、`route`，见 `packages/extensions/src/types.ts` 的 `ContributionMap`、`packages/extensions/src/contributions.ts` 的 `POINT_SERVICES` / `createContributionPoints`。没有供模块“抛出 search 函数”的接口。
- 四个资产模块已有共享读取服务，并由 `apps/web/src/lib/preload.ts` 的 `PRELOADED` 在启动时预读：
  - `catalog.skills`（`packages/resources/skills/src/library-store.ts` 的 `SkillLibrary`）
  - `catalog.mcp`（`packages/resources/mcp/src/library-store.ts` 的 `McpLibrary`）
  - `catalog.plugins`（`packages/resources/plugins/src/library-store.ts` 的 `PluginLibrary`）
  - `catalog.prompts`（`packages/resources/prompts/src/library-store.ts` 的 `PromptLibrary`）
- 环境变量没有共享读取：`packages/resources/variables/src/page.tsx` 自己 `createRemoteVariableStore()`，在 mount 时 `read()`；`apps/web/src/lib/hub.ts` 也没有注册 `hub.variables`。所以启动时搜索不到变量。
- 页面查询状态都是本地 `useState("")`：`skills/page.tsx:966`、`mcp/page.tsx:433`、`plugins/page.tsx:781`、`prompts/page.tsx:380`、`variables/page.tsx:772`、`apps/web/src/pages/extensions.tsx:128`。URL 里的 `?q=` 目前不生效。
- 高亮组件 `Highlighted` 在 `skills/page.tsx:702` 与 `plugins/page.tsx:541` 各有一份，只高亮第一次出现，样式为 `<mark class="bg-transparent font-semibold text-primary">`。mcp、prompts、variables、extensions、settings 没有高亮。
- 设置页 `apps/web/src/pages/settings.tsx` 没有查询框；设置项文案在 `packages/extensions/src/builtin/locale-en.ts` 的 `settings.*`，中文在 `packages/i18n/zh-cn/src/messages.ts`。
- 英文文案按包放在各自的 `src/messages.ts`；`packages/i18n/zh-cn/__test__/messages.test.ts` 会扫描所有包的 `src/messages.ts`，要求中文表覆盖每一个英文 key。

## 目标

1. 在 kernel 增加 `search` 贡献点，每个模块在 `apply` 里注册自己的同步 `search(query)`，全局搜索插件是唯一调用方。
2. 新建插件包 `packages/search/global-search`（`@context-hub/global-search`），注册 header 贡献（搜索按钮 + Ctrl+K 弹窗）和 settings / extensions 两个 shell 页面的 search provider。
3. 删除外壳里的 `search-palette.tsx` 与 Ctrl+K 监听，`AppLayout` / `AppHeader` 回到普通外壳。
4. skills / mcp / plugins / prompts / variables 各自注册 search provider；设置页、扩展页由 global-search 插件代为提供。
5. 结果固定为：左侧头像（`avatar`），没有头像时用结果自己的 `icon`，再没有就用 provider 的 `icon`；右侧标题；有注释时显示注释并保留换行；没有注释不占行。
6. 弹窗支持键盘：↑↓ 移动、Enter 打开、Esc 关闭、输入框 `aria-activedescendant`；结果标题与注释也高亮查询词。
7. 选中结果跳到对应页面，通过 URL `?q=` 触发页面查询并高亮；带视图切换的资产页额外用 `view=list` 保证高亮可见；设置页用 `#anchor` 滚动到分组。
8. 环境变量在启动时预加载，加入 `PRELOADED`。

## 关键决策

这些是计划有意定下的边界，执行时不要自行扩大：

1. **`search` 是同步函数。** 所有数据都来自启动预读或同步快照；provider 不允许发 I/O。未来需要 I/O 的 provider 再把接口升级为 async，不在本轮实现。
2. **给 `SearchContribution` 加可选的 `subscribe`。** 用户给的草图只有 `search`；但 MCP / Plugins 的共享读取可能在弹窗打开后才落地（探针、客户端命令都是秒级）。没有订阅，弹窗会一直显示空结果直到用户再次输入。`subscribe` 只用来通知“结果可能变了”，不改变同步查询的上限。每个有共享读取的 provider 直接转接 `library.subscribe`。
3. **页面 `q` 以 URL 为唯一事实来源。** 输入框每次变更用 `setSearchParams(..., { replace: true })` 写回，避免历史记录膨胀。这样全局搜索跳到当前页面时也能触发查询，不需要 `useEffect` 夹状态（仓库 lint 把 `react-hooks/set-state-in-effect` 和 `set-state-in-render` 都设为 error）。
   - 弹窗内部不手写方向键/游标/滚动/ARIA：直接用仓库已有的 shadcn `Command` 组件（`packages/shadcn-ui/src/components/command.tsx`，底层是 cmdk 1.1.1）。`shouldFilter={false}` 关掉 cmdk 自己的过滤，`loop` 负责环绕，`CommandItem.onSelect` 负责 Enter/点击，`CommandList` 负责把选中项滚进视野。
   - 这同时解决 portal、焦点陷阱、Esc 关闭和 `aria-activedescendant`：用 `CommandDialog` 即可，不需要自己写 `cursor.ts` 或挂 window keydown（Ctrl+K 开关仍由 header 组件负责）。
   - 弹窗里订阅 provider 时不能直接依赖 `useContributions("search")` 返回的数组：它每次渲染都是新数组，会让订阅 effect 每帧重挂。用 `useExtensionSnapshot().revision` 做 `useMemo` 依赖，拿到扩展变化前稳定的 provider 列表。
4. **`view=list` 是 URL 参数，不是页面状态。** 四个有 grid/list 的资产页读取 `view` 参数作为强制视图；用户点列表/卡片按钮时删掉该参数并写本地状态。这样全局搜索在“已经停留在该页面”的情况下也能切到列表，不依赖组件重挂载。
5. **设置页不新增输入框。** 它只读 `q` 和 `location.hash`：高亮标题/描述，并 `scrollIntoView` 到对应 `Group`。设置项到分组的映射由 global-search 插件的 settings provider 维护；设置页新增一行时要同步更新这个 provider。
6. **变量只索引名字和分组，不索引值。** 搜索不能泄露密钥；`Variable.value` 不进入 `SearchResult`。
7. **高亮只做第一次出现，大小写不敏感。** 这是现有 `Highlighted` 的行为，本轮只是抽到共享组件，不改为全量或正则高亮。
8. **列表视图才高亮。** 沿用现有约定：卡片不标；所以 search provider 给资产页的 path 带 `view=list`。

## 待验证 / 假设

- `react-router@8.4.0` 的 `useSearchParams` 支持函数式 setter 与 `{ replace: true }`：已核对 `node_modules/.pnpm/react-router@8.4.0_.../dist/development/lib/dom/lib.d.ts:1567`，并用 Context7 的 React Router `useSearchParams` 文档二次确认（2026-10-18）。执行时若类型变化，以本地 `node_modules` 为准。
- cmdk 的 `shouldFilter={false}`、`Command.Input` 的 `value`/`onValueChange`、`Command.Dialog` 受控 `open`/`onOpenChange`、`loop`、`Command.Empty` 已用 Context7 的 `/dip/cmdk` 文档确认（2026-10-18）；本仓实际安装的是 `cmdk@1.1.1`，以 `packages/shadcn-ui/src/components/command.tsx` 的封装为准。
- 新增 workspace 依赖后需要跑一次 `pnpm install` 更新 `pnpm-lock.yaml` 和 `node_modules` 链接；README 说明沙箱内 `pnpm install` 会挂起，需在沙箱外执行。本计划不执行安装。
- `pnpm dev` 启动的地址是 `apps/web/hub-port.ts` 里的端口；浏览器验证用隔离的 `CONTEXT_HUB_HOME`，不要写用户真实的 `~/.context-hub`。
- 设置页导航到同路由不同 hash 时，React Router 不保证滚动；计划用 `useEffect` 手动 `scrollIntoView`，只做 DOM 副作用，不 setState。

---

## 阶段一：建立 search 贡献点与共享高亮

### 目标

让任何插件都能在 `apply` 里注册一个同步搜索函数；让每个页面都能复用同一个 `Highlighted`。

### 改动文件

- `packages/extensions/src/types.ts`
  - 在 `ContributionMap` 前新增：
    ```ts
    export interface SearchResult {
      id: string
      title: string
      description?: string
      /** 远程或本地图片 URL；优先于 icon。 */
      avatar?: string
      /** 结果自己的图标；没有 avatar 时用。 */
      icon?: ExtensionIcon
      /** 页面路径，可带 ?q= 和 #anchor。 */
      path: string
    }

    export interface SearchContribution {
      /** provider 分组的文案 key，由 dialog 用 ctx.i18n.t 解析。 */
      labelKey: string
      icon: ExtensionIcon
      /** 同步返回；必须无 I/O。没有数据时返回 []。 */
      search(query: string): SearchResult[]
      /** 结果可能变化时通知；不提供则弹窗只在输入变化时重查。 */
      subscribe?(listener: () => void): () => void
    }
    ```
  - `ContributionMap` 增加 `search: SearchContribution`。
- `packages/extensions/src/contributions.ts`
  - `POINT_SERVICES` 增加 `search: "search"`。
  - `declare module "@deepseek-ai/cordis"` 增加 `search: ContributionPoint<SearchContribution>`。
  - `createContributionPoints` 增加 `new ContributionPoint<SearchContribution>(ctx, POINT_SERVICES.search)`。
- `packages/extensions/src/search.ts`（新）
  - `searchPath(path, query, extra?)`：用 `URLSearchParams` 生成 `path?q=<encoded>&...`，空 query 不写 `q`。设置页的 hash 由调用方追加。
  - `matchesQuery(query, ...fields)`：`trim().toLowerCase()` 后做大小写不敏感子串匹配；所有 provider 共用，避免五份重复。
- `packages/extensions/src/index.ts`：`export * from "./search.ts"`。
- `packages/extensions/src/components/highlight.tsx`（新）
  - 把现有 `Highlighted` 原样搬过来，保留 `bg-transparent font-semibold text-primary` 与“第一次出现”行为。
- `packages/extensions/src/components/index.ts`：导出 `highlight.tsx`。
- `packages/extensions/__test__/search.test.ts`（新）
  - 用一个真实 kernel + 一个 `inject: ["search"]` 的测试插件，断言 `ctx.extensions.contributions("search")` 在启用时返回该 provider，禁用后为空。
  - 断言 `searchPath("/skills", "a&b", { view: "list" }) === "/skills?q=a%26b&view=list"`；断言 `matchesQuery("  PDF ", "pdf-extract", undefined)` 为 true、`matchesQuery("", "x")` 为 false。

### 验收

```bash
pnpm --filter @context-hub/extensions typecheck
pnpm --filter @context-hub/extensions lint
pnpm --filter @context-hub/extensions test
```

全绿；仓库仍可启动，页面行为不变。

---

## 阶段二：上收环境变量共享读取并预加载

### 目标

环境变量与另外四个资产一样，由模块发布一个启动可预读的共享服务；页面订阅它，不再自己 mount 时读。

### 改动文件

- `packages/resources/variables/src/library-store.ts`（新）
  - `export const VARIABLE_LIBRARY_SERVICE = "catalog.variables"`。
  - `export class VariableLibrary extends Service`，构造时 `super(ctx, VARIABLE_LIBRARY_SERVICE)`，内部 `createCatalog<VariableDocument>({ initial: null, read: ... })`。
  - `store(): VariableStore | null` 读 `ctx.get("hub.variables")`；无 store 时 `read()` **返回空文档** `{ version: 1, groups: [], variables: [] }`，页面画空列表而不是失败。
  - `state()` / `subscribe()` / `load()` / `reload()` / `update(recipe)` 与其它 `*Library` 一致。
  - 写方法 `create(drafts)`、`update(name, patch)`、`remove(name)`、`createGroup(group)` 的统一流程：
    1. `await this.load()`，保证 catalog 已有值可更新；读失败时 `load()` 不会 reject，但 `state().value` 仍是 null。
    2. `const next = await this.requireStore().<write>(...)`。
    3. 若 `this.state().value !== null`，用 `update((draft) => { draft.version = next.version; draft.groups = next.groups; draft.variables = next.variables })` 发布返回值；否则 `await this.reload()` 兜底。
    4. 返回 `next`。
    页面拿到 `void` 即可，catalog 的更新会触发订阅者重渲染。
  - `declare module "@deepseek-ai/cordis" { interface Context { "catalog.variables"?: VariableLibrary } }`；按仓库现有写法在文件内导入 `Context`，避免 memory 记录的 duplicate module 问题。
- `packages/resources/variables/src/library.ts`（新）
  - `useVariableLibrary()`：`useHub` 取 `catalog.variables`，`useCatalog` 读 `value` / `failure` / `status`；`useEffect(() => { void shared?.load() }, [shared])`；暴露 `document`、`store`、`loading`、`failure`、`reload` 和四个写方法。
  - 用一个 `NO_LIBRARY` 空 catalog 作为模块未加载时的 fallback，写法照 `packages/resources/prompts/src/library.ts:28-33`。
- `packages/resources/variables/src/page.tsx`
  - 删除 `createRemoteVariableStore` 的 import 与 `useMemo`，删除 `document` / `failure` 的本地状态和 `load()`。
  - `const library = useVariableLibrary()`；`document = library.document`；错误横幅用 `library.failure`，重试用 `library.reload()`。
  - `create` / `createGroup` / `saveValue` / `rename` / `remove` / `move` 改调 `library.*`；删除 `remember`。
  - 保留所有弹窗、toast 和表单行为不变。
- `packages/resources/variables/src/index.ts`
  - `apply` 中 `new VariableLibrary(ctx)`。
  - 导出 `VariableLibrary`、`VARIABLE_LIBRARY_SERVICE`。
  - `declare module` 只增加 `"hub.variables"?: VariableStore`（`"catalog.variables"` 已在 `library-store.ts` 声明，避免重复）；`inject` 暂不加 `search`（阶段三加）。
- `apps/web/src/lib/hub.ts`
  - 从 `@context-hub/variables` 同时导入 `createRemoteVariableStore`。
  - `services["hub.variables"] = createRemoteVariableStore()`，与 `hub.prompts` / `hub.skills` 放在同一段。
- `apps/web/src/lib/preload.ts`
  - `PRELOADED` 增加 `"catalog.variables"`；注释从“四个”改为五个。
- `packages/resources/variables/src/messages.ts` 与 `packages/i18n/zh-cn/src/messages.ts`
  - `variables.list.hint` 由“Read when this page opens”改为“Loaded at startup”；中文改为“启动时已加载”。其它文案不动。
- `packages/resources/variables/__test__/library-store.test.ts`（新）
  - 裸 `Context` + `ctx.provide("hub.variables", fakeStore)`，断言服务以 `catalog.variables` 注册、`load()` 得到文档、`create()` 后 `state().value` 已更新、`subscribe` 收到通知。
  - 无 store 时 `load()` 不抛错，得到空文档。
- `apps/web/__test__/preload.test.ts`（新）
  - 断言 `PRELOADED` 同时包含 `catalog.skills`、`catalog.prompts`、`catalog.mcp`、`catalog.plugins`、`catalog.variables`。

### 验收

```bash
pnpm --filter @context-hub/variables typecheck
pnpm --filter @context-hub/variables lint
pnpm --filter @context-hub/variables test
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
```

浏览器：打开应用后、还没进 `/variables` 时，Network 面板已经出现 `/hub/variables`（预读）；进入页面后列表、创建、编辑、删除、移动分组仍正常。

---

## 阶段三：为各资产模块注册 search provider

### 目标

五个资产模块各自在 `apply` 里注册一个 search provider，读取自己的共享 catalog；provider 是同步纯查询，不访问磁盘/网络。

### 共同约定

- 每个模块建自己的 `src/search.ts`，导出一个纯函数，例如 `searchSkills(value, assetUrl, query)`，返回 `SearchResult[]`。query 先 `trim().toLowerCase()`；空 query 返回 `[]`；匹配字段与该页现有过滤完全一致（见下）。
- provider 注册形状：
  ```ts
  ctx.search.register({
    labelKey: "search.group.skills",
    icon: SparklesIcon,
    search: (query) =>
      store === null ? [] : searchSkills(library.state().value, (ref) => store.assetUrl(ref), query),
    subscribe: (listener) => library.subscribe(listener),
  })
  ```
  `SkillLibrary.store()` / `PromptLibrary.store()` 都可能返回 `null`；provider 必须先判空再调 `assetUrl`。
- 结果 path 用 `searchPath(pagePath, query, { view: "list" })`；没有视图切换的页面不带 `view`。
- 新增英文分组 key（在各自 `src/messages.ts`），并同步中文：
  - skills: `search.group.skills` = "Skills"，provider icon `SparklesIcon`
  - mcp: `search.group.mcp` = "MCP servers"，provider icon `ServerIcon`
  - plugins: `search.group.plugins` = "Plugins"，provider icon `PlugIcon`
  - prompts: `search.group.prompts` = "Prompts"，provider icon `FileTextIcon`
  - variables: `search.group.variables` = "Environment variables"，provider icon `VariableIcon`

### 各模块

**Skills**

- `packages/resources/skills/src/search.ts`（新）
  - 输入 `SkillLibraryValue | null`、`assetUrl(ref)`、query。
  - 合并 `value.page?.items` 与 `Object.values(value.held)` 里的 `view.skills`；按 name 去重，库里的行优先（它带 assets）。
  - 匹配 `name` / `description` / `tags`，与该页 `matchesQuery`（`page.tsx:116`）一致。
  - `avatar = item.assets[0] ? assetUrl(item.assets[0]) : undefined`；place-only 行没有头像。
  - path `/skills?q=<query>&view=list`。
- `packages/resources/skills/src/extension.ts`
  - `inject` 加 `"search"`。
  - 构造 `const library = new SkillLibrary(ctx)`，然后注册 provider；图标 `SparklesIcon`，订阅 `library.subscribe`。
- `packages/resources/skills/src/messages.ts`：加 `search.group.skills`。
- `packages/resources/skills/__test__/search.test.ts`（新）：库行 + place 行去重、大小写不敏感、tags 命中、avatar 来自 assets[0]、path 带 `view=list`、空 query 返回 `[]`。

**MCP**

- `packages/resources/mcp/src/library-store.ts`
  - 给 `McpLibrary` 增加公开方法 `catalog(): McpCatalog | null`：`state().value` 为 null 或 `scan === null` 时返回 null；否则 `buildCatalog(value.records, value.scan.answer, this.places(), [], value.scan.at, value.checks)`。复用现有合成逻辑，不在 provider 里重写。
- `packages/resources/mcp/src/search.ts`（新）
  - 输入 `McpServer[]` + query；匹配 `name` / `declaration` / `description`（与 `page.tsx:519-523` 一致）。
  - `avatar = markImage(server.mark) ?? undefined`；无头像时用 provider 的 `ServerIcon`。
  - `description` 只放 `server.description`，为空时省略（不要拿 declaration 充当注释）。
  - path `/mcp-servers?q=<query>&view=list`。
- `packages/resources/mcp/src/extension.ts`：`inject` 加 `"search"`；`new McpLibrary(ctx)` 后注册 provider；订阅 `library.subscribe`。
- `packages/resources/mcp/src/messages.ts`：加 `search.group.mcp`。
- `packages/resources/mcp/__test__/search.test.ts`（新）：用 `buildCatalog` 或手写 `McpServer`，覆盖 declaration 命中、空 description 不产生注释、markImage 映射、path。

**Plugins**

- `packages/resources/plugins/src/search.ts`（新）
  - 输入 `PluginLibraryValue | null`、`locale`、`t`、query；用现有 `composeRows(value.records, value.scanned, locale, t)` 得到 `PluginRow[]`。
  - 匹配 `name` / `description` / `tags`，与 `page.tsx:122` 一致。
  - `avatar = row.icon`（`PluginRow.icon` 已是 `assetRef` 后的 URL）。
  - path `/plugins?q=<query>&view=list`。
- `packages/resources/plugins/src/index.ts`：`inject` 加 `"search"`；`new PluginLibrary(ctx)` 后注册 provider；`t` 用 `(key) => ctx.i18n.t(key)` 闭包，不要直接传方法引用；订阅 `library.subscribe`。
- `packages/resources/plugins/src/messages.ts`：加 `search.group.plugins`。
- `packages/resources/plugins/__test__/search.test.ts`（新）：records + scanned 合成、avatar、tags 命中、空 query。

**Prompts**

- `packages/resources/prompts/src/search.ts`（新）
  - 输入 `PromptLibraryValue | null`、`assetUrl`、query；匹配 `name` / `description` / `prompt` / `tags`，与 `page.tsx:410-415` 一致。
  - `avatar = row.assets[0] ? assetUrl(row.assets[0]) : undefined`。
  - path `/prompts?q=<query>&view=list`。
- `packages/resources/prompts/src/index.ts`：`inject` 加 `"search"`；`new PromptLibrary(ctx)` 后注册 provider；订阅 `library.subscribe`。
- `packages/resources/prompts/src/messages.ts`：加 `search.group.prompts`。
- `packages/resources/prompts/__test__/search.test.ts`（新）：按 prompt 正文命中、avatar、空 description、path。

**Variables**

- `packages/resources/variables/src/search.ts`（新）
  - 输入 `VariableDocument | null` + query；匹配 `name` / `group`，与 `page.tsx:816-823` 一致。
  - **不读取也不返回 `value`**。
  - `description = variable.group`；没有 group 时省略。
  - path `/variables?q=<query>`。
- `packages/resources/variables/src/index.ts`：`inject` 加 `"search"`；`new VariableLibrary(ctx)` 后注册 provider；订阅 `library.subscribe`。
- `packages/resources/variables/src/messages.ts`：加 `search.group.variables`。
- `packages/resources/variables/__test__/search.test.ts`（新）：名字/分组命中、结果不含 value、path。

### 验收

```bash
pnpm --filter @context-hub/skills typecheck && pnpm --filter @context-hub/skills lint && pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/mcp typecheck && pnpm --filter @context-hub/mcp lint && pnpm --filter @context-hub/mcp test
pnpm --filter @context-hub/plugins typecheck && pnpm --filter @context-hub/plugins lint && pnpm --filter @context-hub/plugins test
pnpm --filter @context-hub/prompts typecheck && pnpm --filter @context-hub/prompts lint && pnpm --filter @context-hub/prompts test
pnpm --filter @context-hub/variables typecheck && pnpm --filter @context-hub/variables lint && pnpm --filter @context-hub/variables test
```

全部通过；此时还没有弹窗。provider 是否真的挂上，由阶段四的浏览器检查确认：弹窗里应出现五个资产分组；缺哪个就先查该模块的 `inject` 是否包含 `"search"`、`apply` 是否调用了 `ctx.search.register`。

---

## 阶段四：新建 global-search 插件并接管外壳

### 目标

Ctrl+K 与搜索按钮由插件贡献；外壳不再包含任何搜索实现。

### 新包 `packages/search/global-search`

文件：

- `package.json`
  - `name: "@context-hub/global-search"`，`private: true`，`type: "module"`。
  - scripts 照 `packages/resources/variables/package.json`：`lint` / `format` / `test` / `typecheck`。
  - dependencies：`@context-hub/extensions`、`@context-hub/shadcn-ui`、`lucide-react`、`react`、`react-router`（`^8.4.0`）。`CommandDialog` 的 portal 由 `@context-hub/shadcn-ui` 内部处理，本包不直接 import `react-dom`。
  - devDependencies 照 `packages/search/skills-sh/package.json`。
  - exports：`".": "./src/index.ts"`。
- `tsconfig.json`：照 `packages/resources/variables/tsconfig.json`（DOM + JSX + `react-jsx`），`include: ["src", "__test__"]`。
- `eslint.config.js`：照 `packages/resources/variables/eslint.config.js`（含 `reactHooks.configs.flat.recommended`）。
- `vitest.config.ts`：照 `packages/search/skills-sh/vitest.config.ts`，`name: "global-search"`，`include: ["__test__/**/*.test.ts"]`。
- `src/messages.ts`：英文 key（中文同步加到 zh-cn）：
  - `search.group.settings` = "Settings"
  - `search.group.extensions` = "Extensions"
  - `globalSearch.placeholder` = "Search skills, MCP servers, plugins, prompts, variables, settings…"
  - `globalSearch.empty` = "Type to search across Context Hub."
  - `globalSearch.noResults` = "No results for “{query}”."
  - `globalSearch.resultCount` = "{count} results"
  - `globalSearch.label` = "Search Context Hub"
  - `globalSearch.inputLabel` = "Search query"
  - `globalSearch.hint.navigate` = "↑↓ Navigate"
  - `globalSearch.hint.open` = "↵ Open"
  - `globalSearch.hint.close` = "Esc Close"
  - 按钮文案复用已有的 `header.search`（"Search context"），不要新增重复 key。
- `src/search.ts`
  - `searchSettings(t, query)`：固定表驱动，每项 `{ anchor, titleKey, descriptionKey?, groupTitleKey, groupDescriptionKey }`；匹配 item 的 title/description 与所属 group 的 title/description。表的内容固定为：
    - `appearance`：`settings.theme.title` / `settings.theme.description`、`settings.language.title` / `settings.language.description`、`settings.layout.title` / `settings.layout.description`；group 用 `settings.appearance.title` / `settings.appearance.description`
    - `install`：`settings.install.auto` / `settings.install.auto.description`、`settings.install.link` / `settings.install.link.description`、`settings.install.copy` / `settings.install.copy.description`；group 用 `settings.install.title` / `settings.install.description`
    - `images`：`settings.images.download.title` / `settings.images.download.description`；group 用 `settings.images.title` / `settings.images.description`
    - `about`：`settings.about.version`、`settings.about.home`、`settings.about.host`（没有 description）；group 用 `settings.about.title` / `settings.about.description`
    结果 `title = t(titleKey)`、`description = descriptionKey ? t(descriptionKey) : undefined`、`path = searchPath("/settings", query) + "#" + anchor`。锚点固定为 `appearance` / `install` / `images` / `about`。
  - `searchExtensions(entries, query)`：输入 `ExtensionView[]`，匹配 `manifest.name` / `manifest.id` / `manifest.description`（与 `apps/web/src/pages/extensions.tsx` 的 `matches` 一致）；结果 `title = manifest.name`、`description = manifest.description`、`icon = manifest.icon`、`path = searchPath("/extensions", query)`，`id = manifest.id`。
- `src/button.tsx`
  - `GlobalSearchButton`：header 贡献的 `Component`，无 props。
  - `useI18n` 取 `t`，`Kbd` 显示 `Ctrl K`；按钮样式照搬旧 `app-header.tsx` 的搜索按钮（`hidden lg:flex h-11 w-[280px] ...`）。
  - `useEffect` 注册 window `keydown`：`(meta|ctrl) + k` 时 `preventDefault()` 并 `setOpen((open) => !open)`；cleanup 移除。
  - `open ? <GlobalSearchDialog open onOpenChange={setOpen} /> : null`。
- `src/dialog.tsx`
  - 用 `@context-hub/shadcn-ui/components/command` 的 `CommandDialog` + `Command` + `CommandInput` + `CommandList` + `CommandEmpty` + `CommandGroup` + `CommandItem`，不手写输入框、遮罩、焦点陷阱、方向键或滚动。
  - `CommandDialog` 受控：`open` / `onOpenChange`（关闭时调 `onClose`）；`className` 覆盖成旧弹窗的 640px 宽度。
  - `Command shouldFilter={false} loop onValueChange={setQuery}`：cmdk 只负责“当前选中项”，匹配由各 provider 的 `search()` 负责。
  - `useHub` + `useExtensionSnapshot` 取 provider：`useMemo(() => ctx.extensions.contributions("search"), [ctx, snapshot.revision])`，避免每次渲染新数组导致订阅 effect 重挂。
  - `needle = query.trim()`；`needle === ""` 时渲染 `CommandEmpty` 的提示，不调用 provider。
  - 查询非空：按 provider 顺序 `flatMap`，每个 provider 的 `search(needle)` 用 try/catch 包住（第三方 provider 抛错时该组为空，不拖垮弹窗）；过滤 `title`/`description` 的空组。
  - 结果按 provider 分组；`CommandGroup heading={t(provider.labelKey)}`；每个结果 `CommandItem value={`${provider.labelKey}:${result.id}`} onSelect={() => { navigate(result.path); onClose() }}`。
  - 用 `useReducer` / `useState` 的 force update 订阅所有 `provider.subscribe`，让共享读取落地后弹窗自动刷新。清理函数在 `useEffect` 返回。
  - 行格式：
    - 左侧：`result.avatar` 存在时渲染 `<img src={result.avatar} className="size-8 rounded-md object-cover" alt="" />`；图片 `onError` 时回退到图标；否则 `const Icon = result.icon ?? provider.icon`，渲染 `<Icon className="size-4" />`。
    - 右侧：`<span className="truncate text-[13.5px] font-medium"><Highlighted text={result.title} needle={needle} /></span>`；`description` 非空（`trim() !== ""`）时渲染 `<span className="whitespace-pre-line text-xs leading-[15px] text-muted-foreground"><Highlighted text={result.description} needle={needle} /></span>`；为空不渲染。
  - 底部保留旧弹窗的按键提示与结果数（`globalSearch.hint.*` / `globalSearch.resultCount`）。
  - 去掉旧的筛选胶囊（All / Skills / MCP / Plugin），需求没有这一层。
- `src/index.ts`
  - `export const globalSearchExtension: ExtensionModule`：
    - `name: "hub.global.search"`。
    - `manifest`: `name: "Global search"`、`version: "0.1.0"`、`apiVersion: "^0.1"`、`kind: "code"`、`category: "integration"`、`description`、`icon: SearchIcon`、`defaultEnabled: true`、`permissions: []`。
    - `inject: ["header", "search", "locales"]`。
    - `apply`：
      - `ctx.header.register({ id: "global-search", order: 10, Component: GlobalSearchButton })`
      - `ctx.locales.register({ id: "en", label: "English", messages: globalSearchMessages })`
      - `ctx.search.register({ labelKey: "search.group.settings", icon: SettingsIcon, search: (query) => searchSettings((key) => ctx.i18n.t(key), query) })`
      - `ctx.search.register({ labelKey: "search.group.extensions", icon: BlocksIcon, search: (query) => searchExtensions(ctx.extensions.snapshot().entries, query) })`
- `__test__/search.test.ts`：settings 的 title/description/path/anchor、extensions 的 name/id/description 命中与 icon、空 query。

### 外壳与配置改动

- `apps/web/package.json`：dependencies 加 `"@context-hub/global-search": "workspace:*"`。
- `apps/web/src/lib/hub.ts`：导入 `globalSearchExtension`，放在 `variablesExtension` 之后、`claudeCodeExtension` 之前，让 settings / extensions 组排在资产组后面。
- `apps/web/src/components/app-layout.tsx`：删除 `searchOpen` / `closeSearch` / keydown effect / `SearchPalette` import 与渲染；`AppHeader` 不再传 `onOpenSearch`。
- `apps/web/src/components/app-header.tsx`：删除 `onOpenSearch` prop、按钮、`SearchIcon` 与 `Kbd` import；保留 breadcrumb、header contributions、`ThemeToggle`。
- 删除 `apps/web/src/components/search-palette.tsx`。
- `vitest.config.ts` 根配置：`projects` 加 `"packages/search/global-search/vitest.config.ts"`。

### 验收

```bash
pnpm --filter @context-hub/global-search typecheck
pnpm --filter @context-hub/global-search lint
pnpm --filter @context-hub/global-search test
pnpm --filter web typecheck
pnpm --filter web lint
```

搜索引用清理：

```bash
rg -n "search-palette|SearchPalette|onOpenSearch" apps packages
```

应无结果。

浏览器（此时页面还不读 `?q=`，只验弹窗）：

- 头部出现搜索按钮；Ctrl+K 打开/关闭；Esc 关闭。
- 输入资产名能看到 skills / mcp / plugins / prompts / variables 分组；设置、扩展分组存在。
- 空查询显示提示；无结果显示“No results”。
- ↑↓ 不越界，Enter 改变 URL，Esc 关闭。
- 在 Extensions 页关闭 Global search 后，按钮和 Ctrl+K 消失；重新启用后恢复。

---

## 阶段五：让页面按 URL 查询并高亮命中

### 目标

全局搜索跳到页面后，页面读取 `?q=`、过滤、切到列表、高亮；用户在页面里输入也写回 URL。

### 通用实现（四个有视图切换的资产页）

为避免五个资源包各加一份 `react-router` 依赖和一份同样的读写逻辑，`q`/`view` 的地址约定收进 `@context-hub/extensions/react` 的 `useSearchPage()`（`packages/extensions/src/react.tsx`）。它内部用 `useSearchParams` + 函数式 setter + `{ replace: true }`；页面只写：

```ts
const search = useSearchPage()
const [localView, setLocalView] = React.useState<"grid" | "list">(settings.layout)
const view = search.listView ? "list" : localView
const chooseView = (next: "grid" | "list") => {
  search.clearListView()
  setLocalView(next)
}
const query = search.query
const setQuery = search.setQuery
```

- 只有 `@context-hub/extensions` 新增 `react-router` 依赖；五个资源包不加。
- 删除本地的 `const [query, setQuery] = React.useState("")` 与 `const [view, setView] = React.useState(...)`。
- 两个 `ViewButton` 的 `onClick` 改调 `chooseView`。
- `FilterBar` 的 `onQuery` 继续调用 `setQuery`，其余清空选中/重置页码的逻辑保留。
- `needle = useSettled(query)`（prompts 仍 `.trim().toLowerCase()`；mcp 按现有方式 lower）。
- 高亮改用 `import { Highlighted } from "@context-hub/extensions/components"`，删除本文件里的本地 `Highlighted`。

### 各页具体改动

**Skills**

- `packages/resources/skills/src/page.tsx`
  - 按通用实现替换 query/view。
  - `SkillTable` 的 name / description 用共享 `Highlighted`（仓库已有调用，只换 import）。

**Plugins**

- `packages/resources/plugins/src/page.tsx`
  - 按通用实现替换 query/view。
  - `PluginTable` 的 name / description 用共享 `Highlighted`。

**MCP**

- `packages/resources/mcp/src/page.tsx`
  - 按通用实现替换 query/view。
  - 给 `ServerListView` 传 `needle={query.trim()}`。
- `packages/resources/mcp/src/list-view.tsx`
  - props 增加 `needle: string`。
  - server 名称与 description 用 `Highlighted`；description 为空时仍显示 `t("mcp.description.missing")`，不高亮。

**Prompts**

- `packages/resources/prompts/src/page.tsx`
  - 按通用实现替换 query/view（`needle` 保留现有 `useSettled(query).trim().toLowerCase()`）。
  - ledger 的 `columns` 里 name / description 用 `Highlighted`。

**Variables**

- `packages/resources/variables/src/page.tsx`
  - `const search = useSearchPage()`；`query = search.query`；`onChange` 调 `search.setQuery`，不涉及 view。
  - 行内 variable name 与 group `Badge` 用 `Highlighted`。

**Extensions 页（shell）**

- `apps/web/src/pages/extensions.tsx`
  - 用 `useSearchPage` 取代本地 `query`；输入框 `onChange` 调 `search.setQuery`。
  - `ExtensionRow` 增加 `needle` prop，name / description 用 `Highlighted`。
  - `matches` 逻辑不变。

**Settings 页（shell）**

- `apps/web/src/pages/settings.tsx`
  - `useSearchPage` 读 `q`；不新增输入框。
  - `useLocation().hash`；`useEffect` 中：
    ```ts
    const id = hash.replace(/^#/, "")
    if (id === "") return
    document.getElementById(id)?.scrollIntoView({ block: "start" })
    ```
  - `Group` 增加 `id` prop，四个调用点分别传 `appearance` / `install` / `images` / `about`；`section` 加 `scroll-mt-24`（顶部 header 是 64px）。
  - `Group` 的标题/描述、`SettingText` / `SettingRow` 的标题/描述、`InstallChoiceCard` 的标题/描述、关于区的标签文案，全部用共享 `Highlighted` 包住。组件 props 可以从 `string` 放宽到 `React.ReactNode`，由调用方传入高亮后的节点。
  - 不改变任何设置行为。

### 验收

```bash
pnpm --filter @context-hub/skills typecheck && pnpm --filter @context-hub/skills lint
pnpm --filter @context-hub/mcp typecheck && pnpm --filter @context-hub/mcp lint
pnpm --filter @context-hub/plugins typecheck && pnpm --filter @context-hub/plugins lint
pnpm --filter @context-hub/prompts typecheck && pnpm --filter @context-hub/prompts lint
pnpm --filter @context-hub/variables typecheck && pnpm --filter @context-hub/variables lint
pnpm --filter web typecheck && pnpm --filter web lint
```

浏览器逐项验证：

- 从全局搜索选一个 skill：URL 变成 `/skills?q=<query>&view=list`，输入框有值，列表过滤，命中文字高亮。
- 已在 `/skills` 的卡片视图时再次全局搜索：仍切到列表（`view=list` 生效）。
- 在页面里输入：URL 的 `q` 跟着更新（replace，不产生大量历史）；清空后 `q` 和 `view` 都消失，视图回到本地选择。
- MCP / Plugins / Prompts 同上；MCP 的 list 行有高亮，卡片不高亮。
- Variables：URL `?q=`，名字/分组高亮。
- Extensions：URL `?q=`，扩展名/描述高亮。
- Settings：搜索 “Theme” 等，跳到 `/settings?q=...&...` 的 `#appearance`，页面滚到对应分组，标题/描述高亮；浏览器前进/后退可用。
- 浏览器刷新带 `?q=` 的 URL：查询和高亮仍在（URL 是事实来源）。

---

## 阶段六：补齐测试、文案、文档与收尾

### 目标

让新增行为有自动化覆盖，中文没有回退，README 与新事实一致，AOCI 收尾。

### 改动文件

- 测试：阶段一至五列出的 `__test__/search.test.ts`、`library-store.test.ts`、`preload.test.ts`。如果某个纯函数在实现时被合并/改名，测试随之调整，不保留空壳。
- `packages/i18n/zh-cn/src/messages.ts`
  - 补齐阶段一至四新增的所有英文 key：`search.group.*`、`globalSearch.*`。
  - 更新 `variables.list.hint`。
- `README.md`
  - “Where an asset page's data comes from”：四个库改成五个，加入 `catalog.variables`；`preload.ts` 的描述改成五个。
  - 增加一句：全局搜索由 `@context-hub/global-search` 通过 `search` 贡献点读取这些共享库，外壳只提供 header slot。
- `docs/memory.md`
  - 只有在本轮实际踩到修正（例如 URL 查询导致焦点/历史问题、react-router 依赖、变量预读时机）时，按仓库格式追加一条；不要为计划本身写日志。

### 验收

```bash
pnpm --filter @context-hub/zh-cn test
pnpm typecheck
pnpm lint
pnpm test
```

全绿。中文包测试不允许任何英文 key 缺失。

### 最终浏览器验收（隔离 home）

```bash
CONTEXT_HUB_HOME="$(mktemp -d)" pnpm dev
```

用 `ego-browser`（AGENTS.md 指定的浏览器自动化）或手动在 `http://localhost:5271` 验证：

| 检查 | 期望 |
| --- | --- |
| 启动 Network | 在打开 `/variables` 之前已有 `/hub/variables` 请求 |
| Ctrl+K / 头部按钮 | 弹窗打开；Esc 关闭；再按 Ctrl+K 关闭 |
| 分组 | Skills、MCP servers、Plugins、Prompts、Environment variables、Settings、Extensions，顺序与 catalog 一致 |
| 行格式 | 有头像显示头像；无头像显示结果/模块 icon；标题一行；有注释才显示且换行保留 |
| 键盘 | ↑↓ 环绕；Enter 打开；输入框 `aria-activedescendant` 指向当前行 |
| 高亮 | 弹窗标题/注释、资产列表行、variables 行、extensions 行、settings 标题/描述 |
| 设置跳转 | `#appearance` 等锚点滚动正确，且设置项高亮 |
| 空查询/无结果 | 分别显示提示与 “No results” |
| 中文 | 切到中文后新增 key 不回落英文 |
| 插件开关 | Extensions 页关闭 Global search 后按钮/Ctrl+K 消失；重新启用恢复 |
| 页面输入 | URL `q` 同步；刷新保留；清空移除 `q`/`view` |
| 同页搜索 | 已在资产页时从全局搜索再选一条，仍切到列表并高亮 |

### AOCI 收尾

本轮会新增受管理对象（新包、`search.ts`、`highlight.tsx`、新贡献点），删除 `apps/web/src/components/search-palette.tsx`，并改动多个现有文件。所有代码和文档达到最终稳定状态后：

1. 本会话已通过 `aoci_rules` + 完整 `aoci_overview` 建立当前认知合同（Challenge 10/10，cognition_governed），不要在同一认知周期重复调用 `aoci_rules`；只有当合同不再可靠时才重新读取。
2. 调一次 `aoci_maintain`。
3. 有候选时由 Host 模型基于证据创作完整标签与 F/R/A/S，按机器签发的批次用 `aoci_update_entry` 提交；保留 `source_sha256` / `candidate_id`。
4. 有 `repair_required` / `stopped` 按工具返回的结构化状态处理，不猜写。
5. 维护完成后再改任何受管理对象，重新做一次收尾。

### 计划归档

用户明确确认计划完成、实现验收通过后，把本文件移到 `docs/plans/archive/`；实现过程中不要提前移动。

---

## 执行方式

- 计划获批后，用 `TaskCreate` 按六个阶段各建一条任务，`subject` 用阶段名；开始某阶段前 `TaskUpdate` 标 `in_progress`，验收通过后立刻 `completed`。
- 计划需要调整时，先更新任务列表和本文件，再动手。
- 每个阶段结束仓库必须可运行；任何阶段不能留下未使用的 import、变量或半删的 API。

## 不做（防止范围蔓延）

- 不搜索导航页、工作区、Agent、语言包本身；只做用户列出的资产、设置、环境变量、扩展。
- 不搜索环境变量的值；不搜索 skill / prompt 的文件正文（prompt 只按现有 `prompt` 字段匹配，结果注释只放 description）。
- 不给设置页新增搜索输入框，不重排设置分组。
- 不把卡片视图加高亮；只按现有约定在列表/表格高亮。
- 不做模糊匹配、拼音、分词、相关性排序；只做现有页面同款的大小写不敏感子串匹配。
- 不把 `search` 改成 async，不加服务端搜索接口，不加搜索历史/最近项。
- 不改环境变量选择器（`packages/resources/variables/src/components/variable-picker.tsx` 仍按需自读）；本轮只上收页面读取。
- 不改 `FilterBar` 的 `/` 快捷键、分页、标签筛选、视图切换的其它行为。
- 不新造弹窗视觉；直接使用仓库已有的 `CommandDialog` / `Command` 组件，只保留需求里的结果行格式与底部提示。
- 不把全局搜索做成可排序/可配置的 header 控件；只注册一个 header 贡献。

## 风险与已知限制

1. **同步 search 的上限**：provider 只能读内存快照。MCP 探针、插件客户端命令的结果可能晚于首屏；`subscribe` 让弹窗在结果落地后刷新，但首帧仍可能为空。
2. **react-router 依赖集中**：`@context-hub/extensions` 与 `@context-hub/global-search` 新增 `react-router`；五个资源包通过 `useSearchPage()` 使用，不各自声明。需要 `pnpm install` 更新 lockfile。代价是：任何渲染这些页面的非 Router 宿主都必须提供 Router context，否则 `useSearchPage` / `useNavigate` 会抛错；本轮只有 `apps/web` 一个宿主，计划接受。
3. **URL 驱动的副作用**：页面输入每次 keystroke 都会 `replace` 导航。需要在浏览器里确认输入框不丢焦点、不产生历史记录膨胀；若出现焦点问题，退回“本地 query + `?q=` 仅作为初值”的方案，但要接受同页搜索不切换视图的边缘情况。
4. **`view=list` 是额外 URL 参数**：用户原话只要求 `?q=`。这是为了在同页导航时也能保证高亮可见；如果用户不接受，删除该参数，改为页面挂载时按 `q` 初始化视图（同页导航的边缘情况保留）。
5. **设置 provider 是静态表**：`packages/search/global-search/src/search.ts` 手写了设置项与锚点的映射。设置页新增/改名一行时必须同步更新，否则搜索漏项。计划接受这个耦合，因为设置页是 shell 页、不是 extension。
6. **变量预读的时效**：启动时读一次；如果另一个进程在运行中改了环境变量，页面在本次会话里不会自动看到，除非重新加载页面（catalog 仍是 ready，`load()` 不会重读）。这是“启动预加载”的固有取舍；若需要，可后续加刷新入口，不在本轮。
7. **全局搜索插件失败即无搜索**：按需求删除外壳实现后，插件激活失败或被禁用时，Ctrl+K 和按钮都不存在。这是“搜索必须由插件提供”的直接后果。
8. **高亮只标第一次出现**：沿用现有行为；一个查询在标题和注释里各标一次（两个字段分别处理），字段内只标第一处。
