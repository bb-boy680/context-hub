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

# Skills 插件化 + 插件互相扩展（2026-10-07）

## 实测结论（临时探针，验证后已删除）

- 兄弟插件默认**互不可见**服务：`ctx.get("skills")` 返回 undefined。
- 在插件函数上先声明 `inject: ["skills"]` 再 `ctx.plugin()`：依赖方在提供方 ACTIVE 前保持 PENDING（不加载）,
  提供方 `dispose()` 后依赖方 fiber 自动卸载（state 4 → 依赖方 0），提供方回来后再自动加载。
- 所以"skills 是插件、claude-code/codex 插件扩展它"框架层成立；缺口都在我们自己的内核里。

## 决策

- 内核保留**封闭贡献点词汇表**：`locale`（已有）/ `target`（已有）/ **`nav`（新增）/ `route`（新增）**。
  插件不自定义新贡献点，避免闭环外的类型不可控。
- 插件之间：**描述性扩展走贡献点**（`target`，无依赖，禁用只是少一条）,
  **有状态协作走 Cordis 服务缝**（manifest `provides` + `inject`，由 Cordis 负责等待与级联卸载）。
- 国际化所有权：插件自带**自己命名空间的英文兜底**（`skills.*`），语言包**跨命名空间**翻译；
  缺键回落英文。`@workspace/locale-zh-cn` 不依赖任何插件包，插件也不需要知道有哪些语言。

## 计划

### 1. 内核 packages/extensions

- [ ] `ContributionMap` 增加 `nav`（path / labelKey / icon / group / order）与 `route`（path / Component）
- [ ] `ExtensionManifest` 增加 `provides?: string[]`、`inject?: string[]`；`ExtensionView` 暴露 `waitingFor`
- [ ] `ExtensionService`：把 manifest 的 `inject` 写到插件函数上；订阅 `internal/status` 同步状态；
      新增 `waiting` 状态（依赖服务未就绪）；`start()` 不再假设条目一定 ACTIVE
- [ ] `I18nService`：`buildTable` 改为按 locale 分组 —— 兜底语言包 → 活跃语言包（同 locale 多包按目录顺序）,
      **不再把其它语言的包并入**（现在的实现会让法语键漏进中文界面）
- [ ] React 绑定：补 `useNavItem(pathname)`（面包屑与占位页共用），`useContributions` 已够用

### 2. 新包 packages/plugin-skills（`@workspace/plugin-skills`）

- [x] 迁入 `pages/skills.tsx` → `src/page.tsx`、`skill-detail-dialog.tsx`、`add-skill-dialog.tsx`、`src/messages.ts`
- [x] `table-pagination` 上移 `@workspace/ui/components/table-pagination`（overview / mcp-servers / plugins 同步改路径）
- [x] `activate(scope)` 注册：`nav`（Manage 组 order 15、键 `nav.skills`）/ `route`（`/skills`）/
      自带 en 语言包（`skills.*` 60 个键）
- [ ] 消费 `target` 贡献：按 `supports.includes("skill")` 列出可投递的 agent 目标（随 `sync to target` 一起做）

### 3. 应用侧 apps/web

- [x] 删 `/skills` 硬编码路由与 `nav.skills` 静态项；`App.tsx` 路由与侧栏改由贡献生成
- [x] `app-header.tsx` / `pages/placeholder.tsx` 改用 `useNavItem`；`navigation.ts` 加 `useNavGroups` / `useNavItem`
- [x] `lib/hub.ts` 目录加入 `skillsExtension`；`apps/web/package.json` 加 `@workspace/plugin-skills`

### 4. 语言包 packages/locale-zh-cn

- [x] 增加 `skills.*` 中文键（页面 chrome + 两个弹窗 chrome）；`skills.*` 的数据文案（技能名/描述/tag）按约定保持英文

### 5. 验证

- [x] typecheck 全仓绿；改动包 lint 绿（`packages/ui` 的既有 19 个错误与本次无关，未触碰其源码）
- [x] 浏览器：`/skills` 网格/标签页/详情 lightbox/Add 弹窗正常；禁用 skills 插件 → 侧栏项与路由同时消失、
      `/skills` 回落首页；重新启用 → 恢复且仍在 Manage 组第 2 位；切 zh-CN → 页面与两个弹窗 chrome 全中文；
      localStorage `hub/extensions/state` 记录 `hub.skill.catalog`
- [x] 语言包回归：en 界面不出现中文（`buildTable` 按 locale 分组合并）

## 样式回归修复（用户 2026-10-07 反馈"样式有点乱了，弹窗样式也有问题"）

- **根因**：`packages/ui/src/styles/globals.css` 用显式 `@source` 列扫描目录，新包不在表内 →
  插件包里的 arbitrary 类（`h-[246px]` / 网格列宽 / `h-[130px]` / `w-[880px]` / `h-[228px]` …）**根本没生成**，
  网格卡片撑满整行、封面无限高，两个弹窗同样缺尺寸类。
- **修复**：`@source` 改为覆盖全部工作区源码 —— `../../../apps/*/src/**` + `../../../*/src/**`
  （顺带删掉模板遗留的 `../../../components/**` 死路径与冗余的 `../**`）。
- **灯箱按画板尺寸回修**（`L9tdZp`）：媒体区底色 `#F1F5F9`（= `--secondary`，非 `--muted`）、
  缩略图 72x44（原 72x72）、上传格 72x44 且无描边用 `bg-card`、提示改为纯文本（去掉图标）、
  计数胶囊补图片图标、说明 chip 去掉多余图标（画板无）、操作按钮 36 高、图标按钮 32x32。
- 核对图：`designs/check-web/skills-grid-v3.png`、`skills-detail-v3.png`、`skills-files-v3.png`、
  `skills-add-registry-v3.png`、`skills-detail-nocover.png`、`overview-v3.png`。

## 灯箱媒体区改用开源 Swiper + 分类可编辑（用户 2026-10-07 要求）

- [x] 手写切图逻辑替换为 **swiper@14.3.0**（`swiper/react` + `Thumbs` / `Navigation` 模块）：
      主图 Swiper + 缩略图 Swiper 联动，点击缩略图/前后按钮/方向键均由库驱动
- [x] 多图片：`Skill.gallery`（16:9 示例图）驱动幻灯片，缺省回落 `cover`
- [x] 上传改为 popover：本地文件 / URL / `data:` base64 三种来源，新增后自动滑到新图
- [x] 分类可增删：chip 带 × 移除按钮，虚线 + 打选择器（种子标签快选 + 自定义输入），
      改动经 page state 同步到卡片 pill
- [x] 抽出 `src/tags.ts`（种子标签 + 哈希取色 tone）与 `src/types.ts`（Skill / MediaItem）
- 坑：① swiper 的布尔简写（`navigation` / `keyboard`）会**整体覆盖**模块默认对象，必须传对象；
      ② 导航按钮在 Swiper 容器外时，要在实例就绪后写 `params.navigation.prevEl/nextEl` 并调
      `navigation.init() + update()`；③ base-ui Dialog 会吞掉冒泡阶段的按键，swiper 的 keyboard
      模块（监听 bubble）在弹窗内失效 → 改用捕获阶段监听并调 `slidePrev/slideNext`；
      ④ `react-hooks/refs` 禁止 render 期读 ref，Swiper 参数模板放模块作用域。
- 核对图：`designs/check-web/skills-swiper-final.png`、`skills-media-added.png`、`skills-category-add.png`

## 视频缩略图与播放联动（用户 2026-10-07 报 bug）

- 现象：添加视频后缩略图是**黑块**（`preload="metadata"` 不渲染画面），且切换后不会自动播放/暂停。
- 修复：缩略图视频改 `muted + loop + autoPlay + playsInline + preload="auto"`（静音运动预览，
  右下角保留小播放角标、去掉通铺遮罩）；主视频由 `MediaSlide` 的 `active` 驱动 ——
  激活时 `startPlayback()`（带声播放，被浏览器策略拒绝则自动降级 muted 重试），非激活时 `pause()`。
- `playing` 状态改由 video 自身的 `onPlay` / `onPause` / `onEnded` 事件驱动，effect 里不再 setState。
- 实测（`video.86605038.mp4`）：添加后主视频 4s 处有声播放、缩略图静音循环；
  切到图片 → 主视频停在 12.2s；切回 → 13.7s 自动续播；核对图 `designs/check-web/skills-video-thumb.png`

## 列表封面视频的可见性播放（用户 2026-10-07 追加要求）

- 语义：**进入视口才播放、离开即暂停**；网格卡片与列表行同款。
- 实现：`src/autoplay-video.tsx`（`IntersectionObserver` threshold 0.25 + `visibilitychange` + 槽位）
  与 `src/media.ts`（全局上限 `MAX_PLAYING = 6`，超出排队；`registerPreview` /
  `setPreviewsSuspended`）。打开详情弹窗时 `setPreviewsSuspended(true)`，底层目录整体停播。
