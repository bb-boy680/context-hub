# 根目录没有 plugin.json 的插件仓库可被收录

## 背景与现状

用户报的 bug：在 plugins 模块用「添加插件 → 地址」收录远程仓库时，如果仓库根只有
`.claude-plugin/marketplace.json`、没有 `.claude-plugin/plugin.json`，会报
「this directory carries no plugin manifest」。

进一步确认后，范围包括两种仓库：

1. **根即插件、只有 marketplace.json**：`anthropics/skills` 有多个条目但全部
   `"source": "./"`，顶层有 `name`、`metadata.description`、`metadata.version`，没有
   `plugin.json`。
2. **完全没有清单、只有标准组件**：Claude Code 规范明确「manifest 可选，缺失时按标准目录
   自动发现组件；插件名取市场条目，`--plugin-dir` 时取目录名」。这类目录也应该能被收录。
   `obra/superpowers` 当前同时带 `.claude-plugin/plugin.json` 与 `.codex-plugin/plugin.json`，
   所以现在能收录；把这两个文件删掉后，它仍有 `skills/*/SKILL.md` 与
   `hooks/hooks.json`，对 Claude Code 依然合法，但 hub 会拒绝。

依据：Claude Code 插件规范（Context7 已核对）——`plugin.json` 可选；不存在时 marketplace
条目本身就是清单，没有条目时按标准目录布局发现组件。

反例（本次明确不做）：`claude-code-warp`、`anthropics/claude-plugins-official` 这类根是
市场、条目 `source` 指向 `./plugins/xxx` 的仓库。根不是插件，仍应被拒绝。

当前代码路径（已核对）：

1. 页面 `add()` → `POST /hub/plugins { action: "add" }` → `handlers.ts:249-251` →
   `collector.add(source)`。
2. `packages/resources/plugins/src/host/collect.ts:150` 的 `take()` 在 staging 目录上调用
   `readPackManifest(stage, fallbackName(spec))`。
3. `packages/resources/plugins/src/host/library.ts:171-188` 的 `readPackManifest()` 调用
   `readManifestFields(dir)`；当 `name === undefined && version === ""` 时抛错。
4. `packages/resources/plugins/src/host/describe.ts:54-72` 的 `readManifestFields()` 只遍历
   `PLUGIN_MANIFESTS`（`.claude-plugin/plugin.json`、`plugin.json`、
   `.codex-plugin/plugin.json`），找不到就返回 `{ carried: false, version: "", description: "" }`。
5. `fetchPlugin()`（`host/fetch.ts:128-154`）会把 checkout 的整棵树复制到 staging，所以
   `marketplace.json` 与 `skills/`、`hooks/` 本来就在 staging 里，只是没人读。

同一套判据还被这些路径共用：

- `library.has()` / `library.missing()` → `holdsPack()` → `readPackManifest()`。
- `library.add()` 的 `recordOf()`、`library.replace()`。
- `collector.restore()` → `collect()` → `take()`。
- `describePack()`（`describe.ts:96-110`）→ `handlers.ts` 的 `describe` action。
- 浏览器侧的本地文件夹扫描 `add-plugin-dialog.tsx:377-397` 的 `manifestOf()` 有自己的一份
  `PLUGIN_MANIFESTS` 遍历，命中就停止下探（`scanPacks`，行 475-496）。它也必须同步。

## 目标

1. 根目录只有 `.claude-plugin/marketplace.json`、且市场条目指向根的单插件仓库，能通过
   「地址」和「本地文件夹」两种入口被收录。
2. 完全没有清单、但含标准组件（`skills/*/SKILL.md`、`commands/*.md`、`agents/*.md`、
   `hooks/hooks.json`、`.mcp.json`）的目录，能用目录名收录，version/description 留空。
3. 根是多插件市场的仓库（条目 `source` 指向子目录）仍然被拒绝，不把整个仓库误收成一个包。
   即使这类根目录恰好带 `skills/` 等标准组件，也不能被第 2 条误收。
4. 所有经过 `readPackManifest()` 的路径（add、addFolder、has、missing、replace、restore、
   describe）自动获得同一行为，不各写一份判断。
5. 不改交付/marketplace 生成逻辑；不新增依赖；不新增 i18n 文案。

## 设计决策

### D1 在 `contract.ts` 增加共享判定

