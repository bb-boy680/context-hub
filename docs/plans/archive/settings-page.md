# 设置页实现计划

## 背景与现状

`/settings` 现在落到 `PlaceholderPage`：

- `apps/web/src/App.tsx:13` 的 `designedPaths` 只有 `"/"`、`"/extensions"`、`"/repository"`，`/settings` 被第 38-42 行过滤进占位页。
- `apps/web/src/lib/navigation.ts:43` 已经有 `nav.settings` 导航项，侧边栏不用改。
- 设计稿 `designs/settings.pen` 已由用户确认，本次只读，不修改。画板 `Settings`（`fMujR`）宽 1192，竖向 gap 48，padding 64。

设计稿的实际结构与用户给出的摘要一致，本计划以从 `.pen` 读出的几何和文案为准：

- 页头：`CONTEXT HUB`（12/600/蓝）、标题 44px、副标题 16px。
- 每个分组：组标题 20/600 + 组说明 14/body，组内 gap 16；卡片圆角 24、padding 32、1px 发丝线；行内竖向 padding 20。
- 主题/布局缩略图 168×96、圆角 12、选中 2px 蓝边 + 右上角 20px 蓝色圆形勾（勾心 11px，位置 x=146、y=-6）。
- 语言分段控件：底色 `#eef0f3`、圆角 100、padding 4、gap 4；每段 padding 8×16，选中段白底、字重 600。
- 安装卡片：横排三张，高 176、padding 20、圆角 16、gap 10；选中卡片 `#f2f6ff` 底 + 2px 蓝边；radio 20px；推荐 badge 12/600。
- 图片卡片：下载行上下 padding 20、底部分隔线；统计行上下 padding 18；开关 44×24；次按钮 pill、`#eef0f3` 底、padding 10×18、14/600。
- 关于卡片：三行 justify-between，前两行底部分隔线；版本号和 Hub home 用等宽字体；复制按钮 32px 圆形、`#eef0f3` 底。

现有代码事实：

- 主题：`apps/web/src/components/theme-provider.tsx`，localStorage 键 `"theme"`，值 `dark` / `light` / `system`；`apps/web/src/components/theme-toggle.tsx:20` 顶栏只切 dark/light。
- 语言：`packages/extensions/src/i18n.ts`，state 文档 `"locale"`；语言包通过扩展注册，`packages/i18n/zh-cn/src/index.ts:26` 的 `defaultEnabled` 是 `false`。
- 布局：四个资源页各自 `React.useState<"grid" | "list">("grid")`：`packages/resources/skills/src/page.tsx:960`、`packages/resources/plugins/src/page.tsx:773`、`packages/resources/mcp/src/page.tsx:428`、`packages/resources/prompts/src/page.tsx:378`。
- 安装方式：`packages/resources/skills/src/host/place-skills.ts` 的 `installSkillInto` / `linkSkillIntoLibrary` 目前固定 link 优先、`LINK_UNSUPPORTED` 时回退 copy；`SkillStore.installInto/adoptFrom` 没有 mode 参数。
- 远程图：`packages/core/src/assets.ts` 的 `readSource` 对 http(s) 只记 link，`assetRef` 对 link 原样返回；图片上限 5MB、视频 25MB；skills 的 assets 在 `<home>/skills/skills.json`，plugins 的在 plugin 记录（`packages/resources/plugins/src/records.ts`）。
- 关于：版本号 `apps/web/package.json` 与根 `package.json` 都是 `0.0.1`；hub home 由 `packages/core/src/host/home.ts` 的 `resolveHubHome` 决定；`displayPath` 已经把用户 home 下的路径显示成 `~`；`apps/web/src/lib/hub.ts:155` 的 `host.form` 是 `"Web"`；hub home 目前没有只读桥。
- 设置存储：`packages/core/src/state.ts` + `packages/core/src/host/state-fs.ts`，文档名必须匹配 `^[a-z][a-z0-9-]*$`；`apps/web/src/lib/hub.ts` 的 `openState()` 启动时读取全部 state 文档，`PlatformHost.storage` 同步读写。
- 构建/检查：根 `package.json` 有 `pnpm typecheck`、`pnpm lint`、`pnpm test`；`apps/web/package.json` 有 `typecheck` / `lint` / `test`。测试在各自 `__test__/**/*.test.ts`。

## 目标

1. `/settings` 按 `designs/settings.pen` 1:1 实现四个分组（浅色下逐项对齐；深色下用现有 token 映射）。
2. 主题、界面语言、默认布局、安装方式、远程图下载、关于信息都接真实数据源，没有死控件。
3. 默认布局真正影响四个资源页打开时的初始视图，但页内切换不回写设置（设计稿原文："页内切换不会改这里"）。
4. 安装方式真正影响技能安装/收录的落盘方式；图片下载真正能把远程 http(s) 图片落到本地 assets。
5. 不新增生产依赖；不修改 `.pen`；不顺手重构四个资源页。

按改动性质分类：

- **新增能力**：`SettingsService` 与 `settings` state 文档；`GET /hub/about`；远程图片的统计/本地化/自动下载；技能安装的三种 mode；`useSettings` 钩子。
- **接线**：`/settings` 路由；中英文案；主题/语言/布局控件；四个资源页的 view 初值；技能详情和插件详情的 assets 添加调用；设置页的统计/下载按钮。
- **只读展示**：关于区三行；图片统计数字；主题/布局缩略图（纯形状，只表达视觉）。

## 需要用户审批的决策

### D1 视觉落地（推荐 B）

- A：设置页单独浅色作用域，深色模式下也强制白底。
- B（推荐）：把设计稿的构图、字号、间距映射到现有语义 token；浅色模式下与设计稿一致，深色模式下跟随 `.dark`。
- C：整站迁移浅色。

依据：`packages/shadcn-ui/src/styles/theme.css` 的 `:root` 已经是设计稿的同一套 Coinbase 浅色值（`#ffffff`、`#0a0b0d`、`#5b616e`、`#7c828a`、`#dee1e6`），`.dark` 有对应的深色值。A 会在深色应用里切出一块白岛，还要在页面内重复维护一套变量；C 超出本次范围。B 只需要把设计稿的色值映射到 token：