- `cardMedia(skill)`：**第一个资源是视频时封面就用视频**（否则用 cover，再否则 Markdown 预览）。
- 示例数据加了 `demoVideo`（`perf-profiling`）以覆盖视频封面路径。
- 实测：卡片在首屏外 → paused；滚到视口内 → 播放（t 走到 2s）；滚回顶部 → 停在 2s；
  再滚下去 → 从 2s 续播到 4s；列表视图 36px 缩略图同样行为；打开灯箱时目录视频暂停（8.6s），
  灯箱内主视频播放；关闭后目录视频从 10.2s 续播。槽位探针：9 个请求发放 6 个、拒绝 3 个。
- 核对图：`designs/check-web/skills-video-card-inview.png`、`skills-video-list.png`、`skills-video-card.png`

## 卡片改为按资源比例的瀑布流（用户 2026-10-07 追加要求）

- 语义：媒体盒**取资源自身宽高比**（不再裁成固定 130px 高），卡片高度随内容变化，整页走 masonry。
- 实现：`SkillCard` 用 `aspectRatio: 实测值 ?? 16/9`；图片经 `onLoad`（含 `complete` 兜底）、
  视频经 `onLoadedMetadata` 上报 `naturalWidth/naturalHeight`；`media.ts` 的
  `knownAspect/rememberAspect` 缓存已测比例，重挂载不再跳一次布局。
- 网格：`columns-[266px] gap-x-6` + 卡片 `mb-5 break-inside-avoid`（设计宽度 1136 → 4 列；
  浏览器按 266px 自动决定列数，不再有固定列数上限）。
- 示例数据给每个封面配了不同比例（4:3 / 16:9 / 3:2 / 1:1 / 3:4），以便看见瀑布流节奏。
- 实测：12 张卡片高度 273–528 不等、封面比例 1.33/1.78/1.50/1.00/0.75 与资源一致；
  视频封面 330x186 仍静音播放；列表视图不受影响（14 行、1088 表格）。
- 核对图：`designs/check-web/skills-masonry.png`、`skills-masonry-full.png`

## 缩略图支持移除（用户 2026-10-07 反馈"这里没有移除的功能"）

- 每个缩略图**右上角内侧**加 × 按钮（`top-1 right-1`，即距上/右各 4px；默认 `opacity-0`，
  `:hover` / `:focus-within` 显示，键盘 Tab 也能触达），点击后从 `items` 移除该资源。
  最初用 `-top-1 -left-1` 的负偏移，被 Swiper 容器的 `overflow: hidden` 裁成半个圆，故改为内缩定位。
- `remove(id)`：删除后把选中项**移动到相邻资源**（删的是当前项或更靠前的项就回退一位），
  保证舞台永远有内容；删除最后一项时回到 Markdown 预览空态，缩略图行整体隐藏。
- 实测：3 项删除中间一项 → 2 项、计数 1/3 → 1/2；删除当前项 → 舞台仍显示相邻资源；
  删到只剩 1 项时计数胶囊隐藏；× 与缩略图是两个兄弟按钮，点击互不干扰。
- 核对图：`designs/check-web/skills-thumb-remove-corner.png`、`skills-thumb-remove-corner-hover.png`

## 视频控制条替换居中按钮（用户 2026-10-07 反馈"视频中间一直显示一个暂停的图标，不要这个"）

- 去掉舞台上常驻的居中大圆钮与底部细进度线，改为**底部控制条**（参考图 2 的样式）：
  左侧播放/暂停（24px 圆钮）、中间 `<input type=range>` 进度滑杆（`accent-white`，16px 命中区）、
  右侧静音切换（`volume-2` / `volume-x`），整体压在 `from-[#0f172ad9] to-transparent` 渐隐条上。
- 用原生 range 获得拖拽/键盘/无障碍语义，`onChange` 按比例 seek；`onVolumeChange` 同步静音状态
  （自动播放被浏览器降级为静音时也能反映出来）。新增键 `skills.media.seek/mute/unmute`（中英）。
- 实测：舞台居中按钮已不存在；控制条 720×68、滑杆 616×16；seek 到 30% → 视频 4.5s/15.1s；
  静音按钮切换后 `video.muted=true` 且标签变为"取消静音"；播放中左侧显示暂停图标。
- 核对图：`designs/check-web/skills-video-bar-final.png`、`skills-video-controls.png`

## 结果

- **内核**：`ContributionMap` 增加 `nav` / `route`；`ExtensionManifest` 增加 `provides` / `inject`；
  `ExtensionService` 把 `inject` 写到插件函数、订阅 `internal/status`、新增 `waiting` 状态；
  `I18nService.buildTable` 只合并「兜底语言包 + 活跃语言包」，同 locale 多包按目录顺序。
- **插件包**：`packages/plugin-skills`（`@workspace/plugin-skills`）自带页面、两个弹窗、en 文案与数据，
  通过三个贡献点接入主体；主体不再有任何 skill 代码。
- **依赖机制现状**：内核已支持 `provides` / `inject` / `waiting`，但目录里目前没有插件声明它们
  （没有消费者就不声明 `provides`）。claude-code / codex 插件要真实写盘时，skills 插件加 `provides: ["hub.skills"]`，
  目标插件加 `inject: ["hub.skills"]` 即可获得等待与级联卸载。
- **遗留**：Add 弹窗的排序 Select 选项仍是英文（`SelectValue` 渲染 value 而非 children,
  翻译它需要把选中值提到 state）；`sync to target` 投递计划与 diff 预览仍未做。

## 媒体引用与 core 资源包（2026-10-08，用户纠正）

### 纠正的问题

上一版把粘贴的 URL **下载成文件**存进技能目录，用户指出这不是想要的语义：
URL 应当只记录引用，只有真正"上传"的资源才落盘，落盘位置也应当在 Context Hub 自己的空间里，
而不是每个技能目录内。

### 决策

- **引用而非拷贝**：`SkillSummary.assets` 里每项是**引用**——`http(s)` URL 原样保存，
  UI 直接加载；上传的文件保存为**相对 hub home 的路径**（`assets/<name>`）。
  技能目录内不再存放媒体文件，拷贝技能目录即可带走全部内容。
- **新包 `packages/core`（`@workspace/core`）**：资源的管理者，其他包通过它使用。
  - `src/assets.ts`（可移植）：`assetKind` / `readSource`（把粘贴源分成 link 与 bytes 两类）/
    `assetUrl` / `ASSET_ROUTE = /hub/files` / `AssetLibrary {root, put, remove}` / 体积上限。
  - `src/host/assets-fs.ts`：Node 实现，写在 `<home>/assets`，唯一命名 + 原子 rename + 路径越界拒绝。
  - `src/host/home.ts`：hub home 解析（显式 → `CONTEXT_HUB_HOME` → `~/.context-hub`）与展示路径。
  - `vite.ts`：开发桥，只读地把 `<home>` 下的文件挂到 `/hub/files/*`（支持 `Range` → 206）。
- **删除即清理**：`deleteAsset` 删引用时删掉 hub 拥有的文件（URL 引用不动）；
  `remove(id)` 先删该技能引用的所有文件，再删目录与目录行——失败时不会留下孤儿文件。
- **变更只走 store**：桥只提供读取，写入/删除都经过记录引用的那一次调用，引用与文件不会各写一半。

### 接线变化

- `SkillStore`：`putAssetFromUrl` → `addAssetSource`（URL 直接记录；`data:` 才落盘）,
  `deleteAsset(id, ref)` / `assetUrl(ref)`（不再带 skill id）。
- `skills-fs.ts` 组合 core 的库：`createFsSkillStore({ home, library? })`；技能根 = `<home>/skills`。
- 桥路由：`POST /hub/skills/<id>/assets?name=`（原始字节）、`POST /hub/skills/<id>/source`（粘贴源）、
  `DELETE /hub/skills/<id>/assets?ref=`；媒体由 `/hub/files/*` 提供。
- `apps/web/vite.config.ts` 注册两个桥（core 的资源 + 插件的技能库）。

### 验证

- `check-store.ts`：**全绿**（新增：URL 只记录不落盘、重复链接只保留一条、`data:` 落盘、
  删除引用同时删除文件、`remove` 清空该技能引用过的文件、路径越界拒绝）。
- 浏览器：卡片与灯箱直接用远端 URL 播放（`readyState 4`），本地无副本；
  上传 `note.png` → 引用 `assets/note.png`、文件落在 `~/.context-hub/assets/`、
  `/hub/files/assets/note.png` 返回 200、`Range: bytes=100-` 返回 206；
  移除该媒体后引用与文件同时消失。测试产生的文件已清理。
