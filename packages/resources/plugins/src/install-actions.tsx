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
import { ChevronDownIcon, DownloadIcon, PowerIcon } from "lucide-react"

import type { PluginInstallScope } from "./contract.ts"
import type { PluginClient } from "./library.ts"
import { placesShown, SCOPE_LABELS, SCOPES } from "./rows.ts"
import type { PluginRow } from "./types.ts"

import { PlaceMenu } from "@context-hub/extensions/components"
import { useI18n } from "@context-hub/extensions/react"
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
} from "@context-hub/shadcn-ui/components/alert-dialog"
import { Button } from "@context-hub/shadcn-ui/components/button"
import { Switch } from "@context-hub/shadcn-ui/components/switch"
import { DropdownMenu, DropdownMenuTrigger } from "@context-hub/shadcn-ui/components/dropdown-menu"

/** The button shape every action in this cluster wears. */
const shell =
  "h-8 gap-1.5 rounded-full px-3 text-[13px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * What a menu trigger puts on top of that shape: the soft fill the MCP page
 * gives its own two, so the controls of the two pages read as one family.
 */
const trigger = `${shell} bg-secondary hover:bg-accent`

/**
 * The install menu: one row per place a client can be given the pack in, run
 * under the group that place belongs to, each showing whether the pack is
 * already there and acting as a toggle for that one place. A client that is not
 * on this machine is listed rather than hidden, so a person knows the hub looked
 * for it; one that could not be read says that instead, because its places read
 * empty either way and the difference is the whole reason the row is still worth
 * trusting or not.
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

  /* Every place the clients declared, which is what they say they install into.
     Nothing here decides which places those are. */
  const options = clients.flatMap((client) =>
    client.places.map((place) => {
      /* What this agent holds, in its own words — not what this hub delivered to
         it. A pack the agent got from some other marketplace is just as
         installed, and its row has to offer the way out. */
      const at = (plugin.held.find((one) => one.client === client.id)?.places ?? []).some(
        (one) => one.scope === place.scopeWord
      )
      return {
        id: `${client.id}:${place.scopeWord}`,
        client: client.id,
        place,
        icon: client.icon,
        label: client.label,
        /* The place, which is what tells this row from the client's other one. */
        note: t(SCOPE_LABELS[place.scopeWord] ?? place.scopeWord),
        selected: at,
        blocked:
          client.error !== undefined
            ? t("plugins.client.unread")
            : !client.available
              ? t("plugins.client.absent")
              : /* A place it is already in can always be left. A new one cannot:
                   delivering into it asks the hub's own marketplace, which lists
                   the packs this hub holds the files of. */
                plugin.stored || at
                ? null
                : t("plugins.install.notHeld"),
      }
    })
  )
  const byId = new Map(options.map((one) => [one.id, one]))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            disabled={busy}
            aria-label={`${t("plugins.action.installTo")} ${plugin.name}`}
            onClick={(event) => event.stopPropagation()}
            className={trigger}
          />
        }
      >
        <DownloadIcon className="size-3.5" />
        {t("plugins.action.installTo")}
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <PlaceMenu
        title={t("plugins.action.installTo")}
        align="end"
        /* Installing can go to several places, and the row just taken shows its
           mark in place, so the menu stays up. */
        closeOnClick={false}
        words={{
          search: t("plugins.place.search"),
          searchClear: t("plugins.place.searchClear"),
          searchEmpty: t("plugins.place.searchEmpty"),
          empty: t("plugins.place.none"),
          count: (total) => t("plugins.location.count").replace("{count}", String(total)),
        }}
        onPick={(id) => {
          const at = byId.get(id)
          if (at === undefined) return
          if (at.selected) onUninstall(at.client, at.place.scopeWord)
          else onInstall(at.client, at.place.scopeWord)
        }}
        groups={SCOPES.map((group) => ({
          label: t(`plugins.detail.group.${group}`),
          options: options.filter((one) => one.place.scope === group),
        })).filter((group) => group.options.length > 0)}
      />
    </DropdownMenu>
  )
}

/**
 * The status menu: every place this pack's switch can be turned at, and what
 * each of them currently says.
 *
 * A place is offered where the pack sits, and where its file decides over one
 * the pack sits in. The second is why the menu is not simply a list of the
 * agent's records: a pack the machine switched on is switched off for one
 * repository by that repository's file, even though nothing is installed there —
 * so a place with no record is still a real switch.
 *
 * A place whose file names no key for the pack falls back to the agent's own
 * answer, which is the whole chain resolved: saying nothing there means the
 * chain decides, and that answer is what it decided.
 */
