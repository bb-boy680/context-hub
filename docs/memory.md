# 经验教训

用户每次纠正后，对应的问题模式记在这里，并为我自己定一条可执行的规则。
会话开始时先读本文件。规则来自真实失败，不写"要小心"这类无法执行的建议。

## vite 插件的改动不会热更新，验证前必须换一台 dev server（2026-10-15）

**问题模式**：给 plugins 的开发桥加了 `?action=raw` 之后，直接拿用户已经起着的 5173 去 curl，
全是 `405`。我一度以为路由写错了或者分支没匹配上——其实是**运行中的 vite 进程load的还是旧插件代码**：
`vite.ts` 的改动不会进 HMR，只有客户端源码会。

**规则**：改 `packages/*/vite.ts`（开发桥、路由、host 侧动作）之后，**别在旧进程上验证**。
起自己的一台：`cd apps/web && npx vite --port 5273 --strictPort`，验证完**只杀自己那台**
（按端口找 pid：`netstat -ano | grep ":5273" | grep LISTENING`），用户那台 5173 全程不碰。
判据很简单：新动作返回 `405` 而客户端看起来"没反应"，就是进程旧了，不是代码错。

## 判断"某段代码有没有生效"，先看它有没有被真实数据走到（2026-10-15）

**问题模式**：这轮改了 `Markdown` 的图片渲染，其中一条分支是"没有 `imageBase` 时相对图不画"。
我先是拿 skills 页去点卡片验证，连点两次都没打开详情（点到面包屑、点到容器），
最后查出**本机没有任何 skill 的 SKILL.md 带图片引用**——这条分支根本没有真实数据能走到。

**规则**：说"验证过了"之前先问一句**这个分支有没有真实输入**。
没有的话，要么造一个（隔离目录），要么在报告里明说"只有代码路径可读，真实数据跑不到"，
不要把"页面没坏"当成"这条分支是对的"。同理，点开一个详情弹窗要用它自己的选择器
（本仓是 `div[role="button"][aria-label]`），别用 `[aria-label]` 兜底——面包屑也有这个属性。

## Bash 沙箱挡外网，装依赖必须关沙箱（2026-10-15）

**问题模式**：给 `packages/ui` 加三个依赖后跑 `pnpm install`，**挂满 300 秒被 timeout 杀掉**，
连 `--offline` 也一样。我一开始怀疑 pnpm 锁或 registry 配置，还去翻 store 和 `.npmrc`。

真实原因是 **Bash 工具默认沙箱没有外网**，而且是**丢包式**（不是 reject）：
`curl -m 10 https://registry.npmjs.org/...` 返回 `http_code=000 time=30.6`（超时），
所以 pnpm 的第一次 fetch 就无限等，表现成"卡住"而不是报错。
同样的 curl 加 `dangerouslyDisableSandbox: true` 立刻 `http=200`。

**规则**：本仓 `pnpm install` / 任何要访问 registry 的命令，直接带
`dangerouslyDisableSandbox: true` 跑，别先排 5 分钟网络故障。
判断方法是先发一条 `curl -s -m 10 -o /dev/null -w "%{http_code}" <url>`：
拿到 `000` 就是沙箱丢包，不是对方挂了。

## 大段替换不要把旧文本带进 new_string（2026-10-15）

**问题模式**：把 `code-view.tsx` 里 60 行的高亮器块换成对共享模块的调用时，
我把**旧块整段复制进了 `new_string` 的开头**，于是同一次 Edit 变成"在后面又插了一份"。
更糟的是**下一轮我又犯了同一个错**，同一个块变成三份，直到 tsc 报
"无法重新声明块范围变量"才停手。最后靠 `node` 删掉行区间才收干净。

**规则**：`old_string` 有多大，`new_string` 就只写**替换后的内容**，
不要把 `old_string` 当上下文粘进去 —— 这是纯粹的复制失误，不是判断问题。
一次 Edit 之后立刻跑一次作用域内的 `tsc --noEmit`（本仓 `pnpm --filter <pkg> typecheck`）：
重复声明、重复函数实现都是它立刻能抓的，别等整个特性写完再跑。

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

## 用户摊出一份产物说"不对"时，那是找代码的 bug，不是让你手工改数据（2026-10-15）

**问题模式**：用户贴出 `installed_plugins.json` 里 `superpowers@context-hub` 的
两条记录（`scope: project` + `scope: local`），说"只需要有这一个就足够了"。
我把这读成了"帮我清掉多余那条"，于是跑 `claude plugin uninstall --scope project`
改了他的机器状态——然后才在下一条消息里被告知"代码没有改啊"。

三个错都犯了：
- **把 bug 报告读成了数据清理请求。** 用户给我看的是**产物**，他要的是**产生它的代码**
  被修好。手工改那一条数据，bug 还在，下次点一次又长出来。
- **不必要地改动了用户的机器状态。** 那次 uninstall 动了 `~/.claude/` 下的真实配置，
  而这个动作对"修 bug"毫无必要——事后证明他真正要的是 `detail-dialog.tsx` 里
  那个循环。
- **已经拿到根因，还是停在"报告 + 反问"。** 两条记录只差 137ms，这个数字一眼就不是
  两次手动点击；顺着它读到 `rows.ts` 的 `SCOPES_OF` 和 `detail-dialog.tsx` 里
  `for (const one of scopesIn(...))` 就结案了。我在同一轮里已经把这些写在回复里，
  却把它当成"待你确认的分歧"抛了回去，而没有直接修。

**规则**：
- 用户给的是**界面、磁盘记录、日志、截图**时，先问"这条数据是**哪段代码**写出来的"，
  那段代码才是任务。产物只用来定位它。
- **不要为了让现象消失去改用户的机器状态**（`~/.claude/`、数据库、生产配置）。
  能让现象消失的两种做法里，改代码留下修复，改数据只留下一个还在的 bug。
- **已经定位到根因时，默认动作是修，不是问。** 只有当修法本身有真实分叉、
  且不同选择代价明显不同时才问——那一轮我确实有一个真实分叉（只写 local
  还是保留 project），但那是**修法**的分叉，不构成"先不改代码"的理由。

**验证方式**：判据是"下次不手工干预，这条数据还会不会长回来"。会，就说明改的是产物不是代码。
这次的检查落在 `check-plugin-rows.ts`——`scopeReached` 的四条断言把
"一个分组只落一个 scope"钉住，改坏了会红。

## 设计稿里已经写死的结论，动手前要先读完（2026-10-15）