- **本地数据**：旧的技能目录内媒体（`video.eef090ae.mp4`、`video.86605038.mp4`）已移入
  `~/.context-hub/assets/`（未删除）；URL 已按新语义重新记录为链接引用。

## 技能页签回到"来源"轴（2026-10-08，用户指出页签块不见了）

### 问题

设计稿的技能页签是 `All 42 / Built-in 24 / Workspace 12 / skill.sh 6`（**来源**轴，三轴之和 = 总数）；
接入磁盘库时为了过滤启用状态，页签被换成了 `全部 / 已启用 / 已停用`，设计上的那一块就不见了。

### 决策

- **一个维度**：页签只承载"来源"，与设计稿一致（Plugins 的页签承载状态、来源放筛选行，两者不混）。
- **计数由数据给出**：`SkillPage.counts` 随列表一起返回，计数**忽略来源筛选**、跟随标签筛选，
  这样任何页签被选中时其余页签的数字仍然稳定。
- **状态维度让位**：启用状态改由卡片/列表行的开关表达（与设计一致）；需要按状态筛选时再单独加控件。
- **同一套措辞**：`skills.source.*` 成为唯一来源词表（`local` → Workspace/工作区、`builtin` → Built-in/内置、
  `registry` → skill.sh），页签、卡片徽标、详情弹窗（原来直接打印 `local`）共用它；
  删掉重复的 `skills.tab.builtin|workspace|registry` 与 `skills.filter.*`。

### 接线变化

- `SkillQuery.source`、`SkillPage.counts`（`SkillCounts`）；`skills-fs.ts` 先按标签/搜索收窄、再统计、后按来源取行。
- 桥 `/hub/skills?source=` 只接受已知来源；`remote-store.ts` 透传；`useSkillLibrary` 暴露 `counts`。
- `library.ts` 新增 `sourceLabel()`；`page.tsx` 用 `SOURCE_TABS` 渲染 `全部/内置/工作区/skill.sh` + 计数。

### 验证

- `check-store.ts`：**全绿**（新增：计数按来源归类、来源筛选只留本来源、计数不受来源筛选影响但跟随标签筛选、
  重开 store 后记录里的来源仍然生效）。
- `pnpm --filter @workspace/plugin-skills typecheck|lint`、`web`/`locale-zh-cn` typecheck：**通过**。
- 浏览器：页签显示 `全部 2 / 内置 0 / 工作区 2 / skill.sh 0`；点"内置"得到空态，点"工作区"得到两行且计数不变；
  卡片徽标与详情弹窗的"来源"都显示 `工作区`（不再出现裸 `local`）。
- 注意：改动服务端桥代码后需**重启 dev server**（Vite 不会热更已加载的插件模块），否则前端会拿到没有 `counts` 的响应。

## 画布：删掉多余画板、卡片改瀑布流（2026-10-08）

### 删除

Skills 行原有 10 块画板，删掉 4 块已被取代的：

| 画板 | 为什么多余 |
| --- | --- |
| `X2w2Te` Grid（初版） | 被 Grid v3 取代 |
| `qk8lW` Grid v2 | 同上 |
| `u0xRV` Detail — Configuration | 详情已改为 lightbox，tab 弹窗不再实现 |
| `jFcNl` Detail — Files | 同上 |

剩下的 6 块按实现顺序重排（x = 128 + i×1560）：Grid v3 `libo0`、List `qBAVy`、skill.sh `Y2fjK1`、
Import `DzRqf`、Lightbox `L9tdZp`、Lightbox Files `Mnwzp`；`eddWl` 宽度 14176 → **9496**。

### 同步

- **卡片 = 瀑布流**：Grid v3 的 `Card Grid` 由"3 行 × 4 张等高卡（266×246）"改为 4 个 `Column` 竖排容器，
  卡片封面高度按真实媒体比例变化（16:9→150、3:2→177、4:3→200、1:1→266），卡片高度 = 封面 + 116。
  列高 938 / 981 / 915 / 981，`Card Grid` 保持 778 并 `clip`，折线落在每列第 3 张的封面内——
  与实现里 `columns-[266px]` 的实际视口一致（页面滚动，见下一屏）。
- **两块 lightbox 屏的背景同步**：`E8hbJ` / `n8FFba` 的旧等高行换成同一组瀑布流列（Copy 过来），
  否则弹窗后面的目录与 Grid v3 对不上。
- **页签**：List / skill.sh / Import 三屏残留的第 5 个页签 `Disabled 4` 已删，六屏统一为
  `All 42 / Built-in 24 / Workspace 12 / skill.sh 6`（375 宽）。
- Module Label 描述里的 "detail dialog" 改为 "detail lightbox"。

### 验证

- 全行扫描：除装饰 Blob（刻意的出血）外无布局问题；`Card Grid` 内的裁切是视口折线，不是缺陷。
- 核对图本轮已按新约定删除（`designs/` 下的截图不进仓库）：本地导出 `libo0`（瀑布流网格）与 `L9tdZp`
  （lightbox + 新背景）逐块看过，确认封面比例、列高与折线位置正确。

## 插件状态改存 hub home（2026-10-08，用户："插件系统用浏览器本地缓存是不对的"）

### 问题

内核把状态写进了 `window.localStorage`（键 `hub/extensions/state`、`hub/locale`）：换一台机器、换浏览器、
清一次站点数据，扩展的启用状态和界面语言就没了——产品状态不该由某个浏览器 profile 保管。

### 决策

- **新增 `state/` 空间**：`<home>/state/<name>.json`，一个文档一个文件（`extensions.json` 启停状态、
  `locale.json` 当前语言）。命名即文件名，所以名字必须是小写字母开头的 `[a-z0-9-]`，其余一律拒绝。
- **端口从"字符串"改为"JSON 值"**：`StoragePort.read/write` 直接搬 `unknown`，不再 `JSON.stringify`
  一层套一层；磁盘文件因此就是值本身，读的一方校验（`extensions` 校验对象+布尔，`locale` 校验字符串）。
- **表单负责异步**：内核接口必须同步（Cordis 服务在构造期读状态），所以由**表单**在启动前把 `state/`
  全部读进内存，再用一个同步端口对外，写操作直接回写主机（失败只告警，不在点击时抛错）。
- **一次性搬迁**：盘上没有该文档、浏览器里还有旧键时，先把旧值写进盘再删掉浏览器键；
  盘上已有文档则直接删掉浏览器里的陈旧副本。用户本次已就地迁移（旧键已从浏览器清除）。

### 接线变化

- `packages/core`：新增 `src/state.ts`（`STATE_ROUTE`/`STATE_DIR`/`assertStateName`/`StateStore`）、
  `src/host/state-fs.ts`（磁盘实现）、`src/host/atomic.ts`（原子写，从 `assets-fs.ts` 抽出，
  `plugin-skills` 的第三份 `writeAtomic` 一并合并到这里）；桥新增 `GET/PUT /hub/state[/<name>]`。
- `packages/extensions`：`StoragePort` 改为 JSON 值；文档名成为 `extensions` / `locale`。
- `apps/web`：`lib/hub.ts` 启动前 `openState()`（读盘 + 搬迁 + 回写），`vite.config.ts` 注册 `stateStore()`。

### 验证

- `node packages/core/scripts/check-state.ts`：**23 项断言全绿**（文档即文件、重开 store 可读、
  标量文档、名字拒绝表 `..`/`hub/locale`/`Hub`/`.hidden`/空/空格/带扩展名、越界写入拒绝、
  坏 JSON 报文件名、外来文件不列表也不动、替换后无临时文件残留）。
- `node packages/plugin-skills/scripts/check-store.ts`：全绿（共享原子写后回归）。
- `core` / `extensions` / `plugin-skills` / `web` typecheck 与 lint 全绿。
- 浏览器：重启 dev server 后 `/extensions` 显示的状态来自磁盘（旧键搬迁成功，盘上出现
  `extensions.json`、`locale.json`）；点"卸载 简体中文"→ 盘上该键变 `false`、localStorage 不同步变化；
  刷新后仍为已卸载（读盘生效）；重新安装恢复原值；刷新后 `localStorage` 只剩 `theme`。

## 参考：DSH 的插件本地记录方式（2026-10-08，用户要求对照）

读了 `deepseek-harness` 的 `boot/app-boot`、`boot/plugin-manager`、`client/ui-plugin-manager`。结论是
**DSH 没有单独的"插件状态文件"，插件就是磁盘上的东西，记录分散在 profile 自己的三个文件里**：

