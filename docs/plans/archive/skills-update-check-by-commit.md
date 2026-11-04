# 技能更新检测改为按 git commit 比对

状态：已完成（2026-10-28）
日期：2026-10-28
分支：feat/react-compiler

## 1. 目标

把 skill 的「检查更新」从「每次检查都在临时目录重跑一遍 skills CLI、比较目录内容 hash」改为：

- 安装、采纳、更新时记录来源仓库的 commit（`revision`）；
- 检查时用 `git ls-remote` 读取来源默认分支 HEAD，与记录的 commit 比较；
- 本地改动检测（`modified`）继续用目录 hash，不依赖网络；
- 安装与更新仍然由 skills CLI 完成，安装权威不变。

用户已明确：安装来源基本是 GitHub `owner/repo` 的默认分支，不是 tag。

## 2. 已核实的现状

行号基于当前工作区（HEAD `a438565`）。

### 2.1 当前链路

- `packages/resources/skills/src/host/upstream.ts:44-62`：`asUpstream` 从 `skills-lock.json` 读 `{ source, sourceType, skillPath, computedHash }`，`sourceType === "local"` 返回 `null`。不记录 commit。
- `packages/resources/skills/src/host/skills-cli.ts:251-299`：`fetchUpstreamRecords(source, skills)` 每次检查在临时目录跑 `npx skills add <source> --skill ... -a universal --copy -y --json`，读 lock 拿 `computedHash`，再删目录。
- `packages/resources/skills/src/host/skills-fs.ts`：
  - `:92` `CHECK_CONCURRENCY = 3`；
  - `:519-543` `askSources` 按 `upstream.source` 分组、并发跑 CLI；
  - `:552-574` `recordChecks` 本地算 `skillFolderHash`，写 `checked: { at, latest, currentHash }`；
  - `:785-806` `installPackage`、`:955-971` `adoptFrom` 写入 `upstream`；
  - `:973-997` `checkUpdate`、`:999-1022` `checkUpdates`、`:1024-1070` `updateFromUpstream`；
  - `:1134-1151` `replaceDirectory` 更新时整目录替换。
- `packages/resources/skills/src/store.ts`：
  - `:29-38` `SkillUpstream`（只有 `hash`）；
  - `:44-51` `SkillCheck`（`latest` = 上游目录 hash）；
  - `:95-99` `outdated` = `checked.latest !== upstream.hash`；
  - `:106-110` `modified` = `checked.currentHash !== upstream.hash`；
  - `:203-215` `SkillUpdateCheck`（`recordedHash / currentHash / latestHash`）。
- `packages/resources/skills/src/update-settings.ts:68-70` `updatableNames = outdated && !modified`，自动更新依赖这两个判定。
- 桥与 UI：
  - `packages/resources/skills/handlers.ts:241-249`、`:297-300` 的 action 名；
  - `packages/resources/skills/src/remote-store.ts:232-243`；
  - `packages/resources/skills/src/library.ts:636-658` 单检查（`autoDownload` 时自动更新并改写返回值）、`:660-677` 批量检查；
  - `packages/resources/skills/src/skill-detail-dialog.tsx:348-498` `SourceSection`，`:366-376` 用 hash 现场拼 `SkillUpdateCheck`；
  - `packages/resources/skills/src/page.tsx:418-429` `CheckBadge`，`:1143-1163` `checkAll` 的 toast。

### 2.2 实测事实

- 用户机器上的真实 lock（`D:/work-space/agents/*/skills-lock.json` 等 5 份）每行只有 `source / sourceType / skillPath / computedHash`，全部是 `owner/repo` + `sourceType: "github"`，没有 commit。
- 真实 `~/.context-hub/skills/skills.json` 有 6 条 registry 行，全部 `upstream` 无 commit，`checked.latest` 是 64 位目录 hash。
- `git ls-remote` 的 ref 匹配必须精确比对第二列，不能取第一行：
  ```
  $ git ls-remote -- "file:///D:/work-space/dsh-context-hub" HEAD
  a4385654dd317f7c7fcef03f7d0b178afe2f53b2	HEAD
  b9d8eaf920e10203067fb69519d2511b55ca82d5	refs/remotes/origin/HEAD
  ```
  传 `refs/heads/<branch>` 时返回的单行第二列就是 `refs/heads/<branch>`。
