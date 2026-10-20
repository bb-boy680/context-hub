# 插件清单迁移到 plugin.yaml + 生成式市场索引

- 日期：2026-10-19
- 主仓：`D:\work-space\dsh-context-hub`，当前分支 `chore/changelog`
- 市场仓：`D:\work-space\context-hub-extensions`，当前分支 `main`，`git remote -v` 为空
- 状态：已批准并执行（2026-10-19）

## 用户已确认的决策

| 决策 | 选择 |
|---|---|
| 清单文件 | 主仓直接切到 `plugin.yaml`，**不保留 `plugin.json` 回退**；旧格式扩展停止加载，按破坏性迁移处理 |
| version / entry 来源 | `version` 只来自 `package.json.version`；`entry` 只来自 `package.json.main`（缺省 `index.js`）；`plugin.yaml` 出现这两个字段直接报错 |
| `name` / `description` | 都支持多语言：字符串或 `{ locale: text }` 映射；内核不再压成 `en` 字符串，由 UI 按当前 locale 解析 |
| 市场索引 | `marketplace.json` 完全由市场仓 `scripts/build-marketplace.mjs` 生成；顶层信息来自根 `marketplace.yaml`（title/description/repository/default author） |
| YAML 解析 | 放 `packages/core`，新增 `js-yaml` 运行时依赖（与 `packages/resources/skills` 一致，`^5.5.0`） |
| icon | 支持 lucide 图标名与插件内相对图片路径；内核加载器把图片路径渲染为 `<img>`，市场索引生成时把图标内联为 `data:` URL |
| 市场构建 | 市场仓根 `build` 在 `pnpm -r build` 之后运行生成脚本；`marketplace.json` 提交进仓库但不手工维护 |
| claude-code 移植 | `packages/agents/claude-code` 的注册逻辑移到市场仓 `plugins/claude.code`，图标用 `icons/claudecode.svg`；主仓不再内置该扩展 |
| 内置市场 | `DEFAULT_SETTINGS.extensionMarketUrl` 默认指向官方市场索引；启动时预读索引（只取元数据，安装时才 clone 插件代码） |

## 背景与现状

### 主仓：扩展清单与安装链路

- `packages/core/src/extension-manifest.ts`
  - `PluginManifestFile`（`:31-52`）要求 `id/name/version/apiVersion`，可选 `description/icon/entry/category/permissions/inject/provides/defaultEnabled`。
  - `parsePluginManifest(value, id)`（`:89-134`）校验 JSON 对象、id 等于目录名、apiVersion 兼容、permissions/category 合法、拒绝 `locked`；默认 `category = "source"`。
- `packages/core/src/host/extension-market.ts`
  - `readLocalIndex`（`:120-142`）读本地 `marketplace.json`，交给 `readMarketIndex`；本地索引目前不能使用相对图标（解析成 `file:` 后会被索引校验拒绝）。
  - `assertPackage`（`:346-393`）读 staging 的 `package.json`：`main` 必须等于 manifest 的 `entry`，`version` 必须等于 manifest 的 `version`；没有 `package.json` 时整段跳过。
  - `installExtensionFromMarket`（`:476-553`）读 `plugin.json`（`:493-496`），要求索引 version 等于 manifest.version（`:497-501`），permissions 一致（`:502-506`），entry 取 `manifest.entry ?? "index.js"`（`:507-509`），记录和结果都用 manifest.version（`:517`、`:544`）。
- `packages/core/src/host/plugins-fs.ts`
  - `looksLikeExtension`（`:36-51`）读 `PLUGIN_MANIFEST` 并 `JSON.parse`，要求 id/name/version/apiVersion。
  - `list()`（`:152-169`）只把“目录里存在 manifest 文件”的目录算作扩展（`:164-166`）。
  - 迁移逻辑把 `<home>/plugins` 里的扩展目录搬到 `<home>/extensions`，同时把 agent 插件包留在原处。
- `packages/core/src/plugins.ts`
  - `PLUGIN_MANIFEST = "plugin.json"`（`:31`）、`DEFAULT_PLUGIN_ENTRY = "index.js"`（`:37`）。
  - 注释明确扩展空间与 agent 插件包是两个空间；**`packages/resources/plugins` 的 agent 插件 manifest（`PLUGIN_MANIFESTS`、`.claude-plugin/plugin.json`）不在本次范围**。
- `packages/extensions/src/plugin.ts`
  - `readManifest`（`:61-66`）读 `plugin.json` 并 `parsePluginManifest`。
  - `discoverPlugins`（`:79-144`）用 `manifest.entry ?? "index.js"` 拼 import URL（`:91`），把 `manifest.name/version/description` 填进 `ExtensionManifest`（`:102-110`）。
  - `resolvePluginIcon`（`icons.ts:52-55`）只认 lucide 名，未知名回退 puzzle。
- `packages/core/handlers.ts:336`：`GET /hub/extensions/<id>` 直接 `JSON.parse` 返回 `plugin.json`。
- `packages/extensions/src/types.ts:220-237`：`ExtensionManifest.name/description` 是 `string`。
- 本地化消费方（已用 `rg "manifest\\.(name|description)"` 逐个确认）：
  - `apps/web/src/pages/extensions.tsx:46-51`（搜索 haystack）、`:89`/`:108`（卡片渲染）、`:214`（安装成功 toast）。
  - `apps/web/src/components/extension-detail-dialog.tsx:170`/`:198`（详情标题与描述）。
  - `packages/search/global-search/src/search.ts:222-252`（`searchExtensions`）。
  - `packages/search/global-search/src/index.ts:58-60`（provider 注册）。
- 市场行转换：`apps/web/src/lib/extension-market.ts:52-85` 的 `marketEntriesFor` 接收 `locale`，把索引的 `title/description` 提前解析成字符串（`:68`、`:73`）。
- 测试与示例：
  - `packages/core/__test__/extension-manifest.test.ts`、`extension-market-install.test.ts`、`extension-market-handler.test.ts`、`bridge.test.ts`。
  - `packages/extensions/__test__/plugins.test.ts`（`writePlugin` 写 `plugin.json`）。
  - `packages/resources/mcp/__test__/plugin.test.ts` 复制 `packages/extensions/examples/acme-mcp`，并覆盖写 `package.json`（`:77-79`）。
  - `apps/web/__test__/fixtures/demo.counter/plugin.json`、`apps/web/__test__/e2e-probe.ts:168`/`:193`（等待/检查 `plugin.json`）。
  - 示例：`packages/extensions/examples/hello/plugin.json`、`examples/acme-mcp/plugin.json`。
- 文档：`docs/extensions.md` 仍在描述 `plugin.json`、`entry` 与三处 version 一致规则；`docs/memory.md:1271-1289` 还记录着旧的三处一致规则。

### 市场仓：当前是一份未完成的迁移

