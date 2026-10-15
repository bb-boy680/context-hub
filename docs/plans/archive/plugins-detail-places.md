# Plugins 弹窗右侧补「位置」模块，底部固定为查看文件 + 删除插件

## Context

`/plugins` 的详情弹窗（`packages/plugin-plugins/src/detail-dialog.tsx`）右侧面板目前是：
描述 → 分类编辑器 → 「关于」两行 → 底部 `查看文件` + `PluginActions`（`安装到 ▾` 菜单，
需要更新时多一个黄色 `更新`）。

同仓 `/skills`（`plugin-skills/src/skill-detail-dialog.tsx:1155-1280`）与 `/mcp`
（`plugin-mcp/src/server-dialog.tsx:230-315`）的同一面板都多一个**位置**模块：

- 头部 `位置  已装 N`；
- 一行「资产库」（hub 自己的那份，带路径；未收录时该行给「收录」按钮，已收录时给「本体」徽章）；
- 按 scope 分组的 place 行（工作区 / 全局 Agent），每行左侧是 mark + 名字 + 第二行位置，
  右侧是该行自己的「安装 / 移除」按钮。用的都是共享组件 `PlaceList`
  （`packages/extensions/src/components/place-picker.tsx`）。

Plugins 这边没有这个模块。用户要求补上，并把底部按钮固定为 `查看文件` + `删除插件`。

## 已确认的前提

- **place 的粒度（用户已确认）**：**一行 = 一个客户端**，不是「客户端 × scope」。
  第二行写该客户端在本组里的 scope 文案（如 Claude Code 在工作区 →
  「这个仓库 · 这个仓库，只对我」）。
- **「更新」的去向（用户已确认）**：从底部移到面板正文里，最终落在「来源」块上，
  与 skills 同构（见下）。
- **用户补充的第二轮要求**：「来源」块不能只是两行文字——要和 skills 那块一样
  （真实地址 + 每个包一个检查/更新按钮 + 上次检查时间），所以给 host 侧加了
  「按名字检查一个包」的动作。
- **plugins 的 place 没有目录路径**：`PluginInstaller`（`provider.ts`）只声明
  `scopes`，没有任何路径；`PluginHeld.source.path` 是**包**的目录而不是 place 的。
  所以第二行只能是 scope 自己的文案（`plugins.scope.*`），这也是上一轮
  `PlaceScopePicker` 的既有写法（见 `docs/plans/archive/plugins-tab-row-parity.md:28-31`）。
- **数据已经够了**：`PluginRow.held: PluginHeldBy[]`（`types.ts:20-29`）带
  client / label / icon / scopes（客户端自己的词），且涵盖**所有**客户端报告的包，
  不限本 hub 投递过的（`rows.ts:collectScanned`）。`SCOPES_OF`
  （`rows.ts:229-232`）给出 工作区 = `["project","local"]`、全局 = `["user"]`。
- **`library.remove(name)` 已经存在但没接 UI**（`library.ts:415` →
  `host/library.ts:403`）：只删 hub 库里的目录 + 索引 + 资产，**不动 agent 里的副本**。
  这与 skills 的删除语义一致（`skills.delete.text`）。
- 复用已有键，不重复造：`plugins.action.install`(安装) / `plugins.action.uninstall`(卸载)
  / `plugins.action.adopt`(收录) / `plugins.action.cancel`(取消) /
  `plugins.tab.library`(资产库) / `plugins.tab.workspace`(工作区) / `plugins.tab.global`(全局)
  / `plugins.scope.user|project|local` / `plugins.client.absent|unread`。

## 不做（超出本次范围，已知）

- **未收录的包在弹窗里仍然读不到文件**。skills 未收录的技能能「查看文件」，是因为它能从
  place 的目录读（`store.placeSkill`）。plugins 没有对应能力：`heldRow`
  （`rows.ts:167-189`）丢掉了 `ScannedPack.source.path`，host 侧也没有
  「按 place 读一个包」的接口。本次只把按钮置灰并说明原因，不加这个 host 能力。
- 列表页每行的动作菜单（`PluginActions` 的 `安装到 ▾`）保持不动，只有弹窗改用位置列表。

---

## 阶段一：消息键

英文在 `packages/plugin-plugins/src/messages.ts`，中文在
`packages/locale-zh-cn/src/messages.ts` 的 `plugins.*` 段。两处都要加。

