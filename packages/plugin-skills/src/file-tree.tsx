/**
 * The files of one skill as a tree a person opens and picks from. The tree
 * behaviour — expansion, focus, arrow-key navigation, the ARIA tree structure
 * — comes from headless-tree; only the rows are ours, so they keep the panel's
 * measurements and colours.
 */
import { hotkeysCoreFeature, syncDataLoaderFeature } from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import { ChevronRightIcon, FileTextIcon, FolderIcon } from "lucide-react"
import * as React from "react"

import { useI18n } from "@workspace/extensions/react"

import type { SkillFileEntry } from "./store.ts"

/** One node of the tree, addressed by its path inside the skill directory. */
interface TreeNode {
  name: string
  directory: boolean
}

/** The tree's own root: the skill directory itself, which draws no row. */
const ROOT = ""

/**
 * Identity of one directory listing. The tree builds its item list once, when
 * it mounts, so a listing that arrives or changes later has to mount a new
 * one — the key is what makes React do that.
 */
export function fileTreeKey(files: SkillFileEntry[]): string {
  return files.map((file) => file.path).join("\n")
}

export function SkillFileTree({
  files,
  selected,
  onSelect,
}: {
  /** Every entry under the skill directory, depth first, as the host listed it. */
  files: SkillFileEntry[]
  /** The path whose text the panel shows; its row carries the selection. */
  selected: string
  /** Take one file; folders are opened in place instead. */
  onSelect: (path: string) => void
}) {
  const { t } = useI18n()
  /* The library walks from a root to children, so the flat listing becomes one
     lookup per node and one child list per directory. */
  const index = React.useMemo(() => {
    const items: Record<string, TreeNode> = { [ROOT]: { name: ROOT, directory: true } }
    const children: Record<string, string[]> = { [ROOT]: [] }
    for (const file of files) {
      const cut = file.path.lastIndexOf("/")
      const parent = cut < 0 ? ROOT : file.path.slice(0, cut)
      items[file.path] = {
        name: file.path.slice(cut + 1),
        directory: file.directory,
      }
      ;(children[parent] ??= []).push(file.path)
      if (file.directory) children[file.path] ??= []
    }
    return { items, children }
  }, [files])

  const tree = useTree<TreeNode>({
    rootItemId: ROOT,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().directory,
    dataLoader: {
      getItem: (id) => index.items[id],
      getChildren: (id) => index.children[id] ?? [],
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
    /* Folders start closed: the root is the only thing open, so the directory
       lists what the skill holds and a click opens one of them. */
    initialState: { expandedItems: [ROOT] },
    onPrimaryAction: (item) => {
      if (!item.isFolder()) onSelect(item.getId())
    },
  })

  return (
    <div
      {...tree.getContainerProps(t("skills.detail.files.tree"))}
      className="flex flex-col gap-0.5 outline-none"
    >
      {tree.getItems().map((item) => {
        if (item.getId() === ROOT) return null
        const active = item.getId() === selected
        return (
          <button
            key={item.getId()}
            type="button"
            {...item.getProps()}
            /* The row the panel shows is the selected one, whatever the
               library's own selection state says. */
            aria-selected={active}
            style={{ paddingLeft: 8 + item.getItemMeta().level * 16 }}
            className={`flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-md pr-2 text-left text-[13px] outline-none ${
              active
                ? "bg-muted font-medium text-foreground"
                : "text-secondary-foreground hover:bg-muted/50"
            }`}
          >
            {item.isFolder() ? (
              <ChevronRightIcon
                className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
                  item.isExpanded() ? "rotate-90" : ""
                }`}
              />
            ) : (
              /* The chevron's width, so a file's name lines up under a folder's. */
              <span className="size-3.5 shrink-0" />
            )}
            {item.isFolder() ? (
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <FileTextIcon
                className={`size-3.5 shrink-0 ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              />
            )}
            <span className="truncate">{item.getItemName()}</span>
          </button>
        )
      })}
    </div>
  )
}
