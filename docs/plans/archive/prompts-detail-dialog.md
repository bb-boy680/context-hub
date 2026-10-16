# 提示词详情弹窗对齐 SKILL 弹窗

## Context

提示词模块的详情弹窗（`packages/plugin-prompts/src/prompt-detail-dialog.tsx`，162 行）还是最早那版：
一个 `sm:max-w-[680px]` 的窄对话框，描述 + 标签 chips + 一个 `<pre>` 正文 + 底部两个按钮。
用户要求它和 SKILL 模块的详细弹窗（`packages/plugin-skills/src/skill-detail-dialog.tsx`，1495 行）一致：

- 左边两个标签页：**展示图**（Swiper 画廊，没有 assets 时渲染 markdown）、**提示词**（代码编辑器，可改）
- 右边是功能区
- 底部操作按钮：**复制**、**删除 Prompt**（二次确认）
- 「提示词」页有 **编辑** 按钮，点下去变成 **保存**

这是对齐，不是新功能：右侧功能区、Swiper 画廊、媒体上传菜单、`DialogSplit`、`CodeCard`/`CodeView`
（带行号 + shiki 高亮，即用户参考图 Image #13）在仓库里都已经存在。本轮的净新增只有两样：
**正文可写**（今天 `PromptStore` 只有 list/create/remove）和**资产可写**（`Prompt.assets` 今天没人写入，
`store.ts:29-34` 明写了 "Nothing writes one yet"）。

用户已确认的三条语义：

1. 展示图的图片**能加**（文件选择 / 拖拽 / 粘贴 / 链接），照 skills 那套。
2. 编辑**只改提示词正文**，不改描述、不改标签（描述是 slug 与文件名来源，改名语义另算）。
3. 编辑器是**带行号 + 实时高亮**那版（不是等宽 textarea）。

## 前提事实（已核对）

- **`Prompt.assets` 已经在 `list()` 的返回里**（`host/prompts-fs.ts:157-173` 的 `withId` 直接展开整行）。
  弹窗不需要额外的 detail 读取 —— 这是与 skills 最大的结构差异，能省掉一个 `get(id)` 往返。
- `MediaPane` 在仓库里**已经有两份**：`skill-detail-dialog.tsx:217-505` 和 `plugin-plugins/src/detail-dialog.tsx:162`。
  用户已选定**提取共享**，故本轮做 skills + prompts 两份合一（plugins 那份是既存副本，见「不做」）。
- `MediaGallery`（`packages/extensions/src/components/media-gallery.tsx`）已经是共享组件，
  接 `items / empty / onRemove / action / words`，Swiper 的 paging、拇指条、方向键都归它。
- `file-code`（`packages/ui/src/styles/globals.css:173`）**已经画行号**：`& code { counter-reset: line }` +
  `& .line::before { width: 2rem; margin-right: 12px }`，`.shiki { padding: 12px 14px }`。
  行号起点的 x = 14 + 32 + 12 = **58px**，这是编辑层要对齐的那个数。
- `paint`（`packages/ui/src/lib/highlight.ts:63`）是 async，但底下的 `HighlighterCore.codeToHtml` **是同步的**；
  只有 `createHighlighterCore` 是 async。加一个同步出口即可做到真正实时高亮。
- `assetRef(ref, base)` / `assetKind` / `readSource`（`packages/core/src/assets.ts`）是既有的三件套；
  `createAssetStore(createFsAssetLibrary(home))` 是 skills 的宿主组合方式（`skills-fs.ts:220`）。
- 桥的既有形状：skills 用 `POST /hub/skills/<id>/assets?name=…`（**raw bytes 作 body**）、
  `POST /hub/skills/<id>/source`（JSON `{source}`）、`DELETE /hub/skills/<id>/assets?ref=…`（`vite.ts:413-453`），
  客户端对应 `remote-store.ts:125-156`。prompts 桥是同一个 middleware 风格，照抄。
- **本仓 lint 把 `react-hooks/set-state-in-effect`、`refs`、`purity` 设为 error** —— 不能用 effect 夹状态、不能在 render 里读 ref。
- `packages/locale-zh-cn/scripts/check-messages.ts` 要求英文表每个 key 都在中文表里，**文案两处都要改**。
- base-ui 的 `TabsPanel` 有 `keepMounted`（默认 `false`）。**不用它**：Swiper 在 `hidden` 容器里量不出尺寸。

## 阶段一：宿主与桥 —— 正文可写、资产可写

`packages/plugin-prompts/src/store.ts`、`src/host/prompts-fs.ts`、`vite.ts`、`src/remote-store.ts`

