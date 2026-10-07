import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { AppLayout } from "@/components/app-layout"
import { useNavGroups } from "@/lib/navigation"
import { ExtensionsPage } from "@/pages/extensions"
import { McpServersPage } from "@/pages/mcp-servers"
import { OverviewPage } from "@/pages/overview"
import { PlaceholderPage } from "@/pages/placeholder"
import { PluginsPage } from "@/pages/plugins"
import { RepositoryPage } from "@/pages/repository"
import { useContributions } from "@workspace/extensions/react"

/** Pages the shell owns; every other route comes from an extension. */
const designedPaths = [
  "/",
  "/mcp-servers",
  "/plugins",
  "/extensions",
  "/repository",
]

export function App() {
  const contributed = useContributions("route")
  const paths = useNavGroups().flatMap((group) =>
    group.items.map((item) => item.path)
  )
  const designed = [...designedPaths, ...contributed.map((route) => route.path)]

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="/mcp-servers" element={<McpServersPage />} />
          <Route path="/plugins" element={<PluginsPage />} />
          <Route path="/extensions" element={<ExtensionsPage />} />
          <Route path="/repository" element={<RepositoryPage />} />
          {contributed.map((route) => {
            const Page = route.Component
            return (
              <Route key={route.path} path={route.path} element={<Page />} />
            )
          })}
          {paths
            .filter((path) => !designed.includes(path))
            .map((path) => (
              <Route key={path} path={path} element={<PlaceholderPage />} />
            ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
