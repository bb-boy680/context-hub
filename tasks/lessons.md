# 经验教训

## 设计稿交付

- 新草稿画板要放在**参考画板紧邻的右侧**（同一模块行内），不要追加到行末——用户曾因草稿被放在 Skills 行第 7 位而完全找不到。
- 交付时必须同时给出三样：画板名称、它在行内的位置（左邻是哪块屏）、导出图的路径。
- **`designs/` 下的核对截图不进仓库**（用户原话："不要提交、每次提交的时候要删除这些截图、没用"）：
  `.gitignore` 已忽略 `designs/**/*.png|jpg|jpeg|webp`；导出只用于本地核对，提交前删掉，
  报告里用文字说清"哪块画板 + 行内位置 + 本次核对了什么"即可。
- 画布节点改名要同步更新 `<module>` 行的宽度与后续画板 x 坐标，否则会报 "partially clipped"。

## 卡片设计

- 封面照片不要用渐进模糊遮罩盖住底部：用户的原话是"图片展示的也不够具体"。要保留完整清晰的照片。
- 无照片时的兜底封面不要只用一行淡色文字，应该给出可辨识的文档预览 + 分类色渐变，让封面本身携带信息。
- 数值必须带单位（`2.4k tokens` 而不是 `2.4k`），否则会被误读为下载量/安装量；同一指标在网格与列表里用同一个词（triggers 不要一处写 phrases）。
- 图标名称先在小画板上验证再批量使用：画布图标集不认 `trash-2` / `zap` / `gauge`，认 `download` / `delete`（垃圾桶）/ `delete_forever` / `cancel` / `backspace` / `bolt` / `speed`。
- 用户不接受用开关（switch）表达"启用"：技能卡片右下角改成 Install / Uninstall 按钮。
- 一个技能可能有多个 tag：封面左上角用一排胶囊（每个 tag 一个、带本 tag 色圆点），最多 2 个再加 "+N" 溢出胶囊。
- 用户否掉了描述与操作行之间的分隔线：卡片要更"轻"。
- 画布批量插入节点后的下一次 execute 里，bounds / problems / 导出都可能处于未结算状态（本次为此浪费约 6 轮）：插入后隔 1-2 次调用再验证与导出。
- 画布上**新 `Insert` 的节点可能一直不结算**（导出里直接缺失，反复 Update 也没用）；从已定稿画板 `Copy` 过去的节点立刻正常。修复：删掉坏节点，改用 `Copy` 重建。
- **大屏网格要显式定列数上限**：`columns-[266px]` 让浏览器按 column-width 自行决定列数，2000px+ 的容器会排到
  7 列，每张卡只剩 275 宽（用户："大的分辨率下显示得很难看"）。修法是把列数写死再封顶
  （`columns-1 → 2 → 3 → 4 → 5`），**不是**放弃瀑布流。响应式用**容器查询**（`@container` + `@min-[…]`），
  别用视口断点 —— 网格可用宽度是视口减掉侧栏与内边距，两者不相等。
- **别顺手删掉用户喜欢的东西**：用户说"很难看"时，先分清抱怨的是**哪个部分**。
  我把瀑布流换成等高行网格，用户直接开骂"瀑布流的样式不见了"。改动要贴着诉求做小：
  这次的正确改动只有一行 class，我却把 `PhotoCover`、比例缓存、`onAspect` 整套删了再还原。

## 详情弹窗

- 打开详情用**单击**，不是双击（用户原话："单机后，希望打开弹窗是这样的"）。
- 形态是 **lightbox**：左媒体（图片/视频 swiper + 缩略图 + 拖拽/＋上传）+ 右信息面板，"View files" 再从右往左滑入文件面板 —— 不是原来的 tab 弹窗。
- 面板滑入用 `translate-x-full → translate-x-0` + `transition-transform duration-300 ease-out`；不要用 `useEffect` 里 `setState` 重置播放状态（eslint `react-hooks/set-state-in-effect` 会报错），改用 `key` 重挂载。

## 接真实数据

- 接磁盘库时不要用"更方便过滤"的控件替换设计稿已有的控件：技能页签原本是来源轴（All / Built-in / Workspace / skill.sh），
  被换成启用状态轴后用户立刻发现"这一块不见了"。设计稿的控件先照搬，功能不够再加**新**位置，别改旧位置。
- 改动服务端桥（`vite.ts` / host 侧 store）后要**重启 dev server**：Vite 不会热更已加载的插件模块，
  前端会拿到缺少新字段的响应，表现为页面直接崩在渲染里。判断依据：接口返回值形状与前端类型不一致。
