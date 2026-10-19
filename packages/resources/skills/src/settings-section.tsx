/**
 * The skill-update settings a person changes on the settings page.
 *
 * The page draws the heading and the card around this; everything below is the
 * two controls that belong to this plugin. The stored value is validated here,
 * not by the shell, because the shape is this plugin's own.
 */
import { useHub, useI18n, usePluginSettings } from "@context-hub/extensions/react"
import {
  Segmented,
  SettingRow,
  SettingSwitch,
} from "@context-hub/extensions/components"
import { Input } from "@context-hub/shadcn-ui/components/input"

import { SKILLS_ID } from "./extension.ts"
import {
  DEFAULT_SKILL_UPDATE_SETTINGS,
  readSkillUpdateSettings,
  type SkillCheckTiming,
  type SkillUpdateSettings,
} from "./update-settings.ts"

export function SkillSettingsSection() {
  const { t } = useI18n()
  const ctx = useHub()
  const stored = usePluginSettings<SkillUpdateSettings>(
    SKILLS_ID,
    DEFAULT_SKILL_UPDATE_SETTINGS
  )
  const settings = readSkillUpdateSettings(stored.value)

  const update = (patch: Partial<SkillUpdateSettings>): void => {
    /* Replace the whole namespace value; keep the internal timestamp. */
    stored.set({ ...settings, ...patch })
  }

  const timings: { id: SkillCheckTiming; label: string }[] = [
    { id: "manual", label: t("skills.settings.check.manual") },
    { id: "startup", label: t("skills.settings.check.startup") },
    { id: "daily", label: t("skills.settings.check.daily") },
  ]

  return (
    <div className="flex flex-col divide-y divide-border">
      <SettingRow
        title={t("skills.settings.check")}
        description={t("skills.settings.check.description")}
      >
        <Segmented
          value={settings.check}
          options={timings}
          onChange={(check) => update({ check })}
        />
      </SettingRow>
      {settings.check === "daily" ? (
        <SettingRow
          title={t("skills.settings.dailyAt")}
          description={t("skills.settings.dailyAt.description")}
        >
          <Input
            type="time"
            value={settings.dailyAt}
            onChange={(event) => update({ dailyAt: event.target.value })}
            aria-label={t("skills.settings.dailyAt")}
            className="h-10 w-32"
          />
        </SettingRow>
      ) : null}
      <SettingRow
        title={t("skills.settings.autoDownload")}
        description={t("skills.settings.autoDownload.description")}
      >
        <SettingSwitch
          checked={settings.autoDownload}
          onCheckedChange={(autoDownload) => update({ autoDownload })}
          label={t("skills.settings.autoDownload")}
        />
      </SettingRow>
      {ctx.get("hub.skills") === undefined ? (
        <p className="py-4 text-[13px] text-muted-foreground">
          {t("skills.empty.noLibraryHint")}
        </p>
      ) : null}
    </div>
  )
}
