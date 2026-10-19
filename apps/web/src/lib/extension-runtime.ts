/**
 * Publish the kernel's React to the plugin runtime.
 *
 * `/hub/extensions/_runtime/*.js` reads these globals. They must be set before
 * `discoverPlugins()` imports any plugin, which is why `startHub()` calls this
 * first: a plugin module evaluates its `import React from "react"` at load
 * time, and the import map points that name at a shim which reads this value.
 */
import * as React from "react"
import * as ReactDOM from "react-dom"
import * as JsxDevRuntime from "react/jsx-dev-runtime"
import * as JsxRuntime from "react/jsx-runtime"

/** Install the one React instance every plugin module shares. */
export function installExtensionRuntime(): void {
  const shared = globalThis as typeof globalThis & Record<string, unknown>
  shared.__CONTEXT_HUB_REACT__ = React
  shared.__CONTEXT_HUB_REACT_DOM__ = ReactDOM
  shared.__CONTEXT_HUB_REACT_JSX_RUNTIME__ = JsxRuntime
  shared.__CONTEXT_HUB_REACT_JSX_DEV_RUNTIME__ = JsxDevRuntime
}
