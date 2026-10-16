# 插件展示图上传落盘

## Context

用户报「plugins 上传展示图的功能失效了」。实测（headless Edge + CDP 打在 5173 的真实 dev server 上）：
`/plugins` → 打开 superpowers → 「展示图」tab → `+` → 选择文件，**图片确实出现在舞台和缩略图条里**，
原生文件选择器弹出、File 内容正确（188527 字节的 PNG，naturalWidth 708）。

所以不是坏了，是**这条链路从来没接上**：`MediaPane`（`packages/plugin-plugins/src/detail-dialog.tsx:203`）
上传走的是 `URL.createObjectURL(file)`（`:252`），只活在这个窗口里。关掉详情再打开就没了，卡片封面也不会变。
`record.assets`（本意是「人加的展示图」，今天 `assets[0]` 即卡片封面，见 `rows.ts:68`）
**至今没有任何代码往里写过东西** —— 只有 `records.ts:166-184` 的 legacy 读、`rows.ts:68` 的读、
`pruneAssets` 的删，源头 `library.ts:341` 的 `assets: kept` 永远来自空的 `previous?.assets`。

用户确认的两条语义：

1. **上传即设为封面** —— 新图写进 `record.assets` 最前。
2. **hub 未收录的 pack 禁用上传** —— 没有记录可写，置灰并提示先收录，不替用户做收录这个决定。

同仓 `packages/plugin-skills` 有完整的同类实现（`host/skills-fs.ts` 的 `putAsset`/`recordAsset`/`deleteAsset`、
`vite.ts:439-453`、`skill-detail-dialog.tsx` 的 `useMediaItems`），宿主/客户端形状照抄它；
插件包自己的 `setTags`（`host/library.ts:491-499`）是「改一条已存在记录」的模板。

## 前提事实（已核对）

- 桥 `vite.ts` 是单路由：GET 从 query 取 action，**POST 只吃 JSON body 里的 action**（`bodyOf`，`:68`），
  错误统一 `400 {error}`。写入动作 `tags` 返回 `{ root, plugins: await library.list() }`。
- 客户端 `write<T>(body)`（`src/library.ts:461-474`）= 置 busy → POST → **`await read()` 全量重读** → 清 failure。
  `read()` 会对**每个 client 跑一遍 `probeInstallers`**（`:429-457`），所以多选文件**必须一次调用**。
  详情页的 `plugin` 从 catalog 现算（`page.tsx:1017`），写完自动刷新，不需要额外回调。
- `readSource(source)`（`packages/core/src/assets.ts:87`）把 http(s) 交回 `{kind:"link"}`、
  把 `data:` URL 解成 `{kind:"file", file}` —— 一个 action 同时接住四个入口。
- `AssetStore.put(file)` 返回 `assets/<stem>-<digest>.<ext>`（`host/assets-fs.ts:103`，**扁平目录**）。
  不落在 `assets/<pack>/` 下，所以 `records.ts:171-184` 那条「旧式 icon 混在 assets 里」的迁移规则不会误伤。
- `assetKind(ref)`（`@workspace/core`，`assets.ts:24`）按扩展名判 image/video；`host/logo.ts:23` 已这么用。
- **本仓 lint 把 `react-hooks/set-state-in-effect`、`refs`、`purity` 都设为 error**
  （`eslint.config.js` 用的 `reactHooks.configs.flat.recommended`）。不能用 effect 夹状态、不能在 render 里读 ref。
- `packages/locale-zh-cn/scripts/check-messages.ts` 要求英文表的每个 key 都在中文表里并报 stale —— 文案两处都要改。

## 阶段一：宿主能收下一张展示图

`packages/plugin-plugins/src/host/library.ts`

`PluginLibrary` 接口加 `addAssets(name, sources: readonly string[])` 与 `removeAsset(name, ref)`，
实现照 `setTags`（`:491-499`）的 `run` / `readDocument` / `[{...one, ...}]` / `save` 形状：