| 位置 | 记录什么 |
| --- | --- |
| `~/.dsh/profiles/<name>/node_modules/<pkg>/` | 插件本体（pnpm 装进来的真实包，`package.json` 里声明 `dsh.bundle.patch`） |
| `…/profiles/<name>/package.json` | 装了哪些包（`dependencies`）+ 选中了哪些 bundle（有序的 `dsh.profile.bundles`） |
| `…/profiles/<name>/cordis.patch.yml` | 每个条目的启停：最后一个匹配的覆盖项写 `disabled: true/false`，没有就 append 一条 |
| `…/profiles/<name>/pnpm-workspace.yaml` | pnpm 的依赖构建脚本审批（`allowBuilds`） |
| `…/profiles/<name>/.plugin-manager/logs/operation-*/pnpm.log` | 每次安装的 pnpm 输出 |

关键做法：

- **home 是唯一数据根**：显式路径 → `$DSH_HOME` → `~/.dsh`（空/纯空白视为未设置），profile 名做校验
  后落在 `profiles/<name>`，一个 profile 一棵树（web / headless / sdk / acp 各一棵）。
- **安装 = 在 profile 目录里跑 `pnpm add`**：`cwd` 是 profile 目录（不是调用目录），持有 profile 写锁，
  manifest 用原子写；失败/取消会把 `package.json` 与 `pnpm-lock.yaml` 还原，并留下日志目录。
- **启停是改配置，不是写状态库**：`writePluginEnabled` 只改 YAML 里 `disabled` 一个键，保留注释，
  原子写、`mode 0o600`；文件本身可手改，运行时按它对齐。
- **UI 便利项才放浏览器**：插件页唯一持久化的是"上次用过的 registry"（client store 的
  `persist: { name: 'dsh.plugin-manager.install-registry' }`），插件与安装状态一律在盘上。

### 与我们的对照

| 维度 | DSH | 我们现在 |
| --- | --- | --- |
| 根目录 | `~/.dsh`（`$DSH_HOME`） | `~/.context-hub`（`CONTEXT_HUB_HOME`） |
| 插件本体的位置 | `profiles/<name>/node_modules/<pkg>` | **没有**：扩展是编译进应用的代码 |
| 装了哪些 / 选中哪些 | profile `package.json` | **没有**：目录由应用自带 |
| 启停 | `cordis.patch.yml` 的 `disabled` | `state/extensions.json` 的布尔值 |
| 安装日志 | `.plugin-manager/logs/` | 无（没有安装动作） |
| 手改文件 | 支持（YAML 注释保留） | 支持（JSON，读取时逐项校验，非法项忽略） |

所以上一轮做的 `state/` 方向是对的（**状态在 hub 目录、不在浏览器**），差别在 DSH 还多两层：
真正的包安装，以及"选中/启停"拆成两个文件。

### 待定（等用户定方向）

1. **要不要做"下载插件"**：真做的话照 DSH 的形状 —— `<home>/plugins/<id>/` 放包本体、
   `<home>/plugins.json`（或 `state/plugins.json`）记选择与版本、下载走 registry/git/path 三种 spec，
   失败回滚 + 日志目录。编辑器界面再加"从 URL / registry 安装"入口。
2. **启停记录要不要拆出来**：DSH 的启停是 profile 配置的一部分（可手写）。我们的
   `state/extensions.json` 是应用状态；如果希望它像 DSH 一样"可手编、可进版本库"，
   就把它做成 `extensions.yml` 之类的配置文档。目前保持 JSON（有校验、有原子写），暂不拆。

## 插件空间：从磁盘加载插件（2026-10-08，用户："以后要做插件市场、从远程下载到本地"）

### 用户提出的缺口

现有插件（integration / 语言包 / Skills）都是**编译进应用**的代码；用户要的是"以后能装别人的插件、
不改源码就长出新功能"。这件事必须先由内核开出**一条装载缝**——插件再厉害也只能用内核已有的扩展点，
所以这一步不能靠插件自己补。

### 这一轮做了什么（缝 + 磁盘格式）

**磁盘格式**（= DSH 的"插件就是目录里的东西"，但入口用我们自己的 ESM 约定）：

```
<home>/plugins/
  index.json                 # 安装记录：每个插件的 version / source / installedAt / integrity
  <id>/
    plugin.json              # 内核清单（唯一必需文件）：id/name/version/apiVersion/entry/icon/permissions/inject
    index.js                 # 入口模块，导出 activate(scope)；默认 entry，可用 manifest 覆盖
    …插件自己的文件
```

- `id` 同时是目录名：只允许 `a.b-c` 形态（不含分隔符/空格/首点，排除 Windows 保留名），
  且 `plugin.json` 里的 `id` 必须与目录名一致；`locked: true` 被拒（下载来的插件不能自锁）。
- 模块入口由**表单**负责导入：浏览器形态 `import(host 提供的 URL)`，Node 形态 `import(file URL)`。
- **插件模块不 import 任何包**：React、图标表、i18n、UI 组件全部由内核通过 `activate(scope)` 交到手上。
  原因有二：浏览器里裸模块名解析不了；而且 React 必须是**同一份实例**，否则 hooks 直接崩。

**代码落点**

- `packages/core`：`src/plugins.ts`（布局/命名/`PluginSource`/`PluginStore`/`PluginRecord`/`PLUGIN_ROUTE`）、
  `src/host/plugins-fs.ts`（磁盘实现：列表=有 `plugin.json` 的目录、写入原子、路径不得越界、
  `records()`/`setRecord()` 维护 `index.json`）、`vite.ts` 新增 `pluginFiles()` 桥
  （`GET /hub/plugins` 列 id、`GET /hub/plugins/<id>/<file>` 供 JS/JSON/资源，全部 `no-store`）。
- `packages/extensions`：`src/icons.ts`（清单只能写图标**名字**，这里解析成组件，缺省回退 puzzle）、
  `src/plugin.ts`（清单校验 + `discoverPlugins()` 构建 `ExtensionDefinition`）、
  `src/remote.ts`（浏览器侧只读 `PluginSource`）；`ExtensionScope` 新增 `i18n`。
- `apps/web`：`lib/hub.ts` 启动前 `discoverPlugins()` 并追加进 catalog；`lib/ui-kit.ts` 作为 `hub.ui` 服务。
- 示例插件：`packages/extensions/examples/hello/`（复制到 `~/.context-hub/plugins/` 即可看到）。

**踩到的坑（重要，写插件的人会再踩）**

- **fiber 的注入服务只在 `activate` 期间可读**：插件组件在渲染时读 `scopectx.i18n` 会抛
  `cannot get property "i18n" without inject`（Cordis 的属性守卫）。所以内核**在激活时**
  把 i18n 解析好放进 scope；插件应在 activate 里把需要的东西取出来再交给组件。
- 浏览器会缓存清单：桥的 JSON 响应必须带 `Cache-Control: no-store`，否则改完 `plugin.json`
  页面仍按旧清单（少字段）运行。
- lucide 图标是 `forwardRef` 的**对象**不是函数，断言 `typeof icon === "function"` 会误判。

### 验证

- `node packages/extensions/scripts/check-plugins.ts`：**33 项断言全绿**（只有带清单的目录算插件、
  有效插件可加载、清单字段进入 definition、id 与目录不符/apiVersion 不兼容/入口无 `activate`
  三种拒绝各有原因、activate 收到 React+图标表+UI kit、贡献带真实图标组件、
  9 个非法 id 被拒、读写不得越出插件目录、records 往返与坏文件容错、remove 连带清记录）。
- `check-state.ts` / `check-store.ts`：全绿；`core`/`extensions`/`plugin-skills` lint 与
  `web`/`extensions`/`locale-zh-cn` typecheck 全绿。
- 浏览器（真实 `~/.context-hub/plugins/acme.hello/`）：侧栏新增"示例插件"页、`/hello` 渲染插件页面、
  插件自带 en / zh-CN 词条生效、按钮计数（React hooks）可用；卸载 → 侧栏与路由立即消失、
  `state/extensions.json` 写入 `false`；刷新后仍停用；重新安装后恢复。

### 下一轮：插件市场（用户明确要的"从远程下载到本地"）

1. **宿主侧安装接口**（浏览器不能下载再写盘，CORS 也不允许）：
   `POST /hub/plugins { source }`，source 三种形态 —— registry 名字/版本、直链、本地路径。
   流程：拉取 → 校验（`integrity`；manifest 的 `apiVersion`/`id` 先验）→ 解压到临时目录 →
   原子 rename 进 `<home>/plugins/<id>/` → 写 `index.json` 记录 → 默认**不启用**（UI 里点安装）。
   失败回滚临时目录并写 `<home>/plugins/.logs/<id>-<time>.log`。
