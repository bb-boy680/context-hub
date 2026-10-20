# 新建环境变量：值可选

## 背景

「新建环境变量」弹窗当前把值当作必填。用户可能已经在系统里设置了同名全局变量，只想在 Context Hub 索引里登记名字，因此创建时值应可留空；留空只写索引，不覆盖系统环境里已有的值。

已核对现状：

- `packages/resources/variables/src/page.tsx:467-477` 的 `CreateDialog.rowError` 用 `row.value.trim() === ""` 返回 `variables.create.valueRequired`，提交因此被禁用。
- `page.tsx:517-524` 的 `submit` 把 `row.value` 原样交给 `onCreate`；`DraftRow.value`（`:434-438`）保持 `string` 即可。
- `packages/resources/variables/src/store.ts:43-48` 的 `VariableDraft.value: string`，注释写 it is required；`create` 的 JSDoc（`:61-69`）写无值会 throw。
- `packages/resources/variables/src/host/variables-fs.ts:96-103` 的 `requiredValueOf` 拒绝空/纯空白；`create`（`:214-265`）对每行先 `environment.set` 再写索引，失败按 `written` 回滚。
- `packages/resources/variables/handlers.ts:42-57` 的 `draftsOf` 已把缺失的 value 归一成 `""`，后端无需改。
- 文案在 `packages/resources/variables/src/messages.ts:68-70` 与 `packages/i18n/zh-cn/src/messages.ts:933-935`。
- `read()`（`variables-fs.ts:201-209`）按名字从环境回读；缺失值显示为空串，页面已显示「未设置」，无需改。

## 已确认语义

- 创建：`value` 省略、`undefined`、`""` 或纯空白 → 只登记名字，不调用 `environment.set/remove`，不覆盖已有全局值。
- 有值的行照旧先写环境再写索引；回滚只针对本次真正写过的名字。
- NUL 仍拒绝；非字符串仍拒绝。
- 编辑（`update`）语义不变：`value: ""` 仍 throw `variable value is required`。

## 阶段 1：放开创建契约与存储

目标：store 接受无值草稿，单测与新契约一致，阶段结束时测试全绿。

改动：

- `store.ts`：`VariableDraft.value?: string`，注释改为「省略或空白表示只登记名字，不写环境」；`create` JSDoc 删掉 “a row has no value”，改为说明无值行只登记名字。
- `variables-fs.ts`：在 `requiredValueOf` 旁新增 `optionalValueOf(value): string | undefined`：`undefined/null` → `undefined`；非字符串 throw `variable value must be a string`；`trim() === ""` → `undefined`；含 NUL throw；否则原样返回（不 trim）。
- `variables-fs.ts` 的 `create`：entries 用 `optionalValueOf(draft.value)`；写环境循环跳过 `value === undefined`，`previous`/`written` 只记录实际写入的名字；回滚逻辑不变。
- `requiredValueOf` 保留，仅 `update` 继续使用。
- `__test__/variables-fs.test.ts`：删掉 “refuses a row without a value”；新增 (a) 空/缺失值创建成功、`environment.writes` 为空、索引含这些名字、`read()` 值为 `""`，且 NUL 仍 reject；(b) 初始环境已有同名值时创建后 `read()` 返回该值、`writes` 为空；保留 `update(..., { value: "" })` reject 的断言。

验收：

- `pnpm --filter @context-hub/variables typecheck`
- `pnpm --filter @context-hub/variables test`

## 阶段 2：更新弹窗与文案

目标：弹窗不再拦截空值，文案说明可留空。

改动：

- `page.tsx`：`rowError` 删除 `if (row.value.trim() === "") ...` 这一行；`submit`、`DraftRow`、值输入框保持不变（空串由存储层归一为 `undefined`）。
- `messages.ts`：`variables.create.helper` 改为 “One variable per row; pasted lines split into rows. A value is optional: leave it empty to register the name only, and the value comes from the machine environment.”；删除 `variables.create.valueRequired`。
- `packages/i18n/zh-cn/src/messages.ts`：同位置改中文 helper 为「每行一个变量；粘贴多行会按行拆开。值可以留空：留空时只登记名字，值从系统环境读取。」；删除 `variables.create.valueRequired`。两份一起删，避免中文表留下 stale key。

验收：

- `pnpm --filter @context-hub/variables typecheck`
- `pnpm --filter @context-hub/zh-cn test`
- `pnpm --filter web dev` 打开环境变量页做人工检查（不提交）：弹窗填名字、值留空不再显示「值不能为空」，创建按钮可用。不要真正提交，提交会写真实机器环境。

## 阶段 3：验证回归并收尾

- 依次跑 `pnpm --filter @context-hub/variables typecheck`、`pnpm --filter @context-hub/variables test`、`pnpm --filter @context-hub/zh-cn test`，全绿。
- `git grep -n "valueRequired" -- packages/resources/variables packages/i18n/zh-cn` 应无输出；`git grep -n "value is required" -- packages/resources/variables packages/i18n/zh-cn` 只剩 `variables-fs.ts` 的 `requiredValueOf` 与 update 测试。
- 受管文件变化后按 AGENTS.md 调用一次 `aoci_maintain`；仅当返回语义候选时更新 Entry（`store.ts` 的 create 契约已变）。

## 不做

- 不改编辑值：`update` 仍要求非空，`variables.edit.*` 文案不动。
- 不改 `designs/settings.pen`，不新增/调整设计。
- 不改 `Variable.value`、`read()` 和页面「未设置」展示。
- 不改 `handlers.ts`（`draftsOf` 已兼容缺失值）、`remote-store.ts`、`library-store.ts`（只透传 `VariableDraft`）。
- 不改值输入框 placeholder 与其它文案，不加新依赖。