- `plugins/demo.counter/plugin.json`（id `demo.counter`、version `1.0.0`、icon `sparkles`、entry `lib/index.js`、category `integration`、permissions `storage.self`）。
- `plugins/demo.other/plugin.json`（id `demo.other`、version `0.1.0`、icon `sparkles`、entry `lib/index.js`）。
- 两个插件都是完整 pnpm 包：`package.json`（`main: lib/index.js`）、`build.mjs`、`tsconfig.json`、`src/`、`lib/index.js`、`README.md`。
- 工作区有一份**未提交的草稿** `plugins/demo.counter/plugin.yaml`，内容实际是 Claude Code 的元数据（`id: Claude code`、description 是列表形式），不是 demo.counter 的清单；不能保留为最终内容。
- 未跟踪文件 `plugins/demo.counter/assets/icon.svg` 是 demo.counter 的图标；`icons/demo.counter.svg` 在工作区已被删除。
- `marketplace.json` 被改坏：只有一条 `claude.code`，缺 `author`，`source` 形状错误（`source: { source: "git-subdir", ... }` 且嵌在 plugin 里），版本写在 plugin 级；按 `readMarketIndex` 的规则不可用。
- 根 `package.json` 只有 `build: pnpm -r build`、`typecheck`；没有 YAML 解析依赖。
- `git remote -v` 为空，因此目前没有真实 HTTPS 仓库地址。
- 用户新增了 `icons/claudecode.svg`（Claude Code 品牌图标，`fill="#D97757"`），用作 `claude.code` 的图标。

### 主仓：claude-code 目前是内置扩展

- `packages/agents/claude-code/` 是完整的 agent 集成包：`extension.ts` 注册 skills places、prompts places、MCP provider、插件安装器、target descriptor 与英文文案；`index.ts` 用 `@lobehub/icons` 的品牌图标实例化它。
- 运行时没有外部包依赖：`@context-hub/*` 导入全是 `import type`（会被擦除），真正的运行时依赖只有 `@lobehub/icons` 的图标。
- `apps/web/src/lib/hub.ts:202` 把 `claudeCodeExtension` 直接放进 `createHubKernel` 的 extensions 列表；`apps/web/package.json` 依赖 `@context-hub/claude-code`。
- 测试在 `packages/agents/claude-code/__test__/`（installer、provider、registration），其中 registration 测试会组装真实 kernel。
- 市场仓需要有等价实现，且主仓不能再同时注册同一个 agent（skills place id `claude-code`、target id `hub.target.claude-code` 会冲突）。

### 主仓：市场源目前默认为空

- `packages/extensions/src/settings.ts:52` 的 `DEFAULT_SETTINGS.extensionMarketUrl = ""`，所以首次启动时市场是空的，用户必须手工输入地址。
- `apps/web/src/pages/extensions.tsx:164` 用 `useExtensionMarket(settings.extensionMarketUrl)` 在页面打开时读取索引；`apps/web/src/lib/preload.ts` 只预读五个资产库，不预读市场。
- 用户要求“初始化时拉取插件信息、没有插件代码，点安装时才 clone”：需要默认市场源 + 启动预读；实际的 clone 逻辑 `installExtensionFromMarket` 已经满足后半句。

### 图标在生成时内联，避免本地索引的 `file:` 问题

`readMarketIndex` 会把相对图标解析到索引 URL：远程 `https:` 索引没问题；本地索引会被解析成 `file:`，然后被 `icon()` 的 `protocol !== "https:"` 拒绝（`packages/core/src/extension-market.ts:143-163`）。如果索引里写 `plugins/<id>/assets/icon.svg`，直接把本地 checkout 当市场源会整份读取失败。

生成脚本因此在写 `marketplace.json` 时就把图标文件读出来、按扩展名判定 MIME、base64 内联成 `data:image/...;base64,`。索引校验本来就接受 data URL（上限 32 KiB），本地与远程读取走同一条路径，主仓不需要新增任何本地文件读取逻辑。安装后的扩展仍然从 `/hub/extensions/<id>/assets/icon.svg` 加载自己的图标，插件目录里的图标文件不会被删。

## 目标

1. `plugin.yaml` 成为扩展和市场插件的唯一清单；`plugin.json` 从扩展空间彻底移除。
2. `version`/`entry` 只有一个来源：`package.json` 的 `version`/`main`；`plugin.yaml` 重复声明时明确报错。
3. `name`/`description` 支持字符串或 locale 映射；内核保留本地化值，UI 与全局搜索按当前 locale 解析。
4. 市场仓用 `marketplace.yaml` + 每个插件的 `plugin.yaml`/`package.json` 生成 `marketplace.json`，生成结果确定、可重复。
5. 安装器校验索引 version 与 `package.json.version` 一致；入口取 `package.json.main`；permissions 仍与索引一致。
6. 保留现有市场索引校验格式、启用/停用/卸载语义和 agent 插件库的 `plugin.json` 规则不变。
7. 把 claude-code agent 集成移植为市场插件 `claude.code`，主仓不再内置它。
8. hub 首次启动就读取内置默认市场索引（只取元数据）；插件代码仍然只在点击安装时 clone。

## 非目标（不做）

- 不做 `plugin.json` → `plugin.yaml` 的自动迁移或回退；旧目录留在磁盘但不被识别。
- 不改 `packages/resources/plugins` 的 agent 插件 manifest 识别（`PLUGIN_MANIFESTS`、`.claude-plugin/plugin.json`、`.codex-plugin/plugin.json`）。
- 不改市场索引 JSON 的字段/校验（`format: 1`、`versions`、`source`、`localizedText`、data/HTTPS 图标上限）；图标内联只发生在市场仓的生成脚本里。
- 不引入第二套 YAML 解析器；统一用 `js-yaml` 的 `load` + `CORE_SCHEMA`。
- 不引入 npm/tarball 源、content hash、签名、权限强制或第三方沙箱。
- 不改变扩展启用/停用/卸载的语义，不把卸载改成删文件。
- 不把插件代码打进 hub 包；启动预读只拉市场索引，安装时才 clone。
- 移植后不保留主仓内置的 claude-code 注册，也不保留跨仓同步脚本：市场仓的 `plugins/claude.code` 是唯一来源。
- 不为 `plugin.yaml` 的 locale 映射增加“没有 en 就取第一个语言”的兜底；映射必须含 `en`。
- 不编辑归档计划、`.pen` 设计稿、`apps/desktop/release/**` 生成物。
- 不提交、不 push 任何仓库；验证用临时 git 仓库，不要求先提交市场仓的工作区改动。

## 关键设计

### 1. `plugin.yaml` 结构

```yaml
id: demo.counter                 # 必须等于目录名
name:                            # 字符串或 locale 映射；映射必须含 en
  en: Demo Counter
  zh-cn: 演示计数器
apiVersion: "^0.1"
description:                     # 字符串或 locale 映射
  en: Adds a counter to the header.
  zh-cn: 在标题栏里加一个计数器。
icon: assets/icon.svg            # lucide 名，或插件内相对图片路径
category: integration            # 可选
permissions: [storage.self]      # 可选
inject: [header]                 # 可选
provides: []                     # 可选
defaultEnabled: false            # 可选，只有 true 生效
author: Context Hub              # 可选；市场生成时缺省取 marketplace.yaml 的 author
```

规则：

- `id` 必须等于目录名；`name`、`apiVersion` 必需；`description` 缺省为 `""`。
- `version`、`entry` **禁止出现**：
  - `plugin manifest: "version" belongs in package.json`
  - `plugin manifest: "entry" belongs in package.json's "main"`
- `locked` 仍拒绝（安装的插件不能自己锁死）。
- `permissions`/`category` 仍按现有枚举校验；`inject`/`provides` 仍按现状读取数组（本次不收紧元素类型）；`defaultEnabled` 只认 `true`。
- 未知字段仍忽略。

### 2. `package.json` 是 version/entry 的唯一来源

- `version`：必需、非空字符串。市场安装器要求它存在；loader 对没有 `package.json` 或没有 `version` 的目录回退 `0.0.0`。
- `main`：可选、非空字符串；缺省 `index.js`。市场安装器用它找入口；loader 也用它拼 import URL。
- `package.json` 不是合法 JSON 或字段类型错误 → 该插件报告 `problem`，不加载；市场安装直接失败。
- 市场安装要求 staging 里存在 `package.json`；没有就报 `plugin "id": package.json is missing`。已安装的旧目录没有 `package.json` 仍可加载（`0.0.0` + `index.js`），但不能再从市场安装。

