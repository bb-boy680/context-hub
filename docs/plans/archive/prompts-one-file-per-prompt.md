# 提示词库：正文移到独立的 Markdown 文件

## 背景

今天整个提示词库是 `<hub-home>/prompts/prompts.json` 一个 JSON 数组，每条 prompt 的
正文和其他字段混在同一行对象里：

- `packages/resources/prompts/src/host/prompts-fs.ts:41` 定义 `LIBRARY_FILE = "prompts.json"`，
  `promptsFile()`（`:68-70`）返回 `${home}/prompts/prompts.json`。
- `load()`（`:168-190`）一次读出整个数组；`save()`（`:193-196`）把整个数组原子写回。
- 改一条 prompt 的正文会让整个 `prompts.json` 产生一份大 diff，人没法按条审批。

用户确定的方案（两轮确认）：

1. **`prompts.json` 保留**，继续作为库的索引与元数据来源（`id/name/description/tags/updatedAt/assets`）。
2. 每条 prompt 的**正文**移到同目录的 `<slugOf(name)>.md`，JSON 行用 `file` 指向它。
   markdown 里只有正文，没有 frontmatter。
3. 旧数据在首次读取时原地迁移：写出 `.md`、给行补 `file`、删掉行里的 `prompt` 文本，
   然后原子重写 `prompts.json`。**不生成 `.bak`**：`prompts.json` 本身保留，迁移是
   「写入 md + 原子改 JSON」，可重试，没有丢数据的窗口。

- `store.ts:83-90` 的 `PromptPage.root` 仍然是 `prompts.json` 的路径，`page.tsx:818` →
  `prompt-detail-dialog.tsx:326` 的展示不变。
- 公开契约 `Prompt.prompt` 仍是**正文文本**：store 从 md 读出后合并进返回值，
  UI、交付（`deliver.ts`）、bridge（`handlers.ts` / `remote-store.ts`）全部不改。

## 核实结果（基于当前代码）

- `Prompt` / `StoredPrompt` / `PromptPage` / `PromptStore` 在
  `packages/resources/prompts/src/store.ts:31-145`；`prompt` 字段的类型和语义本轮不变。
- `prompts-fs.ts` 现有行为（`__test__/store.test.ts` 有对应断言）：
  - 未知字段随行走（`rowOf()` `:105-123`、`lineOf()` `:126-128`）；
  - `name`/`description`/`prompt` 必填（`textOf()` `:73-78`）；注意 `create()` 只校验
    `name`/`description`，不校验 `draft.prompt`（既有不一致，本轮不修）；
  - 无 `name` 的老行用 `description` 顶替（`titleOf()` `:94-96`）；
  - `id` 由 `randomUUID()` 生成，无 `id` 的老行用 `slugOf(name)` 兜底（`idOf()` `:137-140`）；
  - slug 冲突拒绝（`create` `:271-274`、`update` `:305-312`）；
  - `assets` 用 `<id>-<原名>` 归属（`owned()` `:150-152`），删行连带删图（`:328-345`）；
  - 并发写串行化（`run()` `:203-208`）；
  - 不可解析的 JSON 拒绝而不重建（`load()` `:170-189`）；空文件/文件不存在 = 空库。
- `@context-hub/core/host/atomic.ts` 的 `writeFileAtomic(target, data)` 自动建目录、
  写临时文件后 rename；`displayPath()` 在 `@context-hub/core/host/home.ts`。
- `slugOf`（`src/slug.ts`）已经把名字压成安全文件名（NFC、小写、非字母数字变 `-`、
  最长 64、Windows 设备名兜底），可以直接当文件名用。
- 不需要 frontmatter 解析器，也不新增依赖。
- 真实机器上 `~/.context-hub/prompts/prompts.json` 当前有 1 条数据
  （`create-plan`，中文正文）。它是用户数据，**任何验证都不碰它**；测试全用 `fs.mkdtemp`。
- `promptsFile` 的引用范围（已搜）：`__test__/store.test.ts:20,36`、`aoci.code.txt:288`、
  历史文档（`docs/plans/archive/*`、`docs/memory.md`，不改）、`handlers.ts:55` 的 JSDoc（改）。

