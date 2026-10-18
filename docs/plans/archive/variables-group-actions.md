# 环境变量页分组管理（重命名 / 删除）

## 背景

环境变量页今天只能新建分组，不能管理分组。

- `packages/resources/variables/src/store.ts:59-81` 的 `VariableStore` 只有 `read/create/update/remove/createGroup`，没有重命名或删除分组的方法。
- `packages/resources/variables/src/host/variables-fs.ts:350-358` 的 `createGroup` 只把名字追加进 `document.groups`；`parseDocument`（`:148-159`）保证 `groups` 含 `DEFAULT_GROUP`（`"通用"`）以及每一行变量实际使用的分组。
- `packages/resources/variables/handlers.ts:118-137` 的动作只有 `create/update/remove/create-group`，统一挂在 `/hub/variables`，错误由 `sendError` 返回 400 `{ error }`。
- `packages/resources/variables/src/remote-store.ts:40-56` 逐方法映射这些动作。
- `packages/resources/variables/src/page.tsx:974-1006` 的左栏是「全部」筛选行加 `groups.map` 出来的 `<button>` 行，右侧只有计数，没有任何行内控件。行菜单 `RowMenu`（`:684-764`）里有两处 `DropdownMenuSeparator`（`:742`、`:756`）。
- 值不在 `variables.json` 里：`read()`（`variables-fs.ts:201-209`）按名字从 `EnvironmentPort` 回读。分组改名/删除只改索引，不能调用 `environment.set/remove`。

设计稿（只能用 pencil MCP 读，`.pen` 是加密格式，不能用 Read/Grep）：

- `designs/settings.pen` 的 `h7p1u`（Environment Variables）：非默认分组行右侧常驻计数 + 24×24 的 `⋯`（透明底、14px 图标）；「全部」与「通用」没有 `⋯`。
- `designs/settings.pen` 的 `FzcaG`（Group Actions Spec）：`⋯` 菜单只有「重命名分组」「删除分组」两项，没有分割线；删除项红色。重命名弹窗预填当前名称并全选，空名/重名拒绝保存且保留弹窗。删除弹窗说明 N 个变量移到「通用」、变量值不变；空分组不弹确认，直接删除并 toast。

## 已确认语义

- 「全部」是筛选器，「通用」是 `DEFAULT_GROUP`；这两行都没有 `⋯`。
- 非默认分组的 `⋯` 菜单只有两项：重命名分组、删除分组；无分割线；`⋯` 按钮无背景色。现有变量行菜单的 `DropdownMenuSeparator` 一并去掉。
- 重命名：新名称 `trim` 后非空、不能与现有分组重名、不能把别的分组改成「通用」；组内变量的 `group` 跟随改名；变量名和环境变量值不动。
- 删除：「通用」不能删除；空分组直接删除并 toast；有变量的分组先确认，确认后组内变量移到「通用」；变量名和环境变量值不动。
- 两类操作只改 `variables.json` 的分组索引，不写机器环境变量。

## 前提事实（已核对）

- `VariableStore` 只有两个实现：`createFsVariableStore`（`host/variables-fs.ts`）和 `createRemoteVariableStore`（`src/remote-store.ts`）。`variable-picker.tsx` 只读 `read()` 返回的 `groups`，不调用写方法。
- `writeStored`（`variables-fs.ts:195-198`）用 `writeFileAtomic` 一次性替换整个文件；一次操作里改完 `groups` 和所有行的 `group` 后再调用它，就是全有或全无。
- `parseDocument` 会保留文档和行上的未知字段（`...raw`、`...rest`），新增方法必须继续这样做。
- `handlers.ts` 用 `required(value, what)` 拒绝空字符串；`sendError` 默认 400。
- `apps/web/server.ts:111` 已经挂载 `createVariableHandler`，本轮不需要改 server。
- `packages/resources/prompts/__test__/bridge.test.ts` 提供了「真实 handler + `createHubServer` + 包自己的 remote store」的桥接测试样板；variables 目前没有桥接测试。
- `packages/i18n/zh-cn/__test__/messages.test.ts:75-89` 要求中文表覆盖所有英文表里的 key；新增英文 key 必须同步中文。
- 左栏行不能是 `<button>` 再套一个 `<button>`。`apps/web/src/components/sidebar-rows.tsx:68-125` 的现有做法是：行本身用 `div role="button" tabIndex={0}`，行内控件包一层 `span`，在 `onClick` 和 `onPointerDown` 里 `stopPropagation`，行 keydown 只处理 `event.target === event.currentTarget`。
- `FieldDialog`（`page.tsx:93-224`）已经会把 `onSubmit` 抛出的错误显示在弹窗里；空值时会禁用提交按钮。`DeleteDialog`（`:227-311`）是现有变量删除确认的本地形状。
- 开发端口来自 `apps/web/hub-port.ts`：hub 5270、Vite 5271。`CONTEXT_HUB_HOME` 可以把 hub home 指向临时目录（`packages/core/src/host/home.ts:10-16`）。
- 浏览器验收不能调用 `create/update/remove` 这些变量写方法：handler 内部的 `createFsVariableStore({ home })` 没有注入假环境，会写真实机器环境。分组操作本身不碰环境，所以浏览器验收应直接 seed `variables.json`，只操作分组。

