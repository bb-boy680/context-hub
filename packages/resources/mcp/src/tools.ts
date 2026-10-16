/**
 * The shapes the 工具 tab renders: one tool, and the JSON-Schema tree its input
 * and output expand into. Plain data, so what a real connection answers with
 * can be handed straight to the pane.
 */

/** One node of a tool's schema tree: a property, or an array's item. */
export interface McpField {
  name: string
  type: "object" | "array" | "string" | "number" | "boolean"
  description?: string
  /** Whether the schema marks it required; absent means optional. */
  required?: boolean
  /** An object's properties, or an array's single item schema. */
  children?: McpField[]
}

/** One tool the server exposes. */
export interface McpTool {
  name: string
  /** The line beside the name, as the card's head shows it. */
  title: string
  description: string
  /** The arguments it takes. */
  input: McpField[]
  /** What the server says the input is, as the tree's root line reads; empty when it said nothing. */
  inputDescription: string
  /** What it answers with. */
  output: McpField[]
  /** What the server declared about the output; empty when it declared none. */
  outputDescription: string
}