- 本机 `git version 2.54.0.windows.1`，`file://` URL 可离线使用。
- 仓库里已有一套同样模型的实现可对照，不需要新依赖：
  - `packages/resources/plugins/src/host/probe.ts:35-85`：`git ls-remote` + 30s 超时 + 禁止凭据弹窗；
  - `packages/resources/plugins/src/revision.ts`：`recordedRevision / latestRevision / currentHash / outdated / modified`；
  - `packages/resources/plugins/src/inspect.ts:108-161`：地址解析与 `#ref` 处理。

### 2.3 工作区状态

工作区已有未提交改动：`packages/resources/skills/src/host/skills-cli.ts` 的 `parsePackageList`（clack 无 Unicode 终端时回退 `|` / `—`）、`__test__/package.test.ts` 的对应用例、以及 AOCI 文件。实施时保留这些改动，不要 `git checkout` 回退。

## 3. 目标设计

### 3.1 数据模型（`src/store.ts`）

```ts
export interface SkillUpstream {
  source: string
  sourceType: string
  skillPath: string
  /** 安装时 CLI 计算的目录 hash；只用于 modified 和“内容是否变化”。 */
  hash: string
  /** 安装/上次更新时来源仓库的 commit；旧行没有，检查时视为“需更新一次”。 */
  revision?: string
}
```

`SkillCheck` 字段名不变，改变 `latest` 的含义：

```ts
export interface SkillCheck {
  at: string
  /** 检查时来源持有的 commit；旧版本在这里写过目录 hash，行上出现 revision 后不再读它。 */
  latest: string
  /** 检查时本地文件的目录 hash。 */
  currentHash: string
}
```

`SkillUpdateCheck` 与 `packages/resources/plugins/src/revision.ts` 对齐：

```ts
export interface SkillUpdateCheck {
  recordedRevision: string | null   // upstream.revision ?? null
  latestRevision: string            // 远端 HEAD
  currentHash: string               // 本地目录 hash
  outdated: boolean
  modified: boolean
}
```

判定集中到一个纯函数，检查、列表徽标、详情弹窗、自动更新都读它：

```ts
export function ahead(
  upstream: Pick<SkillUpstream, "revision"> | undefined,
  latest: string | undefined
): boolean {
  if (upstream === undefined || latest === undefined) return false
  /* 没有 revision 的老数据：下一次更新才是开始跟踪的入口，不能猜成“已最新”。 */
  return upstream.revision === undefined || upstream.revision !== latest
}

export function outdated(skill: Pick<SkillSummary, "upstream" | "checked">): boolean {
  return ahead(skill.upstream, skill.checked?.latest)
}
```

`modified` 不变。

### 3.2 来源解析（新文件 `src/host/git-source.ts`）

只处理 skills CLI 可能写进 `source` 的形状：

| 输入 | 结果 |
|---|---|
| `owner/repo`（`/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/`） | `{ url: "https://github.com/owner/repo" }` |
| `https://github.com/owner/repo/tree/<ref>[/...]` | `{ url: "https://github.com/owner/repo", ref: <ref 第一段> }` |
| 其它 `http(s)://` URL，去掉协议与主机后恰好是 `owner/repo[/.git]` 两段 | 原样作为 `url`（沿用 `packages/resources/plugins/src/inspect.ts:139-148` 的判据） |
| `git://`、`ssh://`、`git@host:path`、`file://`、绝对路径 | 原样作为 `url`（git 自己认识） |
| 其它（含 `https://host/file.zip` 这类非仓库路径） | `null`（检查时报可读错误，安装仍可继续） |

限制（写进注释）：

- `/tree/<ref>/...` 只取 `<ref>` 的第一段；带斜杠的分支名会被截断，检查会报 “no refs/heads/…”。这是已知取舍，不引入额外探测。
- 不解析 `#ref`、不专门支持 tag。skills CLI 对带 ref 的 source 实际写什么尚未验证，见 §8。
- 私有仓库依赖本机已有的 git 凭据；子进程禁止交互式弹窗。

同一文件提供：

