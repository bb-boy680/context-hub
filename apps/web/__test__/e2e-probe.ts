/**
 * End-to-end probe for the extension market, driven over CDP.
 *
 * The market entries must behave exactly like catalog entries: same category
 * list, same detail dialog, same action button, and the install must take
 * effect without a reload. Not a vitest test: it needs headless Edge and the
 * built page. Run it against `e2e-server.ts`; it exits non-zero on failure.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

const DEBUG = process.env.CDP ?? "http://127.0.0.1:9333"
const PAGE = process.env.PAGE ?? "http://127.0.0.1:5283/extensions"
const HOME = process.env.HUB_HOME
const MARKET = process.env.MARKET_SOURCE ?? "D:/work-space/context-hub-extensions"

if (HOME === undefined) throw new Error("HUB_HOME is required")

const indexPath = /\.json$/i.test(MARKET) ? MARKET : path.join(MARKET, "marketplace.json")
const index = JSON.parse(await fs.readFile(indexPath, "utf8")) as {
  plugins: { id: string; versions: { version: string }[] }[]
}
const entry = index.plugins.find((plugin) => plugin.id === "skills.sh")
if (entry === undefined) throw new Error("the fixture index has no skills.sh")
const expected = entry.versions[0]!

const targets = (await (await fetch(`${DEBUG}/json/list`)).json()) as {
  type?: string
  webSocketDebuggerUrl?: string
}[]
const target = targets.find((item) => item.type === "page")
if (target?.webSocketDebuggerUrl === undefined) throw new Error("no page target")

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise<void>((resolve, reject) => {
  socket.onopen = () => resolve()
  socket.onerror = () => reject(new Error("could not open the CDP socket"))
})

let nextId = 0
const pending = new Map<number, (message: Record<string, unknown>) => void>()
socket.onmessage = (event) => {
  const message = JSON.parse(String(event.data)) as { id?: number }
  if (message.id === undefined) return
  pending.get(message.id)?.(message as Record<string, unknown>)
  pending.delete(message.id)
}

function send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, (message) => {
      const error = message.error as { message?: string } | undefined
      if (error !== undefined) reject(new Error(`${method}: ${error.message ?? "failed"}`))
      else resolve(message.result)
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression: string): Promise<unknown> {
  const result = (await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })) as { exceptionDetails?: { text?: string }; result?: { value?: unknown } }
  if (result.exceptionDetails !== undefined) {
    throw new Error(result.exceptionDetails.text ?? "the page threw")
  }
  return result.result?.value
}

async function waitFor(expression: string, timeoutMs = 30_000): Promise<unknown> {
  const started = Date.now()
  for (;;) {
    const value = await evaluate(expression).catch(() => null)
    if (value) return value
    if (Date.now() - started > timeoutMs) throw new Error(`timed out: ${expression}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

async function waitForFile(file: string, timeoutMs = 30_000): Promise<void> {
  const started = Date.now()
  for (;;) {
    const stat = await fs.stat(file).catch(() => null)
    if (stat !== null) return
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${file}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

async function clickExpression(find: string): Promise<void> {
  await evaluate(
    `(() => { const el = ${find}; if (el) el.scrollIntoView({ block: "center" }); return true })()`
  )
  await new Promise((resolve) => setTimeout(resolve, 200))
  const point = (await evaluate(
    `(() => { const el = ${find}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`
  )) as { x: number; y: number } | null
  if (point === null) throw new Error(`no element ${find}`)
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  })
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  })
}

async function click(selector: string): Promise<void> {
  await clickExpression(`document.querySelector(${JSON.stringify(selector)})`)
}

const failures: string[] = []
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === "" ? "" : ` — ${detail}`}`)
  if (!ok) failures.push(name)
}

await send("Page.enable")
await send("Runtime.enable")
/* The sidebar has a desktop and a mobile form; this probe drives the desktop
   one, which is what the app window shows. */
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await send("Page.navigate", { url: PAGE })
await waitFor(
  `document.readyState === "complete" && !!document.querySelector('[data-testid="demo-counter"]')`
)

check(
  "the kernel publishes React to plugins",
  (await evaluate(`typeof window.__CONTEXT_HUB_REACT__?.useState === "function"`)) === true
)
check(
  "the plugin renders with its initial state",
  (await evaluate(
    `document.querySelector('[data-testid="demo-counter"]').textContent`
  )) === "count: 0"
)

await click('[data-testid="demo-counter"]')
await new Promise((resolve) => setTimeout(resolve, 300))
check(
  "the plugin's useState updates after a real click",
  (await evaluate(
    `document.querySelector('[data-testid="demo-counter"]').textContent`
  )) === "count: 1"
)

/* The built-in market is read at startup, before the page is opened. */
const marketRow = '[data-testid="extension-skills.sh"]'
if (process.env.EXPECT_PRELOAD === "1") {
  await waitFor(`!!document.querySelector(${JSON.stringify(marketRow)})`, 15_000)
  check("the built-in market source is read at startup", true)
}
await waitFor(`!!document.querySelector(${JSON.stringify(marketRow)})`)

const listed = String(
  await evaluate(`document.querySelector(${JSON.stringify(marketRow)}).innerText`)
)
check("the market entry is listed with the catalog", listed.includes("skills.sh"), listed)

await click(`${marketRow} button`)
await waitFor(`!!document.querySelector('[data-testid="extension-action"]')`)
const dialog = String(await evaluate(`document.body.innerText`))
check("the existing detail dialog opens", dialog.includes("skills.sh"))
check("the dialog shows the listed version", dialog.includes(expected.version))