- **产品状态不要放浏览器本地缓存**（用户原话："通过浏览器的本地缓存来做的，这样是应该不对的"）：
  `localStorage` 只适合"这台机器这个浏览器"的偏好（主题）；扩展启停、界面语言这类属于 **hub 自己的状态**，
  要落在 `<home>` 里（现在统一放 `<home>/state/<name>.json`）。内核接口同步、磁盘异步时，
  由**表单**在启动前读进内存并回写，是这套代码里惯用的解法（技能库、状态文档都是这个形状）。

## 改动与格式化

- **不要在这个仓库跑 `pnpm format`**：根 `.prettierrc` 是 80 列，而仓库里大量文件从来没按它重排过
  （`plugin-skills/src/page.tsx`、`messages.ts` 等都有上百列的长行）。跑一次会把 80 个未改动文件一起重排，
  提交前必须 `git checkout --` 逐个撤回。改完只保证 `pnpm typecheck` + `pnpm lint` 干净即可，格式化留给原文件自己的风格。
- 共享控件优先放 **`packages/extensions/src/components/`**（React 侧契约包，已有 react.tsx 与 react-hooks lint），
  而不是 `packages/core`（那是宿主/Node 侧内核，零 React 依赖）。子路径导出写进该包 `exports` 的 `./components/<name>`。
- 抽共享控件时**领域类型留在各插件**：控件的输入用 `{ id, icon, label, where?, … }` 这种无领域含义的结构，
  文案由调用方注入（`PlaceWords`/`PlaceListWords`），i18n key 不跨模块共享。
- 共享控件从 **`@workspace/extensions/components`** 一个入口导入（`src/components/index.ts` barrel + `exports["./components"]`），
  不要再写 `components/place-picker` 这种按文件名的子路径；否则每拆一次文件都要改所有调用点。
- **改了 `exports` 必须重启 dev server**：Vite 缓存 package.json 的解析结果，不重启会报
  `"./components" is not exported ... from package`，看起来像导出写错了（实测：重启前 500 + overlay，重启后正常）。
- **新增 workspace 包同理**：`apps/web/src/lib/hub.ts` 新引入的 `@workspace/agent-*` 包若在 dev server
  启动时还不存在，页面报 500 "Failed to resolve import"；`node_modules` 链接其实已就位
  （pnpm 把它们链在 `apps/web/node_modules/@workspace/` 而不是根目录），**重启 dev server** 即恢复。
  判断依据：`pnpm install` 说 "Already up to date" 却仍解析失败 —— 那就是模块图过期，不是依赖缺失。
- **同一件事在两处出现就是共享控件的信号，别只在一处修**：本轮先只给 MCP 写了内联的"类型选择"，
  用户随即要求"把 skill 的那个封装成公用组件，然后大家一起用"。判据不是"代码是否重复"，
  而是"这是不是同一个用户动作"——类型编辑（TagEditor）与筛选行（FilterBar）两处都是。
- **抽共享控件时只看一个来源，不要拿两边求"最小公倍数"**（用户原话："你只需要看 skill 那个的弹窗，
  不要看 MCP 弹窗的代码。不然的话，你会乱封装的"）：`DialogSplit` 完全照着 skills 弹窗抄，
  MCP 那边自己发明的 `flex-wrap + basis-[520px]` 响应式**没有被带进控件**——那是 MCP 的实现细节。
  代价要如实说：MCP 的外框因此从 1088×712 变成 skills 的 1136×740。
- **可选值一律来自真实数据，不要写死清单**：MCP 的类型本来有 9 个固定分类（`MCP_TAGS` + `mcp.tag.*` 文案），
  而服务器记录里的类型是自由字符串——用户明确要求"快捷选择的那些 tag 是我们目前已有的 tag，而不是固定的"。
  凡是"从已有内容里挑一个"的控件（建议、筛选、分组），来源都该是当前数据本身；
  顺带要检查筛选用的是"首个值"还是"任一值"（MCP 原来只比 `server.tag`，第二枚类型永远筛不出来）。
  `pnpm build` 走全新进程，能单独证伪"导出/解析写错"这一项。
- 要真机验证又不想动用户正在用的 5173：另起一个 `pnpm exec vite --port <其它端口>` 的临时实例，
  验证完 `Stop-Process -Id <pid>` 停掉（注意该实例只监听 `::1`，用 `localhost` 而不是 `127.0.0.1` 访问）。

