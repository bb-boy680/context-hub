# P1 Agent 扩展接入计划

状态：调研中，待审批。本文是实施计划；尚未开发扩展、安装依赖、启动服务或修改客户端配置。

范围：DeepSeek Harness、Trae、Qoder、Kiro、Qwen Code、Kimi。实施仓库为 `D:/work-space/context-hub-extensions`；宿主仓库为 `D:/work-space/dsh-context-hub`。以下不带仓库前缀的 `plugins/` 均指扩展仓库。用户所写的 Trea 暂按 Trae 处理，具体产品形态以各节调研结论为准。

## 已确认的宿主边界

- `plugins/opencode/src/index.tsx:apply` 使用注入的 `skills`、`mcp`、`prompts`、`targets`、`locales` 服务；`plugins/workbuddy/src/index.tsx:apply` 还声明原生 manifest 并注册插件安装器。新增客户端应通过服务注册，不在宿主增加客户端特判。
- `packages/resources/skills/src/extension.ts:SHARED_PLACE` 只提供工作区 `.agents/skills`；`packages/resources/prompts/src/workspace-provider.ts` 的工作区共享 place 提供 `AGENTS.md` 等。客户端使用同一物理位置时，复用已有 place，避免重复注册与计数；不能把该共享能力误写成全局共享目录。
- `packages/resources/mcp/src/provider.ts:McpPlace.installable` 可区分扫描与新安装入口；每个作用域优先只提供一个默认安装入口，已支持的其他物理文件可继续扫描。每个 place 的读写必须指向同一文件，显示的是该文件的声明而不是客户端最终生效状态。
- `packages/resources/plugins/src/provider.ts:PluginDiskDeclaration` 支持 `homeEnv`、`stateEnv`、多段 state、声明目录模板和来源/目标快照；`PluginHeld.enabled` 可未知、`readOnly` 可标记受客户端管理的记录。`PluginPlace` 没有 `installable` 字段；不要把 MCP 的同名能力套到插件安装位置。
- `packages/core/src/host/place-files.ts:createFsPlaceFiles` 的普通文件位置只有 workspace 和用户目录两种根。插件安装器对环境变量根的支持，不能推导普通 skills、MCP、prompts 同样支持。首版普通资产默认覆盖文档证实的默认根；自定义根如需支持，另设计通用宿主契约，不为单个客户端添加特判。
- `packages/resources/plugins/src/host/installer-files.ts:createInstallerFiles` 的声明式作用域不是安全沙箱；安装/卸载须利用现有目录白名单、目标及源快照、冲突拒绝与失败补偿。不要覆盖未知格式、手写文件或客户端外部并发写入。
- 扩展仓 `pnpm-workspace.yaml` 自动包含 `plugins/*`；`scripts/build-marketplace.mjs` 从各扩展的 `plugin.yaml` 与 `package.json` 生成市场索引。扩展自己的 `package.json` 应提供与现有扩展一致的 `build`、`test`、`typecheck` 脚本。

## 实施约束

1. 六个客户端可并行、各由独立开发 Agent 负责；主 Agent 负责调度和协调共享部分。各扩展独占自己的 `plugins/<id>/` 目录，公共文件由一个协调任务统一处理。
2. 实现当前官方协议，不额外实现旧格式迁移、别名回退或跨客户端清单转换；必须支持多个当前原生格式的情况，以具体调研证据和获批范围为准。不能证明安全写入的能力不注册为可写能力，明确写入 README，而不是猜测目录、字段或启用状态。
3. 每个扩展按实际支持选择 `inject` 和 target `supports`，不把类型枚举误当作功能完成；同名共享文件只注册一次。现有客户端特定配置读写须保留不相关字段和用户内容，错误格式拒绝修改。
4. 依照此前用户要求，真实客户端、隔离环境、已发布宿主版本以及独立验收均不是开发阻断；本地单测、typecheck、构建和适当的源码集成检查仍属于实现验证。真实客户端实际加载与启用留待用户后续自行调试，不得声称通过。
5. 不触碰用户真实客户端目录、凭证或运行中的服务；不提交、不推送、不创建分支。安装新扩展不在本计划内。图标使用须记录来源及商标/分发限制。
6. `engines.contextHub` 只能声明 Hub 版本，不能表示目标客户端版本。依赖未发布宿主 API 时，开发版要在 README 明示；发布前绑定实际包含 API 的宿主版本，不虚构版本。

## 各客户端调研与实施阶段

六项调研按以下独立阶段组织；每个阶段只修改自己的扩展目录，完成后可独立运行该扩展的检查。

