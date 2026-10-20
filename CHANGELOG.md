# Changelog

## v0.1.1 (2026-10-20)

### Features

- **desktop:** sync tray menu with application menu ([71496ad](https://github.com/bb-boy680/context-hub/commit/71496ad5fdc3445845afa6f2516a21e199c9d83d))
- **extensions:** lock built-ins and restyle update actions ([95e6b33](https://github.com/bb-boy680/context-hub/commit/95e6b33a86df283298de60a2137eb5ed76e0cf60))

### Chores

- **aoci:** sync v0.1.0 release and folder picker cognition ([ccfcbd2](https://github.com/bb-boy680/context-hub/commit/ccfcbd2cf8f178d0e3e20d26f62244f97ade3664))

**Full Changelog**: https://github.com/bb-boy680/context-hub/compare/v0.1.0...v0.1.1

## v0.1.0 (2026-10-20)

### Features

- **variables:** allow a variable without a value ([1719dbc](https://github.com/bb-boy680/context-hub/commit/1719dbce9495bf70085c0560272802fac5860193))
- **workspaces:** persist a default workspace at the user's home ([2903877](https://github.com/bb-boy680/context-hub/commit/2903877f8d90ac93f742176ed1663367ac44ad12))
- **ui:** unify asset provenance lines and prompt place column ([714369a](https://github.com/bb-boy680/context-hub/commit/714369a90eb367ef38acd966ec3d793bfe6619ea))
- **ui:** show agent marks in asset detail dialogs ([406c18c](https://github.com/bb-boy680/context-hub/commit/406c18cd09d1f3260c95c66977c3fe26b75b45b0))
- **extensions:** add engines compatibility, updates and uninstall ([7d1d0b7](https://github.com/bb-boy680/context-hub/commit/7d1d0b7d85d6475f94366b3593f179aeb57eb6a9))
- **desktop:** move the application menu to the window title bar ([7aae6e4](https://github.com/bb-boy680/context-hub/commit/7aae6e42d4f324df0241f8a383a895947b2127d2))
- **extensions:** move skills.sh into the marketplace ([c05c7b1](https://github.com/bb-boy680/context-hub/commit/c05c7b1cad75bce02d02d28931184e2600577fad))
- **extensions:** adopt plugin.yaml and a built-in marketplace ([6618c55](https://github.com/bb-boy680/context-hub/commit/6618c558d9695a815178ddd0ce19f5134ddb978f))

### Bug Fixes

- **workspaces:** pick desktop folders by path ([409e96c](https://github.com/bb-boy680/context-hub/commit/409e96c48f51233811ffe165726cfa6423866bbf))
- **desktop:** serve the page from Vite during development ([734f83e](https://github.com/bb-boy680/context-hub/commit/734f83e8105bf071c18d96eed7f021206dd1ce2d))
- **search:** show the MCP icon a probe reported ([96e3b14](https://github.com/bb-boy680/context-hub/commit/96e3b14f5c4529df2b47d27636f0e820c9d6a39d))
- **search:** filter target page by the clicked result ([0dd19e6](https://github.com/bb-boy680/context-hub/commit/0dd19e60b56d9502664107c62ce302fdaf4f564b))
- **ui:** keep asset filters responsive while typing ([d9f0e7f](https://github.com/bb-boy680/context-hub/commit/d9f0e7fda9c202c37c83a5c1aa0e44ce797d7755))
- **places:** draw the agent's own mark in place menus ([08ef11d](https://github.com/bb-boy680/context-hub/commit/08ef11d31f00ea6e3fe8d23c999e8bcf7c74696b))
- **desktop:** keep the title bar opaque in dark mode ([be5c582](https://github.com/bb-boy680/context-hub/commit/be5c5822bc391b29832e5ffaa2b60f3981868c99))
- **core:** preserve the cause of a manifest YAML error ([1e0b035](https://github.com/bb-boy680/context-hub/commit/1e0b03581bbba710f59d9ce993746863600d3e7b))
- **desktop:** use stock NSIS pages and remove first-run wizard ([98b5bb8](https://github.com/bb-boy680/context-hub/commit/98b5bb8fd21526f19ea437895305bb2d3aa3a478))

### Documentation

- document creating the release tag from the GitHub UI ([160b3de](https://github.com/bb-boy680/context-hub/commit/160b3de76122e0b4ef495a6359e7dc508f2bb0da))
- add a screenshot-driven release guide ([dfaf2db](https://github.com/bb-boy680/context-hub/commit/dfaf2db34e75342c3ab564397bc56232a1e91445))

### Chores

- **skills:** remove the shadcn-ui skill bundle ([eceeba7](https://github.com/bb-boy680/context-hub/commit/eceeba716d86a9af92c33d5e74596832aba7ef9d))
- **aoci:** sync variables and desktop dev cognition ([d37f109](https://github.com/bb-boy680/context-hub/commit/d37f109be461f7a95732497eb06ba0f73a3e19f8))
- **aoci:** sync default workspace cognition ([cace37d](https://github.com/bb-boy680/context-hub/commit/cace37d7cfb2be341b1544b511b3c3117c72a229))
- **aoci:** sync MCP search icon cognition ([9bb2749](https://github.com/bb-boy680/context-hub/commit/9bb2749dd952cb95c12fd3a00702202ece78362b))
- **aoci:** sync global search jump cognition ([0472f73](https://github.com/bb-boy680/context-hub/commit/0472f73b4c430737e922d3cf33fa7b7c24594122))
- **aoci:** sync dev script and filter cognition ([a25f91e](https://github.com/bb-boy680/context-hub/commit/a25f91eec9460583f380f794da2af79da584db2e))
- **scripts:** add dev:web and dev:desktop ([57edaee](https://github.com/bb-boy680/context-hub/commit/57edaee0b19359d1578f9cc2d587906f06ac488a))
- **aoci:** sync provenance line cognition ([97bd661](https://github.com/bb-boy680/context-hub/commit/97bd6611aac62fe50af06720ec29c99aac20f2e4))
- **aoci:** sync detail dialog cognition ([4e42f83](https://github.com/bb-boy680/context-hub/commit/4e42f83f12776b377dbf31fac94c44587cc5accb))
- **aoci:** sync place mark cognition ([0e14976](https://github.com/bb-boy680/context-hub/commit/0e14976be37a61ca9d1dea09b7b9d7366772e207))
- **aoci:** sync extension market cognition ([28b033c](https://github.com/bb-boy680/context-hub/commit/28b033c8e1c12ab9e7880201ea84fd719113a098))
- **aoci:** sync title bar fix cognition ([644f03f](https://github.com/bb-boy680/context-hub/commit/644f03fb634eebb292bf2f9965938faad6211563))
- **aoci:** sync desktop menu cognition ([884fb43](https://github.com/bb-boy680/context-hub/commit/884fb43f148f332df3112630a6d07da38c95074a))
- **aoci:** sync extension market cognition ([ee30d5e](https://github.com/bb-boy680/context-hub/commit/ee30d5e7b524651268b47f8619e9a23d5baa4607))
- **aoci:** sync extension market cognition ([4c388f0](https://github.com/bb-boy680/context-hub/commit/4c388f0a4b1614eca8711193796f850dc37b62da))

**Full Changelog**: https://github.com/bb-boy680/context-hub/compare/v0.0.1-beta.6...v0.1.0

## v0.0.1-beta.6 (2026-10-19)

### Features

- **release:** generate changelogs from conventional commits ([af55ed3](https://github.com/bb-boy680/context-hub/commit/af55ed31a9b20538363d5a10f5be42971b988be9))

**Full Changelog**: https://github.com/bb-boy680/context-hub/compare/v0.0.1-beta.5...v0.0.1-beta.6
