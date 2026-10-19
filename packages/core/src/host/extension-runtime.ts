/**
 * The React runtime a plugin module imports by name.
 *
 * A plugin written as a normal React project says `import React from "react"`.
 * The browser resolves that bare name through the page's import map to these
 * shims, which read the one React instance the kernel installed on `globalThis`
 * before any plugin was imported. There is no second copy of React, so hooks
 * and context keep working across the plugin and the app.
 *
 * The export lists are static because an ES module's named exports are static.
 * `apps/web/__test__/extension-runtime.test.ts` compares them with the running
 * React package, so a React upgrade that adds an export fails a test instead of
 * failing the first plugin that uses it.
 */

/** React's public exports, in the order this build's React 19.2.8 reports them. */
export const REACT_EXPORTS = [
  "Activity",
  "Children",
  "Component",
  "Fragment",
  "Profiler",
  "PureComponent",
  "StrictMode",
  "Suspense",
  "act",
  "cache",
  "cacheSignal",
  "captureOwnerStack",
  "cloneElement",
  "createContext",
  "createElement",
  "createRef",
  "forwardRef",
  "isValidElement",
  "lazy",
  "memo",
  "startTransition",
  "unstable_useCacheRefresh",
  "use",
  "useActionState",
  "useCallback",
  "useContext",
  "useDebugValue",
  "useDeferredValue",
  "useEffect",
  "useEffectEvent",
  "useId",
  "useImperativeHandle",
  "useInsertionEffect",
  "useLayoutEffect",
  "useMemo",
  "useOptimistic",
  "useReducer",
  "useRef",
  "useState",
  "useSyncExternalStore",
  "useTransition",
  "version",
] as const

/** The subset of `react-dom` a plugin may use; portals are the common need. */
export const REACT_DOM_EXPORTS = ["createPortal", "flushSync", "version"] as const

/** Files served under `EXTENSION_RUNTIME_DIR`, by name. */
export const RUNTIME_FILES: Readonly<Record<string, string>> = {
  "react.js": shim("React", "__CONTEXT_HUB_REACT__", REACT_EXPORTS),
  "jsx-runtime.js": shim("Jsx", "__CONTEXT_HUB_REACT_JSX_RUNTIME__", [
    "Fragment",
    "jsx",
    "jsxs",
  ]),
  "jsx-dev-runtime.js": shim("JsxDev", "__CONTEXT_HUB_REACT_JSX_DEV_RUNTIME__", [
    "Fragment",
    "jsxDEV",
  ]),
  "react-dom.js": shim("ReactDOM", "__CONTEXT_HUB_REACT_DOM__", REACT_DOM_EXPORTS),
}

/** One shim: a default export plus the names a plugin may import. */
function shim(source: string, global: string, names: readonly string[]): string {
  const lines = [
    `const ${source} = globalThis.${global}`,
    `if (${source} === undefined) throw new Error("Context Hub: ${global} is not installed")`,
    `export default ${source}`,
    ...names.map((name) => `export const ${name} = ${source}.${name}`),
  ]
  return `${lines.join("\n")}\n`
}

/**
 * The shim a runtime file name names.
 *
 * @param name — e.g. `react.js`.
 * @returns the module source, or `undefined` when this build has no such file.
 */
export function runtimeSource(name: string): string | undefined {
  return Object.hasOwn(RUNTIME_FILES, name) ? RUNTIME_FILES[name] : undefined
}
