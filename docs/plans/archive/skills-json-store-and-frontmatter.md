# 技能库：skills.json 单一真相与 frontmatter 换 js-yaml

## 背景

技能库（`packages/resources/skills`）现在有两个存储问题，用户已明确要求一起改：

1. **目录文件叫 `index.json`、形状是 `{ version, revision, skills: Record<dirName, row> }`。**
   用户要的是 `<hub home>/skills/skills.json`，顶层直接是数组，每行以 `name` 为身份，
   **没有 `id` 字段**（`name` 同时是行身份和技能目录名 `skills/<name>/SKILL.md`）。
   用户已在真实机器上手写了一份格式样本 `~/.context-hub/skills/skills.json`（目前只有
   anatomy 一条），形状就是目标形状。
   注意：真实库里 `index.json` 与这份 `skills.json` **同时存在**——迁移必须处理这个状态，
   不能假设「skills.json 不存在」。

2. **`frontmatter.ts` 用逐行正则读 `key: value`，块标量整段丢失。**
   真实数据已经坏了两条（`~/.context-hub/skills/index.json`）：
   - `browser-automation`：SKILL.md 写的是 `description: |` + 缩进块，
     目录里记成了 `"description": "|"`；
   - `find-docs`：SKILL.md 写的是 `description: >-` 且没有内容行，
     目录里记成了 `"description": ">-"`。

第三项需求是语义层面的：**skills.json 成为 description / tags 的唯一真相**。
界面里改元数据只写 JSON、不回写 SKILL.md；扫描/重启不再用 SKILL.md 覆盖已有行；
只有 JSON 里还不存在的目录（手拷进来、CLI 装进来、下载/导入）才从 SKILL.md 取初值。
新建/导入/下载落地时 SKILL.md 仍照旧带 `name` / `description` / `tags` frontmatter。

## 已核实的事实（基于当前代码与真实数据）

- `packages/resources/skills/src/host/skills-fs.ts`
  - `CATALOG_FILE = "index.json"`（`:78`），`CatalogEntry`（`:85-107`），`CatalogFile`
    （`:109-113`，含 `version`/`revision`）。
  - `toId()`（`:143-149`）把显示名 slug 成目录名；`create()`（`:555-588`）用它，
    撞名时自动加 `-1/-2` 后缀。
  - `readEntry()`（`:255-294`）：manifest mtime 未变且 link 未变时直接复用旧行
    （`:266-268`），否则重新解析 frontmatter 并覆盖 `name/description/tags`，
    `enabled/source/link/assets/upstream/checked` 从旧行继承。
  - `rebuild()`（`:306-332`）是唯一扫描；`saveCatalog()`（`:335-339`）递增 `revision`；
    `loadCatalog()`（`:344-351`）首次使用必扫描（**从不直接读文件**，`rebuild` 用
    `readJson(catalogPath)` 取 previous）；`mutate()`（`:353-360`）。
  - `update()`（`:590-618`）在 patch 含 description/tags 时读 SKILL.md、
    `writeSkillFile()` 回写、重新 stat mtime。
  - `notify()`（`:897-915`）跳过 `CATALOG_FILE` 与临时文件。
  - 排序 tie-break（`:535-541`）用 `|| a.id.localeCompare(b.id)`——`||` 是有意的，
    差值 0 时要落给下一个判据（`docs/memory.md` 有专门一条）。
- `revision` 的消费方：**UI 没有消费**。`library.ts`、`library-store.ts`、`page.tsx`
  都不读 `SkillPage.revision`；只有 `store.test.ts:111-117` 的断言和
  `library-store.test.ts:47` 的 fixture 出现。因此可以整体删除。
- `frontmatter.ts` 三个导出：`parseSkillFile`（`folder-scan.ts`、`host/place-skills.ts`、
  `host/skills-fs.ts`、`library.ts`、`skill-detail-dialog.tsx` 使用）、`writeSkillFile`
  （只有 `skills-fs.ts:600` 的 `update()` 与 `starterSkillFile` 使用）、
  `starterSkillFile`（只有 `create()` 使用）。`update()` 停止回写后 `writeSkillFile`
  成为死代码 → 删除。
- `host/place-skills.ts`：`readPlaceSkills()`（`:86-130`）里 `name: frontmatter.name ?? dirent.name`
  （`:122`），`readPlaceSkill()`（`:141-157`）里 `name: frontmatter.name ?? id`（`:152`）；
  `id` 都是目录名。
