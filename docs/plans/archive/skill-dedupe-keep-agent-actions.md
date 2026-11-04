# 修复同名占位技能不显示 Agent 与无法卸载

- 日期：2026-10-28
- 状态：待审批
- 范围：`packages/resources/skills` 的列表行、详情弹窗与卸载路由
- 结论：不改 row 组装语义，把 UI 读取“哪些 Agent 持有该技能”的位置从 `holdsOf`（只含 `places`）换成已有的 `placedIn`（`places + takenAt`），并为 `takenAt` 的卸载补上 `deleteInPlace` 路由。生产代码改动 4 个文件，加 1 个纯函数与 1 组测试。

## 背景与现状（已核实）

### 现象

技能已“收录”进 hub 库（`~/.context-hub/skills/ego-browser` 是真实目录），同时 `~/.claude/skills/ego-browser` 是指向 `~/.local/share/ego/ego-skills/` 的 symlink，不在 hub 库内。UI 上这一行：

- 不画 `AvatarStack`，provenance 行显示成只有库；
- 安装菜单把 Claude Code 标成 “taken”，不能点，也无法从 Claude Code 卸载。

### 根因

`packages/resources/skills/src/library.ts:535-566` 组装库行时：

- `holding` 只接受两种：
  - `adopted`：库记录的 `link` 指向该 place 的根（`reachedFrom`，`library.ts:532-533`）；
  - `installed`：place 条目 `origin === "hub"`，即 place 内是指向 hub 库的链接（`library.ts:548`）。
- 同名但 place 自己持有的条目（`origin === "own"`）只写进 `takenAt`（`library.ts:553-556`），不写进 `places`。

提交 `b5f545e` 把“收录”从建链接改成复制（`packages/resources/skills/src/host/place-skills.ts:267-291` 的 `copySkillIntoLibrary`），库记录不再 link 到 place，place 里仍是自己的目录，于是收录后必然落入 `takenAt`。

按 `readPlaceSkills`（`packages/resources/skills/src/host/place-skills.ts:127-172`）的判定，symlink 目标不在 hub 库内时 `origin = "own"`。已在本机核对文件系统：`~/.claude/skills/ego-browser` 是指向 `~/.local/share/ego/ego-skills/` 的 symlink，`~/.context-hub/skills/ego-browser` 是真实目录，与现象一致。

### 展示层为什么空

UI 全部用 `holdsOf`（只返回 `skill.places`，`library.ts:104-106`）判断“这个 Agent 是否持有”：

- `provenance-line.tsx:28-35`：`holds` 为空 → 不画 `AvatarStack`，改显示 “Library” 文本；
- `page.tsx:199`：`SkillActionButton` 的 `holds` 为空 → 菜单 `selected=false`；
- `page.tsx:285-291`：`blocked` 显式把 `skill.takenAt` 标成 “taken”，不可点；
- `page.tsx:871`：批量安装用 `holdsOf` 跳过已装 place，不会跳过 `takenAt`；
- `skill-detail-dialog.tsx:530-534`：`PlacesSection` 的 `installed` 计数、`selected`、`rowAction` 都基于 `holdsOf`；
- `skill-detail-dialog.tsx:582-592`：`taken` 让安装按钮禁用。

已有的 `placedIn(skill)`（`library.ts:195-197`）已经把两者合并，目前只用于 tab 过滤（`page.tsx:107`）和计数（`library.ts:708`）。

### 卸载为什么也会失败

`page.tsx:1172-1184` 的 `uninstall` 只有两条路：

- `linkAt === "library"` → 删库记录；
- 否则 → `library.remove` → `store.removeFrom` → host `removeSkillFrom`（`host/place-skills.ts:302-317`），它只接受“指向 hub 库的链接”，对 place 自己的条目会抛 `not installed by Context Hub`。

因此即使把 `takenAt` 显示成已持有，点卸载仍会失败。`deleteInPlace` → `deleteSkillIn`（`host/place-skills.ts:329-347`）已经实现了正确语义：symlink 只删条目，真实目录递归删除。

## 关键决策

### 1. 不把 `takenAt` 并进 `places`

`places` 被 `placeOf`（`library.ts:147-159`）、`useSkillDocument`（`library.ts:316`）、`useSkillFiles`（`skill-detail-dialog.tsx:951`）用来决定从哪里读真实文件。把 `takenAt` 塞进去会让库行改读 place 里的同名副本，内容可能与库副本不同，属于行为变更，超出本 bug。

保持 `placedIn` 作为“屏幕上该行属于哪些 Agent”的唯一来源，`holdsOf` 继续表示“哪些 place 持有该行文件”。

### 2. 卸载按 ref 判定，不按行判定

新增纯函数 `nameTakenAt(skill, ref)`：`skill.takenAt` 中存在 `scope` 与 `dir` 都等于 `ref` 的条目时为 `true`。`page.tsx` 的 `uninstall` 顺序：

1. `skill.linkAt === "library"` → 删库记录（保持现状）；
2. `nameTakenAt(skill, ref)` → `library.deleteInPlace(skill.name, ref)`；
3. 其余 → `library.remove(skill.name, ref)`（撤销 hub 链接）。