**问题模式**：用户要求「plugins 卡片下面那两个操作按钮要和 MCP 一样」。我按自己的推断
做了 per-(client, scope) 的启用开关列表——而 `designs/plugins.pen` 里有一段 Note
**明确反对这个做法**：

> 插件文件只装一份（~/.claude/plugins），真正分作用域的是「谁在哪些项目里启用它」。
> 所以**行里不放开关**——开关只有开和关两态，说不清「在哪个范围启用」。
> 现在的分工是——启用范围列说状态，操作列说下一步做什么，永不同时表达两件事。

更糟的是**同一轮里我为了查另一个问题已经读过这段原文**（找「状态」两字的上下文时），
读到了、也贴进过回复，却没有接上。这跟本文件「起子进程的地方要问 cwd」是同一种失效：
阅读发生在同一会话，结论没有被应用。

被纠正后又走到另一个极端——改成完全**只读**的状态菜单，而用户要的是「设置启用和禁用的」。

**规则**：
- 实现「和 X 一样」的需求前，先搜该模块的**设计稿**和现有实现，把已经写死的结论读完。
  本仓的设计稿在 `designs/*.pen`（JSON 文本，可 grep 中文关键词）。
- 设计稿里出现「不做」「不放」「永不同时」这类字眼时，那是**结论**而不是建议：
  要么照做，要么明确提出要改它，不要在两者之间糊过去。
- **用户给的截图是需求，不是参考图。** 截图里的开关、「自管」胶囊、空态文案
  （`启用 / 0 个已启用` + 提示句）都是要做的，不是可选装饰。

**验证方式**：这一轮的收敛靠的是**实测**而不是继续推断——在一个隔离目录里
`install --scope project` 再 `disable --scope project`，对照 `.claude/settings.json`、
`.claude/settings.local.json` 与 `claude plugin list --json` 的 `enabled` / `projectEnabled`，
一次就定死了「哪个布尔代表工作区那一处」。语义不明的字段值得起一个隔离实验。

**但它有代价**：实验往**全局** `~/.claude/plugins/installed_plugins.json` 写了两条记录，
清理目录时没一起卸，留下指向已删路径的孤儿记录（后补卸掉）。凡是让 `claude plugin`
起进程的实验，收尾必须**先卸再删目录**，并回头核对全局记录只剩该留的。

## 同一份状态被两处各读一次，就一定会分家（2026-10-15）

**问题模式**：用户报「全局的 plugin 被禁用之后，switch 开关没有变化」——截图里
**文案写着「已停用」，开关却是开着的**。

根因不是渲染，是**两个字段读了同一件事**：

- 行里的文案读 `one.on`（该 place **自己文件**的值）
- 旁边的 `<Switch checked={...}>` 读 `place.hold.enabled`（**客户端把整条文件链解析后**的那一个值）

两者在特定情形下必然打架：`user` 文件 `false`、`project` 文件 `true`，
project 赢 → CLI 报 `enabled: true`。于是文案读文件说「已停用」，开关读客户端答案显示「开」。

`place.hold.enabled` **能通过类型检查**——`PluginHeldBy.enabled` 确实存在（作为「文件沉默时的回退」），
所以 tsc 一个字都不会说。而渲染层没有测试，检查脚本也够不着组件内部。

**规则**：
- 一个值要在同一行里出现两次（标签、开关、徽标、计数），就**只能算一次**，
  存进一个对象字段，两处都读它。不要把同一个语义在两个 JSX 位置各写一遍表达式。
- 把这类派生逻辑**从组件里抽成纯函数**（这轮抽成了 `rows.ts` 的 `placesShown`）。
  组件内部的表达式测不到，抽出来就有了落点，也才写得出断言。
- 判据：**如果两个位置读的表达式不是同一个标识符，就默认它们会分家**，
  除非能说出它们为何恒等。

**验证方式**：这轮的断言直接复刻用户截图那个状态（装在 `user`、user 文件 `false`、
project 文件 `true`、客户端答案 `true`），断言该行显示 `false`。把 `on` 退回客户端答案，
两条断言立刻变红并打出 `[["user",true],["project",true]]`——正是截图里的样子。

## "用某组件"的意思是连它的默认长相一起用（2026-10-15）

**问题模式**：用户说「item 使用 shadcn-ui 的 item 组件」，我用是用了 `Item`/`ItemGroup`/
`ItemTitle`/`ItemDescription`，但把它的外壳改掉了——`ItemGroup` 上加 `divide-y divide-border`、
`Item` 上写 `rounded-none px-0 py-3`，做出来是**没有边框的分隔线列表**。
用户截了一张 shadcn 文档里的 `Basic Item`（白底、1px 边框、16px 圆角）说「item 少了边框」。

我当时的理由是「对话框里已经有一堆卡片，再套卡片太吵」——但用户点的是
`variant="outline"`，那是 `Item` 自带的三个 variant 之一，不是我要发明的东西。

**规则**：用户点名某个组件库的某个组件时，**那个组件的默认形态就是需求的一部分**。
要改外壳之前先问：是「这个组件刚好合用，我要按我这边的排版调」，还是
「我要的就是它长这样」？判据是看用户有没有给截图或指名 variant——
给了就是后者，照 `variant` 写（这里是 `Item variant="outline"`），
不要再叠一层 `rounded-none`/`divide-y` 把它的边界抹掉。
跨页复用同一种内容（这里是 MCP 工具页与 plugins 列表）时，先看隔壁页那句话的组件，
再决定要不要偏离。

**附带一条实操**：`ItemMedia variant="icon"` 自带 `self-start` + `translate-y-0.5`
（把内联小图标对齐到标题基线）。放 28px 的图标砖时要 `self-center! translate-y-0!` 压掉，
否则一行有描述时砖会贴在标题上——这和本文件「共享组件换一种数据形状调用时」那条是同一个坑，
只是这次坑在 shadcn 自己的组件里。

## AOCI 的 FRAS 上限是硬判据，先量再写（2026-10-15）

**问题模式**：`aoci_update_entry` 一次提交 6 条，被整批拒回（`applied: 0`，`formal_writes_started: false`），
唯一原因是我把 `library.ts` 的 A 列了 7 项，机器上限 6。

**规则**：交 AOCI 之前先按机器上限自查，别凭手感写：

