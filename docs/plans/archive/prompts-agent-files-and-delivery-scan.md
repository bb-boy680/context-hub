# 提示词：agents 文件投递与已投递扫描

## Context

提示词模块今天有四种投递动作（`packages/resources/prompts/src/deliver.ts` 的
`Delivery = "install" | "commands" | "rule" | "instructions"`）：

- `install` / `commands` 共用同一个文件 `<commandDir>/<slug>.md`；
- `rule` 写 `<ruleDir>/<slug>.md`；
- `instructions` 用 `<!-- context-hub:<slug> -->` 标记向 `documents` 声明的文件追加段落。

卡片菜单（`install-menu.tsx` 的 `GenerateItems`）只提供「生成命令 / 生成规则 / 追加文档」，
不显示每个动作是否已经写过；详情弹窗（`prompt-detail-dialog.tsx` 的 `PlaceGenerate`）
只有 install 一项有「安装 / 移除」切换。用户要求：

1. 新增「创建 agents 文件」投递动作：workspace 位置默认写 `.agents/agents`，
   每个被选中的 agent 位置也声明自己的 agents 目录（claude-code 是 `.claude/agents`，
   workspace / global 两个 scope 都有）。文件名 `<slugOf(name)>.md`，
   正文是提示词，frontmatter 只有 `name`、`description`。
2. 对每个投递位置，用本提示词的 slug 逐个 `files.read()` 探测已知目标是否存在，
   不做目录列举。卡片左下角用 `AvatarStack` 显示「这条提示词已经出现在哪些位置」，
   语义覆盖 install / commands / rule / agent / 文档段落中的任意一种。
3. 已存在的那一项，菜单文案变成「移除」，点击删除之前写入的内容。
   文档段落也要能按标记精确删除，保留文件其余内容与换行风格。
4. 卡片下拉与详情弹窗的位置列表保持一致，四处都要对齐：
   - `⋯` 菜单项一致：安装 / 移除 + 分隔线 + 生成项；
   - 第二行文案一致：只收生成品的位置显示根目录（`.agents`），agent 位置显示说明句；
   - 行点击行为一致：卡片行不再整行点击安装，所有动作都进 `⋯`；
   - 计数含义一致：标题旁的数量从「位置数」改成「已安装数」。
5. 删掉「安装 / 移除」这个菜单项：`install` 与 `commands` 写同一个文件，
   一个入口就够。`install` 动作连同它的调用链一起删除，不是只藏 UI。

## 前提事实（已核对）

- `PlaceFiles` 只有 `read` / `write` / `remove` / `workspace`
  （`packages/core/src/place-files.ts:33`），`read` 对不存在的文件或根返回 `null`。
  不需要新增 list 能力。
- `commandFile()`（`packages/resources/prompts/src/command-file.ts:71`）在
  `frontmatter: true` 时只写 `name`、可选 `description`，再接正文；`commands` 已经用它。
- `withSection()`（`packages/resources/prompts/src/instruction.ts:57`）是唯一的段落写入函数，
  目前没有删除函数；它对缺失闭标记的处理是「替换到文件末尾」。
- `targetOf()`（`src/deliver.ts:37`）按 action 选 `commandDir` / `ruleDir` / document；
  `delivered()` 对非 instructions 动作只看文件是否存在；`undeliver()` 对 instructions 直接抛错。
- `PromptPlace`（`src/provider.ts:51`）目前只有 `commandDir`、`ruleDir`、`documents`；
  `WORKSPACE_PLACE`（`src/index.ts:50`）与 claude-code 的两个 place
  （`packages/agents/claude-code/src/extension.ts:78`）是仓内全部 place 声明。
- `useInstalled()`（`src/library.ts:199`）返回 `Record<placeId, boolean>`，只探测 `install`。
  调用点只有 `page.tsx` 的 `PromptCard` / `LedgerAction` 和
  `prompt-detail-dialog.tsx` 的 `Lightbox`；`Installed` 类型还出现在 `install-menu.tsx`。
- `AvatarStack` 在 `packages/extensions/src/components/avatar-stack.tsx`，
  plugins 卡片用法见 `packages/resources/plugins/src/page.tsx:203` 的 `HolderStack`
  与同文件 `:457` 的动作行（左侧 `mr-auto`、右侧动作）。
