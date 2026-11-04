import type { NetPort } from "@context-hub/extensions"

import { parseJson, record, requestWithRetry, requireOk, text } from "./http.ts"
import type { MarketAudit, MarketAuditEntry } from "./types.ts"
import { MARKET_ORIGIN, skillSegment, sourceSegments } from "./urls.ts"

/** The published audit, or `null` when there is none (a 404). */
export async function readAudit(
  net: NetPort,
  source: string,
  skill: string
): Promise<MarketAudit | null> {
  const reply = await requestWithRetry(
    net,
    `${MARKET_ORIGIN}/api/v1/skills/audit/${sourceSegments(source).join("/")}/${skillSegment(skill)}`
  )
  if (reply.status === 404) return null
  requireOk(reply)
  const parsed = parseJson(reply, "skills.sh audit")
  if (!record(parsed) || !Array.isArray(parsed.audits)) {
    throw new Error("skills.sh audit: the answer has no audits")
  }
  const audits: MarketAuditEntry[] = []
  for (const item of parsed.audits) {
    if (!record(item)) continue
    const provider = text(item.provider)
    const slug = text(item.slug)
    const status = text(item.status)
    const summary = text(item.summary)
    const auditedAt = text(item.auditedAt)
    if (provider === null || slug === null || status === null || summary === null || auditedAt === null) {
      continue
    }
    const riskLevel = text(item.riskLevel)
    audits.push({
      provider,
      slug,
      status,
      summary,
      auditedAt,
      ...(riskLevel === null ? {} : { riskLevel }),
      ...(Array.isArray(item.categories)
        ? {
            categories: item.categories.filter(
              (category): category is string => typeof category === "string"
            ),
          }
        : {}),
    })
  }
  return {
    id: text(parsed.id) ?? `${source}/${skill}`,
    source: text(parsed.source) ?? source,
    slug: text(parsed.slug) ?? skill,
    audits,
  }
}
