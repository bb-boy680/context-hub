# 收录技能改为复制 + 列表同名去重

- 日期：2026-10-28
- 仓库：`D:\work-space\dsh-context-hub`，分支 `main`，基线 `b9d8eaf`
- 状态：待审批

## 背景（已核实）

### 1. 收录当前是链接

链路：

- `packages/resources/skills/src/host/place-skills.ts:268-287` `linkSkillIntoLibrary` → `placeSkill(mode, source, target, true)`（`:63-94`）。
- `placeSkill` 在 `mode !== "copy"` 时先建链接：Windows 用 `junction`，其他平台用 dir symlink；链接失败且不是显式 `"link"` 时回退到 `fs.cp`。
- `packages/resources/skills/src/host/skills-fs.ts:955-977` `adoptFrom` 调 `linkSkillIntoLibrary`，`mode` 默认 `"auto"`。
- UI 侧 `packages/resources/skills/src/library.ts:571-579` 的 `adopt` 把设置里的 `installMode` 原样传下去；远端再经 `remote-store.ts:216-227` 的 POST body 和 `handlers.ts:349-356` 的 `adopt-place`。
- `store.ts:408` 的接口签名带 `mode?: InstallMode`。

本机真实数据：`~/.context-hub/skills/starwave` 是指向本仓 `.claude/skills/starwave` 的 symlink；`~/.context-hub/skills/ego-browser` 是真实目录；`~/.claude/skills/ego-browser` 指向 `C:\Users\hl131\.local\share\ego\ego-skills`。

### 2. 同名卡片重复的原因

`packages/resources/skills/src/library.ts:493-559` 的 `rows` useMemo：

- 库行由 `page.items` 构造（`:506-543`）。
- place 自有行（`:547-556`）只在两种情况跳过：`skill.origin === "hub"`，或库里有同名条目且该条目是链接进这个 place 的（`reachedFrom(item, place.root)`）。

复制收录后，place 目录是普通目录、库条目也是普通目录，`reachedFrom` 恒为 false，于是库行和 own 行同名并排出现。`ego-browser` 就是这种状态：库里是复制来的真实目录，`~/.claude/skills` 里是指向别处的 symlink（origin 仍判为 `own`）。

`packages/resources/skills/src/search.ts:63-85` 已经按 name 去重且库行优先，可作为同一规则的先例。

### 3. 附带发现的死状态

`Skill.inLibrary`（`types.ts:74-78`）只用于两处：`library.ts:172` 的 `unstored()` 排除，和 `page.tsx:232` 让 own 行不显示操作。它由 `library.ts:554` 用「库里是否有同名」计算。去重后 own 行不会再与库行同时存在，这个标记永远为 false，属于本次改动产生的死状态。

另外 `library.ts:89-90` 的 `SkillLibrary.adopt` 注释已经写成 “Copy one skill a place holds into the library”，与实现不一致，本次一并修掉。

## 目标

1. 收录（place → library）一律复制：目标目录是真实目录，内容是源目录的快照；源目录本身是链接时复制链接指向的内容（dereference）。
2. 列表按名称去重：库里有同名条目时，place 的 own 行不再单独成行，库行优先；这张库行仍出现在对应的 Agent/工作区页签里。

## 不做

- 不改安装方向（library → place）的行为，`installMode` 设置与 `installSkillInto` 保持现状（默认链接，可显式 copy）。
- 不改 `search.ts`（已去重）。
- 不迁移或转换已存在的 junction/symlink 收录条目；它们继续按 `origin === "hub"` 被跳过，不产生重复。
- 不把 `takenAt` 塞进 `places`；只让页签过滤/计数额外读 `takenAt`（见 D5）。
- 不改 `add-skill-dialog.tsx` 里同名的局部 `inLibrary` 函数。
- 不跑 `prettier --write`，不顺手重排无关代码。
- 本计划阶段不写 `aoci.txt` / `.aoci`；AOCI 维护放在阶段三源码稳定之后。

## 方案决策