## API 与错误语义

`packages/resources/variables/src/store.ts` 的 `VariableStore` 增加：

```ts
renameGroup(from: string, to: string): Promise<VariableDocument>
removeGroup(group: string): Promise<VariableDocument>
```

| 情况 | `renameGroup(from, to)` | `removeGroup(group)` |
| --- | --- | --- |
| `from`/`group` 不是非空字符串 | 抛 `group name is required` | 抛 `group name is required` |
| `from`/`group` 是 `DEFAULT_GROUP` | 抛 `the default group cannot be renamed` | 抛 `the default group cannot be removed` |
| `to` 是 `DEFAULT_GROUP`（`from` 非默认） | 抛 `cannot rename a group to the default group` | — |
| `from` 不在 `document.groups` | 抛 `unknown group: ${from}` | 非空且不在 `groups`：no-op，返回当前文档，不写盘 |
| `to` 已被另一个分组使用 | 抛 `group already exists: ${to}` | — |
| `from === to` | no-op，返回当前文档，不写盘 | — |
| 正常 | 原位替换组名；所有 `row.group === from` 的行改为 `to`；一次 `writeStored` | 从 `groups` 移除；所有 `row.group === group` 的行改为 `DEFAULT_GROUP`；一次 `writeStored` |

说明：

- `removeGroup` 对未知分组按幂等删除处理，和现有 `remove(name)`（未知变量名 no-op）保持一致；`renameGroup` 的源分组不存在是调用方错误，直接拒绝。
- 两个方法都不调用 `environment.set/remove`，也不改 `updatedAt`。分组是索引字段，变量名和值没有变化。
- 重命名保留分组在 `groups` 数组里的位置；删除保留其余分组的相对顺序。
- 参数 `trim` 后再比较/写入；分组名的唯一性按精确字符串判断（大小写敏感），与现有 `createGroup`/`includes` 一致。

HTTP 动作（`handlers.ts`）：

| action | body | 调用 |
| --- | --- | --- |
| `rename-group` | `{ from: string, to: string }` | `store.renameGroup(required(body.from, "group name"), required(body.to, "new group name"))` |
| `remove-group` | `{ group: string }` | `store.removeGroup(required(body.group, "group name"))` |

HTTP 层的 `required` 对空/空白先返回 `missing group name` 或 `missing new group name`，不会到达 store；上表的 `group name is required` 是直接调用 store 时的语义。

远端实现（`remote-store.ts`）：

```ts
renameGroup: (from, to) => call(base, write("rename-group", { from, to })),
removeGroup: (group) => call(base, write("remove-group", { group })),
```

## 阶段一：实现分组领域方法

**目标**：磁盘存储能原子地重命名/删除分组，变量跟随迁移，且不碰机器环境。

**改动文件**

- `packages/resources/variables/src/store.ts`
- `packages/resources/variables/src/host/variables-fs.ts`

**关键实现点**

1. `store.ts` 的 `VariableStore` 增加 `renameGroup`/`removeGroup`，JSDoc 写清上表的拒绝条件和 no-op 语义。
2. `variables-fs.ts` 把现有的 `createdGroupOf` 改名为 `requiredGroupOf`（仅本文件使用，无外部调用方），JSDoc 改成「调用方给出的分组名；空串是错误」。`createGroup`、`renameGroup`、`removeGroup` 共用它。
3. `renameGroup`：
   - `readStored()` 后先 `requiredGroupOf` 两个参数。
   - 依次拒绝：源是 `DEFAULT_GROUP`、目标是 `DEFAULT_GROUP`、源不在 `document.groups`。
   - `from === to` 时直接 `return read()`，不写盘。
   - 目标已在 `document.groups` 时抛 `group already exists`。
   - 用 `indexOf(from)` 原位替换 `document.groups[index]`；遍历 `document.variables`，把 `row.group === from` 改成 `to`；保留行的其他字段和 `updatedAt`。
   - 一次 `writeStored(document)`，最后 `return read()`。