- A ≤ 6 项、F ≤ 160 字、R ≤ 8 项（只收精确托管身份 `code:path/to/file.go`）。
- **S 的 token 上限按 C 分档**（`governance.budget.s`，模式 `enforce`）：

  | C | 上限 | 目标 |
  |---|---|---|
  | 1-4 | 40 | 20 |
  | 5-7 | **80** | 40 |
  | 8 | 140 | 70 |
  | 9 | 200 | 100 |

  token 按 UTF-8 字节 / 3 估，一个中文字约 1。
  注意这比 `aoci.meta.txt` 里那行 `#S配额: C7-4≤200` 更紧，以 budget 表为准（它才是被校验的那个）。
  本仓现有的 C7 条目 S 多在 63-77，改动前先量一遍余量。
- 写之前拿脚本量一遍最省事：
  `node -e 'const S=process.argv[1].split("S:")[1];console.log(Math.round(Buffer.byteLength(S,"utf8")/3))' "<整行条目>"`
- 被拒后只能改 findings 点名的那个字段，其余候选必须**逐字节**保持原样重提。
- **这条我犯过一次（2026-10-16）**：上面那张表本来就在本文件里，我却按 `C7 ≤ 200` 写，
  一次提交 14 条里有 9 条被 `entry_field_budget_exceeded` 拒回（`applied: 0`）。
  教训不是"再记一遍数字"，而是**别靠记忆填表**——交之前把整批条目的四个字段一起丢给脚本量，
  脚本打印 `F/R/A/S = x/上限`，超一格就当场改，比事后读 findings 逐个返工便宜得多。
  返工时要压的是**语义**（合并、删可推导的句子），不是机械砍字；删掉的语义等于没索引过。

**附带一条**：`applied` 之后 audit 会报 `E规模档位错配`（文件长过档位）。那不是失败，
但下次维护时顺手把 Tag 的 E 位改对。



**问题模式**：上一轮我告诉用户「本仓没有可用的浏览器驱动（`node_modules/.bin` 里只有
tsc/prettier/turbo），所以界面没看过」——**这是错的**。不需要 playwright：
Node 24 自带全局 `WebSocket`，Windows 上有 Edge，用 `--remote-debugging-port` 起
headless 就能直接说 CDP。

这一轮用它一次拿到了四个只看代码拿不到的结论：
- `Preview` 页签上的蓝框是**我自己合成 `.click()` 触发的 `:focus-visible`**，
  不是缺陷（改用 `Input.dispatchMouseEvent` 发真实鼠标事件后读到
  `focusVisible:false`、`outline:3px none`，截图里框就没了）；
- `TabsContent keepMounted` 确实生效——隐藏的展示图页仍在 DOM 里（`hidden:true`）；
- 图标砖与行中心 `offBy: 0`（`alignSelf:center`、`translate:0px`），证明
  `self-center!` 真的压住了 shadcn 的 `self-start`；
- 列表的实测边框/圆角是 `1px rgb(222,225,230)` / `16px`，即用户要的那个样子。

**规则**：要判断「渲染出来是什么样」「某个属性能不能生效」，先起一次 headless Edge + CDP，
不要下「环境不允许」的结论。步骤：

```bash
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
"$EDGE" --headless=new --disable-gpu --remote-debugging-port=9222 \
        --user-data-dir=<temp>/profile --no-first-run about:blank &
# 然后 fetch http://127.0.0.1:9222/json/list 拿 webSocketDebuggerUrl，
# 用全局 WebSocket 说 Runtime.evaluate / Page.captureScreenshot
```

配套两条：
- **点要用 `Input.dispatchMouseEvent`，不要用 `element.click()`**，否则会引入
  真实用户永远看不到的 `:focus-visible` 蓝框，把人骗一轮。
- 要造带 `commands/`、`.mcp.json` 之类的**测试包**时，起 `CONTEXT_HUB_HOME=<temp>`
  的第二个 dev server，别往真实的 `~/.context-hub/plugins` 里写；
  收尾记得连进程一起清掉（这轮清理时误杀了一个不是我起的 5173，用户自己的服务）。


## 用 CDP 点开关菜单会写进用户的真实配置（2026-10-15）

**问题模式**：为了看「状态」菜单里各位置的状态，我拿 headless Edge 点了 `状态 ponytail`、
`安装到 ponytail` 这些菜单，读 innerText。收尾时发现两处**用户的真实状态被我改了**：

- `D:\work-space\new-api\.claude\settings.json` —— **这个文件本来不存在**，我点出来一个
  `{"enabledPlugins":{"warp@claude-code-warp":true}}`（菜单里的 Switch 被我的坐标碰到了）；
- `D:\work-space\dsh-context-hub\.claude\settings.json` 多了一条 `aikido@context-hub: true`。

菜单的打开是安全的，**菜单内部的点击不安全**：`PlaceMenu` 的行尾是 `Switch`，
一次偏移几十像素的合成点击就等于「帮用户拨了开关」，而它写的是仓库里的 `.claude/settings.json`
或 `~/.claude/settings.json`。这跟本文件「不要为了让现象消失去改用户的机器状态」是同一条。

**规则**：
- 探针里**只读的东西只用 `Escape` 关**，绝不用「点别处」来关菜单；一次 `Page.navigate`
  之后只做一次菜单交互，别让上一张菜单还在关闭动画里就发下一次点击。
- 探针跑完必须回头核对**被点过的那些路径**是否还是原样：本轮核对方式是 `cat` 那两份
  settings、`installed_plugins.json`（`scope`/`projectPath` 列表）、以及 `GET /hub/workspaces`
  的 `current`；发现多出来的东西就按原内容写回去（本轮已还原：new-api 那个文件删掉，
  dsh 那份恢复成只有 `ponytail@ponytail: true`）。
- 需要「带真实数据看菜单」时，宁可起 `CONTEXT_HUB_HOME=<temp>` 的那台，或者只读
  桥接口的数据自己算（本轮最后就是改读 `GET /hub/workspaces` + 菜单文本，不再点菜单内部）。

## `claude plugin list` 的 `enabled` 是整条文件链的答案，`projectEnabled` 只是本仓库这一层（2026-10-15）

**问题模式**：用户报「切换到 new-api 后 plugins 页还是说 ponytail 在本仓库已启用」。
我按归档计划 `plugins-status-menu.md` 的记忆，打算把工作区那一处的兜底从 `enabled`
换成 `projectEnabled`（那份计划里叫 `workspaceEnabled`）——**方向错了**。

真实值是：`~/.claude/settings.json` 的 `enabledPlugins` 里就有 `ponytail@ponytail: true`，
这个包是**机器级启用**的，本机每个仓库都生效。`projectEnabled` 只是「本仓库这一层的文件说了什么」
（没有这个文件就是 `false`），拿它当答案会把一个真实生效的包报成「未启用」。

