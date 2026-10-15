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
import { SCOPE_LABELS, SCOPES_OF } from "./rows.ts"
import type { PluginRow } from "./types.ts"

import type { AssetScope } from "@workspace/extensions"
import { PlaceMenu } from "@workspace/extensions/components"
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
import { Switch } from "@workspace/ui/components/switch"
import { DropdownMenu, DropdownMenuTrigger } from "@workspace/ui/components/dropdown-menu"

/** The button shape every action in this cluster wears. */
const shell =
  "h-8 gap-1.5 rounded-full px-3 text-[13px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * What a menu trigger puts on top of that shape: the soft fill the MCP page
 * gives its own two, so the controls of the two pages read as one family.
 */
const trigger = `${shell} bg-secondary hover:bg-accent`

/** The two groups a pack's places fall into, in the order the panel lists them. */
const SCOPES: readonly AssetScope[] = ["workspace", "global"]

/**
 * The scope menu: one group per client, with an indented action per scope, each
 * showing whether the pack is already there and acting as a toggle for that one
 * place. A client that is not on this machine is listed as unavailable rather
 * than hidden, so a person knows the hub looked for it; one that could not be
 * read is listed as unread, because its scopes read empty either way and the
 * difference is the whole reason the row is still worth trusting or not.
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

  /* One row per client and place it installs into, run under the group that
     place belongs to. A client that is not on this machine is listed rather than
     hidden, so a person knows the hub looked for it; one whose own list could
     not be read says that instead, because its places read empty either way. */
  const options = clients.flatMap((client) =>
    client.scopes
      .filter((scope): scope is PluginInstallScope => scope === "user" || scope === "project")
      .map((scope) => {
        /* What this agent holds, in its own words — not what this hub delivered
           to it. A pack the agent got from some other marketplace is just as
           installed, and its row has to offer the way out. */
        const at = (plugin.held.find((one) => one.client === client.id)?.scopes ?? []).includes(
          scope
        )
        return {
          id: `${client.id}:${scope}`,
          client: client.id,
          scope,
          icon: client.icon,
          label: client.label,
          /* The place, which is what tells this row from the client's other one. */
          note: t(SCOPE_LABELS[scope] ?? scope),
          selected: at,
          blocked:
            client.error !== undefined
              ? t("plugins.client.unread")
              : !client.available
                ? t("plugins.client.absent")
                : /* A place it is already in can always be left. A new one cannot:
                     delivering into it asks the hub's own marketplace, which
                     lists the packs this hub holds the files of. */
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
          if (at.selected) onUninstall(at.client, at.scope)
          else onInstall(at.client, at.scope)
        }}
        groups={SCOPES.map((group) => ({
          label: t(`plugins.detail.group.${group}`),
          options: options.filter((one) => SCOPES_OF[group].includes(one.scope)),
        })).filter((group) => group.options.length > 0)}
      />
    </DropdownMenu>
  )
}

/**
 * The status menu: which agents hold this pack, where each keeps it, and whether
 * the repository in use loads it.
 *
 * The switch belongs to the repository's own place, because that is the one this
 * hub can name and write. The machine-wide place is the person's own — an agent
 * keeps a single switch for a pack, so the hub reports it there without offering
 * to move it.
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

  /* One row per place an agent answered with. Only the scopes this build has a
     word for, since a client that invents a third is one no row here covers. A
     pack no agent holds has nothing to report, so no button is drawn rather
     than a menu with nothing in it. */
  const known = (scope: string): scope is PluginInstallScope =>
    scope === "user" || scope === "project"
  const places = plugin.held.flatMap((hold) =>
    hold.scopes.filter(known).map((scope) => ({
      id: `${hold.client}:${scope}`,
      client: hold.client,
      scope,
      hold,
    }))
  )
  const byId = new Map(places.map((place) => [place.id, place]))
  /* Which agents keep a switch at all: one that does not says so in its own
     installer, and is nobody's to toggle. */
  const switchable = new Set(clients.filter((one) => one.switchable).map((one) => one.id))

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
        /* How many places load it, rather than how many rows the list holds. */
        count={() => places.filter((one) => one.hold.enabled).length}
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
          /* The machine-wide place is the person's own, and an agent without a
             switch has none at any place: each says whose business it is rather
             than showing a control that would not mean anything. */
          if (place.scope !== "project" || !switchable.has(place.client)) {
            return (
              <span className="flex h-5 shrink-0 items-center rounded-full bg-secondary px-2 text-[11.5px] leading-[1.3] text-muted-foreground">
                {t("plugins.place.self")}
              </span>
            )
          }
          return (
            <Switch
              checked={place.hold.enabled}
              onCheckedChange={(next) => onSetEnabled(place.client, place.scope, next)}
              aria-label={option.label}
              className="data-unchecked:bg-secondary"
            />
          )
        }}
        groups={SCOPES.map((group) => ({
          label: t(`plugins.detail.group.${group}`),
          options: places
            .filter((one) => SCOPES_OF[group].includes(one.scope))
            .map((one) => {
              const here =
                one.scope === "project" && switchable.has(one.client)
              return {
                id: one.id,
                icon: one.hold.icon,
                label: one.hold.label,
                /* The place, then what this agent makes of it there — the two
                   things the menu exists to tell apart. */
                note: here
                  ? t("plugins.menu.enabled.note")
                      .replace("{scope}", t(SCOPE_LABELS[one.scope] ?? one.scope))
                      .replace("{state}", t(one.hold.enabled ? "plugins.place.on" : "plugins.place.off"))
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