2. **格式**：v1 建议"单文件 ESM + plugin.json"（`entry` 指一个自包含 bundle）；
   zip/tgz 解压要引入维护中的依赖，等有真实来源再接。
3. **信任**：清单已声明 `permissions`，安装/启用时展示并需确认；代码与页面同权（无沙箱），
   所以"安装 ≠ 启用"，并标"未验证"。沙箱（Worker/iframe + 声明式协议）留作后续。
4. **市场 UI**：Extensions 页加"从 URL / 文件安装"，列表显示来源、版本、权限、可更新。
5. **升级/卸载语义**：升级=原地替换目录（保留 `state/` 数据 + 记录版本）；卸载=删目录 + 清记录，
   `state/` 数据与 `state/extensions.json` 的选择都保留。

## 技能页国际化补漏（2026-10-08，用户："这个没有进国际化"）

### 问题

翻页器的 "Rows per page" 是写死在共享原语 `TablePagination` 里的，页签与列表表头也一样。

### 决策

- **共享原语不带文案**：`packages/ui` 是组件库，不依赖 i18n 服务；按"localized primitive props"
  的约定改成 `label?: string`（默认英文），由调用方传 `t(...)`；同一字符串兼作可见说明与
  `Select` 的无障碍名。
- **分页键放在公共组**：新增 `pager.rowsPerPage`（en `Rows per page` / zh `每页行数`），
  放内核的英文兜底表与 zh 包——分页是外壳的能力，不属于某个页面包。
- **列表表头走词表**：`columns` 从 `label` 改成 `labelKey`（`skills.column.*`），
  英文表里写成大写（`SKILL`/`TAGS`…）以保持设计稿的观感，中文正常写（技能/标签/…）；
  这样不必用 CSS `uppercase`（它会把中文里的 "Token" 也变成 "TOKEN"）。
- **排序下拉不再是"值即文案"**：`sortOptions` 改成 `{ value, labelKey }` + state，
  触发器渲染当前项的词条（`SelectValue` 只会原样渲染 value）。

### 验证

- 浏览器（zh-CN）：列表视图表头 = 技能/标签/来源/Token 数/触发次数/更新时间/操作；
  翻页器显示 `每页行数`（无障碍名同）；Add 弹窗排序 = 安装量最高/最近更新/趋势上升；
  勾选框无障碍名 = `选择 <技能名>`。
- `plugin-skills` typecheck+lint、`web`/`ui`/`extensions`/`locale-zh-cn` typecheck 通过
  （`ui` 的 19 个 lint 错误是 shadcn 既有问题，本次未新增）；三个行为脚本全绿。

### 仍待补（更大范围）

`apps/web` 的 Overview / MCP / Plugins / Activity / Policies / Repository / Settings 仍是全英文页面
（只有 Extensions 与占位页接了 i18n），要给这些页面做词表 + 接线，才算"整个界面可切换语言"。

## 设计稿：Add skill 弹窗改为「本地导入 + 下载」（2026-10-08，用户先改设计）

### 用户要求

1. 导入弹窗的常态是"导入本地"，另一个 tab 用来**下载**：输入包名，用 `npx skills` 下到 hub 目录。
2. skill.sh 这一块以后**用插件实现**，本次先从设计里移除它的 tab。
3. 页脚提示 `Copied into .dsh/skills and enabled right away.` 是错的（那个路径不属于我们）。

### 先做过的事实核查（`npx skills` 用法）

细节与逐条实测见文末「`npx skills` 实测」一节；这里只留结论：命令形如
`skills add <source> [--skill <name>] -a universal -y --copy --json`，来源可以是 `owner/repo`、
`owner/repo@skill`、Git URL 或直链；不给技能名会把整个仓库装进来。

### 画布改了什么

- `Y2fjK1`：`Skills — skill.sh Browser` → **`Skills — Add skill — Download`**。搜素/排序/6 条结果列表全部删除，
  换成 `Dialog Body`（gap 16, padding [0,24,24,24]）：`Field Package`（占位 `vercel-labs/agent-skills`）、
  `Field Skill (optional)`（占位"留空则取整包"）、说明行 `Fetched with the skills CLI (npx skills).`；
  页脚改为 `Downloaded into ~/.context-hub/skills and enabled right away.` + Cancel / Download。
  弹窗 640×695 → **640×384**，y 由 193 → **348**（居中）。
- `DzRqf`：`Skills — Import` → **`Skills — Add skill — Local`**；页脚提示改为
  `Copied into ~/.context-hub/skills and enabled right away.`（原 `.dsh/skills` 是错的）。
- 两个弹窗的分段行：`skill.sh` / `local` → **`Local` / `Download`**（Local 在左、默认选中）；
  未选中项改 `$muted-foreground`/500，选中项 `$foreground`/600 + 白色胶囊。
- 工具栏按钮（六块屏统一）：`Browse skill.sh` → **`Download`**（图标 `download`，仍是主按钮）。
- 文案同源更新：弹窗描述 = `Import a folder from this machine, or download a skill by name.`；
  页描述（Grid/List/两个弹窗/两块 lightbox 共 6 处）= `Import a folder, download a skill by name, or manage the ones in this workspace.`；
  模块标签描述去掉 "skill.sh browser"。

### 验证

- 全行扫描：只有 4 个 masonry `Column` 报 "partially clipped"（既有的视口折线，非缺陷）。
- 导出核对（本地看过，按约定不入库）：两个弹窗、Grid 工具栏、两屏整图；
  分段行标签居中、字段圆角/描边与 MCP 表单一致、页脚右对齐（405+211 = 616 = 640-24）。

### 待用户确认

见文末 `npx skills` 实测一节的「仍待确认」；代码侧（移除 skill.sh tab、下载 tab、提示文案）尚未实现。

## `npx skills` 实测：下载到底能怎么用、界面该怎么设计（2026-10-08）

用户指出上一版没把 CLI 研究明白。实测对象 `skills@1.7.1`（`vercel-labs/skills`，注册表站点 skills.sh，
规范 agentskills.io）。以下每条都跑过。

### 能力边界

| 问题 | 实测结论 |
| --- | --- |
| 能装什么 | `owner/repo`、`owner/repo@skill`、GitHub/GitLab/Azure/git URL、本地路径、**直链 SKILL.md 或 zip/tgz**（下载 ≤10 MiB、解压 ≤25 MiB、≤1000 文件，可用环境变量放宽） |
| 注册表名 | `notion` 这类不是通用注册表查询，而是各家 CLI 集成（要求装 `ntn` 并登录）→ 不能当"按名字下载"的地基 |
| 装到哪 | 项目级 `<cwd>/<agent>/skills/`；`-g` 全局 `~/<agent>/skills/`。`-a universal` 只落 `.agents/skills/<name>/`。**没有"装到指定目录"的参数** |
| 选择行为 | 不给 `--skill` 时 `-y` 会**装整个仓库**（实测 vercel-labs/agent-skills 装了 9 个）；`--skill '*'` 同义；`--skill` 可重复 |
| JSON 报告 | `--json` 输出 `[{name,status,source,ref,hash,path,scope,agents,mode,security{gen,socket,snyk,details}}]`；**status = installed / skipped / failed** |
| 锁文件 | 仓库根写 `skills-lock.json`：`{version, skills:{<name>:{source,sourceType,skillPath,computedHash}}}` —— 正好是我们要记的来源与哈希 |
| 失败形态 | 三种都是**退出码 1**：包不存在 → `{status:"failed",error:"Failed to clone… Authentication failed…（含 SSH/gh 提示）"}`；技能名拼错 → `{name,status:"skipped",reason:"No matching skill found in source"}`。所以只判退出码不够，还要看报告里的 `status` |
| 列举技能 | `add <pkg> --list` 能列出名字+描述，但**不能与 `--json` 同用**、输出带 ANSI 与 spinner 光标控制 → 解析脆弱 |
| 搜索注册表 | `find <q>` 可非交互，但只有文本（ANSI）；**`https://skills.sh/api/search?q=&limit=` 是公开 JSON API**（Algolia，最多 100 条，字段 `id/source/skillId/name/installs`；空 `q` → 400；无详情接口、无 description） |
| 环境变量 | `DISABLE_TELEMETRY=1` / `DO_NOT_TRACK=1` 关遥测；`GITHUB_TOKEN`/`GH_TOKEN` 供私有库；`INSTALL_INTERNAL_SKILLS=1` 才装 `internal: true` 的技能 |
| Windows | `execFile("npx.cmd")` 被 Node 22+ 拒绝（spawn EINVAL）→ 必须 `execFile(process.execPath, [<node>/node_modules/npm/bin/npx-cli.js, …])`；文本输出**永远带 ANSI**（`NO_COLOR`/`FORCE_COLOR` 无效），所以只信 `--json` |

### 由此定下的设计

