/**
 * The add-server dialog: the shared server form in a dialog of its own, opened
 * on the transport the caller asked for. The dialog owns the values and hands
 * them on as a draft, so the page decides what recording one means.
 *
 * The test button proves the form's declaration without recording anything:
 * a draft has no name, so its answer is shown here and kept nowhere.
 */
import { PlugZapIcon, XIcon } from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import { mcpFailure } from "./contract.ts"
import { failureText } from "./library.ts"
import type { McpProbeReport } from "./probe.ts"
import {
  ServerForm,
  declarationOf,
  formErrors,
  type ServerFormErrors,
  type ServerFormValues,
  type ServerRecordValues,
} from "./server-form.tsx"
import type { McpDeclaration, McpDraft } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@workspace/ui/components/dialog"

/** What a new server starts from: every field empty, so nothing is written by accident. */
const NEW_SERVER: ServerFormValues = {
  name: "",
  transport: "stdio",
  command: "",
  args: "",
  url: "",
  pairs: [{ name: "", value: "" }],
}

/** What a new record starts with: nothing said about itself yet. */
const NEW_RECORD: ServerRecordValues = { description: "", tags: [] }

/** The dialog that adds one server. */
export function AddServerDialog({
  remote = false,
  busy = false,
  canProbe = false,
  tagSuggestions = [],
  onTest,
  onSubmit,
  onClose,
}: {
  /** Open the form on a remote transport rather than the stdio template. */
  remote?: boolean
  busy?: boolean
  /** Whether this form can run a probe at all. */
  canProbe?: boolean
  /** Every type the servers carry, for the editor's quick picks. */
  tagSuggestions?: readonly string[]
  /** Prove one declaration without recording it. */
  onTest: (declaration: McpDeclaration) => Promise<McpProbeReport>
  /** Record the draft; a thrown error keeps the dialog open with its reason. */
  onSubmit: (draft: McpDraft) => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const [values, setValues] = React.useState<ServerFormValues>(() =>
    remote ? { ...NEW_SERVER, transport: "sse" } : NEW_SERVER
  )
  const [record, setRecord] = React.useState<ServerRecordValues>(NEW_RECORD)
  const [errors, setErrors] = React.useState<ServerFormErrors | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [testing, setTesting] = React.useState(false)
  const [probe, setProbe] = React.useState<McpProbeReport | null>(null)

  /* A message marks a field until that field is filled, so the two follow every
     edit rather than waiting for the next click. */
  const change = (next: ServerFormValues) => {
    setValues(next)
    if (errors !== null) setErrors(formErrors(next, t))
  }

  const test = () => {
    setProbe(null)
    const missing = formErrors(values, t)
    if (missing !== null) {
      setErrors(missing)
      setFailure(null)
      return
    }
    setErrors(null)
    setFailure(null)
    setTesting(true)
    void onTest(declarationOf(values))
      .then(setProbe)
      .catch((error: unknown) => {
        setFailure(failureText(t, mcpFailure(error, "mcp.error.probe")))
      })
      .finally(() => setTesting(false))
  }

  const submit = () => {
    const missing = formErrors(values, t)
    if (missing !== null) {
      setErrors(missing)
      setFailure(null)
      return
    }
    setErrors(null)
    setFailure(null)
    void onSubmit({
      name: values.name.trim(),
      declaration: declarationOf(values),
      description: record.description.trim(),
      tags: record.tags,
    })
      .then(onClose)
      .catch((error: unknown) => {
        /* The dialog keeps what was typed: its reason is why it is still open. */
        setFailure(error instanceof Error ? error.message : String(error))
      })
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        /* Clears the component's own `sm:max-w-sm`, which would otherwise clamp
           the width below what the form needs. */
        style={{ maxWidth: "none" }}
        className="w-[min(640px,calc(100vw-2rem))] gap-0 overflow-clip rounded-xl border border-border bg-card p-0 ring-0"
      >
        <DialogTitle className="sr-only">{t("mcp.action.addServer")}</DialogTitle>

        <div className="relative flex h-24 shrink-0 flex-col gap-1.5 px-6 py-5">
          <h2 className="text-[17px] leading-[1.3] font-semibold text-foreground">
            {t("mcp.action.addServer")}
          </h2>
          <p className="max-w-[200px] text-[13px] leading-[1.5] text-copy">
            {t(remote ? "mcp.add.desc.remote" : "mcp.add.desc.stdio")}
          </p>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-5 right-6 size-8 rounded-full"
                aria-label={t("mcp.detail.action.close")}
              />
            }
          >
            <XIcon className="size-4 text-copy" />
          </DialogClose>
        </div>

        <div className="h-px shrink-0 bg-border" />

        <div className="px-6 py-5">
          <ServerForm
            values={values}
            onChange={change}
            notice={t("mcp.form.notice")}
            errors={errors}
            record={record}
            onRecord={setRecord}
            tagSuggestions={tagSuggestions}
          />
          {failure === null ? null : (
            <p className="pt-3 text-[12.5px] leading-[1.4] text-destructive">{failure}</p>
          )}
          {probe === null ? null : (
            <p
              className={cn(
                "pt-3 text-[12.5px] leading-[1.4]",
                probe.ok ? "text-copy" : "text-destructive"
              )}
            >
              {probe.ok
                ? t("mcp.check.ok").replace("{ms}", String(probe.ms))
                : failureText(t, {
                    key: `mcp.check.error.${probe.error?.kind ?? "unknown"}`,
                    params: probe.error?.params,
                  })}
            </p>
          )}
        </div>

        <div className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-t border-border px-6">
          <span className="max-w-[240px] text-[12.5px] leading-[1.3] text-muted-foreground">
            {t(remote ? "mcp.add.hint.remote" : "mcp.add.hint.stdio")}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              className="h-9 rounded-full px-4 text-[13px] font-medium"
              onClick={onClose}
            >
              {t("mcp.add.cancel")}
            </Button>
            <Button
              variant="outline"
              onClick={test}
              disabled={testing || !canProbe}
              className="h-9 gap-2 rounded-full px-4 text-[13px] font-medium"
            >
              <PlugZapIcon className={cn("size-[15px]", testing && "animate-spin")} />
              {t(testing ? "mcp.action.connecting" : "mcp.action.testConnection")}
            </Button>
            <Button
              onClick={submit}
              disabled={busy}
              className="h-9 rounded-full px-4 text-[13px] font-medium"
            >
              {t("mcp.add.submit")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
