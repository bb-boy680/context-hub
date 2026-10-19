# 把 skills.sh 移植到插件市场

## 背景

- 主仓 `D:\work-space\dsh-context-hub` 的内置 skills.sh 全在
  `packages/search/skills-sh/src/index.ts`（168 行）：用 `ctx.skillRegistries.register`
  注册 `SkillRegistry`，用 `ctx.host.net.request` 读 `https://skills.sh/api/search`
  与技能页；只注入 `["skillRegistries"]`，权限 `network`，分类 `source`，图标
  lucide `StoreIcon`。单测 `packages/search/skills-sh/__test__/skills-sh.test.ts`
  15 条；接线在 `apps/web/src/lib/hub.ts:27,197`、`apps/web/package.json:25`、
  根 `vitest.config.ts:26`、`pnpm-workspace.yaml:4`。
- 市场仓 `D:\work-space\context-hub-extensions` 的插件是完整包：`package.json`、
  `plugin.yaml`、`build.mjs`、`tsconfig.json`、`src/`、`lib/index.js`（提交）、
  `assets/icon.svg`、`README.md`；根 `pnpm build` = `pnpm -r build &&
  pnpm build:marketplace`，索引由 `scripts/build-marketplace.mjs` 扫描
  `plugins/*` 生成，禁止手改。
- e2e `apps/web/__test__/e2e-probe.ts` 仍以市场仓 `demo.other` 为例，还操作已删除
  的 `#extension-market-source`；`e2e-server.ts` 未注入本地读取器，而页面固定读
  `OFFICIAL_MARKET_URL`。
- 主仓 `apps/web/__test__/fixtures/demo.counter` 是独立夹具（测 header 贡献），
  保留，只改 `index.js` 首行过时来源注释。

## 决策

1. skills.sh 变成市场插件：id `skills.sh`、category `source`、permissions
   `[network]`、`inject: [skillRegistries]`、version `0.1.0`，中英双语名称/描述；
   主仓删除整个 `packages/search/skills-sh`，并从 `hub.ts` 的 `extensions` 数组移除。
2. 契约镜像到 `src/contracts.ts`：`RemoteSkill`、`RegistryPage`、`RegistryQuery`、
   `SkillRegistry`、`NetResponse`、`NetPort`、`PluginHost`、`SkillRegistryPoint`、
   `PluginScope`；同 `claude.code/src/contracts.ts`，插件运行时不 import 任何包。
3. 图标无官方图：新建 `assets/icon.svg` 占位店铺字形，主色应用强调色 `#0052ff`
   （对应旧 lucide `StoreIcon`）。
4. 插件 `apply` 保留原实现与注释：两个端点、`MAX_RESULTS=200`、`MIN_QUERY=2`、
   拒绝消息解析、`describe` 缓存。
5. 15 条单测随实现一起搬到市场插件：给 `plugins/skills.sh` 加 `vitest`
   devDependency、`vitest.config.ts` 与 `test` 脚本，测试只导入本地 contracts；
   市场仓根不加统一测试编排，`pnpm --filter skills.sh test` 单独跑。
6. 不自动 commit / push；两个仓库改动留在工作区等用户审阅。

## 阶段 1：创建市场 skills.sh 插件

**目标**：市场仓出现可构建、可加载的 `skills.sh` 插件。

**文件**（`D:\work-space\context-hub-extensions`）：

- `plugins/skills.sh/package.json`：仿 `plugins/demo.other`，`name: "skills.sh"`、
  `version: "0.1.0"`、`main: "lib/index.js"`、`files` 含 `assets`、`build`/
  `typecheck`/`test` 脚本，devDeps `esbuild ^0.28.2`、`typescript ~6`、
  `vitest ^5.0.5`。
- `plugins/skills.sh/build.mjs`、`tsconfig.json`：照 `plugins/demo.other`；入口
  `src/index.ts`，`absWorkingDir` 固定插件目录；tsconfig include `src` 与
  `__test__`。
- `plugins/skills.sh/vitest.config.ts` 与 `__test__/skills-sh.test.ts`：搬原
  15 条用例，import 从 `@context-hub/extensions` 改为 `../src/contracts.ts`，
  其余断言与 fake net 不变。
