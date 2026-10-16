/**
 * English defaults for the `cline.*` namespace. A language pack translates
 * these keys; the kernel falls back to this table for any it does not carry.
 */
export const clineMessages: Record<string, string> = {
  "cline.tab": "Cline",
  "cline.error.parse": "Cline's MCP settings file is not JSON this hub can read.",
  "cline.error.refused": "The hub could not write {file}.",
  "cline.error.unknownPlace": "Cline has no client file called {place}.",
  "cline.error.absent": "Cline's settings hold no server named {name}.",
}
