# 插件文件读写：通用文件能力 + Codex 文件安装器

## 背景

`plugins/codex` 的安装器完全依赖 `codex plugin` 子命令。`plugins/claude.code` 已经改成通过宿主 `PluginDisk` 直接读写文件，但这套通道本身把 Claude 的规矩写死在宿主里：

- `installer-files.ts` 的 `declarationOf` 只接受 `.claude` / `plugins` / `CLAUDE_CONFIG_DIR` / `CLAUDE_CODE_PLUGIN_CACHE_DIR` 这一组字面量。
- `allowedRef` 的白名单是 `installed_plugins.json`、`known_marketplaces.json`、`.claude/settings*.json` 等 Claude 专属路径。
- `host/marketplace.ts` 直接生成 `.claude-plugin/marketplace.json` 和 `.agents/plugins/marketplace.json`，即宿主认识两个具体 Agent。

按这个结构，**每接一个 Agent 都要回宿主加分支**。这是架构错误：Agent 是扩展，宿主不该认识它们。本轮把这条边界改正，然后 Codex 走和 Claude 同一条通道。

**先回退**：工作区里有本轮按错误方案改的 4 个宿主文件（`installer-files.ts`、`provider.ts`、`tools.ts`、`handlers.ts`）。这些改动未提交，直接丢弃。

## 职责划分

| 位置 | 负责 |
| --- | --- |
| `context-hub-extensions/plugins/<agent>` | 自己在哪、读哪些文件、怎么解释和改写客户端配置、市场索引长什么样 |
| Context Hub 宿主 | 通用文件原语：路径约束、符号链接拒绝、快照比对、原子写、目录拷贝与删除、只读/可写判定 |

宿主认识的不是 Agent，而是**一份作用域声明**。

## 作用域声明（新契约）

```ts
/** 一个根下允许的路径：可写的与只可读的。 */
interface RootScope {
  write: string[]
  read: string[]
}

/** 一个安装器要碰的文件范围。宿主只按这份声明校验，不认识任何 Agent。 */
interface PluginFileScope {
  /** 客户端配置根：用户目录下的一个目录名，单段。 */
  home: string
  /** 可以把配置根挪走的客户端环境变量名，可选。 */
  homeEnv?: string
  /** 客户端的插件状态根，相对 `home`，单段；已装记录和缓存副本都在它下面。 */
  state: string
  /** 可以挪走状态根的客户端环境变量名，可选。 */
  stateEnv?: string
  config: RootScope      // `home` 根
  stateFiles: RootScope  // 状态根
  workspace: RootScope   // 当前工作区
  library: RootScope     // 库根
  /** 扩展自己指定的外部目录里，允许读取的相对路径模式。 */
  external: string[]
}
```

模式语法只有两种记号：`*` 匹配一段名字，`**` 匹配任意剩余层数。没有正则、没有绝对路径、没有 `..`。

宿主的通用校验（全部与 Agent 无关）：

1. `home` 必须是单段相对名，解析后必须恰好是 `<用户目录>/<home>`；`homeEnv` 设了就取该绝对路径，相对值一律拒绝。
2. `state` 必须是单段相对名；`stateEnv` 同上。
3. 任何 ref 解析后必须落在对应根内，逐段 `lstat` 拒绝符号链接。
4. 路径必须命中该根的模式列表；未命中的一律拒绝。
5. 目录删除只允许状态根下、命中模式且位于 `cache/` 下的目录。

两端的声明：

| | Claude Code | Codex |
| --- | --- | --- |
| home / env | `.claude` / `CLAUDE_CONFIG_DIR` | `.codex` / `CODEX_HOME` |
| state / env | `plugins` / `CLAUDE_CODE_PLUGIN_CACHE_DIR` | `plugins` / — |
| config.write / read | `settings.json` / `skills/*/.claude-plugin/plugin.json` | `config.toml` / — |
| stateFiles.write / read | `installed_plugins.json`、`known_marketplaces.json`、`cache/*/*/*/.orphaned_at` / `cache/*/*` | — / `cache/*/*` |
| workspace.write / read | `.claude/settings.json`、`.claude/settings.local.json` / `.claude/skills/*/.claude-plugin/plugin.json` | — |
| library.read | `.claude-plugin/marketplace.json`、`*/.claude-plugin/plugin.json`、`*/.claude-plugin/marketplace.json`、`*/plugin.json` | `.agents/plugins/marketplace.json`、`*/.codex-plugin/plugin.json`、`*/.claude-plugin/plugin.json`、`*/plugin.json` |
| external | `.claude-plugin/marketplace.json`、`.claude-plugin/plugin.json` | — |