- 整个函数体包在 `run()`（`:256`）里 —— 每个写入都是同一份索引的 read-modify-write，漏掉队列就是互相覆盖。
- 记录里没有这个 name → 抛 `${name} is not in this library`（照 setTags 的措辞）。
- **新文件重包成 `new File([file], \`${name}-${file.name}\`, {type: file.type})` 是 load-bearing 的**：
  digest 由字节算、前缀由名字出，带上 pack 名才让两个 pack 上传同一张图得到两个 ref。
  否则删 A 的图会连带删掉 B 的同字节文件（扁平目录 + 内容寻址）。
- 新 ref 按顺序插到 `assets` 最前、与旧值去重，同时 bump `updatedAt`。
  「新图在最前」能活过 update：`recordOf` 的 kept 循环（`:327-331`）是保序的。
- `removeAsset`：**先确认 ref 真的在该记录的 `assets` 里、且不等于 `record.icon`**，再摘记录并 `save`，最后 `store.remove(ref)`
  （照 `remove` `:456-468`「先写索引后删文件」）；link 没有文件可删，跳过。不在记录里的 ref 直接返回，不调 `store.remove`。

**完成目标**：宿主层能端到端存一张图并记进 `record.assets[0]`，也能安全删掉。

**验收**：`scripts/check-plugin-library.ts` 补断言（用现成的 `writePack` 收录一个 pack，风格照现有 `check()`）：
1. 上传一张 data URL 图 → ref 以 `assets/` 开头、文件真在 `<home>/assets` 下、`record.assets[0]` 就是它、`updatedAt` 变了；
2. 顺序：连传两张 → **第二张在最前**（顺序即「谁是封面」）；
3. 去重：同字节同名字传两次 → 一个条目；
4. **跨档不串**：两个 pack 上传**相同字节** → 两个不同 ref；删掉 A 的之后 B 的文件还在；
5. link source → 原样记录，`<home>/assets` 一个文件都没写；
6. 未知 name → 抛错且索引一个字节没变；
7. **回归**：上传 → `library.replace(...)` 一次 → ref 仍在记录、文件仍在盘上（`pruneAssets` 只该删真的不在盘上的）；
8. `removeAsset` → 记录摘掉、文件消失、剩余顺序保持；重复调用不报错；
   **传一个不在记录里的 ref 不会误删 icon 文件**；
9. sink 组合（`:857-874` 那段）：`addAssets` 走 sink、记录 sink 的 ref、`<home>/assets` 为空；`removeAsset` 让 sink 收到 `drop`。
   `cd packages/plugin-plugins && node scripts/check-plugin-library.ts` 全绿。

## 阶段二：桥与客户端

`packages/plugin-plugins/vite.ts`、`packages/plugin-plugins/src/library.ts`

- 桥加两个 POST action，形状照 `tags`（`:258-264`）：
  - `asset-add`：body `{ name, sources: string[] }` → `library.addAssets(...)` → 返回 `{ root, plugins: await library.list() }`
  - `asset-remove`：body `{ name, ref }` → `library.removeAsset(...)` → 同上返回
  - `sources` **防御性解析**（照 `uploadsOf` `:341-351`）：非数组→空、丢弃非字符串项、**限制条数**
    （一条 JSON body 否则能塞任意多 5MB base64）。两个参数都过 `requiredString`。
- 客户端 `PluginLibrary` 接口 + 实现：
  - `addAssets: (name, sources) => write<void>({ action: "asset-add", name, sources })`
  - `removeAsset: (name, ref) => write<void>({ action: "asset-remove", name, ref })`
- 把 `dataUrlOf`（`add-plugin-dialog.tsx:231-238`）挪到 `src/library.ts` 并导出，两个文件共用一份 ——
  它是把 File 变成桥能收的 `data:` URL 的唯一一步（`readSource` 正好吃它）。

