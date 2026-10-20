# 把 prompts 改造成 behavior provider

> 本计划取代 `docs/plans/codex-agents-rules-presets.md`（下称「旧计划」）。旧计划里的
> `/codex` 页面、`PlaceFiles.list`、UI kit 扩展、Codex rules / presets 均不再执行；
> 旧文件保留不删，只作为 Codex 文件格式与源码事实的背景资料。
>
> **执行调整（用户 2026-10-20）：先不发版本。** 阶段 4/5 的 `package.json` version、
> `plugin.yaml` engines，以及阶段 6 的版本升号和市场发布全部推迟。本轮保留当前版本号，
> 只做 prompts 契约、Claude Code / Codex 迁移、文档、检查和本地验证；发布前再执行
> §3.9 的版本协调。

## 1. 目标

把 `prompts` 模块从「agent 只注册 places 数据、核心 `deliver.ts` 负责写入」改成和
`plugins`、`mcp` 一样的 behavior provider：

- 核心只提供注册表、页面、共享读取和工具函数，不再知道任何 agent 的目录或文件格式。
- agent 扩展注册 `PromptProvider`，自己实现 `held` / `install` / `remove`。
- 内置 workspace place、Claude Code 扩展、Codex 扩展各自迁移到新 provider。
- 保留旧 Claude Code 0.1.1 的兼容路径，避免 Hub 升级后旧扩展直接失效。
- 测试、类型检查、构建、隔离安装和浏览器验收全部覆盖。

明确不做的事见 §7。

## 2. 现状与已确认事实

### 2.1 Hub 侧

| 事实 | 证据 |
| --- | --- |
| `PromptProvider` 目前只有 `id`、`shared`、`places` 三个字段 | `packages/resources/prompts/src/provider.ts:100` |
| `PromptPlace` 目前是 `commandDir` / `ruleDir` / `agentDir` / `documents` 的数据描述 | `packages/resources/prompts/src/provider.ts:57` |
| `deliver.ts` 统一决定四种落点：command、rule、agents file、document section | `packages/resources/prompts/src/deliver.ts:23`、`:49`、`:124`、`:146` |
| `PromptService` 只做注册表，`register` 是原型方法，生命周期挂在调用方 context 上 | `packages/resources/prompts/src/provider.ts:122` |
| 页面用 `useHolds` / `useHoldsMap` 调 `heldAt`，用 `GenerateItems` 渲染 `Delivery` 菜单 | `src/library.ts:199`、`:244`；`src/install-menu.tsx:69` |
| 页面在 `generate` 里直接调 `deliver` / `undeliver` | `src/page.tsx:484` |
| 内置 workspace place 由 prompts 模块自己注册，`shared: true` | `src/index.ts:64`、`:129` |
| `PlaceFiles` 只有 `read` / `write` / `remove` / `workspace`，没有 `list` | `packages/core/src/place-files.ts:33` |
| `writeFileAtomic` 会 `mkdir(dir, { recursive: true })` | `packages/core/src/host/atomic.ts:27` |
| 远程扩展通过 `inject` 读服务；`ctx.prompts` 是 prompts 模块提供的 Cordis 服务 | `packages/extensions/src/plugin.ts` 的 `inject` 机制；`packages/resources/prompts/src/provider.ts:178` |
| 扩展详情弹窗把 `supports` 的每个值映射到 `extensions.asset.<kind>` | `apps/web/src/components/extension-detail-dialog.tsx:96` |
| `AgentAssetKind` 目前是 `"skill"` / `"mcp"` / `"memory"` / `"hook"` | `packages/extensions/src/types.ts:53` |
| Hub 应用版本来自仓库根 `package.json`，当前 `0.1.0` | `apps/web/server.ts:118`；根 `package.json:3` |
| 中文包覆盖测试会检查英文表里的每个键 | `packages/i18n/zh-cn/__test__/messages.test.ts` |
| 扩展市场索引只保留每个插件的当前版本 | `context-hub-extensions/scripts/build-marketplace.mjs:220` |

### 2.2 扩展侧

| 事实 | 证据 |
| --- | --- |
| Claude Code 0.1.1 只注册旧 `places` 数据，不实现任何写入方法 | `plugins/claude.code/src/index.tsx:77`、`:124` |
| Claude Code 的 `PromptPlace` 在 contracts 里是 `any` | `plugins/claude.code/src/contracts.ts:16` |
| Codex 0.1.0 没有 prompt provider，只有 skills / MCP / plugins | `plugins/codex/src/index.tsx:93` |
| Codex 的 `McpTools` 契约目前没有 `writeTomlString`，但 Hub 的 `mcpTools` 已导出它 | `plugins/codex/src/contracts.ts:49`；`packages/resources/mcp/src/toolkit.ts:112`、`:131` |
| `claude.code` 没有 vitest 配置和 test 脚本；`codex` 有 | 两个包的 `package.json`、`plugins/codex/vitest.config.ts` |
| 扩展源码分支不提交 `lib/` / `marketplace.json`，由 PR 工作流构建 | `context-hub-extensions/README.md` |

### 2.3 Codex 本机事实

`codex-cli 0.144.6` 已在本机确认。用 `codex debug prompt-input` 在临时 `CODEX_HOME` 和临时
cwd 下实测：

- `~/.codex/AGENTS.override.md` 非空时，Codex 只读 override，不读 `~/.codex/AGENTS.md`。
- override 文件为空或只有空白时，Codex 仍读 `AGENTS.md`。
- 项目 `AGENTS.md` 仍然会追加进 prompt input；override 只覆盖用户层。

验证命令（执行阶段 1 重跑一次）：

```bash
T=$(mktemp -d); mkdir -p "$T/home" "$T/project"
printf 'GLOBAL AGENTS BODY\n' > "$T/home/AGENTS.md"
printf 'OVERRIDE BODY\n' > "$T/home/AGENTS.override.md"
cd "$T/project" && CODEX_HOME="$T/home" codex debug prompt-input "hi" \
  | grep -o 'GLOBAL AGENTS BODY\|OVERRIDE BODY'   # 期望只有 OVERRIDE BODY
: > "$T/home/AGENTS.override.md"
cd "$T/project" && CODEX_HOME="$T/home" codex debug prompt-input "hi" \
  | grep -o 'GLOBAL AGENTS BODY\|OVERRIDE BODY'   # 期望只有 GLOBAL AGENTS BODY
rm -rf "$T"
```

Codex agent 文件的字段（`name`、`description`、`developer_instructions`）和
`.codex/agents/**/*.toml` 递归发现规则来自旧计划对 `openai/codex` main 分支源码的引用
（`codex-rs/agent-roles/src/agent_role_config.rs`、`discovery.rs`）。本次没有用 0.144.6
的 CLI 直接验证 agent 发现；执行阶段 1 用下面的命令重读源码，若字段变化以源码为准：

```bash
curl -fsSL https://raw.githubusercontent.com/openai/codex/main/codex-rs/agent-roles/src/agent_role_config.rs \
  | rg -n 'name|description|developer_instructions'
curl -fsSL https://raw.githubusercontent.com/openai/codex/main/codex-rs/agent-roles/src/discovery.rs \
  | rg -n 'agents|toml'
```

`codex debug prompt-input` 不验证 agent 文件，所以它不能作为 agent 字段的运行时证据。

## 3. 契约设计

### 3.1 新契约（细化后的版本）

```ts
export interface PromptFormOption {
  id: string
  labelKey: string
  removeLabelKey?: string
}

export interface PromptForm {
  id: string
  labelKey: string
  removeLabelKey?: string
  options?: readonly PromptFormOption[]
}

export interface PromptPlace {
  id: string
  agent: string
  labelKey: string
  icon: ExtensionIcon
  scope: AssetScope
  order: number
  generatedOnly?: boolean
  where?: string
  forms: readonly PromptForm[]
}

/** key = form.id 或 `${form.id}:${option.id}`；只写 true 的项。 */
export type PromptHeld = Readonly<Record<string, boolean>>

export interface PromptIo {
  files: PlaceFiles
  workspace(): Promise<string | null>
}

export interface PromptProvider {
  id: string
  shared?: boolean
  places: readonly PromptPlace[]
  held(io: PromptIo, place: string, prompt: Prompt): Promise<PromptHeld>
  install(
    io: PromptIo,
    place: string,
    prompt: Prompt,
    form: string,
    option?: string
  ): Promise<void>
  remove(
    io: PromptIo,
    place: string,
    prompt: Prompt,
    form: string,
    option?: string
  ): Promise<boolean>
}

export interface PromptTools {
  slugOf(name: string): string
  describeBody(body: string): string
  commandFile(input: {
    name: string
    description: string
    body: string
    frontmatter: boolean
  }): string
  withSection(
    existing: string | null,
    input: { slug: string; title: string; body: string }
  ): string
  withoutSection(existing: string, slug: string): string | null
  PromptError: new (key: string, params?: Record<string, string>, detail?: string) => Error
}
```

