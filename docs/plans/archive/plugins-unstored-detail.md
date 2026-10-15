# 未收录的插件也能打开详情弹窗

## Context

`/plugins` 页上，只被某个 agent 持有、hub 还没收录的包（`PluginRow.stored === false`）
点不开详情弹窗，卡片连指针样式和 `role="button"` 都没有：

- `packages/plugin-plugins/src/page.tsx:382-399` — 卡片的 `role` / `tabIndex` /
  `aria-label` / `onClick` / `cursor-pointer` 全部按 `plugin.stored` 三态取 `undefined`。
- `packages/plugin-plugins/src/page.tsx:1021-1023` — `openDetail` 里的 `if (plugin.stored)`。

原注释给的理由是「一个只有 agent 持有的包在这里没有文件可读」。但这个理由和同仓
`/skills` 页的现状不一致：`packages/plugin-skills/src/page.tsx:1229` 的 `openDetail`
不设条件，未收录的技能照样开详情，弹窗内靠 `inLibrary(skill)`
（`skill-detail-dialog.tsx:1152, 1250`）把文件面板换成「收录」动作。

用户确认：按 skills 的方式放开。

## 已确认的前提

- `plugins.action.adopt` 两种语言里都已存在（`plugin-plugins/src/messages.ts:22`、
  `locale-zh-cn/src/messages.ts:294`），**不需要新增消息键**。
- `library.adopt(name)` 已有（`library.ts:389-396`），页面侧 `actions.onAdopt` 已接好
  （`page.tsx:959-976`），批量收录也走它。
- 列表视图不受影响：`Ledger` 的 `onOpen` 本来就是无条件的
  （`extensions/src/components/ledger.tsx:163`），行内菜单与复选框各自
  `stopPropagation`（`install-actions.tsx:273`、`ledger.tsx:170`），卡片上的
  `AdoptButton` 也已 `stopPropagation`（`page.tsx:257`）。所以放开点击不会让动作
  误开弹窗。
- `heldRow`（`rows.ts:167-189`）丢掉了 `ScannedPack.source.path`，所以未收录的包
  **读不到目录里的文件**。本次不做「从 agent 的目录读文件」，只把文件入口关掉。

## 不做（超出本次范围）

- 未收录的包在弹窗里列出「哪个 agent 在哪个 scope 持有它」：现有详情对已收录的包
  也不显示这一列，属于新增能力。
- 从 agent 的目录读未收录包的 README / 文件树：需要 host 侧新能力，参考
  `plugin-skills` 的 `placeSkill`。

---

## 阶段一：卡片与行无条件可开

`packages/plugin-plugins/src/page.tsx`

1. `PluginCard`（:378-400）：去掉 5 处 `plugin.stored` 三态，卡片恒为
   `role="button"` + `tabIndex={0}` + `aria-label={plugin.name}` + `onClick={onOpen}` +
   `cursor-pointer hover:shadow-soft focus-visible:ring-2`。`className` 由模板字符串
   改成常量串。注释改写为说明「卡片自带动作按钮，所以只能自己处理 Enter / 空格」。
2. `openDetail`（:1019-1023）：`if (plugin.stored)` 去掉，直接 `setDetailId(plugin.id)`。

**验收**：`pnpm typecheck` 通过；网格与列表两种视图里未收录的行都能点开（阶段三看）。

## 阶段二：弹窗按 `stored` 分区

`packages/plugin-plugins/src/detail-dialog.tsx`

1. `InfoPanel` 新增 prop `onAdopt: () => void`。
2. `TagEditor`（:573-582）只在 `plugin.stored` 时渲染：分类是 hub 自己的库记录，
   未收录的包没有记录可写。`heldRow` 的 `tags` 也恒为 `[]`。
3. 「最近更新」那行 `MetaRow`（:591）只在 `plugin.updated !== ""` 时渲染——
   未收录的包 `updated` 就是空串（`heldRow` 不填），不是「刚刚」。
4. footer（:595-613）分两支：
   - `plugin.stored`：现在的「文件」主按钮 + `PluginActions`（不变）。
   - 否则：一个占满宽度的「收录」主按钮（`PlusIcon` + `plugins.action.adopt`，
     `disabled={busy}`，`onClick={onAdopt}`）。`PlusIcon` 已在该文件 import。
5. `PackLightbox` 的 `overlay`（:786-795）只在 `plugin.stored` 时传：未收录的包没有
   文件可读，`FilesPanel` 挂载就会发一次必然失败的 `packFiles` 请求。
6. `PluginDetailDialog` 把 `onAdopt` 透传下去。
7. `page.tsx` 的调用处（:1322-1336）补 `onAdopt={(plugin) => actions.onAdopt(plugin)}`。

**不改**：`MediaPane`。它的图片本来就不落盘（顶部注释：只在窗口内用 object URL），
对已收录与未收录的包行为完全一致，多一个分支反而生出两套行为。

**验收**：`pnpm typecheck`、`pnpm lint` 全绿。

## 阶段三：跑起来看

`packages/plugin-plugins` 有 assert 式自检脚本，本次没动 `rows.ts` / `library.ts`，
但 `rows` 的两个脚本要确认没被带坏：

```
cd packages/plugin-plugins && node scripts/check-plugin-rows.ts
cd packages/plugin-plugins && node scripts/check-plugin-library.ts
pnpm typecheck
pnpm lint
pnpm dev   # 打开 /plugins
```

页面上逐条确认：

- 「未收录」页签（或「全部」里没有库标记的行）卡片与表格行都能点开。
- 弹窗里：标题 / 描述 / 来源 / 封面正常；没有分类编辑器、没有「最近更新」行、
  没有「文件」按钮、没有安装菜单；footer 是一个「收录」按钮。
- 点「收录」后：弹窗里该行变成已收录（分类编辑器、文件按钮、安装菜单出现），
  与 `/skills` 的对应流程一致。
- 已收录的包行为零变化：卡片、弹窗、文件面板、分类编辑、安装菜单全部照旧。
- 表格视图里点复选框、点行内动作菜单，仍然不会顺带打开弹窗。

## 收尾

- 用户确认后归档到 `docs/plans/archive/`。
