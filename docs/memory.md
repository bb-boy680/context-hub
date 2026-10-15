# 经验教训

用户每次纠正后，对应的问题模式记在这里，并为我自己定一条可执行的规则。
会话开始时先读本文件。规则来自真实失败，不写"要小心"这类无法执行的建议。

## 记忆该写在哪里（2026-10-15）

**问题模式**：用户说"缓存记忆"，我把经验写进了 Agent 自己的记忆目录
（`~/.claude/projects/<项目>/memory/`），没有写这里。而 `AGENTS.md` 的"持续改进循环"
明确要求记录到 `docs/memory.md`；更糟的是，我上一轮已经确认这个文件不存在，
只在回复里提了一句，没有建它。

**规则**：本项目中"记住这件事"一律指 `docs/memory.md`，会话开始先读它。
Agent 自己的记忆目录只保留一条指向本文件的指针，不重复正文。

## 扫描 / 审查类脚本必须先自证（2026-10-15）

**问题模式**：我写了一个带类型信息的脚本，扫全仓找"判错空值"的三元表达式，报 0 命中。
但它其实是坏的：`string | null` 是联合类型，`ts.TypeFlags.Null` 挂在**成员**上而不是
联合本身，`type.flags & TypeFlags.Null` 恒为 0。种了一个 fixture 才暴露 —— 修好后报 6 处。
"没发现问题"和"这个检查根本不会失败"当时长得一模一样。

**规则**：任何"扫全仓找某类问题"的脚本，先跑一个含已知正例和近似反例的 fixture，
确认它抓得到、也分得清，再报结果；修完脚本要重跑，不能沿用旧数字。
渲染类同理：用 `git show HEAD:<file>` 取旧版本，和当前版本跑同一个 harness，
确认缺陷"出现 → 消失"，并断言两版输出**只差**那一个修复点、没有附带改动。

## 空值判断：null 与 undefined 在这里语义不同（2026-10-15）

**问题模式**：`trailing === undefined ? null : <span>{trailing}</span>` 中
`trailing` 的类型是 `React.ReactNode`，而它**包含 `null`**；
`app-sidebar.tsx` 关闭时正好传 `null`。于是渲染出一个空 `<span>`，父容器是
`flex gap-2.5`，照样给它 10px —— 每个未启用的 Agent 行标签都被挤窄。
同类还有 `plugin-plugins/src/page.tsx` 里 `EmptyState` 的 `action`。

**规则**：判断"没有值"要同时测两个：`x === undefined || x === null`
（仓库已有写法，见 `extensions/src/components/page-body.tsx`）。
`??` 与 `||` **互不等价**，`||` 会把 `0`、`""`、`NaN` 当作没有，而本仓库有靠这个语义的地方：

- 排序比较器的 tie-break：`plugin-plugins/src/pictures.ts:94`、
  `plugin-skills/src/folder-scan.ts:342`、`plugin-skills/src/host/skills-fs.ts:539`
  —— 差值为 `0` 就是"相等"，要落给下一个判据，换 `??` 会断链。
- `plugin-skills/src/skill-detail-dialog.tsx:195` 的 `duration || 1`：
  元数据没加载时是 `NaN`，`??` 挡不住 `NaN`。
- `plugin-mcp/src/jsonc.ts:323` 的 `cell || INDENT`：空串表示"用默认缩进"。

反过来，`PlaceOption.count` 是 `number | null` 的**三态**：`undefined` = 这个列表不计数
（整个数字不渲染）、`null` = 这一行不报数（渲染 `—`）、`0` = 渲染 `0`。
所以 `undefined`/`null`/`0` 三者都要能分别表达，不能用 `||` 抹平。

## 格式化的基线（2026-10-15）