`packages/resources/plugins/src/contract.ts` 不 import 任何东西、两端共用，适合放这两个判定。

#### D1a 市场索引

```ts
export function marketplaceManifest(
  value: unknown
): { name?: string; version: string; description: string } | null
```

规则：

- `value` 不是非 null 对象，或 `plugins` 不是非空数组，或任一 entry 不是非 null、非数组对象
  → 返回 `null`。
- **根指向**：entry 的 `source` 为 `"."`、`"./"`、`""`、`null`/缺失时，认为它指向市场根。
  对象的 `source`（例如 `{ source: "github", ... }`）一律不算根指向。
- 只有**所有 entry 都根指向**时，市场根才可能是插件：
  - 只有一个 entry：用该 entry 的 `name`、`version`、`description`。
  - 多个 entry：用顶层 `name`、顶层 `version`（缺失/空串则回退 `metadata.version`）、顶层
    `description`（缺失/空串则回退 `metadata.description`）。
- 其余情况（任一条目指向子目录或远程）返回 `null`。
- 字段归一成字符串：缺失/非字符串为 `""`；`name` 为空串时省略（返回对象里没有 `name` 键）。
  `metadata` 不是非 null 对象时按空对象处理。
- 这里用 `||` 做 `version`/`description` 回退是**有意**的：空串按「没给」处理。

#### D1b 标准组件

```ts
export function hasStandardComponents(paths: readonly string[]): boolean
```

输入是相对目录根、以 `/` 分隔的文件路径。命中任一即算插件：

- `skills/<name>/SKILL.md`（恰好三段，目录名非空）
- `commands/<name>.md`（恰好两段）
- `agents/<name>.md`（恰好两段）
- `hooks/hooks.json`
- `.mcp.json`

调用方只传入**确实存在**的文件路径：宿主侧用定向 `readdir`/`stat` 收集，浏览器侧从已读出的
目录树收集，然后都交给这一个函数判定。规则只实现一次，宿主与浏览器只负责提供候选路径。

忽略大小写以外的变体：`.MD`、嵌套更深的 `skills/a/b/SKILL.md`、`skills/SKILL.md` 都不算。
宁可拒绝，不误收。

#### D1c 共享相对路径常量

```ts
export const PLUGIN_MARKETPLACE_MANIFEST = `${PLUGIN_MARKETPLACE_DIR}/${PLUGIN_MARKETPLACE_FILE}`
```

即 `.claude-plugin/marketplace.json`。不要改现有 `PLUGIN_MARKETPLACE_DIR` /
`PLUGIN_MARKETPLACE_FILE` / `PLUGIN_MARKETPLACE_NAME`。

### D2 市场判定优先于组件回退

`readManifestFields()` 的判定顺序固定为：

1. 三种 `plugin.json`，命中有 name 或非空 version 的清单就立即返回（现有行为）。
2. 根 `.claude-plugin/marketplace.json`，能命名根就返回；文件存在但
   `marketplaceManifest()` 返回 `null` 时，标记 `marketplace: true` 并**停止**，不再尝试
   标准组件。理由：多子目录市场的根不是插件，即使它恰好带 `skills/`。
3. 没有市场文件（或文件读不出来）时，检查标准组件；找到就返回
   `{ carried, components: true, version: "", description: "" }`。
4. 都没有 → 现有拒绝。

### D3 `ManifestFields` 扩展与错误文案

```ts
export interface ManifestFields {
  carried: boolean
  /** 根市场索引存在，但没有把根命名为一个插件。 */
  marketplace: boolean
  /** 目录含标准组件，但没有清单。 */
  components: boolean
  name?: string
  version: string
  description: string
}
```

`readPackManifest()` 的判据改为：

```ts
if (fields.name === undefined && fields.version === "") {
  if (fields.marketplace) {
    throw new Error("this directory is a marketplace of plugins, not one plugin")
  }
  if (fields.components) {
    return { name: fallbackName, version: "", description: "" }
  }
  throw new Error(
    fields.carried
      ? "the plugin manifest in this directory names no plugin (it needs a name or a version)"
      : "this directory carries no plugin manifest (.claude-plugin/plugin.json)"
  )
}
```

- `marketplace` 优先于 `components`，见 D2。
- 新增的多插件市场错误让第二种仓库的失败原因可读；它只出现在「市场存在但没有命名根」时。
- 其余错误文案保持原样。
- `describePack()` 对无清单目录仍返回空字段（它本来就不把缺清单当错误），行为不变。

