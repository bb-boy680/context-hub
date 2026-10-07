# Context Hub 插件机制（Cordis 内核）落地（2026-10-07）

## 目标

为 Context Hub 软件自身设计插件机制（Extensions），与 `/plugins` 页的 Claude Code 资产包区分开。
内核直接采用 Cordis（`@deepseek-ai/cordis@4.0.4`，与 deepseek-harness 同源）。
Web / Web+Host / 桌面 / Exe 四种形态共用同一内核，形态差异收敛到 `PlatformHost` 能力缝。

## 设计稿（2026-10-07，先于实现交付）

- [x] 侧栏组件加 `Extensions` 导航项（**Operate 组末尾**，用户 2026-10-07 指定；Manage 组还原 4 项）
- [x] `Module / Extensions`（`fiE2W`）三屏：目录 `xoH9e` / 详情弹窗 `f994Qy` / 中文界面 `p4Gt9`
- [x] **简体中文拆成独立 monorepo 包** `packages/locale-zh-cn`（`@workspace/locale-zh-cn`）：
  内核只留锁定英文兜底，应用侧 `[...builtinExtensions, simplifiedChineseLocale]` 组装目录
- [x] **行控件改为 Install / Uninstall 按钮**（用户要求，弃用 Switch）：三屏 + 应用代码同步
- [x] **补上分区玻璃卡片**（用户指出应用缺少卡壳）：`bg-card + p-5 + ring-1 ring-glass-border +
  shadow-glass + backdrop-blur-glass`，卡内 header（16/600 标题 + 14 muted 说明）+ 两列行区；
  新增 `extensions.category.<id>.description` 中英文案
- [x] 浏览器核对 + 视觉复核；核对图 `designs/check-extensions/`、`designs/check-web/extensions-*.png`
- [ ] 用户评审：行内是否显示「未检测到运行时」等状态、是否需要 Sources 分区；
      中文界面下扩展行的名称/描述是否也要跟随语言包翻译（当前按 manifest 原文显示）

## 计划

- [x] 契约类型：manifest / 扩展点 / PlatformHost / 扩展定义（`packages/extensions/src/types.ts`、`host.ts`）
- [x] ExtensionService：目录、状态持久化、启用=激活、禁用=dispose 回滚、贡献注册表
- [x] I18nService：语言包贡献 → `t()` 查询链（活跃 → en → key）
- [x] React 绑定：HubProvider + useExtensionSnapshot / useContributions / useI18n
- [x] 内置扩展：English（锁定）、简体中文（声明式样板）、Claude Code / Codex / Copilot（代码贡献 target 描述符）
- [x] Extensions 页（Codex 风格：分类分组、+ 安装、Switch 启停、详情弹窗、语言选择）
- [x] 导航接入 i18n（侧栏 / 面包屑 / 页头按钮）
- [x] 验证：typecheck + lint + 浏览器核对

## 结果

- **内核包** `packages/extensions`：不依赖 React 运行时（`./react` 为独立入口），无浏览器 API。
  启用即激活、禁用即回滚：`ctx.effect` / fiber dispose 承担全部卸载。
- **形态无关**：`PlatformHost`（form / capabilities / storage / log）由各形态提供；
  Web 形态 `capabilities.filesystem = false`，三个 agent 适配器如实显示"需要桌面端或本地运行时"。
- **代码**：`apps/web/src/lib/hub.ts`（Web 宿主 + 启动）、`pages/extensions.tsx`、
  `components/extension-detail-dialog.tsx`、导航与侧栏/页头 i18n 接线。
- **设计稿与代码一致**：目录页 = 页面标题 + 语言选择 + 搜索 + 两张分区分组卡；
  详情弹窗 = About / Contributes（能力 chip + 写入路径 + 格式 + 运行时提示）/ Permissions。