| 设计稿 | token / 类 |
|---|---|
| `$canvas` 页面底 | `bg-background` |
| `$canvas` 卡片底 | `bg-card` |
| `$ink` | `text-foreground` |
| `$body` | `text-copy` |
| `$muted` | `text-muted-foreground` |
| `$hairline` | `border-border` |
| `$surface-strong` | `bg-secondary` |
| `$surface-soft` | `bg-muted` |
| `$primary`（蓝） | `ring` / `bg-ring` / `text-ring`（`--ring: #0052ff` 在明暗两套主题里都是蓝色） |
| `$on-primary`（白） | `text-white` |
| 自动卡片 `#f2f6ff` | `bg-notice-bg`（`#0052ff14`，叠在卡片底上） |
| badge `#e6edff` | `bg-ring/10` |

注意：`--primary` 在浅色主题里是近黑色，不是蓝色，所以设计稿的蓝色选中态不能用 `primary`，必须用 `ring`。缩略图内部的颜色是**画中画**，表示明暗两种主题，使用字面色值，不随当前主题变。

**待确认：设置页在深色模式下跟随应用变深，还是必须始终白底？**

### D2 中文字体（推荐不新增依赖）

设计稿的中文用 `Noto Sans SC`。仓库目前只安装了 `@fontsource-variable/inter` 和 `@fontsource-variable/jetbrains-mono`（`pnpm-lock.yaml` 可查），现有中文页面都回退到系统 CJK 字体。

- 推荐：设置页用现有 `--font-sans`（Inter + 系统 CJK 回退）+ `--font-mono`（JetBrains Mono）。不新增字体依赖。
- 若要逐字对齐设计稿的 Noto Sans SC：新增 `@fontsource-variable/noto-sans-sc` 并扩展 `--font-sans`。这是新依赖，且 CJK 字体包体大，本次不建议。

**待确认：接受系统 CJK 回退，还是必须引入 Noto Sans SC？**

### D3 设置存储（推荐拆分）

- 主题继续留在 localStorage 的 `"theme"`。理由：`ThemeProvider` 在 kernel/state 加载之前就要应用主题，搬到 state 会造成首屏闪烁，且无 host 时主题应仍可用。
- 语言继续由 `I18nService` 的 `"locale"` 文档管理。理由：它已有安装/卸载语言包的生命周期，设置页只做选择。
- 新增 state 文档 `"settings"`：`{ layout: "grid" | "list"; installMode: "auto" | "link" | "copy"; downloadRemoteImages: boolean }`。
- 不迁移旧数据：主题和语言的存储位置不变；新文档缺省值就是当前行为（`grid`、`auto`、`downloadRemoteImages: true`，最后一项按设计稿开态）。
- `/extensions` 页右上角现有的语言选择器保留不动。它与设置页读同一个 `I18nService` 状态，两处永远一致；设置页是完整入口，扩展页入口继续服务"装完语言包顺手切换"的场景。不在本次新增第二套语言状态。

### D4 安装方式如何到 host（推荐客户端随动作传）

给 `installInto` / `adoptFrom` 加可选 `mode`，由客户端在动作 body 里传当前设置。

不采用 host 直接读 `state/settings.json`：浏览器写 state 是 fire-and-forget，点击紧跟设置变更时会读到旧值；而且会让 host 成为同一份设置的第二个读者。

### D5 远程图下载（推荐新增模块级动作 + 自动下载开关）

- 开关语义：开 = 新增远程图片时立即下载；关 = 只记远程地址。设计稿的"下载全部"按钮始终可手动执行。
- host 动作放在各自模块（skills / plugins）里，不新增一个同时认识两个库的中央 handler：
  - `GET /hub/skills?action=asset-stats`、`GET /hub/plugins?action=asset-stats`
  - `POST /hub/skills {action:"localize-assets"}`、`POST /hub/plugins {action:"localize-assets"}`
- 统计与下载只覆盖两个库的 `assets`，不覆盖 plugins 的 `icon`（icon 是包自己的标识，不是"展示图"）。
- 统计只算图片（`assetKind(ref) === "image"`）。"已本地化"没有来源记录，口径是"本地图片引用数"；上传的本地图也会被算进去。这是设计稿文案与现有数据模型之间的近似，不新增 provenance 字段。
- 安全边界：从现有 `packages/core/handlers.ts` 抽出 `isPublicHost`，图片下载复用同一套 private/loopback 拒绝规则；允许 http(s)、手动跟随最多 3 次重定向且每跳重新校验、10s 超时、5MB 上限、只接受 `image/*`。不引入新的外部服务。

### D6 关于区数据源（推荐新增只读桥）

新增 `GET /hub/about` 返回 `{ version, home }`：

- `version` 来自 `apps/web/package.json`（`server.ts` 启动时读自己的 manifest）。
- `home` 来自 `resolveHubHome(...)` + `displayPath(...)`，直接得到 `~/.context-hub` 这种可复制的形式。
- 宿主形态不需要桥：页面读 `ctx.host.form`；`"Web"` 显示 `Web · Browser`，其他形态显示表单名。

不硬编码版本，不从 `SkillStore.root` 推导 home（那只给出 `<home>/skills`，且在没有技能库时不可用）。

### D7 默认行为变化（需要确认）

`downloadRemoteImages` 默认 `true`（设计稿开关是开态），意味着新增远程图片会立即下载。这是对现有"只记 link"行为的改变。若希望默认关，改成 `false`，设计稿截图时手动打开即可。

## 设计稿文案（中文必须逐字使用）

