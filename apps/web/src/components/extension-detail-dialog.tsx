/**
 * Detail dialog for one extension: what it is, what it contributes, and which
 * permissions it asks for, with the install or uninstall action in its footer.
 */
import { DownloadIcon, Trash2Icon, XIcon } from "lucide-react"
import * as React from "react"

import { categoryTile } from "@/lib/extensions"
import type { ExtensionView } from "@workspace/extensions"
import {
  useExtensionContributions,
  useHub,
  useI18n,
} from "@workspace/extensions/react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] leading-[17px] font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-full bg-secondary px-2 text-[11.5px] font-medium text-secondary-foreground">
      {children}
    </span>
  )
}

function ContributionList({ entry }: { entry: ExtensionView }) {
  const { t } = useI18n()
  const locales = useExtensionContributions(entry.manifest.id, "locale")
  const targets = useExtensionContributions(entry.manifest.id, "target")
  const { capabilities } = useHub().host

  return (
    <div className="flex flex-col gap-4">
      {locales.length > 0
        ? locales.map((locale) => (
            <div key={locale.id} className="flex items-center gap-2 text-[13px]">
              <span className="font-medium">{locale.label}</span>
              <span className="text-muted-foreground">{locale.id}</span>
              <Chip>{`${Object.keys(locale.messages).length} keys`}</Chip>
            </div>
          ))
        : null}
      {targets.map((target) => (
        <div key={target.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-medium">{target.displayName}</span>
            {target.supports.map((kind) => (
              <Chip key={kind}>{t(`extensions.asset.${kind}`)}</Chip>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t("extensions.detail.locations")}
            </span>
            {target.locations.map((location) => (
              <div
                key={location.path}
                className="flex items-center justify-between gap-3 text-[13px]"
              >
                <span>{location.label}</span>
                <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                  {location.path}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 text-[13px]">
            <span className="shrink-0 text-muted-foreground">
              {t("extensions.detail.format")}
            </span>
            <span className="min-w-0">{target.format}</span>
          </div>
          {!capabilities.filesystem ? (
            <p className="rounded-md bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
              {t("extensions.requiresRuntime")}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function ExtensionDetailBody({ entry }: { entry: ExtensionView }) {
  const { t } = useI18n()
  const ctx = useHub()
  const { manifest } = entry
  const Icon = manifest.icon
  const permissions = manifest.permissions ?? []

  return (
    <>
      <div className="flex h-[84px] shrink-0 items-center gap-3.5 px-6 pt-[22px] pb-[18px]">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-[10px] ${categoryTile[manifest.category]}`}
        >
          <Icon className="size-5 text-secondary-foreground" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle className="flex items-center gap-2 text-base leading-[21px] font-semibold">
            {manifest.name}
            <Badge variant="secondary">{t(`extensions.kind.${manifest.kind}`)}</Badge>
          </DialogTitle>
          <DialogDescription className="truncate text-[13px] leading-4">
            {`v${manifest.version}  ·  ${t("extensions.detail.form")} ${ctx.host.form}`}
          </DialogDescription>
        </div>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto shrink-0"
              aria-label="Close"
            />
          }
        >
          <XIcon className="text-muted-foreground" />
        </DialogClose>
      </div>
      <div className="flex max-h-[60vh] shrink-0 flex-col gap-5 overflow-y-auto border-t border-border px-6 py-5">
        {entry.status === "error" && entry.error !== undefined ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
            {entry.error}
          </p>
        ) : null}
        <Section title={t("extensions.detail.about")}>
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {manifest.description}
          </p>
        </Section>
        <Section title={t("extensions.detail.contributes")}>
          {manifest.kind === "builtin" ? (
            <p className="text-[13px] text-muted-foreground">
              {t("extensions.detail.noPermissions")}
            </p>
          ) : (
            <ContributionList entry={entry} />
          )}
        </Section>
        <Section title={t("extensions.detail.permissions")}>
          {permissions.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {t("extensions.detail.noPermissions")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {permissions.map((permission) => (
                <Chip key={permission}>{t(`extensions.permission.${permission}`)}</Chip>
              ))}
            </div>
          )}
        </Section>
      </div>
      <div className="flex h-16 shrink-0 items-center justify-end gap-2 border-t border-border px-6">
        <DialogClose render={<Button variant="ghost" />}>
          {t("extensions.action.close")}
        </DialogClose>
        {manifest.locked === true || entry.status === "incompatible" ? null : (
          <Button
            className={
              entry.enabled
                ? `px-3 text-secondary-foreground hover:bg-muted hover:text-foreground ${outline}`
                : "px-3"
            }
            variant={entry.enabled ? "outline" : "default"}
            onClick={() => void ctx.extensions.toggle(manifest.id, !entry.enabled)}
          >
            {entry.enabled ? <Trash2Icon /> : <DownloadIcon />}
            {t(
              entry.enabled
                ? "extensions.action.uninstall"
                : "extensions.action.install"
            )}
          </Button>
        )}
      </div>
    </>
  )
}

/** Detail dialog for one extension; opens from a catalog row. */
export function ExtensionDetailDialog({
  entry,
  onOpenChange,
}: {
  entry: ExtensionView | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex w-[640px] flex-col gap-0 rounded-lg bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-[640px]"
      >
        {entry ? <ExtensionDetailBody key={entry.manifest.id} entry={entry} /> : null}
      </DialogContent>
    </Dialog>
  )
}