```ts
export interface GitTarget { url: string; ref?: string }
export function parseGitSource(source: string): GitTarget | null
/** 从 ls-remote 的原始输出里按 ref 精确取 sha；纯函数，便于测试。 */
export function parseRemoteRevision(output: string, ref?: string): string | null
/** 抛错版本：给检查用，错误消息要能直接展示。 */
export function readRemoteRevision(target: GitTarget): Promise<string>
```

`readRemoteRevision`：

- `execFile("git", ["ls-remote", "--", url, ref ?? "HEAD"], { cwd: tmpdir(), timeout: 30_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", SSH_ASKPASS: "", SSH_ASKPASS_REQUIRE: "never", LC_ALL: "C" } })`；
- 逐行解析 `<sha>\t<ref>`，**精确匹配**第二列：无 ref 时匹配 `HEAD`，有 ref 时匹配 `refs/heads/<ref>`；
- sha 接受 `/^[0-9a-f]{7,64}$/i`；
- 错误消息：
  - 调用方在 `parseGitSource` 返回 `null` 时报：`the recorded source cannot be asked for a revision: <source>`；
  - `ENOENT`：`git is not on PATH; update checks need git installed`；
  - 超时：`git ls-remote did not finish in 30s for <url>`；
  - 非零退出：`git ls-remote failed for <url>: <stderr 最后一行>`；
  - 没有匹配 ref：`<url> has no <HEAD|refs/heads/x>`。

### 3.3 检查

- `checkUpdates`：
  1. 遍历 catalog，跳过无 `upstream` 的行；
  2. `parseGitSource` 失败的行直接进 `failed`，原因用上面的可读消息；
  3. 其余按 `(url, ref)` 分组，`ref` 缺省按 `HEAD`；
  4. 每组一次 `readRemoteRevision`，并发 8（`CHECK_CONCURRENCY = 8`），单次 30s；
  5. 一组失败只把该组所有名字写进 `failed`，其它组继续；
  6. `recordChecks` 仍本地算 `skillFolderHash`，写 `checked: { at, latest: <commit>, currentHash }`；
  7. `outdated` 用 `ahead(upstream, latestRevision)` 计数，`modified` 用 `currentHash !== upstream.hash`。
- `checkUpdate(name)`：单行同样流程；无 `upstream` 抛 `no recorded source…`；解析失败抛可读消息；返回 §3.1 的 `SkillUpdateCheck`。
- 老数据（无 `revision`）：照常请求远端并记录 `checked`；`ahead` 返回 `true`。列表徽标显示“有更新”；详情弹窗在检查之后把结果文案写成“需更新一次”（见 §3.6），按钮是“更新”。更新成功后写入 `revision`，回到正常比较。
- 不为“本地是否被改过”增加 catalog 重建时的 hash 计算：`refreshCatalog` 由 watcher 频繁触发，逐目录 hash 会把每次外部改动变成全库 IO；`modified` 继续只在检查时计算（与今天一致）。取舍写进计划即可，不改 `rebuild`/`carried`。

### 3.4 安装、采纳、更新时记录 revision

- `SkillStoreOptions`（`skills-fs.ts:331-352`）增加测试缝：

  ```ts
  /** 读取一个已解析来源的当前 commit；测试用它避免联网。 */
  resolveRevision?: (target: GitTarget) => Promise<string>
  ```

  默认实现是 `readRemoteRevision(target)`。检查类调用不吞错；安装类调用 `.catch(() => null)`。测试注入的桩对两条路径都生效。
- `downloadPackageSkills` 保持纯 CLI，不引入 git。`installPackage` 在调用它**之前**解析一次 `source`（整包一次），成功后把 `revision` 合并进 `result.records` 的每条记录，再写 `upstream`。
- `adoptFrom` **不记录 revision**：place 里的 lock 只有安装时的目录 hash，没有 commit；把“当前远端 HEAD”当成“这份副本安装时的 commit”，会在上游已经前进时把旧副本标成最新，造成静默漏报。采纳后的行是“未跟踪”，检查会提示更新一次；更新时用内容 hash 判断是否真的替换，再写入 revision。
- `updateFromUpstream`：在跑 CLI **之前**解析一次 `upstream.source`。方向取舍：先解析可能记录得略旧（解析后上游又前进），结果是多报一次更新；后解析可能记录得比实际内容新，会漏报真正的更新。选先解析。
- 失败处理分两类：
  - 来源无法解析成 git（`parseGitSource` 返回 `null`）：安装/更新照常完成，不写 `revision`；若该行原本有 `revision`，一并清除，避免拿旧答案继续比较。
  - 来源能解析但 `ls-remote` 失败：安装可以继续（不记录 revision）；**更新直接失败并保持文件不动**——否则会把新内容装进来却留着旧 revision，下一次检查必然误报。错误消息原样返回 UI。

