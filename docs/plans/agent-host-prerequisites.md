# 六个 Agent 的共同宿主前置

状态：四阶段已完成开发自测，等待独立验收。范围已由用户批准；不实现六个扩展，不新增客户端特判或旧格式降级。

## 阶段 1：声明原生 manifest

- 目标：扩展注册与生命周期绑定的 manifest 相对路径；浏览器扫描、HTTP 请求、宿主收录、库存在性检查、更新/恢复、describe 和组件详情使用同一声明。
- 文件：`packages/resources/plugins/src/{provider,contract,tools,library,library-store,add-plugin-dialog}.ts*`、`handlers.ts`、`src/host/{collect,describe,library,contents,preview,update}.ts` 及对应测试。
- 验收：native-only 包从文件夹/地址收录、扫描、更新/恢复和 describe 正常；名称、版本、描述、图标、自定义组件与 inline MCP 可读；停用扩展后声明撤销；宿主重新验证路径，拒绝越界与符号链接；现有布局回归通过。

## 阶段 2：声明安装目标模板

- 目标：`PluginDiskDeclaration` 声明可安装目录模板，允许 `local/:name`，并保留原 cache 布局；`commit` 和 `removeDirectory` 只允许声明匹配的目标。
- 文件：`src/provider.ts`、`src/host/installer-files.ts`、`__test__/installer-files.test.ts`。
- 验收：合法目标复制/删除；危险段、目录越界、链接、未授权路径被拒；源树哈希、已有数据快照、原子提交和失败回滚不退化。
- 补充目录事务：在 `provider.ts`、`tools.ts`、`handlers.ts` 和 `installer-files.ts` 增加完整目录快照、按预期快照复制或删除并与文件变更共同回滚；隔离测试覆盖二进制、空目录、链接、冲突和写入失败。保留旧接口；明确租约不是跨进程锁。

## 阶段 3：安全多段 state 根

- 目标：支持 `cli/plugins`，逐段验证并从 config 根拒绝中间符号链接/junction；环境变量根仍保持绝对路径约束。
- 文件：`src/host/installer-files.ts`、`__test__/installer-files.test.ts`。
- 验收：合法多段根可用；空段、点段、绝对路径、盘符、反斜杠与中间链接均拒绝；既有单段路径行为不变。

## 阶段 4：未知启用状态

- 目标：`PluginHeld.enabled`、折叠结果、位置状态、计数与菜单一致支持未知；明确 true 优先，全部明确 false 才 false。位置的 `enabled` 为未知时，即便设置文件含布尔值，也不能把它当成已知有效状态或计入启用数；已知位置仍显示自身设置。
- 文件：`src/{provider,types,rows,install-actions,messages}.ts*`、中文 locale 和对应测试。
- 验收：混合三态聚合正确；未知有独立文案、不会画关闭开关或计入关闭；现有确定状态行为回归，按隔离环境验证界面。
- 补充通用来源状态：`PluginHeld.sourceAvailable` 仅在 provider 已核实后设置，按位置保留来源路径及声明标识并在详情显示；未提供时保持未知，不根据空描述推断。`hasSource` 继续表示上游能否检查。

## 开发自测结果

- manifest：插件模块 12 文件、315 项通过；native-only、桥接、扩展注销与危险路径断言通过。
- 安装目录和 state 根：`installer-files.test.ts` 11 项通过，包括 local、复制失败恢复、越界和 junction。
- 启用态：三态聚合覆盖 6 种组合；插件模块最终 323 项通过。隔离服务上的 ego-browser 菜单显示 `This machine · unknown`、`0 on`，无 switch。
- 全仓：`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；Windows 格式临时 HOME 和 USERPROFILE 下 `pnpm test` 101 文件、1514 项通过。初次使用正斜杠环境变量时 core 的 home 缩写断言失败，改 Windows 路径后通过。
- 目录快照补充：`pnpm exec vitest run --project plugins` 12 文件、326 项通过，覆盖源/目标摘要、二进制与空目录、链接拒绝、过期快照、状态写失败回滚、回滚时外部改动和 HTTP 桥；`pnpm --filter @context-hub/plugins lint`、`pnpm --filter @context-hub/plugins typecheck`、`pnpm typecheck` 通过。目录租约只在本宿主进程串行，不能消除其他进程在检查与文件操作之间的竞态。
- 来源与未知态补充：`pnpm exec vitest run --project plugins` 12 文件、331 项通过；`pnpm --filter @context-hub/plugins lint`、`pnpm --filter @context-hub/plugins typecheck`、`pnpm --filter @context-hub/zh-cn typecheck` 通过。对不可用来源保留展示路径，文件读取与收录改用其他可用来源；隔离浏览器尚未验收。
- 未运行真实客户端、远程 MCP 或 Electron；独立验收尚未执行。

## 收尾和自审

- 所有文件测试显式使用临时 home、folder、userHome、env、library；不运行真实客户端或外部服务。
- 按阶段运行最小测试，随后运行共享 API 所需更广检查；记录命令和真实结果。
- 更新 `docs/extensions.md` 和总览实际状态；最终稳定后按证据执行一次 AOCI 维护。
- 自审：声明须跨页面与宿主边界逐请求传递并在宿主验证；库的 `has`、`missing`、更新和安装复制也要取得一致声明。模板校验和状态根必须继续阻止 symlink/junction；不允许以计数或渲染把未知当 false。
