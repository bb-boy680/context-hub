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

### 去重与「已导入」标记（2026-10-08，用户："已经下载下来的需要显示已经导入了"）

技能列表里已经在本库里的行不再让用户选，也不再出现在导入里。

- **判定**：打开弹窗时读一次目录（`store.list({ limit: 1000 })` 拿全部 id），按目录名小写比对；
  每次打开都重读，标记不会过期。
- **行状态**：已在本库 → 绿色勾 + `已导入`（灰色文字，无按钮，与画布新增的 `State Imported` 一致）；
  其余仍是 `选择` / `已选择`。
- **不再重复导入**：`selectable` 只含未入库的行 —— 全选只选它们（38 个技能里已有 3 个时显示 `导入 35`），
  粘贴 `…@grill-me`（已入库）不会再变成 chip，按钮显示 `导入` 并禁用。
- **pin 变化要重新播种**：`listed` 只记来源，所以同一来源换 pin 时原来会直接 return、chip 不更新；
  新增 `seeded`（pin 串）一起比对，pin 变了就地重播种，**不重跑 CLI**。
- 宿主侧的重名拒绝保留为最后一道防线（脚本里有断言）。

**验证**：真实仓库 `mattpocock/skills`（38 个）→ 本库已有的三行显示 `已导入`；`全选` → `导入 35`；
`mattpocock/skills@tdd` → chip `tdd` + `导入 1`；`mattpocock/skills@grill-me` → 无 chip + 按钮禁用。

**画布**：两块 Add skill 画板各把一行改成 `State Imported`（`Y2fjK1` 的 `code-review`、
`DzRqf` 的 `api-review`）：绿色勾 14×14 + `Imported` 13/500 `$muted-foreground`，
行内右对齐（x=501，与 `Button Select` 同位）。做法是把已有的 `State Selected` 帧 Copy 进行里，
再把标签改字、改色，删掉原来的 `Button Select` 实例。

### 修复：隐藏目录里的技能找不到（2026-10-08，用户："导入时还需要处理嵌套目录"）

用户拿 `dsh-context-hub\.agents` 试：里面的技能在 `.agents/skills/<name>/SKILL.md`，
而扫描把**任何以 `.` 开头的目录整支忽略**，于是"没有找到技能"。

**改法**：噪声名单从"所有点目录"改成**明确的生成目录** `node_modules` 与 `.git`。
理由：现在通行的技能布局恰恰在点目录里 —— CLI 装到 `<项目>/.agents/skills/<name>`、
Claude Code 装到 `<项目>/.claude/skills/<name>`，排除点目录等于把主路径排掉。

- 拖拽遍历 `readEntry` 同样跳过 `node_modules` / `.git`，免得拖一个装过依赖的项目时把整棵树读进来。
- 其余规则不变：任意深度找 `SKILL.md`、浅的那层优先（技能自己的子目录算它的内容）、技能名取目录名、
  文件按技能目录裁路径。

**验证**

- `check-package.ts`：**全绿**，新增 3 条断言 —— 点目录（`.agents`、`.claude`）里的技能能被找到、
  **被选中的目录叫什么都会被搜索**（`.agents` 作为第一段不再触发忽略）、嵌套文件跟着一起过来；
  原来断言 `.github` 被忽略的那条改成 `.git`（点目录现在是可搜索的）。
- 浏览器（真实 Vite 模块 + 合成大树 200×300 = 60_000 文件，技能藏在 `.agents/skills/grill-me`）：
  103 ms 完成，主线程最大卡顿 **0 ms**，显示"这个文件夹超过 20000 个文件，只读取了最前面的一部分"，
  并且**找到 grill-me**。
- 浏览器（真实仓库 `dsh-context-hub`，含 `node_modules`）：拾取器兜底路径 6.9 s（这段时间是**浏览器
  自己**枚举整个目录的成本），随后扫出 **9 个技能**、无截断提示。
  `浏览文件` 现在优先走 `showDirectoryPicker()` + 我们自己的有界遍历，连这段枚举成本都省掉。
- `check-store.ts` 全绿；`plugin-skills` typecheck+lint、`web` typecheck 通过。

### 修复：大文件夹把页面卡死（2026-10-08，用户："扫描一个很大磁盘的 skills 会容易直接卡死了"）

`DataTransferItem.webkitGetAsEntry()` 的递归**没有任何边界**：深度、条目数、字节数都不设限，
每个目录还要一直 `readEntries` 到空数组；用户指 `deepseek-harness` 那座仓库时主线程被占满。

**改法**（对照 DSH 的做法，全在 `packages/plugin-skills/src/folder-scan.ts`）

- 条目预算 `maxEntries` 20000 + 噪声目录名单（`node_modules` / `.git` / `dist` / `build` / `.venv` / `__pycache__` …，
  取自 DSH 的 `DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES`）；走到预算就停并把 `truncated` 交给界面提示。
- **深度优先**：两段队列（`skills` / `.agents` / `.claude` / `.codex` / `.cursor` 先走），一条分支走完再走兄弟。
  先写成先入先出时，200 个 `pkg*` 兄弟目录会把预算吃光，`.agents/skills/<name>` 反而够不着。
- 遍历只做目录枚举，**字节到导入时才读**；导入前先按 `file.size` 求和，超过 `maxImportBytes`（64 MiB）报错。
- `AbortSignal` 贯穿整条链：重新选择、关闭弹窗、组件卸载都会取消（新一次拾取先 abort 上一次）。
- 兜底 `<input webkitdirectory>` 路径同样先丢噪声、把技能目录提前，再按预算切片。

**验证**

- 合成 200×300 = 60_000 文件：103 ms 完成，主线程最大卡顿 **0 ms**，显示截断提示，技能仍然找到。
- `check-package.ts` 新增断言：条目预算与 `truncated`、遍历期间不打开任何文件、`.agents` 先于兄弟目录、abort 生效。

### 修复：两个页签的已选互相串（2026-10-08，用户："本地导入的没有 skill 的那个 tag，跑到下载里面去了"）

Local 与 Download 原本共用一个 `picked`，切页签时上一页的已选跟着过来 —— 下载页签会把本地挑的技能当成 chip。

