/**
 * The two actions a pack carries: bringing it up to what its source holds, and
 * delivering it to an agent at a scope.
 *
 * "Installed" is not one state here. A pack can be in a person's own
 * configuration, in one repository's, or in both at once, and the three are
 * separate places — so the action is a menu of scopes rather than a switch. The
 * menu is what the MCP module settled on for the same reason.
 *
 * The menu lives in a portal but is still a React child of the row it sits in,
 * so its clicks stop there: without that, opening the menu would also open the
 * pack's own lightbox.
 */
import { CheckIcon, DownloadIcon } from "lucide-react"

import type { PluginInstallScope } from "./contract.ts"
import type { PluginClient } from "./library.ts"
import type { PluginRow } from "./types.ts"

import { useI18n } from "@workspace/extensions/react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

/**
 * The words for each scope. Which agent installs into which scope is the
 * agent's own declaration, carried by the installer; only the words live here,
 * because they are this page's.
 */
const SCOPE_LABELS: Record<PluginInstallScope, string> = {
  user: "plugins.scope.user",
  project: "plugins.scope.project",
  local: "plugins.scope.local",
}

/** The button shape every action in this cluster wears. */
const shell =
  "h-8 gap-1.5 rounded-full px-3 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * The scope menu: one group per client, with an indented action per scope, each
 * showing whether the pack is already there and acting as a toggle for that one
 * place. A client that is not on this machine is listed as unavailable rather
 * than hidden, so a person knows the hub looked for it.
 */
function ScopeMenu({
  plugin,
  clients,
  busy,
  onInstall,
  onUninstall,
}: {
  plugin: PluginRow
  /** The clients this hub can deliver to, with what each one already holds. */
  clients: readonly PluginClient[]
  busy: boolean
  onInstall: (client: string, scope: PluginInstallScope) => void
  onUninstall: (client: string, scope: PluginInstallScope) => void
}) {
  const { t } = useI18n()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            aria-label={`${t("plugins.action.installTo")} ${plugin.name}`}
            onClick={(event) => event.stopPropagation()}
            className={`${shell} border-border bg-transparent dark:border-input dark:bg-transparent`}
          />
        }
      >
        <DownloadIcon className="size-3.5" />
        {t("plugins.action.installTo")}
        <ChevronDownGlyph />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        /* A portal renders elsewhere but stays this row's React child. */
        onClick={(event) => event.stopPropagation()}
        className="w-[272px] p-1"
      >
        {clients.map((client, index) => {
          const held = client.delivered[plugin.id] ?? []
          const Mark = client.icon
          return (
            <div key={client.id}>
              {/* A group label is only meaningful inside a group, and Base UI
                  refuses one that stands alone. */}
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-1.5 px-1.5 py-1 text-[11.5px] font-semibold text-muted-soft">
                  <Mark className="size-3.5 shrink-0" aria-hidden />
                  {client.label}
                  {client.available ? null : (
                    <span className="ml-auto font-normal">{t("plugins.client.absent")}</span>
                  )}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              {client.scopes.map((scope) => {
                const here = held.includes(scope)
                return (
                  <DropdownMenuItem
                    key={`${client.id}:${scope}`}
                    /* Acting here must not close the menu: a person installs into
                       more than one place in a row, and a menu that shuts each
                       time makes that several gestures instead of one. */
                    closeOnClick={false}
                    disabled={busy || !client.available}
                    onClick={() => (here ? onUninstall(client.id, scope) : onInstall(client.id, scope))}
                    className="gap-2.5 px-1.5 py-2 pl-4"
                  >
                    <span className="text-[13px] leading-[18px] font-semibold">
                      {t(SCOPE_LABELS[scope])}
                    </span>
                    {here ? <CheckIcon className="ml-auto size-4 shrink-0 text-primary" /> : null}
                  </DropdownMenuItem>
                )
              })}
              {index < clients.length - 1 ? <DropdownMenuSeparator /> : null}
            </div>
          )
        })}
        <DropdownMenuSeparator />
        <p className="px-1.5 py-1 text-[11.5px] leading-[16px] text-muted-soft">
          {t("plugins.scope.hint")}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A small chevron drawn inline, so the menu trigger needs no extra import. */
function ChevronDownGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden="true">
      <path
        d="m6 9 6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The update action. A pack whose files were edited here is asked about first:
 * an update replaces them, and that is not something to discover afterwards.
 * One whose files match what landed needs no such confirmation.
 */
function UpdateAction({
  plugin,
  busy,
  onUpdate,
}: {
  plugin: PluginRow
  busy: boolean
  onUpdate: () => void
}) {
  const { t } = useI18n()
  const tone = `${shell} bg-amber-600 text-white hover:bg-amber-600/90 dark:bg-amber-500`

  if (plugin.modified !== true) {
    return (
      <Button
        type="button"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation()
          onUpdate()
        }}
        title={t("plugins.update.available")}
        className={tone}
      >
        {t("plugins.update.action")}
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            disabled={busy}
            title={t("plugins.update.modified")}
            className={tone}
          />
        }
      >
        {t("plugins.update.action")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("plugins.update.confirm.title").replace("{name}", plugin.name)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("plugins.update.confirm.text")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("plugins.action.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.stopPropagation()
              onUpdate()
            }}
          >
            {t("plugins.update.action")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * The actions a row or the lightbox footer shows: update when the source has
 * moved, and the scope menu. A pack whose source cannot be asked has no update
 * action at all, rather than one that never does anything.
 */
export function PluginActions({
  plugin,
  clients,
  busy,
  onUpdate,
  onInstall,
  onUninstall,
}: {
  plugin: PluginRow
  clients: readonly PluginClient[]
  busy: boolean
  onUpdate: () => void
  onInstall: (client: string, scope: PluginInstallScope) => void
  onUninstall: (client: string, scope: PluginInstallScope) => void
}) {
  return (
    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
      {plugin.outdated === true ? (
        <UpdateAction plugin={plugin} busy={busy} onUpdate={onUpdate} />
      ) : null}
      <ScopeMenu
        plugin={plugin}
        clients={clients}
        busy={busy}
        onInstall={onInstall}
        onUninstall={onUninstall}
      />
    </div>
  )
}