| key | 中文 |
|---|---|
| `settings.eyebrow` | `CONTEXT HUB` |
| `settings.title` | `设置` |
| `settings.subtitle` | `这台机器上 Context Hub 的行为。改动即时生效，不需要保存。` |
| `settings.appearance.title` | `外观与布局` |
| `settings.appearance.description` | `主题、界面语言，以及资产页打开时的默认视图。` |
| `settings.theme.title` | `主题` |
| `settings.theme.description` | `跟随系统会随操作系统在深色与浅色之间切换。` |
| `settings.theme.system` | `跟随系统` |
| `settings.theme.light` | `浅色` |
| `settings.theme.dark` | `深色` |
| `settings.language.title` | `界面语言` |
| `settings.language.description` | `语言包在扩展页安装；这里只选择使用哪一个。` |
| `settings.layout.title` | `默认布局` |
| `settings.layout.description` | `资产页打开时使用卡片还是列表；页内切换不会改这里。` |
| `settings.layout.grid` | `卡片` |
| `settings.layout.list` | `列表` |
| `settings.install.title` | `安装方式` |
| `settings.install.description` | `把库里的技能放进 Agent 目录时，文件以哪种方式落地。` |
| `settings.install.auto` | `自动` |
| `settings.install.auto.description` | `优先建立链接；文件系统不支持链接时自动复制。` |
| `settings.install.recommended` | `推荐` |
| `settings.install.link` | `链接` |
| `settings.install.link.description` | `库和 Agent 共享同一份文件，库里的修改立即生效。` |
| `settings.install.copy` | `复制` |
| `settings.install.copy.description` | `Agent 目录保存独立副本，库里的修改不会同步过去。` |
| `settings.install.footnote` | `只影响技能。插件由 Agent 自己的 CLI 安装，提示词按文件交付。` |
| `settings.images.title` | `图片` |
| `settings.images.description` | `展示图可以保留远程地址，也可以下载到这台机器。` |
| `settings.images.download.title` | `下载远程展示图` |
| `settings.images.download.description` | `把 http(s) 图片保存到本地 assets，离线也能显示。` |
| `settings.images.stats` | `远程引用 {remote} 张 · 已本地化 {localized} 张` |
| `settings.images.downloadAll` | `下载全部（{count} 张）` |
| `settings.images.downloading` | `正在下载…` |
| `settings.images.done` | `已下载 {downloaded} 张，{failed} 张失败。` |
| `settings.images.failed` | `下载失败：{reason}` |
| `settings.about.title` | `关于` |
| `settings.about.description` | `版本与这台机器上的位置，只读。` |
| `settings.about.version` | `版本号` |
| `settings.about.home` | `Hub home` |
| `settings.about.host` | `宿主` |
| `settings.about.hostWeb` | `Web · Browser` |
| `settings.copy` | `复制` |
| `settings.copied` | `已复制` |

英文表同步加同名 key；英文文案按设计稿语义翻译，不保留中文。`{remote}` / `{localized}` / `{count}` / `{downloaded}` / `{failed}` 由页面用 `.replace()` 替换（仓库现有做法，`t()` 不做插值）。

## 阶段

执行前提：实施前按 `AGENTS.md` 的 AOCI 流程确认当前仓库认知（需要时 `aoci_rules` → `aoci_overview`）；本计划不替代 AOCI 的会话合同。收尾时只调用一次 `aoci_maintain`，见阶段 8。

### 阶段 1：建立设置存储与服务

**目标**：新增一个内核级 `SettingsService`，统一读写 `settings` state 文档，并向 UI 暴露订阅。

**改动文件**

- 新增 `packages/extensions/src/settings.ts`：
  - `export const SETTINGS_DOCUMENT = "settings"`。
  - `export type LayoutMode = "grid" | "list"`。
  - `export type InstallMode = "auto" | "link" | "copy"`。
  - `export interface HubSettings { layout: LayoutMode; installMode: InstallMode; downloadRemoteImages: boolean }`。
  - `export const DEFAULT_SETTINGS: HubSettings = { layout: "grid", installMode: "auto", downloadRemoteImages: true }`。
  - `export function readSettings(value: unknown): HubSettings`：逐字段校验，非法/缺失回退默认值；非对象回退整份默认值；不抛错。
  - `SettingsService extends Service`，`static inject = ["host"]`：
    - 构造时 `host.storage.read(SETTINGS_DOCUMENT)` → `readSettings`。
    - `get state(): HubSettings` 返回不可变对象。
    - `set(patch: Partial<HubSettings>): void`：`readSettings({ ...current, ...patch })`，和当前相等则直接返回；否则写回整个文档并 `ctx.emit("settings/change", next)`。
  - `declare module "@deepseek-ai/cordis"` 补 `Context.settings` 与 `Events["settings/change"]`；文件必须像 `i18n.ts` 一样从 `./cordis.ts` 导入，避免 `Context` 身份分裂（`docs/memory.md` 已有这条）。
- 修改 `packages/extensions/src/kernel.ts`：在现有 `const i18n = ctx.plugin(I18nService); await i18n.await()` 之后，加 `const settings = ctx.plugin(SettingsService); await settings.await()`。不改变 `ExtensionService` 与 `I18nService` 的现有构造顺序（最小改动）。
- 修改 `packages/extensions/src/index.ts`：`export * from "./settings.ts"`。
- 修改 `packages/extensions/src/react.tsx`：
  - `export interface SettingsControl extends HubSettings { set(patch: Partial<HubSettings>): void }`。
  - `export function useSettings(): SettingsControl`，用 `useSyncExternalStore((onChange) => ctx.on("settings/change", onChange), () => ctx.settings.state)`，`useMemo` 里补 `set`。
- 新增 `packages/extensions/__test__/settings.test.ts`：
  - `readSettings` 的默认值、部分文档、非法字段。
  - 用 `i18n.test.ts` 同款 fake host（Map storage）：`createHubKernel` 后 `ctx.settings.state` 是默认值；`set({ layout: "list" })` 写入 `["settings", {...}]` 并发出一次事件；同值再 set 不写入、不发事件。
  - 重新构造 kernel（同一 storage）读回已存的设置。

**验收**

```bash
pnpm --filter @context-hub/extensions test
pnpm --filter @context-hub/extensions typecheck
```

测试通过；`ctx.settings` 在 kernel 启动前就可用；无新增依赖。

### 阶段 2：设置页骨架与视觉

**目标**：`/settings` 不再落到占位页；四个分组按设计稿的几何渲染；主题、语言、安装方式、下载开关的控件先接上本地状态/设置服务，图片批量下载与关于数据在后续阶段再接。

**改动文件**

