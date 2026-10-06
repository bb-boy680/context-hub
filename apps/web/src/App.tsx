import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { AppLayout } from "@/components/app-layout"
import { navItems } from "@/lib/navigation"
import { McpServersPage } from "@/pages/mcp-servers"
import { OverviewPage } from "@/pages/overview"
import { PlaceholderPage } from "@/pages/placeholder"
import { PluginsPage } from "@/pages/plugins"
import { SkillsPage } from "@/pages/skills"

const designedPaths = ["/", "/skills", "/mcp-servers", "/plugins"]

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/mcp-servers" element={<McpServersPage />} />
          <Route path="/plugins" element={<PluginsPage />} />
          {navItems
            .filter((item) => !designedPaths.includes(item.path))
            .map((item) => (
              <Route
                key={item.path}
                path={item.path}
                element={<PlaceholderPage />}
              />
            ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
