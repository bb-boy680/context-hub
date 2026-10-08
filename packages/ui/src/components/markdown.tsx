import { cn } from "cn"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

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
  /* A preview cannot resolve the relative paths a skill's images use. */
  "[&_img]:hidden",
].join(" ")

/**
 * Markdown rendered with the hub's typography. Source text stays text: no raw
 * HTML is enabled, and `react-markdown` drops unsafe link targets.
 */
export function Markdown({
  children,
  className,
}: {
  /** The Markdown source. */
  children: string
  /** Font size and colour of the document; elements scale from it. */
  className?: string
}) {
  return (
    <div className={cn(base, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
