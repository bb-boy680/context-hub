/**
 * The two menus a row, a card and the detail panel all open. They answer the two
 * questions the canvas keeps apart: which files a declaration is written into
 * ("安装到"), and which clients will connect the server ("停用"). A declaration
 * living in a file and a client loading it are separate facts, so the two menus
 * share a shape but never a state: one writes files, the other writes the
 * client's own disable list.
 */
import { ChevronDownIcon, DownloadIcon, PowerIcon } from "lucide-react"
import * as React from "react"

import { MCP_SCOPES, onCount } from "./installs.ts"
import { placeWords } from "./place-words.ts"
import type { McpAgentPlace, McpInstall, McpScope, McpServer } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"
import { PlaceMenu } from "@workspace/extensions/components"
import { Button } from "@workspace/ui/components/button"
import { DropdownMenu, DropdownMenuTrigger } from "@workspace/ui/components/dropdown-menu"
import { Switch } from "@workspace/ui/components/switch"

/**
 * A control that opens a menu without also running whatever the element around
 * it does: the trigger sits inside a row or a card that opens the detail panel.
 */
const stop = (event: React.MouseEvent) => event.stopPropagation()

/**
 * The two triggers carry their own classes rather than a wrapper component: a
 * `render` element IS the trigger, and base-ui hands it `aria-haspopup`, the
 * open state and the click that toggles the menu — a wrapper that destructures
 * only its own props would drop every one of them and the menu would never open.
 *
 * They carry the row action's own measurements too — the 32px pill, the 13px
 * semibold label, the 14px mark, the 12px chevron the skills page gives an
 * install — so a row's controls read as one family on both pages.
 */
const TRIGGER =
  "h-8 gap-1.5 rounded-full px-3 text-[13px] font-semibold text-foreground bg-secondary hover:bg-accent"

/** The scope word a note names, e.g. 本项目 for a workspace place. */
function scopeWord(scope: McpScope): string {
  return scope === "workspace" ? "mcp.detail.place.here" : "mcp.detail.place.machine"
}

/** What action a server's controls need from the page. */
export interface ServerActions {
  places: readonly McpAgentPlace[]
  onTogglePlace: (place: string) => void
  onSetPlaceEnabled: (place: string, enabled: boolean) => void
  /** A probe of this server is running right now. */
  testing: boolean
  onTest: () => void
}

/** Which files a server's declaration is written into. */
export function InstallToMenu({
  server,
  places,
  onToggle,
  align = "start",
  disabled = false,
}: {
  server: McpServer
  places: readonly McpAgentPlace[]
  onToggle: (place: string) => void
  /** The batch bar's menu opens under a wide row, so it may need the other edge. */
  align?: "start" | "end"
  /** A batch has nothing to install until a row is ticked. */
  disabled?: boolean
}) {
  const { t } = useI18n()
  const state = new Map(server.detail.installs.map((install) => [install.place, install]))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="secondary"
            aria-label={t("mcp.action.installTo")}
            disabled={disabled}
            onClick={stop}
            className={TRIGGER}
          >
            <DownloadIcon className="size-3.5" />
            {t("mcp.action.installTo")}
            <ChevronDownIcon className="size-3" />
          </Button>
        }
      />
      <PlaceMenu
        title={t("mcp.action.installTo")}
        words={{ ...placeWords(t), empty: t("mcp.place.none") }}
        align={align}
        /* Installing can go to several files, and the row just taken shows its
           mark in place, so the menu stays up. */
        closeOnClick={false}
        onPick={onToggle}
        groups={MCP_SCOPES.map((scope) => ({
          label: t(`mcp.detail.group.${scope}`),
          options: places
            .filter((place) => place.scope === scope)
            .map((place) => ({
              id: place.id,
              icon: place.icon,
              label: place.label,
              where: place.path,
              selected: state.get(place.id)?.installed === true,
            })),
        })).filter((group) => group.options.length > 0)}
      />
    </DropdownMenu>
  )
}

/**
 * The line under a client's name in the enabled menu: which scope the row is
 * about and whether that scope connects the server, or the word of a place the
 * hub may not speak for.
 *
 * A row is about a scope, not about a file: a client that declared the server
 * outside this scope still connects it here, and this scope may switch that
 * connection off.
 *
 * @param t — the active locale's lookup.
 * @param place — the client this row stands for.
 * @param held — what the client recorded for this server, counted across its
 * places: one client can hold a declaration in one place and its switch in
 * another.
 * @returns the row's second line.
 */
