# 提示词的名称字段：把「名字」从「描述」里拆出来

## Context

提示词今天只有一个名字位：`description`。它同时承担三件事 —— 卡片的标题、唯一性的判据、
以及投递落盘时 `slugOf()` 的文件名来源（`src/deliver.ts:51`）。

问题在第三件事上。描述天然会写长（「这个提示词让我在提交前审查改动，注意报告影响范围」），
而 `slugOf()` 的上限是 64 字符（`src/slug.ts:26`），投递成 command / rule 后
agent 命令列表里就是一串被截断的长文件名。描述写得越清楚，文件名越不可用 —— 两个诉求互相打架。

本轮把名字拆出来：`name` 是短标题（文件名来源），`description` 回到它本来的职责（描述）。
同时按用户要求把 `id` 换成不透明的唯一标识，由 `crypto.randomUUID()` 生成。

## 用户已确认的两项决策

1. **id 用 `crypto.randomUUID()`**，不新增依赖。仓库已有先例：`packages/core/src/host/atomic.ts:29`。
   `nanoid` 不在任何 `package.json` 里；id 只在内存 key 和 JSON 里用、不进文件名，
   36 字符的长度无所谓，所以没有理由为它加一个生产依赖。
2. **保留落盘文件名冲突检查**，只是判据从 `slugOf(description)` 换成 `slugOf(name)`。
   两个 prompt 可以描述相同、可以 id 不同，但只要 `slugOf(name)` 相同就拒绝 ——
   因为那会写进同一个文件，后投递的会静默覆盖先投递的。

## 数据形状

`prompts/prompts.json` 每行现在是：

```json
{
  "id": "9f1c…uuid…",          // 行的身份，UI key，create 时生成，永不改写
  "name": "提交前审查",          // 短标题，落盘文件名来源，slug 唯一
  "description": "提交前审查这次改动…", // 描述，卡片副行 + frontmatter 的 description
  "prompt": "…",
  "tags": [],
  "updatedAt": "…",
  "assets": []
}
```

**老库兼容**（`prompts-fs.ts` 是手可编辑的文件，必须处理）：

- 行里没有 `name` → 读作 `description`。文件名因此在老行上逐字节不变，
  已投递的文件继续被 `delivered()` 认出来。用户要短的落盘名，就自己把 name 填上。
- 行里没有 `id` → 保留现有的 `slugOf(description)` 回退（`prompts-fs.ts:120-123`）。
  id 是不透明字符串，旧的 slug 形式和新的 uuid 形式都能当 key 用，不需要迁移。
- **不做**任何读时写回。读操作不写盘是这个模块的既有性质。

**由此可删的**：`freeId()`（`prompts-fs.ts:125-140`）。它存在的唯一理由是
「description 改正后旧的 slug id 空出来，新行要拿别的 id」——uuid 天然唯一，这个理由消失了。

## 阶段一：数据类型与存储

`packages/plugin-prompts/src/store.ts`、`src/host/prompts-fs.ts`

- `Prompt` 加 `name: string`；`PromptDraft` 加 `name: string`；`PromptPatch` 加 `name?: string`。
- 文档注释要跟着改 —— `store.ts:12-15` 今天写着「the id is … what a delivery names its file after」，
  和 `deliver.ts:51` 实际的 `slugOf(description)` 已经不一致了，这轮一并改对。
- `rowOf()` 读 `name` 时用回退：`textOf(held.name, "name")` 前先判空，缺失时取 `description`。
  抽成一个 `nameOf(row: Row): string`，放在 `idOf()` 旁边 —— 存储层和投递层都要用它。
- `idOf()` 保留现形状。`create` 改用 `randomUUID()`；`update` 不动 id。
- 唯一性检查（`:269-272`、`:304-307`）的判据换成 `slugOf(nameOf(row))`。
- 删掉 `freeId()` 及其调用。
- `create` 的必填校验沿用 `textOf`：name 和 prompt 必填，description 允许为空？
  **不允许为空** —— 卡片的副行、详情正文、frontmatter 都读它，空描述是没有意义的行。
  保持三个字段都必填，和今天的表单一致。

验收：`node scripts/check-prompt-store.ts` 通过（断言见阶段六）。

## 阶段二：投递

`packages/plugin-prompts/src/deliver.ts`、`src/command-file.ts`