**规则**：`claude plugin list --json` 的两个布尔要分开读——`enabled` = 整条链解析后的答案
（machine + project + local），`projectEnabled` = 项目那一层自己的值。判断「配置里某个值
代表什么」之前，先把**产生它的那几个文件都打开看一眼**（这里是 `~/.claude/settings.json`
与仓库里的 `.claude/settings.json`），别只信归档计划里当时测出来的那张表——那张表是对的，
但它只覆盖了「local 文件参与」的场景，不能外推到「机器级启用」。

**判据**：归档计划里的结论是**当时的实验**，不是规范；它没有覆盖的输入（这里是「user 文件参与」）
要重新测一次再照做。

## 「照 X 的逻辑做」= 先把 X 的代码读完，再谈怎么省（2026-10-15）

**问题模式**：用户报「plugins 上传展示图失效了」。实测发现上传本来就没落盘（从第一版起只有
`URL.createObjectURL` 预览），于是我把它当成「没接上写入」来做，并且为了省事把**封面重新定义成
「第一张图片」**（理由是卡片用 `<img>` 画，视频会破图）。用户直接纠正：

> 逻辑不对、完全使用 SKILL 的逻辑啊。展示第一张资源、如果是视频自动播放。swiper 切换到视频时也自动播放。
> 而且 SKILL 是有视频懒播放的。

同仓 `plugin-skills` **早就有**：`cardMedia`（第一个资产是视频就用 `AutoplayVideo` 播）、
`AutoplayVideo`（IntersectionObserver + 同时解码上限 + 灯箱打开时全局暂停）、`MediaSlide`（当前页播、其余暂停）、
`VideoThumb`（只有当前拇指在播）、Swiper 主舞台 + 拇指条。我一行都没读，就用「视频会破图」把自己劝退了。

**判据**：
- 用户说「用 X 的逻辑」时，**X 就是参考实现，先把它整段读完**（这里读了 `media.ts`、`autoplay-video.tsx`、
  `skill-detail-dialog.tsx` 的舞台与拇指条、`page.tsx` 的卡片），再决定要不要共用。
- **不要用「我这里用不上」为理由砍掉一个已经存在的分支**。视频当封面在 skills 里是**支持的**（用播放器画，
  不是 `<img>`），我的「省事」实际上是把能力砍了。看到自己想收窄一个既有行为时，先找出它在别处是怎么实现的。
- 同一套东西已经在两个包里各抄一份时（`knownAspect`/`rememberAspect` 当时就是两份），**该抽共用而不是再抄第三份**。
  用户选择了抽到 `@context-hub/extensions/components`（`swiper` 依赖也跟着从 skills 挪过去）。
- 手改大段 JSX 用脚本按行号删/缩进**很容易切错块**（这轮把 Popover 切成了半截，只能 `git checkout` 重来）。
  结构化改动优先用 Edit 工具配唯一锚点；真要按行删，先打印边界行确认。

## 计划里自己加的那条「更省的定义」，动手前要再验一次（2026-10-15）

**问题模式**：同一轮里，我在计划阶段把 `PluginRow.cover` 从「第一个资产」改成「第一个图片」，
**并把 `check-plugin-rows.ts` 的两条断言改成了新语义**——于是测试全绿，指向的是一个错的行为。
断言是我改的，它不会替我说话。

**规则**：改一条既有语义时，先问「这条断言原来在保护什么」；我要改断言的话，必须在计划里写明**为什么原语义是错的**，
而不是「新语义更好实现」。这条和上一条是同一件事的两半：**参考实现存在时，它是规范的候选，不是可选方案。**

## 受控组件里，「不是用户点的动作」要按可见性 gate（2026-10-15）

**问题模式**：`TabsContent` 带 `keepMounted`，而展示图面板的粘贴监听挂在 `document` 上。
以前粘贴只是塞进一个看不见的本地数组，所以没人发现；一旦接上「写盘 + 改封面」，
在读 skills tab 时按 Ctrl+V 就会**看不见地改掉封面**。

**规则**：把「只影响自己」的本地行为改成「影响共享状态」的落盘行为时，回头检查那个组件的**每一个非点击入口**
（document 级监听、拖拽、快捷键），它们是否真的只在用户看着它的时候生效。
本轮实测：读 skills tab 时粘贴 → 记录与资产目录都不变；切回图片 tab 再粘贴 → 写入成功（正反两面都测了）。

## 共享组件里"传了自定义渲染"往往意味着"内置的那份不再画"（2026-10-15）

**问题模式**：提示词卡片的安装菜单里，已经装过的 Agent 行**不显示勾**。
我按 `PlaceMenu` 文档写了 `trailing={(option) => <PlaceMore …/>}`，功能对了，
但行上少了那个表示"已经在这儿"的对勾。真因在 `place-picker.tsx:238-242`：

```jsx
{trailing === "check"
  ? option.selected === true && <CheckIcon … />
  : trailing(option)}
```

`trailing` 是个**联合**：默认值 `"check"` 画勾，**一旦传入函数，勾那条分支就整条不走**。
`option.selected` 我照样填了，但它再也没被读过——而类型检查一个字都不会说。

**规则**：给共享组件传"自定义渲染"之前，先把那个 prop 的**两条分支都读一遍**，
确认传自己的那份之后，**原来的默认内容还算不算数**。判据很简单：
grep 那个 prop 名在组件里的每一次出现，看它是"追加"还是"二选一"。
本仓已踩过两次同型的坑（`place-picker` 的 `trailing`、`item.tsx` 的 `self-start`），
凡是 `a ? default : custom` 这种写法，传 custom 就等于**接管**，默认那份要自己补回来。

**附带一条**：`DropdownMenuSubTrigger` 自己会追加一个 `ChevronRightIcon`。把它放进 28px 的
`⋯` 图标按钮里就是"按钮里挤着两个图标"。要留住它的键盘与 hover 行为又想去掉箭头，
只能 `[&>svg:last-child]:hidden` 压掉——这属于**共享组件的默认长相与调用处冲突**，
改共享组件的代价大于在调用处显式声明一次。

## "设计稿给了形态"不等于"数据流有人问过"（2026-10-15）

**问题模式**：`designs/README.md` v17 有一条写得很像结论的判据——
「提示词是**取用**的（复制内容），不是**挂载**的（开关生效）」，据此把 Prompts 的行尾做成复制图标。
我照着做了，用户改口：提示词要**交付**（安装到 Agent 目录、生成 Rule / Commands）。

"复制取用"和"交付"**都能解释"提示词不是开关"**，所以那一页读起来毫无破绽；
它漏掉的是真正的问题——**这条内容最终写进了谁的文件**。
设计稿能定的是形态（列表 + 详情、胶囊、页脚），定不了数据流。

