# 资产详情弹窗补齐 Agent 持有标记，并下移提示词 token 行

## 背景与现状（已核对源码）

Skills 的详情弹窗已经在标题下的 `DialogDescription` 里画了一条来源行：
`packages/resources/skills/src/skill-detail-dialog.tsx:719-721` 渲染 `<ProvenanceLine skill={skill} />`。
`ProvenanceLine`（`packages/resources/skills/src/provenance-line.tsx:22-65`）由「来源图标 + 来源文案 + Agent 头像组」构成，
头像组是共享组件 `AvatarStack`（`packages/extensions/src/components/avatar-stack.tsx:38-88`）：
每个 mark 20px、重叠步进 13px、默认最多 5 个，超出时最后一格画 `+N`，`title` / `aria-label` 给出 Agent 名称。
`ProvenanceLine` 本身绑定了 skills 的 `Skill` 类型和 `./library.ts` 的 `holdsOf` / `useReadablePlaces`，
**不能跨包复用**；可复用的是底层的 `AvatarStack`。

其余三个详情弹窗的现状：

- Prompts：`packages/resources/prompts/src/prompt-detail-dialog.tsx` 的 `InfoPanel`（550 行起）标题下是
  `<PromptMeta body={prompt.prompt} />`（598-600 行），显示「本地 · 304 tokens」。
  `PromptMeta` 在 `packages/resources/prompts/src/parts.tsx:45-60`。
  更新时间在面板底部（645-654 行），前面已经有一条 `Rule`（`prompt-detail-dialog.tsx:528-534` 包了 shadcn `Separator`）。
  Agent 持有数据已经存在：`Lightbox` 用 `useHolds(prompt, places, files, stamp + own)` 得到 `Holds`
  （`prompt-detail-dialog.tsx:893`），并把它传给 `InfoPanel`（972-973 行）。
  卡片侧已有同样的头像组实现：`heldMarks(...)`（`packages/resources/prompts/src/deliver.ts:251-272`）+ `AvatarStack`
  （`packages/resources/prompts/src/page.tsx:292-295, 346-350`）。`heldMarks` 按 `place.agent` 去重，
  所以同一 Agent 的 workspace/global 两个位置只画一个 mark。
- Plugins：`packages/resources/plugins/src/detail-dialog.tsx` 的 `InfoPanel`（1019 行起）标题下是
  `DialogDescription`（1064-1076 行），显示「vX · 来源」，还没有 Agent 标记。
  数据已在 `plugin.held: PluginHeldBy[]`（`packages/resources/plugins/src/types.ts:35-60, 118-119`），
  每个元素带 `client / label / icon / places / enabled / id`，天然按 Agent 去重。
  页面侧的 `HolderStack`（`packages/resources/plugins/src/page.tsx:204-214`）已经把这批数据画成 `AvatarStack`，
  卡片和列表都在用（459、604 行），但它是 `page.tsx` 内的私有函数，详情弹窗拿不到。
- MCP：`packages/resources/mcp/src/server-dialog.tsx` 的 `ServerPanel`（439 行起）标题下是
  一个普通 `div`（483-490 行），显示「插件图标 + transport · N 个位置」，还没有 Agent 标记。
  `parts.tsx` 里已经有现成的 `AgentStack`（`packages/resources/mcp/src/parts.tsx:116-137`）：
  它用 `heldPlaces`（98-108 行）从 `server.detail.installs` 过滤 `installed === true`，
  再按 `McpAgentPlace[]` 的顺序画 `AvatarStack`；一个客户端文件一个 mark。
  列表页和卡片页已经用它（`list-view.tsx:138`、`card-view.tsx:50`）。`ServerPanel` 已经同时拿到
  `server` 和 `places`（455-456 行），不需要新增查询。
- Variables：`packages/resources/variables` 没有详情弹窗，也没有“安装/投递到 Agent”的语义。
  `host/variables-fs.ts:4` 明确写的是「只存名字和分组，值写入机器环境」；没有 `places` / `installs` / `held` 数据。
  **结论：不纳入本次改动。**

