import { defineProject } from "vitest/config"

/**
 * This package's tests. The file lives here rather than being handed down from
 * the root so that `include` needs no path arithmetic: a test sits under
 * `__test__/` beside it, and `pnpm --filter <pkg> test` works from inside the
 * package. The root `vitest.config.ts` gathers these into one run.
 */
export default defineProject({
  test: {
    name: "global-search",
    include: ["__test__/**/*.test.ts"],
  },
})
