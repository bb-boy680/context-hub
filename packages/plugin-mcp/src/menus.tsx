/**
 * The two menus a row, a card and the detail panel all open. They answer the two
 * questions the canvas keeps apart: which files a declaration is written into
 * ("安装到"), and which clients will connect the server ("停用"). A declaration
 * living in a file and a client loading it are separate facts, so the two menus
 * share a shape but never a state: one writes files, the other writes the
 * client's own disable list.
 */
import { CheckIcon, ChevronDownIcon, PowerIcon } from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import { MCP_SCOPES, onCount } from "./installs.ts"
import { placeWords } from "./place-words.ts"
import type { McpAgentPlace, McpInstall, McpScope, McpServer } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"
import { PlaceMenu } from "@workspace/extensions/components/place-picker"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
 * open state and the click that toggles the menu ? a wrapper that destructures
 * only its own props would drop every one of them and the menu would never open.
 */
const TRIGGER = "h-8 rounded-full px-3 text-[12.5px] font-medium text-foreground bg-secondary"

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
}: {
  server: McpServer
  places: readonly McpAgentPlace[]
  onToggle: (place: string) => void
  /** The batch bar's menu opens under a wide row, so it may need the other edge. */
  align?: "start" | "end"
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
            onClick={stop}
            className={cn(TRIGGER, "gap-[5px]")}
          >
            {t("mcp.action.installTo")}
            <ChevronDownIcon className="size-[13px] text-muted-foreground" />
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
        /* Written in, the row shows a check; not written, an empty box, which is
           what the canvas draws for each state. */
        trailing={(option) =>
          option.selected === true ? (
            <CheckIcon className="size-[18px] shrink-0 text-foreground" />
          ) : (
            <Checkbox
              checked={false}
              aria-hidden
              tabIndex={-1}
              className="size-[18px] shrink-0"
            />
          )
        }
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
 * The line under a client's name in the enabled menu: which scope and client
 * state the row is about, or the word of a client the hub may not speak for.
 *
 * @param t ? the active locale's lookup.
 * @param place ? the client this row stands for.
 * @param held ? what the hub recorded for this server in that place.
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

/** Which clients will connect a server, and which the hub may not speak for. */
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="secondary"
            aria-label={t("mcp.action.enabled")}
            onClick={stop}
            className={cn(TRIGGER, "gap-1.5")}
          >
            <PowerIcon className="size-[14px]" />
            {t("mcp.action.enabled")}
            <ChevronDownIcon className="size-[13px] text-muted-foreground" />
          </Button>
        }
      />
      <PlaceMenu
        title={t("mcp.menu.enabled.title")}
        words={{
          ...placeWords(t),
          count: (total) => t("mcp.menu.enabled.tally").replace("{count}", String(total)),
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
          /* A client whose extension offers no switch is the hub's business to
             install for and nobody's to toggle: its row says so instead of
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
              checked={state.get(option.id)?.enabled === true}
              onCheckedChange={(next) => onSetPlaceEnabled(option.id, next)}
              aria-label={option.label}
              className="data-unchecked:bg-secondary"
            />
          )
        }}
        groups={MCP_SCOPES.map((scope) => ({
          label: t(`mcp.detail.group.${scope}`),
          options: places
            .filter((place) => place.scope === scope)
            .map((place) => ({
              id: place.id,
              icon: place.icon,
              label: place.label,
              note: enabledNote(t, place, state.get(place.id)),
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
