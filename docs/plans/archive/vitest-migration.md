# 把自制 check 脚本迁到 vitest + `__test__/` 约定

**状态**：完成（2026-10-17）
**起因**：用户问「我们现在的单元测试是自己写的，应该是不对的吧」，
并要求「使用 vitest 测试工具、并且每一个项目里面都要用 `__test__` 目录」。

## 起点

27 个手写的 `scripts/check-*.ts`（8,791 行、约 1,200 个断言），
`node scripts/check-<name>.ts` 跑，**没有 `test` 脚本、没有 turbo `test` 任务、没有 CI**，
跑法是一条手抄的 for 循环。串行 29.5 秒。

其中只有 9 个是纯逻辑测试，18 个是集成契约测试（写真临时文件、起真 `http` 监听、
真 `git clone`、真 spawn MCP server）。换 vitest 不会让它们更"对"，
换来的是四件事：**断言 diff**（旧写法每条比较都写两遍——条件里一次、`detail` 实参里一次）、
`describe`/`it` 粒度的失败定位、一个入口、以及并行。

## 开工前核实的事实

| 事实 | 怎么核实的 |
|---|---|
| vitest 未安装，`msw`/jsdom/testing-library 也没有 | `node_modules/.pnpm` 全量扫描 |
| vitest 最新 5.0.5，peer 收 `vite ^6.4 \|\| ^7 \|\| ^8`；`apps/web` 是 vite 8.2.2 | `npm view vitest` |
| `check()` 辅助函数 **26/27 逐字节相同** | 对 `ok`/`FAIL` 输出模板做 `uniq -c` |
| **没有任何 check 脚本传递到 `.tsx`** | 跑 import 图可达性，并从 `resources/skills/src/index.ts` 自证能报出 `page.tsx` |
| 文件尾部有 **9 种不同写法** | 逐个读尾 |
| `scripts/` 不在任何 tsc program 里 | `grep -rl '"scripts' --include=tsconfig*.json` 命中 0 |
| **没有根 eslint 配置**，11 个包各一份 flat config，不 ignore 任何目录 | 逐个读 + 实测 `eslint scripts/check-state.ts` 出现在输出里 |
| 没有 CI | `.github/` 下只有 `prompts/` |
| 没有一个脚本 import 另一个脚本，没有顺序依赖 | 全量 grep |

**第 3 条决定了整个计划的成本**：辅助函数逐字节相同，所以转换是机械的，
要动的是**编排**（顶层 await、`process.exitCode`、九个不同写法的文件尾），不是断言。
（原先我据此判断"重写 8000 行不值"、提议保留自制脚本只补一个 runner——估高了一个量级，
用户直接选了 vitest。教训已写入 `docs/memory.md`。）

## 落地形状

**每个包自己有 `vitest.config.ts`**，而不是根配置写死一张包路径表。
理由是包自己知道自己在哪，`include` 就不需要路径算术，`pnpm --filter <pkg> test`
也能从包目录里直接跑——和一个包一个 `tsconfig.json` 同理。
根 `vitest.config.ts` 只有一份显式清单（不用 glob：`packages/*` 会匹配到每个包的
`eslint.config.js`，vitest 会拒绝）。

```ts
// packages/<group>/<pkg>/vitest.config.ts
export default defineProject({
  test: { name: "skills", include: ["__test__/**/*.test.ts"] },
})
```

`include` 显式写出来，"测试住在 `__test__/`"才是 runner 强制的事，而不只是一句话。

脚本：根 `"test": "vitest run"`，每个包 `"test": "vitest run"`。
**`turbo` 故意不跑测试**——一个 vitest 进程跑全部 project 共用一个 worker pool 和一个
filter，`turbo test` 会起十一个进程。README 里写了这个理由。

文件命名：`scripts/check-<name>.ts` → `__test__/<name>.test.ts`。
`scripts/` 和 `__test__/` 在包内**深度相同**，所以 5 处 `import.meta.url` 相对路径
一个字都没改（`check-messages` 的 `../../../..`、`check-plugin` 的
`../../../extensions/examples/acme-mcp`、`fixture-server.mjs` 跟着一起搬）。

**`__test__` 加进每个包的 tsconfig `include`**（`apps/web` 加在 `tsconfig.app.json`）。
代价是真实的：8,791 行从没过过 tsc 的代码现在要过一遍。

## 阶段

