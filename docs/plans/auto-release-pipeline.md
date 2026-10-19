# 手动 tag 发布流水线 + PR 门禁

- 日期：2026-10-19
- 仓库：`D:\work-space\dsh-context-hub`，远程 `https://github.com/bb-boy680/context-hub`
- 当前分支：`feat/remote-extension-market`，`main` 与当前 HEAD 同为 `3062635`，工作区有大量未提交业务改动
- 状态：待审批
- 实施基线：从 `main` 新建独立 worktree（例如 `../dsh-context-hub-release`，分支 `chore/release-tags`）。不要在当前工作区提交，否则会把 `feat/remote-extension-market` 的未提交文件带进来。

## 用户已确认的决策

| 决策 | 选择 |
|---|---|
| 发版触发 | **手动打 tag**；合并 main 不产生 tag、不发版 |
| 版本号 | 打 tag 前手动把根和 `apps/desktop/package.json` 改成 tag 版本；workflow 校验不一致就失败 |
| 测试版 | tag 版本含 `-`（如 `v0.2.0-beta.1`）时创建 GitHub **prerelease**，不进入 latest |
| 正式版 / 大版本 | 普通 `vX.Y.Z` tag，创建普通 Release；大版本就是手动升 major |
| **PR 门禁** | 合并 PR 前必须通过 `pnpm lint`、`pnpm test` 等检查，通过后才允许 build |
| 首次版本 | `v0.0.1` |
| 验证方式 | 先 `workflow_dispatch` 跑通三平台构建（不发布），再打 tag 验证完整发布 |

## 背景与现状

### 现有发布链路

`.github/workflows/release.yml` 已经存在，**触发方式正是用户要的**：

```yaml
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
```

- `version` job（`:24-40`）读根 `package.json` 版本，并在 tag 触发时校验 `GITHUB_REF_NAME == "v$VERSION"`。
- `cli` job（`:42-77`）在 ubuntu 上用 Bun 1.4.2 交叉编译 5 个目标，烟测 Linux x64：页面、`/hub/about`、根版本。
- `desktop` job（`:79-118`）在 Windows/macOS/Ubuntu 三个 runner 上 `pnpm build` 后跑 electron-builder，上传安装包、`latest*.yml`、`.blockmap`。
- `publish` job（`:120-133`）只在 tag 触发时 `gh release view || gh release create --generate-notes`，再 `gh release upload --clobber`。
- `docs/building.md:215-217` 的 Known limits 明确说这个 workflow **从未运行过**。

仓库目前**没有 PR 检查 workflow**，`.github/workflows/` 下只有 `release.yml`。PR 合并前没有任何自动化检查。

### 缺口

1. **PR 没有门禁**：错误代码可以直接合并到 main。
2. **发布前没有检查**：tag 推上去后直接构建，坏代码会留下无法发布的 tag。
3. **测试版没有区分**：所有 tag 都创建普通 Release，`electron-updater` 会把测试版当成 latest 推给正式用户。
4. **版本校验报错不明确**：tag 与 `package.json` 不一致时只有一行 `test` 失败。

### 版本来源与约束

- 根 `package.json` 的 `version` 是唯一发布版本源，当前 `0.0.1`。
- `apps/web/server.ts:24` 直接 import 根 manifest，`:113-117` 把它传给 About；CLI 内嵌版本也来自这里。
- `apps/desktop/electron-builder.config.mjs:10` 读根 manifest，`:37-39` 写进 `extraMetadata.version`；publish 指向 `bb-boy680/context-hub`（`:40`）。
- `apps/desktop/package.json` 的 `version` 必须镜像根版本，当前也是 `0.0.1`。
- `apps/desktop/__test__/version.test.ts:12-17` 强制两者相等，并要求 `^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`。这个正则**允许** `0.2.0-beta.1` 这种测试版版本。
- `apps/web/package.json` 的 version 不再被读取，本次也不改它。
- 仓库当前没有任何 tag。
- 根脚本已具备：`pnpm lint`（turbo lint）、`pnpm typecheck`（turbo typecheck）、`pnpm test`（vitest run）、`pnpm build`（turbo build）。

## 目标