- `plugins/skills.sh/plugin.yaml`：

  ```yaml
  id: skills.sh
  name: { en: skills.sh, zh-cn: skills.sh }
  apiVersion: "^0.1"
  description:
    en: Search the public skills.sh catalog and install a result into this hub.
    zh-cn: 搜索公开的 skills.sh 技能目录，并把结果安装到本 hub。
  icon: assets/icon.svg
  category: source
  permissions: [network]
  inject: [skillRegistries]
  author: Context Hub
  ```

- `plugins/skills.sh/src/contracts.ts`：按决策 2 镜像类型；文件头写明「插件目录
  不能 import hub 包，这里只镜像跨服务边界的形状」。
- `plugins/skills.sh/src/index.ts`：移植原实现全部逻辑与注释，删 `lucide-react` /
  `ExtensionModule` 导入与 `manifest` 字段，导出 `apply(scope: PluginScope)`，
  `ctx.host` / `ctx.skillRegistries` 换成 `scope.host` / `scope.skillRegistries`。
- `plugins/skills.sh/assets/icon.svg`：64×64、圆角 `#0052ff` 方块 + 白色 storefront
  线稿（< 32 KiB）。
- `plugins/skills.sh/README.md`：用途、目录结构、端点、`inject`/权限、构建方式、
  `lib/index.js` 必须提交。
- 市场仓 `pnpm install` 更新 lockfile；沙箱让 registry 挂起时按 `docs/memory.md`
  用 `dangerouslyDisableSandbox`。

**验收**

```sh
cd /d/work-space/context-hub-extensions
pnpm install && (cd plugins/skills.sh && pnpm typecheck && pnpm test && pnpm build)
test -f plugins/skills.sh/lib/index.js
grep -q "https://skills.sh/api/search" plugins/skills.sh/lib/index.js
node -e "import('./plugins/skills.sh/lib/index.js').then(m => { if (typeof m.apply !== 'function') process.exit(1); console.log('apply ok') })"
```

输出 `apply ok`。

## 阶段 2：删除市场演示插件并重建索引

**目标**：市场只剩 `claude.code` 与 `skills.sh`，索引可复现。

**文件**（市场仓）：删除 `plugins/demo.counter/`、`plugins/demo.other/`；`README.md`
模板从 `plugins/demo.counter` 改为 `plugins/claude.code`（React），说明无 React 的
插件参考 `plugins/skills.sh`，`plugin.yaml` 示例改成 skills.sh 的字段；`pnpm install`
更新 lockfile；`pnpm build` 重写 `marketplace.json`。

**验收**

```sh
cd /d/work-space/context-hub-extensions
pnpm typecheck && pnpm build
ls plugins        # 只有 claude.code、skills.sh
node -e "const m=JSON.parse(require('fs').readFileSync('marketplace.json','utf8')); console.log(m.plugins.map(p=>p.id+':'+p.versions[0].version).join('\n'))"
# 期望 claude.code:0.1.0、skills.sh:0.1.0
node -e "const m=JSON.parse(require('fs').readFileSync('marketplace.json','utf8')); for (const p of m.plugins) if (!p.icon.startsWith('data:image/')) process.exit(1); console.log('icons inlined')"
sha256sum marketplace.json plugins/*/lib/index.js > /tmp/m1
pnpm build
sha256sum marketplace.json plugins/*/lib/index.js > /tmp/m2
diff /tmp/m1 /tmp/m2
grep -rn "demo\.counter\|demo\.other" README.md marketplace.json plugins scripts || true
```

`diff` 无输出，grep 无命中；skills.sh 的 category 是 `source`、permissions 是
`["network"]`。

## 阶段 3：下线主仓内置 skills.sh

**目标**：主仓不再自带 skills.sh，锁文件与测试工程同步。

**文件**（主仓）：

- 删除 `packages/search/skills-sh/`（`src/index.ts`、`__test__/skills-sh.test.ts`、
  `vitest.config.ts`、`eslint.config.js`、`tsconfig.json`、`package.json`）。
- `apps/web/src/lib/hub.ts`：删第 27 行 import 与 `extensions` 数组里
  `globalSearchExtension` 之后的 `skillsShExtension,`。
- `apps/web/package.json`：删 `"@context-hub/skills-sh": "workspace:*"`。
- `vitest.config.ts`：删 skills-sh project 行；`pnpm-workspace.yaml`：注释里的
  `search/skills-sh` 改为 `search/global-search`。
