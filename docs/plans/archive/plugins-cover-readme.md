# Plugins 封面：图 → README.md → 占位块

## Context

`/plugins` 的详情灯箱（左侧「展示图」页签的舞台）和列表页卡片（卡片顶部封面区），原来只认「图」这一种内容。没有图时：

- 灯箱舞台（`detail-dialog.tsx` 的 `BundleStage`）：圆形 PlugIcon + 包名 + 描述
- 卡片封面区（`page.tsx` 的 `BundleCover`）：圆形 PlugIcon + 版本号

`designs/README.md:179` 早就写了这一列应该是「16:9 截图；无截图时渲染 `README.md`」——这次是让实现追上设计稿。

改成三级回落：**人加的渲染图 → 渲染 README.md → 原来的占位块**。

两处用户已定的取舍：

1. 判据只看 `record.assets`（人加的图），包自带的 logo（`record.icon`）**不算**「渲染图」。
2. 圆形 PlugIcon **只从灯箱那处去掉**；卡片封面区保留。

## 改动

### `packages/plugin-plugins/src/rows.ts`

- `toRow`：`const cover = record.assets[0]`，去掉 `?? record.icon`。
- `heldRow`：去掉 `cover` 字段，只留 `icon`。
- `types.ts` 的 `PluginRow.cover` 注释跟着改。

### `packages/plugin-plugins/src/library.ts` — 新增 `usePackReadme(plugin)`

返回 `string | null | undefined`：`undefined` = 还在读，`null` = 没有，`string` = 正文。

读哪儿照 `FilesPanel` 已有的规则（不发明第二套）：`plugin.stored ? packFile(plugin.id, "README.md") : packFileIn(plugin.directory, "README.md")`。用仓库既有的 `queueMicrotask` + `live` 写法，effect 依赖是 `React.useCallback` 出来的读函数（**不能**把 promise 本身放进依赖，否则每次渲染一个新 promise，effect 重跑 → setState → 再渲染，无限拉取）。

**不做缓存**：skills 的 `useSkillDocument` 用 `skill.stamp`（记录时间戳）做缓存键，`PluginRow` 没有这个字段，硬凑一个会在 `update` 之后显示旧 README。

### `packages/plugin-plugins/src/detail-dialog.tsx`

- `BundleStage`：删掉圆形 PlugIcon（`PlugIcon` 的 import 一并删掉）。
- 新增 `ReadmeStage`：滚动 + 居中 + `max-w-[640px]` + `Markdown`，照 `plugin-skills` 的 `DocumentStage` 抄一份（那个组件没导出、`plugin-plugins` 也不依赖 `plugin-skills`，所以是本地 8 行拷贝，不是跨包重构）。
- `MediaPane` 的舞台：`Slide` → `ReadmeStage` → `undefined` 时空白（不先画 `BundleStage`，否则要删掉的 icon 会闪一下）→ `null` 时 `BundleStage`。

### `packages/plugin-plugins/src/page.tsx`

- 新增 `CoverFace`（`plugin.cover === undefined` 走 `ReadmeCover`，否则 `PhotoCover`）与 `ReadmeCover`（`overflow-hidden` 裁剪，不滚动；`pt-10` 让开标签胶囊）。
- **README 在读函数里按需读**：`usePackReadme` 只在 `ReadmeCover` 里调用，所以有图的卡一次请求都不发。

### `packages/plugin-plugins/scripts/check-plugin-rows.ts`

原来那条「包自带 logo 也填卡片封面」的断言按预期变红，改成它的反面，并**自证过**：把 `toRow` / `heldRow` 任一半退回旧写法，断言都会红。

## 验证

1. `pnpm --filter @workspace/plugin-plugins typecheck` — 绿
2. `pnpm --filter @workspace/plugin-plugins lint` — 绿
3. `node packages/plugin-plugins/scripts/check-plugin-rows.ts` — 67 项全过
4. **真浏览器**（headless Edge + CDP，跑在用户自己已经起着的 5173 上，没有另起服务、没有动那个进程）：
   - 卡片：superpowers / ponytail / aikido / claude-hud / remotion / hyperframes 六张封面是 README 正文、`svg` 数为 0；**warp 没有 README.md**，封面仍是 PlugIcon + `2.2.0`
   - 灯箱（aikido）：`panePadding: 24px 32px`（= `py-6 px-8`）、`paneSvgs: 0`、正文是 README
   - 灯箱（superpowers）：`paneScrollable: true`（scrollHeight 7287 / clientHeight 557），长 README 真的能滚

## 已知问题（本轮未修，越出任务范围）

1. **README 里的行内 HTML 会照字面显示**。ponytail 的 README 开头是 `<p align="center"> <picture> <source …>`，卡片上就是这串标签文本。这是 `packages/ui/src/components/markdown.tsx` 的既定策略（不开 raw HTML，注释里写明了），不是这次改出来的，但这次让它在每一张卡上都可见。要改的话是两选一：给 `Markdown` 加 `rehype-raw`（新依赖 + 让任意第三方包的 README 有 XSS 面），或在调用处先把 HTML 段剥掉。
2. **卡片正文与 README 首段可能重复**（ponytail 最明显）。`designs/skills.pen` 里为 skills 记过同一条顾虑，当时的解法是把封面换成文件树而不是正文。
3. **`record.assets` 目前没有任何写入路径**（`MediaPane` 加的图只是窗口内的 object URL，不落盘），所以「人加的图」这一档眼下恒为空，每个包都落到 README。`assets[0]` 那一支照写，当将来上传功能的钩子；包自带的 logo 只剩卡片标题旁那个小砖（`PluginTile`）。