- `host/names.ts` 的 `assertSkillName`（`:9-21`）：只拒绝空、`.`、`..`、点开头、`/`、`\`；
  允许空格和大写，不拒绝 Windows 保留设备名。
- `store.ts` 的公开契约：`SkillSummary.id`（`:54`）、`PlaceSkill.id`（`:238`）、
  `PlaceSkillDetail.id`（`:269`）、`SkillPage.revision`（`:142-143`）。
- HTTP 两端：`handlers.ts`（包根）用 `?id=` / body `id` 命名技能（`:164,169,179,212,240,
  279,284,290,299-301,308-310,317-319,327,333,338,343`），路径段
  `/hub/skills/<id>`（`:120-121`）；`src/remote-store.ts` 逐项对应。
  `tools.ts` 在 skills 包里**不存在**（只有 mcp/plugins 有），不涉及。
- UI 里 `skill.id` / `detail.id` / `item.id`（技能身份）分布：
  `library.ts`（`:304,353,374,526,555,558`）、`page.tsx`（`:1151,1188,1191,1201,1223,
  1236,1245,1249,1256,1602,1603`）、`skill-detail-dialog.tsx`（`:177,212,226,957,958,
  1042,1142,1157,1169,1178,1189`）、`search-dialog.tsx`（`:106,383`）、
  `add-skill-dialog.tsx`（`:219`）。其余 `.id` 是 `place.id` / `hold.id` / `MediaItem.id` /
  `provider.id`，**不动**。
- 真实库目录名全部是 kebab-case：`anatomy`、`browser-automation`、`find-docs` 等 12 项，
  其中 `context7-mcp`、`dsh-pre-push-checks` 是软链（对应行里的 `link` 字段）。
- `js-yaml` 4.3.2 已在 `pnpm-lock.yaml`（cosmiconfig 的传递依赖），但**不是任何包的直接依赖**；
  它不自带类型声明，需要 `@types/js-yaml`。实测（从 `.pnpm` 里直接 require）：
  - `load` 对 `description: |` 样本返回带内部换行与末尾换行的字符串；
  - `dump(obj, { lineWidth: -1 })` 对多行字符串自动用 `|-` 块、对含 `:`/`#` 的值自动加引号；
  - `load('')` 返回 `undefined`，`load('just a string')` 返回字符串，坏 YAML 抛 `YAMLException`。
- 测试：`__test__/` 下有 `store.test.ts`、`place-skills.test.ts`、`bridge.test.ts`、
  `updates.test.ts`、`library-store.test.ts`、`package.test.ts`、`registry.test.ts`、
  `upstream.test.ts`；**没有** frontmatter 专属测试文件。
- `updates.test.ts:168` 直接写 `index.json`；`store.test.ts:56,212`、`:3` 的注释同样提到它。
- 验证命令（来自各 package.json）：`pnpm --filter @context-hub/skills test|typecheck|lint`；
  `pnpm --filter web build`（`tsc -b && vite build`，验证 js-yaml 进浏览器包）；
  根 `pnpm test`（vitest 全项目）。`updates.test.ts` 需要 `git` 在 PATH 上。

## 目标格式

### `<hub home>/skills/skills.json`

顶层数组，按 `name` 升序（文件 diff 稳定）；每行：

```json
{
  "name": "browser-automation",
  "description": "Vision-driven browser automation using Midscene. ...",
  "tags": [],
  "enabled": true,
  "source": "registry",
  "assets": ["https://...", "assets/browser-automation-image-18a77668.png"],
  "mtimeMs": 1792162203265.695,
  "updatedAt": "2026-10-16T14:50:03.266Z",
  "upstream": { "source": "...", "sourceType": "github", "skillPath": "...", "hash": "..." },
  "checked": { "at": "...", "latest": "...", "currentHash": "..." }
}
```

- 去掉 `version`、`revision`、`skills` 包裹层和每行的 `id`。
- **`link` 不写进文件**：它是「库根里这条是软链、指向哪里」的文件系统事实，每次 `rebuild()`
  用 `lstat`/`readlink` 现读，只存在于内存行里。文件因此与用户给的样本完全一致。
- `upstream` / `checked` 可选；`assets` 恒为数组。
- 每行字段按固定键序写出（见「关键决策 11」）。
- **`index.json` 不是纯派生缓存**：`enabled/source/link/assets/upstream/checked` 不在
  SKILL.md 里，迁移必须逐字段保留。

### SKILL.md frontmatter

- 仍由 hub 在**新建**时写出 `name` / `description` / `tags`（技能规范要求），之后永不回写。
  导入/下载落地不改：CLI 与文件夹里的 SKILL.md 原样写盘，frontmatter 由源文件携带。
- 解析改用 js-yaml（`CORE_SCHEMA`）：`name`/`description` 取字符串（`description` 两端
  `trim`，内部换行与空行保留），`tags` 只接受字符串数组。
- 解析失败/结果不是对象/字段类型不对 → 该字段缺失，**整行仍然出现**
  （新目录拿到空 description/tags，已有行不受影响）。

## 关键决策

