# Skills 卡片改版（2026-10-07）

## 计划

- [x] 设计稿：技能卡片右下角开关 → Install / Uninstall 按钮（草稿先行，只改卡片）
- [x] 设计稿迭代：封面去模糊、加分类胶囊、加单位、去分隔线、多 tag 胶囊（最多 2 + "+N"）
- [x] 用户确认草稿（"行，就这样吧"）
- [x] 同步列表视图（按钮列 + 列宽 + TRIGGERS 纯数字）
- [x] 同步暗色画板（12 张卡片的胶囊 + 按钮 + 单位）
- [x] 同步 apps/web 代码（skills.tsx 卡片与列表）
- [x] 验证（typecheck 通过 + 浏览器 DOM/截图核对）

## 结果

- **画布**：`Context Hub — Skills — Grid v3`（`libo0`）为确认稿；详情改为两块新屏
  `Detail Lightbox`（`L9tdZp`）与 `Detail Lightbox — Files`（`Mnwzp`）。
- **代码**：`apps/web/src/pages/skills.tsx`、`apps/web/src/components/skill-detail-dialog.tsx`（重写为 lightbox）。
  校验：`pnpm typecheck` 与 `npx eslint src/...` 均通过。
- **已实现的交互**：单击卡片/行打开 lightbox；左媒体支持图片与视频（播放/暂停、进度条、计数、左右切换）、
  拖拽或 ＋ 上传（本地文件即时预览）；右侧信息面板可 Install/Uninstall；
  点 `View files` 文件面板从右往左滑入（返回按钮回到信息面板）。
- **核对图**：`designs/check-skills-card-v4/`、`designs/check-skills-sync/`、`designs/check-skills-lightbox/`、
  `designs/check-web/`（`lb-dialog.png`、`lb-files.png`、`lb-uploaded.png`、`lb-nocover.png`）。
- **待办（需用户决定）**：画布上旧版 Grid / v2 / 旧的两块 tab 详情屏是否清理；
  顶部筛选数字（All 42 等）是否对齐演示数据（14 条）。
