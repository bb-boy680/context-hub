/**
 * The window's own title bar.
 *
 * The page is not a title bar: this strip is injected by the preload so it sits
 * above the application no matter which route is open, and the menu it opens is
 * an Electron menu, not a page widget. Windows and macOS keep their native
 * window buttons; Linux gets the three buttons drawn here because its window is
 * frameless.
 */
import { ipcRenderer } from "electron"

import {
  APP_MENU_CHANNEL,
  TITLEBAR_HEIGHT,
  WINDOW_CLOSE_CHANNEL,
  WINDOW_MAXIMIZE_CHANNEL,
  WINDOW_MINIMIZE_CHANNEL,
  WINDOW_STATE_CHANNEL,
} from "./bridge.ts"

const platform = process.platform
const isMac = platform === "darwin"
const isLinux = platform === "linux"

const STYLE = `
  :host {
    position: fixed;
    inset: 0 0 auto 0;
    height: var(--context-hub-titlebar-height, ${TITLEBAR_HEIGHT}px);
    z-index: 1100;
    display: flex;
    align-items: center;
    padding-left: var(--context-hub-titlebar-start, 12px);
    background: var(--muted, #f7f7f7);
    border-bottom: 1px solid var(--border, #dee1e6);
    -webkit-app-region: drag;
    font-family: var(--font-sans, system-ui, sans-serif);
  }
  /* --muted is translucent in dark mode; the bar must hide content scrolling
     under it, so dark mode takes the opaque raised surface instead. */
  :host-context(.dark) {
    background: var(--card, #16181c);
  }
  .cluster {
    display: flex;
    align-items: center;
    gap: 8px;
    -webkit-app-region: no-drag;
  }
  .brand-slot {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
  }
  .brand-mark {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--primary, #0a0b0d);
    color: var(--primary-foreground, #ffffff);
  }
  .brand-mark svg { width: 14px; height: 14px; }
  [role=menubar] { display: flex; gap: 2px; -webkit-app-region: no-drag; }
  [role=menuitem] {
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--copy, #5b616e);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: default;
  }
  [role=menuitem]:hover, [role=menuitem][aria-expanded=true] {
    background: var(--sidebar-accent, #eef0f3);
    color: var(--foreground, #0a0b0d);
  }
  [role=menuitem]:focus-visible {
    outline: 2px solid var(--sidebar-ring, #0052ff);
    outline-offset: -2px;
  }
  .window-controls {
    position: absolute;
    inset: 0 0 auto auto;
    height: 100%;
    display: flex;
    -webkit-app-region: no-drag;
  }
  .window-controls button {
    width: 46px;
    height: 100%;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--foreground, #0a0b0d);
    cursor: default;
  }
  .window-controls button:hover { background: var(--sidebar-accent, #eef0f3); }
  .window-controls button.close:hover { background: var(--destructive, #cf202f); color: #ffffff; }
  .restore { display: none; }
  :host([data-maximized=true]) .restore { display: block; }
  :host([data-maximized=true]) .maximize { display: none; }
`

function icon(path: string): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("width", "10")
  svg.setAttribute("height", "10")
  svg.setAttribute("viewBox", "0 0 10 10")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "1")
  svg.innerHTML = path
  return svg
}

/** The same Waypoints mark the sidebar uses, without pulling React into preload. */
function brandMark(): HTMLElement {
  const slot = document.createElement("span")
  slot.className = "brand-slot"
  slot.setAttribute("aria-hidden", "true")
  const mark = document.createElement("span")
  mark.className = "brand-mark"
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "2")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.innerHTML =
    '<path d="m10.586 5.414-5.172 5.172"/><path d="m18.586 13.414-5.172 5.172"/><path d="M6 12h12"/><circle cx="12" cy="20" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="4" cy="12" r="2"/>'
  mark.append(svg)
  slot.append(mark)
  return slot
}

