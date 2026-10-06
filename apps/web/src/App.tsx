import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { AppLayout } from "@/components/app-layout"
import { navItems } from "@/lib/navigation"
import { OverviewPage } from "@/pages/overview"
import { PlaceholderPage } from "@/pages/placeholder"
import { SkillsPage } from "@/pages/skills"

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          {navItems
            .filter((item) => item.path !== "/" && item.path !== "/skills")
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
