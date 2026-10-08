import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { assetLibrary, folderBrowser, pluginFiles, stateStore, workspaceList } from "@workspace/core/vite"
import { skillLibrary } from "@workspace/plugin-skills/vite"
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
    pluginFiles(),
    workspaceList(),
    folderBrowser(),
    skillLibrary(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
