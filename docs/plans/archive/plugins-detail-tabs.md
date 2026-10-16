# Plugins 详情弹窗加页签：展示图 / Skills / Commands / MCP

## Context

`/plugins` 的详情弹窗（`packages/plugin-plugins/src/detail-dialog.tsx`）左边一整块是
`MediaPane`（封面图 + 上传/粘贴/链接），右边是 `InfoPanel`（位置、来源、分类），
`FilesPanel` 从右侧滑入。

同仓 `/mcp` 的详情弹窗（`plugin-mcp/src/server-dialog.tsx:654-714`）是**左栏带页签**：
`配置 / 工具 / 配置文件` 共用一条 `TabsList variant="line"`，右边 `ServerPanel` 恒定不变。
用户要求 plugins 也这样，页签为 `[展示图、Skills、Commands、Mcp]`：

- Skills / Commands / Mcp 三个页签**在打开弹窗时扫描**，扫不到就不显示该页签；
- Skills 只扫插件目录的 `skills/`，Commands 只扫 `commands/`，Mcp 只读 `.mcp.json`；
- Mcp 页 = MCP 弹窗的「配置文件」页（一个代码卡片）；
- Skills / Commands 页 = List-Item，只显示 title + description。

## 已确认的前提

- **弹窗左边是页签的宿主**，右边 `InfoPanel` 与滑入的 `FilesPanel` 都不动。
  这与 MCP 的分工一致（`server-dialog.tsx` 的 `pane` 是 Tabs，`panel` 恒定）。
- **未收录的包（`plugin.stored === false`）同样扫**：`plugin.directory` 是 agent 就地读它的
  目录，`FilesPanel` 已经是这么读的（`detail-dialog.tsx:1141-1149`）。扫描接口照这个
  `name` / `dir` 二选一的形式给。
- **扫描放 host 侧**，一次请求答完。客户端扫要靠现成的 `files` + `file` 两个接口，
  一个包 N 个 SKILL.md 就是 N+1 次请求；而且 `frontmatter` 解析在客户端没有落点，
  `check-plugin-*.ts` 也测不到。
- **不跨插件包复用 `plugin-skills` 的 `parseSkillFile`**：本仓没有任何插件到插件的依赖
  （`packages/*/package.json` 里没有 `workspace:plugin-*`），为一个几行的 frontmatter
  读取引入第一条这样的边不划算。host 侧写一个最小的字段读取，只认 `name` / `description`。
- **设计稿的差异（用户本轮的话优先）**：`designs/plugins.pen` 的详情弹窗是
  `配置 / 技能 / 命令 / 钩子 / 文件` 五个页签，技能页是**表格**（技能 / 分类 / 说明）外加一行
  Notice。用户本轮明确说的是四个页签、List-Item、只显示 title + description，按用户说的做。
  设计稿里的「配置」「钩子」「文件」本次不做（文件已有独立的 `FilesPanel` 滑入层）。
- **页签计数**：设计稿的「技能」「命令」页签带数字（`Tab 技能: Label 技能, Count 12`），
  照做（数字直接来自扫描结果，不加 i18n 键）。

## 不做（超出本次范围，已知）

- 设计稿技能页那行 Notice（「从插件目录的 skills/ 扫描得到。要修改内容，请到「文件」页签
  打开 SKILL.md。」）与分类列本次不做。
- 不在弹窗里编辑这些文件（`FilesPanel` 只读）。
- 钩子（`hooks/`）不扫。

---

## 阶段一：host 侧扫描

**改动**

1. `packages/plugin-plugins/src/contract.ts`：加 `PackContentItem` / `PackContents` 两个
   两侧共用的类型，以及 `NO_CONTENTS`（什么都没扫到时的那一份）。
2. 新文件 `packages/plugin-plugins/src/host/contents.ts`：`readPackContents(dir)`。
   - `skills/<name>/SKILL.md` → title = frontmatter `name` ?? 目录名，description = frontmatter `description`；
     没有 SKILL.md 的子目录不算技能。
   - `commands/` 下递归的每个 `*.md` → title = frontmatter `name` ?? 去掉 `.md` 的文件名，
     description 同上（命令的 frontmatter 支持 `description`，没写就是空串）。
   - 根目录 `.mcp.json` 的原文（没有则 `null`）。
   - 结果按 title 排序，列表每次打开都一样。
3. `vite.ts`：加 `GET ?action=contents`，`name` 走 `library.packDir(name)`、`dir` 直接读，
   与 `action=files` 同形。
4. `src/library.ts`：加 `packContents(name)` / `packContentsIn(dir)` 两个读取函数，
   照 `packFiles` / `packFilesIn` 写。

**完成目标**：一个包目录能一次答出三个页签的内容。

**验收**

- `node scripts/check-plugin-library.ts` 里新增一节，写一个临时包，断言：
  只认带 SKILL.md 的技能目录、命令递归进去、`.mcp.json` 原文、什么都没有时三项皆空。
- `pnpm --filter @workspace/plugin-plugins typecheck`。

---

## 阶段二：弹窗页签

**改动**

1. `src/messages.ts` + `packages/locale-zh-cn/src/messages.ts`：加
   `plugins.detail.tab.media|skills|commands|mcp`、`plugins.detail.files.copy|copied`
   （MCP 那页的代码卡片要复制按钮）。
2. `src/detail-dialog.tsx`：
   - `PackLightbox` 里挂一次扫描（`PackLightbox` 按 `plugin.id` key 挂载，所以这就是
     「打开弹窗时扫一次」），结果存 state；读不到时按空的算——说不出话的是文件面板那边的事。
   - 左栏改成 `Tabs`：顶部 `TabsList variant="line"`（照抄 `server-dialog.tsx:654-714` 的
     尺寸与配色），内容区按页签切换。页签列表 = 展示图 + 扫到的那些。
   - Skills / Commands 页复用 `@workspace/ui/components/item`：`Item variant="outline"` 做卡片，
     `ItemMedia variant="icon"` 放 28px 图标砖（技能 `SparklesIcon`、命令 `SquareSlashIcon`），
     加 `ItemGroup / ItemTitle / ItemDescription`。`ItemMedia` 的 `icon` variant 带
     `self-start` + `translate-y-0.5`（把内联图标对到标题基线），28px 的砖要用
     `self-center! translate-y-0!` 压掉，否则两行时砖会贴在标题上。
   - Mcp 页照 `plugin-mcp/src/detail-files.tsx` 的 `FilesPane`：一张 `CodeCard`，
     `path=".mcp.json"`。
   - 当前页签没被提供时回落到「展示图」（照 `page.tsx` 里 `screenTab` 的写法），
     免得出现一个空内容区。

**完成目标**：打开弹窗先看到展示图，扫到的页签出现在同一行，点进去看到列表 / 配置。

**验收**

- `pnpm --filter @workspace/plugin-plugins typecheck` 与 `lint`。
- 起 dev server，用一个真的带 `skills/` + `commands/` + `.mcp.json` 的包打开弹窗，
  确认页签出现、内容正确；再用一个什么都没有的包确认只有「展示图」。
- 用 host 接口 `curl "…/hub/plugins?action=contents&name=<pack>"` 取一次真实值对账。
