# shadcn/ui monorepo template

This is a Vite monorepo template with shadcn/ui.

## Running

```bash
pnpm dev     # development
pnpm build   # typecheck + build the page into apps/web/dist
pnpm start   # the built form: apps/web/server.ts --static dist
```

Development runs **two processes**, because every other form is the same shape:
the hub's own server (`apps/web/server.ts`, port 5270) holds every bridge, and
Vite serves the page's source with HMR (port 5271) and forwards `/hub` to it.
Both ports are written down in one place, `apps/web/hub-port.ts`. A built form
and a desktop or command-line form run `apps/web/server.ts` and nothing else,
so a route that answers in development answers after a build.

To stop it, stop the hub server: it is Vite's child, and its exit takes Vite
with it.

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
