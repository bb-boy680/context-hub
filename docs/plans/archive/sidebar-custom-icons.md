# 侧边栏与扩展页自定义图标

## 完成记录（2026-11-04）

用户已确认任务完成并要求提交 commit，明确本次不做 AOCI。

- 已交付 12 枚自绘 SVG、独立 `@context-hub/extensions/icons` 导出，以及侧栏、扩展 manifest 和搜索图标接入。
- 预览已从实际组件生成，包含明暗主题、扩展分组和 18/20/24/40 尺寸对照；三个指定市场来源保留原图标。
- `pnpm --filter @context-hub/extensions typecheck`、`pnpm typecheck`、`pnpm lint`、`pnpm --filter web build` 均通过。
- 真实页面 DOM 核对：侧栏图标 18px、行高 40px，扩展列表图标 20px；两个语言包图形一致；English 详情图形与列表一致；浅色与深色图标颜色继承正常。
- 内置浏览器截图连续超时，未完成截图视觉验收；搜索面板交互验收在用户确认收尾时尚未执行。不将这两项记为通过。
- 跳过 AOCI，保留未更新索引；不提交其他会话的改动。

下文保留已批准的实施方案与验收安排。

## 目标与范围

为侧边栏及扩展页的产品功能设计并接入同一套自绘 SVG 图标。相同模块在侧边栏、扩展列表、扩展详情和搜索结果中使用同一个组件。

2026-11-04 用户补充的范围约束：

- 扩展页的资产、集成、语言和资产源分组都纳入核对，不能只列侧边栏入口。
- 全局搜索、English、简体中文的扩展图标需要更换；两个语言包共用语言图标。
- `skills.sh`、`Claude Code market`、`Codex market` 的现有图标在所有位置原样保留，包括侧边栏、扩展列表、详情和搜索。
- 插件市场（`Plugin market`）需要更换，不能与上述三个保留的市场来源混淆。

用户已批准按本修订计划实施。实施时确认 Skills/MCP 声明需支持纯 Node 加载，因此共享图标使用无 JSX 的 `.ts` 文件，并增加独立 `@context-hub/extensions/icons` 导出，避免引入 components barrel 中的 TSX 页面组件。造型和替换范围不变。

## 现状与依据

- `apps/web/src/components/app-sidebar.tsx` 的 `NavGroup` 渲染导航贡献的 `item.icon`。
- `apps/web/src/lib/navigation.ts` 声明设置、扩展入口；`apps/web/src/components/workspace-group.tsx` 声明工作区、创建工作区图标。
- `apps/web/src/pages/extensions.tsx` 的 `ExtensionRow` 读取 `manifest.icon`，在 40px 图标底板内显示 20px 图标。
- `apps/web/src/components/extension-detail-dialog.tsx` 同样读取 `manifest.icon`。
- 五个资产模块分别声明 manifest、导航和搜索 provider 图标；它们是多个声明位置，必须逐个接入同一个自绘组件，不能假定改 manifest 就会自动修改导航或搜索。
- `packages/search/global-search/src/index.ts` 声明全局搜索扩展图标；该包的 `search.ts` 另行声明设置和扩展的搜索分组图标。
- `packages/extensions/src/builtin/locale-en.ts` 和 `packages/i18n/zh-cn/src/index.ts` 分别声明两个语言包的 manifest 图标。
- `packages/market/skills-sh/src/extension.ts` 的 `MarketIcon` 使用随包提供的 `assets/icon.ico`；它不是 lucide 图标。`Claude Code market` 当前为 `GlobeIcon`，`Codex market` 当前为 `BoxesIcon`，均按用户要求保留现状。
- `ExtensionIcon` 已接受 `className` 和 `aria-hidden`；自绘组件沿用该签名，不调整贡献接口。

## 图标范围矩阵

