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

import { CodeEditor, TagEditor, type TagEditorWords } from "@workspace/extensions/components"
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
const EMPTY = { name: "", description: "", prompt: "", tags: [] as string[] }

/**
 * Draw the form.
 *
 * A prompt has two words about itself and they do different jobs: the title is
 * what a delivered file is named after, so it has to stay short enough to read
 * in an agent's command list, while the description is a sentence and is meant
 * to run on. Both are required — a card draws the title over the description,
 * and a row with neither would have nothing to be looked up by.
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
  const [name, setName] = React.useState(EMPTY.name)
  const [description, setDescription] = React.useState(EMPTY.description)
  const [prompt, setPrompt] = React.useState(EMPTY.prompt)
  const [tags, setTags] = React.useState<string[]>(EMPTY.tags)
  /* What stopped the last attempt, shown under the field it belongs to. */
  const [problem, setProblem] = React.useState<"name" | "description" | "prompt" | null>(null)

  /* A dialog that opens fresh: the draft from last time is never the one
     someone meant to submit, and the title it carried may be taken. */
  const close = () => {
    setName(EMPTY.name)
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
    if (name.trim() === "") {
      setProblem("name")
      return
    }
    if (description.trim() === "") {
      setProblem("description")
      return
    }
    if (prompt.trim() === "") {
      setProblem("prompt")
      return
    }
    onSubmit({ name: name.trim(), description: description.trim(), prompt, tags })
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
          <Section label={t("prompts.add.name")}>
            <input
              value={name}
              autoFocus
              placeholder={t("prompts.add.namePlaceholder")}
              aria-invalid={problem === "name" || undefined}
              onChange={(event) => {
                setName(event.target.value)
                setProblem(null)
              }}
              className="h-10 min-w-0 grow rounded-md border border-border px-3 text-[12.5px] leading-[1.3] text-foreground outline-none placeholder:text-muted-soft focus:border-ring aria-invalid:border-destructive"
            />
            {problem === "name" ? (
              <span className={ERROR}>{t("prompts.add.needName")}</span>
            ) : null}
          </Section>

          <Section label={t("prompts.add.description")}>
            <input
              value={description}
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
            {/* The same editor the detail panel edits a prompt in, so a prompt
                is written and read in one typeface with its markdown coloured.
                It fills the height it is given rather than growing, which is
                why this one is fixed and the field above is not. */}
            <CodeEditor
              text={prompt}
              onChange={(next) => {
                setPrompt(next)
                setProblem(null)
              }}
              language="markdown"
              label={t("prompts.add.prompt")}
              className="h-[200px] rounded-md border border-border"
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
