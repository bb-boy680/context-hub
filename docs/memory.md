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

## 这个仓库的界面是能在浏览器里真看的（2026-10-15）

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

