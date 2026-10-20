# Ctrl+K 全局搜索：按结果标题精确筛选，且不覆盖用户布局

## 背景

用户报告 Ctrl+K 全局搜索有两个问题：

1. 从搜索结果跳转后，资产页被强制切成 `list` 布局。布局是用户在设置里选的（`settings.layout`），跳转不应该改它。
2. 跳转后的筛选词用的是用户在 Ctrl+K 里输入的模糊词，而不是被点击结果自己的标题。例如输入 `claude`，点击 `claude-hud`，目标页应该以 `claude-hud` 筛选；现在带过去的是 `claude`。

当前行为（基线 commit `a25f91e`）：

- 五个资源 provider 构造 path 时把输入 query 原样写进 `?q=`，其中四个还额外写 `view=list`：
  - `packages/resources/skills/src/search.ts:70`（`searchSkills`，PAGE=`/skills`）
  - `packages/resources/plugins/src/search.ts:62`（`searchPlugins`，PAGE=`/plugins`）
  - `packages/resources/prompts/src/search.ts:68`（`searchPrompts`，PAGE=`/prompts`）
  - `packages/resources/mcp/src/search.ts:61`（`searchServers`，PAGE=`/mcp-servers`）
  - `packages/resources/variables/src/search.ts:55`（`searchVariables`，PAGE=`/variables`，只有 `q`）
- `packages/extensions/src/react.tsx:175-230` 的 `useSearchPage()` 暴露 `query/setQuery/listView/clearListView`；`listView` 在 `:196` 读 `params.get("view") === "list"`，`clearListView` 在 `:217-227` 删 `view`，`setQuery` 清空时在 `:205` 也删 `view`。
- 四个资产页都有同一段强制列表逻辑：
  - skills `page.tsx:944-949`、plugins `page.tsx:732-737`、prompts `page.tsx:379-384`、mcp `page.tsx:432-437`
  - `const [localView, setLocalView] = React.useState(...settings.layout)`
  - `const view = search.listView ? "list" : localView`
  - `chooseView = (next) => { search.clearListView(); setLocalView(next) }`
  - 布局按钮分别调用 `chooseView`：skills `:1381/:1387`、plugins `:1199/:1205`、prompts `:794/:800`、mcp `:668`。
- 外壳自己的两个 provider 也把输入 query 写进 path：
  - `packages/search/global-search/src/search.ts:219`（shell 设置行，`/settings?q=<query>#anchor`）
  - `:240`（插件贡献的设置 section，同样带 `#anchor`）
  - `:269`（扩展行，`/extensions?q=<query>`）
- 设置页只用 `q` 做 `Highlighted` 高亮，靠 `#anchor` 滚动（`apps/web/src/pages/settings.tsx:358-369`）；扩展页用 `q` 过滤（`apps/web/src/pages/extensions.tsx:52-57`、`:198-221`）。

根因：provider 把「搜索时输入什么」和「点击后要筛什么」当成了同一件事，并通过 `view=list` 把「搜索跳转」和「页面布局选择」也耦合在一起。

## 期望行为

1. 点击任意结果，目标页的 `?q=` 等于该结果的 `SearchResult.title`（就是 provider 自己写进结果的标题/名称），不是 Ctrl+K 的输入词。
2. 跳转 path 不再出现 `view` 参数；目标页布局只由 `settings.layout`（挂载初值）和页面内的布局按钮（本地状态）决定。
3. 设置页点击结果继续带 `#anchor`，`q` 改为该设置行的标题；扩展页 `q` 改为该扩展的标题。
4. 页面已有的 `?q=` 输入/过滤/高亮、`settings.layout` 初值、本地布局切换全部保留。

## 已核对事实

- `SearchResult.title` 在各 provider 里就是行自身的名字：
  - skills `push(name, ...)` 里 `title: name`
  - plugins `title: row.name`
  - prompts `title: row.name`
  - mcp `title: server.name`
  - variables `title: variable.name`
  - settings `title = t(entry.titleKey)` / section `title = t(section.titleKey)`
  - extensions `title = localized(entry.manifest.name, locale)`