| key | en | zh |
| --- | --- | --- |
| `plugins.detail.places` | Places | 位置 |
| `plugins.detail.places.held` | {count} installed | 已装 {count} |
| `plugins.detail.update` | Update | 更新 |
| `plugins.place.body` | Body | 本体 |
| `plugins.place.expand` | Show {count} more | 再展开 {count} 个 |
| `plugins.place.collapse` | Show fewer | 收起 |
| `plugins.detail.delete` | Delete plugin | 删除插件 |
| `plugins.delete.title` | Delete {name}? | 删除 {name}？ |
| `plugins.delete.text` | Its folder and everything the hub keeps for it will be deleted. This cannot be undone. | 它的文件夹和 hub 为它保存的资源都会被删除，且无法撤销。 |
| `plugins.delete.confirm` | Delete | 删除 |
| `plugins.detail.files.unstored` | The hub does not hold this pack's files yet. | hub 还没有收录这个插件的文件。 |

中文抄同义的 `skills.*` 现有文案（`locale-zh-cn/src/messages.ts:237-252`）。

**验收**：`node packages/locale-zh-cn/scripts/check-messages.ts` 不再报缺键。

## 阶段二：导出 `UpdateAction`

`packages/plugin-plugins/src/install-actions.tsx:184-250` 的 `UpdateAction` 目前是文件私有，
且只被同文件的 `PluginActions` 用。弹窗要把「更新」搬进正文，所以加一个 `export`。
`PluginActions` 本身不动（列表页每行还在用它）。

**验收**：`pnpm typecheck` 通过；列表页行为零变化。

## 阶段三：`detail-dialog.tsx`

