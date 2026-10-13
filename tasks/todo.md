# 插件模块的界面（2026-10-13，用户：「先只实现 UI，可以全部复制 skills 模块」）

## 第四轮：详情弹窗（用户：「点击打开弹窗，和 skills 那个差不多：左边上传资源图片，右边功能区，
还可以查看文件」）

- 新文件 `src/detail-dialog.tsx`：`PluginDetailDialog` = `Dialog` + 共享的 `DialogSplit`
  （1136×740，与 skills 同一个外壳）。里面按包拆出一个 `PackLightbox`，**以包 id 作 key**，
  于是换一个包时媒体与选中的文件都从头开始（不用 effect 同步状态）。
  - 左 = `MediaPane`：舞台（按图片自身比例 `object-contain`，无图时是「插件图标 + N 个技能 · M 个命令
    + 描述」的占位块）、`1 / N` 计数胶囊与左右箭头（仅 >1 时）、72×44 缩略图条 + `+` 上传格
    （Popover 三个入口：选择文件 / 从 URL 导入 / 粘贴）、拖放遮罩、粘贴提示胶囊、底部提示行。
    **有意不用 swiper**：这一层只有几张图，`active` 一个 state + 两个箭头等价且没有 swiper 的四个坑；
    上传的图用 `URL.createObjectURL`，卸载时统一 `revokeObjectURL`（不落盘 —— 还没有宿主能写）。
  - 右 = `InfoPanel`：h84 头部（等宽名字 + `v版本 · 来源` + 关闭）、滚动区（描述 / `TagEditor` /
    「包含」分组的 技能 / 命令 / 更新时间 三行）、h64 页脚（主按钮 `查看文件` + `安装`/`卸载`，
    按当前安装态切换）。
  - 覆盖层 = `bg-scrim` + 从右侧滑入的 `FilesPanel`（880 宽）：`PluginFileTree` + `CodeCard`，
    默认选中 `README.md`，读取中显示 spinner。
- `src/file-tree.tsx`：照 skills 的同一实现（`@headless-tree/react`，默认只展开根、点击文件夹展开、
  `fileTreeKey` 强制重挂载），两个包各持一份（跨包共享要改内核，暂不做）。为此给本包加
  `@headless-tree/core` + `@headless-tree/react` 依赖。
- 页面接入：卡片与列表行都能打开弹窗（卡片是 `role="button"` + Enter/Space，行是 `Ledger` 的 `onOpen`），
  行内动作按钮 `stopPropagation` 不会连带打开；`catalog` 提升为页面的 state，弹窗里改标签会写回该行。
- 示例文件：`sampleFiles(plugin)` 由行自身拼出 `plugin.json` / `README.md` / `skills/<x>/SKILL.md` /
  `commands/run.md`，**每一层目录都要列出来**（少了中间目录，headless-tree 里那个文件夹永远展不开 —— 这次踩到）。

实测（浏览器，zh-CN）：弹窗 1136×740、pane 776 / panel 360；媒体区三块 605 / 44 / 15 总高不溢出；
上传一张 PNG → 缩略图 2 枚、计数 `2 / 2`、舞台切到 blob；点第一枚回到封面；移除后恢复 1 枚；
文件面板滑入（`translate` 100% → 0）、树展开到三级、选 `SKILL.md` 后内容与标题跟着变、返回后 `aria-hidden`；
页脚 `卸载` → 已安装 6→5 / 未安装 5→6，再点 `安装` 复原；列表行与卡片 Enter 都能打开；关闭后无对话框。
检查：全仓 typecheck、web + 新包 lint、`pnpm --filter web build`、`check-messages.ts` 529/529 全绿。

## 第三轮：瀑布流看起来不像瀑布流（用户：「卡片布局是不对的，skills 那个是响应式瀑布流，一行最多 5 个」）

**根因在数据，不在 CSS。** 网格代码与 skills 是同一套（容器查询 556/846/1136/1426），实测容器 1138 →
4 列 / 卡宽 266，与 skills 逐像素相同。真正的问题是：示例行**都没有封面**，回落封面统一 16:9，
于是 11 张卡全是 291px 高 —— 看起来就是普通等高网格。

改法：`src/sample.ts` 给 5 行不同比例的内联 SVG 封面（`flatCover(w, h)` → `data:image/svg+xml` 的
两条平色带，4:3 / 16:9 / 1:1 / 2:1 / 3:4），其余行仍走「插件图标 + N 个技能 · M 个命令」的封面。

实测（把 `@container` 元素宽度依次设成下表值）：

| 容器宽 | 480 | 700 | 900 | 1200 | 1500 | 1800 |
| --- | --- | --- | --- | --- | --- | --- |
| 列数 | 1 | 2 | 3 | 4 | 5 | 5（封顶） |
| 卡宽 | 480 | 338 | 284 | 282 | 281 | 341 |

同一宽度下卡片出现 5 档高度（1138 容器：274 / 291 / 341 / 407 / 496）= 真正的瀑布流。
（把容器硬设得比视口宽会让 `body.scrollWidth` 溢出，那是测量伪影；真实 1138 下溢出为 0。）

**教训**：用户说「布局不对」时先量基准值（列数 / 卡宽 / 卡高）再动 CSS —— 这次 CSS 一行都没改。

## 第二轮：工具条两个按钮 + 添加弹窗（用户：「第一个按钮是检测更新，第二个按钮是添加 plugins，
添加 plugins 得有一个弹窗」）

- 工具条右边只剩两个：`检测更新`（outline + `RefreshCwIcon` / `plugins.action.checkUpdates`）与
  `添加插件`（primary + `PlusIcon` / `plugins.action.add`，打开弹窗）；原来的「导入 / 浏览市场」两键已删。
- 新文件 `src/add-plugin-dialog.tsx`：照 skills 的 `add-skill-dialog.tsx` 的壳（640 宽、header + 分段段
  标 + 内容 + 列表，无 footer）。两段 **市场 / 本地**（主按钮默认开市场）：
  - 市场 = 源字段（`border-input`，空时 `列出` 禁用）+ `列出` 胶囊；
  - 本地 = 拖放区（`h-56`、`FolderUp`、`选择文件夹`）→ 选过之后换成文件夹条（`h-16`、mono 名字、
    `这个文件夹里有 N 个插件包`、`更换`）；
  - 列表 = 68px 行（`ScrollTextIcon` 瓦片 + mono 名字 + `安装` 胶囊），未选/空态是一行中性说明。
- **本地只做了浏览器能说的那点**：`webkitdirectory` 的 `FileList` 按 `webkitRelativePath` 首段分组 =
  文件夹里的顶层插件包；不判定「是不是插件包」（那要读清单）。点一行的安装只把它加进页面的 `installed`。
- 实测：640 宽、市场段 302 高 / 选完文件夹 381 高、`scrollWidth === clientWidth`；段切换、`列出` 随输入启用、
  中性说明行、文件夹条 + alpha-pack / beta-pack 两行都核对过；关掉后弹窗从 DOM 移除。
- 检查：全仓 typecheck、web + 新包 lint、`pnpm --filter web build`、`check-messages.ts` 495/495 全绿。

## 第一轮：新包与页面（见下）

## 做了什么

**新工作区包 `packages/plugin-plugins`（`@workspace/plugin-plugins`）**，界面照 `plugin-skills` 的
`page.tsx` 复制，把功能逻辑整段摘掉：

- `src/page.tsx`：页面外壳（标题块 + 工具条 + 页签 + `FilterBar` + `PageBody` 页脚）、瀑布流卡片网格
  （`@container` + `columns-1 @min-[556px]:2 @min-[846px]:3 @min-[1136px]:4 @min-[1426px]:5`，
  按封面自身比例排版的 `aspectRatio` + 比例缓存）、`Ledger` 列表（列份额 2.9/43.1/19.3/16.1/10.1/8.5）、
  批量条、`TablePagination`、空状态。
- `src/types.ts`（`PluginRow` / `PluginSource`）、`src/sample.ts`（11 条临时示例行 + 初始已安装集合）、
  `src/messages.ts`（`plugins.*` 英文兜底 34 键）。
- `src/index.ts`：`pluginsExtension` —— 用内核的 `nav`（assets 组、order 30）+ `route` 贡献 `/plugins`。
- 接入：`apps/web/package.json` 加 `workspace:*`、`lib/hub.ts` 的 `extensions: [...]` 注册。
- **shell 侧旧 mock 插件模块整份删除**：`pages/plugins.tsx`、`components/plugin-detail-dialog.tsx`、
  `components/install-plugin-dialog.tsx`、`lib/plugins.ts`（只被 `App.tsx` 引用，删得干净），
  `navigation.ts` 的静态 `nav.plugins` 项与 `App.tsx` 的 `/plugins` 路由一并去掉 —— 现在这条路由由插件包提供。

## 有意没做的（等下一步）

- 详情弹窗、远程市场搜索弹窗**已做**（见第四轮）；弹窗里上传的图片只活在这个窗口（没有宿主可写），
  上传段与文件段读的都是示例数据。
- 添加弹窗里的 `检测更新`、`列出`、拖放后的判定、以及行上的 `安装` 都**还没有真逻辑**：
  市场段列出不了任何东西（没有注册表源），本地段只按浏览器给的路径分组。
- 页签轴是「全部 / 已安装 / 未安装」（示例集自身的状态），skills 那套「位置 / 作用域（工作区 / 全局）」
  与安装到具体 Agent 的菜单要等插件的位置模型定下来再说。
- `src/sample.ts` 是**临时假数据**，只为把两个视图撑起来；读真实插件目录的实现落地时整份删除
  （示例数据不得留成"读不到时的兜底"）。

## 与 skills 的实测对照（1205px 视口 / 容器 901px）

| 项 | skills | plugins |
|---|---|---|
| 卡片宽 / 网格列数 | 284 / 3 列 | 284 / 3 列（列起点 272 / 580 / 889） |
| 列表列宽 | 26 / 388 / 174 / 145 / 91 / 77 | 同左（逐像素相同） |
| 行高 | 66 | 66 |
| 动作列溢出 | 单元格 77px、内容 105px（溢出 28） | 77px、内容 87px（溢出 10） |

动作列在窄容器下溢出是**共享 `Ledger` + 同一套列份额的既有行为**（skills 更严重），不是这次引入的。
瀑布流容器是真的，但示例行都没有封面 → 回落封面统一 16:9，所以现在三列等高；真封面进了才有参差。

## 验证

- `pnpm typecheck`（22/22）、`pnpm --filter web lint`、`pnpm --filter @workspace/plugin-plugins lint`、
  `pnpm --filter web build` 全绿；`node packages/locale-zh-cn/scripts/check-messages.ts` 478/478
  （新增 `plugins.*` 中英键各 34 个，`plugin-plugins: 34 keys`）。
- 浏览器（http://localhost:5173/plugins）：侧栏「插件」由插件包贡献（概览 / 技能 / MCP 服务器 / 插件 顺序正确）、
  页签 全部 11 / 已安装 6 / 未安装 5；列表视图 11 行 66px；点「卸载」该行离开已安装页签且未安装变 6；
  点标签胶囊 `docs` 收窄到 1 行；查询 `data` + `docs` 组合命中筛选空态（「没有找到匹配的插件」+「清除筛选」）；
  两个视图切换与页脚分页正常；全程 `bodyOverflow 0`。
- 重启 dev server 是必须的（新增工作区包 + `hub.ts` 改动），已按老办法杀 5173 监听进程、删
  `apps/web/node_modules/.vite`、`Start-Process` 脱离终端重启。

## 未决

- `designs/plugins.pen` 还是旧那版（列表列 16/362/222/150/170/96、网格卡 266x246、详情弹窗 5 页签），
  与这次照 skills 重做的界面**不一致**，需要用户确认是改画板还是改实现。

# Cline 的 MCP provider（2026-10-13，用户问「这个报错合理吗」）

用户看到 MCP 页报「`~/.cline.json`：读不到这个客户端的配置文件。」，问这是否合理、以及安装 Agent 会不会
自动生成客户端 JSON。

- **报错不合理，但根因不是"文件不存在"**：`packages/agents-extensions/cline/src/index.ts` 用
  `registry.register({id, places})` **只注册了位置、没有实现 `read`/`install`/`uninstall`**
  （`pnpm --filter @workspace/agent-cline typecheck` 当时报 3 条错，连 `plugins.mcp` 都解析不到 —— 因为
  该包没声明 `@workspace/plugin-mcp` 依赖）。扫描时 `provider.read()` 抛 TypeError，被 `scanPlaces` 兜成
  「读不到这个客户端的配置文件」。**按契约，缺文件应当返回空列表**（claude-code 就是这么做的）。
- **顺带纠正三处写错的路径**：`~/.cline.json` 不是 Cline 的文件；Cline **没有**项目级 MCP 文件（那个
  workspace place 是凭空的）；官方文档给的是 CLI 的 `~/.cline/data/settings/cline_mcp_settings.json`
  （`CLINE_MCP_SETTINGS_PATH` 可覆盖），IDE 扩展各存各的 globalStorage、没有跨平台统一定位
  → **只写 CLI 那一个**（家目录相对，`PlaceRef.file` 允许子目录，两平台都成立）。
- **条目形状**：`mcpServers[name] = {command,args,env,disabled,autoApprove}`；远程是
  `{type:"streamableHttp"|"sse", url, headers, disabled}`。两个与其它 JSON 客户端不同的约定**在本 provider 里处理**：
  ① `type: "streamableHttp"` 是 Cline 的拼法（共享 reader 只认 `"http"`/`"sse"`）；
  ② **没有 `type` 的条目是 legacy SSE**，而共享 reader 会读成 `http`。
- **`switchable: true`**（原先写 false 是错的）：条目自带 `disabled`，所以能"保留声明地停用"。
- **不属声明的字段要留住**：改写条目时先 `keptOf(entry)`（排除 `command/args/env/url/headers/type`）
  再合并新声明，`autoApprove` 与 Cline 自己记的 `disabled` 因此跨重写保留（JSON 条目是一个节点，
  重写会让该节点自身重排，属预期）。
- 新增 `scripts/check-provider.ts`（34/34，含"文件不存在 → 空列表"、两种传输拼法、开关往返、
  重写保留 autoApprove、以及四种拒绝），`package.json` 补 `@workspace/plugin-mcp` + 开发期 `@workspace/core`。
- 真机：位置显示为 Cline 的设置路径、加载无报错；装/关/卸三个路径都实测通过；
  装完的目录（本机原先没有 `~/.cline`）已删除，`~/.claude.json`、仓库 `.mcp.json`、记录文件均未被污染。

## 回答用户的两个问题（写在这里备查）

- **安装 Agent 不会创建任何客户端文件**：安装扩展只是内核里 `ctx.plugin()` 启用一个插件，不碰磁盘上的客户端文件。
- **客户端 JSON 只在两种时机出现**：① 客户端自己保存设置时；② 在「安装到」里把某个 MCP 写进那个位置时
  （只写一条条目，文件不存在就建）。「创建 MCP」那一步只写 hub 自己的记录（`<home>/mcp/mcp.json`）。

# 描述兜底 + 就地编辑 + 失败改走 toast（2026-10-12）

用户报告：「有些 MCP 它是没有注释的」→ 要在代码里给一句默认注释，并**双击就地改成 textarea**；
随后补充「卡片和表格的那个描述，也是这个默认描述」，最后指出**文案要统一**、
不要用 `{x === "" ? … : x}` 这种写法。

- **一句话，三处共用**：`mcp.description.missing` = 「这个 MCP 没有说明自己的用途，双击这里可以手动补充。」
  （en: `This server says nothing about itself. Double-click here to write its description.`）。
  卡片（`card-view.tsx`）、列表行（`list-view.tsx`）、详情弹窗（`server-dialog.tsx`）都读它；
  弹窗原来另开的 `mcp.detail.description.missing` 已删除（两处措辞不一致被用户否掉）。
- **就地编辑**：`server-dialog.tsx` 新增 `DescriptionLine` —— 一行 `<p>`，双击换成 `Textarea`
  （`autoFocus`、初值 = 当前显示的文字，所以编辑服务器自己的话是**改**不是**重打**）；
  Enter 换行、Cmd/Ctrl+Enter 或点击别处提交、Esc 丢弃（用 `thrown` ref 挡住 Esc 引发的 blur 提交）。
  提交写进 hub 的记录（`library.update(id, {description})`），而记录在 `descriptionOf()` 里**先于**服务器自己的话被读。
- **`||` 而非 `??`**：这一项是**空字符串**，`??` 不会回落（实测 `"" ?? f → ""`），写成 nullable 回落
  正好让最需要这句话的服务器显示空白。三处的颜色与文案都跟着同一个真值判断走
  （`x ? "text-copy" : "text-muted-foreground"` + `{x || missing}`）。
- **失败改走 toast**：页面原来在列表上方渲染一行红字（`status = failure ?? notice ?? scan problem`），
  会一直留着、像页面状态，而且把一切失败都说成「探测」。现在：
  `apps/web/src/App.tsx` 在 shell 里挂一份 `<Toaster>`（整个表单共用一个 viewport），
  页面用 `toast.add({type:"error", title})` 报失败（`useRef` 记住已报过的那句，避免重渲染重弹），
  保存成功也走 `type:"success"`。`notice` state 与那行 `<span>` 连同 `run()` 一起删除。
- 验证：`plugin-mcp` + `web` typecheck/lint 干净、`check-mcp` 61/61、`check-messages` 432/432；
  浏览器：三台无描述的服务器在三处都显示提示句（`rgb(124,130,138)` 的 muted 色）而 context7 显示自己的句子，
  双击弹窗那行出现 textarea、Esc 取消后记录文件逐字节未变。
- 现场复原：验证过程中一次控件点击让 `upsert` 把记录移到文件末尾（内容不变、只是顺序），
  已按原顺序写回并逐字节核对。顺带发现 `钉钉待办` 的标签是 `" 钉钉"`（前导空格）——属既有数据，未改。

# 列表视图的图标漏用探测缓存（2026-10-12，用户报告）

用户："列表布局这一块的那个图标，没有显示我们缓存后的那个图标"。

- 卡片（`card-view.tsx`）与详情弹窗（`server-dialog.tsx`）都传了 `icon={server.check?.icon}`，
  只有列表行 `list-view.tsx` 的 `<ServerTile mark={server.mark} />` 漏了这一个属性，
  于是缓存里的图标（context7 的 `https://context7.com/context7-icon-green.png`）只在另外两处出现。
- 改动 = 一行：`<ServerTile mark={server.mark} icon={server.check?.icon} />`（沿用 36px 默认尺寸）。
- 验证：列表与卡片两视图逐行核对 —— context7 有 `<img>` 且 `naturalWidth > 0`，
  另外三台的缓存里本来就没有 `icon` 字段，按设计回落通用 mark。typecheck / lint 干净。

# MCP 探测缓存改为「按名字命中」：只有没有缓存数据才自动探测（2026-10-12，用户报告）

## 目标（用户原话）

- BUG：切换工作区时「所有的 MCP 都会自动触发检测」；改启用/停用状态时「也会触动触发这个 MCP 的检测」；
  安装到 Agent 时「也会触发这个 MCP 的检测」。
- 正确实现：以上三种操作都**不触发检测**；「只有第一次安装或者扫描时、触发检测、并且缓存检测结果」；
  「当下一次刷新页面时去和缓存数据做对比、如果这个 mcp 没有检测缓存数据、自动触发检测」；
  「下一次检测只能用户手动触发、并缓存检测结果」。

## 根因

`cache.compare` 的「命中」= 缓存里有这个名字 **且声明指纹一致**（声明 + scope + 解析后 cwd 的 sha256）：

- 切工作区：宿主 `startFolder()` 跟着换 → cwd 变 → 每个服务器都「没命中」→ 全部重探
  （已在运行的 dev 里实测：切到 `new-api` 后连着发出 4 个 `probe`）。
- 安装到 Agent：记录的服务器原先没有任何安装（`targetScope` = workspace），装进全局 place 后
  scope 变 global → 指纹变 → 重探。
- 改启用/停用：声明本身不变（Claude Code 写 `disabledMcpServers`、Codex 写 `enabled` 字段），
  这一条主要是**观感**——`checking` 绑的是 `busy`（任何动作都显示「检查中…」），
  卡片「检测于 {age}」用的是本次扫描时间（`catalog.scannedAt`），一按开关四张卡同时变「刚刚」。

## 改动

- `src/host/cache.ts`：`compare(names)` 只按名字命中（仍要求 `probe === PROBE_VERSION`，探测实现换代仍重探一次）；
  删掉 `fingerprintOf`、条目里的 `fingerprint`、`McpProbeSubject.cwd`；`CACHE_VERSION` 1 → 2
  （旧文档里多出的 fingerprint 字段被忽略，仍可读）。
- `src/probe.ts` / `vite.ts`：`cache` 动作只传名字；`cwd` 只在真探测时解析（顺带省掉一次工作区查询）。
- `src/library.ts`：`probeAll` 按名字取缓存，`known[name] === null`（没有任何缓存数据）才自动探测；
  「检查全部」「测试连接」照旧强制重探并写回缓存。
- `page.tsx` / `card-view.tsx`：工具条「检查中…」只在真有探测在跑时出现（`library.testing` 非空）；
  卡片「检测于」= 这条自己的检测时间（没有检测才回落扫描时间，与详情弹窗同一条规则）；
  页脚「上次检查」= 所有服务器里最新的一次检测时间（没有检测才回落扫描时间）。
- 检查脚本随规则走：`scripts/check-probe.ts` 的指纹段落改成「换了声明/作用域/工作目录仍然命中」，
  `scripts/check-mcp.ts` 的夹具条目去掉 `fingerprint`。

## 验证

- [x] `plugin-mcp` typecheck + lint 干净；`check-probe` 49/49、`check-mcp` 60/60、`check-mcp-tools` 84/84、
      `check-plugin` 30/30、`check-messages` 425/425。
- [x] 重启 dev server（宿主侧代码不热更）后真机走查（用页面内 fetch 记录 + 网络监听双份证据）：

| 操作 | 发出的请求 |
| --- | --- |
| 刷新页面（4 台都有缓存） | `records` + `cache`，**0 个 probe** |
| 切工作区（→ new-api、→ dsh-context-hub） | `records` + `cache`，**0 个 probe** |
| 开关「启用/停用」（钉钉 AI 表格 · Claude Code 本项目） | `records` + `cache`，**0 个 probe** |
| 安装到 Agent（playwright → Claude Code `~/.claude.json`，作用域 workspace → global） | `records` + `cache`，**0 个 probe** |
| 卸载同一处 | `records` + `cache`，**0 个 probe** |
| 删掉 playwright 的缓存条目后刷新 | `records` + `cache` + **恰好 1 个 `probe:playwright`**（随后再刷新不再探测） |
| 卡片「测试连接」 | 1 个 `probe:<该服务器>` |
| 「检查全部」 | 4 个 `probe` |

- [x] 观感核对：开关/安装/切工作区后卡片「检测于」不再跳到「刚刚」，各卡显示自己那条检测的时间；
      工具条不再因为普通动作显示「检查中…」。
- [x] 旧缓存文档（version 1、带 fingerprint）被新构建直接读用、**不触发重探**；下一次写入升到 version 2。
- [x] 副作用复原：安装测试往 `~/.claude.json` 写的条目已撤回（与操作前逐字节一致）；
      开关测试把「钉钉 AI 表格」恢复为原来的已停用（`disabledMcpServers: ["钉钉 AI 表格"]`）；
      仓库根的 `.mcp.json` 未改动。

## 说明 / 注意

- 升级路径：`PROBE_VERSION` 仍是唯一的「老旧判定作废」开关（探测实现换代时每台自动重探一次），
  声明/作用域/工作目录不再参与命中判定。
- 本机另有一个 22:04 启动的旧 vite 实例仍占着 5173（跑的是旧宿主代码）。两个 dev server 同时开着时，
  旧实例会把不带 fingerprint 的新条目按「读不懂」丢掉并重探，看到「探测风暴」时先确认只剩一个实例。

# MCP 详情弹窗：页签、配置文件面板、共享代码块（2026-10-12，用户三轮报告）

## 目标（用户原话）

1. "这里使用英文的时候直接乱码了，你是不是没有用 shancn-ui 的组件" —— 英文标签互相重叠。
2. "Config files 是展示 mcp 的 mcpServers"；"context7只有claude-code全局绑定的，
   但是他查看MCP配置文件的时候，把clode.json全部给展示出来了，我只需要展示MCP的MCP server"。
3. "MCP弹窗这一块和分割线好像是没有间距呀…和 SKILL 的布局不一致"。

## 改动

- **页签**（`server-dialog.tsx`）：删掉手写 `button` + `style={{width: 30|56}}`（按中文标签量的像素宽），
  改用 `@workspace/ui/components/tabs` 的 `Tabs` / `TabsList variant="line"` / `TabsTrigger`，宽度交给文字。
  `h-12!` 与 `after:bottom-0!` 是压过 line 变体自带的 32px 与 `-5px`：组件自身的类排在 caller 的类**前面**，
  非 important 的覆盖会被它盖掉。
- **配置文件面板**（`detail-files.tsx` 重写）：不再读客户端整文件，改为**由记录组装**
  `{ mcpServers: { <name>: entryOf(declaration) } }`（组装在 `server-dialog.tsx` 的 `useMemo` 里）。
  页面因此不再需要拉文件：删掉 `held` state、`installedPlaces` / `placesKey` 与那个 effect，
  `ServerDialog` 也不再收 `files` 属性。
- **共享代码块**：`CodeView` + `CodeCard` 移到 `@workspace/extensions/components`（skills 与 MCP 共用一份），
  `shiki` 依赖从 plugin-skills 移到 extensions；复制按钮点完变 `CheckIcon`（主色）、**3 秒**后还原；
  卡片没有标题时复制按钮浮在右上（配置文件面板没有文件名可写）。
- **分隔线间距**：MCP 的 places `<ul>` 从 `flex flex-col` 改成 `flex flex-col gap-2.5`，
  与 skills 的 `PlacesSection` 一致（发丝线上下各 10px）。
- 回退：中途为"只显示 mcpServers 片段"改过 `provider.ts` / `toolkit.ts` / `jsonc.ts` / `toml.ts`
  的跨包契约（新增 `excerpt`），用户指出记录里已有数据、不该改这些文件，已全部 `git checkout` 还原。

## 验证

- `pnpm --filter {extensions,plugin-mcp,plugin-skills} typecheck|lint` 全绿；`check-messages` 427/427；
  `check-mcp` 60/60、`check-probe` 54/54、`check-mcp-tools` 84/84、`check-plugin` 29/29；`pnpm build` 通过。
- 浏览器（zh-CN + 真数据）：英文档下页签为 104 / 36 / 86.4px，各贴自己的文字宽度，不再重叠；
  context7（只装在 Claude Code 全局）的面板只剩它自己的 `mcpServers` 条目（`url` / `headers` / `type`），
  `~/.claude.json` 的项目设置不再出现；places 分组分隔线上下各 10px，与 skills 一致。
- 未提交：`packages/agents-extensions/cline/src/index.ts` 是**用户在进行中**的改动
  （注册了 Cline 的 MCP provider，但缺 `read`/`install`/`uninstall`，会让 `pnpm build` 报 TS2345），
  与本次无关，保持原样。

# MCP 记录改存 `mcp/mcp.json`，格式带 `mcpServers`（2026-10-12，用户报告）

## 目标（用户原话）

"1、应该是储存到 mcp/mcp.json 里面；2、mcp 配置的信息应该要这样存取
`{name, mcpServers: {<name>: <entry>}, description, tags}`；后续安装到 Agent 里面的时候需要取 mcpServers 数据就可以了。"

## 改动

- **格式**：`packages/plugin-mcp/src/records.ts`（新，浏览器与宿主共用）——
  `McpRecordDocument{name, mcpServers, description, tags}`、`entryOf`（= `writeDeclaration` +
  远程服务器写 `type`，否则 `sse` 读回会变 `http`）、`documentOf`、`recordOf`（条目必须挂在
  记录自己的名字下）、`readRecords`（数组，或单个对象）、`recordsFromState`（旧 state 形状）、
  `upsert`、浏览器端口 `createRemoteRecords()`。
- **存储**：`packages/plugin-mcp/src/host/records.ts`（新）—— `<home>/mcp/mcp.json`，
  原子写 + 写队列；**首次读到文件不存在时**把旧的 `<home>/state/mcp.json` 转换并入新文件，
  然后删掉旧的（读一次、迁一次）。目录常量 `CACHE_DIR` 改名 `MCP_DIR`（缓存与记录共用）。
- **桥**：`/hub/mcp` 增加 `{action:"records"}` / `{action:"save-records"}`（`readMcpCall` 校验）；
  `probe.ts` 抽出 `callMcp()`。`vite.ts` 在 `startFolder()` 之前分发这两个动作。
- **library.ts**：不再走 `ctx.host.storage`；`read()` 里先 `loadRecords()`（失败报
  `mcp.error.records`）再扫描，记录传给 `probeAll`；`keep()` 改为 await 落盘。
- **文案**：`mcp.error.records`（en + zh）。
- `catalog.ts` / `index.ts` 只管目录合并；记录解析/序列化全部搬到 `records.ts`。

## 验证

- `check-mcp.ts` 60/60、`check-probe.ts` 54/54（含新文件落盘、坏 JSON 拒绝、迁移后旧文件消失、
  线上动作校验）、`check-mcp-tools.ts` 82/82、`check-plugin.ts` 29/29、`check-messages` 408/408；
  typecheck 10/10、lint 干净、`pnpm build` 通过。
- 真机：重启 dev server 后首读完成迁移 —— `~/.context-hub/mcp/mcp.json` 4 条全在新格式，
  `state/mcp.json` 已删；页面 4 台服务器显示正常。UI 新增 `zz-storage-check` 再删除，
  文件哈希回到基线（`60A92D…E632`），即写-删往返逐字节一致。
- 坑：PowerShell 5.1 `Invoke-RestMethod` 读 UTF-8 响应会乱码/合并条目，核对线上响应要用
  `curl.exe` + `[IO.File]::ReadAllText(..., UTF8)`。

## 后续：空对象回填缩进血案（2026-10-12，用户："这换行前面换行符太多了"）

- **症状**：安装 MCP 到客户端文件后，条目被写进 `"mcpServers": {` 之下却带着 18 空格缩进。
- **根因**：`jsonc.ts` 的 `insert()` 往**空对象**填第一个属性时，缩进量从花括号自己的**列号**
  推出来（`columnAt`），而 `{` 在 `"mcpServers": ` 行尾（列 16）→ 条目 18 空格。
  触发路径：卸载最后一个条目 → 留下空盒（有意保留，见编辑器的两条约定）→ 再安装。
- **修复**：空对象分支改取该行的**行首缩进**（新助手 `lineIndentAt`）+ 一级；有属性时仍借
  第一个属性的位置（它在自己的行上，锚点是对的）。
- **回归断言**（`check-mcp-tools.ts`，现 84/84）：删空 → 回填必须逐字节等于干净的两空格版；
  再删回去必须逐字节等于空盒。修复前第一条失败并复现了 18 空格症状（已实测灵敏度）。
- **教训**：凡「从某个字符的位置推缩进」，先确认那个字符独占一行；否则必须用行首空白。

# 公共 PlacePicker 控件（2026-10-12）

## 目标

把「选哪个 Agent / 装到哪个 place」的列表收成一个共享控件，操作由调用方开放，
放在 `packages/extensions/src/components/place-picker.tsx`（用户选定：extensions 已是 React 侧契约包）。

## 现状（同一件事 5 份实现）

- skills `page.tsx`：`PlaceStack` / `PlaceMenu` / `PlacePicker`（私有，埋在 1989 行里）+ `SkillActionButton` + `BulkBar`
- skills `skill-detail-dialog.tsx`：`PlacesSection`（平铺 + 按 scope 折叠）
- mcp `place-picker.tsx`：`PlaceStack` / `PlaceMenu` / `PlacePicker`（与 skills 92% 逐行相同）
- mcp `menus.tsx`：`InstallToMenu` / `EnabledMenu`（又各写一份行样式）
- mcp `server-dialog.tsx`：`Places` / `PlaceRow`（平铺，无折叠）

## 组件 API（数据与操作开放）

- 类型：`PlaceOption { id, icon, label, where?, note?, count?, selected?, blocked? }`、`PlaceGroup`、`PlaceWords`、`PlaceListWords`
- `PlaceStack`：图标栈 + 溢出计数
- `PlaceMenu`：下拉内容（标题 / 搜索 / 分组 / `leading` / 尾部件 / 行是否整行可点 / `onPick`）
- `PlaceScopePicker`：作用域 pill + 菜单（含「全部 place」leading）
- `PlaceList`：平铺行 + 折叠，每行尾部动作由 `action(option)` 渲染

## 执行顺序（边做边勾）

- [x] 1. `packages/extensions/src/components/place-picker.tsx` + `./components/place-picker` export + `@workspace/ui` 依赖
- [x] 2. skills `page.tsx`：删本地三件套（343 行），改用共享件；`SkillActionButton` / `BulkBar` 用 `PlaceMenu`，页签用 `PlaceScopePicker`
- [x] 3. skills `skill-detail-dialog.tsx`：`PlacesSection` 用 `PlaceList`（库行保留在页面侧）
- [x] 4. mcp：删 `place-picker.tsx`（353 行）；`menus.tsx` 两个菜单用 `PlaceMenu`（安装用 checkbox 尾部件、启用用 `activation="control"` + Switch）；`server-dialog.tsx` 用 `PlaceList`（顺带获得折叠）
- [x] 5. mcp 文案补 `mcp.place.expand` / `mcp.place.collapse`（en + zh-cn）
- [x] 6. 验证：`pnpm typecheck` 10/10、4 个包 lint 干净、`check-messages` 412/412、`check-services` 16/16、`check-plugin`（mcp）29/29、`check-package`（skills）全过、`pnpm build` 成功；真机走查 /skills 与 /mcp-servers

## 组件 API（最终）

```tsx
<PlaceScopePicker scopeIcon scopeLabel places chosen active allLabel title words onChoose />   // 作用域 pill
<PlaceMenu title groups words leading closeOnClick trailing activation align count onPick />   // 下拉内容（自渲染 popup）
<PlaceList groups words action visibleCount />                                                 // 详情平铺 + 折叠，返回 <li>
<AvatarStack marks active max />                                                               // 图标堆叠 + 溢出计数（单独文件 avatar-stack.tsx）
```

# 公共 TagEditor + FilterBar（2026-10-12，续）

用户两轮追加："把 skill 的这个添加 tag 的组件封装成公用组件，然后大家一起用"、
"这一块的逻辑也需要提炼出公用组件"，并指出 MCP 的两处逻辑错误：
① 详情弹窗的快捷选择写死了 9 个固定类型（`MCP_TAGS`），不是"已有类型"；
② 筛选行的胶囊同样是那份固定清单，不是服务器自己带的值。

## 组件

```tsx
<TagEditor tags suggestions words={{add, placeholder, remove}} onChange labelFor? />  // 类型行：胶囊 + × + 下拉建议（filter-bar 的姊妹件）
<FilterBar query onQuery tags tag all onTag words={{search, clear, all}} />           // 搜索框 + 类型胶囊行（4 枚后折 +N）
```

- `TagEditor`：`suggestions` = 调用方给的"已有值"，已带的自动排除；`labelFor` 只在值≠显示名时给（MCP 已不需要）。
- `FilterBar`：`all` 是"不筛类型"时 `tag` 的取值（skills 用 `"All tags"`，MCP 用 `""`）；`/` 聚焦与 Esc 清空
  随控件走，两模块行为一致（MCP 原先只有一个不会响应的 `/` 装饰）。

## 顺带修掉的固定清单

- 删 `MCP_TAGS` / `tagList` / `McpTag` / `mcp.tag.{vcs,browser,files,database,messaging,projects,observability,docs}` 8 个键（en + zh）。
- MCP 的类型现在只有一个来源：服务器记录自己的 `detail.tags`（自由字符串）。
  页面 `serverTags` 同时喂筛选胶囊与详情弹窗的建议；卡片徽标直接显示该值。
- 筛选语义修正：`server.tag`（首枚，卡片用）→ `detail.tags.includes(tag)`（任一命中），
  否则"第二个类型"永远筛不出东西。

## 验证

- `pnpm --filter {extensions,plugin-mcp,plugin-skills} typecheck | lint` 全绿；`check-messages` 407/407。
- 浏览器：MCP 胶囊 = 全部标签 / 钉钉 / docs（真实值），点「钉钉」→ 显示 1 / 3；`/` 聚焦可用；
    skills 胶囊仍是 全部标签 / 浏览器控制 / 自动化测试 / context7 / docs / +2，展开 +N、点选筛选、清除搜索均正常。
  
  # 公共 DialogSplit：弹窗的两侧布局（2026-10-12）
  
  用户："还有 skills 这个弹窗的两侧布局也要封装成公用的组件 … 我指的只是弹窗的两侧布局啊，
  并不是里面的内容啊 … 你只需要看 skill 那个的弹窗，不要看 MCP 弹窗的代码。不然的话，你会乱封装的。"
  
  ## 组件

- 数据：`PlaceOption { id, icon, label, where?, note?, count?, selected?, blocked? }`（extends `AvatarMark { id, icon }`），不含领域类型
- 操作：`onPick(id)`（行=动作）、`action(option)`（列表每行尾部，调用方自渲染）、`trailing(option)`（菜单尾部）、
  `activation: "row" | "control"`（行是否可点）、`count(all)`（表头计数口径）
- 文案：调用方按自己命名空间注入（skills.place.* / mcp.place.*），组件不知道任何 i18n key
- 触发器仍由调用方自己写（各自的尺寸/填充不同），组件只持 popup：`<DropdownMenu><DropdownMenuTrigger render={…} /><PlaceMenu … /></DropdownMenu>`

## 回顾

- **刻意不抽的部分**（2026-10-12 用户确认"先不动，等真的加第三个页面时再抽"）：「位置」小节的外框仍是各页自己写 ——
  小节标题（skills 13/12.5px、mcp 12/12px）、外层 `<ul>`（skills `gap-2.5`、mcp 无间隔）、技能侧那行「技能库」。
  共享的是列表体：分组标题、place 行、两组间发丝线、折叠。
- **侧栏 Agents 列表也刻意不共享**（同日确认）：`apps/web/src/components/app-sidebar.tsx` 的 `AgentGroup` 自带
  `AGENTS_VISIBLE = 8` 与自己的折叠行（键 `agents.group.expand/collapse`），是侧栏列（`SidebarRow` + 直接切换 + 折叠），
  不是下拉也不是搜索，且唯一调用方在 shell 里。于是全仓库现有**三个 8**：组件的 `PLACE_SEARCH_MIN`（菜单搜索）、
  组件的 `PLACES_VISIBLE`（详情列表折叠）、侧栏的 `AGENTS_VISIBLE`（侧栏折叠）。共享组件里那条折叠行的样式是照侧栏手工对齐的。
- 视觉/行为保持：菜单宽度 280、≥8 项搜索、菜单行 `items-start gap-2.5 py-2`、列表行 `h-14` 与 28px 图标牌、折叠阈值 8、行尾动作与禁用原因全部照旧；
  只有两处刻意的统一：行图标统一 16px（原 14/15/17/18）、MCP 详情两组之间的分隔从 17px 带变成 1px 发丝线（与技能侧一致）。
- 新增能力：MCP 详情弹窗的 place 列表现在也有折叠（此前没有），文案 `mcp.place.expand/collapse`。
- 反例记录：**不要**在这两个包里跑 `pnpm format`（prettier 会把大量未改动文件按 80 列重排；本次改完已 `git checkout` 撤销 80 个文件的连带改动）。


# MCP 连接探测（2026-10-12）

## 目标

把 MCP 页的「测试连接」从空操作变成真握手（官方 `@modelcontextprotocol/sdk`，进程内），
并把探测结果缓存：**发现 MCP → 比对缓存 → 未命中才自动探测一次；命中就不探测，等用户手动操作。**
探测所得（serverInfo/图标/capabilities/instructions/tools）驱动卡片图标、详情弹窗与「工具」页签。

## 规则（用户 2026-10-12 确认；**同日已被推翻** —— 见文首「按名字命中」，指纹不再参与命中判定）

- **命中** = 缓存里有这个名字，**且声明指纹一致**。声明改了（命令/参数/URL/headers/env/作用域）
  等于「没找到」，自动重探一次；只改注释、空白、键顺序不影响。
- **失败条目也算命中**：上次连不上不会每次开页面自动重试，用户点「测试连接」才重试。
- 手动「测试连接」= 忽略缓存重探这一条；重探结果照常写回缓存。
- 探测范围 = 一次会话里 `initialize` → `notifications/initialized` → `tools/list`（拿「详细信息」）。
- 探测只发生在 MCP 页打开、发现跑完之后（发现照旧每次都真读文件；只缓存昂贵的探测）。

## 存储

`<home>/mcp/cache.json`（宿主写，浏览器只读；纯派生缓存，删掉会重建）：

```jsonc
{ "version": 1,
  "servers": { "<name>": {
    "probe": 1,                    // 探测实现版本；以后想多收内容就 +1，旧条目自动失效
    "fingerprint": "sha256:…",     // 原始声明 + scope + 解析后 cwd 的哈希（值不进文件）
    "target": "npx -y …",          // declarationLine()，凭据脱敏
    "scope": "workspace", "at": 0, "ms": 0,
    "ok": true,
    "protocolVersion": "2025-06-18",
    "serverInfo": { "name": "…", "title": "…", "version": "…", "websiteUrl": "…" },
    "icon": { "src": "data:…", "mimeType": "image/svg+xml", "sizes": "any" },
    "capabilities": {}, "instructions": "…（≤2KB）",
    "tools": [ { "name": "…", "title": "…", "description": "…", "inputSchema": {}, "outputSchema": {} } ],
    "error": { "kind": "spawn|auth|timeout|protocol|env", "message": "…", "code": "…" },  // 失败时
    "stderr": "…（最后 4KB，仅 stdio 失败）"
  } } }
```

- 为什么不在 `state/`：`state/` 会被 App 启动全量读进内存、每次整份 PUT；几十~几百 KB 的派生数据不走那条路
  （先例：技能库的派生数据在 `<home>/skills/index.json` 自己的目录下）。
- 上限（防病态服务器）：icon ≤ 32 KB、instructions ≤ 2 KB、stderr ≤ 4 KB、tools 序列化 ≤ 256 KB。
- 不存：env/headers 明文（只进哈希）、完整日志、原始报文。
- 清理：每次落盘顺带删掉不在当前目录里的名字（与本次写入合并成一次）。
- 宿主是唯一写者；浏览器只收本次 probe 的 entry，不信自己拼的整份文档。

## 改动

- 依赖：`@modelcontextprotocol/sdk` 加进 `plugin-mcp`，只被 `src/host/**` 与 `vite.ts` 引用（`contract.ts` 的无 `node:*` 约束不破）。
- `packages/plugin-mcp/src/host/probe.ts`（新）：SDK 探测。`new Client({name,version})` +
  `StdioClientTransport` / `StreamableHTTPClientTransport` / `SSEClientTransport`；`${VAR}`/`$VAR` 按
  Claude Code 语义在**探测时**展开（缺变量报 `kind:"env"`），展开结果绝不写回文件；超时 stdio 30s / 远程 15s；
  核对 Windows 下 npx 型命令的孙进程是否残留（必要时 `taskkill /T` 兜底）。
- `packages/plugin-mcp/src/host/cache.ts`（新）：cache.json 读写（原子写，复用 `@workspace/core/host/atomic`）。
- `packages/plugin-mcp/vite.ts`（新，恢复 `"./vite"` export）：`POST /hub/mcp?action=probe|cache`；
  probe 体 = `{declaration, scope|cwd, cache, timeoutMs?}`（`cache:false` 供添加弹窗试用、不落盘）；
  `apps/web/vite.config.ts` 注册。
- `packages/plugin-mcp/src/probe.ts`（新，浏览器侧）：`probeAvailable()` + `createRemoteProbe()`，无 `node:*`。
- `packages/plugin-mcp/src/types.ts`：新增 `McpCheck`（浏览器可读的条目）；`McpServer.check?`；
  `McpDetail.tools: number → McpTool[]`。
- `packages/plugin-mcp/src/schema-tree.ts`（新）：JSON Schema → `McpField[]`（渲染期转换，缓存保真存原始 schema）。
- `packages/plugin-mcp/src/library.ts`：读缓存 → 未命中入队（并发 3）→ 结果并入 catalog；手动重探动作。
- 页面：卡片/列表图标优先 `check.icon.src`（`<img>`，SVG 绝不内联）；「测试连接」出进行中/成功（耗时、协议版本）/
  失败（原因 + stderr 尾巴）；详情弹窗加「连接」段；「工具」页签接真数据；无宿主形态按钮禁用并说明。
- 文案：`mcp.check.*` 等新键；en + zh 同步（`check-messages.ts` 兜底相等）。

## 执行顺序（边做边勾）

- [x] 0. 装依赖并核对 API：`@modelcontextprotocol/sdk@1.32.1` 已进 plugin-mcp（仅宿主侧引用）；
  核对结果：`icons`/`websiteUrl` 已在 SDK 类型里；stdio 可 `stderr:"pipe"` 且启动前就能挂监听；
  `close()` 是 SIGTERM→SIGKILL，**只作用于直接子进程**（npx 型孙进程留给检查脚本观察）；
  **SDK 不暴露协商后的 protocolVersion** → probe 用 transport 包装在 initialize 回包上取值。
- [x] 1. `src/host/probe.ts`：一个会话完成 initialize + tools/list；`${VAR}`/`${VAR:-default}` 展开（缺变量 → `kind:"env"`）；
  错误分类 env|spawn|auth|network|timeout|protocol|unknown（"Connection closed" 归 spawn）；上限截断。
- [x] 2. `src/host/cache.ts`：指纹（原始声明 + scope + cwd，sha256、键序无关）、`<home>/mcp/cache.json`
  原子写 + 写队列、读回校验、prune、`PROBE_VERSION`。
- [x] 3. 桥：`plugin-mcp/vite.ts`（`"./vite"` export）+ `apps/web/vite.config.ts`；`GET /hub/mcp` = 探活，
  `POST …?action=probe|cache`；probe 支持 `save:false`（添加弹窗试用不落盘）。
- [x] 4. `scripts/check-probe.ts` + `scripts/fixture-server.mjs`：**43/43**（真实起进程、真连端口、真写盘）。
- [x] 5. 浏览器侧：`src/probe.ts`（类型 + 线上校验 + 客户端 + 探活）+ `types.ts`（`McpServer.check?`、
  `McpDetail.tools: McpTool[]`）+ `schema-tree.ts`（JSON Schema → 树）。
- [x] 6. `library.ts`：读完文件 → compare → 未命中自动探测（并发 3、同名去重防双跑）→ 并入 catalog；
  `test(id)` 单条重探；`refresh()`（检查全部）强制重探；`testDraft()` 供添加弹窗试用。
- [x] 7. UI：瓦片优先画服务器自己的 icon（`<img>`，加载失败回落品牌 mark）、
  **卡片检查块 = 声明字段本身**（http/sse：URL + 请求头；stdio：命令 + 参数 + 环境变量；
  args/env/headers 为空时值显示「无需」`mcp.check.none`，**不再显示「位置」行** —— 用户明确要求）、
  **「就绪/失败」胶囊是唯一的状态指示（2026-10-12 用户第四轮）**：卡片上**完全不出现探测结果行**——
  成功不写「已连接 · N ms」（用户："已连接也没有啊 我都已经有就绪了"），失败也不写「连接 · 原因」
  （用户："还有这个也是多余"）；原因只在详情弹窗的检查块里（句子 + 原始报错 + stderr 尾巴），
  卡片只展示配置字段与状态胶囊。连带删除 `checkVerdict`、`mcp.card.connection`、`mcp.check.kind.*`
  （14 个中英键）。`status` 现在 = 配置冲突/不可读 **或** 探测失败。
  详情弹窗检查块里多一行 `websiteUrl`（等宽、ink、左对齐、外链图标、`h-[26px]`，**没有标签**）、
  失败时才出现的报错块（句子 + 原始报错 + stderr 尾巴）、
  工具页签接真数据（空态分「未探测 / 无工具 / 上次失败」）、添加弹窗可试用探测、无宿主禁用。
- [x] 8. 文案 en+zh；`pnpm typecheck` 10/10；plugin-mcp lint 干净；`check-messages.ts` 417/417。
- [x] 9. 真机验证：见下。

## 第七轮修正（2026-10-12，用户："我不要这个最大字符上限" + "Tools 为什么获取不到 output 的描述"）

- **描述类文本不再截断**：删除 `DESCRIPTION_LIMIT`/`INSTRUCTIONS_LIMIT` 与 `head()`；
  `serverInfo.description` 与 `instructions` 原样入缓存（详情弹窗本来就是完整展示的地方）。
  保留的只剩真正的防护上限：icon 32KB、stderr 4KB、tools 256KB/500 条。
  `PROBE_VERSION` 3 → 4（旧缓存里可能存在被截断的值）。
- **工具树的两个真实解析缺口（本次修复）**：
  1. `schema-tree` 从不读 schema 的 `title` —— 钉钉的全部字段用的是 `title`（"待办任务 taskId"），
     以前整列描述都空白；现在 `schemaText` = `description` 优先、`title` 回落。
  2. input/output schema 的**根描述**被写死文案（"入参"/"返回信息"）覆盖 —— 现在根行显示服务器写的内容，
     服务器没写才回落 i18n；`McpTool` 增加 `inputDescription`/`outputDescription`。
- **output 为空的真相与呈现**：context7 与两个钉钉服务器的工具**都没有 `outputSchema`**（原始 tools/list 为证）——
  MCP 的 outputSchema 是可选字段。现在 output 既无字段又无描述时显示「服务器没有声明输出结构。」
  （`mcp.detail.tools.noOutput`），而不是一个空树。
- 验证：check-mcp 51/51（含 4 条工具树断言）、check-probe 44/44、消息 410/410；浏览器实测
  context7 与钉钉待办的入参树完整显示、出参显示说明。

## 描述与图标（2026-10-12 用户两问）

- **图标**：钉钉端点在 `2025-11-25` 下返回的 `serverInfo` 只有 `name`/`version` —— 无 `icons`/`title`/`websiteUrl`；
  图标是 SEP-973 的可选字段，服务器不实现就没有，hub 按设计回落通用图标（已用原始 initialize 请求作证）。
- **描述（本次补的真实缺口）**：原探测**没读 `serverInfo.description`**，且 `instructions` 只存不显。
  现在：探测读 `description`（≤1KB 上限）+ 卡片/弹窗按「记录 → serverInfo.description → instructions」回落（`descriptionOf`）。
  `PROBE_VERSION` 2 → 3（探测多收字段，旧判定退休、各服务器自动重探一次）。
- 实测：context7 的 `serverInfo.description`（"Context7 provides up-to-date documentation..."）一直存在，
  修前不显示、修后上卡片；钉钉服务器自身两个字段都不提供（原始响应为证），描述仍为空
  —— 若要让这类服务器也有描述，需要一个「手写描述」的表单字段（尚未做，待用户决定）。
- 覆盖：`check-probe.ts` 44/44（夹具服务器加了 description）、`check-mcp.ts` 47/47（4 条回落断言）。

## 真机验证（2026-10-12）

- **真实远端**：`context7`（`~/.claude.json`、Streamable HTTP）自动探测成功 → 指纹/图标（https）/
  serverInfo（Context7 4.3.0）/协议 2025-11-25/tools 2 个全部落盘；图标 URL 在本机拉不到时回落品牌 mark；
  卡片的收尾形态是「就绪」胶囊 + 配置字段（不再有「已连接 · N ms」行）。
- **失败与 auth 分类修正（同日第四轮）**：用户新增的「钉钉 AI 表格」返回 `HTTP 401`，而 SDK 的
  `StreamableHTTPError` **把 401 放在 `code` 上、消息里没有数字**，原分类落到 unknown → 显示「探测失败」。
  已修：`classify` 现在也认 `code === "401"/"403"`，显示「需要授权」；**`PROBE_VERSION` 1 → 2**
  （报错分类也是探测实现的一部分，干脆退休全部旧判定、各服务器自动重探一次）。
  注意：**改宿主侧代码必须重启 dev server**（Vite 插件模块不会热更，旧进程仍跑旧的分类与版本号）。
- **手动重探**：卡片「测试连接」→ 按钮禁用旋转 → 结果刷新（2282 ms）；「检查全部」强制重探全部（3402 ms）
  并 prune 掉已消失的名字。
- **试用（save:false）**：添加弹窗「测试连接」显示「已连接 · 139 ms」，缓存文件不变。
- **失败路径**：`ctx-hub-no-such-command-xyz` → 卡片「连接 · 进程失败」；弹窗显示完整句子 +
  `MCP error -32000: Connection closed` + 服务器日志（cmd.exe 原文）；工具页签「上次连接失败，还不知道这个服务器有哪些工具」。
- **清理**：测试记录（fixture-check / broken-check）已删除，`state/mcp.json` 为空，`cache.json` 只剩 context7。

## 已知偏差 / 后续

- 缓存条目在**下一次落盘时**才 prune；某服务器消失后若之后没有任何探测，旧条目会留在文件里（无害）。
- `check-mcp-tools.ts` 的「无 Node 内置模块」断言现在跳过 `src/host/`（那半部本来就在宿主进程里跑）。
- 平台报错原文（cmd.exe/系统语言）按原样显示，不翻译。

## 验证

- `packages/plugin-mcp/scripts/check-probe.ts`（新）：指纹命中/失效规则、缓存读写与清理、
  用仓库自带的 stdio 夹具服务器跑通 probe 全链路（initialize + tools/list + 失败路径）。
- 真机成对验证：探测一个真实 stdio 服务器（成功、有 tools）、一个不存在的命令（失败、有 reason）；
  cache.json 与 UI 一致；重开页面不重探（进程/网络无痕）。
- 收尾：`pnpm run typecheck`、相关包 lint、`locale-zh-cn/scripts/check-messages.ts`。

## 未决

- 批量「重新检测」按钮：本轮先做单条手动重探 + 打开页面时自动补缺；工具栏全量重探看需要再加。
- `${VAR}` 展开语义以 Claude Code 为准；Codex TOML 的行为后补。
- 目录里只有记录、未写进任何文件的行是否参与自动探测：按本计划**参与**（cwd 用当前工作区）。

---

# 插件机制：两条轨道 + MCP 由 Agent 插件自持（2026-10-11；2026-10-12 归位）

## 目标

把「插件机制」拆成两条轨道，让 Agent 插件**自己实现** MCP 客户端的读写，而不是把行为伪装成数据
塞进贡献点：**数据走贡献点，行为走 Cordis 服务**。上一轮（下面那节）的 `mcpLocation` +
`McpSwitch` 是过渡形状，本轮删除。

## 归位（2026-10-12，用户："为啥 mcp 的功能在 extensions 里面？？不对啊"）

MCP 是**功能**，不是内核机制，所以它的契约与工具集不能留在 `@workspace/extensions`：

- **搬到 `@workspace/plugin-mcp`**：`contract.ts`（导出面）、`provider.ts`（`McpProvider`/`McpService`/
  `McpRegistry`/`MCP_SERVICE`）、`toolkit.ts`（`McpTools` 全套）、`declaration.ts`/`jsonc.ts`/`toml.ts`/
  `value.ts`/`failure.ts`。内核的 `src/mcp/` 目录、`"./mcp"` 导出与 `jsonc-parser`/`smol-toml` 依赖**已删**。
  子路径导出 `@workspace/plugin-mcp/contract` 只带契约，不带页面（所以 Node 下的检查脚本能加载它）。
- **服务名与类型归发布者**：`declare module "@workspace/extensions" { interface ExtensionServices }`
  由 plugin-mcp 自己合并；内核只留这张 merge-extensible 表与 `provide`/`inject`。
- **Agent 插件不再从内核取 MCP**：`plugin-claude-code` 只 `import type … from "@workspace/plugin-mcp/contract"`
  （类型导入会被擦除，运行期零依赖），注册与编辑器仍然全部来自 `plugins.mcp`。
- **Codex 搬出内核成为 `@workspace/plugin-codex`**：它要用工具集，而内核不能反向依赖功能插件。
  包内含 `target` 贡献 + `codex.*` 文案 + provider；`builtin/index.ts` 只剩 Copilot 与英文包；
  `apps/web` 的目录里加入 `codexExtension`。（副作用：扩展状态文档里键的顺序变了，用户的选择值不变。）
- 检查脚本随代码走：`plugin-mcp/scripts/check-mcp-tools.ts`、`plugin-codex/scripts/check-provider.ts`。

## 改动

- **内核 `@workspace/extensions/mcp`（已于 2026-10-12 搬到 plugin-mcp，见上）**：声明（`McpDeclaration` + 读/写/单行显示/参数切分）、
  JSONC 编辑器（`editJson`/`jsonValueLines`/`readJsonObject`，注释与格式保留）、TOML 编辑器
  （`setTomlEntry`/`setTomlField`/`clearTomlEntry`，写后校验）、失败形状（`McpFailure`/`McpError`/
  `mcpFailure`）、**服务契约** `McpProvider`/`McpRegistry`/`MCP_SERVICE`。全程无 `node:*`。
- **服务轨道**：`ExtensionScope.provide(name, api)` / `.inject(names, cb)`；`ExtensionView.provides`
  让目录页说得清谁提供了什么；manifest 未声明就 provide 会**激活失败**，不是可选行为。
- **`packages/core` 新增文件缝**：`PlaceRef`/`PlaceFiles`（`read`/`write`/`remove`/`workspace`）+
  `host/place-files.ts`（原子写、只允许 scope 内相对路径）+ dev 桥 `POST /hub/place-files`
  （`readPlaceCall` 校验线上形状）。`PlatformHost.files` 是这条缝的入口。
- **`plugin-mcp` 重写为「记录 + 目录 + 页面 + 注册表」**：不再有 store/remote-store/host/vite；
  `createMcpRegistry()` 作为 `mcp` 服务发布；记录落 `host.storage` 的 `mcp` 键；目录 = 记录 ∪ 各 provider
  读到的声明；页面按 provider 分派每个动作；失败一律以 key 报出、由 `library.ts` 翻译成句子。
- **两个 provider**：`plugin-claude-code/src/provider.ts`（`.mcp.json` + `~/.claude.json`，开关写
  per-project `disabledMcpServers`，项目键按 `\`→`/` 与大小写归一匹配、绝不新造记录）；
  `plugin-codex/src/provider.ts`（`mcp_servers` + `enabled` 字段，2026-10-12 从内核搬出）。
- 删除：`mcpLocation` 贡献点、`McpSwitch`、`MCP_WORKSPACE_SEGMENT`、`plugin-mcp` 的 store 三件套、
  `hub.mcp` 服务与 `MCP_ENDPOINT` 探活、claude-code 里那段 `contribute("skill"/"mcp")` 草稿。

## 验收（已过；2026-10-12 归位后重跑）

- 检查：`plugin-mcp/scripts/check-mcp-tools.ts` 82/82（含 JSONC 装→卸逐字节还原）、
  `plugin-mcp/scripts/check-mcp.ts` 43/43（假 provider）、`plugin-mcp/scripts/check-plugin.ts` 29/29
  （把 example 目录当"下载来的插件"跑通）、`plugin-codex/scripts/check-provider.ts` 30/30
  （真实 TOML 文件 byte-for-byte 还原）、`plugin-claude-code/scripts/check-provider.ts` 33/33
  （47KB 真实文件、项目键归一匹配、开关幂等）、`extensions/scripts/check-services.ts` 16/16
  （含「回调里属性访问会抛，`(ctx, services)` 的 services 才是正路」）、
  `core/scripts/check-place-files.ts` 27/27、`locale-zh-cn/scripts/check-messages.ts` 387/387
  （覆盖面扩到全部英文表，含新包的 `codex.*`）。
  typecheck 10/10；八个包 lint 干净。
- 浏览器（真实机器、真实文件）：MCP 页读到 `~/.claude.json` 的 `context7`；扩展页启用 Codex →
  `~/.codex/config.toml` 的位置与 `node_repl` 行出现（图标取自新包的 manifest），停用即消失，
  `~/.codex/config.toml` 哈希与操作前一致；`state/extensions.json` 恢复为用户原来的选择
  （Codex 停用；键顺序因插件从内核移到应用目录而变化，值不变）。

## 未决 / 已知

- **skills 已迁到同一条缝**（2026-10-13，见本文开头一节）：`skillLocation` 贡献点已删，
  改由 `skills` 服务上的 `SkillProvider` 注册表承载。
- 仍缺：测试连接（stdio/http 真握手）、工具页签读真实 `tools/list`、检查结果落盘。
- 10 个模拟 Agent 插件未做（用户已改口：后面一个个真做）。

## 作用域页签下钻到 Agent（2026-10-12，用户："mcp 页面的 tab 选择没有和 skill 模块一样、可以选择 Agent 智能体"）

- 新增 `plugin-mcp/src/place-picker.tsx`：整段搬自 `plugin-skills/src/page.tsx` 的
  `PlaceStack` / `PlaceMenu` / `PlacePicker`（20px 瓦片、13px 步进、>5 片显 `+N`、>8 个位置出搜索框、
  首行「全部位置」+ 勾选态），只换文案键为 `mcp.place.*` 与 `mcp.detail.place.count`。
- `page.tsx`：`workspace`/`global` 两个页签改由 `PlacePicker` 渲染（`all/ready/failed` 仍是计数按钮，
  counts 收窄为 `Record<ShellTab, number>`）；新增 `narrowed` 状态与 `chosen` 派生（离开该作用域即失效）；
  `scopePlaces` 按 `detail.installs` 里 `installed` 的位置给每个位置算「声明了几台」；`visible` 增加
  按位置收窄（`scopeOf` 由 `places` 派生）。
- 文案：英文 `mcp.place.which/all/search/searchClear/searchEmpty`，中文同步；`check-messages.ts`
  387 → 392/392。
- 浏览器实测（真实机器、仅启用 Claude Code）：两个作用域药丸各带自己的图标堆叠；
  工作区菜单「位置 1 个位置 / 全部位置 工作区 0 ✓ / 工作区 → Claude Code `.mcp.json` 0」；
  全局菜单「全部位置 全局 1 ✓ / Claude Code `~/.claude.json` 1」；选单个 Agent 后药丸保持作用域态、
  菜单勾移到该行、列表只剩 `context7`（显示 1 / 1 个服务器）。

---

# Agent 插件接入 MCP（2026-10-11，过渡形状，已被上一节取代）

## 目标

`plugin-mcp` 原本在 `src/host/places.ts` 里硬编码 4 个客户端文件，claude-code 插件只贡献
skill 位置。现在 **MCP 的客户端文件由 Agent 插件贡献**，与 skills 同一个模型。

## 改动

- 内核新增贡献点 `mcpLocation`（`{id, label, icon, scope, file, format, key, switchable?, order}`）；
  原来的 `SkillScope` 重命名为共享的 `AssetScope`（skill 与 MCP 的 place 是同一个「作用域」概念）。
- 贡献者：`@workspace/plugin-claude-code` 贡献 `.mcp.json`（工作区，order 20）与
  `~/.claude.json`（全局，order 10）；内核内置 `hub.target.codex` 贡献 `~/.codex/config.toml`
  （TOML、`mcp_servers`、`switchable`）。
- `plugin-mcp`：`McpPlaceRef` 随每次调用传入（load/refresh 传数组，写操作传单个），宿主不再知道任何客户端；
  place 的 label/路径/图标在页面侧由贡献渲染；`McpCatalog` 不再回传 places。
- 桥改为全 POST（`?action=…` + JSON body），并在边界用 `assertPlaceRef` 校验（拒绝绝对路径、`..`、
  未知格式、非法表名）；`hub.ts` 的探活改成 `POST ?action=load` 空 places。

## 未决 / 已知

- **Cursor 不再出现在菜单里**：它没有插件，`hud.target.cursor` 之类也不存在（此前是硬编码）。
  等 Cursor 插件建好会自动出现。
- MCP 目前读**所有已启用扩展**的位置，不像 skills 的全局位置那样还要求侧栏选中该 agent。
- 切换开关仍只有 Codex（`enabled` 字段）；Claude Code 的停用名单在 `~/.claude.json` 的 per-project，未做。

---

````markdown
# MCP 功能实现 + 10 个模拟 Agent（2026-10-11）

## 目标

1. **MCP 从 mock 到真实**：`packages/plugin-mcp` 目前整页 mock（`mock.ts` 提供 9 个服务器、
   写操作只改内存）。接入与 skills 相同的存储缝：hub 记录落盘 `<home>/mcp/index.json`、
   读写真实客户端配置文件、检查与（后续）测试连接。
2. **10 个模拟 Agent**：新建插件包，通过扩展机制注册 9 个 mock Agent
   （+ 现有 Claude Code = 10 个），图标用 `@lobehub/icons`（Claude Code 同款库）。
   每个 Agent 是独立 ExtensionDefinition（独立启停、独立 manifest）。

## 已核实的事实（权威，不要重编）

- 本机真实文件：`~/.claude.json`（43 KB，`mcpServers` 为空、含 `projects`）；
  `~/.codex/config.toml`（含 `[mcp_servers.node_repl]`）；`~/.cursor/mcp.json` 不存在。
- 键名：Claude Code / Cursor 用 `mcpServers`（`.mcp.json` / `.cursor/mcp.json`）；
  Codex 是 `mcp_servers`（下划线，`~/.codex/config.toml`）。
- `@lobehub/icons/es/` 有全部 9 个 Agent 图标；6 个有 `.Color`（Gemini/Qwen/Kiro/Minimax/Qoder/Trae），
  Cursor / Cline / CommandCode 只有单色（默认导出即图标）。
- skills CLI（本机缓存 `cli.mjs`）的 Agent 目录表：
  cursor `.agents/skills`/`~/.cursor/skills`；gemini-cli `.agents/skills`/`~/.gemini/skills`；
  qwen-code `.qwen/skills`/`~/.qwen/skills`；cline `.agents/skills`/`~/.agents/skills`；
  kiro-cli `.kiro/skills`/`~/.kiro/skills`；minimax-code `.minimax/skills`/`~/.minimax/skills`；
  qoder `.qoder/skills`/`~/.qoder/skills`；trae `.trae/skills`/`~/.trae/skills`；
  command-code `.commandcode/skills`/`~/.commandcode/skills`。

## 数据模型（MCP）

- **声明** `McpDeclaration`：结构化 —— stdio `{command, args, env}` / 远程 `{url, headers}`，按 transport 判别。
- **记录**（catalog）：`<home>/mcp/index.json`，hub 拥有的服务器记录（声明本体 + 标签/描述/检查字段）。
- **发现**：扫描 4 个 place 文件，得到每个服务器名的安装位置与各处声明；同名声明不一致 = 冲突。
- **合并**：列表 = 记录 ∪ 发现（发现但无记录的名字生成归纳行）；installs 由发现计算；
  「检查」= 重扫 + 冲突比对（不联网）；「测试连接」才是网络/进程操作（阶段 3）。

## 阶段与验收

### 阶段 1 — MCP 数据落地（读 + 记录写入 + 检查）
- [x] `src/declaration.ts`（声明类型 + 显示串 + 参数切分）、`src/host/toml-edit.ts`（TOML 块级写 + 写后校验）
- [x] 解析用库：`smol-toml`（读 TOML）+ `jsonc-parser`（读 JSONC / 单节点格式保留写）
- [x] `src/store.ts` 契约、`src/host/mcp-fs.ts`（catalog + discover + 合并 + create/update/remove/refresh/install/uninstall/setEnabled/file，全部写操作串行化）
- [x] `src/vite.ts` 桥 + `src/remote-store.ts` + `apps/web` 挂桥 + `hub.ts` 探活注入 + exports
- [x] `src/library.ts`（useMcpLibrary）+ 页面接线：mock → store；添加/编辑/删除/安装/卸载接通
- [x] 检查脚本：`scripts/check-mcp.ts`（56 项）+ `scripts/check-messages.ts`（中英键集合对齐）
- **验收（已过）**：检查脚本 56/56；桥返回真实发现（本机 `~/.codex/config.toml` 的 `node_repl`）；
  浏览器：添加 → `~/.context-hub/mcp/index.json` 落盘 → 安装到 `.mcp.json`（新建文件，注释保留）→
  安装到 `~/.codex/config.toml`（只 +4 行）→ 卸载 → **哈希与备份逐字节一致** → 删除记录 → 全仓库 typecheck 9/9。
  中文包补齐 31 个键（124/124 对齐）。

### 阶段 2 — 写客户端文件（安装/移除/启停/删除/批量）
- [x] install/uninstall 写 4 个文件：JSON 三件走 jsonc-parser 单节点编辑（注释保留）；Codex TOML 走块编辑 + smol-toml 写后校验
- [x] 启停：Codex `enabled` 字段（`switchable`；Claude Code 的停用名单在 `~/.claude.json` per-project，暂标自管）
- [x] 批量安装、详情「保存」（改名会带着已装位置一起改）
- [x] 删除的确认气泡（照 skills 的 `DeleteBubble`：取消保留、确认才删；失败留在气泡里）
- [x] 标签「添加类型」可增可删：目录标签（去掉「全部标签」与已有项）做成 Popover 建议，
      × 移除；每次改动走 `library.update(id, { tags })` 落进记录
- **已验**：安装/卸载（`.mcp.json` 新建 + Codex 真文件 +4 行并哈希还原）、删除气泡（取消/确认两条路）；
  **待验**：启停开关（Codex `enabled`，检查脚本已覆盖，浏览器未点）、批量安装、改名保存、
  两处端点不同的冲突显示（需要临时造一份不一致的副本）。

### 阶段 3 — 检查增强 + 测试连接 + 工具页签
- [ ] 「检查」落盘 checked 状态与冲突文案；「测试连接」真握手（stdio spawn / http）；
  工具页签读真实 `tools/list`；行状态 ready/failed 由检查结果派生
- **验收**：对真实服务器测试连接成功并列出工具；两处不同端点同名时行上显示冲突。

### 阶段 4 — 9 个模拟 Agent 插件
- [ ] `packages/plugin-mock-agents`：9 个 ExtensionDefinition（独立启停）+ `@lobehub/icons` 图标 + messages；
  `apps/web` 加 workspace 依赖并注册；pnpm install + 重启 dev server
- **验收**：侧栏 Agents 段 10 个（触发 >8 折叠）；勾选 Cursor → 技能页出现其全局页签；
  扩展页 9 个新条目可独立启停；typecheck/lint 通过。

---

````markdown
# MCP 设计稿 1:1 还原（2026-10-10）

## 目标

把 `designs/mcp.pen` 里的 MCP 模块按 1:1 还原成 React + shadcn/ui（`@workspace/ui`）实现，
先用 mock 数据，功能后置；MCP 代码独立成 `packages/plugin-mcp` 插件包。

## 设计稿画板

| # | 画板名 | 位置 | 用途 |
|---|---|---|---|
| 1 | Context Hub — MCP servers | (1560,167) | 列表视图主屏 |
| 2 | Context Hub — MCP servers — Cards | (0,167) | 卡片视图 |
| 3 | Context Hub — MCP — Add server — HTTP + SSE | (1560,1492) | 远程传输添加弹窗 |
| 4 | Context Hub — MCP — Add server | (0,1492) | stdio 添加弹窗 |
| 5 | …filesystem-mcp — Detail · 配置 | (0,2957) | 详情弹窗·配置 |
| 6 | …filesystem-mcp — Detail · 工具 | (1560,2957) | 详情弹窗·工具 |
| 7 | …filesystem-mcp — Detail · 配置文件 | (3120,2957) | 详情弹窗·配置文件 |
| 8–11 | MCP — 配置结构 / 一份记录，多个副本 / 安装与开关 / 工具详情（完整） | — | 说明稿，作为实现依据 |

## 代币映射

`$canvas`→`bg-background`/`bg-card`；`$ink`→`text-foreground`；`$body`→`text-copy`；
`$muted`→`text-muted-foreground`；`$muted-soft`→`text-muted-soft`；`$hairline`→`border-border`；
`$surface-soft`→`bg-muted`；`$surface-strong`→`bg-secondary`；`$primary`→`bg-primary`；
`$on-primary`→`text-primary-foreground`；`$semantic-up`→`text-chart-2`；`$semantic-down`→`text-destructive`；
圆角 `xs/sm/md/lg/xl/pill` = 4/8/12/16/24/100（`rounded-xs/sm/md/lg/xl/full`）。

## 阶段与验收

### 阶段 0 — 基建
- 新建 `packages/plugin-mcp`（package.json / tsconfig / eslint / src）。
- 导出 `mcpExtension`，用内核 `nav` + `route` 贡献 `/mcp-servers`。
- `apps/web` 移除内置 MCP 页与内置导航项，改由插件提供。
- **验收**：`pnpm dev` 起得来，`/mcp-servers` 渲染插件页面，侧栏项来自插件；`pnpm typecheck` 通过。

### 阶段 1 — 列表页（画板 1 `q6TFxz`）
- **验收**：内容区 pad 20/32 gap 24；页签条 h36/gap2/pad3；搜索 300×44；9 个标签胶囊；
  Ledger 690 高 `$radius-xl` + Bulk Bar h56 + Head h40（列宽 32/338/136/150/128/244）+ 行高 66；
  9 行数据与画板逐行一致；Footer 文案一致。

### 阶段 2 — 卡片视图（画板 2 `IAZDi`）
- **验收**：卡片数量、封面、标题、状态、位置行与画板一致。

### 阶段 3 — 详情弹窗 · 配置（画板 5 `WbVnP`）
- **验收**：弹窗 1088×712；左 Tab Bar h48 + 指示器 30×2 `$primary`；右面板 360；表单 5 分区。
  不做权限控件（画板已删）。

### 阶段 4 — 详情弹窗 · 工具（画板 6 `hCArW` + 说明稿 11）
- **验收**：14 项工具名一致；树缩进 16px/级；必填 `*` 红色。

### 阶段 5 — 详情弹窗 · 配置文件（画板 7 `u1UBUK`）
- **验收**：文件名、路径、片段与画板一致。

### 阶段 6 — 添加服务器弹窗（画板 3、4）
- **验收**：字段、按钮、提示文案与画板一致。

### 收尾
- `pnpm lint` / `pnpm typecheck` / `pnpm build` 通过；删掉本次核对截图。

## 目标

为 Context Hub 软件自身设计插件机制（Extensions），与 `/plugins` 页的 Claude Code 资产包区分开。
内核直接采用 Cordis（`@deepseek-ai/cordis@4.0.4`，与 deepseek-harness 同源）。
Web / Web+Host / 桌面 / Exe 四种形态共用同一内核，形态差异收敛到 `PlatformHost` 能力缝。

## 设计稿（2026-10-07，先于实现交付）

- [x] 侧栏组件加 `Extensions` 导航项（**Operate 组末尾**，用户 2026-10-07 指定；Manage 组还原 4 项）
- [x] `Module / Extensions`（`fiE2W`）三屏：目录 `xoH9e` / 详情弹窗 `f994Qy` / 中文界面 `p4Gt9`
- [x] **简体中文拆成独立 monorepo 包** `packages/locale-zh-cn`（`@workspace/locale-zh-cn`）：
  内核只留锁定英文兜底，应用侧 `[...builtinExtensions, simplifiedChineseLocale]` 组装目录
- [x] **行控件改为 Install / Uninstall 按钮**（用户要求，弃用 Switch）：三屏 + 应用代码同步
- [x] **补上分区玻璃卡片**（用户指出应用缺少卡壳）：`bg-card + p-5 + ring-1 ring-glass-border +
  shadow-glass + backdrop-blur-glass`，卡内 header（16/600 标题 + 14 muted 说明）+ 两列行区；
  新增 `extensions.category.<id>.description` 中英文案
- [x] 浏览器核对 + 视觉复核；核对图 `designs/check-extensions/`、`designs/check-web/extensions-*.png`
- [ ] 用户评审：行内是否显示「未检测到运行时」等状态、是否需要 Sources 分区；
      中文界面下扩展行的名称/描述是否也要跟随语言包翻译（当前按 manifest 原文显示）

## 计划

- [x] 契约类型：manifest / 扩展点 / PlatformHost / 扩展定义（`packages/extensions/src/types.ts`、`host.ts`）
- [x] ExtensionService：目录、状态持久化、启用=激活、禁用=dispose 回滚、贡献注册表
- [x] I18nService：语言包贡献 → `t()` 查询链（活跃 → en → key）
- [x] React 绑定：HubProvider + useExtensionSnapshot / useContributions / useI18n
- [x] 内置扩展：English（锁定）、简体中文（声明式样板）、Claude Code / Codex / Copilot（代码贡献 target 描述符）
- [x] Extensions 页（Codex 风格：分类分组、+ 安装、Switch 启停、详情弹窗、语言选择）
- [x] 导航接入 i18n（侧栏 / 面包屑 / 页头按钮）
- [x] 验证：typecheck + lint + 浏览器核对

## 结果

- **内核包** `packages/extensions`：不依赖 React 运行时（`./react` 为独立入口），无浏览器 API。
  启用即激活、禁用即回滚：`ctx.effect` / fiber dispose 承担全部卸载。
- **形态无关**：`PlatformHost`（form / capabilities / storage / log）由各形态提供；
  Web 形态 `capabilities.filesystem = false`，三个 agent 适配器如实显示"需要桌面端或本地运行时"。
- **代码**：`apps/web/src/lib/hub.ts`（Web 宿主 + 启动）、`pages/extensions.tsx`、
  `components/extension-detail-dialog.tsx`、导航与侧栏/页头 i18n 接线。
- **设计稿与代码一致**：目录页 = 页面标题 + 语言选择 + 搜索 + 两张分区分组卡；
  详情弹窗 = About / Contributes（能力 chip + 写入路径 + 格式 + 运行时提示）/ Permissions。

# Skills 插件化 + 插件互相扩展（2026-10-07）

## 实测结论（临时探针，验证后已删除）

- 兄弟插件默认**互不可见**服务：`ctx.get("skills")` 返回 undefined。
- 在插件函数上先声明 `inject: ["skills"]` 再 `ctx.plugin()`：依赖方在提供方 ACTIVE 前保持 PENDING（不加载）,
  提供方 `dispose()` 后依赖方 fiber 自动卸载（state 4 → 依赖方 0），提供方回来后再自动加载。
- 所以"skills 是插件、claude-code/codex 插件扩展它"框架层成立；缺口都在我们自己的内核里。

## 决策

- 内核保留**封闭贡献点词汇表**：`locale`（已有）/ `target`（已有）/ **`nav`（新增）/ `route`（新增）**。
  插件不自定义新贡献点，避免闭环外的类型不可控。
- 插件之间：**描述性扩展走贡献点**（`target`，无依赖，禁用只是少一条）,
  **有状态协作走 Cordis 服务缝**（manifest `provides` + `inject`，由 Cordis 负责等待与级联卸载）。
- 国际化所有权：插件自带**自己命名空间的英文兜底**（`skills.*`），语言包**跨命名空间**翻译；
  缺键回落英文。`@workspace/locale-zh-cn` 不依赖任何插件包，插件也不需要知道有哪些语言。

## 计划

### 1. 内核 packages/extensions

- [ ] `ContributionMap` 增加 `nav`（path / labelKey / icon / group / order）与 `route`（path / Component）
- [ ] `ExtensionManifest` 增加 `provides?: string[]`、`inject?: string[]`；`ExtensionView` 暴露 `waitingFor`
- [ ] `ExtensionService`：把 manifest 的 `inject` 写到插件函数上；订阅 `internal/status` 同步状态；
      新增 `waiting` 状态（依赖服务未就绪）；`start()` 不再假设条目一定 ACTIVE
- [ ] `I18nService`：`buildTable` 改为按 locale 分组 —— 兜底语言包 → 活跃语言包（同 locale 多包按目录顺序）,
      **不再把其它语言的包并入**（现在的实现会让法语键漏进中文界面）
- [ ] React 绑定：补 `useNavItem(pathname)`（面包屑与占位页共用），`useContributions` 已够用

### 2. 新包 packages/plugin-skills（`@workspace/plugin-skills`）

- [x] 迁入 `pages/skills.tsx` → `src/page.tsx`、`skill-detail-dialog.tsx`、`add-skill-dialog.tsx`、`src/messages.ts`
- [x] `table-pagination` 上移 `@workspace/ui/components/table-pagination`（overview / mcp-servers / plugins 同步改路径）
- [x] `activate(scope)` 注册：`nav`（Manage 组 order 15、键 `nav.skills`）/ `route`（`/skills`）/
      自带 en 语言包（`skills.*` 60 个键）
- [ ] 消费 `target` 贡献：按 `supports.includes("skill")` 列出可投递的 agent 目标（随 `sync to target` 一起做）

### 3. 应用侧 apps/web

- [x] 删 `/skills` 硬编码路由与 `nav.skills` 静态项；`App.tsx` 路由与侧栏改由贡献生成
- [x] `app-header.tsx` / `pages/placeholder.tsx` 改用 `useNavItem`；`navigation.ts` 加 `useNavGroups` / `useNavItem`
- [x] `lib/hub.ts` 目录加入 `skillsExtension`；`apps/web/package.json` 加 `@workspace/plugin-skills`

### 4. 语言包 packages/locale-zh-cn

- [x] 增加 `skills.*` 中文键（页面 chrome + 两个弹窗 chrome）；`skills.*` 的数据文案（技能名/描述/tag）按约定保持英文

### 5. 验证

- [x] typecheck 全仓绿；改动包 lint 绿（`packages/ui` 的既有 19 个错误与本次无关，未触碰其源码）
- [x] 浏览器：`/skills` 网格/标签页/详情 lightbox/Add 弹窗正常；禁用 skills 插件 → 侧栏项与路由同时消失、
      `/skills` 回落首页；重新启用 → 恢复且仍在 Manage 组第 2 位；切 zh-CN → 页面与两个弹窗 chrome 全中文；
      localStorage `hub/extensions/state` 记录 `hub.skill.catalog`
- [x] 语言包回归：en 界面不出现中文（`buildTable` 按 locale 分组合并）

## 样式回归修复（用户 2026-10-07 反馈"样式有点乱了，弹窗样式也有问题"）

- **根因**：`packages/ui/src/styles/globals.css` 用显式 `@source` 列扫描目录，新包不在表内 →
  插件包里的 arbitrary 类（`h-[246px]` / 网格列宽 / `h-[130px]` / `w-[880px]` / `h-[228px]` …）**根本没生成**，
  网格卡片撑满整行、封面无限高，两个弹窗同样缺尺寸类。
- **修复**：`@source` 改为覆盖全部工作区源码 —— `../../../apps/*/src/**` + `../../../*/src/**`
  （顺带删掉模板遗留的 `../../../components/**` 死路径与冗余的 `../**`）。
- **灯箱按画板尺寸回修**（`L9tdZp`）：媒体区底色 `#F1F5F9`（= `--secondary`，非 `--muted`）、
  缩略图 72x44（原 72x72）、上传格 72x44 且无描边用 `bg-card`、提示改为纯文本（去掉图标）、
  计数胶囊补图片图标、说明 chip 去掉多余图标（画板无）、操作按钮 36 高、图标按钮 32x32。
- 核对图：`designs/check-web/skills-grid-v3.png`、`skills-detail-v3.png`、`skills-files-v3.png`、
  `skills-add-registry-v3.png`、`skills-detail-nocover.png`、`overview-v3.png`。

## 灯箱媒体区改用开源 Swiper + 分类可编辑（用户 2026-10-07 要求）

- [x] 手写切图逻辑替换为 **swiper@14.3.0**（`swiper/react` + `Thumbs` / `Navigation` 模块）：
      主图 Swiper + 缩略图 Swiper 联动，点击缩略图/前后按钮/方向键均由库驱动
- [x] 多图片：`Skill.gallery`（16:9 示例图）驱动幻灯片，缺省回落 `cover`
- [x] 上传改为 popover：本地文件 / URL / `data:` base64 三种来源，新增后自动滑到新图
- [x] 分类可增删：chip 带 × 移除按钮，虚线 + 打选择器（种子标签快选 + 自定义输入），
      改动经 page state 同步到卡片 pill
- [x] 抽出 `src/tags.ts`（种子标签 + 哈希取色 tone）与 `src/types.ts`（Skill / MediaItem）
- 坑：① swiper 的布尔简写（`navigation` / `keyboard`）会**整体覆盖**模块默认对象，必须传对象；
      ② 导航按钮在 Swiper 容器外时，要在实例就绪后写 `params.navigation.prevEl/nextEl` 并调
      `navigation.init() + update()`；③ base-ui Dialog 会吞掉冒泡阶段的按键，swiper 的 keyboard
      模块（监听 bubble）在弹窗内失效 → 改用捕获阶段监听并调 `slidePrev/slideNext`；
      ④ `react-hooks/refs` 禁止 render 期读 ref，Swiper 参数模板放模块作用域。
- 核对图：`designs/check-web/skills-swiper-final.png`、`skills-media-added.png`、`skills-category-add.png`

## 视频缩略图与播放联动（用户 2026-10-07 报 bug）

- 现象：添加视频后缩略图是**黑块**（`preload="metadata"` 不渲染画面），且切换后不会自动播放/暂停。
- 修复：缩略图视频改 `muted + loop + autoPlay + playsInline + preload="auto"`（静音运动预览，
  右下角保留小播放角标、去掉通铺遮罩）；主视频由 `MediaSlide` 的 `active` 驱动 ——
  激活时 `startPlayback()`（带声播放，被浏览器策略拒绝则自动降级 muted 重试），非激活时 `pause()`。
- `playing` 状态改由 video 自身的 `onPlay` / `onPause` / `onEnded` 事件驱动，effect 里不再 setState。
- 实测（`video.86605038.mp4`）：添加后主视频 4s 处有声播放、缩略图静音循环；
  切到图片 → 主视频停在 12.2s；切回 → 13.7s 自动续播；核对图 `designs/check-web/skills-video-thumb.png`

## 列表封面视频的可见性播放（用户 2026-10-07 追加要求）

- 语义：**进入视口才播放、离开即暂停**；网格卡片与列表行同款。
- 实现：`src/autoplay-video.tsx`（`IntersectionObserver` threshold 0.25 + `visibilitychange` + 槽位）
  与 `src/media.ts`（全局上限 `MAX_PLAYING = 6`，超出排队；`registerPreview` /
  `setPreviewsSuspended`）。打开详情弹窗时 `setPreviewsSuspended(true)`，底层目录整体停播。
- `cardMedia(skill)`：**第一个资源是视频时封面就用视频**（否则用 cover，再否则 Markdown 预览）。
- 示例数据加了 `demoVideo`（`perf-profiling`）以覆盖视频封面路径。
- 实测：卡片在首屏外 → paused；滚到视口内 → 播放（t 走到 2s）；滚回顶部 → 停在 2s；
  再滚下去 → 从 2s 续播到 4s；列表视图 36px 缩略图同样行为；打开灯箱时目录视频暂停（8.6s），
  灯箱内主视频播放；关闭后目录视频从 10.2s 续播。槽位探针：9 个请求发放 6 个、拒绝 3 个。
- 核对图：`designs/check-web/skills-video-card-inview.png`、`skills-video-list.png`、`skills-video-card.png`

## 卡片改为按资源比例的瀑布流（用户 2026-10-07 追加要求）

- 语义：媒体盒**取资源自身宽高比**（不再裁成固定 130px 高），卡片高度随内容变化，整页走 masonry。
- 实现：`SkillCard` 用 `aspectRatio: 实测值 ?? 16/9`；图片经 `onLoad`（含 `complete` 兜底）、
  视频经 `onLoadedMetadata` 上报 `naturalWidth/naturalHeight`；`media.ts` 的
  `knownAspect/rememberAspect` 缓存已测比例，重挂载不再跳一次布局。
- 网格：`columns-[266px] gap-x-6` + 卡片 `mb-5 break-inside-avoid`（设计宽度 1136 → 4 列；
  浏览器按 266px 自动决定列数，不再有固定列数上限）。
- 示例数据给每个封面配了不同比例（4:3 / 16:9 / 3:2 / 1:1 / 3:4），以便看见瀑布流节奏。
- 实测：12 张卡片高度 273–528 不等、封面比例 1.33/1.78/1.50/1.00/0.75 与资源一致；
  视频封面 330x186 仍静音播放；列表视图不受影响（14 行、1088 表格）。
- 核对图：`designs/check-web/skills-masonry.png`、`skills-masonry-full.png`

## 缩略图支持移除（用户 2026-10-07 反馈"这里没有移除的功能"）

- 每个缩略图**右上角内侧**加 × 按钮（`top-1 right-1`，即距上/右各 4px；默认 `opacity-0`，
  `:hover` / `:focus-within` 显示，键盘 Tab 也能触达），点击后从 `items` 移除该资源。
  最初用 `-top-1 -left-1` 的负偏移，被 Swiper 容器的 `overflow: hidden` 裁成半个圆，故改为内缩定位。
- `remove(id)`：删除后把选中项**移动到相邻资源**（删的是当前项或更靠前的项就回退一位），
  保证舞台永远有内容；删除最后一项时回到 Markdown 预览空态，缩略图行整体隐藏。
- 实测：3 项删除中间一项 → 2 项、计数 1/3 → 1/2；删除当前项 → 舞台仍显示相邻资源；
  删到只剩 1 项时计数胶囊隐藏；× 与缩略图是两个兄弟按钮，点击互不干扰。
- 核对图：`designs/check-web/skills-thumb-remove-corner.png`、`skills-thumb-remove-corner-hover.png`

## 视频控制条替换居中按钮（用户 2026-10-07 反馈"视频中间一直显示一个暂停的图标，不要这个"）

- 去掉舞台上常驻的居中大圆钮与底部细进度线，改为**底部控制条**（参考图 2 的样式）：
  左侧播放/暂停（24px 圆钮）、中间 `<input type=range>` 进度滑杆（`accent-white`，16px 命中区）、
  右侧静音切换（`volume-2` / `volume-x`），整体压在 `from-[#0f172ad9] to-transparent` 渐隐条上。
- 用原生 range 获得拖拽/键盘/无障碍语义，`onChange` 按比例 seek；`onVolumeChange` 同步静音状态
  （自动播放被浏览器降级为静音时也能反映出来）。新增键 `skills.media.seek/mute/unmute`（中英）。
- 实测：舞台居中按钮已不存在；控制条 720×68、滑杆 616×16；seek 到 30% → 视频 4.5s/15.1s；
  静音按钮切换后 `video.muted=true` 且标签变为"取消静音"；播放中左侧显示暂停图标。
- 核对图：`designs/check-web/skills-video-bar-final.png`、`skills-video-controls.png`

## 结果

- **内核**：`ContributionMap` 增加 `nav` / `route`；`ExtensionManifest` 增加 `provides` / `inject`；
  `ExtensionService` 把 `inject` 写到插件函数、订阅 `internal/status`、新增 `waiting` 状态；
  `I18nService.buildTable` 只合并「兜底语言包 + 活跃语言包」，同 locale 多包按目录顺序。
- **插件包**：`packages/plugin-skills`（`@workspace/plugin-skills`）自带页面、两个弹窗、en 文案与数据，
  通过三个贡献点接入主体；主体不再有任何 skill 代码。
- **依赖机制现状**：内核已支持 `provides` / `inject` / `waiting`，但目录里目前没有插件声明它们
  （没有消费者就不声明 `provides`）。claude-code / codex 插件要真实写盘时，skills 插件加 `provides: ["hub.skills"]`，
  目标插件加 `inject: ["hub.skills"]` 即可获得等待与级联卸载。
- **遗留**：Add 弹窗的排序 Select 选项仍是英文（`SelectValue` 渲染 value 而非 children,
  翻译它需要把选中值提到 state）；`sync to target` 投递计划与 diff 预览仍未做。

## 媒体引用与 core 资源包（2026-10-08，用户纠正）

### 纠正的问题

上一版把粘贴的 URL **下载成文件**存进技能目录，用户指出这不是想要的语义：
URL 应当只记录引用，只有真正"上传"的资源才落盘，落盘位置也应当在 Context Hub 自己的空间里，
而不是每个技能目录内。

### 决策

- **引用而非拷贝**：`SkillSummary.assets` 里每项是**引用**——`http(s)` URL 原样保存，
  UI 直接加载；上传的文件保存为**相对 hub home 的路径**（`assets/<name>`）。
  技能目录内不再存放媒体文件，拷贝技能目录即可带走全部内容。
- **新包 `packages/core`（`@workspace/core`）**：资源的管理者，其他包通过它使用。
  - `src/assets.ts`（可移植）：`assetKind` / `readSource`（把粘贴源分成 link 与 bytes 两类）/
    `assetUrl` / `ASSET_ROUTE = /hub/files` / `AssetLibrary {root, put, remove}` / 体积上限。
  - `src/host/assets-fs.ts`：Node 实现，写在 `<home>/assets`，唯一命名 + 原子 rename + 路径越界拒绝。
  - `src/host/home.ts`：hub home 解析（显式 → `CONTEXT_HUB_HOME` → `~/.context-hub`）与展示路径。
  - `vite.ts`：开发桥，只读地把 `<home>` 下的文件挂到 `/hub/files/*`（支持 `Range` → 206）。
- **删除即清理**：`deleteAsset` 删引用时删掉 hub 拥有的文件（URL 引用不动）；
  `remove(id)` 先删该技能引用的所有文件，再删目录与目录行——失败时不会留下孤儿文件。
- **变更只走 store**：桥只提供读取，写入/删除都经过记录引用的那一次调用，引用与文件不会各写一半。

### 接线变化

- `SkillStore`：`putAssetFromUrl` → `addAssetSource`（URL 直接记录；`data:` 才落盘）,
  `deleteAsset(id, ref)` / `assetUrl(ref)`（不再带 skill id）。
- `skills-fs.ts` 组合 core 的库：`createFsSkillStore({ home, library? })`；技能根 = `<home>/skills`。
- 桥路由：`POST /hub/skills/<id>/assets?name=`（原始字节）、`POST /hub/skills/<id>/source`（粘贴源）、
  `DELETE /hub/skills/<id>/assets?ref=`；媒体由 `/hub/files/*` 提供。
- `apps/web/vite.config.ts` 注册两个桥（core 的资源 + 插件的技能库）。

### 验证

- `check-store.ts`：**全绿**（新增：URL 只记录不落盘、重复链接只保留一条、`data:` 落盘、
  删除引用同时删除文件、`remove` 清空该技能引用过的文件、路径越界拒绝）。
- 浏览器：卡片与灯箱直接用远端 URL 播放（`readyState 4`），本地无副本；
  上传 `note.png` → 引用 `assets/note.png`、文件落在 `~/.context-hub/assets/`、
  `/hub/files/assets/note.png` 返回 200、`Range: bytes=100-` 返回 206；
  移除该媒体后引用与文件同时消失。测试产生的文件已清理。
- **本地数据**：旧的技能目录内媒体（`video.eef090ae.mp4`、`video.86605038.mp4`）已移入
  `~/.context-hub/assets/`（未删除）；URL 已按新语义重新记录为链接引用。

## 技能页签回到"来源"轴（2026-10-08，用户指出页签块不见了）

### 问题

设计稿的技能页签是 `All 42 / Built-in 24 / Workspace 12 / skill.sh 6`（**来源**轴，三轴之和 = 总数）；
接入磁盘库时为了过滤启用状态，页签被换成了 `全部 / 已启用 / 已停用`，设计上的那一块就不见了。

### 决策

- **一个维度**：页签只承载"来源"，与设计稿一致（Plugins 的页签承载状态、来源放筛选行，两者不混）。
- **计数由数据给出**：`SkillPage.counts` 随列表一起返回，计数**忽略来源筛选**、跟随标签筛选，
  这样任何页签被选中时其余页签的数字仍然稳定。
- **状态维度让位**：启用状态改由卡片/列表行的开关表达（与设计一致）；需要按状态筛选时再单独加控件。
- **同一套措辞**：`skills.source.*` 成为唯一来源词表（`local` → Workspace/工作区、`builtin` → Built-in/内置、
  `registry` → skill.sh），页签、卡片徽标、详情弹窗（原来直接打印 `local`）共用它；
  删掉重复的 `skills.tab.builtin|workspace|registry` 与 `skills.filter.*`。

### 接线变化

- `SkillQuery.source`、`SkillPage.counts`（`SkillCounts`）；`skills-fs.ts` 先按标签/搜索收窄、再统计、后按来源取行。
- 桥 `/hub/skills?source=` 只接受已知来源；`remote-store.ts` 透传；`useSkillLibrary` 暴露 `counts`。
- `library.ts` 新增 `sourceLabel()`；`page.tsx` 用 `SOURCE_TABS` 渲染 `全部/内置/工作区/skill.sh` + 计数。

### 验证

- `check-store.ts`：**全绿**（新增：计数按来源归类、来源筛选只留本来源、计数不受来源筛选影响但跟随标签筛选、
  重开 store 后记录里的来源仍然生效）。
- `pnpm --filter @workspace/plugin-skills typecheck|lint`、`web`/`locale-zh-cn` typecheck：**通过**。
- 浏览器：页签显示 `全部 2 / 内置 0 / 工作区 2 / skill.sh 0`；点"内置"得到空态，点"工作区"得到两行且计数不变；
  卡片徽标与详情弹窗的"来源"都显示 `工作区`（不再出现裸 `local`）。
- 注意：改动服务端桥代码后需**重启 dev server**（Vite 不会热更已加载的插件模块），否则前端会拿到没有 `counts` 的响应。

## 画布：删掉多余画板、卡片改瀑布流（2026-10-08）

### 删除

Skills 行原有 10 块画板，删掉 4 块已被取代的：

| 画板 | 为什么多余 |
| --- | --- |
| `X2w2Te` Grid（初版） | 被 Grid v3 取代 |
| `qk8lW` Grid v2 | 同上 |
| `u0xRV` Detail — Configuration | 详情已改为 lightbox，tab 弹窗不再实现 |
| `jFcNl` Detail — Files | 同上 |

剩下的 6 块按实现顺序重排（x = 128 + i×1560）：Grid v3 `libo0`、List `qBAVy`、skill.sh `Y2fjK1`、
Import `DzRqf`、Lightbox `L9tdZp`、Lightbox Files `Mnwzp`；`eddWl` 宽度 14176 → **9496**。

### 同步

- **卡片 = 瀑布流**：Grid v3 的 `Card Grid` 由"3 行 × 4 张等高卡（266×246）"改为 4 个 `Column` 竖排容器，
  卡片封面高度按真实媒体比例变化（16:9→150、3:2→177、4:3→200、1:1→266），卡片高度 = 封面 + 116。
  列高 938 / 981 / 915 / 981，`Card Grid` 保持 778 并 `clip`，折线落在每列第 3 张的封面内——
  与实现里 `columns-[266px]` 的实际视口一致（页面滚动，见下一屏）。
- **两块 lightbox 屏的背景同步**：`E8hbJ` / `n8FFba` 的旧等高行换成同一组瀑布流列（Copy 过来），
  否则弹窗后面的目录与 Grid v3 对不上。
- **页签**：List / skill.sh / Import 三屏残留的第 5 个页签 `Disabled 4` 已删，六屏统一为
  `All 42 / Built-in 24 / Workspace 12 / skill.sh 6`（375 宽）。
- Module Label 描述里的 "detail dialog" 改为 "detail lightbox"。

### 验证

- 全行扫描：除装饰 Blob（刻意的出血）外无布局问题；`Card Grid` 内的裁切是视口折线，不是缺陷。
- 核对图本轮已按新约定删除（`designs/` 下的截图不进仓库）：本地导出 `libo0`（瀑布流网格）与 `L9tdZp`
  （lightbox + 新背景）逐块看过，确认封面比例、列高与折线位置正确。

## 插件状态改存 hub home（2026-10-08，用户："插件系统用浏览器本地缓存是不对的"）

### 问题

内核把状态写进了 `window.localStorage`（键 `hub/extensions/state`、`hub/locale`）：换一台机器、换浏览器、
清一次站点数据，扩展的启用状态和界面语言就没了——产品状态不该由某个浏览器 profile 保管。

### 决策

- **新增 `state/` 空间**：`<home>/state/<name>.json`，一个文档一个文件（`extensions.json` 启停状态、
  `locale.json` 当前语言）。命名即文件名，所以名字必须是小写字母开头的 `[a-z0-9-]`，其余一律拒绝。
- **端口从"字符串"改为"JSON 值"**：`StoragePort.read/write` 直接搬 `unknown`，不再 `JSON.stringify`
  一层套一层；磁盘文件因此就是值本身，读的一方校验（`extensions` 校验对象+布尔，`locale` 校验字符串）。
- **表单负责异步**：内核接口必须同步（Cordis 服务在构造期读状态），所以由**表单**在启动前把 `state/`
  全部读进内存，再用一个同步端口对外，写操作直接回写主机（失败只告警，不在点击时抛错）。
- **一次性搬迁**：盘上没有该文档、浏览器里还有旧键时，先把旧值写进盘再删掉浏览器键；
  盘上已有文档则直接删掉浏览器里的陈旧副本。用户本次已就地迁移（旧键已从浏览器清除）。

### 接线变化

- `packages/core`：新增 `src/state.ts`（`STATE_ROUTE`/`STATE_DIR`/`assertStateName`/`StateStore`）、
  `src/host/state-fs.ts`（磁盘实现）、`src/host/atomic.ts`（原子写，从 `assets-fs.ts` 抽出，
  `plugin-skills` 的第三份 `writeAtomic` 一并合并到这里）；桥新增 `GET/PUT /hub/state[/<name>]`。
- `packages/extensions`：`StoragePort` 改为 JSON 值；文档名成为 `extensions` / `locale`。
- `apps/web`：`lib/hub.ts` 启动前 `openState()`（读盘 + 搬迁 + 回写），`vite.config.ts` 注册 `stateStore()`。

### 验证

- `node packages/core/scripts/check-state.ts`：**23 项断言全绿**（文档即文件、重开 store 可读、
  标量文档、名字拒绝表 `..`/`hub/locale`/`Hub`/`.hidden`/空/空格/带扩展名、越界写入拒绝、
  坏 JSON 报文件名、外来文件不列表也不动、替换后无临时文件残留）。
- `node packages/plugin-skills/scripts/check-store.ts`：全绿（共享原子写后回归）。
- `core` / `extensions` / `plugin-skills` / `web` typecheck 与 lint 全绿。
- 浏览器：重启 dev server 后 `/extensions` 显示的状态来自磁盘（旧键搬迁成功，盘上出现
  `extensions.json`、`locale.json`）；点"卸载 简体中文"→ 盘上该键变 `false`、localStorage 不同步变化；
  刷新后仍为已卸载（读盘生效）；重新安装恢复原值；刷新后 `localStorage` 只剩 `theme`。

## 参考：DSH 的插件本地记录方式（2026-10-08，用户要求对照）

读了 `deepseek-harness` 的 `boot/app-boot`、`boot/plugin-manager`、`client/ui-plugin-manager`。结论是
**DSH 没有单独的"插件状态文件"，插件就是磁盘上的东西，记录分散在 profile 自己的三个文件里**：

| 位置 | 记录什么 |
| --- | --- |
| `~/.dsh/profiles/<name>/node_modules/<pkg>/` | 插件本体（pnpm 装进来的真实包，`package.json` 里声明 `dsh.bundle.patch`） |
| `…/profiles/<name>/package.json` | 装了哪些包（`dependencies`）+ 选中了哪些 bundle（有序的 `dsh.profile.bundles`） |
| `…/profiles/<name>/cordis.patch.yml` | 每个条目的启停：最后一个匹配的覆盖项写 `disabled: true/false`，没有就 append 一条 |
| `…/profiles/<name>/pnpm-workspace.yaml` | pnpm 的依赖构建脚本审批（`allowBuilds`） |
| `…/profiles/<name>/.plugin-manager/logs/operation-*/pnpm.log` | 每次安装的 pnpm 输出 |

关键做法：

- **home 是唯一数据根**：显式路径 → `$DSH_HOME` → `~/.dsh`（空/纯空白视为未设置），profile 名做校验
  后落在 `profiles/<name>`，一个 profile 一棵树（web / headless / sdk / acp 各一棵）。
- **安装 = 在 profile 目录里跑 `pnpm add`**：`cwd` 是 profile 目录（不是调用目录），持有 profile 写锁，
  manifest 用原子写；失败/取消会把 `package.json` 与 `pnpm-lock.yaml` 还原，并留下日志目录。
- **启停是改配置，不是写状态库**：`writePluginEnabled` 只改 YAML 里 `disabled` 一个键，保留注释，
  原子写、`mode 0o600`；文件本身可手改，运行时按它对齐。
- **UI 便利项才放浏览器**：插件页唯一持久化的是"上次用过的 registry"（client store 的
  `persist: { name: 'dsh.plugin-manager.install-registry' }`），插件与安装状态一律在盘上。

### 与我们的对照

| 维度 | DSH | 我们现在 |
| --- | --- | --- |
| 根目录 | `~/.dsh`（`$DSH_HOME`） | `~/.context-hub`（`CONTEXT_HUB_HOME`） |
| 插件本体的位置 | `profiles/<name>/node_modules/<pkg>` | **没有**：扩展是编译进应用的代码 |
| 装了哪些 / 选中哪些 | profile `package.json` | **没有**：目录由应用自带 |
| 启停 | `cordis.patch.yml` 的 `disabled` | `state/extensions.json` 的布尔值 |
| 安装日志 | `.plugin-manager/logs/` | 无（没有安装动作） |
| 手改文件 | 支持（YAML 注释保留） | 支持（JSON，读取时逐项校验，非法项忽略） |

所以上一轮做的 `state/` 方向是对的（**状态在 hub 目录、不在浏览器**），差别在 DSH 还多两层：
真正的包安装，以及"选中/启停"拆成两个文件。

### 待定（等用户定方向）

1. **要不要做"下载插件"**：真做的话照 DSH 的形状 —— `<home>/plugins/<id>/` 放包本体、
   `<home>/plugins.json`（或 `state/plugins.json`）记选择与版本、下载走 registry/git/path 三种 spec，
   失败回滚 + 日志目录。编辑器界面再加"从 URL / registry 安装"入口。
2. **启停记录要不要拆出来**：DSH 的启停是 profile 配置的一部分（可手写）。我们的
   `state/extensions.json` 是应用状态；如果希望它像 DSH 一样"可手编、可进版本库"，
   就把它做成 `extensions.yml` 之类的配置文档。目前保持 JSON（有校验、有原子写），暂不拆。

## 插件空间：从磁盘加载插件（2026-10-08，用户："以后要做插件市场、从远程下载到本地"）

### 用户提出的缺口

现有插件（integration / 语言包 / Skills）都是**编译进应用**的代码；用户要的是"以后能装别人的插件、
不改源码就长出新功能"。这件事必须先由内核开出**一条装载缝**——插件再厉害也只能用内核已有的扩展点，
所以这一步不能靠插件自己补。

### 这一轮做了什么（缝 + 磁盘格式）

**磁盘格式**（= DSH 的"插件就是目录里的东西"，但入口用我们自己的 ESM 约定）：

```
<home>/plugins/
  index.json                 # 安装记录：每个插件的 version / source / installedAt / integrity
  <id>/
    plugin.json              # 内核清单（唯一必需文件）：id/name/version/apiVersion/entry/icon/permissions/inject
    index.js                 # 入口模块，导出 activate(scope)；默认 entry，可用 manifest 覆盖
    …插件自己的文件
```

- `id` 同时是目录名：只允许 `a.b-c` 形态（不含分隔符/空格/首点，排除 Windows 保留名），
  且 `plugin.json` 里的 `id` 必须与目录名一致；`locked: true` 被拒（下载来的插件不能自锁）。
- 模块入口由**表单**负责导入：浏览器形态 `import(host 提供的 URL)`，Node 形态 `import(file URL)`。
- **插件模块不 import 任何包**：React、图标表、i18n、UI 组件全部由内核通过 `activate(scope)` 交到手上。
  原因有二：浏览器里裸模块名解析不了；而且 React 必须是**同一份实例**，否则 hooks 直接崩。

**代码落点**

- `packages/core`：`src/plugins.ts`（布局/命名/`PluginSource`/`PluginStore`/`PluginRecord`/`PLUGIN_ROUTE`）、
  `src/host/plugins-fs.ts`（磁盘实现：列表=有 `plugin.json` 的目录、写入原子、路径不得越界、
  `records()`/`setRecord()` 维护 `index.json`）、`vite.ts` 新增 `pluginFiles()` 桥
  （`GET /hub/plugins` 列 id、`GET /hub/plugins/<id>/<file>` 供 JS/JSON/资源，全部 `no-store`）。
- `packages/extensions`：`src/icons.ts`（清单只能写图标**名字**，这里解析成组件，缺省回退 puzzle）、
  `src/plugin.ts`（清单校验 + `discoverPlugins()` 构建 `ExtensionDefinition`）、
  `src/remote.ts`（浏览器侧只读 `PluginSource`）；`ExtensionScope` 新增 `i18n`。
- `apps/web`：`lib/hub.ts` 启动前 `discoverPlugins()` 并追加进 catalog；`lib/ui-kit.ts` 作为 `hub.ui` 服务。
- 示例插件：`packages/extensions/examples/hello/`（复制到 `~/.context-hub/plugins/` 即可看到）。

**踩到的坑（重要，写插件的人会再踩）**

- **fiber 的注入服务只在 `activate` 期间可读**：插件组件在渲染时读 `scopectx.i18n` 会抛
  `cannot get property "i18n" without inject`（Cordis 的属性守卫）。所以内核**在激活时**
  把 i18n 解析好放进 scope；插件应在 activate 里把需要的东西取出来再交给组件。
- 浏览器会缓存清单：桥的 JSON 响应必须带 `Cache-Control: no-store`，否则改完 `plugin.json`
  页面仍按旧清单（少字段）运行。
- lucide 图标是 `forwardRef` 的**对象**不是函数，断言 `typeof icon === "function"` 会误判。

### 验证

- `node packages/extensions/scripts/check-plugins.ts`：**33 项断言全绿**（只有带清单的目录算插件、
  有效插件可加载、清单字段进入 definition、id 与目录不符/apiVersion 不兼容/入口无 `activate`
  三种拒绝各有原因、activate 收到 React+图标表+UI kit、贡献带真实图标组件、
  9 个非法 id 被拒、读写不得越出插件目录、records 往返与坏文件容错、remove 连带清记录）。
- `check-state.ts` / `check-store.ts`：全绿；`core`/`extensions`/`plugin-skills` lint 与
  `web`/`extensions`/`locale-zh-cn` typecheck 全绿。
- 浏览器（真实 `~/.context-hub/plugins/acme.hello/`）：侧栏新增"示例插件"页、`/hello` 渲染插件页面、
  插件自带 en / zh-CN 词条生效、按钮计数（React hooks）可用；卸载 → 侧栏与路由立即消失、
  `state/extensions.json` 写入 `false`；刷新后仍停用；重新安装后恢复。

### 下一轮：插件市场（用户明确要的"从远程下载到本地"）

1. **宿主侧安装接口**（浏览器不能下载再写盘，CORS 也不允许）：
   `POST /hub/plugins { source }`，source 三种形态 —— registry 名字/版本、直链、本地路径。
   流程：拉取 → 校验（`integrity`；manifest 的 `apiVersion`/`id` 先验）→ 解压到临时目录 →
   原子 rename 进 `<home>/plugins/<id>/` → 写 `index.json` 记录 → 默认**不启用**（UI 里点安装）。
   失败回滚临时目录并写 `<home>/plugins/.logs/<id>-<time>.log`。
2. **格式**：v1 建议"单文件 ESM + plugin.json"（`entry` 指一个自包含 bundle）；
   zip/tgz 解压要引入维护中的依赖，等有真实来源再接。
3. **信任**：清单已声明 `permissions`，安装/启用时展示并需确认；代码与页面同权（无沙箱），
   所以"安装 ≠ 启用"，并标"未验证"。沙箱（Worker/iframe + 声明式协议）留作后续。
4. **市场 UI**：Extensions 页加"从 URL / 文件安装"，列表显示来源、版本、权限、可更新。
5. **升级/卸载语义**：升级=原地替换目录（保留 `state/` 数据 + 记录版本）；卸载=删目录 + 清记录，
   `state/` 数据与 `state/extensions.json` 的选择都保留。

## 技能页国际化补漏（2026-10-08，用户："这个没有进国际化"）

### 问题

翻页器的 "Rows per page" 是写死在共享原语 `TablePagination` 里的，页签与列表表头也一样。

### 决策

- **共享原语不带文案**：`packages/ui` 是组件库，不依赖 i18n 服务；按"localized primitive props"
  的约定改成 `label?: string`（默认英文），由调用方传 `t(...)`；同一字符串兼作可见说明与
  `Select` 的无障碍名。
- **分页键放在公共组**：新增 `pager.rowsPerPage`（en `Rows per page` / zh `每页行数`），
  放内核的英文兜底表与 zh 包——分页是外壳的能力，不属于某个页面包。
- **列表表头走词表**：`columns` 从 `label` 改成 `labelKey`（`skills.column.*`），
  英文表里写成大写（`SKILL`/`TAGS`…）以保持设计稿的观感，中文正常写（技能/标签/…）；
  这样不必用 CSS `uppercase`（它会把中文里的 "Token" 也变成 "TOKEN"）。
- **排序下拉不再是"值即文案"**：`sortOptions` 改成 `{ value, labelKey }` + state，
  触发器渲染当前项的词条（`SelectValue` 只会原样渲染 value）。

### 验证

- 浏览器（zh-CN）：列表视图表头 = 技能/标签/来源/Token 数/触发次数/更新时间/操作；
  翻页器显示 `每页行数`（无障碍名同）；Add 弹窗排序 = 安装量最高/最近更新/趋势上升；
  勾选框无障碍名 = `选择 <技能名>`。
- `plugin-skills` typecheck+lint、`web`/`ui`/`extensions`/`locale-zh-cn` typecheck 通过
  （`ui` 的 19 个 lint 错误是 shadcn 既有问题，本次未新增）；三个行为脚本全绿。

### 仍待补（更大范围）

`apps/web` 的 Overview / MCP / Plugins / Activity / Policies / Repository / Settings 仍是全英文页面
（只有 Extensions 与占位页接了 i18n），要给这些页面做词表 + 接线，才算"整个界面可切换语言"。

## 设计稿：Add skill 弹窗改为「本地导入 + 下载」（2026-10-08，用户先改设计）

### 用户要求

1. 导入弹窗的常态是"导入本地"，另一个 tab 用来**下载**：输入包名，用 `npx skills` 下到 hub 目录。
2. skill.sh 这一块以后**用插件实现**，本次先从设计里移除它的 tab。
3. 页脚提示 `Copied into .dsh/skills and enabled right away.` 是错的（那个路径不属于我们）。

### 先做过的事实核查（`npx skills` 用法）

细节与逐条实测见文末「`npx skills` 实测」一节；这里只留结论：命令形如
`skills add <source> [--skill <name>] -a universal -y --copy --json`，来源可以是 `owner/repo`、
`owner/repo@skill`、Git URL 或直链；不给技能名会把整个仓库装进来。

### 画布改了什么

- `Y2fjK1`：`Skills — skill.sh Browser` → **`Skills — Add skill — Download`**。搜素/排序/6 条结果列表全部删除，
  换成 `Dialog Body`（gap 16, padding [0,24,24,24]）：`Field Package`（占位 `vercel-labs/agent-skills`）、
  `Field Skill (optional)`（占位"留空则取整包"）、说明行 `Fetched with the skills CLI (npx skills).`；
  页脚改为 `Downloaded into ~/.context-hub/skills and enabled right away.` + Cancel / Download。
  弹窗 640×695 → **640×384**，y 由 193 → **348**（居中）。
- `DzRqf`：`Skills — Import` → **`Skills — Add skill — Local`**；页脚提示改为
  `Copied into ~/.context-hub/skills and enabled right away.`（原 `.dsh/skills` 是错的）。
- 两个弹窗的分段行：`skill.sh` / `local` → **`Local` / `Download`**（Local 在左、默认选中）；
  未选中项改 `$muted-foreground`/500，选中项 `$foreground`/600 + 白色胶囊。
- 工具栏按钮（六块屏统一）：`Browse skill.sh` → **`Download`**（图标 `download`，仍是主按钮）。
- 文案同源更新：弹窗描述 = `Import a folder from this machine, or download a skill by name.`；
  页描述（Grid/List/两个弹窗/两块 lightbox 共 6 处）= `Import a folder, download a skill by name, or manage the ones in this workspace.`；
  模块标签描述去掉 "skill.sh browser"。

### 验证

- 全行扫描：只有 4 个 masonry `Column` 报 "partially clipped"（既有的视口折线，非缺陷）。
- 导出核对（本地看过，按约定不入库）：两个弹窗、Grid 工具栏、两屏整图；
  分段行标签居中、字段圆角/描边与 MCP 表单一致、页脚右对齐（405+211 = 616 = 640-24）。

### 待用户确认

见文末 `npx skills` 实测一节的「仍待确认」；代码侧（移除 skill.sh tab、下载 tab、提示文案）尚未实现。

## `npx skills` 实测：下载到底能怎么用、界面该怎么设计（2026-10-08）

用户指出上一版没把 CLI 研究明白。实测对象 `skills@1.7.1`（`vercel-labs/skills`，注册表站点 skills.sh，
规范 agentskills.io）。以下每条都跑过。

### 能力边界

| 问题 | 实测结论 |
| --- | --- |
| 能装什么 | `owner/repo`、`owner/repo@skill`、GitHub/GitLab/Azure/git URL、本地路径、**直链 SKILL.md 或 zip/tgz**（下载 ≤10 MiB、解压 ≤25 MiB、≤1000 文件，可用环境变量放宽） |
| 注册表名 | `notion` 这类不是通用注册表查询，而是各家 CLI 集成（要求装 `ntn` 并登录）→ 不能当"按名字下载"的地基 |
| 装到哪 | 项目级 `<cwd>/<agent>/skills/`；`-g` 全局 `~/<agent>/skills/`。`-a universal` 只落 `.agents/skills/<name>/`。**没有"装到指定目录"的参数** |
| 选择行为 | 不给 `--skill` 时 `-y` 会**装整个仓库**（实测 vercel-labs/agent-skills 装了 9 个）；`--skill '*'` 同义；`--skill` 可重复 |
| JSON 报告 | `--json` 输出 `[{name,status,source,ref,hash,path,scope,agents,mode,security{gen,socket,snyk,details}}]`；**status = installed / skipped / failed** |
| 锁文件 | 仓库根写 `skills-lock.json`：`{version, skills:{<name>:{source,sourceType,skillPath,computedHash}}}` —— 正好是我们要记的来源与哈希 |
| 失败形态 | 三种都是**退出码 1**：包不存在 → `{status:"failed",error:"Failed to clone… Authentication failed…（含 SSH/gh 提示）"}`；技能名拼错 → `{name,status:"skipped",reason:"No matching skill found in source"}`。所以只判退出码不够，还要看报告里的 `status` |
| 列举技能 | `add <pkg> --list` 能列出名字+描述，但**不能与 `--json` 同用**、输出带 ANSI 与 spinner 光标控制 → 解析脆弱 |
| 搜索注册表 | `find <q>` 可非交互，但只有文本（ANSI）；**`https://skills.sh/api/search?q=&limit=` 是公开 JSON API**（Algolia，最多 100 条，字段 `id/source/skillId/name/installs`；空 `q` → 400；无详情接口、无 description） |
| 环境变量 | `DISABLE_TELEMETRY=1` / `DO_NOT_TRACK=1` 关遥测；`GITHUB_TOKEN`/`GH_TOKEN` 供私有库；`INSTALL_INTERNAL_SKILLS=1` 才装 `internal: true` 的技能 |
| Windows | `execFile("npx.cmd")` 被 Node 22+ 拒绝（spawn EINVAL）→ 必须 `execFile(process.execPath, [<node>/node_modules/npm/bin/npx-cli.js, …])`；文本输出**永远带 ANSI**（`NO_COLOR`/`FORCE_COLOR` 无效），所以只信 `--json` |

### 由此定下的设计

1. **输入的是"来源"，不是"名字"**：字段叫 `Package`，hint 明写可接受 `owner/repo, owner/repo@skill, a Git URL, or a SKILL.md link`。
2. **执行在宿主侧、且必须沙箱化**：CLI 只能由有盘的进程跑，且它只会往 agent 目录写 →
   在临时目录里 `cwd` 运行（`-a universal --copy -y --json`），再把 `.agents/skills/<name>` 收编进
   `~/.context-hub/skills/<name>`；全程**不碰用户自己的 `~/.claude/skills` 等目录**。
3. **要记的来源信息已经现成**：`skills-lock.json` 的 `source / skillPath / computedHash` + 报告里的
   `source/hash`，直接进我们 catalog 的安装记录（更新=同 spec 重跑并比 hash；卸载=删目录+记录）。
4. **反馈状态要齐**：下载中（clone 可能几十秒）、成功（列出装了哪几个）、`skipped`（名字对不上，
   当作失败报出）、`failed`（把 CLI 的 error 原文带 SSH/gh 提示一起显示出来，例如私有库的 Authentication failed）。

### 画布改动（本轮）

- `Y2fjK1`（Add skill — Download）随实测调整：Package 字段下新增 11px hint 列出可接受的来源形态；
  body hint 改为 `Runs the skills CLI (npx skills add); private repositories use your git credentials.`；
  弹窗随下一节改为列表选择版。

### 仍待确认

1. 需要"已安装"标记吗（列表里某技能已在 `~/.context-hub/skills` 时）？
2. 分组标题要不要在列表里显示（现在只显示不带分组的平铺清单）？
3. 装完显示 CLI 的安全信息（`security.snyk: medium` 等）吗？
4. 默认加 `DISABLE_TELEMETRY=1`？
5. 目标 id 已存在：拒绝 / 覆盖 / 加后缀？
6. 粘贴的命令里如果带 `-g`（全局）或 `-a <agent>`，忽略还是提示？（我们固定 `-a universal` 装进 hub）

## 能否"贴仓库 → 拉列表 → 勾选 → 下载"？能，已实测（2026-10-08）

用户问：能否直接填仓库、拉取列表、用户选择后再下载。用 `mattpocock/skills` 等三个仓库实测，
答案是**能**，两个环节都跑通了。

### 一、列列表：`skills add <source> --list`

**不能用 `--json`**（CLI 直接拒绝：`The --json flag cannot be combined with --list.`），
但文本输出是稳定的三层结构，剥掉 ANSI 与 spinner 光标控制后可以可靠解析：

```
● Available Skills
<分组标题>                     ← 可省略（vercel-labs 就没有）；对应仓库目录，如 skills/<category>/
│
│   <skill-id>                 ← 框线 + 4 空格
│
│     <完整描述，不截断>         ← 框线 + 6 空格
│
│   <skill-id>
…
 Use --skill <name> to install specific skills
● Found 38 skills               ← 自报数量，可用于校验解析结果
```

三个仓库的解析结果（`cli said` vs `parsed` 完全一致）：

| 仓库 | CLI 自报 | 解析出 | 分组 |
| --- | --- | --- | --- |
| `mattpocock/skills` | 38 | **38** | Mattpocock Skills 27 + General 11 |
| `vercel-labs/agent-skills` | 9 | **9** | 无标题 → 回退为仓库名一组 |
| `anthropics/skills` | 20 | **20** | Academy Guide 1 / Claude Api 1 / Discernment Nudge 1 / Document Skills 4 / Example Skills 12 / General 1 |

- 解析规则：剥 ANSI → 找 `Available Skills` → 之后的行里，非框线行是分组标题，
  `│`+4 空格是 id，`│`+6 空格是描述；没有标题时用仓库名兜底。
- 描述是**完整原文**（实测最长 1069 字符），所以列表摘要要在 UI 侧截断。
- 耗时：~2.6–3.1 秒（克隆仓库）；卸载/错误路径见上表。

### 二、只下载选中的：多个 `--skill`

`--skill` 可重复；实测 `mattpocock/skills` 选 3 个（code-review / diagnosing-bugs / tdd）：

```
skills add https://github.com/mattpocock/skills \
  --skill code-review --skill diagnosing-bugs --skill tdd \
  -a universal --copy -y --json
→ exit 0，2644ms；报告 3 条全部 installed；磁盘上**只有**这 3 个目录（无多余）
```

锁文件同时给出每个技能的来源细节，可直接进我们的安装记录：
`{source:"mattpocock/skills", sourceType:"github", skillPath:"skills/engineering/code-review/SKILL.md", computedHash:"1846…"}`。
`skillPath` 还顺带暴露了真实目录层级（分组标题就来自它）。

### 三、因此下载 tab 的设计（画布已改）

`Y2fjK1`（Add skill — Download）从"Package + Skill 两个输入"改为**列表选择**：

```
[Local | Download]
Package  [ https://github.com/mattpocock/skills      ] [ List ]
         owner/repo, owner/repo@skill, a Git URL, a SKILL.md link, or a pasted npx skills add command
         ( grill-me × )                       ← 从粘贴的命令/`@` 解析出的已选技能
────────────────────────────────────────────────────────────
Found 38 skills in this package                  Select all
 docs-writer      Turn notes and pull requests…      ✓ Selected
 release-notes    Summarise merged work…             [Select]
 api-review       Review endpoint changes…           [Select]
 onboarding       Walk a new contributor…            [Select]
 changelog        Group commits into a…      （滚动区外）
────────────────────────────────────────────────────────────
Downloaded into ~/.context-hub/skills and enabled right away.   [Cancel] [Import]
```

- 弹窗 640×**596**，y=242（居中）；Body 401 = 字段 105（标签 15 + 输入 38 + hint 13 + chips 21 + 间距）
  + 分隔 1 + 标题行 15 + 列表 208（4×52）+ 间距。
- 行 = 复选框（选中=$primary 填充+白色勾）+ 等宽技能名 13/600 + 描述 11.5 muted（实现里截一行）。
- **chip 就是"已选技能"的唯一状态**：勾选行 = 增删 chip；List 回来的行按 chip 预勾选；
  Download 把 chips 逐个变成 `--skill`。
- 按钮带选中数量（`Download 1`），未选中时禁用。
- 需要一起实现的三个状态（尚未画）：**列表加载中**（"Fetching skills…"）、**空结果**、
  **失败**（把 CLI 的 error 原文连同 SSH/gh 提示显示出来，例如私有库的 Authentication failed）。

## 精确指令怎么填？表单要能接住"用户手里已有一条命令"（2026-10-08）

用户问：如果用户手里就是 `npx skills add https://github.com/mattpocock/skills --skill grill-me`
这样的准确命令，表单怎么填？实测了各种"精确写法"的边界。

### 实测边界

| 写法 | 结果 |
| --- | --- |
| `--skill grill-me` | ✅ 只装 grill-me |
| `-s grill-me`（短参） | ✅ 同上 |
| `mattpocock/skills@grill-me`（简写 + `@`） | ✅ 只装 grill-me |
| `https://github.com/mattpocock/skills@grill-me`（**URL + `@`**） | ❌ **失败**：git 把 `@` 当成凭据分隔符，报认证失败并中止 |
| `mattpocock/skills@grill-me@tdd`（两个 `@`） | ❌ 失败，`skipped`：`grill-me@tdd` 被当成一个技能名；**多个技能只能用重复的 `--skill`** |
| `--list` 带上 `@skill` 或 `--skill` | 列表**照样列出全部**（38 个），pin 被忽略 |
| 技能名拼错 / 仓库不存在 / 无匹配 | 三种都 **exit 1**（技能名拼错时报告里是 `skipped` + `No matching skill found in source`） |

**结论（实现要点）**：`@skill` 只能跟在 `owner/repo` 简写后面，**绝不能把 `@` 拼到 URL 上**；
所以表单要自己解析 `@`，把来源与技能名拆开，安装时统一用 `--skill` 传（这也是我们唯一能控的形态）。

### 表单怎么填（三种都通）

1. **直接粘贴整条命令**（最贴近用户现状）：`npx skills add … [--skill X]` 贴进 Package 字段 →
   表单剥掉 `npx skills[ @version] add`，取出 source 与所有 `--skill/-s` 值，
   把技能名变成输入框下方的 chip，**不点 List 也能直接 Download**。
2. **简写 pin**：`owner/repo@skill` —— 同样解析成 chip。
3. **浏览挑选**：点 `List` 拉列表 → 勾选（chip 与勾选是同一个状态，互相联动）。

因为 `--list` 会忽略 pin，实现上：**chips 即"已选技能"的唯一状态** → List 回来后按 chip 预勾选；
若某个 chip 在列表里找不到，就地提示（多半是拼错）。

### 画布改动

`Y2fjK1` 的 Package 字段：hint 补上 `or a pasted npx skills add command`；
输入框下方新增 **Chip 行**（`grill-me ×`，圆角胶囊 `$muted`，等宽 11.5 + 12px `x` 图标）；
列表第一行改成 `grill-me` 且已勾选（对应 chip），其余三行改为未勾选；
按钮改为 `Download 1`；弹窗 570 → **596** 并居中（y=242）。

## 下载列表改版：按参考图重做行样式、列表限高可滚动（2026-10-08，用户："ui 太丑了"）

用户给了一张参考图（技能列表：左侧两行文字、右侧计数 + 靛蓝按钮、已安装项显示绿色 `✓ 已安装`），
要求照它重做，并且**行内动作从"下载"改成"选择"**、列表**要有最大高度并出现滚动条**。

### 行样式（旧 → 新）

| | 旧 | 新 |
| --- | --- | --- |
| 左 | 复选框 + 等宽技能名 + 描述 | **无复选框**；技能名（等宽 13.5/600）+ 描述（11.5 muted）两行 |
| 右 | 无 | **行内动作按钮**：未选 = `Select`（`$primary` 实心、白字、h32）；已选 = `✓ Selected`（`$chart-2` 勾 + 文字，无按钮） |
| 行高 | 52 | **56**，行右内边距 14（避免压住滚动条） |

参照图的"安装 / ✓ 已安装"一一对应我们的"选择 / ✓ 已选择"（英文画布：Select / Selected）。

### 列表限高与滚动

- `Skill List`：`height: 224` + **`clip: true`**，5 行内容（5×56 = 280）→ 第 5 行整体在滚动区外，
  边界落在整行上（实现里对应 `max-h-[224px] overflow-y-auto`）。
- 右缘新增 **`Scrollbar`**：4×186 圆角 `#0F172A40`，绝对定位（x=584, y=4），长度≈可见比（4/5 ≈ 78%）。
- 弹窗 596 → **620**（Body 425 = 字段 105 + 分隔 1 + 标题行 15 + 列表 232 + 间距 48 + 下内边距 24），
  重新居中（y=230）。

### 验证

- 全弹窗扫描：唯一的问题节点是滚动折线本身，其余无问题。
- 截图逐块看过：行左两行文字对齐、按钮右对齐（x=494..578）、滚动条不压按钮、
  `✓ Selected` 与 `Select` 两种状态的视觉差与参考图一致。

## 表单去掉 List 按钮、入口统一为 Import（2026-10-08）

用户三轮反馈：① 表单样式不对（List 是个裸文字按钮）；② 底部按钮统一显示 Import；
③ 工具栏的 Download 按钮不要了，统一从 Import 进入。

### 改动

- **List 按钮删除**：`Package Row` 整个行框架删掉，输入框直接放在字段列里（宽度 592 占满整行，
  不再被按钮挤到 491）。拉列表改为**输入框失焦自动触发**，并在提示行下加一行说明
  `Listed automatically when the field loses focus.`（11px muted，位于来源形态说明与 chip 行之间，
  顺序：Label → Input → Hint（可填什么）→ Note（何时拉列表）→ Chips（已选））。
- **工具栏**：删掉六块屏的 `Button Download`，操作簇只剩 `[视图切换] [Import]`（宽 192）。
- **弹窗页脚**：Download tab 的 `Download 1` → **`Import`**；Local tab 本来就是 `Import`，
  两个页脚现在完全一致（Cancel 79 + Import 100）。
- 字段高度 105 → 124（多一行 Note），弹窗 620 → **631**，重新居中（y=224）。
- 列表高度 232 → **224**：正好 4 行（4×56），底部是干净的边界而不是 8px 半截条；
  「还有更多」由滚动条表达（滑块 186/224 ≈ 78%，对应 4 行可见 / 5 行内容）。

### 验证

- 全弹窗扫描：只有 `Skill wayfinder fully clipped`（列表第 5 行在滚动区外，符合预期）。
- 视觉复核（逐块导出看）：工具栏右侧 = 网格/列表切换 + 描边 `Import`，无 Download；
  页脚 = `Cancel` + 靛蓝 `Import`；列表滚动条可见、最后一行下方边界干净；
  表单里输入框整行、两行灰色说明、chip 行顺序正确。

### 待定

工具栏的 `Import` 目前仍是**描边（次要）**样式——它过去是次级入口（主按钮是已删除的 Browse skill.sh）。
现在它是页面唯一入口，是否要提为主按钮（靛蓝实心）？未擅自改动。

## Local 也要列表：拖入的可能是"技能仓库"（2026-10-08，用户要求）

用户指出：本地导入的可能不只是一个技能，而是**一个技能仓库**，所以 Local 同样要列出扫描到的技能。

### 改动

`DzRqf`（Add skill — Local）的弹窗结构从"拖拽区 + 页脚"变成与 Download 同构：

```
[ Local | Download ]
┌──────────────────────────────────────────────────────┐
│ [↑]  Drag and drop a skill folder here   [Browse files] │  ← 拖拽区 92 高（横排紧凑版）
│      A folder with SKILL.md, or a repository of skills.  │
└──────────────────────────────────────────────────────┘
────────────────────────────────────────────
Found 5 skills in this folder                 Select all
 docs-writer      Turn notes and pull requests…      ✓ Selected
 release-notes    Summarise merged work…             [Select]
 api-review       Review endpoint changes…           [Select]
 onboarding       Walk a new contributor…            [Select]
 changelog        Group commits into a…      （滚动区外）
────────────────────────────────────────────
Copied into ~/.context-hub/skills and enabled right away.  [Cancel] [Import]
```

- **拖拽区改为横排紧凑版**（228 高居中版 → **92 高**）：44 方形图标环（20 图标）+ 文字块
  （标题 14/600 + 说明 11.5）+ `Browse files` 按钮；说明改为
  `A folder with SKILL.md, or a repository of skills.`
- **列表复用 Download 的结构与行样式**（Divider → `Found N skills in this folder` + `Select all` →
  `Skill List` 224 高 + 行内 Select / ✓ Selected + 滚动条），示例数据换成"本地仓库"的一套技能名
  （docs-writer / release-notes / api-review / onboarding / changelog），首个已选。
- 弹窗 447 → **623**，重新居中（y=228，与 Download 的 631 基本等高）。

### 待定（新增）

拖入**之前**列表是空的：现在画的是"已拖入"状态。两种实现取舍——
① 列表区在未拖入时隐藏（弹窗变矮、拖入后长高）；② 始终保留列表区、未拖入时显示空提示（布局稳定但首屏有空洞）。
倾向前者（拖入是用户的主动动作，长高不突兀），实现时确认。

## Cancel 加二次确认（2026-10-08，用户要求"防止用户误操作"）

用户要求：点 Cancel 出现二次确认，避免误操作丢掉已填/已选的内容。
用户随后纠正：**这个是气泡弹窗**——确认不占整屏、不盖住父弹窗，要挂在 Cancel 上。

### 新画板

`eddWl` 行内新增第 6 块：**`Context Hub — Skills — Add skill — Discard confirm`**（`Bn0cT`），
紧邻两块 Add skill 的右侧（左邻是 `DzRqf`「Add skill — Local」，右邻是 lightbox）。
为插入它，两块 lightbox 右移 1560（`L9tdZp` 6368→9488、`Mnwzp` 7928→11048），行宽 9496 → **12488**。

### 气泡样式

`Bn0cT` = `Y2fjK1` 的整屏拷贝，**没有第二层 scrim**：父弹窗照原样留着，气泡从页脚浮出来。
（先前那版居中的 420×138 模态、`Confirm Scrim`、点 scrim 关闭，都已删除。）

```
        ┌──────────────────────────────┐
        │ Discard this import?         │ 13.5/600
        │ The package and the skills   │ 12 muted
        │ you picked are not saved.    │
        │                              │
        │        [Keep editing] [Discard] │ 28 高，右对齐
        └───────────▼──────────────────┘ ← 12×12 菱形，朝下
                 [Cancel] [Import]         ← 页脚原按钮
```

- 气泡 `M4emk`：320×**134**，`x=588, y=654`，`cornerRadius: $radius-lg`，`padding: [14,16]`，
  `gap: 10`，`clip: false`；阴影比父弹窗轻（`#0F172A29` y8 blur24 + background_blur 24），
  否则两层阴影叠起来像两块浮板。
- 小三角 `Wr4tO`（`Bubble Caret`，绝对定位）：12×12 白方块旋转 45°，`$dialog` 填充 + `$glass-border` 内描边；
  在帧的 children 里排在气泡**之前**（index 7），上半截被气泡盖住，只露下面那个尖；
  帧是 flex 布局，所以必须写 `layoutPosition: "absolute"`，否则 `x`/`y` 会被忽略。
- 对位：三角中心 x=868 = Cancel 中心（Cancel 占 829..908）；气泡右边缘 x=908 与 Cancel 右边缘齐平。
- 按钮：`Keep editing`（描边，108 宽）、`Discard`（`$destructive` 实心 + `$destructive-foreground`，
  88 宽），高 28，**安全选项在左**。
- 两块 Add skill 弹窗页脚完全同构，所以**这一块画板同时代表 Local 与 Download 两个 tab** 的确认态。

### 实现规则（重要，别做成一刀切的确认）

1. **只在"有东西可丢"时才确认**：字段为空且没有选中任何技能时，Cancel 直接关闭——
   打开弹窗又立刻关掉是最常见的用法，这种时候弹确认是纯打扰。
2. **同一规则覆盖所有退出路径**：Cancel 按钮、右上角 `×`、Esc、点弹窗外 —— 四条都要走同一个判断，
   否则用户绕开确认就失去意义。
3. 文案区分动作：标题说清丢什么（`Discard this import?`），说明说清代价
   （`The package and the skills you picked are not saved.`），主按钮用动词 `Discard` 而不是 `OK`。
4. 气泡不是模态：Esc、点气泡外、再次点 Cancel 只关掉气泡、留在弹窗里；
   组件层把一个 Popover/Popper 锚在 Cancel 上，不要自己按弹窗坐标算位置。

## 对齐修复：拖拽区说明文字还残留居中（2026-10-08，用户："文字没有对齐"）

`MS8Ea` 拖拽区从"大居中版"改成"横排紧凑版"时，说明文字 `ElA6m` 的 `textAlign: center` 忘了清掉：
标题左对齐、说明居中，两行左边缘差一截（截图为证）。已改回 `left`，与标题同一左边界。

顺带全文档扫了一遍 `textAlign: center` 的文本，只剩 Plugins「Install — From path」的
`Dropzone Hint`（`pPF3z`）——那块是**整块居中的大拖拽区**（标题也居中、420 宽的说明框在 592 里居中）,
属预期，不动。

## 代码实现：按设计稿落地（2026-10-08，用户："我说的根据设计稿完善代码"）

设计稿改成什么样，代码就写成什么样：Add skill 弹窗从「skill.sh 注册表 + 本地拖拽」变成
**Local / Download 两个 tab 共用一份列表**，Drop 与 Download 都真的能跑通，Cancel 用气泡二次确认。

### 新增的三道缝

| 模块 | 什么 | 在哪 |
| --- | --- | --- |
| `src/package-source.ts` | 把 Package 字段读回 `{ source, skills }` | 可移植，对话框与脚本共用 |
| `src/folder-scan.ts` | 读一次拖入/选中的文件夹：按首段分组、只认带 `SKILL.md` 的组 | 浏览器侧（拖拽遍历 + base64） |
| `src/host/skills-cli.ts`、`src/host/folder-import.ts`、`src/host/names.ts` | 跑 CLI、写文件夹、拒绝危险目录名 | 宿主侧（有盘的那一端） |

`SkillStore` 因此多了三个方法：`listPackage(source)` / `installPackage(source, skills)` / `importFolder(files)`;
桥接新增三条路由 `GET /hub/skills?action=package`、`POST …action=install`、`POST …action=import`。

### 下载怎么落地（照实测的形状）

- **在临时目录里跑 CLI**：`npx skills add <source> [--skill x]… -a universal --copy -y --json`,
  `cwd` 是 `mkdtemp` 出来的空目录；CLI 只会往 agent 目录写，所以它写它的，写完我们**只把
  `.agents/skills/<name>` 搬进 `<home>/skills/<name>`**。用户自己的 `~/.claude/skills` 全程不碰。
- **Windows 必须绕 npx.cmd**：走 `process.execPath` + npm 自带的 `npx-cli.js`
  （Windows 在 `<node>/node_modules/npm/bin/`，POSIX 在 `<node>/../lib/node_modules/npm/bin/`）。
- **只信 `--json`**：文本输出永远带 ANSI。列表没有 JSON，只能解析文本，
  所以 `parsePackageList()` 按实测结构读（`│` + 4 空格是名字、+ 6 空格是描述、无框线行是分组标题、
  `└  Use --skill` 是结尾）。
- **已有同名 = 拒绝，不覆盖**：`installPackage` 把"库里有这个 id"报成该技能的失败原因，
  用户先卸载再下载即可（画布待定项 ⑤ 的默认取值）。
- 失败原样透出：拼错技能名是 CLI 的 `No matching skill found in source`，仓库不存在是它的认证/克隆报错。

### 本地导入怎么落地

拖拽用 `webkitGetAsEntry()` 递归遍历（`readEntry` 逐层读目录，`readEntries` 要读到空数组才停）,
选择器用 `<input type="file" webkitdirectory>` 的 `webkitRelativePath`；两者都变成
`{ path, file }` 列表 → `scanFolder` 分组成候选 → 选中项编码成 base64 →
`POST …action=import` → 宿主按 `<root>/<首段>/…` 逐文件写入，**目录必须先有 `SKILL.md`**，
越界路径（`..`）直接丢弃，写一半失败就把该目录删掉。

### 对话框行为

- 两个 tab 共用一套状态：`picked` 就是 chip、就是勾选、就是导入内容。
- **失焦即拉列表**：`listed` 记住已列过的 source，同一个 source 不再重复拉（点一下别处不会重跑 CLI）。
- **粘贴命令直接可用**：`npx skills add … --skill x` → 解析出 source + chip，不点列表也能直接 Import。
- **Cancel 气泡**：`Popover` 锚在 Cancel 上（`@workspace/ui` 补了 `PopoverArrow`），
  只有"有东西可丢"时才弹；Esc / 点外部 / 再次点 Cancel 只关气泡。空字段直接关弹窗。
- 列表限高 `max-h-56`（224px，正好 4 行）。
- **Import 带图标与计数**（用户 2026-10-08 指出）：按钮 = 下载图标 + `导入`，选中 N 个时显示 `导入 N`、
  一个没选时只显示 `导入` 且禁用。禁用条件从"只有 Local 需要选中"统一成"两个 tab 都要选中"，
  于是"空选中 = 装整包"不再是 UI 可达路径（宿主契约仍保留该语义，Select all 是界面上的入口）。

### 验证

- `node packages/plugin-skills/scripts/check-package.ts`：**全绿**（新增脚本：9 条 Package 解析断言、
  列表文本解析、拖入分组与编码、写盘与越界拒绝、重名拒绝、二进制往返）。
- `check-store.ts` / `check-state.ts` / `check-plugins.ts`：全绿；`plugin-skills` typecheck+lint、
  `web`/`ui`/`locale-zh-cn` typecheck 通过（`ui` 既有 19 个 lint 错误与本次无关）。
- 桥接实测：列表接口对 `mattpocock/skills` 返回 38 个技能；`install` 真的把 `prototype`、`wizard`
  下进 `~/.context-hub/skills`（重名再装被拒、拼错名字回 CLI 原文）；`import` 写入
  `docs-writer`（含 `references/guide.md`）与 `api-review` 并进了目录。
- 浏览器（zh-CN）：工具栏只剩视图切换 + 导入；弹窗 Local/Download 两 tab、失焦拉列表（38 行、限高可滚动）、
  行内"选择/已选择"、chip、页脚提示与按钮、Cancel 气泡（继续编辑只关气泡、放弃关弹窗）全部符合设计。
- **验证用的技能已从 `~/.context-hub/skills` 删除**，用户原有两条（`pdf-extract`、`hand-made`）不变。

### 画布待定项的默认取值（可再改）

| 待定 | 本次取值 |
| --- | --- |
| Local 未拖入时列表 | 先不显示，读入后出现（含"没有找到技能"空态） |
| 分组标题 | 不显示，平铺 |
| CLI 安全信息 | 不显示 |
| `DISABLE_TELEMETRY` | 默认带上 |
| id 冲突 | 拒绝并提示 |
| 粘贴命令里的 `-g` / `-a <agent>` | 忽略（我们固定装进 hub） |
| 已安装标记 | 暂不做 |

### 画布同步（Import 计数）

三块 Add skill 画板的页脚 Import 按钮（`P60pZQ` / `qgrV5` / `U49rL`，组件 `x3lnSj`）从 `Import`
改成 **`Import 1`**，与各画板里"已选一个"的状态对齐；图标沿用组件里已启用的 `download`。
改的是实例的 `descendants` 覆盖，图标与配色的覆盖一并写上，避免只改文字把图标覆盖丢掉。

### 去重与「已导入」标记（2026-10-08，用户："已经下载下来的需要显示已经导入了"）

技能列表里已经在本库里的行不再让用户选，也不再出现在导入里。

- **判定**：打开弹窗时读一次目录（`store.list({ limit: 1000 })` 拿全部 id），按目录名小写比对；
  每次打开都重读，标记不会过期。
- **行状态**：已在本库 → 绿色勾 + `已导入`（灰色文字，无按钮，与画布新增的 `State Imported` 一致）；
  其余仍是 `选择` / `已选择`。
- **不再重复导入**：`selectable` 只含未入库的行 —— 全选只选它们（38 个技能里已有 3 个时显示 `导入 35`），
  粘贴 `…@grill-me`（已入库）不会再变成 chip，按钮显示 `导入` 并禁用。
- **pin 变化要重新播种**：`listed` 只记来源，所以同一来源换 pin 时原来会直接 return、chip 不更新；
  新增 `seeded`（pin 串）一起比对，pin 变了就地重播种，**不重跑 CLI**。
- 宿主侧的重名拒绝保留为最后一道防线（脚本里有断言）。

**验证**：真实仓库 `mattpocock/skills`（38 个）→ 本库已有的三行显示 `已导入`；`全选` → `导入 35`；
`mattpocock/skills@tdd` → chip `tdd` + `导入 1`；`mattpocock/skills@grill-me` → 无 chip + 按钮禁用。

**画布**：两块 Add skill 画板各把一行改成 `State Imported`（`Y2fjK1` 的 `code-review`、
`DzRqf` 的 `api-review`）：绿色勾 14×14 + `Imported` 13/500 `$muted-foreground`，

# Claude Code 插件（2026-10-09）

## 目标（用户 2026-10-09 修正后）

新增独立插件包 `packages/plugin-claude-code`（`@workspace/plugin-claude-code`），
Claude Code 作为**工作区的一个 Agent**：Agent 列表就在侧栏那个**工作区弹出菜单**里
（「工作区」段之下、「创建工作区」之上），可以选中；选中后技能页打开该 Agent 的位置页签。

> 修正记录：最初做成了「侧栏新增 Agents 分组 + `/agents/claude-code` 独立页面」，
> 用户否掉（"我没说要这个菜单页面…是在这里的 menus 新增一个 Agent"）。导航贡献、路由、
> 全局页、以及为页面加的 `SkillStore.globalSkills()` 全部删除。

## 内核 packages/extensions

- [x] `AgentTargetDescriptor` 增加 `icon` 与 `skillLocation`（该 agent 读哪个 workspace place）；
      `ExtensionIcon`（`ComponentType<{className?; "aria-hidden"?}>`）取代 `LucideIcon`，
      品牌图标才能进 `manifest.icon` / `nav.icon` / `target.icon`
- [x] 新增贡献点 `skillLocation`：`{id,labelKey,icon,dir,order}`；技能页按贡献渲染页签
- [x] `hub.target.claude-code` 从 `builtin/targets.ts` 迁到插件包（id 不变）
- [x] Codex / Copilot 的 target 补 `icon`（菜单只列带 `skillLocation` 的，故两者暂不出现）

## 选中状态（packages/core）

- [x] `WorkspaceState.agent` / `WorkspacePage.agent`（存集成 id，不存 place id）+ `selectAgent(id|null)`
- [x] 每次写 `workspaces.json` 都带上 `agent`；桥新增 `POST /hub/workspaces/agent`
- [x] `state/workspaces.json` 的读取校验：非字符串/空串 → `null`

## 宿主 / 存储 packages/plugin-skills

- [x] `host/workspace-skills.ts`：`.agents/skills` 参数化（`workspaceSkillRoot(workspace, dir)`，
      `assertSkillDir` 拒绝绝对路径与 `..`），workspace 系列函数与 `SkillStore` 方法多一个可选 `dir`
- [x] 桥 `vite.ts`：读操作 `?dir=`、写操作请求体带 `dir`
- [x] 技能页：位置页签由贡献生成（`SHELL_TABS` 只有 全部/技能库），`Skill.places: {id,dir}[]`
      取代「工作区」硬编码；`taken` → `takenAt: string[]`；行/卡片动作换成
      `DropdownMenu` + `CheckboxItem` 的目标选择（勾选=装到那里，取消=从那里移除）
- [x] 选中的 agent 决定技能页默认页签：`useSkillLibrary` 暴露 `agent`，
      页面把「人工选择」记成 `{tab, agent}`，agent 变了就回到该 agent 的 place（派生，无 effect）

## 应用 apps/web

- [x] 工作区菜单新增 Agents 段（只列有 `skillLocation` 的 target），行可选中、再点取消
- [x] 顺序：工作区 → 文件夹 → 分隔线 → Agents → 分隔线 → 创建工作区（用户要求创建留在最底部）
- [x] `lib/hub.ts` 目录加入 `claudeCodeExtension`；`package.json` 加 lobehub 依赖
- [x] 文案：`agents.menu.title`（en "Agents" / zh 也作 "Agents"）、`claudeCode.tab`

## 验证

- [x] `pnpm typecheck` 8/8；core / extensions / plugin-skills / plugin-claude-code / web lint 全绿
- [x] `node packages/core/scripts/check-workspaces.ts`（新增 7 条 agent 断言）
- [x] `check-workspace-skills.ts`（新增 8 条 place 断言：独立目录、互不影响、越界拒绝）
- [x] `check-store` / `check-updates` / `check-state` / `check-plugins` 全过
- [x] `pnpm --filter web build` 通过
- [x] 浏览器实测：菜单顺序与勾选、`workspaces.json` 落盘 `agent`、技能页自动停在 Claude Code 页签
- [x] 核对图 `designs/check-web/workspace-menu-agents.png`

## 依赖

`@lobehub/icons@5.23.0`（纯 SVG，按需引入 `@lobehub/icons/es/ClaudeCode`）、
`@lobehub/ui@5.57.1`。**注意**：`@lobehub/ui` 只在被 render 时才会进 bundle ——
撤掉全局页后 jsx 里不再引用它，因此当前产物体积回落到与引入前基本一致；
`package.json` 里的依赖保留（用户明确要求用这两个库），下次有渲染用法时再起作用。

## 未做

- Codex / Copilot 还没有 workspace place，所以菜单里不出现（有 place 才可选）
- 全局目录（`~/.claude`）只读，没有页面展示；选中 agent 只影响技能页默认页签
- `.claude` 侧没有 `.agents` 那样的 `skills-lock.json` 上游记录，故该档技能查不了更新


行内右对齐（x=501，与 `Button Select` 同位）。做法是把已有的 `State Selected` 帧 Copy 进行里，
再把标签改字、改色，删掉原来的 `Button Select` 实例。

### 修复：隐藏目录里的技能找不到（2026-10-08，用户："导入时还需要处理嵌套目录"）

用户拿 `dsh-context-hub\.agents` 试：里面的技能在 `.agents/skills/<name>/SKILL.md`，
而扫描把**任何以 `.` 开头的目录整支忽略**，于是"没有找到技能"。

**改法**：噪声名单从"所有点目录"改成**明确的生成目录** `node_modules` 与 `.git`。
理由：现在通行的技能布局恰恰在点目录里 —— CLI 装到 `<项目>/.agents/skills/<name>`、
Claude Code 装到 `<项目>/.claude/skills/<name>`，排除点目录等于把主路径排掉。

- 拖拽遍历 `readEntry` 同样跳过 `node_modules` / `.git`，免得拖一个装过依赖的项目时把整棵树读进来。
- 其余规则不变：任意深度找 `SKILL.md`、浅的那层优先（技能自己的子目录算它的内容）、技能名取目录名、
  文件按技能目录裁路径。

**验证**

- `check-package.ts`：**全绿**，新增 3 条断言 —— 点目录（`.agents`、`.claude`）里的技能能被找到、
  **被选中的目录叫什么都会被搜索**（`.agents` 作为第一段不再触发忽略）、嵌套文件跟着一起过来；
  原来断言 `.github` 被忽略的那条改成 `.git`（点目录现在是可搜索的）。
- 浏览器（真实 Vite 模块 + 合成大树 200×300 = 60_000 文件，技能藏在 `.agents/skills/grill-me`）：
  103 ms 完成，主线程最大卡顿 **0 ms**，显示"这个文件夹超过 20000 个文件，只读取了最前面的一部分"，
  并且**找到 grill-me**。
- 浏览器（真实仓库 `dsh-context-hub`，含 `node_modules`）：拾取器兜底路径 6.9 s（这段时间是**浏览器
  自己**枚举整个目录的成本），随后扫出 **9 个技能**、无截断提示。
  `浏览文件` 现在优先走 `showDirectoryPicker()` + 我们自己的有界遍历，连这段枚举成本都省掉。
- `check-store.ts` 全绿；`plugin-skills` typecheck+lint、`web` typecheck 通过。

### 修复：大文件夹把页面卡死（2026-10-08，用户："扫描一个很大磁盘的 skills 会容易直接卡死了"）

`DataTransferItem.webkitGetAsEntry()` 的递归**没有任何边界**：深度、条目数、字节数都不设限，
每个目录还要一直 `readEntries` 到空数组；用户指 `deepseek-harness` 那座仓库时主线程被占满。

**改法**（对照 DSH 的做法，全在 `packages/plugin-skills/src/folder-scan.ts`）

- 条目预算 `maxEntries` 20000 + 噪声目录名单（`node_modules` / `.git` / `dist` / `build` / `.venv` / `__pycache__` …，
  取自 DSH 的 `DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES`）；走到预算就停并把 `truncated` 交给界面提示。
- **深度优先**：两段队列（`skills` / `.agents` / `.claude` / `.codex` / `.cursor` 先走），一条分支走完再走兄弟。
  先写成先入先出时，200 个 `pkg*` 兄弟目录会把预算吃光，`.agents/skills/<name>` 反而够不着。
- 遍历只做目录枚举，**字节到导入时才读**；导入前先按 `file.size` 求和，超过 `maxImportBytes`（64 MiB）报错。
- `AbortSignal` 贯穿整条链：重新选择、关闭弹窗、组件卸载都会取消（新一次拾取先 abort 上一次）。
- 兜底 `<input webkitdirectory>` 路径同样先丢噪声、把技能目录提前，再按预算切片。

**验证**

- 合成 200×300 = 60_000 文件：103 ms 完成，主线程最大卡顿 **0 ms**，显示截断提示，技能仍然找到。
- `check-package.ts` 新增断言：条目预算与 `truncated`、遍历期间不打开任何文件、`.agents` 先于兄弟目录、abort 生效。

### 修复：两个页签的已选互相串（2026-10-08，用户："本地导入的没有 skill 的那个 tag，跑到下载里面去了"）

Local 与 Download 原本共用一个 `picked`，切页签时上一页的已选跟着过来 —— 下载页签会把本地挑的技能当成 chip。

**改法**：`folderPicked` / `packagePicked` 两份状态，当前页签按 `tab === "local" ? folderPicked : packagePicked` 取；
两页各自保留（切回来还在），关闭弹窗一起清空。

**验证**：本地挑两个 → 切到下载：chip 行为空、`Import` 仍禁用且列表没被预勾选；切回本地 chip 还在。

### 修复：本地页签的已选也显示 chip（2026-10-08，用户："本地已选择的也需要这个组件"）

把下载页签里的 chip 行提成两个页签共用的 `PickedChips`（21 高胶囊 + `×` 移除，空则不渲染），
本地页签放在拖拽区与分隔线之间（`pt-2`）。

**验证**：两页签 chip 的 DOM 与样式完全一致（h 21、胶囊圆角、`bg-muted`、JetBrains Mono 11.5px、左右内边距 8px），
点 `×` 取消该行的勾选并回到按钮禁用态；`check-package.ts`、typecheck、lint 全绿。
画布 `DzRqf` 同步加了 `Picked Chips` 行（弹窗 623 → 660）。

### 修复：已选 chip 区限高、超出可滚动（2026-10-08，用户："这里我也需要有一个最大高度，然后有滚动条"）

`PickedChips` 容器加 `max-h-[68px] overflow-y-auto pr-1.5`：68px = 两行完整（21 + 6 + 21）再加第三行的 2/3，
看得出下面还有；`pr-1.5` 给经典滚动条留位，不压住胶囊。

**验证**：浏览器（本地页签 12 个技能全选）—— `clientHeight 68 / scrollHeight 75`，三行胶囊 top = 0 / 27 / 54，
滚到底（`scrollTop 7.2`）第三行完整可见，弹窗总高从 636 到 650 后不再增长。

**画布没改**：设计稿上这一行只有一颗胶囊，限高是"多选时才出现"的运行时行为，静态画板表达不了。

### 设计稿：删除 skill（2026-10-08，用户："skills 还差一个删除功能，先出 UI 设计稿"）

只改画布，未改代码 —— 先给用户看效果。技能库其实**已经有** `store.remove(id)`（删目录 + hub 为它保存的资源），
缺的只是入口和确认。

**入口**：详情灯箱（`L9tdZp`）的 Info Panel 底部多一行 `Delete skill`：整宽 36 高、透明底、
1px `#EF444459` 红描边、`delete` 垃圾桶图标 + 13/500 红字。它与上面 [View files][Uninstall] 那一行隔 16px，
读作"另一类动作"；Spacer 吸收 52px，面板总高不变（仍是 740）。

**确认**：沿用产品里唯一的确认样式 —— 锚在按钮上方的气泡（和"Discard this import?"同一套），
不做第二个模态（灯箱本身已是模态，再叠一层会变成双遮罩）。气泡 320 宽，左缘与按钮左缘对齐（948），
底边 842 = 按钮顶 854 上方 12px，小三角（12x12 旋转 45°）中心在底边下 6px —— 与 discard 气泡同一套关系。
内容 = 标题 `Delete pdf-extract?` + 说明"文件夹与 hub 存的资源都会被删除，无法撤销" + 等宽路径
`~/.context-hub/skills/pdf-extract`（把"删的是什么"落到具体路径）+ 按钮 `Cancel` / 红色 `Delete`。

**顺带定的图标语义（待用户确认）**：垃圾桶 = 删除。`Uninstall` 只是把技能关掉（清 `enabled`），
原来也用垃圾桶，于是同一面板里会出现两个一模一样的垃圾桶。已把 46 个 `Button Uninstall` 实例改成
`power`（卡片、列表、两处 Info Panel）。坑：`UI / Button` 实例里的图标是 **lucide**（`power`），
bespoke 画框是 **Material Symbols**（`power_settings_new`），写错会报 "not found in the 'lucide' icon set"。

**画布**：`eddWl` 扩到 14048，新板 `Context Hub — Skills — Delete skill`（`Km85R`）在 x=11049。
核对图 `designs/check-skills-delete/`（临时，不提交）。

**还等用户拍板的三件事**

1. 入口是否只放在详情灯箱？卡片/列表行也要（hover 垃圾桶 / 行内多一个按钮）会更快，但会与行内
   `Uninstall` 挤在一起。
2. 确认用气泡还是居中模态（删本地目录更重，模态更强调"不可撤销"，但会多一层遮罩与一个组件）。
3. 列表页的复选框目前是空的 —— 批量删除（勾选 → 删除选中）要不要一起做。

### 设计稿：工作区 Workspace（2026-10-08，用户："我们还没有工作区的概念…先做一版设计稿"）

只改画布，未改代码。**产品模型按用户澄清定**：工作区**就是一个文件夹**；「创建工作区」**直接打开系统
文件夹选择器**（不做中间弹窗）。触发处是侧栏头部那颗 240x48 的工作区按钮。

**新模块** `Module / Workspace`（`FV4gn`，y=10144，宽 1440）一块板 `Context Hub — Workspace — Switcher`（`Q77h8P`）：

- 菜单面板 `Workspace Menu`（`ucsk7`，300x245 @264,8，绝对定位；`$dialog` + `$glass-border` + blur 24 +
  0/8/24 阴影，与 discard 气泡同一套）。位置按用户给的参考图：面板在**侧栏右侧**、顶边与按钮顶边齐平。
  结构 = `Workspaces` 标题行 → 3 行工作区（44 高）：**28px 方磁贴里一律是 `folder` 图标**（当前行实心主色 +
  淡紫底 + 右侧 `check`，其余描边）→ **第一行文件夹名、第二行等宽路径** → 分隔行 → `+ Create workspace` 行。
- 侧栏头部按钮（组件级，全屏生效）：**第一行仍是应用名 `Context Hub`，第二行改成当前工作区的文件夹名
  `dsh-context-hub`**（12px sans，不是路径；路径只在菜单行里出现）；磁贴仍是应用品牌图标。

**第一轮改过的地方**（用户 2026-10-08 反馈）：删掉两块 Create 弹窗板（改为直接调选择器）、
去掉行右侧的 `⌘2`/`⌘3` 快捷键、把首字母磁贴/品牌图标统一换成文件夹图标。
**第二轮**：头部主行恢复 `Context Hub`，副行从等宽路径改回文件名。

**核对**：菜单 264,8 300x245，顶边与按钮顶边齐平、在侧栏右侧；除 blob 出血外无告警；裁剪复核确认
头部第二行与菜单当前行的名称一致、无截断。
坑：① 屏幕根是 flex 容器，插入的浮层必须 `layoutPosition:"absolute"`，否则 x/y 被忽略（有明确告警）；
② 触发器展开态用 `$accent`（80% 白）在侧栏玻璃上几乎看不出，改 `$muted`；
③ 删除 dialog 板后同步把模块宽 4560 收回 1440（模块宽 = n*1440 + (n-1)*120）；
④ 用 helper 生成行时**别从节点名推导显示文案**（`name.replace("Row ","")` 让当前行显示成了 "Current"）。

**还等用户拍板**

1. 侧栏头部那颗磁贴现在还是应用品牌图标（紫色方块 + `waypoints`）——要不要也统一成文件夹图标？
2. 工作区数据落在哪：文件夹里的 `.context-hub/`，还是 hub home 下按路径归档？
3. 菜单里除了「切换 / 新建」，要不要「管理（重命名、移除）」以及行内 hover 操作；要不要出中文画板。

### 落地：工作区切换与「从文件夹创建工作区」（2026-10-08，用户："根据设计稿还原功能"）

**契约（`packages/core/src/workspace.ts`，浏览器与宿主共用的纯模块）**
`WORKSPACE_ROUTE` / `WORKSPACE_DOCUMENT`（= `workspaces`）/ `WorkspaceView{path,name,display}` /
`WorkspacePage{folders,current}` / `WorkspaceStore{page,select,pick}` / `workspaceName()` / `readWorkspaceState()`。
**工作区就是一个文件夹**，所以名称取路径最后一段、显示路径取宿主 `displayPath()`（`~` 缩写）——两者都由宿主算，
浏览器不解析路径（`displayPath` 在 `node:os` 模块里，前端拿不到 home）。

**宿主（`packages/core/src/host/`）**
- `folder-picker.ts`：原生目录对话框。Windows 用 PowerShell + WinForms `FolderBrowserDialog`，脚本以
  **base64 UTF-16LE（`-EncodedCommand`）** 传入 —— 提示文案是本地化文本、可能带引号，这样它永远不进命令行解析；
  macOS 用 `osascript`（`try/on error` 把取消变成空串），Linux 用 `zenity`（取消 = 退出码 1）。
  取消 = 空输出，真失败才抛错（stderr 冒泡成 HTTP 400 里的原因）。
- `workspaces-fs.ts`：读写 `<home>/state/workspaces.json`（复用 `createFsStateStore` + `readWorkspaceState` 校验），
  `select` 拒绝不认识的路由（400 + 原因），`pick` 取消时不写盘、成功时追加（已存在则只切换）+ 设为当前。
- `vite.ts` 新增 `workspaceList()` 桥：`GET /hub/workspaces`、`POST …/select`、`POST …/pick`（pick 会一直挂到
  对话框关闭为止）。`package.json` 补 `./workspace` 与两个 `./host/*` 出口。

**应用（`apps/web/`）**
- `lib/workspaces.ts`：`useWorkspaces()`（fetch 列表 + select + pick，带 `pending`/`failure`）。
- `components/workspace-menu.tsx`：侧栏头部按钮 = Popover 触发器（`side="right" align="start" sideOffset={8}`，
  面板 300 宽、`gap-0.5 p-2`），行 = 28px 文件夹磁贴 + 文件夹名 + 等宽路径，当前行淡紫底 + 勾；
  分隔行（13 高）+ `创建工作区` 行；失败原文显示在面板底部。`app-sidebar.tsx` 的 header 换成它，
  头部第二行 = 当前工作区名（没有则 `workspace.none`）。
- 文案：en 基础包 + zh 包各 5 个键（`workspace.menu.title/create/creating/none/picker.prompt`）。

**顺带修的**：`state-fs.ts` 读文档时先剥 BOM —— Windows 编辑器写的状态文件带 BOM，`JSON.parse` 会直接失败，
原先整份文档报 "not JSON"（本次用 PS 写验证数据时真的踩到）。

**验证**
- 新增 `packages/core/scripts/check-workspaces.ts`（18 项）：空 home / 行名与路径 / `~` 缩写 / 选择落盘并跨实例可见 /
  未知路径被拒且不改状态 / 手改文档非法值被丢弃。`node scripts/check-workspaces.ts` → all checks passed。
- 桥接实测：`GET /hub/workspaces` 读盘正确；`POST …/select` 选未知路径 → 400 + `not a known workspace: …`。
- 浏览器（zh-CN，真实桥）：菜单面板 **300x245 @ (256, 8)**，行 44、磁贴 28x28 圆角 8、标题行 30、分隔行 13、
  padding 8、gap 2 —— 与画板逐项一致；当前行底 `primary/10`、磁贴 `#4F46E5`。
- 端到端：点行切换 → 侧栏第二行随即变化、`data-closed` 关闭；`workspaces.json` 的 `current` 同步改写。
- **文件夹对话框真机验证**：`POST …/pick` 确实弹出 Windows「浏览文件夹」窗口（枚举到 `#32770` 窗口，
  属主是本进程 spawn 的 powershell），用 `WM_CLOSE` 模拟取消 → 200 `{"cancelled":true,…}` 且状态文件未被改写。
- `check-state.ts` 回归通过；web/core/extensions typecheck + lint 干净；locale-zh-cn typecheck 干净。

**画板与实现的一处差异（有意）**：画板里"创建工作区"行点了直接弹对话框，实现里对话框弹出期间该行文字变
「等待选择文件夹…」且不可再点（避免叠两个对话框）。

### 修正：创建行撑满 + 改用浏览器自带的文件夹对话框（2026-10-08，用户反馈）

用户指出两件事：① 面板里「创建工作区」行只有 123 宽（图层面板实测），应撑满；② 打开文件夹的方式不对，
应该是**浏览器自己的目录对话框**（就是 Skills 导入用的那一个）。

**① 宽度**：原因是我把这一行包在 `<span>` 里（为了加 pending 的半透明），行是 flex item，外面套了 inline
容器后不再拉伸。改成把 `disabled` 直接给按钮（`disabled:pointer-events-none disabled:opacity-50`），
按钮加 `w-full`。实测 284 = 300 − 2×8，与其它行一致。

**② 对话框**：删掉宿主侧的 `host/folder-picker.ts`（PowerShell/osascript/zenity 那套）。
**目录对话框属于形态，不属于宿主**：页面自己调 `window.showDirectoryPicker()`（无该 API 的浏览器如实报错），
拿到文件夹后把**名字**交给 hub。契约随之改成 `WorkspaceFolder{name, path?}` + `folderId()`：
- `path` 是形态能给才有的字段 —— 浏览器出于隐私只给文件夹名，**不给绝对路径**，所以 web 形态下第二行没有
  路径可显示（`display: null`，行内只显示名字并垂直居中）；桌面/宿主形态能拿到路径时，第二行仍是 `~` 缩写路径。
- 身份 = `path ?? name`（存储的 `current` 存这个 id）；`add` 去重、`select` 拒绝未知 id。
- 桥接路由：`POST /hub/workspaces/add {name}` 取代原来的 `pick`。
- 文案键删掉 `workspace.creating` / `workspace.picker.prompt`（对话框文案由浏览器决定）。

**验证**：`check-workspaces.ts` 扩到 31 项（含"只有名字的文件夹没有路径行""重复 id 只留一条"）全过；
浏览器里用桩替换 `showDirectoryPicker` 走完整链路 —— 返回 `{name:'dsh-context-hub'}` → 行出现、当前行打勾、
侧栏第二行同步、`workspaces.json` 写入 `{"folders":[{"name":"dsh-context-hub"}],"current":"dsh-context-hub"}`；
桩改为抛 `AbortError`（取消）→ 不写盘、不报错、列表不变。core/web/extensions/locale 的类型检查与 lint 干净。

# 技能 × 工作区：功能对齐与链条设计（2026-10-08，讨论稿，**待用户拍板后实施**）

## 一、现状核对（结论都有代码依据）

| 模块 | 真实还是样例 | 依据 |
| --- | --- | --- |
| Workspaces | **真实**：`state/workspaces.json` + `/hub/workspaces` | `packages/core/src/workspace.ts` |
| Skills | **真实**：本地导入 + skill.sh 下载都落 `<home>/skills` | `host/skills-fs.ts` / `host/skills-cli.ts` |
| Overview / MCP / Plugins / Repository | **样例数据**，模块级常量，背后没有 store | `pages/*.tsx` 里 `const kpis` / `const servers` … |
| 顶栏 Connect repo / Sync repo | 无 `onClick` | `components/app-header.tsx` |
| Ctrl+K 调色板 | query 不过滤、列表写死 | `components/search-palette.tsx` |
| Activity / Policies / Settings | 落到 `PlaceholderPage` | `lib/navigation.ts` |

**技能四个页签的真实情况**（`SkillOrigin = local | builtin | registry`，`store.ts`）：

| 页签 | 谁写这个值 | 结果 |
| --- | --- | --- |
| 内置 `builtin` | **没有任何代码写它** | 永远 0 |
| 工作区 `local` | `readEntry` 的默认 `previous?.source ?? "local"` | 磁盘上所有技能都是它 |
| skill.sh `registry` | **没有任何代码写它**：下载先落 temp 再 `refreshCatalog()`，新目录被当成 `local` | 永远 0 |

用户截图 `全部 2 / 内置 0 / 工作区 2 / skill.sh 0` 不是巧合，是当前代码的唯一可能输出。

## 二、四个断点

1. **页签轴选错了**：它描述"来源"，可 store 只记录了三种来源里的一种，另外两种无人写入。
2. **「工作区」名不副实**：`local` 的含义是"被拷进 hub 自己的库"，与任何工作区目录无关。
3. **`enabled` 是全局的**：写在 `index.json` 的一行里，跟选中的工作区无关 —— 这就是"安装态是错的"。
4. **工作区自带的技能，hub 完全看不到**：技能模块不知道工作区存在（`useSkillLibrary` 只跟 `hub.skills` 说话）。

## 三、定稿模型：两个位置 + 链接安装

**两个位置**（技能只有这两个家）：

| 位置 | 内容 | 归属 |
| --- | --- | --- |
| Hub 库 `<home>/skills` | 货架：导入 / 下载的落点，唯一被 hub 管理的那份 | hub 拥有，可增删改 |
| 工作区 `<workspace>/.agents/skills` | 项目自带 + hub 安装进来的，跟 git 走 | 项目拥有 |

`.claude/skills` 这一版**不读也不写**：那是 Claude Code 插件的领地（已有 `target` 贡献点里
`hub.target.claude-code` 声明了 `Skills → ~/.claude/skills/<name>/SKILL.md`），项目级位置以后由它补。

**两个页签**（按"在哪"分，取代按"哪来的"分）：

- **全部** = Hub 库 + 当前工作区里的，合并列表；来自工作区的行带标记。
- **工作区** = 只看当前工作区 `.agents/skills` 里的；没选工作区时是空态提示。

**只有两个动作，都只碰同一条链**：

| 动作 | 方向 | 方式 | 触发 |
| --- | --- | --- | --- |
| 安装到工作区 | 库 → 工作区 | **建链接** `<workspace>/.agents/skills/<id>` → `<home>/skills/<id>` | 行上的按钮 |
| 从工作区移除 | 删链接 | 只删自己建的链接，`lstat` 先判类型 | 行上的按钮 |

工作区 → 库**不复制**（只读投影）：项目拥有它、git 是真相，拷进库就变成两个真相。
"收进库"（fork / 收藏）留到 v2，只做单行显式动作。

**链接就是安装记录**（"怎么看出是 Context Hub 装的"，按 host 侧 `lstat` 判定）：

| 条目 | 判定 | 显示 | 动作 |
| --- | --- | --- | --- |
| 链接，目标在 `<home>/skills/<id>` 且存在 | 通过 Context Hub 安装 | 已安装 | 从工作区移除 |
| 链接，目标在 `<home>/skills/<id>` 但已不存在 | 断链 | 已失效 | 清理 |
| 链接指向别处 / 真目录 | 工作区自带 | 只读 | — |
| 无条目 | 未安装 | — | 安装到工作区 |

零状态：不需要同步记录、哈希账本、全局 `enabled` —— **文件系统就是记录**，外部工具也看得见。

**本机实测（2026-10-08，Windows + Node 24）**：

- `junction` 建链与穿透读全部正常；`lstat().isSymbolicLink()` = **true**、`readlink` 返回绝对路径 →
  判定代码与 POSIX 统一，不需要分平台分支；
- `symlink(…, "dir")` 在这台机器报 **EPERM**（开发者模式未开），junction 却成功 → **Windows 用 junction，免提权**；
- **悬空 junction 可以建出来** → 断链状态必须处理。
- 代价（如实）：链接**不能随 git 分发** —— Windows `core.symlinks=false` 会把它落成 17 字节的文本文件
  （DSH 仓库里 `.claude/skills` 实测如此）。安装处文案写明"仅本机"；要提交的场景留一个
  "复制到工作区"作为后续次要动作。

**跨平台核查（2026-10-08 追加；本机无 WSL，macOS/Linux 一列为 OS 既定语义）**：

| | Windows | macOS / Linux |
| --- | --- | --- |
| 建目录链接 | `junction`，免提权 | `symlink(target, path)`，**无需提权**，`type` 参数被忽略 |
| 判定 | `lstat().isSymbolicLink()` = true | 同左 |
| 删除 | `fs.rm(link, {force:true})` 实测 OK | `unlink` / `rm` 删链接本身；**`rmdir` 会 ENOTDIR** |
| 跨卷 | junction 限本机本地卷 | 任意 |

- **失败面在文件系统，不在操作系统**：FAT/exFAT 不支持链接（macOS/Linux 直接 ENOTSUP）、
  网络共享（macOS 挂 SMB 需 `mfsymlinks`，Windows 共享里建 junction 一般失败）、
  云同步目录可能破坏链接 → 安装动作要有**降级链：链接失败 → 复制**，并如实说明
  "已复制，此后归工作区所有，hub 不再跟踪它"（真实目录从 `lstat` 看不出是谁装的）。
- 实测安全项：`fs.rm(link, {recursive:true})` **不会**穿透链接删库（库与 `SKILL.md` 完好）；
  仍统一发不带 `recursive` 的形式，少一个参数少一个风险。
- 同步结论：链接指向用户机器上的绝对路径，**任何平台都不该提交**（macOS/Linux 上 git 能存 mode 120000，
  Windows 会落成文本文件）——与"仅本机"的定位一致，不构成跨平台障碍。

**同步的触发**（没有需要触发的"同步"，只有刷新）：切工作区 → 重列；`fs.watch` 监听
`<workspace>/.agents/skills` 变更即刷新（技能库已有先例）；安装/移除后同一次刷新。

## 四、定稿（2026-10-08 用户拍板）

- [x] 工作区技能**只读不复制**，不做自动收编
- [x] 安装方向**库 → 工作区**，方式**链接**（junction / dir symlink），不复制
- [x] 目标统一 `<workspace>/.agents/skills`；`.claude` 留给 Claude Code 插件

## 五、分期计划（1–5 已实现，2026-10-08）

- [x] 1. Host 目录能力：桥新增 `GET /hub/fs/list?path=`（宿主 `readdir` + `lstat`，返回 `path / display /
      parent / crumbs / entries[{name, path, link?}]`，上限 2000 条），工作区身份从"文件夹名"升级为
      host 给出的**绝对路径**（`WorkspaceView.path`；`add(path)` 先验证目录存在，拒绝时明说 "not a folder"）
- [x] 2. 应用内目录浏览器（替换 `showDirectoryPicker`，`apps/web/src/lib/folder-picker.ts` 已删）：
      `components/folder-picker-dialog.tsx` = 面包屑 + 逐层 + 上级行 + 底部当前路径；每次打开都从 home 开始
      （按 `open` 挂载内层组件，不用重置 effect）；新建文件夹**未做**（见"遗留"）
- [x] 3. 技能页两页签（全部 / 工作区）+ 工作区只读投影：`SkillStore.workspaceSkills()` 读
      `<workspace>/.agents/skills`（宿主侧 `host/workspace-skills.ts`），页签计数与筛选移到客户端
- [x] 4. 安装 / 移除 = 建链 / 删链（`installToWorkspace` / `removeFromWorkspace`）+ 三态判定与文案；
      `enabled` 退出界面（仍是库内记录，UI 不再读它）
- [x] 5. 验证：新增 `packages/plugin-skills/scripts/check-workspace-skills.ts`（30 项，含 junction 判定、
      断链、同名拒装、越界名字拒装、库外技能拒删）；`check-workspaces.ts` 重写到 33 项（含列目录）；
      `check-store.ts` / `check-state.ts` 无回归；浏览器实测见下

## 分页控件上移为共享组件，MCP 接上真分页（2026-10-12）

用户："把这个分页组件也封装成公用组件，然后提供给MCP使用。现在MCP的分页组件使用不了"

- `TablePagination` 从 `packages/ui/src/components/table-pagination.tsx` 移到
  `packages/extensions/src/components/pagination.tsx`，从 barrel `@workspace/extensions/components` 一处导入
  （与 PlacePicker / TagEditor / FilterBar / DialogSplit / PageBody 同一套路），旧文件删除；
  三处调用点（skills 页、shell 的 overview / plugins）改从 barrel 导入。
- MCP 页脚原本是一份**手写的假分页**（硬编码 "12"、永远是 "1 / 1"、四个按钮没有 `onClick`），
  现在换成共享控件并接上真分页：`page` / `pageSize` 状态、`pageCount` 与钳制后的 `shownPage`、
  `rows = visible.slice(...)` 交给列表与卡片两个视图共用；页签 / 范围 / 搜索 / 类型变化时 `setPage(0)`；
  表头全选只覆盖当前页；页脚左侧计数仍是全量声明数与上次检查时间。
- 死键清理：假分页四个按钮的 aria-label `mcp.footer.first|previous|next|last` 已从 en 与 zh 删除。
- 验证：extensions / plugin-skills / plugin-mcp / web 四个包 `tsc --noEmit` 与 lint 全绿，
  `check-messages.ts` 423/423。浏览器里 skills 页脚仍是 `显示 12 / 19 · 1 / 2`；MCP 页把 `pageSize`
  临时设为 2 → `1 / 2`（钉钉两条）→ 点下一页 → `2 / 2`（context7 / playwright），切到列表视图也只渲染
  该页 2 行，按钮禁用状态随页码翻转；改回 12 后 `1 / 1`，Console 0 error。

## 表格上移为共享 Ledger，MCP 列表改用同一张表（2026-10-12）

用户："把这个表格组件也封装成公用的组件，现在MCP的表格组件和功能稍微差很多"

- 新增 `packages/extensions/src/components/ledger.tsx`（barrel 导出 `Ledger` / `LedgerColumn` / `LedgerBatch`）：
  卡片外壳 + 批量条 + `table-fixed` 表格 + 表头（第一列是全选框、部分选中显示短横）+ 66px 行
  （hover / focus-visible 底色、选中底色、Enter/Space 开详情、末行无分隔线）+ 首列 20px / 中间 14px / 末列 14+20 的单元格内边距。
  列宽一律是**份额**（`width: "43.1%"`），列的内容由调用方给 `cell`；不带 `cell` 的那一列就是勾选列（组件自己画）。
  批量条**常显**（技能页原有理由：动作要看得见、且条子进出会把行顶到指针下面），条内的动作是调用方给的节点。
- 技能页：`SkillTable` 的整段表格换成 `Ledger`，`BulkBar` 瘦成只产"安装到"菜单的 `BatchInstall`，
  模块级 `columns` 常量与 `Card`/`Checkbox`/`Table*` 导入一并删除（契约现在由控件持有）。
- MCP：`list-view.tsx` 整份重写成 `Ledger` + 六个 `cell`，列宽取画布 32/338/136/150/128/244 的份额
  （3.1/32.9/13.2/14.6/12.5/23.7%）。因此 MCP 列表**补齐**了技能页有的东西：行 hover / 键盘可达、
  常显批量条、表头 44px、末行无分隔线、勾选行底色；**失去**了原来 690px 固定高 + 内部横竖滚动
  （现在与卡片视图、技能页一致：卡片随内容长，整页滚动）。`page.tsx` 的 `toggle`/`toggleAll` 删除，
  选择改为控件回报整个数组（`onCheck={(keys) => setSelected(new Set(keys))}`）；
  `InstallToMenu` 加 `disabled`（批量条里没勾选时不可点）；新增键 `mcp.column.selectAll`（中英各一条）。
- 顺手修掉 `list-view.tsx` 里一处被编辑毁掉的类名 —— `className="flex min-w-0 itemicon={server.check?.icon} s-center gap-4"`
  （那段文本整个是 class 名，所以 tsc/eslint 都不报；重写后消失）。
- 验证：extensions / plugin-skills / plugin-mcp / web `tsc --noEmit` 与 lint 全绿，`check-messages.ts` 424/424。
  浏览器（zh-CN）：MCP 列表 4 行 × 66px、表头 6 列 36/386/155/171/147/278（1172 容器）、表头可全选、
  勾一行 → 条子"已选 1" + 行底色 #f7f7f7 + 安装到可点，取消 → 恢复且安装到禁用；焦点在第 2 行按 Enter
  打开详情（新能力）；技能列表 12 行 × 66px、六列标签与内边距仍为 20/14…/14+20、页脚"显示 12 / 19 · 1 / 2"不变；Console 0 error。
- 遗留差异：技能页与 MCP 的行内容本身不同（缩略图 vs 瓦片、来源行 vs 位置胶囊），那是各自的数据；
  表头/行的**结构、内边距、行高、交互**现已同一份代码。

# 添加服务器表单：必填校验 + 注释/类型字段 + 占位符 + 去掉 stdio 默认值（2026-10-12，用户报告）

## 目标（用户原话）

"1、添加服务器的时候表单没有校验这个功能，有些东西是必填的，你得校验啊；
2、添加 MCP 的时候，最好把 MCP 的那个注释和 MCP 的那个添加类型那个组件也加上；
3、有些输入框是没有那个输入框注释的，还有传输方式的 stdio 命令和参数有默认值、需要移除掉。"

## 执行顺序

- [x] 1. `server-form.tsx`：新增 `formErrors(values, t)`（名称必填；stdio 命令必填；远端 URL 必填），
      `Field` 支持 `invalid`，三个字段渲染红色错误行；名称/命令/URL 补占位符（示例值照设计稿）
- [x] 2. `server-form.tsx`：新增可选 `record` / `onRecord` / `tagSuggestions`，有记录字段时渲染
      「描述（可选）」+「类型（可选）」TagEditor（与详情面板同一组件、同一批文案）
- [x] 3. `add-server-dialog.tsx`：`NEW_SERVER` 去掉 `npx` / `-y @modelcontextprotocol/server-filesystem .`
      默认值；提交与测试连接先校验、错误落在字段上；`onSubmit` 带上 description / tags
- [x] 4. `server-dialog.tsx`：保存同样先校验（共用同一个 `formErrors`），错误传给 `ServerForm`
- [x] 5. `page.tsx`：把 `serverTags` 作为类型建议传给添加弹窗；保存名称做 trim
- [x] 6. 文案：`mcp.add.description` / `tags` / 三个占位符 / 三条错误（en + zh-cn）
- [x] 7. 验证：`pnpm -r typecheck` 10/10、`pnpm -r lint` 干净、`check-messages` 417/417，
      临时实例（5199）走查四种路径（空名称 / 空命令 / 空 URL / 正常添加 + 保存 trim）

## 用户追加的两条

- [x] 「这些表单都放在传输方式的下面」：描述 / 类型从「名称」下方移到「传输方式」下方
- [x] 「这里使用 textarea 组件」：描述改用 `@workspace/ui/components/textarea`
      （`min-h-[72px]`、透明底、12px 圆角与同排字段一致、`field-sizing-content` 自动增高）

## 验证记录（临时实例 5199，未动用户 5173）

- 空提交 → 名称 + 命令两行红字、两个 `aria-invalid`；切 http 后 → 只剩 URL 一条
- 正常添加一台 `zz-verify-form`（description + 类型「验证」）→ 打开详情面板确认描述与类型落库，
  连接探测通过（就绪；且回填 url 是 context7 自己的 mcp 端点）
- 详情「配置」页清空名称 → 保存被拦，红字「名称不能为空。」；名称补回带尾空格保存 → 已保存，
  名称被 trim（卡片标题无尾空格）
- 结束后删除这台记录：服务器数回到 4，「验证」类型从筛选行消失

**坑**：临时实例首次打开报 500 —— `apps/web/src/lib/hub.ts` 新引入的 `@workspace/agent-*`
在 dev server 启动时还不存在，Vite 的依赖图谱过期；`node_modules` 里链接其实已就位
（`apps/web/node_modules/@workspace/agent-*`），**重启 dev server** 即恢复，与本次改动无关。

**浏览器实测（zh-CN，真实桥，Windows junction）**：侧栏菜单 →`创建工作区`→ 选文件夹对话框（560 宽，
面包屑 `~ / AppData / Local / Temp / hub-demo / project`，底部等宽当前路径）→ `选择此文件夹` →
侧栏第二行变 `project`、页签 `全部 3 / 工作区 2`、列表混排（`grilling` 工作区/移除、`grill-me` 技能库/安装、
`notes-writer` 工作区/无动作）→ 点 `安装` 后磁盘出现
`<ws>\.agents\skills\grilling → ~\.context-hub\skills\grilling`（Junction，免提权）、按钮变 `移除`、
页签变 `工作区 2`；点 `移除` → 链接消失、库完好、页签回到 1。灯箱同一套语义（`位置` 行 + `安装`/`移除`）。
截图：`designs/check-web/skills-workspace-all.png`、`designs/check-web/workspace-folder-picker.png`。

**本轮改到的文件**：`packages/core`（`src/fs-browse.ts`、`src/host/fs-browse.ts`、`src/workspace.ts`、
`src/host/workspaces-fs.ts`、`vite.ts`、`package.json`、`scripts/check-workspaces.ts`）、
`packages/plugin-skills`（`src/host/workspace-skills.ts`、`src/host/skills-fs.ts`、`src/store.ts`、
`src/remote-store.ts`、`src/library.ts`、`src/types.ts`、`src/page.tsx`、`src/skill-detail-dialog.tsx`、
`src/messages.ts`、`vite.ts`、`scripts/check-workspace-skills.ts`）、
`apps/web`（`src/lib/fs.ts`、`src/lib/workspaces.ts`、`src/lib/hub.ts`、`src/components/folder-picker-dialog.tsx`、
`src/components/workspace-menu.tsx`、`vite.config.ts`，删 `src/lib/folder-picker.ts`）、
`packages/extensions`（`src/builtin/locale-en.ts`）、`packages/locale-zh-cn`（`src/messages.ts`）。

**遗留（本轮明确没做）**：
- 目录浏览器没有"新建文件夹"；没有手动刷新工作区技能（只有切工作区 / 装完后重读）
- 没有"移除工作区"（菜单只能加和切）；`~/.context-hub/state/workspaces.json` 里旧的无路径条目不显示技能，
  工作区页签会提示"没有可读取的文件夹路径"——重新添加一次即可换成带路径的条目
- 工作区技能**变化不推送**：外部 `git pull` 或手改 `.agents/skills` 后需要切一次工作区/刷新页面
- "库 → 工作区"只有链接一种；FAT/网络盘会降级为复制并提示（本机未触发，代码路径在
  `installSkillIntoWorkspace` 的 `LINK_UNSUPPORTED` 分支）
- 6. 其他模块对齐（另开）：Overview/MCP/Plugins/Repository 接真实 store、顶栏两个按钮、Ctrl+K 过滤

### 修正：宿主自己就是工作区，不需要选（2026-10-08，用户反馈）

**用户的问题**：切到 `dsh-context-hub` 工作区时，装不了、也看不到这个工作区的 skills。
**表面原因**：那条工作区是**旧版**留下的，只有名字没有路径 —— 旧版用浏览器 `showDirectoryPicker`，
浏览器只肯给文件夹名，所以库里存不下路径；没有路径就读不到 `<ws>/.agents/skills`。
**用户的要求**：「不需要选，默认就是扫描当前工作区的 .agents」。

**做法**：不再让用户为这件事挑文件夹（先写的"点这条行 → 选文件夹重新绑定"那套已全部撤掉），
改成**宿主自己所在的文件夹就是一个工作区**：

- `packages/core/src/host/fs-browse.ts` 新增 `projectRoot(folder)`（向上找到最近的 `.git`，找不到就用自己）
  与 `hostFolder()`（= `projectRoot(process.cwd())`）。dev server 起在 `apps/web`，向上就是仓库根。
- `createFsWorkspaceStore(home, { folder })`：读列表时把**宿主的文件夹**并进工作区列表 ——
  已经有指向它的行就什么都不做；有**同名但无路径**的行就让它**原地**取到路径（旧数据自动治好，
  位置不变、current 跟着改成新 id）；都没有就追加进来；列表本来没选工作区时它成为当前。只做一次，写入后即固化。
- `workspaceList()` / `skillLibrary()` 两个桥都传 `folder: options.folder ?? await hostFolder()`；
  `createFsSkillStore` 增加 `folder` 并透传给它的工作区 store，两处读到的是同一个文件夹。
- 菜单里那条 `workspace.noPath` 提示与点击重新绑定一并删除（回退），创建流程仍是"创建 → 打开选择器"。

**验证**（浏览器 + 磁盘，真实桥）：
- `GET /hub/workspaces` → `dsh-context-hub` 自动带上 `path: D:\work-space\dsh-context-hub` 且为当前；
  `deepseek-harness`（宿主不叫这个名）保持无路径不动。
- `GET /hub/skills?action=workspace` → 读到仓库 `.agents/skills` 的 3 个技能（grill-me / grilling / shadcn-ui）。
- 页面：页签 `全部 5 / 工作区 3`；`install-me` 点安装 → 磁盘出现
  `.agents\skills\install-me → ~\.context-hub\skills\install-me` 的 Junction、页签变 4、按钮变"移除"；
  点移除 → 链接消失、仓库自带技能与库都未受影响。
- 顺带修掉一个合并缺陷：工作区**自带**的 `grill-me` 与库里同名时，原先被当成"已安装"而**从工作区页签消失**；
  现在按"位置"分，工作区自带的同名技能单独成行，库里的那条安装按钮置灰并提示「工作区里已经有同名技能。」
  （`Skill.taken`）；行 key 与灯箱都用 `skillKey()`（location + id），同名两张卡不再撞 key。
- `check-workspaces.ts` 增至 45 项（含 projectRoot / 收养 / 旧行原地治愈 / 宿主不匹配不动）；
  `check-workspace-skills.ts`、`check-store.ts`、`check-state.ts` 无回归；五个包 typecheck + lint 全绿。

### 修正：工作区技能显示的是编造内容（2026-10-08，用户发现）

**用户的发现**：灯箱「文件」面板里的内容和 `D:\work-space\dsh-context-hub\.agents\skills\grill-me` 对不上。

**根因**：`useFileRows`（`skill-detail-dialog.tsx`）在 `detail === null` 时**回落到内置示例** ——
一棵假文件树（`skill/`、`reference.md`、`examples/basic.md`、`scripts/extract.py`）加一段模板正文
（`## Steps` / `## Guardrails`）。而 `detail` 来自 `store.get(id)`，那只认**hub 库**；
工作区自带的技能不在库里，`get()` 抛错 → 一路按"没有记录"渲染，于是把示例当内容画了出来。

**修法**：让工作区技能从它所在的目录读出**真实内容**。
- `host/file-tree.ts`（新）：`walkSkillDir(dir)` —— 原来的 `walk` 从 `skills-fs.ts` 提出来共用
  （`skills-fs.ts` 与 `workspace-skills.ts` 都要走文件树，放在任一边都会形成循环依赖）。
- `host/workspace-skills.ts`：`readWorkspaceSkill(workspace, id)` → 读 `SKILL.md` **原文**（保留
  frontmatter，`disable-model-invocation` 这类字段不再被丢掉）+ `files`。
- 契约 `WorkspaceSkillDetail`；`SkillStore.workspaceSkill(id)`；桥 `GET /hub/skills?action=workspace-skill&id=…`。
- 灯箱：工作区行（`location === "workspace"`）改读这条记录；`useFileRows` 的示例回落**只在完全没有库的形态**
  （`store === null`，即样例数据）下生效；库里问不到的空结果现在是空面板，不再编内容。
- 顺带：`stale`/工作区行不再向库发 `get()`（那一发必然 400，控制台留噪）；「删除技能」不再对工作区行显示
  （库删不掉它不持有的技能）；`updated` 为空的行不再显示「更新于」空值，改显示「读取自这个工作区」。

**验证**：`GET …action=workspace-skill&id=grill-me` 返回真实 `SKILL.md` 原文 +
`agents/`、`agents/openai.yaml`、`SKILL.md` 三个条目；浏览器里工作区页签打开 `grill-me`：文件树与磁盘一致、
正文含 `disable-model-invocation: true` 与 `Call the Skill tool with "grilling".`、**没有** Steps/Guardrails/extract.py、
按钮只剩「查看文件」、控制台零报错。核对图 `designs/check-web/skills-workspace-files-real.png`。
`check-workspace-skills.ts` 增 7 项（读原文 / 文件树 / 不存在返回 null / 越界名字被拒）共 37 项全过。

### 改版：来源行取代灰色胶囊（2026-10-08，用户要求"改成截图那样、放左下角"）

用户给了两张参考小图：`[图标] skills.sh · Basic`、`[图标] local · Basic` —— 灰色小图标 + 灰字 + 中点 +
**琥珀色加粗**的词。要求照这个样式替换卡片里那个灰色胶囊，并放到左下角。

**新增 `src/provenance-line.tsx` → `ProvenanceLine`**：`[图标] 来源 · 位置`，位置用琥珀
（`text-amber-600 dark:text-amber-400`），其余 `muted-foreground`；12.5px，图标 3.5。图标按来源取
（`local`=hard-drive、`registry`=store、`builtin`=package）。三处共用：卡片左下、列表「位置」列、灯箱标题下。

- 卡片重排：标题行 = 名称 + 年龄（灰色 11px，无记录则不显示）；底部 = `ProvenanceLine`（左）+ 动作按钮（右）。
  `skillMeta`（tokens/triggers 文本）与 `LocationBadge` 删除；Token 数 / 触发次数 仍由列表列与灯箱 MetaRow 承担。
- `Skill` 重新带上 `source`（`SkillSource`），`sourceLabel()` 恢复（`skills.source.local|registry|builtin`）。
- **顺带修一个真 bug**：下载来的技能一直被记成 `local`，所以 `registry` 永远显示不出来 ——
  `installPackage` 现在把落地的技能标记为 `registry`，来源行才说了实话。
- 灯箱里的 `位置` MetaRow 删除（来源行已经说了），`skills.detail.location` 键删除；
  工作区行的 "读取自这个工作区" 也删除（与来源行重复）。
- 样例数据（无宿主的形态）补 `SAMPLE_ORIGINS`，让演示仍保留四种来源的差别。

**验证**：`本地 · 工作区` 实测宽 98px、高 15px；琥珀色浅色 `oklch(0.666 0.179 58.318)`、深色
`oklch(0.828 0.189 84.429)`；卡片 / 列表 / 灯箱三处样式一致，深色可读。
截图 `designs/check-web/{skills-provenance-line,provenance-line-zoom,skills-provenance-list,skills-provenance-dark}.png`。
四个检查脚本全过，plugin-skills / locale-zh-cn / web 的 tsc 与 eslint 全绿。

### 改版：工作区菜单只显示文件夹名（2026-10-08，用户要求）

用户明确：**工作区这一块只显示文件夹名称**，不要再显示那行等宽路径（`D:\work-space\dsh-context-hub`）。

`workspace-menu.tsx` 的 `MenuRow` 去掉路径行：行内只有图标 + 文件夹名，行高仍 44（内容单行，
文字列 `justify-center`）；路径改为按钮的 `title`（悬停才出现，不占视觉）。选择、创建流程不变。

验证：菜单面板仍 300x245，四行各 44 高、单行；`dsh-context-hub` / `project` 的 `title` 是各自真实路径，
`deepseek-harness`（无路径）没有 title。`apps/web` tsc + eslint 干净。
截图 `designs/check-web/workspace-menu-panel.png`。

### 新功能：把工作区技能收进技能库（2026-10-08，用户要求）

用户：「工作区的 skill，我需要也能同步到我的 Context Hub 里面」。

之前只做了 **库 → 工作区**（安装 = 建链接），**工作区 → 库**被按"只读不复制"砍掉了；这次补上**手动**反向：

- `host/workspace-skills.ts` 新增 `importSkillFromWorkspace(workspace, libraryRoot, id)`：
  把 `<ws>/.agents/skills/<id>` **复制**进 `<home>/skills/<id>`（`fs.cp`，`dereference: true` ——
  库里的副本必须自洽，不能带着指回工作区的链接），失败清理目标。**工作区保留自己那份**：
  那是项目的目录，项目才读它，库拿的是副本。
- 库中已有同名 → 拒绝（`a skill with this name is already in the library`）：库那份可能被人编辑过，不能悄悄覆盖。
- 契约 `SkillStore.importFromWorkspace(id)`；桥 `POST /hub/skills?action=import-workspace {id}`；
  `SkillLibrary.adopt(id)`（写完 reload）。
- UI：工作区自带的技能（`location === "workspace"`）行上出现「加入技能库」（`LibraryIcon`，outline）；
  灯箱同一动作。库里已有同名时该行动作**消失**（`Skill.inLibrary`，由已加载的库列表推导），
  避免重复导入的无效点击。成功后在列表上方显示「已把 X 复制进技能库；工作区仍保留自己那份。」

**验证**（真机）：工作区页签三个技能各出现「加入技能库」；点 `grill-me` → 库中出现
`skills\grill-me\{SKILL.md 164, agents\openai.yaml 142}`（与源逐字节同尺寸）、工作区原目录未变、
该行按钮消失、其它两行仍在、顶部提示正确；页签 `全部 4 → 6`（库 +1，工作区那行也变成"两处都有"的独立行）。
`check-workspace-skills.ts` 增 6 项（复制成功 / 工作区保留 / 同名拒绝 / 源不存在拒绝 / `..` 名字拒绝 /
不留残留目录）共 43 项全过；其余脚本无回归；四个包 tsc + eslint 全绿。
截图 `designs/check-web/skills-workspace-adopt.png`。**测试产生的库副本已删除，用户状态已还原。**

### 修正：工作区技能也能删除（2026-10-08，用户反馈）

用户：「工作区的 skill 也是可以删除的呀，但是我发现是没有删除的按钮的」。是我上一轮把工作区行的
`onDelete` 直接置空（`skill.location === "workspace" ? null : …`）—— 当时只想到"库删不掉它不持有的技能"，
却漏了"它本来就该能从工作区里删掉"。

- `host/workspace-skills.ts` 新增 `deleteSkillFromWorkspace(workspace, id)`：删除
  `<ws>/.agents/skills/<id>` 整个目录（`fs.rm(recursive)`）；链接按条目删（不会穿到库）；
  目录里没有 `SKILL.md` 则拒绝（`not a skill in this workspace`），`assertSkillName` 挡住越界名字。
- 与既有的 `removeSkillFromWorkspace`（只回收 hub 自己建的链接）**分工明确**：一个是"移除我的链接"，
  一个是"删掉这个目录"，两者的确认气泡文案也不同。
- 契约 `SkillStore.deleteWorkspaceSkill(id)`；桥 `POST /hub/skills?action=delete-workspace {id}`；
  `SkillLibrary.deleteWorkspaceSkill(id)`。
- 灯箱：`onDelete` 按位置分派 —— 库行删库记录，工作区行删工作区目录；删除气泡里的**路径按位置取**
  （库行显示库路径，工作区行显示 `<ws>/.agents/skills/<id>`），文案也分两套
  （`skills.delete.text` / 新增 `skills.delete.workspaceText`）。

**验证**（真机）：在仓库里建临时技能 `zz-demo-delete` → 工作区页签打开 → 按钮为
「查看文件 / 加入技能库 / 删除技能」→ 点删除弹出气泡，标题「删除 zz-demo-delete？」、正文
「它在这个工作区里的文件夹会被删除，且无法撤销。」、路径 `D:/work-space/dsh-context-hub/.agents/skills/zz-demo-delete`
→ 确认后目录消失、灯箱关闭、页签回到 `工作区 3`、`.agents` 无 git 残留。另外三个技能未受影响。
`check-workspace-skills.ts` 增 5 项（删除目录 / 不存在拒绝 / 无 manifest 拒绝 / 被拒目录仍在 / `..` 拒绝）共 48 项全过；
其余脚本无回归；四个包 tsc + eslint 全绿。

### 修正：加入技能库改为**链接**，并且只有一行（2026-10-08，用户反馈）

用户：「是科比（copy）进去的还是怎么回事？我需要 link 进去，然后加入之后跟本地的好像有冲突，我只需要一个就行了」。

**① 复制 → 链接**：`importSkillFromWorkspace`（复制）改为 `linkSkillIntoLibrary` ——
在 `<home>/skills/<id>` 建链接指向 `<ws>/.agents/skills/<id>`（Windows junction），工作区保留文件；
文件系统不支持链接时降级复制并如实提示（`skills.notice.adoptedCopy`）。
**顺带发现扫描器根本不认链接**：`rebuild()` 只收 `entry.isDirectory()`，而符号链接的 `Dirent` 不是目录 ——
库里放了链接会**整条看不见**。现在链接目录也算技能，并把 `link`（解析后的绝对目标）记进目录行/`SkillSummary`，
这样上层才知道"这条的文件在别处、归谁所有"。
**② 一份而不是两份**：合并规则改为按**目录**判断 —— 库行的 `link` 落在当前工作区 skills root 里，
就是同一个技能，合成一行（`location: "both"`），不再出现"库一份 + 工作区一份"。
新增 `Skill.linkAt`（`"library"` / `"workspace"`）表示**链接在哪一侧**，动作按它分派：
工作区持有链接 → 「从工作区移除」；库持有链接 → 「从技能库移除」（各自删掉那条链接，真实文件不受影响）。
库侧 `remove()` 遇到链接只删链接（不 follow 到工作区）。
**③ 顺带修两个真问题**：
- 来源行对 "both" 一律显示 `Workspace`（假话）→ 新增 `skills.location.both`「技能库 + 工作区」。
- `remove()` 原先"先删文件再改索引"：索引写失败就留下**一条目录已消失的幽灵行**，而且再没有任何重建机会
  （用户库里那条 `grill-me` 就是这么来的，已用一次 refresh 清掉）。改成**先改索引再删文件**——
  失败时文件还在，下次重建重新列出，两个方向都能自愈。

**验证**：`linkSkillIntoLibrary` 建出 Junction 指向工作区；`index.json` 里该行带 `link` 字段；
页面合并为**一行**、来源行 `本地 · 技能库 + 工作区`、按钮「从技能库移除」，顶部提示
「已把 grilling 链接进技能库；文件仍留在工作区。」；点移除后库链接消失、工作区文件完好、页签与行数不变。
`check-workspace-skills.ts` 增至 53 项（链接落链 / 目标正确 / 工作区保留 / 重名拒绝 / 源不存在拒绝 /
库目录列出该链接与其 `link` / 自带技能无 `link` / 移除链接不伤工作区）。四个包 tsc + eslint 全绿。
截图 `designs/check-web/skills-linked-one-row.png`。**测试产生的链接已全部清理，用户状态已还原。**

### 修正：动作文案收口为安装 / 卸载 / 收录 / 移除（2026-10-08，用户反馈）

用户连提三次：装进工作区后按钮不能写「从工作区移除」，要写**卸载**；工作区技能进库的按钮英文
**Push**、中文**收录**；库侧那条链接的移除按钮就叫**移除**，英文 **Remove**（此前中文写「取消收录」）。

改动只在文案层：`skills.action.removeFromLibrary` 这个键整个删掉，两处调用
（卡片行按钮、灯箱动作条）改用本来就存在却没人用的 `skills.action.remove`
（en `Remove` / zh `移除`）；`skills.action.uninstall` 仍按 en `Uninstall` / zh `卸载`。
现在四个动作各自一个词：安装 / 卸载 / 收录 / 移除，不再出现长短语。

**验证**（真机）：卡片行 `本地 · 技能库 + 工作区` 右侧按钮显示「移除」、`aria-label="移除 grill-me"`；
灯箱动作条同样显示「移除」；其余行仍是「收录」「安装」。两个包 tsc + eslint 全绿，
`check-workspace-skills.ts`（53 项）与 `check-store.ts` 全过。**测试链接已删，用户状态已还原。**


### 修正：链接进来的技能不显示日期（2026-10-08，用户反馈）

用户：『我点击完收录那些东西的时候，你为什么改了日期啊？这个日期有啥意义啊？我又没改 skill 的内容。』

原因：`readEntry` 对每条索引行都取 `SKILL.md` 的 mtime 当作 `updatedAt`。链接进来的技能指向工作区，
那些文件本来就是「今天下载的」，一被收录就出现在库里并带上这个时间；`list()` 又按 `updatedAt`
倒序排，于是它挤到最前面 —— 看起来像「收录改了日期」。

改法：**链接行不带日期**。`readEntry` 在 `link !== undefined` 时写 `updatedAt: ""`（并让早先带日期的链接行
重读一次自愈），`SkillSummary.updatedAt` 的契约补上「链接技能为空」。前端早已把空日期当作「没有日期」处理
（`formatAge("")` → `""`，卡片/灯箱/列表都不渲染），排序随之落到 `id` 兜底，不再按日期漂移。
自持技能的行不受影响，仍带自己那份 `SKILL.md` 的 mtime。

**验证**：`check-workspace-skills.ts` 增至 56 项（链接行无日期 / 自持行有日期）全部通过；
`check-store.ts` 74 项通过；tsc + eslint 全绿。提交 `cd7a583`。

## 技能更新检测：npx skills 的哈希与 update（2026-10-08 调研）

用户：『通过 npx skills 安装会生成 skills-lock.json，里面有个哈希记录这个 skill 是否产生变化，我后续更新要用；
npx skills 指令可以检测 skill 有更新吗？』

**哈希覆盖什么**（读 skills@1.7.1 的 dist/cli.mjs 得到，不是猜的）：`computeSkillFolderHash(dir)` —— 递归收集该技能目录下
所有文件（跳过 `.git` / `node_modules`），按相对路径排序，`sha256.update(相对路径)` + `sha256.update(文件字节)`，
无分隔符，取 hex。**覆盖整个目录**，不是只有 SKILL.md（实测 SKILL.md 自身 sha256 = `19e660…`，而 lock 里是 `5e0c68…`）。
`--json` 报告里的 `hash` 与 lock 的 `computedHash` 完全一致（实测两端同为 `5e0c683385eafd…`），下载时不用自己算，
直接收下来即可。v1.7.1 写出的 lock 只有 `{source, sourceType, skillPath, computedHash}`，**没有 `ref`**。

**能不能检测更新：能。** `skills update [名字…]`（别名 `upgrade`，`-p` / `-g` / `-y`）：
clone 源仓库 → 对上游同一目录算同一个哈希 → 与 lock 的 `computedHash` 比；不等就重装（内部再跑一次 `add`），
相等就是 `All project skills are up to date`；技能在仓库里换了路径（`skillPath` 变化）也算更新。
GitHub API 快路径需要 lock 里的 `skillFolderHash`（git tree hash，40 位十六进制），本版本不写该字段，所以目前都走 clone。

**它不看本地。** 实测把一个技能的 SKILL.md 追加一行后再 update，仍报 `up to date` —— update 比的是「上游 vs 安装时记录」，
不 hash 你现在磁盘上的内容。含义：上游一旦变了就会直接覆盖本地改动，没有保护；要判断「本地是否被改过」得我们自己算。
Windows 坑：`skills update` 打印完之后 node 断言崩溃（`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`，exit 1），
功能已生效但**退出码不可信**。

**实施（2026-10-08，用户：『也要用 NP X skills 来做，因为它会生成哈希』）**——用户质疑得对，方案改成
**上游那一侧一律不自己算**：

- 安装 / 收录：哈希**只读不算**。`downloadPackageSkills` 把 CLI 写在临时目录的 `skills-lock.json` 读出来
  （`readLockedUpstream`），存进 catalog 行 `upstream: {source, sourceType, skillPath, hash}`；收录时读的是
  **工作区根部的 `skills-lock.json`**，所以 npx 装过的技能一进库就带着来源和版本号。`--json` 的 `hash`
  与 lock 的 `computedHash` 实测一致，两处取哪个都对。
- 检查更新：`fetchUpstreamRecord(source, skill)` 让 CLI 在临时目录装一次，读它这次算出的哈希 ——
  **用 CLI 自己的数字比对**，不做第二套实现；装完即删，库和磁盘都不动。
- 我们只保留一个哈希函数 `skillFolderHash`，用途单一：CLI 从不 hash 磁盘上的文件（实测改本地后 update 仍报
  up to date），所以「本地是否被改过」只有我们自己算。**它的正确性由黄金值证明**：
  `scripts/check-upstream.ts` 里的固定夹具 + skills@1.7.1 实测值
  `9db15463…c177`，函数与 CLI 逐字节一致，改一个字节即失配（.git / node_modules 按 CLI 规则跳过）。
- 更新：仍是让 CLI 装进临时目录，然后把新副本换进目标（库目录，或链接指向的工作区目录 —— 两份是同一个技能），
  记下的是**CLI 这次算的哈希**，不是我们事后重算的。替换用 `.名字.updating` / `.名字.previous` 过渡，
  失败回滚，扫描器跳过点开头的条目。

**验证**：`check-upstream.ts`（13 项：黄金哈希 / 单字节改动 / .git+node_modules 跳过 / lock 读取 / 按 skillPath
找别名 / 缺字段与坏 JSON 拒绝 / local 来源不算上游）；`check-workspace-skills.ts` 增至 58 项（收录带入 lock 记录）。
真机：收录 grilling → 行上带 `mattpocock/skills · skills/productivity/grilling/SKILL.md · 4fa026e5…`；
检查更新 → 上游已到 `c3b3e67f…`，`outdated: true, modified: false`（**上游真的有更新**），
灯箱显示「上游有更新」+「更新」按钮（截图 `designs/check-web/skills-update-available.png`）。
一次性的临时 home 全链路（装 → 手改 → 记录落后 → 更新）证明：手改 → `modified:true`；记录落后 → `outdated:true`；
更新后三者一致、手改内容被替换、无残留目录。
### 修正：创建工作区只走系统对话框，并修好「切过去读不到技能」（2026-10-08，用户反馈）

用户先报『切到 deepseek-harness 为什么没扫到这个工作区下的 skills』，接着说『我不要内置浏览，就使用系统自带的』。

**读不到技能的真因**：工作区行是**只有名字、没有路径**的（浏览器对话框只给名字），而 `currentWorkspace()`
只认 `path`，于是那一行永远读不到任何文件夹 —— 换到它，技能列表自然是空的。扫描器本身没错
（读的是 `<workspace>/.agents/skills`，npx skills 装的地方就是它）。

**改法**：名字要能落到一个真实文件夹上，否则那一行毫无意义。
- `createFsWorkspaceStore` 新增 `locate()`：绝对路径照用；否则**在已知工作区的同级目录里按名字找**——
  工作区本来就是并排存放的文件夹（hub 自己那个 + 列表里已有的）。**唯一命中才用**；一个都没有、
  或两个同名都命中，一律拒绝，绝不猜（猜错就是往别人的项目里写东西）。
- 同一个查找也用来**治愈**旧的只有名字的行（`adoptNamedRows`），写回磁盘，与 `adoptHostFolder` 同源。

**删掉内置浏览**（`91fa481` 引入、用户明确不要）：`folder-picker-dialog.tsx`、`apps/web/src/lib/fs.ts`、
`packages/core/src/fs-browse.ts`、`vite.ts` 的 `folderBrowser()` / `GET /hub/fs/list` 全部删除，
`package.json` 的 `./fs-browse` 导出同步移除；`host/fs-browse.ts` 只留 `isDirectory` / `projectRoot` / `hostFolder`。
`创建工作区` 现在就是 `showDirectoryPicker()` → 拿名字 → `POST /hub/workspaces/add`，失败在菜单里显示一行
（`workspace.create.unsupported` 用于浏览器没有该对话框时），`workspace.picker.*` 那 11 个键随之删除。

**验证**（真机）：桥直调 `{"path":"deepseek-harness"}` → 落成 `D:\work-space\deepseek-harness` 并成为当前工作区，
`?action=workspace` 读到该目录 **13 个技能**；页面切到之后页签 `全部 13 / 工作区 13`，侧栏第二行同步。
UI 上点 `创建工作区` → `showDirectoryPicker` 被调用（桩计数 1）→ 工作区切换、技能页刷新；找不到的名字
在菜单里显示一行失败原因（不再重复两行，也不再提"在浏览器里选"）。
`check-workspaces.ts` 增至 30 项：按名字命中 / 无此名拒绝 / 含路径分隔符拒绝 / 同名两处拒绝 / 治愈写回一次。
四个包 tsc + eslint 全绿。
### 去掉两条冗余提示（2026-10-08，用户：移除这两个东西完全多余）

用户圈出两处：技能页顶部的 `已收录 grilling；文件仍留在工作区。` 一行提示，以及列表/网格页脚的
`1–3 / 3`。

- **成功提示删除**：收录、安装成功都不再说话 —— 那一行本身已经变了（`收录` → `移除`，来源行变
  `技能库 + 工作区`），再复述一遍是噪声。三条文案键 `skills.notice.{copied,adopted,adoptedCopy}` 一并删除。
  **失败仍然显示一行**（`refusal`，只可能是失败）：静默吞掉错误是缺陷，而且卸载/收录的失败没有别的出口。
  降级为复制这种"结果不同"的情况本来就在行上看得出来（工作区那份会显示成工作区自带，而不是 `技能库 + 工作区`）。
- **范围文字删除**：`1–3 / 3` 和它旁边的 `1 / 2` 说的是同一件事。删掉 `rangeText`（含 `from`/`to` 两个变量）、
  `SkillTable` 的 `rangeText` 属性，两处页脚改为 `justify-end`，只留分页控件。

**验证**（真机）：页脚只剩 `每页行数 12 ▼ 1 / 2`（右对齐到 x=1236，与内容右边缘齐），页面里搜不到 `1–3 / 3`；
点 `收录 agent-experience` → 按钮变 `移除`、行变 `技能库 + 工作区`、**没有提示行**；再点 `移除` 还原成
工作区自带（测试痕迹已清除）。四个检查脚本、整仓 tsc、两个包 eslint 全绿。

## 瀑布流保留 + 列数上限 5（2026-10-08）

两轮诉求：①"卡片展示在大的分辨率下显示得很难看，能不能做响应式布局，然后最大横向只能显示 5 个"；
②（我先把瀑布流换成等高行网格之后）"瀑布流的样式不见了，我操" —— **瀑布流必须保留**，要改的只是列数上限。

- 症状（浏览器复现，容器 1736px）：`columns-[266px]` 由 column-width 自动决定列数，2000px+ 的容器排到 **7 列**，
  每张卡只剩 275 宽；叠加"封面高度随资源比例"的落差，整页参差（用户截图就是这个形态）。
- 修法：**列数显式化、封顶 5**，其余一律保持原样（瀑布流 + 每张卡按资源自身比例）。
  容器 ≥556 / 846 / 1136 / 1426 时 `columns-1 → 2 → 3 → 4 → 5`（一列 = 266 卡 + 24 间距，即 290n−24）。
  用 `@container` + `@min-[…]` 容器查询而**不是视口断点**：网格可用宽度 = 视口 − 侧栏 − 内边距，两者不相等。
- 改动只剩 `SkillGrid` 一处：`<div className="@container">` 包住
  `columns-1 gap-x-6 @min-[556px]:columns-2 @min-[846px]:columns-3 @min-[1136px]:columns-4 @min-[1426px]:columns-5`。
  卡片、`PhotoCover`、`FALLBACK_RATIO`、`knownAspect/rememberAspect`、`AutoplayVideo.onAspect` 全部不动
  （中途曾整套删掉，已按用户要求还原）。
- 实测（面板 2040px，容器→列数/卡宽）：1736→5/328、1380→4/327、1193→4/280、959→3/304、707→2/341、
  473→1/473；列数不再超过 5；同一列内卡片高度 689/418/290 不等（瀑布流节奏在）；
  卡片单击开灯箱、Esc 关闭正常。`pnpm --filter @workspace/plugin-skills typecheck && lint` 全绿。
- 教训：宽屏"难看"来自**列数不受控**，不是瀑布流本身；把瀑布流一起砍掉是做过头了。

## 无资源的封面/舞台改渲染真 Markdown（2026-10-08，用户："你这展示了个啥……用markdown的形式显示"）

用户圈了两处：卡片封面（没有封面图时）与灯箱舞台（没有媒体时）。两处都在放**假的前言源码**——
卡片是一排 mono 10px、透明度递降的 `---` / `name:` / `description:` 行，舞台只有四行 frontmatter，
既不是文档也不是源码。用户要求用 markdown 组件把它**渲染**出来，插件指定为 **`react-markdown`**。

- 新共享组件 `packages/ui/src/components/markdown.tsx`（导出 `Markdown`）：`react-markdown` + `remark-gfm`
  （表格/删除线/任务列表，SKILL.md 里常见）。元素全部用后代选择器 + **em 相对字号**统一在一处
  （`[&_h1]:text-[1.35em]` 这种），所以调用方只给一个字号，同一个组件在卡片与灯箱上就是两种尺寸。
  默认不启用 raw HTML（react-markdown 的默认行为），链接仍走它的 URL 清洗。
- 依赖加在 `@workspace/ui`：`react-markdown@^10.1.0`、`remark-gfm@^4.0.1`。
- **卡片封面**（`page.tsx` 的 `MarkdownCover`）：渲染 `# {Title Case 名称}` + 描述。有 tag 时留 `pt-10`
  给左上角的胶囊，没有 tag（工作区技能都没有）就 `pt-3`，不再空一条 40px 的带子。
- **灯箱舞台**（`skill-detail-dialog.tsx`）：`MarkdownPreview` → `DocumentStage`，文档取
  `detail.body`（库，已去 frontmatter）→ `parseSkillFile(held.text).body`（工作区，原始文件去掉 frontmatter）
  → 兜底 `# 名称 + 描述`；`LightboxBody` 算好 `doc` 传给 `MediaPane` → `MediaSlide`（`skill` 属性换成了 `doc`）。
  舞台可滚动（`overflow-y-auto`，`max-w-[640px]` 居中），一份 SKILL.md 几百行也读得下去。
- 实测：工作区 `grilling` 卡片封面渲染标题 + 描述；`dsh-ci-test-reliability` 灯箱舞台渲染出
  `# Reliable DSH CI tests` + 8 个列表 + 18 处行内代码（内容高 3038 / 视口 405，可滚动）；
  明暗两套主题都看过。`ui` / `plugin-skills` 的 typecheck + lint 全绿。

## 卡片封面渲染技能自己的正文（2026-10-09，用户："还有这个地方显示 markdown 正文、但是不用 react-markdown 渲染"）

上一轮只把封面改成"标题 + 描述"，**不是技能真实的内容**。用户圈着封面指出：这里要显示 **markdown 正文**
（即 SKILL.md 的 body），而且现在并没有真正用 react-markdown 渲染它。

- 新钩子 `useSkillBody(skill, store)`（`library.ts`）：库里的技能读 `store.get(id).body`，
  工作区自己的技能读 `store.workspaceSkill(id).text` 再去掉 frontmatter（`parseSkillFile`）；
  结果按 `skillKey@stamp` 缓存在模块级 Map，重挂载与切页签都不再重复读。
  **只有"没有封面资源"的卡片会调用它**（`MarkdownCover` 只在 `cardMedia === undefined` 时渲染），
  有图的卡片一次请求都不多发；读不到时退回 `# 名称 + 描述`。
- 封面只渲染正文的**开头 800 字符**（`COVER_EXCERPT`，按整行切）：封面高 ~150px，全文渲染会把
  整篇文档塞进 DOM（实测一份 shadcn-ui 的技能体渲染出 5595px 高、上千节点），截断后每张卡只有 ~10 个节点。
- `markdown.tsx` 被改坏的版本已修回：上一轮那份编辑把 `cn` / `base` / `className` 都留成了未使用
  （`tsc` 报 3 个 TS6133，整个仓库 typecheck 直接失败），现在恢复成"包一层 div 应用 className"。
- 实测（两个工作区、明暗主题）：`grilling` 封面显示 `Interview the user relentlessly until you reach a shared…`、
  `shadcn-ui` 显示 `shadcn/ui Component Integration`，deepseek-harness 的 13 个技能封面各自显示真实标题
  （`Reliable DSH CI tests`、`Reviewing a DeepSeek-Harness PR` …）；灯箱舞台不受影响（仍渲染全文、可滚动）；
  `ui` / `plugin-skills` 的 typecheck + lint 全绿。

## 舞台不再滚动、代码块换行（2026-10-09，用户："这一块内容我不要滚动条，并且我看到为什么还有文本溢出的情况，bug"）

灯箱舞台（无媒体的技能）上一轮给了 `overflow-y-auto`，实测两个问题：

- **滚动条**：`overflow-y: auto` 会让 `overflow-x` 一起变成 `auto`（CSS 规范：一个轴非 visible 时另一个 visible 也按 auto 算），
  所以文档一超长就同时出现竖、横两条滚动条。
- **文本溢出（真 bug）**：代码块用 `white-space: pre` 且不换行，`pre` 的内容宽 760px 而容器只有 117px，
  于是横向溢出、被截断/横滚 —— 用户截图里那行 `<question body, might be multiple paragraphs…>` 就是这么跑出去的。

修法两处：

- `markdown.tsx` 的 `pre` 规则加 `whitespace-pre-wrap` + `break-words`：长代码行**换行**而不是横向溢出
  （容器本就有 `break-words`，但 `pre` 的 `white-space: pre` 让它在里面失效）。
- `DocumentStage` 改 `overflow-hidden`：舞台是固定 16:9 的预览位，不滚动、裁切显示；
  完整正文点「查看文件」在文件面板里读（那里的滚动是代码查看器的正常行为，未动）。

实测：舞台 720x405，`scroll == client`（无滚动条），`pre` 内容宽 640 == 容器宽 640 且 `white-space: pre-wrap`；
两个工作区（4 张 / 12 张卡）全部封面 **零横向溢出元素**；灯箱与卡片截图复核过；typecheck + lint 全绿。

# 文件面板改用库：可交互文件树 + shiki 语法高亮（2026-10-09，用户："文件树是默认折叠的、并且还不能点击其他的文件；我们尽量不要手写这些东西"）

**问题（都是手写的）**：树是一个平铺列表，**只能渲染、不能交互**（不能折叠、不能点开别的文件，选中项硬编码 `SKILL.md`）；
内容是手写的逐行 `<div>`（行号 + `whitespace-pre`），长行横向溢出。

**改法**：
- **树 = `@headless-tree/react` + `@headless-tree/core`**（headless：展开/折叠、焦点、方向键、ARIA 全由库给）。
  `src/file-tree.tsx` 把后端平铺清单（`SkillFileEntry[]{path,depth,directory}`）编成 `{items, children}` 索引喂给
  `useTree({ rootItemId: "", dataLoader, features: [syncDataLoaderFeature, hotkeysCoreFeature] })`；
  `initialState.expandedItems` = 根（**默认折叠**：顶层条目可见，文件夹要点开才展开——2026-10-09 按用户
  「文件树没有默认折叠」修正，之前是全展开）；行是 `<button {...item.getProps()}>`，
  `onPrimaryAction` 里只有 `!item.isFolder()` 才 `onSelect(path)`；`aria-selected` 用面板自己的选中态覆盖。
- **内容 = `shiki`**（`shiki/core` + `createJavaScriptRegexEngine()`，**不引 wasm**）：`src/code-view.tsx` 只装
  markdown/yaml/json/python/ts/js/bash/html/css/toml 十种语法，`codeToHtml(text, { lang, themes:{light,dark}, defaultColor:false })`
  出 HTML；行号是 CSS 计数器（`globals.css` 新增 `@utility file-code`），主题跟着 `.dark` 切（`var(--shiki-light/dark)`）。
  高亮是异步的：先渲染纯文本 `<pre>`，色彩到了再换（不空白、不阻塞）。
- **任意文件可读**：库技能本来就有 `store.readFile(id, path)`；**工作区技能新开一条缝**——
  `readWorkspaceSkillFile(workspace, id, file)`（`path.resolve` + 前缀校验，越界抛 "path escapes the skill directory"）、
  `SkillStore.workspaceFile(id, path)`、`remote-store` 走 `GET /hub/skills?action=workspace-file&id=&path=`、`vite.ts` 加路由。
  面板按 `skill.location` 分派：`workspace` → `store.workspaceFile`，其余 → `store.readFile`。
- **结果与路径一起存**：读到的内容存在 `{path, kind:"text"|"failure"}` 里，路径不匹配就显示读取中——
  **不在 effect 里同步 setState**（`react-hooks/set-state-in-effect` 会拦，也会级联渲染）。

**踩的坑（重要）**：headless-tree **只在挂载时构建一次条目清单**（`getItems()` 返回缓存的 `itemInstances`，
只有 `rebuildTree()` / `scheduleRebuildTree()` 才重建），而我们的文件清单是**异步到达**的（先空后有）——
于是树永远空着、DOM 里一行都没有。修法：`key={fileTreeKey(files)}`（全部 path 拼接），清单变了就重挂载。
排错方法值得复用：先在页面里用同一个库做**最小复现**（证明库没问题），再回头看"数据什么时候到手"。

**验证**：
- `check-workspace-skills.ts` 增至 **63 项**（新 5 项：读同级文件 / 读 SKILL.md 原文 / 不存在返回 null /
  `../../../outside.txt` 被拒 / 越界技能名被拒）全过；`check-store` / `check-upstream` / `check-updates` 无回归；
  plugin-skills + ui 的 tsc、plugin-skills eslint 全绿。
- 真机（zh-CN，浏览器）：库技能 `grilling` 与工作区技能 `grill-me` 两个灯箱都验证——
  树 `agents(1) → openai.yaml(2) / SKILL.md(1)` **默认折叠**（`agents` 收起、点开出现 `openai.yaml`）；
  点 `openai.yaml` → 头部标题跟着变、选中态移动、正文换成该文件且带语法色（YAML 键着色、行号 1..n）；
  多层技能 `dsh-doc`（references/ + templates/ 共 13 个文件）默认只见两个文件夹 + SKILL.md，
  展开 references 点开 `style.md`（50 行）正常；浅色 token `rgb(34,134,58)`、深色 `rgb(133,232,157)`。

# 技能更新的批量检查与徽标（2026-10-09，用户："那如果是远程仓库的 skills 更新了怎么办？"）

## 问题
远程仓库前进后，hub 里没有任何人知道 —— 现状只有一条路：「进灯箱 → 逐个点检查更新」，
刷新即忘；而且每个技能各检查一次 = 各 clone 一次，N 个技能就是 N 次 clone。

## 方案（检查显式化、按源去重、结果落盘）
1. **按源去重**：同一仓库的 N 个技能合并为**一次** CLI 调用（`--skill a --skill b …`，一次 clone 出全部哈希）。
   `skills-cli.ts` 增 `fetchUpstreamRecords(source, skills[])`；单技能 `fetchUpstreamRecord` 改为它的薄包装。
2. **批量入口**：`SkillStore.checkUpdates()`（fs 实现 + remote-store + vite 桥 `?action=check-updates`）：
   收集所有带 `upstream` 的行 → 按 source 分组 → 限并发 3 逐源跑 CLI → 比较 → 结果写 catalog。
3. **结果落盘**：`SkillSummary` / `CatalogEntry` 增 `checked?: {at, latest}`（latest = 上游当时的哈希）；
   `readEntry` 像 upstream 那样原样携带（manifest 不带这些字段）；单技能 `checkUpdate` 与
   `updateFromUpstream` 成功后都刷新它。`outdated` 是派生值（`latest !== upstream.hash`），不落盘。
4. **UI**：工具栏（视图切换与 Import 之间）加「检查更新」outline 按钮，检查中禁用 +「检查中…」，
   失败的源在 refusal 行汇总；卡片/列表名字旁出示 amber「有更新」徽标；
   灯箱 `UpdateRow` 从 `skill.checked` 播种（有缓存且 outdated → 直接「上游有更新」+「更新」按钮），
   idle 时显示「上次检查：<age>」。
5. **更新仍逐技能**（覆盖本地改动必须保留 `modified` 提示）；不做「全部更新」；不做自动轮询
   （一次检查 = 多次 clone，保持显式）。

## 计划
- [ ] `skills-cli.ts`：`fetchUpstreamRecords` —— 一次调用装多技能进临时目录、读 lock、按名返回哈希 + 失败原因
- [ ] `store.ts`：`SkillSummary.checked`、`SkillUpdateSummary`、`SkillStore.checkUpdates`
- [ ] `skills-fs.ts`：`checkUpdates`（分组 / 并发 3 / 比较 / 落盘 / bump revision）；`readEntry` 携带 checked；
      `checkUpdate` 单技能也落盘；`updateFromUpstream` 成功后刷新 checked
- [ ] `remote-store.ts` + `vite.ts`：桥 action `check-updates`（改完必须重启 dev server）
- [ ] `library.ts`：`checkAll`；`page.tsx`：按钮 + grid/list 徽标
- [ ] `skill-detail-dialog.tsx`：`UpdateRow` 播种 +「上次检查」
- [ ] 文案 en + zh：`skills.update.checkAll` / `.checkingAll` / `.badge` / `.lastChecked` / `.summaryFailed`
- [ ] `scripts/check-updates.ts`：合并调用、checked 落盘与携带、更新后徽标条件、失败路径
- [ ] 验证：真机（手改 catalog 的 `upstream.hash` 模拟上游前进 → 检查 → 徽标出现 → 更新 → 徽标消失）；
      全绿：新脚本 + check-store / check-upstream / check-workspace-skills + tsc + eslint

## 待确认
- 工作区行（直接 `npx skills add` 进 `.agents/skills`、未收录的技能）这一轮要不要一起支持：
  它们没有 upstream（没读工作区根的 `skills-lock.json`）。做 = `readWorkspaceSkills` 顺带读 lock、
  检查同路径、更新目标改为工作区目录（`updateFromUpstream` 按 location 分派）。
- 要不要给批量检查加 TTL 自动跑（打开技能页且上次检查超过 N 小时）—— 成本是每次多个 clone，默认不做。

## 结果（2026-10-09，已实现；用户指定按钮位置："这个地方在加一个按钮"）

**入口**：技能页工具栏（视图切换与 `导入` 之间）新增 outline 按钮 `检查更新`，
检查中变 `正在检查…` + 图标 `animate-spin`、按钮禁用；失败源在 refusal 行按 `名字: 原因 · …` 汇总，
成功不说话（徽标本身就是结果）。

**批量检查（按源去重）**：`SkillStore.checkUpdates()` —— 按 `upstream.source` 分组（原来 N 个技能 = N 次 clone），
`askSources()` 每组一次 CLI 调用（`--skill a --skill b …`），并发上限 3；单技能 `checkUpdate` 走同一条路。
结果落盘：catalog 行新增 `checked: {at, latest, currentHash}`（`readEntry`/`list` 像 `upstream` 一样携带，
跨重启保留）；`outdated` 是派生值 `checked.latest !== upstream.hash`。

**CLI 细节**：`fetchUpstreamRecord`（单）→ `fetchUpstreamRecords`（多，返回 `{records, failed}`）。
实测发现 CLI 对**整包失败**会给出**无名**条目（clone 失败），实现把它当作"对这个包所有技能的回答"
（`packageFailure`），不再产生名字为空的失败项；未命名但 lock 里存在的技能仍从 lock 补读。

**UI**：卡片名旁与列表名旁 amber `有更新` 徽标（`UpdateBadge`，无 `checked` 不渲染）；
灯箱 `UpdateRow` 用 `skill.checked` 播种 —— 已过期直接显示 `上游有更新` + `更新` 按钮（不必再点一次检查），
idle 且有过检查时显示 `上次检查：<age>`。更新成功后 checked 变成新哈希（徽标立即消失）；
`SkillUpdateCheck.latestHash` 改为非空，删除 `skills.update.unreadable` 分支与键（CLI 的失败原因更有用）。

**验证**：
- 新脚本 `scripts/check-updates.ts`（**29 项，全绿**）：fixture 是本机 `file://` git 仓库
  （实测 CLI 认它为 `sourceType: "git"`，**无需网络**）→ 安装两个技能 → 批量检查 up to date →
  推进一版 → `outdated: 1` 且另一行仍是 2/2 被测量 → 单检查 current → 手改文件 `modified: true` →
  `updateFromUpstream` 后文件与记录一致、再查 outdated 0 → 新 store 仍读到 `checked`（落盘携带）→
  指向坏源的 row 单独失败且其他源照常（`checked: 2, failed: [ghost-test]`）→ 无源/未知技能被拒 →
  空技能列表不触 CLI。
- 回归：`check-store.ts` / `check-upstream.ts` / `check-workspace-skills.ts` 全过；
  plugin-skills + locale-zh-cn 的 tsc/eslint 全绿。
- 真机（浏览器，zh-CN；dev server 重启以加载桥）：工具栏按钮出现 → 点 `检查更新`（控制台观测到
  `检查更新`→`正在检查…`）→ 本地 fixture 演示技能出现 amber `有更新` 徽标 → 灯箱**播种**显示
  `上游有更新`/`更新` → 点更新 **1.6s** 完成：徽标消失、封面正文变第二版、灯箱回 idle 显示
  `上次检查：现在` → 演示技能与 fixture 已删除（库恢复 3 个技能）。
- 真实上游：`mattpocock/skills` 的 grill-me 检查 4.1s 返回 `{checked:1,outdated:0,failed:[]}`（上游未动）。

**按钮配色（2026-10-09，用户："按你颜色改一下呀"）**：把工具栏「检查更新」按钮改成更新功能的琥珀色 —— 与「有更新」徽标同色：
文字/图标/描边用 `amber-600`（深色下 `amber-400`）、hover 琥珀底 10%、背景保持透明。实测浅色
`oklch(0.666 0.179 58.318)`、深色 `oklch(0.828 0.189 84.429)`（与徽标、来源行同色值）；tsc + eslint 全绿。

**位置列重叠修复（2026-10-09，用户："这个地方样式重叠了，宽度不是自适应的吗？"）**：
列表是 `table-fixed` + 设计稿固定列宽（合计 1088），**不按内容自适应**；`本地 · 技能库 + 工作区` 实测 150px
而「位置」列只有 136px，多出的 14px 直接压到下一列（TRIGGERS）上。
- 列宽：位置 136 → **154**，从 **Token 数 96 → 78** 借 18（其表头实测 58、值恒为短数/「—」）；
  **更新时间不能减**——英文 "22 seconds ago" 实测 106px，原 120 才是对的（一度减到 102，量过后回滚）。
  合计仍 1088，设计稿占位不变。
- `ProvenanceLine` 加 `max-w-full`（根）+ 末段 `truncate`：**单元格的 `white-space: nowrap` 会让行的最小宽度
  等于整行文本**，所以只加 shrink 不够，必须 `max-w-full` 把盒子夹到容器宽度内才会走到省略号。
  实测：154 下完整显示（150/154，无溢出）；把列强压到 110 时自动省略号且 **溢出 0**（修前是溢出 40）；
  网格卡片（344 宽）与灯箱 InfoPanel 两处同组件，均无溢出、按钮不被压。
- tsc + eslint 全绿。

**技能库页签（2026-10-09，用户："这里还得新增一个筛选条件，就是筛选技能库"）**：位置轴从两档变三档
—— `全部 / 技能库 / 工作区`（`SkillTab = "all" | "library" | "workspace"`，`TABS` 与 `SAMPLE_COUNTS` 同步）。
- 筛选规则：**"两处都有"的行同时在两档里出现**，只有"缺少这一侧"才被排除 ——
  `library: location !== "workspace"`、`workspace: location !== "library"`。
- 计数在 `library.ts` 的 `useSkillLibrary().counts` 里按同一规则算（新增 `library` 键，空 store 兜底同步）。
- 文案 `skills.tab.library`（en "Library" / zh "技能库"）。空库时沿用 `skills.empty` + 库根路径。
- 实测（本机库 2 个纯库技能 + 13 个工作区行）：页签 `全部 15 / 技能库 2 / 工作区 13`；
  切到技能库只剩 ui-ux-pro-max、grill-me（都是 location=library），工作区档 12 行/第 2 页，
  逐档点击与行内容核对一致；tsc + eslint 全绿。

**已知边界**：工作区里直接 `npx skills add` 的技能仍不可检查（没有 upstream，按用户决定放到下一期）；
不做自动轮询（每次检查是真实 clone）；更新仍逐技能（覆盖本地改动的提示要保留）。

## 远程技能搜索：弹窗按设计稿落地（2026-10-09，用户："实现这个前端的这个弹窗的样式"）

插件（skills.sh 这种"远程来源"）先不做，本轮只做**前端弹窗 + 入口**，并把接缝留出来。

**入口**：技能页工具栏在 `导入` 右侧新增主色按钮 `搜索`（图标 `search`，文案 `skills.action.search`）。
（初版叫 `下载`/`DownloadIcon`，用户 2026-10-09 指正：「这一块应该就不是下载了，应该是搜索」→ 名称、
文件名、文案键一并改成 search。）

**弹窗** `packages/plugin-skills/src/search-dialog.tsx`（`SearchSkillsDialog`）= 640 宽，
结构照画板 `oHiQX`：标题/说明 + 关闭 → 搜索框（40 高、主色描边、左侧放大镜）→ 1px 分隔 →
`来自 <来源>` / `按安装量排序` 行（35 高）→ 6 条 68 高结果行 → 64 高页脚（左侧 `1–6，共 N 个技能`，
右侧 `第 x 页，共 y 页` + 上/下页箭头 + `关闭`）。
行 = 40 图标磁贴（按分类上色）+ 技能名（176 固定列宽，让 `by @…` 列对齐）+ 描述
+ 右对齐安装量（96 宽）+ `安装` 按钮（32 高、主色、`download` 图标）/ `已安装`（绿勾 + 灰字）。
顶部列表标题与每行的 `by @…` 都取注册表的 `name`（用户 2026-10-09 指正：`by` 后面是**来源**，不是作者）。

**接缝** `packages/plugin-skills/src/registry.ts`：`SkillRegistry`（`id` / `name` / `search({query,offset,limit})`）
与 `RemoteSkill`（`name` / `description` / 可选 `package`、`installs`、`tag`）。插件以后要实现的就是这个接口，
页面把实例传进弹窗即可；没有插件时弹窗用内置的 `previewRegistry`（18 行 = 设计稿那 6 行 + 12 行同库名），
预览行没有 `package`，只能在本窗口标记 `已安装`，**不会**去碰真实技能库。
真装了插件后：行 → `store.installPackage(row.package, [row.name])` → `onInstalled()` 让页面重读目录。

**行为**：输入 300ms 防抖搜索（Enter 立即搜）、页脚翻页、每次打开重读库里的 id 以显示 `已安装`、
关闭即清空搜索；搜索用"代次"计数丢弃过期响应。

**验证**：`pnpm typecheck` 6 个包全绿；`plugin-skills`、`locale-zh-cn` eslint 全绿
（`ui` 既有 19 个 lint 错误与本次无关）。浏览器（zh-CN，真实 Vite）实测：工具栏出现主色 `搜索`
（`rgb(79,70,229)` 底 + 白字 + 放大镜图标，85.6×36）→ 弹窗 640×641、六行结构与设计稿一致
（行高 68、名字列 x=78/w=176、`by` 列 x=262、安装量列 x=428/w=96、按钮右缘 616 —— 与设计稿同值）
→ 点 `安装` 行变 `已安装` → 搜索 `migrat` 得 2 行、页脚 `1–2，共 2 个技能` / `第 1 页，共 1 页`
→ 清空恢复 → 下一页 `7–12，共 18 个技能` / `第 2 页，共 3 页`、上一页按钮变可用。

**与设计稿的两处偏差（有意）**：① 预览数据只有 18 行，所以页脚是 `1–6，共 18 个技能` / `第 1 页，共 3 页`
（画板画的是 1,284 / 214，那是真实注册表的量级）；② 搜索框打开即聚焦，因此带浏览器焦点环
（画板上只有一圈主色描边）——搜索弹窗自动聚焦是刻意保留的。

**画布**：新增 `uNo7V`（Search remote — Entry）与 `jg12C`（Search remote — Dialog）两块板，`eddWl` 扩到 15610；
`jg12C` 首个行名从 `test-driven-development` 改回 `tdd`，与代码里的预览数据一致；两板的工具栏按钮与弹窗标题
（`Download skill` → `Search skills`）已随本次改名同步。核对图 `designs/check-download/`（临时，不提交）。

## skills.sh 插件（2026-10-09，用户："现在我们去开发skills.sh的插件"）

### 站点事实（实测，决定了整个实现）

| 事实 | 证据 |
| --- | --- |
| 文档里的 `/api/v1/*` **全部要 Vercel OIDC**（`Authorization: Bearer $VERCEL_OIDC_TOKEN`） | `GET /api/v1/skills` 与 `/api/v1/skills/search` 都返回 401 `authentication_required`；detail 路由同样 401 |
| 免鉴权可用的是旧的 `/api/search?q=&limit=` | 200，返回 `{query, searchType, searchVersion:"algolia", skills:[{id, source, skillId, name, installs}], count}` |
| 它**没有描述**，也没有 offset/total | 逐字符看过响应；`limit` 上限 200，`q` 少于 2 字符返回 400 `Query must be at least 2 characters` |
| `name` 就是 `skillId`（不是好看的显示名），`id` 是 `source/skillId` | 多次查询核对（如 `code-review`、`react native`） |
| **描述在技能页的 `<meta name="description">`** 里 = 它的 SKILL.md 摘要 | `https://www.skills.sh/<source>/<skillId>` 前 1.3KB 即含该 meta；三个来源并行实测 685ms |
| 站点**不发 CORS**，浏览器不能直连 | 预检无 `access-control-allow-origin` |

### 骨架改动（上一轮已完成，这里只列现状）

- `packages/core/src/net.ts`：网络能力缝（`NET_ROUTE`、`NetRequest/NetReply`、`createRemoteNet`）。
- `packages/core/vite.ts` 的 `netProxy()`：开发桥 `POST /hub/net`，只走 HTTPS、只去公网主机（SSRF 防护）、
  10s 超时、4MB 上限。
- `PlatformHost.net`（`NetPort`）+ `PlatformCapabilities.network`。
- 内核新贡献点 **`skillRegistry`**（`packages/extensions/src/skill-registry.ts`）。

### 本轮：插件从示例变成正式包 + 行样式

1. **新建 monorepo 包** `packages/plugin-skills-sh`（`@workspace/plugin-skills-sh`，TS，依赖
   `@workspace/extensions` + `lucide-react`）；**删掉** `packages/extensions/examples/skills.sh/`
   （示例插件不该承担产品功能）。`apps/web` 加 `workspace:*` 依赖并在 catalog 里
   `[...builtinExtensions, skillsExtension, skillsShExtension, simplifiedChineseLocale, ...]`。
2. **接缝加两样**（`skill-registry.ts`）：
   - `RemoteSkill.source` —— 该技能的**发布仓库**（`owner/repo` 或域名），与"安装目标" `package` 分开表达。
   - `SkillRegistry.describe?(skill)` —— 搜索应答里没有的字段，由注册表逐行补（skills.sh 用它读技能页的
     meta 描述）；**失败不算搜索失败**，行保持原样；实现自己缓存。
3. **弹窗行改成两行**（用户 2026-10-09："第一行应该是name、第二行就是skills的一个注释"、
   "后面的这个 by 还是 by 来源吧，例如 grill-me 的来源就是 mattpocock/skills"）：
   第一行 = 名称（176 固定列宽）+ `by @<该技能的来源>`；第二行 = 描述。
   描述缺失时弹窗调 `describe` 补全（**并发 3**，`fillDetails`，行 key 仍是 `source:name`）；
   关闭弹窗清空补全缓存。
4. **画布**：`oHiQX` 六行换成**真实数据**（名称/来源/描述/安装量都取自 skills.sh：grill-me、
   setup-pre-commit、receiving-code-review、prisma-orm-setup、expo-examples、cloud-sql-basics），
   `by @` 后面是真实仓库（`mattpocock/skills`、`obra/superpowers`、`prisma/skills`、`expo/skills`、
   `google/skills`）；来源最长的 `by @obra/superpowers` 实测 134px，正好卡在 134px 的可用宽度内。

### 验证（真实数据，非 mock）

- `pnpm typecheck` 7 个包全绿；`plugin-skills-sh` / `plugin-skills` / `extensions` eslint 全绿；
  `packages/extensions/scripts/check-plugins.ts` 全绿。
- 浏览器（zh-CN，真实 Vite，`:5173`）：扩展页「资产源」出现 **skills.sh**（带图标 + 卸载按钮）；
  技能页点「搜索」→ 输入 `grill-me` → 六行真数据，例如
  `grill-me | by @mattpocock/skills | A relentless interview to sharpen a plan or design. | 131.2万 次安装`；
  输入 `shadcn-ui` → **同一个名字的 5 行里，只有 `google-labs-code/stitch-skills` 那行显示「已安装」**
  （库里 `shadcn-ui` 的 upstream 就是它），其余 4 行仍可安装 —— 证明按来源判重生效。
- 行几何实测（DOM，六行完全一致）：行高 68、名称列 x=78/w=176、`by` 列 x=262、安装量列 x=428/w=96、
  按钮右缘 616 —— 与设计稿同值。
- 开发服务器已重启（新增工作区包后 Vite 依赖图必须重建）+ 删 `.vite` 缓存。

### 已知边界（有意）

- 描述是**逐行读技能页**（约 60–200KB/行，浏览器拿不到 CORS，走宿主代理）；插件侧缓存按
  `source/skill`，同一技能不重复读。站点上没有更轻的公开描述来源：v1 要 OIDC，搜索应答没有该字段。
- 部分来源（`open.feishu.cn`、`uizze.sh` 等 well-known）页面**没有 meta 描述**，这些行第二行为空 ——
  这是如实显示，不编造。
- `/api/search` 不支持 offset，翻页靠"多取一行"判断 `hasMore`；结果超过 200 条后无法再翻（上限即接口上限）。
- 搜索应答里的 `count` 是"本次返回条数"而不是总数，所以页脚在没有总数时只显示当前页区间。

### 弹窗状态与并发安装（2026-10-09，用户："空页面太丑 / 去掉来自 skills.sh / 查询要有 loading / 安装时别的按钮也被禁用了"）

1. **去掉结果上方那条提示行**（`来自 skills.sh` + `按安装量排序`）：两个标签都在描述**某一个注册表**的行为，
   而弹窗是按注册表接缝写的，多接一个插件这句话就不成立。删掉后弹窗 643 → **608**
   （81 header + 54 search + 1 divider + 408 list + 64 footer），画板 `oHiQX` 同步删除该行并重新居中（y=236）。
   文案键 `skills.search.from` / `.sorted` 已移除。
2. **空态/加载态**（画板未画，直接按应用内的样子定）：
   - 列表区**固定高度**：有查询时 408（翻页/加载都不跳动），未开始搜索时 248（弹窗 446，不至于一大片空白）。
   - 起始态：居中 44px 圆底放大镜 + `搜索远程技能` + `输入至少 N 个字符即可看到结果。`
   - 无结果：`SearchX` 圆底 + `没有找到匹配的技能` + `换个关键词再试一次。`
   - 搜索失败：`TriangleAlert` 圆底 + `搜索没有成功` + 注册表原文（红色）。
   - 加载：4 行骨架（40 方块 + 两行条 + 右侧条 + 78x32 块，`animate-pulse`），`aria-busy` 标在列表区上。
3. **修掉一个真缺陷**：加载判定原来只看 `found === null`，而防抖窗口内 `found` 仍是 `null` 且 `busy` 仍为 false，
   于是**刚敲字就显示"没有找到匹配的技能"**。改为记住"这份答案对应哪个 query"（`answered`），
   `waiting = busy || answered !== query`；表格与页脚在 waiting 期间都不说话（`listed = waiting ? [] : rows`）。
4. **并发安装**：`pending` 从单个 key 改成 **key 数组**，行按钮只禁用/转圈自己那一行（`aria-busy` + `Spinner`），
   其他行照常可点。实测：连点两行的安装，只有这两行 disabled 且各有一个 spinner，其余 4 行不受影响；
   失败的一行在列表下方显示 `名字: CLI 原文`。
5. 页脚在没有行时只留 `关闭`（不再显示 `第 1 页` 这种空翻页）。

**验证**：`pnpm typecheck` 7 包全绿，`plugin-skills` / `locale-zh-cn` eslint 全绿。
浏览器（真数据）实测四种状态：起始 446 → 加载骨架 → 结果 606（搜 `shadcn` 时 `已安装` 标记仍只落在
`google-labs-code/stitch-skills` 那行）→ 无结果态 → 清空回到 446。
验证时真实安装的 `grill-me` 已从库里删除（库回到原来的 12 条）。

**样式混乱的根因（用户："样式混乱了"）**：给列表区套的那层 `div.flex.flex-col.h-[408px]` 是 `DialogContent`
（`grid`）的子项，grid 子项的 `min-width:auto` 等于其 min-content 宽度，于是**内容宽度变成了弹窗里这一栏的最小宽度** ——
实测 `dialog clientWidth 640 / scrollWidth 1210`，行和安装按钮被推到弹窗外面，右上角关闭按钮与页脚翻页也被裁掉。
修法 = 给这层加 `min-w-0`（之前的写法不需要，因为那时的 grid 子项本身就是滚动容器 `overflow-y-auto`，
其自动最小尺寸为 0）。**动这块结构后一定要断言 dialog 与其列表区的 `clientWidth === scrollWidth`。**

# Skills 模块改版设计稿（2026-10-09，新画布 `designs/skills.pen`）

## 目标（用户）
"现在我们的系统 UI 太丑了、你按照我们的设计规范进行重构、不要参考现在的设计稿、目前先尝试重构 Module / Skills 模块"。
用户确认三点：以 **DESIGN.md（Coinbase 风格）** 为规范、**改全局 token**、本轮**只做 Skills 主页**；
随后要求先看设计稿 —— "先改我们的设计稿、让我先看看效果。用这个新的画布来操作"。

## 设计规范落点（DESIGN.md → 画布）
- 单一强调色 `$primary #0052FF`，**一屏只出现一次**（工具栏「搜索」+ 品牌标）：12 张卡各挂一个蓝按钮
  就不叫"克制"了，所以行内动作一律用次级（`$surface-strong` 胶囊）或描边胶囊。
- 白底 + 发丝线 `$hairline #DEE1E6` 定义卡片（去掉玻璃、渐变、彩色底）；阴影只有一档（仅 hover 态用）。
- 圆角：卡片 24、输入/选择 12、CTA 与标签 100（胶囊）、图标牌 999；规范明确"禁止直角 CTA"。
- 页标题 36 / **字重 400** + 负字距（display 只用 400 是这套规范的招牌）；数字一律等宽（JetBrains Mono）。
- 标签不再用彩色底：发丝线胶囊 + 6px 本标签色圆点 + 正文色文字；选中态（页签、「全部标签」）用 `$ink` 实心胶囊。

## 画布产出（3 块画板，1440x1080，x = 0 / 1560 / 3120）
| 画板 | id | 内容 |
| --- | --- | --- |
| Skills — Grid | `tdqCI` | 侧栏（白底 + 发丝线 + 胶囊选中态）+ 顶栏（胶囊搜索 / 连接仓库 / 同步仓库 / 主题）+ 页标题 + 工具栏（位置页签 / 视图切换 / 检查更新 / 导入 / 搜索）+ 标签筛选行 + 4 列瀑布流 12 张卡 + 页脚翻页 |
| Skills — List | `vRdOZ` | 同壳；一张卡片内：表头 44 + 10×56 行，列宽 340/210/175/88/95/110/70 = 1088，数字等宽 |
| Skills — Dark | `t8pqnG` | Grid 的暗色版：画布 `#0A0B0D`、卡片 `#16181C`、发丝线 `#FFFFFF1F`、选中态 `#FFFFFF1F` |

- 变量表一次性建好（`SetVariables`）：canvas / ink / body / muted / muted-soft / hairline / surface-soft /
  surface-strong / surface-dark / surface-dark-elevated / on-dark / on-dark-soft / primary(+active/disabled) /
  on-primary / semantic-up / semantic-down / accent-yellow / 9 个 tag 色 / radius-md·lg·xl·pill /
  font-sans Inter / font-mono JetBrains Mono。
- 卡片封面：有图用图（4 张 stock 生成图），没图用**文档预览**（等宽 10.5 / 行高 1.65：标题 + 正文片段 + 一条要点）。
  **不再显示 YAML frontmatter** —— 首轮视觉审查把 `name:` / `description:` 那几行读成"数据污染 / 坏卡"，
  而且它和卡片标题重复。

## 验证
- 三块画板 `problems` 扫描无 "fully clipped"；4 列高度 946/912/932/912 vs 视口 616（折叠处切在第三张卡的封面 = "下面还有更多"）。
- 暗色版逐节点核对文字填充：全部落在 `$on-dark` / `$on-dark-soft` / `$on-primary`，无白底白字、无深底深字。
- 核对图（临时、不入库）：`designs/check-skills-redesign/{tdqCI,vRdOZ,t8pqnG}.png`。

## 待用户确认（看完设计稿后）
1. 蓝色收敛到"一屏一次"（行内动作改次级 / 墨黑胶囊）是否符合预期。
2. 页面壳（侧栏、顶栏）一并改成白底 + 发丝线：因为要改全局 token，其他模块会跟着变。
3. 卡片封面显示文档正文而非 frontmatter；列表里的描述仍是前两行。
4. 落地时是否同步改 `packages/ui` 的 token（`globals.css`）与 shadcn 组件的圆角 / 配色默认值。

# Agent 的 SKILL 位置改走服务（2026-10-13，用户：「Agent 插件的 SKILL 功能还是使用的旧方法，希望他和 MCP 注册的方式一样」）

`skillLocation` 是唯一还留在内核的「功能贡献点」：Agent 插件把位置当数据交上来，技能页再自己拼。
本轮把它换成与 MCP 同一条服务轨道 —— **服务名是发布者命名的，注册进注册表，停用即撤销**。

## 改动

- **契约与注册表归发布者（`@workspace/plugin-skills`）**：新增 `src/provider.ts`（`SKILL_SERVICE`、
  `SkillPlace`、`SkillProvider`、`SkillProviderRegistry`、`SkillService`、纯函数 `readablePlaces`）、
  `src/service.ts`（`createSkillService`）、`src/contract.ts`（子路径导出 `./contract`，Node 下的检查脚本可加载）。
  类型按 MCP 的做法由发布者合并进 `ExtensionServices`（`skills`）。
- **内核删掉 `skillLocation` 贡献点**：`SkillLocationContribution`、`ContributionMap.skillLocation`
  与 `AgentTargetDescriptor` 的 `skillLocation` / `globalSkillLocation` 两个字段一并删除；
  现在「谁是 Agent」由**是否注册了 provider** 回答（服务轨道），不再由 target 上的两个字符串回答。
- **技能模块自己也是第一个 provider**：工作区共享的 `.agents/skills` 由 `skillsExtension` 注册进自己的注册表，
  与 Agent 插件走同一条路，不再占一个贡献点。`manifest.provides` 加 `["skills"]`。
- **读的地方改走注册表**：`library.ts` 的 `useReadablePlaces` / `useSkillAgents` 读
  `ctx.get("skills").registry.providers()`，以目录快照的 revision 作重读信号；
  「工作区位置一律读、机器级位置只在侧栏选中该 Agent 时读」这条规则移进 `provider.ts` 的 `readablePlaces`（纯函数，可离线检查）。
- **10 个 Agent 插件 + claude-code 改法一致**：`scope.inject(["skills"], …)` →
  `registry.register({ id: <自己的 id>, places: [...] })`，位置常量从导出字符串改成包内数组；
  target 贡献保留（侧栏那一行仍要 displayName/icon/format）。各包 `package.json` 补 `@workspace/plugin-skills`。
- **侧栏 Agent 菜单**：`AgentGroup` 由「target 带 skillLocation」改为「id 出现在注册表里」。
- 命名冲突：`plugin-skills/src/registry.ts`（远程技能来源）已占用 `SkillRegistry`，故新接口叫
  `SkillProviderRegistry`。

## 验收

- `pnpm typecheck` 21/21；改动包 `eslint` 干净。
- 新增 `plugin-skills/scripts/check-registry.ts`（12/12：注册/按注册顺序返回/撤销/重复撤销无副作用，
  以及 `readablePlaces` 的四条：工作区位置无条件读、机器级位置需选中、不读未选中者的位置、按 order 排序）。
- 既有检查重跑：`extensions/scripts/check-services.ts` 16/16、`check-plugins.ts` 全过、
  `plugin-skills` 的 `check-place-skills`/`check-store`/`check-package` 全过、`locale-zh-cn/check-messages` 446/446。
- 真机浏览器（重启前 dev server + 整页刷新，本次改了 `exports` 必须重启）：技能页页签 全部 14 / 技能库 9 /
  未收录 3 / 需要更新 3 正常；「全局」位置菜单列出 11 个位置（Claude Code `~/.claude/skills` 1 条、
  Cline `~/.agents/skills` 1 条，其余 0 条）；侧栏取消勾选 Qoder → 位置 11→10、药丸 `+6`→`+5`，
  重新勾选即复原（证明注册表撤销与选择联动都是活的）。
- 未做：技能按位置写入的端到端重测（本轮没动 `SkillPlaceRef` 与 host 侧的读写路径）。

## 追问：一件技能被多个 Agent 装了怎么显示（2026-10-09，用户「很纠结」）

**用户 2026-10-09 拍板：采用「方案 A · 读作数量」**，方案 B（卡片上堆 Agent 图标）作废。
随后按这个决定改了画布：

- `Skills — Multi-place`：删掉方案 B 那一列；版面改成「卡片（左）+ 位置面板（右）」并排，
  标题改为「一件技能装到多个位置怎么显示」，副标题写明「位置是技能的属性，不是它的身份：一件技能永远只有一行。
  卡片只读数量，具体是哪几个交给详情弹窗」。
- 卡片页脚：`[来源图标] 本地 · 3 个位置 ⌄` + 右侧动作按钮；**动作按钮文案恒定「安装 ⌄」**
  （装到第二处也是安装；已装的位置在菜单里带勾，取消勾选即移除）。
- **工作区自带的技能 = 「收录」**（library 图标、描边胶囊），`加载更多`→ 不再显示「卸载」。
  于是行内只有两种动作词：**安装**（库 → 位置）与 **收录**（工作区 → 库）。
- 位置面板：行 = 图标牌 28 + 名称 + 等宽路径 + 类型徽章（**本体** / 链接）+ `移除`（本体那行没有动作）。
- 三个视图的页脚与页签计数同步：`impeccable` = 3 个位置、`pdf-extract` = 2 个位置、
  工作区自有技能 = 工作区、其余 = 技能库；Claude Code 页签计数 0 → **2**（"装了它才会出现这一档"）。

**同时确定的图标规则**（画进安装菜单与位置行）：箱子归 UI（圆角 = 尺寸 24%、图形占 56%、1px 发丝环），
素材自带底板的铺满箱子、只有图形的由箱子补中性底并用 `currentColor` 跟随主题；
出现位置只有三处：安装菜单行、详情「位置」行、位置页签。**信息层级**：
卡片（装了几处）→ 页签（装在哪些类位置）→ 详情（具体是哪几处）。

### 代码落地要改的（本轮设计暴露的缺口，按优先级）

1. `locationLabel` 把 `both` 写死成「技能库 + 工作区」；3 处就错。改由 `holdsOf(skill).length` 派生：
   0 → `技能库`，1 → 该位置，N → `N 个位置`。
2. 行内按钮文案/图标按 `installed` 切换 → 恒定「安装 ⌄」；工作区自有行改为「收录」。
3. 列表复选框目前是装饰（`SkillTable` 的 `Checkbox` 无 state、无批量动作）→ 接批量。
4. 位置被禁用后 `roots` 少一项，磁盘上已存在的链接会从行里"消失" → 按 id 兜底显示。
5. Codex / Copilot 还没有 `skillLocation` 贡献，菜单里根本不会出现（用户举例的 Codex 今天做不到）。

## Skills 全部页面迁到新画布（2026-10-09，用户「再把 skill 其他的页面也重构到新的画布里面」）

`designs/skills.pen` 现在有 12 块板，**没有为任何单个问题另开画板**：

| 位置 | 画板 | id |
| --- | --- | --- |
| x0 y0 | Skills — Grid | `tdqCI` |
| x1560 y0 | Skills — List | `vRdOZ` |
| x3120 y0 | Skills — Dark | `t8pqnG` |
| x0 y1180 | Skills — Multi-place（位置 × 卡片的关系 + 位置面板） | `sxsHb` |
| x0 y2470 | Skills — Install flow（行内按钮恒定 / 安装到菜单 / 批量） | `kNE7x` |
| x0 y3400 | Skills — Detail（灯箱：媒体 + 信息面板，含「位置」区） | `qWqSs` |
| x1560 y3400 | Skills — Files（文件面板滑入：树 + 等宽代码） | `obhn7` |
| x3120 y3400 | Skills — Search（远程搜索：字段 + 6 行结果 + 页脚） | `uIKCe` |
| x0 y4700 | Skills — Import（添加技能 · 本机导入：拖拽区） | `TOk46` |
| x1560 y4700 | Skills — Download（添加技能 · 下载：仓库字段 + 勾选列表） | `Gw8JX` |
| x3120 y4700 | Skills — Delete（删除确认气泡，叠在灯箱上） | `PBdBr` |
| x0 y6000 | Skills — Discard（放弃导入气泡，叠在导入弹窗上） | `N8gfKm` |

设计要点（与前三块板同源）：

- 弹窗一律 **白底 + 24 圆角 + 一档外阴影**，遮罩 `#0A0B0D73`；主按钮只有一个（蓝），取消/关闭/次级一律描边胶囊。
- 灯箱信息面板新增 **「位置」区**（图标牌 + 名称 + 等宽路径 + 本体/链接徽章 + 图标按钮移除），底部 `查看文件`（主）+ `安装 ⌄`（次），
  再下面是 `删除技能`（红描边整宽）——删除是另一类动作，与主流程分行。
- 文件面板 = 左侧 256px 暗条 + 880 面板，头部（返回 / 名称 / 文件 / 关闭）+ 文件树 220 + 编辑器（等宽，行号列 28）。
- 导入弹窗的页脚按钮是**禁用态蓝** `$primary-disabled`（与 DESIGN.md 的 disabled CTA 一致），选中后用 `$primary`。
- 气泡（删除 / 放弃）都用同一套：320 宽、圆角 12、`$hairline` 描边、y8/blur24 阴影、12px 菱形小尖牙，
  尖牙中心对准触发按钮中心、气泡底边在按钮上方 12px。

**验证**：12 块板逐块 problems 扫描无 "fully clipped"；每块导出对照图复核（临时目录、不入库）。
另修掉一处自己造成的误伤：批量改弹窗页脚时 `Get(board, n => n.name === "Foot")` 先命中了**卡片**的页脚
（`Foot` 这个名字在板内多处出现），把 `grill-me` 的「收录」按钮改成了蓝色「导入 2」——
已按 id 还原，并记录教训：**在含背景页的弹窗板里按名字找节点必须带父级条件**（`c.parentCtx.node.name === "Dialog"`）。

## 按 DESIGN.md 校正设计稿（2026-10-09，用户「按照这个 UI 规范来、先改设计稿、不要改代码」）

用户在此前给出的选项里**选了 DESIGN.md**（而不是我建议的换主色），并授权"有交互逻辑不对的也可以修正"。
本轮只动画布，零代码改动。

### 一、规范对不上的 6 处（已改）

| # | 规范原文 | 原稿 | 改成 |
| --- | --- | --- | --- |
| 1 | 阴影只有一档 `0 4px 12px rgba(0,0,0,.04)`；"Don't add drop shadow tiers" | 弹窗 y24/blur56、菜单 y8/blur24、选中分段 y1/blur2 **三档** | 全部收敛成 **一档**（弹窗靠遮罩 + 白底分离，不靠大阴影） |
| 2 | 圆角刻度 none 0 / xs 4 / sm 8 / md 12 / lg 16 / xl 24 / pill 100 / full 9999 | 只有 md/lg/xl/pill | 补 `radius-xs/sm/full`；图标牌 7/10/5 → **8/12/4** |
| 3 | 文字最小档 caption 13 / caption-strong 12 | 表头 11、胶囊 11.5、菜单组标题 11、路径 10.5 | 全部抬到 **≥12**；卡片动作字 12.5 → **13**、按钮 h28/30 → **32** |
| 4 | `text-input` 高 48、padding 14×16、focus 边框 2px 主色 | 搜索框 40 高、1.5px | **48 高 + 2px 主色** |
| 5 | `badge-pill` = `surface-strong` 填充 + ink 文字；"Don't introduce a secondary brand color" | 胶囊用白玻璃 + **9 个分类色圆点** | 胶囊改**中性**（封面用 `$canvas` + `$hairline`，工具栏用 `$surface-strong`），**9 个色点全部删除** |
| 6 | `semantic-down` "text color only, never background fills" | 删除气泡的「删除」是**红色实心** | 改**红色描边 + 红字**（无填充）；顺带把红字在白底上重新上色 |

**有意不下沉的两处**（都写进报告让用户否决）：卡片内边距保持 18（规范的 32 是营销卡）、
封面文档预览行保留 10.5（它渲染的是"文档内容"，不是 UI 文案）。

### 二、交互逻辑修正（4 处）

1. **卡片页脚假箭头**：`本地 · 3 个位置 ⌄` 的箭头看起来像第二个菜单，点下去其实什么都不发生
   （真正可点的是整张卡）。**箭头删除**，改为纯文本。
2. **列表勾选是死的**：`SkillTable` 画了复选框，却没有批量入口 —— 勾了什么也不会发生。
   新画**批量条**（`list` 板表格上方）：`已选 3` 墨黑胶囊 + `取消选择` + 蓝色 `安装到 ⌄`；
   三行复选框画成已勾选状态。
3. **灯箱页脚按钮被压**：批量抬高度时误把灯箱的 `安装` 也改成 32（`查看文件` 是 40）→ 已按父级还原成 40。
4. **更新提示不在规范色板里**：原来用琥珀（规范只有主色蓝 + 两个语义色，琥珀是"仅插画用"）。
   新增 `有更新` 徽章画成 **主色 10% 底 + 主色字**，并把 `检查更新` 按钮保持中性描边。

## 追问：Agent 插件多了，位置页签装不下（2026-10-09）

用户的场景：后续可能装七八个 Agent 插件，页签行会无限横向增长。**定下的规则：行宽恒定 = 固定 3 格 + 1 格 Agent。**

- **≤2 个 Agent**：平铺（一次点击直达，不引入多余一步）。
- **≥3 个 Agent**：第四格收成 `[layers] Agent 9 ⌄`（**这一格的数字和其他页签同义 = 这一档里的技能数**；
  菜单头右侧写「7 个 Agent」= 插件数，两个数字含义不同，所以分开标）。
- **选中某个 Agent**：这一格显示它自己（`[cursor] Cursor 4 ⌄`），宽度不变。
- **≥8 个**：菜单内出现搜索框，列表限高滚动。

画在 `Skills — Multi-place` 板下方的 `Section Tabs`（`GROVn`）里，四个状态 ①平铺 ②收起 ③已选中 ④菜单展开，
页签是**直接从 `Grid` 板 copy 过来的**（保证几何完全一致），菜单是从安装菜单 copy 后重写的 7 行
（图标牌 28 + 名称 + 等宽计数 + 当前项打勾）。

复核对：程序化打印页签子节点 = `[layers图标, "Agent", 9, chevron-down]`，菜单 7 行 463 高、无 clipping。
（视觉复核这次读错了两处——把 `Agent` 读成 `Cursor`、把脚注读成乱码；**密集板上视觉复核不可靠，以打印为准**。）

## 间距修正：名次行与表格行（2026-10-09，用户两张截图）

**问题一：卡片名称行的「有更新」徽章飘在半空。** 根因不是间距数值，是结构 —— `Name Row` 用了
`justifyContent:"space_between"` 却有 **3 个**子节点，剩余空间在**每一对之间均分**，于是
名称 x0(宽26) → 徽章 x83 → 时间 x193，徽章被推进卡片中段的空档里。
改法：**名称 + 徽章包进一个 `Name Cluster`（gap 8）**，`space_between` 恢复成两个子节点
（簇在左、时间在右）。实测徽章 x34，紧贴名称右缘；时间右对齐不变。

**问题二：列表行太挤。** 量出来的事实：`Skill Cell` 高 54 而行高 56 —— **上下各只剩 1px**；
名称 18 + 间隔 2 + 描述 34 = 54，**文字块自己也是零余量**。而描述在 292px 列宽里**几乎每行都折成两行**
（12px 约 48 字/行），2 行是常态不是例外 —— 所以行高必须按两行定，不能按一行。

| | 原 | 现 |
| --- | --- | --- |
| 行高 | 56 | **66** |
| 文字块 | 54（零余量） | 58（上下各 4px） |
| 名称 ↔ 描述 | 2 | **6** |
| 表格卡片高 | 660 | **628**（= 56 批量条 + 44 表头 + **8 行 × 66**） |

卡片高度刻意取整成 8 行，**折叠正好落在行边界上**（不出现半行），下方分页完整可见。

**顺带查到并修掉一个真 bug**：列表页的**分页器画在表格上方**（`Footer` y293 < `Table Card` y361）。
原因是当初 `Insert` 表格卡片是 append，跑到页脚后面去了 —— 已 `Move` 回页脚之前，
顺序现在是 标题 → 工具栏 → 标签筛选 → 表格 → 分页。

列表的 `tdd` 行也补上了与网格卡一致的 `有更新` 徽章（同一份数据要在两个视图里说同一句话）。

## 删掉两个假指标 + 来源做成链接（2026-10-09，用户："token 数和触发词好像没什么用""来源应该是 upstream.source，是个 link"）

**用户是对的，而且比"好像没用"更严重 —— 这两个字段在真实链路上恒为 "—"：**

- `triggers`：**全代码库没有任何地方写入**。`toSkill()`（磁盘记录 → 行的唯一映射）连这个字段都不产出，
  只在 `page.tsx` 的示例数据里有。列表的 TRIGGERS 列、详情的那一行，结构上永远是破折号。
- `tokens`：`toSkill(row, store, locale, tokens?)` 的第四个参数**从未被传**（`library.ts:429` 只传三个），
  所以 TOKENS 列同样恒为 "—"。
- 证据链：`grep triggers` 只命中 `messages.ts`（文案）、`types.ts`（类型）、`page.tsx`（示例）、
  `skill-detail-dialog.tsx`（渲染 `?? "—"`）——**没有生产者**。

**改动（画布）**：

1. **列表**：删掉 TOKENS、TRIGGERS 两列；补上此前缺失的 **32px 复选框列**（上一轮加的批量条本来就没有对应列，
   是个自相矛盾）；列宽改 **32 / 491 / 210 / 175 / 110 / 70 = 1088**，表头剩 技能·标签·位置·更新时间·操作。
2. **来源**：不再编造「本地导入 · 2026-10-06」（那个日期还是和「更新于」重复的），改为真实字段
   `upstream.source`，并**做成链接**（主色等宽字 + `external-link` 图标）：
   ```
   来源                                        [检查更新]
   mattpocock/skills ↗
   上次检查：2 小时前
   ```
   它落在**更新按钮旁边**是有原因的：更新动作就是对着这个来源做的，"一个事实一个家"。
3. **详情里的 Token 数 / 触发词两行删除**，只留真实存在的「更新于」。

**链接目标怎么算**（落地时的规则，写进代码注释）：`sourceType === "github"` 且 `source` 形如 `owner/repo`
→ `https://github.com/<source>`，`skillPath` 非空再补 `/tree/HEAD/<skillPath>`；
`source` 本身是 http(s) URL 就直接用；其余（本地路径、ssh git）**不渲染成链接**，保持纯文本。

**顺带**：`Skills — Files` 与 `Skills — Delete` 两块板（都是早期从详情板 `Copy` 出来的）也残留着这三行，
已一并清掉——**复制出来的板必须跟着改，否则画布里会出现互相矛盾的旧数据**。

## 详情面板补回「删除技能」入口（2026-10-09，用户："这里的删除也没有啊"）

**是真的漏了**：`Button 删除技能` 只存在于 `Skills — Delete`（气泡演示板）里，主详情板 `Skills — Detail`
**根本没有这个按钮** —— 用户看的就是主详情板。上一轮删掉 Token/触发词两行时也没人补回来。

**补法**：详情面板底部固定操作行（`查看文件` + `安装 ⌄`）**上方**，加一行：
`Body Spacer`(13) + `Danger Row`(40) → **整宽、红描边 `#CF202F59`、红字 `$semantic-down`、`trash-2` 图标**（无填充，
符合 DESIGN.md 的 "semantic-down: text color only"）。它与主流程分开一行，读作"另一类动作"。
`Skills — Files` 板里被文件面板盖住的那块信息面板也同步补上（否则三块板的"面板内容"不一致）。

**踩到的坑（值得记）**：这个 40px 的行是给 `Panel Body` 加第 6 个子元素，**必须先把预算算干净**：
```
Panel Body 592 = 20(上内边距) + 60+18+24+18+217+18+126(=481) + 18 + spacer + 18 + 40
⇒ spacer = 13（不是 51，也不是 fill_container）
```
我第一次给了 `fill_container` 并手算成 51，结果 `Danger Row` 落到 body 底部之外 36px（`problems` 报 fully clipped，
**但视觉复核还说"没有裁切"**——又一次证明以打印为准）。第二次改成 13 后：`Danger Row` y550，底边 590 < 592 ✓。

**核对**：三块详情类板（Detail / Files / Delete）现在都有同一个删除入口，全库 `fully clipped` 扫描只剩
列表卡片被表格折叠切掉的两行（预期）。删除气泡的位置也重新量过：气泡底边 755、按钮顶边 773（间距 18），
小尖牙中心在按钮右缘内 30px 处 —— 仍然指着它。

## 两个导入弹窗改成"行内直接安装"（2026-10-09，用户："就和那个搜索一样，直接点击安装就行了。下面那个底部的按钮不要了""下载这一块逻辑上是不是也有问题，两个页面 UI 都重复了"）

**用户看到的重复是真的**：`本机导入` 与 `从仓库` 当时是同一套壳（列表 + 复选框 + 页脚 `取消 / 导入 N`），
只换了数据来源 —— 那个页脚就是第三个按钮组，而且"先勾选再提交"对安装这种**可逆、单条**的动作是多余的一步。

**统一模型（两个分段共用）**：

```
Head（标题 + 说明 + ×）
Segments（本机导入 | 下载）
Source Wrap（列表从哪来）   ← 本机：扫描后的文件夹条；下载：仓库输入框 + 列出
Divider
Results（行列表，每行右侧一个动作）
× 没有页脚
```

行 = `Tile 36 + 名称(等宽 13.5/600) + 第二行(等宽路径 11.5)` + 右侧 `安装`（次级胶囊 h30）；
已在本库的行显示 `✓ 已安装` 徽章（与搜索弹窗同一套）。**装完即生效，不再有"提交"这一步。**

尺寸：Import = `96 + 52 + (96+1+224)` = **469**（3 行 × 68）；Download = `96 + 52 + (80+1+360)` = **589**（5 行 × 68 ×）。

**连带删掉了 `Skills — Discard` 板**（"放弃导入？"确认气泡）：它的锚点就是页脚那颗 `取消`，
而现在没有"未提交的选择"可丢了 —— **气泡的锚点消失，这个确认就没有存在的理由**。
（删除键的确认气泡仍然保留：删除是不可逆的。）

**踩到的坑（这次连踩两个）**：

1. **`Get(board, n => n.name === "Body")` 命中了卡片**（网格卡内部也叫 `Body`）—— 我的新内容插进了
   `Card impeccable` 的 Body，把它撑到 441 高，而弹窗真正的 Body 一个字节都没动。
   必须按 **parent 过滤**：`c.parentCtx.node.name === "Dialog"`，或者直接用已知 id。同理 `Get("pxfen")` 误删事件：
   **绝不用记住的 id 删节点**（那次删掉了列表 `有更新` 徽章的文字），要按"名字 + 父级"重新定位。
2. **同一个 execute 调用里读到的 bounds 是旧的**：刚插完时 `Divider` 报 y130、`Results` 报 h360 且一堆 false clipping，
   下一个调用再读就变成 y80 / 441 干净了。**插入后隔一次调用再验证。**
3. `Body` 从旧结构继承了 `padding [0,20,16,20]` → 与新插的 640 宽 `Divider` 打架（左内边距把整行推歪、
   满宽矩形溢出）→ 必须显式把 padding 归零。

## 详情面板：位置区即安装入口，删除移到底部右（2026-10-09，用户三条反馈）

**① 页脚的「安装 ⌄」删掉。** 用户："这一块应该不需要安装这个按钮了，因为在位置这一块就可以把工作区和
Agent 这一块都列出来，直接在这个地方点击安装就行了"。

**② 「位置」区的逻辑确实不对 —— 这是本轮最实质的修正。** 原来它只列**已经在哪**（3 行，全是"移除"），
于是想装到一个**还没有**的位置时，那里根本没有东西可点 —— 而这恰恰是"安装"最常见的情形。
它和卡片上的 `安装到` 菜单（勾选=装到那儿）也是两套逻辑。

改成**列全部可选位置 + 行内动作**：

| 行 | 右侧 |
| --- | --- |
| 技能库（本体） | `本体` 徽章（不动它，那是文件的来源） |
| 工作区 .agents（已装） | `移除` 描边胶囊 |
| Claude Code（已装） | `移除` 描边胶囊 |
| **Cursor（未装）** | **`安装` 实底胶囊** ← 新的入口 |

- 区块标题右侧的计数改为 **「已装 3」**（原来写 `3`，容易被读成"共 3 个位置"，而列表有 4 行）。
- 与卡片菜单共用同一套动作词：`安装` / `移除`。
- **列表行仍是数量、位置区才是明细** —— 这条规则不变。

**③ 「删除技能」移到底部右侧。** 原来是 body 里一条整宽的红描边行，现在并进页脚：
`[查看文件（主色，占满）] [🗑 删除技能（红描边）]`，同一行、同高 40、右对齐。
`Button Body Spacer` 与 `Danger Row` 一并删除。

**预算（这次算对了）**：`Panel Body 592 = 20(pad) + 60+18+24+18+283(位置区) + 18+126 + 3×18(间隔)`，
底部留 25px 空隙，**不再放 Spacer**（给 7px 的 spacer 等于没有，不如让它自然收尾）。
位置区自身 = `19(标题) + 10 + 4×56`。

**同步**：`Skills — Files` 与 `Skills — Delete` 的隐藏面板也按同一份代码重建（三块板必须一致）；
`Skills — Delete` 里确认气泡的位置随之重算 —— 气泡底边 5546、按钮顶边 5558（间距 12），
小尖牙中心 x 4334.5 = 按钮中心 4334（仍指着它）。

## 信息面板中部改为竖向滚动 + 自定义滚动条（2026-10-09，用户："中间这一块应该是可以竖向滚动的，要有滚动条…设计得好看一点，不要用原始滚动条"）

**为什么必须滚**：`Panel Body` 是固定 592 高（头部 84 + 页脚 64 之外的全部）。位置区一行 56，
7 个位置就是 481 —— 加上描述、标签、来源块，内容 765 > 592。**这不是极端情况**：
按用户"七八个 Agent 插件"的预期，溢出是常态。

**画布做法**：位置区补到 **7 行**（本体 / 工作区 / Claude Code 已装；Cursor / Gemini CLI / Qwen Code / Cline 待装），
内容自然溢出，底部裁在 `来源` 那一块 —— 这本身就是"还能往下滚"的暗示。滚动条画在面板右侧：

| | 值 |
| --- | --- |
| 位置 | `x 348`（面板右缘内 7px），上下各留 **32px** |
| 轨道 | 5px 宽、`$radius-pill`、`#0A0B0D0F`（6% 墨） |
| 滑块 | 5px 宽、高 **400**（= 528 × 592/765 ≈ 78%，与内容比例一致，没有画大画小） |
| 滑块色 | `#0A0B0D2E`（18% 墨） |

**落地时怎么实现**（写进注释）：`scrollbar-width: thin` + `scrollbar-color: rgba(10,11,13,.18) rgba(10,11,13,.06)`
（Firefox / 新版 Chromium）+ `::-webkit-scrollbar { width:5px }` / `-thumb { border-radius:999px; background:… }`
（WebKit）；**`scrollbar-gutter: stable`** 防止滚动条出现时内容横向跳一下；hover 时滑块加深到 ~30%。
三块带面板的板（Detail / Files / Delete）都同步加了这条滚动条。

### 修正：内容溢出到页脚底下（2026-10-09，用户："内容溢出了"）

**根因**：`Panel Body` 只设了固定高度，**没有 `clip`** —— 内容超过 592 就直接画出去，压在
`查看文件 / 删除技能` 那一行上（用户截图里 Cline 那一行正是被按钮盖住）。
**修法**：给三块板的 `Panel Body` 加 `clip: true`。

现在边界是干净的：可见内容到 `Cline` 行为止，再往下是页脚上缘的分割线；被裁掉的是 `来源` 区块，
只露出一点点——那正是"还能往下滚"的提示。滚动条同时显示"还没到底"（滑块在 78% 位置）。

**这里有个通用教训**：**固定高的滚动容器必须同时开 `clip`**，否则"限高"只是画了个框，内容照样穿出去。
Tailwind 里对应 `overflow-hidden`（配合 `overflow-y-auto` 的实现方式见上）；`.pen` 里就是 `clip: true`。

## 新增「完整版」画板 + 类型可增删（2026-10-09，用户两条）

**① `Skills — Detail (full)`（`ceLop`，x0 y6000）。** 用户："现在这个滚动条是把东西给截取了，相当于看不完整"。
滚动条是"视口不够时"的正确行为，但**评审时需要一张能一眼看全的图**，所以把同一块详情板复制一份：

- 面板高 **913 = 84(头) + 765(内容) + 64(页脚)**；`Panel Body` 精确等于内容 765，**`clip:false`、去掉滚动条**。
- 内容天然排满：描述 60 + 间隔 18 + 类型 24 + 18 + 位置区 481 + 18 + 来源/更新于 126 = 765。
- 弹窗 1136×913 居中；媒体区同步拉高（只是撑开，未重新排版）。

**两份是同一套设计、两种状态**，不要只改一份：
`Detail`（视口不够 → 滚）与 `Detail (full)`（看得全）。

**② 类型（标签）现在能增能删。** 用户："那个类型，那块不能新增也不能删除，这块有问题"。
原先只有两枚静态胶囊 —— 那只是"展示"，不是"编辑"。改为：

- 每枚胶囊 = `Design` + **右侧 15px 圆形 × 按钮**（点击删除）；
- 行尾一枚描边胶囊 **`+ 添加类型`**（点击进入添加，可做成输入框或下拉建议）。

**四块带面板的板全部同步**（Detail / Files / Delete / Detail (full)），胶囊仍是 24 高，
所以面板预算不变（`Tags` 行 98→122 之间那 24px 没有被撑高）。

## 新增「技能详情的状态」说明板（2026-10-09，用户纠正："不是你搞错了，是一个描述的一个画布"）

**我先理解错了**：以为要"更大的弹窗"，其实要的是**像 `Multi-place` 那样的说明板** ——
标题 + 副标题 + 标注框，用文案写清「不同状态应该显示成什么样」。所以补了第 13 块板
**`Skills — Detail (spec)`**（`tF7bO`，x1560 y6000）：

- **左列**：默认状态的面板（从 `Detail` 复制，**带滚动条**的那一版 —— 标注的是"内容溢出时可滚"，
  所以不能用"完整版"那张，否则图文自相矛盾）；上方一行小字说明是什么状态。
- **右列**：六张说明卡，逐条写清条件与外观：
  ① 位置行三态（本体 / 已装→移除 / 未装→安装，且"未装也列出来"是唯一安装入口）
  ② 类型可增可删（× 删除、+ 添加类型）
  ③ 中部溢出才滚（含滚动条的五项规格）
  ④ 来源：没有 upstream 就整块不渲染，不留空行
  ⑤ 有更新时：徽章 + 按钮变「更新」+ 本地被改过的提示
  ⑥ 删除要二次确认（气泡锚在按钮上，不叠第二层模态）
- 板高 937 = `40 内边距 + 64 标题 + 24 间隔 + 769 内容行 + 40`。

**教训**：用户说"画布"时指的是**说明板**（有文案讲状态），不是又一张放大稿。
`Multi-place` 就是这种板的样板：**左边给样子、右边给规则**。

## 全画布审计（2026-10-09，用户："检查一下整体的画布…设计上的问题…交互逻辑上有没有缺陷"）

程序化扫了 13 块板（重叠 / 裁切 / 阴影档位 / 非 token 颜色 / 字号下限 / 文案一致性 / 板间数据一致性），
**查出 6 个真问题，已全部修掉**：

| # | 问题 | 证据 | 修法 |
| --- | --- | --- | --- |
| 1 | **列表「操作」列装不下按钮**（列 70，按钮 88 → x=-18，压到「更新时间」列上） | `btn w88 / cell w70 / x -18` | 列宽改 **32/469/210/175/110/92 = 1088**（从「技能」列借 18），按钮现在 x=4 稳在列内 |
| 2 | **搜索弹窗页脚被裁**（对话框 621 高，页脚 569+64=633） | `Foot y569 h64 / dialog h621` | 对话框 **621 → 633** 并重新居中 |
| 3 | **`Multi-place` 与 `Install flow` 两块板重叠 40px** | 1180+1330=2510 > 2470 | `Install flow` 下移到 **y2550** |
| 4 | **列表只有 10 行，页脚却写「显示 12 / 15」**（页大小 12） | cards 12 / rows 10，缺 hand-made、prototype | 补齐两行，两个视图现在都是同一批 12 个技能 |
| 5 | **同一个「收录」按钮在网格与列表长得不一样**（网格＝实底无描边，列表＝透明+描边，暗色又是另一套；另有 1 个离群） | 30 个按钮 3 种样式 | 统一为：**安装 / 收录 = 实底 `$surface-strong`**，**移除 = 描边**（撤销性动作），删除 = 红描边 |
| 6 | **暗色板的封面标签胶囊是半透明的**（照片透过来 → 视觉复核误判成"文字重叠"，实测坐标并没有重叠） | light `$canvas`+`$hairline` vs dark `#FFFFFF1F`+`#FFFFFF24` | 暗色改**不透明** `#16181CF2` + `#FFFFFF24` 描边 |

顺带修的：`Action 安装` 有 1 个透明底、7 个 `$surface-soft`（其余 115 个是 `$surface-strong`）→ 全部归一。

**扫过没问题的**：阴影只有一档（全部 12px blur）✓；字号下限只有卡片封面的文档预览是 10.5（那是内容，非 UI）✓；
动作词一致（安装 124 / 收录 30 / 移除 12 / 删除 5 / 检查更新 15）✓；三块主板的页签计数一致（15/10/5/2）✓；
卡片的「N 个位置」与详情面板的「已装 N」一致 ✓；无残留「卸载 / 启用 / 开关」字样（仅说明文案里引用）✓。

### 仍然存在的**交互设计缺口**（不是瑕疵，是没画，需要你决定要不要补）

1. **两个入口做同一件事**：工具栏「搜索」（搜注册表）与添加弹窗的「下载」分段（列仓库）最终都是"按行安装"，
   两个弹窗、一个动作。建议合并成一个对话框 + 数据源切换（注册表 / 仓库）。
2. **删除只能从详情面板进**（两次点击）。卡片/列表没有入口。
3. ~~**空状态 / 加载 / 失败三种状态全画布都没画**。工具类界面这些状态是日常（首次打开没有技能、CLI 拉取超时）。~~
   → **已补**：见下方「空 / 加载 / 失败」一节（板 17 `Skills — States`）。
4. **暗色只覆盖了网格页**：详情灯箱、文件面板、各弹窗在暗色下长什么样没有定义。
5. **hover / focus / disabled 三态没有画**（只有导入弹窗的禁用按钮画了 `$primary-disabled`）。
6. **位置区无上限**：7 个位置已占 481px，再加就得滚过整个列表才能看到「这技能是干嘛的」。建议限高 4 行 + 内部滚动。

## 新增「上传图片 / 视频」说明板（2026-10-09，用户："上传图片的时候这个 UI 好像没有…希望可以截图然后粘贴"）

**用户说的两件事**：① 画布里根本没有"上传"这套 UI（只有一枚 `+` 磁贴和一行提示，点下去发生什么没定义）；
② 希望支持**截图后直接粘贴**。

新增第 14 块板 **`Skills — Upload`**（`eO9KR`，x0 y7200，1440×815）：

**上半：三种状态并排**（各 420 宽）

| | 状态 | 内容 |
| --- | --- | --- |
| ① | **点 + 弹出入口菜单** | 240 宽浮层，**锚在 + 磁贴左缘上方（bottom 距磁贴顶 9px）**，三项：`选择文件…（从本机挑一个或多个）`、`从 URL 导入（贴图片直链）`、`粘贴（Ctrl + V · 截图直接进来）` |
| ② | **拖拽悬停** | 整个媒体区变落点：`$primary` 2px 描边 + 8% 主色底 + 白圆环里的 `image-plus` + 「松开即上传」+ 支持格式 |
| ③ | **粘贴** | 截图直接进缩略图行，底部深色胶囊提示「已粘贴 1 张截图」 |

**下半：四张说明卡**

- **入口只有三个，行为一致**：点 + ／拖进媒体区／Ctrl+V。**粘贴在灯箱内任意位置都生效，不要求先点中媒体区**
  —— 截图之后不该还要先存成文件。
- **粘贴要处理的三种剪贴板内容**：位图（截图工具最常见）→ 直接上传；文件（资源管理器复制）→ 按文件、多个一起；
  **纯文本 / URL → 不吞掉**，提示"剪贴板里是文本，不是图片"，避免用户以为粘贴坏了。
- **上传中与失败**：上传中是占位骨架 + 细进度条，**不阻塞**其它操作；失败那格红描边 + 感叹号，点开给原因（格式/大小/网络）+ 重试；多文件各自独立，一个失败不影响其余。
- **限制与校验（先声明，再拦截）**：接受 PNG·JPG·GIF·WebP·MP4·WebM，**其余在选择器里就灰掉**（不给"选了才报错"）；
  大小与数量上限写在提示行里；16:9 之外的比例照收，卡片按资源自身比例排（瀑布流已支持）。

**同步**：三块灯箱板的媒体区提示文案改为
「拖入图片或视频，点 + 上传，或按 Ctrl+V 粘贴截图 · 建议 16:9」。

**落地要点**（写进代码注释）：粘贴监听挂 **document 级**、只在灯箱打开时启用；用 `clipboardData.items` 判定
`kind === "file"` 与 `type.startsWith("image/")`，对文本内容**不调用 `preventDefault`**，让输入框照常粘贴文字。

### 修正：上传板的交互逻辑画错了（2026-10-09，用户："从 URL 导入我应该怎么导啊？没有要输入的地方啊…拖拽悬停这个是怎么触发的？"）

用户两条都对，是我把两件事混成了一件。重画这块板（`Skills — Upload`，`lmsUt`）：

**① 原稿把「拖拽悬停」画在「选择文件」下面 —— 错。** 拖拽是**作用于整个媒体区的手势**，
跟"选文件"没有先后关系。现在板上并排四个状态，标题直接写明关系：

| 状态 | 属于 | 触发 |
| --- | --- | --- |
| ① 点 + → 入口菜单 | 菜单路 | 点缩略图行的 `+` |
| ② 选了「从 URL 导入」→ 就地展开输入 | 菜单路 | 点菜单第二项 |
| ③ 拖拽悬停 | **手势路** | 把文件拖到媒体区（舞台/缩略图行/提示行都算），**不经过菜单、不用先点 +** |
| ④ 粘贴 | **手势路** | 灯箱内任意位置 `Ctrl+V` |

**②「从 URL 导入」根本没有输入框 —— 补上**：菜单**原地换成** 240 宽输入面板（不叠第二个弹窗）：
标签「图片直链」+ 单行等宽输入 + `取消` / `导入` + 校验说明（`http` 与 `https` 都收，见下）。
导入走"**先下载再落盘**"：失败就报错，**绝不写空记录**（否则列表里会出现点不开的资源）。

**③ 直链不强制 HTTPS**（用户："图片直连，不强制 HTTPS"）。原来的校验写的是"必须 http(s)"，看着像要求加密；
改成 **`http` 与 `https` 都收**，只要求"能取到图"。安全的理由是**取图这件事发生在服务端**（先下载再落盘），
浏览器不会直接去加载这个 http URL，所以不受混合内容（mixed content）拦截 —— 这条也写进了卡片。

**④ 补两张卡**：「两条路，不要混在一起」（菜单路 vs 手势路）；「上传中 / 失败 / 粘贴到非图片」
（上传中不阻塞、失败那格红描边+重试、剪贴板是文本时**不拦截**只提示）。

**⑤ 去掉落点里那个白圆环**（用户："那个圆环的头像是什么东西啊？我不要啊"）。原稿在「松开即上传」上面放了
一个 48×48 的白色圆（`$canvas` 填充 + `$hairline` 描边），而图标是它的**兄弟节点**，所以圆里是空的 ——
看起来就是一个**空白头像**。删掉圆，图标放大到 28×28、块间距 10：`Icon → Title → Sub` 三段。
**教训**：装饰性圆环只有在"装得下里面的东西"时才有意义；现在这样空着一圈，读者只会以为图没加载出来。

## 没有上传图片时，封面放什么（2026-10-09，用户："如果说我没有上传资源图片，它那个地方展示 skill 的正文会不会有点不好看啊…有没有更好的方法"）

> 结论：**采用 A（文件树）**，已铺到全部 9 块板的 72 张卡，详见本节末尾的"已采用 A"。

**用户看到的是真的。这不是口味问题，是两处实打实的缺陷：**

1. **同一句话读两遍。** 无媒体的卡走 `MarkdownCover`，它渲染 `SKILL.md` 正文的前 640 字；而卡片正文里的
   描述是 `skill.description`，而 `Skill.summary` 与 `Skill.description` **在 `toSkill()` 里被赋成同一个值**
   （`row.description`）。所以封面那段和描述那段是同一句话。画布上 `finesse-ui` 卡：封面
   "Build never-cheap, high-craft / web interfaces."，描述 "Build never-cheap, high-craft web interfaces across registers."
2. **第一行被标签胶囊盖住。** 画布上 `Doc` 的 `padding` 还是 `[16,18]`，而标签在 `y 12..32`（绝对定位）——
   `# Finesse UI` 正好落在下面。代码里 `MarkdownCover` 是有 `pt-10`（40px）的，**画布和实现不一致**。
3. 字号 10.5 也在 **12px 的字号下限以下**，这才是它看着像"小字堆"而不是封面的原因。

**关键发现：列表视图早就解决了。** `SkillThumb` 在无媒体时不画文档，只画一个 36px 的"文档条"
（三条递减宽度的细线，`bg-surface-raised` + `secondary-foreground/78|56|28`），**一个字的正文都不重复**。
所以修法是让网格向列表靠，不是再发明一套。

新增第 15 块板 **`Skills — Cover without media`**（`Q2oXL`，x0 y8300，1440×1008）：四张**完全同尺寸**的卡
（264 宽、封面 148 = 16:9 回退比例），只换封面，下面各配一张说明卡：

| | 封面内容 | 结论 |
| --- | --- | --- |
| 现状 | `# 名称` + 描述段落（等宽 10.5） | 与卡片描述重复 |
| **A · 文件树** | `SKILL.md` / `references/` / `  checklist.md` / `scripts/` + 底部 `12 个文件 · 3.2k` | **推荐** |
| B · 章节大纲 | `1 何时使用` / `2 红绿重构循环` / `3 集成测试的形状` / `… 还有 4 节` + `8 节 · 3.2k` | 与 A 抢同一位置 |
| C · 占位板 | 居中的 `file-text` 22px + `3.2k tokens` | 最克制，但半屏是灰的 |

**为什么推荐 A**：卡上已经有名称、描述、来源、时间；能填这块又**不重复**的信息只有一条 —— "这技能装了什么"。

**为什么 A 是零成本的**：`useSkillBody()` 调 `store.get(skill.id)`，返回 `{ body, files, assetDetails }`，
而它**只取了 `.body`，把 `files` 丢掉了**（`SkillFileEntry = { path, depth, directory, bytes }`）。
也就是说文件树这条数据已经在返回里，A 方案不用多发一次请求。`tokenLabel(body)` 也已经存在
（`>=1000 ? (n/1000).toFixed(1)+"k"`），卡上从来没用过。

**要一起修的**：`MarkdownCover` 在读取失败时的回退是 `"# 名称 + 描述"` —— 那是重复最严重的一种
（标题 = 名字、正文 = 描述）。这个回退应该直接换成 C 的占位板。

### 已采用 A，并铺到全部 9 块板（2026-10-09，用户："可以、就按照 A 的方法来吧"）

**改了 72 张卡**：`Grid` 8 + `Dark` 8 + 7 块带背景网格的弹窗板（`Detail` / `Files` / `Search` / `Import` /
`Download` / `Delete` / `Detail (full)`）各 8。现在只剩对照板上那张**故意保留**的"现状"样例还是旧画法。

每张卡的封面从「`# 名称` + 描述段落」换成：

```
SKILL.md          ← $ink / 600
references/       ← $body
  checklist.md    ← 缩进两格表示嵌套
scripts/
─────────────────
12 个文件 · 3.2k tokens   ← 等宽 11 / $muted-soft
```

**每张卡的文件树按技能内容分别写**（不是复制同一份）：`wizard → references/prompts.md`、
`shadcn-ui → registry.md / templates/`、`code-review → standards.md / adr.md`、`tdd → cycles.md / seams.md /
scripts/scaffold.sh`…

**行数预算**（这次算出来的，实现时要照抄）：

$$\text{行数} = \left\lfloor \frac{\text{封面高} - 28_{\text{统计条}} - 40_{\text{让开标签胶囊}}}{18_{\text{等宽 12px} \times 1.5}} \right\rfloor$$

| 封面高 | 可用 | 行数 |
| --- | --- | --- |
| 132 | 64 | 3 |
| 148 | 80 | 4 |
| 180 | 112 | 6 |

**顺带修掉的**：`Doc` 的 `padding` 从 `[16,18]` 改为 `[40,18,0,18]`，和代码里的 `pt-10` 对齐
（原来第一行被标签胶囊盖住）。没标签的卡用 `14`（对应代码里的 `pt-3.5`）。

**给实现的落点**：
- `library.ts` 的 `useSkillBody()` 现在只返回 `body`，需要让它（或一个新的 `useSkillFiles()`）把
  `store.get(id)` 返回里已有的 `files` 一起交出来 —— **不用新增接口**。
- `page.tsx` 的 `MarkdownCover` 换成 `FileTreeCover`；`tokenLabel(body)` 复用它算 `3.2k tokens`。
- 读取失败的回退改成 C 的无内容占位板（居中的 `file-text` + 计数），不要再回退到 `"# 名称 + 描述"`。

## 本地搜索：引擎已经在了，只差一个输入框（2026-10-09，用户："没有搜索的功能，目前的搜索功能应该是探索，就是探索远程的 skill，但是搜索本地的好像没有这个功能啊"）

**用户说对了，而且比想的更"离谱"**：本地搜索的**引擎已经完整实现**，只是没有任何界面去调用它。

| 层 | 状态 |
| --- | --- |
| 类型 `SkillQuery.q` | ✅ 定义在 `store.ts`：按 `name` + `description` 不区分大小写匹配 |
| host 实现 `skills-fs.ts:461` | ✅ 已实现（`needle = query.q?.trim().toLowerCase()`，与 `tag` / `enabled` 组合） |
| remote 实现 `remote-store.ts` | ✅ 已把 `q` 拼进查询串 |
| 调用处 `page.tsx` | ❌ 只传了 `store.list({ sort: "updated" })` —— **从来没传过 `q`** |

而工具栏最右那个按钮叫「搜索」，点开是 `SearchSkillsDialog`，搜的是**远程注册表**（`skills.search.*` 一族文案、
`RegistrySource.search`）。**名字骗人**：用户以为能搜本地，实际是探索远程。

新增第 16 块板 **`Skills — Local search`**（`PXtF0`，x0 y9500，1440×1853），四个状态叠放 + 两组说明卡：

| | 状态 | 要点 |
| --- | --- | --- |
| ① | 现状 | 工具栏最右「搜索」→ 实际搜远程，本地一条也搜不了 |
| ② | 建议 · 空闲 | 搜索框进**筛选行**与标签并排；最右按钮改名 **探索**、图标换 `compass`；框内右侧留 `/` 快捷键提示 |
| ③ | 建议 · 输入中 | 查询 `design` → 3 个匹配；标签页计数变 `3/3/0/0`（**0 的置灰**）；匹配片段用主色标出 |
| ④ | 建议 · 无结果 | 空状态回显查询词 + 一条出路「探索远程技能」 |

**为什么搜索框放在筛选行而不是工具栏**：它和标签做的是同一件事 —— 收窄当前这份列表。工具栏只有 1128 宽，
4 个标签 + 4 个动作已经排满，塞不进 300 宽的输入框。放筛选行的代价是行高 34 → 44，向下推 10px；
内容区底部到页脚有 40px 余量，放得下。

**③ 那个 3 是真数出来的**，不是编的：在画布这 15 条里，`design` 命中 `impeccable`（描述 "Design, redesign,
critique…"）、`design-taste-frontend`（名字 + "redesigns"）、`prototype`（"…answer a design question."），
三条都在技能库，所以计数是 `全部 3 / 技能库 3 / 工作区 0 / Claude Code 0`。

**四条规则**：①「搜索」与「探索」是两个动词（本地即时 / 远程要网络要安装），位置和图标都分开；
② 这是纯 UI 工作，别去动引擎；③ 搜索与标签是 AND 且各自可单独撤掉，计数描述过滤后的集合，**不要偷偷把匹配
范围扩到 tags**；④ 细节 —— 防抖（`store.list({q})` 是往返，页面已有 `generation` 计数器处理乱序返回的先例）、
`/` 聚焦 `Esc` 清空、匹配片段主色标出、搜索词属于视图状态。

**要改的文案**：`messages.ts` 的 `skills.action.search` → `skills.action.explore`，值改「探索」（英文 Explore）。

### 修正二：③ 里还残留着两批「结果行」，筛选不该产生新的列表页（2026-10-09，用户："筛选后，那个这个 list
列表页应该就不要了，就我们直接就展示我们的表格或者卡片页"）

**用户圈出的是 6 行紧凑结果行**（`code-review` / `code-hand-made` / `code-prototype` + `impeccable` /
`design-taste-frontend` / `prototype`）。查出来是**两批残留**：`B5GXAq`（第一版画的 3 行）和
`cSuee`（第二版画的 3 行），**都在同一个 `Strip 输入中` 下**。

> **教训：`Delete(find(...))` 只删掉第一个匹配。** 我上一轮用 `Delete(find("Results"))` 以为清干净了，
> 实际上只删了一个 —— 因为 `find` 返回的是全局第一个叫 `Results` 的 frame（那次正好命中 `Skills — Download`
> 板里的那个）。**全局搜索同名节点时必须遍历删除**，不能只取 `[0]`。这次是用户发现的。

清掉两批之后，③ 里只留**卡片**。同时把「筛选不换视图」写死成规则：

> **筛选不产生新视图**：你在卡片视图就还是这套卡片（12 张变 4 张），在表格视图就还是那张表（只是行变少）。
> 没有任何"结果态"的新页面、新列表、新排版。

**配套的另一条**：匹配高亮只在**表格视图**里加主色（行与行长得一样，不标出来找不到是哪几个字命中）；
**卡片视图不加** —— 那会变成另一种"结果态"，而筛选不该产生新的视觉状态。

### 筛选维度：名称 + 描述 + 类型（同一次对话，用户："筛选条件可以是筛选 skill 名称、skill 描述、skill 的类型"）

**这一条推翻了上一轮我自己定的规则**（当时写的是"别偷偷把匹配范围扩大到 tags"）。用户要的是三维都参与，
并且新增了证据：**`finesse-ui` 只有标签命中** —— 名字 `finesse-ui` 和描述 `Build never-cheap, high-craft web
interfaces across registers.` 都不含 `design`，唯一的命中点是它的标签 `Design`。

在画布 15 条真实数据上实算：`design` 命中 **4** 条 ——

| 卡 | 名称 | 描述 | 类型 |
| --- | --- | --- | --- |
| `impeccable` | | ✅ | ✅ |
| `design-taste-frontend` | ✅ | ✅ | ✅ |
| `prototype` | | ✅ | |
| **`finesse-ui`** | | | ✅ |

所以 ③ 从 3 张卡变 **4 张**，标签页计数 `4 / 4 / 1 / 0`（`Claude Code` 为 0 → 置灰）。
搜索框 placeholder 从「搜索名称或描述…」改成「**搜索名称、描述或类型…**」。

**要改的代码**：`host/skills-fs.ts` 的 `list()` 里那段 needle 判断加一个维度：

```ts
!row.name.toLowerCase().includes(needle) &&
!row.description.toLowerCase().includes(needle) &&
!row.tags.some((tag) => tag.toLowerCase().includes(needle))
```

`remote-store.ts` 不用动（`q` 已经拼进查询串，过滤在服务端）。

### 三块主板同步（Grid / List / Dark）

- 筛选行加**搜索框**（300 宽，h44，`$radius-sm`，空闲态：1px `$hairline` + `$muted` 图标 +
  `$muted-soft` 占位文字 + 右侧 `/` 快捷键提示）。搜索框与标签之间 gap 12、标签之间 gap 8 —— 靠间距把
  两组分开。深色版：`#FFFFFF14` 底 + `#FFFFFF1F` 描边 + `#A8ACB3` 文字。
- 筛选行高度 **34 → 44**，以下所有元素（内容区、页脚）**下移 10px**。下移后 Footer 底部分别是
  987（Grid/Dark）和 999（List），仍在 1080 内。
- 工具栏最右的「搜索」**改名「探索」**、图标 `search` → `compass`（三块板各一处）。

**结果：一共 10 块板同步**（3 主板 + 7 块带背景网格的弹窗板：Detail / Files / Search / Import / Download /
Delete / Detail (full)）。弹窗板的背景网格**就是主页面本身**（弹窗盖在上面），所以那里的筛选行和工具栏
必须和主板一模一样，否则同一份 UI 在两块板上对不上。唯一**故意保留**「搜索」的地方是 `Local search` 板的
① 现状 —— 它的存在就是为了对照。

### 顺带：远程对话框也跟着改名

`Skills — Search` 板里那个弹窗的标题原来是「搜索技能」、说明是「从插件提供的注册表里搜索远程技能，装到任意位置。」
—— 它**就是**「探索」的界面，所以改成「**探索技能**」/「从插件提供的注册表里**探索**远程技能，装到任意位置。」

**文案改动清单**（`messages.ts`，都是改值不改 key）：

| key | 旧 | 新 |
| --- | --- | --- |
| `skills.action.search` | Search | Explore / 探索 |
| `skills.search.title` | Search skills | Explore skills / 探索技能 |
| `skills.search.description` | Search remote skills from… | Explore remote skills from… |

输入框里的「Enter 搜索」保留 —— 它描述的是这个框里的具体操作（在注册表里检索），不是功能名。

## `Skills — Import` 的本机导入正文丢了（2026-10-09，用户："这里的本地导入技能好像 UI 丢失了"）

**用户看到的没错。** 原来 `Dialog` 只有：

```
Head (96) + Segments (52) + Body (321)
Body = Source Wrap(96)  ← 文件夹行 review-pack / 已扫到 3 个技能 / 重新选择
     + Divider(1)
     + 【224px 空白】
```

**丢的是整个技能列表**：3 个扫描结果行、「全选」、以及底部的导入按钮 —— 而且 `Dialog` **根本没有 `Foot`**。
对照 `Skills — Download`（同一对话框的另一个分段）是完整的：`Body 441 = 80 + 1 + 360`，分毫不差。

### 重建后的本机导入（`TOk46`，Dialog 469 → **589**）

```
Head      96
Segments  52
Body     365  = Source Wrap 96 + Divider 1 + Rows Wrap 268
  Rows Wrap (padding [6,20,14,20])
    Row code-review   h68   ☑ code-review / skills/code-review/SKILL.md
    Row hand-made     h68   ☑ hand-made  / skills/hand-made/SKILL.md
    Row grill-me      h68   ☐ grill-me   / skills/grill-me/SKILL.md
    Select All Row    h44   [全选]             已选 2 / 3
Foot      76  导入后可以在「技能库」里管理。  [取消] [导入 2 个技能]
```

**行的做法**：左侧 20×20 勾选框（选中 = `$primary` 实心 + 白勾 + `$radius-xs`；未选 = `$canvas` +
1px `$hairline`），中间两行等宽文字（名称 13.5/600 `$ink`，相对路径 11.5 `$muted-soft`）。

**一个刻意的取舍**：行右侧**不放**「选择 / 已选」按钮。左边已有勾选框，右边再放一个是同一个动作的两种表达。
因此代码里的 `skills.add.select` / `skills.add.selected` 不再做可见文案，**只留作 `aria-label`**（整行可点，
无障碍仍需要它）；状态由勾选框和 Foot 的「已选 2 / 3」表达。

**Foot 里的「导入 2 个技能」是动态计数**，不是固定文案：勾选变化时按钮文字跟着变，0 个时禁用（空状态板里
画的就是禁用态 `$primary-disabled`）。

### 顺带补上从未画过的「还没选文件夹」那一屏

代码里有 `skills.add.dropTitle` / `dropHint` / `browseFiles` / `capped`，但**画布上从来没有这一屏** ——
所以"本机导入"的 UI 一直是残缺的。新增第 18 块板 **`Skills — Import (no folder)`**（`O7xPI`，
x3120 y6000，1440×1080，从 Import 板复制后替换 Dialog 正文）：

```
Body 264 = Drop Wrap (padding 20)
  Dropzone 224（$surface-soft + 1px $hairline + $radius-md，内容居中）
    folder-up 28
    把技能文件夹拖到这里
    含 SKILL.md 的文件夹，或一个技能仓库。
    [浏览文件]  ← 实心主色
    一次最多读 200 个文件。   ← 等宽 11.5 $muted-soft，对应 skills.add.capped
Foot 76  先选一个文件夹。  [取消] [导入(禁用)]
```

**空状态的动作只有一个主要按钮**（浏览文件，实心），拖放区本身是第二入口 —— 和 Upload 板「两条路」的
原则一致。上限说明放在拖放区最下面用等宽小字，它是**约束**不是引导。

### 修正：本机导入的 skill 行应该和「下载」一模一样（2026-10-09，用户："本地导入的那个skill样式和那个和那个下载那个也一样，是直接点击安装的，没有什么选择框，然后也没有底部那些按钮"）

用户说得对，**我把「导入」当成了「批量选择」**。同一个对话框的两个分段，行必须长得一样：

| | 我上一轮画的（错） | 现在（对） |
| --- | --- | --- |
| 行左侧 | 20×20 勾选框 | 36×36 图标块（`$surface-soft` + 10 圆角 + 1px `$hairline` + 17 `scroll-text`） |
| 行右侧 | 无 | **每行自己的动作**：`+ 导入`（h30 药丸）或 `已导入` 徽章（h26，`check` + `$muted`） |
| 全选行 | 有 | 无 |
| 底部 Foot | `[取消] [导入 2 个技能]` | **没有 Foot** |

**行规格完全照抄 Download 板**（`h68` + 下边框 1px `$hairline` + gap 14 + padding `[0,20]`；
名称等宽 13.5/600 `$ink`，描述 12 `$muted`；动作药丸 `$surface-strong` + gap 6 + padding `[0,14]`）。

于是 Import 的 Dialog 回到 **469**：

```
Head 96 + Segments 52 + Body 321
Body = Source Wrap 96 + Divider 1 + Results 224   ← 3 行 × 68 + padding[8,0,12,0]
```

第 3 行画成 `已导入` 徽章：扫描到的文件夹里可能有一个技能库里已经有了 —— 这是真实情况，顺便把
「已导入」这个状态定下来（对应 Download 的 `已安装`）。

**同时删掉 `Import (no folder)` 的 Foot** —— 既然没有批量导入，就没有「底部那些按钮」。那一屏唯一的动作
是拖放区里的「浏览文件」，退出走右上角的 ✕。（那块板在之前一次失败的 `execute` 回滚里丢了，已重建，
现在 Dialog 是 `96 + 52 + 264 = 412`。）

**4 个文案 key 因此变成死代码**（不再有勾选框）：`skills.add.select`、`skills.add.selected`、
`skills.add.selectAll`、`skills.add.clearAll`。`skills.add.imported`（Imported）保留，它现在是徽章文案。

> 注：**表格视图的勾选框不受影响**（`Table Card` 表头 + 每行 + 批量卡里的那些），那是列表页自己的多选，
> 和导入弹窗无关。

### `收录` 的图标：画布是对的，**代码没同步**（2026-10-09，用户："收录没有同步这个icon，这个icon我们采用我截图发给你的这个"）

用户给的截图是 **`+ 收录`** 药丸。查证：

| 位置 | 现在 | 应该 |
| --- | --- | --- |
| 画布（全部 10 块板，共 16 个 `Action 收录`） | `plus` ✅ | `plus` |
| 代码 `page.tsx`（网格卡 + 表格行） | **`LibraryIcon`** ❌ | `PlusIcon` |
| 代码 `skill-detail-dialog.tsx`（详情底部） | **`LibraryIcon`** ❌ | `PlusIcon` |

**所以"没有同步"是代码侧没跟上**，不是画布。要改两处：`page.tsx` 的 `LibraryIcon` → `PlusIcon`
和 `skill-detail-dialog.tsx` 里同样的那一处；顺带清掉不再使用的 `LibraryIcon` import。

### 修正：③ 画错了 —— 搜索就是筛选，不该换视图（2026-10-09，用户："交互逻辑有点不对吧，我这个搜索就是筛选啊，就是对我的那个 skill 做筛选"）

用户说对了。我原来在 ③ 里画了一条**紧凑的结果行列表**（`file-text` 图标 + 名称 + 描述），
那等于说"一旦搜索就从网格切成另一种视图" —— 这是错的。**搜索是筛选：视图不换、卡片不换，只是从 12 张变 3 张。**

改成：③ 的条里放**同一套网格卡**（3 张，264 宽，4 列布局里的前 3 列），页脚计数跟着变。

**顺带定了一条规则**：匹配高亮只在**列表视图**加主色（行长得一样，不标出来找不到是哪几个字命中）；
**网格不加** —— 卡够大，一屏 12 张全加高亮就是一屏花斑。

## 空 / 加载 / 失败：全画布都缺这三种状态（2026-10-09，用户："我发现了，我们是不是没有空状态的页面啊"）

**是的，一块都没画。** 而实现里它们都是日常路径（首次打开、CLI 拉取超时、工作区没配目录）。
代码里（`page.tsx` 的 `skills.length === 0` 分支）是**五段纯文本**加 loading / error 两个分支，
**一个动作都没有**。查证到四个具体缺陷：

1. **`skills.empty` 用文字"描述"了一个动作却不给按钮** —— 文案是 "No skills yet. Add a folder with a
   SKILL.md under" + 根目录。最需要「导入」的那一屏，恰恰只有一句说明。
2. **`skills.workspace.none` / `noPath` 同样没有出路** —— "Choose a workspace to install into." 却没得选。
3. **`skills.length === 0` 把"库是空的"和"筛选筛到 0 条"合成了同一个分支** —— 搜不到东西会告诉你
   "技能库里还没有技能"，**这是谎话**。
4. **loading 是一行 spinner + 文字**，实际高度接近 0，数据回来时内容区从 0 高度突然撑开。

新增第 17 块板 **`Skills — States`**（`ghZOs`，x0 y12000，1440×2473），五段 + 四张规则卡：

| | 状态 | 内容 |
| --- | --- | --- |
| ① | 空 · 技能库 | `folder-plus` + 「技能库里还没有技能」+ 提示 + 等宽根目录 + **实心主色「导入文件夹」** + 描边「探索远程技能」 |
| ② | 空 · 工作区（三变体并列） | 位置空（收录技能）／没有可读目录（去设置）／没选工作区（选择工作区）—— 同一个空块，只换图标、标题、按钮 |
| ③ | 筛选到 0 条（左右对照） | 左「现在 · 错」= 今天的结果（技能库里还没有技能 + 路径）／右「应该 · 对」= 回显查询词 + 「清除筛选」 |
| ④ | 加载中 | 骨架卡，高度按真实的 292 / 342 / 276 铺，4 列 |
| ⑤ | 读取失败 | 标签计数显示 **`—` 而不是 `0`** + errno 原文（等宽）+ 「重试」+ 明确说上一次的 12 个还在 |

**四条规则**：① 六种空态一段文案包不了（库里空 / 位置空 / 筛选空 / 读不到，回答的是四个不同问题），
但它们都只占内容区，工具栏和三列永远不动；② 每个空态**有且只有一个实心主色按钮**，次要动作走描边；
③ 加载用骨架不用 spinner（spinner 高度≈0，会跳），列数和高度都照真数据，也**不要**"超过 300ms 才显示"；
④ 失败要说清三件事（什么失败 / 为什么 / 还能做什么），**计数显示「—」绝不显示「0」**，且**不清空上一次的结果**。

第 4 块画板 `sxsHb`（`Skills — Multi-place`，x=0 y=1180，1440x1170）把两个方案并排画出来：

| 方案 | 卡片上怎么读 | 结论 |
| --- | --- | --- |
| **A · 读作数量** | 脚注 `本地 · 3 个位置 ⌃`，点开就是位置列表 | **推荐** |
| B · 读作图标 | 封面右上角 3 个 26px 圆环叠图标 | 否 |

否掉 B 的三条理由（第三条是画出来才看清的）：① 3 个品牌色插进一屏 12 张白卡，与"蓝色克制"直接冲突；
② 图标由各 Agent 插件提供，插件没装或没图标时那一格就是空白；③ 26px 叠在照片上实测是三个浅色糊点，
连自己画的时候都认不出是谁。

- **真相只有一处**：卡片说"装了几处"，详情弹窗的「位置」区说"具体是哪几处"。两者是同一个列表：
  行 = 图标牌 32 + 名称 13.5/600 + 等宽路径 11.5 + 类型徽章（本体/链接）+ `移除`（本体那行没有动作）。
- **页签就是位置**：装了它的每一档都会出现这行（全部 / 技能库 / 工作区 / Claude Code），
  这是既有规则，不需要额外加筛选项。
- **顺带发现的代码缺口**：`Skill.location` 只有 `"library" | "both"`，`locationLabel` 把 `both` 硬编码成
  「技能库 + 工作区」—— 装到 3 处就会读错。数据侧本来就有 `Skill.places: SkillHold[]`，
  所以标签应该由 `holdsOf(skill).length` 派生：0 → 技能库，1 → 该位置，N → 「N 个位置」。

## 追问：安装到不同 Agent 怎么操作（2026-10-09）

第 5 块画板 `kNE7x`（`Skills — Install flow`，x=0 y=2470）画三个状态：

- **A 行内按钮**：文案**恒定**为「安装 ⌄」（0 处与 2 处都一样），已装的位置在菜单里带勾。
  现在代码是「装过任何一处就变『卸载』+ 电源图标」，等于按钮在说谎——装到第二处也是安装。
- **B 菜单**：`安装到` 标题 + 每个位置一行（28 图标牌 + 名称 13.5/600 + 等宽目标目录 10.5 + 勾选框），
  勾=安装（建链接）、取消勾选=移除；菜单只列**真实存在**的位置。用 Codex 当反例画了禁用行
  （「插件未启用」）——今天装不到 Codex，原因在此。
- **C 批量**：列表勾选多行 → 工具栏浮出「已选 3」胶囊 + 蓝色「安装到」按钮，**只提供"同一个位置"这一个含义**。
  "一件去 Codex、一件去 Claude Code" 是每行各自的菜单，不需要先选目标再选技能。

**这一轮暴露的代码缺口（待落地时一起改）**：

1. `locationLabel` 把 `both` 写死成「技能库 + 工作区」；3 处就错。改由 `holdsOf().length` 派生。
2. **Codex / Copilot 没有 `skillLocation` 贡献**（`builtin/targets.ts` 里只有 target，没有 place），
   所以菜单里根本不会出现 Codex —— 用户举的例子今天做不到。
3. 行内按钮文案/图标按 `installed` 切换 → 应恒定「安装」。
4. 列表复选框是装饰：`SkillTable` 的 `Checkbox` 没有 state，也没有批量动作。
5. 位置被禁用后：`roots` 少一项，磁盘上已存在的链接会从行里"消失"（`places` 不再包含它），
   需要按 id 兜底显示，否则用户看不到自己装过什么。

## 追问：Agent 图标怎么展示（2026-10-09，用户「我还需要有那个 claude-code 的那些图标」）

**用户随后纠正："我是说，想让你画在这上面去，不是重新开一个画布，不然的话，我看不懂啊"** ——
所以另开的两块板（`Icon Audit` / `Skills — Agent icons`）**已删除**，图标直接画进正在看的
`Skills — Multi-place`（位置面板 + 方案 B 的图标堆叠）与 `Skills — Install flow`（安装菜单）里，
规则压成一行说明贴在菜单/批量卡上。**以后不要为单个问题另开画板，画进对应流程板。**

**素材盘点（14 个真实图标 × 白底/深色底）：素材其实是两种形态**，而且有三种失败模式：

| 形态 | 例子 | 直接放上去的结果 |
| --- | --- | --- |
| A 自带底板（app 图标式） | cursor、cline、qwen_code、antigravity、workbuddy、github_copilot | 基本可用；但**白底板在白底、黑底板在深色底会溶解** |
| B 只有图形（裸标） | codex（纯黑）、kimi（紫）、iflow、qoder | 彩色的两种底都成立；**纯黑标在深色底直接消失** |

**定下的规则**：

1. **箱子归 UI，图形归插件**：所有 agent 图标都装进同一个箱子 —— 圆角 = 尺寸 24%（16→4 / 28→7 / 40→10），
   图形占 56%。尺寸只有五档：16 内联、20 紧凑行、24 页签、28 菜单与位置行、40 详情表头。
2. **两种形态、一个箱子**：自带底板的**直接铺满箱子**（不要再套一层，否则双层底板）；
   只有图形的**由箱子补中性底**（浅 `$surface-soft` / 深 `#FFFFFF14`）。
3. **1px 发丝环**（浅 `$hairline` / 深 `#FFFFFF1F`）负责让"底板与页面同色"的那几个仍有轮廓。
4. **单色标必须走 `currentColor`**，颜色交给 UI —— 这就是 `ExtensionIcon` 带 `className` 的用处；
   优先使用品牌色变体（`@lobehub/icons` 的 `ClaudeCode.Color`），一个素材两种主题都成立。
5. **兜底**：插件没交图标 → 位置自己的 lucide 图标 + 首字母；绝不留空方块、绝不出现坏图。
6. **出现位置只有三处**：安装菜单行、详情「位置」行、位置页签（技能库那档没有品牌，用 `library` 图标）。
   卡片和列表行**不放** —— 那一层要读的是"装了几处"，不是"装在哪家"。

**素材来源**：`d:\work-space\skills-manager\public\agent-icons\`（51 个 agent，PNG/SVG 混合）就是用户后续要集成的那套。
画布**只渲染 PNG**（SVG 填色渲染为空），所以先用浏览器把需要的 SVG 渲染成 PNG 存到
`designs/agent-icons/`（该目录下 PNG 已被 gitignore）；产品里不需要 PNG 资产，每个插件交一个 SVG 组件即可。

**依赖缺口**：Codex 还没有 `skillLocation`，所以它的图标接进来也暂时没有地方显示 —— 得先有 place。

---

# Skills 按新画稿还原 · 分阶段计划（2026-10-09，用户："把功能和页面全部还原，按新画稿来做"）

**目标**：把 `designs/skills.pen` 已定稿的画板（含评审中修正过的交互逻辑）1:1 落到代码，
连同画板暴露出的既有缺陷一起修掉。功能与 UI 一起还原，不新造需求、不做画板没画过的事。

**约束**：引擎（扫描 / 链接 / 注册表下载）只在确有缺口处改；不改画板已定稿的视觉决定；
每阶段独立可验收；未定项不替用户拍板（见文末「待定」）。

**每阶段收尾三关（缺一不算完成）**

1. **浏览器实操**：跑一遍该阶段列出的步骤，结果与画板一致；核对图存 `designs/check-web/`（不入库，提交前删）。
2. **代码规范**：`pnpm typecheck` + 改动包 `eslint`，0 error；不新增 `any` / `as unknown`，不在 `useEffect` 里 setState。
3. **报错检查**：浏览器 Console 0 error、Network 无 4xx/5xx、Vite 终端 0 error、`packages/plugin-skills/scripts/check-*.ts` 全过。

**画板 → 阶段映射**

| 画板 | 阶段 |
| --- | --- |
| Grid / Dark（壳 + 工具栏 + 筛选行 + 卡片） | P1 · P2 · P3 · P8 |
| List（表格 + 批量条） | P4 |
| Multi-place / Install flow（位置语义 + 安装菜单） | P3 · P5 |
| Detail / Detail (full) / Detail (spec) / Files / Upload / Delete | P5 |
| Import / Import (no folder) / Download | P6 |
| Search（探索） | P7 |
| States（空 / 加载 / 失败） | P8 |
| Cover without media（文件树封面 A） | P3 |
| Local search（本地筛选） | P2 |

## P0 前置与基线（无代码改动）

- 画布 `designs/skills.pen` 需在前台 —— pen 工具当前指向 `designs/main.pen`，读不到 Skills 的 18 块板。
- 起 dev server；记录基线：`git status`、`pnpm typecheck`、`/skills` 截图、Console 是否干净。
- 验收：三条基线命令有输出、`/skills` 能加载真实库（不是样例数据）。

## P1 设计 token 与页面壳

- **落点**：`packages/ui/src/styles/globals.css`、`apps/web/src/components/app-sidebar.tsx` / `app-header.tsx` / `app-layout.tsx`、
  `packages/ui/src/components/{card,button,input,tabs,dialog,badge,table}.tsx` 的默认值。
- **改动**：① 阴影收敛成**一档** `0 4px 12px rgba(0,0,0,.04)`；② 圆角刻度 xs4 / sm8 / md12 / lg16 / xl24 / pill；
  ③ 字号下限 12 / 13；④ 主色 `#0052FF` 只出现在主 CTA 与品牌标（一屏一次）；⑤ 侧栏白底 + 发丝线 + 选中态墨黑胶囊；
  ⑥ 顶栏胶囊按钮/搜索框；⑦ `semantic-down` 只做文字色，不做填充底。
- **风险**：全局 token 会同时改到 Overview / MCP / Plugins / Repository 的观感（本轮不重排它们）。
- **验收**：`/skills` 与 `/` 在浅/暗两色截图，无玻璃/渐变/彩色底残留；侧栏与顶栏与画板一致；
  `pnpm typecheck` + `pnpm --filter @workspace/ui lint` + web lint；Console 0 error。

## P2 目录页头部：页签 / 工具栏 / 筛选行（含本地搜索）

- **画板**：Grid / List / Dark 的筛选行与工具栏；Local search 板的 ②③④。
- **落点**：`page.tsx`（PageTitleRow / Tabs / Toolbar / TagFilter）、`library.ts`（`reload` 传参、`counts`）、
  `host/skills-fs.ts`（needle）、`remote-store.ts`、`messages.ts`。
- **改动**：
  1. 筛选行 34 → 44，加入 300 宽搜索框（h44、`radius-sm`、focus 2px 主色、`/` 聚焦、`Esc` 清空、防抖 + `generation` 防乱序）；
  2. `store.list({ sort, q, tag })` 真正传 `q`（页码回到 1）；
  3. `host/skills-fs.ts:467` 的 needle 增加 `tags` 维度（名称 / 描述 / 类型三维，用户明确要求）；
  4. 页签计数按**过滤后集合**算，0 的置灰；
  5. 工具栏最右 `skills.action.search` → `skills.action.explore`（「探索」+ `compass` 图标），位置与本地搜索分开；
  6. 筛选**不换视图**（在卡片就是卡片，在表格就是表格）。
- **验收**：输入 `design` → 4 张卡 / 4 行、页签计数 `4 / 4 / 1 / 0`、第 4 档置灰；清空回到 12；
  `/` 聚焦、`Esc` 清空；搜索与标签 AND 且各自可撤；防抖窗口内不闪"没有找到"；check 脚本 + typecheck + lint。

## P3 网格视图（卡片）

- **画板**：Grid / Dark / Cover without media（方案 A）/ Multi-place 的卡片。
- **落点**：`page.tsx`（SkillCard、`MarkdownCover` → `FileTreeCover`、动作按钮）、
  `library.ts`（`useSkillFiles`、`tokenLabel`、`holdsOf`、`locationLabel`）、`types.ts`。
- **改动**：
  1. 封面换成**文件树**：`SKILL.md` / `references/` / 两格缩进子项 / `scripts/` + 底部 `12 个文件 · 3.2k tokens`；
     行数按 `floor((封面高 − 28 − 40) / 18)`；`padding` 对齐代码的 `pt-10`（有标签）/ `pt-3.5`；
  2. `useSkillBody()` 目前丢掉 `files` —— 让它（或 `useSkillFiles()`）把 `store.get(id)` 里已有的 `files` 交出来（零新增接口）；
  3. 读取失败的回退改成 **C 占位板**（居中 `file-text` + 计数），不再回退到「名称 + 描述」；
  4. 动作按钮**文案恒定**「安装 ⌄」（已装位置在菜单里带勾）+ 工作区自有行「收录」；移除 = 描边；
  5. 页脚 `来源 · N 个位置`（**无箭头**）；`locationLabel` 由 `holdsOf().length` 派生（0 → 技能库，1 → 该位置，N → `N 个位置`）；
  6. 保留**瀑布流** + 显式列数上限（1→2→3→4→5，容器查询）。
- **验收**：12 张卡封面都是文件树且不重复描述（抽 `wizard` / `code-review` / `tdd` 核对文案）；有图卡仍显示图；
  点「安装 ⌄」菜单列出真实位置、勾选即装、取消即移除，按钮文案不变；≥1900px 仍 5 列；暗色对照。

## P4 列表视图（表格 + 批量）

- **画板**：List；Install flow 的批量条。
- **落点**：`page.tsx`（`SkillTable` / 列定义 / `SkillThumb` / 新增批量条）、`messages.ts`。
- **改动**：① 列宽 = 32 / 469 / 210 / 175 / 110 / 92；② 行高 44 → **66**（文字块 58，名称↔描述 6）；
  ③ 复选框接 state + 批量条（`已选 N` 墨黑胶囊 + `取消选择` + 蓝色 `安装到 ⌄`，只表达"同一个位置"）；
  ④ 删掉 TOKENS / TRIGGERS 两个恒为 `—` 的假列；⑤ 匹配高亮**只在表格视图**加主色；⑥ 分页在表格下方。
- **验收**：勾 3 行 → 批量条出现并能装到指定位置、页签计数跟着变；全选 / 取消选择；
  筛选后行数变化、高亮片段正确；空列表时页脚不出现空翻页。

## P5 详情灯箱（媒体 + 上传 + 位置区 + 类型编辑）

- **画板**：Detail / Detail (full) / Detail (spec) / Files / Upload / Delete。
- **落点**：`skill-detail-dialog.tsx`（`MediaPane` / `useMediaItems` / `InfoPanel` / `FilesPanel` / `DeleteBubble`）、
  `media.ts`、`vite.ts`（资产桥）、`messages.ts`。
- **改动**：
  1. 上传三入口：`+` 菜单（选择文件 / 从 URL 导入 → **就地**输入面板 / 粘贴提示）、拖拽悬停覆盖层（作用于整个媒体区）、
     `Ctrl+V`（**document 级**、仅灯箱打开时启用、用 `clipboardData.items` 判定 `kind === "file"` 且 `type.startsWith("image/")`，
     文本内容**不** `preventDefault`）；
  2. URL 导入"先下载再落盘"，**http 与 https 都收**（取图在服务端，不受混合内容拦截），失败不写空记录；
  3. **位置区** = 列全部可选位置 + 行内 `安装` / `移除` + 标题右侧「已装 N」；页脚的「安装 ⌄」删除（位置区就是唯一入口）；
  4. 类型可增可删（每枚 chip 带 ×，行尾 `+ 添加类型`）；
  5. 删 meta 里的 Tokens / Triggers 两行；`来源` 做成链接（`github` + `owner/repo` → `github.com/<owner>/<repo>`，
     `source` 本身是 http(s) 直接用，本地路径 / ssh **不**渲染成链接）；
  6. 面板中部竖向滚动 + 5px 自定义滚动条（`scrollbar-width: thin` + `::-webkit-scrollbar`）+ `scrollbar-gutter: stable` + `overflow-hidden`；
  7. 页脚 = `查看文件`（主，占满）+ `🗑 删除技能`（红描边）同一行；`LibraryIcon` → `PlusIcon`（两处：`page.tsx:403`、`skill-detail-dialog.tsx:1150`）。
- **验收**：打开 `impeccable` → 位置区 4 行，点未装行的「安装」→ 磁盘出现链接、徽章变「移除」；
  拖入图片 / `Ctrl+V` 截图都能进缩略图，剪贴板是文本时不吞且有提示；`+` 菜单三项且 URL 项就地展开；
  chip 增删持久；位置区滚到底不压页脚；Console 0 error。

## P6 添加技能弹窗（本机导入 / 下载）

- **画板**：Import / Import (no folder) / Download。
- **落点**：`add-skill-dialog.tsx`、`folder-scan.ts`、`messages.ts`。
- **改动**：① 行内**直接安装**（36 图标块 + 名称等宽 13.5/600 + 第二行路径 + `安装` 胶囊 / `已导入` 徽章）；
  ② 删勾选框、全选行、页脚 `取消 / 导入 N`、Discard 气泡；③ 补「还没选文件夹」屏（Dropzone + `浏览文件` + 上限说明）；
  ④ 清掉 4 个死键 `skills.add.select` / `.selected` / `.selectAll` / `.clearAll`（`skills.add.imported` 保留为徽章文案）；
  ⑤ 两个分段共用同一套壳（Head + Segments + Source Wrap + Divider + Results）。
- **验收**：两个分段行长相一致；本机导入扫描出 3 个技能 → 逐行安装、库里已有的显示「已导入」；
  未选文件夹屏可拖入 / 浏览并进入列表；✕ 与 `Esc` 关闭；表格视图的勾选框**不受影响**。

## P7 探索（远程搜索）弹窗

- **画板**：Search。
- **落点**：`search-dialog.tsx`、`registry.ts`、`messages.ts`。
- **改动**：改名「探索技能」+ 说明文案（`skills.search.title` / `.description`）；对齐画板的五种状态与固定高列表区
  （有查询 408 / 起始 248，弹窗 446 / 633）；保留 per-row 并发安装与 `pending` 数组、`min-w-0`（断言 `clientWidth === scrollWidth`）。
- **验收**：起始 / 加载骨架 / 结果 / 无结果 / 失败五态；连点两行只有这两行 disabled 且各有一个 spinner；
  窄窗口下弹窗不被撑爆。

## P8 空 / 加载 / 失败 + 暗色

- **画板**：States / Dark。
- **落点**：`page.tsx`（空态拆分与分支）、新增骨架组件、`globals.css` 暗色 token、灯箱/弹窗/文件面板的暗色类。
- **改动**：① 拆开"库空 / 工作区空（位置空、无可读目录、未选工作区）/ 筛选 0 条 / 读不到"（今天前两者与"筛到 0 条"合成一个撒谎的分支）；
  ② 每个空态有且只有一个实心主色按钮，次要动作走描边；③ 加载用**骨架**（按真实 292 / 342 / 276 高、4 列），不用 spinner；
  ④ 失败：页签计数显示 `—` 不是 `0`、errno 原文等宽、`重试`、**不清空上一次结果**；⑤ 暗色覆盖网格/灯箱/文件面板/两个弹窗（今天只有网格页有暗色）。
- **验收**：把库临时清空、把工作区指向不存在的目录、输入不存在的关键词，四种态各看一遍；
  暗色下逐屏检查无白底白字、无半透明胶囊露底。

## P9 收尾

- hover / focus / disabled 三态的最小规矩（画板只画了禁用主按钮）；Agent 图标箱子（`ExtensionIcon` 支持 `currentColor`）；
  位置被禁用后按 id 兜底显示既有链接；文案与死键清理；`pnpm typecheck` + lint + 全部 check 脚本；
  逐块回对画板并把差异写回 `tasks/todo.md`。

## 待定（需要用户拍板）

1. **P1 的全局 token 会改到其它模块**（Overview / MCP / Plugins / Repository 的观感跟着变，但本轮不重排它们）—— 是否接受？
2. **Codex / Copilot 的 `skillLocation` 贡献**是否本轮补？（不补的话安装菜单里永远不会出现 Codex，用户举的例子做不到。）
3. **是否每阶段提交一个 commit**？当前工作区有大量已暂存的改动，我不会擅自提交。

## 前置请求

- 请把 `designs/skills.pen` 打开并切到前台 —— pen 工具现在指向 `designs/main.pen`，读不到 Skills 的 18 块板。

---

# 推进日志（按阶段，含实测证据）

> 用户当时不在场（提问工具返回"自行决定"），三个待定项按已有证据取默认值：
> ① 全局 token 照改（此前已确认「改全局 token」）；② Codex 的 `skillLocation` 本轮不补（画板里它只是"插件未启用"的反例，属新功能）；
> ③ **不提交 commit**（工作区有大量已暂存改动）。画布读不到，改用本文件里已记录的逐块实测数据推进。

### 分类与分组统一到「Agents / 资产」（2026-10-12，用户反馈）

用户两轮要求：① 「Agent 的分组是 Agents，和侧边栏要对应」；② 「mcp、skills 的插件分组是资产，
然后这个地方应该也是资产」。落成一套词表，两处同名同序：

| 概念 | 扩展页分类 | 侧边栏分组 |
| --- | --- | --- |
| 交付目标（13 个 agent 集成） | `agent`「Agents」 | `Agents`（`AgentGroup`，读 `target`） |
| hub 自己管的资产 | `asset`「资产」——MCP servers + Skills | `assets`「资产」——概览 / 技能 / MCP 服务器 / 插件 |
| 从外面拉资产 | `source`「资产源」——skills.sh | — |
| 语言 / 外观 / 存储 | `language` / `appearance` / `storage` | — |
| 通用模块桶 | `integration`「集成」（目前无内置成员） | — |

改动：

- `ExtensionCategoryId` 增 `agent`、`asset`；`NavGroupId` 的 `manage` 改名 `assets`，
  键 `nav.group.manage` → `nav.group.assets`（en `Assets` / zh `资产`）。
- **补上一处漏掉的出处**：`PluginManifestFile.category` 与 `CATEGORIES` 是同一套词表的第二份拷贝，
  先前只改了 `ExtensionCategoryId`，于是下载来的插件声明 `agent`/`asset` 会被 manifest 校验拒掉。
- 13 个 agent 包 `category` 改 `agent`；`plugin-mcp` 由 `integration` → `asset`，
  `plugin-skills` 由 `source` → `asset`。
- `contributions()` 原先按**激活顺序**返回（注释却写着 catalog order）：先开 Cursor 再开 Cline，
  侧边栏顺序就和扩展页对不上。改成按 catalog（装配）顺序遍历，两个界面从此恒定同序，
  与开关顺序无关。

**验证**：`check-plugins.ts` 全过、`check-services.ts`、`check-mcp.ts` 61/61、
`check-messages.ts` 429/429 键对齐；workspace 全量 `typecheck` / `lint` 除既有
`@workspace/agent-cline` 失败外全绿。真机 `/extensions`：Agents（13）→ 资产（Skills、MCP servers）
→ 语言 → 资产源（skills.sh）；侧边栏首组标题「资产」。Console 干净。

**留给用户定**：`integration`（集成）现在没有内置成员（只有 `examples/acme-mcp/plugin.json` 用它），
是留作第三方模块的通用桶，还是连词表一起删掉。

---
## P0 基线（2026-10-09）

- `pnpm typecheck` → **8/8 成功**。
- `pnpm --filter @workspace/plugin-skills lint` **0 error**；`web` lint 0 error；
  `@workspace/ui` lint **19 error（既有、模板遗留，本轮收尾清）**。
- `/skills` 用真实库渲染：页签 `全部 7 / 技能库 7 / 工作区 3 / Claude Code 0`。

## P1 设计 token 与页面壳（2026-10-09）

**改了什么**

| 文件 | 改动 |
| --- | --- |
| `packages/ui/src/styles/globals.css` | 颜色全量换成画布那套；圆角刻度 xs4/sm8/md12/lg16/xl24 + `pill`；字号 `display 36/1.11/-0.5px`；阴影收敛成 `--shadow-soft` 一档（`shadow-glass` 改成同一值）；删掉 blob 三色、`--app-gradient-*` 与 `app-background` 工具类；tag/chip 15 组色全部中性化 |
| `apps/web/src/components/app-layout.tsx` | 删掉渐变底 + 三个模糊色球；`SidebarInset` 去掉 `bg-transparent` |
| `apps/web/src/components/app-sidebar.tsx` | 去掉 `backdrop-blur-glass`；去掉菜单左侧竖线；行高 36 圆角胶囊、分组标题 12px muted |
| `packages/ui/src/components/sidebar.tsx` | `SidebarMenuButton` 选中态 `bg-sidebar-accent` → **`bg-foreground` + `text-background`**（墨黑胶囊） |
| `apps/web/src/components/app-header.tsx` | 边框改 `border-border`、去掉 `backdrop-blur-header`；搜索改 44 高胶囊 `bg-secondary`；两个按钮加 `rounded-full` |
| `workspace-menu.tsx` / `search-palette.tsx` | 弹层 `rounded-xl bg-popover shadow-soft ring-1 ring-border`（去掉第二档阴影与 `backdrop-blur-xl`） |

**实测（浏览器计算样式，Chrome）**：`html bg rgb(255,255,255)`；侧栏右边框与顶栏下边框 `rgb(222,225,230)` = `#DEE1E6`；
顶栏搜索 `44px` / `rgb(238,240,243)` / 胶囊；选中导航 `rgb(10,11,13)` 底 + 白字 + 36 高 + 胶囊；分组标题 12px `#7C828A`；
Console **0 error / 0 warning**（reload 后监听 console + pageerror）。`web` 与 `ui` 的 tsc、`web` 的 eslint 全绿。

**已知遗留（不在 P1 收口）**：页面标题仍是 24px/600（画板是 36/400/-0.5，P2 改）；
`apps/web` 另外四个模块页仍带旧玻璃类与第二档硬编码阴影（各自模块改版时清）；`packages/ui` 那 19 个既有 lint 错误留到 P9。

### 环境限制（重要，影响后面每个阶段的"浏览器验证"）

集成的浏览器页面是**后台页**（`document.visibilityState === "hidden"`），因此：

- CSS 动画冻在 `currentTime 0` → **base-ui 的弹窗关闭后不会卸载**（`data-closed` 已置位、`exit` 动画永不结束），
  Playwright 的 `locator.click()` 可点击性检查也会超时；真实键盘事件送不到（`press` 无效）。
- 对策：交互用 `el.click()`（React 的 onClick 照常触发）、键盘路径用 `dispatchEvent(new KeyboardEvent(...))`、
  "已关闭"以 `data-closed` 为判据而不是看节点消失。已记进 repo 记忆。

## P2 目录页头部：页签 / 工具栏 / 筛选行（2026-10-09）

**改了什么**

| 文件 | 改动 |
| --- | --- |
| `page.tsx` | `PageTitleRow` 拆成 `PageHeading`（36/400/-0.5 的 display）+ 新的 `FilterRow`（300×44 搜索框 + 分类胶囊，两者共用一行）；标题行与工具栏的间距改 32（`gap-8`）；页签行 44 高胶囊、选中态墨黑、数字等宽、0 置灰；工具栏最右「搜索」→「**探索**」+ `compass`；「检查更新」去掉琥珀色改中性描边；视图切换同款胶囊；新增 `useSettled`（180ms 防抖）、`rowsForTab`、`matchesQuery`；页签计数改由**过滤后集合**算 |
| `library.ts` | `useSkillLibrary(specs, query)` 把 `q` 交给 `store.list`（空查询不传，保持原请求） |
| `host/skills-fs.ts` | needle 增加 **tags** 维度（名称 / 描述 / 类型三维） |
| `tags.ts` | 九组分类色收敛成一组中性 chip（`bg-secondary` + ink），`tagTone()` 不再看标签名 |
| `messages.ts` / `locale-zh-cn` | `skills.action.search` → `skills.action.explore`（探索）；`skills.search.title`/`.description` 改探索措辞；新增 `skills.filter.placeholder` / `.clear` |

**实测（真机 + 真实库）**

- 页标题：`36px / 400 / -0.5px / Inter` ✓（改前 24/600）。
- 页签行 474×**44**（改前 32）、选中态 `rgb(10,11,13)` 底 + 白字 + 胶囊；0 的计数 `opacity 0.45`。
- 宿主桥直测：`?q=设计` → 只回 `finesse-ui` 一条 → **tags 维度确实参与匹配**（改前只匹配名称/描述）。
- 页面输入 `design`：发出 `?q=design&sort=updated`，页签计数 `7/7/3/0 → **5/5/3/0**`，卡片 7 → 5，
  **视图没换**（还是同一套网格卡）；`/` 聚焦搜索框、`Esc` 与 ✕ 都能清空并回到 7。
  工作区的 3 条也被收窄（`grilling` 不再命中），这要求**在页面侧同样按三维过滤**（`matchesQuery`）——
  工作区自带的技能不经过 store，只有 store 收窄会让它们漏出来。
- 工具栏「探索」打开的弹窗标题已是「探索技能」，Console **0 error / 0 warning**。
- `pnpm --filter @workspace/plugin-skills typecheck` + `lint`、`locale-zh-cn` typecheck 全绿；
  `node scripts/check-store.ts` 全过；改了宿主桥后**重启了 dev server**（Vite 不热更已加载的插件模块）。

**留给后面阶段**：探索弹窗仍是 16 圆角 + 第二档阴影 + 424 高（画板是 24 圆角 / 一档阴影 / 起始 446）→ P7；
表格视图的匹配高亮 → P4；卡片封面仍是文档正文 → P3。

## P3 网格视图（卡片）（2026-10-09）

**改了什么**

| 文件 | 改动 |
| --- | --- |
| `library.ts` | `useSkillBody` → **`useSkillDocument`**：同一次读取把 `files` 一起交出来（零新增接口）；新增 `placeLabel()`（0 → 技能库，1 → 该位置，N → `N 个位置`） |
| `page.tsx` | `MarkdownCover` → **`FileTreeCover`**：最多 4 行文件树（目录深色 / 文件灰色、按 `depth` 缩进两格）+ 底部 `N 个文件 · x.xk tokens`；一个文件都读不到时退成居中 `file-text` 占位板（**不再回退到"名称 + 描述"**）。卡片圆角 24、`ring-1 ring-border`、默认无阴影、hover 一档；内边距统一 18；名称 14/600、描述 12.5、时间 12 等宽；标签胶囊改中性（`bg-card/95` + 发丝线、**去掉色点**、12px）；动作按钮统一 **32 高实心 `$surface-strong` 药丸**；`收录` 换 `plus` 图标；`安装 ⌄` 文案**恒定**（不再随已装状态变"卸载"），菜单行改成 `28 图标牌 + 名称 13.5/600 + 等宽目标目录 12 + 右侧勾`、行高 2 行 |
| `provenance-line.tsx` | 位置改由 `placeLabel()` 派生（不再用写死 `both` 的 `locationLabel`） |
| `messages.ts` / `locale-zh-cn` | 新增 `skills.location.count`、`skills.cover.files`、`skills.cover.tokens` |

**实测（真机 + 真实库，7 张卡）**

| 卡 | 封面 | 底部计数 | 动作 |
| --- | --- | --- | --- |
| finesse-ui / design-taste-frontend | **真实图片**（有 assets，走媒体分支） | — | 安装 |
| impeccable | 文件树（`agents/` + 3 个 toml） | `67 个文件 · 2.8k tokens` | 安装 |
| shadcn-ui | 文件树 | `13 个文件 · 2.2k tokens` | 安装 |
| grilling / grill-with-docs / grill-me | 文件树 | `3 个文件 · 462 / 17 / 10 tokens` | 安装 |

- 卡片：圆角 `24px`、`hover` 时 `rgba(0,0,0,.04) 0 4px 12px`（**只有一档**）+ 发丝线环；内边距 `14px 18px`；
  名称 `14/600`、描述 `12.5px`、时间 `12px` 等宽；标签胶囊 `24 高 / 12px / 无圆点`；动作按钮 `32 高 / 胶囊 / #EEF0F3`。
- 页脚来源行：无位置 → `技能库`（shadcn-ui、grilling、grill-with-docs、grill-me 四条实测）、1 个位置 → `工作区`。
- 点「安装」→ 菜单标题「安装到」、两行（工作区 `.agents/skills` 带勾 / Claude Code `.claude/skills` 无勾），
  行内 28 图标牌 + 名称 + 等宽目标目录；Console 0 error。
- 卡片宽度是**流式**的：当前浏览器视口只有 1132，所以 2 列 396 宽；画板 1440 下 4 列 = 264，列数规则未变。

**没验到的一处**：`N 个位置`（≥2）没有行可以触发 —— 这轮没有 ≥2 位置的技能，而造一个要在用户仓库里建真实链接
（`git status` 里 `.agents/skills` 正处在暂存状态），所以只按代码路径确认，等有真实多位置数据时再看。

## P4 列表视图（表格 + 批量）（2026-10-09）

**改了什么**

| 文件 | 改动 |
| --- | --- |
| `page.tsx` | 列由 8 列（含 TOKENS / TRIGGERS 两个恒为 `—` 的假列）改为 **6 列** 2.9 / 43.1 / 19.3 / 16.1 / 10.1 / 8.5%（对应 32 / 469 / 210 / 175 / 110 / 92）；行高 44 → **66**（文字块 58，名称与描述间隔 6，描述 12px/17.5 两行）；**删掉卡片自带的「技能库」标题**（画板没有，工具栏上方已经有页标题）；复选框接真实状态 + 新增 **`BulkBar`**（`已选 N` 墨黑胶囊 + `取消选择` + 蓝色 `安装到 ⌄`，只表达"同一个位置"）；新增 **`Highlighted`**，**只有表格视图**把命中片段标成主色；分页移到表格下方并加发丝线分隔；标签列/位置列/更新时间（等宽）同步到 12–13px |
| `messages.ts` / `locale-zh-cn` | 新增 `skills.batch.selected` / `skills.batch.clear` |

**实测（真机 + 真实库）**

- 表格：7 行 × **66px**，卡片圆角 **24**，列宽实测 `24/352/157/131/82/69`（按比例，1088 宽下即 32/469/210/175/110/92）。
- 勾两行 → 批量条浮出：`已选 2`（`rgb(10,11,13)` 胶囊）+ `取消选择` + `安装到`（`rgb(0,82,255)` 蓝色药丸）；
  点「安装到」列出两个真实位置（工作区 `.agents/skills`、Claude Code `.claude/skills`）。未勾选时批量条不存在。
- 输入 `grill` → 3 行，名称与描述里的 `grill` 命中片段标成主色（`rgb(0,82,255)`），页签计数同步 `3/3/0`
  且工作区那档按 0 置灰，**勾选随之清空**（筛选变了，批量动作不再指着看不见的行）。
- `plugin-skills` tsc + eslint 全绿；Console 0 error。

**没验到的一处**：批量「安装到」真正落盘没做 —— 它会往用户仓库的 `.agents/skills` 里写链接，
而这轮不打算动用户的暂存状态。代码路径与单行「安装」同一条（`library.install`），循环只负责挑行。

## P5 详情灯箱（2026-10-09）

**改了什么**

| 文件 | 改动 |
| --- | --- |
| `skill-detail-dialog.tsx` | **上传三入口**：`+` 弹出三项菜单（选择文件… / 从 URL 导入 / 粘贴 Ctrl+V），第二项**就地**把菜单换成输入面板（不叠第二个面）；拖拽在**整个媒体区**生效并盖出 `$primary` 2px 描边 + 8% 主色底 + `image-plus` + 「松开即上传」+ 支持格式；`Ctrl+V` 监听挂在 **document**，只认 `kind === "file" && type.startsWith("image/")`，剪贴板是文本时**不拦截**、只提示 |
| | `addFiles` 形参 `FileList` → `ArrayLike<File>`（文件选择器、拖拽、剪贴板三处共用）；`MediaSource.persists` 删除（不再有"预览不落盘"这条分支要说明） |
| | **新增「位置」区**（`PlacesSection`）：技能库一行（本体/链接徽章，未入库时是「收录」）+ **每个可选位置一行**（未装 → 实心「安装」，已装 → 描边「移除」，同名占用置灰并给出原因）；标题右侧计数改「已装 N」；**页脚的「安装 ⌄」删除** |
| | 删掉 `MetaRow` 与 Tokens / 触发词两行，只留「更新于」；`UpdateRow` → `SourceSection`：标题「来源」+ 检查更新/更新按钮，来源按 `sourceHref()` 渲染成链接（`github` + `owner/repo` → `github.com/.../tree/HEAD/<skillPath>`、本身是 http(s) 直接用，本地路径/ssh **保持纯文本**） |
| | 中部改成竖向滚动 + 新工具类 **`scroll-thin`**（5px、胶囊、6% 轨道 / 18% 滑块、`scrollbar-gutter: stable`、深色另配） |
| | 页脚 = `查看文件`（主色，占满，40 高）+ `删除技能`（红描边）；删除气泡：24 圆角 → 12、一档阴影、发丝线、字号抬到 12 |
| | 灯箱外壳：圆角 24、`shadow-soft` 一档、`ring-1 ring-border`（去掉 `0 24px 56px` 与 `backdrop-blur-xl`）；文件面板去掉 48px 侧向阴影，改发丝线左边界 |
| `tags`/`messages` | 分类胶囊 24 高、12px；`+ 添加类型` 变成带字的虚线胶囊；新增 `skills.detail.places` / `.places.held` / `.source` / `skills.place.body` / `.link` / `skills.media.drop.*` / `.paste.*` / `.add.*` |

**实测（真机 + 真实库，`impeccable`）**

- 灯箱圆角 24、阴影 `rgba(0,0,0,.04) 0 4px 12px`（一档）+ 发丝线环；Tokens 行已消失；`位置` 区在、标题右侧「已装 1」；`来源` 区在。
- 位置区三行：`技能库 ~/.context-hub/skills/impeccable 本体` / `工作区 …\.agents\skills 移除` / `Claude Code …\.claude\skills 安装`（安装按钮可用）。
- `+` 菜单 260 宽三项（选择文件…/ 从 URL 导入 / 粘贴，各带说明）；点第二项**就地**变成 `图片直链` 输入 + 取消/导入 + 「http 与 https 都收。」。
- **粘贴真的通了**：合成一张 PNG 的 `ClipboardEvent` → 落盘 `/hub/files/assets/shot.png`、主图与缩略图同时出现 → 点缩略图上的「移除媒体」→ 资源 404、`~/.context-hub/skills/impeccable` 下**没有 assets 目录**（**测试残留已清理，用户状态已还原**）。
- 拖拽：在媒体区派发 `dragover` → 覆盖层出现（`松开即上传` + `PNG · JPG · GIF · WebP · MP4 · WebM`）。
- 面板：`scrollbar-gutter: stable`、`scrollbar-width: thin`，内容 813 > 视口 553，页脚仍在灯箱内（底边 838 < 858）。
- `plugin-skills` tsc + eslint、`locale-zh-cn` tsc、`web` tsc 全绿；Console 0 error。

**两点如实记录**：① 位置行的「本体 / 链接」徽章**只画在技能库那一行** —— `SkillHold` 只有 `{id, dir}`，
没有"这条 hold 是不是链接"的字段，给每个位置行标徽章需要加字段（数据模型改动），这轮不擅自动；
② 画布上写的"URL 导入先下载再落盘、所以不受混合内容拦截"与现在的实现**不一致**：现在 `addAssetSource`
把远程 URL **记为引用**（`check-store.ts` 有断言），浏览器会直接加载它。所以 UI 文案只写「http 与 https 都收。」，
没有抄画布那句解释 —— 要么把实现改成下载，要么把画板那句改掉，等你定。

## P6 添加技能弹窗（本机导入 / 下载）（2026-10-09）

**改了什么**

| 文件 | 改动 |
| --- | --- |
| `add-skill-dialog.tsx` | 行改成**行内直接安装**（`InstallRow`：36 图标块 + 等宽 13.5/600 名称 + 第二行 + 右侧实心「安装」药丸 / 「已导入」描边徽章）；**删掉**勾选框、`ListHeader`（全选那行）、`PickedChips`、页脚（`取消 / 导入 N`）与 `DiscardBubble`（它的锚点是页脚那颗取消，页脚没了锚点就没了）；新增 `installOne()`（逐行安装、逐行 `pending`、装完刷新 `installed` 让该行变「已导入」） |
| | 本机导入的「**还没选文件夹**」屏补上：224 高的拖放区（`folder-up` 28 + 标题 + 提示 + 实心主色「浏览文件」+ `最多读取 20000 个文件。`等宽小字），整屏可拖；选过之后换成 96 高的来源条（图标牌 + 文件夹名 + `该文件夹里有 N 个技能` + 「重新选择」） |
| | 下载段的来源条：`来源包` 标签 + 44 高输入框 + 提示（去掉「失去焦点自动拉取」那一行与 `packageNote` 键） |
| | 外壳圆角 24、一档阴影、发丝线；分段控件改 44 高胶囊、选中墨黑；行列表 `max-h-[360px]` + `scroll-thin` |
| `messages.ts` / `locale-zh-cn` | 新增 `skills.add.repick`、`skills.add.limitNote`；删除 9 个死键：`skills.add.select`/`.selected`/`.selectAll`/`.clearAll`/`.copiedHint`/`.downloadedHint`/`.discard.*`/`.packageNote` |

**实测（真机，真实 CLI 与真实库）**

- 两个分段都没有页脚；本机导入首屏是拖放区（标题/提示/浏览文件/上限说明），切到下载再切回来仍是这一屏。
- 下载段输入 `mattpocock/skills` → **列出 37 个技能**，每行自带「安装」；库里已有的两条（`grill-me`、`grilling`）显示「已导入」且没有按钮。
- 点 `wizard` 的「安装」→ **只有这一行**变 disabled + `aria-busy`（相邻三行仍可用）→ 约 25s 后该行变成「已导入」，
  页面页签计数 `7 → 8`（`onImported` 生效）。
- **清理**：装进来的 `wizard` 从灯箱「删除技能」+ 气泡确认删除 → 页签回到 `7 / 7 / 3 / 0`，用户库已还原。
  这条顺带把 P5 的新页脚布局（查看文件 + 删除技能同一行）与删除气泡一起验过了。
- `plugin-skills` tsc + eslint、`locale-zh-cn` tsc 全绿。

**环境提醒**：后台页里 `data-closed` 的弹窗**不会卸载**，所以"还有没有弹窗"要看 `[role="dialog"]:not([data-closed])`，
不能只看节点是否存在（这轮第一次就踩了：把已关闭的添加弹窗当成了正在打开的那个）。

## P7 探索弹窗（2026-10-09）

- 外壳：圆角 24、一档阴影、发丝线环（去掉 `0 24px 56px` 与 `backdrop-blur-xl`）；输入框 48 高、
  空闲发丝线、**聚焦 2px 主色**（原来常驻 1px 主色描边）；结果列表加 `scroll-thin`；错误行 11px → 12px。
- 文案：`skills.search.start.title` 改「探索远程技能 / Explore remote skills」。
- **实测**：空闲态弹窗 431 高、字段 46、`clientWidth - scrollWidth = 0`（无横向溢出）、标题「探索技能」；
  输入 `shadcn` → 6 行结果、弹窗 583、无报错。

## P8 空 / 加载 / 失败 + 暗色（2026-10-09）

**改了什么**（`page.tsx`）

- 新增 `EmptyState`（图标 + 标题 + 说明 + 可选等宽脚注 + **一个实心主色动作** + 可选描边次动作）与 `GridSkeleton`
  （按 292/342/276 三档高度铺 8 张骨架卡、4 列）。
- 原来那句"技能库 + 筛选到 0 条合成一个分支"的谎话拆成**四条独立路径**：
  ① 筛选命中 0 → 回显查询词 + 「清除筛选」（主）+ 「探索远程技能」（次）；
  ② 位置页签为空 → 三种变体（未选工作区 / 没有可读目录 / 这个位置没有技能）+ 位置路径脚注 + 「全部」；
  ③ 库本身为空 → 「技能库里还没有技能」+ 根目录脚注 + 「导入文件夹」（主）+ 「探索远程技能」（次）；
  ④ 读取失败 → 「技能库没读出来」+ errno 原文 + 「重试」，并且**不清空上一次的列表**。
- 加载从 spinner（高度≈0，数据回来会跳）换成**骨架**；页签计数在**读取失败时显示 `—` 而不是 `0`**。
- 暗色：页签/视图切换/侧栏的**选中态**在深色下改成 `$accent`（`#FFFFFF1F`）浅底 + 白字，
  与画板暗色板的「选中态 `#FFFFFF1F`」一致（浅色仍是墨黑实心胶囊）。

**实测**：Claude Code 页签 → 「这个位置还没有技能。」+ 说明 + 路径 + 「全部」；
输入不存在的词 → 「没有找到匹配的技能」+「现在没有技能匹配「zzzznotathing」。」+ 「清除筛选」/「探索远程技能」；
暗色下 `html #0A0B0D`、卡片 `#16181C`、封面底 `rgba(255,255,255,.06)`、页签选中 `rgba(255,255,255,.12)` + 白字；
浅色下选中仍是 `rgb(10,11,13)`；全程 Console 0 error。

## P9 收尾与全量回归（2026-10-09）

- **死文案键清理**（en + zh 成对删）：`skills.column.tokens` / `.triggers`、`skills.detail.tokens` / `.triggers` /
  `.updatedShort`、`skills.meta.tokens` / `.triggers`、`skills.installed.title` / `.description`、
  `skills.action.uninstall`、`skills.search.loading`、`skills.loading`、`skills.empty`、`skills.media.add.hint` /
  `.hintPreview`，以及 P6 那一批（`.select`/`.selected`/`.selectAll`/`.clearAll`/`.copiedHint`/`.downloadedHint`/`.discard.*`/`.packageNote`）。
- **`packages/ui` 的 19 个既有 lint 错误**：`react-refresh/only-export-components`（13 个文件，shadcn 原样文件把
  variant map / hook 与组件放在同一个文件里）与 `react-hooks/set-state-in-effect`（carousel、use-mobile 两处）。
  没有改上游写法，而是在 `packages/ui/eslint.config.js` 加一条**限定到 `src/components/**` 与 `src/hooks/**`**
  的规则关闭，并写明理由（Fast Refresh 是开发期便利，这些文件不是应用页面）——`pnpm --filter @workspace/ui lint` 现在 **0 error**。
- **静态回归全绿**：`plugin-skills` / `locale-zh-cn` / `ui` / `web` 的 tsc；`plugin-skills` / `ui` / `web` 的 eslint。
- **脚本回归全绿**：`check-store` / `check-package` / `check-updates` / `check-upstream` / `check-workspace-skills`（plugin-skills）
  与 `check-state` / `check-workspaces`（core）。
- **收尾浏览器一遍过**：网格 7 张卡 → 列表 7 行 × 66px → 灯箱（3 行位置 + 来源 + 圆角 24）→ Console 0 error。

## 修正：添加技能弹窗没有按画板做（2026-10-09，用户："导入的样式和我们的设计稿的样式不一样"）

**用户是对的，而且差得不止一处。** 画布这时能读到了，于是把 `Skills — Import`（`TOk46`）、
`Skills — Import (no folder)`（`FwOSX`）、`Skills — Download`（`Gw8JX`）三块板逐节点量了一遍，
对着实现找差异 —— 查出 **12 处**，其中 4 处是整块结构：

| # | 画板 | 我上一轮做的 | 现在 |
| --- | --- | --- | --- |
| 1 | 分段槽 `h36` + `p3` + `$surface-soft`；选中是 **`$canvas` 白片**（13/600），未选 13/500 `$body` | `h44` + `p1` + `bg-secondary`；选中是 **墨黑实心** | 照画板 |
| 2 | 头部 `pad[20,20,16,20]`、标题 16/600、说明 **12.5** `$muted`、关闭钮 30×30 | 标题 `text-base`、说明 `text-sm`(14)、关闭钮 28 | 照画板 |
| 3 | 本机导入第一屏：`Dropzone h224` + `$surface-soft` + `$radius-md`(12)，图标 28 `$muted-soft`，说明 13 `$body`，按钮 **40 高主色胶囊**，上限说明 `11.5` `$muted-soft` | 外壳是 `$surface-soft` + 12 圆角（对），但正文宽 560、无 20 内边距 | 尺寸对齐 |
| 4 | 选过文件夹后：**`Source Strip h64` + `$surface-soft` + `$radius-lg`(16)**，里面有 **36 的图标牌（`$canvas` + 12 圆角）** + 名称 + 提示 + `h32` 描边胶囊「重新选择」 | 一行 `h24`、图标牌 40 用 `$secondary` 且 16 圆角、按钮 32 | 照画板 |
| 5 | 下载段：**一条 Field Row**（字段 `h48` + `$radius-md` + **2px 主色描边** + 搜索图标 + 占位、`h48` `$surface-strong` 胶囊「列出」），**没有标签行** | 有「来源包」标签 + 44 高输入框 + 两行说明文字，靠失焦触发 | 改成字段 + 列出按钮（Enter 也触发） |
| 6 | 行内动作：`h30`、`pad[0,14]`、`gap6`、**12.5/600**，图标 13 | `h30` 但 `px-3.5`、13/500、图标 14 | 照画板 |
| 7 | 「已导入」徽章：`h26`、12/600、图标 13 | 12/500、图标 14 | 照画板 |
| 8 | 行文本块 `gap3`，名称 13.5/600、描述 12 `$muted` | `gap0` 且描述 12 | `gap3` |
| 9 | 行图标牌 `36` `$surface-soft` `r10`，图标 17 `$body` | 一致 | — |
| 10 | 本机导入的**第二行是技能描述** | 我写成了 `xxx/SKILL.md` 路径 | 改成描述（`scanFolder` 已经从 frontmatter 解析出来，不是编的） |
| 11 | 文案「从本机导入一个文件夹，或从注册表下载。」「本机导入」「已扫到 3 个技能」 | 「从本机导入技能文件夹…」「本地」「该文件夹里有 N 个技能」 | 照画板（中英都改） |
| 12 | 列表限高与 `scroll-thin` | 一致（360 高） | — |

**顺带补的两个设计 token**：`--copy`（= `$body` `#5B616E`）与 `--muted-soft`（= `$muted-soft` `#A8ACB3`），
画板里正文与最浅一档文字是**两个**值，之前全压进了 `muted-foreground`。深色下 `--copy` 取 `#A8ACB3`。

**实测（真机 + 真实 CLI）**：下载段列出 `mattpocock/skills` 的 **38 行**，**弹窗 640×589 —— 与画板 `Gw8JX` 分毫不差**；
本机导入首屏 **640×412 —— 与画板 `FwOSX` 分毫不差**；分段槽 `p3`、选中片 `$canvas`、行 `h68`/`px20`/`gap14`、
图标牌 `36` `r10` `$surface-soft`、动作 `h30` 胶囊 `#EEF0F3` 12.5/600、拖放区 `$surface-soft` `r12` `h224`、
主按钮蓝 `rgb(0,82,255)` 40 高胶囊；Console **0 error**；四个包 tsc + eslint 全绿。

**一次自伤**：编辑 `globals.css` 时把 `--secondary-foreground` 那行写断，导致样式表 500、页面闪回旧样式；
已修好并确认 `hmr update` 正常。

**没能验到的一处**：选过文件夹后的 `Source Strip` —— Playwright 在这个后台页里无法给
`webkitdirectory` 输入框塞目录（`setInputFiles` 超时），所以那一屏是按画板尺寸写的、逐项对齐，
但没有真机截图。其余两屏都是真机实测。

## 修正：上传菜单与详情面板（2026-10-09，用户两条："每一个 item 之间是有那个线来划分出来的"、"更新于是在来源的后面"）

**① 上传菜单**（画板 `lmsUt` 的 `Upload Menu`）：

| | 画板 | 我上一轮 | 现在 |
| --- | --- | --- | --- |
| 容器 | `w240`、`$canvas`、`r12`、发丝线、**内边距 0** | 260 宽、`p1.5`、`gap1` | 照画板 |
| 标题 | **没有标题** | 多了一行「添加媒体」 | 删掉（连同死键） |
| 行 | `h48`、`pad[0,12]`、`gap10`、**下边框**（最后一行无） | 竖排两段、`px2.5 py2`、无分隔线 | 照画板 |
| 行内 | 图标 **16** `$body` 在左 + 标签 13/500 `$ink` / 副标题 11.5 `$muted-soft` | 图标 14 与文字同排、标签 13.5/600 | 照画板 |
| URL 面板 | `w240` `p12` `gap10`：标题 12/600 + 字段 `h34` **2px 主色** + 取消/导入 `h28` 12.5/600 + 提示 11 | `h8` 输入与按钮、12px 文字 | 照画板 |

**② 详情面板**（画板 `qWqSs` 的 `Info Panel`）：`更新于` 原来排在 `位置` 之前，画板里它是 **Meta 的最后一行、跟在「来源」区块之后**；已改。
顺带对齐：头部加下边框（84 高）、类型胶囊文字 12/500 `$body` 且措辞改「添加类型」、
位置行图标牌 `r8`、`移除` 改成**发丝线描边**胶囊（原来是无边框透明）、页脚 `查看文件` 蓝胶囊与 `删除技能` 红描边同排。

**③ 顺带改掉的一处**：来源行 `来源 · 位置` 的位置不再是琥珀色 —— 画板写的是
`Source 12 $muted` + `Location 12/600 $ink`，而 DESIGN.md 里 `accent-yellow` 明确"仅插画使用"；
位置仍在左下角、仍然加粗，只是回到墨黑。
（要改回琥珀，把 [provenance-line.tsx](packages/plugin-skills/src/provenance-line.tsx) 那行的 `text-foreground` 换成
`text-amber-600 dark:text-amber-400` 即可。）

**实测**：菜单 240 / 行 48 / 分隔线 / 图标 16 / 标签 13-500 / 副标题 11.5 全中 —— 注意后台页把入场动画冻在
`scale(.95)`，量到的是 228/46，除以 0.95 正好 240/48；面板头部 84 + 下边框、位置行 `h56` + 图标牌 28 `r8`、
`移除` 发丝线、`安装` `#EEF0F3`、页脚上边框 + `查看文件` `rgb(0,82,255)` + `删除技能` 红描边 0.35、
区块顺序 `描述 → 类型 → 位置 → 来源 → 更新于`；Console 0 error；`plugin-skills` 与 `locale-zh-cn` 的 tsc + eslint 全绿。

### 补：删除确认气泡（同一次对话，用户："删除确认框的样式和我们的设计稿样式也不一样"）

画板 `PBdBr` 的 `Delete Bubble` 逐项量过，查出 **7 处**偏差，其中两处是实质的：

| | 画板 | 我上一轮 | 现在 |
| --- | --- | --- | --- |
| 「删除」按钮 | **透明底 + `#CF202F59` 红描边 + 红字** 12.5/600 | **红色实心**（`bg-destructive`） | 照画板 |
| 路径 | 放在 **`$surface-soft` 圆角块**里（`pad[8,10]`、`r12`、11px `$body`） | 一行等宽正文 | 照画板 |
| 阴影 | **没有阴影**（只有 1px 发丝线） | `shadow-soft` | 去掉 |
| 内边距 / 间距 | `p16` / `gap12` | `py3.5` / `gap2.5` | 照画板 |
| 标题 | 14/600 | 13.5 | 14 |
| 正文 | 12.5 `$body` | 12 `$muted` | 照画板 |
| 按钮文字 | 12.5/600、`pad[0,14]` | 13 | 照画板 |

这条**回退**过：DESIGN.md 校正那一轮已经写过"删除要红描边不是红实心"，我后来重写气泡时又写回了实心。
`semantic-down` 在规范里是 *text color only*，所以界面上不该再出现红色色块。

**实测**（÷0.95 去掉后台页冻结的入场缩放）：气泡 **320×186**、`r12`、`p16`、`gap12`、**无阴影**、
标题 14、正文 12.5、路径块 `#F7F7F7` `r12` `pad 8/10` 11px `#5B616E`、
`取消` 发丝线描边 + 墨黑 12.5/600、`删除` **透明底 + 红 0.35 描边 + `rgb(207,32,47)` 字** 12.5/600 —— 与画板一致。

### 补：URL 面板（同一次对话，用户："按钮位置错位了" + "这个文案我不要"）

- **按钮右对齐**：画板里 `Actions` 是 `justify-end`（容器 216 宽，`取消` 从 x108 起、`导入` 在 x166，右侧不留空），
  我写成了左对齐。已加 `justify-end`。实测：面板 240 宽、内边距 12，两个按钮贴右缘（右间隙 = 12）。
- **删掉校验说明那一行**（`skills.media.add.linkNote`，中英键一并删）：`http 与 https 都收。` 这句本来是为了解释
  "取图在服务端所以不受混合内容拦截"，但它既不在画板的 URL 面板正文里，也没解决"实现其实是记为引用"这个真问题
  （见下面待定第 2 条）。删掉后面板高 146 → **121**（画板的 146 里有那行 15 高 + 10 间距）。
  错误信息仍然保留在同一个位置（只有失败时才出现）。

**实测**：URL 面板 240 宽 / `r12` / `p12` / `gap10`、标题 12、字段 34、按钮 `h28`（`取消` 发丝线描边、`导入` 主色实心）、
右下间隙 12 = 内边距；Console 0 error；`plugin-skills` 与 `locale-zh-cn` 的 tsc + eslint 全绿。

### 补：详情面板滚到底时贴住页脚（同一次对话，用户："这个底部再加一点间距，不然和那个下面的按钮看着太挤了"）

滚动的正文区原来只有 `pt-5`，没有下内边距 —— 滚到底时最后一行（`更新于`）紧贴页脚上边框。
加 `pb-5`（20）后：滚到底时最后一行底边到页脚顶边 **60px**（= 18 的区块间距基线 + 20 的下内边距 + 剩余空白），
视觉上从"贴着"变成"明显分开"。画板的 `Panel Body` 下内边距写的是 0，但那是"内容刚好装满"的那一版；
真实数据更长，留白该由滚动容器自己给。

### 补：安装菜单点一下不该消失（同一次对话，用户："我点击下面的安装，那个菜单就消失了。我希望这个菜单是我点击外部区域的时候，它才会消失"）

查出**两个原因，缺一不可**：

1. **base-ui 的菜单项默认点击即关闭** —— `Menu.Item` 有 `closeOnClick`（默认 `true`），
   在卡片菜单的位置行上加 `closeOnClick={false}`。
2. **卡片 key 会变，整张卡被卸载重建** —— 这才是真正的元凶：`skillKey()` 用的是
   `${skill.location}:${skill.id}`，而装到一个位置后 `location` 从 `library` 变成 `both`，
   React 于是**销毁并重建这张卡**，菜单跟着它一起没了。改成一个**稳定的身份**：

   ```ts
   export function skillKey(skill: Skill): string {
     return inLibrary(skill) ? `library:${skill.id}` : `${skill.location}:${skill.id}`
   }
   ```

   仍然区分"库里的行"与"某个位置自带的同名行"（原来加 `location` 就是为了这个），
   但**装到几个位置不再改变身份**。副作用是这张卡里所有局部状态（封面比例、hover 等）也不再被重置。

   只加 `closeOnClick={false}` 是不够的：卸载重建发生在同一个点击的后续渲染里，菜单照样消失。

**实测**（真机往返，用户状态无残留）：

| 步骤 | 菜单是否还在 | 工作区行的勾 |
| --- | --- | --- |
| 打开 `shadcn-ui` 的「安装到」（它已装在工作区） | 在 | **有** |
| 点「工作区」（= 移除） | **在** | 消失 |
| 打开 `dsh-pre-push-checks` 的「安装到」（没装过） | 在 | 无 |
| 点「工作区」（= 安装） | **在** | **出现** |
| 再点一次「工作区」（= 移除） | **在** | 消失 |

`.agents/skills` 前后都是 `design-taste-frontend, impeccable`，`.claude/skills` 前后都是空 —— 来回一趟完全还原。

**顺带提醒自己**：用户可能同时在应用里操作，所以"测试写入"要以**前后两次磁盘读**为准，只读一次容易读到中间态（这轮就因为只读一次而误判过）。

### 补：分页应该是页面页脚（同一次对话，用户："分页的组件好像是跟随卡片后面的"）

画板 `tdqCI` / `vRdOZ` 的 `Footer` 是同一种东西：**内容区的页面级页脚**，不是某个视图内部的一条。

```
Footer | y950 h36 | justify space_between align center
  Count Text  「显示 12 / 15 个技能」 13px $muted     ← 左
  Pagination  每页 [12 ⌄] · 第 1 / 2 页 · 4 个 36×36 胶囊按钮   ← 右
```

| | 画板 | 我上一轮 | 现在 |
| --- | --- | --- | --- |
| 网格视图 | 内容区底部的 `Footer` | 紧跟卡片后面、右对齐的一条 | 页面页脚 |
| 列表视图 | **表格卡片之外**的 `Footer`（卡片底 930、页脚 962） | **塞进了表格卡片里**，还带一条上边框 | 移出卡片，与网格共用同一个页脚 |
| 左侧计数 | 「显示 {shown} / {total} 个技能」 | **没有** | 有（新增 `skills.footer.count`） |

**位置**用 `mt-auto`：列表短时停在内容区底部，列表长时自然跟在后面。为此把 `flex-1` 从页面根节点
一路透到 `Tabs`（`TabsContent` 本身就是 `flex-1`）。

**实测**：网格视图页脚 `[280,1161,1292,36]`、面板 `[280,339,1292,858]`（底 1197）—— 页脚正好贴在内容区底部；
切到列表视图后页脚**同一个位置同一个盒子**（`footIsPanelLast: true` 两者一致）；
文案「显示 5 / 5 个技能」+ 右侧分页器；空/加载/失败时不渲染页脚；Console 0 error。

**留下的差异（没动）**：分页器内部是共享组件 `TablePagination`（MCP / 概览 / 插件页也在用），
画板里是 36×36 胶囊按钮 + 标签「每页」+ 文案「第 1 / 2 页」，现在是 32×32 + 「每页行数」+ 「1 / 1」。
改它会同时动到那三张还没重做的页面，留到它们各自改版时统一。

### 补：表格缺的功能与尺寸（同一次对话，用户："表格布局和我们的设计稿也不一样，感觉缺了一些功能"）

用户说"缺功能"是对的 —— 画板 `vRdOZ` 的 `Head Row` 里**有一个 18×18 的全选复选框**，我这一版没有：

| 位置 | 画板 | 我上一轮 |
| --- | --- | --- |
| **表头** | `Cell > Checkbox` **18×18 r4、1.5px `$hairline`**（全选本页） | **没有**（第一列是空的） |
| 选中条 | `$surface-soft` 底 + 下边框；`已选 3` 墨黑胶囊 `h28`；`取消选择` **描边胶囊 `h34 px16` 13/600**；`安装到` **主色胶囊 `h34`** + 图标 14 + chevron | 白底；`已选` `h32`；取消是**纯文字按钮**；`安装到` `h32` |
| 列表缩略图 | `$surface-soft` `r12` 底 + **`file-text` 图标 16 墨黑** | 我画的三条渐短横线 |
| 标签胶囊 | `h22`、`px9`、**12/500 `$body`**、`$surface-strong` | `h20`、`px7`、12/500 |
| 更新时间 | **13/normal `$muted`**（画板不用等宽） | 12 等宽 |
| 表头文字 | 12/600 **`$muted-soft`** | 12/500 `$muted-foreground` |
| 行动作 | `h32`、`pad[0,12]`、**13/600**、图标 13、chevron 12 | `h32`、`px12`、13/**500** |
| 行 | `h66` + **下边框**（最后一行无）；单元格 `pad[0,0,0,14]`、外框 `pad[0,20]` | 行高对，但**没有行分隔线**，单元格 padding 被吃掉 |

**两个真 bug**：

1. **单元格 padding 全被吃掉**：`Table` 上的 `[&_td]:p-0 [&_th]:px-0` 生成的是**后代选择器**（`.x td`，特异性 0-1-1），
   比单元格自身的 `pl-3.5`（0-1-0）更高，于是我在 `<TableCell>` 上写的 padding 一个都没生效（实测全是 `0px`）。
   现在改成在单元格上用 `p-0 pl-*`（Tailwind 的长写排序在简写之后，结果确定）。
2. **全选需要"部分选中"态**：共享 `Checkbox` 原来只画一个勾。Base UI 会在根上加 `data-indeterminate`，
   于是在组件里给根加 `group/checkbox`，指示器里放 `check`（`group-data-[indeterminate]/checkbox:hidden`）
   与 `minus`（反向），部分选中时显示**短横**而不是勾。

**实测**：表头复选框 18×18 / r4 / `1px #DEE1E6`；勾一个 → 表头 `data-indeterminate` 且 a11y `checked=mixed`、显示的 SVG 是 `minus`；
点全选 → 5 行全勾、选中条出现（底 `#F7F7F7`、高 56、`取消选择` `h34` 描边、`安装到` `h34` `rgb(0,82,255)`）；
行 66 + 下边框；单元格 padding `20/14/14/14/14/14+20`；标签胶囊 `h22` + `rgb(238,240,243)` + `rgb(91,97,110)`；
缩略图 36 `r12` `#F7F7F7` + `file-text` 16；动作 `h32` + `#EEF0F3` + 13/600，右间隙 7；标签列在 1292 宽容器下**无横向滚动**；Console 0 error。

**顺带**：页签计数也按画板从等宽改成 13 常规（画板的 `Tab Count` 是 `font13/normal`，只有路径用等宽）。

**同轮顺带改的卡片正文**（画板 `Card impeccable > Body`，之前那轮定稿时的字号是我估的）：

| 位置 | 画板 | 改前 |
| --- | --- | --- |
| 正文内边距 / 行距 | `pad[16,18,18,18]`、`gap10` | `py-3.5`（14）、`gap-1.5`（6）+ `mt-0.5` |
| 名称 | **等宽** 14/600 `$ink` | 非等宽 14/600 |
| 时间 | 12 normal **`$muted-soft`** | 12 **等宽** `$muted` |
| 描述 | 13 normal `$body` | 12.5 `$muted` |
| 封面标签胶囊 | `h20`、`px9`、12/**600** | `h24`、`px10`、12/**500** |
| 出处行间距 | `gap5` | `gap6` |

实测：正文 `16px 18px 18px` + `row-gap 10px`，名称 `JetBrains Mono 14/600`，Console 0 error。

### 补：选中条常驻（用户："功能区默认都是要有的…没有的话点击之后会造成闪烁"）

上一轮是「没勾选就整条不渲染」，勾第一个复选框时它会**插进来把 56px 的行全往下推** ——
正在点的那个复选框会从指下跑掉，看起来就是一闪。而且这个批量安装入口在没选之前根本看不见。

现在 `BulkBar` 常驻：未选中显示 `已选 0`，`取消选择` 与 `安装到` 都是 `disabled`（实测 `opacity .5`）。
实测勾选前/后/再取消：选中条 `y=339 h=56` 三次完全相同，首行 `y=439` 不变，**没有位移**；
计数 `已选 0 → 已选 1 → 已选 0`，两个按钮 `disabled true → false → true`。

### 补：文档舞台竖向滚动（用户："没有上传资源，做成竖向滚动"）

技能没有图片/视频时，舞台渲染的是技能自己的文档，之前是 `overflow-hidden` 硬裁 —— 文档只露出开头一段，
下面全部切掉。现在 `DocumentStage` 改为 `overflow-x-hidden overflow-y-auto` + `scroll-thin`。

- 只写 `overflow-y-auto` 会让 `overflow-x` 一起算成 `auto`，于是折行多出的一两个字符宽度就画出一条横向滚动条
  （这就是之前那版"两条滚动条"的成因），所以必须显式 `overflow-x-hidden`。
- 内边距留在滚动容器上，滚动条不会压到文字。

实测（`impeccable`，无媒体）：`overflowY auto` / `overflowX hidden` / `clientH 605` / `scrollH 3486` /
**`maxScroll 2881`**（可滚动）/ `clientW === scrollW === 710`（**无横向滚动条**）/ 文档列宽 640 居中。Console 0 error。

### 补：清掉技能功能里的样例数据（用户："是不是有很多 mock 的代码没有删除啊"）

这些样例都是「没有宿主时」的兜底，产品形态永远走不到，但一旦走到就是**编造数据**（这条规则仓库里早就
写过：读不到的记录不许拿样例顶）。删掉的三套：

| 文件 | 删掉的东西 | 换成 |
| --- | --- | --- |
| `page.tsx` | `sampleSkills`（14 条假技能）+ `cover`/`shot`/`demoVideo`/`SAMPLE_ORIGINS`/`sampleRows`/`samplePatch`/`filterTags`/`usingStore` | `rows = library.rows`；没有库时给专门空状态 `skills.empty.noLibrary`（"这个形态没有技能库"），按钮行改为可选（这种状态没有"下一步"可点） |
| `registry.ts` | `previewSkills` 18 条 + `previewRegistry`（假搜索结果，装不了） | 文件只剩类型出口；`search-dialog` 的 `registry` 变成必需参数，没有源时正文换成 `skills.search.nosource.*` 说明并**隐藏搜索框** |
| `skill-detail-dialog.tsx` | `frontmatterLines`/`skillFile`（编出来的 SKILL.md）+ `sampleFiles`（假文件树） | 文件面板只列真实读到的清单；读不到就是空 |

顺带删掉 `Skill.triggers`（只有样例赋过值）与 `hub.ts` 里两处"回落到样例数据"的注释。

**实测**：正常形态 8 个技能（技能库 5 / 工作区 3）；探索真实搜到 skills.sh 的 6 条结果；
在扩展页把 skills.sh 卸掉后，探索弹窗显示"还没有可用的搜索源…"（无假结果、无搜索框），装回去后恢复原样，
`state/extensions.json` 内容与操作前逐字节相同；用 Playwright 拦掉 `/hub/skills` 模拟"没有宿主"，
页面显示"这个形态没有技能库"，没有编造行。`pnpm typecheck`、两个包 lint、
`check-store.ts` / `check-workspace-skills.ts` 全绿。

**还留着（没删，需要你定）**：`overview.tsx` / `mcp-servers.tsx` / `plugins.tsx` + `lib/plugins.ts` /
`repository.tsx` 这四页**整页都是写死的假数据**（不是残留，是功能没接）。删它们等于把页面从应用里拿掉，
属于产品决定，所以只记录不动。

**另外**：仓库自己的 `.agents/skills/`（grill-me / grilling / shadcn-ui 共 14 个文件）在工作区里被删过，
已用 `git checkout -- .agents/skills` 还原（删除未提交，还原=回到 HEAD；若那是你有意删的，重新删即可）。


**① 粘贴放开到视频（这是真 bug）**：`useMediaItems.addFiles` 与文件选择器本来就是 `image/*,video/*`，
但**粘贴那条分支只认 `image/`** —— 粘视频会被静默丢掉。改成 `image/` 或 `video/` 都收。
实测：合成一个 `video/mp4` 的 `ClipboardEvent` → 落盘、幻灯片计数变 `2 / 2`、提示「已粘贴 1 个文件」；
随后用「移除媒体」删掉，`~/.context-hub/skills/impeccable` 下**没有 assets 目录**（测试残留已清）。

**② 文案改成覆盖三种媒体**（中英同步）：

| 键 | 之前 | 现在 |
| --- | --- | --- |
| `skills.media.hint` | 拖入图片或视频…粘贴截图 | 拖入**图片、GIF 或视频**…粘贴 |
| `skills.media.paste.done` | 已粘贴 N 张截图 | 已粘贴 **N 个文件** |
| `skills.media.paste.text` | 剪贴板里是文本，不是图片。 | …不是**图片或视频**。 |
| `skills.media.add.fileHint` | 从本机挑一个或多个。 | **图片、GIF、视频**，从本机挑。 |
| `skills.media.add.linkHint` | 贴图片直链。 | **图片、GIF 或视频**的直链。 |
| `skills.media.add.linkLabel` / `placeholder` | 图片直链 | **直链** / 图片、GIF 或视频直链 |

**③ 提示被截断（顺手查出）**：菜单行的文字列没有 `flex-1`，用的是内容宽度，三条新提示各被切掉约 9px。
加 `flex-1` 后实测 `scrollWidth === clientWidth`（190 = 190），三条都不再截断。

**④ 与直链输入框抢粘贴（用户发现）**：document 级监听在输入框里也生效 —— 在直链框里粘 URL 会弹
「剪贴板里是文本，不是图片」。现在**粘贴落在 `input` / `textarea` / `contentEditable` 时监听直接返回**（不 `preventDefault`、不提示）。
实测：聚焦直链框粘 URL → `defaultPrevented: false`、**没有提示**；不聚焦时粘纯文本 → 仍然给出提示（这是对的行为）。

1. `N 个位置`（≥2 位置）与逐位置「本体 / 链接」徽章 —— 需要给 `SkillHold` 加"这条是不是链接"的字段（数据模型改动）。
2. 画布写"URL 导入先下载再落盘"，实现是**记为引用**；要么改实现，要么改画板那句话（UI 文案已经只说"http 与 https 都收"）。
3. Codex / Copilot 的 `skillLocation` 贡献（安装菜单里现在只有工作区与 Claude Code 两档）。
4. hover / focus / disabled 三态只做了最小规矩（禁用主按钮 / 聚焦环），没画全套。
5. 位置区如果到 7 个位置以上，需要"限高 4 行 + 内部滚动"（画板里提过，这轮没做）。
6. `apps/web` 另外四个模块页（Overview / MCP / Plugins / Repository）仍带旧玻璃类与第二档硬编码阴影，
   全局 token 已经换了，它们会跟着变，但**没有重排**——那是各自模块的改版。
