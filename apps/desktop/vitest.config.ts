import { defineProject } from "vitest/config"

/**
 * The desktop carrier's tests. Only the pure pieces are covered here — the
 * window and the child process need a real Electron process to run, which the
 * build acceptance exercises instead.
 */
export default defineProject({
  test: {
    name: "desktop",
    include: ["__test__/**/*.test.ts"],
  },
})