**规则**：按设计稿实现之前，对每个"它是什么"的论断追问一句
**"这个特性能被谁消费"**。本轮的答案在仓库里已有一半：`packages/core/src/place-files.ts`
就是"往客户端的文件里写东西"的那条通道，而提示词要用的正是它——
**设计稿的结论与仓库里已有的能力对不上时，先怀疑设计稿的结论**。
发现自己要照抄的结论会推翻它时，照 §设计稿那条老规矩：要么照做，要么明确提出改它，
并把改的理由写回设计稿（本轮在 §3e 新增「Prompts：交付出去，不是复制走」，v17 那条标注为已推翻）。

## 拿用户输入拼路径时，`assertPlaceFile` 拦不住反斜杠（2026-10-15）

**问题模式**：提示词的名字来自弹窗输入，会变成文件名再拼进 `PlaceRef.file`。
看 `packages/core/src/host/place-files.ts:52` 的校验：

```ts
if (place.file.split("/").includes("..")) throw new Error(…)
```

它按 `/` 切分查 `..`，**反斜杠不切**。所以 `..\..\evil` 能过校验，
到了 `path.join(base, ...file.split("/"))` 就在 Windows 上真的逃出 root。
这是 core 的既有洞，但提示词模块是**第一个拿用户输入拼路径**的调用方。

**规则**：新模块从用户输入生成文件名时，不要指望下游的路径校验——
在**生成的这一步**就把名字限定成 `[\p{L}\p{N}-]`（见 `plugin-prompts/src/slug.ts`），
并且自己拒绝 `.`、`..`、以点开头、Windows 保留设备名（`con`/`com1`…）。
`assertPlaceFile` 挡的是"调用方传错了"，不是"恶意名字"。
`plugin-prompts/scripts/check-prompt-text.ts` 里那 10 条危险名字就是这条的判据，
其中 `..\..\windows\system32` 和 `C:\Users\me\.claude` 是专门为正则写不出反斜杠的历史误判留的。

## 「和 X 的 UI 一样」= 先把 X 的**几何**量出来，不是只抄数据（2026-10-16）

**问题模式**：用户说提示词模块「UI 页面和 SKILL 模块的 UI 相同、瀑布流布局、表格布局」。
我照抄了 skills 卡片的 JSX，但**漏掉了封面那个 `aspectRatio`**，
于是我的卡片封面高度跟着正文长度走（实测 73 / 121 / 191px），三张卡片高矮不一——
而 skills 是恒定的 16:9（362 宽 → 204 高）。用户一眼就看出来了。

同轮还漏了两处，都是"读了代码但没量结果"：

- **描述行**：skills 卡片 body 是三行（名称 / 描述 / 底行），我只做了两行；
- **列数档位**：skills 是 `…@min-[1136px]:columns-4 @min-[1426px]:columns-5`，我抄丢了最后那档。

**规则**：说"UI 一样"时，抄完结构要**量一遍渲染结果**再报完成——
本仓的手段就是 CDP（`docs/memory.md` 那条 headless Edge）读 `getBoundingClientRect()`：
把两边页面的卡片 `w / h / 封面高` 打出来对比，数字不一样就是没对上。
判据很硬：**同一个网格里各卡片的 `coverH` 应当相等**（无图卡片走 `FALLBACK_RATIO`），
以及**同一个容器宽度下两页的列数应当相同**。
只对比 `innerText` 会把"版式全错"当成"内容对了"。

**附带一条**：`FALLBACK_RATIO` 这类常量住在 `plugin-skills/src/page.tsx` 的模块作用域里，
跨包抄一份时容易连名字一起漏。本仓的共享常量在 `@context-hub/extensions/components`
（`knownAspect` / `mediaKind` 等），但纯比例常量不在——抄的时候要连值一起搬。

## 用户说「不需要 X、需要 Y」时，先查 X 是不是已经被我当成了**身份**（2026-10-16）

**问题模式**：提示词我一开始给的是「名称 + 正文」，用户纠正：「prompts 是不需要标题的、
但是需要 description」。看着只是换个字段名，实际不是——`name` 在我这里已经是三处的身份：

- 投递时的文件名（`slugOf(prompt.name)` → `.claude/commands/<slug>.md`）
- `CLAUDE.md` 里那一节的幂等标记（`<!-- context-hub:<slug> -->`）
- 库里"两条是不是同一条"的判据（`create` 里拒绝重复）

所以这次改动同时是：表单换字段、卡片标题换字体（名称用等宽、句子用正文）、
store 的每一条读写、交付的四条路径、以及"必填"的判据从 name 换到 description。
如果我当时只把「名称」的 label 改成「描述」，代码会照跑、typecheck 照过，但
**文件名、幂等标记、去重三处都还在读一个已经没人填的字段**——空 slug。

**规则**：用户说「去掉 X，加上 Y」时，先 grep X 在**身份位置**上的出现：
主键、文件名/路径、去重键、幂等标记、缓存键。有一处就要连带改，不能只改标签。
判据很简单：把 X 清空后，`slugOf(X)` 会得到什么？如果答案是空串或常量，
那它就不是装饰，是承重墙。

**附带一条**：用户给了一个**手写的产物文件**（本仓根的 `prompts.json`）当格式依据时，
**形状照抄、位置要问**——我按文件里那份抄了字段（`prompt`/`description`/`tags`/`updatedAt`/`assets`），
但库最终落在 `~/.context-hub/prompts.json` 而不是文件所在的位置。两者是独立的两件事，
文件里看得出来的是**它长什么样**，看不出来的是**它该在哪**，后者只能问。

## 用户改路径时，先看断言里有没有把路径**写死**（2026-10-16）

**问题模式**：用户把库的位置从 `<hub-home>/prompts.json` 改成 `<hub-home>/prompts/prompts.json`。
我改了 `promptsFile()`（一处），typecheck/lint 全过——但 `check-prompt-store.ts` 里
有一条断言是 `readdir(home) === "prompts.json"`，它把**路径写死在了断言里**，
于是测试变红，报的是 `["prompts"]`。

这次是好事：断言抓住了我漏改的文档与预期。但如果那条断言写成"目录里只有一个文件"
而不是"目录里叫 prompts.json"，改路径时它会继续绿，而实际断言的已经不是同一件事了。

