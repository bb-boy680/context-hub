import * as React from "react"
import Masonry from "react-responsive-masonry"

/** Keep columns sized to the content area even when only a few cards exist. */
export function ResourceMasonry({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [columns, setColumns] = React.useState(1)

  React.useLayoutEffect(() => {
    const container = ref.current
    if (container === null || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return
      const width = entry.contentRect.width
      setColumns(width >= 1426 ? 5 : width >= 1136 ? 4 : width >= 846 ? 3 : width >= 556 ? 2 : 1)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="min-w-0">
      <Masonry
        columnsCount={columns}
        sequential
        gutter="24px"
        style={{ justifyContent: "flex-start" }}
        itemStyle={{ flex: `0 0 calc(${100 / columns}% - ${(24 * (columns - 1)) / columns}px)` }}
      >
        {children}
      </Masonry>
    </div>
  )
}