### 3.5 更新

`updateFromUpstream` 新流程：

1. `target = parseGitSource(upstream.source)`；`target === null` 时 `revision = null`，否则 `revision = await readRemoteRevision(target)`。能解析但读取失败时抛错，文件不动（理由见 §3.4）；
2. 跑 CLI 安装到临时目录，拿 CLI 报告的新 `hash`（`result.records[landed].hash`）；lock 没给 hash 时对**临时目录里的新副本**求 `skillFolderHash(path.join(work, landed))`，不能对旧目录求值（旧写法在替换之后才求，顺序必须调整）；
3. **`fresh === upstream.hash` 时跳过 `replaceDirectory`**：仓库 HEAD 前进了，但这个 skill 目录内容没变，不覆盖本地文件（包括用户的手改），只推进 `revision` 与 `checked`。`checked.currentHash` 取本地当前 hash（`skillFolderHash(target)`），所以本地改过的行仍然保持 `modified: true`；
4. 内容不同则照旧 `replaceDirectory`，`checked.currentHash = fresh`；
5. 写回：
   ```ts
   upstream: { ...upstream, hash: fresh, ...(revision === null ? {} : { revision }) }
   checked: revision === null
     ? next.checked                       // 读不到 commit 时不伪造答案
     : { at: now, latest: revision, currentHash }
   ```
6. 更新后仍 `refreshCatalog()`。如果发生了替换，`carried` 会按 manifest mtime 更新 `updatedAt`；跳过替换时日期不动。

### 3.6 API、UI 与文案

- action 名不变：`check-update` / `check-updates` / `update-from-upstream`；`SkillUpdateSummary` 字段不变（`checked / outdated / modified / failed`）。
- `skill-detail-dialog.tsx` 的 `known` 改为用纯函数，不再手写比较：
  ```ts
  {
    recordedRevision: upstream.revision ?? null,
    latestRevision: checked.latest,
    currentHash: checked.currentHash,
    outdated: outdated(skill),
    modified: modified(skill),
  }
  ```
- 检查结果文案：`outdated && recordedRevision === null` 时显示新增的 `skills.update.untracked`，否则沿用 `skills.update.available`。按钮仍是“更新”。
- `library.ts` 的自动更新改写：`{ ...result, recordedRevision: result.latestRevision, outdated: false }`（`modified` 保留 `result.modified`；`currentHash` 不在这里重读，行随后由 `reload()` 刷新）。
- `CheckBadge`、`updatableNames` 语义不变：只是 `outdated()` 的来源从 hash 比较换成 revision 比较。

### 3.7 兼容性

不写迁移代码，读取容错即可：

- 旧行的 `upstream.revision` 不存在；`checked.latest` 里是旧 hash，但只有 `revision` 存在时才会被比较，所以不会被误读。
- 旧行一旦被检查，`checked` 会被新格式覆盖；一旦被更新，`revision` 被写入。
- 升级后第一次检查会把所有旧行算作 `outdated`（主动提示“更新一次”）。如果用户开着 `autoDownload`，这些行会在一轮里被自动更新。这是行为变化，见 §7 的拍板项。

## 4. 阶段

每个阶段结束时仓库应能通过该阶段列出的命令。

### 阶段 1：新增 git 来源解析

目标：有一个只依赖 `git` 的模块，能把 lock 里的 `source` 变成 `(url, ref)` 并读回 commit。

改动文件：

