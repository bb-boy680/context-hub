import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import {
  assetLibrary,
  extensionFiles,
  netProxy,
  placeFiles,
  stateStore,
  workspaceList,
} from "@workspace/core/vite"
import { skillLibrary } from "@workspace/plugin-skills/vite"
import { mcpProbe } from "@workspace/plugin-mcp/vite"
import { pluginLibrary } from "@workspace/plugin-plugins/vite"
import { promptLibrary } from "@workspace/plugin-prompts/vite"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  /* The dev server also serves the hub's own directory, so the browser form
     works against real files while the product forms mount their own host. */
  plugins: [
    react(),
    tailwindcss(),
    assetLibrary(),
    stateStore(),
    extensionFiles(),
    workspaceList(),
    netProxy(),
    skillLibrary(),
    placeFiles(),
    mcpProbe(),
    pluginLibrary(),
    promptLibrary(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
