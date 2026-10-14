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
