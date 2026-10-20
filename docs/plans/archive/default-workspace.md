# 默认工作区：持久化、置顶、不可删除

## 背景

桌面端启动 hub server 时把 cwd 设成用户主目录（`apps/desktop/src/main.ts:168`，`cwd: app.getPath("home")`），server 的 `hostFolder()` 因此返回该目录（`packages/core/src/host/fs-browse.ts:38`，`projectRoot(process.cwd())`；主目录没有 `.git` 时返回自身）。`createFsWorkspaceStore` 的 `adoptHostFolder`（`packages/core/src/host/workspaces-fs.ts:58`）在每次 `read()` 时把这个 host folder 追加为一行工作区：

- 追加在 `state.folders` 末尾，不写 alias，也没有任何“默认”标记；
- `view()`（`packages/core/src/host/workspaces-fs.ts:45`）用 `folder.alias ?? folder.name` 作为显示名，于是桌面端显示 `hl131`（`workspaceName` 取路径最后一段，`packages/core/src/workspace.ts:142`）；
- 该行可以被 `remove` 删除，但下一次 `read()` 又会被 `adoptHostFolder` 加回来；
- 列表顺序就是文档顺序，默认行排在用户自己添加的工作区之后。

本次修订把“默认工作区”从视图层计算改成**持久化数据**：`workspaces.json` 里写入 `"default": true` 和系统别名对象，server 启动时扫描并修复文档，`page()` 不再排序。

用户要求：

1. 默认工作区由宿主（server/core）在启动时确保存在，不是前端逻辑。
2. 不可删除：后端 `remove` 拒绝，前端菜单不显示删除项。
3. 默认显示名为 i18n 文案“默认工作区”/“Default workspace”，不是 `hl131`；用户可重命名。
4. 永远排在数组第一位。
5. 路径不变：仍是 host 自身文件夹（桌面端 = `app.getPath("home")`），不改到 hub 专用目录。

## 期望行为

1. `workspaces.json` 的默认行形如：

```json
{
  "name": "hl131",
  "path": "C:\\Users\\hl131",
  "alias": { "i18n": "workspace.defaultName" },
  "default": true
}
```

2. server 在 `listen()` 之前完成一次扫描；之后每次 `read()` 也走同一套扫描（惰性自愈）。重复执行不重复添加、不覆盖用户已有的字符串 alias。
3. 文档里默认行始终在 `folders[0]`；`page()` 按文件顺序返回，不做视图排序。
4. `WorkspaceView` 暴露 `default: boolean` 与 `nameKey: string | null`；前端 `label = nameKey ? t(nameKey) : name`。
5. 默认行可选中、可重命名；`remove(defaultId)` 被后端拒绝（沿用现有 `sendError` 的 400）。
6. 非默认行保留现有行为：菜单有“重命名”和“删除工作区”；输入空串或文件夹名清掉 alias。
7. 默认行隐藏 `~` hint 仍是待确认项（见“待确认”）。

## 已确认事实

以下均为本次读到的代码事实，不是推测。

