/**
 * The two expressions the sidebar really uses: how a row's label is chosen and
 * what the rename field submits. The component itself has no DOM test in this
 * app, so these cover the logic the row depends on.
 */
import { describe, expect, it } from "vitest"

import { DEFAULT_WORKSPACE_NAME } from "@context-hub/core/workspace"
import type { WorkspaceView } from "@context-hub/core/workspace"

import { renameSubmission, workspaceLabel } from "../src/lib/workspaces.ts"

const translated = (key: string): string =>
  key === DEFAULT_WORKSPACE_NAME ? "Default workspace" : key

const view = (patch: Partial<WorkspaceView> = {}): WorkspaceView => ({
  id: "id",
  name: "folder",
  path: "/tmp/folder",
  display: "~/folder",
  default: false,
  nameKey: null,
  ...patch,
})

describe("the workspace row label", () => {
  it("translates a system name", () => {
    expect(workspaceLabel(view({ nameKey: DEFAULT_WORKSPACE_NAME }), translated)).toBe(
      "Default workspace"
    )
  })

  it("shows the row's own name when there is no system name", () => {
    expect(workspaceLabel(view({ name: "My home" }), translated)).toBe("My home")
  })
})

describe("what the rename field submits", () => {
  it("restores the system name when the default workspace is cleared", () => {
    expect(renameSubmission(true, "", translated)).toBe("")
    expect(renameSubmission(true, "  ", translated)).toBe("")
  })

  it("restores the system name when it is typed as-is", () => {
    expect(renameSubmission(true, "Default workspace", translated)).toBe("")
  })

  it("keeps the name the person typed, on any row", () => {
    expect(renameSubmission(true, "My home", translated)).toBe("My home")
    expect(renameSubmission(false, "", translated)).toBe("")
    expect(renameSubmission(false, "My home", translated)).toBe("My home")
  })
})