## 目标格式

### `prompts.json`

仍然是一个 JSON 数组，行顺序就是列表顺序（**不变**）。每行：

```json
{
  "id": "a724c0b4-a287-46e6-9ec5-c2129fc84bea",
  "name": "create-plan",
  "description": "执行任何任务前...",
  "file": "create-plan.md",
  "tags": [],
  "updatedAt": "2026-10-17T08:18:16.076Z",
  "assets": []
}
```

- 已知字段照旧；**不再有 `prompt` 字段**；新增 `file`。
- 未知字段照旧随行走：读进来保留，写回时原样写出。
- `file` 是目录内的纯文件名（不含 `/`、`\`、`..`），必须以 `.md` 结尾。
  由 store 在创建/迁移时写成 `${slugOf(name)}.md`，之后信任文件里记的值。

**关于重名**：`name` 今天已经是唯一的——`create`（`prompts-fs.ts:271-274`）与
`update`（`:305-312`）都拒绝 `slugOf(name)` 与另一行相同，理由是投递文件名
（`.claude/commands/<slug>.md`、`.agents/rules/<slug>.md`）和 `CLAUDE.md` 的幂等标记
都按 slug 区分，详见 `store.test.ts:136-161`。本轮**不改变**这条约束，
`<slug>.md` 命名因此没有引入新的唯一性要求：id 仍是身份，slug 唯一是投递层既有的要求。
读取时额外拒绝「两个 JSON 行指向同一 `file`」，因为那会让两次写入落到同一正文。

### `<file>.md`

正文就是 prompt 原文，**没有 frontmatter、不 trim、不加标题**：

```markdown
## 流程

