/**
 * The server rows a global search offers: the fields the page's own filter
 * reads, the brand mark the page draws, and the address that opens the list.
 */
import { describe, expect, it } from "vitest"

import { searchServers } from "../src/search.ts"
import type { McpServer } from "../src/types.ts"

function server(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: "github",
    name: "github",
    transport: "stdio",
    declaration: "npx -y @modelcontextprotocol/server-github",
    description: "",
    unreadable: 0,
    installed: 0,
    stored: false,
    status: "ready",
    mark: "github",
    tag: "",
    detail: { declaration: null, tags: [], installs: [], tools: [] },
    ...overrides,
  }
}

describe("searching the MCP servers", () => {
  it("matches the name, command, or description the page's filter reads", () => {
    const servers = [
      server(),
      server({
        id: "docling",
        name: "docling-mcp",
        declaration: "uvx docling-mcp",
        description: "Read documents",
        mark: "generic",
      }),
    ]

    expect(searchServers(servers, "modelcontext").map((one) => one.title)).toEqual([
      "github",
    ])
    expect(searchServers(servers, "DOCUMENTS").map((one) => one.title)).toEqual([
      "docling-mcp",
    ])
  })

  it("shows a brand mark, and no note when the server has no description", () => {
    const [row] = searchServers([server()], "github")
    expect(row?.avatar).toBe("/mcp-icons/github.png")
    expect(row?.description).toBeUndefined()
  })

  it("opens the page filtered by the clicked row's own name", () => {
    expect(searchServers([server()], "git")[0]?.path).toBe(
      "/mcp-servers?q=github"
    )
  })

  it("returns nothing for an empty query", () => {
    expect(searchServers([server()], "")).toEqual([])
  })
})
