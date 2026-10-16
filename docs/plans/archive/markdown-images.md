# README 里的图片

## Context

上一轮让 Markdown 渲染原始 HTML 之后，用户贴出 ponytail 的 README 开头说「不能渲染图片啊」。

原因两层，都在 `packages/ui/src/components/markdown.tsx` 之外：

1. `base` 类的最后一条是 `[&_img]:hidden` —— 所有图片一律被 CSS 隐藏（原注释：「预览解析不了 skill 相对路径的图片」）。
2. 即使放开，README 里的 `assets/logo.png` 也是**包内相对路径**，页面没有 base URL 解析不了；`Markdown` 组件手里没有任何「这个文档的文件在哪儿」的信息。

## 改动

### 1. 桥：一个按字节读包内文件的动作（`packages/plugin-plugins`）

`?action=file` 只答文本，图片要的是文件本身。新增 `?action=raw`，与 `action=file` 同一对寻址方式（`name` = 库里那份，`dir` = agent 读的那份），答 `Content-Type` + 字节，`no-store`。

- `src/host/library.ts`：把路径逃逸检查抽成 `resolveInDirectory(dir, file)`，`readInDirectory` 与新的 `readBytesInDirectory` 共用同一个判据；`PluginLibrary` 加 `readBytes(name, file)`。
- `vite.ts`：新增 `sendBytes(response, bytes, file)` 与 `action=raw` 分支。
- `packages/core/vite.ts`：把已有的 `contentTypeOf` 导出，**没有**在插件包里再抄一张 MIME 表（两张表对同一个扩展名早晚会答得不一样）。

**为什么不直接用已有的 `/hub/files/plugins/<name>/<path>`**（它确实能服务已收录的包，零代码）：那只覆盖库里的那份。**只被 agent 持有、还没收录**的包，目录在 hub home 之外，没有任何路由能读——而它的 README 封面走的是同一段代码，图片会照样渲染不出来。本机上 `claude-hud` 就是这种包，本轮用它验证了 `dir` 分支。

### 2. `Markdown`：多一个 `imageBase`

- 新增可选 prop `imageBase`：文档旁边那些文件可读之处的前缀，**结尾留空**，由组件自己接相对路径。
- 移掉 `[&_img]:hidden`。图片能不能画，改由组件判断，不再由 CSS 一刀切。
- `components.img` / `components.source`：
  - 带协议（`https:`、`//host`）的引用是文档自己的地址，原样保留；
  - 其余按文档旁边文件解析：`imageBase + encodeURI(去掉开头的 /)`（GitHub 上 `/x.png` 就是仓库根，所以开头的 `/` 不能当站点根）；
  - 没给 `imageBase`（skills 就是这种调用方）时相对引用**不画**，而不是画一个坏图标；
  - `<picture>` 的 `<source srcset>` 一并按同样规则改写（ponytail 的暗色 logo 靠它），`<img srcset>` 本身不在 sanitize 白名单里，不用管。
- react-markdown 给每个元素挂的语法 `node` 必须从 DOM props 里去掉，否则会真的落成一个 `node="[object Object]"` 属性。

### 3. 调用点

`packages/plugin-plugins/src/library.ts` 新增 `packImageBase(plugin)`（`stored` → `name=`，否则 `dir=`；两者都没有 → `undefined`），灯箱的 `ReadmeStage` 与卡片的 `ReadmeCover` 各接一次。

## 验证（真浏览器，headless Edge + CDP）

自己起了一台 5273 的 dev server 做验证——**vite 插件的改动不会热更新**，跑在旧进程上的桥没有 `action=raw`，第一次 curl 全是 405。用户自己的 5173 全程没动。

- 路由本身：`action=raw&name=ponytail&path=assets/logo.png` → `200 image/png 567655`；`../../plugins.json` → `400 "escapes the directory"`；缺文件/缺 path/不存在的包 → `400` 带原因。
- ponytail 灯箱：**22 张图，22 张加载成功（`naturalWidth > 0`）**，0 张坏；相对图走 `/hub/plugins?action=raw&...`，徽章保持 `https://img.shields.io/...`；4 组 `<picture>` 的 `srcset` 也一并改写。
- **`dir` 分支**：`claude-hud`（只被 agent 持有）的 README 配图经 `action=raw&dir=...\cache\claude-hud\...` 成功加载。
- 列表页卡片：整页 28 张图全部加载、0 张坏。
- 版式：文档列宽 640，最宽的图正好 640、横向不溢出（Tailwind preflight 的 `img{max-width:100%}` 兜住了），`width="220"` 的 logo 画 220。
- 安全：`nodeAttrs: 0`、`scripts: 0`、`onAttrs: 0`；`javascript:` / `data:` 的 src 被 sanitize 摘掉。
- skills 页（不带 `imageBase` 的那个调用方）：栅格 4 张、详情 8 张全部加载、0 坏、0 失败请求。本机没有任何 skill 的 SKILL.md 里带图片引用，所以「相对图不画」这条分支在真实数据上跑不到，只有代码路径可读。
- `pnpm typecheck` / `lint` 全仓 22/22；`check-plugin-*` 209 / 67 / 19 全过。

## 已知边界

1. **绝对地址的图会被浏览器真的去请求**（shields.io、trendshift、api.star-history.com）。渲染第三方 README 就等于向那些域名暴露 IP 与 UA。这是「图片能渲染」的直接后果；要关掉就得按域名设白名单，没做。
2. `?action=raw` 能把包内**任意**文件当字节发出去，不止图片。与既有的 `?action=file`（任意文件的文本）同一个暴露面，没有新增越权，但这条路由本身是通用的。
3. `.md` 在 core 的 MIME 表里没有，答 `application/octet-stream`。这条路由实际只被图片用到，没补。

## 附带发现（未处理）

`apps/web` 里 `?action=file&dir=<某目录>` 对没有 README.md 的包会答 400。那是既有约定（`packFile` 显式 `.catch(() => null)`，文件面板也是这样），我的 `usePackReadme` 照抄了这个处理，所以是「一次被接住的失败请求」，不是缺陷。
