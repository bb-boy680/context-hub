/**
 * The header control that opens the global search.
 *
 * The control is a header contribution, so the shell knows nothing about it: the
 * button and the Ctrl+K listener appear and disappear with this package. The
 * dialog itself is mounted here and controlled, which is why the shortcut can
 * close a palette already open.
 */
import { SearchIcon } from "lucide-react"
import * as React from "react"

import { useI18n } from "@context-hub/extensions/react"
import { Kbd } from "@context-hub/shadcn-ui/components/kbd"

import { GlobalSearchDialog } from "./dialog.tsx"

export function GlobalSearchButton() {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return
      event.preventDefault()
      setOpen((current) => !current)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-11 w-[280px] shrink-0 items-center gap-2 rounded-full bg-secondary px-5 text-[length:var(--text-body)] text-muted-foreground transition-colors hover:text-foreground lg:flex"
      >
        <SearchIcon className="size-[15px]" />
        <span>{t("header.search")}</span>
        <Kbd className="ml-auto border-0 bg-transparent">Ctrl K</Kbd>
      </button>
      {open ? <GlobalSearchDialog open onOpenChange={setOpen} /> : null}
    </>
  )
}