1. **扫描时的行合并规则**：目录已存在于 skills.json → 整行保留
   `description/tags/enabled/source/link/assets/upstream/checked`，只刷新
   `mtimeMs` 与 `link`；`mtimeMs` 变了且不是软链行时 `updatedAt` 前移到新的 mtime。
   目录不存在于 JSON → 一次性读 SKILL.md 取初值（`name` = 目录名，`description`/`tags`
   来自 frontmatter，`enabled: true`，`source: "local"`，`assets: []`）。
   manifest 不存在 → 该行被丢弃（与今天一致）。
2. **`mtimeMs` 保留但降级为「最近一次扫描观察到的 manifest mtime」**，不再当缓存键；
   `readEntry()` 里「mtime 没变就跳过重解析」的分支删除（已有行根本不重解析）。
   `updatedAt` 仍是「hub 记录的最后一次变化」：hub 自己的写入（update / writeFile /
   资产 / create / 导入 / 上游更新）照旧写 now；扫描只在前一条规则下前移；软链行恒为 `""`。
3. **`update()` 只写 skills.json**：不读、不写 SKILL.md，不重算 mtimeMs。
4. **迁移在 `createFsSkillStore()` 里、watcher 建立之前执行一次**：
   - `index.json` 不存在 → 什么都不做；
   - `index.json` 存在但不可解析/顶层不是 `{ skills: object }` → 跳过迁移，**不删文件**；
   - `index.json` 存在且可解析 → 与现有 `skills.json`（可能是用户手写样本）**按 name 合并**：
     已存在的行胜出；缺的行从 `index.json` 来，`description`/`tags` 用**新解析器重读当前
     SKILL.md** 取初值（这同时修复 browser-automation / find-docs 两条坏数据），
     重读失败才回退旧值；`enabled/source/link/assets/upstream/checked/mtimeMs/updatedAt`
     全部原样保留；
   - 用与 `saveCatalog` 相同的序列化写成功后，**才删 `index.json`**。
     论证：合并是幂等的（再跑一次时 skills.json 已含全部 name），写失败则旧文件原样保留、
     下次启动重试；先写后删没有丢字段的窗口。若反过来先删，写失败就永久丢了
     `upstream/checked/assets` 这些 SKILL.md 里没有的字段。
5. **`revision` / `version` 整体删除**（UI 无消费，只有一处测试断言）。
6. **`name` 即目录名**（采用用户的倾向）：
   - 库侧：`readEntry` 新行、迁移行、`create()` 都令 `name` = 目录名；frontmatter 的
     `name` 不再进入 catalog（仍会被解析出来，但 catalog 不用它）。
   - place 侧：`PlaceSkill.name` / `PlaceSkillDetail.name` = 目录名。
   - 代价（用户已知并接受）：卡片标题显示目录名而不是 frontmatter 里的漂亮名字
     （例如目录 `hand-made`、frontmatter `Hand Made` → 显示 `hand-made`）；
     `place-skills.test.ts:105,170,445` 现在断言的正是旧行为，需要改。
7. **`create()` 的名字策略**：删除 `toId()`，`draft.name` **原样**作为目录名，只加路径安全
   约束（`assertNewSkillName()`，放在 `host/names.ts`）：非空、不含 `/` `\`、不是 `.`/`..`/
   点开头、不是 Windows 保留设备名、不以空格或点结尾。**不新增 kebab 正则**——用户没有
   要求限制名字形态，现有 place 目录里也有非 kebab 的名字。撞名**直接拒绝**
   （`a skill with this name is already in the library: <name>`），不再静默加 `-1` 后缀：
   name 已经是身份，改名就等于换目录。`create()` 目前没有 UI 调用方（界面只走
   `importFolder` / `installPackage`），无界面回归。
   `assertSkillName`（place 流程与导入用）**只补** Windows 保留设备名（大小写不敏感），
   其余不收紧——否则 place 里已有的非 kebab 目录名会突然读不了。
8. **HTTP 契约字段 `id` → `name`**：query/body 里的技能身份参数改名，路径段
   `/hub/skills/<name>` 不变（位置参数，无所谓名字）。两端同包，`bridge.test.ts`
   走真实 socket，改名是机械且可验证的。
9. **starter SKILL.md 用 `yaml.dump({ name, description, tags }, { lineWidth: -1 })`**
   渲染 frontmatter，不再手拼 `key: value`。手拼在 description 含 `: `、`#`、换行时会写出
   坏 YAML；`dump` 自动加引号/用 `|-` 块。测试断言 round-trip（`parseSkillFile(starter)` 的
   frontmatter 与输入 deep-equal），不断言具体排版。
10. **解析用 `CORE_SCHEMA`**（`load(block, { schema: CORE_SCHEMA })`）：frontmatter 的
    name/description 是普通字符串，默认 schema 会把 `description: 2026-01-01` 解析成 Date，
    被类型守卫丢掉；CORE schema 不做时间戳/二进制类型推断。