- 测试运行器只收 `__test__/**/*.test.ts`（`packages/resources/prompts/vitest.config.ts:14`），
  没有 jsdom / React 渲染环境，菜单文案没有现成的单测落点。
- `packages/i18n/zh-cn/__test__/messages.test.ts` 要求每个英文 key 都在中文表里存在；
  新增英文 key 必须同步加中文，否则 `pnpm --filter @context-hub/zh-cn test` 变红。
- 仓库根 `.gitignore` 第 41 行忽略 `.agents`；真机验收只往这个目录写。

## 阶段一：扩展交付动作

**执行目标**：新增 `agent` 动作与文档段落删除能力，并把目录常量、消息 key 和测试补齐。
此阶段结束后 UI 行为不变，但交付层已经能写 / 读 / 删 agents 文件与文档段落。

**改动文件**

1. `packages/resources/prompts/src/provider.ts`
   - 模块头注释补上 agents 目录（原文只提 command / rule / instruction file）。
   - `PromptPlace` 新增可选字段：
     ```ts
     /** Where a prompt is written as an agent file, relative to `scope`; a place
      *  that takes none omits it and is not offered the action. */
     readonly agentDir?: string
     ```
   - `PromptDocument` 新增可选字段：
     ```ts
     /** Message key for the remove entry; without it the document stays add-only. */
     readonly removeLabelKey?: string
     ```
     可选而不是必填：`contract.ts` 会把这些类型交给外部 agent 扩展，缺省时菜单不提供移除项，
     而不是显示一个拼错的标签。
2. `packages/resources/prompts/src/deliver.ts`
   - `Delivery` 增加 `"agent"`，模块头注释从「四件事」改为「五件事」。
   - `targetOf()` 增加分支：`agent` 用 `place.agentDir`，缺失时抛
     `"${place.id} has no agents directory"`；文件为 `${agentDir}/${slugOf(prompt.name)}.md`。
   - `textOf()` 的 `frontmatter` 条件改为 `action === "commands" || action === "agent"`。
     agents 文件因此也只带 `name`、`description` 两个元字段。
   - `undeliver()` 不再对 `instructions` 抛错：
     ```ts
     if (action === "instructions") {
       const ref = targetOf(place, prompt, action, document)
       const existing = await files.read(ref)
       if (existing === null) return false
       const next = withoutSection(existing, slugOf(prompt.name))
       if (next === null) return false          // 没有这一节
       if (next.trim() === "") await files.remove(ref)
       else await files.write(ref, next)
       return true
     }
     ```
   - 更新 `undeliver` 的 doc comment：文档段落现在可以逐段删除。
3. `packages/resources/prompts/src/instruction.ts`
   - 新增并导出：
     ```ts
     export function withoutSection(text: string, slug: string): string | null
     ```
   - 返回 `null` = 开标记不存在（什么都没删）；返回 `""` = 删除后文件没有内容，
     由调用方决定删除文件。
   - 实现规则：
     - 用 `newlineOf(text)` 记住原换行，`toLf()` 后工作；
     - 找 `OPEN(slug)`；找不到返回 `null`；
     - 找闭标记；缺失时删到文件末尾（与 `withSection` 的「半标记也算这一节」一致）；
     - `head` 去掉尾部空行，`tail` 去掉开头空行；两边都有内容时用一个空行重接；
     - 结果非空时按原换行写回，并以一个换行结尾；结果为空返回 `""`。
   - 选择「剩余为空则删除文件」的理由：文件此时只由本 hub 写出，内容为空不携带任何用户数据；
     留一个空文件会让下一次 `delivered()` 仍把它当作文件存在，行为反而含混。
     代价是：如果用户原本就有一个 0 字节的同名文件，它会被一起删掉；这类文件无内容可丢失。
4. `packages/resources/prompts/src/index.ts`
   - `WORKSPACE_PLACE` 增加 `agentDir: ".agents/agents"`。
   - 两个 document 分别增加
     `removeLabelKey: "prompts.menu.document.agents.remove"` /
     `"prompts.menu.document.design.remove"`。
5. `packages/agents/claude-code/src/locations.ts`
   - 新增 `export const CLAUDE_CODE_AGENT_DIR = ".claude/agents"`，注释说明与 commands / rules
     同根、同样每个文件一个 prompt。
6. `packages/agents/claude-code/src/extension.ts`
   - 导入新常量；两个 `PromptPlace` 都加 `agentDir: CLAUDE_CODE_AGENT_DIR`。
   - global place 的 `claude` document 增加
     `removeLabelKey: "claudeCode.menu.instructions.remove"`。
