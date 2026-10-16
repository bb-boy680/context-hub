/**
 * The prompts module's English defaults for the `prompts.*` namespace, plus the
 * one navigation entry it contributes.
 *
 * The table travels with the package, so a language pack can translate this
 * module without depending on it; a key no pack covers keeps the English here.
 */
export const promptsMessages: Record<string, string> = {
  "nav.prompts": "Prompts",

  "prompts.title": "Prompts",
  "prompts.description":
    "The prompts this hub keeps, and the agents each one has been delivered to.",

  "prompts.tab.all": "All",

  "prompts.view.grid": "Card view",
  "prompts.view.list": "List view",

  "prompts.action.add": "Add prompt",
  "prompts.action.install": "Install",
  "prompts.action.copy": "Copy",
  "prompts.action.copied": "Copied",
  "prompts.action.more": "More actions",
  "prompts.action.delete": "Delete",

  "prompts.column.prompt": "Prompt",
  "prompts.column.body": "Content",
  "prompts.column.tags": "Tags",
  "prompts.column.updated": "Updated",
  "prompts.column.action": "Actions",
  "prompts.filter.placeholder": "Search prompts",
  "prompts.filter.clear": "Clear the search",
  "prompts.filter.all": "All tags",
  "prompts.filter.reset": "Clear the filters",

  "prompts.footer.count": "{shown} of {total}",
  "prompts.batch.selected": "{count} selected",
  "prompts.batch.clear": "Clear selection",

  "prompts.empty.none": "No prompts yet",
  "prompts.empty.noneHint":
    "Add one and deliver it to an agent, or generate a rule or a command from it.",
  "prompts.empty.filter": "Nothing matches",
  "prompts.empty.filterHint": "No prompt matches “{query}”.",
  "prompts.empty.noLibrary": "This form has no prompt library",
  "prompts.empty.noLibraryHint":
    "Prompts are kept where this hub keeps its files; this form cannot reach them, so there is nothing to list.",

  "prompts.failed.title": "The library could not be read",
  "prompts.failed.hint": "The rows below are what was read last.",
  "prompts.retry": "Try again",

  "prompts.group.workspace": "Workspace",
  "prompts.group.global": "Global agent",
  "prompts.place.search": "Find an agent",
  "prompts.place.searchClear": "Clear the search",
  "prompts.place.searchEmpty": "No agent matches",
  "prompts.place.none": "No agent takes prompts yet",
  "prompts.location.count": "{count} targets",

  "prompts.menu.installTo": "Install to",
  "prompts.menu.commands": "Generate a command",
  "prompts.menu.rule": "Generate a rule",
  "prompts.menu.instructions": "Add to CLAUDE.md",
  "prompts.menu.blocked": "This form cannot reach that file",

  "prompts.add.title": "Add a prompt",
  "prompts.add.hint":
    "The description becomes the file name where the prompt is ever delivered; the prompt itself is what gets written.",
  "prompts.add.description": "Description",
  "prompts.add.descriptionPlaceholder": "Review a diff before committing",
  "prompts.add.prompt": "Prompt",
  "prompts.add.promptPlaceholder": "Review the diff and report what it changes.",
  "prompts.add.tags": "Tags",
  "prompts.add.addTag": "Add",
  "prompts.add.tagPlaceholder": "New tag",
  "prompts.add.removeTag": "Remove {tag}",
  "prompts.add.submit": "Add",
  "prompts.add.cancel": "Cancel",
  "prompts.add.needDescription": "A prompt needs a description.",
  "prompts.add.needPrompt": "A prompt needs its content.",

  "prompts.delete.title": "Delete “{name}”?",
  "prompts.delete.text":
    "The prompt is removed from the library. Copies already delivered to an agent are left where they are.",
  "prompts.delete.confirm": "Delete",

  "prompts.detail.tokens": "{tokens} tokens",

  "prompts.done.install": "Delivered to {agent}",
  "prompts.done.remove": "Taken back from {agent}",
  "prompts.done.commands": "A command was generated for {agent}",
  "prompts.done.rule": "A rule was generated for {agent}",
  "prompts.done.instructions": "Added to {agent}'s CLAUDE.md",
  "prompts.done.deleted": "Deleted “{name}”",
}