**规则**：改一个路径/文件名时，grep 的不只是 `src/`，还要 grep **检查脚本与文档里的字面路径**：
本仓 `scripts/check-*.ts` 常常直接写 `path.join(home, "index.json")` 这类字面量。
判据：路径改动后，先把检查脚本跑一遍——**它红了是在帮你看清单**，不要先改它；
红在哪几行，就说明哪几行还认为旧路径是对的。
顺带一条：断言"只有这一个文件"比断言"这个文件叫这个名字"更能扛住改名，
两者都值得写，因为它们抓的是不同的事（前者抓多余产物，后者抓位置本身）。

## 库文件放"一处"还是"一个目录里"，是用户的决定，不是我的（2026-10-16）

**问题模式**：我按"一个关注点一个文件"的理由把库放在 `<hub-home>/prompts.json`，
写进了注释当设计说明。用户后来指定 `<hub-home>/prompts/prompts.json`——
多一层目录。这不是风格问题：hub home 下已经全是目录（`mcp/`、`state/`、`skills/`），
一个裸文件是唯一的例外，而**例外通常就是还没长完的地方**——
提示词以后要有附件、导出、版本，那些都得有个目录放。

**规则**：给 hub home 下的新东西定位置时，**先看旁边是什么形状**（`ls ~/.context-hub`），
跟着那个形状走；要偏离就在计划里明说理由，别在代码注释里自己说服自己。
这类"位置"的选择用户一句话就能推翻，成本却是一轮改动，能问就问。

## 推翻一个结论时，先分清"它错了"和"它只是不够"（2026-10-16）

**问题模式**：v17 给 Prompts 定的行尾动作是**复制图标**，v18 用户改口成**交付**（安装 + `⋯` 菜单），
我照 v18 把复制整个删掉，只留安装。这一轮用户又要复制回来，与安装并排。

复盘时错的不是我删复制的那次——v18 的口径下它是多余的。错的是**我把它读成了"二选一"**：
一个动作被推翻，通常推翻的是它的**排他性**，不是它的**存在**。
"提示词是交付的"这句话只否定"复制是它唯一的动作"，不否定"复制可以有"。

**规则**：用户改一个动作/字段的定位时，问一句**它和新的那个是同一根轴上的互斥项，还是另一根轴上的并列项**：
- 互斥（开关 vs 复制）：新的上，旧的整个下；
- 并列（安装 vs 复制）：新的上，旧的**留给用户自己说要删**。

判据：旧的能不能在**新口径下**找到一个只有它能回答的问题？
复制能回答"贴到聊天框里"，而交付回答不了——那就不是互斥，我删早了。
推不掉的时候就别删：留一个多余的动作，成本是一枚按钮；删一个还有人要的动作，成本是一轮返工。

**附带一条**：并列动作排在哪一侧由**主次**定，不由添加顺序定。
交付是这个模块的主语（整个 `⋯` 菜单都挂在它下面），所以它在行尾、复制在它左边——
`justify-end` 的行里，最后那个才是行末。复制自己的**标签不能变长**（`复制` → `已复制` 会把安装挤走 13px），
确认只换图标与颜色，和本仓 `code-view.tsx` 的 `CopyButton` 一致，宽度抖动只有这一个办法能免。

## 新模块的弹窗/菜单/标签页，先去"兄弟模块"里抄，不要自己搭（2026-10-16）

**问题模式**：给 Prompts 写详情弹窗时，我按需求描述自己拼了一套东西——
胶囊式的标签页（`bg-secondary` 药丸）、`AlertDialog` 做删除二次确认、`w-[210px]` 自定宽度的 `⋯` 菜单。
用户连着三次纠正：标签页要像 Plugins 那样（`TabsList variant="line"` 下划线式）、
删除确认要和别的模块一致（锚在按钮上的 `Popover` 气泡）、
`⋯` 菜单要用应用自己的菜单外观（`w-[200px] flex-col gap-0.5 rounded-md p-1.5 ring-1 ring-border shadow-soft`）。

**这些全都已经在仓库里**：`plugin-plugins/src/detail-dialog.tsx` 有完整的 `Tabs` 用法，
`plugin-skills` 和 `plugin-plugins` 各有一个 `DeleteBubble`，
`apps/web/src/components/workspace-group.tsx` 是菜单外观的来源。
我一样都没看，全是自己写的——而写出来的东西在形状上就是"另一个 app"。

**规则**：做**新模块的同类界面**（弹窗、详情面板、行菜单、标签页、确认框、空状态）之前，
**先打开一个已经存在的同类文件读一遍**，把它的原语抄过来：
- 标签页 → `plugin-plugins/src/detail-dialog.tsx` 的 `Tabs variant="line"`
- 删除确认 → `plugin-skills` / `plugin-plugins` 的 `DeleteBubble`（`Popover`，不是 `AlertDialog`）
- 行菜单外观 → `apps/web/src/components/workspace-group.tsx`
- 详情弹窗骨架 → `DialogSplit` + 左 pane 右 panel

判据：**自问"这个控件在仓库里有没有第二个实例"**。有的话，先读那个实例再看自己的需求；
`grep -rn "<控件名>" packages apps` 就能回答。
"需求里没写要哪种"不是自己设计的理由——需求写的是功能，形状是这个仓库已有的约定。

## 测量能告诉我在哪，不能告诉我可不可见（2026-10-16）

**问题模式**：CodeEditor 两层叠加的自动检查报"两层的文字 y 差 2px"，
我当成缺陷，做了一轮修正（把行号从 `inline-block` 改成绝对定位）——
**改完更糟**：行号被 `right-full` 推出可视区，横向反而差了 44px，
重影截图一看就是坏掉的样子。

回退后拿 3× 缩放的重影图（同一段文字，一层高亮、一层红字半透明）对着看：
**两层的字形完全重合，行号也对齐**。
那 2px 是行号的 `inline-block` 给**行盒**加的 strut，把 `first.getClientRects()` 的盒子顶高了 2px，
字体本身没动。

**规则**：判断"视觉上对没对齐"，**不要拿两个 DOM 盒子的坐标相减**——
行盒、strut、margin collapse 都会让盒子动而字形不动。
判据是**同一内容两种颜色的重叠渲染**：截图，放大（`Emulation.setDeviceMetricsOverride` 的
`deviceScaleFactor: 3`），看是不是有重影。有重影才是错位。
DOM 测量只用来生成假设和定位"问题大概在哪一段"，**不要用它当结论，更不要据此改代码**。

## 探针脚本里注入的 JS，转义要按"两层"算（2026-10-16）

**问题模式**：CDP 探针里写 `go(`...split("\n")...`)`，
这层是**模板字面量**：`\n` 在写进字符串时就已经变成真换行，
注入到页面的代码成了 `split("<真换行>")` → `SyntaxError: Invalid or unexpected token`。
我改了三次才定位，前两次改的方向都不对（先怀疑引号、再怀疑 `String.raw`）。

