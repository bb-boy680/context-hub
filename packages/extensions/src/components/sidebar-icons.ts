import { createElement, type ComponentProps, type ReactNode } from "react"

import type { ExtensionIcon } from "../types.ts"

type IconProps = ComponentProps<ExtensionIcon>

const plane = { fill: "currentColor", fillOpacity: 0.14 }

// 保持无 JSX，让模块声明和搜索 provider 仍可在纯 Node 中加载。
function frame(props: IconProps, ...children: ReactNode[]) {
  return createElement("svg", {
    viewBox: "0 0 24 24",
    width: 24,
    height: 24,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    focusable: false,
    ...props,
  }, ...children)
}

export function SidebarSkillsIcon(props: IconProps) {
  return frame(props,
    createElement("rect", { x: 4, y: 4, width: 16, height: 16, rx: 4.5, ...plane }),
    createElement("path", {
      d: "M12 6.8l1.65 3.55L17.2 12l-3.55 1.65L12 17.2l-1.65-3.55L6.8 12l3.55-1.65Z",
      fill: "currentColor",
      stroke: "none",
    }),
  )
}

export function SidebarMcpIcon(props: IconProps) {
  return frame(props,
    createElement("rect", { x: 4.5, y: 4.4, width: 15, height: 6.6, rx: 2, ...plane }),
    createElement("rect", { x: 4.5, y: 13, width: 15, height: 6.6, rx: 2, ...plane }),
    createElement("circle", { cx: 7.8, cy: 7.7, r: 1.05, fill: "currentColor", stroke: "none" }),
    createElement("circle", { cx: 7.8, cy: 16.3, r: 1.05, fill: "currentColor", stroke: "none" }),
  )
}

export function SidebarPluginsIcon(props: IconProps) {
  return frame(props,
    createElement("path", {
      d: "M8 5h8a3 3 0 0 1 3 3v1a2.4 2.4 0 0 1 0 4.8V16a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z",
      ...plane,
    }),
  )
}

export function SidebarPromptsIcon(props: IconProps) {
  return frame(props,
    createElement("rect", { x: 4, y: 3.6, width: 16, height: 16.8, rx: 3.6, ...plane }),
    createElement("path", { d: "M8.6 8.2L13 12l-4.4 3.8" }),
  )
}

export function SidebarPluginsMarketIcon(props: IconProps) {
  return frame(props,
    createElement("path", {
      d: "M6.6 11v6a2.5 2.5 0 0 0 2.5 2.5h5.8a2.5 2.5 0 0 0 2.5-2.5v-6",
      ...plane,
    }),
    createElement("path", {
      d: "M4.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2a3.75 3.75 0 0 1-7.5 0 3.75 3.75 0 0 1-7.5 0Z",
      ...plane,
    }),
    createElement("path", { d: "M9.8 19.5v-3.3a2.2 2.2 0 0 1 4.4 0v3.3" }),
  )
}

export function SidebarWorkspaceIcon(props: IconProps) {
  return frame(props,
    createElement("path", {
      d: "M3.8 8.4a2.7 2.7 0 0 1 2.7-2.7h3a2 2 0 0 1 1.55.74L12.1 7.8h5.4a2.7 2.7 0 0 1 2.7 2.7v6.4a2.7 2.7 0 0 1-2.7 2.7h-11a2.7 2.7 0 0 1-2.7-2.7Z",
      ...plane,
    }),
  )
}

export function SidebarCreateIcon(props: IconProps) {
  return frame(props, createElement("path", { d: "M12 6.2v11.6M6.2 12h11.6" }))
}

export function SidebarVariablesIcon(props: IconProps) {
  return frame(props,
    createElement("path", {
      d: "M10.3 4.5H9.2a1.7 1.7 0 0 0-1.7 1.7v3A2.6 2.6 0 0 1 4.9 12a2.6 2.6 0 0 1 2.6 2.8v3a1.7 1.7 0 0 0 1.7 1.7h1.1M13.7 4.5h1.1a1.7 1.7 0 0 1 1.7 1.7v3a2.6 2.6 0 0 0 2.6 2.8 2.6 2.6 0 0 0-2.6 2.8v3a1.7 1.7 0 0 1-1.7 1.7h-1.1",
    }),
  )
}

export function SidebarSettingsIcon(props: IconProps) {
  return frame(props,
    createElement("path", { d: "M4.2 8.5h15.6M4.2 15.5h15.6" }),
    createElement("circle", { cx: 9.4, cy: 8.5, r: 2.4, fill: "currentColor", stroke: "none" }),
    createElement("circle", { cx: 15, cy: 15.5, r: 2.4, fill: "currentColor", stroke: "none" }),
  )
}

export function SidebarExtensionsIcon(props: IconProps) {
  return frame(props,
    createElement("rect", { x: 4, y: 4, width: 6.6, height: 6.6, rx: 2, ...plane }),
    createElement("rect", { x: 13.4, y: 4, width: 6.6, height: 6.6, rx: 2, ...plane }),
    createElement("rect", { x: 4, y: 13.4, width: 6.6, height: 6.6, rx: 2, ...plane }),
    createElement("path", { d: "M16.7 13.9v5.6M13.9 16.7h5.6" }),
  )
}

export function SidebarSearchIcon(props: IconProps) {
  return frame(props,
    createElement("circle", { cx: 10.5, cy: 10.5, r: 6.3, ...plane }),
    createElement("path", { d: "m15.2 15.2 4.6 4.6" }),
  )
}

export function SidebarLanguageIcon(props: IconProps) {
  return frame(props,
    createElement("rect", { x: 10, y: 9, width: 10, height: 11, rx: 2.5, ...plane }),
    createElement("rect", { x: 4, y: 4, width: 10, height: 11, rx: 2.5, ...plane }),
    createElement("path", { d: "m6.6 11.8 2.4-5 2.4 5M7.5 10.2h3M16.7 13l-2.4 4M14.4 13.5l2.4 3.5" }),
  )
}
