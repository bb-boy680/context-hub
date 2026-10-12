/**
 * The 配置文件 tab: the file a server is written into, with its lines numbered
 * and the server's own block picked out from the rest. It is a reading surface —
 * copying is the only action, because editing here would fight the form.
 */
import { CopyIcon, FileCodeIcon } from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import type { McpConfigFile } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"

/** The gutter the line numbers occupy, so every line's code starts together. */
const NUMBER_WIDTH = 16

/** One file, rendered as a numbered code block. */
function CodeCard({ file }: { file: McpConfigFile }) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState(false)
  const lines = file.content.split("\n")
  const [from, to] = file.lines ?? [1, 0]

  const copy = () => {
    void navigator.clipboard?.writeText(file.content).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-clip rounded-lg border border-border bg-card">
      <div className="flex h-11 shrink-0 items-center gap-2 px-4">
        <FileCodeIcon className="size-[15px] shrink-0 text-copy" />
        <span className="text-[12.5px] leading-[1.3] font-semibold text-foreground">
          {file.path}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={copy}
          aria-label={t(copied ? "mcp.detail.files.copied" : "mcp.detail.files.copy")}
          className="flex size-7 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
        >
          <CopyIcon className="size-[15px] text-copy" />
        </button>
      </div>
      <div className="h-px shrink-0 bg-border" />
      <div className="min-h-0 flex-1 overflow-auto py-4">
        {lines.map((line, index) => {
          const number = index + 1
          /* The server's own block reads apart from the file it sits in. */
          const own = number >= from && number <= to
          return (
            <div key={number} className="flex h-[22px] items-center gap-3 px-5">
              <span
                className="shrink-0 text-right font-mono text-[11px] leading-none text-muted-soft"
                style={{ width: NUMBER_WIDTH }}
              >
                {number}
              </span>
              <span
                className={cn(
                  "whitespace-pre font-mono text-[12px] leading-none",
                  own ? "text-copy" : "text-foreground"
                )}
              >
                {line}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The configuration files pane: one card per file that holds the server. */
export function FilesPane({ files }: { files: McpConfigFile[] }) {
  const { t } = useI18n()

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-border bg-card p-5">
        <span className="text-[12.5px] leading-[1.5] text-muted-foreground">
          {t("mcp.detail.files.empty")}
        </span>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {files.map((file) => (
        <CodeCard key={file.place} file={file} />
      ))}
    </div>
  )
}
