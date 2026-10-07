import {
  ActivityIcon,
  BlocksIcon,
  GitBranchIcon,
  LayoutDashboardIcon,
  PlugIcon,
  ServerIcon,
  SettingsIcon,
  ShieldIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import type { NavGroupId } from "@workspace/extensions"
import { useContributions } from "@workspace/extensions/react"

export type NavItem = {
  /** Message key resolved through `ctx.i18n` where the item renders. */
  labelKey: string
  path: string
  icon: LucideIcon
  /**
   * Sort rank inside the group. Built-in entries keep gaps between them (10,
   * 20, 30 …), so a contributed entry can be inserted between two of them.
   */
  order: number
}

export type NavGroup = {
  id: NavGroupId
  labelKey: string
  items: NavItem[]
}

/** Entries the shell ships; extensions add to the same groups through the `nav` point. */
export const navGroups: NavGroup[] = [
  {
    id: "manage",
    labelKey: "nav.group.manage",
    items: [
      { labelKey: "nav.overview", path: "/", icon: LayoutDashboardIcon, order: 10 },
      { labelKey: "nav.mcpServers", path: "/mcp-servers", icon: ServerIcon, order: 20 },
      { labelKey: "nav.plugins", path: "/plugins", icon: PlugIcon, order: 30 },
    ],
  },
  {
    id: "operate",
    labelKey: "nav.group.operate",
    items: [
      { labelKey: "nav.activity", path: "/activity", icon: ActivityIcon, order: 10 },
      { labelKey: "nav.policies", path: "/policies", icon: ShieldIcon, order: 20 },
      { labelKey: "nav.repository", path: "/repository", icon: GitBranchIcon, order: 30 },
      { labelKey: "nav.settings", path: "/settings", icon: SettingsIcon, order: 40 },
      { labelKey: "nav.extensions", path: "/extensions", icon: BlocksIcon, order: 50 },
    ],
  },
]

/** Built-in entries plus the ones extensions contribute, in render order. */
export function useNavGroups(): NavGroup[] {
  const contributed = useContributions("nav")

  return React.useMemo(
    () =>
      navGroups.map((group) => ({
        ...group,
        items: [
          ...group.items,
          ...contributed
            .filter((item) => item.group === group.id)
            .map((item) => ({
              labelKey: item.labelKey,
              path: item.path,
              icon: item.icon,
              order: item.order,
            })),
        ].sort((a, b) => a.order - b.order),
      })),
    [contributed]
  )
}

/** Longest matching route wins, so nested pages keep their section title. */
export function useNavItem(pathname: string): NavItem | undefined {
  const groups = useNavGroups()

  return React.useMemo(
    () =>
      groups
        .flatMap((group) => group.items)
        .filter((item) =>
          item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)
        )
        .sort((a, b) => b.path.length - a.path.length)
        .at(0),
    [groups, pathname]
  )
}