11. **序列化用固定键序**：每行按 `name, description, tags, enabled, source, assets,
    mtimeMs, updatedAt, upstream?, checked?` 写出，行按 `name` 升序。迁移行与新行、不同
    代码路径构造的行字段插入顺序不同；固定键序让文件 diff 只反映值的变化（用户会直接审阅
    这个文件）。`link` 是内存字段，不参与序列化。

## 阶段一：用 js-yaml 重写 frontmatter 解析

**目标**：`parseSkillFile` 能正确读块标量；`starterSkillFile` 不再手拼 YAML；
`writeSkillFile` 暂时保留（`update()` 还在用，阶段二删除）。

**改动文件**

- `packages/resources/skills/package.json`（加依赖）
- `packages/resources/skills/src/frontmatter.ts`
- 新增 `packages/resources/skills/__test__/frontmatter.test.ts`

**具体做什么**

1. 加直接依赖（Bash 沙箱无外网，必须 `dangerouslyDisableSandbox: true`）：
   ```bash
   pnpm --filter @context-hub/skills add js-yaml
   pnpm --filter @context-hub/skills add -D @types/js-yaml
   pnpm install
   ```
   lockfile 里已有 `js-yaml@4.3.2`（传递依赖），实际写入 `package.json` 的版本范围
   以 `pnpm add` 的结果为准（待验证：加完读 `package.json` 与 `pnpm-lock.yaml`）。
2. `frontmatter.ts`：
   - 保留 `split()` 的 BOM/CRLF 归一化与「以 `---\n` 开头、找第一个 `\n---`」的切分逻辑
     （行为已由现有测试间接覆盖，不重写）。
   - `parseSkillFile`：用 `load(block, { schema: CORE_SCHEMA })` 解析 frontmatter 块；
     `try/catch` 吞掉 `YAMLException`；仅当结果是普通对象时读取字段：
     `name`/`description` 取 string（`description` `.trim()`），`tags` 取 `Array.isArray`
     后过滤 string。任何失败都返回 `{ frontmatter: {}, body }`。
   - `starterSkillFile`：用 `dump(..., { lineWidth: -1 })`（`trimEnd()` 后拼进
     `---\n…\n---\n`）。
   - `writeSkillFile` 原样保留（本阶段不动 `update()`）。
   - 文件头注释改写：说明用 js-yaml 的理由（块标量与引号/注释是 YAML 语义，
     逐行正则读不了）和降级规则。
3. 新测试 `frontmatter.test.ts`：
   - 直接用用户给的真实样本（`description: |` + 缩进段落 + `- Browse, …` 列表行），
     断言解析出的 description 含内部换行、含列表行、无前导/尾随空白；
   - `description: >-` 且无内容行（find-docs 真实形态）→ `""`；
   - `tags: [a, b]` 与块列表 `tags:\n  - a` 都解析成 `["a","b"]`；
   - 含 `: `、`#`、引号、中文的 description round-trip；
   - `description: 2026-01-01` 解析成字符串而不是 Date；
   - 坏 YAML（如 `description: [unclosed`）→ frontmatter 为空对象、body 仍正确、
     **不抛错**；
   - 顶层是标量（`just a string`）→ 空 frontmatter；
   - starter：`parseSkillFile(starterSkillFile(draft)).frontmatter` 与 draft deep-equal，
     且 draft.description 含换行/冒号/`#` 时也一样。

**验收**

```bash
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills lint
```

阶段结束时 `store.test.ts` / `updates.test.ts` 等旧测试全绿——本阶段不改 catalog。

## 阶段二：落地 skills.json 与旧文件迁移

**目标**：库文件改名为 `skills.json` 且为数组形状；skills.json 成为 description/tags
唯一真相；旧 `index.json` 合并迁移；`update()` 不再写 SKILL.md；删除 `revision`。

**改动文件**

- `packages/resources/skills/src/host/skills-fs.ts`
- `packages/resources/skills/src/frontmatter.ts`（删 `writeSkillFile`）
- `packages/resources/skills/src/store.ts`（删 `SkillPage.revision`；注释更新）
- `packages/resources/skills/__test__/store.test.ts`
- `packages/resources/skills/__test__/updates.test.ts`
- `packages/resources/skills/__test__/library-store.test.ts`（删 fixture 的 `revision`）

**具体做什么**

