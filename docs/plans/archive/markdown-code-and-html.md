# Markdown 的代码块高亮与原始 HTML

## Context

用户报告 `Markdown` 组件缺两项能力，两处在浏览器里实测确认（headless Edge + CDP 读 DOM）：

- **代码块没高亮**：`<pre>` 有 `bg: rgb(247,247,247)`、`<code class="language-bash">`，但 `codeSpans: 0` —— 一个 shiki 着色 span 都没有。
- **原始 HTML 没渲染**：ponytail 的 README 开头 `<p align="center"> <picture> <source …>` 在页面上是**字面文本**（`pictureTags: 0`）。

`Markdown` 在 `packages/ui/src/components/markdown.tsx`（`@workspace/core` 没有 components 目录、也没有任何 React 依赖，所以不是那里）。它是 plugins 的 README 封面与 skills 的文档预览共用的组件。

## 改动

### 1. 共用高亮器：`packages/ui/src/lib/highlight.ts`（新）

原来 shiki 的高亮器私有在 `packages/extensions/src/components/code-view.tsx` 里。文档里的围栏块也要高亮，如果各建一份，同一套 10 个 grammar 会编译两遍。所以下沉到 `packages/ui`（`extensions` 本来就依赖 `ui`，方向对）：

- `loadHighlighter()`：模块级单例，语言表 / 双主题 / JS 引擎都只此一份。
- `paint(text, lang, structure)`：`structure: "classic"` 给 `CodeView`（自带 `<pre>`），`"inline"` 给文档里的围栏块（**只有 span，没有 `<pre>`/`<code>`**，让文档自己的 `<pre>` 继续当外框）。语言不认识时返回 `null`，由调用方维持"先显示纯文本"的既有行为。

`structure: 'inline'` 是 shiki 4 的正式选项（`@shikijs/types` 的 `CodeToHastOptions`），不是猜的。

### 2. `packages/ui/src/components/markdown.tsx`

- `rehypePlugins={[rehypeRaw, rehypeSanitize]}`：先解析再消毒。用 **`defaultSchema`，没有自定义 schema** —— 实测它已经放行 `p/div/span/br/hr/details/summary/picture/source/img/table/a/kbd/sub/sup`、任意元素上的 `align`、以及 `code` 的 `language-*` class，而 `script`/`style`/`on*` 全部被滤掉。react-markdown 自己已经开了 `allowDangerousHtml`，所以 `rehypeRaw` 直接可用。
- `components={{ code: Code }}`：只有带 `language-*` 的 code 才是围栏块，行内 code 原样。围栏块走 `FencedBlock`，异步上色，未上色前就是原来那个纯文本块。

### 3. `packages/ui/src/styles/globals.css`

新增 `@utility doc-code`：读 `--shiki-light` / `--shiki-dark` 两个变量。**没有复用 `file-code`** —— 那个utility 带行号（`.line::before` counter）和 11.5px 固定字号，文档里的代码块两样都不该有。

### 4. `packages/extensions/src/components/code-view.tsx`

改用 `paint(...)`，自己的 `loadHighlighter` / 语言表 / 主题表删掉，`.catch` 的降级逻辑移进 `paint`。`grammarOf(path)`（扩展名→grammar 的表）留在原地，那是它自己的事。

`packages/extensions/package.json` 因此不再直接依赖 `shiki`，删掉。

### 5. 依赖

`packages/ui/package.json` 加 `rehype-raw ^7.0.0`、`rehype-sanitize ^6.0.0`、`shiki ^4.5.0`（三个版本都已在 lockfile 里，是把既有的传递依赖提升为直接依赖）。lockfile 只多了 9 行 importer，无其他改动。

## 验证

1. `pnpm typecheck` / `pnpm lint` 全仓 22/22 绿
2. **真浏览器实测**（用户的 5173 dev server，未另起服务、未动那个进程）：
   - superpowers 灯箱围栏块：`codeClass: "doc-code"`、span 数 **0 → 3**、`--shiki-light`/`--shiki-dark` 变量在、**浅色下 span 颜色 `rgb(111,66,193)`**（≠ 正文 `rgb(10,11,13)`）；给 `<html>` 加 `dark` 后变 **`rgb(179,146,240)`** —— 主题切换真的跟着走
   - ponytail 灯箱：`pictureTags: 9`、`p["align"]` 计算样式 `-webkit-center`、`literal: false`、`scripts: 0`、`onAttrs: 0`
   - 回归（高亮器搬家）：文件面板 `CodeCard` 的 `.file-code` 仍有 1017 个 span、**行号还在**、颜色正常
3. `node packages/plugin-plugins/scripts/check-plugin-*.ts`（209 / 67 / 19）全过

## 已知边界（本轮未做，需要用户定）

**`<img>` 仍然被 CSS 隐藏**（`markdown.tsx` 的 `[&_img]:hidden`）。含义：

- ponytail 那个 `<picture>` 居中 logo 渲染出来是**空的** —— `src="assets/logo.png"` 是包内相对路径，`Markdown` 没有 base URL 解析不了。
- 连它那几条 `https://img.shields.io/...` **绝对 URL 徽章也不显示**。

改成 `[&_img:not([src^=http])]:hidden`（只藏相对路径）就能让徽章出来，但这会让"渲染一个第三方包的 README"变成**向第三方服务器发请求**（暴露 IP）。原来一律隐藏是有意的决定，所以这里没动，等用户裁决。

## 附带发现（与本次任务无关，未处理）

`.npmrc` 里有真实 npm token，**已被 git 提交**（`c1b405a`、`6bf8e6d`）且不在 `.gitignore` 里。删除工作区文件不足以移除历史记录，需要轮换密钥 + 决定是否重写历史。