**问题模式**：改完文件跑 `prettier --check` 报失败，我以为是自己引入的。
实际是全仓都不符合自己的 `.prettierrc`（配了 `printWidth: 80`，代码按 ~100 列写）：
`packages/ui` 64 个文件、`plugin-plugins` 29、`apps/web` 23、`packages/core` 19，
包括我完全没碰过的文件。

**规则**：不跑 `prettier --write`（会把整个仓库重排，属于 `AGENTS.md` 禁止的
"无关格式化改动"），照周围代码的 ~100 列写。怀疑自己弄坏格式时，先拿
`git show HEAD:<file>` 比对，把"本来就不符合"和"我刚引入的"分开。
`prettier --check` 不是本仓库任何门禁（根 `package.json` 只有写入式的 `format`）。

## 页签的轴要照同类页面抄，不能从内部状态发明（2026-10-15）

**问题模式**：给 Plugins 页补页签时，我按代码里现成的 `library.delivered`
（本库投递过给哪些客户端）造了「已安装 / 未安装」两个页签。用户直接说"这两个
tab 是错的，应该只有一个资产库"。
轴选错了：`delivered` 是实现记账，不是人看资产的方式。而同仓的两个同类页面
早就定好了答案——Skills 是 `技能库`、MCP 是 `资产库`，两边都是
"hub 自己持有文件的行"，对客户端投递状态只出现在那一行自己的操作菜单里。
我读了 Skills 的 `page.tsx`（对着抄了交互），却没抄它的 `rowsForTab` 分轴。

**规则**：新增一个列表页的页签/筛选轴之前，先列同类页面的分轴实现
（这里是 `plugin-skills/src/page.tsx:rowsForTab`、`plugin-mcp/src/page.tsx`
的 `TABS`），确认每个轴**指同一个概念**再抄。内部记账字段（谁投递过、什么时候读的）
默认不是轴；要变成轴必须有用户能说出口的话。
顺带一条：轴换了要同步清掉旧键——`plugins.tab.installed/available` 从两份语言表
删净，`rowsForTab` 的 `delivered` 参数也是因为不再需要而删掉的，别留死参数。

## 共享组件换一种数据形状调用时，要先看它的布局假设（2026-10-15）

**问题模式**：把 `PlaceScopePicker`（位置菜单）接到 Plugins 页后，Agent 名字
看起来偏上、没垂直居中。原因是菜单行写死 `items-start`：图标砖 28px，文字列
两行（名字 + 路径）时正好撑满，一直没人发现；插件的 place 只有名字一行，
18px 的行盒就贴在砖顶。

**规则**：把一个共享组件接到新数据形状之前，检查它有没有"靠第二种内容撑开"的
布局。具体到本仓的 `place-picker.tsx`：行是 `items-start`，第二行
（`PlaceNote`，路径或 note）是隐性依赖。修法照 `min-h-7`（= 砖高）+
无条件 `justify-center`——`min-h` 在内容更高时不生效，所以两行的行零影响；
`self-center` 用在勾选图标上同理，但原来给两行用的 `mt-1` 要留着。

## 行级交互也要和同类页面对齐，不是只看数据够不够（2026-10-15）

**问题模式**：`/plugins` 上"只被某个 agent 持有、hub 还没收录"的包点不开详情弹窗。
代码是刻意的：`page.tsx` 的卡片按 `PluginRow.stored` 三态取 `undefined` 的
`role`/`tabIndex`/`onClick`/`cursor`，`openDetail` 里还有 `if (plugin.stored)`，
注释给的理由是"这个包在这里没有文件可读"。但同仓 `/skills` 的 `openDetail`
（`plugin-skills/src/page.tsx`）不设条件，未收录的技能照样开详情，弹窗内用
`inLibrary(skill)`（`skill-detail-dialog.tsx`）把文件面板换成「收录」。用户看到的
不是"一个有意的设计"，是"和隔壁页不一样"。