### 接入 DeepSeek Harness

**依据与范围**：目标是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，包含 CLI、桌面和 Web；调研时发布版仍为 developer preview。首版交付可证实的 skills、指令、target 和 locale，不伪造原生插件或 MCP 安装能力。

- [Skills 官方说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill-filesystem/README.md)：项目 `.dsh/skills` 与 `.agents/skills`，全局 `$DSH_HOME/skills` 默认 `~/.dsh/skills`，还读 `$DSH_AGENTS_HOME/skills` 默认 `~/.agents/skills`。首版注册 `.dsh` 的 workspace/global 两处，工作区 `.agents/skills` 复用共享 place；全局 `.agents/skills` 当前没有共享 place，不声称已覆盖。客户端还可读取单文件 skill，Hub 首版只交付现有 `<name>/SKILL.md` 形态。
- [指令官方说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/context/agent-instructions/README.md)：`$DSH_HOME/AGENTS.md` 默认 `~/.dsh/AGENTS.md`；项目根至当前目录还可读取 `AGENTS.md`、`CLAUDE.md` 和 local 文件。全局只管理 `.dsh/AGENTS.md` 的 Hub 标记段，项目根 `AGENTS.md` 复用共享 provider，不扫描祖先或宣称管理其他文件。
- [MCP](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/mcp-memory.md) 使用 Cordis YAML patch，位置依 profile 或 `DSH_HOME` 而变化；当前 `McpTools` 的 JSONC/TOML 编辑器及静态 place 不足以承诺安全编辑。首版不注册 MCP provider，不生成伪 JSON 配置。
- [bundle 发布](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)依赖 npm 包、`dsh.bundle.patch` 和 profile 依赖；不等同 Hub 可复制的资产目录。首版不注册插件安装器、不调用 pnpm 安装，不声称可管理插件启停。将 YAML 无损编辑、profile 选择和外部依赖事务列为未来通用设计议题，本计划不实现。
- `DSH_HOME`、`DSH_AGENTS_HOME` 自定义值不由普通资产端口解析；README 明示只管理默认根。动态 profile、客户端最终生效状态和其他客户端的兼容读取均不推断。

**文件与动作**：新增扩展仓 `plugins/deepseek-harness/{plugin.yaml,package.json,build.mjs,tsconfig.json,vitest.config.ts,README.md,assets/,src/,__test__/}`。`src/index.tsx` 只注入并注册 skills/prompts/targets/locales，`locations.ts` 分别记录读取位置和管理位置，`prompts.ts` 使用现有标记段工具，`contracts.ts` 镜像实际使用的服务；`supports` 仅声明实现的类别。图标来源与授权记录在 README。不得在宿主增加 DSH 专用分支。

**验收**：运行 `pnpm --filter deepseek-harness typecheck`、`pnpm --filter deepseek-harness test`、`pnpm --filter deepseek-harness build`；测试注册/撤销、默认根与项目根、共享目录不重复、全局标记段仅修改自己的内容、手写冲突/坏输入不覆盖、target 和 README 不声称 MCP/插件安装。真实 `dsh --version` 和加载效果由用户后续调试，不阻塞开发。

### 接入 Kimi Code CLI