用 scope + dir 而不是 id：`SkillPlaceRef` 只带这两项，且同一目录名在不同 scope 是两个目录。

### 3. 显示层统一使用 `placedIn`

只改“谁持有”的展示与交互判断，不改文件读取。`installed` 计数公式 `holds.length + (own ? 1 : 0)` 不变，`holds` 换成 `placedIn` 后自然把 `takenAt` 计入。

### 4. 不做新的确认弹窗

`deleteInPlace` 对真实目录是递归删除，这是“从该 Agent 卸载”的应有语义；对 symlink 只删条目，ego-browser 场景不会碰 `~/.local/share/ego/ego-skills/`。现有 place-only 技能删除已有 `DeleteBubble` 确认（`skill-detail-dialog.tsx:247-330`），本次改动不扩大确认体系。风险见文末。

## 阶段一：补上同名占位的卸载路由

目标：让 `uninstall` 能把 `takenAt` 的目标交给 `deleteInPlace`，且此阶段不改变现有 UI 行为（当前没有任何 UI 路径会把 `takenAt` 的 ref 传进来）。

改动文件：

1. `packages/resources/skills/src/library.ts`
   - 在 `placedIn` 之后新增并导出：

     ```ts
     /**
      * Whether the place a ref names keeps its own skill under this row's name,
      * so taking it back deletes that entry rather than a link the hub made.
      */
     export function nameTakenAt(skill: Skill, ref: SkillPlaceRef): boolean {
       return (
         skill.takenAt?.some(
           (hold) => hold.scope === ref.scope && hold.dir === ref.dir
         ) === true
       )
     }
     ```

   - `SkillPlaceRef` 已在 `library.ts:30` 的 type import 中，无需新增 import。

2. `packages/resources/skills/src/page.tsx`
   - 在 `library.ts` 的 import 列表（`page.tsx:28`）中加入 `nameTakenAt`。
   - `uninstall`（`page.tsx:1172-1184`）增加中间分支：

     ```ts
     } else if (nameTakenAt(skill, ref)) {
       /* The place keeps its own skill under this name; taking it back deletes
          that entry — a link goes as an entry, a directory with its files. */
       await library.deleteInPlace(skill.name, ref)
     } else {
       await library.remove(skill.name, ref)
     }
     ```

3. `packages/resources/skills/__test__/rows.test.ts`
   - import 加 `nameTakenAt` 和 `SkillPlaceRef` 类型。
   - 新增 `describe`，三个用例：
     - 同一 `scope` + `dir` 命中 `takenAt` → `true`；
     - 同 `dir`、不同 `scope` → `false`；
     - ref 只出现在 `places`、不在 `takenAt` → `false`。

验收：

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/skills lint
```

- `rows.test.ts` 新用例通过。
- `git diff --stat` 只包含上述 3 个文件。

## 阶段二：显示层改用 `placedIn`

目标：库行在 `takenAt` 的 Agent 上显示头像堆叠、菜单显示为已选、可从该 Agent 卸载。

改动文件：

1. `packages/resources/skills/src/provenance-line.tsx`
   - import 把 `holdsOf` 换成 `placedIn`（`provenance-line.tsx:12`）。
   - `const holds = placedIn(skill)`（`provenance-line.tsx:28`）。
   - `marks` 与 `label` 的构造不变。

2. `packages/resources/skills/src/page.tsx`
   - `SkillActionButton`：`const holds = placedIn(skill)`（`page.tsx:199`）。
   - 菜单选项（`page.tsx:285-291`）：
     - `selected` 继续用 `holds.some(...)`，现在包含 `takenAt`；
     - `blocked` 删除 `skill.takenAt` 分支，只保留 workspace 无目录的情况：
       `blocked: place.scope === "workspace" ? blocked : null`。
   - `onPick`（`page.tsx:294-300`）不需要改：`holds` 命中即 `onRemove`，阶段一的路由会走 `deleteInPlace`。
   - 注释 `page.tsx:259-261` 的 “menu says which places are taken” 改为说明勾选表示该 Agent 已持有。
   - 批量安装（`page.tsx:871`）：`holdsOf(skill)` 改为 `placedIn(skill)`，避免对同名占位 place 再装而报 `already in this place`。

3. `packages/resources/skills/src/skill-detail-dialog.tsx`
   - import 加 `placedIn`（`skill-detail-dialog.tsx:18`）。
   - `PlacesSection`：`const holds = placedIn(skill)`（`skill-detail-dialog.tsx:530`）。
   - `installed` 计数（`:534`）公式不变。
   - `rowAction`（`:564-600`）：`held` 现在包含 `takenAt`，命中的行直接返回 Remove 按钮；删除已无用的 `const taken = ...`（`:582`）以及安装按钮上的 `taken` 禁用与 title 分支，只保留 `unavailable`。
   - `PlaceList` 的 `selected`（`:653`）继续用 `holds`，现在包含 `takenAt`。

验收：

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/skills lint
```

