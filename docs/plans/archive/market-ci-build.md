# 市场仓 CI/CD：main 构建并回写产物

## 背景

- 市场仓 `D:\work-space\context-hub-extensions`（remote `https://github.com/bb-boy680/context-hub-extensions.git`，默认分支 `main`）是 pnpm workspace。根 `package.json` 只有 `build`（`pnpm -r build && pnpm build:marketplace`）、`build:marketplace`（`node scripts/build-marketplace.mjs`）、`typecheck`；没有 `lint`、`test`。pnpm@10.33.4，node>=20。
- 生成物有两类：`plugins/<id>/lib/index.js`（各插件 `build.mjs` 用 esbuild 产出）与根 `marketplace.json`（`scripts/build-marketplace.mjs` 扫描 `plugins/*`，排序固定、无时间戳）。
- 现状：`plugins/claude.code/lib/index.js`、`marketplace.json` 被跟踪；`plugins/skills.sh/lib/index.js` 已生成未跟踪；仓库没有 `.github/`。
- 主仓 `D:\work-space\dsh-context-hub` 的 `packages/extensions/src/settings.ts:26` 固定读 `https://raw.githubusercontent.com/bb-boy680/context-hub-extensions/main/marketplace.json`，安装时 clone 默认分支（`docs/extensions.md:8-10,163`）。产物在 main 上即可，hub 无需改动。
- 主仓 `.github/workflows/ci.yml` 是工具链参照：pnpm/action-setup@v4 version 10.33.4、setup-node@v4 node 24、`pnpm install --frozen-lockfile`，然后 lint/typecheck/test/build。主仓 ESLint 版本见 `apps/web/package.json:34-45`：`@eslint/js ^10`、`eslint ^10`、`globals ^17`、`typescript-eslint ^8`；锁文件解析为 eslint 10.10.0、typescript-eslint 8.70.0、globals 17.12.0。

## 决策

1. 开发者不再提交 `plugins/*/lib/` 和根 `marketplace.json`；分支上由 `.gitignore` 忽略。
2. 只有 main 的 bot commit 携带产物：push main 后先检查，再 `pnpm build`，然后 `git add -f` 回写 main。
3. 防循环：提交信息带 `[skip ci]`，job 级 `if: github.actor != 'github-actions[bot]'`，两道都保留。
4. 检查先于 build；市场仓缺根 `lint`/`test`，本计划补齐。
5. 不引入 PR 工作流、发布/tag、分发仓库或分支；hub 读取方式不变。
6. 不新增 `eslint-plugin-react-hooks`；lint 只覆盖市场仓插件源码。
7. 执行到验证为止：不 commit、不 push。

## 不做

- 不改主仓代码、测试或构建配置，只改 `docs/extensions.md`。
- 不改 `scripts/build-marketplace.mjs`、插件 `build.mjs`、`plugin.yaml` 或输出格式。
- CI 里不做 rebase、不做 force-push、不自动解决并发冲突。
- 不给 claude.code 补测试，不重构现有 `any` 类型。
- 不把市场仓接进主仓 workspace 或主仓 CI。

## 前置条件（用户确认，待验证）

- 上一任务的源改动（删除 demo 插件、新增 skills.sh、README/锁文件）需先提交；否则阶段 1 还要额外处理仍被跟踪的 `plugins/demo.counter/lib`、`plugins/demo.other/lib`。
- Actions 必须能直接 push main；本机 `gh` 未登录，以下**待用户在 GitHub 侧验证**：
  - `gh api repos/bb-boy680/context-hub-extensions/actions/permissions/workflow` 的 `default_workflow_permissions` 应为 `write`。
  - `gh api repos/bb-boy680/context-hub-extensions/branches/main/protection` 若启用 "Require a pull request" 或限制 push 用户，bot 会被拒；需给 `github-actions[bot]` 加 bypass，或改用 PR 策略（超出本计划）。
- 首次推送移除产物后，到 workflow 完成前 main 没有 `marketplace.json`，hub 市场页可能读不到；workflow 失败时窗口会持续到手工恢复。
- 阶段 1 的移除必须和阶段 3 的 workflow 一起推送，或先让 workflow 存在于 main，再推移除产物的提交；否则移除后没有东西负责回写。

## 阶段 1：停止跟踪生成物

**目标**：生成物从索引移除但留在磁盘，之后重新生成不再出现在 `git status`。

**文件**：市场仓 `.gitignore`，追加：

```gitignore
plugins/*/lib/
/marketplace.json
```

根锚定 `/marketplace.json`，避免误伤其他目录同名文件。

