/**
 * Settings: the machine-wide preferences from `designs/settings.pen`. Every
 * control writes as it changes — there is no save button, because each value
 * already has one owner (ThemeProvider, I18nService, SettingsService).
 */
import { CheckIcon, CopyIcon } from "lucide-react"
import * as React from "react"

import { useHub, useI18n, useSettings } from "@context-hub/extensions/react"
import type { AssetImageStats, AssetLocalizeSummary } from "@context-hub/core"
import { ABOUT_ROUTE, type AboutInfo } from "@context-hub/core/about"
import { PLUGIN_ROUTE } from "@context-hub/plugins"
import { SKILL_ROUTE } from "@context-hub/skills"
import { toast } from "@context-hub/shadcn-ui/components/toast"
import { Switch } from "@context-hub/shadcn-ui/components/switch"

import { useTheme } from "@/components/theme-provider"

type ThemeChoice = "system" | "light" | "dark"
type LayoutChoice = "grid" | "list"
type InstallChoice = "auto" | "link" | "copy"

const THEME_CHOICES: { id: ThemeChoice; key: string }[] = [
  { id: "system", key: "settings.theme.system" },
  { id: "light", key: "settings.theme.light" },
  { id: "dark", key: "settings.theme.dark" },
]

const LAYOUT_CHOICES: { id: LayoutChoice; key: string }[] = [
  { id: "grid", key: "settings.layout.grid" },
  { id: "list", key: "settings.layout.list" },
]

const INSTALL_CHOICES: {
  id: InstallChoice
  titleKey: string
  descriptionKey: string
  badgeKey?: string
}[] = [
  {
    id: "auto",
    titleKey: "settings.install.auto",
    descriptionKey: "settings.install.auto.description",
    badgeKey: "settings.install.recommended",
  },
  {
    id: "link",
    titleKey: "settings.install.link",
    descriptionKey: "settings.install.link.description",
  },
  {
    id: "copy",
    titleKey: "settings.install.copy",
    descriptionKey: "settings.install.copy.description",
  },
]

/*
 * The thumbnails are pictures of an interface, not an interface in this theme:
 * their colors are literal, so switching the app between light and dark does
 * not repaint the thing that shows you which mode you are choosing.
 */
const BRAND = "#0052FF"
const LIGHT_BG = "#FFFFFF"
const DARK_BG = "#0A0B0D"
const LIGHT_LINE = "#DEE1E6"
const DARK_LINE = "#3A3F47"
const LIGHT_BAR = "#A8B8CC"
const DARK_BAR = "#26303E"
const LIGHT_PANEL = "#EEF0F3"
const DARK_PANEL = "#1F2530"
const LAYOUT_BG = "#F7F7F7"

/** One absolutely placed rectangle inside a thumbnail. */
function Box({
  left,
  top,
  width,
  height,
  radius = 0,
  color,
}: {
  left: number
  top: number
  width: number
  height: number
  radius?: number
  color: string
}) {
  return (
    <span
      className="absolute block"
      style={{ left, top, width, height, borderRadius: radius, background: color }}
    />
  )
}

/** A light or dark dashboard, small enough to read at a glance. */
function ThemePreview({ mode }: { mode: ThemeChoice }) {
  if (mode === "system") {
    return (
      <>
        <Box left={0} top={0} width={84} height={96} color={LIGHT_BG} />
        <Box left={84} top={0} width={84} height={96} color={DARK_BG} />
        <Box left={12} top={12} width={6} height={6} radius={3} color={BRAND} />
        <Box left={12} top={26} width={44} height={3} radius={2} color={LIGHT_LINE} />
        <Box left={12} top={33} width={34} height={3} radius={2} color={LIGHT_LINE} />
        <Box left={12} top={52} width={60} height={28} radius={6} color={LIGHT_PANEL} />
        <Box left={96} top={12} width={6} height={6} radius={3} color={BRAND} />
        <Box left={96} top={26} width={44} height={3} radius={2} color={DARK_LINE} />
        <Box left={96} top={33} width={34} height={3} radius={2} color={DARK_LINE} />
        <Box left={96} top={52} width={60} height={28} radius={6} color={DARK_PANEL} />
      </>
    )
  }

  const dark = mode === "dark"
  return (
    <>
      <Box left={0} top={0} width={168} height={96} color={dark ? DARK_BG : LIGHT_BG} />
      <Box left={10} top={10} width={6} height={6} radius={3} color={BRAND} />
      <Box left={10} top={24} width={30} height={3} radius={2} color={dark ? DARK_LINE : LIGHT_LINE} />
      <Box left={10} top={31} width={22} height={3} radius={2} color={dark ? DARK_LINE : LIGHT_LINE} />
      <Box left={10} top={38} width={26} height={3} radius={2} color={dark ? DARK_LINE : LIGHT_LINE} />
      <Box left={52} top={38} width={10} height={22} radius={3} color={dark ? DARK_BAR : LIGHT_BAR} />
      <Box left={66} top={28} width={10} height={32} radius={3} color={BRAND} />
      <Box left={80} top={44} width={10} height={16} radius={3} color={dark ? DARK_BAR : LIGHT_BAR} />
      <span
        className="absolute block rounded-full"
        style={{
          left: 100,
          top: 22,
          width: 26,
          height: 26,
          border: `7px solid ${dark ? DARK_BAR : LIGHT_BAR}`,
        }}
      />
      <Box left={52} top={58} width={104} height={26} radius={6} color={dark ? DARK_PANEL : LIGHT_PANEL} />
    </>
  )
}