**规则**：探针脚本里的注入代码，转义是**两层**的，写的时候要问"这层是模板字面量还是普通字符串"：
- 要让页面收到 `\n`（两个字符），模板字面量里得写 `\n`；
- 更稳的写法是绕开转义：`split(String.fromCharCode(10))`、或者把代码拼成普通字符串再 `JSON.stringify` 注入。

判据：**注入出语法错误时，先 `cat -A` 看那一行的真实字节**，别靠脑补。
`grep -c 'split("\\n")'` 数一下有几个是对的，比逐行读快。

## 会写"永远为真"的断言，是因为我边写边知道它没意义（2026-10-16）

**问题模式**：给标签编辑器补断言时写了
`check("the panel draws the row's categories", tagsNow.includes("code quality") === false || true, ...)`——
`|| true` 让这条永远是绿的。这正是 `docs/memory.md` 里"扫描类脚本必须先自证"那条说的形态，
我又犯了一次。

**规则**：写完 `check(...)` 立刻回头看**这个条件在什么输入下会是 false**；
答不上来的就删掉，或者先造一个已知的反例把它跑红一次。
"我加了一条测试"和"这条测试能失败"是两件事，后者才是覆盖率。

## 真机验收会写进用户的真实目录：先说，再收（2026-10-16）

**问题模式**：走"安装到 Agent"这条链路时，dev bridge 的 place 根是**真实机器上的路径**
（workspace `<repo>/.claude/commands`、global `~/.claude/commands`），
夹具只能隔离 hub home，隔离不了这两个。于是测试真的往用户仓库和用户 home 写了两个文件。

**规则**：涉及"写到 Agent 目录"的真机测试，**跑之前就把这件事说出来**，跑完立刻删掉并复查：
```
rm -f <repo>/.claude/commands/<name>.md  ~/.claude/commands/<name>.md
```
更好的做法是**不要用真实 prompt 名**（用一个一眼能认出来的测试名，如 `zz-probe-*`），
这样"有没有残留"用 `ls` 就能判断，也不会撞上用户自己的东西。

## `userHome` 的默认值是用户的真实 home，检查脚本写它之前必须换掉（2026-10-16）

**问题模式**：写 `check-prompt-delivery.ts` 时我给自己留了临时 hub home 和临时工作区目录，
然后加了一段「global 作用域」的用例就直接跑了 —— `createFsPlaceFiles` 的 `userHome`
默认是 `homedir()`，于是这次运行**真的往 `C:\Users\hl131\.agents\rules\code-review.md`
写了一个文件**。我在同一轮里刚把「真机验收会写进用户的真实目录」写进本文件，转头又犯。

**规则**：凡是构造 `PlaceFiles` / 任何带 `userHome`(或同类「机器级根」) 选项的东西，
**三个根都要显式传临时目录**：`home`、`folder`、`userHome`。
判据：跑之前 `grep -n "userHome\|homedir\|resolveHubHome" <脚本>` ——
出现任何一个而没在构造时被覆盖，就是会写真实路径。
跑完再复查一次 `ls -a ~/.agents ~/.claude`，把这一条当成脚本的一部分而不是可选步骤。

## 断言里写死夹具文案，会在夹具被上一轮改过之后假红（2026-10-16）

**问题模式**：UI 检查里断言生成出的文件含 `"changelog line"`。
但同一轮里前面的用例把那条提示词的正文改成了 `# Rewritten...`，
于是后面这条断言报 FAIL —— 我第一反应是"生成写错了正文"，
实际是被测数据的来源（夹具）在同一个脚本里变过两次。

**规则**：跨用例断言"产物含源内容"时，**源要从它此刻真正所在的地方取**
（`fetch("/hub/prompts")` 或 `readFileSync(<库文件>)`），不要写死字符串。
写死的常量只在**夹具与断言在同一个脚本并且中间没有写入**时才安全；
一旦脚本里有任何 `PATCH`/`create`，就当作"这个值是浮动的"。

## 宿主层落盘测试用临时目录，UI 层只碰 gitignore 的路径（2026-10-16）

**问题模式**：新功能要往工作区根写 `AGENTS.md` / `DESIGN.md` ——
而本仓根**就有这两个被签入的真实文件**。真机测试点一下就改了它们。

**规则**：把验证按"能不能隔离"切成两层：
- **宿主层**（`createFsPlaceFiles` + 临时目录）：覆盖所有真正写文件的分支，包括危险的落点；
- **UI 层**（浏览器）：只点那些落进 gitignore 目录的动作（本仓 `.agents/*`），
  断言行与菜单的形状，**不点会改签入文件的项**。

判据：给 UI 测试选路径时先跑 `git check-ignore -v <路径>`；
不 ignored 的目标一律留给宿主层。收尾复查用 `git status --short` 而不是只看脚本自己的清理。

## 会打到用户机器的清理命令：先看它匹配的是"我的"还是"所有的"（2026-10-16）

**问题模式**：这轮为了给 headless Chrome 腾出调试端口，我反复跑
`taskkill //F //IM chrome.exe //T`——`//IM` 是**按镜像名匹配，杀掉机器上所有 chrome.exe**。
用户正开着的浏览器窗口被我一并杀掉，用户问「你为啥一直 kill 我的 chrome 进程？」。

驱动脚本本身是对的：`spawn` 拿到了句柄，`chrome.kill()` 只收自己那一个。
可我图省事加了一句"清场"，把"我需要端口空出来"变成了"把所有 Chrome 关掉"。

**规则**：清理/重启类命令写之前先问一句——**这条命令的匹配范围是"我启动的那个"还是"机器上所有的"？**
- 进程：用 `spawn` 返回的句柄 `.kill()`，或按 PID（`netstat -ano | grep ":<port>" | grep LISTENING`
  取 pid 再 `taskkill //F //PID <pid>`）。**禁止 `//IM`**，除非用户明确说"把所有 X 关掉"。
- 端口被占：换一个端口（`--strictPort` 之外还会自动 +1）比清场便宜，绝不为此杀别人的进程。
- 上一次的收尾残留不值得"顺手清干净"。判断不清就留着，在汇报里说一句。

判据：命令里出现 `//IM`、`pkill -f <宽泛模式>`、`killall`、`rm -rf ~/...` 这类**按名字/模式**匹配的
目标时，停一下。只有按 PID、按我自己 spawn 的句柄、按我独占的端口做事，才是安全的。