1. **先了解上下文，不靠猜。**
...
```

- 读：剥掉开头的 BOM，其余字节原样成为 `prompt`。
- 写：`writeFileAtomic`，文本原样写入（不强制补尾随换行，保证 round-trip 逐字节相等）。
- 空正文/纯空白：拒绝，报行与文件名（沿用 `prompt` 必填的语义）。

## 存储语义

### 路径

```ts
export function promptsDir(home?: string): string   // resolveHubHome(home)/prompts
export function promptsFile(home?: string): string  // promptsDir(home)/prompts.json（不变）
```

- `promptsFile()` 保留，行为不变。
- 正文路径 = `path.join(promptsDir(home), row.file)`。

### 读取

`load()` 读 JSON 后，对每一行：

1. 用现有 `rowOf()` 归一化已知字段（`name`/`description`/`file` 必填；`id`/`tags`/
   `updatedAt`/`assets` 照旧；未知字段继续保留在行对象里）。
2. `file` 校验：字符串、非空、不含 `/` `\`、不是 `.`/`..`、以 `.md` 结尾。
   不合法 → 抛错并报行号与文件名。
3. 读 `<dir>/<file>`：
   - `ENOENT` → 抛错 `prompts.json: entry N points at <file>, which is not there`；
   - 其他读错误 → 原样抛出；
   - 空/纯空白 → 抛错，报行与文件名。
4. 一行的 `prompt` = 文件内容（剥 BOM）。返回值仍是 `StoredPrompt`，公开字段不变。

行的 `prompt` 与 `file` **同时存在**视为手改坏的状态：抛错并报行号，不猜哪个为准。

JSON 解析失败、不是数组、空文件 = 空库：行为全部不变。

### 写入

所有写入先在内存里构造新行，然后按顺序落盘：

- **正文**：`writeFileAtomic(<dir>/<file>, body)`。
- **元数据**：`writeFileAtomic(promptsFile, JSON.stringify(rows, null, 2) + "\n")`。
- **顺序**：先写正文，再写 JSON。崩溃只会留下一个未被 JSON 引用的 `.md`（被忽略），
  不会出现「JSON 指向不存在的正文」。删除相反：先重写 JSON 去掉行，再删 `.md` 与资产。
- 写完再替换内存缓存。

### 创建、更新、删除、资产

- `create`：slug 冲突检查照旧（名字是文件名来源）。计算 `file = ${slugOf(name)}.md`；
  若磁盘上已存在同名 `.md` 而 JSON 里没有行引用它 → 拒绝，不覆盖人手放的文件。
  写 md → 追加 JSON 行（行里没有 `prompt` 字段）。
- `update`：
  - 只改正文：写同一个 md → 改 JSON 里的 `updatedAt`；
  - 改 `name`：新 `file = ${slugOf(name)}.md`，先写新 md，再改 JSON 的 `file` 与
    `updatedAt`，最后删旧 md。新文件已存在且未被别的行引用 → 拒绝；
  - 空 patch：不写盘、不盖时间戳（现有行为）。
  - slug 冲突检查与「排除自己」照旧。
- `remove`：重写 JSON 去掉该行（行不在则什么都不做）→ 删 `<file>.md` → 按现有顺序删该行的 assets。
- `putAsset` / `addAssetSource` / `deleteAsset` / `recordAsset`：只改 JSON 的 `assets`，
  不碰 md；`<id>-<原名>` 归属、去重、删行连带删图全部保持原样。
- 并发：保留 `run()` 串行队列（现在一轮改动可能跨两个文件，更需要串行）。
  `load()` 用共享在途 Promise，避免 `list()` 与并发 `create` 各读一遍。

## 迁移

`load()` 每次首次执行时检查：有任一行的 `file` 缺失且带字符串 `prompt` → 迁移这些行。

1. 先完成整库校验（`rowOf`、slug/文件名重复），任何一行不合格都停，**不写任何文件**。
2. 对每个待迁移行：
   - `file = ${slugOf(row.name)}.md`；
   - 若另一个待迁移行算出同名 → 停，报两行；
   - 若目标 `.md` 已存在：
     - 内容与行里的 `prompt` 文本完全相同 → 视为上次迁移已写（可重试），继续；
     - 内容不同 → 停并报文件名，**不覆盖**；
   - `writeFileAtomic(target, prompt)`。
3. 全部写成功后，一次性重写 `prompts.json`：删除每行的 `prompt`，插入 `file`。
   空文件/空数组不产生任何 `.md`，也不写 JSON。
4. 中途失败：JSON 原样不动，已写的 md 会在下次重试时按内容比对跳过。
5. 已经带 `file` 的行原样保留；未知字段继续保留；`id`、`name`、`description`、`tags`、
   `updatedAt`、`assets` 全部保留。

不生成 `.bak`：`prompts.json` 本身不消失，正文在写入 JSON 之前已经落盘，
崩溃后重试是幂等的。

## 阶段一：改造存储与迁移

**目标**：`prompts-fs.ts` 完成「元数据在 JSON、正文在 md」，旧行首次读取时原地迁移。
仓库在这一阶段结束时已能安全处理真实旧库。

**改动文件**

- `packages/resources/prompts/src/host/prompts-fs.ts`
- `packages/resources/prompts/src/store.ts`（只改文件头注释：`prompt` 的正文来自 md）
- `packages/resources/prompts/handlers.ts:55`（JSDoc：库是 `prompts` 目录下的 JSON + md）
- `packages/resources/prompts/__test__/store.test.ts`（按「测试改写」调整）

**具体做什么**

1. 新增 `promptsDir()`；保留 `promptsFile()`。
2. 内部行类型：`Row`（`Prompt` 去掉 `prompt`、加 `file`，再 `Record<string, unknown>`）；
   缓存 `Entry` 额外持有正文文本（不写回 API 之外的地方）。
3. `rowOf()`：校验 `description`、`file`（规则见上）；`name` 用 `titleOf()`；
   不再校验 `prompt` 字段；`idOf()` 兜底规则不变。
4. `load()`：读 JSON → 迁移 → 逐行读 md 合并正文 → 缓存。`withId()` 返回 `StoredPrompt`
   （含 `prompt` 正文），不泄露 `file`/未知字段给 API 之外。
5. `save()` 拆成 `saveRows()`（只写 JSON）；新增 `writeBody()` / `removeBody()`。
6. `create` / `update` / `remove` / 资产方法按「创建、更新、删除、资产」改写，
   校验、时间戳、去重、串行队列的行为保持不变。
7. `migrateLegacy()` 按「迁移」实现。
8. 重写文件顶部注释：说明为什么拆成 JSON + md（一文件一正文，便于逐条审批 diff）、
   为什么正文先写、为什么坏 JSON/坏行仍然拒绝。

**测试改写**（`store.test.ts`）

- 辅助函数：`rowsOnDisk()` 读 JSON；`bodyOnDisk(row)` 读对应 md；不再从 JSON 取正文。
- 现有块逐个对应：
  - 创建：JSON 行有 `id/name/description/file/tags/updatedAt/assets`，无 `prompt`；
    `<slug>.md` 的字节与传入正文逐字节相同；`list()` 返回的 `prompt` 正确。
  - 未知字段：JSON 里的 `author` 等随行走；改正文后仍在。
  - 编辑正文：只改 md，JSON 只有 `updatedAt` 变化，其他字段与未知字段不变。
  - 改名：旧 `<old-slug>.md` 消失、新 `<new-slug>.md` 出现、`file` 更新、`id` 不变；
    旧名可被新行使用；冲突拒绝。
  - 手写行：fixture 用 JSON + 对应 md，覆盖缺 `name`（用 description）与缺 `id`（用 slug）。
  - 媒体、并发、损坏 JSON：断言不变，只是不再从 JSON 读正文。
- 新增迁移块：
  - 旧格式两条（含中文、未知字段、tags/assets）→ 两个 md；JSON 中 `prompt` 消失、
    `file` 出现、其他字段与未知字段保留；行顺序不变；**不产生 `.bak`**。
  - 空数组/空文件 → 不产生 md，不重写 JSON。
  - 目标 md 已存在且内容相同 → 跳过并完成迁移（重试幂等）。
  - 目标 md 已存在且内容不同 → 抛错，JSON 字节不变。
  - 两行 slug 相同 → 抛错，不写任何 md。
  - 写 md 失败（在目标路径放一个目录）→ 抛错，JSON 字节不变。

**验收**

```bash
pnpm --filter @context-hub/prompts test
pnpm --filter @context-hub/prompts typecheck
pnpm --filter @context-hub/prompts lint
```

`__test__/bridge.test.ts` 不改也必须通过（它走真实 socket 调 `create/update/remove/list`）。

## 阶段二：补齐边界与失败路径

**目标**：把迁移的非常规状态、损坏文件、特殊字符用测试钉死；只在测试暴露问题时改实现。

**改动文件**

- `packages/resources/prompts/__test__/store.test.ts`（追加 describe 块）
- `packages/resources/prompts/src/host/prompts-fs.ts`（仅修测试暴露的问题）

**用例**

1. `file` 缺失且没有 `prompt`（例如手删了正文）→ 抛错并报行号。
2. `file` 与 `prompt` 同时存在 → 抛错并报行号。
3. `file` 非法（含 `/`、`..`、不以 `.md` 结尾、空串）→ 抛错并报行号。
4. JSON 指向的 md 文件不存在 → 抛错并同时报行号与文件名。
5. JSON 指向的 md 为空/纯空白 → 抛错并报行与文件名。
6. 未被 JSON 引用的 `.md`、`notes.txt`、`.hidden.md`、`x.MD`、子目录 → 不影响 `total`；
   `create` 撞上已有的未引用 `.md` → 拒绝，不覆盖。
7. 重复 `file`（两个 JSON 行指向同一文件）→ 抛错并报两行。
8. 特殊字符 round-trip：name/description 含冒号、引号、反斜杠、中文标点；
   正文含 BOM、CRLF、正文里有 `---`、`#`、尾随换行 → 通过 store 写入后重新
   `list()` 逐字符相等（BOM 已剥除这一点单独断言）。