- `WorkspaceFolder` 在 `packages/core/src/workspace.ts:22-31`，目前 `alias?: string`；`WorkspaceView` 在 `:34-42`。
- `readWorkspaceState` 在 `packages/core/src/workspace.ts:156-189`：目前 alias 只认非空字符串（`:176`），`default` 字段完全未读取。
- `folderId(folder) = folder.path ?? folder.name`（`:132-134`）。
- `createFsWorkspaceStore` 在 `packages/core/src/host/workspaces-fs.ts:39`；`view` 在 `:45-51`；`adoptHostFolder` 在 `:58-80`；`read` 在 `:168-171`；`page` 在 `:173-176`；`rename` 在 `:219-238`；`remove` 在 `:240-253`。
- 现在 alias 的读取点只有两处：`readWorkspaceState`（`:176`）和 `view`（`:48`）；没有其他 `folder.alias` 调用方（全仓 grep 确认）。
- 状态文件是 `<hub home>/state/workspaces.json`：`stateRoot`/`createFsStateStore` 在 `packages/core/src/host/state-fs.ts:15-59`，`STATE_DIR = "state"`（`packages/core/src/state.ts:13`）。
- `createWorkspaceHandler` 在 `packages/core/handlers.ts:529`；`getStore()` 惰性创建，`folder = options.folder ?? await hostFolder()`（`:532-539`）。
- `apps/web/server.ts:107-110` 把 `--home` / `--folder` 收进 `placed`；`:128` 挂载 `createWorkspaceHandler(placed)`；`:142` 才 `listen()`。
- 桌面端 bundle 的 server 入口就是 `apps/web/server.ts`（`apps/desktop/bundle.ts:19`）；dev 形态 `apps/web/dev.ts:41-45` 以 `cwd: apps/web` 启动同一入口。
- `useI18n()` 的 `t` 类型是 `t(key: string): string`（`packages/extensions/src/react.tsx:91-95`）；`I18nService.t` 的实现是 `this.table.get(key) ?? key`（`packages/extensions/src/i18n.ts:72-74`）。因此 `t(folder.nameKey)` 可以直接接受动态字符串，未知 key 会原样显示 key，不会抛错。
- 前端服务在 `apps/web/src/lib/workspaces.ts`：`samePage` 在 `:20-36`，`createRemoteWorkspaceService` 在 `:59`；`apps/web/src/lib/hub.ts:198-203` 在启动时调用 `void workspaces.refresh()`。
- 侧栏在 `apps/web/src/components/workspace-group.tsx`：列表映射 `:152`，`hint={folder.display}` `:157`，重命名菜单项 `:184-190`，删除菜单项 `:191-198`，重命名弹窗 `RenameDialog` `:38-115`，空值禁用保存 `:108`。
- i18n：英文基础表在 `packages/extensions/src/builtin/locale-en.ts:81-94`，中文包在 `packages/i18n/zh-cn/src/messages.ts:86-99`；中文覆盖测试在 `packages/i18n/zh-cn/__test__/messages.test.ts:75-88`，它用正则扫描字面量 `"key": "value"`。
- 现有测试：`packages/core/__test__/workspaces.test.ts`（host folder 用例在 `:254-335`）；`apps/web/__test__/bridge.test.ts`（workspace 用例在 `:91-144`）。`apps/web` 没有组件/DOM 测试，`vitest.config.ts` 的 `environment` 保持 node。
- 根 `package.json`：`test` = `vitest run`，`typecheck` = `turbo typecheck`，`lint` = `turbo lint`；各包 `vitest.config.ts` 的 project 名是 `core`、`web`、`zh-cn`、`extensions` 等。
- 其他 `createFsWorkspaceStore` 调用方：`packages/core/src/host/place-files.ts:62`、`packages/resources/skills/src/host/skills-fs.ts:370`、`packages/resources/mcp/handlers.ts:38`、`packages/resources/plugins/handlers.ts:121`。它们只读 `page.current` 对应行的 `path`。
- 当前工作树有另一个会话正在改 global-search 相关文件（`packages/resources/*/src/search.ts`、`page.tsx`、`packages/search/global-search/*`、`packages/extensions/src/react.tsx`、`docs/plans/global-search-precision-jump.md`）。本任务不碰这些文件。

## 设计决定

### 1. 数据模型：持久化 `default`，alias 变成联合类型

```ts
/** 系统给的显示名：存 i18n key，由前端翻译。 */
export interface WorkspaceI18nAlias {
  i18n: string
}

/** 人给的名字（字符串），或系统给的 i18n key。 */
export type WorkspaceAlias = string | WorkspaceI18nAlias

export interface WorkspaceFolder {
  name: string
  path?: string
  alias?: WorkspaceAlias
  /** 宿主自己的文件夹：只写 true，永远在数组第一位，不可删除。 */
  default?: boolean
}

/** 默认工作区别名指向的 i18n key，store 与前端共用。 */
export const DEFAULT_WORKSPACE_NAME = "workspace.defaultName"
```

- `default` 只写 `true`；非默认行不写这个字段。`readWorkspaceState` 只认 `entry.default === true`。
- alias 字符串语义不变；alias 对象只认 `{ i18n: 非空字符串 }`，其他值丢弃。对象的其他字段不保留。
- 持久化是本次的核心：视图层不再计算默认身份，所有 store 调用方读到的都是同一份文档事实。

### 2. 启动与读取共用同一套扫描：`ensureHostWorkspace`

把现有 `adoptHostFolder` 改造成 `ensureHostWorkspace(state)`，`read()` 仍然调用它：

```ts
const read = async (): Promise<WorkspaceState> =>
  adoptNamedRows(
    await ensureHostWorkspace(
      readWorkspaceState(await documents.read(WORKSPACE_DOCUMENT))
    )
  )
```

顺序保持现有 `read()` 的“先处理 host folder、再修 name-only 行”，只是把 `adoptHostFolder` 替换为 `ensureHostWorkspace`。`ensureDefaultWorkspace` 仍然只做 `(await openWorkspaceStore(options)).page()`，因此启动扫描和惰性读取走的是同一段代码。

`ensureHostWorkspace` 在 `options.folder === undefined` 时原样返回（和现在 `adoptHostFolder` 一样）；否则按以下顺序处理：

1. **已有 `default: true` 的行**
   - 按文件顺序取第一个 default 行作为保留行；其余 default 行清除 `default`（保留它们的 name/path/alias），并写盘。
   - 保留行不在 `folders[0]` 时移到第一位；其余行保持相对顺序；写盘。
   - 保留行的字符串 alias / i18n alias 都保留不动；alias 缺失时不保留 `hl131` 这种文件夹名，补 `{ i18n: DEFAULT_WORKSPACE_NAME }` 并写盘（用户自己改过的 alias 不会被覆盖）。
   - `current === null` 时指向保留行；否则不改。
2. **没有 default 行，但有 `path === options.folder` 的行**
   - 该行加 `default: true`；alias 缺失时写 `{ i18n: DEFAULT_WORKSPACE_NAME }`，已有字符串/对象 alias 保持不动。
   - 移到 `folders[0]`；`current === null` 时指向它；写盘。
