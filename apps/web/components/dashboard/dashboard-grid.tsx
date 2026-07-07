"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, LayoutGrid, RotateCcw, Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DASHBOARD_WIDGETS, defaultLayout } from "./dashboard-widgets"
import type { DashboardLayout } from "@/lib/data/dashboard-layout"

/** Height of one grid row-unit and the gap between cells, in px. rowSpan × this
 *  (plus gaps) is a widget's height; the resize handle steps in these units. */
const ROW_PX = 76
const GAP_PX = 16
const MIN = 1
const MAX = 12

interface DashboardGridProps {
  /** Pre-rendered widget nodes keyed by id (built on the server). */
  widgets: { id: string; node: ReactNode }[]
  /** Layout already reconciled with the current widget catalogue (mergeLayout). */
  initialLayout: DashboardLayout
  saveAction: (layout: DashboardLayout) => Promise<void>
  resetAction: () => Promise<void>
}

const clampSpan = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)))

export function DashboardGrid({
  widgets,
  initialLayout,
  saveAction,
  resetAction,
}: DashboardGridProps) {
  const [layout, setLayout] = useState<DashboardLayout>(initialLayout)
  const [editing, setEditing] = useState(false)
  const [isDesktop, setIsDesktop] = useState(true)
  const [, startTransition] = useTransition()
  const gridRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  const nodeById = useMemo(
    () => new Map(widgets.map((w) => [w.id, w.node])),
    [widgets],
  )
  const titleById = useMemo(
    () => new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w.title])),
    [],
  )

  // Below md, the 12-col grid collapses to a single stacked column.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  const persist = useCallback(
    (next: DashboardLayout) => {
      startTransition(async () => {
        try {
          await saveAction(next)
        } catch {
          // A layout is a non-critical preference — a failed save is not surfaced.
        }
      })
    },
    [saveAction],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e
      if (!over || active.id === over.id) return
      const from = layout.findIndex((l) => l.id === active.id)
      const to = layout.findIndex((l) => l.id === over.id)
      if (from < 0 || to < 0) return
      const next = arrayMove(layout, from, to)
      setLayout(next)
      persist(next)
    },
    [layout, persist],
  )

  const resizeTo = useCallback((id: string, colSpan: number, rowSpan: number) => {
    setLayout((prev) =>
      prev.map((l) => (l.id === id ? { ...l, colSpan, rowSpan } : l)),
    )
  }, [])

  const commitLayout = useCallback(() => {
    persist(layoutRef.current)
  }, [persist])

  const handleReset = useCallback(() => {
    const def = defaultLayout()
    setLayout(def)
    startTransition(async () => {
      try {
        await resetAction()
      } catch {
        // non-fatal
      }
    })
  }, [resetAction])

  /** Horizontal px per column step (cell width + gap), from the live grid width. */
  const colStepPx = useCallback(() => {
    const w = gridRef.current?.clientWidth ?? 0
    if (w <= 0) return ROW_PX + GAP_PX
    return (w - GAP_PX * (MAX - 1)) / MAX + GAP_PX
  }, [])

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${MAX}, minmax(0, 1fr))`,
    gridAutoRows: `${ROW_PX}px`,
  }

  const toolbar = (
    <div className="flex items-center justify-end gap-2">
      {editing ? (
        <>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
          <Button size="sm" onClick={() => setEditing(false)}>
            <Check className="size-4" />
            Done
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <LayoutGrid className="size-4" />
          Edit layout
        </Button>
      )}
    </div>
  )

  // Mobile: a plain stack (no drag/resize — a 12-col grid is unusable narrow).
  if (!isDesktop) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div className="flex flex-col gap-4">
          {layout.map((item) => (
            <div key={item.id}>{nodeById.get(item.id)}</div>
          ))}
        </div>
      </div>
    )
  }

  // Desktop view mode: static 12-col grid honouring each widget's span.
  if (!editing) {
    return (
      <div className="space-y-4">
        {toolbar}
        <div ref={gridRef} className="grid gap-4" style={gridStyle}>
          {layout.map((item) => (
            <div
              key={item.id}
              className="min-h-0 overflow-auto"
              style={{
                gridColumn: `span ${item.colSpan}`,
                gridRow: `span ${item.rowSpan}`,
              }}
            >
              {nodeById.get(item.id)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Desktop edit mode: draggable + resizable.
  return (
    <div className="space-y-4">
      {toolbar}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={layout.map((l) => l.id)}
          strategy={rectSortingStrategy}
        >
          <div ref={gridRef} className="grid gap-4" style={gridStyle}>
            {layout.map((item) => (
              <SortableWidget
                key={item.id}
                id={item.id}
                title={titleById.get(item.id) ?? item.id}
                colSpan={item.colSpan}
                rowSpan={item.rowSpan}
                colStepPx={colStepPx}
                onResize={resizeTo}
                onResizeEnd={commitLayout}
              >
                {nodeById.get(item.id)}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

interface SortableWidgetProps {
  id: string
  title: string
  colSpan: number
  rowSpan: number
  colStepPx: () => number
  onResize: (id: string, colSpan: number, rowSpan: number) => void
  onResizeEnd: () => void
  children: ReactNode
}

function SortableWidget({
  id,
  title,
  colSpan,
  rowSpan,
  colStepPx,
  onResize,
  onResizeEnd,
  children,
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  const resizeStart = useRef<
    { x: number; y: number; col: number; row: number; step: number } | null
  >(null)

  const onResizePointerDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      col: colSpan,
      row: rowSpan,
      step: colStepPx(),
    }
  }
  const onResizePointerMove = (e: ReactPointerEvent) => {
    const s = resizeStart.current
    if (!s) return
    const dCols = Math.round((e.clientX - s.x) / s.step)
    const dRows = Math.round((e.clientY - s.y) / (ROW_PX + GAP_PX))
    onResize(id, clampSpan(s.col + dCols), clampSpan(s.row + dRows))
  }
  const onResizePointerUp = (e: ReactPointerEvent) => {
    if (!resizeStart.current) return
    resizeStart.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    onResizeEnd()
  }

  const style: CSSProperties = {
    gridColumn: `span ${colSpan}`,
    gridRow: `span ${rowSpan}`,
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative min-h-0", isDragging && "opacity-70")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute left-2 top-2 z-10 flex cursor-grab touch-none items-center gap-1 rounded-md border bg-background/90 px-1.5 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur"
      >
        <GripVertical className="size-3.5" />
        {title}
      </button>

      <div className="pointer-events-none h-full select-none overflow-hidden rounded-xl ring-2 ring-primary/30">
        {children}
      </div>

      <div
        role="slider"
        aria-label={`Resize ${title}`}
        aria-valuenow={colSpan}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        className="absolute bottom-1 right-1 z-10 size-4 cursor-nwse-resize rounded-sm border border-primary/40 bg-primary/20 hover:bg-primary/40"
      />
    </div>
  )
}
