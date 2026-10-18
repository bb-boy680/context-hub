/**
 * Environment variables as a plugin: the page, its navigation entry, and the
 * English defaults for the `variables.*` namespace — all through the kernel's
 * extension points, so the shell ships no variable-specific code.
 *
 * The library is one collection under the hub's own home, and the page talks to
 * it through the route the host mounts. Nothing here registers a service: the
 * page is the only consumer today, and a second consumer can be given the same
 * store without moving the read into a shared object first.
 */
import { VariableIcon } from "lucide-react"

import type { ExtensionModule } from "@context-hub/extensions"

import { variablesMessages } from "./messages.ts"
import { VariablesPage } from "./page.tsx"
import { VariablesService } from "./service.ts"

export { VariablesPage }
export { VariableInput } from "./components/variable-input.tsx"
export type { VariableInputProps } from "./components/variable-input.tsx"
export { VariablePicker } from "./components/variable-picker.tsx"
export type { VariablePickerProps } from "./components/variable-picker.tsx"
export { VariablesService, VARIABLES_SERVICE } from "./service.ts"
export type { VariablesComponents } from "./service.ts"
export * from "./store.ts"
export { createRemoteVariableStore } from "./remote-store.ts"

/** This module's own id; the kernel matches it against the manifest. */
const VARIABLES_ID = "hub.variable.catalog"

export const variablesExtension: ExtensionModule = {
  name: VARIABLES_ID,
  manifest: {
    name: "Environment Variables",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "asset",
    description:
      "Keep environment variable names, groups and values in one place, and insert a reference anywhere a ${name} is read.",
    icon: VariableIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "filesystem"],
  },
  inject: ["nav", "routes", "locales"],

  apply(ctx) {
    new VariablesService(ctx)

    ctx.nav.register({
      path: "/variables",
      labelKey: "nav.variables",
      icon: VariableIcon,
      group: "operate",
      order: 15,
    })
    ctx.routes.register({
      path: "/variables",
      Component: VariablesPage,
    })
    ctx.locales.register({
      id: "en",
      label: "English",
      messages: variablesMessages,
    })
  },
}