### 3. 本地化 `name` / `description`

- 把 `LocalizedText`、`localized()`、`isLocaleId()` 移到 `packages/core/src/extension-manifest.ts`：
  ```ts
  export type LocalizedText = string | Record<string, string>
  export function isLocaleId(value: string): boolean
  export function localized(value: LocalizedText, locale: string): string
  ```
- `packages/core/src/extension-market.ts` 改为从 `extension-manifest.ts` 导入并**重新导出** `LocalizedText`/`localized`，现有 `@context-hub/core/extension-market` 的导入不用改；私有 `localizedText()` 改用 `isLocaleId()`，索引错误消息保持不变。
- `packages/extensions/src/types.ts`：
  - `ExtensionManifest.name: LocalizedText`、`description: LocalizedText`。
  - 重新导出 `localized`、`LocalizedText`，UI 与搜索从 `@context-hub/extensions` 使用同一个函数/类型。
- `packages/extensions/src/plugin.ts` 不再把 `name`/`description` 压成字符串；`manifest.name`/`description` 原样进入 `ExtensionManifest`。
- `localized()` 的解析顺序保持现有实现：精确 locale → 语言前缀 → `en`。映射必须含 `en`，否则解析结果为空串，因此 manifest/索引校验都要求 `en`。
- UI 消费方按 `useI18n().state.active` 解析：
  - `apps/web/src/pages/extensions.tsx`：`matches()` 接收 locale；卡片与 toast 用 `localized()`。
  - `apps/web/src/components/extension-detail-dialog.tsx`：标题与描述用 `localized()`。
  - `packages/search/global-search/src/search.ts`：`searchExtensions(entries, query, locale)` 每条 entry 只解析一次 `name`/`description`，同一个值用于匹配和结果行；`extensionsContribution` 接收 `locale: () => string`，注册处传 `() => ctx.i18n.state.active`。
- `apps/web/src/lib/extension-market.ts` 的 `marketEntriesFor` 不再接收 `locale`，直接把索引的 `title`/`description`（可为映射）放进 `manifest.name`/`description`，由页面统一解析。

### 4. icon

- `plugin.yaml` 的 `icon` 两种形式：
  - 已知 lucide 名（`PLUGIN_ICONS` 的 key）：内核直接渲染组件。
  - 插件内相对图片路径（含 `/` 或以 `.svg/.png/.jpg/.jpeg/.webp` 结尾）：内核渲染
    `<img src={`${route}/${encodeURIComponent(id)}/${encodedPath}`} alt="" aria-hidden />`。
  - 其他（未知 lucide 名、绝对 URL、`data:`）：回退 puzzle。
- `plugin.yaml` 里的相对路径保持 `assets/icon.svg`；安装后的扩展目录保留 `assets/`。
- 市场索引生成时读取该文件并写成 `data:image/...;base64,`（解码后 ≤32 KiB）；生成脚本拒绝 lucide 名、缺失文件、越出插件目录的路径和非图片扩展名。
- 主仓不改 `readLocalIndex`；本地与远程索引都按现有 `readMarketIndex` 读取 data URL。

### 5. 市场仓结构

```text
marketplace.yaml              title/description/repository/author（根信息）
scripts/build-marketplace.mjs 扫描 plugins/*，读 plugin.yaml + package.json，写 marketplace.json
marketplace.json              生成物；提交但禁止手改
plugins/<id>/
  package.json                version / main，唯一来源
  plugin.yaml                 id/name/apiVersion/description/icon/...
  assets/icon.svg             图标
  lib/index.js                提交的构建产物
  README.md
```

`marketplace.yaml`：

```yaml
title:
  en: Context Hub Extensions
  zh-cn: Context Hub 扩展
description:
  en: First-party extensions for Context Hub.
  zh-cn: Context Hub 的第一方扩展。
repository: https://github.com/example/context-hub-extensions   # 占位；待用户确认真实地址，本地验收用 MARKETPLACE_REPOSITORY 覆盖
author: Context Hub
```

生成规则：

- 顶层：`format: 1`、`title`、可选 `description`、`plugins`。
- 每个插件：
  - `id` = 目录名 = `plugin.yaml.id`
  - `title` = `plugin.yaml.name`（字符串或映射原样写）
  - `description` = `plugin.yaml.description`（字符串或映射原样写）
  - `icon` = 插件图标内联的 `data:image/...;base64,`（插件必须声明插件内相对图片路径；lucide 名、绝对 URL、越界路径都报错）
  - `author` = `plugin.yaml.author ?? marketplace.yaml.author`
  - 可选 `category`、`permissions`
  - `versions` 只有一项：`version` = `package.json.version`，`apiVersion` = `plugin.yaml.apiVersion`，`source` = `{ type: "git", url: repository, path: "plugins/<id>" }`
- 排序：按插件目录名排序；对象 key 顺序固定；不写时间戳；`JSON.stringify(..., null, 2) + "\n"`。
- 校验失败直接抛错，不写半份索引：
  - `plugin.json` 仍存在 → 报错要求删除
  - `plugin.yaml` 缺失/不是对象/有 `version`/`entry`/id 不等于目录名
  - `package.json` 缺失/version 非法/main 非法/入口文件不存在
  - `name`/`description` 缺失、为空、映射缺 `en` 或 locale id 非法
  - `author` 在 `plugin.yaml` 与 `marketplace.yaml` 里都没有
  - `icon` 是 lucide 名、绝对 URL、`data:`、越出插件目录、文件不存在或扩展名不支持
  - `category`/`permissions` 不在核心枚举内
  - `repository` 既不是 HTTPS URL 也不是绝对本地路径
- 构建脚本的 category/permissions 枚举是从核心复制的一份，脚本里加注释说明必须与 `packages/core/src/extension-manifest.ts` 同步。

### 6. 安装器与 loader 的新行为

安装器（`installExtensionFromMarket`）：

1. clone 默认分支，复制 `source.path` 到 staging。
2. `parsePluginManifestYaml(await read(staging/plugin.yaml), id)`。
3. 要求 `staging/package.json` 存在，`parsePluginPackage(JSON.parse(...), id)`。
4. 索引 `version` 必须等于 `package.json.version`，错误消息点名两边。
5. permissions 仍必须与索引一致。
6. `assertEntry(staging, pkg.entry)`。
7. 记录与结果用 `pkg.version`。

loader（`discoverPlugins`）：

1. 读 `plugin.yaml`，`parsePluginManifestYaml`。
2. 读 `package.json`；缺失 → `{ version: "0.0.0", entry: "index.js" }`；存在则 `readPluginPackage`（version 缺失回退 `0.0.0`，main 缺失回退 `index.js`）。
3. 合并成 `PluginManifestFile`；入口用 `entry`。
4. `manifest.name`/`description` 保留 `LocalizedText`；icon 用上面的图片/lucide 解析。

### 7. 兼容性

- 已安装的旧 `plugin.json` 扩展：`list()` 只看 `plugin.yaml`，因此**不再出现在扩展目录**；文件留在磁盘，不自动删除，也不自动转换。用户需要从市场重装或手工迁移。
- 旧市场索引中指向 `plugin.json` 的插件：安装时读不到 `plugin.yaml`，报错并保持旧版本不变。
- 这是一次 beta 阶段的破坏性格式迁移，`docs/extensions.md` 必须写明。

