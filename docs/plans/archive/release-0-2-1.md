# 发布 Context Hub 0.2.1 与扩展市场

- 日期：2026-11-04
- 状态：待审批
- 主仓：`D:\work-space\dsh-context-hub`，`bb-boy680/context-hub`
- 扩展仓：`D:\work-space\context-hub-extensions`，`bb-boy680/context-hub-extensions`

## 已核实的事实

- 主仓当前分支 `feat/react-compiler`，比 `origin/main` 多 37 个提交，落后 0 个；没有打开中的对应 PR。
- 主仓 `main` 受保护：必须走 PR，required check 为 `checks`，管理员也不能绕过。
- `.github/workflows/release.yml` 由 `v*` tag 触发：`version → checks → cli/desktop → publish`；tag 是版本源，构建时把版本号写进两个 manifest；发布后由机器人开 `release/version-sync` PR 更新版本和 `CHANGELOG.md`。
- 主仓工作区有未跟踪的本地文件：`.claude/launch.json`、`.claude/rules/`、`opencode.json`、`docs/plans/agent-p1-integrations.md`、`docs/research/super-agent/`；`.aoci/config.json`、`.claude/settings.json` 有本地改动。它们都不是本次发布所需的已提交状态。
- 扩展仓当前分支 `feat/codex-extension`，比 `origin/feat/codex-extension` 多 6 个提交，比 `origin/main` 少 1 个（release changelog 提交）。这 6 个提交就是 DeepSeek Harness、Trae、Qoder、Kiro、Qwen Code、Kimi 六个扩展。
- 扩展仓 `main` 的规则由 ruleset 管理；`build-market.yml` 在 PR 上构建 `plugins/*/lib` 和 `marketplace.json` 并提交回 PR 分支，合并 PR 即完成市场更新。
- 扩展仓 v0.2.0 的 `release` run 在最后一步失败：仓库未允许 GitHub Actions 创建 PR，`gh pr merge` 之前就报 `not permitted to create or approve pull requests`。Release 本身是否已创建需在发布前再确认。
- `plugins/skills.sh` 在扩展仓是已跟踪目录（含 `lib/index.js`），`marketplace.json` 有它的条目；`README.md` 有两处把它当作示例。

## 阶段

### 阶段 1：主仓发布前检查

- 在 `feat/react-compiler` 上运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
- 只检查已提交状态；不提交、不纳入工作区的本地文件。
- 失败时先判断是否由本分支引入；能定位就修，范围外的问题只报告。

验收：四条命令退出 0，或明确记录失败项与原因。

### 阶段 2：主仓推送并发 PR

- `git push origin feat/react-compiler`。
- 用 `gh pr create --base main` 开 PR，标题 `feat: release 0.2.1`，正文按 Conventional Commit 归类 37 个提交。
- 等 `ci / checks` 通过后合并（merge commit）。

验收：PR 的 `checks` 全绿并已合并到 `main`。

### 阶段 3：发布 0.2.1

- 在合并后的 `main` 上打 `v0.2.1` tag 并推送。
- 观察 `release.yml`：`version`、`checks`、`cli`、`desktop`（三平台）、`publish` 全部成功。
- `publish` 成功后，合并机器人创建的 `release/version-sync` PR（把根 `package.json`、`apps/desktop/package.json` 更新为 0.2.1 并写 CHANGELOG）。

验收：GitHub Release `v0.2.1` 存在且非 prerelease；资产包含 5 个 CLI、Windows `.exe`、macOS `.dmg`+`.zip`、Linux `.AppImage` 及对应 `latest*.yml`；`/hub/about` 的版本为 0.2.1。

### 阶段 4：删除 skills.sh 插件并验证扩展仓

- `git rm -r plugins/skills.sh`。
- 更新 `README.md` 两处示例：改用其他现有扩展（如 `plugins/deepseek-harness`，服务型）和通用 id。
- `pnpm install` 更新锁文件；`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
- 核对生成的 `marketplace.json` 不再包含 `skills.sh`，其余扩展条目正常。

验收：四条检查通过；本地 `marketplace.json` 无 `skills.sh`；`git status` 只包含预期的源码/文档/锁文件改动（生成物按仓库约定不提交）。

### 阶段 5：发布扩展市场

- 从当前 `HEAD` 新建发布分支（避免复用已合并的 PR 分支名），提交删除与文档改动，推送。
- 开 PR 到 `main`；等 `build-market` 成功并把 `plugins/*/lib`、`marketplace.json` 提交回 PR 分支。
- 合并 PR；确认 `main` 上的 `marketplace.json` 已移除 `skills.sh`、六个新扩展都在索引里。

验收：PR 的 `build-market` 全绿并已合并；主分支索引正确。

### 阶段 6（可选）：扩展仓 Release

- 若确认要发扩展仓版本，打 `v0.3.0` tag。
- 该仓库的 release workflow 需要 “Allow GitHub Actions to create and approve pull requests” 权限；没有开启时会在更新 CHANGELOG 的 PR 步骤失败。开启属于仓库设置变更，需你确认。
- 若开启，观察 workflow 成功，确认 Release 与 CHANGELOG PR 都完成。

验收：Release `v0.3.0` 存在，CHANGELOG 已更新。

## 不做事

- 不提交工作区的本地客户端文件（`.claude/`、`opencode.json`、`.aoci/config.json` 改动、调研文档）。
- 不改 Dependabot 的开放 PR。
- 不改版本策略以外的发布流水线代码。
- 不动已发布的旧 tag/Release；失败只向前修。

## 风险

1. 37 个提交里可能已有让 `checks` 失败的问题；修复会扩大本次改动范围。
2. `release.yml` 从未在本机验证，首次真实运行可能暴露 runner 或权限问题。
3. 扩展仓 v0.2.0 的 release 已经因 PR 权限失败；若阶段 6 不先改设置，必然复现。
4. 合并 PR 与打 tag 都是对外可见操作；tag 一旦推送，失败只能靠重跑或新版本修复。

## 需要确认

1. 扩展仓是否要同时打 `v0.3.0` Release（需要改仓库 Actions 设置），还是只合并 PR 完成市场发布？
2. 主仓工作区的未跟踪/本地改动是否保持不提交？