9. JSON 行顺序：create 后新行在末尾，`list()` 顺序与 JSON 数组一致（与今天相同）。
10. 并发：三个 create 与一次改名同时发出，全部落地，`list()` 无重复 `id`/`file`。

**验收**：同阶段一三条命令。

## 阶段三：收尾

1. 搜索残留旧说法：
   ```bash
   rg -n "promptsFile|LIBRARY_FILE|prompts\.json|the file's own" \
      packages/resources/prompts aoci.code.txt
   ```
   - `handlers.ts`、`store.ts`、`prompts-fs.ts` 的说明应已更新；
   - `docs/plans/archive/*`、`docs/memory.md` 的历史结论不改；`aoci.code.txt` 不手改。
2. 代码稳定后只调用一次 `aoci_maintain`；对 `prompts-fs.ts` 候选按真实证据更新：
   「元数据在 `prompts/prompts.json`，正文在 `<slug>.md`，`file` 记录文件名；
   首次读取迁移旧行（写 md → 去 `prompt` → 原子重写 JSON，幂等）；坏 JSON/坏行/缺文件
   一律拒绝；未知字段随行走；`list()` 顺序 = JSON 顺序」。
3. `git status --short`：只应出现本轮预期文件；不得有临时 home 或真实 `~/.context-hub` 的改动。
4. 最终再跑一次三条命令。