3. **没有 default 行，也没有同 path 行**
   - 先找 `path === undefined && name === workspaceName(options.folder)` 的旧行（兼容旧文档）：找到则补 `path`、`default: true`、缺失时补 i18n alias，移到第一位；`current === null` 或 `current` 等于该旧行原来的 name id 时指向新 path id；写盘。
   - 找不到则新建 `{ name: workspaceName(folder), path: folder, alias: { i18n: DEFAULT_WORKSPACE_NAME }, default: true }`，插到数组最前；`current === null` 时指向它；写盘。
   - 只有在这一步和上一步需要 `isDirectory(options.folder)` 检查（沿用现有 `adoptHostFolder` 的安全检查）；已有 default 行的清理/置顶不依赖文件夹当前是否可读。`options.folder` 不存在时分支 2/3 不执行，state 原样返回。

`ensureHostWorkspace` 返回新的 state 并只在有变化时写盘；`read()` 的其余逻辑（`adoptNamedRows`、name-only 修复）保持不变。

### 3. 文件顺序即显示顺序，`page()` 不排序

- `page()` 直接 `state.folders.map(view)`，和现在一样。
- 默认行由 `ensureHostWorkspace` 写到第一位；之后：
  - `add` 追加到末尾，默认行仍在 `[0]`；
  - `remove` 过滤；默认行被后端拒绝，其他行删除后默认行仍在 `[0]`；
  - `rename` / `select` / `setAgent` 都是原位修改，不改变数组顺序；
  - `adoptNamedRows` 原位替换，不改变顺序；
  - 每次动作都先 `read()`，所以手编乱序文档会先被扫描修正，再执行动作。
- 结论：`add` / `remove` 不会破坏第一位，不需要视图排序。

### 4. `remove` 拒绝默认行

- `remove` 在“当前工作区”检查之前判断 `folder.default === true`，抛 `new Error("the default workspace cannot be removed")`。
- HTTP 状态沿用 `sendError` 默认 400（`packages/core/src/host/http.ts:111`）；不新增错误类型或 409。
- 前端在 `folder.default` 时只渲染“重命名”，删除项整个不渲染。
- `WorkspaceStore.remove` 的 JSDoc 补一句“默认工作区被拒绝”。

### 5. `WorkspaceView` 与前端显示

```ts
export interface WorkspaceView {
  id: string
  name: string            // 字符串 alias，或文件夹名
  path: string | null
  display: string | null
  default: boolean        // 持久化字段的投影
  nameKey: string | null  // alias 对象的 i18n key；没有时为 null
}
```

`view` 的实现：

```ts
const alias = folder.alias
const name = typeof alias === "string" ? alias : folder.name
const nameKey = typeof alias === "object" && alias !== null ? alias.i18n : null
return {
  id: folderId(folder),
  name,
  path: folder.path ?? null,
  display: folder.path === undefined ? null : displayPath(folder.path),
  default: folder.default === true,
  nameKey,
}
```

前端：

```ts
const label = folder.nameKey === null ? folder.name : t(folder.nameKey)
```

- `t` 的实际类型是 `(key: string) => string`，动态字符串可用；未知 key 原样显示（`I18nService.t` 的 `?? key`）。
- 不需要类型断言，也不需要把 `nameKey` 收窄成已知 key 的联合。
- `samePage` 增加 `folder.default === other.default` 和 `folder.nameKey === other.nameKey`。

### 6. 重命名语义

前后端约定：**默认行提交空串表示“恢复系统默认名”**；非默认行空串仍表示“清掉 alias”。

- 前端初值：默认行显示 `t(DEFAULT_WORKSPACE_NAME)`（有字符串 alias 时显示 alias）；非默认行显示 `name`。
- 前端提交前：
  ```ts
  // 默认行
  next.trim() === "" || next.trim() === t(DEFAULT_WORKSPACE_NAME) ? "" : next
  // 非默认行
  next
  ```
- store 的 `rename(id, name)`：
  - 默认行：`name.trim() === ""` → `alias: { i18n: DEFAULT_WORKSPACE_NAME }`；否则 `alias: name.trim()`（字符串）。保留 `default: true`、`name`、`path`。
  - 非默认行：保持现有逻辑——空串或等于文件夹名时重建 `{ name, path }`（清 alias）；否则写字符串 alias。
- 默认行输入等于文件夹名时按“自定义字符串 alias”处理（需求只规定非默认行等于文件夹名才清 alias）；这是一条明确的取舍，写进风险。
- `RenameDialog` 增加可选 `allowEmpty`：默认行允许清空后保存（提交空串，store 写回 i18n alias）；非默认行保持“空值禁用保存”。

### 7. `adoptHostFolder` 的去向与其他 store 调用方

