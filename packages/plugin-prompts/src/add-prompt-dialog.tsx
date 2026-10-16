/**
 * The dialog a new prompt is written in: its name, its text, and the categories
 * it belongs to.
 *
 * The dialog holds the draft and hands it over whole; whether it is recorded is
 * the page's business, because the library lives there. That is also why the
 * dialog only closes when the page says so — a refused add leaves everything
 * typed still in place, rather than throwing the prompt away.
 */
import * as React from "react"

import { TagEditor, type TagEditorWords } from "@workspace/extensions/components"
import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Textarea } from "@workspace/ui/components/textarea"

import type { PromptDraft } from "./store.ts"

/** The line under a field a submit found empty. */
const ERROR = "text-[12px] leading-[1.3] text-destructive"

/** One labelled block of the form, matching the MCP dialog's own sections. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11.5px] leading-[1.3] font-semibold tracking-[0.6px] text-muted-soft">
        {label}
      </span>
      {children}
    </div>
  )
}

/** The empty draft, so opening the dialog never reuses the last one. */
const EMPTY = { description: "", prompt: "", tags: [] as string[] }

/**
 * Draw the form.
 *
 * A prompt has no title: what it is called is its description, and the
 * description is also what a delivered file is named after — so the field is
 * required, and the hint says what it is for rather than calling it a name.
 *
 * @param open — whether it is on screen.
 * @param suggestions — categories already in use, offered beside the field.
 * @param busy — a write is in flight.
 * @param onOpenChange — the dialog asking to open or close.
 * @param onSubmit — the finished draft.
 */
export function AddPromptDialog({
  open,
  suggestions,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  suggestions: readonly string[]
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: PromptDraft) => void
}) {
  const { t } = useI18n()
  const [description, setDescription] = React.useState(EMPTY.description)
  const [prompt, setPrompt] = React.useState(EMPTY.prompt)
  const [tags, setTags] = React.useState<string[]>(EMPTY.tags)
  /* What stopped the last attempt, shown under the field it belongs to. */
  const [problem, setProblem] = React.useState<"description" | "prompt" | null>(null)

  /* A dialog that opens fresh: the draft from last time is never the one
     someone meant to submit, and the description it carried may be taken. */
  const close = () => {
    setDescription(EMPTY.description)
    setPrompt(EMPTY.prompt)
    setTags(EMPTY.tags)
    setProblem(null)
    onOpenChange(false)
  }

  const words: TagEditorWords = {
    add: t("prompts.add.addTag"),
    placeholder: t("prompts.add.tagPlaceholder"),
    remove: t("prompts.add.removeTag"),
  }

  const submit = () => {
    if (description.trim() === "") {
      setProblem("description")
      return
    }
    if (prompt.trim() === "") {
      setProblem("prompt")
      return
    }
    onSubmit({ description: description.trim(), prompt, tags })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true)
        else close()
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("prompts.add.title")}</DialogTitle>
          <DialogDescription>{t("prompts.add.hint")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-[18px]">
          <Section label={t("prompts.add.description")}>
            <input
              value={description}
              autoFocus
              placeholder={t("prompts.add.descriptionPlaceholder")}
              aria-invalid={problem === "description" || undefined}
              onChange={(event) => {
                setDescription(event.target.value)
                setProblem(null)
              }}
              className="h-10 min-w-0 grow rounded-md border border-border px-3 text-[12.5px] leading-[1.3] text-foreground outline-none placeholder:text-muted-soft focus:border-ring aria-invalid:border-destructive"
            />
            {problem === "description" ? (
              <span className={ERROR}>{t("prompts.add.needDescription")}</span>
            ) : null}
          </Section>

          <Section label={t("prompts.add.prompt")}>
            <Textarea
              value={prompt}
              placeholder={t("prompts.add.promptPlaceholder")}
              aria-invalid={problem === "prompt" || undefined}
              onChange={(event) => {
                setPrompt(event.target.value)
                setProblem(null)
              }}
              className="min-h-[164px] resize-none rounded-md border-border px-3 py-2.5 font-mono text-[12.5px] leading-[1.5] placeholder:text-muted-soft focus-visible:border-ring focus-visible:ring-0 md:text-[12.5px]"
            />
            {problem === "prompt" ? (
              <span className={ERROR}>{t("prompts.add.needPrompt")}</span>
            ) : null}
          </Section>

          <Section label={t("prompts.add.tags")}>
            <TagEditor tags={tags} suggestions={suggestions} words={words} onChange={setTags} />
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("prompts.add.cancel")}
          </Button>
          <Button disabled={busy} onClick={submit}>
            {t("prompts.add.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