- 新增 `apps/web/src/pages/settings.tsx`。页面内包含：
  - 页头：`flex flex-col gap-3`；eyebrow `CONTEXT HUB`（`text-[12px] font-semibold text-ring`）、标题 `text-[44px] leading-none tracking-[-1px] font-normal`、副标题 `text-[16px] text-copy`。
  - 页面容器：`-mx-6 bg-background` 用来抵消 `AppLayout` 外层 `p-6` 的左右 24px，然后在里面放 `mx-auto flex w-full max-w-[1192px] flex-col gap-12 px-16 py-10 font-sans`。这样在 1440 宽、248 侧边栏下，页面外框正好是设计稿的 1192px，内层内容宽 1064px（1192 - 2×64）。顶部/底部：外层 `p-6` 的 24px 加上这里的 `py-10` 40px，正好 64px。
    - 因为 `globals.css:71` 把 `html` 的默认字体设成了 `--font-mono`，页面根必须显式 `font-sans`；版本号、Hub home 再用 `font-mono`。
    - 如果用户不接受负边距抵 padding，退路是去掉 `-mx-6`、把 `px-16` 改成 `px-10`：内层内容仍是 1064px，但外框是 1144px 而不是 1192px。实现后必须用 CDP 量一次实际宽度，以设计稿内层 1064px 为准。
  - 分组组件：`flex flex-col gap-4`；组头 `flex flex-col gap-1`（标题 `text-[20px] font-semibold`、说明 `text-[14px] text-copy`）。
  - 卡片：`rounded-xl border border-border bg-card p-8`；行：`py-5`，相邻行 `border-t border-border`（或 `divide-y divide-border`）；行内文本块 `flex flex-col gap-1`。
  - 外观卡片：主题行、语言行、默认布局行。主题/布局行是 `flex flex-col gap-4`（文本块 + 缩略图选项）；语言行是 `flex flex-wrap items-center justify-between gap-8`。
  - 安装卡片：三张 radio 卡片，`grid grid-cols-1 gap-4 px-1 md:grid-cols-3`；卡片 `min-h-[176px] rounded-[16px] p-5 ring-1 ring-border`，选中 `bg-notice-bg ring-2 ring-ring`，内部 `flex flex-col gap-2.5`；顶部行 `flex items-center justify-between gap-3`；名称 16/600，描述 13/body；radio 20px（选中蓝底 + 8px 白点，未选中 1.5px 发丝线）；badge `rounded-pill bg-ring/10 px-2.5 py-1 text-[12px] font-semibold text-ring`；脚注 13 muted。
  - 图片卡片：下载行 `flex flex-wrap items-center justify-between gap-8 border-b border-border py-5`；统计行 `flex flex-wrap items-center justify-between gap-6 py-[18px]`；开关用 `Switch`（见下）；次按钮 `Button variant="secondary"` + `h-10 rounded-pill px-[18px] text-[14px] font-semibold`。
  - 关于卡片：三行 `flex items-center justify-between gap-8 py-5`，前两行底部 `border-b border-border`；值 14px，版本/home 用 `font-mono`，宿主用 `font-sans`；复制按钮 32px 圆形 `bg-secondary`，`CopyIcon` 15px / `CheckIcon` 15px。
  - 预览组件（同文件内）：`ThemeOption` / `LayoutOption` / `ThemePreview` / `LayoutPreview`。缩略图 168×96、`rounded-md`（12px；注意本仓 `--radius-xl` 是 24px，不要用它）、`overflow-hidden`；选中 `ring-2 ring-ring ring-inset`，未选中 `ring-1 ring-[#dee1e6]`；勾 `absolute -top-1.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-ring text-white`，`CheckIcon` 11px。勾在 preview 外层的 option 容器上，避免被 `overflow-hidden` 裁掉。
  - 主题预览形状按 `.pen` 的坐标：
    - 系统：左右各 84×96；左白右 `#0A0B0D`；两侧点 6px 蓝（12,12 / 96,12）；线 44×3 y=26、34×3 y=33（左 `#DEE1E6` / 右 `#3A3F47`）；面板 60×28（12,52 / 96,52，`#EEF0F3` / `#1F2530`，圆角 6）。
    - 浅色：白底；点 6px 蓝（10,10）；线 30×3 y=24、22×3 y=31、26×3 y=38（`#DEE1E6`）；柱 10×22（52,38）`#A8B8CC`、10×32（66,28）蓝、10×16（80,44）`#A8B8CC`；圆环 26px（100,22）`#A8B8CC`，用 `border-[7px]` 做 0.46 的内孔；面板 104×26（52,58）`#EEF0F3`。
    - 深色：同几何，线 `#3A3F47`、柱 `#26303E`、圆环 `#26303E`、面板 `#1F2530`。
    - 卡片布局：`#F7F7F7` 底；4 张 68×32 圆角 6，位置 (12,12)、(88,12)、(12,52)、(88,52)，`#DEE1E6`。
    - 列表布局：`#F7F7F7` 底；4 条 144×14 圆角 4，位置 y=12/32/52/72，`#DEE1E6`。
  - 主题/布局选项的标签：13px；选中 `font-semibold text-foreground`，未选中 `text-copy`；选项容器 `flex w-[168px] flex-col gap-2 text-left`，`role="radio"` + `aria-checked`，外层 `role="radiogroup"`。
  - 语言分段：外层 `inline-flex h-11 items-center gap-1 rounded-pill bg-secondary p-1`；每段 `h-9 rounded-pill px-4 text-[14px]`；选中 `bg-background font-semibold text-foreground dark:bg-foreground dark:text-background`，未选中 `text-copy`；`aria-pressed`。只渲染 `useI18n().state.locales` 里真实存在的语言；只有一个时仍渲染一个选中段。
  - 安装方式三张卡片用 `role="radiogroup"` + `role="radio"` + `aria-checked`；整卡可点，不做嵌套 button。
  - 开关：`<Switch checked={settings.downloadRemoteImages} onCheckedChange={(on) => settings.set({ downloadRemoteImages: on })} className="..." />`。默认 shadcn Switch 是 32×18.4，设计稿是 44×24、knob 18、轨道内边距 3。用 `className="h-6 w-11 p-[3px] data-checked:bg-ring data-unchecked:bg-secondary [&_[data-slot=switch-thumb]]:size-[18px] [&_[data-slot=switch-thumb]]:bg-white data-checked:[&_[data-slot=switch-thumb]]:translate-x-[20px]!"`；如果内置的 `translate-x-[calc(100%-2px)]` 仍然抢，保留 `!` 或改成页面内的 `role="switch"` 按钮。实现后必须在浏览器里看 knob 是否真的到右端。
- 修改 `apps/web/src/App.tsx`：`designedPaths` 加 `"/settings"`；import `SettingsPage`；在 `/repository` 后加 `<Route path="/settings" element={<SettingsPage />} />`。
- 修改 `packages/extensions/src/builtin/locale-en.ts` 与 `packages/i18n/zh-cn/src/messages.ts`：加"设计稿文案"表的全部 key。中文逐字照抄；英文按语义翻译。
- 阶段 2 中先接：
  - 主题：`const { theme, setTheme } = useTheme()`，三个选项对应 `"system" | "light" | "dark"`。
  - 语言：`const { state, setLocale } = useI18n()`。
  - 默认布局、安装方式、下载开关：`useSettings()` 读、`settings.set(...)` 写。
  - 图片统计先显示 `0 / 0`，按钮 `disabled`；关于版本/home 先显示 `—`，宿主读 `useHub().host.form`。这些在阶段 5/6 接真实数据。