7. `packages/resources/prompts/src/messages.ts`（英文）新增：
   - `"prompts.menu.document.agents.remove": "Remove from AGENTS.md"`
   - `"prompts.menu.document.design.remove": "Remove from DESIGN.md"`
8. `packages/agents/claude-code/src/messages.ts`（英文）新增：
   - `"claudeCode.menu.instructions.remove": "Remove from CLAUDE.md"`
9. `packages/i18n/zh-cn/src/messages.ts`（中文）新增：
   - `"prompts.menu.document.agents.remove": "从 AGENTS.md 移除"`
   - `"prompts.menu.document.design.remove": "从 DESIGN.md 移除"`
   - `"claudeCode.menu.instructions.remove": "从 CLAUDE.md 移除"`
10. `packages/resources/prompts/src/slug.ts`
    - 文件头「Three actions write a file...」改成四个动作并列出 `install / commands / rule / agent`
      （install 与 commands 仍是同一个文件，措辞照实写）。

**测试**

- `packages/resources/prompts/__test__/text.test.ts`
  - `place` fixture 增加 `agentDir: ".agents/agents"`。
  - `targetOf`: `agent` 写到 `<agentDir>/code-review.md`；place 没有 `agentDir` 时抛错。
  - `withoutSection`：
    - 开标记不存在返回 `null`，原文不变；
    - 删除中间一节，保留前后文本，重接处恰好一个空行；
    - CRLF 文件删除后仍是纯 CRLF；
    - 只有开标记、没有闭标记时删到文件末尾；
    - 文件里只有这一节时返回 `""`；
    - 连续第二次返回 `null`（幂等）。
- `packages/resources/prompts/__test__/delivery.test.ts`
  - `WORKSPACE` fixture 增加 `agentDir: ".agents/agents"`。
  - 新 describe「the agents file」：`deliver(..., "agent")` 落到
    `.agents/agents/code-review.md`；frontmatter 的键恰好是 `name`、`description`
    （按 `---` 切段后断言两行，没有第三个字段）；`delivered(..., "agent")` 为 true；
    `undeliver` 删除后文件不存在、第二次返回 false。
  - 把现有「refuses to take a document's section back」改成
    「takes a document's section back and keeps the person's text」：
    删除后不再含 `context-hub:code-review`，仍含 `Nobody writes to main.`，
    仍是纯 CRLF，结尾一个换行；第二次返回 false。
  - 新增「deletes a document file that held only the section」：用独立的
    `{ id: "notes", file: "NOTES.md" }` 先 deliver 再 undeliver，断言文件被删除。
- `packages/resources/prompts/__test__/provider.test.ts`
  - fixture `place()` 增加 `agentDir`，断言 `promptPlaces()` 原样带出该字段。
- `packages/agents/claude-code/__test__/registration.test.ts`
  - 用会记录 `prompts.register` 的 stub 建一个 kernel，断言 `claude-code` 与
    `claude-code-global` 两个 place 的 `agentDir` 都是 `.claude/agents`
    （现有 `stubbed()` 已经用 `services: { prompts: … }` 替换服务，可照此记录 provider）。

**验收**

```bash
pnpm --filter @context-hub/prompts typecheck
pnpm --filter @context-hub/prompts lint
pnpm --filter @context-hub/prompts test
pnpm --filter @context-hub/claude-code typecheck
pnpm --filter @context-hub/claude-code test
pnpm --filter @context-hub/zh-cn test
```

全部通过；`delivery.test.ts` 的 agents 与段落删除用例、`text.test.ts` 的
`withoutSection` 用例在改前应失败或不存在，改后通过。

## 阶段二：探测已持有内容

**执行目标**：把「这个位置已经有哪些投递」做成一个可复用的扫描结果，
先把现有 UI 接到新形状上但保持行为不变。

**改动文件**