1. **PR 合并前**自动运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`，全部通过后再运行 `pnpm build`；任何一步失败都不能合并（配合分支保护）。
2. 手动推 `vX.Y.Z` tag 后，自动校验版本、跑同样的检查、构建 5 个 CLI 二进制和三平台桌面安装包，发布到 GitHub Release。
3. 手动推 `vX.Y.Z-<prerelease>` tag 后，走同一套构建，但 Release 标记为 prerelease，正式用户的 `electron-updater` 不会升级到它。
4. `workflow_dispatch` 仍然只构建 artifact，不发布，用于首次演练和排障。
5. 版本不一致时给出明确错误，并在构建任何产物前失败。
6. 不引入新依赖、PAT、自动版本 PR 或自动提交 main。

## 非目标（不做）

- 不做自动版本计算、自动 bump、自动打 tag；合并 main 不触发任何发布。
- 不引入 changelog 文件；Release notes 继续用 GitHub 的 `--generate-notes`。
- 不采购代码签名证书，不改变现有 macOS 签名/公证的可选 secrets 逻辑。
- 不增加 Windows arm64、macOS Intel、Linux arm64 桌面包；矩阵保持现状。
- 不支持 `+build` metadata 版本；版本测试的正则本身也不允许。
- 不改 CLI 交叉编译、electron-builder 配置、更新 feed 格式或 `electron-updater`。
- 不改 `apps/web/server.ts`、`apps/desktop/__test__/version.test.ts`、`apps/web/package.json`。
- 不手工编辑 `aoci.txt`；实施稳定后按 `AGENTS.md` 调用一次 `aoci_maintain`。
- 不碰当前 `feat/remote-extension-market` 工作区的任何未提交文件。

## 关键决策

### 1. 触发方式

保持现有 `push.tags: ["v*"]` 与 `workflow_dispatch`，**不加** `push.branches: [main]`。合并 main 不会产生 tag、Release 或发布构建。

用户手动执行：

```sh
# 1. 根和 apps/desktop/package.json 的 version 改成 1.2.0
# 2. 提交并推送
git add package.json apps/desktop/package.json
git commit -m "chore(release): v1.2.0"
git push
# 3. 打 tag 并推送，触发发布
git tag -a v1.2.0 -m "v1.2.0"
git push origin v1.2.0
```

测试版把两处版本和 tag 都改成 `1.2.0-beta.1`。大版本就是 `2.0.0`。流程完全相同。

### 2. PR 门禁

新增 `.github/workflows/ci.yml`：

```yaml
on:
  pull_request:
    branches: [main]
```

单个 `checks` job，一次安装依赖，按顺序执行：

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- `lint`、`typecheck`、`test` 全部通过后才执行 `build`，符合“先 lint/test，再 build”。
- 用单个 job 而不是拆成多个，避免每个 job 重复 `pnpm install`。
- `concurrency` 以 PR 号为组、`cancel-in-progress: true`：同一 PR 的新提交取消旧 run。
- 权限只需 `contents: read`。

**CI 失败本身不会阻止合并**，必须在 GitHub 仓库设置里把 `checks` 配成 required status check：

```text
Settings → Branches → Branch protection rules → main
→ Require status checks to pass before merging
→ 选择 `checks`
```

如果没有分支保护（或没勾选 required），CI 只是红灯提示，仍可点 Merge。这一步是仓库设置，workflow 无法代替。文档必须写清楚。

### 3. 版本校验

`version` job 在 tag 路径校验：

```sh
VERSION=$(node -p "require('./package.json').version")
if [ "$GITHUB_REF_TYPE" = "tag" ] && [ "$GITHUB_REF_NAME" != "v$VERSION" ]; then
  echo "tag $GITHUB_REF_NAME does not match package.json version $VERSION" >&2
  exit 1
fi
```

根与 `apps/desktop/package.json` 的一致性由 `checks` 里的 `pnpm test`（`apps/desktop/__test__/version.test.ts`）守住。两处不一致时，`checks` 失败，不构建。

### 4. 测试版判定

版本字符串含 `-` 即为 prerelease。`version` job 输出 `prerelease=true|false`：

```sh
case "$VERSION" in
  *-*) PRE=true ;;
  *)   PRE=false ;;
