"use client"

import { useState, useMemo, useCallback } from "react"
import { Search, ChevronRight, ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

export interface DualListboxOption {
  id: string
  label: string
}

interface DualListboxProps {
  options: DualListboxOption[]
  value: string[]
  onChange: (value: string[]) => void
  availableLabel?: string
  chosenLabel?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
  maxHeight?: number
}

export function DualListbox({
  options,
  value,
  onChange,
  availableLabel = "Available",
  chosenLabel = "Chosen",
  searchPlaceholder = "Search...",
  disabled = false,
  className,
  maxHeight = 200,
}: DualListboxProps) {
  const [availableSearch, setAvailableSearch] = useState("")
  const [chosenSearch, setChosenSearch] = useState("")
  const [selectedAvailable, setSelectedAvailable] = useState<Set<string>>(new Set())
  const [selectedChosen, setSelectedChosen] = useState<Set<string>>(new Set())

  const { available, chosen } = useMemo(() => {
    const chosenIds = new Set(value)
    const avail: DualListboxOption[] = []
    const chos: DualListboxOption[] = []

    for (const opt of options) {
      if (chosenIds.has(opt.id)) {
        chos.push(opt)
      } else {
        avail.push(opt)
      }
    }
    return { available: avail, chosen: chos }
  }, [options, value])

  const filteredAvailable = useMemo(() => {
    if (!availableSearch.trim()) return available
    const q = availableSearch.toLowerCase()
    return available.filter((opt) => opt.label.toLowerCase().includes(q))
  }, [available, availableSearch])

  const filteredChosen = useMemo(() => {
    if (!chosenSearch.trim()) return chosen
    const q = chosenSearch.toLowerCase()
    return chosen.filter((opt) => opt.label.toLowerCase().includes(q))
  }, [chosen, chosenSearch])

  const toggleAvailable = useCallback((id: string) => {
    setSelectedAvailable((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleChosen = useCallback((id: string) => {
    setSelectedChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const moveToChosen = useCallback(() => {
    if (selectedAvailable.size === 0) return
    const newValue = [...new Set([...value, ...selectedAvailable])]
    onChange(newValue)
    setSelectedAvailable(new Set())
    setAvailableSearch("")
  }, [value, selectedAvailable, onChange])

  const moveToAvailable = useCallback(() => {
    if (selectedChosen.size === 0) return
    const newValue = value.filter((id) => !selectedChosen.has(id))
    onChange(newValue)
    setSelectedChosen(new Set())
    setChosenSearch("")
  }, [value, selectedChosen, onChange])

  const selectAllAvailable = useCallback(() => {
    const ids = new Set(filteredAvailable.map((o) => o.id))
    setSelectedAvailable(ids)
  }, [filteredAvailable])

  const selectAllChosen = useCallback(() => {
    const ids = new Set(filteredChosen.map((o) => o.id))
    setSelectedChosen(ids)
  }, [filteredChosen])

  return (
    <div className={cn("flex gap-2", className)}>
      <div className="flex-1 space-y-1">
        <Label className="text-xs font-medium">{availableLabel}</Label>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={availableSearch}
            onChange={(e) => setAvailableSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-7 text-xs"
            disabled={disabled}
          />
        </div>
        <ScrollArea className="rounded-md border" style={{ height: maxHeight }}>
          {filteredAvailable.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">No items</p>
          ) : (
            <>
              <button
                type="button"
                onClick={selectAllAvailable}
                className="w-full px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
                disabled={disabled}
              >
                Select all
              </button>
              {filteredAvailable.map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-accent text-sm",
                    selectedAvailable.has(opt.id) && "bg-accent",
                  )}
                >
                  <Checkbox
                    checked={selectedAvailable.has(opt.id)}
                    onCheckedChange={() => toggleAvailable(opt.id)}
                    disabled={disabled}
                  />
                  {opt.label}
                </label>
              ))}
            </>
          )}
        </ScrollArea>
      </div>

      <div className="flex flex-col justify-center gap-1 pt-5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7"
          onClick={moveToChosen}
          disabled={disabled || selectedAvailable.size === 0}
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7"
          onClick={moveToAvailable}
          disabled={disabled || selectedChosen.size === 0}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
      </div>

      <div className="flex-1 space-y-1">
        <Label className="text-xs font-medium">{chosenLabel}</Label>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={chosenSearch}
            onChange={(e) => setChosenSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 pl-7 text-xs"
            disabled={disabled}
          />
        </div>
        <ScrollArea className="rounded-md border" style={{ height: maxHeight }}>
          {filteredChosen.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">No items</p>
          ) : (
            <>
              <button
                type="button"
                onClick={selectAllChosen}
                className="w-full px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
                disabled={disabled}
              >
                Select all
              </button>
              {filteredChosen.map((opt) => (
                <label
                  key={opt.id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-accent text-sm",
                    selectedChosen.has(opt.id) && "bg-accent",
                  )}
                >
                  <Checkbox
                    checked={selectedChosen.has(opt.id)}
                    onCheckedChange={() => toggleChosen(opt.id)}
                    disabled={disabled}
                  />
                  {opt.label}
                </label>
              ))}
            </>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