1. `packages/resources/prompts/src/deliver.ts`
   - 新增：
     ```ts
     export interface Held {
       readonly commands: boolean   // install 与 commands 共用这个文件
       readonly rule: boolean
       readonly agent: boolean
       readonly documents: readonly string[]
     }
     export const NOTHING_HELD: Held = { commands: false, rule: false, agent: false, documents: [] }
     export function holdsSomething(held: Held | undefined): boolean
     export async function heldAt(files, place, prompt): Promise<Held>
     ```
   - `heldAt` 用 `delivered()` 并行探测 `commands`、`rule`、`agent`，以及
     `place.documents ?? []` 的每个 `instructions`；`documents` 只收命中的 id。
     `commands` 探的就是 `install` 原本写的那个文件（两者同路径），所以这一阶段
     行为不变，阶段四删掉 `install` 时这里不用再改。
   - 再新增一个**纯函数**，让「按 agent 去重」有测试落点：
     ```ts
     export interface HeldMark {
       readonly id: string                  // place.agent
       readonly icon: PromptPlace["icon"]
       readonly label: string               // 去重后的位置标签，以 " · " 拼接
     }
     export function heldMarks(
       places: readonly PromptPlace[],
       holds: Readonly<Record<string, Held>>,
       labelOf: (place: PromptPlace) => string
     ): HeldMark[]
     ```
     遍历 `places`，跳过 `holdsSomething(holds[place.id])` 为 false 的项；
     按 `place.agent` 合并，同一个 agent 的多个 scope 只出一个 mark，
     label 去重后拼接。不引用 i18n，标签由调用方给。
2. `packages/resources/prompts/src/index.ts`
   - 导出 `heldAt`、`holdsSomething`、`heldMarks`、`type Held`、`type HeldMark`
     （与现有 `deliver/delivered/...` 同一行）。
3. `packages/resources/prompts/src/library.ts`
   - `Installed` 替换为：
     ```ts
     export type Holds = Readonly<Record<string, Held>>
     export function useHolds(prompt, places, files, stamp): Holds
     ```
   - 每个 place 调 `heldAt`；单个 place 抛错时记 `NOTHING_HELD`；依赖项保持
     `prompt / places / files / stamp`；函数 doc comment 从「是否安装」改为
     「这个位置已经持有的投递」。
   - 删除 `useInstalled` 与旧 `Installed`，不留别名。
4. 机械更新调用点（本阶段行为不变）：
   - `src/install-menu.tsx`：`Installed` → `Holds`；`installed` prop 改名 `holds`；
     `option.selected` 与菜单勾选继续读 `holds[place.id]?.commands === true`。
   - `src/page.tsx`：`PromptCard`、`LedgerAction` 改用 `useHolds`；
     `PromptActions` 传入 `holds={holds}`。
   - `src/prompt-detail-dialog.tsx`：`Lightbox` 改用 `useHolds`；
     `PlacesSection` / `InfoPanel` 的 `installed` prop 改名 `holds`；
     「已装 {count}」与安装行继续按 `holds[place.id]?.commands` 计算。

**测试**

- `delivery.test.ts` 新增 describe：「what one place already holds」。
  用独立 prompt（如 `name: "Held Probe"`）和 place：
  - 什么都没写时 `heldAt` 等于 `NOTHING_HELD`；
  - 写 `commands` 后 `commands === true`（同时证明 install 的路径被这一次探测覆盖）；
  - 写 `rule`、`agent` 后对应字段为 true；
  - 向 `agents` 文档写段落后 `documents` 包含 `"agents"`，不包含 `"design"`；
  - `holdsSomething(NOTHING_HELD)` 为 false，任一字段为 true 时为 true。
- `delivery.test.ts` 新增 `heldMarks` 用例（纯函数，不建 React）：
  - 没有任何持有 → `[]`；
  - 两个 place 同属一个 agent（workspace / global）→ 一个 mark，label 只有一份；
  - 两个不同 agent 各持有 → 两个 mark，顺序照 `places`；
  - 只有文档段落持有也算一个 mark。
- 现有测试无需改动。

**验收**

```bash
pnpm --filter @context-hub/prompts typecheck
pnpm --filter @context-hub/prompts lint
pnpm --filter @context-hub/prompts test
```

通过；全局搜索 `useInstalled|type Installed` 在 `packages/resources/prompts/src`
不再有命中（测试和 `aoci` 文本除外）。

## 阶段三：画卡片头像组

**执行目标**：在卡片动作行左侧显示「这条提示词已经出现在哪些位置」的头像组，
不改变 ledger 列和详情页的位置列表。

**改动文件**