`PromptStore` 增加五个成员（签名照 `SkillStore` 的对应项，`skill store.ts:78-98, 312-321`）：

```ts
update(id: string, patch: { prompt: string }): Promise<StoredPrompt>
putAsset(id: string, file: File): Promise<PromptAsset>
addAssetSource(id: string, source: string): Promise<PromptAsset>
deleteAsset(id: string, ref: string): Promise<void>
assetUrl(ref: string): string
```

外加 `export interface PromptAsset { ref: string; kind: AssetKind }`（`AssetKind` 从 `@workspace/core` 取）。

`host/prompts-fs.ts`：

- `PromptStoreOptions` 加 `assets?: AssetStore`，默认 `createAssetStore(createFsAssetLibrary(resolveHubHome(home)))`。
- 照抄 `skills-fs.ts:186-188` 的 `owned(id, file)`：把文件重包成 `` `${id}-${file.name}` ``。
  **这是 load-bearing 的**：资产目录是扁平 + 内容寻址（`assets/<stem>-<digest>.<ext>`），
  不带 prompt id 前缀的话，两个 prompt 传同一张图会得到同一个 ref，删一个会连带删另一个。
- `recordAsset(id, ref)`：`run()` 队列内改行 —— `assets: [...row.assets.filter(x => x !== ref), ref]` + bump `updatedAt`（照 `skills-fs.ts:427-439`，追加到**末尾**）。
- `update(id, patch)`：`run()` 内找行，行不存在抛 `${id} is not in this library`；
  `prompt` 过一遍 `textOf(..., "prompt")`（复用已有的空值拒绝）；写回时 **`Row` 的 spread 天然保留未知字段**（`lineOf` 的注释就是这么写的）。
- `deleteAsset(id, ref)`：**先 `assets.remove(ref)`，再摘记录、再 `save`**（照 skills 的次序）。
- `assetUrl: (ref) => assetRef(ref)`。
- 三个新方法都要复用它自己的 `load()`/`save()`/`run()`，不要绕开 —— 每个写入都是同一份文件的 read-modify-write。

`vite.ts` 桥加三条路由（在现有 `rest === ""` 分支之外，按 `/` 拆 `rest`）：

| 路由 | 动作 |
| --- | --- |
| `PATCH|POST /hub/prompts/<id>` | `update(id, { prompt })`，body 里的 `prompt` 过 `required` 风格的检查 |
| `POST /hub/prompts/<id>/source` | JSON `{source}` → `addAssetSource` |
| `POST /hub/prompts/<id>/assets?name=…` | **raw bytes 作 body** → `new File([bytes], name, {type: contentType})` → `putAsset` |
| `DELETE /hub/prompts/<id>/assets?ref=…` | `deleteAsset` |

现有 `DELETE /hub/prompts/<id>`（remove）的判据是 `!rest.includes("/")`，与新的 `<id>/assets` 不冲突。

`remote-store.ts` 加同样四个调用，逐字照 `plugin-skills/src/remote-store.ts:125-156`（含 `assetRef(ref, base)`）。

**完成目标**：一句 `store.update(id, {prompt})` 能改正文，一句 `store.putAsset(id, file)` 能落盘一张图并记进该行的 `assets`。

**验收**：`pnpm --filter @workspace/plugin-prompts typecheck` 通过；
`node scripts/check-prompt-store.ts` 补断言（风格照现有 `check()`）：
update 改正文且保留手写未知字段、bump `updatedAt`、空 prompt 被拒、未知 id 抛错且文件一字节未变；
putAsset 后 ref 以 `assets/` 开头、文件真在 `<home>/assets`、`assets` 末尾就是它；
两个 prompt 传**相同字节**得到两个不同 ref，删一个另一个仍在；deleteAsset 后再 update 不会把它带回来。

## 阶段二：MediaPane 提取为共享

`packages/extensions/src/components/media-pane.tsx`（新）、`media-gallery.tsx`、`index.ts`、`packages/plugin-skills/src/skill-detail-dialog.tsx`

把 `skill-detail-dialog.tsx:100-505` 的 `MediaSource` / `useMediaItems` 上半部分的**结构**搬成共享：

- 导出 `MediaPane({ empty, source, words, onScreen? })`，`empty: React.ReactNode` 取代今天的 `doc: string`
  （skills 传 `<DocumentStage>`，prompts 传 `<Markdown>`，plugins 传它自己的 readme stage）。
