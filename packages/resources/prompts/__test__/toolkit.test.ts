/**
 * The toolkit a provider works with, and the failure words it throws.
 *
 * The functions themselves are checked where they are implemented; this checks
 * that the value handed over the service is the same set, and that a named key
 * reaches the screen filled in rather than as a literal `{file}`.
 */
import { describe, expect, it } from "vitest"

import {
  failureText,
  PromptError,
  promptFailure,
} from "../src/failure.ts"
import { promptTools } from "../src/toolkit.ts"

describe("the provider toolkit", () => {
  it("carries the file and section rules this module owns", () => {
    expect(promptTools.slugOf("Code Review")).toBe("code-review")
    expect(
      promptTools.commandFile({
        name: "Code Review",
        description: "",
        body: "Review it.",
        frontmatter: true,
      })
    ).toContain("---\nname: Code Review")
    const added = promptTools.withSection(null, {
      slug: "code-review",
      title: "Code Review",
      body: "Review it.",
    })
    expect(added).toContain("<!-- context-hub:code-review -->")
    expect(promptTools.withoutSection(added, "code-review")).toBe("")
  })

  it("lets a provider name its own failure", () => {
    expect(new promptTools.PromptError("x.error", { file: "a" })).toBeInstanceOf(PromptError)
  })
})

describe("a failure on its way to the screen", () => {
  it("keeps the key and params a provider named", () => {
    const named = promptFailure(
      new PromptError("codex.error.override", { file: ".codex/AGENTS.override.md" }, "on disk"),
      "prompts.error.action"
    )
    expect(named.key).toBe("codex.error.override")
    expect(named.params).toEqual({ file: ".codex/AGENTS.override.md" })
    expect(named.detail).toContain("on disk")
  })

  it("falls back for anything else, keeping the thrown text for the log", () => {
    const other = promptFailure(new Error("port refused"), "prompts.error.action")
    expect(other.key).toBe("prompts.error.action")
    expect(other.detail).toBe("port refused")
  })

  it("fills the placeholders in the reader's language", () => {
    const table: Record<string, string> = {
      "codex.error.override": "Codex reads {file}, so this was not written.",
      "prompts.error.action": "That could not be done",
    }
    const t = (key: string) => table[key] ?? key
    expect(
      failureText(t, {
        key: "codex.error.override",
        params: { file: ".codex/AGENTS.override.md" },
      })
    ).toBe("Codex reads .codex/AGENTS.override.md, so this was not written.")
    expect(failureText(t, { key: "prompts.error.action" })).toBe("That could not be done")
  })
})
