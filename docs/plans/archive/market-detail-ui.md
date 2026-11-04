# 插件市场详情弹窗 UI 重构

> 状态：完成（2026-10-30）
> 任务：#6
> 设计稿：`designs/market/plugins.pen` 的 `02 · Detail` 与 `02b · Detail states`
> 预览：`designs/market/market-detail.png`、`market-detail-states.png`
> 前置提交：`06f3aac feat(market): add the plugin market with pinned installs`
> 本轮只改详情弹窗与它的预览数据接线，不改目录页、来源适配器或安装链路。

## 目标

1. 详情弹窗按 `DialogSplit` 的左右分区重排：
   - 右侧面板（360px）顶部是 40px 图标 + 插件名 + `市场名 · 类型` + 关闭按钮；
   - 删除现有的「状态」「安装」两块；
   - 右栏只保留 SOURCE（窄栏上下排布）、分割线、HOME、底部 Install / Manage 按钮。
2. 左栏顶部是标签页：`Content | Skills | Commands | MCP`。
   - Content 始终存在；
   - Skills / Commands / MCP 只在预览扫描到对应内容时出现。
3. Content 内容为：ABOUT（索引描述）→ 分割线 → README（包内 README，Markdown 渲染）。
4. 预览加载中：只显示 Content，About 立即渲染，README 区域显示「Reading pack contents…」+ 骨架线。
5. Skills / Commands 用卡片列表（28px 图标砖 + 等宽标题 + 描述）；MCP 用 `.mcp.json` 代码卡。

## 非目标

- 不改目录页的布局、来源栏、行、搜索或安装弹窗。
- 不改 `@context-hub/plugins` 的详情弹窗、`ContentList`、`CodeCard` 或安装实现。
- 不引入 GitHub API tree、README 站点抓取或新依赖；预览继续用已提交的 host 侧 `market-preview`（暂存 git 拉取 + 读目录 + 删除）。
- 不做 README 的相对图片代理；本轮只渲染绝对地址图片，相对图片按 `Markdown` 的现有行为省略。
- 不做服务端搜索、分页或新的通知/进度系统。

## 当前代码事实

| 位置 | 现状 |
| --- | --- |
| `packages/market/plugins/src/detail-dialog.tsx` | 头部（图标缺失、标题+两个 Badge）在左栏顶部；左栏 ABOUT/SOURCE/HOME；右栏 STATUS/INSTALL 与按钮。没有标签页。 |
| `packages/market/plugins/src/apis/library.ts` | 已有 `previewMarketEntry(spec)` POST `action: "market-preview"`，返回 `{ readme, contents }`。 |
| `packages/resources/plugins/src/host/preview.ts` | 已实现暂存拉取、`readPackContents`、README 读取、10 分钟缓存；不写库。 |
| `packages/resources/plugins/handlers.ts` | 已有 `market-preview` case，先 `assertMarketInstall`。 |
| `packages/resources/plugins/src/detail-dialog.tsx` | 可复用 `Tabs variant="line"`、`ContentList` 的 Item 形状、`CodeCard`（从 `@context-hub/extensions/components` 导出）。 |
| `packages/market/skills-sh/src/detail-dialog.tsx` | 现成的 `Skeleton` 线条用法，可参考节奏。 |
| `packages/market/plugins/src/i18n/*` | 还没有 tab、README、preview 状态键。 |

## 实施

### 阶段 1：右栏头部与信息重排

**目标**：详情弹窗看起来和设计稿一致，但数据仍用现有索引字段。

**改动文件**

- `packages/market/plugins/src/detail-dialog.tsx`
- `packages/market/plugins/src/i18n/en.ts`
- `packages/market/plugins/src/i18n/zh-cn.ts`

**做法**

- 头部移到 `DialogSplit` 的 `panel`（右栏）顶部：
  - 40px `MarketMark`（已有，使用 `enrichmentOf` / `readEnrichment` 的图标）；
  - `DialogTitle`：插件名，mono，17–18px；
  - `DialogDescription`：`{source.name} · {category}`，12px，muted；
  - `DialogClose` 在行末。
  - 头部高 84px、底部 hairline、内边距 20px，和 `plugin-plugins` 的 `InfoPanel` 同节奏。
- 右栏正文（padding 20、gap 14）：
  - SOURCE 标签 + 四条窄栏 meta（标签 11px 在上、值 mono 11.5px 在下，允许换行）；
  - 分割线；
  - HOME 标签 + `View on GitHub`；
  - 弹性空白；
  - 底部按钮：未入库 `Install`，已入库 `Manage in Plugins`。