4. `removeGroup`：
   - `readStored()` 后 `requiredGroupOf`；`DEFAULT_GROUP` 直接拒绝。
   - 不在 `document.groups` 时 `return read()`，不写盘。
   - `document.groups = document.groups.filter((one) => one !== group)`；遍历变量，把该组的行改为 `DEFAULT_GROUP`；保留行的其他字段和 `updatedAt`。
   - 一次 `writeStored(document)`，最后 `return read()`。
5. 两个方法都不调用 `environment.*`；`read()` 本身只读环境。不要在循环里逐行写文件。

**验收判据**

- `pnpm --filter @context-hub/variables typecheck` 退出码 0。
- `pnpm --filter @context-hub/variables test` 退出码 0（现有测试全部保持绿色；新方法的测试在阶段五补齐）。
- 代码里 `renameGroup`/`removeGroup` 各只有一次 `writeStored` 调用；没有 `environment.set`/`environment.remove`。
- `git diff` 里 `variables-fs.ts` 的 `createGroup` 行为不变，只换了共用 helper 的名字。

## 阶段二：接通 HTTP 桥接

**目标**：页面可以通过现有 `/hub/variables` 路由调用两个新动作，错误仍以 400 `{ error }` 返回。

**改动文件**

- `packages/resources/variables/handlers.ts`
- `packages/resources/variables/src/remote-store.ts`

**关键实现点**

1. `handlers.ts` 的 `switch (body.action)` 增加：
   - `case "rename-group"`：用 `required` 取 `from`/`to`，调用 `store.renameGroup`，`sendJson(response, 200, ...)`。
   - `case "remove-group"`：用 `required` 取 `group`，调用 `store.removeGroup`。
2. 不新增路由，不改 `under` 的前缀规则，不改 `apps/web/server.ts`。
3. `remote-store.ts` 增加两个方法与 `write(...)` 调用，字段名必须与 `handlers.ts` 逐个对齐（`from`/`to`/`group`）。
4. 错误不额外包装：store 抛出的 `unknown group`、`group already exists`、`the default group ...` 由现有 `catch` 走 `sendError(response, error)`，默认 400。

**验收判据**

- `pnpm --filter @context-hub/variables typecheck` 退出码 0。
- `pnpm --filter @context-hub/variables test` 退出码 0（现有测试不受影响）。
- `grep -n "rename-group\|remove-group" packages/resources/variables/handlers.ts packages/resources/variables/src/remote-store.ts` 两侧各出现一次动作名，字段名一致。
- 桥接字段对齐由阶段五的 `bridge.test.ts` 覆盖；本阶段不手动起服务。

## 阶段三：实现分组行 UI

**目标**：左栏非默认分组右侧出现无背景的 `⋯`，菜单只有重命名/删除；两个弹窗按设计稿工作；选中分组在改名/删除后正确回落。

**改动文件**

- `packages/resources/variables/src/page.tsx`

**关键实现点**

1. **行结构**
   - 抽一个本文件内的 `railRowClass(active)`，供「全部」、默认分组、非默认分组共用，保持现有 `h-9`、圆角、选中/悬停配色。
   - 「全部」和「通用」可以继续是 `<button>`；非默认分组改成 `div role="button" tabIndex={0}`，加 `aria-pressed={active}`，`onClick` 选组。
   - `onKeyDown` 照 `sidebar-rows.tsx`：`event.target !== event.currentTarget` 直接返回，只处理 Enter/空格并 `preventDefault`。
   - 行右侧改成 `span` 容器：计数 + （仅非默认分组）`⋯`。`⋯` 外层再包一个 `<span>`，在 `onClick` 和 `onPointerDown` 里 `stopPropagation`，避免点触发按钮时选中分组。菜单内容由 `DropdownMenuContent` 渲染在 portal 里，本来就不会冒泡到行，但仍要把触发按钮这一层挡住。
   - `⋯` 用 `Button variant="ghost" size="icon-xs"`（24×24），图标 `EllipsisIcon className="size-3.5"`；`className` 显式加 `hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent text-muted-foreground hover:text-foreground`，保证任何状态（含深色模式）都不画背景。现有 `RowMenu` 的触发按钮也加同样的无背景类。
   - 不给「全部」和「通用」渲染菜单。

2. **`GroupMenu` 本地组件**
   - props：`onRename: () => void`、`onDelete: () => void`（不需要 group 名，触发按钮的 aria-label 用通用文案）。
   - `DropdownMenu` + `DropdownMenuTrigger render={<Button ... aria-label={t("variables.group.actions")} />}`。
   - 内容沿用 `RowMenu` 的菜单外壳：`align="end"`、`w-[210px] flex-col gap-0.5 rounded-md p-1.5 ring-1 ring-border shadow-soft`，item 用现有 `MENU_ITEM`。
   - 只有两项：`PencilIcon` + `t("variables.group.rename")`；`Trash2Icon` + `t("variables.group.delete")`，删除项 `variant="destructive"`。
   - 不渲染 `DropdownMenuSeparator`。