1. `skills-fs.ts`：
   - `CATALOG_FILE = "skills.json"`；新增 `LEGACY_CATALOG_FILE = "index.json"`。
   - `CatalogFile` 改为 `{ skills: Record<string, CatalogEntry> }`（删 `version`/`revision`/
     `CATALOG_VERSION`）。
   - 新增 `readCatalogFile(path)`：读数组，`name` 为字符串的行按 name 收进 Record，
     非数组/坏 JSON → `{}`（沿用 `readJson` 的降级哲学）。
   - 新增 `serializeCatalog(skills)`：按「关键决策 11」的固定键序与 name 升序序列化，
     2 空格缩进 + 尾随换行。
   - `readEntry()` 重写为只处理 **skills.json 里没有的目录**（新行）：stat manifest、
     解析 frontmatter、构造行；manifest 不存在返回 `null`。已有行的合并逻辑在 `rebuild()`
     里直接做，不再调用重解析。
   - `rebuild()`：`previous` 改走 `readCatalogFile`；行合并规则见「关键决策 1」；
     `name` = 目录名（不再读 frontmatter.name）；删除 mtime 跳过重解析的分支。
     软链行 `updatedAt` 恒 `""`。
   - `saveCatalog()`：去掉 revision 递增，直接 `catalog = next` 并写 `serializeCatalog`。
   - `mutate()` / `loadCatalog()` 语义不变。
   - `update()`：只 `mutate` 行上的 `description/tags/enabled` 与 `updatedAt`；
     删掉读 manifest、`writeSkillFile`、重新 stat 的分支；不再 import `writeSkillFile`。
   - `create()`：本阶段仍用 `toId()` 得到 `id`，但行里写 `name: id`（中间态；
     阶段三删 `toId` 并直接用 `draft.name`）。
   - `installPackage()` / `adoptFrom()` 的「先 refreshCatalog 再 mutate 补 source/upstream」
     顺序不变——刷新后新目录已有行，mutate 按 name 找得到。
   - `notify()` 改为跳过 `CATALOG_FILE`（`skills.json`）。
   - 新增 `migrateLegacyCatalog(root, catalogPath)`：按「关键决策 4」实现；
     在 `createFsSkillStore()` 里 `fs.mkdir(root)` 之后、watcher 建立之前 `await`。
     需要一个 `readManifestFrontmatter(manifestPath)` 小助手（读文件 + `parseSkillFile`，
     失败返回 `null`）。
   - 文件头注释重写：两个文件的主人不再是「SKILL.md 是便携真相 / index.json 是缓存」，
     而是「skills.json 是库记录（含 SKILL.md 装不下的字段），SKILL.md 只在新目录进入时
     提供 description/tags 初值」。
2. `frontmatter.ts`：删除 `writeSkillFile`、`render`、`OWNED`（均只为它存在）。
   保留 `parseSkillFile` / `starterSkillFile` / 两个接口。
3. `store.ts`：删 `SkillPage.revision` 与相关注释；`SkillSummary.updatedAt`/
   `SkillDetail.body` 的注释按新语义更新。
4. 测试改写：
   - `store.test.ts`：
     - 文件头注释与 `:56`/`:212`/`:3` 的 `index.json` 字面量改成 `skills.json`；
       `:212-217` 直接改写的 JSON 改成数组形状；
     - 删 `revision` 断言块（`:111-117` 的 revision 部分，tags 部分保留）；
     - `create` 块（`:63-78`）本阶段仍走 `toId`：断言 `created.name` = `"pdf-extract"`
       （`id` 仍在，阶段三才删）；
     - 外部编辑块（`:122-138`）改名并改写断言：新目录仍被索引、`name` = `"hand-made"`；
       另加「已有行手改 SKILL.md 的 description/tags 后 `refresh()`，行保持 skills.json 的值」；
     - 「tags-only patch」块（`:231-242`）改为断言 **SKILL.md 逐字节不变**（前后比较），
       而 `list()` 的 tags 已更新；
     - 新增迁移 describe 块：
       a) 只有 `index.json`（含 `assets/enabled/upstream/checked/link`）→ 新 store →
          `skills.json` 是数组、字段齐全、描述来自当前 SKILL.md（用手写块标量样本）、
          `index.json` 已删除；
       b) `index.json` + 手写 `skills.json` 同时存在（复刻真实机器）→ 手写行胜出、
          其余行补齐；
       c) `index.json` 损坏 → 不迁移、不删除；
       d) 迁移后重新打开 store，结果不变（幂等）。
   - `updates.test.ts`：`:53` 的 `row()` 仍用 `.id`（阶段三改）；`:168-194` 改为写
     `skills.json` 数组；`ghost-test` 注入后断言记录的 `upstream/checked` 仍在。
   - `library-store.test.ts`：删 fixture 的 `revision: 1`。

**验收**

```bash
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills lint
```

阶段结束时：真实库的两种状态（只有 index.json；两者都有）都有测试覆盖；
`update()` 不再触碰 SKILL.md；`SkillSummary` 仍保留 `id` 字段（阶段三删除），
值等于 `name`（目录名）。place 侧仍从 frontmatter 取 name，阶段三统一——中间态可接受，
不要在本阶段顺手改 place-skills。