**验收**：`aoci_maintain` 已对齐；`git status --short` 无意外文件；三条命令全绿。

## 不做

- 不改 UI、交互、布局、文案；`PromptPage.root` 仍是 `prompts.json` 路径。
- 不改 `deliver.ts` / `command-file.ts` / `instruction.ts` / `provider.ts` /
  `remote-store.ts` / `handlers.ts` 的行为（handlers 只改注释）。
- 不引入 frontmatter、不新增依赖、不把正文格式改成 SKILL.md 那套。
- 不改资产目录布局、`<id>-<原名>` 归属、投递文件名与幂等标记。
- 不生成 `.bak`、不加迁移标记文件；不自动修复重复 `file`、缺正文或坏 JSON。
- 不做外部文件监听；保留「首次 load 后缓存，写完更新缓存」的现有语义。
- 不顺手改 `create` 不校验 `draft.prompt` 的既有不一致。
- 不修改 `docs/memory.md`、归档计划、`designs/` 里的历史结论。
- 不运行真实 `~/.context-hub` 上的迁移；所有验证用 `fs.mkdtemp`。

## 已知影响与限制

1. **首次真实读取会写盘**：为旧行写 md 并重写 `prompts.json`（去 `prompt`、加 `file`）。
   目录只读时 `list()` 失败并报 `prompts.json`，原文件不动。
2. **JSON 里的正文不再可读**：审批看 md；直接改 JSON 的 `prompt` 不再生效（迁移之后）。
3. **CRLF/BOM**：正文写入按传入文本原样保存，不做换行归一化；读取剥 BOM。
   用 Windows 编辑器直接改 md 会引入 CRLF，交付时 `commandFile()` 仍会归一化。
4. **未被 JSON 引用的 md 不进入库**：手工新建 md 不会被自动收录；需要时通过表单创建。
5. **改名是两文件操作**：崩溃可能留下旧的 md（未引用、被忽略）或新 md（未引用），
   下次写入/改名会覆盖或留下；不会读到错行。
6. **跨进程不做锁**：与今天一样，假定同一时刻只有一个进程写库。
7. **`create` 仍不校验空正文**：写入后下次读取会拒绝（既有不一致，本轮不修）。

## 自审记录

- 迁移从「改名成 .bak」改成「原地重写 JSON」：用户要求保留 `prompts.json`，
  且正文先落盘、JSON 后写使重试幂等，不再需要备份文件。
- 写入顺序固定为「正文 → JSON」，删除顺序相反，避免 JSON 指向不存在的正文。
- 迁移目标已存在时按内容比对区分「上次写到一半」与「用户自己的文件」，
  前者跳过，后者拒绝，两种情况都不覆盖。
- `list()` 顺序保持 JSON 数组顺序，现有测试里的索引断言不需要因为排序而改。
- 公开契约不变，`Prompt.prompt` 仍是正文，UI/交付/bridge 零改动。
- 明确 `file` 与 `prompt` 同时存在时拒绝，而不是静默二选一。
- 验收命令来自包内 `package.json`；本轮未运行。