### D4 浏览器扫描复用同一判据

`add-plugin-dialog.tsx` 的 `manifestOf()` 在三种 `plugin.json` 之后：

1. `fileAt(dir, PLUGIN_MARKETPLACE_MANIFEST)`：
   - 有文件且 `marketplaceManifest()` 命名了根 → 返回 `{ name?, version, description }`。
   - 有文件但没命名根 → `return null`（市场优先，不再看组件）。
2. 没有市场文件时，从目录树收集**确实存在**的候选路径，再交给
   `hasStandardComponents()`（不额外遍历整棵子树）：
   - `fileAt(dir, "hooks/hooks.json")` 存在则加入；
   - `fileAt(dir, ".mcp.json")` 存在则加入；
   - `skills` 的每个子目录，若 `fileAt(child, "SKILL.md")` 存在，加入
     `skills/<name>/SKILL.md`；
   - `commands`、`agents` 的直接子文件里的每个 `.md`，加入其相对路径。
3. 命中则返回 `{}`；`packIn()` 会因此用目录名作为 `name`，`description` 为空。
   候选列表只与该目录的直接子项有关，不会因为深度扫描变成 O(n²)。

`packIn()`、`scanPacks()`、`Candidate` 均不改。

效果：

- 根即插件的市场文件夹 → 识别为一个包，不再下探。
- 无清单但含标准组件的文件夹 → 识别为一个包，不再下探。
- 多子目录市场 → `manifestOf()` 返回 `null`，`scanPacks()` 继续下探，子目录里的
  `plugin.json` 仍能被找到。

**既有差异，不在本次修**：`manifestOf()` 的 `plugin.json` 循环用的是
`named || typeof manifest.version === "string"`，`version: ""` 在浏览器侧会被当成清单，
而 host 的 `readManifestFields()` 会跳过空 version 继续找。这个差异在本次之前就存在，且不
属于本次回退；本次只保证新的市场/组件回退与 host 使用相同判据。

### D5 测试判据

纯函数与宿主行为都要测。宿主测试放在 `library.test.ts` 现有
`describe("a pack with no manifest")` 之后，使用独立的临时 hub，避免影响该文件里按顺序
共享 `library` 的既有断言。

## 受影响文件

| 文件 | 改动 | 受影响的调用方/路径 |
| --- | --- | --- |
| `packages/resources/plugins/src/contract.ts` | 新增 `PLUGIN_MARKETPLACE_MANIFEST`、`marketplaceManifest()`、`hasStandardComponents()` | 宿主与浏览器共用 |
| `packages/resources/plugins/src/host/describe.ts` | `ManifestFields` 扩展；`readManifestFields()` 增加市场与组件回退 | `readPackManifest()`、`describePack()` |
| `packages/resources/plugins/src/host/library.ts` | `readPackManifest()` 接受 `components` 回退，并给市场根单独错误 | add / has / missing / replace / restore |
| `packages/resources/plugins/src/add-plugin-dialog.tsx` | `manifestOf()` 增加市场与组件回退 | 本地文件夹扫描 |
| `packages/resources/plugins/__test__/library.test.ts` | 新增纯函数与宿主用例 | 唯一的自动化判据 |

不改：`host/collect.ts`、`host/fetch.ts`、`host/marketplace.ts`、`handlers.ts`、
`src/library.ts`、`src/index.ts`、i18n 文案。

## 阶段一：共享判定函数与常量

**执行目标**：`contract.ts` 能独立回答「这个市场是不是把根当成插件」和「这个目录有没有标准
组件」，两端都能引用。

**改动文件**：`packages/resources/plugins/src/contract.ts`、
`packages/resources/plugins/__test__/library.test.ts`。

**具体改动**：

1. 在现有 marketplace 常量旁增加 `PLUGIN_MARKETPLACE_MANIFEST`。
2. 按 D1a 增加 `marketplaceManifest()`，按 D1b 增加 `hasStandardComponents()`；不 import
   任何包，保持 `contract.ts` 的两端可用性。