`PromptService`：

```ts
export class PromptService extends Service {
  readonly tools: PromptTools
  providers(): readonly PromptProvider[]
  register(provider: PromptProvider | LegacyPromptProvider): () => void
  providerOf(place: string): PromptProvider | undefined
}
```

相对草案的修正：

- **删除 `PromptInstalled`、`read?`、`locate?`**。v1 没有消费者：页面只问「这个 prompt
  在不在这个位置」，`held` 已经回答；没有「列已安装文件」或「显示文件行号」的界面。
  等真正需要时再加，避免 provider 被迫实现两个没人调用的方法。
- `PromptPlace.forms` 必填；`where` 是给人看的第二行路径（`.claude`、`~/.codex` 等），
  不再从 `commandDir` 推导。
- `PromptService.providerOf` 返回 provider 本身；调用方手里已经有 `PromptPlace`。
- `register` 接受旧 provider，在服务内部归一化（见 §3.3）。`providers()` 永远只返回
  新形状。
- `register` 拒绝重复的 place id：两个 provider 注册同一个 `place.id` 会抛错。否则
  `providerOf` 会把写操作发给错误的 provider。
- `register` 对新旧形状都不匹配的对象直接抛错，不静默登记一个没有 `held` / `install` /
  `remove` 的 provider。

### 3.2 失败与本地化

新增 `src/failure.ts`：

```ts
export interface PromptFailure {
  key: string
  params?: Record<string, string>
  detail?: string
}

export class PromptError extends Error {
  readonly key: string
  readonly params: Record<string, string> | undefined
}

export function promptFailure(error: unknown, fallback: string): PromptFailure
export function failureText(t: (key: string) => string, failure: PromptFailure): string
```

- provider 抛 `tools.PromptError("codex.error.override", { file })`。
- 页面 `refuse` 用 `promptFailure(error, "prompts.error.action")` 归一化，再用
  `failureText(t, failure)` 渲染 toast。
- 非 `PromptError` 的异常显示 fallback 句子；`detail` 写 `console.error`，不上屏。
- provider 自己的 key 在它的 `messages.ts` 里，由 `ctx.locales.register` 提供；页面的
  `t` 能解析所有已注册语言表。

### 3.3 旧 provider 兼容（问题 1）

**推荐：做 legacy adapter。**

旧 Claude Code 0.1.1 的对象形状是：

```ts
{
  id: "hub.target.claude-code",
  places: [{
    id, agent, labelKey, icon, scope, order,
    commandDir, ruleDir, agentDir?, documents?: [{ id, labelKey, removeLabelKey?, file }],
    generatedOnly?
  }]
}
```

新增 `src/legacy.ts`：

- `isLegacyPromptProvider(value)`：`places` 是非空数组，且每个 place 有 `commandDir`、
  没有 `forms`。
- `legacyPromptProvider(old)`：保留 `id` / `shared` / place 的身份字段，按旧字段合成
  forms：
  - `commandDir` → `commands`
  - `ruleDir` → `rule`
  - `agentDir` → `agent`
  - `documents` → 一个 `instructions` form，每个 document 一个 option
  - `where` 从 `commandDir` 的父目录推导；`scope === "global"` 时加 `~/`
  - `generatedOnly` 原样保留
- `held` / `install` / `remove` 直接调用现有 `deliver.ts` 的 `heldAt` / `deliver` /
  `undeliver`，把旧 `Held` 映射成 `PromptHeld`：
  - `commands` / `rule` / `agent` → 同名 key
  - `documents: [id]` → `instructions:<id>` key
- 旧 provider 的 `documents` 文案键（`claudeCode.menu.instructions` 等）原样放进新
  option 的 `labelKey` / `removeLabelKey`，旧扩展的语言表仍然生效。

成本：约 100–150 行新代码加一组测试；`deliver.ts` 本来就存在，不需要新依赖。收益是
Hub 可以先发布，旧扩展不会在过渡期失效。

不做 adapter 的后果：旧 provider 没有 `held` / `install` / `remove`，新页面无法渲染
任何动作，旧 Claude Code 的 prompt 交付会整体停摆，直到用户更新扩展。发布顺序会被迫
变成「扩展先发」，而扩展的 `engines.contextHub` 又要求新 Hub，形成死锁。

adapter 是过渡层，不是新公开契约；计划在 Hub 0.7.0（现有 `engines` 上界）或市场不再
提供 0.1.x 时删除。

### 3.4 UI 数据流（问题 2）

| 位置 | 现在 | 改为 |
| --- | --- | --- |
| `usePromptPlaces` | `promptPlaces(service.providers(), chosen)` | 不变，返回新 `PromptPlace[]` |
| `useHolds` / `useHoldsMap` | 每个 place 调 `heldAt(files, place, prompt)` | `service.providerOf(place.id)`，找不到返回 `{}`；找到则调 `provider.held(io, place.id, prompt)`；单个 place 抛错时记 `{}` 并 `ctx.host.log("warn", ...)` |
| `GenerateItems` | 固定渲染 commands / rule / agent / documents | 遍历 `place.forms`，见下 |
| `onGenerate` | `(place, action: Delivery, document?, remove?)` | `(place, form: string, option?: string, remove?: boolean)` |
| 页面 `generate` | `deliver` / `undeliver` | `provider.install` / `provider.remove` |
| 成功 toast | `prompts.done.commands` 等 | 有 option 用 `prompts.done.document`；否则用 `prompts.done.install`；移除用 `prompts.done.remove` |
| 错误 toast | `failure.message` | `promptFailure` + `failureText` |

菜单渲染规则：

- 一个 form 没有 `options`：渲染一个 `DropdownMenuItem`。已持有且
  `removeLabelKey` 存在时，文案换成 remove 文案、variant 改为 `destructive`。
- 一个 form 有 `options`：渲染 `DropdownMenuSeparator`（不是第一组时）+
  `DropdownMenuLabel`（`t(form.labelKey)`）+ 每个 option 一个 `DropdownMenuItem`。
  option 的持有键是 `${form.id}:${option.id}`。
- `held[form.id]` 只对没有 options 的 form 有意义；有 options 的 form 只看 option 键。
- 提取纯函数 `promptMenu(place, held): PromptMenuGroup[]` 到 `src/menu.ts`，不依赖
  React，可直接单测。
- `holdsSomething(held)` = `Object.values(held).some(Boolean)`。卡片标记、scope tab
  计数、详情弹窗的 `selected` 都改用它；详情弹窗目前只读 `held.commands`，会漏掉
  rule / agent / document，这次一并修正。

`useHolds` 的 `io` 在 effect 内构造：

```ts
const io = { files, workspace: () => files.workspace() }
```

`files === null` 或 `service === null` 时 effect 直接返回。页面级 `generate` 也构造同样
的 `io`。`generate` 写之前还要确认 `place.id` 仍在当前 `places`（按侧栏选择过滤后的
列表）里；不在就报 `prompts.error.unknownPlace`，避免菜单打开后 agent 被取消选择仍然
写入。

### 3.5 内置 workspace place（问题 3）

新增 `src/workspace-provider.ts`，把 `src/index.ts` 里的 `WORKSPACE_PLACE` 搬过去。
`deliver.ts` 的 `generatedUnder` 不再需要：workspace place 直接写 `where: ".agents"`，
legacy adapter 自己从 `commandDir` 推导。

| form | option | 落点 | 文本 |
| --- | --- | --- | --- |
| `commands` | — | `.agents/commands/<slug>.md` | `commandFile({ frontmatter: true })` |
| `rule` | — | `.agents/rules/<slug>.md` | `commandFile({ frontmatter: false })` |
| `agent` | — | `.agents/agents/<slug>.md` | `commandFile({ frontmatter: true })` |
| `instructions` | `agents` | `AGENTS.md` | `withSection` |
| `instructions` | `design` | `DESIGN.md` | `withSection` |

- place 字段：`id: "workspace"`、`agent: "hub.prompt.catalog"`、`shared: true`、
  `scope: "workspace"`、`order: 0`、`generatedOnly: true`、`where: ".agents"`。
- forms 文案继续用 `prompts.menu.*`；新增 form 级 key `prompts.menu.documents`
  （"Add to a project file"）作为 `instructions` 组的标题。
- `held` / `install` / `remove` 内部仍用 `deliver.ts` 的 `heldAt` / `deliver` /
  `undeliver`，但只在本 provider 内使用；核心页面不再直接调用它们。
