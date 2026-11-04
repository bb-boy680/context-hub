# 启用 React Compiler

- 日期：2026-10-28
- 状态：待审批
- 范围：`apps/web` 的 Vite 构建链，以及它通过 workspace 软链编译到的 `packages/**` 源码
- 结论：用 `@vitejs/plugin-react` 自带的 `compiler` 选项 + `oxc-transform-react@0.145.0`，不引入 Babel。业务/配置改动只有 `apps/web/package.json`、`apps/web/vite.config.ts`、`pnpm-lock.yaml` 三个文件；收尾时可能按 AOCI 流程更新 `aoci.code.txt`。不动业务代码、ESLint 和测试配置。

## 背景与现状（已核实）

### 构建链

- `apps/web/vite.config.ts:19` 当前是 `plugins: [react(), tailwindcss()]`，另有 `/hub` 代理到 `DEV_HUB_PORT`（5270）。
- `apps/web/package.json:8` 的 `build` 是 `tsc -b && vite build`；`typecheck` 是 `tsc -b`。`tsconfig.node.json` 的 `include` 含 `vite.config.ts`，所以配置项类型错误会被 `pnpm --filter web typecheck` 抓到。
- 桌面端 `apps/desktop/package.json:13-15` 的 `package:win/mac/linux` 都是 `pnpm --filter web build && node build.ts && electron-builder ...`。只要 Vite 构建覆盖到，桌面端自动使用同一份产物，不需要改桌面端配置。
- `apps/web/build-cli.ts` 只把已有的 `dist` 嵌进 Bun 可执行文件（`--asset=dist`），自身不调用 Vite，因此没有第二条需要单独配置的编译路径。
- `.github/workflows/ci.yml:32-37` 依次跑 `pnpm install --frozen-lockfile`、`lint`、`typecheck`、`test`、`build`；`release.yml` 的桌面矩阵在 Windows/macOS/Ubuntu 三平台各跑一次 frozen install + `pnpm build`。新增依赖必须让 Linux/macOS 的 optional binding 也能从锁文件装出来。

### 测试链

- `apps/web/vitest.config.ts`、根 `vitest.config.ts` 以及各包的 `vitest.config.ts` 都是 `defineProject`/独立配置，不 import `apps/web/vite.config.ts`。**启用编译器不会改变测试时的编译路径。**
- 仓库没有 `.test.tsx`；所有测试都是纯 `.ts`（`find packages apps -name "*.test.tsx"` 无结果）。测试全绿只能作为回归基线，不能证明编译器产物可渲染。

### 组件来源

- `packages/*/src` 里有大量 `.tsx`：`shadcn-ui` 62 个、`extensions` 17 个、`resources/*` 32 个、`search/global-search` 2 个，合计 113 个。
- 这些包以源码形式导出（例如 `packages/resources/skills/package.json` 的 `exports["."]` 指向 `./src/index.ts`），由 `apps/web` 的 Vite 直接编译，不经过各自的 `dist`。
- `apps/web` 实际 import 了它们：`apps/web/src/main.tsx:5`（extensions/react）、`apps/web/src/App.tsx:9`（shadcn-ui）、`apps/web/src/components/app-sidebar.tsx:11`（skills）等。

### 已安装版本

- `react` / `react-dom` 19.2.8；React 19 自带 `react/compiler-runtime`（已核对 `node_modules/.pnpm/react@19.2.8/node_modules/react/package.json` 的 `exports["./compiler-runtime"]`），**不需要** `react-compiler-runtime`。
- `vite` 8.2.4；`@vitejs/plugin-react` 6.1.1（`apps/web/package.json:39` 声明 `^6`，锁文件固定 6.1.1）。
- `eslint-plugin-react-hooks` 7.1.1，已在 `apps/web`、`packages/extensions`、`shadcn-ui`、`resources/*`、`search/global-search` 的 eslint 配置中通过 `reactHooks.configs.flat.recommended` 启用（`packages/core`、`packages/i18n/zh-cn`、`apps/desktop` 没有 React 组件，未启用）。

### 计划编写时跑过的只读检查

