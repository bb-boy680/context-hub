/**
 * One prompt, read in full.
 *
 * The card shows a prompt's opening and nothing else — a cover is a preview,
 * and a prompt longer than seven lines runs past it. This is where the whole
 * text is, together with the categories it carries and the same delivery menu
 * the card offers, so one prompt can be read and sent from one place.
 *
 * It holds no copy of the prompt: the row it was opened from is the value it is
 * given, so what the library holds is what is on screen.
 */
import * as React from "react"

import type { PlaceFiles } from "@workspace/core/place-files"
import { useI18n } from "@workspace/extensions/react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import type { Delivery } from "./deliver.ts"
import { PromptActions } from "./install-menu.tsx"
import { tokenLabel, useInstalled } from "./library.ts"
import type { PromptPlace } from "./provider.ts"
import type { StoredPrompt } from "./store.ts"

/**
 * Draw the panel.
 *
 * @param prompt — the row it was opened from, or `null` while it is closed.
 * @param places — every agent place a delivery can go to.
 * @param files — the form's client-file port.
 * @param busy — a write is in flight.
 * @param stamp — changes whenever a delivery may have happened elsewhere.
 * @param onOpenChange — closing it.
 * @param onToggle — install into a place, or take it back out of one.
 * @param onGenerate — write one of the three derived forms into a place.
 * @param onDelete — remove the prompt from the library.
 */
export function PromptDetailDialog({
  prompt,
  places,
  files,
  busy,
  stamp,
  onOpenChange,
  onToggle,
  onGenerate,
  onDelete,
}: {
  prompt: StoredPrompt | null
  places: readonly PromptPlace[]
  files: PlaceFiles | null
  busy: boolean
  stamp: number
  onOpenChange: (open: boolean) => void
  onToggle: (prompt: StoredPrompt, place: PromptPlace) => void
  onGenerate: (prompt: StoredPrompt, place: PromptPlace, action: Delivery) => void
  onDelete: (prompt: StoredPrompt) => void
}) {
  const { t } = useI18n()
  const [own, setOwn] = React.useState(0)
  /* A delivery made from here changes where the prompt is, so it is counted
     beside the ones the page reports. */
  const installed = useInstalled(prompt, places, files, stamp + own)

  return (
    <Dialog open={prompt !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px]">
        {prompt === null ? null : (
          <>
            <div className="flex flex-col gap-1.5 pr-8">
              <DialogTitle className="font-mono text-[17px] leading-[22px]">
                {prompt.description}
              </DialogTitle>
              <DialogDescription>
                {t("prompts.detail.tokens").replace("{tokens}", tokenLabel(prompt.prompt))}
              </DialogDescription>
            </div>

            {prompt.tags.length === 0 ? null : (
              <div className="flex flex-wrap items-center gap-1.5">
                {prompt.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex h-[22px] items-center rounded-full bg-secondary px-[9px] text-[12px] leading-[15px] font-medium text-copy"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <pre className="max-h-[46vh] overflow-auto rounded-lg bg-surface-raised p-4 font-mono text-[12.5px] leading-[1.6] whitespace-pre-wrap text-copy">
              {prompt.prompt}
            </pre>

            <div className="flex items-center justify-between gap-3">
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="outline"
                      disabled={busy}
                      className="h-9 rounded-full border-border bg-transparent px-4 text-destructive dark:border-input dark:bg-transparent"
                    />
                  }
                >
                  {t("prompts.action.delete")}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("prompts.delete.title").replace("{name}", prompt.description)}
                    </AlertDialogTitle>
                    <AlertDialogDescription>{t("prompts.delete.text")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("prompts.add.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(prompt)}>
                      {t("prompts.delete.confirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <PromptActions
                prompt={prompt}
                places={places}
                installed={installed}
                files={files}
                busy={busy}
                onToggle={(place) => {
                  onToggle(prompt, place)
                  setOwn((current) => current + 1)
                }}
                onGenerate={(place, action) => {
                  onGenerate(prompt, place, action)
                  setOwn((current) => current + 1)
                }}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