- `generatedOnly` / `where` 只影响展示：`PlaceChoices` 和详情弹窗对 generatedOnly
  place 显示 `where`，对 agent place 继续显示 `prompts.place.generates` 说明。
  `prompts.place.generates` 的文案改成不枚举具体 form 的通用句子（例如
  "Deliver it with the ⋯ menu"），因为 provider 的 forms 不再固定。scope tab 的
  下拉对每个 place 显示 `where`；global place 会显示 `~/.claude` 这类带 `~/` 的路径
  （旧实现只显示 `.claude`）。

### 3.6 Claude Code provider（问题 4）

新增 `plugins/claude.code/src/prompts.ts`，`index.tsx` 在 `apply` 里：

```ts
ctx.prompts.register(createClaudeCodePrompts(icon, ctx.prompts.tools))
```

两个 place，id 与现在相同，保证旧文件和 marks 合并逻辑不变：

| place | scope | forms | 说明 |
| --- | --- | --- | --- |
| `claude-code` | workspace | `commands`、`rule`、`agent` | 不提供 `instructions`；项目 `CLAUDE.md` 是共享文件，旧实现也刻意不写 |
| `claude-code-global` | global | `commands`、`rule`、`agent`、`instructions`（option `claude`） | `instructions` 写 `~/.claude/CLAUDE.md` |

落点：

| form | option | 文件 |
| --- | --- | --- |
| `commands` | — | `.claude/commands/<slug>.md`，frontmatter |
| `rule` | — | `.claude/rules/<slug>.md`，无 frontmatter |
| `agent` | — | `.claude/agents/<slug>.md`，frontmatter |
| `instructions` | `claude` | `.claude/CLAUDE.md`，marked section |

- workspace place 的 `where: ".claude"`，global place 的 `where: "~/.claude"`。
- `held`：
  - 文件类：`io.files.read(target) !== null`。
  - `instructions`：`io.files.read` 后 `tools.withoutSection(text, slug) !== null`。
- `install`：
  - 文件类：`tools.commandFile({ name, description, body, frontmatter })`。
  - `instructions`：读现有文件，`tools.withSection(existing, { slug, title: name, body })`。
- `remove`：
  - 文件类：不存在返回 `false`，存在则 `files.remove`。
  - `instructions`：`tools.withoutSection` 返回 `null` 表示没有；结果为空白时删文件，
    否则写回。
- 未知 place / form 抛 `tools.PromptError("claudeCode.error.unknownPlace" / ".unknownForm")`。
- 读 / 写失败包成 `PromptError("claudeCode.error.refused", undefined, message)`。
- 旧 `index.tsx` 里的 `promptPlaces(icon)` 数据函数删除；旧 `contracts.ts` 的
  `PromptPlace = any` 替换为完整的 `PromptPlace` / `PromptForm` / `PromptProvider` /
  `PromptIo` / `PromptTools` 镜像类型。
- `plugin.yaml` 的 `inject` 已经包含 `prompts`，不需要改。
- `locations.ts` 增加 Agents 路径并给 `SUPPORTS` 加 `"agent"`：
  - global：`~/.claude/agents/<name>.md`
  - project：`.claude/agents/<name>.md`
  - `format` 保持 "Markdown with YAML frontmatter; JSON for MCP servers and hooks"。

### 3.7 Codex provider（问题 5）

新增 `plugins/codex/src/prompts.ts`，`index.tsx` 注册：

```ts
ctx.prompts.register(createCodexPrompts(ctx.prompts.tools, ctx.mcp.tools))
```

两个 place：

| place | scope | forms | 说明 |
| --- | --- | --- | --- |
| `codex-global` | global | `instructions`、`agent` | `instructions` 写 `~/.codex/AGENTS.md` |
| `codex` | workspace | `agent` | 写 `<workspace>/.codex/agents/<slug>.toml` |

`where`：global 为 `~/.codex`，workspace 为 `.codex`。不注册项目 `AGENTS.md`：它已经由
Hub 的共享 workspace place 覆盖，重复注册会让同一个文件出现两个入口。

**instructions + override**

- 目标：`{ scope: "global", file: ".codex/AGENTS.md" }`。
- `install` 先读 `{ scope: "global", file: ".codex/AGENTS.override.md" }`：
  - 读到非空且 `text.trim() !== ""` → 抛
    `PromptError("codex.error.override", { file: ".codex/AGENTS.override.md" })`，不写
    `AGENTS.md`。
  - 文件不存在或只有空白 → 正常写 marked section。
- `held` 在 override 生效时对 `instructions` 返回 `false`（即使 `AGENTS.md` 里已有
  section）。菜单因此显示「Add to AGENTS.md」而不是「Remove」；点击后 install 抛错，
  页面用 `failureText` 显示本地化 toast。这条链路就是 UI 能显示 override 错误的原因。
- `remove` 不检查 override：如果 `AGENTS.md` 里有 section，仍可移除；UI 在 held=false
  时不会提供 remove，但协议上允许调用方清理。
- 项目级 `AGENTS.override.md` 不在这条路径里。共享 workspace place 写项目 `AGENTS.md`
  时不会检查项目 override；这是已知限制，见 §8。

**agent**

- 目标：`{ scope, file: ".codex/agents/<slug>.toml" }`，scope 由 place 决定。
- 文件名用 `tools.slugOf(prompt.name)`，它已经处理 Unicode 字母/数字、非法字符、
  64 字符上限、`.` / `..` / Windows 保留名（`con`、`com1` 等），空结果会退化成语义
  稳定的 `p<hash>`。
- 文件内容：

```toml
# context-hub:<slug>
name = "<prompt.name>"
description = "<prompt.description.trim() || describeBody(prompt.prompt)>"
developer_instructions = "<normalized prompt body>"
```

- `description` 为空时用 `tools.describeBody(prompt.prompt)` 取正文第一行；Codex 的
  discovered role 要求 description 非空，不能把空串写进去。

- 三个值都用 `ctx.mcp.tools.writeTomlString` 转义：反斜杠、双引号、换行、回车、制表、
  NUL。不新增 TOML 依赖，也不重新序列化整个文件。
- body 在写入前做和 `commandFile` 相同的规范化：去 BOM、`\r\n?` → `\n`、去尾部空白。
- 所有权用第一行 TOML 注释 `# context-hub:<slug>` 判断，不靠 `name` / 内容匹配：
  - `held` = 文件存在且包含这个 marker。
  - `install` = 文件不存在 → 写；存在且含 marker → 覆盖（prompt 编辑后可以更新）；
    存在但没有 marker → 抛 `PromptError("codex.error.agentExists", { file })`，不覆盖
    用户手写的 agent。
  - `remove` = 文件存在且含 marker → 删除并返回 `true`；否则返回 `false`。
- 这样 prompt 改名后 slug 变化，旧 agent 文件会变成孤儿文件；Hub 没有目录列举，无法
  自动清理。与现有 command / rule 的行为一致，见 §8。
- 未知 place / form 抛 `codex.error.unknownPlace` / `codex.error.unknownForm`。
- 读 / 写失败包成 `PromptError("codex.error.refused", { file }, message)`。
- `locations.ts`：
  - `CODEX_AGENT_DIR = ".codex/agents"`
  - `CODEX_GLOBAL_OVERRIDE_FILE = ".codex/AGENTS.override.md"`
  - `SUPPORTS` 增加 `"agent"`
  - `GLOBAL_LOCATIONS` 增加 `{ label: "Agents", path: "~/.codex/agents/<name>.toml" }`
  - `PROJECT_LOCATIONS` 增加 `{ label: "Agents", path: ".codex/agents/<name>.toml" }`
  - `format` 改成 "Markdown skills and instructions; TOML agents, configuration and MCP servers"
    或等价文案。
- `plugin.yaml.inject` 增加 `prompts`；`CodexScope` 增加
  `prompts: { tools: PromptTools; register(provider: PromptProvider): unknown }`。
- `contracts.ts` 的 `McpTools` 增加 `writeTomlString(value: string): string`；
  `__test__/provider.test.ts` 的 fake 补这个方法。

新语言键：

- `codex.menu.instructions` / `.remove`
- `codex.error.override`
- `codex.error.agentExists`
- `codex.error.unknownForm`
- `claudeCode.menu.documents`
- `claudeCode.error.unknownForm`

commands / rule / agent 三个 form 继续用核心的 `prompts.menu.*` 键；Codex 的 agent
form 也用核心键，避免在扩展里重复翻译。

### 3.8 AgentAssetKind（问题 6）

**推荐加 `"agent"`。**