- `packages/resources/prompts/src/page.tsx`
  - 从 `@context-hub/extensions/components` 导入 `AvatarStack`，
    从 `./deliver.ts` 导入 `heldMarks`。
  - `PromptCard` 已有 `holds`（阶段二），计算：
    ```ts
    const marks = React.useMemo(
      () => heldMarks(places, holds, (place) => t(place.labelKey)),
      [places, holds, t]
    )
    ```
    `heldMarks` 按 `place.agent` 去重：claude-code 的 workspace / global 两个位置
    只画一个图标；label 是去重后的位置标签以 ` · ` 拼接。
  - 动作行从 `flex items-center justify-end gap-2` 改为：
    ```tsx
    <div className="flex items-center gap-2">
      <span className="mr-auto flex min-w-0 items-center">
        <AvatarStack
          marks={marks}
          seam="ring-card"
          label={marks.map((mark) => mark.label).join(" · ")}
        />
      </span>
      <CopyAction text={prompt.prompt} />
      <span onClick={(event) => event.stopPropagation()}>
        <PromptActions … />
      </span>
    </div>
    ```
    `AvatarStack` 在 `marks` 为空时返回 `null`，动作仍在右侧，布局与现在一致。
  - `LedgerAction` 和详情页不改布局；头像组只出现在卡片。

**验收**

```bash
pnpm --filter @context-hub/prompts typecheck
pnpm --filter @context-hub/prompts lint
pnpm --filter @context-hub/prompts test
```

真机（隔离 hub home，避免动用户库；只写 `.agents/**`）：

```bash
CONTEXT_HUB_HOME=<temp> node apps/web/dev.ts   # 绕过 turbo，避免 strict env 过滤
```

打开 `http://localhost:5271/prompts`：
1. 用界面新增一条测试提示词（只写 `<temp>` 下的库）。
2. 卡片菜单 → Workspace → `⋯` → 「生成 Commands」，确认卡片左下角出现 Workspace 图标，
   右侧 Copy / Install 位置不变。
3. 再生成 Rule / agents 文件，确认同一个 workspace place 仍只占一个 mark
   （不因为写了三类文件而画三个相同的 Workspace 图标）。
4. 不向 claude-code 位置生成文件：那会写 `<repo>/.claude/**` 与用户真实 home。
   「同 agent 两个 scope 只画一个 mark」由阶段二的 `heldMarks` 单测覆盖。

收尾删除本次生成的 `.agents/agents`、`.agents/commands`、`.agents/rules` 里的测试文件，
`git status --short` 不应出现未预期改动。若 5270 / 5271 已被不是本次启动的进程占用，
不杀进程，记录为「未做真机验收」并保留类型检查结果。

## 阶段四：统一卡片菜单并接通移除

**执行目标**：把详情页的 `⋯` 菜单抽成两边共用的组件，让卡片下拉在菜单项、第二行、
行点击、计数四处与详情页一致；`GenerateItems` 按 `held` 切换生成 / 移除文案，
移除调用 `undeliver`；批量菜单保持只生成。

**改动文件**

1. `packages/resources/prompts/src/deliver.ts`
   - 新增并导出纯函数（详情页和卡片菜单都要用，两个文件不再各写一份）：
     ```ts
     export function generatedUnder(place: PromptPlace): string {
       const parts = place.commandDir.split("/")
       return parts.length > 1 ? parts.slice(0, -1).join("/") : place.commandDir
     }
     ```
   - **删除 `install` 动作**：`Delivery` 变成
     `"commands" | "rule" | "agent" | "instructions"`；`targetOf` 去掉 install 分支；
     `textOf` 的 `frontmatter` 条件改成 `action === "commands" || action === "agent"`
     （`rule` 仍是纯正文）。理由：install 与 commands 写同一个文件，菜单里那个
     「安装 / 移除」项和「生成命令」是同一件事，留着只是两个入口。
     模块头注释从「四件事」改成「四件事」但列表换成 commands / rule / agent / instructions。
