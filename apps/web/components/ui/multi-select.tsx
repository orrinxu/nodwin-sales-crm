"use client"

import { useState, useMemo, useRef, useCallback, useEffect, useId } from "react"
import { Search, X, Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface MultiSelectOption {
  id: string
  label: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
  id?: string
  className?: string
}

/**
 * Searchable chip/tag multi-select. Selected items render as removable chips in
 * the field; a search box filters the remaining options in a dropdown. Replaces
 * the two-column "Available/Chosen" shuttle (DualListbox) with the SAME contract
 * (`value: string[]`, `options: {id,label}[]`, `onChange`), so it is a drop-in.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  emptyMessage = "No matches.",
  disabled = false,
  id,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const labelById = useMemo(
    () => new Map(options.map((o) => [o.id, o.label])),
    [options],
  )
  const selected = value
  const chosenSet = useMemo(() => new Set(value), [value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options.filter(
      (o) => !chosenSet.has(o.id) && (!q || o.label.toLowerCase().includes(q)),
    )
  }, [options, chosenSet, query])

  // Keep the highlighted row valid as the filtered set changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clamp highlight to the current filtered length
    setHighlight((h) => Math.min(h, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const add = useCallback(
    (optId: string) => {
      if (chosenSet.has(optId)) return
      onChange([...value, optId])
      setQuery("")
      inputRef.current?.focus()
    },
    [chosenSet, onChange, value],
  )

  const remove = useCallback(
    (optId: string) => {
      onChange(value.filter((v) => v !== optId))
    },
    [onChange, value],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const opt = filtered.at(highlight)
      if (opt) add(opt.id)
    } else if (e.key === "Escape") {
      setOpen(false)
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      const last = selected.at(-1)
      if (last) remove(last)
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={() => {
          if (!disabled) {
            setOpen(true)
            inputRef.current?.focus()
          }
        }}
      >
        {selected.map((optId) => (
          <Badge key={optId} variant="secondary" className="gap-1 py-0.5 pr-1">
            {labelById.get(optId) ?? optId}
            <button
              type="button"
              aria-label={`Remove ${labelById.get(optId) ?? optId}`}
              className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={(e) => {
                e.stopPropagation()
                remove(optId)
              }}
              disabled={disabled}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <div className="relative flex min-w-24 flex-1 items-center">
          {selected.length === 0 && !query && (
            <Search className="pointer-events-none absolute left-0 size-3.5 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
            disabled={disabled}
            value={query}
            placeholder={selected.length === 0 ? placeholder : ""}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className={cn(
              "w-full bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground",
              selected.length === 0 && "pl-5",
            )}
          />
        </div>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <ScrollArea className="max-h-56">
            <ul id={listboxId} role="listbox" aria-multiselectable className="p-1">
              {filtered.length === 0 ? (
                <li className="px-2 py-3 text-center text-sm text-muted-foreground">
                  {query.trim() ? emptyMessage : "All selected."}
                </li>
              ) : (
                filtered.map((opt, i) => (
                  <li
                    key={opt.id}
                    role="option"
                    aria-selected={false}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      // mousedown (not click) so the input doesn't blur-close first
                      e.preventDefault()
                      add(opt.id)
                    }}
                    className={cn(
                      "flex cursor-default items-center justify-between rounded-md px-2 py-1.5 text-sm",
                      i === highlight && "bg-accent text-accent-foreground",
                    )}
                  >
                    {opt.label}
                    {i === highlight && <Check className="size-4 opacity-50" />}
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

export default MultiSelect