3. **弹窗基建**
   - `FieldDialog` 增加两个可选 prop：
     - `selectAll?: boolean`：给 `Input` 加 `onFocus`，为 true 时 `event.currentTarget.select()`；只在分组重命名时传 true。
     - `footerHint?: string`：提供时 footer 用 `justify-between` 并在左侧渲染提示（两个按钮包进一个 `flex items-center gap-2` 的容器）；不提供时保持现在的 `justify-end`。
   - 其余外壳、按钮、错误显示复用现有 `FieldDialog`，不要另造重命名弹窗。
   - 新增 `DeleteGroupDialog`，形状照现有 `DeleteDialog`：`Dialog` + `DialogContent`（480px）+ header/body/footer；props `group: string`、`count: number`、`open`、`onOpenChange`、`onDelete: (group: string, count: number) => Promise<void>`；本地 `pending`/`failure`。
     - 标题：`variables.groupDelete.title` 替换 `{name}`。
     - 描述：`variables.groupDelete.description`。
     - 迁移提示：`FolderInputIcon` + `variables.groupDelete.migration` 替换 `{count}`/`{group}`（`{group}` 用 `DEFAULT_GROUP`）。
     - 辅助说明：`variables.groupDelete.helper` 替换 `{group}`。
     - footer 左侧：`variables.groupDelete.footer` 替换 `{count}`；右侧取消 + `variant="destructive"` 的删除按钮，按钮文案复用 `variables.group.delete`。
     - 关闭/取消/Esc/点外部只关弹窗，不调用删除。
   - 替换占位符时，凡是替换用户输入的分组名（`{name}`）都用函数形式的 `String.replace("{name}", () => group)`，避免名字里含 `$&` 时被 `replace` 当成特殊模式；数字占位符用普通字符串替换即可。

4. **页面状态与动作**
   - 新增 `renamingGroup: string | null`、`deletingGroup: string | null`；选中分组继续用现有 `group`。
   - `openGroupRename(group)`：`setRenamingGroup(group)`；`openGroupDelete(group)`：`(counts.get(group) ?? 0) === 0` 时 `void removeGroupNow(group, 0).catch((error) => toast.add({ type: "error", title: textOf(error) }))`，否则 `setDeletingGroup(group)`。
   - 重命名提交（传给 `FieldDialog.onSubmit`，写成 `async` 函数，保证抛出的错误进入已有的 Promise catch）：
     - 先判 `renamingGroup === null`，是则直接返回。
     - `const nextName = value.trim()`。
     - 依次抛本地化错误：空名 `variables.groupRename.required`；`nextName === DEFAULT_GROUP` 用 `variables.groupRename.reserved`；`nextName !== renamingGroup && groups.includes(nextName)` 用 `variables.groupRename.exists`。
     - 调 `store.renameGroup(renamingGroup, nextName)`；成功后 `remember(next)`；如果 `group === renamingGroup` 则 `setGroup(nextName)`；`setRenamingGroup(null)`；toast `variables.groupRename.done`。
     - 失败时不关闭弹窗；`FieldDialog` 已有的 catch 会把错误显示在弹窗里。
   - 删除提交统一走 `removeGroupNow(target: string, count: number)`：
     - 确认弹窗和空分组直达路径都把删除前的 `count` 一起传进来，避免等 `await` 之后 `counts` 已经按新文档重算。
     - 调 `store.removeGroup(target)`；成功后 `remember(next)`；如果 `group === target` 则 `setGroup(null)`（回落「全部」）；`setDeletingGroup(null)`；按传入的 `count` 发 toast：0 用 `variables.groupDelete.done`，否则用 `variables.groupDelete.doneMigrated` 替换 `{count}`/`{group}`。
     - 空分组直接删除失败时由上面的 `catch` 发 error toast；有变量的确认弹窗失败时把错误留在弹窗里。
   - 重命名弹窗：`key={renamingGroup}`、`value={renamingGroup}`、`selectAll`、`description` 用 `counts.get(renamingGroup) ?? 0` 替换 `{count}`、`footerHint` 用 `variables.list.count` 替换同一个计数。
   - 删除弹窗在页面底部条件渲染：`deletingGroup === null ? null : <DeleteGroupDialog group={deletingGroup} count={counts.get(deletingGroup) ?? 0} ... />`；`onOpenChange(false)` 清空 `deletingGroup`。

5. **去掉现有分割线**
   - 删除 `RowMenu` 里的两处 `<DropdownMenuSeparator />`（移动分组的子菜单里、删除项之前）和顶部的 `DropdownMenuSeparator` import。
   - 只改这两个菜单；不要动其他页面的菜单。

