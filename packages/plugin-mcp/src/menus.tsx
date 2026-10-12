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
import type { McpAgentPlace, McpInstall, McpScope, McpServer } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Switch } from "@workspace/ui/components/switch"

/** The panel width both menus share, the same one the skills place menu uses. */
const PANEL = "w-[280px]"

/**
 * Row chrome at the skills place menu's measurements, so the two modules' lists
 * are one family: a 50px row (8px padding around a 34px text column), a 28px
 * tile, a 13.5px name, and a monospaced path.
 */
const ROW = "items-center gap-2.5 px-1.5 py-2"
const TILE = "flex size-7 shrink-0 items-center justify-center overflow-clip rounded-lg bg-secondary ring-1 ring-border ring-inset"
const NAME = "truncate text-[13.5px] leading-[18px] font-semibold text-foreground"
const NOTE = "truncate font-mono text-[12px] leading-[16px] text-muted-foreground"
const GROUP = "flex items-center px-1.5 py-1 text-[11.5px] font-semibold text-muted-soft"

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
 */
const TRIGGER = "h-8 rounded-full px-3 text-[12.5px] font-medium text-foreground bg-secondary"

/** A client's mark at the size a menu row draws it, as its own extension drew it. */
function PlaceMark({ place }: { place: McpAgentPlace }) {
  return <place.icon className="size-[17px]" aria-hidden />
}

/** What a menu shows when no extension contributes a file to write into. */
function NoPlaces() {
  const { t } = useI18n()
  return (
    <div className={cn("flex", ROW)}>
      <span className={NOTE}>{t("mcp.place.none")}</span>
    </div>
  )
}

/**
 * The head both panels open with: what the list is for, and its tally. It
 * carries the same type the skills module's place menu labels its list with —
 * a muted 12px title and a monospaced count — so the two menus read alike.
 */
function MenuHead({ title, tally }: { title: string; tally: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-1.5 py-1 text-xs text-muted-foreground">
      <span className="font-medium">{title}</span>
      <span className="flex-1" />
      <span className="font-mono text-[11px] font-normal">{tally}</span>
    </div>
  )
}

/** The places of each scope, in the order the catalog lists them. */
function scoped(places: readonly McpAgentPlace[]) {
  return MCP_SCOPES.map((scope) => ({
    scope,
    places: places.filter((place) => place.scope === scope),
  })).filter((group) => group.places.length > 0)
}

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
      <DropdownMenuContent
        align={align}
        sideOffset={6}
        /* A menu drawn in a portal is still a React child of whatever opened
           it, so its clicks bubble to that element's own handler: on a row,
           choosing a place would also open the server it belongs to. */
        onClick={stop}
        className={PANEL}
      >
        <MenuHead
          title={t("mcp.action.installTo")}
          tally={t("mcp.detail.place.count").replace("{count}", String(places.length))}
        />
        {places.length === 0 ? <NoPlaces /> : null}
        {scoped(places).map((group, index) => (
          <React.Fragment key={group.scope}>
            {/* Two scopes are two different answers — a file this workspace
                owns, and one every workspace shares — so a rule keeps them
                apart. The first needs none. */}
            {index === 0 ? null : <DropdownMenuSeparator />}
            <div className={GROUP}>{t(`mcp.detail.group.${group.scope}`)}</div>
            {group.places.map((place) => {
              const held: McpInstall | undefined = state.get(place.id)
              return (
                <DropdownMenuItem
                  key={place.id}
                  /* Installing can go to several files, and the row just taken
                     shows its mark in place, so the menu stays up. */
                  closeOnClick={false}
                  onClick={() => onToggle(place.id)}
                  className={ROW}
                >
                  <span className={TILE}>
                    <PlaceMark place={place} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col text-left">
                    <span className={NAME}>{place.label}</span>
                    <span className={NOTE}>{place.path}</span>
                  </span>
                  {/* Written in, the row shows a check; not written, an empty
                      box, which is what the canvas draws for each state. */}
                  {held?.installed === true ? (
                    <CheckIcon className="size-[18px] shrink-0 text-foreground" />
                  ) : (
                    <Checkbox
                      checked={false}
                      aria-hidden
                      tabIndex={-1}
                      className="size-[18px] shrink-0"
                    />
                  )}
                </DropdownMenuItem>
              )
            })}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
      <DropdownMenuContent
        align={align}
        sideOffset={6}
        onClick={stop}
        className={PANEL}
      >
        <MenuHead
          title={t("mcp.menu.enabled.title")}
          tally={t("mcp.menu.enabled.tally").replace(
            "{count}",
            String(onCount(server.detail.installs))
          )}
        />
        {scoped(places).map((group, index) => (
          <React.Fragment key={group.scope}>
            {/* The same two scopes the install menu separates, so a client that
                appears in both — Claude Code, here and machine-wide — is never
                two identical-looking rows in one list. */}
            {index === 0 ? null : <DropdownMenuSeparator />}
            <div className={GROUP}>{t(`mcp.detail.group.${group.scope}`)}</div>
            {group.places.map((place) => {
              const held: McpInstall | undefined = state.get(place.id)
              /* A client whose extension offers no switch is the hub's business
                 to install for and nobody's to toggle: its row says so instead
                 of showing a control that would not mean anything. */
              const selfManaged = !place.switchable
              return (
                <div key={place.id} className={cn("flex", ROW)}>
                  <span className={TILE}>
                    <PlaceMark place={place} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={NAME}>{place.label}</span>
                    <span className={cn(NOTE, selfManaged && "text-muted-soft")}>
                      {selfManaged
                        ? t("mcp.detail.place.selfManaged")
                        : t("mcp.menu.enabled.note")
                            .replace("{scope}", t(scopeWord(place.scope)))
                            .replace(
                              "{state}",
                              t(held?.enabled === true ? "mcp.place.on" : "mcp.place.off")
                            )}
                    </span>
                  </span>
                  {selfManaged ? (
                    <span className="flex h-5 shrink-0 items-center rounded-full bg-secondary px-2 text-[11.5px] leading-[1.3] text-muted-foreground">
                      {t("mcp.detail.place.self")}
                    </span>
                  ) : (
                    <Switch
                      checked={held?.enabled === true}
                      onCheckedChange={(next) => onSetPlaceEnabled(place.id, next)}
                      aria-label={place.label}
                      className="data-unchecked:bg-secondary"
                    />
                  )}
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
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
