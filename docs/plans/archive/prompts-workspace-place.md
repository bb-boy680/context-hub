# 提示词的「工作区」位置：从一条提示词生成 Commands / Rules / AGENTS.md / DESIGN.md

## Context

提示词的详情弹窗右侧「位置」区，今天只有各 agent 的行（Claude Code 的工作区与全局两条），
每条行的 `⋯` 里是安装/移除 + 生成 Commands / 生成 Rule（全局那条多一项追加到 CLAUDE.md）。

用户要求在这个列表里**再加一行「工作区」**，落点是工作区根的 `.agents/`，它的 `⋯` 菜单是四项：

| 项 | 写哪儿 |
| --- | --- |
| 生成 Commands | `<工作区>/.agents/commands/<slug>.md` |
| 生成 Rules | `<工作区>/.agents/rules/<slug>.md` |
| 追加到 AGENTS.md | `<工作区>/AGENTS.md`（插入一段带标记的章节） |
| 追加到 DESIGN.md | `<工作区>/DESIGN.md`（同上） |

行的外观照 skills 弹窗里「技能库 / 工作区」那一行的形状（文件夹图标 + 名字 + 目录路径第二行），
行尾是 `⋯` 菜单按钮 —— 与提示词已有的 agent 行一致（那轮已把安装按钮收进 `⋯`）。

这一行和 agent 行的区别是它**不属于任何 agent**：`.agents/` 是 hub 自己与这些 agent 共享的位置
（本仓已有 `.agents/skills`，由 skills 模块自己注册；`.agents/plugins` 也已存在），
所以它由**提示词模块自己**注册，而不是由某个 agent 扩展声明。

## 前提事实（已核对）

- `PromptPlace`（`packages/plugin-prompts/src/provider.ts:32-54`）已有 `commandDir` / `ruleDir` /
  `instructionFile?` 三个字段；`targetOf()`（`src/deliver.ts:35-49`）按它们算出唯一落点。
  `agent` 字段只声明、全仓无人读，模块自己的位置可以填自己的 id。
- `.agents/` 是本仓既有约定：`plugin-skills/src/index.ts:40-47` 的 `SHARED_PLACE` 就是
  `{ scope: "workspace", dir: ".agents/skills" }`，由模块自己在 `activate` 里注册进自己的 registry。
  提示词模块照这个形状做。
- `PlaceFiles`（`packages/core/src/place-files.ts:33-56`）是唯一写端口：`read` / `write`（整文件替换）/
  `remove` / `workspace()`。`createFsPlaceFiles` 的 workspace 根 = 当前选中工作区目录，
  `assertPlaceFile`（`host/place-files.ts:40-56`）只拒绝绝对路径与 `..`，`.agents/commands/x.md`
  与 `AGENTS.md` 都合法；`writeFileAtomic` 会自动建中间目录。
- **`.agents/commands` 与 `.agents/rules` 目前没有任何 agent 在读**。这是用户定的位置，
  属于「hub 自己在工作区里放成品的目录」，不是某个 agent 的既有约定 —— 计划按用户口径做，
  这一点在「已知限制」里写明。
- `withSection()`（`src/instruction.ts:57-82`）已经能按 `<!-- context-hub:<slug> -->` 标记
  **替换而非重复插入**，并保留原文件换行风格；它今天被 `instructions` 这一个动作用。
- 现有 UI 复用的三件：`DialogSplit`、`PlaceList`（`extensions/src/components/place-picker.tsx:485`，
  行尾只有 `action` 一个口子，**不读 `blocked`**）、`PlaceGenerate`
  （`prompt-detail-dialog.tsx:344-408`，已经是「安装/移除 + 分隔线 + 三条生成」的 `⋯` 菜单）。
- 本仓 lint 把 `react-hooks/set-state-in-effect`、`refs`、`purity` 设为 error。
- 文案两处都要改：`plugin-prompts/src/messages.ts` 与 `locale-zh-cn/src/messages.ts`，
  由 `locale-zh-cn/scripts/check-messages.ts` 校验。

## 阶段一：一个位置可以声明多个「追加进去的文件」

`packages/plugin-prompts/src/provider.ts`、`src/deliver.ts`、`packages/plugin-claude-code/src/index.ts`

`instructionFile?: string` 推广成 `documents?: readonly PromptDocument[]`：

```ts
/** 一个位置里、一条提示词可以追加成一段的文件。 */
export interface PromptDocument {
  /** 稳定 id，菜单项与消息 key 用它区分同位置的多个文件。 */
  readonly id: string
  /** 该项在菜单里的名字，由声明它的模块提供。 */
  readonly labelKey: string
  /** 相对该位置 scope 根的文件路径，`/` 分隔。 */
  readonly file: string
}
```