## 阶段三：移除 id 并统一 name 契约

**目标**：`id` 从 JSON、类型、HTTP 参数、UI 全部消失；`name` 是唯一身份；
place 侧也用目录名；`create()` 用严格名字校验并拒绝撞名。

**改动文件**

- `packages/resources/skills/src/store.ts`
- `packages/resources/skills/src/host/skills-fs.ts`（删 `toId`、`create` 改名策略、参数改名）
- `packages/resources/skills/src/host/names.ts`（新增 `assertNewSkillName`、补设备名）
- `packages/resources/skills/src/host/place-skills.ts`
- `packages/resources/skills/handlers.ts`
- `packages/resources/skills/src/remote-store.ts`
- UI：`src/library.ts`、`src/types.ts`、`src/page.tsx`、`src/skill-detail-dialog.tsx`、
  `src/search-dialog.tsx`、`src/add-skill-dialog.tsx`
- 测试：`store.test.ts`、`updates.test.ts`、`bridge.test.ts`、`place-skills.test.ts`

**具体做什么**

1. `store.ts`：从 `SkillSummary`、`PlaceSkill`、`PlaceSkillDetail` 删 `id`；
   `name` 的注释改为「目录名；行的身份，也是所有动作的目标」。
   `SkillStore` 方法参数 `id` → `name`（位置参数，调用处按编译错误逐个跟）。
2. `skills-fs.ts`：`skillDir(id)` → `skillDir(name)`，`assertSafeSegment(name, "skill name")`；
   所有 store 方法、`recordChecks`/`recordAsset`/`detailOf`/`list` 的局部变量改名；
   删除 `toId()`；`create()`：
   ```ts
   const name = assertNewSkillName(draft.name)
   const current = await loadCatalog()
   if (current.skills[name] !== undefined || (await statOrNull(skillDir(name))) !== null)
     throw new Error(`a skill with this name is already in the library: ${name}`)
   ```   其余（建 `assets/references/scripts`、写 starter、mutate 行）不变；
   row 的 `name` 就是 `name`。`list()` 的 `SkillSummary` 去掉 `id` 字段；
   排序 tie-break 改为 `|| a.name.localeCompare(b.name)`（保留 `||`）。
3. `names.ts`：`assertSkillName` 增加保留设备名检查（`con/prn/aux/nul/com1-9/lpt1-9`，
   大小写不敏感，参照 `packages/resources/prompts/src/slug.ts:16-24` 的列表）；
   新增：
   ```ts
   export function assertNewSkillName(name: string): string
   ```
   规则见「关键决策 7」。`folder-import.ts` 继续用 `assertSkillName`（导入时允许
   外部目录名，路径安全即可）。
4. `place-skills.ts`：`readPlaceSkills` 的 `name: frontmatter.name ?? dirent.name` → `dirent.name`，
   行里不再写 `id`；`readPlaceSkill` 的 `name: frontmatter.name ?? id` → `id`（参数名改
   `name`），行里不再写 `id`；排序改 `left.name.localeCompare(right.name)`。
   `frontmatter` 仍用于 description（place 没有 skills.json）。
5. `handlers.ts`：所有 `url.searchParams.get("id")` → `get("name")`、
   `requiredText(body.id, …)` → `requiredText(body.name, "skill name")`、
   错误文案 "skill id" → "skill name"；路径段局部变量 `id` → `name`（`decodeURIComponent` 不变）。
6. `remote-store.ts`：`get(name)` 的路径拼接不变；其余方法把 query `id=` / body `id`
   改为 `name`；方法参数名同步改。
7. UI：
   - `types.ts`：`Skill` 删 `id`（`name` 的注释改为「目录名，行身份与动作目标」）；
     `MediaItem.id`、`SkillHold.id` 不动。
   - `library.ts`：`toSkill` 不再写 `id`；`placeRow` 不写 `id`；`skillKey` 用
     `${skill.name}`；`useSkillDocument` 的 `store.get(skill.name)` /
     `store.placeSkill(skill.name, …)`；`:526,555,558` 的 `item.id`/`skill.id` → `name`。
   - `page.tsx`：`:1151,1188,1191,1201,1223,1236,1245,1249,1256,1602,1603` 的
     `skill.id` → `skill.name`；`rows` 过滤里 `item.id`/`skill.id` 同步。
   - `skill-detail-dialog.tsx`：`:177,212,226` 的 `detail.id` → `detail.name`；
     `:1042` 路径拼接、`:1142` 的 `const id = skill?.id ?? null` → `const name = skill?.name ?? null`，
     `loaded`/`held` 状态的 `{ id, … }` 字段改名为 `name`（`:1169,1189` 比较同步）；
     `:957,958` 的 `skill.id` → `skill.name`。`:233` 的 `MediaItem.id` 不动。
   - `search-dialog.tsx`：`:383` 的 `id: item.id` → `name: item.name`，`:106` 的
     `item.id.toLowerCase()` → `item.name.toLowerCase()`。
   - `add-skill-dialog.tsx`：`:219` → `page.items.map((item) => item.name.toLowerCase())`。
   - `provenance-line.tsx`、`library-store.ts`：核对过，无 `Skill.id` 引用，不改。
