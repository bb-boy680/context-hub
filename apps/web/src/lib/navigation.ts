import {
  ActivityIcon,
  GitBranchIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  PlugIcon,
  ServerIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  title: string
  path: string
  icon: LucideIcon
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: "Manage",
    items: [
      { title: "Overview", path: "/", icon: LayoutDashboardIcon },
      { title: "Skills", path: "/skills", icon: SparklesIcon },
      { title: "MCP Servers", path: "/mcp-servers", icon: ServerIcon },
      { title: "Plugins", path: "/plugins", icon: PlugIcon },
      { title: "Marketplace", path: "/marketplace", icon: LibraryIcon },
    ],
  },
  {
    label: "Operate",
    items: [
      { title: "Activity", path: "/activity", icon: ActivityIcon },
      { title: "Policies", path: "/policies", icon: ShieldIcon },
      { title: "Repository", path: "/repository", icon: GitBranchIcon },
      { title: "Settings", path: "/settings", icon: SettingsIcon },
    ],
  },
]

export const navItems: NavItem[] = navGroups.flatMap((group) => group.items)

/** Longest matching route wins, so nested pages keep their section title. */
export function findNavItem(pathname: string): NavItem | undefined {
  return navItems
    .filter((item) =>
      item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)
    )
    .sort((a, b) => b.path.length - a.path.length)
    .at(0)
}
