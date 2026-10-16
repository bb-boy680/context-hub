/**
 * One file's text with syntax colours, rendered by shiki: the grammars and
 * themes of that library produce the HTML, and the panel only styles it. A
 * file in a language no grammar covers renders as plain text.
 * * {@link CodeCard} is the same view with the header a file reads under, so a
 * screen that shows a whole file uses that one and a screen that shows code
 * inside its own frame uses this one.
 * * The highlighter is the shared one, built once per session and carrying only
 * the languages these screens show — the same one a document's fenced blocks are
 * coloured with. Loading it is asynchronous, so the text shows at once and the
 * colours arrive after.
 */
import { CheckIcon, CopyIcon, FileTextIcon } from "lucide-react"
import * as React from "react"

import { paint } from "@workspace/ui/lib/highlight"

/** Extensions a shown file uses, and the grammar that colours each one. */
const GRAMMARS: Record<string, string> = {
  bash: "bash",
  cjs: "javascript",
  css: "css",
  html: "html",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  markdown: "markdown",
  mjs: "javascript",
  py: "python",
  sh: "bash",
  toml: "toml",
  ts: "typescript",
  tsx: "typescript",
  yaml: "yaml",
  yml: "yaml",
}

/** Shiki's own choice for text: no grammar, no colours. */
const PLAIN = "text"

/** The grammar for one path, by its file extension. */
function grammarOf(path: string): string {
  const name = path.split("/").at(-1) ?? path
  const dot = name.lastIndexOf(".")
  if (dot < 0) return PLAIN
  return GRAMMARS[name.slice(dot + 1).toLowerCase()] ?? PLAIN
}

/** How long the card's copy button wears its confirmation before it offers again. */
const COPIED_MS = 3000

/** What the card's own controls say, in the language the screen is showing. */
export interface CodeCardWords {
  /** The copy button's label while it offers a copy. */
  copy: string
  /** The copy button's label once the copy landed. */
  copied: string
}

/**
 * Draw one file's text with syntax colours.
 *
 * @param text — the file's text, as read.
 * @param path — the path that names it, which decides the grammar.
 */
export function CodeView({ text, path }: { text: string; path: string }) {
  /* The markup is kept with the input it was rendered from, so a file that
     changes underneath is highlighted again rather than left stale. */
  const [rendered, setRendered] = React.useState<{
    path: string
    text: string
    html: string
  } | null>(null)

  React.useEffect(() => {
    let live = true
    void paint(text, grammarOf(path), "classic").then((html) => {
      if (live && html !== null) setRendered({ path, text, html })
    })
    return () => {
      live = false
    }
  }, [text, path])

  const html =
    rendered !== null && rendered.path === path && rendered.text === text ? rendered.html : null

  if (html === null) {
    return (
      <pre className="file-code px-3.5 py-3 font-mono text-[11.5px] leading-5 text-secondary-foreground">
        {text}
      </pre>
    )
  }
  /* Shiki escapes the text it wraps and colours it with its own spans. */
  return <div className="file-code" dangerouslySetInnerHTML={{ __html: html }} />
}

/** The copy control: an offer, then what came of it. */
function CopyButton({ content, words }: { content: string; words: CodeCardWords }) {
  const [copied, setCopied] = React.useState(false)

  const copy = () => {
    void navigator.clipboard?.writeText(content).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPIED_MS)
    })
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? words.copied : words.copy}
      className="flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-muted"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-primary" />
      ) : (
        <CopyIcon className="size-3.5 text-muted-foreground" />
      )}
    </button>
  )
}

/**
 * A block of configuration as one card: what it is called across the top, its
 * text below, and the controls that read it. The body is a reading surface, so
 * copying is the action the card itself offers and the caller may add more
 * beside it.
 *
 * @param title — what the header names the file, usually its path; omitted when
 * the text is not a file and has no name to wear, which drops the header.
 * @param path — the path that decides the grammar.
 * @param text — the text, as read; omitted when the caller shows something
 * other than text, as a reading state does.
 * @param words — what the card's own controls say; copying is offered when given.
 * @param trailing — controls the caller puts beside the copy button.
 * @param className — the caller's own sizing, since a card fits its screen.
 * @param children — the body, when the caller has something to show in place of
 * the text.
 */
export function CodeCard({
  title,
  path,
  text,
  words,
  trailing,
  className = "",
  children,
}: {
  title?: string
  path: string
  text?: string
  words?: CodeCardWords
  trailing?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-surface-raised ${className}`}
    >
      {title === undefined ? (
        /* No header to hold the controls, so copying floats over the text. */
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {trailing}
          {words === undefined || text === undefined ? null : (
            <CopyButton content={text} words={words} />
          )}
        </div>
      ) : (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3.5">
          <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate text-[13px] font-medium">{title}</span>
          <span className="flex-1" />
          {trailing}
          {words === undefined || text === undefined ? null : (
            <CopyButton content={text} words={words} />
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {children ?? (text === undefined ? null : <CodeView text={text} path={path} />)}
      </div>
    </div>
  )
}