- 四个资产页的筛选词来自 `useSearchPage().query`，且筛选算法是「字段包含 needle」（大小写不敏感）。用结果名做 `q` 一定会命中该行；如果别的行也包含这个子串，仍可能同时出现，这是页面既有过滤语义，不在本次改动范围。
- `settings.layout` 只由设置页写入（`apps/web/src/pages/settings.tsx:576`），palette 不写设置；四个资产页只在挂载时用 `settings.layout` 初始化本地状态。
- `searchPath` 在 `packages/extensions/src/search.ts:21-32`，经 `packages/extensions/src/index.ts:15` 的 `export * from "./search.ts"` 从根入口公开导出。仓内调用方只有上述 7 个 provider 和 `packages/extensions/__test__/search.test.ts:45/:78/:81`；`extra` 参数目前只有 `{ view: "list" }` 一个调用点。
- `SearchPage` 的仓内调用方共 7 个：五个资源页 + `apps/web/src/pages/settings.tsx` + `apps/web/src/pages/extensions.tsx`；其中只有四个资产页读 `listView`/`clearListView`。
- 没有 `useSearchPage` 的组件测试；`packages/extensions` 的测试只覆盖 `searchPath` / `matchesQuery` / kernel 注册。布局行为只能靠 typecheck、代码搜索和真机验收确认。
- 测试命令来自根 `package.json`：`test`=`vitest run`、`typecheck`=`turbo typecheck`、`lint`=`turbo lint`；各包有自己的 `test`/`typecheck`/`lint`。根 `vitest.config.ts` 的 project 名是 `skills`、`plugins`、`prompts`、`mcp`、`variables`、`extensions`、`global-search`。
- 归档计划 `docs/plans/archive/global-search-plugin.md:590` 本来就记录过：`view=list` 是为了同页导航时保证高亮可见而加的可选项，用户不接受就删掉。本次正是这个决定。

## 不做

- 不改 `searchPath` 的公开签名、实现和它的测试；即使仓内不再传 `extra`，也保留该参数给第三方 provider。
- 不改 `packages/search/global-search/src/dialog.tsx` 的导航逻辑（`navigate(row.path)`）。
- 不改页面过滤算法（仍是子串包含，不改成精确匹配）。
- 不改 `settings.layout` 的存储、默认值和设置页的布局选项。
- 不新增把旧 URL 里的 `view=list` 自动清理的逻辑；该参数在删除读取方后就是无效果参数。
- 不改已归档计划文档，不手改 `aoci.txt`。

## 阶段一：按结果标题生成资源页路径

**目标**：五个资源 provider 的每个结果都用自己的名字生成 `?q=`，且不再写 `view=list`。

**改动文件**

- `packages/resources/skills/src/search.ts`
- `packages/resources/plugins/src/search.ts`
- `packages/resources/prompts/src/search.ts`
- `packages/resources/mcp/src/search.ts`
- `packages/resources/variables/src/search.ts`
- 对应的五个 `__test__/search.test.ts`

**具体改法**

| 文件:行 | 位置 | 现在 | 改成 |
| --- | --- | --- | --- |
| `skills/src/search.ts:70` | `push` 闭包内 | `searchPath(PAGE, query, { view: "list" })` | `searchPath(PAGE, name)` |
| `plugins/src/search.ts:62` | `.map((row) => ...)` 内 | `searchPath(PAGE, query, { view: "list" })` | `searchPath(PAGE, row.name)` |
| `prompts/src/search.ts:68` | `.map((row) => ...)` 内 | `searchPath(PAGE, query, { view: "list" })` | `searchPath(PAGE, row.name)` |
| `mcp/src/search.ts:61` | `.map((server) => ...)` 内 | `searchPath(PAGE, query, { view: "list" })` | `searchPath(PAGE, server.name)` |
| `variables/src/search.ts:55` | `.map((variable) => ...)` 内 | `searchPath(PAGE, query)` | `searchPath(PAGE, variable.name)` |