### D1：把 `mode` 从收录链路删除，而不是保留形参强制 copy

推荐删除。涉及：`place-skills.ts`、`skills-fs.ts`、`store.ts`、`remote-store.ts`、`handlers.ts`、`library.ts`。

理由：
- 保留一个只接受 `"copy"` 的形参，是对调用方的错误承诺，下一个人会以为还能传 `"link"`。
- 删除是机械改动：链路只有这 6 个文件，类型检查会指出漏掉的调用点。
- 安装方向继续使用 `placeSkill` 的 `mode`，`placeSkill` 本身不改，所以链接实现和 `LINK_UNSUPPORTED` 回退逻辑原样保留给安装。

不采用「保留 `mode` 但忽略」：省下的只是一个签名改动，代价是永久误导。

### D2：去重放在行合成处，库行优先

把 `library.ts:547-556` 的跳过条件简化为「库里有同名条目就跳过 own 行」，与 `search.ts` 一致：

```ts
if (skill.origin === "hub") continue
if (items.some((item) => item.name === skill.name)) continue
```

`items` 是当前 `page.items`。共享读取用的是 `store.list({ sort: "updated" })`，不传 `limit`，`limit` 默认取全量（`skills-fs.ts:690-693`），所以未输入搜索词时 `items` 就是全库，去重覆盖完整。搜索框输入内容时 `page` 是 `store.list({ q })` 的结果，库行若没命中查询则不参与去重，own 行仍可显示——这与 `search.ts` 的现有行为一致（`:79-85` 只对已 push 的库结果做 `seen` 判断）。不为搜索场景另写规则。

为了能对这条规则写可执行断言，把条件抽成 `library.ts` 导出的纯函数：

```ts
/** 库里有同名条目时，这一行由库行代表；链接进库的条目本来就已经是库行。 */
export function showsOwnRow(
  skill: PlaceSkill,
  items: readonly SkillSummary[]
): boolean {
  return skill.origin !== "hub" && !items.some((item) => item.name === skill.name)
}
```

不抽整个 `rows` useMemo：它依赖 `store`（`toSkill` 里的 `assetUrl`）、`locale`（`formatAge`）、`targets`、`page`/`held`，整体抽成纯函数需要新增 4-5 个入参和 store 桩，只为测一条 `.some`，不值得。抽谓词即可，行循环仍调用同一个函数，测试断言的就是线上规则。

已用 esbuild 打包 `src/library.ts` 后在 Node 24 里成功加载（`useSkillLibrary`、`inLibrary` 均可取到），所以新增的纯 node 测试导入该模块不会因 React/TSX 依赖失败。若实施时 vitest 报模块加载错误，再把 `showsOwnRow` 原样移到新文件 `src/rows.ts` 并由 `library.ts` 重新导出，行为不变。

### D3：`holds` 不改，`takenAt` 改形状但不塞进 `places`

复制收录后库行会出现 `takenAt: [源 place]`、`installed: false`、`location: "library"`，这是正确描述：库有自己的一份，源目录仍归 place。

- 不把 `takenAt` 的 place 塞进 `places`：`places` 表示「这一行的文件能通过该 place 访问」，塞进去会让详情弹窗按 place 读文件，并给出去点必失败的「移除」（`removeFrom` 只接受链接）。
- `takenAt` 由 `SkillPlaceId[]` 改为 `SkillHold[]`，只为了页签能按 scope 过滤（D5）；它仍不参与 `holdsOf`。
- 安装菜单会因 `takenAt` 把该 place 标成不可选（`page.tsx:287-292`），这正是想要的：同名目录已经在那里，再装会报 `already in this place`。

### D4：不迁移旧链接条目

旧条目仍是链接，`readPlaceSkills` 判为 `origin: "hub"`，own 行本来就被跳过；库行靠 `reachedFrom` 仍能识别链接并正常显示/卸载。无需数据迁移。

### D5：去重后仍出现在 Agent/工作区页签（用户已拍板）