- `packages/extensions/src/types.ts`：`AgentAssetKind` 增加 `"agent"`。
- `packages/extensions/src/builtin/locale-en.ts`：`extensions.asset.agent` = `"Agents"`。
- `packages/i18n/zh-cn/src/messages.ts`：`extensions.asset.agent` = `"智能体"`。
- Codex 的 `SUPPORTS` 加 `"agent"`；Claude Code 的 `SUPPORTS` 也加 `"agent"`，因为它
  确实写 `.claude/agents`，而且这次已经有 provider 支持。
- 只影响扩展详情弹窗的 chip 和 target descriptor 的 `supports`；没有任何投递逻辑按
  这个 union 分支。
- 测试：中文包覆盖测试会自动要求中文键存在；再跑 extensions 和 web typecheck 即可。
  不新增组件测试。

### 3.9 版本与发布（问题 7）

| 仓库 | 当前 | 目标 | 说明 |
| --- | --- | --- | --- |
| Hub 根 `package.json` | `0.1.0` | `0.2.0` | `ctx.host.version` 和 `engines` 比较的对象 |
| prompts 内置模块 manifest | `0.1.0` | `0.2.0` | 仅展示用，跟契约一起改 |
| `plugins/claude.code` | `0.1.1` | `0.2.0` | 新 provider |
| `plugins/codex` | `0.1.0` | `0.2.0` | 新增 prompt provider |

两个扩展的 `plugin.yaml`：

```yaml
engines:
  contextHub: ">=0.2.0 <0.7.0"
```

发布顺序：

1. 先发 Hub `0.2.0`（新契约 + adapter + workspace provider）。旧的 Claude Code 0.1.1
   和 Codex 0.1.0 继续可用；旧 Claude Code 走 adapter，Codex 只是没有 prompt place。
2. 再发 `claude.code` / `codex` `0.2.0`。市场的 `compatibleVersion` 会为 Hub >=0.2.0
   选中新版本；旧 Hub 看到 `engines` 不满足，不会提供更新。
3. `claude.code` 只是升级，不需要数据迁移：新 provider 读的是同一批
   `.claude/commands`、`.claude/rules`、`.claude/agents`、`~/.claude/CLAUDE.md`，marker
   格式也不变。
4. `codex` 0.1.0 升级到 0.2.0 后，Codex 的 prompt places 才出现；不存在旧文件迁移。

市场索引的已知限制：`scripts/build-marketplace.mjs` 每个插件只写当前版本的
`versions[]`。一旦发布 0.2.0，Hub <0.2.0 的用户在市场上会看到「不兼容」，无法重新
安装 Claude Code / Codex。已在机器上安装的旧版本不受影响。如果必须支持旧 Hub 的新装，
需要让市场保留历史版本（本计划不做，见 §8）。

构建产物：两个扩展仓库的源码分支不提交 `lib/` / `marketplace.json`，由 PR 工作流构建。
`plugins/claude.code/README.md` 里「`lib/index.js` is committed」这句与仓库根 README
冲突，这次顺手改成和根 README 一致。

## 4. 实施阶段

### 阶段 1：核实 Codex 事实与基线

**目标**：把 §2.3 的 Codex 行为在本机重跑一遍，并确认两个仓库的基线干净。只读，不改
源码。

**受影响文件**：无。

**具体动作**

1. 跑 §2.3 的 `codex --version`、override 实验、agent 源码 `curl` 检查。`curl` 在
   Bash 默认沙箱下可能没有外网；按 `docs/memory.md`，需要时用
   `dangerouslyDisableSandbox: true`，或改用只读 WebFetch；不要因此跳过，无法验证就
   记录。
2. 跑两仓的基线检查，记录现有失败（如果有）：
   ```bash
   cd "D:/work-space/dsh-context-hub" && pnpm --filter @context-hub/prompts test
   cd "D:/work-space/context-hub-extensions" && pnpm --filter codex test
   ```
3. `git status --short` 两仓，确认没有未提交的生成物。

**验收**

- `codex --version` 输出 `codex-cli 0.144.6`（或本机实际版本；若不同，记录）。
- override 实验的两次 grep 分别只命中 `OVERRIDE BODY` 和 `GLOBAL AGENTS BODY`。
- agent 源码检查能看到 `name`、`description`、`developer_instructions`；如果网络不可用，
  在计划里记录「agent 字段未在本次环境重验，按旧计划源码引用执行」。
- 基线测试全绿；若有既有失败，记录在任务日志，不把它们算到本次改动上。

**依赖**：无。

---

### 阶段 2：切换 prompts 核心到 behavior provider

**目标**：Hub 的 prompts 模块完成契约、注册表、工具、内置 workspace provider、legacy
adapter 和页面数据流切换。阶段结束时 Hub 可运行，旧 Claude Code 扩展仍能工作。

**受影响文件（Hub）**

- `packages/resources/prompts/src/provider.ts`
- `packages/resources/prompts/src/failure.ts`（新）
- `packages/resources/prompts/src/toolkit.ts`（新）
- `packages/resources/prompts/src/held.ts`（新）
- `packages/resources/prompts/src/menu.ts`（新）
- `packages/resources/prompts/src/workspace-provider.ts`（新）
- `packages/resources/prompts/src/legacy.ts`（新）
- `packages/resources/prompts/src/deliver.ts`
- `packages/resources/prompts/src/library.ts`
- `packages/resources/prompts/src/install-menu.tsx`
- `packages/resources/prompts/src/page.tsx`
- `packages/resources/prompts/src/prompt-detail-dialog.tsx`
- `packages/resources/prompts/src/parts.tsx`
- `packages/resources/prompts/src/index.ts`
- `packages/resources/prompts/src/contract.ts`
- `packages/resources/prompts/src/messages.ts`
- `packages/resources/prompts/__test__/provider.test.ts`
- `packages/resources/prompts/__test__/delivery.test.ts`
- `packages/resources/prompts/__test__/text.test.ts`
- `packages/resources/prompts/__test__/toolkit.test.ts`（新）
- `packages/resources/prompts/__test__/workspace.test.ts`（新）
- `packages/resources/prompts/__test__/legacy.test.ts`（新）
- `packages/resources/prompts/__test__/menu.test.ts`（新）
- `docs/extensions.md`

**具体动作**

1. **契约与工具**
   - `provider.ts` 按 §3.1 替换类型和 `PromptService`；增加 `providerOf`、`tools`、
     legacy 参数、重复 place id 检查。`provider.ts` 对 `legacy.ts` 的类型用
     `import type`，`legacy.ts` 对 `provider.ts` 的类型也用 `import type`；运行时只有
     `provider.ts` 从 `legacy.ts` 取 `legacyPromptProvider` 值，避免循环依赖。
   - `failure.ts` 增加 `PromptFailure` / `PromptError` / `promptFailure` /
     `failureText`。
   - `toolkit.ts` 组装 `promptTools`：`slugOf`（`slug.ts`）、`describeBody` /
     `commandFile`（`command-file.ts`）、`withSection` / `withoutSection`
     （`instruction.ts`）、`PromptError`。
   - `contract.ts` 导出新类型和 `PromptService`；不再导出 `PromptDocument`。
   - `index.ts` 导出新契约；删除 `deliver` / `delivered` / `targetOf` / `undeliver` /
     `heldAt` / `Held` / `Delivery` 的包级导出（这些仍是包内实现）。
2. **内部投递逻辑**
   - `deliver.ts` 的 `PromptPlace` 参数改成新的 `DeliveryPlace`：
     `{ id, scope, commandDir, ruleDir, agentDir?, documents?: { id, labelKey,
     removeLabelKey?, file }[] }`。函数名、marker 格式、frontmatter 规则、换行保留
     逻辑全部不变。
   - `generatedUnder` 删除；`where` 由 provider 显式提供。
   - `Held` / `NOTHING_HELD` / `heldAt` 保留在 `deliver.ts`，只给内置 workspace
     provider 和 legacy adapter 用。
   - `heldMarks` / `holdsSomething` / `HeldMark` 移到 `held.ts`，改用
     `PromptHeld`；`parts.tsx` 改从这里导入。
3. **内置 workspace provider**
   - 新增 `workspace-provider.ts`，把 `WORKSPACE_PLACE` 的目录/文档定义改成
     `DeliveryPlace` + `PromptPlace.forms`，`where: ".agents"`，`generatedOnly: true`。
   - `held` / `install` / `remove` 用 §3.5 的映射调用 `heldAt` / `deliver` / `undeliver`。
   - `index.ts` 改为 `service.register(workspacePromptProvider())`。
4. **legacy adapter**
   - 新增 `legacy.ts`，按 §3.3 实现 `isLegacyPromptProvider` 和
     `legacyPromptProvider`。
   - `PromptService.register` 先检测旧形状，再归一化；对旧 provider 和新 provider 都做
     重复 place id 检查。