1. **输入的是"来源"，不是"名字"**：字段叫 `Package`，hint 明写可接受 `owner/repo, owner/repo@skill, a Git URL, or a SKILL.md link`。
2. **执行在宿主侧、且必须沙箱化**：CLI 只能由有盘的进程跑，且它只会往 agent 目录写 →
   在临时目录里 `cwd` 运行（`-a universal --copy -y --json`），再把 `.agents/skills/<name>` 收编进
   `~/.context-hub/skills/<name>`；全程**不碰用户自己的 `~/.claude/skills` 等目录**。
3. **要记的来源信息已经现成**：`skills-lock.json` 的 `source / skillPath / computedHash` + 报告里的
   `source/hash`，直接进我们 catalog 的安装记录（更新=同 spec 重跑并比 hash；卸载=删目录+记录）。
4. **反馈状态要齐**：下载中（clone 可能几十秒）、成功（列出装了哪几个）、`skipped`（名字对不上，
   当作失败报出）、`failed`（把 CLI 的 error 原文带 SSH/gh 提示一起显示出来，例如私有库的 Authentication failed）。

### 画布改动（本轮）

- `Y2fjK1`（Add skill — Download）随实测调整：Package 字段下新增 11px hint 列出可接受的来源形态；
  body hint 改为 `Runs the skills CLI (npx skills add); private repositories use your git credentials.`；
  弹窗随下一节改为列表选择版。

### 仍待确认

1. 需要"已安装"标记吗（列表里某技能已在 `~/.context-hub/skills` 时）？
2. 分组标题要不要在列表里显示（现在只显示不带分组的平铺清单）？
3. 装完显示 CLI 的安全信息（`security.snyk: medium` 等）吗？
4. 默认加 `DISABLE_TELEMETRY=1`？
5. 目标 id 已存在：拒绝 / 覆盖 / 加后缀？
6. 粘贴的命令里如果带 `-g`（全局）或 `-a <agent>`，忽略还是提示？（我们固定 `-a universal` 装进 hub）

## 能否"贴仓库 → 拉列表 → 勾选 → 下载"？能，已实测（2026-10-08）

用户问：能否直接填仓库、拉取列表、用户选择后再下载。用 `mattpocock/skills` 等三个仓库实测，
答案是**能**，两个环节都跑通了。

### 一、列列表：`skills add <source> --list`

**不能用 `--json`**（CLI 直接拒绝：`The --json flag cannot be combined with --list.`），
但文本输出是稳定的三层结构，剥掉 ANSI 与 spinner 光标控制后可以可靠解析：

```
● Available Skills
<分组标题>                     ← 可省略（vercel-labs 就没有）；对应仓库目录，如 skills/<category>/
│
│   <skill-id>                 ← 框线 + 4 空格
│
│     <完整描述，不截断>         ← 框线 + 6 空格
│
│   <skill-id>
…
 Use --skill <name> to install specific skills
● Found 38 skills               ← 自报数量，可用于校验解析结果
```

三个仓库的解析结果（`cli said` vs `parsed` 完全一致）：

| 仓库 | CLI 自报 | 解析出 | 分组 |
| --- | --- | --- | --- |
| `mattpocock/skills` | 38 | **38** | Mattpocock Skills 27 + General 11 |
| `vercel-labs/agent-skills` | 9 | **9** | 无标题 → 回退为仓库名一组 |
| `anthropics/skills` | 20 | **20** | Academy Guide 1 / Claude Api 1 / Discernment Nudge 1 / Document Skills 4 / Example Skills 12 / General 1 |

- 解析规则：剥 ANSI → 找 `Available Skills` → 之后的行里，非框线行是分组标题，
  `│`+4 空格是 id，`│`+6 空格是描述；没有标题时用仓库名兜底。
- 描述是**完整原文**（实测最长 1069 字符），所以列表摘要要在 UI 侧截断。
- 耗时：~2.6–3.1 秒（克隆仓库）；卸载/错误路径见上表。

### 二、只下载选中的：多个 `--skill`

`--skill` 可重复；实测 `mattpocock/skills` 选 3 个（code-review / diagnosing-bugs / tdd）：

```
skills add https://github.com/mattpocock/skills \
  --skill code-review --skill diagnosing-bugs --skill tdd \
  -a universal --copy -y --json
→ exit 0，2644ms；报告 3 条全部 installed；磁盘上**只有**这 3 个目录（无多余）
```

锁文件同时给出每个技能的来源细节，可直接进我们的安装记录：
`{source:"mattpocock/skills", sourceType:"github", skillPath:"skills/engineering/code-review/SKILL.md", computedHash:"1846…"}`。
`skillPath` 还顺带暴露了真实目录层级（分组标题就来自它）。

### 三、因此下载 tab 的设计（画布已改）

`Y2fjK1`（Add skill — Download）从"Package + Skill 两个输入"改为**列表选择**：

```
[Local | Download]
Package  [ https://github.com/mattpocock/skills      ] [ List ]
         owner/repo, owner/repo@skill, a Git URL, a SKILL.md link, or a pasted npx skills add command
         ( grill-me × )                       ← 从粘贴的命令/`@` 解析出的已选技能
────────────────────────────────────────────────────────────
Found 38 skills in this package                  Select all
 docs-writer      Turn notes and pull requests…      ✓ Selected
 release-notes    Summarise merged work…             [Select]
 api-review       Review endpoint changes…           [Select]
 onboarding       Walk a new contributor…            [Select]
 changelog        Group commits into a…      （滚动区外）
────────────────────────────────────────────────────────────
Downloaded into ~/.context-hub/skills and enabled right away.   [Cancel] [Import]
```

- 弹窗 640×**596**，y=242（居中）；Body 401 = 字段 105（标签 15 + 输入 38 + hint 13 + chips 21 + 间距）
  + 分隔 1 + 标题行 15 + 列表 208（4×52）+ 间距。
- 行 = 复选框（选中=$primary 填充+白色勾）+ 等宽技能名 13/600 + 描述 11.5 muted（实现里截一行）。
- **chip 就是"已选技能"的唯一状态**：勾选行 = 增删 chip；List 回来的行按 chip 预勾选；
  Download 把 chips 逐个变成 `--skill`。
- 按钮带选中数量（`Download 1`），未选中时禁用。
- 需要一起实现的三个状态（尚未画）：**列表加载中**（"Fetching skills…"）、**空结果**、
  **失败**（把 CLI 的 error 原文连同 SSH/gh 提示显示出来，例如私有库的 Authentication failed）。

## 精确指令怎么填？表单要能接住"用户手里已有一条命令"（2026-10-08）

用户问：如果用户手里就是 `npx skills add https://github.com/mattpocock/skills --skill grill-me`
这样的准确命令，表单怎么填？实测了各种"精确写法"的边界。

### 实测边界

| 写法 | 结果 |
| --- | --- |
| `--skill grill-me` | ✅ 只装 grill-me |
| `-s grill-me`（短参） | ✅ 同上 |
| `mattpocock/skills@grill-me`（简写 + `@`） | ✅ 只装 grill-me |
| `https://github.com/mattpocock/skills@grill-me`（**URL + `@`**） | ❌ **失败**：git 把 `@` 当成凭据分隔符，报认证失败并中止 |
| `mattpocock/skills@grill-me@tdd`（两个 `@`） | ❌ 失败，`skipped`：`grill-me@tdd` 被当成一个技能名；**多个技能只能用重复的 `--skill`** |
| `--list` 带上 `@skill` 或 `--skill` | 列表**照样列出全部**（38 个），pin 被忽略 |
| 技能名拼错 / 仓库不存在 / 无匹配 | 三种都 **exit 1**（技能名拼错时报告里是 `skipped` + `No matching skill found in source`） |

**结论（实现要点）**：`@skill` 只能跟在 `owner/repo` 简写后面，**绝不能把 `@` 拼到 URL 上**；
所以表单要自己解析 `@`，把来源与技能名拆开，安装时统一用 `--skill` 传（这也是我们唯一能控的形态）。

### 表单怎么填（三种都通）

1. **直接粘贴整条命令**（最贴近用户现状）：`npx skills add … [--skill X]` 贴进 Package 字段 →
   表单剥掉 `npx skills[ @version] add`，取出 source 与所有 `--skill/-s` 值，
   把技能名变成输入框下方的 chip，**不点 List 也能直接 Download**。
2. **简写 pin**：`owner/repo@skill` —— 同样解析成 chip。
3. **浏览挑选**：点 `List` 拉列表 → 勾选（chip 与勾选是同一个状态，互相联动）。

因为 `--list` 会忽略 pin，实现上：**chips 即"已选技能"的唯一状态** → List 回来后按 chip 预勾选；
若某个 chip 在列表里找不到，就地提示（多半是拼错）。