- 采用**共用一套扫描**：`adoptHostFolder` 被 `ensureHostWorkspace` 取代，`read()` 每次都调用它；`ensureDefaultWorkspace` 只是提前触发一次 `page()`。
- 这样所有直接使用 `createFsWorkspaceStore` 的调用方（`place-files.ts`、`skills-fs.ts`、`mcp/handlers.ts`、`plugins/handlers.ts`）即使没有经过 server 的启动 ensure，第一次 `page()` 也会完成同样的升级/新增/置顶，不会失去现有 host folder 行为。
- 这些调用方只读 `page.current` 的 `path`，新增的 `default` / `nameKey` 字段和持久化 alias 不影响它们。
- 没有传 `options.folder` 的 store（例如 dev 下的 skills store）不会新增/升级宿主行，但会读到文档中已经写好的默认行；它们不渲染 workspace 列表，行为不变。

### 8. i18n

- key：`workspace.defaultName`。
- 英文（`packages/extensions/src/builtin/locale-en.ts`）：`"workspace.defaultName": "Default workspace"`。
- 中文（`packages/i18n/zh-cn/src/messages.ts`）：`"workspace.defaultName": "默认工作区"`。
- 两个语言表都必须写成**字面量 key**，不要用 `[DEFAULT_WORKSPACE_NAME]` 计算属性：中文覆盖测试用正则扫描 `"key": "value"`，计算属性会让 key 不被计入，导致覆盖检查误判。
- 后端错误文本保持英文，和现有 `"this workspace is in use; ..."`、`"not a known workspace: ..."` 一致。

## 受影响文件

| 文件 | 改动 |
| --- | --- |
| `packages/core/src/workspace.ts` | `WorkspaceI18nAlias` / `WorkspaceAlias` / `WorkspaceFolder.default`；`DEFAULT_WORKSPACE_NAME`；`WorkspaceView.default` / `nameKey`；`readWorkspaceState` 校验新字段；`remove` JSDoc |
| `packages/core/src/host/workspaces-fs.ts` | `adoptHostFolder` → `ensureHostWorkspace`（三分支 + 多 default 清理 + 置顶）；`view` 输出新字段；`rename` 默认行写 i18n alias；`remove` 拒绝默认行；`page` 不排序 |
| `packages/core/handlers.ts` | 抽出 `openWorkspaceStore`；导出 `ensureDefaultWorkspace`；`createWorkspaceHandler` 复用 |
| `apps/web/server.ts` | listen 前 `await ensureDefaultWorkspace(placed)`，失败告警 |
| `apps/web/src/lib/workspaces.ts` | `samePage` 比较 `default` / `nameKey`；新增纯函数 `workspaceLabel` / `renameSubmission` |
| `apps/web/src/components/workspace-group.tsx` | `label` 用 `nameKey` 翻译；默认行隐藏删除项；重命名初值与提交映射；`allowEmpty`；hint 待确认 |
| `packages/extensions/src/builtin/locale-en.ts` | 新英文 key |
| `packages/i18n/zh-cn/src/messages.ts` | 新中文 key |
| `packages/core/__test__/workspaces.test.ts` | 落盘 default/alias、升级、新增、置顶、多 default、重复 ensure、remove、`readWorkspaceState` 校验 |
| `apps/web/__test__/bridge.test.ts` | 真实 HTTP + 客户端覆盖 default/nameKey、置顶、拒绝删除、alias 重命名 |
| `apps/web/__test__/workspace-name.test.ts`（新） | `workspaceLabel` 的 nameKey 渲染；`renameSubmission` 的默认文案/空串/自定义名 |

不需要改动：`apps/desktop/src/main.ts`（cwd 不变）、`packages/core/src/workspace.ts` 的 `folderId` / `workspaceName` 语义、`apps/web/src/components/sidebar-rows.tsx`、各资源模块的 handler、`packages/core/package.json`（`./handlers` 已导出）、任何 fixture / 配置。

## 阶段一：实现持久化默认工作区与扫描

**目标**：文档能持久化 `default` / alias 对象；启动与惰性读取共用同一套扫描；`page()` 按文件顺序返回；`remove` 拒绝默认行。

**改动文件**

- `packages/core/src/workspace.ts`
- `packages/core/src/host/workspaces-fs.ts`
- `packages/core/handlers.ts`
- `packages/core/__test__/workspaces.test.ts`
- `apps/web/__test__/bridge.test.ts`

**具体步骤**

1. `packages/core/src/workspace.ts`：
   - 新增 `WorkspaceI18nAlias`、`WorkspaceAlias`、`DEFAULT_WORKSPACE_NAME`；`WorkspaceFolder.alias` 改为 `WorkspaceAlias`，新增 `default?: boolean`。
   - `WorkspaceView` 新增 `default: boolean`、`nameKey: string | null`。
   - `readWorkspaceState`：alias 字符串保持现有校验；alias 对象只在 `i18n` 是非空字符串时保留为 `{ i18n }`；`default` 只在 `=== true` 时写入。其他值丢弃。
   - `WorkspaceStore.remove` 的 JSDoc 补“默认工作区被拒绝”；`WorkspaceStore.rename` 的 JSDoc 补“默认行空串恢复系统默认名，非默认行空串清 alias”。