1. **新增 `PlacesSection`**（放 `InfoPanel` 上方，照 `skill-detail-dialog.tsx:1155` 的形状）：
   - 头部：`plugins.detail.places` + `plugins.detail.places.held`，
     计数 = `plugin.held.length + (plugin.stored ? 1 : 0)`（与 skills 同一算法：
     库自己也算一个位置）。
   - 第一行「资产库」：`LibraryIcon` 砖 + `plugins.tab.library` 标题 +
     `root` 路径（`\` 换 `/`，同 MCP `server-dialog.tsx:257`）；右侧
     `plugin.stored` ? 徽章（`plugins.place.body`/本体） : 「收录」按钮。
   - `PlaceList`，两组：`SCOPES_OF.workspace`（`plugins.tab.workspace`/工作区）、
     `SCOPES_OF.global`（`plugins.tab.global`/全局）。跳过空组。
     - 每组的 option 来自 `clients`，只留 `client.scopes` 与本组有交集的；
     - `id` = `client.id`，`icon` = `client.icon`，`label` = `client.label`；
     - `note` = 该客户端在**本组**的 scope（按客户端自己的声明顺序）经
       `plugins.scope.*` 译出后用 `" · "` 连接；
     - `selected` = `plugin.held` 里这个客户端在本组持有；
     - `blocked` = 读不了（`client.error`）或不在本机（`!client.available`）时的原因，
       用现有 `plugins.client.unread` / `plugins.client.absent`。
   - 行动作：`blocked` 时渲染一个置灰按钮（`title` 带原因）；否则
     `selected` → 「移除」按钮（`plugins.action.uninstall`），
     否则 → 「安装」按钮（`plugins.action.install`）。
     **一个按钮管整组**：安装 = 对该客户端在本组声明的每个 scope 各调一次
     `onInstall`；移除 = 对它在本组**确实持有**的每个 scope 各调一次 `onUninstall`。
     （一行代表一个客户端，组就是这一行说的那个范围；逐 scope 的细粒度仍在
     列表页每行的 `安装到 ▾` 菜单里。）
2. **`InfoPanel`** 增删：
   - 增 prop：`root`（库路径）、`onInstallPlace`/`onRemovePlace`（`(client, scope) => void`）、
     `onDelete`。
   - 正文顺序改为：描述 → 分类编辑器（仅 `stored`）→ `PlacesSection` → **更新行** →
     「关于」组（来源 + 更新时间）。
   - **更新行**：`plugin.stored && plugin.outdated === true` 时渲染一行
     （左 `plugins.detail.update`，右 `UpdateAction`），否则整行不出现。
   - 底部固定两支：`查看文件`（`plugin.stored` 时可用，否则置灰 +
     `title={plugins.detail.files.unstored}`）+ 删除（`plugin.stored` 时为
     `DeleteBubble` 包着的红色描边按钮，`plugins.detail.delete`；未收录时**不渲染**——
     库里没有它，没有东西可删，同 skills 的 `onDelete === null`）。
     移除 `PluginActions` 的引用与 `onUpdate`/`onInstall`/`onUninstall` 三个旧 prop。
3. **`DeleteBubble`**（照 `skill-detail-dialog.tsx:868-955`）：`Popover` + 箭头 +
   标题 + 说明 + 库路径 + 取消/删除；成功后弹窗随页面重读自然收起，
   失败 toast 并把按钮恢复可用。

## 阶段四：`page.tsx` 接线

`PluginDetailDialog` 的调用处（约 `:1322`）：

- 去掉 `onUpdate`；
- `onInstall` / `onUninstall` 改传 `(client, scope) => actions.onInstall(detail, client, scope)`
  （detail 在闭包里；注意 `detail` 可能是 `null`，调用点先用 `plugin` 参数）；
- 新增 `root={library.root}`；
- 新增 `onDelete={(plugin) => library.remove(plugin.name)}`。

**验收**：`pnpm typecheck`、`pnpm lint` 全绿。

## 阶段四：来源块做真（用户第二轮要求）

`来源 / 更新时间` 两行原本只显示「仓库 / 本地」这种词，是列表页卡片上已有的信息，
而 skills 的同一块显示的是卡片上没有的东西。改成 skills 的形状：

- `packages/plugin-plugins/src/host/probe.ts`：`PluginProbe` 加
  `checkOne(records, name)`——问一个包并把答案记到记录上，与 `checkAll` 同一套
  `setChecks`；名字不存在或来源问不了则抛错。
- `vite.ts`：`action: "check-update"`。
- `library.ts`（客户端）：`checkUpdate(name)`，走 `write()` 所以写完整表重读。
- `rows.ts` / `types.ts`：行上新增
  - `sourceAddress`（真实地址，`formatPluginSource(originToSpec(origin))` 得到；
    未收录的包用 agent 报的目录），
  - `checkedAge`（上次检查到现在的说法，没查过为空串）。
- `detail-dialog.tsx`：新增 `SourceSection`，照 `skill-detail-dialog.tsx:975`：
  标题行「来源」+ 右侧按钮（已落后 → `UpdateAction`，否则「检查」），
  下一行是地址（http/github 短名可点，本机路径是纯文本），再一行状态
  （已是最新 / 上游有更新 / 收录后被改过 / 本来源问不了），再一行上次检查时间。
  问不了的来源不给按钮。原来那两行 `MetaRow` 与独立的「更新」行一并去掉。
- 删掉因此不再使用的键：`plugins.detail.about`、`plugins.detail.update`；
  新增 `plugins.detail.group.workspace|global`（照 skills/MCP 的「工作区 / 全局 Agent」）、
  `plugins.update.check|checking|current|edited|lastChecked|unanswerable`。

**验收**：点「检查」后该包记录上的 `checked.at` 前移，面板上「上次检查」跟着变成「刚刚」。

## 阶段六：按钮状态按 agent 实际持有判断（用户第三轮要求）

用户截图指出：Claude Code 明明装过这个包，位置行却只显示固定的「安装」，没有「卸载」。

根因有两个，都在我上一轮的选择里：

1. **判据选错**。我用 `client.delivered`（本 hub 投递过的 scope）判断装没装，而
   `deliveredOf`（`library.ts`）只收 `marketplace === context-hub` 的包。真实数据里
   Claude Code 装的是 `ponytail@ponytail`（来自 `ponytail` 市场），所以 `delivered` 是空的，
   按钮永远显示「安装」。判据必须是 agent **报告的现状**（`plugin.held`）。
2. **动作会失败**。即使状态改对，两个 installer 的 `remove` 都拿包名重建
   `` `${id}@${MARKETPLACE}` ``，对 `ponytail@ponytail` 会去删不存在的
   `ponytail@context-hub`。必须把客户端自己报的 id 交给 `remove`。

**改动**

- `types.ts`：`PluginHeldBy` 加 `id`（客户端自己的 `<name>@<marketplace>`）。
- `rows.ts`：`HeldBuilder` 加 `id`，从 `PluginHeld.id` 带过来。同一个包在同一个客户端
  的每个 scope 里 id 相同。
- `provider.ts`：`PluginInstaller.install(name, ...)` 收包名（本 hub 是供货市场），
  `remove(id, ...)` 收客户端自己的 id；注释写明两者为何不同。
- `plugin-claude-code/src/installer.ts`、`agents-extensions/codex/src/installer.ts`：
  `remove` 直接用给到的 id，不再拼市场名。
- `library.ts`：`uninstall` 从 `scanned` 里查该客户端对这个包的 id 再交给 installer；
  查不到则拒绝（新增 `plugins.uninstall.unknown`）。
- `install-actions.tsx`（列表页行菜单）与 `detail-dialog.tsx`（弹窗位置行）：
  改判 `plugin.held`。
- 删除因此彻底没人读的 `PluginClient.delivered`、`deliveredOf`、`isScope`、
  `PluginLibrary.delivered`（最后一个在本轮之前就已经没有读者了），
  `library.ts` 里 `PLUGIN_MARKETPLACE_NAME` 与 `PluginHeld` 的 import 一并去掉。

**验收**：`claude plugin list --json` 报 `ponytail@ponytail` scope=user 时，
弹窗「全局 Agent / Claude Code」那行显示「卸载」，「工作区 / Claude Code」仍显示「安装」
（本仓库 scope 确实没有）；列表页每行的 `安装到 ▾` 菜单里只有「整台机器」带勾。

## 阶段七：底部两个按钮对未收录的包也要能用（用户第四轮要求）

用户截图：未收录的包底部只有一条占满宽度的灰色「查看文件」，是死的。
根因两处：

1. **`查看文件` 一直是坏的**（上一轮之前就在）：客户端发
   `?action=files&id=<name>`，`vite.ts` 读 `url.searchParams.get("name")`，
   每次 400 `missing name`；`FilesPanel` 把异常 `catch` 成空数组，
   于是渲染出空树，看着像"这个包没有文件"。`action=file` 同样。
2. 未收录的包没有库记录，`FilesPanel` 只认 `packFiles(plugin.id)`（库里的），
   `PackLightbox` 的 `overlay` 也还按 `plugin.stored` 拦着。

**改动**

- `vite.ts`：`files` / `file` 两个动作改成 `name=`（hub 自己那份）或 `dir=`（agent
  读的那个目录）二选一。
- `src/host/library.ts`：把目录列举/读取抽成 `listDirectory(dir)` /
  `readInDirectory(dir, file)`（后者复刻原有的越界拒绝），库自己的 `files` / `read`
  改为调它们，于是两种来源是同一条实现。
- `src/library.ts`：客户端参数名改回 `name=`；新增 `packFilesIn(dir)` / `packFileIn(dir, path)`。
- `types.ts` / `rows.ts`：`PluginRow.directory` 带上 agent 报的目录（只有未收录的包有）。
- `detail-dialog.tsx`：
  - `FilesPanel` 按 `stored` 选来源（库或目录）；
  - `PackLightbox` 的 `overlay` 改成「`stored` 或有目录」就挂；
  - `InfoPanel` 页脚**恒有两个按钮**：`查看文件`（两种来源都能读），
    `删除插件`（已收录 → 删库里的那份；未收录 → 让持有它的 agent 各自撤下来，
    一次一个 `installer.remove`，冒泡里点名是哪些 agent）。
  - `DeleteBubble` 从"收 name/path"改成"收一句现成的文案 + 一个详情字符串"，
    两种删除共用同一个气泡。

**这里偏离了用户选项里的一处措辞**：选项写的是「从 agent 目录删除」。我没删目录，
而是调客户端自己的卸载——插件的缓存目录是那个客户端的 CLI 管的，绕过它删目录
会让 CLI 自己的记录变成指向不存在的东西。用 `installer.remove(自己的 id)` 才是
对的机制，而且 id 上一轮已经跟到行上了。

**验收**：已收录与未收录两个包的面板都要能列出文件并读出第一个文件的正文；
越界路径要被拒（自检里钉住）。

## 阶段八：跑起来看

```
cd packages/plugin-plugins && node scripts/check-plugin-rows.ts
cd packages/plugin-plugins && node scripts/check-plugin-library.ts
node packages/locale-zh-cn/scripts/check-messages.ts
pnpm typecheck && pnpm lint
pnpm dev   # 打开 /plugins
```

页面上逐条确认（已在 5175 端口跑过，见下）：

- 打开一个已收录的插件：右侧出现「位置 已装 N」+ 资产库行（本体徽章）+ 工作区/全局两组
  客户端行，每行第二行是 scope 文案，右侧是 安装 或 移除。
- 点某个客户端的「安装」→ 该客户端在本组的每个 scope 都装上（可在列表页每行的
  `安装到 ▾` 菜单里核对勾选状态）；点「移除」→ 它持有的那些 scope 都卸掉。
- 底部只有 `查看文件` 和 `删除插件`；「来源」块右侧是「检查」或「更新」，
  点「检查」后「上次检查」变成「刚刚」。
- 点「删除插件」→ 气泡出现，确认后该包从库里消失，**agent 里装的副本不受影响**。
- 未收录的插件：资产库行给「收录」按钮，底部 `查看文件` 置灰并有提示，没有删除按钮，
  「来源」块没有按钮并写着「本来源问不了」。
- `/skills` 并排对照：位置区的间距、行高（56px）、砖（28px）、按钮形状一致。
- 切中文，确认新增的键都是中文。

**已实际跑过的部分**（浏览器驱动，`http://localhost:5174/plugins`）：