**验收判据**

- `pnpm --filter @context-hub/variables typecheck` 退出码 0。
- `pnpm --filter @context-hub/variables lint` 退出码 0（`react-hooks/set-state-in-effect`、`purity` 等规则不允许在 effect 里夹状态或在 render 里读 ref；本阶段不新增 effect）。
- `grep -n "DropdownMenuSeparator" packages/resources/variables/src/page.tsx` 无输出。
- `grep -n "role=\"button\"" packages/resources/variables/src/page.tsx` 命中非默认分组行；该行内只有 `Button`（`⋯`），没有嵌套的 `<button>` 包 `<button>`。
- 代码中 `renameGroup`/`removeGroup` 动作只在成功分支调用 `remember`，失败分支不关闭弹窗。

阶段三与阶段四在同一个工作块内完成后再做浏览器验收；阶段三单独验收只看编译、lint 和静态结构。

## 阶段四：补齐中英文案

**目标**：新增界面文案在英文表和中文表都存在，中文包覆盖检查通过。

**改动文件**

- `packages/resources/variables/src/messages.ts`（英文默认表）
- `packages/i18n/zh-cn/src/messages.ts`（简体中文表）

**新增 key 完整列表**

| key | 英文 | 中文 |
| --- | --- | --- |
| `variables.group.actions` | Group actions | 分组操作 |
| `variables.group.rename` | Rename group | 重命名分组 |
| `variables.group.delete` | Delete group | 删除分组 |
| `variables.groupRename.title` | Rename group | 重命名分组 |
| `variables.groupRename.description` | {count} variables in this group move with it. | 组内 {count} 个变量会一起换到新分组名。 |
| `variables.groupRename.label` | Group name | 分组名称 |
| `variables.groupRename.helper` | The name cannot be empty or match another group. | 名称不能为空，也不能与现有分组重名。 |
| `variables.groupRename.submit` | Save | 保存 |
| `variables.groupRename.done` | Group renamed | 分组已重命名 |
| `variables.groupRename.required` | A group name is required. | 分组名称不能为空。 |
| `variables.groupRename.exists` | A group with this name already exists. | 已经有同名分组。 |
| `variables.groupRename.reserved` | A group cannot be renamed to the default group. | 不能把分组改名为「通用」。 |
| `variables.groupDelete.title` | Delete group {name}? | 删除分组「{name}」？ |
| `variables.groupDelete.description` | The group is removed; its variables are not deleted. | 分组会被移除，组内变量不会删除。 |
| `variables.groupDelete.migration` | {count} variables move to {group}; their values stay unchanged. | {count} 个变量会移到「{group}」，变量值保持不变。 |
| `variables.groupDelete.helper` | The group name cannot be restored; the variables remain in the list under {group}. | 分组名删除后不能恢复；变量仍可在列表中按「{group}」找到。 |
| `variables.groupDelete.footer` | {count} variables will move | {count} 个变量将迁移 |
| `variables.groupDelete.done` | Group deleted | 分组已删除 |
| `variables.groupDelete.doneMigrated` | Group deleted; {count} variables moved to {group} | 分组已删除，{count} 个变量已移到「{group}」 |

复用而不新增的 key：

- 重命名弹窗 footer 的数量用现有 `variables.list.count`（`"{count} variables"` / `"{count} 个变量"`）。
- 删除弹窗的确认按钮文案复用 `variables.group.delete`。
- 取消按钮复用现有 `variables.cancel`。
- 关闭按钮 aria-label 复用现有 `variables.action.close`。

**验收判据**

- `pnpm --filter @context-hub/zh-cn test` 退出码 0；`messages.test.ts` 的「carries every key」和「covers every key」两条通过，没有 `not in the pack`。
- `pnpm --filter @context-hub/variables typecheck` 退出码 0。
- 两边的 key 名称逐字一致；英文表新增 19 个 key，中文表同样 19 个。
- 不删除任何现有 key；不改现有文案。

## 阶段五：补充分组测试

**目标**：分组重命名/删除、变量迁移、默认分组拒绝、重名拒绝、空分组、桥接字段对齐都有可失败的断言。

**改动文件**

- `packages/resources/variables/__test__/variables-fs.test.ts`
- 新增 `packages/resources/variables/__test__/bridge.test.ts`（`vitest.config.ts` 的 `__test__/**/*.test.ts` 已覆盖，不需要改配置）

**`variables-fs.test.ts` 新增用例**

测试辅助 `memoryEnvironment` 增加 `writes: string[]`，`set`/`remove` 时 push 动作；现有用例不受影响。分组用例在 seed 完成后清空 `writes`，再断言没有环境写入。