2. `packages/resources/prompts/src/install-menu.tsx`
   - 把 `prompt-detail-dialog.tsx` 里的 `PlaceGenerate` 整体移到这里并导出，
     原文件改为 import。**但先删掉它的安装 / 移除项与分隔线**（`installs`、
     `PlusIcon` / `MinusIcon` 导入、`onToggle`、`files` 只用于禁用的那段一起删），
     它现在只剩一个 `⋯` 打开 `GenerateItems`。这正是两边共用的那个菜单。
   - 删除 `PlaceMore`（卡片的 `⋯` 子菜单）与它专用的 `DropdownMenuSub*` 导入。
   - 定义并导出统一回调：
     ```ts
     export type DeliveryRun = (
       place: PromptPlace, action: Delivery, document?: string, remove?: boolean
     ) => void
     ```
     所有 `onGenerate` 参数改为 `DeliveryRun`。
   - `GenerateItems` 增加 `held: Held`，按项渲染：
     - `commands`: `held.commands ? t("prompts.menu.commands.remove") : t("prompts.menu.commands")`
     - `rule`: `held.rule ? t("prompts.menu.rule.remove") : t("prompts.menu.rule")`
     - `agent`: 仅当 `place.agentDir !== undefined` 时渲染；
       `held.agent ? t("prompts.menu.agent.remove") : t("prompts.menu.agent")`
     - documents:
       ```ts
       const taken = held.documents.includes(document.id)
       const removable = taken && document.removeLabelKey !== undefined
       ```
       文案：`removable ? t(document.removeLabelKey) : t(document.labelKey)`；
       点击时把 `removable` 作为 `remove` 传入。没有 `removeLabelKey` 的文档
       即使已存在也仍走添加分支（`withSection` 是幂等的），不会误删。
   - `PlaceChoices`（卡片与批量共用的位置列表）改为与详情页同口径：
     - 第二行：`place.generatedOnly === true` 时 `where: generatedUnder(place)`，
       否则 `note: t("prompts.place.generates")`；不再一律写 `place.commandDir`。
     - 行点击：`PlaceMenu` 改用 `activation="control"`，行本身不再是动作；
       `trailing` 自己画勾（`option.selected === true` 时）再挂共用的 `PlaceGenerate`。
       取掉 `onPick` 与 `closeOnClick`。
     - 计数：`count` 传 `(all) => all.filter((option) => option.selected === true).length`，
       标题旁从「3 个位置」变成「已安装 2」；`BatchActions` 传 `countHeld={false}`
       时退回位置数（一组提示词没有单一持有状态）。
     - `PlaceGenerate` 的 `held` 取 `holds[place.id]`（缺省 `NOTHING_HELD`）。
     - 行不再是动作之后，`files === null` 的禁用从整行移到菜单项：`GenerateItems`
       的每一项都带 `disabled={files === null}`。
   - `PromptActions` / `BatchActions` 的 `onGenerate` 透传第 4 个参数 `remove`。
3. `packages/resources/prompts/src/prompt-detail-dialog.tsx`
   - 删除本地的 `PlaceGenerate` 与 `generatedUnder`，改为
     `import { PlaceGenerate } from "./install-menu.tsx"`。
   - 删除 `onToggle` 整条 prop 链（`Lightbox` → `PlacesSection` → `PlaceGenerate`）；
     `place-detail-dialog` 里 `PlusIcon` / `MinusIcon` 只被删掉的安装项使用，一并去掉。
   - `PlacesSection` 的「已安装 {count}」改成数 `holds[place.id]?.commands === true`。
   - `PlacesSection` / `InfoPanel` / `Lightbox` / `PromptDetailDialog` 的
     `onGenerate` 类型改为 `DeliveryRun` 并原样转发。
4. `packages/resources/prompts/src/page.tsx`
   - 删除 `toggle()`（它的唯一作用就是 install / 取回）及 `delivered` /
     `undeliver` 在它里面的用法；`PromptCard`、`LedgerAction`、`cardProps` 不再传
     `onToggle`，`PromptActions` 的 `onToggle` prop 删掉。
   - `BatchActions` 的 `onDeliver`（安装整组）删掉，批量只剩 `onGenerate`。
   - `generate()` 增加 `remove` 参数：
     ```ts
     if (remove) {
       const removed = await undeliver(files, place, prompt, action, document)
       setStamp((current) => current + 1)
       if (removed) {
         const where = place.documents?.find((one) => one.id === document)
         toast.add({
           type: "success",
           title: where === undefined
             ? t("prompts.done.remove").replace("{agent}", t(place.labelKey))
             : t("prompts.done.document.remove").replace("{file}", t(where.labelKey)),
         })
       }
       return
     }
     ```
     生成分支不变；`action === "agent"` 走
     `t("prompts.done.agent").replace("{agent}", …)`（现有 `prompts.done.${action}` 已能取到）。
   - `PromptCard`、`LedgerAction`、`cardProps` 的 `onGenerate` 透传第 4 个参数。