| 功能 / 扩展 | 新图形方向 | 侧边栏 | 扩展列表 / 详情 | 搜索 |
|---|---|---|---|---|
| Skills / 技能 | 圆角模块板 + 实心四角星 | 更换 | 更换 | 更换模块图标 |
| MCP servers | 双层机箱 + 状态点 | 更换 | 更换 | 更换模块图标 |
| Plugins / 插件 | 带插口的圆角方块 | 更换 | 更换 | 更换模块图标 |
| Prompts / 提示词 | 卡片 + 加粗 `>` | 更换 | 更换 | 更换模块图标 |
| Environment Variables | 自绘 `{ }` | 更换 | 更换 | 更换模块图标 |
| Global search | 自绘放大镜，圆弧镜框与短柄 | 无此导航行 | 更换 | 保持搜索功能与行为 |
| English | 两张错位字形卡片，概括语言切换 | 无此导航行 | 更换 | 沿用 manifest 图标的位置同步更新 |
| 简体中文 | 与 English 共用语言图标 | 无此导航行 | 更换 | 沿用 manifest 图标的位置同步更新 |
| Plugin market / 插件市场 | 雨棚店面 + 门 | 更换 | 更换 | 沿用 manifest 图标的位置同步更新 |
| 设置 | 两条滑杆 + 实心圆把手 | 更换 | 无独立扩展条目 | 更换分组图标 |
| 扩展 | 三块模块 + 加号槽位 | 更换 | 无独立扩展条目 | 更换分组图标 |
| 工作区 | 自绘文件夹 | 更换 | 无独立扩展条目 | 无此入口 |
| 创建工作区 | 自绘加号 | 更换 | 无独立扩展条目 | 无此入口 |
| skills.sh | 保留现有 `MarketIcon` 图片 | 保留 | 保留 | 保留 |
| Claude Code market | 保留现有 `GlobeIcon` | 无此导航行 | 保留 | 保留 |
| Codex market | 保留现有 `BoxesIcon` | 无此导航行 | 保留 | 保留 |

共设计 **12 枚**功能图标：原 11 枚移除 Skills 市场替换，增加全局搜索、语言两枚；English 与简体中文共用一枚。

## 设计规格

- `viewBox="0 0 24 24"`，2px 描边、圆角端点与连接，统一视觉重量。
- 闭合面的填充使用 `currentColor`、`fillOpacity=0.14`；细节只保留在小尺寸下可辨的一处，必要时使用实心细节。
- 使用 `currentColor` 跟随所在界面颜色；分别检查明暗主题，不单凭颜色继承断言对比度合格。
- 按 18px 侧栏、20px 扩展列表以及详情实际尺寸检查。放大图用于检查形状，不能替代小尺寸验收。
- 全局搜索、语言图标须补入同一套设计预览；本次计划只确定隐喻，具体路径仍需绘制并检查。
- 保留现有侧栏与扩展页布局、底板、字号、间距和交互；不增加装饰性文案、动画或新依赖。

## 实施阶段

### 阶段一：补齐设计与共享图标

**目标**：完成覆盖侧栏和扩展页的设计，并提供可复用的组件。

**改动文件**：

- `docs/research/sidebar-icons/preview.html`
- `packages/extensions/src/components/sidebar-icons.ts`（新增）
- `packages/extensions/src/components/index.ts`

**步骤**：

1. 预览中撤销 skills.sh 的提袋替换，使用原有图片；加入全局搜索、语言图标，补上扩展页的资产、集成、语言、资产源四组展示，三个保留来源使用现有图标作对照。
2. 新增内部 SVG 框架及 12 个组件：`SidebarSkillsIcon`、`SidebarMcpIcon`、`SidebarPluginsIcon`、`SidebarPromptsIcon`、`SidebarPluginsMarketIcon`、`SidebarWorkspaceIcon`、`SidebarCreateIcon`、`SidebarVariablesIcon`、`SidebarSettingsIcon`、`SidebarExtensionsIcon`、`SidebarSearchIcon`、`SidebarLanguageIcon`。不创建 `SidebarSkillsMarketIcon`。
3. 在 `packages/extensions/package.json` 增加独立 `./icons` 导出，消费者从该入口导入，避免引入 components barrel 的 TSX 依赖；同时从共享 components 入口 re-export。英文内置语言包直接从图标文件相对导入。图标以 `createElement` 写入 `.ts`，保留纯 Node 加载能力。

**完成判据**：12 枚组件满足现有 `ExtensionIcon` 签名；设计包含明暗主题、18/20/24/40 尺寸对照和扩展分组；三个保留来源不使用新画的替代图形。

### 阶段二：统一各入口图标来源

**前置依赖**：阶段一组件与导出可用。