测试覆盖：四个模块都没有 React 组件测试，只有纯函数测试
（prompts 的 `heldMarks` 在 `packages/resources/prompts/__test__/delivery.test.ts:290-318`，
plugins 的 `held` 在 `packages/resources/plugins/__test__/rows.test.ts`，
MCP 的 installs 派生在 `packages/resources/mcp/__test__/`）。因此 UI 改动靠 typecheck + 浏览器实测验收。

## 目标

1. Prompts、Plugins、MCP Servers 的详情弹窗，在标题下的次要信息行里显示“哪些 Agent 安装/持有它”，
   视觉与 Skills 的来源行一致：图标组、重叠、最多 5 个、超出 `+N`、悬停显示 Agent 名称。
2. Prompts 详情弹窗里把 token 数从标题行移到「更新时间」下方，并在两者之间加一条分割线。
3. 不新增第四套头像组件：统一用 `AvatarStack`；各模块只保留自己的数据映射
   （skills 用 `ProvenanceLine`，prompts 用 `heldMarks`，plugins 用 `plugin.held`，MCP 用 `AgentStack`）。

## 各模块的数据来源与映射

| 模块 | 字段/函数 | 语义 | 画法 |
| --- | --- | --- | --- |
| Skills | `Skill.places` → `holdsOf(skill)`（`skills/src/library.ts:104-106`） | 每个持有该技能文件的 place 一个 mark | 已有 `ProvenanceLine`，不改 |
| Prompts | `Holds = Record<placeId, Held>` → `heldMarks(places, holds, labelOf)`（`prompts/src/deliver.ts:251-272`） | place 持有任意一种交付物（command / rule / agent / 文档段落）即算；按 `place.agent` 去重 | 新增 `PromptMarks`，内部用 `AvatarStack` |
| Plugins | `plugin.held: PluginHeldBy[]`（`plugins/src/types.ts:35-60`） | 每个 Agent/client 一个 mark；`enabled: false` 也算“持有” | 把页面里的 `HolderStack` 移到 `parts.tsx`，详情与列表共用 |
| MCP | `server.detail.installs` + `McpAgentPlace[]` → `AgentStack`（`mcp/src/parts.tsx:116-137`） | 每个声明了该服务器的客户端文件一个 mark；`installed: true`，不看 `enabled` | 直接复用现有 `AgentStack` |
| Variables | 无 | 没有 Agent 落点 | 不纳入 |

共同视觉参数：`seam="ring-card"`（与 skills 详情、MCP 列表/卡片、plugins 列表一致），
`AvatarStack` 默认 `max = 5`，超出自动画 `+N`；不新增可见的 Agent 名称或总数。
空状态：`AvatarStack` 在 `marks.length === 0` 时返回 `null`，因此 Prompts/Plugins/MCP 详情弹窗**不画空占位**，
与现有列表/卡片行为一致；Skills 维持 `ProvenanceLine` 的「技能库」文案。

## 阶段一：提示词详情搬移 token 行并补 Agent 标记

### 改动文件

- `packages/resources/prompts/src/parts.tsx`
- `packages/resources/prompts/src/page.tsx`
- `packages/resources/prompts/src/prompt-detail-dialog.tsx`
- `packages/resources/prompts/src/messages.ts`
- `packages/i18n/zh-cn/src/messages.ts`

### 具体改动

1. `parts.tsx` 的 `PromptMeta` 增加 `showTokens?: boolean`（默认 `true`）：
   - 默认分支与现在完全一致，卡片和列表不受影响；
   - `showTokens === false` 时只渲染来源图标和 `prompts.source.local`，同时不渲染两者之间的 3px 圆点。

   ```tsx
   export function PromptMeta({
     body,
     showTokens = true,
   }: {
     body: string
     showTokens?: boolean
   }) {
     // ...
     <span className="min-w-0 truncate text-muted-foreground">
       {t("prompts.source.local")}
     </span>
     {showTokens ? (
       <>
         <span className="size-[3px] shrink-0 rounded-full bg-muted-soft" />
         <span className="shrink-0 font-mono text-[11px] leading-[14px] text-muted-soft">
           {t("prompts.detail.tokens").replace("{tokens}", tokenLabel(body))}
         </span>
       </>
     ) : null}
   }
   ```

