/**
 * The variables module's English defaults for the `variables.*` namespace,
 * plus the one navigation entry it contributes.
 *
 * The table travels with the package, so a language pack can translate this
 * module without depending on it; a key no pack covers keeps the English here.
 */
export const variablesMessages: Record<string, string> = {
  "nav.variables": "Environment variables",

  "variables.title": "Environment variables",
  "variables.eyebrow": "CONTEXT HUB · OPERATE",
  "variables.description":
    "The variables agents on this machine read. The index keeps names and groups; values come from the machine environment.",

  "variables.banner.title": "Values live in the machine environment",
  "variables.banner.description":
    "The index keeps names and groups; values are written to this machine's environment and read back by name. Windows uses the user environment; macOS and Linux use the shell profile.",
  "variables.banner.chip": "Value shown",

  "variables.search": "Search variable names or groups",
  "variables.action.add": "New variable",
  "variables.action.addGroup": "New group",
  "variables.action.more": "More actions",
  "variables.action.editValue": "Edit value",
  "variables.action.rename": "Rename",
  "variables.action.moveGroup": "Move to group",
  "variables.action.copyReference": "Copy reference",
  "variables.action.delete": "Delete variable",
  "variables.action.close": "Close",
  "variables.action.reveal": "Reveal value",
  "variables.action.hide": "Hide value",

  "variables.group.title": "Groups",
  "variables.group.all": "All variables",
  "variables.group.new": "New group",
  "variables.list.hint": "Read when this page opens",
  "variables.list.count": "{count} variables",
  "variables.list.empty": "No variables in this group",
  "variables.list.emptyHint": "Add one, or pick another group.",
  "variables.column.name": "Name",
  "variables.column.value": "Value",
  "variables.column.status": "Status",
  "variables.column.actions": "Actions",
  "variables.status.set": "Set",
  "variables.status.unset": "Not set",
  "variables.footer.note":
    "Values come from the machine environment; the index keeps only names and groups.",
  "variables.load.failed": "Could not read the variable library",
  "variables.retry": "Retry",
  "variables.cancel": "Cancel",

  "variables.create.title": "New environment variables",
  "variables.create.description":
    "Several variables at once. Names and groups enter the index; values are written to the machine environment.",
  "variables.create.group": "Group",
  "variables.create.groupHint": "This batch shares one group",
  "variables.create.variables": "Variables",
  "variables.create.pasteHint": "Paste several lines at once",
  "variables.create.name": "Name",
  "variables.create.value": "Value",
  "variables.create.status": "State",
  "variables.create.addRow": "Add another",
  "variables.create.helper":
    "One variable per row; pasted lines split into rows. Every row needs a value, written to the machine environment.",
  "variables.create.valueRequired": "A value is required",
  "variables.create.privacy":
    "The index keeps names and groups; values are written to the machine environment and stay out of variables.json.",
  "variables.create.count": "{count} variables will be created",
  "variables.create.submit": "Create {count}",
  "variables.create.duplicateRow": "Already in this batch",
  "variables.create.exists": "Already exists",
  "variables.create.new": "New",
  "variables.create.invalid": "Only letters, digits and underscores; do not start with a digit.",
  "variables.name.required": "A variable name is required",
  "variables.create.done": "Created {count} variables",
  "variables.create.failed": "Could not create the variables",
  "variables.create.newGroup": "New",
  "variables.create.newGroupPlaceholder": "Group name",

  "variables.edit.title": "Edit value",
  "variables.edit.description": "Changes the value in the machine environment; the name and group stay.",
  "variables.edit.label": "Value",
  "variables.edit.helper": "Written to the machine environment.",
  "variables.edit.save": "Save",
  "variables.edit.done": "Value saved",

  "variables.rename.title": "Rename variable",
  "variables.rename.description": "The name is the identity; the value moves with it in the environment.",
  "variables.rename.label": "Variable name",
  "variables.rename.helper": "Only letters, digits and underscores; do not start with a digit.",
  "variables.rename.warning": "Existing {ref} references will not update.",
  "variables.rename.submit": "Rename",
  "variables.rename.done": "Variable renamed",

  "variables.delete.title": "Delete {name}?",
  "variables.delete.description": "The name and group leave the index; the value is removed from the machine environment.",
  "variables.delete.warning": "Existing {ref} references become missing environment variables.",
  "variables.delete.confirm": "Delete",
  "variables.delete.done": "Variable deleted",

  "variables.move.done": "Moved to {group}",
  "variables.copy.done": "Copied {ref}",
  "variables.copy.failed": "Could not copy the reference",
  "variables.action.failed": "That action did not complete",

  "variables.groupDialog.title": "New group",
  "variables.groupDialog.description": "A group files variables together; it holds no values of its own.",
  "variables.groupDialog.label": "Group name",
  "variables.groupDialog.placeholder": "e.g. Cloud services",
  "variables.groupDialog.submit": "Create group",
  "variables.groupDialog.done": "Group created",

  "variables.picker.all": "All",
  "variables.picker.hint": "Insert ${name}",
  "variables.picker.select": "Select",
  "variables.picker.insert": "Insert",
  "variables.picker.close": "Close",
  "variables.picker.loading": "Loading variables…",
  "variables.picker.empty": "No matching variables",
}