3. 在 `library.test.ts` 增加 `describe("reading a marketplace index")` 与
   `describe("recognising standard components")`，覆盖：
   - 市场：非对象 / `plugins` 空数组 / `plugins` 含非对象 → `null`；
   - 单条根指向 → 用条目字段；
   - 多条全部根指向（`"."`、`"./"`、`""`、`null`、缺失混合）→ 顶层 `name` +
     `metadata.version` / `metadata.description`；
   - 任一条目指向子目录 → `null`；单条目指向子目录 → `null`；
   - 字段类型不对（数字/布尔）→ 归一成 `""`，`name` 缺失时对象里没有 `name` 键；
   - 组件：`skills/hello/SKILL.md`、`commands/greet.md`、`agents/reviewer.md`、
     `hooks/hooks.json`、`.mcp.json` 各自为真；
   - 近似反例：`skills/SKILL.md`、`skills/a/b/SKILL.md`、`commands/sub/x.md`、
     `agents/x.txt`、`docs/hooks/hooks.json`、`skills/hello/SKILL.MD` 为假。

**验收判据**：

- `pnpm --filter @context-hub/plugins typecheck` 通过。
- `pnpm --filter @context-hub/plugins test` 通过（新增纯函数用例全绿，既有用例不变）。

## 阶段二：宿主清单读取回退

**执行目标**：`collector.add()`（以及走同一条 `take()` 的 `addFolder()`）能收录只有根
`marketplace.json` 的目录，以及无清单但含标准组件的目录；`has()`、`missing()`、
`replace()`、`restore()`、`describePack()` 自动跟随。

**改动文件**：`packages/resources/plugins/src/host/describe.ts`、
`packages/resources/plugins/src/host/library.ts`、
`packages/resources/plugins/__test__/library.test.ts`。

**具体改动**：

1. `describe.ts` 的 import 增加 `PLUGIN_MARKETPLACE_MANIFEST`、`marketplaceManifest`。
2. `ManifestFields` 按 D3 增加 `marketplace` 与 `components`；`NOTHING` 同步补
   `marketplace: false, components: false`。
3. 在 `readManifestFields()` 的 `PLUGIN_MANIFESTS` 循环之后：
   - 读 `.claude-plugin/marketplace.json`；能命名根就返回；
   - 文件存在但没命名根 → 返回 `{ ...NOTHING, carried, marketplace: true }`；
   - 否则调用宿主侧 `hasComponents(dir)`，有组件则返回
     `{ ...NOTHING, carried, components: true }`。
4. 新增宿主侧 `hasComponents(dir)`（约 30 行，不遍历整棵仓库）：用定向 `readdir`/`stat`
   收集**确实存在**的候选路径（`.mcp.json`、`hooks/hooks.json`、每个
   `skills/<name>/SKILL.md`、`commands/*.md`、`agents/*.md`），最后交给
   `hasStandardComponents()` 判定。规则只在 contract.ts 实现一次。
5. `library.ts` 的 `readPackManifest()` 按 D3 改为三段判据；`marketplace` 优先于
   `components`。`has()` / `missing()` / `recordOf()` / `replace()` 不改，自动跟随。
6. 既有测试「fetches a folder that lost its manifest again too」必须同步改语义：
   - 现在只删 `.claude-plugin` 时，目录仍有 `skills/` 与 `commands/`，按新规则它**仍是包**；
   - 原用例改为先删 `.claude-plugin`，再删 `skills/` 与 `commands/`，让目录不再含任何标准
     组件，然后断言 `has()` 为 false、`add()` 重新抓取并恢复清单；
   - 另加一条断言：只删 `.claude-plugin`（保留组件）时 `has()` 仍为 true，钉住新语义。
7. 在 `library.test.ts` 的 `writePack()` 旁增加辅助函数：

```ts
async function writeMarketplace(dir: string, manifest: unknown): Promise<void> {
  await fs.mkdir(path.join(dir, ".claude-plugin"), { recursive: true })
  await fs.writeFile(
    path.join(dir, ".claude-plugin", "marketplace.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  )
}
```