5. **UI 数据流**
   - `library.ts`：新增 `usePromptService`；`useHolds` / `useHoldsMap` 改用
     `provider.held`；`Holds` 类型改成 `Readonly<Record<string, PromptHeld>>`；单个
     place 失败时写 `ctx.host.log("warn", ...)`。
   - `menu.ts`：`PromptMenuGroup` / `PromptMenuEntry` / `promptMenu` 纯函数。
   - `install-menu.tsx`：`DeliveryRun` 改成 `(place, form, option?, remove?)`；
     `GenerateItems` 按 §3.4 渲染；`PlaceChoices` 的 `selected` 改
     `holdsSomething`；`where` 读 `place.where`。
   - `page.tsx`：`generate` 从 `service.providerOf(place.id)` 取 provider，先用当前
     `places` 确认 place 仍可选，构造 `PromptIo`，调 `install` / `remove`；toast 按
     §3.4；`scopePlaces` 的 `where` 读 `place.where`；`CardProps` / `LedgerAction`
     的 `Delivery` 换成 `form` / `option`。批量动作只写不删：`BatchActions` 的回调
     忽略 `remove`，对每个勾选 prompt 调 `install`。
   - `prompt-detail-dialog.tsx`：`PlacesSection` / `InfoPanel` / `Lightbox` 的
     `Delivery` 换成 `form` / `option`；`selected` 改 `holdsSomething`；`where` 读
     `place.where`；`NOTHING_HELD` 改成 `{}`。
6. **文案**
   - 新增：`prompts.menu.documents`、`prompts.done.install`、
     `prompts.error.action`、`prompts.error.noFiles`、`prompts.error.unknownPlace`、
     `prompts.error.unknownForm`。
   - 删除不再使用的：`prompts.done.commands`、`prompts.done.agent`、
     `prompts.done.rule`、`prompts.menu.blocked`（用 `prompts.error.noFiles` 代替）。
   - `prompts.place.generates` 改成不枚举具体 form 的通用句子。
   - 同步 `packages/i18n/zh-cn/src/messages.ts`。
7. **测试**
   - `provider.test.ts`：用 `new Context()` 测 `PromptService`；新 fixtures 带
     `forms`；`promptPlaces` 的作用域/顺序/`where` 传递；`providerOf`；重复 place id
     抛错；新旧都不匹配的 provider 抛错；`register` 返回 disposer。
   - `toolkit.test.ts`：`promptTools` 的装配（`slugOf` / `commandFile` /
     `withSection` / `withoutSection` 是同一批函数）、`PromptError` / `failureText`。
     slug / commandFile / section 的行为继续由现有 `text.test.ts` 覆盖，不重复写。
   - `workspace.test.ts`：用临时 `home` / `folder` / `userHome` 的真实
     `createFsPlaceFiles`，覆盖五条落点、held、remove、`instructions` 的 CRLF 保留。
   - `legacy.test.ts`：旧 provider 的 places 自动变成 forms；旧 `Held` 映射成
     `PromptHeld`；install/remove 走 `deliver`/`undeliver`；旧文档 option 的 label
     键保留。
   - `menu.test.ts`：无 options 的 form、有 options 的 form、held 键、remove 文案
     选择、form 标签分组。
   - `delivery.test.ts`：fixtures 改用 `DeliveryPlace`；保留原有的落点/CRLF/路径
     逃逸断言；`heldMarks` / `holdsSomething` 的断言改从 `held.ts` 导入并使用
     `PromptHeld`。
   - `text.test.ts`：`targetOf` 的 fixtures 改用 `DeliveryPlace`；slug / commandFile /
     section 的行为断言不变。
8. **文档**
   - `docs/extensions.md` 增加 "Prompt providers"：`inject: [prompts]`、新类型、
     `held` 键规则、`PromptTools`、`PromptError`、legacy adapter、0.7.0 移除计划。

**验收**

```bash
cd "D:/work-space/dsh-context-hub"
pnpm --filter @context-hub/prompts test
pnpm --filter @context-hub/prompts typecheck
pnpm --filter @context-hub/prompts lint
pnpm --filter web typecheck
pnpm --filter web build
```

- 上述命令全绿。
- `prompts` 包的测试数量不少于改动前，且新增 `toolkit` / `workspace` / `legacy` /
  `menu` 四个测试文件。
- `pnpm --filter @context-hub/prompts test` 里的 `provider.test.ts` 能证明旧形状
  provider 通过 `register` 后 `providers()[0].places[0].forms` 非空。
- 页面构建通过，说明 `GenerateItems` / `page` / detail 的类型切换完整。

**依赖**：阶段 1 只用于 Codex 事实，不阻塞本阶段。

---

### 阶段 3：增加 AgentAssetKind 与语言键

**目标**：让扩展详情弹窗能显示 "Agents" chip，为阶段 5 的 Codex target 做准备。

**受影响文件**

- `packages/extensions/src/types.ts`
- `packages/extensions/src/builtin/locale-en.ts`
- `packages/i18n/zh-cn/src/messages.ts`

**具体动作**

1. `AgentAssetKind` 增加 `"agent"`。
2. en 增加 `extensions.asset.agent`: `"Agents"`。
3. zh-cn 增加 `extensions.asset.agent`: `"智能体"`。
4. 不改任何投递逻辑、target descriptor 或页面组件。

**验收**

```bash
cd "D:/work-space/dsh-context-hub"
pnpm --filter @context-hub/extensions test
pnpm --filter @context-hub/zh-cn test
pnpm --filter web typecheck
```

- 全绿；中文包覆盖测试不再报缺键。
- `rg -n '"agent"' packages/extensions/src/types.ts` 能看到 union 值。
- `rg -n 'extensions.asset.agent' packages/extensions/src/builtin/locale-en.ts packages/i18n/zh-cn/src/messages.ts` 两处都命中。

**依赖**：无；可与阶段 2 并行。阶段 5 依赖本阶段。

---

### 阶段 4：迁移 Claude Code 扩展

**目标**：Claude Code 0.2.0 自己实现 prompt provider，不再向 Hub 注册数据描述。

**受影响文件（`D:\work-space\context-hub-extensions`）**

- `plugins/claude.code/src/contracts.ts`
- `plugins/claude.code/src/prompts.ts`（新）
- `plugins/claude.code/src/index.tsx`
- `plugins/claude.code/src/locations.ts`
- `plugins/claude.code/src/messages.ts`
- `plugins/claude.code/package.json`
- `plugins/claude.code/plugin.yaml`
- `plugins/claude.code/README.md`
- `plugins/claude.code/tsconfig.json`
- `plugins/claude.code/vitest.config.ts`（新）
- `plugins/claude.code/__test__/prompts.test.ts`（新）

**具体动作**

1. `contracts.ts` 增加 prompt 镜像类型：
   `PromptFormOption` / `PromptForm` / `PromptPlace` / `PromptHeld` / `PromptIo` /
   `PromptProvider` / `PromptTools` / `PromptErrorConstructor`。把原来的
   `PromptPlace = any` 删掉。
2. 新增 `src/prompts.ts`，按 §3.6 实现 `createClaudeCodePrompts(icon, tools)`：
   - 两个 place、forms、`where`。
   - `held` / `install` / `remove`。
   - `targetOf(place, form, option, prompt)` 内部函数，统一用 `tools.slugOf`。
   - 所有未知输入和读写失败包成 `tools.PromptError`。
3. `index.tsx` 删除 `promptPlaces(icon)`；改为
   `ctx.prompts.register(createClaudeCodePrompts(icon, ctx.prompts.tools))`。
4. `locations.ts`：
   - `SUPPORTS` 增加 `"agent"`。
   - `GLOBAL_LOCATIONS` 增加 `Agents`：`~/.claude/agents/<name>.md`。
   - `PROJECT_LOCATIONS` 增加 `Agents`：`.claude/agents/<name>.md`。
   - `format` 文案保持准确。
5. `messages.ts` 增加：
   - `claudeCode.menu.documents`: "Add to a memory file"
   - `claudeCode.error.unknownForm`: "Claude Code has no prompt action called {form}."
   - 旧的 `claudeCode.menu.instructions` / `.remove` 保留。
6. `package.json`：
   - `version: "0.2.0"`。
   - 增加 `"test": "vitest run"`。
   - devDependencies 增加 `vitest`（与 `plugins/codex` 同版本，`^5.0.5`）。
7. `vitest.config.ts` 照 `plugins/codex/vitest.config.ts`，`include:
   ["__test__/**/*.test.ts"]`，name `"claude.code"`。`tsconfig.json` 的
   `include` 从 `["src"]` 改成 `["src", "__test__"]`，让测试也进 typecheck。
