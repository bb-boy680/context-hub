# 远程插件工程化：每个插件一个完整包（lib 产物）

- 日期：2026-10-19
- 远程仓库：`D:\work-space\context-hub-extensions`（独立 git 仓库，当前 `main`，HEAD `b86ed5c`，工作区干净）
- hub 仓库：`D:\work-space\dsh-context-hub`
- 状态：待审批

## 背景

用户要求 `plugins/` 下每个插件都是完整工程，参考 `packages/agents/claude-code`，并且要像 deepseek-harness 一样使用打包后的产物、由 `package.json` 说明入口位置，默认放在 `lib/`。

已核实的 deepseek-harness 事实：

- `packages/client/ui-plugin-market/package.json`：`"main": "lib/index.js"`，`files` 包含 `lib/index.js`、`lib/client.js`、`lib/types/**/*.d.ts`。
- `.gitignore` 第 7 行是 `lib/`：产物不提交 git，由 `tsdown` 在发布前构建进 npm tarball。
- 市场安装走 `pnpm add name@version` 或 `git+https#commit&path:`，安装的是 npm 包，不是浏览器直接 import 源码。

Context Hub 没有 npm 发布层：安装器 clone git 默认分支，然后把插件目录交给浏览器 `import()`。因此：

- 运行时入口必须是已构建的 JS；
- 产物必须在 git 目录里，否则 clone 后不存在；
- 所以本次采用“插件仓库打包、提交 `lib/`、hub 直接使用”的方案，而不是 hub 安装时构建。

## 目标结构

```text
context-hub-extensions/
  pnpm-workspace.yaml
  pnpm-lock.yaml
  package.json                    聚合脚本 + packageManager
  marketplace.json
  icons/
  README.md
  tools/hash-extension.mjs        唯一的 integrity 工具
  plugins/
    demo.counter/
      package.json                main: "lib/index.js"
      build.mjs                   esbuild -> lib/index.js
      tsconfig.json
      src/index.tsx
      plugin.json                 entry: "lib/index.js"
      lib/index.js                提交的打包产物
      README.md
    demo.other/
      package.json                main: "lib/index.js"
      build.mjs                   esbuild -> lib/index.js
      tsconfig.json
      src/index.ts
      plugin.json                 entry: "lib/index.js"
      lib/index.js                提交的打包产物
      README.md
```

### 每个插件的 package.json

`demo.counter`：

```json
{
  "name": "demo.counter",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": "./lib/index.js" },
  "files": ["lib", "src", "plugin.json", "README.md"],
  "scripts": {
    "build": "node build.mjs",
    "typecheck": "tsc --noEmit",
    "hash": "node ../../tools/hash-extension.mjs ."
  },
  "devDependencies": {
    "@types/react": "^19",
    "esbuild": "^0.28.2",
    "typescript": "~6"
  }
}
```

`demo.other` 相同，但 `version: "0.1.0"`，没有 `@types/react`，入口是 `src/index.ts`。

`main` 是入口的权威声明。`plugin.json.entry` 必须与它完全相同（`lib/index.js`），不带 `./`；安装器会校验。

### 每个插件的 build.mjs

```js
import { build } from "esbuild"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.dirname(fileURLToPath(import.meta.url))

await build({
  absWorkingDir: dir,
  entryPoints: ["src/index.tsx"],
  outfile: path.join(dir, "lib", "index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  logLevel: "info",
})
```

`absWorkingDir` 固定在插件目录，产物首行稳定为 `// src/index.tsx`（`demo.other` 为 `// src/index.ts`），不随 cwd 漂移。`demo.other` 把入口换成 `src/index.ts`。

### plugin.json

两个插件的 `entry` 都改成 `lib/index.js`；其余字段（id、version、apiVersion、permissions、inject）不动。

### 根配置

`pnpm-workspace.yaml`：

```yaml
packages:
  - "plugins/*"

allowBuilds:
  esbuild: true
```

根 `package.json`：

```json
{
  "name": "context-hub-extensions",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.33.4",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "hash": "pnpm -r hash"
  }
}
```

删除根 `tsconfig.json`（每个插件自带）与 `tools/build-extension.mjs`（每个插件自带 `build.mjs`）。保留 `tools/hash-extension.mjs`；哈希算法必须与 hub 的 `folderHash` 一致，属于仓库级发布工具。

## hub 侧改动

只改安装器的一处校验，不改页面、加载器或运行时。

`packages/core/src/host/extension-market.ts` 在 `assertEntry` 之前增加 `assertPackageMain(staging, entry)`：