库行只有在 `places` 里才会进 place 页签；复制收录的源目录是 place 自有的同名副本，所以库行只有 `takenAt`。把页签判据从「只读 `places`」改成「读 `places` 和 `takenAt`」，列表仍只有一张库卡片。

`takenAt` 改为与 `places` 同形的 `SkillHold[]`（`id` + `scope` + `dir`），因为页签按 scope 过滤，仅存 id 拿不到 scope。新增一个共享判据，页签过滤和库的每-place 计数都读它：

```ts
/** Every place a row belongs on screen under: the ones holding its files, and
    any holding a same-named skill of their own, which the library row stands for. */
export function placedIn(skill: Skill): SkillHold[] {
  return [...holdsOf(skill), ...(skill.takenAt ?? [])]
}
```

- `page.tsx:106-110` 的 place 过滤改用 `placedIn`，`place` 收窄条件不变。
- `library.ts:687-689` 的每-place 计数改用 `placedIn`，否则页签数与列表不一致。
- `page.tsx:290` 的 `skill.takenAt?.includes(place.id)` 改成 `skill.takenAt?.some((hold) => hold.id === place.id)`；安装菜单仍把这个 place 标成「已有同名技能」，不会给出必失败的「移除」。
- 详情弹窗仍按库读文件（`placeOf` 只认 `places`），不会去读 place 那份副本。

跨平台：`fs.cp` 是 Node 内置 API（本仓要求 node>=20），三平台一致；收录不再创建链接，Windows 也不再依赖 junction 权限。`dereference: true` 对 POSIX symlink 与 Windows junction 源都按内容复制，由阶段一新增用例覆盖。

## 执行约定

- 计划获批后按阶段建任务，`subject` 直接用下面的阶段名，开始前标 `in_progress`，验收通过立刻 `completed`。
- 阶段一和阶段二互不依赖，可以分别验收；阶段三必须在两者都完成之后。
- 每个阶段结束仓库都应可运行：阶段一改完签名后测试同步更新，阶段二改完类型同步删除字段。

## 阶段一：收录改为复制

**目标**：`adoptFrom` 永远产生真实目录副本，收录链路不再接受安装方式。

**改动文件与步骤**

1. `packages/resources/skills/src/host/place-skills.ts`
   - `linkSkillIntoLibrary`（`:255-287`）重命名为 `copySkillIntoLibrary`，删除 `mode` 形参。
   - 函数体最后一行改为 `return placeSkill("copy", source, target, true)`；`dereference: true` 保持，这样源目录本身是链接时复制内容。
   - 重写函数注释：说明它复制、dereference 源链接、库拥有自己的一份文件。
   - `placeSkill`、`installSkillInto` 不动。
2. `packages/resources/skills/src/host/skills-fs.ts`
   - `:54-55` 的 import 改名。
   - `adoptFrom`（`:955-977`）删除 `mode` 形参，调用 `copySkillIntoLibrary(base, root, name, ref.dir)`；`InstallMode` import 仍被 `installInto` 使用，保留。
3. `packages/resources/skills/src/store.ts`
   - `:408` 改为 `adoptFrom(name: string, ref: SkillPlaceRef): Promise<SkillInstall>`，注释改成「复制一份进库，返回 `copy`」。
4. `packages/resources/skills/src/remote-store.ts`
   - `:216-227` 删除 `mode` 形参和 body 里的 `mode` 字段。
5. `packages/resources/skills/handlers.ts`
   - `:349-356` 的 `adopt-place` 不再传 `bodyMode(body.mode)`；`:338` 注释改成「安装进 place，或从 place 复制收录」。
   - `bodyMode` 仍被 `install-place` 使用，保留。
6. `packages/resources/skills/src/library.ts`
   - `:571-579` 的 `adopt` 改为 `store.adoptFrom(id, ref)`，依赖数组改 `[store, reload]`；注释改成「place 保留自己的文件，库复制一份」。