### 画布改动

`Y2fjK1` 的 Package 字段：hint 补上 `or a pasted npx skills add command`；
输入框下方新增 **Chip 行**（`grill-me ×`，圆角胶囊 `$muted`，等宽 11.5 + 12px `x` 图标）；
列表第一行改成 `grill-me` 且已勾选（对应 chip），其余三行改为未勾选；
按钮改为 `Download 1`；弹窗 570 → **596** 并居中（y=242）。

## 下载列表改版：按参考图重做行样式、列表限高可滚动（2026-10-08，用户："ui 太丑了"）

用户给了一张参考图（技能列表：左侧两行文字、右侧计数 + 靛蓝按钮、已安装项显示绿色 `✓ 已安装`），
要求照它重做，并且**行内动作从"下载"改成"选择"**、列表**要有最大高度并出现滚动条**。

### 行样式（旧 → 新）

| | 旧 | 新 |
| --- | --- | --- |
| 左 | 复选框 + 等宽技能名 + 描述 | **无复选框**；技能名（等宽 13.5/600）+ 描述（11.5 muted）两行 |
| 右 | 无 | **行内动作按钮**：未选 = `Select`（`$primary` 实心、白字、h32）；已选 = `✓ Selected`（`$chart-2` 勾 + 文字，无按钮） |
| 行高 | 52 | **56**，行右内边距 14（避免压住滚动条） |

参照图的"安装 / ✓ 已安装"一一对应我们的"选择 / ✓ 已选择"（英文画布：Select / Selected）。

### 列表限高与滚动

- `Skill List`：`height: 224` + **`clip: true`**，5 行内容（5×56 = 280）→ 第 5 行整体在滚动区外，
  边界落在整行上（实现里对应 `max-h-[224px] overflow-y-auto`）。
- 右缘新增 **`Scrollbar`**：4×186 圆角 `#0F172A40`，绝对定位（x=584, y=4），长度≈可见比（4/5 ≈ 78%）。
- 弹窗 596 → **620**（Body 425 = 字段 105 + 分隔 1 + 标题行 15 + 列表 232 + 间距 48 + 下内边距 24），
  重新居中（y=230）。

### 验证

- 全弹窗扫描：唯一的问题节点是滚动折线本身，其余无问题。
- 截图逐块看过：行左两行文字对齐、按钮右对齐（x=494..578）、滚动条不压按钮、
  `✓ Selected` 与 `Select` 两种状态的视觉差与参考图一致。

## 表单去掉 List 按钮、入口统一为 Import（2026-10-08）

用户三轮反馈：① 表单样式不对（List 是个裸文字按钮）；② 底部按钮统一显示 Import；
③ 工具栏的 Download 按钮不要了，统一从 Import 进入。

### 改动

- **List 按钮删除**：`Package Row` 整个行框架删掉，输入框直接放在字段列里（宽度 592 占满整行，
  不再被按钮挤到 491）。拉列表改为**输入框失焦自动触发**，并在提示行下加一行说明
  `Listed automatically when the field loses focus.`（11px muted，位于来源形态说明与 chip 行之间，
  顺序：Label → Input → Hint（可填什么）→ Note（何时拉列表）→ Chips（已选））。
- **工具栏**：删掉六块屏的 `Button Download`，操作簇只剩 `[视图切换] [Import]`（宽 192）。
- **弹窗页脚**：Download tab 的 `Download 1` → **`Import`**；Local tab 本来就是 `Import`，
  两个页脚现在完全一致（Cancel 79 + Import 100）。
- 字段高度 105 → 124（多一行 Note），弹窗 620 → **631**，重新居中（y=224）。
- 列表高度 232 → **224**：正好 4 行（4×56），底部是干净的边界而不是 8px 半截条；
  「还有更多」由滚动条表达（滑块 186/224 ≈ 78%，对应 4 行可见 / 5 行内容）。

### 验证

- 全弹窗扫描：只有 `Skill wayfinder fully clipped`（列表第 5 行在滚动区外，符合预期）。
- 视觉复核（逐块导出看）：工具栏右侧 = 网格/列表切换 + 描边 `Import`，无 Download；
  页脚 = `Cancel` + 靛蓝 `Import`；列表滚动条可见、最后一行下方边界干净；
  表单里输入框整行、两行灰色说明、chip 行顺序正确。

### 待定

工具栏的 `Import` 目前仍是**描边（次要）**样式——它过去是次级入口（主按钮是已删除的 Browse skill.sh）。
现在它是页面唯一入口，是否要提为主按钮（靛蓝实心）？未擅自改动。

## Local 也要列表：拖入的可能是"技能仓库"（2026-10-08，用户要求）

用户指出：本地导入的可能不只是一个技能，而是**一个技能仓库**，所以 Local 同样要列出扫描到的技能。

### 改动

`DzRqf`（Add skill — Local）的弹窗结构从"拖拽区 + 页脚"变成与 Download 同构：

```
[ Local | Download ]
┌──────────────────────────────────────────────────────┐
│ [↑]  Drag and drop a skill folder here   [Browse files] │  ← 拖拽区 92 高（横排紧凑版）
│      A folder with SKILL.md, or a repository of skills.  │
└──────────────────────────────────────────────────────┘
────────────────────────────────────────────
Found 5 skills in this folder                 Select all
 docs-writer      Turn notes and pull requests…      ✓ Selected
 release-notes    Summarise merged work…             [Select]
 api-review       Review endpoint changes…           [Select]
 onboarding       Walk a new contributor…            [Select]
 changelog        Group commits into a…      （滚动区外）
────────────────────────────────────────────
Copied into ~/.context-hub/skills and enabled right away.  [Cancel] [Import]
```

- **拖拽区改为横排紧凑版**（228 高居中版 → **92 高**）：44 方形图标环（20 图标）+ 文字块
  （标题 14/600 + 说明 11.5）+ `Browse files` 按钮；说明改为
  `A folder with SKILL.md, or a repository of skills.`
- **列表复用 Download 的结构与行样式**（Divider → `Found N skills in this folder` + `Select all` →
  `Skill List` 224 高 + 行内 Select / ✓ Selected + 滚动条），示例数据换成"本地仓库"的一套技能名
  （docs-writer / release-notes / api-review / onboarding / changelog），首个已选。
- 弹窗 447 → **623**，重新居中（y=228，与 Download 的 631 基本等高）。

### 待定（新增）

拖入**之前**列表是空的：现在画的是"已拖入"状态。两种实现取舍——
① 列表区在未拖入时隐藏（弹窗变矮、拖入后长高）；② 始终保留列表区、未拖入时显示空提示（布局稳定但首屏有空洞）。
倾向前者（拖入是用户的主动动作，长高不突兀），实现时确认。

## Cancel 加二次确认（2026-10-08，用户要求"防止用户误操作"）

用户要求：点 Cancel 出现二次确认，避免误操作丢掉已填/已选的内容。
用户随后纠正：**这个是气泡弹窗**——确认不占整屏、不盖住父弹窗，要挂在 Cancel 上。

### 新画板

`eddWl` 行内新增第 6 块：**`Context Hub — Skills — Add skill — Discard confirm`**（`Bn0cT`），
紧邻两块 Add skill 的右侧（左邻是 `DzRqf`「Add skill — Local」，右邻是 lightbox）。
为插入它，两块 lightbox 右移 1560（`L9tdZp` 6368→9488、`Mnwzp` 7928→11048），行宽 9496 → **12488**。

### 气泡样式

`Bn0cT` = `Y2fjK1` 的整屏拷贝，**没有第二层 scrim**：父弹窗照原样留着，气泡从页脚浮出来。
（先前那版居中的 420×138 模态、`Confirm Scrim`、点 scrim 关闭，都已删除。）

```
        ┌──────────────────────────────┐
        │ Discard this import?         │ 13.5/600
        │ The package and the skills   │ 12 muted
        │ you picked are not saved.    │
        │                              │
        │        [Keep editing] [Discard] │ 28 高，右对齐
        └───────────▼──────────────────┘ ← 12×12 菱形，朝下
                 [Cancel] [Import]         ← 页脚原按钮
```

- 气泡 `M4emk`：320×**134**，`x=588, y=654`，`cornerRadius: $radius-lg`，`padding: [14,16]`，
  `gap: 10`，`clip: false`；阴影比父弹窗轻（`#0F172A29` y8 blur24 + background_blur 24），
  否则两层阴影叠起来像两块浮板。
- 小三角 `Wr4tO`（`Bubble Caret`，绝对定位）：12×12 白方块旋转 45°，`$dialog` 填充 + `$glass-border` 内描边；
  在帧的 children 里排在气泡**之前**（index 7），上半截被气泡盖住，只露下面那个尖；
  帧是 flex 布局，所以必须写 `layoutPosition: "absolute"`，否则 `x`/`y` 会被忽略。