- `deliver.ts:51`、`:75`、`:82` 三处 `slugOf(prompt.description)` → `slugOf(prompt.name)`。
- `textOf()`（`:87-93`）的 `commandFile({ name: prompt.description })` → `name: prompt.name`，
  并**补上 `description: prompt.description`**。

  这一条是顺手补一个早就存在的空位：`CommandFileInput.description`（`command-file.ts:24`）
  一直留着，而 `deliver.ts` 从来不传，所以生成的 command frontmatter 里
  `description:` 永远回退到 `describeBody(body)`（正文首行截 80 字符）。
  有了独立的 description 字段，frontmatter 才第一次拿到真正的描述。
  只影响 `commands` 这个动作 —— `install` 本来就不写 frontmatter（`:92`）。

验收：`node scripts/check-prompt-delivery.ts` 通过。

## 阶段三：添加表单

`packages/plugin-prompts/src/add-prompt-dialog.tsx`

1. **新增 name 一个 `Section`**，放在最前，`autoFocus` 从 description 移过来。
   `EMPTY`、`close()`、`submit()` 的校验、`problem` 的联合类型（加 `"name"`）都要跟着加一项。
2. **prompt 字段从 `Textarea` 换成 `CodeEditor`**（`@workspace/extensions/components`）。
   - `language="markdown"`，`label={t("prompts.add.prompt")}`。
   - `CodeEditor` 填满给它的盒子（`extensions/src/components/code-editor.tsx:50`），
     所以要给 `className="h-[228px] rounded-md border border-border"` 之类的固定高度 ——
     现在是 `min-h-[164px]` 的 textarea，编辑器的两层结构撑不出自适应高度。
   - **已知取舍**：`CodeEditor` 不换行（`code-editor.tsx` 顶部注释里的 `shortcut:`），
     长行走横向滚动。这正是编辑器该有的行为，也是用户要的。
   - `aria-invalid` 走 props 传不进去（`CodeEditor` 没有这个口），
     所以空内容的错误提示只留下面那行 `ERROR` 文案。可接受 —— `problem` 状态仍然在，
     错误行照常显示。
   - 表单里 `Textarea` 的 import 如果不再被用到就清掉。

验收：`pnpm --filter @workspace/plugin-prompts typecheck` 通过；
在浏览器里打开添加弹窗，确认编辑器有语法着色、能打字、中文输入法不吞字（`composing` 那段逻辑）。

## 阶段四：展示，布局对齐 skills 模块

### 卡片 —— `packages/plugin-prompts/src/page.tsx` 的 `PromptCard`（`:285-350`）

今天 description 占着标题位（`text-[13px] text-copy`，`:317-326`），skill 卡片是名字在上、
描述在下（`plugin-skills/src/page.tsx:512-529`）。改成一致：

```
<div className="flex flex-col gap-2.5 px-[18px] pt-4 pb-[18px]">
  <div className="flex h-[19px] items-center justify-between gap-2">
    <span className="truncate font-mono text-[14px] leading-[19px] font-semibold">{name}</span>
    <span className="…text-muted-soft">{updated}</span>
  </div>
  <p className="line-clamp-2 text-[13px] leading-[18px] text-copy">{description}</p>
  <div className="flex items-center justify-end gap-2">…动作…</div>
</div>
```

`aria-label`（`:294`）改成 `prompt.name`。description 的注释（`:313-316`）要重写 ——
它现在写的「It is a sentence rather than a file name」正好说的是这轮改掉的事。

### 列表视图的 ledger 列 —— `page.tsx:549-566`

现在第一行是 description（`font-semibold`）、第二行是 prompt 的正文首行（mono）。
skill 的 ledger（`plugin-skills/src/page.tsx:810-825`）是 name + description 两行。
改成一致：第一行 `name`（14px semibold truncate），第二行 `description`（12px muted-foreground truncate）。
`firstLine()`（`:70`）和它唯一的调用点（`:562`）一起删掉。

### 详情弹窗的头部 —— `prompt-detail-dialog.tsx:606-635`

今天 `h-14`，`DialogTitle` 是 `sr-only`，条上只有 token 数和时间。skill 的头部
（`skill-detail-dialog.tsx:712-734`）是 `h-[84px]` + 两行：名字 + 来源行。改成一致：

```
<div className="flex h-[84px] shrink-0 items-start gap-3 border-b border-border px-5 pt-[22px]">
  <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
    <DialogTitle className="truncate text-[16px] leading-[21px] font-semibold">{name}</DialogTitle>
    <DialogDescription className="flex min-w-0 items-center gap-2">
      …token 数 · 时间…            ← 原来条上的两段，挪到第二行
    </DialogDescription>
  </div>
  <DialogClose render={<Button … className="mt-1 size-8 rounded-full" />}>…</DialogClose>
</div>
```

`:608-612` 那段注释要重写（它现在明说「a prompt's only name is its description」）。

### name 的编辑