`external` 保留今天的语义：扩展给出一个自己算出来的绝对目录，宿主只在该目录是绝对路径、且相对文件名命中 `external` 模式时读取，**不再解析客户端的市场状态文件**。这样 Claude 的声明型条目照旧能拿到来源目录，宿主里也不再出现 `known_marketplaces.json`、`.claude/settings.json` 这些字面量。

**信任模型不变**：扩展仍是用户装并启用的代码，作用域是「它声明自己碰哪儿」的边界，不是恶意扩展之间的沙箱。这一点要在 `docs/extensions.md` 写清楚，不能让人误以为 `permissions` 已经强制。现有的 `permissions: filesystem` 保持展示用途，本轮不引入授权弹窗。

## 阶段

### 阶段 0：丢弃错误方向的改动

**执行目标**：把工作区恢复到「还没有 profile 分支」的状态。

**动作**：`git checkout -- packages/resources/plugins/{src/host/installer-files.ts,src/provider.ts,src/tools.ts,handlers.ts}`。

**验收**：`git status` 里不再有这四个文件；`pnpm --filter @context-hub/plugins test` 仍全绿。

### 阶段 1：宿主换成通用作用域声明

**执行目标**：删掉 `profile` 与 Claude 字面量，改由声明决定一切。

**改动**：

- `packages/resources/plugins/src/provider.ts`
  - `PluginDiskDeclaration` 换成 `PluginFileScope`（字段见上），`PluginDiskRoots` 带 `scope` 与四个解析后的根。
- `packages/resources/plugins/src/host/installer-files.ts`
  - 新增 `parseScope()`：结构校验 + 单段约束 + env 解析，替换 `declarationOf`。
  - 新增 `matchPattern()`：`*` / `**` 的逐段匹配，替换 `allowedRef` 的硬编码白名单。
  - `read` / `list` / `commit` / `path` / `external` / `readExternal` 全部改为按 `scope` 的模式表判定；`external` 只保留「绝对目录 + 相对文件名命中模式」两条校验，删掉解析 `known_marketplaces.json` / `settings.json` / `installed_plugins.json` 的那段。
- `packages/resources/plugins/src/tools.ts`、`handlers.ts`：字段名跟随，行为不变。

**验收**：

- `installer-files.test.ts` 现有用例改为用 Claude 的声明（内容等价于今天的白名单），全绿。
- 新增用例：越界的 `home`（`..`、绝对路径、多段）、越界模式（`../x`、`/x`）、未命中模式的路径都被拒。
- 新增用例：同一份代码用 `.codex` 声明可以读写 `config.toml`，而 `installed_plugins.json` 被拒。

### 阶段 2：目录列举、删除、拷贝替换做成通用能力

**执行目标**：Codex 需要的三件事，用与 Agent 无关的方式提供。

**改动**（`installer-files.ts` + `provider.ts` + `tools.ts` + `handlers.ts`）：

- `list` 接受状态根下命中 `stateFiles.read` 模式的目录。
- 新增 `removeDirectory(roots, ref)`：只删状态根 `cache/` 下命中模式的目录。
- `commit` 的 `copy` 增加 `replace` / `pruneVersions` 两个开关：`replace` 允许覆盖内容不同的同名目录（先暂存、再换入、失败回滚旧目录）；`pruneVersions` 删掉同层其它版本目录。两者默认关闭，Claude 行为不变。

**验收**：

- 新增用例：删除命中模式的缓存目录成功；删 `cache` 自身、删 `config` 根、删库根都被拒。
- 新增用例：`replace` 覆盖内容不同的同版本目录且失败时旧目录仍在；未开 `replace` 仍报冲突；`pruneVersions` 后只剩一个版本。

### 阶段 3：市场索引改由扩展提供

**执行目标**：宿主不再生成 `.claude-plugin` / `.agents` 这两种文件。

**改动**：

- `provider.ts`：`syncMarketplace(indexes: readonly { path: string; document: unknown }[]): Promise<void>`；新增 `packs(): Promise<{ name: string; description: string; version: string }[]>`，把库记录以数据形式交给扩展——宿主只给数据，格式归扩展。
- `handlers.ts`：按传入的路径写文件，路径必须是库根内的相对路径、以 `.json` 结尾、段数不超过 3。
- `host/marketplace.ts`：删除 `writeMarketplaceIndex` / `codexMarketplaceIndex`，只保留两份索引**由谁生成**的说明；两个 Agent 各自在扩展里组装自己的文档。
- `claude.code`、`codex` 的 `tools.syncMarketplace(...)` 调用点各自传自己的索引。

