/**
 * A client extension written the way one downloaded from GitHub is written: a
 * folder of files that imports nothing. React, the icons, the i18n service, the
 * file readers, and the editors it writes its client's file with all arrive
 * through the kernel — the package they live in is not on this plugin's disk.
 *
 * Acme Code is a made-up client, kept here as the worked example: one
 * workspace file, JSONC, the same `mcpServers` key the JSON clients use, and no
 * switch of its own. It is copied verbatim into a plugin space by
 * `packages/resources/mcp/scripts/check-plugin.ts`, which runs it against real
 * files.
 *
 * What it needs, and where each arrives — `plugin.json` declares the services,
 * so this file only reads them:
 *   - the registry (and through it the toolkit): the `mcp` service
 *   - the mark on its place row: `ctx.icons`
 *   - the words for its failures: the `locales` service it registers into
 */
export function apply(ctx) {
  /* Its own errors are the plugin's own words: the key is translated by the pack
     below, so a person reads a sentence rather than the key. */
  ctx.locales.register({
    id: "en",
    messages: {
      "acme.error.read": "Acme Code's config file could not be read.",
      "acme.error.write": "The hub could not write Acme Code's config file.",
      "acme.error.unknownPlace": "Acme Code has no client file called {place}.",
    },
  })
  ctx.locales.register({
    id: "zh-CN",
    messages: {
      "acme.error.read": "读不到 Acme Code 的配置文件。",
      "acme.error.write": "无法写入 Acme Code 的配置文件。",
      "acme.error.unknownPlace": "Acme Code 没有名为 {place} 的客户端文件。",
    },
  })

  /* Everything below is read off the service — there is no import to write. */
  const {
    readJsonObject,
    editJson,
    jsonValueLines,
    readDeclaration,
    writeDeclaration,
    McpError,
  } = ctx.mcp.tools

  const PLACE = { id: "acme", scope: "workspace", file: ".acme/mcp.json" }
  const KEY = "mcpServers"

  const fileOf = (place) => {
    if (place !== PLACE.id) throw new McpError("acme.error.unknownPlace", { place })
    return PLACE
  }

  const read = async (io, place) => {
    try {
      return await io.files.read(fileOf(place))
    } catch (error) {
      throw new McpError("acme.error.read", undefined, String(error))
    }
  }

  const write = async (io, place, text) => {
    try {
      await io.files.write(fileOf(place), text)
    } catch (error) {
      throw new McpError("acme.error.write", undefined, String(error))
    }
  }

  /* A file this client's reader cannot make sense of is this plugin's failure
     to name, not a stack line for a person to read. */
  const serversIn = (text) => {
    try {
      const held = readJsonObject(text)?.[KEY]
      return typeof held === "object" && held !== null ? held : {}
    } catch (error) {
      throw new McpError("acme.error.read", undefined, String(error))
    }
  }

  ctx.mcp.register({
    /* The id names this plugin, which is how the page finds the icon its
       manifest declares — a place carries no mark of its own. */
    id: "acme.mcp",
    places: [{ ...PLACE, label: "Acme", switchable: false }],

    async read(io, place) {
      const held = serversIn(await read(io, place))
      return Object.entries(held).map(([name, entry]) => ({
        name,
        declaration: readDeclaration(entry),
        enabled: true,
      }))
    },

    async install(io, place, name, declaration) {
      const text = await read(io, place)
      await write(io, place, editJson(text, [KEY, name], writeDeclaration(declaration)))
    },

    async uninstall(io, place, name) {
      /* Only this one entry leaves, even when it was the last: a file the hub
         may have created is not the hub's to delete later. */
      const text = await read(io, place)
      await write(io, place, editJson(text, [KEY, name], undefined))
    },

    async locate(io, place, name) {
      const text = await read(io, place)
      serversIn(text)
      return text === null ? null : jsonValueLines(text, [KEY, name])
    },
  })
}