**完成目标**：客户端一句 `library.addAssets(name, sources)` 就能落盘，且页面自动重读。

**验收**：`npx turbo typecheck --filter=@workspace/plugin-plugins` 通过；
两条 action 没有任何自动化覆盖（`vite.ts` 不在任何 check 里），手工 curl 验一次：
`sources` 非数组／空／含非字符串 → 400 `{error}`，不是 500 也不是静默 200。

## 阶段三：媒体逻辑照 skills 来（共用，不复制）

`packages/extensions/src/components/`、`packages/plugin-skills/`、`packages/plugin-plugins/`

用户明确：展示图这一块**完全用 SKILL 的逻辑** —— 展示第一张资产、是视频就自动播、swiper 切到视频也自动播、
而且要有视频懒播。原来我只把封面取「第一张图片」是把技能已经做的事（视频封面用会自己播的预览）砍掉了，方向错了。

给 `@workspace/extensions/components` 加三个共享模块（`swiper` 依赖从 plugin-skills 挪到 extensions）：

- `media.ts`：`mediaKind`、`knownAspect`/`rememberAspect`、解码槽位上限与全局暂停（`previewsSuspended` 等）。
  plugins 的 `page.tsx` 里原本有 `knownAspect`/`rememberAspect` 的第二份拷贝，一并删掉。
- `autoplay-video.tsx`：`AutoplayVideo` —— 只在可见、标签页在前台、没有全屏层压着、且拿到槽位时播。
- `media-gallery.tsx`：`MediaItem`、`MediaWords`、`MediaGallery`（Swiper 主舞台 + 导航 + 拇指条 + 方向键）、
  内部的 `MediaSlide`（当前页播、其余暂停、带播放/进度/静音控制条）与 `VideoThumb`（只有当前拇指在播）。

plugin-skills 删掉自己的 `media.ts`/`autoplay-video.tsx`，详情页改用 `MediaGallery`（`cardMedia` 这个小函数留给自己），
行为不变。

plugin-plugins：

- 卡片按「第一个资产」画：`cover` 恢复成 `record.assets[0]`（不再只取图片），视频交给 `AutoplayVideo`。
- 展示图面板改用 `MediaGallery`，`plugin.pictures` 映射成 `MediaItem`（`id` = 原始 ref，`src` = `assetRef(ref)`）。
- 灯箱打开时 `setPreviewsSuspended(true)`，让目录里的卡片预览停下来。

**验收**：`turbo typecheck lint` 全过；两个包的检查脚本全绿（plugin-skills 7 个、plugin-plugins 3 个）。

## 阶段四：展示图面板接上持久化

`detail-dialog.tsx`、`page.tsx`、`packages/plugin-plugins/src/messages.ts`、`packages/locale-zh-cn/src/messages.ts`

- 面板受控：`items` 从 `plugin.pictures` 派生；object URL 那套删掉，不做乐观预览（`write()` 重读后就出现）。
- 上传：`addFiles` / `addLink` 收成一条路 —— 每个 File 走 `dataUrlOf` 拼成 `sources`（**一次调用**，
  因为 `write()` 每次都会对整个目录跑一遍 agent 探测）。
- 删除：`onRemoveAsset(ref)`；失败 `toast` 报 `reasonOf(error)`。
- 入口 gate 三件事：`plugin.stored === false` 时 `+` 禁用、不画拖拽层、提示换成 `plugins.media.needStored`；
  `busy` 时不再接第二次；**媒体 tab 真的可见**才接粘贴/拖入（`keepMounted` + document 级粘贴监听，
  否则在读 skills tab 时按 Ctrl+V 会看不见地改封面）。

**验收**（真机，自己起的 dev server + headless Edge/CDP，`CONTEXT_HUB_HOME` 指向临时夹具，
全程不碰用户那台 5173）：见下表，全部实测通过。

