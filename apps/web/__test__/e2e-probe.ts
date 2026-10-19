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
const entry = index.plugins.find((plugin) => plugin.id === "demo.other")
if (entry === undefined) throw new Error("the fixture index has no demo.other")
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

async function click(selector: string): Promise<void> {
  await evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.scrollIntoView({ block: "center" }); return true })()`
  )
  await new Promise((resolve) => setTimeout(resolve, 200))
  const point = (await evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`
  )) as { x: number; y: number } | null
  if (point === null) throw new Error(`no element ${selector}`)
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

const failures: string[] = []
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === "" ? "" : ` — ${detail}`}`)
  if (!ok) failures.push(name)
}

await send("Page.enable")
await send("Runtime.enable")
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

await evaluate(
  `(() => { const input = document.querySelector('#extension-market-source'); input.value = ${JSON.stringify(MARKET)}; input.closest('form').requestSubmit(); return true })()`
)
await waitFor(`!!document.querySelector('[data-testid="extension-demo.other"]')`)

const listed = String(
  await evaluate(`document.querySelector('[data-testid="extension-demo.other"]').innerText`)
)
check("the market entry is listed with the catalog", listed.includes("Demo Other"), listed)

await click('[data-testid="extension-demo.other"] button')
await waitFor(`!!document.querySelector('[data-testid="extension-action"]')`)
const dialog = String(await evaluate(`document.body.innerText`))
check("the existing detail dialog opens", dialog.includes("Demo Other"))
check("the dialog shows the listed version", dialog.includes(expected.version))

await click('[data-testid="extension-action"]')
await waitForFile(path.join(HOME, "extensions", "demo.other", "plugin.json"))
check("the install wrote the plugin", true)
await waitFor(
  `/Uninstall|卸载/.test(document.querySelector('[data-testid="extension-action"]')?.innerText ?? "")`
)
check("the action switches to uninstall without a reload", true)
let state = JSON.parse(
  await fs.readFile(path.join(HOME, "state", "extensions.json"), "utf8")
) as Record<string, boolean>
check("the install enabled the plugin", state["demo.other"] === true)

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
check("uninstall disables the plugin", state["demo.other"] === false)
check(
  "uninstall keeps the installed files",
  await fs.stat(path.join(HOME, "extensions", "demo.other", "plugin.json")).then(
    () => true,
    () => false
  )
)

await send("Browser.close").catch(() => undefined)
socket.close()

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} check(s) failed`)
  process.exitCode = 1
} else {
  console.log("\nall checks passed")
}
