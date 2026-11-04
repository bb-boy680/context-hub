import * as React from "react"
import { describe, expect, it, vi } from "vitest"

import { PlaceList, PlaceMenu } from "@context-hub/extensions/components"
import { Button } from "@context-hub/shadcn-ui/components/button"
import { placesOf } from "../src/installs.ts"
import { InstallToMenu } from "../src/menus.tsx"
import { AgentStack } from "../src/parts.tsx"
import { Places } from "../src/server-dialog.tsx"
import type { McpAgentPlace, McpServer } from "../src/types.ts"

vi.mock("@context-hub/extensions/react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

const icon = () => null
const places: McpAgentPlace[] = [
  { id: "default", label: "Default", file: "default.json", path: "default.json", scope: "workspace", switchable: true, client: "client", icon },
  { id: "install", label: "Install", file: "install.json", path: "install.json", scope: "workspace", switchable: true, installable: true, client: "client", icon },
  { id: "scan-held", label: "Held", file: "held.jsonc", path: "held.jsonc", scope: "workspace", switchable: true, installable: false, client: "client", icon },
  { id: "scan-empty", label: "Empty", file: "empty.jsonc", path: "empty.jsonc", scope: "workspace", switchable: true, installable: false, client: "client", icon },
]
const server = {
  stored: true,
  detail: { installs: [{ place: "scan-held", installed: true, enabled: true }] },
} as McpServer

type ElementProps = { children?: React.ReactNode; [key: string]: unknown }
function childOf(node: React.ReactNode, type: React.ElementType): React.ReactElement<ElementProps> | undefined {
  if (!React.isValidElement<ElementProps>(node)) return undefined
  if (node.type === type) return node
  for (const child of React.Children.toArray(node.props.children)) {
    const found = childOf(child, type)
    if (found !== undefined) return found
  }
  return undefined
}

describe("MCP installation targets", () => {
  it("offers only installable places for a single or batch install", () => {
    const writes: string[] = []
    const menu = InstallToMenu({ server, places, onToggle: (place) => writes.push(place) })
    const picker = childOf(menu, PlaceMenu)
    expect(picker).toBeDefined()
    const groups = picker!.props.groups as { options: { id: string }[] }[]
    const ids = groups.flatMap((group) => group.options.map((option) => option.id))
    expect(ids).toEqual(["default", "install"])

    const installBatch = (picker!.props.onPick as (id: string) => void)
    for (const id of ids) installBatch(id)
    expect(writes).toEqual(["default", "install"])
  })

  it("uses the resolved physical path in the agent tooltip", () => {
    const resolved = places.map((place) => place.id === "scan-held" ? { ...place, path: "D:/custom/profile/patch.yml" } : place)
    const stack = AgentStack({ server, places: resolved })!
    expect(stack.props.label).toContain("D:/custom/profile/patch.yml")
  })

  it("shows unknown status without a writable switch or remove action", () => {
    const unknown = { ...server, detail: { ...server.detail, installs: [{ place: "scan-held", installed: true, enabled: null, readOnly: true }] } } as McpServer
    const onToggle = vi.fn()
    const content = Places({ server: unknown, recordsFile: "", states: placesOf(places, unknown.detail.installs), onAdopt: vi.fn(), onToggle, onSetEnabled: vi.fn() })
    const list = childOf(content, PlaceList)!
    const groups = list.props.groups as { options: { id: string }[] }[]
    const held = groups.flatMap((group) => group.options).find((option) => option.id === "scan-held")!
    const action = (list.props.action as (option: typeof held) => React.ReactElement<ElementProps>)(held)
    const controls = (action.type as (props: ElementProps) => React.ReactNode)(action.props)
    const button = childOf(controls, Button)!
    expect(button.props.disabled).toBe(true)
    expect(JSON.stringify(controls)).toContain("mcp.place.unknown")
  })

  it("shows an installed scan-only place with its remove action, but hides an empty one", () => {
    const onToggle = vi.fn()
    const content = Places({ server, recordsFile: "", states: placesOf(places, server.detail.installs), onAdopt: vi.fn(), onToggle, onSetEnabled: vi.fn() })
    const list = childOf(content, PlaceList)
    expect(list).toBeDefined()
    const groups = list!.props.groups as { options: { id: string; where: string; selected: boolean }[] }[]
    const options = groups.flatMap((group) => group.options)
    expect(options.map((option) => option.id)).toEqual(["default", "install", "scan-held"])
    const held = options.find((option) => option.id === "scan-held")!
    expect(held).toMatchObject({ where: "held.jsonc", selected: true })
    const action = (list!.props.action as (option: typeof held) => React.ReactElement<ElementProps>)(held)
    const controls = (action.type as (props: ElementProps) => React.ReactNode)(action.props)
    const button = childOf(controls, Button)
    expect(button).toBeDefined()
    expect(JSON.stringify(button!.props.children)).toContain("mcp.detail.action.remove")
    ;(button!.props.onClick as () => void)()
    expect(onToggle).toHaveBeenCalledWith("scan-held")
  })
})