- `pnpm --filter web lint`、`pnpm --filter @context-hub/skills lint` 均通过。
- 当前用户自己的 dev server 占用 5270/5271（`netstat` 可见）。后文的验证必须另起一台，不能杀这两个进程。

## 关键决策

### 1. 路线：plugin-react 内置的 oxc 编译器（推荐）

| 方案 | 依赖 | 评价 |
|---|---|---|
| A. `react({ compiler: true })` | `oxc-transform-react` 1 个 devDependency | **采用**。plugin-react 6 官方选项，Rust 编译器，不走 Babel，接入面最小 |
| B. `reactCompilerPreset()` + `@rolldown/plugin-babel` | `@rolldown/plugin-babel`、`@babel/core`、`babel-plugin-react-compiler`、可能的 `@types/babel__core` | 不采用。多一条 Babel 管线、多 3 个依赖，本仓库没有 Babel 配置，收益只是“换实现” |

选择 A 的理由：

- 插件已经在 `config()` 钩子里加载 `oxc-transform-react`，并把 JSX、Fast Refresh、sourcemap 一并交给同一次 native transform（`@vitejs/plugin-react/dist/index.js:197-246`）。B 方案需要自己协调 babel preset 的 filter 和 JSX 管线。
- 桌面端和 CLI 构建都只是 `pnpm --filter web build` 的下游，A 方案不需要再改任何构建入口。
- 仓库没有 `.babelrc`/`babel.config.*`，引入 Babel 纯属新增体系。

风险：该选项在 plugin-react 类型里标了 `@experimental`（`dist/index.d.ts:49-54`），oxc 的 React Compiler 也是实验实现。用回滚条件兜底（见下）。

### 2. 版本：`oxc-transform-react@0.145.0`，不要装 latest

已核实的事实：

- 已安装的 `@vitejs/plugin-react@6.1.1` 的 optional peer 是 `oxc-transform-react: ^0.145.0`（`pnpm-lock.yaml:2113-2129`，以及包内 `package.json`）。
- 对 `0.x` 版本，`^0.145.0` 等价于 `>=0.145.0 <0.146.0`；用仓库内的 `semver` 验证：`0.145.0`/`0.145.9` 满足，`0.147.0`/`0.152.0`/`0.156.0` 都不满足。
- npm 上 latest 是 `0.156.0`。直接装 latest 会让 pnpm 报 unmet peer，且没有证据表明 0.156 与 6.1.1 的调用形状一致。
- 0.145.0 的 native API（`transform`、`TransformOptions.jsx.refresh`、`reactCompiler`、`panicThreshold`、`sources`）已从 npm tarball 的 `index.d.ts`/README 核对，与 plugin-react 6.1.1 的调用一致。

因此安装精确版本 `oxc-transform-react@0.145.0`。如果以后想用新编译器，正确顺序是先升 `@vitejs/plugin-react`（6.1.2 的 peer 是 `^0.152.0`）再装对应的 oxc 版本，这是另一次改动，不在本次范围。

### 3. 覆盖范围：默认 include/exclude 已经覆盖 workspace 包

已核实：

- plugin-react 默认 `include: /\.[tj]sx?$/`、`exclude: /\/node_modules\//`（`dist/index.js:57-58`）。
- `apps/web` 对 workspace 包的解析结果是真实路径，不是 `node_modules` 下的软链路径：
  - `require.resolve('@context-hub/skills')` → `D:\work-space\dsh-context-hub\packages\resources\skills\src\index.ts`
  - `require.resolve('@context-hub/shadcn-ui/components/button')` → `D:\work-space\dsh-context-hub\packages\shadcn-ui\src\components\button.tsx`
- Vite 默认 `resolve.preserveSymlinks: false`（`vite/dist/node/index.d.ts:2022` 及解析实现），模块 id 用真实路径，因此不会被 `/node_modules/` 排除。

**但这只是间接证据。** 阶段二必须用 `server.transformRequest()` 直接检查一个包内 `.tsx` 的转换结果里是否出现 `compiler-runtime`。只有这个检查通过，才算覆盖成立。

