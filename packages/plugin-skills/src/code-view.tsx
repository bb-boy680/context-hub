/**
 * One file's text with syntax colours, rendered by shiki: the grammars and
 * themes of that library produce the HTML, and the panel only styles it. A
 * file in a language no grammar covers renders as plain text.
 *
 * The highlighter is built once per session and carries only the languages a
 * skill is written in — loading it is asynchronous, so the text shows at once
 * and the colours arrive after.
 */
import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import * as React from "react"

/** Extensions a skill's files use, and the grammar that colours each one. */
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

/** Built on first use and kept: a skill's files repeat their languages. */
let highlighter: Promise<HighlighterCore> | null = null

function loadHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    /* Both themes are compiled once; which one paints is CSS (see `.file-code`). */
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
    /* The JavaScript engine keeps wasm out of the bundle. */
    engine: createJavaScriptRegexEngine(),
  })
  return highlighter
}

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
    void loadHighlighter()
      .then((instance) =>
        instance.codeToHtml(text, {
          lang: grammarOf(path),
          themes: { light: "github-light", dark: "github-dark" },
          /* The colours come from CSS variables, so the theme follows the
             app's own switch instead of a colour baked into the markup. */
          defaultColor: false,
        })
      )
      .then((html) => {
        if (live) setRendered({ path, text, html })
      })
      .catch(() => {
        /* A grammar that will not load leaves the text plain; it still shows. */
      })
    return () => {
      live = false
    }
  }, [text, path])

  const html =
    rendered !== null && rendered.path === path && rendered.text === text
      ? rendered.html
      : null

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