- `pnpm install` 更新 `pnpm-lock.yaml`。
- 不改 `packages/resources/skills` 的 `skills.source.registry` 文案与 provenance。

**验收**

```sh
cd /d/work-space/dsh-context-hub
pnpm install && pnpm typecheck
pnpm exec vitest run --project core --project web --project extensions
git grep -n -e "skills-sh" -e "skillsSh" -- . ':!docs/plans' ':!.aoci' || true
```

typecheck 与三个 project 通过；grep 无命中。`pnpm install` 沙箱说明同阶段 1。

## 阶段 4：改造 e2e 服务器与探针

**目标**：用市场仓真实插件验证「市场行 → 安装 → 启用 → 注册表出现 → 卸载」，
不再依赖 demo.other 与来源输入框。

**文件**（主仓）：

- `apps/web/__test__/e2e-server.ts`：加 `--market <path>`（缺省 `MARKET_SOURCE`），
  从 `@context-hub/core/host/extension-market` 导入 `createMarketReader` 并注入，
  让固定 URL 读本地索引；同步 Usage 与「The market reader is the real one」注释：

  ```ts
  const local = createMarketReader()
  const reader = market === undefined ? undefined : { read: () => local.read(market) }
  createExtensionMarketHandler({ home, ...(reader === undefined ? {} : { reader }) })
  ```

- `apps/web/__test__/e2e-probe.ts`：市场样例 `demo.other` → `skills.sh`；
  `EXPECT_PRELOAD` 等 `extension-skills.sh`；删操作 `#extension-market-source` 的
  整段 `evaluate`。断言：列表/弹窗含 `skills.sh` 与索引版本；安装后
  `HOME/extensions/skills.sh/plugin.yaml` 存在、按钮无刷新变 Uninstall、
  `state/extensions.json["skills.sh"] === true`；卸载后 false 且文件保留。激活判据：
  安装后从 `PAGE` 取 origin，`Page.navigate` 到 `/skills`，加一个按文案
  `/Explore|探索/` 找按钮的 helper（复用 `click` 的矩形 + `Input.dispatchMouseEvent`
  逻辑），点击后等待 `input[placeholder*="skills.sh"]` 或
  `input[aria-label*="skills.sh"]`；再回 `/extensions` 继续卸载。toast 等待文案改为
  `skills.sh is installed`；文件头注释同步。
- `apps/web/__test__/fixtures/demo.counter/index.js`：首行来源注释改为「本地夹具，
  来源是市场仓已删除的 demo.counter；只测 header 贡献」。

**验收**：用隔离 home 与本地索引跑探针（取自归档计划
`docs/plans/archive/plugin-yaml-marketplace.md` 6.2，改为 `--market`）：

```sh
cd /d/work-space/dsh-context-hub
pnpm --filter web build
HUB_TMP="$(mktemp -d)"; HUB_HOME="$(cygpath -w "$HUB_TMP")"
MARKET_DIR="$(cygpath -w /d/work-space/context-hub-extensions)"
MARKET_INDEX="$(cygpath -w "$HUB_TMP/marketplace.local.json")"
mkdir -p "$HUB_TMP/extensions" "$HUB_TMP/state"
cp -r apps/web/__test__/fixtures/demo.counter "$HUB_TMP/extensions/demo.counter"
printf '{"demo.counter":true}\n' > "$HUB_TMP/state/extensions.json"
(cd /d/work-space/context-hub-extensions && MARKETPLACE_REPOSITORY="$MARKET_DIR" \
  MARKETPLACE_OUT="$MARKET_INDEX" node scripts/build-marketplace.mjs)
node apps/web/__test__/e2e-server.ts --home "$HUB_HOME" --port 5293 \
  --market "$MARKET_INDEX" & SERVER_PID=$!
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
"$EDGE" --headless=new --disable-gpu --remote-debugging-port=9333 \
  --user-data-dir="$(cygpath -w "$HUB_TMP/profile")" --no-first-run about:blank & EDGE_PID=$!
HUB_HOME="$HUB_HOME" CDP=http://127.0.0.1:9333 \
PAGE=http://127.0.0.1:5293/extensions EXPECT_PRELOAD=1 \
MARKET_SOURCE="$MARKET_INDEX" node apps/web/__test__/e2e-probe.ts
kill "$EDGE_PID" "$SERVER_PID" 2>/dev/null || true
wait "$EDGE_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true
rm -rf "$HUB_TMP"
```