**改法**：`folderPicked` / `packagePicked` 两份状态，当前页签按 `tab === "local" ? folderPicked : packagePicked` 取；
两页各自保留（切回来还在），关闭弹窗一起清空。

**验证**：本地挑两个 → 切到下载：chip 行为空、`Import` 仍禁用且列表没被预勾选；切回本地 chip 还在。

### 修复：本地页签的已选也显示 chip（2026-10-08，用户："本地已选择的也需要这个组件"）

把下载页签里的 chip 行提成两个页签共用的 `PickedChips`（21 高胶囊 + `×` 移除，空则不渲染），
本地页签放在拖拽区与分隔线之间（`pt-2`）。

**验证**：两页签 chip 的 DOM 与样式完全一致（h 21、胶囊圆角、`bg-muted`、JetBrains Mono 11.5px、左右内边距 8px），
点 `×` 取消该行的勾选并回到按钮禁用态；`check-package.ts`、typecheck、lint 全绿。
画布 `DzRqf` 同步加了 `Picked Chips` 行（弹窗 623 → 660）。

### 修复：已选 chip 区限高、超出可滚动（2026-10-08，用户："这里我也需要有一个最大高度，然后有滚动条"）

`PickedChips` 容器加 `max-h-[68px] overflow-y-auto pr-1.5`：68px = 两行完整（21 + 6 + 21）再加第三行的 2/3，
看得出下面还有；`pr-1.5` 给经典滚动条留位，不压住胶囊。

**验证**：浏览器（本地页签 12 个技能全选）—— `clientHeight 68 / scrollHeight 75`，三行胶囊 top = 0 / 27 / 54，
滚到底（`scrollTop 7.2`）第三行完整可见，弹窗总高从 636 到 650 后不再增长。

**画布没改**：设计稿上这一行只有一颗胶囊，限高是"多选时才出现"的运行时行为，静态画板表达不了。

### 设计稿：删除 skill（2026-10-08，用户："skills 还差一个删除功能，先出 UI 设计稿"）

只改画布，未改代码 —— 先给用户看效果。技能库其实**已经有** `store.remove(id)`（删目录 + hub 为它保存的资源），
缺的只是入口和确认。

**入口**：详情灯箱（`L9tdZp`）的 Info Panel 底部多一行 `Delete skill`：整宽 36 高、透明底、
1px `#EF444459` 红描边、`delete` 垃圾桶图标 + 13/500 红字。它与上面 [View files][Uninstall] 那一行隔 16px，
读作"另一类动作"；Spacer 吸收 52px，面板总高不变（仍是 740）。

**确认**：沿用产品里唯一的确认样式 —— 锚在按钮上方的气泡（和"Discard this import?"同一套），
不做第二个模态（灯箱本身已是模态，再叠一层会变成双遮罩）。气泡 320 宽，左缘与按钮左缘对齐（948），
底边 842 = 按钮顶 854 上方 12px，小三角（12x12 旋转 45°）中心在底边下 6px —— 与 discard 气泡同一套关系。
内容 = 标题 `Delete pdf-extract?` + 说明"文件夹与 hub 存的资源都会被删除，无法撤销" + 等宽路径
`~/.context-hub/skills/pdf-extract`（把"删的是什么"落到具体路径）+ 按钮 `Cancel` / 红色 `Delete`。

**顺带定的图标语义（待用户确认）**：垃圾桶 = 删除。`Uninstall` 只是把技能关掉（清 `enabled`），
原来也用垃圾桶，于是同一面板里会出现两个一模一样的垃圾桶。已把 46 个 `Button Uninstall` 实例改成
`power`（卡片、列表、两处 Info Panel）。坑：`UI / Button` 实例里的图标是 **lucide**（`power`），
bespoke 画框是 **Material Symbols**（`power_settings_new`），写错会报 "not found in the 'lucide' icon set"。

**画布**：`eddWl` 扩到 14048，新板 `Context Hub — Skills — Delete skill`（`Km85R`）在 x=11049。
核对图 `designs/check-skills-delete/`（临时，不提交）。

**还等用户拍板的三件事**

1. 入口是否只放在详情灯箱？卡片/列表行也要（hover 垃圾桶 / 行内多一个按钮）会更快，但会与行内
   `Uninstall` 挤在一起。
2. 确认用气泡还是居中模态（删本地目录更重，模态更强调"不可撤销"，但会多一层遮罩与一个组件）。
3. 列表页的复选框目前是空的 —— 批量删除（勾选 → 删除选中）要不要一起做。

### 设计稿：工作区 Workspace（2026-10-08，用户："我们还没有工作区的概念…先做一版设计稿"）

只改画布，未改代码。**产品模型按用户澄清定**：工作区**就是一个文件夹**；「创建工作区」**直接打开系统
文件夹选择器**（不做中间弹窗）。触发处是侧栏头部那颗 240x48 的工作区按钮。

**新模块** `Module / Workspace`（`FV4gn`，y=10144，宽 1440）一块板 `Context Hub — Workspace — Switcher`（`Q77h8P`）：

- 菜单面板 `Workspace Menu`（`ucsk7`，300x245 @264,8，绝对定位；`$dialog` + `$glass-border` + blur 24 +
  0/8/24 阴影，与 discard 气泡同一套）。位置按用户给的参考图：面板在**侧栏右侧**、顶边与按钮顶边齐平。
  结构 = `Workspaces` 标题行 → 3 行工作区（44 高）：**28px 方磁贴里一律是 `folder` 图标**（当前行实心主色 +
  淡紫底 + 右侧 `check`，其余描边）→ **第一行文件夹名、第二行等宽路径** → 分隔行 → `+ Create workspace` 行。
- 侧栏头部按钮（组件级，全屏生效）：**第一行仍是应用名 `Context Hub`，第二行改成当前工作区的文件夹名
  `dsh-context-hub`**（12px sans，不是路径；路径只在菜单行里出现）；磁贴仍是应用品牌图标。