**验收**

```bash
pnpm --filter web typecheck
pnpm --filter web lint
```

浏览器（ego-browser，隔离 `CONTEXT_HUB_HOME`，见阶段 7 的起法）：

- `/settings` 渲染四个分组，文案与设计稿一致（中文包启用时）。
- CDP 量：页面内层内容宽 1064±1；缩略图 168×96；卡片圆角 24px；标题 computed `font-size: 44px`；安装卡片高 176。
- 三个主题选项点击后 `document.documentElement.classList` 与 localStorage `theme` 正确变化。
- 语言在有中英文包时能切换；安装方式/布局/开关点击后 `<temp-home>/state/settings.json` 的值变化。
- 控制台无 React/类型运行时错误。

### 阶段 3：默认布局接入四个资源页

**目标**：四个资源页打开时读取 `settings.layout` 作为初始视图；页内切换仍然只改本地状态。

**改动文件**

- `packages/resources/skills/src/page.tsx`：`import { useSettings } from "@context-hub/extensions/react"`；在 `SkillsPage` 顶部 `const settings = useSettings()`；`const [view, setView] = React.useState<"grid" | "list">(settings.layout)`。
- `packages/resources/plugins/src/page.tsx`：同样改第 773 行。
- `packages/resources/mcp/src/page.tsx`：`const settings = useSettings()`；`const [view, setView] = React.useState<ViewId>(settings.layout)`。
- `packages/resources/prompts/src/page.tsx`：同样改第 378 行。
- 不修改各页 `setView` 的点击逻辑；不把页内切换写回设置。

**验收**

- 先在设置页选"列表"，再依次打开 `/skills`、`/plugins`、`/mcp`、`/prompts`，每个页面的列表视图按钮是 `aria-pressed="true"`（或等价的选中态），页面渲染列表视图。只要 host 在，四个页面都会渲染工具栏；如果某个页面在空库时把工具栏藏起来，先 seed 一行再断言，不要用"空页面"当通过证据。
- 在 `/skills` 页内切回卡片，返回设置页仍是"列表"；重新进 `/skills` 仍是列表（设置没被页内切换改写）。
- `pnpm --filter @context-hub/skills typecheck`、`pnpm --filter @context-hub/plugins typecheck`、`pnpm --filter @context-hub/mcp typecheck`、`pnpm --filter @context-hub/prompts typecheck`。

### 阶段 4：安装方式

**目标**：`auto` / `link` / `copy` 真正决定技能安装与收录的落盘方式；设置页的三张卡片读写真实设置。

**改动文件**

- `packages/resources/skills/src/host/place-skills.ts`：
  - `installSkillInto(base, libraryRoot, id, dir, mode: InstallMode = "auto")`。
  - `linkSkillIntoLibrary(base, libraryRoot, id, dir, mode: InstallMode = "auto")`。
  - 抽一个内部 helper 处理 link/copy，避免两份重复：
    - `copy`：直接 `fs.cp`，不尝试 link。
    - `link`：只 `fs.symlink`；失败时抛可展示错误（例如 `this filesystem cannot hold a link; choose copy or automatic`），不回退。
    - `auto`：保持现状，link 失败且 code 在 `LINK_UNSUPPORTED` 时回退 copy；其他错误照旧抛。
    - `installSkillInto` 的 copy 用 `recursive: true`；`linkSkillIntoLibrary` 的 copy 保持 `dereference: true`（现状）。
  - 删除/保留 `LINK_UNSUPPORTED` 的判断只在 auto 分支使用。
- `packages/resources/skills/src/store.ts`：
  - `installInto(name, ref, mode?: InstallMode)`、`adoptFrom(name, ref, mode?: InstallMode)`。
  - 类型从 `@context-hub/extensions` 导入 `InstallMode`（skills 已依赖 extensions）。
- `packages/resources/skills/src/remote-store.ts`：两个方法把 `mode` 放进 POST body。
- `packages/resources/skills/handlers.ts`：
  - `install-place` / `adopt-place` 读 `body.mode`；用 `installModeOf(value)` 校验：`undefined` → `"auto"`；三个合法值原样；其他 → 抛错（400）。
  - 把 mode 传给 `api.installInto` / `api.adoptFrom`。
- `packages/resources/skills/src/host/skills-fs.ts`：`installInto` / `adoptFrom` 接收 mode 并透传给 place-skills。
- `packages/resources/skills/src/library.ts`：
  - `import { useSettings } from "@context-hub/extensions/react"`。
  - `const { installMode } = useSettings()`。
  - `install` / `adopt` 回调调用 `store.installInto(id, ref, installMode)` / `store.adoptFrom(id, ref, installMode)`，依赖数组加 `installMode`。
- `apps/web/src/pages/settings.tsx`：安装方式卡片已经读写 `settings.installMode`，无需额外接线。
- 测试：
  - `packages/resources/skills/__test__/place-skills.test.ts`：
    - 新增一个库内 skill，`installSkillInto(..., "copy")` 返回 `"copy"`，`lstat` 不是 symlink，文件内容可读。
    - `installSkillInto(..., "link")` 返回 `"link"`（环境支持 symlink 时；现有测试已证明本机支持）。
    - `linkSkillIntoLibrary(..., "copy")` 在库里得到真实目录。
    - 用 `vi.spyOn(fs, "symlink").mockRejectedValueOnce(Object.assign(new Error("no"), { code: "EPERM" }))`：`"link"` 抛错；`"auto"` 返回 `"copy"`。如果 ESM namespace 无法 spy，删掉这条 spy 用例，保留 copy/link 成功路径，并在报告中说明失败分支只由代码审阅覆盖。
  - `packages/resources/skills/__test__/bridge.test.ts`：给 call table 加一条 `installInto(id, REF, "copy")`，断言返回 `mode: "copy"`；再加一条 `adoptFrom("adopted-copy", REF, "copy")`（需要先写一个 place 目录）。
  - `packages/resources/skills/__test__/store.test.ts`：如已有 `installInto` 调用，补一个 mode 透传用例。

**验收**

```bash
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/skills typecheck
```

浏览器：设置页选"复制"→ `<temp-home>/state/settings.json` 的 `installMode` 为 `"copy"`；选"链接" → `"link"`；选"自动" → `"auto"`。真实落盘方式以 host 测试为准（见上）；如需 UI 端到端，用隔离 workspace 并只操作 `.agents/skills`，跑完删除。

