import { defineProject } from "vitest/config"

/** This package's tests; see the note in the other market package's config. */
export default defineProject({
  test: {
    name: "market-codex-plugins",
    include: ["__test__/**/*.test.ts"],
  },
})