7. 测试（阶段一内必须一起改，否则仓库测试红）：
   - `__test__/place-skills.test.ts`
     - `:20-21` import 改名；`:58` 的 `linkedOne` 注释改成「place 自己的目录」。
     - `:125-141`「copying a place skill into the library」：调用去掉 `"copy"` 实参，其余断言保留。
     - `:280-316` describe 改名为「adopting a place skill into the library」：`:289` 期望改为 `"copy"`；`lstat` 断言改为「不是链接」；保留「文件内容可读」「同名拒绝」「不存在拒绝」「越界名拒绝」。新增一条独立性断言：复制完成后往 place 的源目录写 `notes.md`，断言库副本里没有该文件。
     - 新增用例：源 place 条目本身是链接（`fs.symlink(outside, entry, process.platform === "win32" ? "junction" : "dir")`，`outside` 放在 `home/elsewhere/...`，不在 `home/skills` 下），收录后库条目是真实目录且 `SKILL.md` 内容正确。这条同时验证 Windows junction 上的 `fs.cp(..., { dereference: true })`。
     - `:383-405`「the library's own list」：`linked-one` 现在是复制条目，`link` 应为 `undefined`、`updatedAt` 不为空；断言按此改写（与同文件对 `alpha` 的断言一致）。
     - `:450-460` describe 改名「removing an adopted entry」：`store.remove` 只删库副本、place 源目录仍在，断言不变，只改注释与标题。
     - 文件顶部注释（`:1-10`）补一句：安装是链接，收录是复制。
   - `__test__/bridge.test.ts`
     - `:192-224` 两条 adopt 用例合并为一条「adopting one out of a place」：只保留 `adopted-here`，`adoptFrom` 不再传 `"copy"`；在 `run` 里 `lstat(home/skills/adopted-here)` 断言不是链接，再返回 `{ mode }`，`keys: ["mode"]` 不变。

**验收**

- `pnpm --filter @context-hub/skills typecheck`
- `pnpm --filter @context-hub/skills lint`
- `pnpm --filter @context-hub/skills test`
- `rg "linkSkillIntoLibrary|adoptFrom\([^)]*,\s*\"(auto|link|copy)\"" packages/resources/skills` 无输出。
- `rg "adoptFrom" packages/resources/skills/src packages/resources/skills/handlers.ts` 只剩两参数调用。

## 阶段二：同名行去重

**目标**：库里有同名条目时，列表只显示库行；清掉由此变成死状态的 `inLibrary` 行标记。

**改动文件与步骤**

1. `packages/resources/skills/src/library.ts`
   - 在 `unstored`（`:162-173`）附近新增两个导出函数：`showsOwnRow(skill, items)`（D2）与 `placedIn(skill)`（D5）。
   - `rows` useMemo（`:547-556`）：
     ```ts
     for (const skill of held[place.id]?.skills ?? []) {
       if (!showsOwnRow(skill, items)) continue
       own.push(placeRow(skill, place))
     }
     ```
     删除 `inLibrary: items.some(...)`。
   - 库行合成里的 `takenAt.push(place.id)` 改为 `takenAt.push({ id: place.id, scope: place.scope, dir: place.dir })`。
   - `:687-689` 的每-place 计数由 `holdsOf(row)` 改为 `placedIn(row)`。
   - 更新 `:543-546` 的注释为「库里有同名条目时由库行代表」。
   - `unstored`（`:172`）删除 `skill.inLibrary !== true &&`，更新 `:164-169` 注释中关于 `inLibrary` 的句子。
2. `packages/resources/skills/src/types.ts`
   - 删除 `Skill.inLibrary` 字段及注释（`:74-78`）。
   - `Skill.takenAt` 类型改为 `SkillHold[]`，注释改成「这些 place 各自有同名技能；库行代表它，页签仍把它算在这些 place 下」。
