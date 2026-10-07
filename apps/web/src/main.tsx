import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@workspace/ui/globals.css"
import { HubProvider } from "@workspace/extensions/react"
import { App } from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { startHub } from "@/lib/hub.ts"

const container = document.getElementById("root")!

startHub()
  .then((kernel) => {
    createRoot(container).render(
      <StrictMode>
        <ThemeProvider>
          <HubProvider ctx={kernel.ctx}>
            <App />
          </HubProvider>
        </ThemeProvider>
      </StrictMode>
    )
  })
  .catch((error: unknown) => {
    container.textContent = `Context Hub failed to start: ${String(error)}`
  })
