import { defineProject } from "vitest/config"

/**
 * This package's tests. The file lives here rather than being handed down from
 * the root so that `include` needs no path arithmetic: a test sits under
 * `__test__/` beside it, and `pnpm --filter <pkg> test` works from inside the
 * package. The root `vitest.config.ts` gathers these into one run.
 */
export default defineProject({
  test: {
    name: "skills",
    /* Spelled out rather than left to the runner's default, so "tests live
       under __test__" is a glob it enforces and not just a habit. */
    include: ["__test__/**/*.test.ts"],
  },
})