function EnabledMenu({
  plugin,
  clients,
  busy,
  onSetEnabled,
}: {
  plugin: PluginRow
  clients: readonly PluginClient[]
  busy: boolean
  onSetEnabled: (client: string, scope: PluginInstallScope, on: boolean) => void
}) {
  const { t } = useI18n()

  /* Which places can be switched, and what each answers — read from one place so
     the row's own line and the switch beside it cannot tell different stories. */
  const places = placesShown(plugin, clients)
  const byId = new Map(places.map((one) => [one.id, one]))
  /* Which agents are here at all: one that is not, or whose own list could not be
     read, has nothing this hub may move. */
  const reachable = new Set(
    clients.filter((one) => one.available && one.error === undefined).map((one) => one.id)
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            disabled={busy}
            aria-label={`${t("plugins.action.enabled")} ${plugin.name}`}
            onClick={(event) => event.stopPropagation()}
            className={trigger}
          />
        }
      >
        <PowerIcon className="size-3.5" />
        {t("plugins.action.enabled")}
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <PlaceMenu
        title={t("plugins.menu.enabled.title")}
        /* How many files switch it on, rather than how many rows the list
           holds: a place that says nothing inherits rather than counts. */
        count={() => places.filter((one) => one.recorded === true).length}
        align="end"
        activation="control"
        words={{
          search: t("plugins.place.search"),
          searchClear: t("plugins.place.searchClear"),
          searchEmpty: t("plugins.place.searchEmpty"),
          empty: t("plugins.menu.enabled.empty"),
          count: (total) => t("plugins.menu.enabled.tally").replace("{count}", String(total)),
        }}
        trailing={(option) => {
          const place = byId.get(option.id)
          if (place === undefined) return null
          /* A place its own client declares unswitchable is nobody's to toggle,
             and one this hub cannot reach has nothing it may write: each says
             whose business it is rather than showing a control that would move
             something nobody chose. */
          if (!place.declared.switchable || !reachable.has(place.client)) {
            return (
              <span className="flex h-5 shrink-0 items-center rounded-full bg-secondary px-2 text-[11.5px] leading-[1.3] text-muted-foreground">
                {t("plugins.place.self")}
              </span>
            )
          }
          return (
            <Switch
              /* The same value the row's own line reads, and never the agent's
                 answer for the pack: that answer is one value with the whole
                 file chain already resolved into it, so a place this hub just
                 switched off would show as still on wherever a wider place it
                 sits in overrules it. */
              checked={place.on}
              onCheckedChange={(next) =>
                onSetEnabled(place.client, place.declared.scopeWord, next)
              }
              aria-label={option.label}
              className="data-unchecked:bg-secondary"
            />
          )
        }}
        groups={SCOPES.map((group) => ({
          label: t(`plugins.detail.group.${group}`),
          options: places
            .filter((one) => one.declared.scope === group)
            .map((one) => {
              const shown = one.declared.switchable && reachable.has(one.client)
              return {
                id: one.id,
                icon: one.icon,
                label: one.label,
                /* The place, then what this agent makes of it there — the two
                   things the menu exists to tell apart. */
                note: shown
                  ? t("plugins.menu.enabled.note")
                      .replace(
                        "{scope}",
                        t(SCOPE_LABELS[one.declared.scopeWord] ?? one.declared.scopeWord)
                      )
                      .replace(
                        "{state}",
                        t(one.on ? "plugins.place.on" : "plugins.place.off")
                      )
                  : t("plugins.place.selfManaged"),
              }
            }),
        })).filter((group) => group.options.length > 0)}
      />
    </DropdownMenu>
  )
}

/**
 * The update action. A pack whose files were edited here is asked about first:
 * an update replaces them, and that is not something to discover afterwards.
 * One whose files match what landed needs no such confirmation.
 *
 * Exported because the lightbox carries it in the panel's own body rather than
 * beside the place list, and a row's own line is not the place for it.
 */
export function UpdateAction({
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
 * moved, what the agents holding it make of it, and the menu that installs it
 * somewhere new. A pack whose source cannot be asked has no update action at
 * all, rather than one that never does anything.
 */
export function PluginActions({
  plugin,
  clients,
  busy,
  onUpdate,
  onInstall,
  onUninstall,
  onSetEnabled,
}: {
  plugin: PluginRow
  clients: readonly PluginClient[]
  busy: boolean
  onUpdate: () => void
  onInstall: (client: string, scope: PluginInstallScope) => void
  onUninstall: (client: string, scope: PluginInstallScope) => void
  onSetEnabled: (client: string, scope: PluginInstallScope, on: boolean) => void
}) {
  return (
    <div className="flex items-center gap-3" onClick={(event) => event.stopPropagation()}>
      {plugin.outdated === true ? (
        <UpdateAction plugin={plugin} busy={busy} onUpdate={onUpdate} />
      ) : null}
      <EnabledMenu plugin={plugin} clients={clients} busy={busy} onSetEnabled={onSetEnabled} />
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