5. 文案：
   - `src/messages.ts` 新增：
     - `"prompts.menu.agent": "Create an agents file"`
     - `"prompts.menu.agent.remove": "Remove the agents file"`
     - `"prompts.menu.commands.remove": "Remove the command"`
     - `"prompts.menu.rule.remove": "Remove the rule"`
     - `"prompts.done.agent": "An agents file was created for {agent}"`
     - `"prompts.done.document.remove": "Removed from {file}"`
   - `src/messages.ts` 删除 `"prompts.action.remove"` 与 `"prompts.done.install"`
     （install 动作已不存在）。`"prompts.action.install"` 保留：它现在是卡片上那个
     打开位置列表的按钮文案，不再表示安装动作本身。
   - `src/messages.ts` 修改两处已有值：
     - `"prompts.location.count"` 从 `"{count} targets"` 改为 `"{count} installed"`
     - `"prompts.place.generates"` 改为 `"Commands, rules, and agents files, from the ⋯"`
   - `packages/i18n/zh-cn/src/messages.ts` 同步：
     - `"prompts.menu.agent": "创建 agents 文件"`
     - `"prompts.menu.agent.remove": "移除 agents 文件"`
     - `"prompts.menu.commands.remove": "移除命令"`
     - `"prompts.menu.rule.remove": "移除规则"`
     - `"prompts.done.agent": "已为 {agent} 创建提示词文件"`
     - `"prompts.done.document.remove": "已从 {file} 移除"`
     - 删除 `"prompts.action.remove"`（`"prompts.action.install"` 保留）
     - `"prompts.location.count"` 改为 `"已安装 {count}"`
     - `"prompts.place.generates"` 改为 `"可从 ⋯ 生成 Commands、Rules、Agents 文件"`
6. 其他受 install 删除影响的注释 / 测试：
   - `src/slug.ts` 文件头「Three actions write a file … install, generate a command,
     generate a rule」改为 commands / rule / agent 三个动作。
   - `src/command-file.ts` 文件头「install drops the prompt in as it was written」
     改为描述 rule 与 commands/agent 的差别。
   - `src/provider.ts` 的 `generatedOnly` 注释、`src/index.ts` 的 `WORKSPACE_PLACE`
     注释里「不接收 install」的表述改成「只接收生成出来的形态」。
   - `__test__/delivery.test.ts`：删掉 `writes the same file for an install as for a
     command` 这一条（两个动作已被合并成一个）；`__test__/text.test.ts`：删掉
     `sends an install where a command goes`，并把 `targetOf` 的用例改成覆盖
     `commands` / `rule` / `agent`。

**已知限制（写进代码注释）**

- `commands` 写的是 `<commandDir>/<slug>.md`，菜单只要文件在就显示「移除命令」，
  点击删除该文件；卡片勾选和详情页计数都继续以「这个文件在不在」为准。
- 卡片不再有「安装原文」这个动作：进 agent 的目录要的是命令格式（带 frontmatter），
  原文只存在于库里和复制按钮。这是删掉 install 的直接结果。
- 一个文档没有声明 `removeLabelKey` 时，即使扫描到已有段落也仍显示添加文案；
  仓内三个文档全部声明了移除键。

**验收**

```bash
pnpm --filter @context-hub/prompts typecheck
pnpm --filter @context-hub/prompts lint
pnpm --filter @context-hub/prompts test
pnpm --filter @context-hub/zh-cn test
```

真机（同一台隔离 dev server，只写 `.agents/**`）：
1. 打开卡片的安装菜单：第二行与详情页一致（工作区行显示 `.agents`，agent 行显示说明句），
   标题旁显示已安装数；行本身点击没有任何动作，动作都在 `⋯` 里。
2. 每个位置的 `⋯` 只有生成项，没有「安装 / 移除」项（Agent 位置也一样）。
3. 在 Workspace 位置生成 command / rule / agents 文件，重开 `⋯`，三项都变成移除文案。
4. 点击「移除命令」，文件消失，卡片头像组中该位置若没有其他投递则消失；
   重新打开菜单恢复生成文案。
5. 详情页的位置列表与卡片菜单打开的是同一个 `⋯` 菜单，文案一致；
   详情页不再有安装切换。
6. 批量菜单只出现生成项，不出现移除项；计数仍是位置数。
7. 文档段落不做真机点击：workspace 位置的 `AGENTS.md` / `DESIGN.md` 是仓库里签入的真实文件，
   点了会改它们。段落移除的验收落在 `delivery.test.ts` 的临时目录用例。