注意：skills 的 `query` 仍用于 `matchesQuery`，只改 path；plugins/prompts 的 `query` 仍用于 filter；MCP/variables 同理。不要删 `query` 参数。

**测试断言**

- skills（`skills/__test__/search.test.ts:71-75`）：输入 `"pdf"` 命中 `pdf-extract`（库行）和 `pdf-forms`（place 行），断言两条 path 分别是 `/skills?q=pdf-extract`、`/skills?q=pdf-forms`。这同时覆盖「输入词不等于结果名」的场景。
- plugins（`plugins/__test__/search.test.ts:57-61`）：输入 `"engineer"`，首条 path 是 `/plugins?q=engineering-kit`。
- prompts（`prompts/__test__/search.test.ts:50-54`）：把输入从 `"changelog"` 改成 `"rewrite"`（按正文命中），断言首条 path 是 `/prompts?q=changelog`；否则输入本来就等于标题，测不出行为变化。
- mcp（`mcp/__test__/search.test.ts:55-59`）：输入 `"git"`，首条 path 是 `/mcp-servers?q=github`。
- variables（`variables/__test__/search.test.ts:46-50`）：输入 `"anthropic"`，首条 path 是 `/variables?q=ANTHROPIC_API_KEY`。
- 五个测试标题里「in the list view that marks the query」改成「by the row's own title/name」之类的描述，和新行为一致。

**验收判据**

```bash
pnpm exec vitest run --project skills --project plugins --project prompts --project mcp --project variables
```

五个 project 全绿；`view=list` 的旧期望已不存在，path 断言通过即证明跳转地址只带 `q`。

## 阶段二：按结果标题生成外壳页路径

**目标**：设置页和扩展页的跳转 `q` 也改成被点击行的标题；设置页继续带 `#anchor`。

**改动文件**

- `packages/search/global-search/src/search.ts`
- `packages/search/global-search/__test__/search.test.ts`

**具体改法**

| 文件:行 | 位置 | 现在 | 改成 |
| --- | --- | --- | --- |
| `global-search/src/search.ts:219` | `searchShellSettings` 的 `flatMap` | `` `${searchPath("/settings", query)}#${entry.anchor}` `` | `` `${searchPath("/settings", title)}#${entry.anchor}` `` |
| `global-search/src/search.ts:240` | `searchSections` 的 `flatMap` | `` `${searchPath("/settings", query)}#${section.id}` `` | `` `${searchPath("/settings", title)}#${section.id}` `` |
| `global-search/src/search.ts:269` | `searchExtensions` 的 `flatMap` | `searchPath("/extensions", query)` | `searchPath("/extensions", name)` |

`query` 仍用于 `matchesQuery`，不要删。

**测试断言**（`global-search/__test__/search.test.ts`）

- `:66-74` 输入 `"dark"`（只命中描述），path 从 `/settings?q=dark#appearance` 改成 `/settings?q=Theme#appearance`。
- `:77-81` 输入 `"images"`（按分组命中），path 从 `/settings?q=images#images` 改成 `/settings?q=Download+remote+cover+images#images`。
- `:83-92` 输入 `"time of day"`，path 改成 `/settings?q=Time+of+day#extensions`。
- `:98-107` 插件 section：输入 `"skill updates"`，path 改成 `/settings?q=Skill+updates#skills-updates`。
- `:131-136` 扩展标记测试：把输入从 `"hello"` 改成 `"acme.hello"`（只命中 id），断言 path 是 `/extensions?q=Hello`。这样能证明 q 来自标题而不是输入。
- 空格经 `URLSearchParams` 编码成 `+`，上面的期望值按此写。

**验收判据**

```bash
pnpm exec vitest run --project global-search
```

全绿；`searchSettings(t, "dark")` 的 path 断言已从 `q=dark` 改成 `q=Theme`，证明 q 来自行标题。

## 阶段三：移除强制列表机制

**目标**：删掉 `view=list` 的读取方和页面里的强制列表包装，让布局只由 `settings.layout` 初值和页面本地状态决定。

**改动文件**

