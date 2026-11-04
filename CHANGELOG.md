# Changelog

## v0.2.2 (2026-11-04)

### Features

- **order:** keep install and manual Agent order ([63d89a7](https://github.com/bb-boy680/context-hub/commit/63d89a7db949eb681512fd65de7c5bad4b9c2e3a))
- **workspace:** scope asset pages to global places in the global entry ([e40119b](https://github.com/bb-boy680/context-hub/commit/e40119bb49a95c69042733f59bb5d307b47abeb8))
- **ui:** add custom sidebar and extension icons ([5e8e362](https://github.com/bb-boy680/context-hub/commit/5e8e3629ac086b12632635aeaa78e0d4a2b91d5f))

### Bug Fixes

- **masonry:** balance columns by height instead of index order ([44c09c9](https://github.com/bb-boy680/context-hub/commit/44c09c9599a26d63b165f40792f02c44dad6cac0))
- **market:** unify built-in market identity and localize descriptions ([80ee04d](https://github.com/bb-boy680/context-hub/commit/80ee04dbc864d31defc5b03fecf87ee44da05e4e))
- **ui:** refresh labels and agent list without reload ([b4a970b](https://github.com/bb-boy680/context-hub/commit/b4a970bc0d4bd08ed435a10d1278568d25a09626))

### Refactoring

- **skills:** keep the stored catalog order instead of sorting reads ([d817de3](https://github.com/bb-boy680/context-hub/commit/d817de37b92d383d2bee79c418e5543e4d6f8868))
- **skills:** simplify cards and defer details ([9f9ba4f](https://github.com/bb-boy680/context-hub/commit/9f9ba4f19f54056cd5036cc14dec69c19b9561d8))

### Documentation

- **memory:** record plan research and post-acceptance archive rules ([751e68c](https://github.com/bb-boy680/context-hub/commit/751e68cf57dc45d8f43a4c5bf933195a6c157890))
- **plans:** list the drag-and-drop dependencies in the agent order plan ([a9c753f](https://github.com/bb-boy680/context-hub/commit/a9c753fa31613d51cdb682005d5156bea02606ca))

### Chores

- sync workspace rules, plans and research notes ([171af34](https://github.com/bb-boy680/context-hub/commit/171af341e10cd57e4e53aeb5e2352ab1b6a6df8d))
- **aoci:** align observed scope and refresh code entries ([492ae81](https://github.com/bb-boy680/context-hub/commit/492ae81b18c598ad98a2aa885ef7aac3fff91a2a))
- **aoci:** align managed scope and refresh code entries ([115bff5](https://github.com/bb-boy680/context-hub/commit/115bff569a16005ec3db25d0da54be06a869fadb))

**Full Changelog**: https://github.com/bb-boy680/context-hub/compare/v0.2.1...v0.2.2

## v0.2.1 (2026-11-04)

### Features

- **agents:** add host contracts for six agent integrations ([e3f98ac](https://github.com/bb-boy680/context-hub/commit/e3f98aceb4666c5f4e24ee0e7018a49f76303f5f))
- **brand:** adopt fold logo across web and desktop ([bc2dca9](https://github.com/bb-boy680/context-hub/commit/bc2dca92276b1b8f5eab30da938ccc8874e807c4))
- **mcp:** separate install targets from scan-only places ([e0b48d5](https://github.com/bb-boy680/context-hub/commit/e0b48d5e2d6daf4f8ffc73eefc2e796ab5e052b2))
- **plugins:** support native agent manifests and transactional installs ([cc74950](https://github.com/bb-boy680/context-hub/commit/cc749505d07d662e8b9423a718387cc92ec254fa))
- **plugins:** let extensions declare plugin file scopes ([410160d](https://github.com/bb-boy680/context-hub/commit/410160d3a45ad31295156b1ab868827e4c4af7b7))
- **plugins:** install Claude Code plugins through files ([02e615d](https://github.com/bb-boy680/context-hub/commit/02e615d86164fbade4fad3ec5b7f64e437f63999))
- unify installation location filters ([f0c6d15](https://github.com/bb-boy680/context-hub/commit/f0c6d15552bd5fb650ba00e95f236e48e6737d85))
- **skills:** refine locations and masonry layout ([9fc6c8b](https://github.com/bb-boy680/context-hub/commit/9fc6c8b72ee6efac0628ac63eea1bb023bee1b50))
- **market:** install a pack into the agent places it belongs in ([a2fc50b](https://github.com/bb-boy680/context-hub/commit/a2fc50bb4585ec2f1cab0f75e0c5b3248d81536a))
- **market:** rebuild the plugin detail dialog around tabs ([e00ff83](https://github.com/bb-boy680/context-hub/commit/e00ff834e61d1710a6a9576c11899251f4981f23))
- **market:** add the plugin market with pinned installs ([06f3aac](https://github.com/bb-boy680/context-hub/commit/06f3aac2d76abdc56e7057969831b9075826c613))
- **market:** install skills into agent places ([a04c885](https://github.com/bb-boy680/context-hub/commit/a04c885cd10539502bb097d12feb648870fd34da))
- **market:** add the skills.sh skills market ([3526795](https://github.com/bb-boy680/context-hub/commit/3526795bb7b005978c4d0ff65e837987287fa524))
- **extensions:** mark the shipped modules as built-in ([0c3d66e](https://github.com/bb-boy680/context-hub/commit/0c3d66ed0843fb899997ad416891bef6506cd214))
- **skills:** detect updates by upstream commit ([3ae8f25](https://github.com/bb-boy680/context-hub/commit/3ae8f255457d2dd6f7cd30e6690c173b9a51c795))
- **web:** enable React Compiler in the Vite build ([978a798](https://github.com/bb-boy680/context-hub/commit/978a798f3a5366fb3a328d69cd7d30b266f6d6c8))

### Bug Fixes

- **plugins:** accept writes without manifest rules ([10e9d30](https://github.com/bb-boy680/context-hub/commit/10e9d307983df66ef628723c0c17a58d630f4260))
- **market:** keep plugin details open during installation ([5d655ea](https://github.com/bb-boy680/context-hub/commit/5d655eaef8e1bca8693eb48b39f16cdc58bb3f3e))
- **market:** open the skill detail from the whole row ([f26e3a5](https://github.com/bb-boy680/context-hub/commit/f26e3a5e6961bf041a9ba4a96d2bbf6713478438))
- **web:** wait for the hub before starting Vite ([b75cbc4](https://github.com/bb-boy680/context-hub/commit/b75cbc46b644ac99d6544ab8aca68734d9147cbf))
- **variables:** keep the picker open on field and panel clicks ([776f017](https://github.com/bb-boy680/context-hub/commit/776f017d8880d31ea7ac5c7c28a218efae890f6a))
- **prompts:** keep the place menu's labels inside a group ([3616680](https://github.com/bb-boy680/context-hub/commit/3616680aba52fb6951e385423560e8a7c934c336))
- **skills:** read the ASCII package listing too ([8cc20bd](https://github.com/bb-boy680/context-hub/commit/8cc20bdac2b02ab723e9358f3679718555bcb589))
- **skills:** keep agent marks and uninstall for deduped rows ([a438565](https://github.com/bb-boy680/context-hub/commit/a4385654dd317f7c7fcef03f7d0b178afe2f53b2))
- **skills:** copy adopted skills and dedupe rows by name ([b5f545e](https://github.com/bb-boy680/context-hub/commit/b5f545e2a19755064da7065a766faadd281ba210))

### Refactoring

- unify resource masonry layouts ([5bd9a6b](https://github.com/bb-boy680/context-hub/commit/5bd9a6ba98064ea817f4f7ff6cf4bbee7e91d62a))

### Documentation

- **agents:** archive six integration plans and icon assets ([e9b922c](https://github.com/bb-boy680/context-hub/commit/e9b922cbed7111026374ef006e916136c17e91a6))
- record subagent usage policy ([25ed325](https://github.com/bb-boy680/context-hub/commit/25ed3253d7801f15b076c7a0b881f7e4f83520ee))
- **agents:** add the design guidance block ([09b6630](https://github.com/bb-boy680/context-hub/commit/09b6630c710a1a088cb4ce828070c8f40c6075f4))
- trim the AOCI section and ignore .codex ([e5a9ec7](https://github.com/bb-boy680/context-hub/commit/e5a9ec7661cccf89d638d6ac531921995a9cf6b1))
- refine bilingual README and add MIT license ([a1b6c4b](https://github.com/bb-boy680/context-hub/commit/a1b6c4b56c9b1b0bb0630d2b2efc3b6139e85051))
- **readme:** introduce Context Hub with bilingual README ([b647fe8](https://github.com/bb-boy680/context-hub/commit/b647fe882e72f62b8b27a3643c25e4fc76bf1e2d))

### Build

- **deps:** add proper-lockfile type declarations ([98279e7](https://github.com/bb-boy680/context-hub/commit/98279e71feb348b1a7241c49ed1f3c42fdfd5c0a))

### Chores

- **aoci:** refresh index and exclude local client config ([0f698f2](https://github.com/bb-boy680/context-hub/commit/0f698f203df331b57053c41a87dab429d5477318))
- **aoci:** index the market install places ([2856fb0](https://github.com/bb-boy680/context-hub/commit/2856fb0f471e0c3c81274e33b0bfb2b95a232d10))
- **aoci:** index the market detail dialog and market sources ([245a9b7](https://github.com/bb-boy680/context-hub/commit/245a9b7d0cc9e91362dcf5e4002d59daf2a9a830))
- **aoci:** index the market install changes ([137c4b9](https://github.com/bb-boy680/context-hub/commit/137c4b94879a588d87d84172a8dda94871a89189))
- **aoci:** refresh the design entry baseline ([c5eca68](https://github.com/bb-boy680/context-hub/commit/c5eca6841585a74399d09f1be213e873853831f8))
- **design:** drop the stale index and add the market canvas ([7b1d636](https://github.com/bb-boy680/context-hub/commit/7b1d636103c65b5455e888b11d7865da9d446089))
- **aoci:** index the market plugin ([6f2b274](https://github.com/bb-boy680/context-hub/commit/6f2b274016adfcf2d91aa5875d09d425baae0dcd))
- **deps-dev:** bump vite from 8.2.2 to 8.2.4 ([ee81e9a](https://github.com/bb-boy680/context-hub/commit/ee81e9a602321feebde0c004b536056133123e68))
- add MIT license ([81227bd](https://github.com/bb-boy680/context-hub/commit/81227bd5ec98d1ca96e98c5b1ba101a0e60d7af2))

**Full Changelog**: https://github.com/bb-boy680/context-hub/compare/v0.2.0...v0.2.1

## v0.2.0 (2026-10-20)

### Features

- **prompts:** let agent extensions own prompt delivery ([5cf1487](https://github.com/bb-boy680/context-hub/commit/5cf14876df4389bd1e46f8fe11b643d2b1d5ffb9))

### Bug Fixes

- **skills:** skip installed skills in batch install ([bf6009b](https://github.com/bb-boy680/context-hub/commit/bf6009b490516e71a46f696aaf749611ac4db72a))

**Full Changelog**: https://github.com/bb-boy680/context-hub/compare/v0.1.1...v0.2.0

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