8. 在 `describe("a pack with no manifest")` 之后增加
   `describe("a pack whose manifest is a marketplace entry")` 与
   `describe("a pack with no manifest but standard components")`，使用独立的
   `createFsPluginLibrary(path.join(root, "market-hub"))` 与 collector。覆盖：

   a. **单条目根市场（superpowers 形状）**：目录 `single` 只有
      `.claude-plugin/marketplace.json`，内容为一条
      `{ name: "superpowers", version: "7.0.0", description: "Core skills.", source: "./" }`。
      `add` 成功；`record.name/version/description` 来自条目；`library.has("superpowers")`
      为 true；`missing()` 不含它；库副本里确实有 `.claude-plugin/marketplace.json`。
   b. **replace 路径**：另建 staging，写入同样的根 `marketplace.json`，再加一个
      `skills/hello/SKILL.md`；调用 `library.replace(...)`。返回记录的 name/version/description
      来自市场；新文件出现在 `<hub>/plugins/superpowers/skills/hello/SKILL.md`。不要用
      `collector.add(同一个本地路径)` 测更新：同一地址且 `has()` 为 true 时会直接答
      `already: true`。
   c. **多条目全部根指向（anthropics/skills 形状）**：顶层 `name: "anthropics-skills"`、
      `metadata: { version: "1.2.3", description: "Skills from Anthropic." }`，两条 entry
      均 `source: "./"`。`add` 成功；name 取顶层，version/description 取 metadata。
   d. **多条目指向子目录**：entry 为 `source: "./plugins/warp"` 等，根无 `plugin.json`。
      `add` rejects `/marketplace of plugins/`；库中没有该名字的记录。
   e. **单条目指向子目录**：`plugins: [{ name: "warp", source: "./plugins/warp" }]`，
      同样 rejects `/marketplace of plugins/`。这是 D2 的判据。
   f. **根 `plugin.json` 存在但不命名 + 合法市场**：目录同时有不命名的 `plugin.json`
      与单条目根市场。`add` 成功，name/version 来自 marketplace 条目。
   g. **无清单 + `skills/hello/SKILL.md`**：`add` 成功；`record.name` 为目录名；
      version/description 为空；`has()` 为 true；`missing()` 不含它。
   h. **无清单 + 只有 `commands/greet.md`**：`add` 成功，证明不只认 skills。
   i. **无清单 + 只有 README**：仍 rejects `/no plugin manifest/`，库中无记录。
   j. **多子目录市场 + 根有 `skills/hello/SKILL.md`**：仍 rejects
      `/marketplace of plugins/`，证明市场判定优先于组件回退。
   k. **无清单 + `hooks/hooks.json`**（可选）：`add` 成功。

9. 不在 `collect.ts`、`has()`、`missing()`、`replace()` 里加分支；它们通过共享 reader
   生效。`restore()` 不单独加用例：它走 `collect()` → `take()` → 同一个
   `readPackManifest()`。

**验收判据**：

- `pnpm --filter @context-hub/plugins typecheck` 通过。
- `pnpm --filter @context-hub/plugins test` 通过，新增用例全绿。
- 既有 `describe("a pack with no manifest")` 的用例仍绿：无名无组件的目录仍报
  `/no plugin manifest/`，不命名的根 `plugin.json` 仍报 `/names no plugin/`，命名了的根
  `plugin.json` 仍可用。
- 既有「写入不生成 marketplace 索引」用例不变；「丢失清单的包会被重新抓取」用例按第 6 条
  更新为「丢失清单但仍含标准组件时仍算在库；连组件也丢失时才重新抓取」。

## 阶段三：浏览器文件夹扫描回退

**执行目标**：本地选择/拖入一个「根即插件、只有 marketplace.json」或「无清单但含标准组件」
的文件夹时，扫描能把它识别为一个候选包；多子目录市场仍然继续下探。

**改动文件**：`packages/resources/plugins/src/add-plugin-dialog.tsx`。

**具体改动**：

1. import 增加 `PLUGIN_MARKETPLACE_MANIFEST`、`marketplaceManifest`（与
   `PLUGIN_MANIFESTS` 同一行来源 `./contract.ts`）。
2. 在 `manifestOf()` 的 `PLUGIN_MANIFESTS` 循环之后：
   - `fileAt(dir, PLUGIN_MARKETPLACE_MANIFEST)` 取市场文件；
   - 有文件：读文本、`JSON.parse`、`marketplaceManifest()`；能命名根就返回归一化对象；
     解析失败或没命名根都 `return null`（市场优先，不再看组件）；
   - 没有文件：按 D4 的目录树检查标准组件；命中返回 `{}`，否则 `return null`。
3. 更新 `manifestOf()` 的 JSDoc：说明它现在认三种 `plugin.json`、根市场命名、以及无清单
   标准组件布局。
