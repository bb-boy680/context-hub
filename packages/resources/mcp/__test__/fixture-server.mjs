/**
 * A minimal MCP server the probe check runs against: one real stdio server
 * built on the same SDK, with the details a probe must report — a title, two
 * icons (an https one first, so preferring the data URI is a real decision), a
 * tool list that pages, a tool with an output schema, long instructions, and
 * stderr output of its own.
 *
 * Two environment variables drive its failure modes: `CTX_HUB_FIXTURE_FAIL`
 * makes it write to stderr and exit before speaking, and `MARK` is the value
 * the instructions report, which is how the check proves `${VAR}` expansion
 * reached the child.
 *
 * Spawned by `probe.test.ts`; not meant to be run by hand.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

if (process.env.CTX_HUB_FIXTURE_FAIL === "1") {
  console.error("fixture: failing as asked")
  process.exit(3)
}

console.error("fixture: ready")

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#4f46e5"/></svg>`

const server = new Server(
  {
    name: "fixture",
    title: "Fixture server",
    version: "9.9.9",
    websiteUrl: "https://example.com/fixture",
    description: "Echoes text and adds numbers.",
    icons: [
      { src: "https://example.com/icon.png", mimeType: "image/png", sizes: ["48x48"] },
      {
        src: `data:image/svg+xml;base64,${Buffer.from(ICON).toString("base64")}`,
        mimeType: "image/svg+xml",
        sizes: ["any"],
      },
      {
        src: `data:image/svg+xml;base64,${Buffer.from(ICON).toString("base64")}`,
        mimeType: "image/svg+xml",
        theme: "dark",
      },
    ],
  },
  {
    capabilities: { tools: {} },
    instructions: `mark=${process.env.MARK ?? ""} ${"x".repeat(3000)}`,
  }
)

server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  if (request.params?.cursor === "page-2") {
    return {
      tools: [
        {
          name: "sum",
          title: "Sum",
          description: "Add two numbers.",
          inputSchema: {
            type: "object",
            properties: { a: { type: "number" }, b: { type: "number" } },
            required: ["a", "b"],
          },
          outputSchema: {
            type: "object",
            properties: { total: { type: "number" } },
            required: ["total"],
          },
        },
      ],
    }
  }
  return {
    tools: [
      {
        name: "echo",
        description: "Echo the message back.",
        inputSchema: {
          type: "object",
          properties: { message: { type: "string", description: "What to echo." } },
          required: ["message"],
        },
      },
    ],
    nextCursor: "page-2",
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => ({
  content: [{ type: "text", text: String(request.params.arguments?.message ?? "") }],
}))

await server.connect(new StdioServerTransport())