- 新增 `packages/resources/skills/src/host/git-source.ts`，实现 §3.2。
- 新增 `packages/resources/skills/__test__/git-source.test.ts`：
  - `owner/repo` → GitHub URL；
  - `https://github.com/o/r`、`…/r.git` 原样；
  - `…/tree/main`、`…/tree/main/skills/x` → `ref: "main"`；
  - `git@github.com:o/r.git`、`ssh://…`、`file:///…`、`C:\repo`、`/repo` 原样；
  - `""`、`not a source`、`https://example.com/download.zip` → `null`；
  - `parseRemoteRevision` 用 §2.2 那条两行输出（`HEAD` + `refs/remotes/origin/HEAD`）断言只取 `HEAD` 那一行；带 ref 时按 `refs/heads/<ref>` 精确匹配，没有匹配返回 `null`；
  - 在 `mkdtemp` 里 `git init` + 一次提交，用 `pathToFileURL` 断言 `readRemoteRevision` 返回 40 位 sha；分支匹配用 `parseRemoteRevision(<那条 refs/heads/... 输出>, "<branch>")` 断言，因为解析器不对 `file://` 提取 ref。不联网。

验收：

```
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills exec vitest run __test__/git-source.test.ts
pnpm --filter @context-hub/skills lint
```

### 阶段 2：记录安装 revision

目标：新安装、采纳、更新写下的 `upstream` 带上 commit；检查逻辑暂不改。

改动文件：

- `src/store.ts`：`SkillUpstream` 增加 `revision?: string`，更新 `SkillUpstream` / `SkillCheck` 的文档。
- `src/host/skills-fs.ts`：
  - `SkillStoreOptions` 增加 `resolveRevision?`，在 `createFsSkillStore` 内解析成 `revisionOf`（记录类调用吞错为 `null`）；
  - `installPackage`：CLI 之前解析一次 `source`，把 `revision` 合并进 `result.records`；
  - `adoptFrom`：读 lock 后解析，写行时合并；
  - `updateFromUpstream`：CLI 之前解析，写回 `upstream` 时合并（本阶段不改“内容未变跳过替换”）。
- `__test__/place-skills.test.ts`：注入 `resolveRevision`，断言**采纳后的行没有** `upstream.revision`（adopt 不猜版本）；安装路径另有用例断言 revision 被写入。
- `__test__/updates.test.ts`：安装用例断言 `upstream.revision` 等于 fixture 仓库的 `git rev-parse HEAD`；更新用例断言 revision 前进到新 commit。检查相关断言暂时保持 hash 语义。

验收：

```
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills exec vitest run __test__/updates.test.ts __test__/place-skills.test.ts
pnpm --filter @context-hub/skills test
```

### 阶段 3：重写检查与更新判定

目标：检查不再跑 skills CLI；判定、API、UI 全部改读 revision。

改动文件与要点：

- `src/store.ts`：新增 `ahead`；重写 `outdated`；`SkillUpdateCheck` 改为 `recordedRevision / latestRevision / currentHash / outdated / modified`；更新 `SkillStore.checkUpdate(s)` 的文档（“one ls-remote per source”）。
- `src/host/skills-fs.ts`：
  - 删除 `fetchUpstreamRecords` 的 import；
  - `CHECK_CONCURRENCY = 8`，注释改为“每个来源一次 ls-remote 往返”；
  - `askSources` 重写为按 `(url, ref)` 分组的 `askRemoteRevisions`（§3.3），解析失败直接进 `failed`；
  - `checkUpdate` / `checkUpdates` 按 §3.3 改写，计数用 `ahead`；
  - `updateFromUpstream` 按 §3.5 改写（内容未变跳过替换）。
- `src/host/skills-cli.ts`：删除 `fetchUpstreamRecords` 与 `UpstreamRecords`（改写后无调用方）。保留 `downloadPackageSkills`、`listPackageSkills`、`npxInvocation`、`dropWork`、`stripAnsi`，以及工作区里已有的 `parsePackageList` 改动。
- `src/library.ts:636-658`：自动更新后的返回值改用新字段。
- `src/skill-detail-dialog.tsx:366-376`：`known` 改用 `outdated` / `modified` 与 revision 字段；`:427-438` 文案链增加 `skills.update.untracked`。
- `src/messages.ts`（英文）与 `packages/i18n/zh-cn/src/messages.ts`：新增 `skills.update.untracked`。
- `src/host/upstream.ts` 文件头、`src/page.tsx:413-417` `CheckBadge` 的注释：把“重跑 CLI 比较 hash”改成“读远端 commit、本地 hash 只判手改”。
- `__test__/update-settings.test.ts`：`row()` 增加 `revision` 参数（`upstream.revision`），`checked.latest` 仍然传 revision 值；补一条“无 revision + 有 checked → 可更新”的用例。
- `__test__/updates.test.ts`：删除 `fetchUpstreamRecords` 的 import 与文件末尾那条空输入用例；检查相关断言从 hash 改为 revision（`checked.latest === upstream.revision`、`checkUpdate().latestRevision` 等）；`ghost-test` 仍用不可达的 `file://` 来源。