- 删除 STATUS / INSTALL 两个 `section`，以及这些键的使用：
  - `market.plugins.detail.status`
  - `market.plugins.detail.notInstalled`
  - `market.plugins.installed`（删除状态块后如果没有其它调用）
  - `market.plugins.install.note` 保留（安装弹窗仍在用）；`market.plugins.detail.install` 保留（底部按钮文案）
- 左栏先保留现有 ABOUT 内容，阶段 2 再加标签页。

**验收**

- `pnpm --filter @context-hub/market-plugins typecheck lint`
- 1440 与 2291 宽度下打开详情：头部在右栏、无状态/安装块、SOURCE/HOME 在右栏、按钮贴底。
- 键盘：关闭按钮可聚焦，Esc 关闭；头部 `DialogTitle` / `DialogDescription` 仍被读屏读到。

### 阶段 2：标签页与预览数据

**目标**：打开详情时读取包内容；只有扫描到的标签出现；加载/失败有明确状态。

**改动文件**

- `packages/market/plugins/src/detail-dialog.tsx`
- `packages/market/plugins/src/rows.ts`（放可测的 `offeredTabs`）
- `packages/market/plugins/__test__/rows.test.ts`
- `packages/market/plugins/src/i18n/en.ts`、`i18n/zh-cn.ts`

**做法**

- 弹窗挂载时请求一次：
  ```ts
  previewMarketEntry(row.entry.install)
  ```
  - 状态：`loading | ready(value) | failed(error)`；
  - 不把请求结果写回索引或库；失败不清空已显示的索引数据。
- 可测纯函数放在 `rows.ts`：
  ```ts
  export type DetailTab = "content" | "skills" | "commands" | "mcp"
  export function offeredTabs(contents: PackContents | null): DetailTab[]
  ```
  - `null` → `["content"]`；
  - `skills.length > 0` → 加 skills；
  - `commands.length > 0` → 加 commands；
  - `mcp` 非 null 且 trim 后非空 → 加 mcp。
  - 当前激活 tab 不在 offered 里时回落到 `content`（沿用 `plugin-plugins` 的处理）。
- 标签栏用 `Tabs variant="line"`，样式抄 `plugin-plugins/src/detail-dialog.tsx`：48px 高、gap 7、下划线 primary。
- 加载中：只渲染 Content 标签；标签栏右侧放一个小 `LoaderCircle` 旋转图标。
- 失败：保留 Content；在 Content 里 README 位置显示一行 muted 提示 + `Retry`（重新调用预览）。
- i18n 新增：
  - `market.plugins.detail.tab.content` / `.skills` / `.commands` / `.mcp`
  - `market.plugins.preview.loading`
  - `market.plugins.preview.failed`
  - `market.plugins.preview.retry`
  - `market.plugins.detail.readme`

**验收**

- 单测：无内容只有 Content；只有 skills / commands / mcp 各自出现；三者都有时顺序为 content、skills、commands、mcp；空字符串 mcp 不算。
- 浏览器：打开一个没有额外内容的包（如 adobe-for-creativity）只有 Content；打开一个有 `.mcp.json` 的包（如 aikido）出现 MCP；打开有 skills/commands 的包出现对应标签。
- `pnpm --filter @context-hub/market-plugins typecheck test lint`
- `pnpm --filter @context-hub/plugins test`

### 阶段 3：三个标签页内容与 README

**目标**：Content 显示 README；Skills/Commands/MCP 有可读内容。

**改动文件**

- `packages/market/plugins/src/detail-dialog.tsx`
- `packages/market/plugins/src/i18n/en.ts`、`i18n/zh-cn.ts`

**做法**

- Content：
  - ABOUT 标签 + 索引描述（现有）；
  - hairline 分割线；
  - README 标签 + `<Markdown className="text-[13.5px] leading-6">{readme}</Markdown>`（`@context-hub/shadcn-ui/components/markdown`）；
  - `readme === null` 时整块不渲染，不显示空标题。
- Skills / Commands：
  - 在 `detail-dialog.tsx` 内复制 `plugin-plugins` 的 `ContentList` 形状（`Item variant="outline"`、28px 图标砖、mono 标题、12.5px 描述），不反改 plugins 包；
  - 图标：`SparklesIcon` / `SquareSlashIcon`；
  - 列表在 pane 内滚动。
- MCP：
  - 直接用 `@context-hub/extensions/components` 的 `CodeCard`：
    ```tsx
    <CodeCard path=".mcp.json" text={contents.mcp} className="h-full" />
    ```
  - 不做 JSON 解析/美化；文件原样展示。