8. `plugin.yaml`：`engines.contextHub: ">=0.2.0 <0.7.0"`；description 改成包含 prompts；
   `inject` 不变。
9. `README.md`：登记 `src/prompts.ts`、prompt 落点、`pnpm --filter "claude.code" test`；
   把「lib/index.js is committed」改成和仓库根 README 一致的「CI 在 PR 分支构建」。
10. `__test__/prompts.test.ts` 用 fake `PromptIo`（内存 map）和 fake `PromptTools`
    （真实 `slugOf` / `commandFile` / section 逻辑可以直接在测试里重写一份最小实现，
    或用 stub 记录调用）：
    - place/forms 形状；workspace 没有 `instructions`；global 有。
    - command 有 frontmatter、rule 没有、agent 有。
    - CLAUDE.md 的 marked section 幂等；remove 保留其他文本；只有 section 时删文件。
    - held 对文件存在 / section 存在分别返回正确 key。
    - 未知 place / form 抛对应 key。
    - 读写失败包成 `claudeCode.error.refused`。

**验收**

```bash
cd "D:/work-space/context-hub-extensions"
pnpm --filter "claude.code" test
pnpm --filter "claude.code" typecheck
pnpm --filter "claude.code" build
```

- 全绿；`lib/index.js` 构建成功。
- `plugin.yaml` 没有 `version` / `entry`；`engines.contextHub` 是 `>=0.2.0 <0.7.0`。
- `src/index.tsx` 里不再有 `commandDir` / `ruleDir` / `agentDir` / `documents` 的
  数据描述。
- 测试里至少覆盖 global / workspace 两个 place 和四种 form。

**依赖**：阶段 2（契约与工具）、阶段 3（`AgentAssetKind` 的 `"agent"` 值）。本阶段给
`SUPPORTS` 加 `"agent"`，没有阶段 3 会类型检查失败。

---

### 阶段 5：新增 Codex prompt provider

**目标**：Codex 0.2.0 提供全局 `instructions` 和 user/workspace `agent` 两个能力，
不写项目 `AGENTS.md`。

**受影响文件**

- `plugins/codex/src/contracts.ts`
- `plugins/codex/src/prompts.ts`（新）
- `plugins/codex/src/index.tsx`
- `plugins/codex/src/locations.ts`
- `plugins/codex/src/messages.ts`
- `plugins/codex/package.json`
- `plugins/codex/plugin.yaml`
- `plugins/codex/README.md`
- `plugins/codex/__test__/prompts.test.ts`（新）
- `plugins/codex/__test__/provider.test.ts`
- `packages/resources/mcp/__test__/mcp-tools.test.ts`（Hub 侧，补 `writeTomlString` 断言）

**具体动作**

1. `contracts.ts`：
   - 增加 §3.1 的 prompt 镜像类型。
   - `CodexScope` 增加 `prompts`。
   - `McpTools` 增加 `writeTomlString(value: string): string`。
2. 新增 `src/prompts.ts`，按 §3.7 实现 `createCodexPrompts(promptTools, mcpTools)`：
   - 两个 place 和 forms。
   - `instructions` 的 override 检查、held、install、remove。
   - `agent` 的 marker、TOML 文本、held、install、remove。
   - `targetOf` 用 `place.scope` + `tools.slugOf(prompt.name)`。
   - 所有错误包成 `tools.PromptError`。
3. `index.tsx`：注册 `createCodexPrompts(ctx.prompts.tools, ctx.mcp.tools)`；保留
   skills / mcp / plugins / targets / locales 注册。
4. `locations.ts`：按 §3.7 增加常量、locations、`SUPPORTS`、`format`。
5. `messages.ts`：增加 §3.7 的键；`codex.error.refused` 和
   `codex.error.unknownPlace` 复用。
6. `package.json`：`version: "0.2.0"`。
7. `plugin.yaml`：`engines.contextHub: ">=0.2.0 <0.7.0"`；`inject` 增加 `prompts`；
   description 更新。
8. `README.md`：登记 prompt provider、两个 place、override 行为、agent TOML 格式、
   `pnpm --filter codex test`。
9. `__test__/provider.test.ts`：给 `fakeTools` 补 `writeTomlString: (value) =>
   JSON.stringify(value)`（或等价的最小转义），否则 `McpTools` 类型不满足。
10. `__test__/prompts.test.ts`：
    - places/forms：global 有 instructions + agent，workspace 只有 agent。
    - instructions：正常写 marked section；override 非空时 `held` 返回 false、
      `install` 抛 `codex.error.override`、`AGENTS.md` 不变；override 清空后 install
      成功；remove。
    - agent：文件路径用 slug + `.toml`；内容含 marker、name、description、
      developer_instructions；测试用 fake `writeTomlString` 记录调用并返回可断言的
      文本；真实转义由 Hub 的 `mcp-tools.test.ts` 覆盖；prompt.description 为空时
      description 使用 `describeBody(prompt.prompt)` 且非空。
    - agent held：marker 存在为 true；文件不存在为 false；用户手写文件（无 marker）
      install 抛 `codex.error.agentExists`，remove 返回 false。
    - 带 marker 的旧文件可以被 install 覆盖（prompt 编辑后仍可更新）。
    - 未知 place / form。
    - 文件名直接使用 `tools.slugOf` 的返回值；保留名/Unicode 规则由 Hub 的
      `toolkit.test.ts` 覆盖，Codex 测试只断言路径为 `${tools.slugOf(name)}.toml`。
11. Hub 侧在 `packages/resources/mcp/__test__/mcp-tools.test.ts` 增加
    `writeTomlString` 的断言：反斜杠、双引号、换行、回车、制表、NUL 都被转义；这是
    Codex agent 文件依赖的转义规则。

**验收**

```bash
cd "D:/work-space/context-hub-extensions"
pnpm --filter codex test
pnpm --filter codex typecheck
pnpm --filter codex build

cd "D:/work-space/dsh-context-hub"
pnpm --filter @context-hub/mcp test -- mcp-tools
```

- 全绿；现有 `__test__/installer.test.ts` 和 `__test__/provider.test.ts` 不变红。
- `plugin.yaml` 的 `inject` 包含 `prompts`。
- `src/index.tsx` 不含任何 `.codex/agents` 或 `.codex/AGENTS.md` 的字面路径；路径都在
  `locations.ts` / `prompts.ts`。
- `AGENTS.override.md` 的测试用 fake `PlaceFiles` 覆盖「非空 / 空 / whitespace / 不存在」
  四种输入。

**依赖**：阶段 2（契约）、阶段 3（`"agent"` chip）。阶段 4 不阻塞本阶段。

---

### 阶段 6：版本、文档与跨仓验收

**目标**：把两仓版本、扩展 engines、文档和隔离安装验收收尾。

**受影响文件**

- `D:/work-space/dsh-context-hub/package.json`
- `packages/resources/prompts/src/index.ts`（内置 manifest 版本）
- `docs/extensions.md`（若阶段 2 没写完）
- `D:/work-space/context-hub-extensions/plugins/claude.code/{package.json,plugin.yaml,README.md}`
- `D:/work-space/context-hub-extensions/plugins/codex/{package.json,plugin.yaml,README.md}`

**具体动作**

1. **本轮跳过版本项**（见顶部执行调整）：不改 Hub 根 `package.json`、prompts 内置
   manifest 版本、两个扩展的 `package.json` version、`plugin.yaml` engines，也不做市场
   发布。本地验证通过后再按 §3.9 执行。
2. `docs/extensions.md` 补齐 prompt provider 契约、legacy adapter、0.7.0 移除计划。
3. 两仓 README / plugin.yaml description 与新能力一致。
4. 跑完整检查（见 §5）。
5. 隔离安装 + ego-browser（见 §6）。
6. 清理临时目录，只杀自己启动的端口进程。

**验收**

