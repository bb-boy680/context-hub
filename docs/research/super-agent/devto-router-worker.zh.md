# DeepSeek dsh-superagent：面向并行编码会话的 Router-Worker 隔离

- 原文：DEV Community
- 作者：devs（madnessbrains_i）
- 发布日期：2026-11-02
- 原文链接：https://dev.to/madnessbrains_i/deepseek-dsh-superagent-router-worker-isolation-for-parallel-coding-sessions-lia
- 标签：#agents #opensource #architecture #windows

> 本文为中文翻译，供个人阅读。技术术语和代码标识保留原文。

2026 年 10 月 31 日，DeepSeek Harness 团队以 MIT 许可在 GitHub 上发布了 dsh-superagent-prototype。这个仓库是研究原型，不是产品：一个 TypeScript bundle，把一个 GitHub 仓库（可选再加飞书）变成一个主动工作的编码 Agent。一个长期运行的 Router 会话接收事件，判断哪些是被授权的工作，然后分派 Ticket。每个 Ticket 拥有自己隔离的 Worker 会话和工作目录。Worker 负责写代码、跑测试、开 PR；Router 是唯一与人类对话的东西。

DeepSeek 自己公布的模拟数字不算惊人，但有方向性：在嘈杂的消息流下，router-worker 设计的任务完成时间 p95 为 15.7 分钟，而单会话基线是 29.5 分钟。架构说明比这个提速更有意思。

## 让调度器保持存活的分工

Router 运行一个受限的预设（dsh-superagent-router）。它的工具集被刻意做得很小；shell 命令和任务等待被限制在几秒内。它从不执行真正的编码任务。这样，当 Worker 忙碌时，这个会话仍然可以轮询 GitHub、评估新的 Trigger、回答后续问题。

Worker 在自己的会话里运行完整工具集。前台 shell 命令在五秒后转为后台，这样人仍然可以打断。状态存放在单个 SQLite 数据库里；一个 Outbox 负责把回复送回原始渠道。授权范围很窄：接受一个 Ticket 不会在之后扩大它的权限。主动工作默认从 observe 模式开始，除非团队编写的规则明确允许。

实际结果是进程级隔离。一个卡住的 Worker 或失控的 `npm install` 不会冻结那个正在监听下一条 `@mention` 的东西。你可以杀掉一个 worker 槽位、重新快照 ticket、然后恢复，而不必重启整个 Agent。所有必须在并发负载下保持响应的长期运行自动化，都会出现同样的模式。

```bash
# 公共 README 里的概念性安装路径
# （实际安装由 Agent 阅读 SETUP.md 来驱动）
git clone https://github.com/deepseek-ai/dsh-superagent-prototype
cd dsh-superagent-prototype
pnpm install && pnpm build
# 然后把它作为一个 DeepSeek Harness 插件装配到专用 profile 上
```

这套安装被刻意设计成 Agent 驱动：你让自己的编码 Agent 阅读 SETUP.md，一次一个问题地带你完成。这既方便，也提醒你：这个原型期望你审查它请求的每一项权限。

## 同样的隔离在 Windows 上出现在哪里

如果你发布的东西必须在后台工作运行时保持可交互——实时转写、浮层、本地模型服务器、桌面 Agent——你已经知道失败模式。采集路径里一个阻塞的线程，或 UI Automation 里一次缓慢的 COM 调用，就会冻结界面并丢失音频。router-worker 分工只是把大多数人靠吃亏才学会的规则显式化了：

- 让事件循环（或消息泵）不承担无界工作。
- 给每个长任务自己的进程，或至少自己的 apartment，这样它可以被独立杀掉。
- 让每个 worker 的权限显式且不可扩张。

在 Windows 上，这直接对应几个具体选择：

1. **把重活做进程隔离。** 一个运行本地 STT 模型或遍历 UIA 树的 Worker 应该活在自己的进程里。你可以设置一个 job object，带 kill-on-close、CPU/内存限制和受限 token。主进程只看到进度消息和最终结果。如果模型 OOM，或 UIA 遍历在某个自定义控件上卡住，你终止这个 job，浮层仍然活着。

2. **把 WASAPI 采集放在自己的线程上。** 对任何实时音频路径，采集回调必须快速返回。把帧缓冲起来，通知一个 worker，把模型推理（如果你用远程 STT，就是网络发送）放到别处。回调里停顿 100 毫秒就能听出来；停顿 500 毫秒就会掉线。同样的“Router 不干活”规则适用：采集线程是调度器，推理进程是 worker。

3. **浮层和 UIA 不要和用户抢操作。** 当一个 Agent（或辅助工具）需要读取或操作窗口时，优先用无障碍树而不是合成输入。UIA pattern 调用可以在用户继续打字时运行。如果你必须注入输入，从一个独立的逻辑光标注入，这样就不会和物理鼠标打架。提权边界仍然存在：提权目标对非提权客户端不可见，所以要么提权 worker，要么接受这种不透明。

4. **本地模型和 BYOK。** 这个原型与模型无关，因为它在任何你配置的 Harness profile 下运行。同样的思路适用于桌面工具：如果用户在运行时提供 key，且推理调用由一个短生命周期 worker 发出，应用本身永远看不到 provider key。这样，长期运行的进程（带浮层和采集循环的那个）就不持有密钥。

这些并不新奇。它们决定了工具是能扛过一场 20 分钟的面试或一次长编码会话，还是在模型第一次比预期慢、或窗口第一次被提权时死掉。

## 你实际会碰到的权衡

隔离不是免费的：

- **启动成本。** 启动一个新进程（或新 Harness 会话）需要几十到几百毫秒。对于亚秒级交互，你要维持一个热的 worker 池。
- **上下文交接。** Router 拥有对话；Worker 拥有 ticket。你必须精确序列化 Mandate、相关文件和验收标准。多余的上下文就是多余的 token，也是目标漂移的额外机会。
- **Watchdog 复杂度。** DeepSeek 的设计提到一个独立的 Watchdog 检查进展并修复故障。实践中这意味着另一个定时会话，它可以杀掉或重启 worker。你需要清晰的失败信号（超时、重复的相同工具调用、缺失的心跳），否则 Watchdog 自己就会变成循环的东西。
- **权限面。** 因为 worker 可以运行 shell、开 PR、（在飞书场景下）发消息，允许列表和 observe 默认值是承重结构。一条过于宽松的规则就会把原型变成一个无人看管的机器人。

DeepSeek 公布的数字来自受控模拟。在真实 Windows 机器上，墙钟时间会受杀毒软件、同步客户端和提权进程影响。要把进程创建、UIA 遍历和模型冷启动分别做预算。

## 这对构建桌面 Agent 的人意味着什么

基于截图的 computer use 很容易演示。一旦离开顺风路径，结构化树加进程隔离的扩展性更好。DeepSeek 的原型没有发明这种分工，但它把 router 与 worker 的边界变得具体，并对所有想读的人开放。

如果你正把 Agent 接入开发者工作流，教训很简单：永远不要让监听的东西同时是运行长命令的东西。把监听器放进受限会话，给每个工作单元自己的进程和狭窄授权，并把失败模式设计成“杀掉 worker，问人类”。

当工作负载是一通实时通话时，同样的纪律适用。采集留在自己的线程，推理跑在 job object 里，浮层从消息更新，密钥留在长期进程之外。

---

我正在构建 Talkaside，一个用于跨语言求职面试和通话的 Windows 应用。本文借助本项目的代码和日志、由 AI 协助起草。