**第一轮改过的地方**（用户 2026-10-08 反馈）：删掉两块 Create 弹窗板（改为直接调选择器）、
去掉行右侧的 `⌘2`/`⌘3` 快捷键、把首字母磁贴/品牌图标统一换成文件夹图标。
**第二轮**：头部主行恢复 `Context Hub`，副行从等宽路径改回文件名。

**核对**：菜单 264,8 300x245，顶边与按钮顶边齐平、在侧栏右侧；除 blob 出血外无告警；裁剪复核确认
头部第二行与菜单当前行的名称一致、无截断。
坑：① 屏幕根是 flex 容器，插入的浮层必须 `layoutPosition:"absolute"`，否则 x/y 被忽略（有明确告警）；
② 触发器展开态用 `$accent`（80% 白）在侧栏玻璃上几乎看不出，改 `$muted`；
③ 删除 dialog 板后同步把模块宽 4560 收回 1440（模块宽 = n*1440 + (n-1)*120）；
④ 用 helper 生成行时**别从节点名推导显示文案**（`name.replace("Row ","")` 让当前行显示成了 "Current"）。

**还等用户拍板**

1. 侧栏头部那颗磁贴现在还是应用品牌图标（紫色方块 + `waypoints`）——要不要也统一成文件夹图标？
2. 工作区数据落在哪：文件夹里的 `.context-hub/`，还是 hub home 下按路径归档？
3. 菜单里除了「切换 / 新建」，要不要「管理（重命名、移除）」以及行内 hover 操作；要不要出中文画板。

### 落地：工作区切换与「从文件夹创建工作区」（2026-10-08，用户："根据设计稿还原功能"）

**契约（`packages/core/src/workspace.ts`，浏览器与宿主共用的纯模块）**
`WORKSPACE_ROUTE` / `WORKSPACE_DOCUMENT`（= `workspaces`）/ `WorkspaceView{path,name,display}` /
`WorkspacePage{folders,current}` / `WorkspaceStore{page,select,pick}` / `workspaceName()` / `readWorkspaceState()`。
**工作区就是一个文件夹**，所以名称取路径最后一段、显示路径取宿主 `displayPath()`（`~` 缩写）——两者都由宿主算，
浏览器不解析路径（`displayPath` 在 `node:os` 模块里，前端拿不到 home）。

**宿主（`packages/core/src/host/`）**
- `folder-picker.ts`：原生目录对话框。Windows 用 PowerShell + WinForms `FolderBrowserDialog`，脚本以
  **base64 UTF-16LE（`-EncodedCommand`）** 传入 —— 提示文案是本地化文本、可能带引号，这样它永远不进命令行解析；
  macOS 用 `osascript`（`try/on error` 把取消变成空串），Linux 用 `zenity`（取消 = 退出码 1）。
  取消 = 空输出，真失败才抛错（stderr 冒泡成 HTTP 400 里的原因）。
- `workspaces-fs.ts`：读写 `<home>/state/workspaces.json`（复用 `createFsStateStore` + `readWorkspaceState` 校验），
  `select` 拒绝不认识的路由（400 + 原因），`pick` 取消时不写盘、成功时追加（已存在则只切换）+ 设为当前。
- `vite.ts` 新增 `workspaceList()` 桥：`GET /hub/workspaces`、`POST …/select`、`POST …/pick`（pick 会一直挂到
  对话框关闭为止）。`package.json` 补 `./workspace` 与两个 `./host/*` 出口。

**应用（`apps/web/`）**
- `lib/workspaces.ts`：`useWorkspaces()`（fetch 列表 + select + pick，带 `pending`/`failure`）。
- `components/workspace-menu.tsx`：侧栏头部按钮 = Popover 触发器（`side="right" align="start" sideOffset={8}`，
  面板 300 宽、`gap-0.5 p-2`），行 = 28px 文件夹磁贴 + 文件夹名 + 等宽路径，当前行淡紫底 + 勾；
  分隔行（13 高）+ `创建工作区` 行；失败原文显示在面板底部。`app-sidebar.tsx` 的 header 换成它，
  头部第二行 = 当前工作区名（没有则 `workspace.none`）。
- 文案：en 基础包 + zh 包各 5 个键（`workspace.menu.title/create/creating/none/picker.prompt`）。

**顺带修的**：`state-fs.ts` 读文档时先剥 BOM —— Windows 编辑器写的状态文件带 BOM，`JSON.parse` 会直接失败，
原先整份文档报 "not JSON"（本次用 PS 写验证数据时真的踩到）。

**验证**
- 新增 `packages/core/scripts/check-workspaces.ts`（18 项）：空 home / 行名与路径 / `~` 缩写 / 选择落盘并跨实例可见 /
  未知路径被拒且不改状态 / 手改文档非法值被丢弃。`node scripts/check-workspaces.ts` → all checks passed。
- 桥接实测：`GET /hub/workspaces` 读盘正确；`POST …/select` 选未知路径 → 400 + `not a known workspace: …`。
- 浏览器（zh-CN，真实桥）：菜单面板 **300x245 @ (256, 8)**，行 44、磁贴 28x28 圆角 8、标题行 30、分隔行 13、
  padding 8、gap 2 —— 与画板逐项一致；当前行底 `primary/10`、磁贴 `#4F46E5`。
- 端到端：点行切换 → 侧栏第二行随即变化、`data-closed` 关闭；`workspaces.json` 的 `current` 同步改写。
- **文件夹对话框真机验证**：`POST …/pick` 确实弹出 Windows「浏览文件夹」窗口（枚举到 `#32770` 窗口，
  属主是本进程 spawn 的 powershell），用 `WM_CLOSE` 模拟取消 → 200 `{"cancelled":true,…}` 且状态文件未被改写。
- `check-state.ts` 回归通过；web/core/extensions typecheck + lint 干净；locale-zh-cn typecheck 干净。

**画板与实现的一处差异（有意）**：画板里"创建工作区"行点了直接弹对话框，实现里对话框弹出期间该行文字变
「等待选择文件夹…」且不可再点（避免叠两个对话框）。

### 修正：创建行撑满 + 改用浏览器自带的文件夹对话框（2026-10-08，用户反馈）

