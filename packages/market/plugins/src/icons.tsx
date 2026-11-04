/**
 * The marks a row falls back to: one per normalized category, drawn in the
 * same 40px tile whether the row is on the page or in the detail dialog.
 */
import {
  ActivityIcon,
  ArrowRightLeftIcon,
  BotIcon,
  BoxIcon,
  BriefcaseIcon,
  ChartColumnIcon,
  CodeIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  GraduationCapIcon,
  LandmarkIcon,
  MapPinIcon,
  MessageSquareIcon,
  PaletteIcon,
  RocketIcon,
  ShieldIcon,
  SigmaIcon,
  TestTubeIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

import * as React from "react"

import { normalizeCategory } from "./contract.ts"
import type { MarketRow } from "./rows.ts"

const CATEGORY_ICONS: Readonly<Record<string, LucideIcon>> = {
  development: CodeIcon,
  design: PaletteIcon,
  productivity: ZapIcon,
  communication: MessageSquareIcon,
  security: ShieldIcon,
  database: DatabaseIcon,
  monitoring: ActivityIcon,
  deployment: RocketIcon,
  learning: GraduationCapIcon,
  automation: BotIcon,
  testing: TestTubeIcon,
  math: SigmaIcon,
  location: MapPinIcon,
  migration: ArrowRightLeftIcon,
  education: GraduationCapIcon,
  data: ChartColumnIcon,
  finance: LandmarkIcon,
  research: FlaskConicalIcon,
  business: BriefcaseIcon,
  other: BoxIcon,
}

/** The icon one category falls back to. */
export function categoryIcon(category: string | undefined): LucideIcon {
  return CATEGORY_ICONS[normalizeCategory(category)] ?? BoxIcon
}

/** What a source answered about one visible row. */
export interface Enriched {
  icon?: string
  description?: string
}

/**
 * Answers already read this session, by entry id.
 *
 * A row that scrolls out and back in must not ask the source again, and a
 * refresh of the index keeps these: a mark does not move with the index.
 */
const ENRICHED = new Map<string, Enriched>()

/** Reads already on the wire, so a row and its dialog share one request. */
const PENDING = new Map<string, Promise<Enriched>>()

/** What a source already answered about one entry, if it has been read. */
export function enrichmentOf(id: string): Enriched | undefined {
  return ENRICHED.get(id)
}

/**
 * Read one entry's mark and sentence, sharing the answer with every caller.
 *
 * A source without `enrich` answers with nothing, which the row draws as its
 * category mark and the sentence the index already gave it.
 */
export function readEnrichment(row: MarketRow): Promise<Enriched> {
  const { id } = row.entry
  const cached = ENRICHED.get(id)
  if (cached !== undefined) return Promise.resolve(cached)
  if (row.source.enrich === undefined) return Promise.resolve({})
  const running = PENDING.get(id)
  if (running !== undefined) return running
  const source = row.source
  const entry = row.entry
  const job = source
    .enrich?.(entry)
    .then((answer) => {
      ENRICHED.set(id, answer)
      return answer
    })
    /* A row the source cannot enrich keeps its category mark and the sentence
       the index gave it; that is a state, not a failure. */
    .catch((): Enriched => {
      ENRICHED.set(id, {})
      return {}
    })
    .finally(() => {
      PENDING.delete(id)
    }) ?? Promise.resolve({})
  PENDING.set(id, job)
  return job
}

/**
 * Read one row's mark and sentence when it first scrolls into view.
 *
 * The observer is what keeps a 380-row page from asking for 380 manifests: a
 * row that is never on screen is never read.
 */
export function useEntryEnrichment(row: MarketRow): {
  value: Enriched | undefined
  observe: (node: HTMLElement | null) => (() => void) | undefined
} {
  const [value, setValue] = React.useState<Enriched | undefined>(() =>
    ENRICHED.get(row.entry.id)
  )

  const observe = React.useCallback(
    (node: HTMLElement | null) => {
      if (node === null || row.source.enrich === undefined) return undefined
      if (ENRICHED.has(row.entry.id)) return undefined
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void readEnrichment(row).then(setValue)
      })
      observer.observe(node)
      return () => observer.disconnect()
    },
    [row]
  )

  return { value, observe }
}

/** The 40px tile one row's mark sits in: the source's own picture, else its category. */
export function MarketMark({
  row,
  enrichment,
  observe,
}: {
  row: MarketRow
  enrichment?: Enriched
  observe?: (node: HTMLElement | null) => (() => void) | undefined
}) {
  const [broken, setBroken] = React.useState(false)
  const icon = enrichment?.icon

  return (
    <span
      ref={observe}
      className="flex size-10 shrink-0 items-center justify-center overflow-clip rounded-[10px] bg-surface-raised ring-1 ring-border ring-inset"
    >
      {icon !== undefined && !broken ? (
        <img
          src={icon}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        /* createElement rather than a local JSX identifier: the linter reads a
           component chosen during render as one being created during render. */
        React.createElement(categoryIcon(row.entry.category), {
          className: "size-[18px] text-muted-foreground",
          "aria-hidden": true,
        })
      )}
    </span>
  )
}