## 手写一个像素之前先 `ls packages/ui/src/components/`（2026-10-16）

**问题模式**：给提示词面板的分组之间加一条分割线，我写了
`<span className="h-px w-full bg-border" />`，用户指出「分割线应该用 shadcn-ui 的啊」。
`packages/ui/src/components/separator.tsx` 一直都在（`Separator`，`data-horizontal:h-px`），
MCP 模块里甚至有一个 `Rule()` 包了 17px 留白可以直接照抄。我照抄了 `Rule()` 的**结构**
却把里面的 `Separator` 换成了手写 span——离正确只差一步，但那一步是我自己省掉的。

这和本文件「"用某组件"的意思是连它的默认长相一起用」是同一条根因的两种表现：
那条是**用了组件却改掉外壳**，这条是**根本没查有没有组件**。

**规则**：要写任何 `h-px` / `w-px` / 圆角 / 阴影 / 骨架这类**基础视觉原子**之前，
先跑一次 `ls packages/ui/src/components/ | grep -i <你要的东西>`（separator / skeleton / badge /
avatar / spinner…）。命中就直接用，别再手写；没命中才手写，并在注释里说清为什么没有现成的。

跨模块抄一段 UI 时，**整段照抄**，不要"抄结构、换零件"——`Rule()` 里那个 `<span>` 是
MCP 那个文件自己的旧写法，不代表可以继续扩散。抄之前先看被抄的模块有没有用仓库组件，
用了就跟上。

**附带**：`react-hooks/set-state-in-effect`、`purity` 之外的"仓库约定"大多是隐性的，
`AGENTS.md` 只说"引入新模式前，优先使用仓库已有工具链"。所以判据要落到**可执行的搜索**上，
不要靠"我记得好像没有"。

## AOCI 收尾前先看仓库有没有别人在写（2026-10-16）

**问题模式**：这轮做 AOCI 收尾，`aoci_maintain` 交回来一个我从没创建过的候选
`packages/core/src/host/http.ts`。查下去发现**同一个仓库里有另一个 agent session 正在写**
（它建了 `http.ts`、`server.ts` 和一份新计划文档）。`date` 是 20:01:41，
那两个文件的 mtime 是 20:01；再跑一次 `verify`，`code_source_count` 已经从 404 变成 405——
我一边读它一边长。

差一步就把一个**正在被写的特性**索引成语义了：`http.ts` 拿到手时只写了三分之一，
`server.ts` 那一批还没轮到。索引进 aoci.code.txt 的每一句都会留在那里，
而它的作者下一分钟就会让这些句子过期。

**规则**：跑 `aoci_maintain` 之前先花一条命令确认树是静的——

```
find packages apps docs -newermt "-20 minutes" -type f -not -path "*/node_modules/*"
```

出现**不属于本次任务**的文件，就停下问用户，不要继续作者化。判据是 `git status --short`：
untracked 的文件如果既不是我刚建的、也不在本次改动范围内，那就是别人的活。

更普遍的形态：**"仓库级"操作（AOCI、全仓 lint、大范围重命名）默认假设只有自己在写这个仓库**，
这个假设在多 session 下不成立。做这类操作前先确认，比事后回滚便宜。

用户当时的选择是「就此收手」——已经写进去的认知保留，剩下的漂移留给下一轮。
这一条和本文件「受管对象仍在变化时不得反复维护」是同一件事的另一面。

## 收尾杀进程只能杀「自己选的那个端口」，不能按端口猜（2026-10-16）

**问题模式**：这一轮把后端从 Vite 中间件抽成独立的 `createHubServer` 之后，dev 变成两个进程
（hub server + Vite）。我起了一个 `node dev.ts`，Vite 输出写着
"Port 5173 is in use… 5174 is in use… Local: **5175**" —— 也就是我的 Vite 在 **5175**，
而 5174 是**别人的**。收尾时我写了个循环 `for port in 5270 5174 5175; taskkill`，
**把 5174 那台别人的进程杀了**。本文件已经记过两次同类事（误杀用户 5173），这是第三次。

两次都错在同一个动作：**按一个"看起来像开发端口"的数字去杀**，而没有区分"这个端口是不是我起的"。
5173/5174 是 Vite 的**默认**端口，谁先起谁占，它从来不表示"这是我的"。

**规则**：给项目拉起多个进程时，**每个进程的端口都要是我自己写下来的常量**，
而不是落在默认范围内让工具挑；收尾只杀那个常量对应的端口。

本仓现在的做法就是这条规则的落地：`apps/web/hub-port.ts` 里两个常量
（`DEV_HUB_PORT = 5270`、`DEV_APP_PORT = 5271`）是唯一来源，`dev.ts` 用
`strictPort: true` 起 Vite（端口被占就**报错**，不再静默换一个），
`vite.config.ts` 从同一处取代理目标。所以两个端口**按构造都属于我**，杀错的对象不存在。

配套一条：**只需要杀 hub server（5270）**。`dev.ts` 里挂了 `hub.on("exit")` 会把 Vite
一起关掉（本轮实测：杀 5270 之后 5271 自动释放）。所以"杀 Vite 的端口"这个动作本身就该消失，
不是小心一点的问题。

## 首次冷启动的白屏不一定是代码坏了（2026-10-16）

**问题模式**：B 方案改完第一次打开页面，看到的是**纯白 + 零报错**。我连查了模块加载
（`/src/main.tsx`、`/src/lib/hub.ts`、`/src/App.tsx` 都 200）、6 个启动路由（全 200）、
`index.html`（正常注入）——全部正常，却还在往"某段代码坏了"的方向挖。

真实原因基本可以确定是 **Vite 首次冷启动在预打包依赖**：这个 app 要拉 12 个 agent 包 +
5 个插件的模块图，第一次 `optimizeDeps` 要跑很久；我那次探针只等了 21 秒。
后来同一个页面（收窄到只有 claude-code，且依赖缓存已热）**2 秒**就渲染出 61KB 的完整页面。

**规则**：dev server **第一次**起时看到白屏，先分清"模块没加载"和"模块图还在转译"，
再谈代码。判据很便宜，一次就够：

- 白屏时页内 `fetch` 记录是**空的**（说明 `main.tsx` 根本没执行）→ 指向加载/转译，不是业务代码；
- 同一个页面**第二次**打开就正常 → 依赖缓存问题，不是代码问题。

不要在冷启动上直接开始读代码找 bug——那是在给一个不存在的问题做诊断。
本轮真正需要改的（收窄到 claude-code）是用户直接要求的，与这个误判无关。