**规则**：又一个内部记账字段（`stored` = 本库是否持有这个对象的文件）被当成了
"用户能不能看"的前提。判断一个行级交互该不该对全部行开放时，先看同类页
（`plugin-skills`、`plugin-mcp`）在同样的行上给不给——给就照抄，然后在弹窗**内部**
按同一个字段关掉真会失败的入口（文件面板、写库的编辑器、依赖库记录的动作，
连同它必然失败的那次请求），而不是把整个详情挡掉。挡掉之前先问一句：
挡的是"这里没有数据"，还是"我还没实现"？

## 同类页已有的块要抄形状，不是只抄数据（2026-10-15）

**问题模式**：给 `/plugins` 详情弹窗补 skills 那边的「位置」块时，我照抄了 skills 的
`PlacesSection` 结构和 `PlaceList`（这半边对了），但同一轮里我把「来源」做成了两行
`MetaRow`（来源=「仓库」、更新时间=「15小时前」）。用户截图指出：skills 那块显示的是
卡片上没有的东西——真实地址（可点）、每个包的检查/更新按钮、上次检查时间；而我这版
显示的恰好都是列表页卡片上**已经有**的信息。另外分组标题我复用了页签的词
（工作区/全局），skills 与 MCP 用的是「工作区 / 全局 Agent」。

**规则**：一个同类页已经画过的块，**照它的形状做**，而不是从我这边的数据能填出什么
开始设计。具体做法：先把它那段 JSX 读出来，逐项对齐（标题行有什么控件、正文哪几行、
状态行写什么、按钮出现在什么条件下），再把我这边的数据往里填；填不满的地方
（skills 显示上游包地址，plugins 只能显示 source 词）就是**要做的工作**，不是可以
降级成两行文字的理由。分组标题、空态、按钮形状这类"小地方"直接抄键，不要用同义的
别的键凑——用户一眼就能看出「全局」和「全局 Agent」不一样。

## "谁装的"和"装没装"是两个问题，按钮要问后一个（2026-10-15）

**问题模式**：位置行右侧的按钮我按 `client.delivered`（**本 hub 投递过的** scope）
判断装没装，结果 Claude Code 明明装着 `ponytail@ponytail`，按钮却写「安装」。
原因：`deliveredOf` 只收 `pack.marketplace === PLUGIN_MARKETPLACE_NAME`（`context-hub`）
的包，而这个包来自 `ponytail` 市场，所以 `delivered` 是空的。
我当时代码里还写了段"只撤本 hub 自己的投递"的注释来自我说服——那是把
**实现记账**当成了用户看到的事实。用户看到的是"这个 Agent 里有它"。

顺带暴露第二个坑：就算按钮写对了，两个 installer 的 `remove` 都拿包名重建
`` `${id}@${MARKETPLACE}` ``，对 `ponytail@ponytail` 会去删一个不存在的 `ponytail@context-hub`，
**必定失败**。修法是让 `remove` 收客户端自己报的 id（`<name>@<marketplace>`），
这个 id 在 `PluginHeld.id` 里一直都有，只是我折合行时丢掉了。

**规则**：凡是"这里有没有"的按钮或徽章，判据必须是**对方报告的现状**（`held`），
不是**自己记的账**（`delivered`）。自己记的账只能用来判断"要不要再写一次"。
写这类判断前先问：这个字段的赋值条件是什么？如果它带一个 `marketplace === 我的名字`
之类的过滤，它答的就不是"有没有"，而是"是不是我干的"。
配套必查：判据换成 `held` 之后，**动作**还成立吗？状态改对了但点击必失败，
比状态不改更糟——按钮和行为要一起改，且要拿真实数据核对一次
（这里是 `claude plugin list --json` 输出的 `ponytail@ponytail`）。

## 跨进程的字段名，两边都要读一遍再改（2026-10-15）

