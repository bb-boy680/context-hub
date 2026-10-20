/**
 * The extension-market update controls on the settings page.
 *
 * The page draws the heading and card around this; the controls belong to the
 * extension market. The stored value is validated here rather than by the
 * shell, because the shape is this feature's own.
 */
import { useI18n, usePluginSettings } from "@context-hub/extensions/react"
import {
  Segmented,
  SettingRow,
  SettingSwitch,
} from "@context-hub/extensions/components"
import { Input } from "@context-hub/shadcn-ui/components/input"

import {
  DEFAULT_EXTENSION_UPDATE_SETTINGS,
  EXTENSION_UPDATES_ID,
  readExtensionUpdateSettings,
  type ExtensionCheckTiming,
  type ExtensionUpdateSettings as ExtensionUpdateSettingsValue,
} from "@/lib/extension-updates"

export function ExtensionUpdateSettings({ needle = "" }: { needle?: string }) {
  const { t } = useI18n()
  const stored = usePluginSettings<ExtensionUpdateSettingsValue>(
    EXTENSION_UPDATES_ID,
    DEFAULT_EXTENSION_UPDATE_SETTINGS
  )
  const settings = readExtensionUpdateSettings(stored.value)

  const update = (patch: Partial<ExtensionUpdateSettingsValue>): void => {
    /* Replace the whole namespace value; keep the internal timestamp. */
    stored.set({ ...settings, ...patch })
  }

  const timings: { id: ExtensionCheckTiming; label: string }[] = [
    { id: "manual", label: t("settings.extensions.check.manual") },
    { id: "startup", label: t("settings.extensions.check.startup") },
    { id: "daily", label: t("settings.extensions.check.daily") },
  ]

  return (
    <div className="flex flex-col divide-y divide-border">
      <SettingRow
        title={t("settings.extensions.check")}
        description={t("settings.extensions.check.description")}
        needle={needle}
      >
        <Segmented
          value={settings.check}
          options={timings}
          onChange={(check) => update({ check })}
        />
      </SettingRow>
      {settings.check === "daily" ? (
        <SettingRow
          title={t("settings.extensions.dailyAt")}
          description={t("settings.extensions.dailyAt.description")}
          needle={needle}
        >
          <Input
            type="time"
            value={settings.dailyAt}
            onChange={(event) => update({ dailyAt: event.target.value })}
            aria-label={t("settings.extensions.dailyAt")}
            className="h-10 w-32"
          />
        </SettingRow>
      ) : null}
      <SettingRow
        title={t("settings.extensions.autoUpdate")}
        description={t("settings.extensions.autoUpdate.description")}
        needle={needle}
      >
        <SettingSwitch
          checked={settings.autoUpdate}
          onCheckedChange={(autoUpdate) => update({ autoUpdate })}
          label={t("settings.extensions.autoUpdate")}
        />
      </SettingRow>
    </div>
  )
}