esac
```

`publish` job 在 `true` 时给 `gh release create` 加 `--prerelease`。这样：

- GitHub 的 latest release 不会选中它；
- `electron-updater` 当前配置 `allowPrerelease = false`（`apps/desktop/src/update.ts`），正式用户不会收到测试版；
- 测试版仍然可以手动下载安装。

如果 Release 已经存在（例如用户先在 GitHub UI 创建），workflow 会用 `gh release edit "$TAG" --prerelease` 把标记补齐。

### 5. 发布门禁

发布 workflow 的 `checks` job 与 PR CI 保持一致，同样包含 `pnpm lint`：

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- PR CI 已经把错误拦在合并之前；发布门禁是第二道保险，因为 tag 可能指向未经 PR 的提交。
- `pnpm build` 在打 tag 之后、三平台构建之前运行：先在 ubuntu 上证明整棵树能构建，避免留下无法发布的 tag。

### 6. job 依赖

PR CI：

```text
pull_request → checks（lint → typecheck → test → build）
```

发布：

```text
version（校验 tag 与版本，输出 version/prerelease）
  └─ checks（lint → typecheck → test → build）
       ├─ cli（5 个二进制 + Linux 烟测）
       └─ desktop（windows/macos/ubuntu 安装包）
            └─ publish（仅 tag 事件；按 prerelease 标记创建 Release）