- `packages/extensions/src/react.tsx`
- `packages/resources/skills/src/page.tsx`
- `packages/resources/plugins/src/page.tsx`
- `packages/resources/prompts/src/page.tsx`
- `packages/resources/mcp/src/page.tsx`

**`useSearchPage` 改法**

1. `SearchPage` 接口只保留 `query` 和 `setQuery`；删除 `listView`、`clearListView` 两个字段及其 JSDoc。
2. 删除 `:196` 的 `const listView = ...`、`:217-227` 的 `clearListView`、`:229` 返回对象里的两个字段。
3. `setQuery` 清空时只 `updated.delete("q")`；删除 `updated.delete("view")`，并把 `SearchPage.setQuery` 的注释里「clearing it drops the palette's list request too」删掉。
   - 理由：本次之后没有代码写 `view`，也没有代码读 `view`。保留这条删除会让函数继续暗示一个已经不存在的契约；旧链接上的 `?view=list` 只是一个被忽略的参数，不产生行为。等哪天真的需要清理旧 URL，再按那时的约定处理。
4. `params` 仍用于 `params.get("q")`，`setParams` 仍用于写入；不要顺手改成别的地址参数机制。

**四个页面改法（同一形状）**

以 skills 为例，当前 `:942-949` 是注释 + `localView` + `view` 别名 + `chooseView`。改成：

```tsx
const settings = useSettings()
const search = useSearchPage()
const [view, setView] = React.useState<"grid" | "list">(settings.layout)
```

- 删除「A result from the global search asks for the list view...」整段注释。
- 布局按钮从 `onClick={() => chooseView("grid")}` / `chooseView("list")` 改成 `setView("grid")` / `setView("list")`（skills `:1381/:1387`、plugins `:1199/:1205`、prompts `:794/:800`）。
- MCP 用 `const [view, setView] = React.useState<ViewId>(settings.layout)`，`<ToolbarActions view={view} onView={setView} ...>`（`:666-668`）。
- `search` 变量继续保留，因为同一页面还用 `search.query` / `search.setQuery`。
- 不改 `settings.layout` 的读取方式和本地状态初值。

**验收判据**

```bash
pnpm --filter @context-hub/extensions typecheck
pnpm --filter web typecheck
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/plugins typecheck
pnpm --filter @context-hub/prompts typecheck
pnpm --filter @context-hub/mcp typecheck
```

再跑代码搜索（排除测试目录；`docs/` 不在搜索范围内），这些符号不应再有输出：

```bash
rg -n "listView|clearListView|chooseView|view: \"list\"" packages apps \
  --glob '!**/node_modules/**' --glob '!**/__test__/**'
```

期望无输出。`packages/extensions/__test__/search.test.ts:78` 对 `searchPath(..., { view: "list" })` 的断言保留不动，所以搜索要排除 `__test__`。

## 阶段四：全量验证与收尾

**目标**：确认整个仓库的测试、类型和 lint 都通过，并在真实页面验证布局不再被跳转改变。

**验证命令**

```bash
pnpm exec vitest run --project skills --project plugins --project prompts --project mcp --project variables --project extensions --project global-search
pnpm test
pnpm typecheck
pnpm lint
```

说明：前一条是本次改动最相关的七个 project；`pnpm test` 是仓库全量 vitest（包含 `apps/web`、`apps/desktop`、`scripts`）；`pnpm typecheck` / `pnpm lint` 是根 `package.json` 的 turbo 全量任务。

**真机验收（环境允许时）**

1. `pnpm dev:web`（hub 5270 / Vite 5271，端口定义在 `apps/web/hub-port.ts`）。
2. 在设置页把布局设成与当前资产页不同的值（例如 grid），然后打开 Ctrl+K，输入一个只命中某条结果的关键词。
3. 点击一条标题与输入词不同的结果（例如输入 `claude`，点 `claude-hud`）。
4. 预期：URL 为 `/skills?q=claude-hud`（无 `view` 参数）；布局仍是第 2 步设置的 grid；页面筛选框显示 `claude-hud`，列表只剩匹配行。
5. 对 `/settings` 和 `/extensions` 各点一条，预期 URL 的 `q` 是点击行标题，设置页仍滚动到对应 `#anchor`。
6. 如果本机没有标题与输入词不同的数据，先用任意一条结果验证「URL 的 q 等于该结果标题」，不要只看页面是否过滤。