2. `packages/core/src/host/workspaces-fs.ts`：
   - `view` 按设计决定 5 输出 `name` / `nameKey` / `default`。
   - 用 `ensureHostWorkspace` 替换 `adoptHostFolder`，按设计决定 2 的三分支实现；保留 `isDirectory` 检查、name-only 修复、`current` 的 name→path 迁移。
   - `read()` 保持先 ensure、再 `adoptNamedRows`。
   - `page()` 不做排序。
   - `remove` 在 current 检查前拒绝 `folder.default === true`。
   - `rename` 按设计决定 6 处理默认行与非默认行。
3. `packages/core/handlers.ts`：抽出 `openWorkspaceStore(options)`；新增 `ensureDefaultWorkspace(options)`（`await (await openWorkspaceStore(options)).page()`）；`createWorkspaceHandler` 的 `ready ??= openWorkspaceStore(options)`。
4. 在 `packages/core/__test__/workspaces.test.ts` 新增 `describe("the default workspace")`，使用独立临时 hub home 和 host 文件夹：
   - **首次写入**：`page()` 后 `folders[0]` 是 host 行，`default: true`、`nameKey === DEFAULT_WORKSPACE_NAME`、`name === basename`、`current === host path`；直接读 `<hub home>/state/workspaces.json`，断言第一行含 `"alias": { "i18n": "workspace.defaultName" }` 和 `"default": true`。
   - **重复 ensure 不覆盖**：`rename(hostId, "Home")` 后再次 `ensureDefaultWorkspace`（或重开 store），文档仍只有一行，alias 是 `"Home"`，`default: true`，仍在第一位。
   - **启动 ensure 先落盘**：在全新 home 上调用 `ensureDefaultWorkspace({ home, folder })`（从 `../handlers.ts` 导入），在调用 `page()` 之前直接读 `<hub home>/state/workspaces.json`，断言默认行和 `current` 已写入。
   - **旧文档升级**：预置 `folders: [other, { name: "host", path: repo }]`、`current: other`，打开 store；host 行变成第一位、`default: true`、补 i18n alias，`current` 仍是 other。
   - **升级不覆盖字符串 alias**：预置同 path 行且 `alias: "Mine"`；升级后 alias 仍是 `"Mine"`，`default: true`。
   - **无 host 行时新增**：预置 `[other]`、`current: other`；打开后 `[host(default, i18n alias), other]`，current 仍是 other；新 home、current 为 null 时 current 指向 host。
   - **已有 default 不在第一位**：预置 `[other, host(default, alias: "Mine")]`；打开后 host 移到第一位，alias 仍是 `"Mine"`。
- **已有 default 缺 alias**：预置 `[host(default)]`；打开后补 `{ i18n: DEFAULT_WORKSPACE_NAME }` 并写盘。
- **已有 default 且 current 为 null**：打开后 `current` 指向默认行。
   - **多个 default**：预置 `[other, first(default), second(default)]`；保留文件顺序第一个 default 行（first），清除 second 的 `default`，first 移到第一位，写出 `[first, other, second]`。
   - **order 不因 add/remove 改变**：`add(other)` 后 `folders[0].default === true`；`select(hostId)` 后再 `remove(otherId)`，默认行仍在 `[0]`（证明不需要视图排序）。
   - **非默认行 rename 回归**：给 other 起字符串 alias，再 `rename(otherId, <other basename>)`，alias 被清除；现有行为不变。
   - **remove 拒绝**：`remove(hostId)` reject 且消息匹配 `/default workspace/`，行仍在。
   - **`readWorkspaceState` 校验**：合法字符串 alias / `{ i18n: "workspace.defaultName" }` / `default: true` 保留；`alias: ""`、`42`、`null`、`{}`、`{ i18n: "" }`、`{ i18n: 42 }` 丢弃 alias；`default: false / "true" / 1` 不产生 `default`；对象 alias 的多余字段被丢弃。
   - **现有 name-only 修复用例**：补断言 host 行有 `default: true` 和 i18n alias；neighbour 用例补 `folders[0].default === true`。
5. 在 `apps/web/__test__/bridge.test.ts` 的 `describe("the workspace list")` 里补：
   - 首次 `refresh()`：`folders[0].default === true`、`nameKey === DEFAULT_WORKSPACE_NAME`、`path` resolve 后等于传入的 `folder`；读 `<home>/state/workspaces.json` 断言 `"default": true` 和 alias 对象。
   - `add(extra)` 后默认行仍是 `folders[0]`，`extra.default === false`。
   - `remove(defaultId)` 返回 `false`，`failure()` 匹配 `/default workspace/`，行仍在。
   - `rename(defaultId, "Home")` 后该行 `name === "Home"`、`nameKey === null`、`default === true` 且仍在第一位；`rename(defaultId, "")` 后 `nameKey === DEFAULT_WORKSPACE_NAME`、`name === basename`。改 alias 的用例结束前复原，避免影响同一 home 的后续用例。

**验收判据**