4. `packIn()`、`scanPacks()`、`Candidate` 均不改。

**验收判据**：

- `pnpm --filter @context-hub/plugins typecheck` 通过。
- `pnpm --filter @context-hub/plugins lint` 通过。
- `pnpm --filter @context-hub/plugins test` 通过（此阶段不新增测试；规则已由阶段一覆盖，
  宿主行为由阶段二覆盖）。
- `rg -n "marketplaceManifest|hasStandardComponents|PLUGIN_MARKETPLACE_MANIFEST" packages/resources/plugins/src`
  命中 `contract.ts` 的定义，以及 `describe.ts` / `add-plugin-dialog.tsx` 的引用；
  两处回退都先判市场、再判组件。

## 阶段四：验证、真机检查与收尾

**执行目标**：包级检查全绿；可选地用真实仓库确认；收尾不留下临时文件。

**改动文件**：无（只运行命令与清理）。

**必跑命令**：

```bash
pnpm --filter @context-hub/plugins typecheck
pnpm --filter @context-hub/plugins test
pnpm --filter @context-hub/plugins lint
```

**可选真实验证**（网络、临时目录；不做也不阻塞）：

1. 浅克隆一个目标仓库到临时目录：

```bash
WORK=$(mktemp -d)
git clone --depth 1 https://github.com/anthropics/skills "$WORK/skills"
```

   网络受限时用 `dangerouslyDisableSandbox: true`；`docs/memory.md` 已记录本仓 Bash 沙箱
   丢包的表现。不要为此跑 `pnpm install`。Windows 上 `mktemp -d` 返回的是 Git Bash 路径，
   传给 Node 前用 `cygpath -w "$WORK/skills"` 转成 Windows 路径。

2. 临时写一个 `packages/resources/plugins/__test__/marketplace-real.test.ts`：
   - `mkdtemp` 一个临时 hub home；
   - `createFsPluginLibrary(home)` + `createPluginCollector(library).add(process.env.PLUGIN_FIXTURE!)`；
   - 断言 `record.name` 非空、`library.has(record.name)` 为 true；
   - `finally` 里删除临时 hub home。

3. 运行并清理：

```bash
PLUGIN_FIXTURE="$FIXTURE" pnpm --filter @context-hub/plugins exec vitest run __test__/marketplace-real.test.ts
rm -f packages/resources/plugins/__test__/marketplace-real.test.ts
rm -rf "$WORK"
git status --short
```

   `git status --short` 里不应出现临时测试文件或临时目录。

4. 若临时仓库当前已经带 `plugin.json`，这次真机检查就没有走到回退分支；以阶段二的夹具为
   判据，在报告里说明即可，不要为了触发回退去改上游仓库。

**可选 UI 验证**：

- 只有需要看「地址」或「本地文件夹」的完整交互时才做。起隔离 home 的 dev server：
  `CONTEXT_HUB_HOME=$(mktemp -d) pnpm dev`。端口来自 `apps/web/hub-port.ts`（5270 hub、
  5271 app）；端口被占就让 `strictPort` 报错并换一台隔离副本，**不要杀不认识的进程**。
  Windows 下若 Node 收到的 home 不是 Windows 路径，同样先用 `cygpath -w` 转换。
- 只做「添加插件 → 地址 / 本地」这一个动作（它只写隔离 hub）。
- 不点行上的 place 菜单、安装到 Agent、启用/禁用等会写真实 `~/.claude` 或工作区
  `.claude` 的动作。
- 收尾只停自己启动的那一个进程，不按默认端口猜、不用 `taskkill //IM`。
- 本项不是阻塞判据；浏览器扫描与宿主共用同一套规则，主要验证靠宿主测试。

**收尾**：

- 确认 `git status --short` 只有计划内的五个实现文件（`contract.ts`、`describe.ts`、
  `library.ts`、`add-plugin-dialog.tsx`、`library.test.ts`）与本计划文件。
- 受管对象达到最终稳定状态后，按 `AGENTS.md` 调一次 `aoci_maintain`；有候选时再按当前
  批次提交 `aoci_update_entry`。不要在中间修改过程中反复维护。
- 用户明确确认计划完成后，才把本文件移到 `docs/plans/archive/`。

## 不做