- 导出 `MediaSource`（skills 今天那个接口原样：`items / busy / addFiles / addUrl / remove`）。
- 导出 `MediaPaneWords`：把今天硬编码的 15 个 `t("skills.media.*")` 全部参数化
  （`drop.title`、`drop.formats`、`upload`、`add.file`、`add.fileHint`、`add.link`、`add.linkHint`、
  `add.paste`、`add.pasteHint`、`add.linkLabel`、`add.placeholder`、`add.action`、`paste.text`、`paste.done`、`hint`、`cancel`）。
- **`onScreen?: boolean`**：粘贴监听挂在 `document` 上，tab 被切走时仍会触发。
  skills 今天没有这个问题（它没有 tab），prompts 有 —— 传 `false` 时不接粘贴/拖入。
  这是本轮唯一为 prompts 增加的行为参数，不是给未来留的口子。
- `skill-detail-dialog.tsx` 删掉本地 `MediaPane`（约 290 行），改调共享版；
  `useMediaItems` **留在 skills 里**（它依赖 `SkillStore`、`detail.assetDetails`、object URL 兜底，是 skills 自己的事）。

`index.ts` 加 `export * from "./media-pane.tsx"`，并把它写进文件头那句枚举里。

**完成目标**：skills 弹窗行为一字不变，`MediaPane` 只剩一份。

**验收**：`pnpm --filter @workspace/plugin-skills typecheck && pnpm --filter @workspace/extensions typecheck`；
真机上打开任一 skill 的详情 → 拖一张图进去、粘贴一张截图、从 + 菜单加一个链接、删一张图 —— 四条路都还走通。

## 阶段三：prompts 弹窗重写成 DialogSplit

`packages/plugin-prompts/src/prompt-detail-dialog.tsx`、`src/library.ts`、`src/page.tsx`

结构照 `LightboxBody`（`skill-detail-dialog.tsx:1234-1354`）：

```
Dialog
└ DialogSplit
  ├ pane   → Tabs（顶部一条 tab 行，撑满剩余高度）
  │          展示图 → MediaPane（items 来自 prompt.assets，empty = <Markdown>{prompt.prompt}</Markdown>）
  │          提示词 → CodeCard 形状的框：header 左「提示词」右「编辑/保存」，body 是只读 CodeView 或可编辑 CodeEditor
  └ panel  → InfoPanel
             描述（DialogTitle）+ token 数（DialogDescription）
             标签 chips（只读：本轮编辑范围只有正文）
             投递位置：PlaceList 两 scope 分组，每行 action 槽里放「安装/移除」按钮 + ⋯ 子菜单
             底部 h-16：复制、删除（AlertDialog 二次确认）
```

要点：

- **媒体数据源**：新 `usePromptMedia(prompt, store, onChanged)` 写在 `prompt-detail-dialog.tsx` 里
  （与 skills 的 `useMediaItems` 同位）。它不是 `useMediaItems` 的复制品 —— 输入是 `prompt.assets` 这个
  已经读回来的数组，没有 detail、没有 object URL 兜底，约 40 行。`items` 由
  `prompt.assets.map(ref => ({id: ref, kind: assetKind(ref), src: store.assetUrl(ref)}))` 派生。
  写后调 `onChanged()`（= 页面的 `library.reload()`），不做乐观预览 —— 和 plugins 展示图那次的选择一致。
- **⋯ 子菜单不删**：今天弹窗底部的 `PromptActions`（安装 dropdown）消失，但它的四种投递
  （`install / commands / rule / instructions`）一个不少地搬到右侧每行 place 的 `⋯` 上 ——
  直接复用 `install-menu.tsx` 里现成的 `PlaceMore`。**这是移动，不是移除。**
- **安装/移除按钮**：`PlaceList` 的 `action(option)` 返回一个 `flex items-center gap-1` 的容器，
  装 `安装/移除` 按钮 + `PlaceMore`。按钮样式抄 `skill-detail-dialog.tsx:815-865` 那组常量（`pill` / `soft` / `outlinePill`）。
- **tabs 不 keepMounted**：`TabsContent` 用 `className="flex min-h-0 flex-1 flex-col"`；
  **编辑草稿与 `editing` 状态提到 dialog 层**，这样切到「展示图」再切回来，没保存的正文还在
  （面板卸载会丢，而 keepMounted 会让 Swiper 量不出尺寸）。
- `page.tsx`：`PromptDetailDialog` 加传 `onChanged={() => void library.reload()}`；
  `detail`（`page.tsx:370`）今天是从 `matching` 里现算的，所以 reload 后弹窗里的行会自动更新 —— 不需要额外 state。
