/**
 * The controls the hub's own screens share: the list of places a page offers —
 * its menu, the scope pill that opens it, and the flat list a detail panel
 * shows — the stack of marks that pill wears, the tab a set of what is missing
 * carries its batch action on, the row of type chips a record edits, the bar
 * that narrows a list by query and type, the frame a dialog splits into a pane
 * and a panel, the body that holds a screen's footer at its foot, the pager that
 * closes it, the ledger a collection of records reads as, and the
 * syntax-coloured view of one file.
 *
 * A screen imports them from here rather than from the file a control happens
 * to live in, so which module holds one stays this package's business.
 */
export * from "./action-tab.tsx"
export * from "./avatar-stack.tsx"
export * from "./code-view.tsx"
export * from "./dialog-split.tsx"
export * from "./filter-bar.tsx"
export * from "./ledger.tsx"
export * from "./page-body.tsx"
export * from "./pagination.tsx"
export * from "./place-picker.tsx"
export * from "./tag-editor.tsx"