```bash
pnpm exec vitest run --project core --project web
pnpm --filter @context-hub/core typecheck
pnpm --filter @context-hub/core lint
```

三条全绿；磁盘断言直接证明 `"default": true` 和 alias 对象落盘，而不是只断言视图。

## 阶段二：在 server 启动时执行扫描

**目标**：server 在监听之前就确保 `workspaces.json` 有默认行、默认行在第一位；失败只告警。

**改动文件**

- `apps/web/server.ts`

**具体步骤**

1. 从 `@context-hub/core/handlers` 的现有 import 里加上 `ensureDefaultWorkspace`。
2. 在 `const listener = await createHubServer(options).listen()` 之前调用 `await ensureDefaultWorkspace(placed)`；用 `.catch` 打印 `hub server: the default workspace was not written: <message>` 后继续启动。
3. 不改 `apps/desktop/src/main.ts` 的 `cwd` / `--folder` 参数；不改 `dev.ts` 的启动方式。

**验收判据**

```bash
pnpm --filter web typecheck
```

再起一次真实 server（不请求任何路由），确认启动时已经落盘：

```bash
TMP="$(node -p 'require("node:os").tmpdir()')/context-hub-default-workspace-check"
rm -rf "$TMP"   # 本任务专用的临时目录，先清掉上一次的残留
mkdir -p "$TMP/hub-home" "$TMP/workspace"
node apps/web/server.ts --port 0 --home "$TMP/hub-home" --folder "$TMP/workspace" > "$TMP/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 50); do grep -q "listening" "$TMP/server.log" && break; sleep 0.1; done
cat "$TMP/hub-home/state/workspaces.json"
kill "$SERVER_PID"
```

期望输出包含 `"folders": [...]`，第一项是 `workspace`，带 `"alias": { "i18n": "workspace.defaultName" }` 和 `"default": true`，`current` 指向它。`kill` 只杀本次 `$SERVER_PID`，不要按端口或进程名清场。

## 阶段三：更新侧栏默认文案与重命名

**目标**：前端按 `nameKey` 渲染默认文案；默认行隐藏删除项；重命名能把默认文案/空串恢复成系统 alias；i18n 两份表齐全。

**改动文件**

- `apps/web/src/lib/workspaces.ts`
- `apps/web/src/components/workspace-group.tsx`
- `packages/extensions/src/builtin/locale-en.ts`
- `packages/i18n/zh-cn/src/messages.ts`
- `apps/web/__test__/workspace-name.test.ts`（新）

**具体步骤**

1. 两个语言表加字面量 key `workspace.defaultName`，值分别是 `"Default workspace"` / `"默认工作区"`。
2. `apps/web/src/lib/workspaces.ts`：
   - 从 `@context-hub/core/workspace` 导入 `DEFAULT_WORKSPACE_NAME` 和 `WorkspaceView` 类型。
   - 新增 `workspaceLabel(folder, t)`：`folder.nameKey === null ? folder.name : t(folder.nameKey)`。
   - 新增 `renameSubmission(defaultWorkspace, next, t)`：默认行且 `next.trim() === ""` 或 `next.trim() === t(DEFAULT_WORKSPACE_NAME)` 时返回空串，否则返回 `next`；非默认行原样返回。
   - `samePage` 增加 `default` / `nameKey` 比较。
3. `workspace-group.tsx`：
   - `const label = workspaceLabel(folder, t)`；`SidebarRow` 的 `label` 用 `label`。
   - `editing` 类型改为 `{ id: string; name: string; default: boolean }`；打开重命名时 `name: label`、`default: folder.default`。
   - `onRename` 用 `renameSubmission(editing.default, next, t)`。
   - 删除菜单项只在 `folder.default === false` 时渲染；重命名项始终保留。
   - `RenameDialog` 增加可选 `allowEmpty?: boolean`，保存按钮 disabled 条件改为 `busy || (value.trim() === "" && !allowEmpty)`；默认行传 `allowEmpty`。
   - hint：按待确认项处理；若确认隐藏，则 `hint={folder.default ? null : folder.display}`。
4. 新增 `apps/web/__test__/workspace-name.test.ts`：
   - `workspaceLabel`：`nameKey` 为 key 时调用传入的 `t` 返回翻译；`nameKey === null` 时返回 `name`。
   - `renameSubmission`：默认行 + 空串 → `""`；默认行 + 当前语言默认文案 → `""`；默认行 + `"My home"` → `"My home"`；非默认行 + 空串 → `""`（交给 store 清 alias）。
   - 这个测试不渲染 DOM，只验证侧栏实际使用的两个纯函数。

**验收判据**

```bash
pnpm exec vitest run --project core --project web --project zh-cn
pnpm --filter web typecheck
pnpm --filter @context-hub/extensions typecheck
pnpm --filter @context-hub/zh-cn typecheck
pnpm --filter web lint
pnpm --filter @context-hub/extensions lint
pnpm --filter @context-hub/zh-cn lint
```

测试全绿，尤其是 `zh-cn` 的覆盖测试。UI 行为用真实浏览器确认（本仓无组件测试）：