**收尾**

- 按 `AGENTS.md` 的持续改进循环，把这次用户纠正的模式追加到 `docs/memory.md`：搜索跳转必须携带被点击结果的标题，且不得用跳转参数覆盖用户的布局设置。
- 代码稳定后调用一次 `aoci_maintain`，更新受影响的认知条目（7 个 `search.ts`、`react.tsx`、4 个资产页 `page.tsx`）；不要手改 `aoci.txt`。当前 `aoci.code.txt` 里这些条目仍写着 `view=list` / `q/view`。

## 风险

- `SearchPage.listView` / `clearListView` 是 `@context-hub/extensions/react` 的公开接口，删除对第三方页面是 breaking change；仓内调用方只有四个资产页，已全部覆盖。若外部页面用到它们，需要各自改为本地 `useState`。
- `searchPath` 签名保留，因此外部 provider 不会编译失败；但复制了旧写法（`searchPath(PAGE, query, { view: "list" })`）的第三方 provider 不会自动获得本修复，仍会按输入词筛选并写 `view`。仓内没有这类调用方。
- 网格布局本来就不高亮匹配文字，高亮只在列表/表格里出现；本次不强制列表后，grid 用户只会看到过滤结果，不会看到高亮。这是保留用户布局设置的直接代价，符合用户要求。
- 子串过滤意味着 `q=结果标题` 仍可能同时命中标题包含该子串的其他行；本次只改 q 的来源，不改过滤算法。
- 从同一页面打开 Ctrl+K 时，页面已有的 tag / scope 收窄状态不会因为跳转而重置（如 skills/plugins/prompts 的 `tag`、MCP 的 `tag`/`activeTab`/`narrowed`）。如果点击的结果不在当前收窄范围内，它仍可能被这些既有过滤器挡住。这是既有行为，本次不改；用户报告的场景不涉及它。
- 旧书签/历史记录里的 `view=list` 在删除读取方后不再生效，参数可能继续留在 URL 里，直到页面重新写入 `q` 或用户手动清掉；不影响行为。
- 真机验收依赖本机数据；如果没有合适的「输入词 ≠ 结果标题」样本，只能验证 q 等于标题，无法完整复现用户场景。

## 自审

- 文件与行号已在 commit `a25f91e` 上逐一核对：7 个 provider、`react.tsx`、4 个页面、6 个要改的测试文件均存在，行号与 grep 结果一致；`extensions/__test__/search.test.ts` 只保留不改。
- 删除项的所有仓内调用方已用 `rg` 枚举：`listView`/`clearListView` 只在 `react.tsx` 和 4 个资产页；`chooseView` 只在 4 个资产页；`view: "list"` 只在 4 个 provider 和 `extensions/__test__/search.test.ts`。没有漏掉 settings/extensions 页（它们只用 `query`/`setQuery`）。
- 阶段顺序可执行：阶段一/二只改 path，页面仍读 `view` 也不影响（没人再写它）；阶段三再删读取方。每个阶段结束时仓库可运行。
- 测试期望值按 `URLSearchParams` 的真实编码写（空格为 `+`）；prompts 测试特意改了输入，避免「输入恰好等于标题」导致测试测不出变化。
- 验证命令均来自根 `package.json` 或各包 `package.json` / `vitest.config.ts`，project 名与实际配置一致。
- 没有在本计划阶段修改任何源码；`aoci.txt` 的更新留给实现收尾的 `aoci_maintain`。
- 剩余不确定项：没有 `useSearchPage` 的组件级测试，布局行为只能靠 typecheck + 代码搜索 + 真机验收；真机验收依赖本机是否有「输入词 ≠ 结果标题」的数据（已在上面的验收步骤里给出降级判据）。