### 阶段 5：图片下载

**目标**：统计、开关、批量下载和新增图片时的自动下载都工作；失败不丢原 link，成功把 ref 换成本地 assets 路径。

**改动文件**

- 修改 `packages/core/src/assets.ts`：
  - `export interface AssetImageStats { remote: number; localized: number }`。
  - `export interface AssetLocalizeSummary { downloaded: number; failed: { ref: string; reason: string }[] }`。
  - 可加 `export function imageRefsOf(refs: readonly string[]): { remote: string[]; localized: string[] }`，只统计 `assetKind(ref) === "image"` 的引用；skills/plugins 共用，避免两套口径。
- 新增 `packages/core/src/host/remote-image.ts`：
  - 从 `packages/core/handlers.ts` 把 `isPublicHost` 移到此处并导出 `isPublicHostname`；`handlers.ts` 改为 import（行为保持不变，net proxy 的测试必须继续通过）。
  - `export async function downloadRemoteImage(url: string): Promise<File>`：
    - 只接受 http/https。
    - 每跳校验 host 不是 loopback/private/link-local（复用 `isPublicHostname`）。
    - `fetch(..., { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { Accept: "image/*" } })`；3xx 最多跟 3 跳，`Location` 相对当前 URL 解析并重新校验；超过则抛错。
    - `Content-Length` 超过 `assetLimit("image")` 直接拒绝；body 按块读取并在超过 5MB 时中止。
    - `content-type` 存在时必须 `image/`；不存在时要求 URL 路径带已知图片扩展名（png/jpg/jpeg/webp/gif/avif/svg）。
    - 文件名取 URL 最后一段（decode + 去 query/hash）；没有扩展名时用 `extensionFor(contentType)` 补；返回 `new File([bytes], name, { type })`。
  - `packages/core/package.json` exports 加 `"./host/remote-image": "./src/host/remote-image.ts"`。
- skills 侧：
  - `packages/resources/skills/src/store.ts`：`SkillStore` 加 `assetStats(): Promise<AssetImageStats>` 和 `localizeAssets(): Promise<AssetLocalizeSummary>`；`addAssetSource(name, source, download?: boolean)`。
  - `packages/resources/skills/src/host/skills-fs.ts`：
    - `addAssetSource(name, source, download = false)`：link 且 download 为 true 时，先 `downloadRemoteImage`，成功则 `assets.put(owned(name, file))` 并 record；失败则 `console.warn` 后照旧记录 link（不打断添加）。
    - `assetStats()`：`loadCatalog()` 后统计所有 row 的 `assets`。
    - `localizeAssets()`：遍历所有 row，收集 `isLink(ref) && assetKind(ref) === "image"` 的引用；逐张下载、`assets.put(owned(name, file))`；失败收集 `{ref, reason}`，保留原 link；全部结束后**一次** `mutate` 替换 refs（`assets.map`）并按 `recordAsset` 的现有语义更新 `updatedAt`；返回 summary。
  - `packages/resources/skills/src/remote-store.ts`：实现 `assetStats` / `localizeAssets`，`addAssetSource` 带 `download`。
  - `packages/resources/skills/handlers.ts`：GET 加 `asset-stats`；POST 加 `localize-assets`；`add-asset-source` 传 `body.download === true`。
- plugins 侧：
  - `packages/resources/plugins/src/host/library.ts`：host 侧的 `PluginLibrary` 接口与实现加 `assetStats()` / `localizeAssets()`；`addAssets(name, sources, download = false)`。
  - `packages/resources/plugins/handlers.ts`：GET 加 `asset-stats`；POST 加 `localize-assets`；`asset-add` 传 `body.download === true`。
  - `packages/resources/plugins/src/library.ts`：这是页面侧的 `usePluginLibrary`，不是 host 库。在 hook 里 `const { downloadRemoteImages } = useSettings()`，把返回对象里的 `addAssets: (name, sources) => write<void>({ action: "asset-add", name, sources, download: downloadRemoteImages })`。页面接口 `PluginLibrary.addAssets(name, sources)` 的签名不变。
- skills UI：`packages/resources/skills/src/skill-detail-dialog.tsx` 中拥有 `addUrl` 的组件顶部调用 `useSettings()`，`addUrl` 里调用 `store.addAssetSource(detail.name, src, settings.downloadRemoteImages)`，依赖数组补上该布尔值。
- 设置页 `apps/web/src/pages/settings.tsx`：
  - 从 `@context-hub/skills` 导入 `SKILL_ROUTE`，从 `@context-hub/plugins` 导入 `PLUGIN_ROUTE`，从 `@context-hub/core` 导入 `AssetImageStats` / `AssetLocalizeSummary`。
  - `readStats()`：并行请求 `SKILL_ROUTE + "?action=asset-stats"` 与 `PLUGIN_ROUTE + "?action=asset-stats"`，相加；**任一请求失败时不要把失败当成 0**：把统计行显示成 `—`（与"库是空的"区分开），按钮禁用，并保留错误用于按钮点击时的 toast。
  - `downloadAll()`：并行 POST 两个 `localize-assets`；用 `Promise.allSettled` 汇总 `downloaded` 与 `failed`；无论成败都 `ctx.get("catalog.skills")?.reload()`、`ctx.get("catalog.plugins")?.reload()` 并重读统计。
  - 按钮：`disabled={busy || stats === null || stats.remote === 0}`；busy 时文案 `settings.images.downloading`；完成 toast `settings.images.done` 替换计数；整体失败 toast `settings.images.failed`。
  - 开关读写 `settings.downloadRemoteImages`。
- 测试：
  - 新增 `packages/core/__test__/remote-image.test.ts`：
    - `isPublicHostname` 正反例（localhost、127.0.0.1、10.x、172.16-31、192.168、169.254、::1、fe80:、fc00::、fd00::、无点主机 vs example.com、8.8.8.8）。
    - `vi.stubGlobal("fetch", ...)` 下：成功返回 `File`；非 image content-type 拒绝；Content-Length > 5MB 拒绝；重定向到私网拒绝；重定向到公网成功。测试结束 `vi.unstubAllGlobals()`。
  - `packages/resources/skills/__test__/store.test.ts`：
    - `addAssetSource(..., true)` 用 stub fetch 得到本地 ref；`(...)` 不传或 false 仍是 link。
    - `assetStats()` 统计 remote/local；`localizeAssets()` 成功替换 ref、失败保留 link 并返回 failed。
  - `packages/resources/plugins/__test__/library.test.ts`：同样的 `addAssets` / `assetStats` / `localizeAssets` 用例。
  - `packages/resources/skills/__test__/bridge.test.ts`：加 `asset-stats` call case（不触发网络）。
  - `packages/resources/plugins/__test__/bridge.test.ts`：加 `asset-stats` call case（不触发网络）；`localize-assets` 的下载路径由 library 测试覆盖，不在 bridge 测试里打真实网络。