```bash
TMP="$(node -p 'require("node:os").tmpdir()')/context-hub-default-workspace-check"
rm -rf "$TMP"   # 本任务专用的临时目录，先清掉上一次的残留
mkdir -p "$TMP/hub-home" "$TMP/other"
CONTEXT_HUB_HOME="$TMP/hub-home" pnpm --filter web dev
```

打开 `http://127.0.0.1:5271`（`DEV_APP_PORT`，见 `apps/web/hub-port.ts`），用 ego-browser 或 CDP 读侧栏。先通过 hub 路由添加第二个真实文件夹，让默认行不再是当前行（dev 的 hub 端口是 5270；沿用上面的 `$TMP`，另开一个终端执行）：

```bash
TMP="$(node -p 'require("node:os").tmpdir()')/context-hub-default-workspace-check"
mkdir -p "$TMP/other"
curl -s -X POST http://127.0.0.1:5270/hub/workspaces \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"add\",\"path\":\"$TMP/other\"}"
```

然后刷新页面，确认：

- 默认行仍在第一位，文本是当前语言的默认文案（英文 `Default workspace`，中文 `默认工作区`）；
- 默认行不是当前行时，`⋯` 菜单只有重命名项，没有删除项；
- 重命名为 `My home` 后行文本变为 `My home`，仍排第一；再次打开重命名、清空并保存，行文本回到当前语言的默认文案；
- 页面刷新后仍然如此（alias 已持久化，磁盘里是字符串 alias 或 `{ "i18n": "workspace.defaultName" }`）。

收尾只停本次 dev 进程（Ctrl-C / 杀掉自己启动的进程），不要按端口或进程名清场。

## 阶段四：验收桌面端并收尾 AOCI

**目标**：在真实桌面载体验收默认工作区的持久化与显示，并完成仓库认知维护。

**具体步骤**

1. 跑一次汇总检查：

```bash
pnpm exec vitest run --project core --project web --project zh-cn
pnpm --filter @context-hub/core typecheck
pnpm --filter web typecheck
pnpm --filter @context-hub/extensions typecheck
pnpm --filter @context-hub/zh-cn typecheck
pnpm --filter @context-hub/core lint
pnpm --filter web lint
pnpm --filter @context-hub/extensions lint
pnpm --filter @context-hub/zh-cn lint
```

2. 桌面端真实验收（桌面端可见流程不能只用浏览器替代，见 `docs/memory.md`）：

```bash
pnpm --filter web build
pnpm --filter @context-hub/desktop build
cd apps/desktop
CONTEXT_HUB_HOME="<临时 hub home>" pnpm exec electron --remote-debugging-port=9222 --user-data-dir="<临时 profile>" .
```

用 CDP 读页面：侧栏第一行是 `Default workspace`，菜单无删除项；启动后 `<临时 hub home>/state/workspaces.json` 的第一行含 `"default": true`、`"alias": { "i18n": "workspace.defaultName" }`，`path` 是真实 home（server 的 cwd 是 `app.getPath("home")`，这是需求要求保留的路径）。临时 `--user-data-dir` 同时避开与正在运行的 dev 实例的单实例锁。若环境跑不了 Electron，明确记录“桌面端未验证”并给出上述命令，不要用浏览器结果冒充。

3. AOCI：实现和验证稳定后调用一次 `aoci_maintain`。调用前先看 `git status --short` 和近期 mtime，确认没有别的会话正在写本次要维护的文件；如果候选里出现不属于本任务的在途文件，停下并报告，不要替别人的改动写认知。只更新本任务涉及的文件条目；不手工编辑 `aoci.txt`，不重复维护。

**验收判据**

- 上面所有命令通过；
- 桌面端或（环境不允许时）dev server 的 UI 观察到第 3 阶段的四项行为；
- `aoci_maintain` 返回的候选与实际改动文件一致，未把其他会话的在途文件写入认知。

## 待确认

- **默认行是否隐藏 `~` hint**：本计划建议隐藏；确认后按阶段三的 `hint={folder.default ? null : folder.display}` 实现，不确认则保留现有 `hint={folder.display}`。

## 不做

- 不改 `apps/desktop/src/main.ts` 的 `cwd: app.getPath("home")`，不把默认工作区改到 `~/.context-hub/...` 之类的 hub 专用目录。
- 不在 `page()` 做视图排序；顺序只由文档数组顺序决定。
- 不新增通用“受保护工作区”开关；只保护 `default === true` 的行。
- 不改 `add` / `select` / `setAgent` 的语义；不改 `folderId` / `workspaceName` / `adoptNamedRows` 的既有行为。
- 不给后端错误文本加 i18n，不新增错误类型或 409 状态。
- 不改非默认工作区的 hint、行高、菜单样式或 `SidebarRow`。
- 不为前端组件测试引入 jsdom / testing-library；用纯函数测试 + 真实浏览器/Electron 验收。
- 不碰当前工作树里 global-search 相关的未提交改动和 `docs/plans/global-search-precision-jump.md`。
- 不在用户确认完成前归档本计划。
- 不手工编辑 `aoci.txt`。