**命令**（市场仓根目录）：

```sh
git rm -r --cached --ignore-unmatch plugins/claude.code/lib plugins/skills.sh/lib marketplace.json
```

`plugins/skills.sh/lib` 未跟踪，`--ignore-unmatch` 避免报错；若 demo 源改动尚未提交，把 `plugins/demo.counter/lib plugins/demo.other/lib` 一并列入。`--cached` 不删磁盘文件，本地 `pnpm build` 与 e2e 继续可用（`apps/web/__test__/e2e-probe.ts:15` 读本地 checkout 的 `marketplace.json`）。

**验收**：

```sh
git ls-files -- 'plugins/*/lib/*' marketplace.json    # 输出为空
git check-ignore -v plugins/claude.code/lib/index.js plugins/skills.sh/lib/index.js marketplace.json
git status --short                                    # 只有暂存的 D，没有 ?? 生成物
test -f plugins/claude.code/lib/index.js && test -f marketplace.json && echo artifacts-on-disk
```

## 阶段 2：补齐 lint/test 门禁

**目标**：根 `pnpm lint`、`pnpm test` 可执行，CI 在 build 前拦截错误。

**文件**（市场仓根）：

- `package.json`：增加 `"lint": "eslint plugins"`、`"test": "pnpm -r --if-present test"`；devDependencies 增加 `@eslint/js ^10`、`eslint ^10`、`globals ^17`、`typescript-eslint ^8`（与主仓一致）；`pnpm install` 更新 `pnpm-lock.yaml`（本机需关 Bash 沙箱，见 `docs/memory.md`）。
- 新建 `eslint.config.js`（flat config，仿 `apps/web/eslint.config.js`）：
  - `globalIgnores(["**/node_modules/**", "**/lib/**", "marketplace.json"])`。
  - `plugins/*/build.mjs`：`js.configs.recommended` + `globals.node`。
  - `plugins/**/*.{ts,tsx}`：`js.configs.recommended` + `tseslint.configs.recommended` + `globals.browser`。
  - 已确认会命中 `@typescript-eslint/no-explicit-any`：`plugins/claude.code/src/contracts.ts` 有 8 处 `any` 类型别名，`src/index.tsx:117` 是 `apply(ctx: any)`。在这两个文件顶部各加一行文件级 disable，注明"插件契约刻意镜像未类型化的 host 边界"；不做类型重构。其他报错只修新门禁实际报出的项。
- `plugins/skills.sh` 已有 `test`（15 条 vitest）；`claude.code` 无 test，`--if-present` 保证根 test 不失败。

**验收**：

```sh
pnpm lint        # exit 0
pnpm test        # exit 0，skills.sh 15 passed
pnpm typecheck   # exit 0，两个插件都通过
```

实施报告里列出 lint 实际改动；若通过调整配置而非改源码，写明原因。

## 阶段 3：新增 main 构建工作流

**文件**：新建市场仓 `.github/workflows/build-market.yml`。

```yaml
name: build-market

on:
  push:
    branches: [main]

permissions:
  contents: write

concurrency:
  group: build-market-${{ github.ref }}
  cancel-in-progress: false

jobs:
  build:
    if: github.actor != 'github-actions[bot]'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - name: commit generated artifacts
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -f plugins/*/lib marketplace.json
          if git diff --cached --quiet; then
            echo "no artifact changes"
            exit 0
          fi
          git commit -m "chore: build market artifacts [skip ci]"
          git push
```

**约束与说明**：

- `git add -f` 必须带，两类路径都被忽略；bot commit 只含这两类路径，源码在 CI 中不会变化。
- checkout 默认保留凭据，`git push` 使用 `GITHUB_TOKEN`；`permissions.contents: write` 必须实际生效。
- `[skip ci]` 防二次触发，actor guard 是第二道防线。补充事实：用 `GITHUB_TOKEN` 产生的 push 不会触发新的 workflow run（GitHub 递归防护），所以不会自循环。
- 人工 push 与 bot push 竞争时，non-fast-forward 会让本 run 失败；下一次 push 会重新构建。不用 force-push，也不在 CI 里 rebase（rebase 后的产物可能基于旧源码）。
- 首次推送后 main 暂时缺少 `marketplace.json`；workflow 失败时需立刻修 workflow 或手工把产物加回索引。

**验收**：

- 文件存在；运行阶段 5 的 js-yaml 命令，确认 `jobs.build` 存在。
- 人工核对 `on.push.branches`、`permissions.contents`、job `if`、`cancel-in-progress`、检查顺序、`git add -f` 与 `[skip ci]`。
- 不在本地执行 workflow；GitHub 侧的权限和并发语义由首次 push 验证，报告中标注未验证。