`name` 决定落盘文件名，打错字必须能改。今天 description 在正文区可以双击编辑
（`DescriptionLine`，`:511-568`）。把 `DescriptionLine` 泛化成接 `text` / `onWrite` / `label`
的通用就地编辑行，画两处：

- 头部：name（用新的 `prompts.detail.name.edit` 文案）
- 正文第一段：description（沿用现有 key）

只有这两个字段的编辑路径要各自保留原有的拒绝行为（空值不提交，`store.update` 照旧拒绝）。

`DeleteBubble`（`:695`）的 `name={prompt.description}` 保持用 description 还是换 name ——
**换 name**，删除确认里提的应该是那个人认得出的标题。

### 搜索 —— `page.tsx:385-390`

过滤条件加一项 `row.name.toLowerCase().includes(needle)`。

验收：`pnpm --filter @workspace/plugin-prompts typecheck` 通过；
浏览器里卡片、列表、详情三处都和 skills 模块对齐，中文长描述在卡片上两行截断。

## 阶段五：文案

`packages/plugin-prompts/src/messages.ts` 与 `packages/locale-zh-cn/src/messages.ts`
（由 `packages/locale-zh-cn/scripts/check-messages.ts` 校验，两处 key 必须一一对应）

新增：

- `prompts.add.name` / `prompts.add.namePlaceholder` / `prompts.add.needName`
- `prompts.detail.name.edit`
- `prompts.column.name`（如果 ledger 的表头需要独立文案；看阶段四定了再说）

改写的现有条目：

- `prompts.add.hint`（`messages.ts:105-106`）今天说「The description becomes the file name」——
  现在文件名来自 name，这句话要说 name。
- `prompts.add.descriptionPlaceholder`（`:108`）今天是「Review a diff before committing」——
  这是一句名字的话，应该搬去 name 的 placeholder，description 换一句真正的描述样例。
- `prompts.detail.description.edit`（`:129`）保留（description 仍可编辑）。

验收：`node packages/locale-zh-cn/scripts/check-messages.ts` 通过。

## 阶段六：检查脚本与验证

`packages/plugin-prompts/scripts/check-prompt-store.ts` 要改的断言：

- `:48` `created.id === "review-a-diff-before-committing"` → id 现在是 uuid，
  改成断言形状（非空、且不等于 slug）而不是具体值。`:192` `took.id === "…-2"` 同理 ——
  `freeId` 删掉后这个后缀不再出现。
- `:56-57` 字段清单加 `"name"`，并按字母序重排。
- `:99-106` 冲突用例的判据从 description 换成 name。
- `:80-86`、`:171-193`、`:220-230` 里依赖「description 就是名字」的断言全部改写成 name。
- 补两条新断言：**没有 name 的老行读出来 name 等于 description**；
  **name 相同（slug 相同）的第二次 create 被拒绝**。

`packages/plugin-prompts/scripts/check-prompt-delivery.ts` 的 `Prompt` fixture（`:71`、`:159`）
要补 `name` 字段，并加一条断言：**落盘文件名来自 name 而不是 description**。

`packages/plugin-prompts/scripts/check-prompt-text.ts` 不涉及（它只测 `slugOf` 本身）。

全部命令：

```
node packages/plugin-prompts/scripts/check-prompt-store.ts
node packages/plugin-prompts/scripts/check-prompt-delivery.ts
node packages/plugin-prompts/scripts/check-prompt-text.ts
node packages/locale-zh-cn/scripts/check-messages.ts
pnpm --filter @workspace/plugin-prompts typecheck
pnpm --filter @workspace/plugin-prompts lint
```

## 已知影响与限制（要如实告诉用户）

1. **老行补 name = 换落盘名。** 一条投递过的老提示词，用户给它填上短 name 之后，
   `delivered()` 会认为它没投递过（它在旧名下找），再投递会在新名下多写一份，
   旧文件不会被删也不会被认领。要在提示词页把旧的那份手动移除。
2. **`id` 变成 uuid 会改变上传的图片文件名。** `owned()`（`prompts-fs.ts:150-152`）用 id 给
   资产文件加前缀，所以 `~/assets/` 里的新文件会变成
   `9f1c…-shot.png` 而不是 `review-a-diff-before-committing-shot.png`。
   功能不变（前缀的作用只是「每个 prompt 有自己的引用」），可读性下降。
   已有文件不受影响 —— 它们的引用是记在行里的绝对记录。
3. **description 仍然必填。** 卡片的副行、详情正文、command frontmatter 都读它，
   空描述等于一行没有说明的记录。
4. **`CodeEditor` 不换行**，长行走横向滚动（组件自己的 `shortcut:` 注释写明了）。