8. 测试：
   - `store.test.ts`：`.id` 全改 `.name`；create 块改为
     `store.create({ name: "pdf-extract", … })` 并断言 `created.name`；
     另加三条拒绝用例：`create({name: "a/b"})`（含分隔符）抛错、
     `create({name: "con"})` 抛错、同名第二次抛 `/already in the library/`；
     再加一条正向用例：`create({name: "PDF Extract"})` 成功，目录名原样是 `PDF Extract`；
   - `updates.test.ts`：`row()` 用 `item.name`；`create({ name: "no-source" })`、
     断言 `created.name`；
   - `bridge.test.ts`：`one()` 返回 `.name`；`keys` 里删 `id`（`:78,83,88,144`）；
   - `place-skills.test.ts`：所有技能身份的 `.id` 改 `.name`；
     `:105` 的 `"Alpha"` → `"alpha"`、`:170` 的 `"Own one"` → `"own-one"`、
     `:445` 的 `"Alpha"` → `"alpha"`（目录名即 name）；
   - `package.test.ts` / `registry.test.ts` / `upstream.test.ts`：只有 place/provider id
     或路径字符串，预期不改；跑一遍确认。

**验收**

```bash
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills lint
pnpm --filter @context-hub/claude-code test   # 依赖 @context-hub/skills/extension
pnpm --filter web build                       # js-yaml 进入浏览器包 + 页面类型
```

补充检索（技能身份应已无 `id`；`place.id`/`hold.id`/`MediaItem.id`/`provider.id` 除外）：

```bash
rg -n "\.id\b" packages/resources/skills/src packages/resources/skills/handlers.ts \
  packages/resources/skills/__test__
rg -n "\bSkillSummary\b|\bPlaceSkill\b|revision" packages/resources/skills/src
```

## 阶段四：全量验证与残留清理

**目标**：整仓绿、真实库迁移在临时副本上跑通、残留字符串清干净。

**改动文件**

- 只改本轮遗漏的注释/文案；不再有行为改动。

**具体做法**

1. 用真实库的**临时副本**验证迁移（不碰 `~/.context-hub`）：
   ```bash
   TMP=$(mktemp -d) && cp -r ~/.context-hub/skills "$TMP/skills"
   # 用 node 脚本以 createFsSkillStore({ home: $TMP }) 打开，检查：
   # 12 行；context7-mcp / dsh-pre-push-checks 带 link；browser-automation 的
   # description 是完整块文本而不是 "|"；anatomy 的 assets/upstream/checked 原样；
   # index.json 已删除、skills.json 为数组。
   ```
   脚本用完即删，不提交；`$TMP` 最后 `rm -rf`。
2. 残留检索：
   ```bash
   rg -n "index\.json|CATALOG_VERSION|toId|writeSkillFile|revision" \
      packages/resources/skills README.md docs/plans/archive
   ```
   `docs/plans/archive/*` 与 `docs/memory.md` 的历史结论不改；`aoci.*.txt` 不在这一步改，
   由第 5 步统一维护。