验收：

```
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/skills lint
pnpm --filter @context-hub/zh-cn typecheck
```

### 阶段 4：补齐回归测试

目标：把这次改动的每条行为都钉住，尤其是旧数据与“内容未变”的两条分支。

改动文件：`packages/resources/skills/__test__/updates.test.ts`（为主）、`store.test.ts`、`update-settings.test.ts`。

用例清单：

1. **安装记录 revision**：安装后 `upstream.revision` 等于 fixture 的 `git rev-parse HEAD`，`hash` 仍是 64 位。
2. **检查发现新 commit**：fixture 提交新版本后 `checkUpdates().outdated === 1`；未变的 skill 仍是最新。
3. **单检查只报手改**：手改文件后 `checkUpdate` 返回 `modified: true, outdated: false`。
4. **更新推进 revision**：`updateFromUpstream` 后 `upstream.revision` 等于新 HEAD，内容被替换，`checked.latest === upstream.revision`，再检查 `outdated === 0`。
5. **HEAD 变了但目录没变**：先手改本地（写一个标记文件），再在 fixture 里只改另一个 skill 并提交；`updateFromUpstream` 后标记文件仍在、`revision` 已前进、`modified` 仍为 true。
6. **旧数据无 revision**：先 `dispose()` 当前 store，把一行真实安装出来的记录的 `revision` 从 `skills.json` 删掉，再重开 store；`checkUpdate` 返回 `recordedRevision: null, outdated: true`；`updateFromUpstream` 后 `revision` 写入、`outdated: false`。
7. **一个来源失败不影响其它**：`ghost-test` 行仍进 `failed`，其余行 `checked` 正常。
8. **无来源不可检查**：`checkUpdate` 对无 `upstream` 的行抛 `no recorded source`（沿用现有用例）。
9. **旧 catalog 保留 revision**（`store.test.ts`）：迁移用例的 `upstream` 加 `revision`，断言扫描后仍在。
10. **自动更新判定**（`update-settings.test.ts`）：有 revision 时按 revision 比较；无 revision + 有 checked 时视为可更新；无 revision 且无 checked 时不算。
11. **同一来源只问一次**：两个 skill 共享一个来源时，注入一个计数的 `resolveRevision`，断言 `checkUpdates` 只调用一次（分组去重）。
12. **更新时读不到 commit**：注入一个抛错的 `resolveRevision`，`updateFromUpstream` 拒绝且本地文件不变；来源不可解析时更新仍成功，并清除该行原有的 `revision`。

验收：

```
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/skills lint
```

### 阶段 5：维护 AOCI

目标：受管文件改完后同步认知条目。

做法：

- `aoci_get_entries({ dir: "packages/resources/skills" })` 读本次涉及的条目；
- 跑 `aoci_maintain`，按返回的候选与绑定的源码摘要提交 `aoci_update_entry`；
- 语义以 §3 的实现为准：`SkillUpstream.revision`、`SkillCheck.latest` 的新含义、检查改为 `ls-remote`、`updateFromUpstream` 的“内容未变跳过替换”。

验收：`aoci_maintain` 不再报本次改动文件的漂移；`pnpm typecheck`（根）通过。

## 5. 测试与验证命令汇总

本包脚本（`packages/resources/skills/package.json`）：`typecheck` = `tsc --noEmit`，`test` = `vitest run`，`lint` = `eslint`。

```
pnpm --filter @context-hub/skills typecheck
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/skills lint
pnpm --filter @context-hub/skills exec vitest run __test__/updates.test.ts
pnpm --filter @context-hub/zh-cn typecheck
pnpm typecheck          # 根，turbo 全包
```