- 保留现有 `busy` 与 `toast` 的失败路径（`page.tsx:374-472` 的 `refuse`）。

**完成目标**：弹窗形状、标签页、右侧功能区、底部按钮与 skills 一致，prompt 的全部既有能力都在。

**验收**：typecheck + lint；真机点开一条 prompt：两个 tab 都出内容、拖图/粘贴/加链接/删图四条路走通、
右侧每行的安装按钮能装能卸、`⋯` 三个生成动作都在、复制能复制、删除有二次确认且删掉后弹窗关闭。

## 阶段四：可编辑的代码视图

`packages/ui/src/lib/highlight.ts`、`packages/extensions/src/components/code-editor.tsx`（新）、`index.ts`

`highlight.ts` 加同步出口（`paint` 改成调它，两条路共用一份 `codeToHtml` 参数）：

```ts
let ready: HighlighterCore | null = null          // loadHighlighter() 的 then 里赋值
export function paintNow(text, lang, structure): string | null   // ready === null 时返回 null
```

`code-editor.tsx` 导出 `CodeEditor({ text, onChange, language, className })`，两层叠放：

- 底层：`<div className="file-code" dangerouslySetInnerHTML={{__html: html}} />`，
  `overflow: hidden`，`aria-hidden`。**复用 `file-code` 意味着行号和配色都不用重写。**
- 上层：`<textarea spellCheck={false}>`，`overflow: auto`，透明文字 + `caret-color: currentColor`，
  `font-mono text-[11.5px] leading-5`（与 `file-code` 同度量），`whitespace-pre`。
  `padding-left` 用 `calc(14px + 2rem + 12px)` 对齐行号，**这个算式在 `file-code` 的 CSS 旁加一行注释互相指认**。
- **横向不换行**（`white-space: pre`）：两层都自动换行时，textarea 的 UA 样式
  （`overflow-wrap: break-word`）和 `<pre>` 的（`normal`）在长串上断点不同，会错位。
  `pre` + 同步 `scrollLeft/scrollTop` 完全避开这个坑，且和只读的 `CodeCard` 表现一致。
- `onChange` 里同步调 `paintNow`（`ready` 已就绪时就是一次同步字符串处理，几十 KB 的 prompt 无感）；
  `paintNow` 返回 `null` 时**不渲染高亮层**、textarea 恢复正常文字色 —— 与 `CodeView` 的
  「`html === null` 就先画纯文本」同一个两态思路。
- **IME**：`onCompositionStart/End` 期间把 textarea 文字色恢复正常、高亮层 `opacity-0`。
  透明文字在中文输入法候选上屏时会让用户看不见自己打的字，prompt 大多是中文写的，这条必须处理。
- 语言固定 `"markdown"`：prompt 没有文件名，且实际内容基本是 markdown（标题/列表/代码块）。

`prompt-detail-dialog.tsx` 里的用法：只读态 `children={<CodeView text path="prompt.md" />}`，
编辑态 `children={<CodeEditor ... />}`，`trailing` 放编辑/保存按钮（`CodeCard` 的 `trailing` 槽现成的）。

**完成目标**：点「编辑」正文可改且高亮实时跟手；点「保存」落盘、按钮变回「编辑」；行号与文字始终对齐。

**验收**：真机上在 1200px 和窄窗口下各看一次：行号与首列字符对齐、横向滚动时两层不脱节、
输入中文（IME）时候选上屏可见、`Tab` 键插入的是制表符而不是跳焦点。

## 阶段五：文案

`packages/plugin-prompts/src/messages.ts`、`packages/locale-zh-cn/src/messages.ts`

新增 `prompts.media.*`（15 条，与 skills 一一对应）、
`prompts.detail.tab.pictures` / `prompts.detail.tab.body`、
`prompts.detail.edit` / `prompts.detail.save` / `prompts.detail.saved`、
`prompts.detail.places` / `prompts.detail.places.held` / `prompts.location.library` 等。
两处都要加 —— `check-messages.ts` 会报缺 key 和 stale key。

**验收**：`node packages/locale-zh-cn/scripts/check-messages.ts` 全绿。

## 阶段六：验证

- `npx turbo typecheck lint --filter=@workspace/plugin-prompts --filter=@workspace/plugin-skills --filter=@workspace/extensions --filter=@workspace/ui --filter=web`
- `cd packages/plugin-prompts && node scripts/check-prompt-store.ts`（含阶段一新增断言）
- **真机：必须自己起一台 dev server**（`cd apps/web && npx vite --port 5273 --strictPort`），
  因为本轮改了 `packages/plugin-prompts/vite.ts`，改动不进 HMR（`docs/memory.md` 第一条）。
  用户那台 5173 全程不碰，验完只杀 5273。