### 8. claude.code 移植

市场仓新增完整包 `plugins/claude.code/`：

```text
package.json     name=claude.code, version=0.1.0, main=lib/index.js
build.mjs        与 demo.counter 相同（React 四个名字 external）
tsconfig.json
plugin.yaml      id=claude.code, category=agent, inject=[skills,prompts,mcp,plugins,targets,locales]
src/index.tsx    品牌图标组件 + apply(scope) 注册逻辑
src/installer.ts 从 packages/agents/claude-code/src/installer.ts 复制
src/provider.ts  从 packages/agents/claude-code/src/provider.ts 复制
src/locations.ts 从 packages/agents/claude-code/src/locations.ts 复制
src/messages.ts  从 packages/agents/claude-code/src/messages.ts 复制
assets/icon.svg  从 icons/claudecode.svg 移入
lib/index.js     提交的构建产物
README.md
```

移植规则：

- 行为保持不变：两个 skills place、两个 prompts place（global 的 `CLAUDE.md` 文档）、Claude Code 的 MCP 读写、`claude plugin` 安装器、target descriptor、`claudeCode.*` 英文文案。
- `extension.ts` 的 `claudeCodeModuleWith` 包装去掉：`plugin.yaml` 已提供 manifest，`src/index.tsx` 直接导出 `apply(scope)`。
- `@context-hub/*` 的 `import type` 替换为插件内 `src/contracts.ts` 的最小结构类型（只声明实际用到的成员），或在使用处退化为 `any`；不得新增运行时依赖。
- 品牌图标不再用 `@lobehub/icons`：用 `icons/claudecode.svg` 的 path 与 `fill="#D97757"` 写成一个接收 `className` / `aria-hidden` 的 React 组件，供 places、targets 与目录行共用。
- `plugin.yaml`：
  ```yaml
  id: claude.code
  name: { en: Claude Code, zh-cn: Claude Code }
  apiVersion: "^0.1"
  description:
    en: Deliver skills, memory and MCP servers to Claude Code.
    zh-cn: 将技能、记忆和 MCP 服务器交付给 Claude Code。
  icon: assets/icon.svg
  category: agent
  permissions: [assets.read, assets.write, filesystem]
  inject: [skills, prompts, mcp, plugins, targets, locales]
  author: Context Hub
  ```
- `package.json` 的 version 用 `0.1.0`（与原内置 manifest 的 version 一致），`main: lib/index.js`。
- 主仓删除内置注册：
  - `apps/web/src/lib/hub.ts` 去掉 import 与 `claudeCodeExtension`。
  - `apps/web/package.json` 去掉 `@context-hub/claude-code`。
  - 删除 `packages/agents/claude-code/`，并从根 `vitest.config.ts` 移除它的 project。
  - `pnpm install` 更新锁文件；确认 `@lobehub/icons`/`@lobehub/ui`/`antd` 没有其他使用方后随包一起消失。
- 覆盖率说明：registration/provider/installer 三份测试留在主仓会失去被测源码，移植时不做跨仓测试搬运；验收改为真实安装后的注册检查（见阶段 6）。这是本次移植明确接受的覆盖损失，汇报时必须写明。

### 9. 内置市场与启动预读

- `packages/extensions/src/settings.ts` 新增并导出：
  ```ts
  export const OFFICIAL_MARKET_URL =
    "https://raw.githubusercontent.com/<owner>/context-hub-extensions/main/marketplace.json"
  ```
  并把它作为 `DEFAULT_SETTINGS.extensionMarketUrl`。已存储的 `""` 仍表示用户主动清空，不会被默认值覆盖。
- `apps/web/src/lib/preload.ts` 增加 `preloadMarket(kernel)`：
  - 读 `kernel.ctx.settings.state.extensionMarketUrl`；
  - 为空则不做；
  - 否则调用 `createRemoteExtensionMarket().list(url)`，不 await，失败吞掉（页面自己会显示失败原因）。
  - 这一步只拉索引元数据，不 clone 任何插件代码。
- `startHub()` 在 `preloadCatalogs(kernel)` 之后调用 `preloadMarket(kernel)`。
- 市场源输入框保持不变：用户仍可改成别的索引或清空。默认值只在“没有存储值”时生效。
- 真实 URL 见开放问题；本地验收用 `MARKETPLACE_REPOSITORY` 生成的临时索引地址，或直接改设置里的市场源。

## 阶段

### 阶段 1：本地化扩展名称与描述

**目标**：把 `name`/`description` 的类型与解析链路改成 `LocalizedText`，行为保持不变（此时 loader 仍读 `plugin.json`，字符串仍合法）。

**改动文件**

- `packages/core/src/extension-manifest.ts`
  - 新增 `LocalizedText`、`localized()`、`isLocaleId()`。
  - `PluginManifestFile.name` / `description` 改为 `LocalizedText`（旧 JSON 解析器仍返回字符串，类型合法）。
- `packages/core/src/extension-market.ts`
  - 删除本地的 `LocalizedText` 定义与 `localized()` 实现，改为从 `extension-manifest.ts` 导入并重新导出。
  - 私有 `localizedText()` 改用 `isLocaleId()`；索引错误消息不变。
- `packages/extensions/src/types.ts`
  - `ExtensionManifest.name` / `description` 改为 `LocalizedText`。
  - 重新导出 `localized`、`LocalizedText`。
- `apps/web/src/lib/extension-market.ts`
  - `marketEntriesFor(installed, index)` 去掉 `locale` 参数；`manifest.name = plugin.title`、`description = plugin.description`。
- `apps/web/src/pages/extensions.tsx`
  - `matches(entry, query, locale)` 用 `localized()` 拼 haystack。
  - `ExtensionRow` 用 `useI18n().state.active` 解析 name/description 再交给 `Highlighted`。
  - `ExtensionsPage` 的 `matches(...)` 传 `i18n.active`；安装 toast 用 `localized(item.view.manifest.name, i18n.active)`。
  - `marketEntriesFor` 调用去掉 locale。
- `apps/web/src/components/extension-detail-dialog.tsx`
  - `ExtensionDetailBody` 取 `useI18n().state.active`，标题/描述用 `localized()`。
- `packages/search/global-search/src/search.ts`
  - `extensionsContribution(entries, locale)`；`searchExtensions(entries, query, locale)`。
  - 每条 entry 只解析一次 name/description，匹配与结果行复用同一个值。
- `packages/search/global-search/src/index.ts`
  - 注册处传 `() => ctx.i18n.state.active`。
- 测试：
  - `apps/web/__test__/extension-market.test.ts`：`marketEntriesFor` 调用去掉 locale；断言保留映射并用 `localized()` 解析。
  - `packages/search/global-search/__test__/search.test.ts`：所有 `searchExtensions` 调用补 locale；新增一条中英映射的匹配/标题测试。

**验收**

```bash
cd /d/work-space/dsh-context-hub
pnpm typecheck
pnpm exec vitest run --project core --project extensions --project mcp --project global-search --project web
```

- 通过即表示：`LocalizedText` 只有一份定义；所有 `manifest.name/description` 消费方都按 locale 解析；旧 `plugin.json` loader 仍然工作。

### 阶段 2：切换 plugin.yaml 清单与安装链路

**目标**：`plugin.yaml` + `package.json` 成为唯一格式；安装器、loader、路由、示例与测试全部切换；图片 icon 生效。

**改动文件**

- `packages/core/package.json`
  - 增加 `"dependencies": { "js-yaml": "^5.5.0" }`。
