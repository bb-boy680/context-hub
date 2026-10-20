/**
 * The page's half of the desktop title-bar menu.
 *
 * It draws nothing: the menu bar and popup live in the Electron shell. This
 * component listens for the rows that need the page's services and carries
 * them out, so the shell never has to know how the hub stores its libraries.
 */
import * as React from "react"
import { useNavigate } from "react-router"

import { OFFICIAL_MARKET_URL } from "@context-hub/extensions"
import { useHub, useI18n } from "@context-hub/extensions/react"
import { toast } from "@context-hub/shadcn-ui/components/toast"

import { runAppMenuAction, type AppMenuActions } from "@/lib/app-menu"
import { desktopBridge, type DesktopMenuAction } from "@/lib/desktop"
import { refreshExtensionMarket } from "@/lib/extension-market"

export function DesktopMenuActions() {
  const { t, state } = useI18n()
  const ctx = useHub()
  const navigate = useNavigate()

  /* The shell's menu bar and tray follow the page language; `lang` is also
     what the browser and assistive technology read. */
  React.useEffect(() => {
    const zh = state.active.toLowerCase().includes("zh")
    document.documentElement.lang = zh ? "zh-CN" : "en"
    desktopBridge()?.setLanguage(zh)
  }, [state.active])

  /* `get`'s answer depends on the module augmentation being visible; narrow it
     to the one method the menu uses, as the settings page does. */
  const skills = ctx.get("catalog.skills") as
    | { reload?: () => Promise<void> }
    | undefined
  const plugins = ctx.get("catalog.plugins") as
    | { reload?: () => Promise<void> }
    | undefined

  const actions = React.useMemo<AppMenuActions>(
    () => ({
      about: () => navigate("/settings#about"),
      reloadResources: () =>
        Promise.all([skills?.reload?.(), plugins?.reload?.()]).then(
          () => undefined
        ),
      refreshPlugins: () =>
        refreshExtensionMarket(OFFICIAL_MARKET_URL).then(() => undefined),
    }),
    [navigate, skills, plugins]
  )

  const report = React.useCallback(
    (work: void | Promise<void>, done: string, failed: string): void => {
      if (work === undefined) return
      void work.then(
        () => toast.add({ type: "success", title: t(done) }),
        (error: unknown) =>
          toast.add({
            type: "error",
            title: t(failed).replace(
              "{reason}",
              error instanceof Error ? error.message : String(error)
            ),
          })
      )
    },
    [t]
  )

  React.useEffect(() => {
    const bridge = desktopBridge()
    if (bridge === undefined) return
    return bridge.onMenuAction((action: DesktopMenuAction) => {
      const work = runAppMenuAction(action, actions)
      if (action === "reload-resources") {
        report(work, "menu.reload.done", "menu.reload.failed")
      } else if (action === "refresh-plugins") {
        report(
          work,
          "menu.refreshPlugins.done",
          "menu.refreshPlugins.failed"
        )
      }
    })
  }, [actions, report])

  return null
}