- README 相对图片：本轮不给 `imageBase`，绝对地址图片正常显示，相对图按 `Markdown` 规则省略。
- 左栏整体 `overflow-y-auto`，滚动条只出现在内容区，不带动右栏按钮。

**验收**

- 浏览器：README 标题/列表/代码块渲染正常；Skills/Commands 卡片与插件模块详情同形；MCP 代码卡与 `.mcp.json` 内容一致。
- 长 README 只在左栏滚动，右栏 Install 按钮位置不变。
- `pnpm --filter @context-hub/market-plugins typecheck lint`
- `pnpm --filter web typecheck`

### 阶段 4：骨架屏、失败态、可访问性、收尾

**目标**：加载/失败/空内容都可读；索引与文档收尾。

**改动文件**

- `packages/market/plugins/src/detail-dialog.tsx`
- `packages/market/plugins/__test__/*`
- `packages/resources/plugins/__test__/market-preview.test.ts`（新增）
- `docs/market.md`
- AOCI 索引

**做法**

- 骨架屏（参考 skills-sh）：
  - Content 的 About 立即显示；
  - README 区域：`LoaderCircle` + `Reading pack contents…` + 4 条 `Skeleton`（高度 10、圆角 4、宽度约 92% / 84% / 72% / 88%，随左栏收缩，不用固定像素）；
  - 标签栏只渲染 Content，不画未知标签的占位。
- 失败态：Content 内一行 `TriangleAlert` + `market.plugins.preview.failed` + Retry；保留索引描述与右栏信息。
- 可访问性：
  - 每个 tab 是 `TabsTrigger`，键盘左右键可切换；
  - 头部 `DialogTitle`/`DialogDescription` 保留；
  - 图标 `aria-hidden`，图片 `alt=""`；
  - 关闭按钮有 `aria-label`。
- host 侧新增测试 `market-preview.test.ts`：临时 git 仓库里放 README、`skills/x/SKILL.md`、`commands/y.md`、`.mcp.json`，断言读取结果；再调用一次断言缓存命中（不重复 clone）。
- 文档：`docs/market.md` 的详情段落改为「标签页只在扫描到时出现；加载骨架；README 相对图片不代理」。
- AOCI：受管文件稳定后运行一次 `aoci_maintain`，按候选提交完整 Entry。

**验收**

- `pnpm --filter @context-hub/market-plugins typecheck test lint`
- `pnpm --filter @context-hub/plugins typecheck test lint`
- 根 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`
- 浏览器 QA（ego-browser）：
  - 1440 与 2291 宽度；
  - 有全部内容 / 只有 Content / 加载中 / 预览失败四种状态；
  - 切换标签不丢滚动位置以外的状态；Esc 关闭；焦点环可见。
- AOCI 无新增未解释文件。

## 风险与开放问题

1. **首次打开会 clone**：`market-preview` 是暂存 git 拉取，大仓库或慢网络下可能需要数秒；骨架屏承担等待。已有 120s fetch 超时。
2. **README 相对图片**：本轮不代理，README 里的 `./assets/x.png` 不会显示；绝对地址图片正常。若需要，后续用 raw.githubusercontent 的 sha 前缀给 `Markdown` 传 `imageBase`。
3. **Codex 无 sha**：预览按 `ref`/默认分支读取，和安装时的实际提交可能不同步；索引有 sha 的条目不受影响。
4. **标签页动态出现**：预览失败时只剩 Content；重试成功后 Skills/Commands/MCP 才出现，不保留失败前的旧 tab 状态。
5. **不反改 plugins 包**：复制 `ContentList` 形状会带来约 30 行重复；如果后续第三个页面也要用，再抽到 `@context-hub/extensions/components`。

## 自审

- **调用方**：`page.tsx` 只传 `row` / `installed` / `onInstall`，弹窗内部新增请求不影响调用方；`previewMarketEntry` 已存在，无需改安装弹窗。
- **兼容性**：删除 STATUS/INSTALL 只影响详情弹窗；安装弹窗仍独立存在；`market-install` 链路不变。
- **安全**：预览继续走 `assertMarketInstall` + 暂存拉取，不写库、不执行包内容；README 用 `Markdown` 的 sanitize 管线。
- **数据丢失**：无写操作；预览失败不影响库和已安装的包。
- **测试**：标签条件、预览读取/缓存、现有 297 条 plugins 测试、16 条 market 测试。
- **设计一致性**：与 `02 · Detail`、`02b · Detail states` 四个状态逐项对齐；右栏 360px 与 `DialogSplit` 一致。