- `pnpm-lock.yaml`
  - 由 Stage 2 的 `pnpm install` 更新（core 新增 js-yaml importer）。
- `packages/core/src/extension-manifest.ts`
  - 引入 `load`、`CORE_SCHEMA`。
  - 新增类型：
    ```ts
    export interface PluginManifestSource {
      id: string
      name: LocalizedText
      apiVersion: string
      description: LocalizedText
      icon?: string
      category?: ExtensionCategoryId
      permissions?: ExtensionPermission[]
      inject?: string[]
      provides?: string[]
      defaultEnabled: boolean
      author?: string
    }
    export interface PluginPackageFile { version: string; entry: string }
    export interface PluginManifestFile extends PluginManifestSource, PluginPackageFile {}
    ```
  - `parsePluginManifest(value, id): PluginManifestSource`：纯值校验；拒绝 `version`/`entry`/`locked`；`name`/`description` 用本地化校验（映射必须含 `en`）。
  - `parsePluginManifestYaml(text, id): PluginManifestSource`：`load(text, { schema: CORE_SCHEMA })`，YAML 错误包成 `plugin manifest: not valid YAML: ...`。
  - `parsePluginPackage(value, id): PluginPackageFile`：严格；version 必需，main 缺省 `index.js`。
  - `readPluginPackage(value, id): PluginPackageFile`：宽松；version 缺失 → `0.0.0`，main 缺失 → `index.js`。
  - 删除旧的 JSON 专用措辞；`parsePluginManifest` 仍是纯值入口，但不再接受 version/entry。
- `packages/core/src/plugins.ts`
  - `PLUGIN_MANIFEST = "plugin.yaml"`；更新文件头注释（扩展空间读 `plugin.yaml`，agent 插件包读 `plugin.json`）。
- `packages/core/src/host/extension-market.ts`
  - 删除 `assertPackage`。
  - `installExtensionFromMarket` 按“关键设计 6”的顺序读 `plugin.yaml`、`package.json`，校验 version/permissions/entry，记录与结果用 package version。
- `packages/core/src/host/plugins-fs.ts`
  - `looksLikeExtension` 改为 `load` YAML，检查 `id === 目录名`、name 存在（字符串或对象）、apiVersion 是字符串；不再要求 version。
  - `list()` 继续用 `PLUGIN_MANIFEST`（现在是 `plugin.yaml`）。
- `packages/core/handlers.ts`
  - `GET /hub/extensions/<id>` 改为 `parsePluginManifestYaml(await store.read(id, PLUGIN_MANIFEST), id)` 并返回解析后的对象；不再包含 `version`/`entry`。
- `packages/extensions/src/plugin.ts`
  - `readManifest`：读 `PLUGIN_MANIFEST`（`plugin.yaml`）+ `package.json`；缺失 package 用 `0.0.0`/`index.js`；合并成 `PluginManifestFile`。
  - import `PLUGIN_MANIFEST`、`DEFAULT_PLUGIN_ENTRY` 从 `@context-hub/core/plugins`。
  - 新增 `pluginIcon(name, route, id)`：已知 lucide 名 → 组件；相对图片路径 → `<img>`；其他 → fallback。
  - `manifest.name`/`description` 原样传递；icon 用 `pluginIcon`。
- 示例与 fixture：
  - `packages/extensions/examples/hello/plugin.json` → `plugin.yaml`；`plugin.json` 删除；`package.json` 补 `version: "1.0.0"`、`main: "index.js"`。
  - `packages/extensions/examples/acme-mcp/plugin.json` → `plugin.yaml`；新增 `package.json`（`type: module`、`version: "1.0.0"`、`main: "index.js"`）；`index.js` 注释里的 `plugin.json` 改为 `plugin.yaml`。
  - `apps/web/__test__/fixtures/demo.counter/plugin.json` → `plugin.yaml`；新增 `package.json`（`type: module`、`version: "1.0.0"`、`main: "index.js"`）。
  - `apps/web/__test__/e2e-probe.ts`：等待/检查的文件名改为 `plugin.yaml`。
- 测试：
  - `packages/core/__test__/extension-manifest.test.ts`：重写为 YAML + package 用例。
  - `packages/core/__test__/extension-market-install.test.ts`：fixture 写 `plugin.yaml` + `package.json`；覆盖 version 不一致、缺 package.json、main 非字符串、入口缺失、permissions 不一致、更新保留启用值。
  - `packages/core/__test__/extension-market-handler.test.ts`：fixture 写 `plugin.yaml` + `package.json`。
  - `packages/core/__test__/bridge.test.ts`：fixture 写 `plugin.yaml`（含 apiVersion）；manifest 路由断言 `{ id }`；路径穿越断言改用 `plugin.yaml`。
  - `packages/extensions/__test__/plugins.test.ts`：`writePlugin` 写 `plugin.yaml` + `package.json`；`acme.pack` 继续只带 `plugin.json` 以证明不会被迁移；新增 version 回退 `0.0.0`、package main 入口、图片 icon 渲染 `<img>`、本地化 name/description 用例。
  - `packages/resources/mcp/__test__/plugin.test.ts`：示例已有 `package.json` 后删除测试里的覆盖写；断言 `manifest.version` 为 `1.0.0`。

**验收**

```bash
cd /d/work-space/dsh-context-hub
pnpm install          # 如沙箱挡网络，按 docs/memory.md 关闭沙箱
pnpm typecheck
pnpm exec vitest run --project core --project extensions --project mcp --project web
rg -n "plugin\\.json" packages/core packages/extensions packages/resources/mcp apps/web/__test__ -g '!apps/desktop/release/**'
rg -n "PLUGIN_MANIFEST|parsePluginManifest" packages/core packages/extensions
```

- `rg` 的预期：扩展空间内不再有 `plugin.json` 的读取/写入；`packages/resources/plugins` 的 agent manifest 仍保留自己的 `PLUGIN_MANIFESTS`；归档计划/设计稿不算。
- 通过即表示主仓代码已完全切到新格式；市场仓此时仍是旧格式，阶段 4 修复。

### 阶段 3：更新主仓文档与记忆

**目标**：文档与新行为一致，并把这次破坏性迁移写清。

**改动文件**

- `docs/extensions.md`
  - 包结构：`plugin.yaml` + `package.json` + `lib/` + `assets/`。
  - `plugin.yaml` 字段表与示例（本地化 name/description、无 version/entry）。
  - `package.json.version` / `main` 是唯一来源；市场安装要求 package.json。
  - 本地化解析顺序（精确 → 语言 → en；映射必须含 en）。
  - icon：lucide 名或相对图片路径；安装后 `<img src="/hub/extensions/<id>/<path>">`；市场生成脚本把相对图片内联为 data URL。市场插件必须提供相对图片路径（lucide 名只适用于已安装扩展，生成脚本会报错提示）。
  - 市场索引：由市场仓 `pnpm build` 生成；`marketplace.json` 禁止手改；version 来自 package.json；`source` 来自 `marketplace.yaml.repository`。
  - 安装失败清单：plugin.yaml 解析失败、package.json 缺失、version 不一致、permissions 不一致、入口缺失。
  - 破坏性迁移：旧 `plugin.json` 扩展不再被识别，文件不自动删除，需重装/手工迁移。
  - 本地开发与 “Try it”：先在市场仓 `pnpm build`，再把扩展页的市场源指向市场仓目录。