| 行为 | 实测结果 |
| --- | --- |
| 上传图片 | 记录出现 `assets/demo-pack-asset-*.png`，文件在 `<home>/assets`，舞台按图自身比例画 |
| 关掉再打开 | 图仍在（重新读记录） |
| 再传一张竖图 | 它排 `assets[0]`、成为封面、舞台按竖版比例（313×557） |
| 封面变 | 卡片 `<img>` 换成 `/hub/files/assets/...`，比例跟着变 |
| 传视频 | 记录 `assets[0]` 是 mp4，舞台是 `<video>` 且**正在播**（`paused:false`），自带暂停/进度/静音条 |
| swiper 切走 | 视频 `paused:true`；**切回来 `paused:false` 继续播** |
| 卡片上的视频封面 | 灯箱打开时 `paused:true`（预览全局暂停），关掉后自动播并循环 |
| 删除封面 | 记录、磁盘文件、缩略图条同时消失，下一张接任封面 |
| 未收录的 pack | `+` 是灰的，提示「先收录」，拖拽层不出现 |
| 读 skills tab 时粘贴 | **什么都没发生**（记录不变、资产目录不变）；切回图片 tab 再粘贴 → 写入成功 |

## 收尾

- `npx turbo typecheck lint --filter=@workspace/plugin-plugins --filter=web`（lint 会跑 `set-state-in-effect` 那组规则）
- 三个检查脚本：`check-plugin-library.ts`、`check-plugin-rows.ts`、`check-plugin-scan.ts`
- 计划归档到 `docs/plans/archive/`，教训写进 `docs/memory.md`
- 受管理对象变了，收尾时按 AOCI 流程调一次 `aoci_maintain`

## 不做（以及为什么）

- **不做封面另选 UI**：用户已明确选「上传即设为封面」，封面 = 第一个资产，顺序由上传顺序决定。
- **不自动收录未上传的 pack**：用户选的是「禁用并提示」，不把收录这个副作用藏进一次上传里。
- **不禁止上传视频**：视频是本功能原本就支持的输入。收下它、存下来、在舞台上自动播，
  卡片也会拿它当封面播 —— 这正是 skills 已经做的事。
- **不做乐观预览**：一次省掉 id 空间冲突和 revoke 时机两个坑；真有可感延迟再补。
- **不动 `pruneAssets` / `recordOf` 的保留逻辑**：新 ref 只要真写进记录，重新采集时就会被 `assetPresent` 保住。

## 已知限制

- 桥的 body 只吃 JSON，文件以 base64 走（`add-folder` 搬整包也是这条路，风格一致）。一张 5MB 的图 base64 后约 6.8MB；
  桥本来就没有 body 上限，本轮不新增，靠客户端一次调用的条数上限兜住。
- 「上传即封面」= 新的排到最前；视频也一样，卡片会把它当视频播，不是破图。
- 媒体类型由扩展名判断（`assetKind`）。一个带 query 串的视频直链（`.../a.mp4?token=…`）会被当成图片，
  于是交到 `<img>` 而不是播放器；本机上传和普通直链不受影响。
- 共用之后 `swiper` 从 `plugin-skills` 挪到 `@workspace/extensions`（净依赖不变，只换了宿主）。
- **一条能让用户永久丢图的隐性约束**：`recordOf` 用 **library 的 home** 找文件（`logo.ts:76-79`），
  而 `pruneAssets` 按 **store 自己的 home** 删（`assets.ts:212-215`）—— 若有人用
  `createFsPluginLibrary(homeA, createAssetStore(createFsAssetLibrary(homeB)))` 组合，第一次 update 就会把图删掉。
  本仓默认组合（`apps/web/vite.config.ts:32`）两个 home 一致，不会自然发生；阶段一第 7 条断言把这个钉住。
- 上传失败时 `store.put` 已写下的文件会成为孤儿（今天 `describePack` 预存 icon 也会留），没有任何回收路径 —— 不是本轮引入的。