```bash
cd "D:/work-space/dsh-context-hub"
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web build

cd "D:/work-space/context-hub-extensions"
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- 两仓的 lint / typecheck / test / build 全绿；无法运行的检查在汇报里写明原因。
- §6 的浏览器清单全部通过。
- `git status --short` 两仓只包含本计划的源码/文档；没有 `lib/`、`marketplace.json`、
  临时 fixture 或被误改的生成物。
- 真实 `~/.codex`、`~/.claude`、`~/.agents` 内容/mtime 未被验收过程修改。

**依赖**：阶段 1–5。

## 5. 测试矩阵

| 层 | 覆盖内容 | 命令 |
| --- | --- | --- |
| prompts 核心 | provider registry / `providerOf` / 重复 place id / `promptPlaces` | `pnpm --filter @context-hub/prompts test -- provider` |
| prompts 工具 | `promptTools` 装配、`PromptError` / `failureText`；slug / 文件 / section 行为沿用 `text.test.ts` | `pnpm --filter @context-hub/prompts test -- toolkit text` |
| 内置 workspace provider | 五条落点、held、remove、CRLF、路径逃逸 | `pnpm --filter @context-hub/prompts test -- workspace` |
| legacy adapter | 旧 places → forms、旧 Held → PromptHeld、install/remove | `pnpm --filter @context-hub/prompts test -- legacy` |
| 菜单纯逻辑 | form / option / held key / remove 文案 | `pnpm --filter @context-hub/prompts test -- menu` |
| 旧投递回归 | `deliver.ts` 的落点、frontmatter、marker、CRLF | `pnpm --filter @context-hub/prompts test -- delivery` |
| 资产类型 | `extensions.asset.agent` 中英文键 | `pnpm --filter @context-hub/extensions test`；`pnpm --filter @context-hub/zh-cn test` |
| Claude Code provider | place/forms、目标路径、held、remove、错误 key | `pnpm --filter "claude.code" test` |
| Codex provider | instructions/override、agent TOML、marker、slug、错误 key | `pnpm --filter codex test` |
| Hub MCP 工具 | `writeTomlString` 的引号/反斜杠/CR/LF/tab/NUL 转义 | `pnpm --filter @context-hub/mcp test -- mcp-tools` |
| Web 类型/构建 | 页面和详情弹窗的类型切换 | `pnpm --filter web typecheck`；`pnpm --filter web build` |
| Hub 全量 | 所有包 | `pnpm lint`；`pnpm typecheck`；`pnpm test`；`pnpm --filter web build` |
| 扩展全量 | 所有插件 | `pnpm lint`；`pnpm typecheck`；`pnpm test`；`pnpm build` |
| 浏览器 | 页面交互、真实落盘、override toast | ego-browser，见 §6 |

页面 DOM 交互不新增 jsdom / Testing Library。纯逻辑抽到 `menu.ts` / `provider.ts` /
`prompts.ts` 用 vitest 覆盖；真实点击用 ego-browser。

## 6. 本地安装与 ego-browser 验收

> 目标：在临时 hub home、临时 user home、临时 workspace 里验收；不写真实
> `~/.codex`、`~/.claude`、`~/.context-hub`。

### 6.1 构建

```bash
cd "D:/work-space/dsh-context-hub"
pnpm --filter web build

cd "D:/work-space/context-hub-extensions"
pnpm --filter codex build
pnpm --filter "claude.code" build
```

### 6.2 准备隔离目录

```bash
TMP_ROOT=$(mktemp -d)
TMP_HUB="$TMP_ROOT/hub"
TMP_USER="$TMP_ROOT/user"
TMP_WS="$TMP_ROOT/workspace"
mkdir -p "$TMP_HUB/state" "$TMP_HUB/extensions" "$TMP_USER" "$TMP_WS"

mkdir -p "$TMP_HUB/extensions/codex" "$TMP_HUB/extensions/claude.code"
cp -R "D:/work-space/context-hub-extensions/plugins/codex/lib" \
      "D:/work-space/context-hub-extensions/plugins/codex/assets" \
      "D:/work-space/context-hub-extensions/plugins/codex/plugin.yaml" \
      "D:/work-space/context-hub-extensions/plugins/codex/package.json" \
      "$TMP_HUB/extensions/codex/"
cp -R "D:/work-space/context-hub-extensions/plugins/claude.code/lib" \
      "D:/work-space/context-hub-extensions/plugins/claude.code/assets" \
      "D:/work-space/context-hub-extensions/plugins/claude.code/plugin.yaml" \
      "D:/work-space/context-hub-extensions/plugins/claude.code/package.json" \
      "$TMP_HUB/extensions/claude.code/"

cat > "$TMP_HUB/state/extensions.json" <<'EOF'
{
  "hub.locale.en": false,
  "hub.skill.catalog": true,
  "hub.prompt.catalog": true,
  "hub.mcp.servers": true,
  "hub.plugin.catalog": true,
  "hub.variable.catalog": true,
  "hub.search.palette": true,
  "hub.locale.zh-CN": true,
  "codex": true,
  "claude.code": true
}
EOF

# 让 os.homedir() 指向临时 user home
USERPROFILE="$(cygpath -w "$TMP_USER")" HOME="$TMP_USER" \
  node -e "console.log(require('os').homedir())"
```

### 6.3 启动隔离 server

```bash
cd "D:/work-space/dsh-context-hub"
CONTEXT_HUB_HOME="$TMP_HUB" \
USERPROFILE="$(cygpath -w "$TMP_USER")" HOME="$TMP_USER" \
node apps/web/server.ts --static apps/web/dist --port 5273 \
  --home "$TMP_HUB" --folder "$TMP_WS"
```

- 端口 5273 是本任务自己的；被占用就换一个自己写下的端口，不要按端口猜着杀进程。
- 一个 hub home 同时只能有一个 server；不要和用户已有的 dev server 共用 `TMP_HUB`。
- 用 ego-browser 打开 `http://127.0.0.1:5273/prompts`。
- 在侧栏的 Agent 菜单里勾选 Claude Code 和 Codex；这会把选择写进临时
  `state/workspaces.json`，不会动真实目录。

### 6.4 浏览器验收清单

| 操作 | 期望 |
| --- | --- |
| 提示词页 | 卡片和详情弹窗都能打开；`安装` 菜单列出 Workspace、Claude Code（工作区/全局）、Codex（工作区/全局） |
| Workspace 菜单 | 生成 Commands / Rule / Agents file，以及 "Add to a project file" 下的 AGENTS.md / DESIGN.md |
| Workspace 落点 | `.agents/commands/<slug>.md` 有 frontmatter；`.agents/rules/<slug>.md` 没有；`.agents/agents/<slug>.md` 有；`AGENTS.md`/`DESIGN.md` 有 marker 且保留原文本 |
| Claude Code 工作区 | `.claude/commands/<slug>.md`、`.claude/rules/<slug>.md`、`.claude/agents/<slug>.md` 分别生成；没有 "Add to CLAUDE.md" |
| Claude Code 全局 | `~/.claude/...` 三个目录生成；`~/.claude/CLAUDE.md` 增加 marked section |
| Codex 全局 instructions | `~/.codex/AGENTS.md` 增加 marked section；菜单显示 Remove |
| Codex override | 在 `~/.codex/AGENTS.override.md` 写入非空内容；Codex 的 "Add to AGENTS.md" 仍显示（held=false）；点击后 toast 显示 `codex.error.override` 的本地化文案，`AGENTS.md` 不变；清空 override 后再点，section 写入 |
| Codex agent 工作区 | `<TMP_WS>/.codex/agents/<slug>.toml` 出现，首行 `# context-hub:<slug>`，字段 name/description/developer_instructions 正确 |
| Codex agent 全局 | `~/.codex/agents/<slug>.toml` 出现 |
| 用户手写 agent | 在 `<TMP_WS>/.codex/agents/<slug>.toml` 放一个无 marker 的同名文件；点击生成应报 `codex.error.agentExists`，文件不被覆盖 |
| held 勾选 | 每次安装后，卡片/详情/菜单的勾选和 Remove 文案立即更新；移除后回到 Add |
| 详情弹窗 | 位置列表的 `selected` 对任意 form 都为真（不再只看 commands） |
| 错误本地化 | override toast 是中文/英文句子，不是 `codex.error.override` 裸 key |
| 旧扩展 adapter | 另一个临时 home 只启用一个 fixture legacy provider（或旧 `claude.code/lib/index.js`）；提示词页能列出它的工作区/全局 place，能写/删 command、rule、agent 和 document section |
| 旧 Claude Code 升级 | 在临时 home 先装 `claude.code` 0.1.1，再替换为 0.2.0；旧 provider 的 disposer 先运行，不出现 duplicate place id；已有 prompt 文件和 held 状态保持 |
| 真实目录 | 验收前后 `~/.codex`、`~/.claude`、`~/.agents` 的 mtime/内容不变（本次用的是临时 `USERPROFILE`） |

fixture legacy provider 的最小形状（放在 `$TMP_HUB/extensions/legacy.claude/`；同目录还要
有 `package.json`（`main: "index.js"`）和 `plugin.yaml`）：