用户指出两件事：① 面板里「创建工作区」行只有 123 宽（图层面板实测），应撑满；② 打开文件夹的方式不对，
应该是**浏览器自己的目录对话框**（就是 Skills 导入用的那一个）。

**① 宽度**：原因是我把这一行包在 `<span>` 里（为了加 pending 的半透明），行是 flex item，外面套了 inline
容器后不再拉伸。改成把 `disabled` 直接给按钮（`disabled:pointer-events-none disabled:opacity-50`），
按钮加 `w-full`。实测 284 = 300 − 2×8，与其它行一致。

**② 对话框**：删掉宿主侧的 `host/folder-picker.ts`（PowerShell/osascript/zenity 那套）。
**目录对话框属于形态，不属于宿主**：页面自己调 `window.showDirectoryPicker()`（无该 API 的浏览器如实报错），
拿到文件夹后把**名字**交给 hub。契约随之改成 `WorkspaceFolder{name, path?}` + `folderId()`：
- `path` 是形态能给才有的字段 —— 浏览器出于隐私只给文件夹名，**不给绝对路径**，所以 web 形态下第二行没有
  路径可显示（`display: null`，行内只显示名字并垂直居中）；桌面/宿主形态能拿到路径时，第二行仍是 `~` 缩写路径。
- 身份 = `path ?? name`（存储的 `current` 存这个 id）；`add` 去重、`select` 拒绝未知 id。
- 桥接路由：`POST /hub/workspaces/add {name}` 取代原来的 `pick`。
- 文案键删掉 `workspace.creating` / `workspace.picker.prompt`（对话框文案由浏览器决定）。

**验证**：`check-workspaces.ts` 扩到 31 项（含"只有名字的文件夹没有路径行""重复 id 只留一条"）全过；
浏览器里用桩替换 `showDirectoryPicker` 走完整链路 —— 返回 `{name:'dsh-context-hub'}` → 行出现、当前行打勾、
侧栏第二行同步、`workspaces.json` 写入 `{"folders":[{"name":"dsh-context-hub"}],"current":"dsh-context-hub"}`；
桩改为抛 `AbortError`（取消）→ 不写盘、不报错、列表不变。core/web/extensions/locale 的类型检查与 lint 干净。

# 技能 × 工作区：功能对齐与链条设计（2026-10-08，讨论稿，**待用户拍板后实施**）

## 一、现状核对（结论都有代码依据）

| 模块 | 真实还是样例 | 依据 |
| --- | --- | --- |
| Workspaces | **真实**：`state/workspaces.json` + `/hub/workspaces` | `packages/core/src/workspace.ts` |
| Skills | **真实**：本地导入 + skill.sh 下载都落 `<home>/skills` | `host/skills-fs.ts` / `host/skills-cli.ts` |
| Overview / MCP / Plugins / Repository | **样例数据**，模块级常量，背后没有 store | `pages/*.tsx` 里 `const kpis` / `const servers` … |
| 顶栏 Connect repo / Sync repo | 无 `onClick` | `components/app-header.tsx` |
| Ctrl+K 调色板 | query 不过滤、列表写死 | `components/search-palette.tsx` |
| Activity / Policies / Settings | 落到 `PlaceholderPage` | `lib/navigation.ts` |

**技能四个页签的真实情况**（`SkillOrigin = local | builtin | registry`，`store.ts`）：

| 页签 | 谁写这个值 | 结果 |
| --- | --- | --- |
| 内置 `builtin` | **没有任何代码写它** | 永远 0 |
| 工作区 `local` | `readEntry` 的默认 `previous?.source ?? "local"` | 磁盘上所有技能都是它 |
| skill.sh `registry` | **没有任何代码写它**：下载先落 temp 再 `refreshCatalog()`，新目录被当成 `local` | 永远 0 |

用户截图 `全部 2 / 内置 0 / 工作区 2 / skill.sh 0` 不是巧合，是当前代码的唯一可能输出。

## 二、四个断点

1. **页签轴选错了**：它描述"来源"，可 store 只记录了三种来源里的一种，另外两种无人写入。
2. **「工作区」名不副实**：`local` 的含义是"被拷进 hub 自己的库"，与任何工作区目录无关。
3. **`enabled` 是全局的**：写在 `index.json` 的一行里，跟选中的工作区无关 —— 这就是"安装态是错的"。
4. **工作区自带的技能，hub 完全看不到**：技能模块不知道工作区存在（`useSkillLibrary` 只跟 `hub.skills` 说话）。

## 三、定稿模型：两个位置 + 链接安装

**两个位置**（技能只有这两个家）：

| 位置 | 内容 | 归属 |
| --- | --- | --- |
| Hub 库 `<home>/skills` | 货架：导入 / 下载的落点，唯一被 hub 管理的那份 | hub 拥有，可增删改 |
| 工作区 `<workspace>/.agents/skills` | 项目自带 + hub 安装进来的，跟 git 走 | 项目拥有 |

`.claude/skills` 这一版**不读也不写**：那是 Claude Code 插件的领地（已有 `target` 贡献点里
`hub.target.claude-code` 声明了 `Skills → ~/.claude/skills/<name>/SKILL.md`），项目级位置以后由它补。

**两个页签**（按"在哪"分，取代按"哪来的"分）：

- **全部** = Hub 库 + 当前工作区里的，合并列表；来自工作区的行带标记。
- **工作区** = 只看当前工作区 `.agents/skills` 里的；没选工作区时是空态提示。

**只有两个动作，都只碰同一条链**：

| 动作 | 方向 | 方式 | 触发 |
| --- | --- | --- | --- |
| 安装到工作区 | 库 → 工作区 | **建链接** `<workspace>/.agents/skills/<id>` → `<home>/skills/<id>` | 行上的按钮 |
| 从工作区移除 | 删链接 | 只删自己建的链接，`lstat` 先判类型 | 行上的按钮 |

工作区 → 库**不复制**（只读投影）：项目拥有它、git 是真相，拷进库就变成两个真相。
"收进库"（fork / 收藏）留到 v2，只做单行显式动作。

**链接就是安装记录**（"怎么看出是 Context Hub 装的"，按 host 侧 `lstat` 判定）：