只有在直接检查失败、且确认 id 是 `apps/web/node_modules/@context-hub/...` 软链路径时，才需要显式处理； contingency 写在阶段二。如果确实要显式 include，形式是（默认不需要）：

```ts
react({
  compiler: true,
  include: [/apps[\\/]web[\\/]src[\\/].*\.tsx?$/, /packages[\\/].*\.tsx?$/],
})
```

它替换默认 `include`，所以必须同时写 app 与 packages 两条，否则会漏掉 `apps/web/src`。

### 4. 诊断与守卫

- **`logDiagnostics`：阶段二临时开 `true`，最终配置改回 `compiler: true`。** 它把可恢复的编译器诊断通过 Vite `this.warn` 打出来（`dist/index.js:240`），用于收集 bail out 清单；长期开着会让每次构建都刷屏，而致命诊断本来就会 `this.error` 并失败。
- **ESLint：不改配置。** 现有 `reactHooks.configs.flat.recommended` 已经包含编译器相关规则，且多数是 `error`（从已安装的 7.1.1 运行时直接读取）：
  - `error`：`react-hooks/rules-of-hooks`、`static-components`、`use-memo`、`preserve-manual-memoization`、`immutability`、`globals`、`refs`、`set-state-in-effect`、`error-boundaries`、`purity`、`set-state-in-render`、`config`、`gating`
  - `warn`：`react-hooks/exhaustive-deps`、`incompatible-library`、`unsupported-syntax`
  - `reactHooks.configs.flat["recommended-latest"]` 只比 `flat.recommended` 多一条 `void-use-memo`（error）。本次不切换，避免把范围扩大到新规则。
  - `reactHooks.rules` 里还有 `hooks`、`memo-dependencies`、`exhaustive-effect-dependencies` 等规则，但都不在 `recommended` 里；本次不启用。
- **`panicThreshold`：保持默认 `'none'`。** 0.145.0 的类型定义写明默认值是 `'none'`，可选 `'critical_errors'`/`'all_errors'`。把可恢复 bail out 升成硬失败会阻塞无关改动；致命诊断无论如何都会失败。等诊断清单稳定后再考虑收紧，属于后续单独决策。

### 5. 回滚条件（任一命中就停，不改业务代码去迁就）

1. `pnpm --filter web build` 因编译器 fatal 诊断失败，且定位到需要改组件语义才能通过。
2. `/skills` 冒烟出现与改动前不同的可见行为：列表缺行、筛选结果变化、详情打不开、effect 进入循环、控制台出现 React 报错。
3. 阶段二对包内文件换过 2-3 个简单组件后，`transformRequest` 仍全部返回 `NOT COMPILED`（说明覆盖没生效，改动无意义）。
4. `pnpm --filter web build` 的中位耗时超过基线 2 倍，或 `apps/web/dist` 体积增长超过 10%。这两个阈值是判断阈值，不是硬性事实；命中后先报告数据再决定。
5. Linux/macOS CI 因 optional native binding 安装失败。

回滚动作只针对本次三个文件，不能碰工作区里其他人的未提交改动：

```bash
git diff --stat -- apps/web/vite.config.ts apps/web/package.json pnpm-lock.yaml
# 确认只有本次改动后
git restore --source=HEAD -- apps/web/vite.config.ts apps/web/package.json pnpm-lock.yaml
pnpm install --frozen-lockfile   # 需要网络时关闭 Bash 沙箱
```

## 受影响文件

| 文件 | 改动 | 调用方 / 影响 |
|---|---|---|
| `apps/web/package.json` | devDependencies 增加 `"oxc-transform-react": "0.145.0"`（精确锁，peer 范围仍是 `^0.145.0`） | 只有 `vite.config.ts` 的插件在运行时动态 import 它 |
| `pnpm-lock.yaml` | 记录新包及三平台 optional bindings | CI 的 `--frozen-lockfile` 依赖它 |
| `apps/web/vite.config.ts:19` | `react()` → `react({ compiler: true })` | dev、web build、桌面打包直接经过这里；CLI 构建通过先前的 web build 间接使用 |
| `docs/plans/react-compiler-adoption.md` | 本计划 | 无运行时影响 |
| `aoci.code.txt` | 收尾时按 `aoci_maintain` 的结果更新 `apps/web/vite.config.ts`、`apps/web/package.json` 的语义条目；无候选则不改 | 只影响模型认知层，不影响运行时 |