- headless Edge + CDP 实测，路径：`/prompts` → 点开一条卡片（选择器用
  `div[role="button"][aria-label]`，别用 `[aria-label]` 兜底）→ 逐项走：

| 行为 | 判据 |
| --- | --- |
| 两个 tab | 展示图 tab 出 Swiper（无图时是渲染后的 markdown）；提示词 tab 出带行号的高亮正文 |
| 上传图片 | `prompts.json` 里该行 `assets` 末尾出现 `assets/…`，文件真在 `<home>/assets`，舞台上出现该图 |
| 关掉再打开 | 图还在（重新读库） |
| 拖拽 / 粘贴 / 链接 | 三条路各加进一张，`assets` 各长一条 |
| 切到「提示词」时粘贴 | **什么都没发生**（`onScreen=false` 兜住的正是这条） |
| 删除一张图 | 记录、磁盘文件、拇指条同时少一条 |
| 编辑正文 | 改字 → 高亮跟手；保存后 `prompts.json` 的 `prompt` 变成新文本、`updatedAt` 变了；重开弹窗显示新文本 |
| 编辑后不保存切 tab | 切回来草稿还在 |
| 中文 IME | 输入法候选上屏过程中看得见字 |
| 右侧每行 place | 安装 → 文件出现、按钮变「移除」；移除 → 文件消失；`⋯` 三个生成动作各写一个文件 |
| 底部复制 | 剪贴板文本 === `prompt.prompt` |
| 底部删除 | 弹二次确认；确认后行从库里消失、弹窗关闭、卡片消失 |
| 窄窗口（约 900px） | 编辑器行号仍与文字对齐，弹窗不横向溢出 |

## 收尾

- 计划归档到 `docs/plans/archive/`，本轮教训写进 `docs/memory.md`
- 受管理对象变了（prompts 新增文件与接口），按 AOCI 流程调一次 `aoci_maintain`

## 不做（以及为什么）

- **不让 `MediaPane` 覆盖 plugins**：`plugin-plugins/src/detail-dialog.tsx:162` 是第三份副本，
  但它的数据通路不同（`sources: string[]`，File→dataURL 在客户端转）、还带
  `takes`（未收录 pack 禁用）和 readme/Bundle 两个 fallback stage。本轮把它一起改会扩大回归面，
  而它跟本次需求无关。**这是既存技术债，单独列出来，不顺手动。**
- **不改描述和标签**：用户选定编辑范围只是正文。描述是 slug 与投递文件名来源，允许改会引入
  「改名后已投递的文件怎么办」这一整套语义，不在本轮。
- **不做卡片封面**：prompt 卡片的封面是它自己的文本（`page.tsx:76-110` 的 `PromptCover`），
  上传的图只在弹窗里看。用户没要求改卡片。
- **不给 `TabsContent` 加 `keepMounted`**：Swiper 在 `hidden` 容器里量不出尺寸，
  而草稿状态提到 dialog 层已经解决了「切 tab 丢草稿」这个真问题。
- **不引入 CodeMirror / Monaco**：为一个 prompt 文本框加编辑器依赖不值得，
  叠加层用的是仓库已有的 `file-code` + `paint`。
- **不做 `Tab` 键缩进之外的编辑增强**（自动配对括号、多光标等）：没人要求。

## 已知限制

- 编辑器是**叠加层**：两层靠字体度量对齐。如果以后有人改 `file-code` 的
  `font-size` / `line-height` / 行号宽度，必须同时改 `code-editor.tsx` 的 `padding-left` 算式 ——
  在 `globals.css` 和 `code-editor.tsx` 两边各留一行交叉注释钉住这件事。
- 编辑器不换行（`white-space: pre`），很长的单行 prompt 要横向滚动。这是为了避开两层换行断点不一致的坑。
- 高亮层在 `paintNow` 返回 `null` 的那一小段（首次打开且本次会话还没加载过高亮器）
  不显示颜色，textarea 显示自己的文字；加载完成后自动切到高亮层。视觉上无闪烁，因为从不透明切到
  透明时高亮层已经画好了。
- 桥的 body 没有大小上限（与 skills 一致，非本轮引入）。上传走 raw bytes 而不是 base64，
  反而比 plugins 那条 base64 的路更省。
- 上传失败时 `assets.put` 已写下的文件会成为孤儿，没有回收路径（skills 今天也是）。