3. 全量验证：
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   pnpm --filter web build
   ```
   `updates.test.ts` 需要 `git` 在 PATH；失败时先确认是环境还是改动。
4. `git status --short`：只应出现本轮改动的文件；不得有 `~/.context-hub` 或临时目录残留。
5. AOCI 收尾（只在此时做一次）：`aoci_maintain` → 按签发批次 `aoci_update_entry` 更新受影响的
   条目（`skills-fs.ts`、`frontmatter.ts`、`store.ts`、`place-skills.ts`、`names.ts`、
   `handlers.ts`、`remote-store.ts`、`package.json`），再跑 `verify` / `check` / `index agent guide`。

**验收**：四条命令全绿；临时副本迁移检查全部通过；`git status` 无意外文件；
`rg` 里只剩历史文档；AOCI `verify` 与 `check` 均为 aligned。

## 不做

- 不在实现阶段维护 AOCI：等全部改动到最终稳定状态后按 AGENTS.md 调用**一次**
  `aoci_maintain`，再按机器签发的批次更新 `skills-fs.ts`、`frontmatter.ts`、`store.ts`、
  `place-skills.ts`、`names.ts`、`handlers.ts`、`package.json` 等条目。
  `aoci.code.txt` 里「`index.json` 是目录、SKILL.md 是便携真相」的描述全部作废，必须改。
- 不改技能页/详情弹窗/卡片/搜索的布局与文案；description 的多行显示依赖现有
  `line-clamp-2` 与 HTML 空白折叠，不新增 `whitespace-pre-line`。
- 不给 description 加 UI 编辑器（今天只有 tags 编辑器，description 只走 API）——
  本任务不新增功能。
- 不改 `enabled` 语义、资产目录布局、`owned()` 的 `<name>-<原名>` 归属、
  上游检查/更新流程（`askSources`/`recordChecks`/`updateFromUpstream` 的行内逻辑只做改名）。
- 不改 `packages/core/src/plugins.ts` 的 `EXTENSION_RECORDS = "index.json"`（别的域）。
- 不改 `folder-scan.ts` / `folder-import.ts` 的扫描与导入边界（只用新解析器取 description；
  导入内容原样写盘）。
- 不迁移真实 `~/.context-hub/skills`：验证只在临时副本上做，迁移在下次真实启动时自然发生。
- 不做软链目标变更的额外处理（沿用现有 link 字段规则）。
- 不引入 `js-yaml` / `@types/js-yaml` 之外的依赖。

## 已知影响与限制

1. **首次真实启动会写盘**：合并迁移会写 `skills.json` 并删 `index.json`。
   目录只读时 store 创建失败（今天首次读取也必然写目录文件，行为一致）。
2. **两个坏 description 在迁移时被修复**：迁移对缺失行重读 SKILL.md，
   browser-automation 恢复完整块文本，find-docs 得到 `""`（它的 frontmatter 本来就没有值）。
   若某个 SKILL.md 解析失败，回退旧 JSON 值而不是丢弃行。
3. **卡片标题变成目录名**：目录 `hand-made` 显示 `hand-made`，不再是 frontmatter 的
   `Hand Made`。这是「name 即目录名」的直接代价，用户已确认。
4. **外部手改 SKILL.md 的 description/tags 不再进入列表**；`refresh()` 只更新
   `updatedAt`（非软链且 mtime 变了时）。这是用户要求的「skills.json 唯一真相」。
5. **软链技能**：`link` 只在内存行里，由每次扫描现读（文件里没有这个字段）；扫描时
   `updatedAt` 恒 `""`；link 目标失效或消失 → 该行被丢弃（与今天一致）。
6. **HTTP 参数改名是一次兼容性断裂**：客户端与 host 同仓同版本发布（`remote-store.ts` ↔
   `handlers.ts`），不保留 `id` 别名；跨版本混跑会 400（本仓无此部署形态）。
7. **`js-yaml` 进入浏览器包**：`folder-scan.ts` 被 `add-skill-dialog` 引用，
   js-yaml 是纯 JS、可在浏览器运行；体积影响由 `pnpm --filter web build` 确认。
8. **create 没有 UI 入口**：严格名字规则不会产生界面回归，但通过 HTTP 调 `create` 的
   调用方（如有脚本）会收到新的拒绝信息。

## 自审记录

- `revision` 的消费方逐个查过（`library.ts` / `library-store.ts` / `page.tsx` 无引用），
  结论「可删」有据；同步删了 `store.test.ts` 与 `library-store.test.ts` 两处引用。
- `writeSkillFile` 的结论明确：`update()` 停用后为死代码，随阶段二删除；
  `starterSkillFile` 改为直接用 `dump`，不再依赖它。
- 迁移顺序论证过：先写新文件、成功后再删旧文件；合并按 name 幂等；坏 `index.json` 不删。
- 「两者同时存在」不是假设：真实机器上 `~/.context-hub/skills/` 里 `index.json` 与
  手写 `skills.json` 现在就并存，迁移必须合并，否则会丢 11 条真实行的
  `upstream/checked/assets/source`。
- 阶段二显式保留了中间态（`create()` 写 `name: id`、place 侧仍读 frontmatter name），
  避免实施者在本阶段顺手改了阶段三的范围。
- 每个阶段都给了真实存在的验证命令（均来自各 `package.json`）；`pnpm install` 标注了
  沙箱限制（`docs/memory.md` 的既有教训）。
- 待验证项：`js-yaml` / `@types/js-yaml` 的解析版本（`pnpm add` 后看 `package.json`）；
  named import 在 `verbatimModuleSyntax` + `moduleResolution: bundler` 下是否无需
  `esModuleInterop`（`pnpm --filter @context-hub/skills typecheck` 验证；失败则改用
  `import yaml from "js-yaml"` 并确认 tsconfig）。
- 范围没有外溢：不改布局/文案/资产/上游流程/其它域的 index.json；AOCI 放到阶段四收尾时
  一次性维护（AGENTS.md 要求受管对象到最终稳定状态后才调用 `aoci_maintain`）。
