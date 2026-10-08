/**
 * The folder a person walks to, one level at a time. A page cannot read a
 * directory itself, so every step asks the hub's own process for a listing and
 * reports the folder the person stopped on; the path is the only thing that
 * travels back, which is what makes it usable as a workspace.
 */
import { ArrowUpIcon, ChevronRightIcon, FolderIcon, XIcon } from "lucide-react"
import * as React from "react"

import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import type { DirectoryListing } from "@workspace/core/fs-browse"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { listFolders } from "@/lib/fs"

/** A failure explained for the dialog. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * One folder the dialog walked to, and the trail that leads there.
 * `path` is `undefined` until the person goes anywhere: that asks the hub for
 * the folder it starts at, which is the person's home.
 *
 * A read that answered for another folder is not this folder's answer, so the
 * listing and the failure both carry the path they belong to.
 */
function useListing(path: string | undefined) {
  const [loaded, setLoaded] = React.useState<{
    path: string | undefined
    listing: DirectoryListing
  } | null>(null)
  const [failed, setFailed] = React.useState<{
    path: string | undefined
    message: string
  } | null>(null)

  React.useEffect(() => {
    let live = true
    listFolders(path)
      .then((listing) => {
        if (live) setLoaded({ path, listing })
      })
      .catch((error: unknown) => {
        if (live) setFailed({ path, message: reasonOf(error) })
      })
    return () => {
      live = false
    }
  }, [path])

  const listing = loaded !== null && loaded.path === path ? loaded.listing : null
  const error = failed !== null && failed.path === path ? failed.message : null
  return { listing, error, reading: listing === null && error === null }
}

/** The trail above the listing: one step per folder on the way down. */
function Crumbs({
  listing,
  onGo,
}: {
  listing: DirectoryListing
  onGo: (path: string) => void
}) {
  return (
    <div className="flex h-8 items-center gap-0.5 overflow-x-auto px-6">
      {listing.crumbs.map((crumb, index) => (
        <React.Fragment key={crumb.path}>
          {index === 0 ? null : (
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <button
            type="button"
            onClick={() => onGo(crumb.path)}
            className={cn(
              "shrink-0 cursor-pointer rounded-md px-1.5 py-1 text-[12.5px] leading-[15px] transition-colors",
              index === listing.crumbs.length - 1
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {crumb.name}
          </button>
        </React.Fragment>
      ))}
    </div>
  )
}

/**
 * The walk itself, mounted only while the dialog is open: every open starts
 * where the hub starts, which is the person's home, not where the last one
 * ended.
 */
function FolderWalk({
  onOpenChange,
  onPicked,
}: {
  onOpenChange: (open: boolean) => void
  onPicked: (path: string) => Promise<string | null>
}) {
  const { t } = useI18n()
  const [path, setPath] = React.useState<string | undefined>(undefined)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [picking, setPicking] = React.useState(false)
  const { listing, error, reading } = useListing(path)

  const confirm = async () => {
    if (listing === null) return
    setPicking(true)
    try {
      const refusal = await onPicked(listing.path)
      setFailure(refusal)
      if (refusal === null) onOpenChange(false)
    } catch (error) {
      setFailure(reasonOf(error))
    } finally {
      setPicking(false)
    }
  }

  return (
    <DialogContent
      showCloseButton={false}
      className="gap-0 rounded-lg bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-[560px]"
    >
      <div className="flex items-start gap-4 px-6 pt-[22px] pb-3">
        <div className="flex flex-col gap-[5px]">
          <DialogTitle className="text-base leading-[19px] font-semibold">
            {t("workspace.picker.title")}
          </DialogTitle>
          <DialogDescription className="text-sm leading-[17px]">
            {t("workspace.picker.description")}
          </DialogDescription>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto shrink-0"
          aria-label={t("workspace.picker.cancel")}
          onClick={() => onOpenChange(false)}
        >
          <XIcon className="text-muted-foreground" />
        </Button>
      </div>

      {listing === null ? null : <Crumbs listing={listing} onGo={setPath} />}

      <div className="mt-2 flex max-h-[300px] flex-col gap-0.5 overflow-y-auto px-2 pb-2">
        {error !== null ? (
          <span className="px-3 py-2 text-xs leading-[15px] text-destructive">{error}</span>
        ) : listing === null ? (
          <span className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <Spinner />
            {t("workspace.picker.reading")}
          </span>
        ) : (
          <>
            {listing.parent === null ? null : (
              <button
                type="button"
                onClick={() => setPath(listing.parent ?? undefined)}
                className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-left hover:bg-muted"
              >
                <ArrowUpIcon className="size-4 text-muted-foreground" />
                <span className="truncate text-[13px] leading-[17px] text-muted-foreground">
                  {t("workspace.picker.up")}
                </span>
              </button>
            )}
            {listing.entries.length === 0 ? (
              <span className="px-3 py-2 text-xs leading-[15px] text-muted-foreground">
                {t("workspace.picker.empty")}
              </span>
            ) : (
              listing.entries.map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  onClick={() => setPath(entry.path)}
                  className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-left hover:bg-muted"
                >
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-[13px] leading-[17px]">{entry.name}</span>
                  {entry.link === undefined ? null : (
                    <span className="ml-auto shrink-0 text-[11px] leading-[14px] text-muted-foreground">
                      {t("workspace.picker.link")}
                    </span>
                  )}
                </button>
              ))
            )}
            {listing.truncated ? (
              <span className="px-3 py-1 text-[11px] leading-[14px] text-muted-foreground">
                {t("workspace.picker.truncated")}
              </span>
            ) : null}
          </>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-border px-6 py-4">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-[14px] text-muted-foreground">
          {listing?.display ?? ""}
        </span>
        {failure === null ? null : (
          <span className="max-w-[220px] shrink-0 truncate text-xs leading-[15px] text-destructive">
            {failure}
          </span>
        )}
        <Button
          variant="outline"
          className="shrink-0 border-border bg-transparent dark:border-input dark:bg-transparent"
          onClick={() => onOpenChange(false)}
        >
          {t("workspace.picker.cancel")}
        </Button>
        <Button
          className="shrink-0"
          disabled={listing === null || reading || picking}
          onClick={() => void confirm()}
        >
          {t("workspace.picker.select")}
        </Button>
      </div>
    </DialogContent>
  )
}

/** The folder a person walks to, one level at a time. */
export function FolderPickerDialog({
  open,
  onOpenChange,
  onPicked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Report the folder that was chosen; a reason keeps the dialog open. */
  onPicked: (path: string) => Promise<string | null>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <FolderWalk onOpenChange={onOpenChange} onPicked={onPicked} /> : null}
    </Dialog>
  )
}