```

`workflow_dispatch` 走同样的 `version → checks → cli/desktop`，`publish` 因不是 tag 事件而跳过。

## 受影响文件

| 文件 | 动作 |
|---|---|
| `.github/workflows/ci.yml` | 新增：PR 的 lint/typecheck/test/build 门禁 |
| `.github/workflows/release.yml` | `version` 输出 prerelease 并改校验；新增 `checks`（含 lint）；`cli`/`desktop` 加 `needs: checks`；`publish` 支持 prerelease |
| `docs/building.md` | 更新 Version、To publish、Release、Known limits；新增 PR 检查与分支保护说明 |
| `docs/plans/auto-release-pipeline.md` | 本计划 |

调用方核对：

- `needs.version` 出现在 `.github/workflows/release.yml` 的 `cli`/`desktop`（`:43`、`:80`）；改造后保留，并加 `checks`。
- 版本读取点只有 `apps/web/server.ts`、`apps/desktop/electron-builder.config.mjs`、`apps/desktop/__test__/version.test.ts`、workflow；不需要改代码。
- README 第 55-58 行只指向 `docs/building.md`，不需要改。
- 当前工作区的业务文件、`apps/web/package.json`、`README.md` 都不改。

## 阶段

### 阶段 1：新增 PR 检查 workflow

**目标**：每个进入 main 的 PR 自动跑 lint/typecheck/test/build，为分支保护提供 required check。

**改动文件**：

- 新增 `.github/workflows/ci.yml`

**步骤**：

1. 创建 `.github/workflows/ci.yml`：

   ```yaml
   # Checks every pull request into main before it can merge.
   # Branch protection must require the `checks` job; a failing run alone does
   # not block a merge.
   name: ci

   on:
     pull_request:
       branches: [main]

   permissions:
     contents: read

   concurrency:
     group: ci-${{ github.event.pull_request.number }}
     cancel-in-progress: true

   jobs:
     checks:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
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
   ```

2. 文件头注释必须写明“CI 失败不会自动阻止合并，需要在分支保护里勾选 `checks`”。

**验收**：

```sh
grep -n "pull_request" .github/workflows/ci.yml
grep -n "pnpm lint\|pnpm test\|pnpm build" .github/workflows/ci.yml
grep -n "branches: \[main\]" .github/workflows/ci.yml
git diff --check
```

本机没有 `actionlint` 和 PyYAML，不要声称 YAML 已被解析器验证。把 `run` 步骤序列抄到临时脚本做 `bash -n` 意义不大（都是单行命令），改为在阶段 4 由真实 PR run 验证。

### 阶段 2：改造发布 workflow

**目标**：tag 触发时增加发布门禁（含 lint）和测试版区分；不改变触发方式、构建命令和产物路径。

**改动文件**：`.github/workflows/release.yml`

**步骤**：

1. `version` job 的 `outputs` 增加 `prerelease`：

   ```yaml
   version:
     runs-on: ubuntu-latest
     outputs:
       version: ${{ steps.read.outputs.version }}
       prerelease: ${{ steps.read.outputs.prerelease }}
   ```

2. `version` job 的 `read` step 改成：

   ```yaml
   - id: read
     shell: bash
     run: |
       VERSION=$(node -p "require('./package.json').version")
       echo "version=$VERSION" >> "$GITHUB_OUTPUT"

       case "$VERSION" in
         *-*) echo "prerelease=true" >> "$GITHUB_OUTPUT" ;;
         *)   echo "prerelease=false" >> "$GITHUB_OUTPUT" ;;
       esac

       if [ "$GITHUB_REF_TYPE" = "tag" ] && [ "$GITHUB_REF_NAME" != "v$VERSION" ]; then
         echo "tag $GITHUB_REF_NAME does not match package.json version $VERSION" >&2
         exit 1
       fi
   ```

3. 新增 `checks` job：

   ```yaml
   checks:
     needs: version
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
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
   ```

4. `cli` 与 `desktop`：

   - `needs: version` → `needs: [version, checks]`。
   - 其余（矩阵、checkout、构建命令、artifact 路径）保持现状。

5. `publish`：

   - `needs: [version, cli, desktop]` 保持不变（`cli`/`desktop` 已经间接依赖 `checks`）。
   - `if: startsWith(github.ref, 'refs/tags/')` 保持。
   - 步骤改成：

   ```yaml
   - name: Publish
     env:
       GH_TOKEN: ${{ github.token }}
       PRERELEASE: ${{ needs.version.outputs.prerelease }}
     run: |
       TAG="$GITHUB_REF_NAME"
       if gh release view "$TAG" >/dev/null 2>&1; then
         if [ "$PRERELEASE" = "true" ]; then
           gh release edit "$TAG" --prerelease
         fi
       elif [ "$PRERELEASE" = "true" ]; then
         gh release create "$TAG" --title "$TAG" --generate-notes --prerelease
       else
         gh release create "$TAG" --title "$TAG" --generate-notes
       fi
       gh release upload "$TAG" dist-artifacts/* --clobber
   ```

6. 更新文件头注释：说明 tag 由人手动推送；测试版 tag 创建 prerelease；合并 main 不触发发布；`workflow_dispatch` 只构建 artifact。

**验收**：

```sh
grep -n "prerelease" .github/workflows/release.yml      # version 输出、publish 分支
grep -n "needs: \[version, checks\]" .github/workflows/release.yml  # cli/desktop 两处
grep -n "needs: version" .github/workflows/release.yml  # checks 一处、publish 一处
grep -n "pnpm lint" .github/workflows/release.yml       # checks 一处
grep -n "push.tags\|branches: \[main\]" .github/workflows/release.yml  # 只有 tags，没有 main
git diff --check
```

额外做两件事：

1. 把修改后的 workflow 中 `read` 和 `Publish` 的 `run` 块原样保存到临时文件，分别跑 `bash -n`，退出 0。
2. 用本地模拟验证 prerelease 判定，不触发 workflow：

   ```sh
   for VERSION in 0.0.1 0.2.0-beta.1 2.0.0-rc.2; do
     case "$VERSION" in
       *-*) echo "$VERSION -> prerelease" ;;
       *)   echo "$VERSION -> release" ;;
     esac
   done
   ```

   三行输出分别符合预期。

### 阶段 3：更新发布与 PR 文档

**目标**：文档只描述手动手动流程和 PR 门禁，不留下自动版本/自动 tag 的描述。

**改动文件**：`docs/building.md`

**步骤**：

1. `## Version`（`:7-20`）：

   - 明确根 `package.json` 是唯一版本源；`apps/desktop/package.json` 必须镜像它。
   - 写清手动流程：改两处 version → 提交 → 打 `v<version>` tag → push tag。
   - 写明测试版：版本和 tag 都带 `-beta.1` / `-rc.1` 后缀。
   - 写明 tag 与版本不一致时 `version` job 会失败。
   - 保留现有 “A tag must be `v` + the root version” 的说明，但改成“由 workflow 校验”。

2. 新增 `## Pull requests` 小节（放在 `## Release` 之前）：

   - 每个进入 main 的 PR 自动运行 `.github/workflows/ci.yml`：`pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`。
   - CI 失败不会自动阻止合并；必须在 `Settings → Branches → main → Require status checks` 里选中 `checks`。
   - 同一 PR 的新提交会取消旧 run。
   - 首次启用需要在仓库 Actions 页面允许 workflows。

3. `## Updates` 的 “To publish”（`:182-189`）：

   - 保留手动步骤，补充测试版示例。
   - 不新增“合并 main 自动发版”的描述。

4. `## Release`（`:198-209`）：

   - 触发：`push` `v*` tag 与 `workflow_dispatch`；合并 main 不触发。
   - job 流程：`version → checks → cli/desktop → publish`。
   - 说明 `checks` 的门禁内容（与 PR CI 相同）。
   - 说明测试版 tag 创建 prerelease，`electron-updater` 不会把它推给正式用户。
   - 说明 `workflow_dispatch` 只上传 Actions artifacts，不创建 Release。
   - 重跑：同一 tag 的 run 可以用 Re-run failed jobs；`publish` 用 `--clobber` 覆盖已上传资产。
   - 仓库前提：`Settings → Actions → General → Workflow permissions` 为 Read and write；tag 保护不能阻止 Actions 发布 Release。

5. `## Known limits`（`:211-232`）：

   - 把 “the CI workflow have not been run from this checkout” 改成 “the release workflow has not been exercised from this checkout; the first tag push is the verification”。第一次成功后删掉。
   - 增加：未签名安装包、macOS arm64 only 保留；tag 先于构建，构建失败会留下无 Release 的 tag，用重跑恢复。
   - 增加：测试版 Release 不会成为 latest；如果手工安装测试版，之后正式版版本号更高时会正常升级。
   - 私有仓库限制：Release 资产只对协作者可见，桌面端匿名更新检查不工作。

**验收**：

```sh
grep -n "Pull requests" docs/building.md
grep -n "pnpm lint" docs/building.md
grep -n "Require status checks" docs/building.md
grep -n "first tag push is the verification" docs/building.md
grep -n "prerelease" docs/building.md
grep -n "v0.2.0-beta.1\|beta" docs/building.md
git diff --check
```

文档里的触发、job 名、校验规则与 workflow 一致；不声称 workflow 已经跑过。

### 阶段 4：演练并验收

**目标**：先用零副作用方式跑通 PR 门禁和三平台构建，再验证 tag 发布路径。

**步骤**：

1. 在独立 worktree 中完成阶段 1-3，运行本地验收：

   ```sh
   pnpm install --frozen-lockfile
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

   当前工作区有未提交业务改动；这些命令只在干净 worktree/实现分支上作为验收。若 `pnpm lint`/`pnpm test` 失败来自 main 已有代码而非本次改动，记录完整命令和错误，不顺手修（AGENTS.md 的“不要顺手修无关问题”）。若本机 `pnpm install` 因沙箱无外网卡住，按 `docs/memory.md` 的规则带 `dangerouslyDisableSandbox` 重跑。

2. 把改动推到 `chore/release-tags` 分支并开 PR 到 main。**这个 PR 本身就是 PR CI 的第一次真实验证**：

   - `ci / checks` run 出现在 PR 底部；
   - 依次跑完 lint、typecheck、test、build；
   - 修到全绿再合并。

3. 在 main 的仓库设置里配置分支保护（如果还没有）：

   ```text
   Settings → Branches → Branch protection rules → main
   → Require status checks to pass before merging
   → 选择 `checks`
   ```

   验收：故意让一个后续小 PR 的 lint 失败，确认 GitHub 的 Merge 按钮被禁用；恢复后确认可合并。这一步需要用户操作或授权，不要为了测试向 main 推坏代码。若不想做失败演练，至少确认 `checks` 出现在 required checks 列表里。

4. **零副作用演练**：在 Actions 页面手动 Run workflow（`workflow_dispatch`），或使用已登录的 `gh workflow run release.yml --ref main`。

   验收：`version`、`checks`、`cli`、`desktop`（三个平台）全部成功；`publish` 被跳过；Actions artifacts 里有 1 个 CLI 包 + 3 个 desktop 包；没有产生 tag 或 Release。

5. **测试版 tag 验证**：

   - 把根和 `apps/desktop/package.json` 的 version 改成 `0.0.1-beta.1`，提交并推送。
   - 打并推送 tag `v0.0.1-beta.1`。
   - 验收：workflow 全绿；Release 页面出现 `v0.0.1-beta.1`，标记为 **Pre-release**；资产包含 5 个 CLI、Windows/macOS/Linux 安装包和 `latest*.yml`；GitHub 的 latest release 仍不是它。
   - 如果仓库暂时不想保留测试版 Release，先不要推测试 tag，直接跳到第 6 步；测试版路径的风险列在 Known limits，等第一次真正需要测试版时验证。

6. **正式版 tag 验证**：

   - 把两处 version 改成 `0.0.1`，提交并推送。
   - 打并推送 tag `v0.0.1`。
   - 验收：workflow 全绿；Release 页面出现 `v0.0.1`，不是 prerelease；资产清单与测试版一致。
   - `git fetch --tags` 后确认有 `v0.0.1-beta.1` 和 `v0.0.1` 两个 tag（如果执行了第 5 步）。
   - 下载 Windows CLI 或 Linux CLI 跑一次：

     ```sh
     ./context-hub-windows-x64.exe --port 5299 &
     curl -fsS http://127.0.0.1:5299/hub/about
     kill %1
     ```

     `/hub/about` 的 `version` 等于 `0.0.1`。
   - 下载 `latest.yml`，确认 `version: 0.0.1`，`path`/`url` 指向的安装包确实在 Release 里。
   - 安装 Windows NSIS 包，侧边栏显示的版本等于 `0.0.1`；SmartScreen 警告是预期（未签名）。

7. 第一次成功后，更新 `docs/building.md` 的 Known limits，删掉 “workflow 尚未运行”那一条。这是验收后的文档提交，不改变流程。

8. 收尾：实施稳定后按 `AGENTS.md` 调用一次 `aoci_maintain`；不要手工改 `aoci.txt`。

**验收**：

- PR 上 `ci / checks` 真实运行且全绿；配置分支保护后，required check 生效。
- dispatch run 全绿且没有 tag/Release。
- 测试版 tag 产生 prerelease Release（如果执行）。
- 正式 tag 产生普通 Release，且只有它成为 latest。
- `About` 版本、`latest*.yml` 版本、tag、Release 标题四者一致。
- Release 资产覆盖：5 个 CLI、Windows `.exe` + `latest.yml`、macOS `.dmg` + `.zip` + `latest-mac.yml`、Linux `.AppImage` + `latest-linux.yml`，以及对应 `.blockmap`。

## 风险与回滚

1. **PR 门禁依赖仓库设置**：`ci.yml` 只负责跑检查；不配置 required status check，失败的 PR 仍然能合并。这一步必须在 GitHub Settings 完成，workflow 无法代替。
2. **lint 可能在 main 上已经失败**：仓库此前没有 CI，现有代码可能不满足 `eslint`。若干净 worktree 上 `pnpm lint` 失败，需要先修到通过，否则 PR CI 全红。这是启用门禁的必要成本，不能把 lint 从门禁里删掉来绕过（用户明确要求）。
3. **首次运行无法本地验证**：CLI 交叉编译、三平台 electron-builder、`latest*.yml` 生成都依赖真实 runner。阶段 4 的 dispatch 演练是第一次真实证据；在此之前不要声称 CI 可用。
4. **Workflow permissions 为只读**：`Settings → Actions → General → Workflow permissions` 必须是 Read and write；否则 `publish` 无法创建 Release 或上传资产。
5. **tag 保护**：如果 tag 保护禁止 Actions 发布 Release，`publish` 会失败；tag 本身由用户推送，不受 workflow 权限影响。
6. **版本不一致**：tag 与 `package.json` 不一致时 `version` job 立即失败；根与 desktop 不一致时 `checks` 的版本测试失败。两种情况都不会构建产物。
7. **构建失败留下空 tag**：tag 在构建前已存在。用同一 tag 的 Re-run failed jobs 恢复；不要为了消除这个状态去删 tag/force-push。删除 tag/Release 属于破坏性操作，必须先问用户。
8. **测试版标记**：如果用户先在 GitHub UI 创建了 Release 而没有勾选 prerelease，workflow 会尝试 `gh release edit --prerelease` 补齐。如果 Release 已设置为 latest，仍以 GitHub 页面为准，需要人工确认。
9. **空 tag 的 Release notes**：首次 `--generate-notes` 没有上一个 tag 时，notes 可能是完整历史。可接受；需要时再单独整理。
10. **未签名安装包**：Windows SmartScreen、macOS Gatekeeper 会警告；macOS 未签名自动更新不可靠。这是既有 Known limit，不在本次解决。
11. **macOS runner 是 arm64**：只产出 arm64 dmg/zip；Intel Mac 需要 x64 matrix entry，不在本次范围。
12. **私有仓库限制**：如果仓库是私有的，Release 资产只对协作者可见，桌面端匿名 `electron-updater` 检查不会工作。公开发布二进制需要公开仓库或另行分发。
13. **Actions 分钟数**：PR CI + 三平台桌面构建 + CLI 会消耗分钟；macOS/Windows 有倍率。每个 PR 都会跑一次 lint/typecheck/test/build。上线前确认计费可接受。
14. **回滚**：流程问题优先 revert workflow 提交；不要 force-push main，不要重写历史。已经发布的 tag/Release 默认保留，修 forward。

## 待验证

- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 在干净 ubuntu runner 上是否全绿。验证方式：实施 PR 的 `ci / checks`。
- 分支保护 required status check 的名称与生效方式。验证方式：GitHub Settings 页面，以及一个失败 PR 的 Merge 按钮状态。
- `pnpm install --frozen-lockfile` 在干净 ubuntu runner 上是否成功。验证方式：同一个 PR run。
- Bun 1.4.2 交叉编译 5 个目标在当前 runner 上是否成功。验证方式：dispatch 的 `cli` job。
- 三个平台的 electron-builder 是否都能产出 `.exe`/`.dmg`/`.zip`/`.AppImage` 和 `latest*.yml`。验证方式：dispatch 的 `desktop` job 与 artifacts。
- `gh release edit "$TAG" --prerelease` 的语法与幂等性。验证方式：测试版 tag 的 publish job。
- 仓库 Workflow permissions、tag 保护是否允许 Actions 发布 Release。验证方式：GitHub Settings 页面；已登录时可用 `gh api repos/bb-boy680/context-hub/actions/permissions/workflow`。
- 仓库是否私有、Actions 分钟数是否可接受。验证方式：Settings → Billing 页面。

## 需要用户确认

1. PR 门禁顺序按 `lint → typecheck → test → build`，是否接受？（`typecheck` 是额外保留项，成本低）
2. 是否确认完全不要自动版本 / 自动 tag：每次发版由你改两处 `version` 并推 tag。
3. 阶段 4 是否执行测试版 tag 演练（会留下一个 `v0.0.1-beta.1` prerelease Release），还是只跑 PR CI + dispatch + 正式版 `v0.0.1`？
4. 是否接受本次不解决代码签名、macOS Intel、Windows arm64 和 changelog？
5. 仓库前提是否满足：Workflow permissions 为 Read and write、tag 保护允许 Actions 发布 Release、分支保护可配置 required check？

## 自审

- 新增 PR CI 与发布门禁共用同一组命令，顺序一致；lint 现在是明确要求的门禁项。
- 触发方式没有改变，现有 tag 构建链路保持原样；新增的 `checks` 和 prerelease 分支都是增量。
- 版本来源仍唯一：根 `package.json`；desktop 镜像由现有测试守住；workflow 只校验，不再写文件。
- 测试版判定基于 semver prerelease 后缀，与现有版本测试正则一致（允许 `-beta.1`）。
- PR 门禁的“强制”边界已明确：workflow 只能跑检查，阻止合并依赖分支保护设置。
- 事实与判断分开：文件路径、job 行号、版本正则、无 tag、workflow 内容都是读仓库得到；runner 构建结果、`gh release edit` 行为、仓库权限标为待验证。
- 已避开 Bash 坑：`case` 判定 prerelease；不引入 `head`/pipefail 组合。
- 文档与计划不声称 workflow 已运行；首次真实验证放在阶段 4。
