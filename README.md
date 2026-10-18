# shadcn/ui monorepo template

This is a Vite monorepo template with shadcn/ui.

## Running

```bash
pnpm dev     # development
pnpm build   # typecheck + build the page into apps/web/dist
pnpm start   # the built form: apps/web/server.ts --static dist
pnpm test    # every package's tests, in one process
```

Development runs **two processes**, because every other form is the same shape:
the hub's own server (`apps/web/server.ts`, port 5270) holds every bridge, and
Vite serves the page's source with HMR (port 5271) and forwards `/hub` to it.
Both ports are written down in one place, `apps/web/hub-port.ts`. A built form
and a desktop or command-line form run `apps/web/server.ts` and nothing else,
so a route that answers in development answers after a build.

To stop it, stop the hub server: it is Vite's child, and its exit takes Vite
with it.

## Tests

Vitest, one project per package, and **a package's tests live in `__test__/`
beside its `src/`**. That is not a convention anyone has to remember: each
package's `vitest.config.ts` spells the glob out, so a file left anywhere else is
simply not collected.

```bash
pnpm test                            # every package, one process
pnpm --filter @context-hub/skills test   # one package, from wherever you are
npx vitest run --project mcp         # one project, from the root
npx vitest                           # watch
```

The root `vitest.config.ts` is the only file that knows the whole list; a package
joins the run by appearing there and by owning a `vitest.config.ts` of its own.
Each package has one so its `include` needs no path arithmetic and a filtered run
works from inside the package — the same reason each has its own `tsconfig.json`.

`turbo` deliberately does not run the tests. One vitest process over every
project shares a worker pool and a filter; `turbo test` would start ten of them.

Most of these are not unit tests. The suite writes real files under
`os.tmpdir()`, starts real `node:http` listeners on port 0, spawns a real MCP
server through `process.execPath`, and clones a real git repository — so:

- **`git` must be on PATH.** Only `packages/resources/skills/__test__/updates.test.ts`
  needs it, and it is the one slow file (about 15 seconds of a 16-second run).
- Nothing here reaches the network, and nothing writes outside a temporary
  directory. Where a store takes a machine-level root (`userHome`), the tests
  pass a temporary one, because its default is the person's real home.

`pnpm install` in a sandboxed shell hangs rather than failing — the sandbox drops
packets instead of refusing them. Run it with the sandbox off.

### Where an asset page's data comes from

The five asset libraries (Skills, MCP, Plugins, Prompts, Environment variables)
are **read once, at startup**, not when a page that draws them is opened. Each
module publishes its own read as a service — `catalog.skills`, `catalog.mcp`,
`catalog.plugins`, `catalog.prompts`, `catalog.variables` — and
`apps/web/src/lib/preload.ts` starts all five after the kernel is up, without
waiting for the answers. The page watches that read through `useCatalog`; it
does not make one of its own.

A page that opens before the read lands starts it itself, which is the same read
answered twice rather than a second one. What this buys: leaving a page no
longer throws its rows away, and something outside the page — the global search,
for instance — can see what the hub holds without having visited it.

Global search is itself an extension (`@context-hub/global-search`). Every
module offers one `search(query)` through the kernel's `search` contribution
point; the palette calls them and never names a skill, server, pack, prompt, or
variable itself. Settings and Extensions are shell pages rather than extensions,
so that package offers their providers.

Two rules to keep in mind when adding to this:

- **A library that has never been read has nothing to read again.** Its watchers
  ignore changes until someone asks, because the kernel's own startup is a
  stream of extensions arriving; following that reads half of them and throws it
  away.
- **A service that both calls and watches the same thing must tell its watchers
  only when the answer changed.** `workspaces.refresh()` announces only a
  different list for exactly this reason: the libraries that ask it for the
  folder in use are the ones subscribed to it.

`createCatalog` (`packages/extensions/src/catalog.ts`) is where the races live —
one read at a time, a late answer dropped rather than written over a newer one,
and a failure that keeps the last answer and reports itself instead of rejecting.

### Adding a route to the API

1. Add a `createXHandler(): HubMiddleware` to the owning package's `handlers.ts`
   — a plain `node:http` handler that either answers or calls `next()`.
2. Its route constant lives in that package's seam module
   (`plugin-skills` → `src/store.ts`, `plugins` → `src/contract.ts`), next to the
   types it belongs to, so the browser side and the host side import one string
   instead of spelling it twice.
3. Mount it in `apps/web/server.ts`, in the order it has to be tried.
4. Read the module you are editing for how it names actions: **there is no one
   convention yet.** `plugin-skills` names every action in the query whatever
   the method, `plugin-plugins` reads with a query and writes in the body,
   `plugin-prompts` is REST, and `plugin-mcp` posts a body action. Unifying them
   is the next stage; until then, curl the route you changed and check both ends
   by hand — a route is a string, so no type check sees the two ends disagree.
   Answers are JSON, and a failure is a 4xx carrying `{ error }`. The pipeline
   (`readBody`, `sendJson`, `sendError`) is shared from
   `@context-hub/core/host/http` — do not write another one.

## Adding components

To add components to your app, run the following command at the root of your `web` app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/shadcn-ui/src/components` directory.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@context-hub/shadcn-ui/components/button";
```
