# DeepSeek Super-agent 资料集

面向仔细阅读，收集了 2026-10-31 发布后的官方架构说明、媒体解读、个人分析和部署笔记。

## 阅读顺序

| # | 文件 | 类型 | 说明 |
|---|---|---|---|
| 1 | [zhidx-deep-dive.md](zhidx-deep-dive.md) | 中文媒体深度 | 智东西：五大模块逐节拆解 + 实验数据，信息最完整 |
| 2 | [quantumbit-overview.md](quantumbit-overview.md) | 中文媒体概述 | 量子位：场景化讲清楚它做什么 |
| 3 | [tmtpost-commentary.md](tmtpost-commentary.md) | 中文评论 | 钛媒体：架构背后的系统化竞争与“验收比执行更难” |
| 4 | [juejin-watchdog.md](juejin-watchdog.md) | 中文个人分析 | 掘金：为什么需要外部 Watchdog，以及同周 Agent 工程趋势 |
| 5 | [deepseek-day-deploy.md](deepseek-day-deploy.md) | 中文部署笔记 | 环境依赖、三档授权、代价与和 Claude Code 的关系 |
| 6 | [devto-router-worker.en.md](devto-router-worker.en.md) | 英文原文 | dev.to：Router/Worker 隔离与 Windows 进程隔离类比 |
| 7 | [devto-router-worker.zh.md](devto-router-worker.zh.md) | 中文翻译 | 上一篇的完整翻译 |

## 关键事实速查

- 发布：2026-10-31 晚，DeepSeek Harness 团队官方公众号技术文章《Super-agent 设计探索：迈向更自主的 Agent 系统》。
- 仓库：`https://github.com/deepseek-ai/dsh-superagent-prototype`，MIT，v0.1.0 研究原型。
- 定位：Agent 编排架构，不是新模型，不是正式产品。
- 核心：Router（常驻分派）+ Worker（隔离执行），事件驱动、订阅直通、Inline/Spill、投机执行、存算分离、外部 Watchdog。
- 实验：约 300 条消息、20 项请求，p50 12.4 分钟、p95 15.7 分钟；单会话基线 p95 29.5 分钟；缓存读取 token 多约 37%。
- 授权：off / observe（默认）/ auto；v0.1.0 只面向单个 GitHub 仓库。
- 依赖：Node.js 22.19+ 或 24+、git 2.32+、Python 3.8+、tmux、GitHub CLI 2.48+；官方建议 Linux/macOS，Windows 需 WSL。

## 注意

- 部分文章含融资、估值等市场传闻，原文已保留，但未经官方确认。
- 媒体解读与官方原文可能有出入，以官方仓库和公众号为准。
- 本目录仅作个人阅读存档，版权归原作者。