## 阶段 4：更新文档

**市场仓 `README.md`**：

- Layout 里 `lib/index.js` 一行改为：由 main 上的 CI 生成并提交，分支不要提交。
- 删除 "`lib/` is committed because..." 段落，替换为：main 携带 CI 生成的 `lib/` 和 `marketplace.json`，开发者只提交源码；本地 `pnpm build` 可用于验证，产物被忽略。
- "Write a plugin" 第 4 步保留本地 build 检查（可选）；第 6 步改为只提交源码，不提交 `lib/` 和 `marketplace.json`。
- "Updating a plugin" 改为：改 `src/`、升 `package.json.version`、提交源码；CI 在 main 上重建并回写。
- 增加一小段 CI 说明：push main 触发 lint/typecheck/test/build，bot commit 携带产物；不要手改索引。

**主仓 `docs/extensions.md`**：第 32 行附近 `lib/` 段落改为——市场仓 main 上的 `lib/` 与 `marketplace.json` 由其 CI 生成并提交；源分支不提交构建输出；安装器仍 clone 默认分支并直接 import 入口。其余 market 描述（raw URL、clone 默认分支、版本同步校验）不变。

**验收**：

```sh
grep -n "CI\|generated\|lib/" /d/work-space/context-hub-extensions/README.md | head -20
grep -n -C 2 "CI" /d/work-space/dsh-context-hub/docs/extensions.md | head -20
```

两处都不再出现"开发者提交 lib/marketplace.json"的旧说法。

## 阶段 5：本地验证（不 commit、不 push）

在市场仓执行：

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
rm -rf plugins/*/lib marketplace.json
pnpm build
sha256sum plugins/*/lib/index.js marketplace.json > /tmp/market-build-1.sha
pnpm build
sha256sum -c /tmp/market-build-1.sha
git check-ignore -v plugins/claude.code/lib/index.js plugins/skills.sh/lib/index.js marketplace.json
git ls-files -- 'plugins/*/lib/*' marketplace.json
git add -f --dry-run plugins/*/lib marketplace.json
git status --short
```

- 先删除再构建，验证"干净 checkout 能构建"；esbuild 会创建 `lib/`。
- 两次 build 的 sha256 必须一致（生成器无时间戳，`absWorkingDir` 固定路径 banner）。
- `git add --dry-run` 只打印路径，不改索引；`git status` 不应出现被忽略的生成物。
- YAML 语法（js-yaml 是市场仓根 devDependency）：

```sh
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {load, CORE_SCHEMA} from 'js-yaml'; const d=load(readFileSync('.github/workflows/build-market.yml','utf8'),{schema:CORE_SCHEMA}); if (!d.jobs?.build) throw new Error('no build job'); console.log(Object.keys(d), Object.keys(d.jobs))"
```

期望输出含 `on`、`permissions`、`concurrency`、`jobs` 与 `build`。本机若有 `actionlint` 再跑一次；否则注明 GitHub 专有语义未在本地验证。

- 主仓只改 `docs/extensions.md`，不跑代码检查；若还改了主仓源码，运行 `pnpm typecheck` 与相关包测试（根 `pnpm test` = `vitest run`）。

**边界**：不执行 `git commit`、`git push`，不实际运行 Actions。

## 阶段 6：AOCI 收尾

- 市场仓没有 AOCI 索引，无需维护。
- 主仓 `docs/extensions.md` 不是 AOCI 受管文件（`grep -c '^docs/' aoci.code.txt` 为 0）；本次只改文档，不触发 `aoci_maintain`。
- 若实施中改了 `aoci.code.txt` 登记的文件，等改动稳定后调用一次 `aoci_maintain`，有候选再按 AOCI 规则提交。

## 风险与回滚

- **Bot 无权 push**：workflow 失败，main 没有产物。先查 Workflow permissions 与 branch protection；临时手工 `git add -f` + commit 恢复市场，再修权限。
- **并发 push**：bot push 被拒，下一次 push 的 run 会重建；不要 force-push。
- **首次上线窗口**：先确认写权限再推"移除产物"的提交，否则 main 会短暂或持续缺少 `marketplace.json`。
- **本地与 CI 字节不一致**：锁文件固定 esbuild 版本、`absWorkingDir` 固定路径；阶段 5 只验证本机双次构建，CI 首次若产生 diff 需人工确认。
- **lint 暴露旧问题**：只修新门禁报出的项；类型重构、React hooks 规则留到单独任务。
