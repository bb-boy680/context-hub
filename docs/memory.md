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
  C1-4 ≤ 40、C5-7 ≤ 80、C8 ≤ 140、C9 ≤ 200；token 按 UTF-8 字节 / 3 估，一个中文字约 1。
  注意这比 `aoci.meta.txt` 里那行 `#S配额: C7-4≤200` 更紧，以 budget 表为准（它才是被校验的那个）。
  本仓现有的 C7 条目 S 多在 63-77，改动前先量一遍余量。
- 写之前拿脚本量一遍最省事：
  `node -e 'const S=process.argv[1].split("S:")[1];console.log(Math.round(Buffer.byteLength(S,"utf8")/3))' "<整行条目>"`
- 被拒后只能改 findings 点名的那个字段，其余候选必须**逐字节**保持原样重提。

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
  用户选择了抽到 `@workspace/extensions/components`（`swiper` 依赖也跟着从 skills 挪过去）。
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
跨包抄一份时容易连名字一起漏。本仓的共享常量在 `@workspace/extensions/components`
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