- `docs/memory.md`
  - 更新 2026-10-19 “远程插件工程”条目：`plugin.yaml`、package.json version/main、生成式 `marketplace.json`、生成时图标 data URL 内联、`lib/` 提交与两次构建哈希一致。

**验收**

```bash
cd /d/work-space/dsh-context-hub
rg -n "plugin\\.json" docs/extensions.md
rg -n "entry|version" docs/extensions.md
```

- `docs/extensions.md` 里只允许在“破坏性迁移”段出现 `plugin.json`；其余“当前格式”描述必须指向 `plugin.yaml` / `package.json`。
- 文档中的命令逐条可复制执行。

### 阶段 4：迁移市场仓格式

**目标**：市场仓只保留 `plugin.yaml` + `package.json`，`marketplace.json` 由脚本生成。

**改动文件**

- 删除 `plugins/demo.counter/plugin.json`、`plugins/demo.other/plugin.json`。
- 重写 `plugins/demo.counter/plugin.yaml`（当前草稿是 Claude Code 元数据，不能保留）：
  ```yaml
  id: demo.counter
  name:
    en: Demo Counter
    zh-cn: 演示计数器
  apiVersion: "^0.1"
  description:
    en: Adds a counter to the header.
    zh-cn: 在标题栏里加一个计数器。
  icon: assets/icon.svg
  category: integration
  permissions: [storage.self]
  inject: [header]
  ```
- 新建 `plugins/demo.other/plugin.yaml`：
  ```yaml
  id: demo.other
  name:
    en: Demo Other
    zh-cn: 演示其他
  apiVersion: "^0.1"
  description:
    en: A second extension for trying the market.
    zh-cn: 用于试用市场的第二个扩展。
  icon: assets/icon.svg
  ```
- 保留 `plugins/demo.counter/assets/icon.svg`（未跟踪的现有图标）。
- 新增 `plugins/demo.other/assets/icon.svg`（建议 64×64 纯色块 + 圆点；具体图形见开放问题）。
- 删除 `icons/demo.counter.svg`（工作区已删除），并移除空的 `icons/` 目录；根图标目录退役。
- 新建 `marketplace.yaml`（结构见“关键设计 5”）。
- 新建 `scripts/build-marketplace.mjs`：
  - 读 `marketplace.yaml`、`plugins/*/plugin.yaml`、`plugins/*/package.json`。
  - 校验与生成规则见“关键设计 5”。
  - 支持两个仅用于验证/CI 的环境变量：
    - `MARKETPLACE_REPOSITORY`：覆盖 `marketplace.yaml.repository`
    - `MARKETPLACE_OUT`：覆盖输出路径（默认 `<repo>/marketplace.json`）
- 修改根 `package.json`：
  - `"build": "pnpm -r build && pnpm build:marketplace"`
  - `"build:marketplace": "node scripts/build-marketplace.mjs"`
  - `devDependencies` 增加 `"js-yaml": "^5.5.0"`。
- 修改 `plugins/demo.counter/package.json`、`plugins/demo.other/package.json`：
  - `files` 把 `plugin.json` 换成 `plugin.yaml`，补 `assets`。
- 更新 `README.md`、`plugins/demo.counter/README.md`、`plugins/demo.other/README.md`：
  - 布局、`plugin.yaml`、version 只在 package.json、`pnpm build` 生成索引、不要手改 `marketplace.json`、`repository` 是占位 HTTPS 地址（本地验收用 `MARKETPLACE_REPOSITORY` 覆盖）。
- `pnpm install` 更新 `pnpm-lock.yaml`。
- 运行 `pnpm build` 重新生成 `marketplace.json`。

**生成的 `marketplace.json` 预期**

- `format: 1`；`title`/`description` 来自 `marketplace.yaml`。
- `plugins` 按 id 排序：`demo.counter`、`demo.other`。
- `demo.counter`：`version: "1.0.0"`、`apiVersion: "^0.1"`、`source.path: "plugins/demo.counter"`、`icon: "data:image/svg+xml;base64,..."`、`author: "Context Hub"`、`category: "integration"`、`permissions: ["storage.self"]`。
- `demo.other`：`version: "0.1.0"`、`apiVersion: "^0.1"`、`source.path: "plugins/demo.other"`、`icon: "data:image/svg+xml;base64,..."`、`author: "Context Hub"`；无 category/permissions。
- `source.url` 等于 `marketplace.yaml.repository`（占位 HTTPS；本地验收用 `MARKETPLACE_REPOSITORY` 覆盖）。

**验收**

```bash
cd /d/work-space/context-hub-extensions
pnpm install
pnpm typecheck
pnpm build
sha256sum marketplace.json plugins/*/lib/index.js > /tmp/market-1.sha
pnpm build
sha256sum marketplace.json plugins/*/lib/index.js > /tmp/market-2.sha
diff /tmp/market-1.sha /tmp/market-2.sha

node -e "const i=JSON.parse(require('fs').readFileSync('marketplace.json','utf8')); console.log(i.format, i.plugins.map(p=>p.id+'@'+p.versions[0].version+' '+p.icon).join('\n'))"
rg -n "plugin\\.json" plugins README.md marketplace.yaml scripts
git status --short
```

- 两次构建的 `marketplace.json` 与 `lib/index.js` 哈希完全一致。
- `rg` 无 `plugin.json` 命中（插件 README/脚本/清单都不再引用旧格式）。
- `git status --short` 只包含本次迁移的预期文件：删除两个 `plugin.json`、删除 `icons/demo.counter.svg`、修改 `marketplace.json`/`pnpm-lock.yaml`/根 `package.json`/两个插件 `package.json`/README、新增 `marketplace.yaml`/`scripts/build-marketplace.mjs`/两个 `plugin.yaml`/demo.other 图标。

### 阶段 5：移植 claude.code 并启用内置市场

**目标**：市场仓出现 `claude.code`；hub 首次启动就读取默认市场索引；安装前没有任何插件代码；主仓不再内置 claude-code 集成。

**市场仓**

- 按“关键设计 8”新建 `plugins/claude.code/` 完整包（package.json、build.mjs、tsconfig.json、plugin.yaml、src、assets、lib、README）。
- 从 `packages/agents/claude-code/src/` 复制 `installer.ts`、`provider.ts`、`locations.ts`、`messages.ts`；把 `@context-hub/*` 的类型导入替换成插件内最小接口或 `any`。
- 新建 `src/index.tsx`：品牌图标组件 + `apply(scope)`，行为与 `extension.ts` 的 `apply` 一致。
- `assets/icon.svg` 从 `icons/claudecode.svg` 移入；根 `icons/` 目录随最后一个文件移走而删除。
- 运行 `pnpm build`，确认 `plugins/claude.code/lib/index.js` 生成、`marketplace.json` 多出 `claude.code`，且 `versions[0].version === "0.1.0"`。

**主仓**

- `packages/extensions/src/settings.ts`：新增 `OFFICIAL_MARKET_URL`，`DEFAULT_SETTINGS.extensionMarketUrl` 改用它；更新 `packages/extensions/__test__/settings.test.ts` 中写死 `""` 的默认值断言（用户主动存储的 `""` 仍保持为空）。
- `apps/web/src/lib/preload.ts`：新增 `preloadMarket(kernel)`；`apps/web/src/lib/hub.ts` 在 `preloadCatalogs` 后调用它。
- `apps/web/src/lib/hub.ts`：删除 `claudeCodeExtension` import 与数组项。
- `apps/web/package.json`：删除 `@context-hub/claude-code`。
- 删除 `packages/agents/claude-code/`；从根 `vitest.config.ts` 删除该 project。
- `pnpm install` 更新锁文件；`rg -n "@lobehub|antd" packages apps --glob 'package.json'` 确认没有其他使用方。
- `docs/extensions.md` 补充：市场默认源、启动只拉索引、安装才 clone、claude.code 由市场安装。