- `__test__/updates.test.ts` 需要 PATH 上有 `git`（现状即如此），不访问外网。
- 新用例不得把 `mattpocock/skills` 一类 GitHub 简写交给会联网的路径；`place-skills.test.ts` 通过 `resolveRevision` 注入避免联网。
- 跑完后用 `git status --short` 确认没有测试写进真实 hub home（测试均用 `mkdtemp`）。

## 6. 不做

- 不改安装/更新机制：仍然跑 `npx skills add … --copy`。
- 不改自动检查/自动更新的设置项、调度与文案（`update-settings.ts` 只改测试）。
- 不引入 tag 或按分支 pin 的专门支持；`#ref` 语法不解析。
- 不删除 `hash`，不改 `modified` 的语义。
- 不在 catalog 重建（`rebuild` / `carried`）时预计算目录 hash。
- 不写迁移代码；旧数据靠读取容错与“更新一次”收敛。
- 不改 `packages/resources/plugins` 的 probe/fetch，也不把 git 工具抽到 `packages/core`。
- 不改 place 的安装/卸载逻辑、详情弹窗其余布局、列表徽标语义。
- 不改 `skills-lock.json` 的读取字段（仍从 lock 拿 `source / skillPath / hash`）。

## 7. 风险与需要拍板的分叉

1. **旧数据（无 revision）的处理**（推荐方案，需确认）：检查成功后算“可更新”，详情弹窗显示“需更新一次”，用户点一次更新即写入 revision；若开着 `autoDownload`，升级后的第一次检查会把它们自动更新。备选是把它们放进 `failed`/`unanswerable` 不给更新入口——那会让旧行在 UI 里成为死路，不推荐。
2. **“HEAD 变了但 skill 目录没变”是否跳过替换**（推荐跳过）：跳过可以保住本地手改，也只推进 revision；备选是维持现状总是替换，会覆盖手改。需要确认。
3. **`git` 成为运行时前置**：能装不能查的形态（PATH 上没有 git）会得到明确错误；安装仍可用但不记录 revision。是否接受这个前置条件。
4. **模块边界**：在 skills 内新写约 60 行 git 工具，重复了 plugins 已有的实现；抽到 `@context-hub/core` 需要同时改 plugins，超出本次范围。推荐先在 skills 内实现，后续再抽。
5. **tag/分支 pin**：按默认分支 HEAD 比较；从 tag 或非默认分支安装的 skill 会在默认分支前进后报“有更新”，更新会把它带到默认 HEAD（CLI 现状如此）。用户已说明基本来自主分支，确认接受。

## 8. 待验证

1. skills CLI 对带 ref 的 source 会往 lock 里写什么：
   ```
   TMP=$(mktemp -d) && cd "$TMP" && npx skills add "mattpocock/skills#main" -a universal --copy -y --json >/dev/null; cat skills-lock.json
   ```
   需要网络。若 `source` 含 `#ref`，在阶段 1 的 `parseGitSource` 里补一个按 `#` 拆 ref 的分支（照 `packages/resources/plugins/src/inspect.ts:92-98` 的 `splitRef`），并补对应用例；若不支持，检查会给出“无法解析来源”的可读错误。
2. 打包后的桌面形态 PATH 上是否有 git：
   ```
   git --version
   ```
   在启动桌面应用的同一环境执行；缺失时检查会报 §3.2 的错误。
3. 私有仓库的 `ls-remote` 是否能用本机已缓存的凭据（`GIT_TERMINAL_PROMPT=0` 下）。用一个私有 repo 跑一次 `checkUpdate` 观察结果；失败则记录为已知限制。

## 9. 关键文件清单

- 新增：`packages/resources/skills/src/host/git-source.ts`、`packages/resources/skills/__test__/git-source.test.ts`
- 修改：`packages/resources/skills/src/store.ts`、`src/host/skills-fs.ts`、`src/host/skills-cli.ts`、`src/host/upstream.ts`（注释）、`src/library.ts`、`src/skill-detail-dialog.tsx`、`src/page.tsx`（注释）、`src/messages.ts`、`packages/i18n/zh-cn/src/messages.ts`、`__test__/updates.test.ts`、`__test__/update-settings.test.ts`、`__test__/place-skills.test.ts`、`__test__/store.test.ts`