```js
// index.js
export function apply(ctx) {
  ctx.prompts.register({
    id: "hub.target.legacy",
    places: [
      {
        id: "legacy-workspace",
        agent: "hub.target.legacy",
        labelKey: "legacy.tab",
        icon: () => null,
        scope: "workspace",
        commandDir: ".legacy/commands",
        ruleDir: ".legacy/rules",
        agentDir: ".legacy/agents",
        order: 20,
      },
      {
        id: "legacy-global",
        agent: "hub.target.legacy",
        labelKey: "legacy.tab",
        icon: () => null,
        scope: "global",
        commandDir: ".legacy/commands",
        ruleDir: ".legacy/rules",
        agentDir: ".legacy/agents",
        documents: [{
          id: "memory",
          labelKey: "legacy.menu.memory",
          removeLabelKey: "legacy.menu.memory.remove",
          file: ".legacy/MEMORY.md",
        }],
        order: 20,
      },
    ],
  })
}
```

`plugin.yaml` 用 `inject: [prompts, targets, locales]`；再注册一个 `targets` 条目，让
侧栏能选中 `hub.target.legacy`。`locales.register` 里放 `legacy.tab`、
`legacy.menu.memory`、`legacy.menu.memory.remove` 三个英文键。这条 fixture 只放在临时
目录，不提交仓库。

### 6.5 收尾

```bash
# 只杀自己起的 5273
netstat -ano | grep ":5273" | grep LISTENING
# 记下 PID 后
taskkill //F //PID <pid>

rm -rf "$TMP_ROOT"
```

- 复查真实 `~/.codex`、`~/.claude`、`~/.context-hub` 未被修改。
- `git status --short` 两仓只显示预期源码/文档；没有 `lib/`、`marketplace.json`、
  临时 fixture。

## 7. 不做

- 不做 Codex `.rules` / exec policy / `prefix_rule`。
- 不做 Codex preset（`[tui.presets.<slot>]`）。
- 不做 Codex skill form；skills 已由 skills 插件负责。
- 不给 `PlaceFiles` 加 `list`；不新增目录列举。
- 不新增 `/codex` 页面。
- 不扩展 `ctx.ui` / UI kit；扩展不渲染新的 React 页面。
- 不新增 Hub 的 asset library / provider / search provider；只给 `AgentAssetKind` 加
  `"agent"` 这个显示值。
- 不新增运行时依赖；不引入 jsdom / Testing Library / TOML 解析库。
- 唯一可能新增的 devDependency 是 `plugins/claude.code` 的 `vitest`（复用
  `plugins/codex` 的版本），用于满足 §5 的 Claude Code provider 单测；如果审批时
  拒绝，则 Claude Code provider 改为只做 typecheck/build/browser 验收。
- 不改 prompt 库的存储格式（`prompts.json` + 每个 prompt 的 markdown），不做迁移。
- 不改 prompt 卡片/详情弹窗的视觉设计；只改菜单分组、成功文案和 `where` 的显示。
- 不改 MCP / plugins / skills 模块的行为；`AgentAssetKind` 和语言键除外。
- 不检查项目级 `AGENTS.override.md`；也不写任何 `AGENTS.override.md` 文件。
- 不写用户的真实 `~/.codex` / `~/.claude`。
- 不删除旧计划文件 `docs/plans/codex-agents-rules-presets.md`。
- 不实现 `PromptProvider.read` / `locate`；v1 没有消费者。

## 8. 风险与待确认

1. **legacy adapter（推荐做）**
   - 成本约 100–150 行 + 测试；不新增依赖。
   - 不做会让旧 Claude Code 0.1.1 在 Hub 0.2.0 上失去 prompt 交付，发布顺序会死锁。
   - adapter 在 Hub 0.7.0 或市场不再提供 0.1.x 时删除。

2. **Codex override 行为**
   - 已在 `codex-cli 0.144.6` 上实测：非空 override 覆盖 `~/.codex/AGENTS.md`；空或
     空白 override 不覆盖。
   - 如果未来 Codex 改变语义，用 §2.3 的 `codex debug prompt-input` 重跑。
   - 项目级 `AGENTS.override.md` 不在共享 workspace place 的检查范围；Codex 用户项目
     里存在 override 时，Hub 仍会在项目 `AGENTS.md` 里显示已安装，但 Codex 实际不读。
     这是已知限制；要修需要让 workspace place 知道 Codex 语义，超出本次 scope。

3. **Codex agent 字段与发现规则**
   - 来自旧计划对 `openai/codex` main 分支源码的引用，本次没有用 0.144.6 CLI 直接
     验证 agent 发现。
   - 阶段 1 的 `curl` 检查若失败或字段变化，以源码为准；不要凭记忆写死。
   - `codex debug prompt-input` 不验证 agent 文件，不能拿它当 agent 字段的证据。

4. **`AgentAssetKind` 加 `"agent"`**
   - 只是详情弹窗 chip 和 target descriptor 的显示值；没有投递逻辑分支。
   - 需要中英文 key；中文包覆盖测试会兜底。

5. **版本与市场索引**
   - Hub 0.2.0 先发，扩展 0.2.0 后发。
   - 市场索引只保留当前版本；扩展 0.2.0 发布后，Hub <0.2.0 无法从市场新装/更新这两个
     扩展。已安装的旧版本不受影响。
   - 如果需要支持旧 Hub 新装，必须让 `build-marketplace.mjs` 保留历史版本；本计划不做。

6. **Claude Code 测试运行器**
   - 该包现在没有 vitest。要满足 §5 的 provider 单测，需要加 `vitest` devDependency
     （与 `codex` 同版本）和 `vitest.config.ts`。这是「不新增依赖」的唯一例外；如果不
     接受，Claude Code provider 只做 typecheck/build/browser 验收。

7. **成功文案与菜单分组**
   - 新菜单对带 options 的 form 增加 `DropdownMenuLabel` 标题；成功 toast 从
     「已为 {agent} 生成命令」改成「已交付给 {agent}」，document 仍用
     「已追加到 {file}」。
   - 这是有意统一 provider 无关的文案；如果希望保留 form 级文案，需要给
     `PromptForm` 增加 `doneKey` / `removedKey`，会扩大契约。

8. **重命名后的孤儿文件**
   - command / rule / agent 文件和 Codex agent TOML 都以 slug 命名；prompt 改名后旧文件
     不会被 Hub 找到或清理，因为没有 `PlaceFiles.list`。
   - Claude Code 的 command / rule / agent 仍按文件存在判断所有权，和现在一致；同名
     用户文件会被覆盖。Codex agent 用 marker 避免这个问题。
   - 这是现有行为；本次不扩大 scope。

9. **重复 place id**
   - 新 `register` 会拒绝重复 place id，避免 `providerOf` 把写操作发给错误的 provider。
   - 如果某个第三方扩展依赖重复注册（不应该），会开始收到明确错误。

10. **旧扩展的文案键**
    - adapter 把旧 `documents` 的 `labelKey` / `removeLabelKey` 原样放进新 option；旧
      Claude Code 0.1.1 的语言表仍然生效。新 Claude Code 0.2.0 用自己的
      `claudeCode.menu.*` 键。

11. **旧 Claude Code 原地升级**
    - `PromptService.register` 拒绝重复 place id。`ctx.extensions.replace` 正常会先卸载
      旧模块，但计划仍要求在隔离 home 里做一次 0.1.1 → 0.2.0 的实测；如果旧 provider
      没有先 dispose，更新会报 duplicate place id，需要修 `extensions.replace` 或放宽
      adapter。

## 9. 自审记录

- 每个阶段都有可执行命令或浏览器观察项；没有「验证一下」这类空话。
- 阶段依赖：1（事实）不阻塞 2；2 + 3 → 4；2 + 3 → 5；全部 → 6。没有反向依赖。
- 调用方/测试/fixture 已列入：`parts.tsx` 的 `HeldMark`、`deliver.ts` 的测试、
  `provider.test.ts`、`menu.test.ts`、Codex `provider.test.ts` 的 `McpTools` fake、
  `plugin.yaml.inject`、中英文语言键、临时 hub home / user home / workspace。
- 已确认 `writeFileAtomic` 会建父目录，所以不需要 `mkdir`。
- 已确认 `PlaceFiles` 没有 `list`，Codex agent held 只检查目标文件，不做目录扫描。
- 没有把 Codex agent 字段写成已在本机验证的事实；明确标成源码引用 + 阶段 1 验证命令。
- override 行为是本次实测结果，不是旧计划推断。
- 没有照搬旧计划的 `/codex` 页面、`PlaceFiles.list`、UI kit、rules / presets。
- 已明确旧计划文件保留、不归档、不删除。
- 已明确 `read` / `locate` 在 v1 没有消费者，删除而不是留空实现。
- 已把 `claude.code` 的 vitest 依赖标成唯一例外和待确认项，不藏在正文里。