**依据与范围**：目标是 [Kimi Code CLI](https://github.com/MoonshotAI/kimi-code)，不把已归档的旧 Python Kimi CLI 当作同一协议。调研时官方 latest 为 2.4.1；`main` 文档可能领先该版本，实现时以选定当前客户端版本的官方文档及源码为准，README 标明版本与证据。

- Skills：项目 `.kimi-code/skills`、用户 `~/.kimi-code/skills`；项目 `.agents/skills` 使用宿主共享位置。官方也列出 `~/.agents/skills`，当前宿主无全局共享 place，不虚报覆盖。见 [skills](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/skills.md)。
- MCP：默认用户 `~/.kimi-code/mcp.json`、项目 `.kimi-code/mcp.json`；`mcpServers` 支持 command/args/env/enabled，HTTP 使用 url、SSE 使用 transport，按官方格式实现。项目同名可能覆盖用户项，界面仅表达对应文件声明。见 [MCP](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/mcp.md)。
- 指令：项目 `.kimi-code/AGENTS.md`、项目根 `AGENTS.md`，用户根 `.kimi-code/AGENTS.md` 及共享 `~/.agents/AGENTS.md` 按 [官方说明](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/agents.md) 逐项选择不重复的可写入口；共享项目 `AGENTS.md` 复用宿主。实现前明确与宿主共享文件的重名/标记策略。
- 原生插件：[文档](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/customization/plugins.md)列出 `kimi.plugin.json` 和 `.kimi-plugin/plugin.json`，属于当前原生两种入口而非历史迁移；如果实现同时支持两者，应测试优先级及重名冲突，不生成或翻译清单。官方文档与[状态源码](https://github.com/MoonshotAI/kimi-code/blob/main/packages/agent-core-v2/src/app/plugin/store.ts)列出用户级 `plugins/installed.json` 与 `plugins/managed/<id>/`，安装、启停和移除只按当前源码实际语义实现，不能把“移除记录、保留 managed 副本”误写成删除副本；写入前核对版本、字段和现有记录。
- `KIMI_CODE_HOME` 默认 `~/.kimi-code`；插件端口可声明 `homeEnv`，普通资产首版只支持默认根并在 README 明示。插件安装后由客户端新会话或 `/reload` 生效，不报告已加载。当前调研没有确认自动读取 `.claude` 资产，不注册该路径。

**文件与动作**：在扩展仓新增 `plugins/kimi/{plugin.yaml,package.json,build.mjs,tsconfig.json,vitest.config.ts,README.md,assets/,src/,__test__/}`；`src/index.tsx` 依照实际能力注册 services/target/locales，`locations.ts` 声明路径，`provider.ts` 和 `prompts.ts` 实现可证实的读写，`installer.ts` / `plugin-state.ts` 实现当前原生安装记录，`contracts.ts` 只镜像实际使用的宿主契约。通过 `registerManifests` 声明原生清单并测试扫描、元数据与自定义组件路径；如果现有通用收录不能表达客户端元数据，明确提出通用改动，不将另一客户端清单作为回退。

**验收**：运行 `pnpm --filter kimi typecheck`、`pnpm --filter kimi test`、`pnpm --filter kimi build`；覆盖两作用域 MCP、`enabled`、原有未知字段与错误格式保留、当前原生清单的优先级和收录、user 安装/启停/移除、已存在 managed 副本和文件快照冲突。README 区分客户端真实能力与 Hub 管理范围。`kimi --version`、`kimi doctor` 与组件加载由用户后续按需自行验证，不作为开发阻断。

其他五项调研结果待汇总。

## 协调集成与验收

**范围与依赖**：六个扩展的独立阶段完成后进行；仅当具体客户端确实需要、且本计划明确纳入时修改宿主通用契约。新扩展的 `src/contracts.ts` 要与宿主当前类型一致；原有扩展不因新增客户端被迫修改。使用扩展仓 `pnpm-workspace.yaml` 的自动发现，不手工改生成的市场索引。

**执行**：

1. 在扩展仓依次执行现有根脚本 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。检查输出是否包含六个新包，记录测试的跳过项及市场构建的插件数量；`pnpm build` 会执行已有 `build:marketplace`。每个新包实现阶段也运行它自己的 `pnpm --filter <包名> typecheck`、`pnpm --filter <包名> test`、`pnpm --filter <包名> build`；这三个脚本由该阶段在 `package.json` 按现有 `plugins/opencode/package.json` 建立。
2. 对引用宿主 toolkit 或文件端口的扩展，参照 `plugins/opencode/__test__/host.test.ts` 和 `plugins/copilot/__test__/host-integration.test.ts`，使用临时目录执行宿主源码集成测试；不把 skipped 报作 passed，不使用真实客户端目录。若修改宿主公共代码，还需在宿主仓运行相关包测试及 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
3. 检查每个客户端注册与卸载生命周期、相同物理目录不重复、不同作用域独立；MCP 对每个作用域的可安装位置不超过一个，同时扫描有证据支持的其他位置。根据各阶段实际支持项验证命令、指令、技能和插件清单；插件安装器测试应覆盖源与目标变化、无关内容保留、失败不覆盖以及启用状态未知。
4. 汇总六项能力与未验证内容、构建和测试结果；不以模拟测试声称真实客户端已加载。仅在宿主 AOCI 受管文件发生实际变更且达到稳定状态时维护 AOCI；文档位于当前受管范围之外，单独写计划不触发索引维护。

**验收判据**：现有脚本均通过；市场索引包含实际完成且可构建的六个扩展；每个扩展 README 如实列出支持的具体文件、默认根与未覆盖项。真实客户端结果和跳过项单列，不能写成通过。若官方协议不能确定，相关写入能力不得当成已实现，按客户端章节的边界报告。

## 不做

不在本轮计划阶段开发源码、安装依赖或客户端插件、启动服务、修改用户配置、归档计划或提交 Git。不实现其他 P1/P2 客户端，不新增未经证实的跨客户端行为。