function enabledNote(
  t: (key: string) => string,
  place: McpAgentPlace,
  held: McpInstall | undefined
): string {
  if (!place.switchable) return t("mcp.detail.place.selfManaged")
  return t("mcp.menu.enabled.note")
    .replace("{scope}", t(scopeWord(place.scope)))
    .replace("{state}", t(held?.enabled === true ? "mcp.place.on" : "mcp.place.off"))
}

/**
 * Which clients will connect a server, and which of those the hub may not speak
 * for.
 *
 * A client is listed once it holds the declaration somewhere, and then every
 * place it declares appears — its workspace file and its machine-wide one — so
 * the two switch states can be told apart. A client that never installed the
 * server has nothing to switch and is left out.
 */
export function EnabledMenu({
  server,
  places,
  onSetPlaceEnabled,
  align = "start",
}: {
  server: McpServer
  places: readonly McpAgentPlace[]
  onSetPlaceEnabled: (place: string, enabled: boolean) => void
  align?: "start" | "end"
}) {
  const { t } = useI18n()
  const state = new Map(server.detail.installs.map((install) => [install.place, install]))
  const byId = new Map(places.map((place) => [place.id, place]))
  /* A client holds one switch for one server, wherever its declaration sits, so
     a place with no declaration of its own reads the state its client recorded
     in the place that has one. */
  const held = (place: McpAgentPlace): McpInstall | undefined =>
    state.get(place.id) ??
    server.detail.installs.find((install) => byId.get(install.place)?.client === place.client)
  const installed = new Set(
    server.detail.installs
      .filter((install) => install.installed)
      .map((install) => byId.get(install.place)?.client)
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="secondary"
            aria-label={t("mcp.action.enabled")}
            onClick={stop}
            className={TRIGGER}
          >
            <PowerIcon className="size-3.5" />
            {t("mcp.action.enabled")}
            <ChevronDownIcon className="size-3" />
          </Button>
        }
      />
      <PlaceMenu
        title={t("mcp.menu.enabled.title")}
        words={{
          ...placeWords(t),
          count: (total) => t("mcp.menu.enabled.tally").replace("{count}", String(total)),
          empty: t("mcp.menu.enabled.empty"),
        }}
        /* The tally is how many clients connect it, not how many rows the list
           holds, so it is the page's number rather than the list's. */
        count={() => onCount(server.detail.installs)}
        align={align}
        /* Every row carries its own switch, so the row itself is not the action:
           pressing it must not toggle a client the person never chose. */
        activation="control"
        trailing={(option) => {
          const place = byId.get(option.id)
          /* A place its extension declares unswitchable is the hub's business
             to install for and nobody's to toggle: its row says so instead of
             showing a control that would not mean anything. */
          if (place === undefined || !place.switchable) {
            return (
              <span className="flex h-5 shrink-0 items-center rounded-full bg-secondary px-2 text-[11.5px] leading-[1.3] text-muted-foreground">
                {t("mcp.detail.place.self")}
              </span>
            )
          }
          return (
            <Switch
              checked={held(place)?.enabled === true}
              onCheckedChange={(next) => onSetPlaceEnabled(option.id, next)}
              aria-label={option.label}
              className="data-unchecked:bg-secondary"
            />
          )
        }}
        groups={MCP_SCOPES.map((scope) => ({
          label: t(`mcp.detail.group.${scope}`),
          options: places
            .filter((place) => place.scope === scope && installed.has(place.client))
            .map((place) => ({
              id: place.id,
              icon: place.icon,
              label: place.label,
              note: enabledNote(t, place, held(place)),
            })),
        })).filter((group) => group.options.length > 0)}
      />
    </DropdownMenu>
  )
}

/** Both menus beside each other, which is how a row and a card offer them. */
export function ServerControls({
  server,
  actions,
  align,
}: {
  server: McpServer
  actions: ServerActions
  align?: "start" | "end"
}) {
  return (
    <>
      <EnabledMenu
        server={server}
        places={actions.places}
        onSetPlaceEnabled={actions.onSetPlaceEnabled}
        align={align}
      />
      <InstallToMenu
        server={server}
        places={actions.places}
        onToggle={actions.onTogglePlace}
        align={align}
      />
    </>
  )
}
