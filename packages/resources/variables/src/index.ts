/**
 * Environment variables as a plugin: the page, its navigation entry, the shared
 * read a startup can preload, and the English defaults for the `variables.*`
 * namespace — all through the kernel's extension points, so the shell ships no
 * variable-specific code.
 *
 * The library is one collection under the hub's own home, and the page talks to
 * it through the route the host mounts. The read is shared rather than repeated
 * on every visit, because the global search and the page both draw the same
 * names.
 */
import { VariableIcon } from "lucide-react"

import type { ExtensionModule } from "@context-hub/extensions"

import { VARIABLE_LIBRARY_SERVICE, VariableLibrary } from "./library-store.ts"
import { variablesMessages } from "./messages.ts"
import { VariablesPage } from "./page.tsx"
import { variableSearch } from "./search.ts"
import { VARIABLES_SERVICE, VariablesService } from "./service.ts"

export { VariablesPage }
export { VariableInput } from "./components/variable-input.tsx"
export type { VariableInputProps } from "./components/variable-input.tsx"
export { VariablePicker } from "./components/variable-picker.tsx"
export type { VariablePickerProps } from "./components/variable-picker.tsx"
export { VariablesService, VARIABLES_SERVICE } from "./service.ts"
export type { VariablesComponents } from "./service.ts"
export {
  NOTHING_READ,
  VARIABLE_LIBRARY_SERVICE,
  VariableLibrary,
  type VariableLibraryValue,
} from "./library-store.ts"
export { useVariableLibrary, type VariablesLibrary } from "./library.ts"
export * from "./store.ts"
export { createRemoteVariableStore } from "./remote-store.ts"

/** This module's own id; the kernel matches it against the manifest. */
const VARIABLES_ID = "hub.variable.catalog"

export const variablesExtension: ExtensionModule = {
  name: VARIABLES_ID,
  manifest: {
    name: "Environment Variables",
    version: "0.1.0",
    kind: "code",
    category: "asset",
    description:
      "Keep environment variable names, groups and values in one place, and insert a reference anywhere a ${name} is read.",
    icon: VariableIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "filesystem"],
    provides: [VARIABLES_SERVICE, VARIABLE_LIBRARY_SERVICE],
  },
  inject: ["nav", "routes", "locales", "search"],

  apply(ctx) {
    new VariablesService(ctx)

    /* The shared read of the library. Constructed here and read by name from the
       form's own startup, so the names are already there when a page opens or a
       global search asks. Constructing it reads nothing; the first `load()` is
       what asks. */
    const library = new VariableLibrary(ctx)

    /* The palette reaches this module through one function rather than by
       reading the document itself and deciding what a name is. */
    ctx.search.register(variableSearch(library))

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