/** A card grid or a list, drawn as the page would draw it. */
function LayoutPreview({ mode }: { mode: LayoutChoice }) {
  return (
    <>
      <Box left={0} top={0} width={168} height={96} color={LAYOUT_BG} />
      {mode === "grid" ? (
        <>
          <Box left={12} top={12} width={68} height={32} radius={6} color={LIGHT_LINE} />
          <Box left={88} top={12} width={68} height={32} radius={6} color={LIGHT_LINE} />
          <Box left={12} top={52} width={68} height={32} radius={6} color={LIGHT_LINE} />
          <Box left={88} top={52} width={68} height={32} radius={6} color={LIGHT_LINE} />
        </>
      ) : (
        [12, 32, 52, 72].map((top) => (
          <Box key={top} left={12} top={top} width={144} height={14} radius={4} color={LIGHT_LINE} />
        ))
      )}
    </>
  )
}

/** One thumbnail and its label; the mark sits on the corner like a check mark. */
function ThumbnailChoice({
  label,
  selected,
  onSelect,
  children,
}: {
  label: string
  selected: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="relative flex w-[168px] shrink-0 flex-col gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span
        className={`relative block h-24 w-[168px] overflow-hidden rounded-md ${
          selected ? "ring-2 ring-ring ring-inset" : "ring-1 ring-border ring-inset"
        }`}
      >
        {children}
      </span>
      <span
        className={`text-[13px] leading-4 ${
          selected ? "font-semibold text-foreground" : "text-copy"
        }`}
      >
        {label}
      </span>
      {selected ? (
        <span className="absolute -top-1.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-ring text-white">
          <CheckIcon className="size-[11px]" strokeWidth={3} aria-hidden />
        </span>
      ) : null}
    </button>
  )
}

/** One setting's title and explanation, for rows whose control sits below. */
function SettingText({ title, description }: { title: string; description: string }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[16px] font-semibold text-foreground">{title}</span>
      <span className="text-[14px] leading-relaxed text-copy">{description}</span>
    </span>
  )
}

/** One setting's title and explanation, for rows whose control sits at the end. */
function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-8 py-5">
      <SettingText title={title} description={description} />
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** A section: a heading, one line of context, and the card holding its rows. */
function Group({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[20px] font-semibold tracking-[-0.2px] text-foreground">{title}</h2>
        <p className="text-[14px] leading-relaxed text-copy">{description}</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-8">{children}</div>
    </section>
  )
}

/** The pill-shaped two-or-more choice used by the language row. */
function Segmented({
  value,
  options,
  onChange,
}: {
  value: string
  options: { id: string; label: string }[]
  onChange: (id: string) => void
}) {
  return (
    <div className="inline-flex h-11 items-center gap-1 rounded-pill bg-secondary p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
          className={`h-9 rounded-pill px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
            option.id === value
              ? "bg-background font-semibold text-foreground dark:bg-foreground dark:text-background"
              : "text-copy"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** One installation mode, as a whole-card radio. */
function InstallChoiceCard({
  title,
  description,
  badge,
  selected,
  onSelect,
}: {
  title: string
  description: string
  badge?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-h-[176px] flex-col gap-2.5 rounded-[16px] p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
        selected ? "bg-notice-bg ring-2 ring-ring" : "bg-card ring-1 ring-border"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-[16px] font-semibold text-foreground">{title}</span>
        <span
          className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
            selected ? "bg-ring" : "ring-[1.5px] ring-border"
          }`}
        >
          {selected ? <span className="size-2 rounded-full bg-white" /> : null}
        </span>
      </span>
      <span className="text-[13px] leading-relaxed text-copy">{description}</span>
      {badge === undefined ? null : (
        <span className="mt-auto w-fit rounded-pill bg-ring/10 px-2.5 py-1 text-[12px] font-semibold text-ring">
          {badge}
        </span>
      )}
    </button>
  )
}