**验收**

```bash
cd /d/work-space/context-hub-extensions
pnpm build
node -e "const i=JSON.parse(require('fs').readFileSync('marketplace.json','utf8')); const p=i.plugins.find(x=>x.id==='claude.code'); console.log(p.versions[0].version, p.category, p.inject)"

cd /d/work-space/dsh-context-hub
pnpm install
pnpm typecheck
pnpm exec vitest run --project core --project extensions --project mcp --project global-search --project web
rg -n "claudeCodeExtension|@context-hub/claude-code" apps packages
```

- 市场索引里有 `claude.code@0.1.0`、`category=agent`、`inject` 六项。
- 主仓没有 `claudeCodeExtension` 或 `@context-hub/claude-code` 的残留引用。
- 全新隔离 home 启动时，Extensions 页的默认市场源非空，索引读取发生在启动预读（可用宿主请求日志或网络面板确认），`<home>/extensions` 仍为空。
- 安装 `claude.code` 后：`<home>/extensions/claude.code/plugin.yaml` 与 `lib/index.js` 存在；扩展启用；侧栏/技能/提示词/MCP/插件页出现 Claude Code 的位置；未安装时这些位置不存在（证明内置注册已移除）。

### 阶段 6：验证本地市场安装

**目标**：用真实生成的索引、真实 git clone、隔离 hub home 跑一次 list → install → remove；可选再跑一次 CDP 浏览器探针。

**前置**

```bash
cd /d/work-space/dsh-context-hub
pnpm --filter web build
```

**6.1 宿主安装流程（必需，低成本）**

不提交市场仓，用临时 git 仓库复现默认分支：

```bash
# 1. 从工作区复制一份临时市场仓并提交
MARKET_TMP="$(mktemp -d)"
(cd /d/work-space/context-hub-extensions && \
  tar --exclude=node_modules --exclude=.git -cf - . | (cd "$MARKET_TMP" && tar -xf -))
cd "$MARKET_TMP"
git init -q
git add -A
git -c user.name=Test -c user.email=test@example.test commit -qm "market fixture"
MARKET_SRC="$(cygpath -m "$MARKET_TMP")"

# 2. 用临时仓库地址生成索引，不覆盖真实 marketplace.json
cd /d/work-space/context-hub-extensions
MARKETPLACE_REPOSITORY="$MARKET_SRC" \
MARKETPLACE_OUT="$(cygpath -m "$MARKET_TMP/marketplace.json")" \
  node scripts/build-marketplace.mjs

# 3. 隔离 hub home + 真实 handler
cd /d/work-space/dsh-context-hub
HUB_TMP="$(mktemp -d)"
HUB_HOME="$(cygpath -w "$HUB_TMP")"
node apps/web/__test__/e2e-server.ts --home "$HUB_HOME" --port 5293 &
SERVER_PID=$!

# 4. list：断言三个插件都在，图标已是 data URL
curl -s -X POST http://127.0.0.1:5293/hub/extension-market \
  -H 'content-type: application/json' \
  -d "{\"action\":\"list\",\"url\":\"$MARKET_SRC\"}"

# 5. install demo.other
curl -s -X POST http://127.0.0.1:5293/hub/extension-market \
  -H 'content-type: application/json' \
  -d "{\"action\":\"install\",\"url\":\"$MARKET_SRC\",\"id\":\"demo.other\",\"version\":\"0.1.0\"}"

test -f "$HUB_TMP/extensions/demo.other/plugin.yaml"
test -f "$HUB_TMP/extensions/demo.other/package.json"
grep -q '"demo.other"' "$HUB_TMP/state/extensions.json"
grep -q "\"version\": \"0.1.0\"" "$HUB_TMP/extensions/index.json"

# 5b. install claude.code（真实市场插件）
curl -s -X POST http://127.0.0.1:5293/hub/extension-market \
  -H 'content-type: application/json' \
  -d "{\"action\":\"install\",\"url\":\"$MARKET_SRC\",\"id\":\"claude.code\",\"version\":\"0.1.0\"}"

test -f "$HUB_TMP/extensions/claude.code/plugin.yaml"
test -f "$HUB_TMP/extensions/claude.code/package.json"
test -f "$HUB_TMP/extensions/claude.code/lib/index.js"
grep -q '"claude.code"' "$HUB_TMP/state/extensions.json"
grep -q "\"version\": \"0.1.0\"" "$HUB_TMP/extensions/index.json"

# 6. remove both
curl -s -X POST http://127.0.0.1:5293/hub/extension-market \
  -H 'content-type: application/json' \
  -d '{"action":"remove","id":"demo.other"}'
test ! -e "$HUB_TMP/extensions/demo.other"
curl -s -X POST http://127.0.0.1:5293/hub/extension-market \
  -H 'content-type: application/json' \
  -d '{"action":"remove","id":"claude.code"}'
test ! -e "$HUB_TMP/extensions/claude.code"

kill "$SERVER_PID"
wait "$SERVER_PID" 2>/dev/null || true
rm -rf "$HUB_TMP" "$MARKET_TMP"
```

判据：

- `list` 返回的 `demo.counter` / `demo.other` / `claude.code` 的 `icon` 以 `data:image/` 开头（证明生成时图标已内联）。
- 安装后的 `plugin.yaml` 不含 `version`/`entry`；`package.json` 的 version 是 `0.1.0`、main 是 `lib/index.js`。
- `claude.code` 安装后 `plugin.yaml`、`package.json`、`lib/index.js` 都存在；`extensions/index.json` 记录的 version 是 `0.1.0`；`state/extensions.json` 首次安装写 `true`。
- `remove` 后两个目录和 state key 都消失。

**6.2 浏览器 CDP 探针（可选，验证 loader/UI）**

```bash
cd /d/work-space/dsh-context-hub
pnpm --filter web build
HUB_TMP="$(mktemp -d)"
HUB_HOME="$(cygpath -w "$HUB_TMP")"
mkdir -p "$HUB_TMP/extensions" "$HUB_TMP/state"
cp -r apps/web/__test__/fixtures/demo.counter "$HUB_TMP/extensions/demo.counter"
printf '{"demo.counter":true}\n' > "$HUB_TMP/state/extensions.json"
node apps/web/__test__/e2e-server.ts --home "$HUB_HOME" --port 5293 &
SERVER_PID=$!

EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
"$EDGE" --headless=new --disable-gpu --remote-debugging-port=9333 \
  --user-data-dir="$(cygpath -w "$HUB_TMP/profile")" --no-first-run about:blank &
EDGE_PID=$!

HUB_HOME="$HUB_HOME" \
CDP=http://127.0.0.1:9333 \
PAGE=http://127.0.0.1:5293/extensions \
MARKET_SOURCE="$(cygpath -m "$MARKET_TMP")" \
  node apps/web/__test__/e2e-probe.ts

kill "$EDGE_PID" 2>/dev/null || true
wait "$EDGE_PID" 2>/dev/null || true
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
rm -rf "$HUB_TMP"
```

