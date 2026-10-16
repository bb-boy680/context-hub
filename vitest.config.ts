import { defineConfig } from "vitest/config"

/**
 * Every package's tests, in one process: one worker pool, one watch, one filter.
 *
 * Each package owns its own `vitest.config.ts` — it knows where it is, so its
 * include needs no path arithmetic and `pnpm --filter <pkg> test` works from
 * inside the package. This file only gathers them.
 *
 * The list is explicit rather than a glob: `packages/*` also matches the
 * `eslint.config.js` sitting in each package, which vitest refuses. A package
 * joins the run when it gains a config here.
 */
export default defineConfig({
  test: {
    projects: ["packages/core/vitest.config.ts", "packages/extensions/vitest.config.ts"],
  },
})
