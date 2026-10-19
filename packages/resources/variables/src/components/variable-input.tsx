/**
 * The variable-aware field: a contentEditable value box whose `${NAME}`
 * references render as removable tags.
 *
 * A plain `<input>` cannot put a tag with an icon inside its text — its content
 * is one styled string. This editor keeps the value as a string (`${NAME}` for
 * each tag) but draws the tags as `contentEditable=false` spans, so Backspace
 * removes a whole reference and the caret still moves through the text between
 * them. The panel opens on `$`; the editor keeps the focus, which is why the
 * arrows and Enter keep working while it is open.
 */
import * as React from "react"

import { cn } from "cn"

import { VariablePicker } from "./variable-picker.tsx"

/** What a caller supplies; the editor owns the tags and the panel. */
export interface VariableInputProps {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  /** A machine value — a command, an argument list, a URL — set in monospace. */
  mono?: boolean
  invalid?: boolean
  className?: string
  ariaLabel?: string
}

/** Any `${...}` is an expression; the text between the braces is its name. */
const TOKEN = /\$\{([^}]+)\}/g

/** The same shape without `g`, for testing a text node in place. */
const PLAIN_TOKEN = /\$\{[^}]+\}/

/** The key-round glyph, small enough to sit inside a tag. */
const KEY_SVG =
  '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>'

/** One tag, built imperatively so it can live inside the editable DOM. */
function tagOf(name: string): HTMLSpanElement {
  const tag = document.createElement("span")
  tag.contentEditable = "false"
  tag.dataset.variable = name
  tag.className =
    "inline-flex h-[18px] select-none items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 align-middle font-mono text-[11px] leading-none text-primary"
  tag.innerHTML = KEY_SVG
  const label = document.createElement("span")
  label.textContent = "${" + name + "}"
  tag.append(label)
  return tag
}

/** A value as the child nodes the editor draws. */
function nodesOf(value: string): Node[] {
  const nodes: Node[] = []
  let last = 0
  for (const match of value.matchAll(TOKEN)) {
    const at = match.index ?? 0
    if (at > last) nodes.push(document.createTextNode(value.slice(last, at)))
    nodes.push(tagOf(match[1] as string))
    last = at + match[0].length
  }
  if (last < value.length) nodes.push(document.createTextNode(value.slice(last)))
  return nodes
}

/** The value a DOM subtree spells, with each tag written back as `${NAME}`. */
function serializeChildren(parent: Node): string {
  let text = ""
  parent.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? ""
      return
    }
    if (!(child instanceof HTMLElement)) return
    if (child.dataset.variable !== undefined) {
      text += "${" + child.dataset.variable + "}"
      return
    }
    if (child.tagName === "BR") {
      text += "\n"
      return
    }
    text += serializeChildren(child)
  })
  return text
}

/** The text before the caret, in serialized coordinates. */
function textBeforeCaret(editor: HTMLElement): string | null {
  const selection = window.getSelection()
  if (
    selection === null ||
    selection.rangeCount === 0 ||
    selection.anchorNode === null ||
    !editor.contains(selection.anchorNode)
  ) {
    return null
  }
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.setEnd(selection.anchorNode, selection.anchorOffset)
  return serializeChildren(range.cloneContents())
}

/** The node immediately before a collapsed caret, when there is one. */
function nodeBefore(range: Range): Node | null {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    return range.startOffset === 0 ? range.startContainer.previousSibling : null
  }
  return range.startContainer.childNodes[range.startOffset - 1] ?? null
}

/** The node immediately after a collapsed caret, when there is one. */
function nodeAfter(range: Range): Node | null {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const text = range.startContainer.textContent ?? ""
    return range.startOffset === text.length ? range.startContainer.nextSibling : null
  }
  return range.startContainer.childNodes[range.startOffset] ?? null
}

/** Whether any text node still spells a `${NAME}` that has not become a tag. */
function hasPlainToken(editor: HTMLElement): boolean {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    if (PLAIN_TOKEN.test(walker.currentNode.textContent ?? "")) return true
  }
  return false
}

/** Put the caret at one serialized offset, after a tag when the offset is in it. */
function caretAt(editor: HTMLElement, offset: number): void {
  const range = document.createRange()
  let at = 0
  let placed = false

  const walk = (parent: Node): void => {
    for (const node of parent.childNodes) {
      if (placed) return
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ""
        if (offset <= at + text.length) {
          range.setStart(node, Math.max(0, offset - at))
          placed = true
          return
        }
        at += text.length
        continue
      }
      if (!(node instanceof HTMLElement)) continue
      if (node.dataset.variable !== undefined) {
        const length = ("${" + node.dataset.variable + "}").length
        if (offset <= at + length) {
          range.setStartAfter(node)
          placed = true
          return
        }
        at += length
        continue
      }
      walk(node)
    }
  }

  walk(editor)
  if (!placed) {
    range.selectNodeContents(editor)
    range.collapse(false)
  } else {
    range.collapse(true)
  }
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  editor.focus()
}