2. `parts.tsx` 新增 `PromptMarks`，复用 `AvatarStack` 和 `HeldMark`；
   文件头注释从「两个小件」改成「三个小件」，说明新增的是持有标记组：

   ```tsx
   export function PromptMarks({ marks }: { marks: readonly HeldMark[] }) {
     if (marks.length === 0) return null
     return (
       <AvatarStack
         marks={marks}
         seam="ring-card"
         label={marks.map((mark) => mark.label).join(" · ")}
       />
     )
   }
   ```

   导入 `AvatarStack`（`@context-hub/extensions/components`）和 `type HeldMark`（`./deliver.ts`）。

3. `page.tsx` 的 `PromptCard` 改用 `PromptMarks`，删掉该文件内联的 `<AvatarStack ... />`
   以及不再使用的 `AvatarStack` 导入；`heldMarks` 的 `useMemo` 保留。

4. `prompt-detail-dialog.tsx`：
   - 从 `./deliver.ts` 增加导入 `heldMarks`；从 `./library.ts` 增加导入 `tokenLabel`；
     从 `./parts.tsx` 增加导入 `PromptMarks`。
   - `InfoPanel` 内按卡片的写法派生 marks：

     ```tsx
     const marks = React.useMemo(
       () => heldMarks(places, holds, (place) => t(place.labelKey)),
       [places, holds, t]
     )
     ```

   - 标题下：`PromptMeta` 不再显示 token，后面接 marks：

     ```tsx
     <DialogDescription className="flex min-w-0 items-center gap-2">
       <PromptMeta body={prompt.prompt} showTokens={false} />
       <PromptMarks marks={marks} />
     </DialogDescription>
     ```

   - 面板底部改成「更新时间 → 分割线 → 上下文大小」：

     ```tsx
     <Rule />
     {updated === "" ? null : (
       <>
         <MetaRow label={t("prompts.detail.updated")} value={updated} />
         <Rule />
       </>
     )}
     <MetaRow
       label={t("prompts.detail.contextSize")}
       value={t("prompts.detail.tokens").replace("{tokens}", tokenLabel(prompt.prompt))}
     />
     ```

     这样更新时间存在时是两条 `Rule`（places 与更新时间之间、更新时间与上下文大小之间各一条）；
     `updated === ""` 时只剩 places 与上下文大小之间的一条，不会出现连续两条线。
   - token 估算继续用现有的 `tokenLabel`（`Math.round(body.length / 4)`），不改算法。

5. 文案：
   - `packages/resources/prompts/src/messages.ts` 增加 `"prompts.detail.contextSize": "Context size"`；
   - `packages/i18n/zh-cn/src/messages.ts` 增加 `"prompts.detail.contextSize": "上下文大小"`。
   - 值沿用现有 `prompts.detail.tokens`（`"{tokens} tokens"`），所以右列仍是 `304 tokens`。

### 验收

- `pnpm --filter @context-hub/prompts typecheck` 通过。
- `pnpm --filter @context-hub/prompts test` 通过。
- `pnpm --filter @context-hub/zh-cn test` 通过（中文包覆盖新增 key）。
- 浏览器 `http://localhost:5271/prompts`：
  - 打开一条已经被某个 Agent 持有的提示词，标题下是「本地 + 头像组」，悬停能看到 Agent 名称；
  - 标题下不再出现 token 文案；
  - 底部 `更新时间` 行下方有一条分割线，再下面是 `Token 数` 行；
  - 打开一条没有交付过的提示词，标题下只有「本地」，没有空框或多余间隔。