- `staging/package.json` 不存在：旧插件，跳过（保持兼容）。
- 存在但 `main` 不是字符串：跳过（例如 `examples/hello` 只有 `type`）。
- `main` 是字符串且不等于 `manifest.entry`：抛错，安装失败，旧版本保留。
- `main` 等于 `entry`：继续 `assertEntry`。

这样 `package.json` 真的“说明入口打包在哪里”，而不是只作为装饰。错误信息要带两个值，例如：

```text
extension "demo.counter": package.json main "lib/index.js" does not match plugin.json entry "index.js"
```

`manifest.entry` 仍由 `parsePluginManifest` 读取；页面加载逻辑不变。安装目录里的 `plugin.json` 不改写。

## 受影响文件

| 仓库 | 文件 | 动作 |
| --- | --- | --- |
| 远程 | `pnpm-workspace.yaml` | 新增 |
| 远程 | `pnpm-lock.yaml` | 新增并提交 |
| 远程 | `package.json` | 改写为聚合脚本；删除 devDependencies |
| 远程 | `tsconfig.json` | 删除 |
| 远程 | `tools/build-extension.mjs` | 删除 |
| 远程 | `tools/hash-extension.mjs` | 保留 |
| 远程 | `plugins/demo.counter/{package.json,build.mjs,tsconfig.json}` | 新增 |
| 远程 | `plugins/demo.counter/plugin.json` | `entry` 改为 `lib/index.js` |
| 远程 | `plugins/demo.counter/README.md` | 改写 |
| 远程 | `plugins/demo.counter/index.js` | 删除 |
| 远程 | `plugins/demo.counter/lib/index.js` | 新增（构建产物，提交） |
| 远程 | `plugins/demo.other/{package.json,build.mjs,tsconfig.json,src/index.ts,README.md}` | 新增 |
| 远程 | `plugins/demo.other/plugin.json` | `entry` 改为 `lib/index.js` |
| 远程 | `plugins/demo.other/index.js` | 删除 |
| 远程 | `plugins/demo.other/lib/index.js` | 新增（构建产物，提交） |
| 远程 | `marketplace.json` | 只改两个 `integrity` |
| 远程 | `README.md` | 改写布局、构建、发布与 integrity |
| hub | `packages/core/src/host/extension-market.ts` | 新增 `assertPackageMain` |
| hub | `packages/core/__test__/extension-market-install.test.ts` | 增加 main 校验用例 |
| hub | `docs/extensions.md` | 包布局、main 校验、产物位置 |
| hub | `docs/plans/plugin-project-packages.md` | 本计划 |

调用方核对：

- `tools/build-extension.mjs` 只被旧根脚本与远程 README 引用；删除时一并清掉。
- `tools/hash-extension.mjs` 的 CLI 用法不变，每个插件的 `hash` 脚本调用它。
- hub 的 `apps/web/__test__/e2e-probe.ts` 读 `marketplace.json` 的 `demo.other` integrity 并安装；不检查工程文件，不需要改，但阶段 4 增加对 `lib/index.js` 的检查。
- hub 的安装器测试用临时 fixture；新增 `package.json` 用例不依赖远程仓库。
- `apps/web/__test__/fixtures/demo.counter/` 保持不动。

## 阶段 1：远程工作区 + demo.counter

**目标**：根变成 pnpm workspace；`demo.counter` 成为完整包并产出 `lib/index.js`；`demo.other` 暂时保持旧结构。

**步骤**：

1. 新增 `pnpm-workspace.yaml`，改写根 `package.json`。
2. 新增 `plugins/demo.counter/package.json`、`build.mjs`、`tsconfig.json`。
3. 删除根 `tsconfig.json`、`tools/build-extension.mjs`。
4. 把 `plugin.json.entry` 改为 `lib/index.js`。
5. `pnpm install`（生成 lockfile），`pnpm typecheck`，`pnpm build`。
6. 删除 `plugins/demo.counter/index.js`，确认 `lib/index.js` 生成。
7. 改写 `plugins/demo.counter/README.md`。

**验收**：

```sh
cd D:/work-space/context-hub-extensions
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
head -1 plugins/demo.counter/lib/index.js
test ! -e plugins/demo.counter/index.js
node -e "const p=require('./plugins/demo.counter/package.json'); const m=require('./plugins/demo.counter/plugin.json'); if (p.main !== m.entry) throw new Error('main/entry mismatch')"
BEFORE=$(sha256sum plugins/demo.counter/lib/index.js | cut -d' ' -f1)
pnpm build
AFTER=$(sha256sum plugins/demo.counter/lib/index.js | cut -d' ' -f1)
[ "$BEFORE" = "$AFTER" ]
cd plugins/demo.counter && pnpm hash
```

