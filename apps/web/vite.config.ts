import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { DEV_HUB_PORT } from "./hub-port.ts"

/**
 * The dev server serves the page's source and nothing else.
 *
 * The backend is not mounted here. It is `server.ts`, the same process a built
 * form and a desktop or command-line form run, started alongside this one by
 * `dev.ts`; `/hub` is forwarded to it so the app's own requests stay relative
 * and the same handlers run before and after a build.
 *
 * https://vite.dev/config/
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      /* Everything the hub owns is under one prefix, so one rule covers it. */
      "/hub": { target: `http://127.0.0.1:${DEV_HUB_PORT}` },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