## 风险、回滚与待验证

**风险**

- 持久化的 `default` 是权威：已有 default 行时，即使 `options.folder` 变成另一个目录，也只调整顺序，不会把新目录改成默认。这是需求 3 第一条的直接结果；换 cwd/`--folder` 的用户需要手工清除旧 `default` 或等待后续迁移。
- 多个 default 行只保留**文件顺序第一个** default 行；其余清除 `default` 但保留 alias。手编文件如果期望保留另一行，需要先把它放在前面。
- `readWorkspaceState` 按 id 去重时保留第一行；重复行里靠后的 `default: true` 会被丢弃。随后扫描会按 host path 补回默认标记，非 host 路径的重复行则不会。
- 手编文件里已有 `default: true` 但 alias 缺失时，扫描会补上 i18n alias；用户已有的字符串 alias 不会被覆盖。
- 默认行输入等于文件夹名时写字符串 alias（不是恢复 i18n alias）；这是需求 6 的明确取舍。
- 默认行隐藏 hint 仍是待确认项，不是最终决定。
- `nameKey` 存的是非空字符串，不校验是否真实存在；未知 key 会原样显示（`t` 的 `?? key` 回退），不会崩。
- 侧栏渲染本身没有组件测试；`workspaceLabel` / `renameSubmission` 的纯函数测试覆盖表达式，真实布局与菜单用浏览器/Electron 验收。
- 启动 ensure 在 hub home 不可写时只告警，路由仍会在第一次请求时重试并返回同样的 400。

**回滚**

- 代码回滚本计划的文件组即可。旧版本读取 `workspaces.json` 时会忽略 `default` 和对象 alias（旧 `readWorkspaceState` 只认字符串 alias），不会崩溃；对象 alias 会被旧版本丢弃，显示回文件夹名，这是可接受的降级。
- 如果只想撤回启动 ensure：删掉 `apps/web/server.ts` 里的 `await ensureDefaultWorkspace(...)`，`read()` 的惰性扫描仍然工作。
- 用户已有的字符串 alias 不会被新扫描覆盖；回滚后它们仍是字符串 alias。

**待验证（实现时必须实测）**

- `node apps/web/server.ts` 在当前 Node（本机 v24.15.0）下直接运行 TS 的启动方式与 `dev.ts` 一致；若实现环境 Node 版本不支持，改用仓库已有的构建产物/`dev.ts` 路径验证。
- 桌面端 Electron 的 CDP 验收是否能在当前环境跑通；跑不通就如实标注未验证。
- AOCI 调用时其他会话的在途文件是否已经稳定；不稳定就只报告、不写入。

## 自审

**事实（已读代码/配置核对）**

- 行号、文件路径、函数名、状态文件路径、i18n key 位置、测试文件和 project 名均来自本次读取。
- `t` 的签名是 `(key: string) => string`，实现回退到 key；动态 `nameKey` 不需要类型断言。
- 现在 `folder.alias` 的读取点只有 `readWorkspaceState` 与 `view`，改联合类型不会漏掉隐藏调用方。
- 其他 store 调用方只读 `current` 的 `path`，持久化默认/alias 不影响它们。
- `writeFileAtomic` 会创建父目录，测试可以直接读 `<hub home>/state/workspaces.json`。
- 现有 `{ name: "skills" }` 这类断言仍成立：缺失的 alias/default 不写入对象；`adopted.folders` 的前后比较来自同一段代码。

**判断（可被用户推翻）**

- 已有 default 行保留用户 alias；alias 缺失时补 i18n alias，current 为空时指向它。这是对“用户自己改过的就算了”的解释：没改过的默认行不应继续显示文件夹名。
- 多个 default 行按文件顺序保留第一个，再移到第一位；这是对“第一行”的解释。
- 默认行输入文件夹名时按字符串 alias 处理，不恢复 i18n alias；需求只规定非默认行等于文件夹名才清 alias。
- hint 隐藏与已有 default 行的 `current` 处理列为待确认项。
- 启动 ensure 放在 `apps/web/server.ts` 而不是 `createHubServer`：避免通用 server 耦合 workspace 特性。
- 前端测试用纯函数而不是引入 DOM 测试栈：仓库现有 `apps/web` 测试都是 node 环境。

**自审修正过的地方**

- 上一版“default 不落盘、page 排序”的设计已整体删除；本版默认标记和 alias 对象都持久化。
- 补上了 `readWorkspaceState` 对 `default` / 对象 alias 的校验，避免手编文件把非法值带进 store。
- 明确了 `ensureHostWorkspace` 与 `read()` 的共用关系，保证 skills/mcp/plugins/place-files 不失去惰性 host folder 行为。
- 明确了 `add`/`remove` 不破坏第一位的分析，因此不需要视图排序。
- 补上了前端 `nameKey` 渲染与重命名恢复的纯函数测试，避免“只测后端、不测前端表达式”。
- 明确了 `t` 接受动态字符串的事实与回退行为。