- 卡片和列表的 token 显示保持原样。
- 如果真实库里没有任何已交付的提示词，先用一个 `zz-probe-marks` 命名的临时提示词投递到工作区里一个被 gitignore 的
  place（如 `.agents/...`）来验证非空态，验证后用同一菜单取回并删除该提示词；不要往用户真实目录留下测试文件。

## 阶段二：插件详情补 Agent 标记

### 改动文件

- `packages/resources/plugins/src/parts.tsx`
- `packages/resources/plugins/src/page.tsx`
- `packages/resources/plugins/src/detail-dialog.tsx`

### 具体改动

1. 把 `page.tsx:204-214` 的 `HolderStack` 原样移到 `parts.tsx` 并导出；
   `parts.tsx` 增加 `AvatarStack` 导入，并更新文件头注释（从「小件」扩到「小件与持有标记组」）。
   函数体不变：`plugin.held.length === 0` 返回 `null`；否则按 `hold.client` / `hold.icon` 画 marks，
   `label` 用 `hold.label` 连接。

2. `page.tsx`：
   - 从 `./parts.tsx` 的导入改为 `{ HolderStack, PluginTile }`；
   - 删除本地 `HolderStack`；
   - 从 `@context-hub/extensions/components` 的导入里删掉不再使用的 `AvatarStack`。

3. `detail-dialog.tsx`：
   - 从 `./parts.tsx` 的导入改为 `{ HolderStack, PluginTile }`；
   - 在 `InfoPanel` 的 `DialogDescription` 里、来源文案之后渲染 `<HolderStack plugin={plugin} />`：

     ```tsx
     <DialogDescription className="flex min-w-0 items-center gap-2 font-mono text-[12px] text-muted-foreground">
       {/* 现有的版本与来源 */}
       <HolderStack plugin={plugin} />
     </DialogDescription>
     ```

### 验收

- `pnpm --filter @context-hub/plugins typecheck` 通过。
- `pnpm --filter @context-hub/plugins test` 通过。
- 浏览器 `http://localhost:5271/plugins`：
  - 列表行和卡片的头像组与改动前一致；
  - 打开一个被 Agent 持有的包，标题下显示「vX · 来源 + 头像组」，悬停显示 Agent 名称；
  - 打开一个没有任何 Agent 持有的包，头像组不画，版本与来源行不出现空白块。

## 阶段三：MCP 详情补 Agent 标记

### 改动文件

- `packages/resources/mcp/src/server-dialog.tsx`

### 具体改动

1. 从 `./parts.tsx` 的导入改为 `{ AgentStack, ServerTile, StatusPill }`。
2. 在 `ServerPanel` 标题下的次要行（483-490 行）末尾加 `<AgentStack server={server} places={places} />`：

   ```tsx
   <div className="flex items-center gap-1.5 text-[12px] leading-[1.3]">
     <PlugIcon className="size-[13px] text-muted-soft" />
     <span className="font-mono font-semibold text-foreground">{server.transport}</span>
     <span className="text-muted-soft">·</span>
     <span className="text-muted-foreground">
       {t("mcp.detail.place.count").replace("{count}", String(server.installed))}
     </span>
     <AgentStack server={server} places={places} />
   </div>
   ```

   不把这段改成 `DialogDescription`，避免改变现有 MCP 头部的语义和样式；
   `AgentStack` 为空时返回 `null`，行内只剩 transport 和数量。

### 验收

- `pnpm --filter @context-hub/mcp typecheck` 通过。
- `pnpm --filter @context-hub/mcp test` 通过。
- 浏览器 `http://localhost:5271/mcp-servers`：
  - 列表和卡片的 `AgentStack` 与改动前一致；
  - 打开一个被客户端文件声明过的服务器，标题下显示「transport · N 个位置 + 头像组」；
  - 打开一个没有任何客户端声明的服务器，头像组不画，数量仍显示 `0 个位置`。

## 阶段四：全量验收与 AOCI 收尾

### 改动文件