1. `renames a group and carries its variables, names, values and timestamps along`
   - seed：`A` 在「云服务」、`B` 在「通用」。
   - 调 `renameGroup("云服务", "Cloud")`。
   - 断言：`groups` 里 `Cloud` 出现在原「云服务」的位置；没有「云服务」；`A.group === "Cloud"`；`B.group` 仍是「通用」；`A.name`/`A.updatedAt` 不变；文件里没有 `value` 字段。
   - 断言环境值快照不变，`environment.writes` 为空。
2. `refuses a rename onto an existing group without touching the file`
   - seed 两个分组；先记录 seed 之后的文件内容；`renameGroup("A", "B")` rejects `/already exists/`；文件内容逐字节等于记录值。
3. `refuses to rename the default group or into it`
   - 先 `createGroup("X")`，记录此时的文件内容。
   - `renameGroup("通用", "X")` rejects `/default group cannot be renamed/`。
   - `renameGroup("X", "通用")` rejects `/cannot rename a group to the default group/`。
   - 两次拒绝之后文件仍等于记录值。
4. `refuses an empty or unknown source group`
   - 先 `createGroup("X")`，记录此时的文件内容。
   - `renameGroup("X", "  ")` rejects `/group name is required/`。
   - `renameGroup("missing", "Y")` rejects `/unknown group/`。
   - 文件仍等于记录值。
5. `treats a rename to the same name as a no-op`
   - 先 `createGroup("X")`，记录此时的文件内容；`renameGroup("X", "X")` resolves；文件仍等于记录值；`environment.writes` 为空。
6. `removes an empty group`
   - `createGroup("Empty")` 后清空 writes；`removeGroup("Empty")`。
   - 断言 `groups` 和原始文件都不再含 `Empty`；变量数组不变；`environment.writes` 为空。
7. `removes a group with variables and moves them to the default group`
   - seed `A` 在「云服务」、`B` 在「通用」，记录 `A` 的完整原始行。
   - `removeGroup("云服务")`。
   - 断言：`A.group === DEFAULT_GROUP`；`B` 不变；`A` 的 `name`/`updatedAt` 不变；`groups` 不再含「云服务」且仍含 `DEFAULT_GROUP`；原始文件里 `A` 的其他字段不变；环境值不变；`environment.writes` 为空。
8. `refuses to remove the default group`
   - 记录文件内容；`removeGroup("通用")` rejects `/default group cannot be removed/`；文件仍等于记录值。
9. `treats removing an unknown group as a no-op`
   - 记录文件内容；`removeGroup("missing")` resolves；文件仍等于记录值；`environment.writes` 为空。
10. `keeps unknown fields when groups change`
    - 直接写 `variables.json`：`{version:1, groups:["通用","云服务"], variables:[{name:"KEEP", group:"云服务", updatedAt:"2026-01-01T00:00:00.000Z", note:"keep"}]}`。
    - `renameGroup("云服务", "Cloud")` 后原始行仍有 `note: "keep"`，`group` 是 `Cloud`。
    - `removeGroup("Cloud")` 后原始行仍有 `note: "keep"`，`group` 是 `DEFAULT_GROUP`。

**`bridge.test.ts` 新增用例**

照 `packages/resources/prompts/__test__/bridge.test.ts` 的结构，用 `createHubServer` + `createVariableHandler({ home })` + `createRemoteVariableStore(`${listener.url}${VARIABLE_ROUTE}`)`。临时 home，`beforeAll` 起服务器，`afterAll` 关服务器并删目录。**`beforeEach` 重新写种子文件**，让每个用例都从同一份 `variables.json` 出发；handler 里的 store 每次调用都会重新读文件，所以重置文件即可，不需要重启服务器。

关键安全约束：**不要调用 `store.create` / `store.update` / `store.remove`**。handler 内部没有注入 `EnvironmentPort`，这些动作会写真实机器环境。直接在临时 home 的 `variablesPath(home)` 写一份 `variables.json` 种子，只通过桥调用 `read`、`createGroup`、`renameGroup`、`removeGroup`。`read()` 会调用 `environment.ready()`，它只读取系统环境（Windows 读注册表快照、POSIX 读 `~/.config/context-hub/env`），本测试不调用任何会写环境的方法。

种子：

- 写之前 `fs.mkdir(path.dirname(variablesPath(home)), { recursive: true })`。
- `groups: [DEFAULT_GROUP, "云服务", "空组"]`
- `variables: [{ name: "SEEDED_ONE", group: "云服务", updatedAt: "2026-01-01T00:00:00.000Z" }, { name: "SEEDED_TWO", group: DEFAULT_GROUP, updatedAt: "2026-01-01T00:00:00.000Z" }]`

用例：

