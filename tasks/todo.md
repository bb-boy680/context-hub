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

## 技能库落地本地磁盘 + UI 接线（2026-10-07）

### 决策

- **不做后端服务**：Context Hub 与 deepseek-harness 同源，直接读写本地磁盘即可；
  盘上位置用 Context Hub 自己的家目录 `~/.context-hub`（`CONTEXT_HUB_HOME` 可覆盖，空串按未设处理）,
  技能根为 `<home>/skills`，与 harness 的 `~/.deepseek` 无关。
- **列表来自目录文件**：`<root>/index.json`（`{version, revision, skills}`）是该目录的目录索引,
  只有 `refresh()` 走文件系统扫描，其余读操作都读这个文件；写操作先落地文件再原子更新索引。
- **缝的两端**：`SkillStore`（`src/store.ts`）是唯一接口。宿主侧 `src/host/skills-fs.ts`（Node 实现）,
  浏览器侧 `src/remote-store.ts`（走 `/hub/skills` 的 HTTP 实现）。`vite.ts` 提供的是**开发桥**,
  不是产品后端：桌面形态直接用 `createFsSkillStore`，不需要它。
- **写入原子**：同目录临时文件 + `rename`（Windows `EACCES/EBUSY/EPERM` 有限次重试）,
  目录监视 `fs.watch({recursive})` 300ms 合并，跳过 `index.json` 与 `.tmp-*` 自身写入。
- **分页在服务端**：`list({offset,limit,q,tag,enabled,sort})` 过滤+排序+切片后返回 `{items,total,revision,root}`,
  排序以 id 兜底，翻页不会因同秒写入漂移。

### 接线

- `src/library.ts` 的 `useSkillLibrary(query)`：读页面、跟随 store 变更通知、代际号避免旧响应覆盖新响应；
  无 store 时返回空结果，页面回落示例数据。
- `src/page.tsx`：筛选标签页（全部/已启用/已停用）与分类 chip 进查询、底部范围文案 `from–to / total`、
  分页器真正翻页；`table-pagination` 加可选接线属性（未接线时仍渲染原样，其他 4 个页面不受影响）。
- `src/skill-detail-dialog.tsx`：媒体来自 `detail.assetDetails`（上传/删除走 store）,
  文件树与 SKILL.md 预览来自 `detail.files` / 记录本身；分类增删写回 frontmatter。
- 分类 chip 由 `store.tags()` 聚合提供（新方法 + 桥路由 `?action=tags`），空库不再显示编造的种子标签。

### 接线中修掉的 5 个真实缺陷

1. `enabled` 没进查询串 —— `remote-store.ts` 与 `vite.ts` 两端都漏，导致「已启用/已停用」筛选无效。
2. 详情弹窗不重读记录：依赖项用的是格式化后的相对时间 `updated`，写入后仍是「现在」→ 永不变化；
   改为携带原始时间戳 `stamp`（`updatedAt`）。
3. `writeSkillFile` 按 patch 写：只改 `tags` 会把 `name` / `description` 行从 SKILL.md 里**删掉**；
   改为未给出的字段沿用文件现有值。
4. 无标签时封面预览渲染出 `category: undefined`。
5. 空态显示 `host` 占位（浏览器读不到宿主路径）→ `SkillPage` 增加 `root` 字段。
   另外前端不再伪造「+5」展开按钮（`options.length > visible.length` 才显示）。

### 验证

- `npx tsx packages/plugin-skills/scripts/check-store.ts`：**47 项断言全绿**（目录优先、外改刷新、
  分页/搜索/标签/启停过滤、上传命名与 5MB 上限、删除、越界路径、监视与 dispose）。
- `pnpm -r typecheck` 全绿；`pnpm --filter @workspace/plugin-skills lint` 绿。
- 浏览器核对（真实 `~/.context-hub/skills`）：列表 2 条真实数据 + 本地徽章 + 相对时间；
  启停 → 全部 2 行 / 已启用 1 行 / 已停用 1 行且按钮互换；14 条数据下翻页 1–12 → 13–14 → 1–12；
  分类 chip 过滤 Documents → `1–1 / 1`；上传 12 字节 PNG → 缩略图 + 文件树 + 目录同步,
  移除后三者同时回退且磁盘 `assets/` 清空；改分类 → SKILL.md 的 `tags:` 行被改写且其余行保留；
  空目录启动的第二个实例显示空态与真实路径。