| 条目 | 判定 | 显示 | 动作 |
| --- | --- | --- | --- |
| 链接，目标在 `<home>/skills/<id>` 且存在 | 通过 Context Hub 安装 | 已安装 | 从工作区移除 |
| 链接，目标在 `<home>/skills/<id>` 但已不存在 | 断链 | 已失效 | 清理 |
| 链接指向别处 / 真目录 | 工作区自带 | 只读 | — |
| 无条目 | 未安装 | — | 安装到工作区 |

零状态：不需要同步记录、哈希账本、全局 `enabled` —— **文件系统就是记录**，外部工具也看得见。

**本机实测（2026-10-08，Windows + Node 24）**：

- `junction` 建链与穿透读全部正常；`lstat().isSymbolicLink()` = **true**、`readlink` 返回绝对路径 →
  判定代码与 POSIX 统一，不需要分平台分支；
- `symlink(…, "dir")` 在这台机器报 **EPERM**（开发者模式未开），junction 却成功 → **Windows 用 junction，免提权**；
- **悬空 junction 可以建出来** → 断链状态必须处理。
- 代价（如实）：链接**不能随 git 分发** —— Windows `core.symlinks=false` 会把它落成 17 字节的文本文件
  （DSH 仓库里 `.claude/skills` 实测如此）。安装处文案写明"仅本机"；要提交的场景留一个
  "复制到工作区"作为后续次要动作。

**跨平台核查（2026-10-08 追加；本机无 WSL，macOS/Linux 一列为 OS 既定语义）**：

| | Windows | macOS / Linux |
| --- | --- | --- |
| 建目录链接 | `junction`，免提权 | `symlink(target, path)`，**无需提权**，`type` 参数被忽略 |
| 判定 | `lstat().isSymbolicLink()` = true | 同左 |
| 删除 | `fs.rm(link, {force:true})` 实测 OK | `unlink` / `rm` 删链接本身；**`rmdir` 会 ENOTDIR** |
| 跨卷 | junction 限本机本地卷 | 任意 |

- **失败面在文件系统，不在操作系统**：FAT/exFAT 不支持链接（macOS/Linux 直接 ENOTSUP）、
  网络共享（macOS 挂 SMB 需 `mfsymlinks`，Windows 共享里建 junction 一般失败）、
  云同步目录可能破坏链接 → 安装动作要有**降级链：链接失败 → 复制**，并如实说明
  "已复制，此后归工作区所有，hub 不再跟踪它"（真实目录从 `lstat` 看不出是谁装的）。
- 实测安全项：`fs.rm(link, {recursive:true})` **不会**穿透链接删库（库与 `SKILL.md` 完好）；
  仍统一发不带 `recursive` 的形式，少一个参数少一个风险。
- 同步结论：链接指向用户机器上的绝对路径，**任何平台都不该提交**（macOS/Linux 上 git 能存 mode 120000，
  Windows 会落成文本文件）——与"仅本机"的定位一致，不构成跨平台障碍。

**同步的触发**（没有需要触发的"同步"，只有刷新）：切工作区 → 重列；`fs.watch` 监听
`<workspace>/.agents/skills` 变更即刷新（技能库已有先例）；安装/移除后同一次刷新。

## 四、定稿（2026-10-08 用户拍板）

- [x] 工作区技能**只读不复制**，不做自动收编
- [x] 安装方向**库 → 工作区**，方式**链接**（junction / dir symlink），不复制
- [x] 目标统一 `<workspace>/.agents/skills`；`.claude` 留给 Claude Code 插件

## 五、分期计划（1–5 已实现，2026-10-08）

- [x] 1. Host 目录能力：桥新增 `GET /hub/fs/list?path=`（宿主 `readdir` + `lstat`，返回 `path / display /
      parent / crumbs / entries[{name, path, link?}]`，上限 2000 条），工作区身份从"文件夹名"升级为
      host 给出的**绝对路径**（`WorkspaceView.path`；`add(path)` 先验证目录存在，拒绝时明说 "not a folder"）
- [x] 2. 应用内目录浏览器（替换 `showDirectoryPicker`，`apps/web/src/lib/folder-picker.ts` 已删）：
      `components/folder-picker-dialog.tsx` = 面包屑 + 逐层 + 上级行 + 底部当前路径；每次打开都从 home 开始
      （按 `open` 挂载内层组件，不用重置 effect）；新建文件夹**未做**（见"遗留"）
- [x] 3. 技能页两页签（全部 / 工作区）+ 工作区只读投影：`SkillStore.workspaceSkills()` 读
      `<workspace>/.agents/skills`（宿主侧 `host/workspace-skills.ts`），页签计数与筛选移到客户端
- [x] 4. 安装 / 移除 = 建链 / 删链（`installToWorkspace` / `removeFromWorkspace`）+ 三态判定与文案；
      `enabled` 退出界面（仍是库内记录，UI 不再读它）
- [x] 5. 验证：新增 `packages/plugin-skills/scripts/check-workspace-skills.ts`（30 项，含 junction 判定、
      断链、同名拒装、越界名字拒装、库外技能拒删）；`check-workspaces.ts` 重写到 33 项（含列目录）；
      `check-store.ts` / `check-state.ts` 无回归；浏览器实测见下

**浏览器实测（zh-CN，真实桥，Windows junction）**：侧栏菜单 →`创建工作区`→ 选文件夹对话框（560 宽，
面包屑 `~ / AppData / Local / Temp / hub-demo / project`，底部等宽当前路径）→ `选择此文件夹` →
侧栏第二行变 `project`、页签 `全部 3 / 工作区 2`、列表混排（`grilling` 工作区/移除、`grill-me` 技能库/安装、
`notes-writer` 工作区/无动作）→ 点 `安装` 后磁盘出现
`<ws>\.agents\skills\grilling → ~\.context-hub\skills\grilling`（Junction，免提权）、按钮变 `移除`、
页签变 `工作区 2`；点 `移除` → 链接消失、库完好、页签回到 1。灯箱同一套语义（`位置` 行 + `安装`/`移除`）。
截图：`designs/check-web/skills-workspace-all.png`、`designs/check-web/workspace-folder-picker.png`。