/** A caret placed after one specific child of the editor. */
function caretAfter(editor: HTMLElement, node: Node): void {
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  editor.focus()
}

/** The variable-aware input. */
export function VariableInput({
  value,
  placeholder,
  onChange,
  mono = false,
  invalid = false,
  className,
  ariaLabel,
}: VariableInputProps) {
  const editorRef = React.useRef<HTMLDivElement | null>(null)
  const lastValue = React.useRef<string | null>(null)
  const composing = React.useRef(false)
  const [picker, setPicker] = React.useState<{ start: number; query: string } | null>(
    null
  )

  /** Draw a value into the editor; used on mount and on external changes. */
  const draw = React.useCallback((next: string) => {
    const editor = editorRef.current
    if (editor === null) return
    editor.replaceChildren(...nodesOf(next))
  }, [])

  React.useEffect(() => {
    if (value === lastValue.current) return
    draw(value)
    lastValue.current = value
  }, [value, draw])

  /** The editor's current text, with the panel's query recomputed from the caret. */
  const emit = () => {
    const editor = editorRef.current
    if (editor === null) return
    const next = serializeChildren(editor)
    lastValue.current = next
    onChange(next)
    const before = textBeforeCaret(editor)
    if (before === null) {
      setPicker(null)
      return
    }
    const match = /\$([A-Za-z0-9_]*)$/.exec(before)
    setPicker(
      match === null
        ? null
        : {
            start: before.length - match[0].length,
            query: match[1] ?? "",
          }
    )
  }

  /** Turn any `${NAME}` that is still plain text into a tag, keeping the caret. */
  const normalize = () => {
    const editor = editorRef.current
    if (editor === null || !hasPlainToken(editor)) return
    const before = textBeforeCaret(editor)
    const offset = before?.length ?? serializeChildren(editor).length
    const next = serializeChildren(editor)
    lastValue.current = next
    draw(next)
    caretAt(editor, offset)
  }

  const pick = (name: string) => {
    const editor = editorRef.current
    if (editor === null || picker === null) return
    const current = serializeChildren(editor)
    const end = picker.start + 1 + picker.query.length
    const next = `${current.slice(0, picker.start)}\${${name}}${current.slice(end)}`
    lastValue.current = next
    onChange(next)
    setPicker(null)
    draw(next)

    /* Put the caret after the tag that was just inserted, not after an older
       tag with the same name. */
    requestAnimationFrame(() => {
      const target = editorRef.current
      if (target === null) return
      let at = 0
      for (const node of target.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          at += node.textContent?.length ?? 0
          continue
        }
        if (!(node instanceof HTMLElement) || node.dataset.variable === undefined) {
          continue
        }
        if (at >= picker.start) {
          caretAfter(target, node)
          return
        }
        at += ("${" + node.dataset.variable + "}").length
      }
      const range = document.createRange()
      range.selectNodeContents(target)
      range.collapse(false)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      target.focus()
    })
  }

  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Backspace" && event.key !== "Delete") return
    const selection = window.getSelection()
    if (selection === null || !selection.isCollapsed || selection.rangeCount === 0) {
      return
    }
    const range = selection.getRangeAt(0)
    const node = event.key === "Backspace" ? nodeBefore(range) : nodeAfter(range)
    if (!(node instanceof HTMLElement) || node.dataset.variable === undefined) return

    event.preventDefault()
    const parent = node.parentNode
    const index = [...(parent?.childNodes ?? [])].indexOf(node)
    node.remove()
    if (parent !== null) {
      const next = document.createRange()
      next.setStart(parent, Math.max(0, index))
      next.collapse(true)
      selection.removeAllRanges()
      selection.addRange(next)
    }
    emit()
  }

  const paste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData("text").replace(/\r?\n/g, " ")
    if (text === "") return
    const selection = window.getSelection()
    if (selection === null || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    emit()
    normalize()
  }

  return (
    <>
      <div
        ref={editorRef}
        role="textbox"
        aria-label={ariaLabel ?? placeholder}
        aria-invalid={invalid || undefined}
        data-placeholder={placeholder}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={() => {
          if (composing.current) return
          emit()
          normalize()
        }}
        onKeyDown={keyDown}
        onPaste={paste}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
          emit()
          normalize()
        }}
        onBlur={() => setPicker(null)}
        className={cn(
          "h-10 min-w-0 grow overflow-x-auto overflow-y-hidden rounded-md border border-border px-3 py-0 text-[12.5px] leading-10 whitespace-pre text-foreground outline-none empty:before:text-muted-soft empty:before:content-[attr(data-placeholder)] focus:border-ring [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          mono && "font-mono",
          invalid && "border-destructive focus:border-destructive",
          className
        )}
      />

      {picker === null ? null : (
        <VariablePicker
          open
          anchor={editorRef}
          query={picker.query}
          onPick={pick}
          onOpenChange={(open) => {
            if (!open) setPicker(null)
          }}
        />
      )}
    </>
  )
}