**问题模式**：`查看文件` 一直是坏的，而且坏了很久（上一轮之前就在）。
客户端发 `?action=files&id=<name>`，host 读 `url.searchParams.get("name")`，
于是每次都是 400 `missing name`；面板 `catch` 掉之后渲染空树，
看起来像"这个包没有文件"。同类还有 `action=file`。
用户第三轮说"底部按钮有点问题"时才查出来。

**规则**：改一个跨进程/跨进程边界的调用（HTTP 查询串、消息字段、IPC 参数名）之前，
**把两端都读一遍**，别只读自己改的那一端。判断"这个功能没工作"和"这个包没数据"
要分开：面板 catch 之后渲染空值，把两类原因抹成了同一个现象——遇到这种
"读不到就留空"的写法，先直接拿 curl 打一次原始接口，看它到底答了什么。
本仓的开发桥没有测试（`check-plugin-*.ts` 只测 `src/`），所以这类字段名
只能靠实际调用核对；改完必须真打一次。

## 对"运行时是什么值"下结论前，先取一次真实值（2026-10-15）

**问题模式**：这一轮里用户连着纠正了四次，每次都是同一类错——我**读代码推断**
运行时是什么，而没有取一次真实的那个值。
- 「未收录的包点不开」：我读了 `openDetail`，没跑一遍看它到底开不开。
- 「按钮不切换状态」：我按 `client.delivered` 推断"装过"，没去跑
  `claude plugin list --json` 看真实 id 是 `ponytail@ponytail`——
  那个值一旦看到，市场名过滤的错立刻暴露。
- 「查看文件」：我按接口名推断它能读，没拿 curl 打一次，
  否则 `missing name` 一眼就能看到。

规则（每条都浪费了用户一轮）没有一条是靠更仔细地读代码避免的，全是靠**取真实值**。

**规则**：写下一个判断（"这个分支会走"/"这里是空的"/"这个能读到"）之前，
如果取真实值只要一条命令（curl、CLI 的 `--json`、`eval` 读 DOM），就先取。
本仓里取真实值的手段：
- `claude plugin list --json` — agent 实际持有什么，含它自己的 id 与 scope
- `curl "http://localhost:<port>/hub/<route>?action=..."` — 开发桥每个动作的真实答案
- 浏览器 + `eval` 读 DOM 的真实几何/属性，而不是看 JSX 猜布局
typecheck/lint/单测全绿**不代表**运行时是对的：它们证明不了字段名对得上、
也证明不了某个值非空。这一轮四次都是全绿之后被用户看出来的。

## 起子进程的地方要问 cwd（2026-10-15）

**问题模式**：把包装到「工作区」scope，文件落到了 `apps/web/.claude/`，
而不是用户选的那个工作区。原因：`runProgram` 用 `execFile` 时**没给 `cwd`**，
子进程于是继承 dev server 的工作目录（`pnpm dev` 从仓库根起、turbo 把 vite 起在
`apps/web`），而客户端是**按工作目录**解析自己的项目文件的——`claude plugin install
--scope project` 就写在启动它的那个目录里。

更糟的是同仓的 `plugin-mcp/vite.ts` 早就有 `startFolder()`（「工作区在用哪个，
没有则取宿主自己的目录」）并写了注释说明为什么，我在同一轮里翻过那段代码也没接上。

**规则**：写任何 `execFile`/`spawn` 之前先问一句"这个程序的**相对路径**（项目文件、
配置、缓存）会落在哪"——如果它按 cwd 解析，就必须显式传 `cwd`，
不能靠继承。默认继承的那个目录是**构建工具**的目录，不是用户的目录。
仓库里已经有 `startFolder()`（workspace store → `page.current` → 兜底
`hostFolder()`）在做这件事，别写第二份。

**验证方式**：这类 bug 的检查很便宜——让子进程自己报 `process.cwd()`，
在真桥上调一次 `{action:"program", program:"node", args:["-e","process.stdout.write(process.cwd())"]}`
就能看出来。已加进 `check-plugin-library.ts`。