| 文件 | 必须修改的声明 |
|---|---|
| `packages/resources/skills/src/extension.ts`、`src/search.ts` | manifest、导航、搜索模块图标 |
| `packages/resources/mcp/src/extension.ts`、`src/search.ts` | manifest、导航、搜索模块图标 |
| `packages/resources/plugins/src/index.ts`、`src/search.ts` | manifest、导航、搜索模块图标 |
| `packages/resources/prompts/src/index.ts`、`src/search.ts` | manifest、导航、搜索模块图标 |
| `packages/resources/variables/src/index.ts`、`src/search.ts` | manifest、导航、搜索模块图标 |
| `packages/market/plugins/src/extension.ts` | manifest、导航图标 |
| `packages/search/global-search/src/index.ts` | 全局搜索 manifest 图标 |
| `packages/search/global-search/src/search.ts` | 设置、扩展搜索 provider 图标 |
| `packages/extensions/src/builtin/locale-en.ts` | English manifest 图标 |
| `packages/i18n/zh-cn/src/index.ts` | 简体中文 manifest 图标 |
| `apps/web/src/lib/navigation.ts` | 设置、扩展导航图标及不再准确的 lucide 专属注释 |
| `apps/web/src/components/workspace-group.tsx` | 工作区、创建工作区前导图标 |

表中的 `src/search.ts` 与同一行前面的文件位于同一个包。

扩展列表和详情组件属于验收调用方：它们已读取 manifest，不添加按 id/path 覆盖的映射。全局搜索按钮、语言选择器等其它操作控件不在本次替换范围，保留其现有操作图标。

以下三个包的源码、图标声明与资源均不修改：

- `packages/market/skills-sh/`
- `packages/market/claude-plugins-official/`
- `packages/market/codex-plugins/`

**完成判据**：矩阵中的更换项全部从同一组件来源渲染；三个保留来源仍引用原组件及资源；清理本次替换造成的未使用 import，不删除仍被其它位置使用的 lucide import；不更改路由、启停和安装逻辑。

### 阶段三：核验并收尾

由主 Agent 统一执行，不为本任务创建子 Agent。

1. 运行已存在的最小检查入口：`pnpm --filter @context-hub/extensions typecheck`，检查共享图标签名与内置语言包引用。
2. 运行根脚本 `pnpm typecheck`、`pnpm lint`，覆盖所有接入包和消费者；运行 `pnpm --filter web build` 检查实际应用打包。若有既存失败，记录具体失败与本次 diff 的关系，不能写成全部通过。
3. 用项目的 preview 工具启动应用并核验：侧栏 18px 图标、扩展列表 20px 图标、扩展详情、搜索面板，在浅色和深色主题中截图。用 DOM 检查实际图标尺寸和主题颜色；用截图判断小尺寸辨识度。
4. 扩展页逐项覆盖五个资产模块、全局搜索、English、简体中文、Plugin market；确认两个语言包使用同一图标。打开代表性的详情，确认与列表一致。
5. 对三个保留来源作改前/改后对照，确认图标形状、资源引用与颜色均未被替换。skills.sh 还需检查侧栏原有图片仍显示。
6. 不为纯 SVG 路径及 import 替换增加镜像实现的单测；通过类型检查、构建和真实渲染验证。若出现非平凡逻辑变更，先收回本次范围，不顺带加入。
7. 检查 diff 只含本次改动，保留已有工作区修改。按用户最终指示，本次跳过 AOCI，不更新认知索引。

**完成判据**：检查结果如实记录；更换项在所有指定位置一致，三个保留来源保持原样；无图标裁切、布局位移或运行时错误。未完成的验证明确列出原因。

## 边界、风险与状态

- 保留各 Agent 品牌图标及行内 ✓、⋯、折叠箭头；不扩展到任意第三方扩展的作者图标。
- 不升级依赖、不更改启停/安装行为、不改扩展分类或描述。
- manifest 图标替换会自然影响详情与读取它的搜索结果，这属于预期交付，必须验收。
- 双色填充与语言字形可能在小尺寸下显得拥挤，需要通过预览简化形状；如需调透明度，统一修改共享规格。
- 预览已从实际组件生成，旧稿中 skills.sh 的提袋替换已撤销。
- 用户已确认任务完成；将计划归档并提交本次改动，AOCI 按用户指示暂不维护。
