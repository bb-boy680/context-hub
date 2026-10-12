/**
 * The controls the hub's own screens share: the list of places a page offers —
 * its menu, the scope pill that opens it, and the flat list a detail panel
 * shows — the stack of marks that pill wears, the row of type chips a record
 * edits, the bar that narrows a list by query and type, the frame a dialog
 * splits into a pane and a panel, and the syntax-coloured view of one file.
 *
 * A screen imports them from here rather than from the file a control happens
 * to live in, so which module holds one stays this package's business.
 */
export * from "./avatar-stack.tsx"
export * from "./code-view.tsx"
export * from "./dialog-split.tsx"
export * from "./filter-bar.tsx"
export * from "./place-picker.tsx"
export * from "./tag-editor.tsx"
