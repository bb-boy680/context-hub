# Skill 卡片与详情按需加载

## 目标与范围

按已确认的效果图调整 Skill 首页卡片：没有媒体时不绘制封面区域，标签位于描述下方、完整展示并可换行，库内技能可在卡片上添加和移除标签。详情弹窗打开后再读取正文和文件树；保留首页搜索、筛选、位置、安装、收录和更新状态等现有能力。图片和视频仍使用现有封面与播放逻辑。

本次只调整 Skills 模块；不改变 Prompt、Plugin 等模块的卡片，也不改变位置技能的所有权、扫描范围或安装方式。不增加依赖。

## 现状与依据

- `packages/resources/skills/src/page.tsx` 的 `SkillCard` 为每个卡片固定创建封面；没有媒体时由 `FileTreeCover` 调用 `useSkillDocument` 显示文件树和 token 数。标签叠放在封面上，只展示前两个。
- `packages/resources/skills/src/library.ts` 的 `useSkillDocument` 对无媒体卡片逐行调用 `store.get` 或 `store.placeSkill`，读取正文和文件树；其缓存、`SkillDocument` 和 `tokenLabel` 目前只供此封面使用。实施时再次搜索直接引用、类型引用、字符串、导出、测试与文档，确认后只清理因本次改动失去用途的代码。
- `packages/resources/skills/src/skill-detail-dialog.tsx` 的 `SkillDetailDialog` 已在选中技能后分别通过 `store.get` 或 `store.placeSkill` 读取完整详情；关闭弹窗时 `skill` 为 `null`，对应 effect 不发请求。它按库内技能和仅存在于位置的技能选择读取源，不能改变这一点。
- 首页的 `SkillLibrary.read`（`library-store.ts`）仍调用 `list`、`tags` 和 `placeSkills`，这些摘要用于首页名称、描述、筛选、收录和安装状态。`host/place-skills.ts` 的 `readPlaceSkills` 仍读取各位置的 `SKILL.md` 以确认技能存在并取描述；这不是逐卡片读取文件树。保持此能力，不能笼统承诺首页完全不访问技能文件。
- `packages/extensions/src/components/tag-editor.tsx` 的 `TagEditor` 已有换行、已有标签建议、输入新标签和删除；Skill 详情已使用它，卡片应优先复用。该组件被多个模块共用，任何外观或事件修改须避免改变其他调用方。
- 标签属于库的 `skills.json` 元数据，现有 `store.update` 只接受库内技能。仅存在于 Agent 位置的技能无可写标签记录；不能静默收录或改写其 `SKILL.md`。因此快捷添加仅对已收录的技能提供，未收录项先使用原有「收录」操作。
- `store.update` 当前写完后返回 `SkillDetail`，会读取该项正文与文件树。这里的目标是消除首页渲染带来的逐卡预加载；用户主动添加标签后沿用现有写入契约，并在验收中单独记录该次读取，避免把它误判成首页自动请求。

## 实施阶段

### 1. 调整卡片与标签

**文件**：`packages/resources/skills/src/page.tsx`；必要时 `packages/extensions/src/components/tag-editor.tsx`、Skills 文案及其中文翻译。

1. 仅在 `cardMedia(skill)` 有媒体时渲染封面容器，保留原始媒体比例、视频自动播放及图片加载行为；无媒体时卡片从标题开始。
2. 把所有标签移至描述之后、来源和操作之前，按容器宽度换行。按用户后续要求，完整复用详情中的 `TagEditor`，保留添加、移除和已有标签建议。
3. 快捷添加调用现有 `setTags` 和 `library.store.update` 并刷新数据；失败时使用现有 toast 呈现错误，不得静默失败。点击、键盘输入、选择建议和关闭弹层不得触发卡片打开详情；键盘和屏幕阅读器可定位操作。
4. 仅对 `inLibrary(skill)` 提供可用的标签编辑入口；未收录技能保留原有收录动作，不尝试向不存在的库记录写入。检查标签筛选后修改标签导致当前行离开筛选结果等情况。
5. 依据无图卡片调整加载骨架，保留合理的布局；网格列数、分页、表格视图和卡片操作保持原样。

**完成判据**：无封面没有媒体占位，有图和视频仍可显示；所有标签可换行，库内技能添加标签后列表和详情一致；使用标签控件不会误开详情。

### 2. 移除首页详情预取

**依赖**：阶段 1。

**文件**：`packages/resources/skills/src/page.tsx`、`packages/resources/skills/src/library.ts`，以及受影响的 Skills 测试。

1. 删除 `FileTreeCover` 及其专属依赖，移除 `SkillCard` / `SkillGrid` 不再需要的 `store` 参数；全仓复核后清除仅由该预览使用的 `useSkillDocument`、相关类型和缓存。
2. 保留详情弹窗现有按需读取路径，检查连续打开不同技能、关闭后重开、库内 / 位置独有技能和读取失败时的状态；如存在旧详情短暂显示或未更新问题，在此范围内修正，避免修改首页摘要读取语义。
3. 检查空媒体技能详情仍显示正文、文件面板仍可打开；图片、视频与详情编辑功能不倒退。

**完成判据**：初次打开 Skill 首页，不因网格卡片触发逐技能 `get`、`placeSkill` 或文件树读取；点击某张卡片才请求该技能详情。正常的目录摘要与位置扫描继续工作。

## 验证安排

由本会话执行开发和验证，不分派子 Agent。先运行 Skills 包已配置的最小检查：

```bash
pnpm --filter @context-hub/skills test
```

```bash
pnpm --filter @context-hub/skills typecheck
```

```bash
pnpm --filter @context-hub/skills lint
```

若改动共享 `TagEditor`，补跑 `pnpm --filter @context-hub/extensions test`、`typecheck` 和 `lint`，并核对其他调用方默认表现。为关键行为补最小可执行测试：库内及位置技能的加载、标签写入失败、详情打开 / 关闭和重复选择；不以源码字符串断言替代实际行为。

使用项目现有开发启动配置与 `ego-browser` 检查实际页面；先确认当前端口和隔离数据根，避免写入用户真实 Agent 目录。构造有图、视频、无图、多标签和仅位置技能的隔离数据：

- 初次进入和切换筛选时观察网络请求，确认无逐卡 `get` / `placeSkill`；同时核对位置摘要和安装状态仍正确。
- 打开库内和位置技能的详情，确认请求只针对选中项，正文与文件树可用；关闭后重开和快速切换时不显示其他技能内容。
- 验证多行标签、新增已有标签 / 新标签、重复及空输入、持久化重载、键盘操作及点击不触发详情；未收录技能先收录后才能编辑标签。
- 在窄容器和深色模式确认布局和可见性，检查浏览器控制台和请求错误；测试视频播放与现有操作菜单。

如果现有预览启动配置与实际端口不一致，实施时先核对 `apps/web/dev.ts`、`apps/web/hub-port.ts`，只启动自己管理的服务；不停止或改写用户现有进程和配置。

## 收尾与风险

- 标签快捷编辑会触发一次显式的写入及当前契约的详情返回；不属于首页自动预加载。若要求写入时也完全不读详情，应另行核对 `SkillStore.update` 所有调用者、桥接和兼容契约，再调整接口。
- 首页仍读取位置 `SKILL.md` 的摘要以识别技能和显示描述；要消除这类读取需要另外设计位置索引，属于不同范围。
- 最终稳定后按仓库 AOCI 规则检查受管文件，并在确认没有其他会话正在改动相关托管对象时维护；不得覆盖工作区已有改动。
- 用户明确确认实施完成后才归档本计划。审批计划不等于确认完成。