不需要改：各包 `package.json`（包本身不知道编译器存在）、任何 `vitest.config.ts`、任何 `eslint.config.js`、`.github/workflows/*`、`apps/desktop/*`。

## 阶段

### 阶段一：记录基线并安装编译器依赖

**目标**：在改配置前留下可比较的数字，并确认新依赖不影响现有构建。

**步骤**：

1. 确认工作区状态，记下已有的未提交文件，避免回滚时误伤：

   ```bash
   git status --short
   ```

2. 记录 web 构建基线（先跑一次预热 `tsc -b` 缓存，再取 3 次）：

   ```bash
   pnpm --filter web build
   for i in 1 2 3; do TIMEFORMAT='%3R'; time pnpm --filter web build; done
   du -sk apps/web/dist
   ```

3. 记录 dev 冷启动基线。**不要碰用户正在跑的 5271**，另起一台并立刻关掉：

   ```bash
   cd apps/web
   timeout 25 npx vite --port 5272 --strictPort 2>&1 | tee /tmp/vite-before.log | grep -E "ready in"
   ```

   `timeout` 退出码 124 是预期的。若 5272 被占，换 5273。

4. 安装依赖（访问 registry，Bash 沙箱会丢包，需 `dangerouslyDisableSandbox`）：

   ```bash
   pnpm --filter web add -D oxc-transform-react@0.145.0
   ```

**验收**：

- `node -p "require('./apps/web/node_modules/oxc-transform-react/package.json').version"` 输出 `0.145.0`。
- `pnpm --filter web list --depth 0 | grep -E "plugin-react|oxc-transform-react"` 显示 `@vitejs/plugin-react 6.1.1`、`oxc-transform-react 0.145.0`（若 pnpm 顺手把 plugin-react 升到 6.1.2，停下：peer 变成 `^0.152.0`，此时应改装 `oxc-transform-react@0.152.0` 并在报告中记录这次版本变化）。
- 安装输出没有 unmet peer warning。
- `git diff --stat` 只多出 `apps/web/package.json` 与 `pnpm-lock.yaml`。
- `pnpm --filter web build` 仍然通过（此时编译器还没启用，属于纯安装回归）。
- 基线耗时、dist 体积、`ready in` 数字记录到实施报告。

### 阶段二：启用编译器并验证包源码覆盖

**目标**：让编译器真正跑起来，并证明 `packages/**` 的 `.tsx` 被编译，而不只是 `apps/web/src`。

**改动**：`apps/web/vite.config.ts:19`

```diff
-  plugins: [react(), tailwindcss()],
+  plugins: [react({ compiler: { logDiagnostics: true } }), tailwindcss()],
```

**步骤**：

1. 构建并保留日志，供阶段三分析：

   ```bash
   pnpm --filter web build 2>&1 | tee /tmp/rc-build-stage2.log
   ```

2. 直接检查一个包内组件的转换产物：

   ```bash
   cd apps/web
   node --input-type=module -e "
   import { createServer } from 'vite'
   const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
   for (const url of [
     '/@fs/D:/work-space/dsh-context-hub/packages/search/global-search/src/button.tsx',
     '/@fs/D:/work-space/dsh-context-hub/apps/web/src/components/theme-provider.tsx',
   ]) {
     const out = await server.transformRequest(url)
     const code = out?.code ?? ''
     console.log(
       url,
       code.includes('compiler-runtime') ? 'COMPILED' : 'NOT COMPILED',
       code.includes('$RefreshReg$') ? 'REFRESH' : 'NO REFRESH'
     )
   }
   await server.close()
   "
   ```

   为什么要一起看 `$RefreshReg$`：plugin-react 在 `compiler` 开启时会关掉自己那条 oxc jsx `refresh`
   注入（`dist/index.js:76`），改由编译器 transform 带着 `refresh: isFastRefreshEnabled()` 一起产出
   （`dist/index.js:226-241`）。`REFRESH` 说明 dev 的 Fast Refresh 没有因为启用编译器而丢失。