/** The window controls Linux needs because its window is frameless. */
function windowControls(): HTMLElement {
  const box = document.createElement("div")
  box.className = "window-controls"
  box.setAttribute("role", "group")

  const minimize = document.createElement("button")
  minimize.type = "button"
  minimize.append(icon('<path d="M1 5h8"/>'))
  minimize.addEventListener("click", () => {
    void ipcRenderer.invoke(WINDOW_MINIMIZE_CHANNEL)
  })

  const maximize = document.createElement("button")
  maximize.type = "button"
  maximize.append(icon('<rect x="1.5" y="1.5" width="7" height="7"/>'))
  const maximizeMark = maximize.firstElementChild as SVGElement
  maximizeMark.classList.add("maximize")
  maximize.append(icon('<rect x="1.5" y="1.5" width="5" height="5"/><path d="M3.5 3.5h5v5h-5"/>'))
  const restoreMark = maximize.lastElementChild as SVGElement
  restoreMark.classList.add("restore")
  maximize.addEventListener("click", () => {
    void ipcRenderer.invoke(WINDOW_MAXIMIZE_CHANNEL)
  })

  const close = document.createElement("button")
  close.type = "button"
  close.className = "close"
  close.append(icon('<path d="M1 1l8 8M9 1l-8 8"/>'))
  close.addEventListener("click", () => {
    void ipcRenderer.invoke(WINDOW_CLOSE_CHANNEL)
  })

  box.append(minimize, maximize, close)
  return box
}

export function installTitlebarMenu(): void {
  const mark = (): void => {
    /* The parser may not have created the root yet when the preload runs. */
    const root = document.documentElement as HTMLElement | null
    if (root === null) return
    root.style.setProperty(
      "--context-hub-titlebar-height",
      `${TITLEBAR_HEIGHT}px`
    )
    /* macOS draws the traffic lights on the left; the menu starts after them. */
    root.style.setProperty(
      "--context-hub-titlebar-start",
      `${isMac ? 84 : 12}px`
    )
  }
  if (document.documentElement !== null) mark()

  const host = document.createElement("div")
  host.dataset.contextHubTitlebar = ""
  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = STYLE

  const bar = document.createElement("div")
  bar.setAttribute("role", "menubar")
  bar.setAttribute("aria-label", "Application")

  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("role", "menuitem")
  button.setAttribute("aria-haspopup", "menu")
  button.setAttribute("aria-expanded", "false")
  button.tabIndex = 0

  const zh = (): boolean =>
    (
      document.documentElement as HTMLElement | null
    )?.lang.toLowerCase().startsWith("zh") ?? false
  const labels = (): void => {
    const chinese = zh()
    button.textContent = chinese ? "应用" : "Application"
    bar.setAttribute("aria-label", chinese ? "应用" : "Application")
    const controls = shadow.querySelector(".window-controls")
    if (controls !== null) {
      const [minimize, maximize, close] = controls.querySelectorAll("button")
      const maximized = host.dataset.maximized === "true"
      minimize?.setAttribute("aria-label", chinese ? "最小化" : "Minimize")
      maximize?.setAttribute(
        "aria-label",
        maximized
          ? chinese
            ? "还原"
            : "Restore"
          : chinese
            ? "最大化"
            : "Maximize"
      )
      close?.setAttribute("aria-label", chinese ? "关闭" : "Close")
    }
  }

  let opening = false
  const open = async (): Promise<void> => {
    if (opening) return
    opening = true
    const rect = button.getBoundingClientRect()
    button.setAttribute("aria-expanded", "true")
    try {
      await ipcRenderer.invoke(
        APP_MENU_CHANNEL,
        rect.left,
        rect.bottom,
        zh()
      )
    } catch (error) {
      console.error("Context Hub menu failed", error)
    } finally {
      button.setAttribute("aria-expanded", "false")
      opening = false
    }
  }

  /* Pointer presses must not pull focus out of an editor behind the menu. */
  button.addEventListener("pointerdown", (event) => event.preventDefault())
  button.addEventListener("mousedown", (event) => event.preventDefault())
  button.addEventListener("click", () => void open())
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      void open()
    }
  })

  bar.append(button)
  const cluster = document.createElement("div")
  cluster.className = "cluster"
  cluster.append(brandMark(), bar)
  shadow.append(style, cluster)

  if (isLinux) {
    const controls = windowControls()
    shadow.append(controls)
    host.addEventListener("dblclick", (event) => {
      if ((event.target as Element).closest(".window-controls") !== null) return
      void ipcRenderer.invoke(WINDOW_MAXIMIZE_CHANNEL)
    })
    ipcRenderer.on(WINDOW_STATE_CHANNEL, (_event, maximized: unknown) => {
      host.dataset.maximized = maximized === true ? "true" : "false"
      labels()
    })
  }

  const install = (): void => {
    mark()
    labels()
    const root = document.documentElement as HTMLElement | null
    if (root !== null) {
      new MutationObserver(labels).observe(root, {
        attributes: true,
        attributeFilter: ["lang"],
      })
    }
    if (document.body !== null) document.body.append(host)
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", install, { once: true })
  } else {
    install()
  }
}
