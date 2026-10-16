import { cn } from "cn"
import * as React from "react"
import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import { paint } from "../lib/highlight"

/*
 * Element sizes are em-relative, so the caller's font size sets the scale:
 * a card cover and a lightbox stage render the same document at two sizes.
 */
const base = [
  "break-words",
  "[&>:first-child]:mt-0",
  "[&_h1]:mt-[1em] [&_h1]:mb-[0.35em] [&_h1]:text-[1.35em] [&_h1]:leading-[1.25] [&_h1]:font-semibold [&_h1]:text-foreground",
  "[&_h2]:mt-[0.9em] [&_h2]:mb-[0.3em] [&_h2]:text-[1.15em] [&_h2]:leading-[1.3] [&_h2]:font-semibold [&_h2]:text-foreground",
  "[&_h3]:mt-[0.8em] [&_h3]:mb-[0.25em] [&_h3]:text-[1em] [&_h3]:font-semibold [&_h3]:text-foreground",
  "[&_h4]:mt-[0.7em] [&_h4]:font-semibold [&_h4]:text-foreground",
  "[&_p]:mt-[0.5em]",
  "[&_ul]:mt-[0.4em] [&_ul]:list-disc [&_ul]:pl-[1.1em]",
  "[&_ol]:mt-[0.4em] [&_ol]:list-decimal [&_ol]:pl-[1.2em]",
  "[&_li]:mt-[0.12em]",
  "[&_code]:rounded-[3px] [&_code]:bg-muted [&_code]:px-[0.25em] [&_code]:py-[0.1em] [&_code]:font-mono [&_code]:text-[0.9em]",
  "[&_pre]:mt-[0.5em] [&_pre]:rounded-[5px] [&_pre]:bg-muted [&_pre]:p-[0.6em] [&_pre]:font-mono [&_pre]:text-[0.9em] [&_pre]:whitespace-pre-wrap [&_pre]:break-words",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[1em]",
  "[&_blockquote]:mt-[0.5em] [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-[0.7em] [&_blockquote]:text-muted-foreground",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_hr]:my-[0.8em] [&_hr]:border-border",
  "[&_table]:mt-[0.5em] [&_table]:w-full [&_table]:border-collapse [&_table]:text-[0.95em]",
  "[&_th]:border [&_th]:border-border [&_th]:px-[0.4em] [&_th]:py-[0.2em] [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground",
  "[&_td]:border [&_td]:border-border [&_td]:px-[0.4em] [&_td]:py-[0.2em] [&_td]:text-left",
].join(" ")

/** A reference a browser resolves on its own: one with a scheme, or a host. */
const ABSOLUTE = /^(?:[a-z][\w+.-]*:|\/\/)/i

/**
 * Where one reference points, given the base a document's own files live under.
 *
 * A reference with a scheme is the document's own — an address on the network —
 * and is left as written. Anything else names a file beside the document, and
 * `/` means the same thing it means to the repository the document came from:
 * the top of that space. Nothing is resolved when the caller gave no base, which
 * is how a caller that has nowhere to read a picture from says so.
 */
function resolveReference(reference: string, base: string | undefined): string | undefined {
  if (ABSOLUTE.test(reference)) return reference
  if (base === undefined) return undefined
  return base + encodeURI(reference.replace(/^\/+/, ""))
}

/**
 * One picture: the file it names, when this document can reach it at all.
 *
 * A picture that cannot be reached is left out rather than drawn broken: the
 * document came from somebody else's directory, and a missing frame says less
 * than an icon standing for a file that was never there.
 */
function Image({
  src,
  base,
  ...rest
}: React.ComponentProps<"img"> & { base?: string; node?: unknown }) {
  const url = typeof src === "string" ? resolveReference(src, base) : undefined
  /* `width` and the rest ride along: the document's own idea of the frame it
     wants, which the sanitizer has already judged. The syntax node react-markdown
     hands every element is the one thing the DOM must not be given. */
  if (url === undefined) return null
  delete rest.node
  return <img src={url} {...rest} />
}