3. 类型检查配置项本身：

   ```bash
   pnpm --filter web typecheck
   ```

**验收**：

- `pnpm --filter web build` 退出码 0；日志里没有 `React Compiler requires the optional oxc-transform-react`，也没有 `React Compiler transform failed`。
- 上面的脚本对 `packages/search/global-search/src/button.tsx` 输出 `COMPILED`。这证明包源码进入了 `vite:react-compiler` 的 transform。
- 同一行同时输出 `REFRESH`，证明 dev Fast Refresh 仍然由编译器这条管线注入。
- `theme-provider.tsx` 也应为 `COMPILED`；如果它是 `NOT COMPILED`，说明该文件本身 bail out，换一个更简单的包内文件重试，不能直接判定覆盖失败。
- `pnpm --filter web typecheck` 退出码 0。
- `git diff -- apps/web/vite.config.ts` 只有上面一行改动。

**contingency（只有第 2 步对包内文件失败时才执行）**：先分清是文件自身 bail out 还是路径被排除。在同一个 `createServer` 脚本里临时加一个只打印 id 的插件（不写进仓库）：

```js
plugins: [{
  name: 'print-id',
  transform(_code, id) {
    if (id.includes('global-search/src/button.tsx')) console.log('id', id)
  },
}]
```

- 若 id 是 `D:/work-space/dsh-context-hub/packages/...`，说明路径没问题，失败是 bail out：换一个更简单的包内组件重试，仍失败则按回滚条件 3 处理。
- 若 id 是 `apps/web/node_modules/@context-hub/...` 软链路径，才需要放宽 Vite 的 exclude（或按上一节写显式 include）。此时 oxc 自己的 `sources` 默认也会跳过含 `node_modules` 的文件名；`sources` 的覆盖语义没有在 0.145.0 上验证过，不要凭猜写值。先报告实际 id，再决定是显式设置 `resolve.preserveSymlinks: false` 还是调整 filter。默认路径下不应走到这里。

### 阶段三：收集诊断并确认 ESLint 守卫

**目标**：拿到 bail out 的数量与分布，确认现有 lint 已经覆盖编译器约束，并把配置收敛到最终形态。

**步骤**：

1. 对全部包内 `.tsx` 做一次直接普查（不经过 Vite，拿到逐文件诊断）：

   ```bash
   cd apps/web
   node --input-type=module -e "
   import { readFileSync, globSync } from 'node:fs'
   import { transformSync } from 'oxc-transform-react'
   const files = globSync('../../packages/**/src/**/*.tsx')
   let warnings = 0
   for (const file of files) {
     const r = transformSync(file, readFileSync(file, 'utf8'), { reactCompiler: {} })
     const ws = r.errors.filter((e) => e.severity === 'Warning')
     warnings += ws.length
     if (ws.length > 0 || r.fatal) {
       console.log(file, r.fatal ? 'FATAL' : '', ws.map((e) => e.message).join(' | '))
     }
   }
   /* 自证：普查必须能看见一次成功编译，否则 0 warning 可能只是没跑编译器 */
   const probeFile = '../../packages/search/global-search/src/button.tsx'
   const probe = transformSync(probeFile, readFileSync(probeFile, 'utf8'), { reactCompiler: {} })
   console.log('probe', probe.code.includes('compiler-runtime') ? 'COMPILED' : 'NOT COMPILED')
   console.log('files', files.length, 'warnings', warnings)
   "
   ```

   说明：这个普查不应用 plugin 的 `defaultCodeFilter`，所以数字会比 Vite 实际处理的文件略多；它用于定位“哪些文件会 bail out”，不是逐字复刻 Vite 行为。

2. 对照 `/tmp/rc-build-stage2.log` 里的 `vite:react-compiler` 诊断，确认 Vite 侧看到的数量与分布。日志前缀的具体格式在第一次运行前未知，先 `grep -n "react-compiler" /tmp/rc-build-stage2.log` 看实际输出，不要预设。