探针输出 `all checks passed`，激活检查通过；失败时也按 PID 清理。9333 被占就换
端口，不要按进程名清场。若激活报 `cannot get property "host" without inject`，把
`host` 加入 `plugin.yaml` 的 `inject` 后重跑。

## 阶段 5：更新文档

**目标**：去掉已删除 demo 插件的文档引用。

**文件**：主仓 `docs/extensions.md` 的 `plugin.yaml` 示例、市场索引示例、「Try it」；
市场仓 `README.md` 的阶段 2 改动复核。

- 示例统一用 skills.sh：category `source`、permissions `["network"]`、source path
  `plugins/skills.sh`、version `0.1.0`。
- 「Try it」第 2 步：内置索引在 **Sources** 列出 **skills.sh**，在 **Agents** 列出
  **Claude Code**；安装 skills.sh 后 Skills 页 Explore 出现该搜索源，Claude Code
  侧栏行在刷新后出现。

**验收**

```sh
cd /d/work-space/dsh-context-hub
grep -n "demo\.counter\|demo\.other\|Demo Other" docs/extensions.md || true
grep -n "demo\.counter\|demo\.other" /d/work-space/context-hub-extensions/README.md || true
```

两条均无输出。

## 阶段 6：执行全量验证

**主仓**

```sh
cd /d/work-space/dsh-context-hub
pnpm install && pnpm typecheck
pnpm exec vitest run --project core --project web --project extensions
pnpm test && pnpm lint
git status --short
```

**市场仓**

```sh
cd /d/work-space/context-hub-extensions
pnpm install && pnpm typecheck && pnpm --filter skills.sh test && pnpm build
sha256sum marketplace.json plugins/*/lib/index.js > /tmp/a
pnpm build
sha256sum marketplace.json plugins/*/lib/index.js > /tmp/b
diff /tmp/a /tmp/b
git status --short
```

**验收**：主仓全部检查通过；市场仓两次构建 sha256 一致，索引只有
`claude.code`、`skills.sh`；e2e 重跑阶段 4 通过；两个仓库 `git status` 只有预期
改动，无临时文件/凭证/真实 home 写入。

## 阶段 7：同步仓库认知

**目标**：主仓受管理对象最终稳定后更新 AOCI；市场仓不在主仓索引内。

- 先确认树是静的：`find packages apps docs -newermt "-20 minutes" -type f -not
  -path "*/node_modules/*"` 与 `git status --short`；出现不属于本次改动的文件就
  停下报告。
- 调一次 `aoci_maintain`，处理本次命中项：`apps/web/src/lib/hub.ts`、
  `apps/web/package.json`、`vitest.config.ts`、`pnpm-workspace.yaml`、已删除的
  `packages/search/skills-sh/*`、`apps/web/__test__/e2e-*.ts` 与夹具注释。
- 按 guide 用 `aoci_update_entry` / `aoci_remove_entry` 提交完整批次，不手改
  `aoci.txt`；AOCI 资产与业务改动分开汇报。

**验收**：`aoci_maintain` 无未处理候选；business diff 不再变化；主仓 typecheck
仍通过。

## 不做

- 不在市场仓根加统一测试编排；测试只属于 `plugins/skills.sh`。
- 不改 `OFFICIAL_MARKET_URL`、市场读取/安装协议、索引生成器规则。
- 不改 Skills 搜索对话框、`skills.source.registry` 文案或 provenance。
- 不改 `fixtures/demo.counter` 的行为，只改注释。
- 不改 `docs/plans/archive/**`；不 commit、不 push。

## 风险与未覆盖

- **测试入口**：15 条单测随插件搬走，但市场仓根 `pnpm build` / `pnpm typecheck`
  不会跑它们；验证时必须单独执行 `pnpm --filter skills.sh test`，否则覆盖仍在
  仓库里却不会红。
- 真机冒烟（可选，需外网）：安装后 Skills → Explore 搜 `pdf`，确认结果与描述；
  或 `curl -s "https://skills.sh/api/search?q=pdf&limit=2"`。网络不可用时在汇报里
  写明。
- 图标是占位；官方 SVG 到位后替换 `assets/icon.svg` 并重跑市场仓 `pnpm build`。