**验收**

```bash
pnpm --filter @context-hub/core test
pnpm --filter @context-hub/skills test
pnpm --filter @context-hub/plugins test
pnpm --filter web typecheck
```

浏览器（隔离 home，预置一个远程图片引用）：

- 统计显示 `远程引用 1 张 · 已本地化 0 张`，按钮可点。
- 点击"下载全部"，用 `https://example.invalid/demo.png` 时显示失败 toast，统计保持 remote 1；成功后（单元测试 stub 覆盖）ref 变为 `assets/...`，统计变 remote 0 / localized 1。
- 开关关闭时，新加远程 URL 仍是 link；打开时自动下载（浏览器里用无效 URL 只能验证失败回退，成功路径以单元测试为准）。
- 页面刷新后设置仍保留。

### 阶段 6：关于

**目标**：版本、Hub home、宿主形态三行接真实数据；Hub home 可复制。

**改动文件**

- 新增 `packages/core/src/about.ts`：`export const ABOUT_ROUTE = "/hub/about"`；`export interface AboutInfo { version: string; home: string }`。
- `packages/core/package.json` exports 加 `"./about": "./src/about.ts"`。
- `packages/core/handlers.ts`：新增 `createAboutHandler(options: { version: string; home?: string }): HubMiddleware`：
  - 只有 `GET /hub/about` 由它回答；其他路径 `next()`。
  - 返回 `{ version: options.version, home: displayPath(resolveHubHome(options.home)) }`。
  - 其他方法 405。
- `apps/web/server.ts`：
  - `import { promises as fs } from "node:fs"`（若未导入）。
  - 启动时读自己的 manifest：`JSON.parse(await fs.readFile(new URL("./package.json", import.meta.url), "utf8"))`，取 `version`（缺失则 `"0.0.0"`）。
  - 把 `createAboutHandler({ version, ...placed })` 加进 `middlewares`（放在 `createStateHandler` 之后即可）。
- `apps/web/src/pages/settings.tsx`：
  - `useEffect` 里 `fetch(ABOUT_ROUTE)`；成功 `setAbout({version, home})`；失败保持 `null`，版本/home 显示 `—`。
  - 版本：`font-mono text-[14px]`；home：`font-mono text-[14px]` + 复制按钮；宿主：`ctx.host.form === "Web" ? t("settings.about.hostWeb") : ctx.host.form`。
  - 复制按钮用 `navigator.clipboard?.writeText(home)`，成功后 2-3 秒显示 `CheckIcon`，`aria-label` 在 `settings.copy` / `settings.copied` 之间切换（照 `code-view.tsx` 的 `CopyButton` 写法）。
- 测试：
  - `packages/core/__test__/bridge.test.ts`：middlewares 加 `createAboutHandler({ version: "9.9.9", home })`；断言 `GET /hub/about` 返回 `{version:"9.9.9", home: displayPath(home)}`；`GET /hub/aboutX` 不被它认领（落到 404）。

**验收**

```bash
pnpm --filter @context-hub/core test
pnpm --filter web typecheck
```

浏览器：关于区显示 `0.0.1`、隔离 home 的 `displayPath` 结果、`Web · Browser`；点击复制按钮后图标变为勾（或至少不报错；headless 里 clipboard 权限可能被拒，需在报告里说明）。

### 阶段 7：全量检查与浏览器验收

**目标**：所有检查通过，按设计稿逐项对照，清理隔离环境。

**命令**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

**浏览器验收（ego-browser skill）**

1. 确认 5270 / 5271 没被占用（`netstat -ano | grep -E ":(5270|5271)"`）。被占用时不要杀进程，停下来报告。
2. 建隔离目录并预置：

```bash
TMP_HOME=$(node -e 'const fs=require("node:fs"),os=require("node:os"),path=require("node:path");process.stdout.write(fs.mkdtempSync(path.join(os.tmpdir(),"hub-settings-")))')
TMP_HOME=$(cygpath -m "$TMP_HOME")
mkdir -p "$TMP_HOME/state" "$TMP_HOME/skills/demo"
printf '%s\n' '{"hub.locale.zh-CN": true}' > "$TMP_HOME/state/extensions.json"
printf '%s\n' '"zh-CN"' > "$TMP_HOME/state/locale.json"
printf '%s\n' '---' 'name: demo' 'description: 设置页验收' '---' '' '# demo' > "$TMP_HOME/skills/demo/SKILL.md"
CONTEXT_HUB_HOME="$TMP_HOME" pnpm dev
```

3. 起服务后（新进程才加载新代码；`docs/memory.md` 的 vite 插件教训），用 API 加一个远程图片引用（`download:false`，避免验收时依赖外网成功）：

```bash
curl -s -X POST http://127.0.0.1:5270/hub/skills -H 'Content-Type: application/json' \
  -d '{"action":"add-asset-source","name":"demo","source":"https://example.invalid/demo.png","download":false}'
```

4. 打开 `http://127.0.0.1:5271/settings`，逐项断言：
   - 中文文案与设计稿一致；四个分组齐全。
   - 页面内层宽 1064±1、缩略图 168×96、卡片圆角 24、标题 44px、安装卡片高 176（CDP `getBoundingClientRect` / `getComputedStyle`）。
   - 主题三态；刷新后保持。
   - 语言切换（中/英）后页面文案变化；`<TMP_HOME>/state/locale.json` 变化。
   - 默认布局选列表后，`/skills`、`/plugins`、`/mcp`、`/prompts` 均以列表打开；`/skills` 页内切回卡片后设置仍为列表。
   - 安装方式三项点击后 `<TMP_HOME>/state/settings.json` 变化。
   - 图片统计显示 remote 1 / localized 0；开关切换写入 `settings.json`；点"下载全部"出现失败 toast，统计不丢 remote。
   - 关于显示 `0.0.1`、`<TMP_HOME>` 的显示路径、`Web · Browser`；复制按钮可点。