- `superpowers`（已收录、无 agent 持有）：位置三行 + 来源块（`https://github.com/obra/superpowers`
  可点、已是最新、上次检查 44分钟前）+ 底部两个按钮。
- 点「检查」→ host 上 `checked.at` 从 `07:47:15` 前移到 `07:47:32`，面板显示「上次检查：1秒钟前」。
- `ponytail`（Claude Code 装有 `ponytail@ponytail`，scope=user）：
  工作区/Claude Code → 「安装」；全局 Agent/Claude Code → **「卸载」**；Codex → 「安装」。
  列表页该行的 `安装到 ▾` 菜单里只有「整台机器」带勾（DOM 里查过 4 个 menuitem 的 svg）。
- `claude-hud`（未收录，Claude Code 在 user scope 装着）：资产库行给「收录」，
  来源块无按钮且写「这个来源问不了」，底部两个按钮都在且都可用；
  点「查看文件」列出的是 `~/.claude/plugins/cache/claude-hud/claude-hud/0.8.0` 里的真实树，
  正文读出 `# Claude HUD…`；点「删除插件」冒泡写
  「hub 手上没有这个包的副本，所以这是让 Claude Code 把它撤下来。无法撤销。」
  并列出该目录。
- `superpowers`（已收录）点「查看文件」：列出真实文件树（`.claude-plugin`、`AGENTS.md`…），
  正文读出 `# Superpowers…`——修掉参数名之前这里是空树。
