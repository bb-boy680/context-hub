/**
 * The plugin-update settings a person changes on the settings page.
 *
 * The page draws the heading and the card around this; everything below is the
 * two controls that belong to this plugin. The stored value is validated here,
 * not by the shell, because the shape is this plugin's own.
 */
import { useI18n, usePluginSettings } from "@context-hub/extensions/react"
import {
  Segmented,
  SettingRow,
  SettingSwitch,
} from "@context-hub/extensions/components"
import { Input } from "@context-hub/shadcn-ui/components/input"

import { PLUGINS_ID } from "./contract.ts"
import {
  DEFAULT_PLUGIN_UPDATE_SETTINGS,
  readPluginUpdateSettings,
  type PluginCheckTiming,
  type PluginUpdateSettings,
} from "./update-settings.ts"

export function PluginsSettingsSection() {
  const { t } = useI18n()
  const stored = usePluginSettings<PluginUpdateSettings>(
    PLUGINS_ID,
    DEFAULT_PLUGIN_UPDATE_SETTINGS
  )
  const settings = readPluginUpdateSettings(stored.value)

  const update = (patch: Partial<PluginUpdateSettings>): void => {
    /* Replace the whole namespace value; keep the internal timestamp. */
    stored.set({ ...settings, ...patch })
  }

  const timings: { id: PluginCheckTiming; label: string }[] = [
    { id: "manual", label: t("plugins.settings.check.manual") },
    { id: "startup", label: t("plugins.settings.check.startup") },
    { id: "daily", label: t("plugins.settings.check.daily") },
  ]

  return (
    <div className="flex flex-col divide-y divide-border">
      <SettingRow
        title={t("plugins.settings.check")}
        description={t("plugins.settings.check.description")}
      >
        <Segmented
          value={settings.check}
          options={timings}
          onChange={(check) => update({ check })}
        />
      </SettingRow>
      {settings.check === "daily" ? (
        <SettingRow
          title={t("plugins.settings.dailyAt")}
          description={t("plugins.settings.dailyAt.description")}
        >
          <Input
            type="time"
            value={settings.dailyAt}
            onChange={(event) => update({ dailyAt: event.target.value })}
            aria-label={t("plugins.settings.dailyAt")}
            className="h-10 w-32"
          />
        </SettingRow>
      ) : null}
      <SettingRow
        title={t("plugins.settings.autoDownload")}
        description={t("plugins.settings.autoDownload.description")}
      >
        <SettingSwitch
          checked={settings.autoDownload}
          onCheckedChange={(autoDownload) => update({ autoDownload })}
          label={t("plugins.settings.autoDownload")}
        />
      </SettingRow>
    </div>
  )
}