/**
 * One candidate of a `srcset`, resolved the way a plain reference is.
 *
 * A `srcset` is a list of `<url> <descriptor>` pairs, so only the first word of
 * each candidate is a reference; the descriptor says which frame it is for and
 * is handed back untouched.
 */
function resolveSrcSet(srcSet: string, base: string | undefined): string {
  return srcSet
    .split(",")
    .map((candidate) => {
      const [reference, ...descriptor] = candidate.trim().split(/\s+/)
      const url = reference === undefined ? undefined : resolveReference(reference, base)
      return url === undefined ? "" : [url, ...descriptor].join(" ")
    })
    .filter((candidate) => candidate !== "")
    .join(", ")
}

/**
 * One `<source>` of a `<picture>`: the same frame at another size or colour
 * scheme.
 *
 * Only a source naming its own candidates is touched; one that names a single
 * file does so through `src`, which is not a reference resolved here.
 */
function Source({
  srcSet,
  base,
  ...rest
}: React.ComponentProps<"source"> & { base?: string; node?: unknown }) {
  delete rest.node
  if (typeof srcSet !== "string") return <source {...rest} />
  const resolved = resolveSrcSet(srcSet, base)
  if (resolved === "") return null
  return <source srcSet={resolved} {...rest} />
}

/**
 * What every document overrides: the two elements that point at files the
 * document cannot reach on its own, and the fenced blocks it colours.
 */
function componentsFor(base: string | undefined) {
  return {
    code: Code,
    img: (props: { node?: unknown }) => <Image {...props} base={base} />,
    source: (props: { node?: unknown }) => <Source {...props} base={base} />,
  }
}

/**
 * Markdown rendered with the hub's typography. Fenced blocks are coloured by the
 * same highlighter the file views use.
 *
 * Raw HTML is read as markup — a README's own `<p align>` or `<details>` is part
 * of what it says — and sanitized straight after, so what survives is what a
 * document may carry: `script`, `style`, `data:` and `on*` are dropped before
 * they become elements.
 */
export function Markdown({
  children,
  className,
  imageBase,
}: {
  /** The Markdown source. */
  children: string
  /** Font size and colour of the document; elements scale from it. */
  className?: string
  /**
   * The prefix a reference to a file beside this document resolves under, with
   * nothing after it. Omitted when the caller has no such place, which leaves
   * those pictures out rather than pointing them at whatever the page happens to
   * be served from.
   */
  imageBase?: string
}) {
  return (
    <div className={cn(base, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={componentsFor(imageBase)}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

/** The class react-markdown leaves on a fenced block, carrying its language. */
const FENCE = /language-([\w+#.-]+)/

/**
 * One fenced block: the text as written, coloured once the highlighter has read
 * it. A language no grammar covers — or a block still being read — stays exactly
 * as the stylesheet draws it, so nothing has to be stood in for it meanwhile.
 */
function FencedBlock({ text, lang }: { text: string; lang: string }) {
  const [html, setHtml] = React.useState<string | null>(null)

  React.useEffect(() => {
    let live = true
    void paint(text, lang, "inline").then((painted) => {
      if (live && painted !== null) setHtml(painted)
    })
    return () => {
      live = false
    }
  }, [text, lang])

  /* Shiki escapes the text it wraps and colours it with its own spans. */
  return html === null ? (
    <code>{text}</code>
  ) : (
    <code className="doc-code" dangerouslySetInnerHTML={{ __html: html }} />
  )
}

/**
 * Every code element a document holds. Only a fenced block names a language, so
 * that is the whole of what tells one apart from a word marked in the prose.
 */
function Code({ className, children }: { className?: string; children?: React.ReactNode }) {
  const lang = FENCE.exec(className ?? "")?.[1]
  if (lang === undefined) return <code className={className}>{children}</code>
  return <FencedBlock text={String(children)} lang={lang} />
}