- 越界路径被拒：`?action=file&dir=<包目录>&path=../../../.claude.json`
  返回 `"../../../.claude.json" escapes the directory`。
- 删除确认气泡打开过（只开不确认）。
- 几何对齐 skills：行 56px、砖 28px、胶囊 30px、页脚 40px、分组标题同词。

**没跑到的部分**：

- **没有真的点「卸载」或「删除插件」**——那会改动用户真实的 Claude Code 安装。
  只验证了命令形式：`claude plugin uninstall ponytail@ponytail --scope user --json`
  的参数形状已用不存在的包名试过，exit=1 且报 `not_installed`（带市场限定符的 id
  能被解析，失败以非零码回来）。
- 「已落后 → 按钮变『更新』」这一支没有真实数据（库里没有落后的插件）。
- 弹窗里 `scanned` → `held` → id 的三行查找在 `usePluginLibrary` 钩子内，
  node 自检跑不到（钩子要 React 运行时）；它读的数据半边
  （`PluginHeldBy.id`、`PluginRow.directory`）已在 `check-plugin-rows.ts` 里钉住。
- **开发桥本身没有测试**：`check-plugin-*.ts` 只跑 `src/` 下的代码，`vite.ts`
  的每个动作没有自动化覆盖。参数名不一致就是这么漏掉的。上面的验证全是手工
  调用（curl + 浏览器）。要给桥加测试是另一件事，本次没做。

## 收尾

- 用户确认后归档到 `docs/plans/archive/`。