- 无源码改动；只做验证与仓库认知同步。

### 验证

- `pnpm --filter @context-hub/prompts lint`
- `pnpm --filter @context-hub/plugins lint`
- `pnpm --filter @context-hub/mcp lint`
- `pnpm --filter web typecheck`
- `pnpm test`（根目录，全部 vitest project）
- `git diff --stat` 只包含本计划列出的文件，没有无关格式化改动；用户未要求时不提交 git。
- 浏览器完整走一遍 `/skills`、`/prompts`、`/plugins`、`/mcp-servers` 的详情弹窗，
  确认四个头部的头像组尺寸、重叠、`+N`、空态一致；Skills 无回归。

启动方式：仓库根 `pnpm dev`。Vite 固定 `5271`，hub 固定 `5270`
（`apps/web/hub-port.ts:16-19`）。如果用户已经有 dev server 在跑，直接复用，
不要按端口或进程名清理（见 `docs/memory.md` 的进程清理规则）。浏览器自动化用 `ego-browser` skill。

### AOCI

代码达到最终稳定状态后，按仓库 `AGENTS.md` 的 AOCI 流程执行一次 `aoci_maintain`，
只为实际变更的文件作者化更新，重点条目：

- `packages/resources/prompts/src/parts.tsx`：`PromptMeta` 增加 `showTokens`，新增 `PromptMarks`。
- `packages/resources/prompts/src/prompt-detail-dialog.tsx`：头部头像组、底部 token 行位置。
- `packages/resources/prompts/src/page.tsx`：卡片改用 `PromptMarks`。
- `packages/resources/plugins/src/parts.tsx`：新增 `HolderStack`。
- `packages/resources/plugins/src/page.tsx`：`HolderStack` 来源改为 `parts.tsx`。
- `packages/resources/plugins/src/detail-dialog.tsx`：头部头像组。
- `packages/resources/mcp/src/server-dialog.tsx`：头部头像组。
- 两份 `messages.ts`：新增 `prompts.detail.tokensLabel`。

不要更新未改动的 skills / MCP `parts.tsx` / variables 条目。

## 不做

- 不改 Skills 详情弹窗：它已经具备目标行为。
- 不改 Variables：没有 Agent 安装/持有语义。
- 不改列表、卡片、表格里已有的头像组和 token 显示。
- 不改 `AvatarStack` 的尺寸、`max`、seam 行为，不新增跨模块的 `AgentMarks` 抽象。
- 不把 MCP `server-dialog.tsx` 里手写的 `Rule()`（113-120 行）换成 shadcn `Separator`；那是独立的清理。
- 不新增“未被任何 Agent 持有”的提示文案或 Agent 总数标签。
- 不修改 token 估算算法。
- 不做与本次需求无关的格式化或重构。

## 待确认的设计点

1. 已确认：底部 token 行采用 `MetaRow`，左标签「上下文大小 / Context size」，右值沿用现有文案 `304 tokens`。
2. 已确认：三个模块的空态统一为“不画”（`AvatarStack` 返回 `null`），与现有列表/卡片一致。

## 执行结果与计划差异（用户现场反馈后）

- 三个详情弹窗的来源行统一为「来源 · 头像组」，中间补了 `·` 分隔；没有持有时不画分隔点。
- 提示词详情底部只保留「更新时间 → 分割线 → 上下文大小」；原先把整组事实与上方区块隔开的额外分割线已按用户要求移除。
- 插件详情：版本号从标题行移到面板底部，成为「版本」行；来源区块自带的底部分割线作为与事实区的分隔，不再额外加线。版本与更新时间之间保留一条分割线。
- MCP 详情：移除标题行里的「N 个位置」，由头像组直接表达；没有安装位置时不画分隔点与头像组。
- 验证：四个包 typecheck / lint / 测试通过；Prompts、Plugins 详情已在浏览器实测。MCP 详情仅通过 typecheck 与代码核对，未在用户结束任务前完成浏览器复验。