一个概念而不是两个：`instructions` 这个动作本来就是「往某个文件里插一段带标记的章节」，
`CLAUDE.md` 只是它今天唯一的目标。

`deliver.ts` 的四个出口都多一个可选的 `document` 参数：

- `targetOf(place, prompt, action, document?)` —— `instructions` 时取该 document 的 `file`；
  没传或该位置没声明这个 id 时抛错（照今天「该位置不读指令文件」的措辞）。
- `delivered(...)` —— `instructions` 时在**那个文件**里找标记；其余照旧。
- `deliver(...)` —— 照旧先读后写（整文件替换下追加唯一安全的写法）。
- `undeliver(...)` —— `instructions` 继续拒绝（该文件含用户自己的内容，撤不回来）。

`packages/plugin-claude-code/src/index.ts:82-104`：全局那条的 `instructionFile: CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE`
换成 `documents: [{ id: "claude", labelKey: "claudeCode.menu.instructions", file: ... }]`，
**行为一字不变**（项目侧那条继续不声明，理由不变：共享文件不该被悄悄改）。

**完成目标**：`Delivery` 仍是四个值，`instructions` 从「一个位置一个文件」变成「一个位置一份文件清单」。

**验收**：`cd packages/plugin-prompts && node scripts/check-prompt-text.ts` —— 扩 `targetOf` 的用例：
声明的 id 命中、未声明的 id 抛错、位置不声明 `documents` 时抛错；`check-prompt-store.ts` 不受影响。

## 阶段二：提示词模块注册自己的「工作区」位置

`packages/plugin-prompts/src/index.ts`

照 `plugin-skills/src/index.ts:40-47` 的形状，在同文件声明并注册：

```ts
const WORKSPACE_PLACE: PromptPlace = {
  id: "workspace",
  agent: PROMPTS_ID,          // 模块自己的 id：这个位置不属于任何 agent
  labelKey: "prompts.location.workspace",
  icon: FolderIcon,
  scope: "workspace",
  commandDir: ".agents/commands",
  ruleDir: ".agents/rules",
  documents: [
    { id: "agents", labelKey: "prompts.menu.document.agents", file: "AGENTS.md" },
    { id: "design", labelKey: "prompts.menu.document.design", file: "DESIGN.md" },
  ],
  order: 0,                   // 排在 work 区各 agent 行（order 20）之前
}
```

`activate` 里 `const service = createPromptService(); service.registry.register({ id: PROMPTS_ID, places: [WORKSPACE_PLACE] })`，
再把 service `provide` 出去（今天是先 provide 一个空 service）。

**同时改掉 `index.ts:47-52` 那段注释** —— 它写着「本模块不注册任何位置，因为不像 skill，
提示词没有每个 agent 都共享的目录」。`.agents/` 正是这样的目录，注释要跟着事实改。

**完成目标**：`promptPlaces()` 的第一条就是这一行，工作区作用域、order 0。

**验收**：`npx turbo typecheck --filter=@workspace/plugin-prompts --filter=@workspace/plugin-claude-code`；
真机打开弹窗，工作区分组下这一行排在 Claude Code 之前。

## 阶段三：这一行的 `⋯` 只有四项生成

`packages/plugin-prompts/src/install-menu.tsx`、`src/prompt-detail-dialog.tsx`

- `GenerateItems`（`install-menu.tsx:71-101`）改成按 `place.documents` 渲染：
  Commands、Rules 之后，每个 document 一条 `追加到 <文件>`（今天写死的 `instructionFile` 分支删掉）。
- `Delivery` 的调用点跟着带 document id：`onGenerate(place, action, document?)`。
- `prompt-detail-dialog.tsx` 的 `rowAction`（约 `:326`）：这一行**不给安装/移除** ——
  往 `.agents/<slug>.md` 装一份提示词原文不是一个落点。判据是 `place.documents !== undefined && place.commandDir === ".agents/commands"`？
  **不要用目录名判断**。给 `PromptPlace` 加一个明确的字段更诚实：

  ```ts
  /** 这个位置只接收写出来的成品（commands / rules / 追加段），不接收提示词原文的安装。 */
  readonly generatedOnly?: boolean
  ```

  `rowAction` 按它决定画不画安装/移除那一项，菜单余下四项照旧。
- 行本身的形状照 skills 的「工作区」行：文件夹图标 + 「工作区」+ 第二行目录 `.agents`。
  `PlaceOption.where` 用 `place.commandDir` 的父目录（`.agents`），因为这一行同时写 commands、rules
  和两个根文件，写 `.agents/commands` 会谎报。

**完成目标**：工作区分组多一行，行尾是 `⋯`，点开恰好四项；其他 agent 行一字不变。

**验收**：真机上数菜单项（`[role="menuitem"]` 恰好 4 条）、确认没有安装/移除项。