1. `the whole library`：`read()` 返回 `version/groups/variables` 三个 key，包含种子行。
2. `adding an empty group`：`createGroup("新组")` 返回的 `groups` 含「新组」。
3. `renaming a group through the wire`：`renameGroup("云服务", "Cloud")` 返回的 `groups` 含 `Cloud`，`SEEDED_ONE.group === "Cloud"`，`SEEDED_TWO` 不变。
4. `removing a group through the wire`：`removeGroup("云服务")`，返回的 `groups` 不含「云服务」，`SEEDED_ONE.group === DEFAULT_GROUP`，`SEEDED_TWO` 不变。
5. `refuses a rename onto an existing group through the wire`：`renameGroup("云服务", "空组")` rejects `/already exists/`，HTTP 不是 200 空答案。
6. `refuses to remove the default group through the wire`：`removeGroup(DEFAULT_GROUP)` rejects `/default group cannot be removed/`。
7. `does not claim a path that merely starts with the route`：`fetch(`${listener.url}${VARIABLE_ROUTE}X`)` 返回 404，证明 `under` 的分隔符规则仍生效。

**验收判据**

- `pnpm --filter @context-hub/variables test` 退出码 0；新增用例全部执行，没有 skip。
- `variables-fs.test.ts` 的每个分组用例都断言了 `environment.writes` 为空（或文件不变），能证明「不写机器环境」；bridge 测试只使用不写环境的动作。
- bridge 测试只 seed 文件，不调用三个变量写方法；`grep -n "store\.\(create\|update\|remove\)" packages/resources/variables/__test__/bridge.test.ts` 无输出。

## 阶段六：验证并收尾

**目标**：类型、测试、lint、真实浏览器交互和 AOCI 认知全部收敛。

**命令与预期**

| 命令 | 预期 |
| --- | --- |
| `pnpm --filter @context-hub/variables typecheck` | 退出码 0，无输出 |
| `pnpm --filter @context-hub/variables test` | 0 failed；包含阶段五新增用例 |
| `pnpm --filter @context-hub/variables lint` | 退出码 0 |
| `pnpm --filter @context-hub/zh-cn test` | 0 failed；中文覆盖检查通过 |
| `pnpm --filter web typecheck` | 退出码 0 |
| `pnpm typecheck` | 根 turbo typecheck 退出码 0（跨包检查） |
| `pnpm test` | 根 vitest run 0 failed；如果失败，先确认是否为本轮引入，不要先改无关测试 |

**浏览器实测**

用 `ego-browser` skill（AGENTS.md 指定的浏览器自动化方式）。起自己的一台 dev server，把 hub home 指向临时目录。临时目录要记下来给 seed 和清理用：

```bash
HUB_HOME="$(node -e "const fs=require('node:fs'),os=require('node:os'),path=require('node:path');process.stdout.write(fs.mkdtempSync(path.join(os.tmpdir(),'context-hub-vars-')))")"
echo "$HUB_HOME"
CONTEXT_HUB_HOME="$HUB_HOME" pnpm --filter web dev
```

- 用 Node 写种子 JSON（`$HUB_HOME/variables/variables.json`），避免 Git Bash 的 `/tmp` 路径和 Windows 进程看到的路径不一致。
- 先确认 5270/5271 空闲；如果已有 dev server 在跑（例如你现在用来查看真实数据的那个），先请你停掉它，或由你确认可以临时停。不要复用指向真实 hub home 的服务器做 seed 验收，否则会污染真实变量库。
- 端口固定为 5270/5271（`apps/web/hub-port.ts`）；不要杀别人的 5173/5174。
- 在 `$HUB_HOME/variables/variables.json` 里 seed（不存在就建目录），`version: 1`：
  - `groups: ["通用", "云服务", "空组"]`
  - 变量：`SEED_ONE`、`SEED_TWO` 在「云服务」；`SEED_DEFAULT` 在「通用」；每行带 `updatedAt`，不要带 `value` 字段。
- 打开 `http://localhost:5271/variables`（如果先打开了页面，seed 之后刷新一次）。
- 不点「新建环境变量」，不编辑值；只走分组菜单和分组弹窗，避免写真实机器环境。
- 实测步骤与预期：