**验收**：

- 宿主源码里不再出现 `.claude-plugin`、`.agents`、`installed_plugins.json`、`known_marketplaces.json`、`config.toml` 等 Agent 字面量（用 `grep` 作为判据）。
- 库根仍写出两份索引，内容与今天逐字节一致（用快照测试比对）。

### 阶段 4：Claude Code 迁到通用作用域

**执行目标**：让现有安装器使用同一份契约，证明这套契约能表达真实需求。

**改动**：

- `plugins/claude.code`：`CLAUDE_PLUGIN_ROOTS` 换成 `PluginFileScope`（表见上）；`installer.ts` 里 `declaration` 相关字段改名；`index.tsx` 传入自己的市场索引文档。

**验收**：

- `pnpm --filter claude.code test` 的 24 个用例语义不变（构造声明的地方跟随新字段），全绿。
- 隔离配置根里手工跑一遍安装/启停/卸载，与改动前的磁盘结果逐字节一致。

### 阶段 5：Codex 文件安装器

**执行目标**：Codex 的查询、安装、启停、卸载全部走文件。

**改动**（`D:\work-space\context-hub-extensions\plugins\codex`）：

- `src/contracts.ts`：补 `PluginFileScope` / `PluginDisk*` 类型镜像；`PluginTools` 增加 `disk?`。
- `src/installer.ts`：重写为 `createCodexInstaller(toml: McpTomlTools)`。
  - 作用域：`home: ".codex"` / `homeEnv: "CODEX_HOME"` / `state: "plugins"`，模式见上表。
  - `available`：`disk.roots(scope)` 成功即可，不要求 `codex` 在 PATH 上。
  - `held`：读 `config.toml` → `plugins` 表；跳过 `_default` 与非法条目；对每个 `pack@market` 列 `cache/<market>/<pack>`，取版本目录名；无目录视为未安装；`enabled` = 显式 → `plugins._default.enabled` → `true`；`market !== "context-hub"` 标只读。
  - `switches`：`{ user: { id: enabled } }`。
  - `places`：一个 `codex-user`，`scopeWord: "user"`，`switchable: true`，`file: "config.toml"`。
  - `install`：`syncMarketplace` → 读 `.agents/plugins/marketplace.json` 确认条目 → 版本取 `.codex-plugin/plugin.json` → `.claude-plugin/plugin.json` → 索引条目 → `local`；`[marketplaces.context-hub]` 已存在且指向别处则报错；两个 TOML 编辑合成**同一条** `config.toml` 变更；同一次 `commit` 带 `copy: { name, destination: "cache/context-hub/<name>/<version>", replace: true, pruneVersions: true }`。
  - `remove`：先删 `[plugins."<id>"]` 并提交，再删版本目录；`[marketplaces]` 保留。
  - `setEnabled`：条目不存在时拒绝；存在时写 `enabled`。
- `src/index.tsx`、`__test__/installer.test.ts`（按新契约重写）、`README.md`、`package.json` 版本号。

**验收**：

- 单测覆盖读/装/停/卸/只读判定与 marketplace 冲突。
- `pnpm --filter codex test` 与 `typecheck` 全绿。

### 阶段 6：端到端验证与文档

**执行目标**：用真实 Codex 与真实 Claude 做判据。

**判据**：

1. 隔离 `CODEX_HOME` 跑安装 → `CODEX_HOME=<tmp> codex plugin list --json` 显示 `installed: true`、`enabled: true`、版本等于包 manifest。
2. 启停后 `enabled` 跟随；卸载后 id 消失、缓存目录不存在、`[marketplaces.context-hub]` 仍在。
3. 改包内容不改版本重装，缓存内容更新。
4. 全程没有调用 `codex plugin add/remove/marketplace`（在测试里用一个会抛错的 `run` 兜底）。
5. Claude 侧：既有测试 + 隔离配置根的一次手工安装，磁盘结果与改动前一致。

**文档**：`docs/extensions.md` 的「Plugin installer file access」重写为通用作用域说明，并写明信任模型；`docs/memory.md` 记本次架构教训。

## 风险

- **信任边界**：声明由扩展给出，宿主只做结构校验。这意味着一个被启用的扩展可以读写它声明的根下任意匹配路径——与今天 Claude 安装器能改 `settings.json` 的实际权限同级。`permissions` 仍是展示项，本轮不改。
- **跨仓同时改动**：宿主契约一变，两个扩展必须同时更新，旧扩展对新宿主会报「不支持的作用域」。
- **缓存是运行期副本还是仅记录**：仍未用真实会话确认；`replace` 在两种情况下都安全，只是可能无效果。