## 阶段四：文案

`packages/plugin-prompts/src/messages.ts`、`packages/locale-zh-cn/src/messages.ts`

新增：`prompts.location.workspace`（工作区 / Workspace）、
`prompts.menu.document.agents`（追加到 AGENTS.md）、`prompts.menu.document.design`（追加到 DESIGN.md）、
以及三个完成提示 `prompts.done.commands` / `prompts.done.rule` 已存在，补 `prompts.done.document`
（`已追加到 {file}`）。`prompts.done.instructions` 的调用点改成按 document 的 labelKey 取。

**验收**：`cd packages/locale-zh-cn && node scripts/check-messages.ts` 全绿。

## 阶段五：验证

- `npx turbo typecheck lint --filter=@workspace/plugin-prompts --filter=@workspace/plugin-claude-code --filter=web`
- `cd packages/plugin-prompts && node scripts/check-prompt-text.ts`（含阶段一新用例）
- **落盘走宿主层，不在真机上点**：新增 `packages/plugin-prompts/scripts/check-prompt-delivery.ts`，
  用临时 hub home + **临时工作区目录** + 真的 `createFsPlaceFiles`，断言：
  1. `commands` → `<ws>/.agents/commands/<slug>.md`，带 frontmatter，目录被自动建出来；
  2. `rule` → `<ws>/.agents/rules/<slug>.md`，不带 frontmatter；
  3. 追加 AGENTS.md → 文件里出现 `<!-- context-hub:<slug> -->` 一段；**再点一次仍然只有一段**（替换不是追加）；
  4. 追加 DESIGN.md → 同上，且 AGENTS.md 的内容不被动过；
  5. 文件原来用 CRLF → 写回仍是 CRLF（`withSection` 的既有承诺）；
  6. `undeliver` 对追加类动作抛错，且文件一字未改；
  7. 没有选中工作区时抛错，而不是写到别处。
- **真机 UI**：自己起 dev server（改过 `vite.ts` 的话必须重启，见 `docs/memory.md` 第一条），
  headless Edge/CDP 打开一条提示词 → 断言工作区分组下这一行、`⋯` 恰好四项；
  **只点 Commands 与 Rules**（它们落在 `.agents/` 这个本仓还不存在的新目录里，验完删掉），
  **不点 AGENTS.md / DESIGN.md** —— 本仓根那两个文件是签入的真实文件，测试不许碰。
  这两个落点由上面那个宿主层脚本用临时目录覆盖。

## 收尾

- 计划归档到 `docs/plans/archive/`，教训写进 `docs/memory.md`
- 受管理对象变了（新增脚本、provider 契约改动），按 AOCI 流程调一次 `aoci_maintain`

## 不做（以及为什么）

- **不给 skills 加同一行**：用户明确「是给 .agents 添加 rules、commands 的、没有 skill」。
  skills 的产物是自己的 skill 目录，形态不同。
- **不动 `.agents/skills` 那一行的形状**：这次是提示词模块自己的位置，skills 页面不动。
- **不把 `.agents/commands` 声明给各 agent 扩展**：那 12 个 agent 扩展没有一个读 `.agents/commands`；
  编造它们的目录是撒谎。要做成 agent 的东西，等有 agent 真的读它。
- **不给这一行做「安装/移除」**：见阶段三的 `generatedOnly`。
- **不做追加段落的撤销**：`AGENTS.md` / `DESIGN.md` 里含用户自己写的内容，从一个动作里删一段
  需要一个「这段是谁的」的判断，今天 `undeliver` 对 `instructions` 也是拒绝的，口径一致。

## 已知限制与风险

- **`.agents/commands` / `.agents/rules` 今天没有任何 agent 在读**。它们是用户定的位置，
  写进去的东西要有 agent 认得，得由对应的 agent 扩展去声明/读取。这一条是需求本身的前提，
  不是实现能补的。
- **往工作区根的 `AGENTS.md` / `DESIGN.md` 追加是不可撤销的**：两处写入都改的是用户（和队友）
  也提交、也读的文件。第二次追加同一条提示词是替换而不是重复，但撤销只能手工。
  agent 行里那条 `添加 CLAUDE.md` 之所以只出现在全局行，正是这个理由的既有先例；
  这次用户明确要在工作区根写这两个文件，所以做成插入而不是覆盖 —— 但这条风险要写进 UI 文案里。
- `PlaceList` 不读 `PlaceOption.blocked`（`place-picker.tsx:535` 只渲染 `action`），
  这一行的「不能写」只能由 `action` 自己置灰。今天没有这种状态（工作区没选中时 `PlaceFiles.workspace()`
  返回 null），`⋯` 里点下去会走到 `requiredFile` 的报错上 —— 与 agent 行的既有行为一致，不额外加壳。
