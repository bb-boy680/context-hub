import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { useTheme } from "@/components/theme-provider"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <Button
      variant="outline"
      size="icon"
      className="border-input bg-transparent dark:bg-transparent"
      aria-label={isDark ? "切换到浅色主题" : "切换到暗黑主题"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