5. 收尾：
   - 只停自己起的 dev 进程（杀 5270 会带走 Vite；不要按名字杀进程）。
   - `rm -rf "$TMP_HOME"`。
   - `git status --short` 确认没有留下源码外文件；如果测试安装过技能，确认 `apps/web/.agents` 下没有残留（该目录被 gitignore，但仍要删）。

### 阶段 8：收尾与 AOCI 维护

**目标**：仓库在最终状态可运行，认知索引与改动一致。

- 确认实现期间没有未计划的文件变化；`git status --short` 只包含本计划涉及的文件（以及用户自己的 `.claude/`、`designs/settings.pen` 等既有变化）。
- 按 AGENTS.md / AOCI 工具当前 Guide 执行一次 `aoci_maintain`；对新增/修改的受管文件（`packages/extensions/src/settings.ts`、`apps/web/src/pages/settings.tsx`、`packages/core/src/host/remote-image.ts`、`packages/core/src/about.ts`、skills/plugins 的 handlers 与 host 文件）按工具要求创作并提交语义条目。不要在实现中途反复维护。
- 只有本轮出现用户纠正时，才更新 `docs/memory.md`，记录具体问题模式与可执行规则；不要为没有发生的错误补条目。
- 计划文档不在实施过程中归档；用户明确确认计划完成后，才移动到 `docs/plans/archive/`。

## 受影响文件清单

新增：

- `packages/extensions/src/settings.ts`
- `packages/extensions/__test__/settings.test.ts`
- `apps/web/src/pages/settings.tsx`
- `packages/core/src/about.ts`
- `packages/core/src/host/remote-image.ts`
- `packages/core/__test__/remote-image.test.ts`

修改（源码）：

- `packages/extensions/src/kernel.ts`
- `packages/extensions/src/react.tsx`
- `packages/extensions/src/index.ts`
- `packages/extensions/src/builtin/locale-en.ts`
- `packages/i18n/zh-cn/src/messages.ts`
- `apps/web/src/App.tsx`
- `apps/web/server.ts`
- `packages/core/src/assets.ts`
- `packages/core/handlers.ts`
- `packages/core/package.json`
- `packages/resources/skills/src/page.tsx`
- `packages/resources/skills/src/library.ts`
- `packages/resources/skills/src/store.ts`
- `packages/resources/skills/src/remote-store.ts`
- `packages/resources/skills/src/host/skills-fs.ts`
- `packages/resources/skills/src/host/place-skills.ts`
- `packages/resources/skills/src/skill-detail-dialog.tsx`
- `packages/resources/skills/handlers.ts`
- `packages/resources/plugins/src/page.tsx`
- `packages/resources/plugins/src/library.ts`
- `packages/resources/plugins/handlers.ts`
- `packages/resources/plugins/src/host/library.ts`
- `packages/resources/mcp/src/page.tsx`
- `packages/resources/prompts/src/page.tsx`

修改（测试）：

- `packages/core/__test__/bridge.test.ts`
- `packages/resources/skills/__test__/place-skills.test.ts`
- `packages/resources/skills/__test__/store.test.ts`
- `packages/resources/skills/__test__/bridge.test.ts`
- `packages/resources/plugins/__test__/library.test.ts`
- `packages/resources/plugins/__test__/bridge.test.ts`

## 不做

- 不修改 `designs/settings.pen`，不导出/覆盖设计稿。
- 不把整站迁移成浅色；不做设置页的局部浅色作用域（除非 D1 改选 A）。
- 不引入 Noto Sans SC 或其他字体依赖（除非 D2 改选）。
- 不把主题迁进 state 文档，不改 `ThemeProvider` 的 localStorage 键，不改顶栏 `ThemeToggle` 的 dark/light 行为。
- 不改语言包的安装/卸载流程；设置页只选择已安装的语言。
- 不改插件安装、Prompt 交付、MCP 安装的任何行为；安装方式只作用于技能。
- 不下载视频；只处理 `assetKind(ref) === "image"` 的远程引用。
- 不为"已本地化"新增 provenance 字段；统计口径按本计划。
- 不加进度条、逐项进度 UI；只有按钮 busy 态 + toast 汇总。
- 不重构四个资源页的工具栏、页签、筛选或视图渲染；只改 view 初值和两个 assets 添加调用点。
- 不把页内视图切换写回设置。
- 不顺手修 `isPublicHost` 现有的 `fc`/`fd` 前缀误判；抽函数时保持行为一致，只在测试里记录。

## 风险与待验证

1. **深色模式视觉**：B 方案下设计稿只在浅色模式 1:1；深色模式是 token 映射，需要用户接受。见 D1。
2. **字体**：不引入 Noto Sans SC 时，中文由系统 CJK 字体渲染，字形与设计稿有差异。见 D2。
3. **44px 标题**：现有全局 `--text-display` 是 36px；本页用局部任意值 44px，不改全局 token。若希望统一，另开改动。
4. **Switch 尺寸覆盖**：44×24 的轨道需要覆盖 shadcn Switch 的默认尺寸/thumb 位移；实现后在浏览器里量 knob 位置，必要时用 `!` 或页面内自建 `role="switch"`。这是视觉实现风险，不影响数据。
5. **图片下载成功路径**：单元测试用 `vi.stubGlobal("fetch")` 覆盖；浏览器验收使用 `example.invalid` 只验证失败回退。若要在浏览器里看成功，需要先 `curl -I` 验证一个公网图片 URL 可用（`https://httpbin.org/image/png` 等候选地址属外部事实，**待验证**），并接受验收时访问外网。
6. **`isPublicHost` 抽离**：这是安全边界的移动，不是行为改变。必须跑 `packages/core/__test__/bridge.test.ts` 的 net proxy 用例，并新增 `isPublicHostname` 测试。
7. **版本号来源**：`apps/web/package.json` 是 0.0.1；若未来根包与 app 包版本分叉，设置页显示 app 版本。若希望显示根版本，需要改 `server.ts` 的读取路径，属后续决定。
8. **`settings` 文档形状**：逐字段回退，不做整份迁移；未来新增字段时旧文档自动取默认值。
9. **`zh-CN` 包默认未启用**：全新 home 的设置页语言控件只有 English；设计稿截图需要先启用中文包（本计划验收用隔离 home seed）。这是既有产品行为，不在本次改动。
10. **AssetSink 形态**：若某个表单给 assets 配了 sink，`assets.put` 可能返回 sink 的远程引用而不是 `assets/...`；设置页会把该引用继续算作 remote。Web 表单当前没有 sink，这个分支不影响本次目标；其他形态若接入设置页需要重新定义"已本地化"。