/** Copy one read-only value, confirming with a check mark for a moment. */
function CopyValue({ value }: { value: string | null }) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<number | null>(null)

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    []
  )

  const copy = () => {
    if (value === null) return
    const clipboard = navigator.clipboard
    if (clipboard === undefined) return
    void clipboard
      .writeText(value)
      .then(() => {
        setCopied(true)
        if (timer.current !== null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => undefined)
  }

  return (
    <button
      type="button"
      disabled={value === null}
      onClick={copy}
      aria-label={t(copied ? "settings.copied" : "settings.copy")}
      className="flex size-8 items-center justify-center rounded-full bg-secondary text-copy transition-colors hover:text-foreground disabled:opacity-40"
    >
      {copied ? (
        <CheckIcon className="size-[15px]" aria-hidden />
      ) : (
        <CopyIcon className="size-[15px]" aria-hidden />
      )}
    </button>
  )
}

export function SettingsPage() {
  const { t, state: i18n, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const settings = useSettings()
  const ctx = useHub()
  const host = ctx.get("host")

  /* Filled in by the about read; the row already exists so the page never
     changes shape once that answer lands. */
  const [about, setAbout] = React.useState<AboutInfo | null>(null)
  const [stats, setStats] = React.useState<AssetImageStats | null>(null)
  const [downloading, setDownloading] = React.useState(false)

  const fetchStats = React.useCallback(async (): Promise<AssetImageStats | null> => {
    try {
      const answers = await Promise.all([
        fetch(`${SKILL_ROUTE}?action=asset-stats`),
        fetch(`${PLUGIN_ROUTE}?action=asset-stats`),
      ])
      if (answers.some((answer) => !answer.ok)) {
        throw new Error(answers.map((answer) => answer.status).join(" / "))
      }
      const [skills, plugins] = (await Promise.all(
        answers.map((answer) => answer.json())
      )) as [AssetImageStats, AssetImageStats]
      return {
        remote: skills.remote + plugins.remote,
        localized: skills.localized + plugins.localized,
      }
    } catch {
      /* A read that failed is not an empty library: say "—" and leave the
         button off, rather than claiming there is nothing to download. */
      return null
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void fetch(ABOUT_ROUTE)
      .then((answer) => (answer.ok ? (answer.json() as Promise<AboutInfo>) : null))
      .then((info) => {
        if (!cancelled) setAbout(info)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void fetchStats().then((next) => {
      if (!cancelled) setStats(next)
    })
    return () => {
      cancelled = true
    }
  }, [fetchStats])

  const downloadAll = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const answers = await Promise.allSettled(
        [SKILL_ROUTE, PLUGIN_ROUTE].map((route) =>
          fetch(route, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "localize-assets" }),
          })
        )
      )
      let downloaded = 0
      let failed = 0
      const reasons: string[] = []
      for (const answer of answers) {
        if (answer.status === "rejected") {
          reasons.push(String(answer.reason))
          continue
        }
        if (!answer.value.ok) {
          reasons.push(`${answer.value.status} ${answer.value.statusText}`)
          continue
        }
        const summary = (await answer.value.json()) as AssetLocalizeSummary
        downloaded += summary.downloaded
        failed += summary.failed.length
      }
      if (reasons.length > 0) {
        toast.add({
          type: "error",
          title: t("settings.images.failed").replace("{reason}", reasons[0] ?? ""),
        })
      } else {
        toast.add({
          type: "success",
          title: t("settings.images.done")
            .replace("{downloaded}", String(downloaded))
            .replace("{failed}", String(failed)),
        })
      }
      const skillsCatalog = ctx.get("catalog.skills") as
        | { reload?: () => Promise<void> }
        | undefined
      const pluginsCatalog = ctx.get("catalog.plugins") as
        | { reload?: () => Promise<void> }
        | undefined
      void skillsCatalog?.reload?.()
      void pluginsCatalog?.reload?.()
      setStats(await fetchStats())
    } finally {
      setDownloading(false)
    }
  }

  const statsText =
    stats === null
      ? t("settings.images.stats").replace("{remote}", "—").replace("{localized}", "—")
      : t("settings.images.stats")
          .replace("{remote}", String(stats.remote))
          .replace("{localized}", String(stats.localized))
  const downloadLabel =
    stats === null
      ? t("settings.images.downloadAll").replace("{count}", "—")
      : t("settings.images.downloadAll").replace("{count}", String(stats.remote))
  const hostLabel =
    host === undefined
      ? "—"
      : host.form === "Web"
        ? t("settings.about.hostWeb")
        : host.form

  return (
    <div className="-mx-6 bg-background">
      <div className="flex w-full flex-col gap-12 px-16 py-10 font-mono">
        <header className="flex flex-col gap-3">
          <span className="text-[12px] font-semibold tracking-[0.1em] text-ring">
            {t("settings.eyebrow")}
          </span>
          <h1 className="text-[44px] leading-none font-normal tracking-[-1px] text-foreground">
            {t("settings.title")}
          </h1>
          <p className="text-[16px] leading-relaxed text-copy">
            {t("settings.subtitle")}
          </p>
        </header>

        <Group
          title={t("settings.appearance.title")}
          description={t("settings.appearance.description")}
        >
          <div className="flex flex-col divide-y divide-border">
            <div className="flex flex-col gap-4 py-5">
              <SettingText
                title={t("settings.theme.title")}
                description={t("settings.theme.description")}
              />
              <div
                role="radiogroup"
                aria-label={t("settings.theme.title")}
                className="flex flex-wrap gap-3"
              >
                {THEME_CHOICES.map((choice) => (
                  <ThumbnailChoice
                    key={choice.id}
                    label={t(choice.key)}
                    selected={theme === choice.id}
                    onSelect={() => setTheme(choice.id)}
                  >
                    <ThemePreview mode={choice.id} />
                  </ThumbnailChoice>
                ))}
              </div>
            </div>

            <SettingRow
              title={t("settings.language.title")}
              description={t("settings.language.description")}
            >
              <Segmented
                value={i18n.active}
                options={i18n.locales.map((locale) => ({
                  id: locale.id,
                  label: locale.label,
                }))}
                onChange={setLocale}
              />
            </SettingRow>

            <div className="flex flex-col gap-4 py-5">
              <SettingText
                title={t("settings.layout.title")}
                description={t("settings.layout.description")}
              />
              <div
                role="radiogroup"
                aria-label={t("settings.layout.title")}
                className="flex flex-wrap gap-3"
              >
                {LAYOUT_CHOICES.map((choice) => (
                  <ThumbnailChoice
                    key={choice.id}
                    label={t(choice.key)}
                    selected={settings.layout === choice.id}
                    onSelect={() => settings.set({ layout: choice.id })}
                  >
                    <LayoutPreview mode={choice.id} />
                  </ThumbnailChoice>
                ))}
              </div>
            </div>
          </div>
        </Group>

        <Group
          title={t("settings.install.title")}
          description={t("settings.install.description")}
        >
          <div className="flex flex-col gap-3">
            <div
              role="radiogroup"
              aria-label={t("settings.install.title")}
              className="grid gap-4 md:grid-cols-3"
            >
              {INSTALL_CHOICES.map((choice) => (
                <InstallChoiceCard
                  key={choice.id}
                  title={t(choice.titleKey)}
                  description={t(choice.descriptionKey)}
                  {...(choice.badgeKey === undefined ? {} : { badge: t(choice.badgeKey) })}
                  selected={settings.installMode === choice.id}
                  onSelect={() => settings.set({ installMode: choice.id })}
                />
              ))}
            </div>
            <p className="text-[13px] text-muted-foreground">
              {t("settings.install.footnote")}
            </p>
          </div>
        </Group>

        <Group
          title={t("settings.images.title")}
          description={t("settings.images.description")}
        >
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-8 border-b border-border py-5">
              <SettingText
                title={t("settings.images.download.title")}
                description={t("settings.images.download.description")}
              />
              <Switch
                checked={settings.downloadRemoteImages}
                onCheckedChange={(checked) =>
                  settings.set({ downloadRemoteImages: checked })
                }
                className="h-6! w-11! p-[3px] data-checked:bg-ring data-unchecked:bg-secondary [&_[data-slot=switch-thumb]]:size-[18px]! [&_[data-slot=switch-thumb]]:bg-white! data-checked:[&_[data-slot=switch-thumb]]:translate-x-[20px]!"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-6 py-[18px]">
              <span className="text-[13px] text-copy">{statsText}</span>
              <button
                type="button"
                onClick={() => void downloadAll()}
                disabled={downloading || stats === null || stats.remote === 0}
                className="h-10 rounded-pill bg-secondary px-[18px] text-[14px] font-semibold text-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloading ? t("settings.images.downloading") : downloadLabel}
              </button>
            </div>
          </div>
        </Group>

        <Group
          title={t("settings.about.title")}
          description={t("settings.about.description")}
        >
          <div className="flex flex-col divide-y divide-border">
            <div className="flex items-center justify-between gap-8 py-5">
              <span className="text-[16px] font-semibold text-foreground">
                {t("settings.about.version")}
              </span>
              <span className="font-mono text-[14px] text-foreground">
                {about?.version ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-8 py-5">
              <span className="text-[16px] font-semibold text-foreground">
                {t("settings.about.home")}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[14px] text-foreground">
                  {about?.home ?? "—"}
                </span>
                <CopyValue value={about?.home ?? null} />
              </span>
            </div>
            <div className="flex items-center justify-between gap-8 py-5">
              <span className="text-[16px] font-semibold text-foreground">
                {t("settings.about.host")}
              </span>
              <span className="text-[14px] text-foreground">{hostLabel}</span>
            </div>
          </div>
        </Group>
      </div>
    </div>
  )
}
