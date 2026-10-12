/**
 * The controls the hub's own screens share: the list of places a page offers —
 * its menu, the scope pill that opens it, and the flat list a detail panel
 * shows — and the stack of marks that pill wears.
 *
 * A screen imports them from here rather than from the file a control happens
 * to live in, so which module holds one stays this package's business.
 */
export * from "./avatar-stack.tsx"
export * from "./place-picker.tsx"
