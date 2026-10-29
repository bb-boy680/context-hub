import type { NetPort } from "@context-hub/extensions"

import { requestWithRetry, requireOk } from "./http.ts"
import { marketSkillUrl } from "./urls.ts"

/**
 * The generated summary out of one skill page, or `null` when the page has
 * none. skills.sh renders it into the page itself — no JSON endpoint carries
 * it — so this reads the section by its shape: the "Summary" heading followed
 * by the first `div.prose`.
 *
 * shortcut: keyed to that markup; if skills.sh changes the heading or the
 * prose wrapper the summary silently disappears (the dialog just omits it).
 */
export function summaryHtml(page: string): string | null {
  const heading = page.indexOf(">Summary</div>")
  if (heading < 0) return null
  const start = page.indexOf('<div class="prose', heading)
  if (start < 0) return null
  const open = page.indexOf(">", start)
  if (open < 0) return null
  let depth = 1
  let cursor = open + 1
  let end = -1
  while (depth > 0) {
    const close = page.indexOf("</div>", cursor)
    if (close < 0) return null
    const nested = page.indexOf("<div", cursor)
    if (nested >= 0 && nested < close) {
      depth += 1
      cursor = nested + 4
    } else {
      depth -= 1
      end = close
      cursor = close + 6
    }
  }
  const html = page.slice(open + 1, end).trim()
  return html === "" ? null : html
}

/** The summary as HTML, or `null` when the page has none or cannot be read. */
export async function readSummary(
  net: NetPort,
  source: string,
  skill: string
): Promise<string | null> {
  /* The site path, not the API host: a domain source lives under `/site/`, and
     this is the same page the dialog's "open on skills.sh" link points at. */
  const reply = await requestWithRetry(net, marketSkillUrl(source, skill, true))
  if (reply.status === 404) return null
  requireOk(reply)
  return summaryHtml(reply.body)
}