- 所有命令退出 0；`head -1` 是 `// src/index.tsx`。
- 构建幂等；`pnpm hash` 输出 64 位十六进制。
- `git ls-files --eol plugins/demo.counter` 在 `git add -A` 后全部是 `w/lf`。

## 阶段 2：迁移 demo.other

**步骤**：

1. 新增 `src/index.ts`，内容 `export function apply() {}`。
2. 新增 `package.json`（version `0.1.0`）、`build.mjs`（入口 `src/index.ts`）、`tsconfig.json`、`README.md`。
3. `plugin.json.entry` 改为 `lib/index.js`。
4. `pnpm install`（更新 lockfile importer），`pnpm typecheck`，`pnpm build`。
5. 删除旧的 `plugins/demo.other/index.js`。

**验收**：

```sh
cd D:/work-space/context-hub-extensions
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
head -1 plugins/demo.other/lib/index.js
test ! -e plugins/demo.other/index.js
node --input-type=module -e "const m = await import('file:///D:/work-space/context-hub-extensions/plugins/demo.other/lib/index.js'); if (typeof m.apply !== 'function') throw new Error('no apply'); console.log('apply ok')"
BEFORE=$(sha256sum plugins/demo.other/lib/index.js | cut -d' ' -f1)
pnpm build
AFTER=$(sha256sum plugins/demo.other/lib/index.js | cut -d' ' -f1)
[ "$BEFORE" = "$AFTER" ]
```

## 阶段 3：hub 校验与文档

**步骤**：

1. 在 `packages/core/src/host/extension-market.ts` 增加 `assertPackageMain`，在 `assertEntry` 前调用。
2. 在 `packages/core/__test__/extension-market-install.test.ts` 增加用例：
   - `package.json.main` 与 `plugin.json.entry` 相同：安装成功，`lib/index.js` 落地。
   - 不同：安装失败，旧目录不动。
   - 没有 `package.json`：旧插件仍安装成功。
   - `package.json` 没有 `main`：跳过校验。
   - `main` 指向越界或非字符串：按“不同/无 main”处理，不引入新路径。
3. 更新 `docs/extensions.md`：
   - 包布局增加 `package.json`、`lib/`，说明 `main` 是入口声明、必须等于 `plugin.json.entry`。
   - 说明 Context Hub 没有 npm 发布层，所以 `lib/` 随 git 提交；不要照搬 deepseek-harness 的 `lib/` gitignore。
   - 安装器校验 `main` 与 `entry` 一致；旧插件没有 `package.json` 时保持原行为。
   - 修正两处 “pinned to a git commit” / “pins a commit” 的过时表述。
   - esbuild 示例补 `absWorkingDir`，避免产物首行随 cwd 漂移。

**验收**：

```sh
cd D:/work-space/dsh-context-hub
pnpm --filter @context-hub/core test
pnpm typecheck
pnpm lint
```

- 新增用例通过；`package.json` 不一致时安装失败且旧目录保留。

## 阶段 4：索引、提交与端到端

**步骤**：

1. 在远程仓库根跑最后一次 `pnpm build`，确认两个 `lib/index.js` 构建幂等。
2. `git add -A`，确认 `git ls-files --eol plugins` 全部 `w/lf`。
3. 计算哈希并更新 `marketplace.json` 的两个 `integrity`：

   ```sh
   node tools/hash-extension.mjs plugins/demo.counter
   node tools/hash-extension.mjs plugins/demo.other
   ```

4. 改写远程 `README.md`。
5. 远程仓库本地 commit（不 push）：

   ```sh
   git add -A
   git status --short
   git diff --cached --stat
   git commit -m "refactor: make each plugin a packed workspace package"
   ```

6. 干净克隆验证哈希：

   ```sh
   TMP=$(cygpath -m "$(mktemp -d)")
   git clone -c core.autocrlf=false -c core.eol=lf --depth 1 --no-tags \
     -- "D:/work-space/context-hub-extensions" "$TMP/repo"
   cd "$TMP/repo"
   node --input-type=module -e "
   import { readFileSync } from 'node:fs'
   import { folderHash } from './tools/hash-extension.mjs'
   const index = JSON.parse(readFileSync('marketplace.json', 'utf8'))
   for (const plugin of index.plugins) {
     const actual = await folderHash('plugins/' + plugin.id)
     if (actual !== plugin.versions[0].integrity) throw new Error(plugin.id + ': ' + actual)
   }
   console.log('clone integrity ok')
   "
   ```

