# DeepSeek dsh-superagent: Router-Worker Isolation for Parallel Coding Sessions

- Source: DEV Community
- Author: devs (madnessbrains_i)
- Posted: Nov 2, 2026
- Original: https://dev.to/madnessbrains_i/deepseek-dsh-superagent-router-worker-isolation-for-parallel-coding-sessions-lia
- Tags: #agents #opensource #architecture #windows

On 31 October 2026 the DeepSeek Harness team published dsh-superagent-prototype on GitHub under the MIT license. The repo is a research prototype, not a product: a TypeScript bundle that turns one GitHub repository (and optionally Feishu) into a proactive coding agent. A long-running Router session receives events, decides what is authorized work, and dispatches Tickets. Each Ticket gets its own isolated Worker session and working directory. The Worker does the coding, tests, and opens the PR; the Router is the only thing that talks back to humans.

DeepSeek’s own simulation numbers are modest but directional: under a noisy message stream the router-worker design finished tasks with a p95 of 15.7 minutes versus 29.5 minutes for a single-session baseline. The architecture note is more interesting than the speedup.

## The split that keeps the dispatcher alive

The Router runs a restricted preset (dsh-superagent-router). Its tool set is deliberately small; shell commands and job waits are capped at a few seconds. It never executes the actual coding task. That keeps the session free to poll GitHub, evaluate new Triggers, and answer follow-ups while workers are busy.

Workers run the full tool set in their own sessions. Foreground shell commands are backgrounded after five seconds so a human can still interrupt. State lives in a single SQLite database; an Outbox routes replies back through the original channel. Mandates are narrow: accepting a Ticket does not widen its authority later. Proactive work starts in observe mode unless a team-written rule explicitly allows it.

The practical consequence is process-level isolation. A hung Worker or a runaway `npm install` does not freeze the thing that is listening for the next `@mention`. You can kill a worker slot, re-snapshot the ticket, and resume without restarting the whole agent. The same pattern appears in every long-running automation that must stay responsive under concurrent load.

```bash
# Conceptual setup path from the public README
# (actual install is driven by the agent reading SETUP.md)
git clone https://github.com/deepseek-ai/dsh-superagent-prototype
cd dsh-superagent-prototype
pnpm install && pnpm build
# Then wire it as a DeepSeek Harness plugin on a dedicated profile
```

The setup is intentionally agent-driven: you tell your coding agent to read SETUP.md and walk you through one question at a time. That is both convenient and a reminder that the prototype expects you to review every permission it asks for.

## Where the same isolation shows up on Windows

If you ship anything that has to stay interactive while background work runs—live transcription, an overlay, a local model server, a desktop agent—you already know the failure mode. One blocked thread in the capture path or a slow COM call in UI Automation freezes the UI and drops audio. The router-worker split is just the explicit version of a rule most of us learn the hard way:

- Keep the event loop (or the message pump) free of unbounded work.
- Give every long task its own process or at least its own apartment so it can be killed independently.
- Make the authority of each worker explicit and non-widening.

On Windows that maps directly onto a few concrete choices:

1. **Process isolation for the heavy part.** A Worker that runs a local STT model or walks a UIA tree should live in its own process. You can set a job object with kill-on-close, CPU/memory limits, and a restricted token. The main process only sees progress messages and final results. If the model OOMs or the UIA walk hangs on a custom control, you terminate the job and the overlay stays alive.

2. **WASAPI capture on its own thread.** For any real-time audio path the capture callback must return quickly. Buffer the frames, signal a worker, and do the model inference (or the network send if you are using a remote STT) elsewhere. A 100 ms stall in the callback is audible; a 500 ms stall drops the call. The same “Router does not do the work” rule applies: the capture thread is the dispatcher, the inference process is the worker.

3. **Overlays and UIA without fighting the user.** When an agent (or an assistive tool) needs to read or act on a window, prefer the accessibility tree over synthetic input. UIA pattern calls can run while the user keeps typing. If you must inject input, do it from a separate logical cursor so you do not fight the physical mouse. Elevation boundaries still exist: an elevated target is invisible to a non-elevated client, so either elevate the worker or accept the opacity.

4. **Local models and BYOK.** The prototype is model-agnostic because it runs under whatever Harness profile you configure. The same idea works for a desktop tool: the app never sees the provider key if the user supplies it at runtime and the inference call is made from a short-lived worker. That keeps the long-running process (the one with the overlay and the capture loop) from holding secrets.

These are not exotic. They are the difference between a tool that survives a 20-minute interview or a long coding session and one that dies the first time a model takes longer than expected or a window is elevated.

## Tradeoffs you will actually hit

Isolation is not free:

- **Startup cost.** Spinning a new process (or a new Harness session) is tens to hundreds of milliseconds. For sub-second interactions you keep a warm pool of workers.
- **Context hand-off.** The Router has the conversation; the Worker has the ticket. You must serialize exactly the Mandate, the relevant files, and the acceptance criteria. Extra context is extra tokens and extra chance of goal drift.
- **Watchdog complexity.** DeepSeek’s design mentions a separate Watchdog that checks progress and repairs faults. In practice that means another scheduled session that can kill or restart workers. You need clear failure signals (timeouts, repeated identical tool calls, missing heartbeats) or the Watchdog itself becomes the thing that loops.
- **Permission surface.** Because workers can run shell, open PRs, and (in the Feishu case) post messages, the allow-list and the observe-mode default are load-bearing. A single over-permissive rule turns the prototype into an unattended bot.

The numbers DeepSeek published are from a controlled simulation. On a real Windows machine the wall-clock moves with antivirus, sync clients, and elevated processes. Budget process creation, UIA walks, and model cold-start separately.

## What this changes for people building desktop agents

Screenshot-based computer use is easy to demo. Structured trees plus process isolation scale better once you leave the happy path. DeepSeek’s prototype does not invent the split, but it makes the router-versus-worker boundary concrete and open for anyone to read.

If you are wiring an agent into a developer workflow the lesson is simple: never let the thing that listens also be the thing that runs the long command. Put the listener in a restricted session, give each unit of work its own process and narrow mandate, and make the failure mode “kill the worker and ask the human.”

The same discipline applies when the workload is a live call. Capture stays on its thread, inference runs in a job object, the overlay updates from messages, and secrets stay outside the long-lived process.

---

I’m building Talkaside, a Windows app for job interviews and calls in another language. Drafted with AI assistance from this project’s code and logs.