3. 跑全仓 lint：

   ```bash
   pnpm lint
   ```

4. 把 `apps/web/vite.config.ts` 收敛为最终形态：

   ```diff
   -  plugins: [react({ compiler: { logDiagnostics: true } }), tailwindcss()],
   +  plugins: [react({ compiler: true }), tailwindcss()],
   ```

**验收**：

- 普查先输出 `probe COMPILED`（自证脚本确实在跑编译器），再输出 `files <N> warnings <M>`；`N` 应与下面命令的 113 一致（不一致说明 glob 漏了目录）：

  ```bash
  find packages -path "*/node_modules" -prune -o -path "*/src/*" -name "*.tsx" -print | wc -l
  ```

- 记录每个有诊断的文件与消息。
- 没有 `FATAL`；如果有，按回滚条件 1 停止并报告，不修改业务代码。
- `pnpm lint` 退出码 0。
- 最终配置是 `react({ compiler: true })`，没有 `logDiagnostics`、没有 `panicThreshold`、没有覆盖 `include`/`exclude`。
- 明确记录：ESLint 未改；`flat.recommended` 已含的编译器规则按原 severity 生效；未启用 `recommended-latest` 和 `panicThreshold`。

### 阶段四：全量验证与耗时对比

**目标**：用仓库现有门禁和真实页面确认没有回归，并量化收益/成本。

**步骤**：

1. 全量门禁（`pnpm install --frozen-lockfile` 用来复刻 CI 的安装条件）：

   ```bash
   pnpm install --frozen-lockfile   # 需要 registry 时关闭 Bash 沙箱
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   ```

2. 构建耗时与体积（与阶段一同一命令、同一预热方式）：

   ```bash
   pnpm --filter web build
   for i in 1 2 3; do TIMEFORMAT='%3R'; time pnpm --filter web build; done
   du -sk apps/web/dist
   ```

3. dev 冷启动对比：

   ```bash
   cd apps/web
   timeout 25 npx vite --port 5272 --strictPort 2>&1 | tee /tmp/vite-after.log | grep -E "ready in"
   ```

4. 实际渲染冒烟：

   - 确认 5270 上的 hub server 在跑（用户当前的 dev 进程会提供它）。若没有，单独起 `cd apps/web && node server.ts --port 5270`，不要占用 5271。
   - 另起一台只带新配置的 Vite：`cd apps/web && npx vite --port 5272 --strictPort`。它通过 `vite.config.ts` 的 `/hub` 代理连到 5270，不重启也不杀用户的 5271。
   - 两个 Vite 进程共享 `apps/web/node_modules/.vite` 依赖缓存。如果第二台报 dep optimizer 冲突，先停下并请用户重启 5271，不要杀用户进程，也不要删共享缓存。
   - 用 `ego-browser` skill 打开 `http://127.0.0.1:5272/skills`，检查：
     - 页面标题/工具栏渲染；
     - 有技能数据时至少一行可见，点开一行的详情对话框（选择器用 `div[role="button"][aria-label]`，不要用 `[aria-label]` 兜底）；
     - 切到 `/extensions` 与 `/settings` 各看一次；
     - 浏览器 console 没有 React 报错或编译器运行时错误。
   - 如果本机技能库为空，如实记录“只验证了空态和对话框入口，没有真实行数据”，不要用“页面没坏”代替行渲染验证。

5. 锁文件平台覆盖检查：

   ```bash
   grep -c "@oxc-transform-react/binding-" pnpm-lock.yaml
   grep -E "binding-(linux-x64-gnu|darwin-arm64|win32-x64-msvc)" pnpm-lock.yaml
   ```

**验收**：

- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 全部退出码 0。
- 给出前后对比表：web build 3 次中位数、dev `ready in`、`apps/web/dist` 体积。没有命中回滚条件 4。
- 冒烟结果逐项记录；若有任何可见行为差异，按回滚条件 2 停止。
- 锁文件里能看到 Linux/macOS/Windows 三平台的 binding 条目；最终以 PR 的 CI 三平台安装为准。