- 6.2 需要自己的 `MARKET_TMP`：先重复 6.1 第 1-2 步（复制工作区、`git init`/commit、用临时仓库地址生成索引），并且**不要**在 6.1 的清理段提前删除它；6.2 结束后再 `rm -rf "$MARKET_TMP"`。6.1 单独跑时按 6.1 的清理段删除。
- 启动前把 `<HUB_TMP>/state/settings.json` 写成 `{"extensionMarketUrl":"<MARKET_SRC>"}`，先断言不输入市场源也能看到 `extension-demo.other`（验证启动预读 + 默认/存储市场源）；再让探针按原流程输入源并安装。
- 探针会验证：`demo.counter` 的 header 组件、真实点击后的 `useState`、市场行、详情弹窗版本、安装后按钮无刷新切换、卸载后文件保留。
- 追加 `claude.code` 的页面级检查：安装后侧栏或技能页出现 Claude Code（skills/prompts/MCP/plugins 的位置），卸载后消失。
- 收尾只按 PID 杀自己启动的进程；不要按端口/镜像名清场。

**6.3 全量检查**

```bash
cd /d/work-space/dsh-context-hub
pnpm typecheck
pnpm exec vitest run --project core --project extensions --project mcp --project global-search --project web
pnpm test        # 可选；时间允许时跑全量
```

**验收**

- 6.1 全部命令通过；6.2 探针输出 `all checks passed`（若跳过，汇报里明确写“浏览器探针未跑”）。
- 主仓 `git status --short` 无临时文件；真实 `~/.context-hub` 未被写入（隔离 home 是临时目录）。
- 市场仓 `git status --short` 只有阶段 4 的预期改动。

### 阶段 7：同步仓库认知与收尾

**目标**：主仓受管理对象达到最终稳定状态后，更新 AOCI；确认两个仓库没有残留。

**步骤**

- 按 `AGENTS.md` 的 AOCI 流程调用 `aoci_maintain`，只处理本次改动命中的候选；重点：
  - `packages/core/src/extension-manifest.ts`：`parsePluginManifestYaml`、`parsePluginPackage`、`readPluginPackage`、`LocalizedText`/`localized`。
  - `packages/core/src/extension-market.ts`：本阶段不改。
  - `packages/core/src/plugins.ts`：`PLUGIN_MANIFEST = "plugin.yaml"`。
  - `packages/extensions/src/plugin.ts`：YAML + package、图片 icon、本地化透传。
  - 示例 `plugin.json` 的 AOCI 条目随文件改名/删除更新。
- 不手工编辑 `aoci.code.txt`；使用 `aoci_update_entry` 提交完整批次。
- 复查两个仓库的 `git status --short`；确认没有密钥、没有 `node_modules`、没有临时 home/profile、没有 `apps/desktop/release/**` 改动。

**验收**

- `aoci_maintain` 没有未处理的语义候选（或已按 guide 应用）。
- 主仓 `pnpm typecheck` 与目标测试仍通过；市场仓 `pnpm build` 仍能生成同一份 `marketplace.json`。
- 最终汇报列出：两个仓库改了什么、跑了哪些验证、哪些没跑（例如浏览器探针）、遗留风险。

## 验证方案汇总

| 范围 | 命令 | 判据 |
|---|---|---|
| 主仓类型 | `pnpm typecheck` | 全仓通过 |
| 主仓目标测试 | `pnpm exec vitest run --project core --project extensions --project mcp --project global-search --project web` | 全绿 |
| 主仓全量测试（可选） | `pnpm test` | 全绿 |
| 页面构建 | `pnpm --filter web build` | 成功 |
| 市场仓类型 | `cd /d/work-space/context-hub-extensions && pnpm typecheck` | 两个插件通过 |
| 市场仓构建 | `pnpm build` | 生成 `marketplace.json`，含 `claude.code` |
| 生成确定性 | 连续两次 `pnpm build` + `sha256sum marketplace.json plugins/*/lib/index.js` | 两次哈希一致 |
| 启动预读 | 阶段 6.2 seed settings 后不输入源 | 市场行出现 |
| 本地安装 | 阶段 6.1 | list/install/remove 全部通过（含 claude.code） |
| 浏览器探针（可选） | 阶段 6.2 | `all checks passed` |

## 待用户确认的开放问题

1. **市场仓真实 HTTPS 仓库地址**：它同时决定 `marketplace.yaml.repository` 的 `source.url` 和主仓 `OFFICIAL_MARKET_URL`。计划先用占位地址；本地验收用 `MARKETPLACE_REPOSITORY` 覆盖。现在是否有确定的地址（仓库根 URL 或 `marketplace.json` 的原始地址）？
2. **移植后是否删除 `packages/agents/claude-code`**：计划删除整个包和它的三个测试，主仓不再保留内置注册；市场仓的 `plugins/claude.code` 成为唯一来源。是否接受？
3. **“内置市场”的形态**：计划把官方索引 URL 设为 `DEFAULT_SETTINGS.extensionMarketUrl`，并在 `startHub()` 启动预读一次（只取索引，安装才 clone）。如果你要的是“随安装包内置一份离线索引快照，再后台刷新”，需要另外设计缓存文件与更新策略。
4. **`demo.other` 图标**：计划新增 `plugins/demo.other/assets/icon.svg`（64×64 占位）；`claude.code` 用你提供的 `icons/claudecode.svg` 移入插件目录。是否接受这个占位图？
5. **市场安装是否强制要求 `package.json`**：计划要求存在（version/entry 的唯一来源）；已安装但缺 `package.json` 的目录仍以 `0.0.0`/`index.js` 加载。是否接受？
6. **本地化映射是否强制含 `en`**：计划要求 `name`/`description` 的映射包含 `en`（与市场索引一致），其余语言缺失时回退 `en`。是否接受？
7. **`GET /hub/extensions/<id>` 的返回体**：计划改为返回解析后的 `plugin.yaml`，不再包含 `version`/`entry`；仓库内没有调用方。如果外部工具依赖这两个字段，需要保留合并字段。是否需要保留？

## 风险与注意事项

- **破坏性迁移**：旧 `plugin.json` 扩展会从扩展目录消失，文件仍在磁盘；不自动删除、不自动转换。必须在文档和发布说明里写明。
- **本地化类型扩散**：`ExtensionManifest.name/description` 变宽后，任何新的消费方如果直接把值塞进模板字符串/`Highlighted` 会得到 `[object Object]`；本次已用 `rg "manifest\\.(name|description)"` 找全，后续新增消费方由 typecheck 无法完全兜底（`LocalizedText` 包含 string），所以代码审查时要看是否调用了 `localized()`。
- **图标内联**：`marketplace.json` 会包含每个插件的 base64 图标（每个 ≤32 KiB），索引体积随插件数线性增长；这是避免本地索引 `file:` 冲突、并让远程列表少一次图片请求的代价。
- **生成物漂移**：`marketplace.json` 是提交物；改插件后忘记 `pnpm build` 会让 hub 读到旧版本。阶段 4 的两次构建哈希与阶段 6 的真实安装是判据。
- **claude-code 覆盖损失**：移植后主仓的三份 agent 集成测试随源码一起删除；市场仓当前没有测试框架，注册行为只能靠真实安装验收。汇报时必须写明。
- **默认市场地址**：`OFFICIAL_MARKET_URL` 在拿到真实仓库地址前是占位；占位地址会让首次启动的默认市场读取失败（页面显示失败行），不影响手动输入本地路径。
- **枚举重复**：`scripts/build-marketplace.mjs` 会复制 category/permissions 枚举用于早期校验；核心枚举变化时要同步，否则会拒绝合法值。脚本里加注释标明来源。
- **e2e 不提交市场仓**：阶段 6 用临时 git 仓库，避免要求先提交工作区改动；真实发布前市场仓仍需正常提交并推送默认分支。
