# Context Hub 图标

采用「折面」方案，保留原图的蓝色、立体明暗和轮廓，移除展示背景与落地阴影，中间斜向开口透明。

- `source.png`：选定的原始生成图。
- `logo-1024.png`：1024×1024 透明 PNG 母版，图形最长边为 896px，四周保留约 6.25% 留白。
- `../icon.png`：512×512 透明 PNG，供 README 等材料使用。

母版是位图，来自原始图中约 684×680px 的前景，经高质量缩放生成 1024 规格；不是矢量文件。

## 项目入口

| 用途 | 路径 | 尺寸／内容 |
| --- | --- | --- |
| 网页 favicon | `apps/web/public/favicon.ico` | 16、32、48px |
| PNG favicon | `apps/web/public/icon-16.png`、`icon-32.png` | 16、32px |
| 侧栏图标 | `apps/web/public/icon-32.png`、`icon-64.png` | 以 28 CSS px 显示，提供 2x 资源 |
| Apple touch icon | `apps/web/public/apple-touch-icon.png` | 180px，不透明浅色底 |
| 桌面标题栏 | `apps/desktop/src/preload-menu.ts` 引用 Web 的 `icon-32.png`、`icon-64.png` | 22 CSS px，提供 2x 资源 |
| 桌面窗口 | `apps/desktop/assets/icon.png` | 512px 透明 PNG |
| Windows 程序与安装器 | `apps/desktop/build/installerIcon.ico` | 16、20、24、32、40、48、64、128、256px |
| macOS 应用 | `apps/desktop/build/icon.icns` | 16–1024px，含 Retina 表示 |
| Linux 应用 | `apps/desktop/build/icon.png` | 1024px，由打包器生成平台尺寸 |
| 彩色托盘 | `apps/desktop/assets/tray.png`、`tray@2x.png` | 32、64px |
| macOS 模板托盘 | `apps/desktop/assets/trayTemplate.png`、`trayTemplate@2x.png` | 黑色与 alpha，16px／72dpi、32px／144dpi |

Web 图标由 `apps/web/index.html` 和侧栏引用；桌面窗口由 `apps/desktop/src/main.ts` 引用，安装包图标在 `apps/desktop/electron-builder.config.mjs` 指定。Web 的 public 资源随构建复制，桌面运行图标通过既有 `assets/*.png` 打包规则收录。

图标套件还导出了 16、20、24、28、32、40、48、64、96、128、180、192、256、512、1024px 的透明 PNG。192／512px 可用于有需要的 Web 应用图标；本次没有添加 PWA 功能。