- 不把多插件市场的条目列成多个包、不生成多个 hub 记录、不下载后让用户选。
- 不识别 GitHub tree URL、`/tree/<ref>/<path>` 或「地址指向市场里的某个条目」。
- 不为市场条目里的子目录做稀疏检出；单条目子目录市场也拒绝（见 D2）。
- 不读 Codex 的 `.agents/plugins/marketplace.json`；本次只补 Claude Code 的根市场。
- 不识别 `.cursor-plugin/plugin.json` 等其他客户端清单；本次只认 Claude Code 的三种
  `plugin.json`、根市场、以及标准组件布局。
- 不改 `host/marketplace.ts` 的生成/交付逻辑，不改 `PLUGIN_MARKETPLACE_NAME`。
- 不改 `PLUGIN_MANIFESTS` 的顺序，不新增 `plugin.json` 的查找位置。
- 不改 `manifestOf()` 现有 `plugin.json` 循环的判据（空字符串 version 的浏览器/host 差异
  是既有行为，见 D4）。
- 不改其余错误文案，不新增 i18n 键。
- 不改 `has()`/`missing()`/`replace()`/`restore()` 的实现；它们通过共享 reader 生效。
- 不新增依赖，不做无关格式化，不顺手重构 `readManifestFile()` 或 `manifestOf()`。
- 不自动把收录的包装到任何 Agent；收录与交付仍是两个动作。

## 风险与未覆盖项

1. **浏览器扫描的集成没有单测**：`manifestOf()`/`scanPacks()` 是模块私有函数，
   `add-plugin-dialog.tsx` 也没有测试。规则由阶段一覆盖，宿主读取由阶段二覆盖；浏览器侧
   的树检查只靠类型检查与可选的 UI 检查。若后续要补，最小改法是导出 `scanPacks` 并为它
   写一个不碰 DOM 的测试；本次不扩大导出面。
2. **标准组件是启发式**：一个恰好在根目录带 `commands/*.md` 或 `skills/*/SKILL.md` 的非插件
   仓库会被认成插件。这是「清单可选」的直接后果；组件路径限定得足够精确，且市场判定优先，
   但仍可能误收。宁可让用户手动删掉错误收录，也不把合法插件挡在外面。
3. **共享根的多个条目会被并成一个包**：像 `anthropics/skills` 这样的仓库，多个条目都用
   `source: "./"`，区别只在各自声明的 `skills` 子集。本次不建模子集，收录的是整个仓库根，
   交付后 Claude Code 会按默认目录扫描，得到根下所有组件；记录名取市场顶层 `name`。
4. **上游形状会变**：夹具按已确认的 `superpowers` / `anthropics/skills` 形状写。多条目市场
   若顶层既没有 `name` 也没有 `metadata.version`，`readPackManifest()` 仍会拒绝；这是现有的
   「必须有 name 或 version」规则，不在本次放宽。
5. **单条目子目录市场被拒绝**：这是 D2 的收紧。如果以后要「单条目市场一律接受」，需要改
   D1/D2 与对应测试；否则会收录整个仓库根而不是 `./plugins/x`。
6. **`describePack()` 的行为扩展**：Agent 已安装目录里若恰好有 `.claude-plugin/marketplace.json`
   且它把根命名成插件，描述会改从该文件读；若只有标准组件，仍返回空字段。概率低，本次不做。
7. **`source` 只认精确字符串**：`"."`、`"./"`、`""`、`null`、缺失之外（例如 `".//"`、
   `"././"`）都算子目录/非根。宁可拒绝，不误收。
8. **真机检查依赖网络和上游状态**：可选步骤；不跑时必须在报告中说明「只有夹具与单测覆盖」。
9. **无清单收录的记录没有版本号**：更新检查（`checkable`）对本地来源本来就不问；远程来源
   仍按 revision 检查，文件哈希仍可判断是否被改过。记录本身版本为空不影响更新。
10. **「丢清单」的语义变了**：库里的包如果只丢了 `.claude-plugin`、但仍含标准组件，
    `has()` 会继续报 true，不触发重新抓取。这是「组件也是身份」的直接结果；交付仍可用
    （hub 生成的 marketplace 条目充当清单）。若以后要恢复「丢清单就重抓」，需要给
    `holdsPack()` 单独关掉组件回退，但那会让「是不是包」出现两套判据，不建议。
