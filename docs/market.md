# Plugin market

`/market/plugins` lists the packs in the markets this build ships. The page
itself is `@context-hub/market-plugins`; each market is its own extension and
registers one `MarketSource` into the page's registry. There is no way to add a
source from the page: a source is an extension, so it is enabled, disabled and
updated on the Extensions page.

## Sources

| Extension | Market | Index |
| --- | --- | --- |
| `hub.market.claude-plugins-official` | `claude-plugins-official` | `.claude-plugin/marketplace.json` in `anthropics/claude-plugins-official` |
| `hub.market.codex-plugins` | `openai` | `.agents/plugins/marketplace.json` in `openai/plugins` |

The source rail and each row's badge use the marketplace's own name; the icon
beside it in the rail is that marketplace owner's GitHub avatar.

Both are on by default. Disabling one removes its rows and leaves every pack
already collected in the library, and every pack already delivered to an agent,
where it is.

The page merges every registered source, groups by a normalized category, and
searches across the current source set. The source rail narrows to one source;
a query is matched against name, description, author and category.

## Icons and descriptions

The index is read once and cached for ten minutes; a refresh asks again.

- **Claude Code** entries carry a description in the index. A row's mark is the
  GitHub owner's avatar for a third-party repository; Anthropic's own entries
  use the category mark.
- **Codex** entries carry neither. A row that scrolls into view reads its
  pack's `.codex-plugin/plugin.json` for `description` and `interface.logo`.
  Until that answer lands the row says the source has no description.

Enrichment runs only for rows that enter the viewport, and answers are kept for
the session. A refresh of the index does not throw the marks away.

## Installing

A row that is not in the library offers install: choose an agent and a scope
(this repository, or this machine). The hub collects the pack into the plugin
library first, then lets that agent's own installer deliver it.

The address comes from the index, never from the page's own invention. When the
index publishes a commit, the hub fetches that commit and verifies `HEAD`, so a
branch moving under the index cannot change what a person is installing. Only a
repository, or one directory of one, is accepted; an archive and a local path
are refused, and every address is checked again on the host.

A pack already in the library skips collection and goes straight to delivery.
A failing install keeps the dialog open with the host's own words.

## Adding a source

A new market is a new extension that depends on `@context-hub/market-plugins`,
declares `inject: ["marketSources"]`, and registers a source from `apply`:

```ts
ctx.marketSources?.register(source)
```

A source adapts its index into `MarketEntry` in its own `src/apis/`, validates
each address with `assertMarketInstall` from
`@context-hub/plugins/market-install`, and may answer `enrich` for the rows that
become visible.
