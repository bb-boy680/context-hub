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
