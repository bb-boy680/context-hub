/**
 * One text, coloured, and editable in place.
 *
 * It is two layers of the same text: the coloured markup `CodeView` draws, and
 * over it a `textarea` whose own glyphs are transparent. The caret and the
 * selection belong to the textarea, so editing behaves the way a plain field
 * does; everything the eye reads belongs to the layer below it.
 *
 * That only works while both layers break lines in exactly the same places, so
 * neither one wraps: the text runs on one line and the two scroll together.
 * Letting both wrap would hand the decision to two different rule sets — a
 * textarea's own styles let a long word break, a `<pre>`'s do not — and the
 * colour would slide out from under the text on the first long line.
 *
 * shortcut: no wrapping, so a very long single line scrolls sideways. Upgrade
 * by measuring the break the textarea took and painting that same one below.
 */
import * as React from "react"

import { loadHighlighter, paintNow } from "@workspace/ui/lib/highlight"

/**
 * Where the text starts, in both layers.
 *
 * `file-code` draws a line number in a 2rem column with a 12px gap after it,
 * inside the 14px padding of shiki's own block. The editor's transparent layer
 * draws no numbers of its own — it sits over the ones already there — so it has
 * to start where they leave off. **The three numbers below are that style's**:
 * moving one without the other two puts the colour half a character off.
 */
const INDENT = "calc(14px + 2rem + 12px)"

/** The rows line up only if both layers agree on the type and the leading. */
const TYPE = "font-mono text-[11.5px] leading-5"

/**
 * Edit one text with its syntax colours showing.
 *
 * @param text — the text, as it stands.
 * @param onChange — every keystroke, with the whole text as it now reads.
 * @param language — any name shiki knows the language under.
 * @param label — the field's accessible name.
 * @param className — the caller's own sizing; the editor fills what it is given.
 */
export function CodeEditor({
  text,
  onChange,
  language,
  label,
  className = "",
}: {
  text: string
  onChange: (text: string) => void
  language: string
  label: string
  className?: string
}) {
  /* The highlighter is built once per session, and the first screen to need one
     may not be this one. Until it is there the textarea shows its own glyphs. */
  const [ready, setReady] = React.useState(false)
  /* A text being composed by an input method lives in the textarea and nowhere
     else: shiki has not been handed those characters yet, and transparent ones
     would leave someone typing Chinese with nothing on screen to read. */
  const [composing, setComposing] = React.useState(false)
  const paintRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    let live = true
    void loadHighlighter().then(() => {
      if (live) setReady(true)
    })
    return () => {
      live = false
    }
  }, [])

  /* Recoloured as the text changes: a highlighter that is already built is a
     synchronous call, so this is one string pass per keystroke, not a promise. */
  const html = React.useMemo(
    () => (ready ? paintNow(text, language, "classic") : null),
    [ready, text, language]
  )

  /* Both layers scroll as one; the textarea is the one a person scrolls. */
  const follow = (area: HTMLTextAreaElement) => {
    const painted = paintRef.current
    if (painted === null) return
    painted.scrollTop = area.scrollTop
    painted.scrollLeft = area.scrollLeft
  }

  const bare = html === null || composing

  return (
    <div className={`relative ${TYPE} ${className}`}>
      {html === null ? null : (
        <div
          ref={paintRef}
          aria-hidden
          /* `file-code` is what draws the line numbers and the colours; `w-max`
             is what lets the block be wider than the frame, which is what gives
             this layer anything to scroll. */
          className={`file-code absolute inset-0 overflow-hidden [&>pre]:w-max [&>pre]:min-w-full ${
            composing ? "invisible" : ""
          }`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      <textarea
        value={text}
        spellCheck={false}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => follow(event.currentTarget)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        className={`absolute inset-0 resize-none overflow-auto bg-transparent pt-3 pr-3.5 pb-3 outline-none ${TYPE} whitespace-pre ${
          bare ? "text-secondary-foreground" : "text-transparent caret-foreground"
        }`}
        style={{ paddingLeft: INDENT }}
      />
    </div>
  )
}
