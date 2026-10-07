import {
  ActivityIcon,
  BlocksIcon,
  GitBranchIcon,
  LayoutDashboardIcon,
  PlugIcon,
  ServerIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  /** Message key resolved through `ctx.i18n` where the item renders. */
  labelKey: string
  path: string
  icon: LucideIcon
}

export type NavGroup = {
  labelKey: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    labelKey: "nav.group.manage",
    items: [
      { labelKey: "nav.overview", path: "/", icon: LayoutDashboardIcon },
      { labelKey: "nav.skills", path: "/skills", icon: SparklesIcon },
      { labelKey: "nav.mcpServers", path: "/mcp-servers", icon: ServerIcon },
      { labelKey: "nav.plugins", path: "/plugins", icon: PlugIcon },
    ],
  },
  {
    labelKey: "nav.group.operate",
    items: [
      { labelKey: "nav.activity", path: "/activity", icon: ActivityIcon },
      { labelKey: "nav.policies", path: "/policies", icon: ShieldIcon },
      { labelKey: "nav.repository", path: "/repository", icon: GitBranchIcon },
      { labelKey: "nav.settings", path: "/settings", icon: SettingsIcon },
      { labelKey: "nav.extensions", path: "/extensions", icon: BlocksIcon },
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