| 阶段 | 内容 | 交付 |
|---|---|---|
| P0 | 装 vitest、根配置、2 个冒烟文件 | `c56b745` |
| P1 | core 4 个 + extensions 2 个 | `438ab05` |
| P2 | resources/skills 6 个（最重：真 git 17 秒 + 真 3 秒 timer） | `313f878` |
| P3 | resources/prompts 3 个、resources/mcp 4 个 | `6d78dbb`、`6c95af3` |
| P4 | agents/claude-code 3 个、i18n/zh-cn 1 个、shadcn-ui 1 个 | `35f5eb8`、`3f7dbef` |
| P5 | apps/web 框架 + search/skills-sh（唯一新写的测试） | `dcd4967`、`ba26cd3` |
| P6 | README 的 Tests 一节、`docs/memory.md` | `b68be43` |
| — | resources/plugins 3 个（最后一个） | `b343905` |

`resources/plugins/check-plugin-library.ts`（1,520 行 / 216 处断言）、
`check-plugin-rows.ts`（70）、`check-plugin-store`、`check-package`、
`check-mcp` 等机械量大的文件派了子智能体并行做，主上下文留给我判断更多的那些。

## 保真闸门

每个文件迁移前跑一次旧脚本、记下断言数，迁完用 `grep -c 'expect('` 对齐
**旧 `check(` 调用点**（不含 helper 定义行）。少一条就在 commit message 里说明。

结果：**27 个文件没有一个变少**。多数持平或略多——多出来的全部是
把一条复合条件拆成两条 `expect`（如 `a === x && b === n` 拆成两个），不是加了新用例。

## 顺手发现并修掉的两个既有缺陷

**1. `packages/core` 的 `check-workspaces.ts` 往用户真实 home 写 `~/hub-notes` 且从不清理。**
`displayPath`（`packages/core/src/host/home.ts:19`）内部写死 `homedir()`，
所以那条断言确实需要一个真实 home 下的路径，注入临时目录绕不开。
改成带 `process.pid` 的目录名（避免并发撞车）并跑完删除；
这台机器上历次跑留下的那个空目录也清掉了。

**2. `apps/web` 自 `df8ea7b` 起构建不了，而 `pnpm typecheck` 一直报绿。**
`df8ea7b` 把文件夹插件的发现结果从 `definition` 换成了 `module`，
漏改了唯一读它的地方 `apps/web/src/lib/hub.ts:130,134`。
于是**宿主提供的每一个文件夹插件都被静默跳过**，hub 一直跑在编译进来的扩展上。
之所以没被发现：`apps/web/tsconfig.json` 是 `files: []` + 两个 references 的 solution 文件，
`tsc --noEmit` 在它上面**什么都不编译**，所以那个 `typecheck` 脚本是空转的、
两种情况都报成功。改用 `tsc -b` 后立刻暴露。

**端到端验证过**：起一台隔离 hub home（`CONTEXT_HUB_HOME=<temp>`）放一个最小夹具插件，
浏览器里侧栏出现它的 `nav` 项、`locales` 把 `nav.probe` 译成了 "Probe Plugin"、
点进去路由到 `Workspace > Probe Plugin`——三个贡献点都真实到达界面。
（顺带发现 turbo 2 默认 `envMode: "strict"` 会过滤掉未在 `turbo.json` 声明的
`CONTEXT_HUB_HOME`，验证时要绕过 turbo 直起 `apps/web/dev.ts`。）

## 最终数字

```
26 个测试文件 / 579 个用例 / 全绿，13.7 秒（其中最慢的一个文件约 15 秒的单跑）
pnpm typecheck  11/11
pnpm lint       11/11
pnpm build      通过（修 hub.ts 之前是坏的）
check 脚本      仓库里已归零
```

11 个包全部有 `__test__/` 与 `vitest.config.ts`。

## 环境依赖（已写进 README）

- **`git` 必须在 PATH 上**：只有 `resources/skills/__test__/updates.test.ts` 需要，
  它也是唯一慢的那个。
- 全套**不碰网络**，**不写临时目录以外的任何地方**。
- 凡是构造带 `userHome`（或同类机器级根）的 store，测试都显式传临时目录——
  它的默认值是本人的真实 home。
- 沙箱里 `pnpm install` 会挂住而不是报错（沙箱丢包不拒绝），要关沙箱跑。

## 未做 / 已知

- **`i18n/zh-cn` 有 17 个死键**（`cursor.tab`、`cline.error.*` 等），
  是前面删掉的 12 个 agent 包留下的。旧 `check-messages` 只打印不判失败，
  新测试保持同一语义（死键只是不整洁，不是"界面回退到英文"这件它真正要抓的事）。
  清理它们是独立的一件事。
- **`check-plugin-library.ts` 有两处遗留行为被原样保留**：`stagingDir()` 留在系统临时
  目录里的暂存目录没有清理（原脚本就如此，且注释里写明是故意的）。
- 不引入 React 测试栈（用户的选择）：`apps/web` 只搭了框架，
  第一个测试是 `pickFolder()` 的三条分支，用替身 `window` 即可，不需要 DOM。
  将来要测组件时，在 `apps/web/vitest.config.ts` 里声明 `environment` 就是那个位置。