菜单文案没有 React 渲染测试环境（`vitest.config.ts` 只收 `.test.ts`），
本阶段文案由 `zh-cn` 的 key 覆盖测试与真机检查覆盖，不新建 jsdom harness。

## 阶段五：验收并维护认知

**执行目标**：全仓检查通过，真实界面走通，最后维护 AOCI 认知。

**执行内容**

1. 全量检查：
   ```bash
   pnpm --filter @context-hub/prompts typecheck
   pnpm --filter @context-hub/prompts lint
   pnpm --filter @context-hub/prompts test
   pnpm --filter @context-hub/claude-code typecheck
   pnpm --filter @context-hub/claude-code test
   pnpm --filter @context-hub/zh-cn test
   pnpm typecheck
   ```
   共享类型（`PromptPlace`、`Delivery`）被多个包消费，所以最后一条必须跑。
2. 真机走查卡片头像组与三类文件移除（命令 / 规则 / agents 文件）；
   文档段落由宿主层测试覆盖，不点仓库里的 `AGENTS.md` / `DESIGN.md`，
   也不点会写 `.claude/**` 或用户 home 的项。
3. 清理：删除 probe 文件、关闭本次启动的 dev server（按自己拿到的 PID / 端口），
   删除临时 `CONTEXT_HUB_HOME`；`git status --short` 只显示本次源码与文档改动。
4. 收尾认知：
   - 先确认树是静的（`find packages apps docs -newermt "-20 minutes" -type f`），
     有别人的改动就停下询问。
   - 只调用一次 `aoci_maintain`，按返回的候选更新受影响的 Entry
     （`deliver.ts`、`instruction.ts`、`provider.ts`、`index.ts`、`library.ts`、
     `install-menu.tsx`、`page.tsx`、`prompt-detail-dialog.tsx`、
     claude-code `locations.ts` / `extension.ts` / `messages.ts`、中英文消息表）。
   - `docs/memory.md` 只在本次执行出现用户纠正时记录；没有纠正不写。

**验收**

- 上述命令全部通过。
- 真机三类生成 / 移除都按描述工作，退出后没有残留写入。
- `aoci_maintain` 返回已对齐（或按工具要求完成一次 `aoci_update_entry`），
  且没有待处理的候选。

## 不做

- 不给 `PlaceFiles` 增加目录列举能力，不扫描未知文件名；只探测
  `<slug>.md` 与声明过的文档。
- 不保留 `install` 动作，也不再提供「把提示词原文原样放进 agent 目录」的入口。
- 不改 ledger 列布局，不在详情页位置列表里加头像组。
- 不让批量菜单显示移除状态。
- 不改 Claude Code descriptor 的 `GLOBAL_LOCATIONS` / `PROJECT_LOCATIONS`
  （它们描述「agent 从哪里读」，本需求只增加投递动作）。
- 不为 agents 文件增加额外的 frontmatter 字段（只 `name`、`description`）。
- 不在删除提示词时清理已投递文件（现有行为）。
- 不改 MCP / skills / plugins 的 `AvatarStack` 用法。
- 不为扫描加缓存、防抖或共享 store；每次 `stamp` 变化重新读文件。
- 不新建 React/jsdom 测试环境。

## 风险

- 扫描读文件数放大：每个卡片 × 每个 place ×（commands + rule + agent + 文档数）。
  现有 `useInstalled` 已经是「每卡片每 place 一次 read」，本改动把它变成常数倍；
  如果目录里提示词与位置都很多，页面首次渲染的请求数会明显上升。本期不加缓存。
- 删掉 `install` 是一个行为变化：之前能在 agent 目录放「不带 frontmatter 的原文」，
  之后只能生成命令（带 frontmatter）。已经落盘的 install 文件仍会被识别为
  「已生成命令」，并在菜单里显示为可移除。
- 删除文档段落时如果文件只剩空白，会删除整个文件。仓内文档由 hub 追加，
  该分支在测试里覆盖；用户手写的空文件是唯一可能被连带删除的对象，且无内容丢失。
- 真机验收会写 `<repo>/.agents/**`（已被 gitignore）；不得点击会写
  `AGENTS.md` / `DESIGN.md` / `.claude/**` 的项，除非目标在临时目录里。