7. hub 全量检查与 e2e：

   ```sh
   cd D:/work-space/dsh-context-hub
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm --filter web build
   node apps/desktop/build.ts
   pnpm --filter web build:cli
   ```

   桌面 `build.ts` 只验证 server bundle 能生成；`build:cli` 用 Bun 1.4.2（本机已确认）。

8. e2e 使用隔离 `HUB_HOME`，先通过市场处理器安装 `demo.counter`，再跑现有 probe 安装 `demo.other`；收尾只按自己启动的 PID 清理。

**验收**：

- 远程 `git status --short` 为空，`git log --oneline -1` 是本计划的 commit。
- 干净克隆打印 `clone integrity ok`。
- hub 的 typecheck/lint/test、web build、desktop build、CLI build 退出 0；若 CLI 因 Bun 或网络失败，记录命令与错误，不声称通过。
- e2e 打印 `all checks passed`，并且：
  - `demo.counter` 的计数按钮初始 `count: 0`，真实点击后 `count: 1`；
  - `demo.other` 安装后 `extensions/demo.other/lib/index.js` 存在；
  - 两条市场行的详情弹窗显示新 integrity；
  - 卸载后按钮切回安装、`state/extensions.json["demo.other"] === false`、文件保留。
- 安装目录检查：

  ```sh
  ls "$HUB_HOME/extensions/demo.other"
  ls "$HUB_HOME/extensions/demo.counter"
  test -f "$HUB_HOME/extensions/demo.other/lib/index.js"
  test ! -e "$HUB_HOME/extensions/demo.other/node_modules"
  ```

## 风险与回滚

1. **`lib/` 提交后 integrity 包含产物**：每次改源码必须重新构建、重新算哈希、更新索引。README 把这三步写成发布流程。漏掉任何一步，安装会被哈希校验拒绝（fail-closed），不会静默装旧版。
2. **esbuild 版本影响产物字节**：`pnpm-lock.yaml` 固定工具链；升级 esbuild 后必须重算 integrity。
3. **Windows 换行**：`.gitattributes` 的 `eol=lf` 保证提交与克隆是 LF；阶段 3 先用 `git ls-files --eol` 检查 `w/lf`，再算哈希。顺序不能反。
4. **版本号不变**：当前页面没有“更新”动作，已安装的 demo 副本不会自动刷新；这是既有行为，不在本次范围。
5. **hub 的 main 校验只覆盖市场安装**：本地手工放进 `extensions/` 的插件不受影响；`parsePluginManifest` 仍是页面入口的权威。这是有意的兼容边界。
6. **e2e 依赖远程 HEAD**：不 commit 就必然索引/克隆不一致；阶段 4 的本地 commit 是验证前置条件，不是发布动作。
7. **hub 分支有未提交改动**：typecheck/lint/test/build 可能因本计划之外的原因失败；如实记录，不顺手修。
8. **回滚**：远程仓库起始干净，`git revert <sha>` 恢复旧结构与旧 integrity。

## 待验证

- `pnpm install` 在当前网络环境能否完成；失败时先试 `pnpm install --offline`。
- `pnpm-workspace.yaml` 的 `allowBuilds: esbuild: true` 在 pnpm 10.33.4 下是否被识别。
- headless Edge 是否在 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。
- `pnpm --filter <插件名>` 对带点号的包名是否可用；验收优先用 `cd plugins/<id> && pnpm <script>`。

## 自审

- 与用户最新决定一致：使用打包后的产物，`package.json.main` 声明入口，默认 `lib/index.js`；hub 不做安装时构建。
- 与 deepseek-harness 的差异已写明：它有 npm 发布层，`lib/` 不提交；Context Hub 没有，必须提交。
- hub 改动最小：只新增一处一致性校验与单测；页面、加载器、运行时不变。
- 每个阶段有退出码或输出判据；阶段 2 结束两个插件都能构建；阶段 3 的 hub 校验先于阶段 4 的索引定稿。
- 未执行任何源码改动；所有构建/安装命令待批准后运行。

## 实施调整（2026-10-19）

用户在实施后要求去掉目录哈希：删除 `tools/hash-extension.mjs`，`marketplace.json` 不再有 `integrity`，安装器改为在克隆后校验索引、`plugin.json`、`package.json` 三处 `version` 一致。更新判断以 `package.json` 的 `version` 为准，不再计算内容哈希。计划中的哈希计算、哈希不匹配测试和干净克隆哈希验收，已由版本一致性检查与真实安装端到端替代。