await click('[data-testid="extension-action"]')
await waitForFile(path.join(HOME, "extensions", "skills.sh", "plugin.yaml"))
check("the install wrote the plugin", true)
await waitFor(
  `/Uninstall|卸载/.test(document.querySelector('[data-testid="extension-action"]')?.innerText ?? "")`
)
check("the action switches to uninstall without a reload", true)
let state = JSON.parse(
  await fs.readFile(path.join(HOME, "state", "extensions.json"), "utf8")
) as Record<string, boolean>
check("the install enabled the plugin", state["skills.sh"] === true)

/* This plugin's contribution is a service, not a visible surface. Installing
   must have activated it: the Skills page's Explore dialog names it. */
const origin = new URL(PAGE).origin
const explore = `Array.from(document.querySelectorAll("button")).find((el) => (el.textContent ?? "").trim() === "Explore")`
await send("Page.navigate", { url: `${origin}/skills` })
await waitFor(`!!(${explore})`, 30_000)
await clickExpression(explore)
await waitFor(`!!document.querySelector('input[placeholder="Search skills.sh"]')`, 15_000).catch(
  async (error: unknown) => {
    console.log("skills page:\n" + String(await evaluate("document.body.innerText")))
    throw error
  }
)
check("skills.sh activates and registers its search source", true)
await send("Page.navigate", { url: PAGE })
await waitFor(
  `document.readyState === "complete" && !!document.querySelector(${JSON.stringify(marketRow)})`,
  30_000
)

await click(`${marketRow} button`)
await waitFor(`!!document.querySelector('[data-testid="extension-action"]')`)
await evaluate(
  `document.querySelector('[data-testid="extension-action"]').click()`
)
await new Promise((resolve) => setTimeout(resolve, 500))
await waitFor(
  `/Install|安装/.test(document.querySelector('[data-testid="extension-action"]')?.innerText ?? "")`
)
check("the action switches back to install without a reload", true)
state = JSON.parse(
  await fs.readFile(path.join(HOME, "state", "extensions.json"), "utf8")
) as Record<string, boolean>
check("uninstall disables the plugin", state["skills.sh"] === false)
check(
  "uninstall keeps the installed files",
  await fs.stat(path.join(HOME, "extensions", "skills.sh", "plugin.yaml")).then(
    () => true,
    () => false
  )
)

/* Claude Code is a real market plugin: installing it must bring the agent row
   into the sidebar, which no longer ships with the hub. */
await evaluate(`document.querySelector('[aria-label="Close"]')?.click()`)
await waitFor(`!document.querySelector('[data-testid="extension-action"]')`, 5_000)

const sidebar = `(document.querySelector('[data-slot="sidebar"]')?.innerText ?? "")`
check(
  "the hub no longer ships the Claude Code integration",
  !String(await evaluate(sidebar)).includes("Claude Code")
)

await waitFor(`!!document.querySelector('[data-testid="extension-claude.code"]')`)
await click('[data-testid="extension-claude.code"] button')
await waitFor(`!!document.querySelector('[data-testid="extension-action"]')`)
check(
  "claude.code offers Install before it is installed",
  /Install|安装/.test(
    String(
      await evaluate(
        `document.querySelector('[data-testid="extension-action"]')?.innerText ?? ""`
      )
    )
  )
)
/* Let the previous row's toast clear so it cannot sit over the footer button. */
await waitFor(
  `!document.body.innerText.includes("skills.sh is installed")`,
  15_000
).catch(() => undefined)
await new Promise((resolve) => setTimeout(resolve, 500))
await click('[data-testid="extension-action"]')
await waitForFile(path.join(HOME, "extensions", "claude.code", "lib", "index.js")).catch(
  async (error: unknown) => {
    console.log(String(await evaluate("document.body.innerText")))
    throw error
  }
)
state = JSON.parse(
  await fs.readFile(path.join(HOME, "state", "extensions.json"), "utf8")
) as Record<string, boolean>
check("claude.code is enabled", state["claude.code"] === true)

/* The hub's own notice asks for a refresh; startup discovery then builds the
   catalog from the installed directory and activates the plugin. */
await send("Page.reload", { ignoreCache: true })
await waitFor(
  `document.readyState === "complete" && !!document.querySelector('[data-slot="sidebar"]')`,
  30_000
).catch(async (error: unknown) => {
  console.log("after reload:", await evaluate("document.readyState"), await evaluate("location.href"))
  console.log("body:\n" + String(await evaluate("document.body.innerText")))
  console.log("root:\n" + String(await evaluate("document.getElementById('root')?.innerText ?? '<none>'")))
  throw error
})
await waitFor(`${sidebar}.includes("Claude Code")`, 30_000).catch(async (error: unknown) => {
  console.log(
    "state:",
    await fs
      .readFile(path.join(HOME, "state", "extensions.json"), "utf8")
      .catch(() => "<none>")
  )
  console.log("body:\n" + String(await evaluate("document.body.innerText")))
  throw error
})
check("claude.code registers its places after reload", true)
check(
  "claude.code did not report an activation error",
  !String(
    await evaluate(
      `document.querySelector('[data-testid="extension-claude.code"]').innerText`
    )
  ).includes("Error")
)

await click('[data-testid="extension-claude.code"] button')
await waitFor(`!!document.querySelector('[data-testid="extension-action"]')`)
await click('[data-testid="extension-action"]')
await waitFor(`!${sidebar}.includes("Claude Code")`, 30_000)
check("uninstalling claude.code withdraws its places", true)

await send("Browser.close").catch(() => undefined)
socket.close()

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} check(s) failed`)
  process.exitCode = 1
} else {
  console.log("\nall checks passed")
}