**本轮改到的文件**：`packages/core`（`src/fs-browse.ts`、`src/host/fs-browse.ts`、`src/workspace.ts`、
`src/host/workspaces-fs.ts`、`vite.ts`、`package.json`、`scripts/check-workspaces.ts`）、
`packages/plugin-skills`（`src/host/workspace-skills.ts`、`src/host/skills-fs.ts`、`src/store.ts`、
`src/remote-store.ts`、`src/library.ts`、`src/types.ts`、`src/page.tsx`、`src/skill-detail-dialog.tsx`、
`src/messages.ts`、`vite.ts`、`scripts/check-workspace-skills.ts`）、
`apps/web`（`src/lib/fs.ts`、`src/lib/workspaces.ts`、`src/lib/hub.ts`、`src/components/folder-picker-dialog.tsx`、
`src/components/workspace-menu.tsx`、`vite.config.ts`，删 `src/lib/folder-picker.ts`）、
`packages/extensions`（`src/builtin/locale-en.ts`）、`packages/locale-zh-cn`（`src/messages.ts`）。

**遗留（本轮明确没做）**：
- 目录浏览器没有"新建文件夹"；没有手动刷新工作区技能（只有切工作区 / 装完后重读）
- 没有"移除工作区"（菜单只能加和切）；`~/.context-hub/state/workspaces.json` 里旧的无路径条目不显示技能，
  工作区页签会提示"没有可读取的文件夹路径"——重新添加一次即可换成带路径的条目
- 工作区技能**变化不推送**：外部 `git pull` 或手改 `.agents/skills` 后需要切一次工作区/刷新页面
- "库 → 工作区"只有链接一种；FAT/网络盘会降级为复制并提示（本机未触发，代码路径在
  `installSkillIntoWorkspace` 的 `LINK_UNSUPPORTED` 分支）
- 6. 其他模块对齐（另开）：Overview/MCP/Plugins/Repository 接真实 store、顶栏两个按钮、Ctrl+K 过滤

### 修正：宿主自己就是工作区，不需要选（2026-10-08，用户反馈）

**用户的问题**：切到 `dsh-context-hub` 工作区时，装不了、也看不到这个工作区的 skills。
**表面原因**：那条工作区是**旧版**留下的，只有名字没有路径 —— 旧版用浏览器 `showDirectoryPicker`，
浏览器只肯给文件夹名，所以库里存不下路径；没有路径就读不到 `<ws>/.agents/skills`。
**用户的要求**：「不需要选，默认就是扫描当前工作区的 .agents」。

**做法**：不再让用户为这件事挑文件夹（先写的"点这条行 → 选文件夹重新绑定"那套已全部撤掉），
改成**宿主自己所在的文件夹就是一个工作区**：

- `packages/core/src/host/fs-browse.ts` 新增 `projectRoot(folder)`（向上找到最近的 `.git`，找不到就用自己）
  与 `hostFolder()`（= `projectRoot(process.cwd())`）。dev server 起在 `apps/web`，向上就是仓库根。
- `createFsWorkspaceStore(home, { folder })`：读列表时把**宿主的文件夹**并进工作区列表 ——
  已经有指向它的行就什么都不做；有**同名但无路径**的行就让它**原地**取到路径（旧数据自动治好，
  位置不变、current 跟着改成新 id）；都没有就追加进来；列表本来没选工作区时它成为当前。只做一次，写入后即固化。
- `workspaceList()` / `skillLibrary()` 两个桥都传 `folder: options.folder ?? await hostFolder()`；
  `createFsSkillStore` 增加 `folder` 并透传给它的工作区 store，两处读到的是同一个文件夹。
- 菜单里那条 `workspace.noPath` 提示与点击重新绑定一并删除（回退），创建流程仍是"创建 → 打开选择器"。

**验证**（浏览器 + 磁盘，真实桥）：
- `GET /hub/workspaces` → `dsh-context-hub` 自动带上 `path: D:\work-space\dsh-context-hub` 且为当前；
  `deepseek-harness`（宿主不叫这个名）保持无路径不动。
- `GET /hub/skills?action=workspace` → 读到仓库 `.agents/skills` 的 3 个技能（grill-me / grilling / shadcn-ui）。
- 页面：页签 `全部 5 / 工作区 3`；`install-me` 点安装 → 磁盘出现
  `.agents\skills\install-me → ~\.context-hub\skills\install-me` 的 Junction、页签变 4、按钮变"移除"；
  点移除 → 链接消失、仓库自带技能与库都未受影响。
- 顺带修掉一个合并缺陷：工作区**自带**的 `grill-me` 与库里同名时，原先被当成"已安装"而**从工作区页签消失**；
  现在按"位置"分，工作区自带的同名技能单独成行，库里的那条安装按钮置灰并提示「工作区里已经有同名技能。」
  （`Skill.taken`）；行 key 与灯箱都用 `skillKey()`（location + id），同名两张卡不再撞 key。
- `check-workspaces.ts` 增至 45 项（含 projectRoot / 收养 / 旧行原地治愈 / 宿主不匹配不动）；
  `check-workspace-skills.ts`、`check-store.ts`、`check-state.ts` 无回归；五个包 typecheck + lint 全绿。

### 修正：工作区技能显示的是编造内容（2026-10-08，用户发现）

**用户的发现**：灯箱「文件」面板里的内容和 `D:\work-space\dsh-context-hub\.agents\skills\grill-me` 对不上。

**根因**：`useFileRows`（`skill-detail-dialog.tsx`）在 `detail === null` 时**回落到内置示例** ——
一棵假文件树（`skill/`、`reference.md`、`examples/basic.md`、`scripts/extract.py`）加一段模板正文
（`## Steps` / `## Guardrails`）。而 `detail` 来自 `store.get(id)`，那只认**hub 库**；
工作区自带的技能不在库里，`get()` 抛错 → 一路按"没有记录"渲染，于是把示例当内容画了出来。

**修法**：让工作区技能从它所在的目录读出**真实内容**。
- `host/file-tree.ts`（新）：`walkSkillDir(dir)` —— 原来的 `walk` 从 `skills-fs.ts` 提出来共用
  （`skills-fs.ts` 与 `workspace-skills.ts` 都要走文件树，放在任一边都会形成循环依赖）。
