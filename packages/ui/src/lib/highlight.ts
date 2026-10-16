/**
 * The one syntax highlighter this app builds: the grammars its screens show, and
 * the two themes its colour scheme picks between.
 *
 * It is here, under the shared components, because two kinds of caller colour
 * text with it — a file read whole into its own frame, and a fenced block inside
 * a document — and one highlighter compiling the grammars once serves both.
 *
 * Building it is asynchronous, so a caller shows its text at once and lets the
 * colours arrive after; a language it does not carry is left plain, which is
 * what the caller draws to begin with.
 */
import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"

/** The themes both kinds of caller compile against; which one paints is CSS. */
export const THEMES = { light: "github-light", dark: "github-dark" } as const

/** Built on first use and kept: the same languages come up again and again. */
let highlighter: Promise<HighlighterCore> | null = null

/**
 * The built instance, for the callers that cannot wait a microtask for it.
 *
 * An editor repaints on every keystroke, and a promise per keystroke is both
 * slower than the work it wraps and one render out of step with what is typed.
 */
let built: HighlighterCore | null = null

/**
 * The highlighter, built on first use.
 *
 * The JavaScript engine keeps wasm out of the bundle, and loading the grammars
 * explicitly keeps the bundle to the ones these screens actually show.
 */
export function loadHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [
      import("shiki/themes/github-light.mjs"),
      import("shiki/themes/github-dark.mjs"),
    ],
    langs: [
      import("shiki/langs/markdown.mjs"),
      import("shiki/langs/yaml.mjs"),
      import("shiki/langs/json.mjs"),
      import("shiki/langs/python.mjs"),
      import("shiki/langs/typescript.mjs"),
      import("shiki/langs/javascript.mjs"),
      import("shiki/langs/bash.mjs"),
      import("shiki/langs/html.mjs"),
      import("shiki/langs/css.mjs"),
      import("shiki/langs/toml.mjs"),
    ],
    engine: createJavaScriptRegexEngine(),
  }).then((instance) => {
    built = instance
    return instance
  })
  return highlighter
}

/** One piece of text coloured, or nothing when this highlighter cannot read it. */
function htmlOf(
  instance: HighlighterCore,
  text: string,
  lang: string,
  structure: "classic" | "inline"
): string | null {
  try {
    return instance.codeToHtml(text, {
      lang,
      themes: THEMES,
      defaultColor: false,
      structure,
    })
  } catch {
    /* Shiki refuses a language it cannot read; that is a plain block, not a
       failure, and the text the caller already shows is the whole of it. */
    return null
  }
}

/**
 * The same markup, without waiting for a highlighter that is already built.
 *
 * @returns the markup, or `null` when there is no highlighter yet — the caller
 * draws its text plainly, which is what it does while loading anyway.
 */
export function paintNow(
  text: string,
  lang: string,
  structure: "classic" | "inline"
): string | null {
  return built === null ? null : htmlOf(built, text, lang, structure)
}

/**
 * One piece of text as coloured markup, for a container that resolves the two
 * themes with CSS — the colours come out as variables, so the theme follows the
 * app's own switch rather than being baked into the markup.
 *
 * @param text — the text to colour, as written.
 * @param lang — the language to read it as, by any name shiki knows it under.
 * @param structure — `classic` for a file that brings its own frame, `inline`
 * for a block inside a document that supplies the element itself.
 * @returns the markup, or null when this highlighter carries no such language —
 * which leaves the caller drawing the text plainly, as it already does.
 */
export async function paint(
  text: string,
  lang: string,
  structure: "classic" | "inline"
): Promise<string | null> {
  return htmlOf(await loadHighlighter(), text, lang, structure)
}