- 对位：三角中心 x=868 = Cancel 中心（Cancel 占 829..908）；气泡右边缘 x=908 与 Cancel 右边缘齐平。
- 按钮：`Keep editing`（描边，108 宽）、`Discard`（`$destructive` 实心 + `$destructive-foreground`，
  88 宽），高 28，**安全选项在左**。
- 两块 Add skill 弹窗页脚完全同构，所以**这一块画板同时代表 Local 与 Download 两个 tab** 的确认态。

### 实现规则（重要，别做成一刀切的确认）

1. **只在"有东西可丢"时才确认**：字段为空且没有选中任何技能时，Cancel 直接关闭——
   打开弹窗又立刻关掉是最常见的用法，这种时候弹确认是纯打扰。
2. **同一规则覆盖所有退出路径**：Cancel 按钮、右上角 `×`、Esc、点弹窗外 —— 四条都要走同一个判断，
   否则用户绕开确认就失去意义。
3. 文案区分动作：标题说清丢什么（`Discard this import?`），说明说清代价
   （`The package and the skills you picked are not saved.`），主按钮用动词 `Discard` 而不是 `OK`。
4. 气泡不是模态：Esc、点气泡外、再次点 Cancel 只关掉气泡、留在弹窗里；
   组件层把一个 Popover/Popper 锚在 Cancel 上，不要自己按弹窗坐标算位置。

## 对齐修复：拖拽区说明文字还残留居中（2026-10-08，用户："文字没有对齐"）

`MS8Ea` 拖拽区从"大居中版"改成"横排紧凑版"时，说明文字 `ElA6m` 的 `textAlign: center` 忘了清掉：
标题左对齐、说明居中，两行左边缘差一截（截图为证）。已改回 `left`，与标题同一左边界。

顺带全文档扫了一遍 `textAlign: center` 的文本，只剩 Plugins「Install — From path」的
`Dropzone Hint`（`pPF3z`）——那块是**整块居中的大拖拽区**（标题也居中、420 宽的说明框在 592 里居中）,
属预期，不动。

## 代码实现：按设计稿落地（2026-10-08，用户："我说的根据设计稿完善代码"）

设计稿改成什么样，代码就写成什么样：Add skill 弹窗从「skill.sh 注册表 + 本地拖拽」变成
**Local / Download 两个 tab 共用一份列表**，Drop 与 Download 都真的能跑通，Cancel 用气泡二次确认。

### 新增的三道缝

| 模块 | 什么 | 在哪 |
| --- | --- | --- |
| `src/package-source.ts` | 把 Package 字段读回 `{ source, skills }` | 可移植，对话框与脚本共用 |
| `src/folder-scan.ts` | 读一次拖入/选中的文件夹：按首段分组、只认带 `SKILL.md` 的组 | 浏览器侧（拖拽遍历 + base64） |
| `src/host/skills-cli.ts`、`src/host/folder-import.ts`、`src/host/names.ts` | 跑 CLI、写文件夹、拒绝危险目录名 | 宿主侧（有盘的那一端） |

`SkillStore` 因此多了三个方法：`listPackage(source)` / `installPackage(source, skills)` / `importFolder(files)`;
桥接新增三条路由 `GET /hub/skills?action=package`、`POST …action=install`、`POST …action=import`。

### 下载怎么落地（照实测的形状）

- **在临时目录里跑 CLI**：`npx skills add <source> [--skill x]… -a universal --copy -y --json`,
  `cwd` 是 `mkdtemp` 出来的空目录；CLI 只会往 agent 目录写，所以它写它的，写完我们**只把
  `.agents/skills/<name>` 搬进 `<home>/skills/<name>`**。用户自己的 `~/.claude/skills` 全程不碰。
- **Windows 必须绕 npx.cmd**：走 `process.execPath` + npm 自带的 `npx-cli.js`
  （Windows 在 `<node>/node_modules/npm/bin/`，POSIX 在 `<node>/../lib/node_modules/npm/bin/`）。
- **只信 `--json`**：文本输出永远带 ANSI。列表没有 JSON，只能解析文本，
  所以 `parsePackageList()` 按实测结构读（`│` + 4 空格是名字、+ 6 空格是描述、无框线行是分组标题、
  `└  Use --skill` 是结尾）。
- **已有同名 = 拒绝，不覆盖**：`installPackage` 把"库里有这个 id"报成该技能的失败原因，
  用户先卸载再下载即可（画布待定项 ⑤ 的默认取值）。
- 失败原样透出：拼错技能名是 CLI 的 `No matching skill found in source`，仓库不存在是它的认证/克隆报错。

### 本地导入怎么落地

拖拽用 `webkitGetAsEntry()` 递归遍历（`readEntry` 逐层读目录，`readEntries` 要读到空数组才停）,
选择器用 `<input type="file" webkitdirectory>` 的 `webkitRelativePath`；两者都变成
`{ path, file }` 列表 → `scanFolder` 分组成候选 → 选中项编码成 base64 →
`POST …action=import` → 宿主按 `<root>/<首段>/…` 逐文件写入，**目录必须先有 `SKILL.md`**，
越界路径（`..`）直接丢弃，写一半失败就把该目录删掉。

### 对话框行为

- 两个 tab 共用一套状态：`picked` 就是 chip、就是勾选、就是导入内容。
- **失焦即拉列表**：`listed` 记住已列过的 source，同一个 source 不再重复拉（点一下别处不会重跑 CLI）。
- **粘贴命令直接可用**：`npx skills add … --skill x` → 解析出 source + chip，不点列表也能直接 Import。
- **Cancel 气泡**：`Popover` 锚在 Cancel 上（`@workspace/ui` 补了 `PopoverArrow`），
  只有"有东西可丢"时才弹；Esc / 点外部 / 再次点 Cancel 只关气泡。空字段直接关弹窗。
- 列表限高 `max-h-56`（224px，正好 4 行）。
- **Import 带图标与计数**（用户 2026-10-08 指出）：按钮 = 下载图标 + `导入`，选中 N 个时显示 `导入 N`、
  一个没选时只显示 `导入` 且禁用。禁用条件从"只有 Local 需要选中"统一成"两个 tab 都要选中"，
  于是"空选中 = 装整包"不再是 UI 可达路径（宿主契约仍保留该语义，Select all 是界面上的入口）。

### 验证

- `node packages/plugin-skills/scripts/check-package.ts`：**全绿**（新增脚本：9 条 Package 解析断言、
  列表文本解析、拖入分组与编码、写盘与越界拒绝、重名拒绝、二进制往返）。
- `check-store.ts` / `check-state.ts` / `check-plugins.ts`：全绿；`plugin-skills` typecheck+lint、
  `web`/`ui`/`locale-zh-cn` typecheck 通过（`ui` 既有 19 个 lint 错误与本次无关）。
- 桥接实测：列表接口对 `mattpocock/skills` 返回 38 个技能；`install` 真的把 `prototype`、`wizard`
  下进 `~/.context-hub/skills`（重名再装被拒、拼错名字回 CLI 原文）；`import` 写入
  `docs-writer`（含 `references/guide.md`）与 `api-review` 并进了目录。
- 浏览器（zh-CN）：工具栏只剩视图切换 + 导入；弹窗 Local/Download 两 tab、失焦拉列表（38 行、限高可滚动）、
  行内"选择/已选择"、chip、页脚提示与按钮、Cancel 气泡（继续编辑只关气泡、放弃关弹窗）全部符合设计。
- **验证用的技能已从 `~/.context-hub/skills` 删除**，用户原有两条（`pdf-extract`、`hand-made`）不变。

### 画布待定项的默认取值（可再改）

| 待定 | 本次取值 |
| --- | --- |
| Local 未拖入时列表 | 先不显示，读入后出现（含"没有找到技能"空态） |
| 分组标题 | 不显示，平铺 |
| CLI 安全信息 | 不显示 |
| `DISABLE_TELEMETRY` | 默认带上 |
| id 冲突 | 拒绝并提示 |
| 粘贴命令里的 `-g` / `-a <agent>` | 忽略（我们固定装进 hub） |
| 已安装标记 | 暂不做 |

### 画布同步（Import 计数）

三块 Add skill 画板的页脚 Import 按钮（`P60pZQ` / `qgrV5` / `U49rL`，组件 `x3lnSj`）从 `Import`
改成 **`Import 1`**，与各画板里"已选一个"的状态对齐；图标沿用组件里已启用的 `download`。
改的是实例的 `descendants` 覆盖，图标与配色的覆盖一并写上，避免只改文字把图标覆盖丢掉。


