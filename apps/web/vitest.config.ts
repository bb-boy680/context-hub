import { defineProject } from "vitest/config"

/**
 * The app's tests. The file lives here rather than being handed down from the
 * root so that `include` needs no path arithmetic: a test sits under `__test__/`
 * beside it, and `pnpm --filter web test` works from inside the app.
 *
 * `environment` is left at node. Nothing here renders a component yet, and the
 * day one does, this is where the DOM it needs gets declared.
 */
export default defineProject({
  test: {
    name: "web",
    /* Spelled out rather than left to the runner's default, so "tests live
       under __test__" is a glob it enforces and not just a habit. */
    include: ["__test__/**/*.test.ts"],
  },
})