3. `packages/resources/skills/src/page.tsx`
   - `SkillActionButton`（`:230-233`）删除 `if (skill.inLibrary === true) return null`，保留 `if (!inLibrary(skill))` 分支。
   - `:290` 的 `skill.takenAt?.includes(place.id)` 改为 `skill.takenAt?.some((hold) => hold.id === place.id)`。
   - `rowsForTab`（`:106-110`）的 place 过滤改用 `placedIn(row)`，scope 与 `place` 收窄判据不变。
4. 新增 `packages/resources/skills/__test__/rows.test.ts`
   - 从 `../src/library.ts` 导入 `showsOwnRow` 与 `placedIn`，从 `../src/store.ts` 导入类型。
   - 用最小对象（`SkillSummary` 需 `name/description/tags/source/enabled/assets/updatedAt`；`PlaceSkill` 需 `name/description/origin`）断言：
     - 库里有同名 `ego-browser` + place own 行 → `showsOwnRow` 为 `false`（用户报的重复场景）。
     - 库里无同名 → `true`。
     - `origin: "hub"` → `false`（链接安装本来就有库行）。
     - `origin: "stale"` 且库无同名 → `true`（坏链接清理行仍要显示）。
     - `placedIn` 对 `places: [A]` 与 `takenAt: [B]` 返回两者，页签/计数能同时看到。
   - 若导入 `library.ts` 在 node 环境失败，把 `showsOwnRow` / `placedIn` 原样移到 `src/rows.ts` 并由 `library.ts` 重新导出，测试改从新文件导入。

**验收**

- `pnpm --filter @context-hub/skills typecheck`
- `pnpm --filter @context-hub/skills lint`
- `pnpm --filter @context-hub/skills test`（含新增 `rows.test.ts`）
- `rg "skill\.inLibrary|inLibrary\?: boolean" packages/resources/skills` 无输出。
- 代码复核：`rows` 的库行合成、`holds`、`installed`、`linkAt` 均未改；`takenAt` 只用于页签/计数与安装菜单的占用判断。

## 阶段三：全量验证与认知收尾

**目标**：确认跨包类型与真实页面，然后做一次 AOCI 维护。

**步骤与验收**

1. 仓库级类型检查：`pnpm typecheck`（turbo 跑全部包；`Skill` 类型改动只有本包使用，仓库级 grep 已确认）。
2. 包级检查：`pnpm --filter @context-hub/skills typecheck && pnpm --filter @context-hub/skills lint && pnpm --filter @context-hub/skills test`。
3. 浏览器验证（只读，不写用户技能库）：
   - 按 `docs/memory.md` 的规则起自己的 dev server：`cd apps/web && npx vite --port 5273 --strictPort`；不要碰用户已在跑的 5173。
   - 先在改前/改后各看一次 `http://localhost:5273/skills`，搜索 `ego-browser`，数标题为 `ego-browser` 的卡片：改前 2 张（库 + `~/.claude/skills` 的 own 行），改后 1 张，且来源行显示库。
   - 前提：hub 设置里 Claude agent 处于启用状态，否则 `~/.claude/skills` 不会被扫描，页面无法复现重复；不满足时在报告里说明「真实数据未覆盖，去重由 `rows.test.ts` 覆盖」。
   - 验证完只杀 5273 那个进程：`netstat -ano | grep ":5273" | grep LISTENING` 找 pid。
4. 收录复制不做真实用户库写入验证：阶段一的新测试在临时 hub home 的真实磁盘上跑通了「复制 + dereference + 独立性」；如需端到端点击验证，先征得用户同意再在真实库里收录一个临时技能并清理。
5. AOCI 收尾：源码达到最终稳定状态后调用一次 `aoci_maintain`，按返回候选更新以下条目的语义（本计划阶段不写）：
   - `packages/resources/skills/src/host/place-skills.ts`：收录改为复制、`copySkillIntoLibrary` 命名、`placeSkill` 只服务安装。
   - `packages/resources/skills/src/host/skills-fs.ts`：`adoptFrom` 两参数、始终返回 `copy`。
   - `packages/resources/skills/src/store.ts`、`src/remote-store.ts`、`handlers.ts`：收录链路不再携带 `mode`。
   - `packages/resources/skills/src/library.ts`：`showsOwnRow` / `placedIn` 规则、`adopt` 调用、`takenAt` 新形状。
   - `packages/resources/skills/src/types.ts`：`Skill.inLibrary` 已删除；`takenAt` 为 `SkillHold[]`。
   - `packages/resources/skills/src/search.ts` 无改动，除非 maintain 明确报出候选。