| 操作 | 预期 |
| --- | --- |
| 看左栏 | 「全部」「通用」没有 `⋯`；「云服务」「空组」右侧有计数 + 透明底 `⋯` |
| 点「云服务」的 `⋯` | 菜单只有「重命名分组」「删除分组」两项；没有分割线；菜单不被裁剪 |
| 点「重命名分组」 | 弹窗预填「云服务」，输入框内容全选；描述显示 2 个变量；footer 显示 2 个变量 |
| 输入「空组」保存 | 弹窗保留并显示「已经有同名分组。」；文件不变 |
| 输入「通用」保存 | 弹窗保留并显示“不能把分组改名为「通用」。”；文件不变 |
| 先把左栏选中「云服务」，再改名为「云端」 | 左栏出现「云端」，选中项跟随为「云端」；变量行徽标全部变「云端」；`variables.json` 的 `groups` 和行 `group` 同步；环境值无变化 |
| 点「空组」→「删除分组」 | 不弹确认，toast「分组已删除」，行消失 |
| 先把左栏选中「云端」，再删除「云端」 | 先弹确认，标题含「云端」，迁移提示 2 个变量移到「通用」；确认后行消失，选中项回落「全部」，两个变量行徽标变「通用」，变量名和值不变；`variables.json` 一致 |
| 取消/Esc/点弹窗外 | 不删除 |
| 打开任意变量行的 `⋯` | 主菜单和「移动到分组」子菜单都没有分割线；行菜单的 `⋯` 无背景色 |
| 复核环境 | `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariables('User') | ConvertTo-Json -Compress"` 中 `SEED_*` 仍不存在；分组操作没有写环境 |

- 收尾只停自己起的 5270 进程（`dev.ts` 会连带关掉 Vite）；用自己记录的 PID 或端口 5270，不要按镜像名杀进程。
- 删除临时 home，`git status --short` 确认没有测试残留。

**AOCI 收尾**

- 先确认树是静的：`git status --short`，以及 `find packages apps docs -newermt "-20 minutes" -type f -not -path "*/node_modules/*"`；出现不属于本任务的文件就停下问用户，不要继续作者化。
- 所有代码/测试/文案达到最终稳定状态后，只调用一次 `aoci_maintain`。
- 预期受影响的认知对象：`packages/resources/variables/src/store.ts`、`src/host/variables-fs.ts`、`handlers.ts`、`src/remote-store.ts`、`src/page.tsx`、`src/messages.ts`、`packages/i18n/zh-cn/src/messages.ts`。
- 有语义候选时按实时 Guide 用 `aoci_update_entry` 提交完整批次；`F/R/A/S` 按当前机器预算（F≤160、R≤8、A≤6，S 按 C 档），超限先压语义再提交。
- 没有候选或工具返回 `stopped` 时，按失败步骤/恢复流程处理，不要猜写或重复维护。
- 只有用户明确说计划已确认完成后，才把本文件移到 `docs/plans/archive/`；实施过程中不归档。
- 如果本轮出现用户纠正，按 `AGENTS.md` 把可复用的教训写进 `docs/memory.md`。

## 不做

- 不做分组排序、合并、批量移动或分组嵌套。
- 不在分组重命名/删除时写机器环境变量；不改变量名、值、`updatedAt`。
- 不给「全部」或「通用」渲染 `⋯`；不把「通用」改成可改名/可删除。
- 不在变量选择面板（`variable-picker.tsx`）或新建变量弹窗里加入分组管理入口。
- 不新增「分组名不能叫『全部』」的校验；这是现有 `createGroup` 行为，本任务不改。
- 不调整左栏既有行高、间距、计数位置和页面外层间距；只新增行尾 `⋯` 与两个弹窗。
- 不重构 `RowMenu` 的编辑值/重命名/移动分组/复制/删除逻辑；只删两处分割线和触发按钮背景。
- 不新增依赖、不改 `package.json`、不改 `vitest.config.ts`、不改 `apps/web/server.ts`。
- 不做乐观 UI；写操作仍以服务端返回的完整文档为准。
- 不引入 store 级写锁；并发写覆盖是现有行为，不在本轮修。

## 已知限制

- `VariableStore` 的读-改-写没有互斥；两个并发分组操作仍可能后写覆盖前写。这是现有 `create/update/remove/createGroup` 就有的行为，本轮不扩大也不修复。
- 英文界面里的默认分组名仍然是字面量「通用」（`DEFAULT_GROUP`），这是现有设计；新文案里的 `{group}` 会原样显示「通用」。
- 分组名允许「全部」等与筛选器同名的值；本轮只禁止空名、重名和「通用」目标。
- 左栏现有行高是 36px，设计稿是 38px；本轮不调整既有行高与间距，只新增行尾 `⋯`。
- 若在重命名/删除弹窗打开期间另一个操作改变了文档，弹窗里的计数可能短暂过期；确认时仍以主机校验为准。
- 客户端预校验覆盖空名、重名和改名为「通用」；源分组不存在、并发冲突等 host 错误仍按现有模式把英文 `error` 原样显示在弹窗或 toast 里。
- 浏览器验收不能用「新建变量」造数据，否则会写真实机器环境；必须 seed `variables.json`。