- `host/workspace-skills.ts`：`readWorkspaceSkill(workspace, id)` → 读 `SKILL.md` **原文**（保留
  frontmatter，`disable-model-invocation` 这类字段不再被丢掉）+ `files`。
- 契约 `WorkspaceSkillDetail`；`SkillStore.workspaceSkill(id)`；桥 `GET /hub/skills?action=workspace-skill&id=…`。
- 灯箱：工作区行（`location === "workspace"`）改读这条记录；`useFileRows` 的示例回落**只在完全没有库的形态**
  （`store === null`，即样例数据）下生效；库里问不到的空结果现在是空面板，不再编内容。
- 顺带：`stale`/工作区行不再向库发 `get()`（那一发必然 400，控制台留噪）；「删除技能」不再对工作区行显示
  （库删不掉它不持有的技能）；`updated` 为空的行不再显示「更新于」空值，改显示「读取自这个工作区」。

**验证**：`GET …action=workspace-skill&id=grill-me` 返回真实 `SKILL.md` 原文 +
`agents/`、`agents/openai.yaml`、`SKILL.md` 三个条目；浏览器里工作区页签打开 `grill-me`：文件树与磁盘一致、
正文含 `disable-model-invocation: true` 与 `Call the Skill tool with "grilling".`、**没有** Steps/Guardrails/extract.py、
按钮只剩「查看文件」、控制台零报错。核对图 `designs/check-web/skills-workspace-files-real.png`。
`check-workspace-skills.ts` 增 7 项（读原文 / 文件树 / 不存在返回 null / 越界名字被拒）共 37 项全过。

### 改版：来源行取代灰色胶囊（2026-10-08，用户要求"改成截图那样、放左下角"）

用户给了两张参考小图：`[图标] skills.sh · Basic`、`[图标] local · Basic` —— 灰色小图标 + 灰字 + 中点 +
**琥珀色加粗**的词。要求照这个样式替换卡片里那个灰色胶囊，并放到左下角。

**新增 `src/provenance-line.tsx` → `ProvenanceLine`**：`[图标] 来源 · 位置`，位置用琥珀
（`text-amber-600 dark:text-amber-400`），其余 `muted-foreground`；12.5px，图标 3.5。图标按来源取
（`local`=hard-drive、`registry`=store、`builtin`=package）。三处共用：卡片左下、列表「位置」列、灯箱标题下。

- 卡片重排：标题行 = 名称 + 年龄（灰色 11px，无记录则不显示）；底部 = `ProvenanceLine`（左）+ 动作按钮（右）。
  `skillMeta`（tokens/triggers 文本）与 `LocationBadge` 删除；Token 数 / 触发次数 仍由列表列与灯箱 MetaRow 承担。
- `Skill` 重新带上 `source`（`SkillSource`），`sourceLabel()` 恢复（`skills.source.local|registry|builtin`）。
- **顺带修一个真 bug**：下载来的技能一直被记成 `local`，所以 `registry` 永远显示不出来 ——
  `installPackage` 现在把落地的技能标记为 `registry`，来源行才说了实话。
- 灯箱里的 `位置` MetaRow 删除（来源行已经说了），`skills.detail.location` 键删除；
  工作区行的 "读取自这个工作区" 也删除（与来源行重复）。
- 样例数据（无宿主的形态）补 `SAMPLE_ORIGINS`，让演示仍保留四种来源的差别。

**验证**：`本地 · 工作区` 实测宽 98px、高 15px；琥珀色浅色 `oklch(0.666 0.179 58.318)`、深色
`oklch(0.828 0.189 84.429)`；卡片 / 列表 / 灯箱三处样式一致，深色可读。
截图 `designs/check-web/{skills-provenance-line,provenance-line-zoom,skills-provenance-list,skills-provenance-dark}.png`。
四个检查脚本全过，plugin-skills / locale-zh-cn / web 的 tsc 与 eslint 全绿。

### 改版：工作区菜单只显示文件夹名（2026-10-08，用户要求）

用户明确：**工作区这一块只显示文件夹名称**，不要再显示那行等宽路径（`D:\work-space\dsh-context-hub`）。

`workspace-menu.tsx` 的 `MenuRow` 去掉路径行：行内只有图标 + 文件夹名，行高仍 44（内容单行，
文字列 `justify-center`）；路径改为按钮的 `title`（悬停才出现，不占视觉）。选择、创建流程不变。

验证：菜单面板仍 300x245，四行各 44 高、单行；`dsh-context-hub` / `project` 的 `title` 是各自真实路径，
`deepseek-harness`（无路径）没有 title。`apps/web` tsc + eslint 干净。
截图 `designs/check-web/workspace-menu-panel.png`。

### 新功能：把工作区技能收进技能库（2026-10-08，用户要求）

用户：「工作区的 skill，我需要也能同步到我的 Context Hub 里面」。

之前只做了 **库 → 工作区**（安装 = 建链接），**工作区 → 库**被按"只读不复制"砍掉了；这次补上**手动**反向：

- `host/workspace-skills.ts` 新增 `importSkillFromWorkspace(workspace, libraryRoot, id)`：
  把 `<ws>/.agents/skills/<id>` **复制**进 `<home>/skills/<id>`（`fs.cp`，`dereference: true` ——
  库里的副本必须自洽，不能带着指回工作区的链接），失败清理目标。**工作区保留自己那份**：
  那是项目的目录，项目才读它，库拿的是副本。
- 库中已有同名 → 拒绝（`a skill with this name is already in the library`）：库那份可能被人编辑过，不能悄悄覆盖。
- 契约 `SkillStore.importFromWorkspace(id)`；桥 `POST /hub/skills?action=import-workspace {id}`；
  `SkillLibrary.adopt(id)`（写完 reload）。
- UI：工作区自带的技能（`location === "workspace"`）行上出现「加入技能库」（`LibraryIcon`，outline）；
  灯箱同一动作。库里已有同名时该行动作**消失**（`Skill.inLibrary`，由已加载的库列表推导），
  避免重复导入的无效点击。成功后在列表上方显示「已把 X 复制进技能库；工作区仍保留自己那份。」