## 测试计划汇总

| 场景 | 位置 | 断言 |
|---|---|---|
| 收录产生真实目录 | `place-skills.test.ts` 收录 describe | 返回 `copy`、`lstat` 非链接、内容可读 |
| 复制后与源目录独立 | 同上 | 源目录新增文件不出现在库副本 |
| 源本身是链接 | 同上，新增用例 | 库副本是真实目录，内容来自链接目标 |
| 同名拒绝 / 不存在 / 越界名 | 同上，保留 | 原断言不变 |
| 库列表把复制条目当自有副本 | `place-skills.test.ts:383-405` | `link === undefined`、`updatedAt !== ""` |
| 远端调用签名 | `bridge.test.ts` | `adopt-place` 可调用、返回含 `mode`，且落盘不是链接 |
| 同名去重规则 | 新增 `rows.test.ts` | 同名 → 不显示 own 行；不同名/坏链接 → 显示 |
| 页签仍能看到收录技能 | `rows.test.ts` + 5273 的 `/skills` | `placedIn` 合并 `places` 与 `takenAt`；Agent 页签里有这张库卡片，但只有一张 |
| 真实页面 | 5273 的 `/skills` | `ego-browser` 卡片从 2 张变 1 张；Claude 页签仍可见 |

## 已拍板

1. **place 页签仍显示**：按 D5 实现，用 `takenAt`（`SkillHold[]`）让库行走入对应 Agent/工作区页签；列表仍只有一张卡片。
2. **安装方向保持链接**：本次只改收录；`installMode` 默认 `auto`（Windows junction）的行为不变。
3. **旧链接收录条目不迁移**：保留为 junction/symlink，功能不受影响。

## 风险

- `fs.cp` 的 `dereference: true` 在 Windows junction 源上的行为由阶段一新增测试验证；若失败，说明必须手动递归复制，届时先回报再改方案。
- 复制后 place 与库两份文件会各自漂移；上游更新只作用于库副本。这是「收录=拷贝」的直接代价，符合本次要求。
- 去重后列表里的库卡片代表两份文件，详情弹窗只读库副本；place 那份副本的详情没有单独入口。这是按名称去重的直接代价。

## 受影响文件

| 文件 | 改动 |
|---|---|
| `packages/resources/skills/src/host/place-skills.ts` | `linkSkillIntoLibrary` → `copySkillIntoLibrary`，删 `mode`，固定 copy |
| `packages/resources/skills/src/host/skills-fs.ts` | `adoptFrom` 删 `mode`，import 改名 |
| `packages/resources/skills/src/store.ts` | 接口签名与注释 |
| `packages/resources/skills/src/remote-store.ts` | 客户端删 `mode` |
| `packages/resources/skills/handlers.ts` | `adopt-place` 删除 `bodyMode` |
| `packages/resources/skills/src/library.ts` | `adopt` 调用；`showsOwnRow` / `placedIn`；`unstored`；own 行合成；`takenAt` 形状；每-place 计数 |
| `packages/resources/skills/src/types.ts` | 删除 `Skill.inLibrary`；`takenAt` 改为 `SkillHold[]` |
| `packages/resources/skills/src/page.tsx` | 删除 own 行的 `inLibrary` 短路；`takenAt` 判断；`rowsForTab` 用 `placedIn` |
| `packages/resources/skills/__test__/place-skills.test.ts` | 收录用例改写 + 新增链接源用例 |
| `packages/resources/skills/__test__/bridge.test.ts` | 合并收录用例 |
| `packages/resources/skills/__test__/rows.test.ts` | 新增去重规则测试 |