### 阶段五：收尾与认知维护

**目标**：确认改动面干净，并把仓库认知同步到新状态。

**步骤**：

1. 检查最终 diff：

   ```bash
   git status --short
   git diff -- apps/web/vite.config.ts apps/web/package.json
   git diff --stat
   ```

   预期只有本次三个文件改动（外加工作区原有的未提交文件）。不要顺手格式化、不要清理无关代码。

2. 报告里写清：
   - 最终配置与安装的版本；
   - bail out 数量/分布与处理决定（未改业务代码）；
   - 前后耗时与体积；
   - 未验证项（见下）；
   - 用户自己的 5271 dev server 仍然跑着旧配置。Vite 通常会在 `vite.config.ts` 变化时自动重启，但如果没有，需要用户自己重启一次；不要替用户杀进程。

3. AOCI：受管理的 `apps/web/vite.config.ts`（`aoci.code.txt:27`）与 `apps/web/package.json`（`aoci.code.txt:23`）发生变化。在最终稳定状态只调用一次 `aoci_maintain`；如果返回语义候选，基于实际证据改写 S（以及必要的 F/R/A）并通过 `aoci_update_entry` 提交。没有候选就如实说明，不猜写。

4. 计划归档：只有用户明确确认计划完成后，才把本文件移到 `docs/plans/archive/`。本次实施结束时不归档。

5. 不提交 git，除非用户明确要求。

**验收**：

- diff 面与预期一致。
- 实施报告包含阶段四要求的全部数字和冒烟结果。
- `aoci_maintain` 已调用一次，结果（更新了哪些条目 / 无候选）已记录。

## 不做

- 不修改任何 `.tsx`/`.ts` 业务代码，不为消除 bail out 重写组件、补依赖数组、加 `useMemo`/`useCallback`。
- 不调整 hooks 语义，不为了让构建通过而改行为。
- 不改任何 `eslint.config.js`；不启用 `recommended-latest`、`react-hooks/hooks`、`exhaustive-effect-dependencies`。
- 不设置 `panicThreshold`。
- 不改 `vitest.config.ts`；不新增组件渲染测试。
- 不升级 `@vitejs/plugin-react`、React、Vite。
- 不引入 Babel 路线依赖（`@rolldown/plugin-babel`、`@babel/core`、`babel-plugin-react-compiler`）。
- 不引入 `react-compiler-runtime`。
- 不改 `.github/workflows/*`。
- 不跑 `electron-builder` 打包，只跑仓库的 `build`。
- 不做无关格式化、清理、重命名。

## 待验证假设

| 假设 | 验证方式 |
|---|---|
| `oxc-transform-react@0.145.0` 与 plugin-react 6.1.1 实际运行兼容（peer 与 API 形状已核对，未运行过） | 阶段二 build + transformRequest |
| 包内 `.tsx` 以真实路径进入 transform，默认 exclude 不误伤 | 阶段二 transformRequest 输出 `COMPILED` |
| Vite 构建日志里可恢复诊断的实际格式/前缀 | 阶段三先 `grep -n "react-compiler"` 看实际输出 |
| Linux/macOS 的 optional binding 能在 `--frozen-lockfile` 下安装 | 阶段四 grep 锁文件 + PR CI 三平台 |
| 本机技能库是否有真实行数据可做冒烟 | 阶段四打开 `/skills` 时确认；为空则记录为空态验证 |

## 风险

- 编译器是实验实现（plugin 的 `compiler` 选项标注 `@experimental`）；出现无法解释的渲染差异时按回滚条件处理，不现场改业务语义。
- 编译器会稳定值/函数标识，原来依赖“每次渲染新建对象/函数”的 effect 可能少跑；这是启用编译器的目的，但也是唯一需要真实页面冒烟的原因。
- 用的是 0.145.0 而不是 npm latest；新版本的行为修复拿不到，升级需要先升 plugin-react，属于后续独立改动。
- native binding 需要三平台安装；锁文件生成在本机 Windows，最终以 CI 为准。
- 构建时间和 bundle 体积会增加；具体幅度以阶段四数据为准，不预设结论。
