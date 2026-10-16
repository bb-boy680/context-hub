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
  "prompts.action.remove": "Remove",
  "prompts.action.copy": "Copy",
  "prompts.action.copied": "Copied",
  "prompts.action.more": "More actions",
  "prompts.action.delete": "Delete",
  "prompts.action.close": "Close",

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
  "prompts.location.workspace": "Workspace",
  "prompts.location.library": "Prompt library",
  "prompts.place.body": "This hub",
  "prompts.place.generates": "Commands and rules, from the ⋯",
  "prompts.place.expand": "Show {count} more",
  "prompts.place.collapse": "Show fewer",
  "prompts.location.count": "{count} targets",

  "prompts.media.play": "Play",
  "prompts.media.pause": "Pause",
  "prompts.media.seek": "Seek",
  "prompts.media.mute": "Mute",
  "prompts.media.unmute": "Unmute",
  "prompts.media.previous": "Previous media",
  "prompts.media.next": "Next media",
  "prompts.media.image": "Show image",
  "prompts.media.video": "Show video",
  "prompts.media.upload": "Upload image or video",
  "prompts.media.remove": "Remove media",
  "prompts.media.hint": "These pictures are kept for this prompt in the hub; a delivery writes the text alone.",
  "prompts.media.drop.title": "Drop to upload",
  "prompts.media.drop.formats": "PNG · JPG · GIF · WebP · MP4 · WebM",
  "prompts.media.paste.done": "Pasted {count} file(s)",
  "prompts.media.paste.text": "The clipboard holds text, not an image or a video.",
  "prompts.media.add.placeholder": "Image, GIF, or video link",
  "prompts.media.add.action": "Add",
  "prompts.media.add.file": "Choose a file…",
  "prompts.media.add.fileHint": "Images, GIFs, and videos, from this machine.",
  "prompts.media.add.link": "From a URL",
  "prompts.media.add.linkHint": "A direct link to an image, GIF, or video.",
  "prompts.media.add.linkLabel": "Direct link",
  "prompts.media.add.paste": "Paste",
  "prompts.media.add.pasteHint": "Ctrl + V · a screenshot or a copied file.",
  "prompts.media.add.failed": "That URL could not be read.",

  "prompts.menu.installTo": "Install to",
  "prompts.menu.commands": "Generate a command",
  "prompts.menu.rule": "Generate a rule",
  "prompts.menu.document.agents": "Add to AGENTS.md",
  "prompts.menu.document.design": "Add to DESIGN.md",
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
  "prompts.detail.category.add": "Add a tag",
  "prompts.detail.category.placeholder": "New tag",
  "prompts.detail.category.remove": "Remove {tag}",
  "prompts.detail.description.edit": "Double-click to correct the description",
  "prompts.detail.tab.pictures": "Pictures",
  "prompts.detail.tab.body": "Prompt",
  "prompts.detail.body": "The prompt's text",
  "prompts.detail.edit": "Edit",
  "prompts.detail.save": "Save",
  "prompts.detail.saved": "Saved",
  "prompts.detail.places": "Places",
  "prompts.detail.places.held": "{count} installed",

  "prompts.done.install": "Delivered to {agent}",
  "prompts.done.remove": "Taken back from {agent}",
  "prompts.done.commands": "A command was generated for {agent}",
  "prompts.done.rule": "A rule was generated for {agent}",
  "prompts.done.document": "Added to {file}",
  "prompts.done.deleted": "Deleted “{name}”",
}
