/**
 * The two searches the shell owns.
 *
 * Settings and the Extensions page are not extension modules, so nobody can
 * register their providers from inside those pages. This package already owns
 * the palette, so it offers both: the shell's own settings rows are a fixed
 * table, while sections a plugin contributes through the kernel's
 * `settingsSection` point are read on every query — enabling or disabling a
 * plugin shows up without a reload. The extensions are the kernel's own
 * catalog, read on every query.
 *
 * The settings table is the one place in this feature that must be kept in
 * step by hand: a new shell row in `apps/web/src/pages/settings.tsx` needs a
 * line here, or the global search cannot find it.
 */
import { BlocksIcon, SettingsIcon } from "lucide-react"

import { matchesQuery, searchPath } from "@context-hub/extensions"
import type {
  ExtensionView,
  SearchContribution,
  SearchResult,
  SettingsSectionContribution,
} from "@context-hub/extensions"

/** One setting row, with the group whose anchor the page scrolls to. */
interface SettingEntry {
  anchor: "appearance" | "install" | "images" | "about"
  titleKey: string
  descriptionKey?: string
  groupTitleKey: string
  groupDescriptionKey: string
}

/** Every setting row the page draws, in the page's own order. */
const SETTINGS: readonly SettingEntry[] = [
  {
    anchor: "appearance",
    titleKey: "settings.theme.title",
    descriptionKey: "settings.theme.description",
    groupTitleKey: "settings.appearance.title",
    groupDescriptionKey: "settings.appearance.description",
  },
  {
    anchor: "appearance",
    titleKey: "settings.language.title",
    descriptionKey: "settings.language.description",
    groupTitleKey: "settings.appearance.title",
    groupDescriptionKey: "settings.appearance.description",
  },
  {
    anchor: "appearance",
    titleKey: "settings.layout.title",
    descriptionKey: "settings.layout.description",
    groupTitleKey: "settings.appearance.title",
    groupDescriptionKey: "settings.appearance.description",
  },
  {
    anchor: "install",
    titleKey: "settings.install.auto",
    descriptionKey: "settings.install.auto.description",
    groupTitleKey: "settings.install.title",
    groupDescriptionKey: "settings.install.description",
  },
  {
    anchor: "install",
    titleKey: "settings.install.link",
    descriptionKey: "settings.install.link.description",
    groupTitleKey: "settings.install.title",
    groupDescriptionKey: "settings.install.description",
  },
  {
    anchor: "install",
    titleKey: "settings.install.copy",
    descriptionKey: "settings.install.copy.description",
    groupTitleKey: "settings.install.title",
    groupDescriptionKey: "settings.install.description",
  },
  {
    anchor: "images",
    titleKey: "settings.images.download.title",
    descriptionKey: "settings.images.download.description",
    groupTitleKey: "settings.images.title",
    groupDescriptionKey: "settings.images.description",
  },
  {
    anchor: "about",
    titleKey: "settings.about.version",
    groupTitleKey: "settings.about.title",
    groupDescriptionKey: "settings.about.description",
  },
  {
    anchor: "about",
    titleKey: "settings.about.home",
    groupTitleKey: "settings.about.title",
    groupDescriptionKey: "settings.about.description",
  },
  {
    anchor: "about",
    titleKey: "settings.about.host",
    groupTitleKey: "settings.about.title",
    groupDescriptionKey: "settings.about.description",
  },
]

/**
 * Build the settings provider.
 *
 * @param t — the active locale's lookup, called at search time so a language
 *   switch reaches the next query.
 * @param sections — the plugin sections to include, read at search time.
 * @returns the provider the palette reads.
 */
export function settingsContribution(
  t: (key: string) => string,
  sections: () => readonly SettingsSectionContribution[] = () => []
): SearchContribution {
  return {
    labelKey: "search.group.settings",
    icon: SettingsIcon,
    search: (query) => searchSettings(t, query, sections()),
  }
}

/**
 * Build the extensions provider.
 *
 * @param entries — reads the kernel's catalog at search time, so a package
 *   enabled while the palette is open is found by the next query.
 * @returns the provider the palette reads.
 */
export function extensionsContribution(
  entries: () => readonly ExtensionView[]
): SearchContribution {
  return {
    labelKey: "search.group.extensions",
    icon: BlocksIcon,
    search: (query) => searchExtensions(entries(), query),
  }
}

/**
 * The settings rows matching one query.
 *
 * A row matches on its own title and description as well as its group's, so
 * typing "images" finds the download row even though its own words say nothing
 * about the group it sits in. Plugin sections are searched the same way; they
 * sit between the shell's last fixed group and About, matching the page.
 *
 * @param t — the active locale's lookup.
 * @param query — what the person typed.
 * @param sections — the plugin sections to include.
 * @returns the matching rows, each opening the group it belongs to.
 */
export function searchSettings(
  t: (key: string) => string,
  query: string,
  sections: readonly SettingsSectionContribution[] = []
): SearchResult[] {
  const about = SETTINGS.filter((entry) => entry.anchor === "about")
  const shell = SETTINGS.filter((entry) => entry.anchor !== "about")
  return [
    ...searchShellSettings(t, query, shell),
    ...searchSections(t, query, sections),
    ...searchShellSettings(t, query, about),
  ]
}

/** The shell's own settings rows matching one query. */
function searchShellSettings(
  t: (key: string) => string,
  query: string,
  entries: readonly SettingEntry[]
): SearchResult[] {
  return entries.flatMap((entry) => {
    const title = t(entry.titleKey)
    const description =
      entry.descriptionKey === undefined ? undefined : t(entry.descriptionKey)
    if (
      !matchesQuery(
        query,
        title,
        description,
        t(entry.groupTitleKey),
        t(entry.groupDescriptionKey)
      )
    ) {
      return []
    }
    return [
      {
        id: `${entry.anchor}:${entry.titleKey}`,
        title,
        ...(description === undefined ? {} : { description }),
        path: `${searchPath("/settings", query)}#${entry.anchor}`,
      },
    ]
  })
}

/** The sections plugins contributed, matching one query. */
function searchSections(
  t: (key: string) => string,
  query: string,
  sections: readonly SettingsSectionContribution[]
): SearchResult[] {
  return sections.flatMap((section) => {
    const title = t(section.titleKey)
    const description = t(section.descriptionKey)
    if (!matchesQuery(query, title, description)) return []
    return [
      {
        id: `settings-section:${section.id}`,
        title,
        description,
        path: `${searchPath("/settings", query)}#${section.id}`,
      },
    ]
  })
}

/**
 * The extensions matching one query.
 *
 * @param entries — the kernel's catalog.
 * @param query — what the person typed.
 * @returns the matching packages, in catalog order.
 */
export function searchExtensions(
  entries: readonly ExtensionView[],
  query: string
): SearchResult[] {
  return entries
    .filter((entry) =>
      matchesQuery(
        query,
        entry.manifest.name,
        entry.manifest.id,
        entry.manifest.description
      )
    )
    .map((entry) => ({
      id: entry.manifest.id,
      title: entry.manifest.name,
      ...(entry.manifest.description === ""
        ? {}
        : { description: entry.manifest.description }),
      icon: entry.manifest.icon,
      path: searchPath("/extensions", query),
    }))
}