- `rg -n "holdsOf" packages/resources/skills/src` 只剩读取真实文件的用法：`placeOf`、`unstored`、`useSkillDocument`、`useSkillFiles`、`adoptAll`；`SkillActionButton`、provenance、`PlacesSection`、批量安装不再出现。
- `rg -n "takenAt" packages/resources/skills/src` 只剩 `library.ts` 的 row 组装、`nameTakenAt` 和 `types.ts` 的字段声明。
- 手工验收（需要跑起 web）：
  1. 确认 5271 未被占用：`netstat -ano | findstr :5271`；已占用则复用正在运行的实例。
  2. `pnpm --filter web dev`（从仓库根执行；`apps/web/dev.ts` 固定 hub 5270、Vite 5271）。
  3. 打开 `http://localhost:5271`，进入 Skills 页。
  4. ego-browser 行：provenance 行出现 Claude Code 头像；安装菜单里 Claude Code 行带勾且可点。
  5. 点 Claude Code 行：`~/.claude/skills/ego-browser` 条目消失，`~/.local/share/ego/ego-skills/` 仍在；刷新后该行不再显示 Claude Code 头像。
  6. 对照回归：一个只有库、没有任何 place 的技能仍显示 “Library” 文本、无头像；一个 hub link 安装的技能仍显示头像，卸载只撤销链接。

## 阶段三：同步注释与最终检查

目标：让类型和行组装注释与新语义一致，并跑完整相关检查。

改动文件：

1. `packages/resources/skills/src/types.ts`
   - `takenAt` 注释（`types.ts:60-65`）改为：该 place 自己持有同名技能，库行代表它；从这个 Agent 卸载会删除该条目（链接只删链接，目录连同文件删除）。
2. `packages/resources/skills/src/library.ts`
   - row 组装里 `takenAt` 的注释（`library.ts:553`）同步：同名占位仍单独记录，但 UI 通过 `placedIn` 把它当作该 Agent 持有。

验收：

```bash
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/skills lint
git diff --stat
```

- 三个命令全部通过。
- `git diff` 只包含本计划列出的 5 个源码/测试文件加 1 个测试文件，没有顺手改动。
- 阶段二的手工验收项仍成立。

## 不做

- 不改 row 组装：`takenAt` 不并入 `places`，`location`/`installed` 字段语义不动。
- 不改 `placeOf`、`useSkillDocument`、`useSkillFiles`、`adoptAll` 的读取来源。
- 不改 `adoptFrom`/`copySkillIntoLibrary` 的复制语义。
- 不改 host 的 `deleteSkillIn`、`removeSkillFrom`。
- 不改 tab 过滤与计数（已经在用 `placedIn`）。
- 不删除 `skills.workspace.taken` 文案：本改动后 skills 源码不再调用它，但 `packages/i18n/zh-cn/src/messages.ts:277` 仍保留同一 key，删文案属于 i18n 清理，另做。
- 不修 `uninstall` 的 `linkAt === "library"` 分支忽略 ref 的既有问题（旧链接记录才可触发，复制式收录后不再产生）。
- 不新增确认弹窗、不新增组件或依赖。

## 风险与待确认

1. **删除是真实的。** `takenAt` 卸载走 `deleteInPlace`：symlink 只删条目；真实目录会连同 `SKILL.md` 及所有文件递归删除。若某个 place 里恰好有与库技能同名、但由用户独立编写的目录，点菜单里的 “Remove” 会删掉它。现有 place-only 删除有 `DeleteBubble` 确认，而本次菜单路径没有确认。
   - 待确认：是否需要在菜单/详情里为 `takenAt` 的卸载加确认步骤。默认按用户“和正常安装逻辑一样”的要求直接卸载；若要加，作为后续改动，不在本计划内。
2. **同名不同内容是可能的。** 库副本与 place 自己的同名技能内容可以不同；卸载只删 place 的条目，不影响库副本。
3. **手工验收依赖本机端口。** 5270/5271 被其他实例占用时无法起第二套 dev server（见 `docs/memory.md` 的“一个 hub home 同时只能有一个 server”），只能复用现有实例或先停掉。
4. **本机数据已核对。** ego-browser 的 Claude Code 条目是指向 ego 安装目录的 symlink，删除它不会动 `~/.local/share/ego/ego-skills/`；库里的副本是独立真实目录。

## 自审记录

- 逐项核对 `holdsOf` 的 9 处调用：只改 4 处展示/批量判断，5 处读取真实文件的不动。
- 核对 `takenAt` 的唯一写入点在 `library.ts:544-556`，UI 直接读取点只有 `page.tsx:289`、`skill-detail-dialog.tsx:582`，阶段二均删除或替换。
- 阶段顺序：先加路由（当前无 UI 入口，行为不变），再改展示；避免出现“能点 Remove 但报错”的中间状态。
- 每个阶段都有可执行的 typecheck/test/lint 判据；手工验收给出端口、命令和可观察结果。
- 已确认 `deleteSkillIn` 对 symlink 与真实目录的两种行为，避免把“删链接条目”写成“删目标目录”。
- 范围外改动（i18n 文案、旧 link 分支、确认弹窗）全部列入“不做”，没有顺手重构。