**验证**（真机）：工作区页签三个技能各出现「加入技能库」；点 `grill-me` → 库中出现
`skills\grill-me\{SKILL.md 164, agents\openai.yaml 142}`（与源逐字节同尺寸）、工作区原目录未变、
该行按钮消失、其它两行仍在、顶部提示正确；页签 `全部 4 → 6`（库 +1，工作区那行也变成"两处都有"的独立行）。
`check-workspace-skills.ts` 增 6 项（复制成功 / 工作区保留 / 同名拒绝 / 源不存在拒绝 / `..` 名字拒绝 /
不留残留目录）共 43 项全过；其余脚本无回归；四个包 tsc + eslint 全绿。
截图 `designs/check-web/skills-workspace-adopt.png`。**测试产生的库副本已删除，用户状态已还原。**

### 修正：工作区技能也能删除（2026-10-08，用户反馈）

用户：「工作区的 skill 也是可以删除的呀，但是我发现是没有删除的按钮的」。是我上一轮把工作区行的
`onDelete` 直接置空（`skill.location === "workspace" ? null : …`）—— 当时只想到"库删不掉它不持有的技能"，
却漏了"它本来就该能从工作区里删掉"。

- `host/workspace-skills.ts` 新增 `deleteSkillFromWorkspace(workspace, id)`：删除
  `<ws>/.agents/skills/<id>` 整个目录（`fs.rm(recursive)`）；链接按条目删（不会穿到库）；
  目录里没有 `SKILL.md` 则拒绝（`not a skill in this workspace`），`assertSkillName` 挡住越界名字。
- 与既有的 `removeSkillFromWorkspace`（只回收 hub 自己建的链接）**分工明确**：一个是"移除我的链接"，
  一个是"删掉这个目录"，两者的确认气泡文案也不同。
- 契约 `SkillStore.deleteWorkspaceSkill(id)`；桥 `POST /hub/skills?action=delete-workspace {id}`；
  `SkillLibrary.deleteWorkspaceSkill(id)`。
- 灯箱：`onDelete` 按位置分派 —— 库行删库记录，工作区行删工作区目录；删除气泡里的**路径按位置取**
  （库行显示库路径，工作区行显示 `<ws>/.agents/skills/<id>`），文案也分两套
  （`skills.delete.text` / 新增 `skills.delete.workspaceText`）。

**验证**（真机）：在仓库里建临时技能 `zz-demo-delete` → 工作区页签打开 → 按钮为
「查看文件 / 加入技能库 / 删除技能」→ 点删除弹出气泡，标题「删除 zz-demo-delete？」、正文
「它在这个工作区里的文件夹会被删除，且无法撤销。」、路径 `D:/work-space/dsh-context-hub/.agents/skills/zz-demo-delete`
→ 确认后目录消失、灯箱关闭、页签回到 `工作区 3`、`.agents` 无 git 残留。另外三个技能未受影响。
`check-workspace-skills.ts` 增 5 项（删除目录 / 不存在拒绝 / 无 manifest 拒绝 / 被拒目录仍在 / `..` 拒绝）共 48 项全过；
其余脚本无回归；四个包 tsc + eslint 全绿。

### 修正：加入技能库改为**链接**，并且只有一行（2026-10-08，用户反馈）

用户：「是科比（copy）进去的还是怎么回事？我需要 link 进去，然后加入之后跟本地的好像有冲突，我只需要一个就行了」。

**① 复制 → 链接**：`importSkillFromWorkspace`（复制）改为 `linkSkillIntoLibrary` ——
在 `<home>/skills/<id>` 建链接指向 `<ws>/.agents/skills/<id>`（Windows junction），工作区保留文件；
文件系统不支持链接时降级复制并如实提示（`skills.notice.adoptedCopy`）。
**顺带发现扫描器根本不认链接**：`rebuild()` 只收 `entry.isDirectory()`，而符号链接的 `Dirent` 不是目录 ——
库里放了链接会**整条看不见**。现在链接目录也算技能，并把 `link`（解析后的绝对目标）记进目录行/`SkillSummary`，
这样上层才知道"这条的文件在别处、归谁所有"。
**② 一份而不是两份**：合并规则改为按**目录**判断 —— 库行的 `link` 落在当前工作区 skills root 里，
就是同一个技能，合成一行（`location: "both"`），不再出现"库一份 + 工作区一份"。
新增 `Skill.linkAt`（`"library"` / `"workspace"`）表示**链接在哪一侧**，动作按它分派：
工作区持有链接 → 「从工作区移除」；库持有链接 → 「从技能库移除」（各自删掉那条链接，真实文件不受影响）。
库侧 `remove()` 遇到链接只删链接（不 follow 到工作区）。
**③ 顺带修两个真问题**：
- 来源行对 "both" 一律显示 `Workspace`（假话）→ 新增 `skills.location.both`「技能库 + 工作区」。
- `remove()` 原先"先删文件再改索引"：索引写失败就留下**一条目录已消失的幽灵行**，而且再没有任何重建机会
  （用户库里那条 `grill-me` 就是这么来的，已用一次 refresh 清掉）。改成**先改索引再删文件**——
  失败时文件还在，下次重建重新列出，两个方向都能自愈。

**验证**：`linkSkillIntoLibrary` 建出 Junction 指向工作区；`index.json` 里该行带 `link` 字段；
页面合并为**一行**、来源行 `本地 · 技能库 + 工作区`、按钮「从技能库移除」，顶部提示
「已把 grilling 链接进技能库；文件仍留在工作区。」；点移除后库链接消失、工作区文件完好、页签与行数不变。
`check-workspace-skills.ts` 增至 53 项（链接落链 / 目标正确 / 工作区保留 / 重名拒绝 / 源不存在拒绝 /
库目录列出该链接与其 `link` / 自带技能无 `link` / 移除链接不伤工作区）。四个包 tsc + eslint 全绿。
截图 `designs/check-web/skills-linked-one-row.png`。**测试产生的链接已全部清理，用户状态已还原。**

