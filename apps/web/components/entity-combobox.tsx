"use client"

import { useState, useMemo, useCallback, useRef } from "react"
import { PlusIcon, Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Combobox,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxValue,
} from "@/components/ui/combobox"

export interface EntityOption {
  id: string
  name: string
}

export interface EntityComboboxProps {
  items: EntityOption[]
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  onCreate?: (name: string) => Promise<EntityOption>
  createLabel?: (query: string) => string
  className?: string
}

const defaultCreateLabel = (query: string) => `Create "${query}"`

export function EntityCombobox({
  items,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  disabled = false,
  onCreate,
  createLabel = defaultCreateLabel,
  className,
}: EntityComboboxProps) {
  const [createdItems, setCreatedItems] = useState<EntityOption[]>([])
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const inputValueRef = useRef(inputValue)
  inputValueRef.current = inputValue

  const allItems = useMemo(
    () => [...items, ...createdItems],
    [items, createdItems],
  )

  const filteredItems = useMemo(() => {
    if (!inputValue.trim()) return allItems
    const q = inputValue.toLowerCase()
    return allItems.filter((item) => item.name.toLowerCase().includes(q))
  }, [allItems, inputValue])

  const showCreate = useMemo(() => {
    if (!onCreate || !inputValue.trim()) return false
    const trimmed = inputValue.trim()
    const exactMatch = allItems.some(
      (item) => item.name.toLowerCase() === trimmed.toLowerCase(),
    )
    return !exactMatch
  }, [onCreate, inputValue, allItems])

  const selectedItem = useMemo(
    () => allItems.find((item) => item.id === value),
    [allItems, value],
  )

  const handleValueChange = useCallback(
    (v: string | null) => {
      if (v) {
        onChange(v)
        setInputValue("")
        setOpen(false)
      }
    },
    [onChange],
  )

  const handleCreate = useCallback(async () => {
    if (!onCreate || isCreating) return
    setIsCreating(true)
    setCreateError(null)
    try {
      const newItem = await onCreate(inputValue.trim())
      setCreatedItems((prev) => [...prev, newItem])
      onChange(newItem.id)
      setInputValue("")
      setOpen(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create")
    } finally {
      setIsCreating(false)
    }
  }, [onCreate, isCreating, inputValue, onChange])

  return (
    <Combobox
      autoComplete="none"
      open={inputValue ? true : open}
      onOpenChange={(newOpen) => {
        if (!inputValueRef.current) setOpen(!!newOpen)
      }}
      value={value ?? ""}
      onValueChange={handleValueChange}
      onInputValueChange={(v) => setInputValue(v ?? "")}
      className={className}
    >
      <ComboboxTrigger
        className={cn(value && "[&>span]:truncate", "max-w-full")}
        disabled={disabled}
      >
        {selectedItem ? (
          <ComboboxValue>{selectedItem.name}</ComboboxValue>
        ) : value ? (
          <ComboboxValue>{value}</ComboboxValue>
        ) : (
          <span className="flex flex-1 text-left truncate text-muted-foreground">
            {placeholder}
          </span>
        )}
      </ComboboxTrigger>
      <ComboboxContent align="start">
        <ComboboxInput
          placeholder={searchPlaceholder}
          className="rounded-none rounded-t-lg border-0 ring-offset-0 focus-visible:ring-0"
        />
        <ComboboxList>
          {filteredItems.map((item) => (
            <ComboboxItem key={item.id} value={item.id}>
              {item.name}
            </ComboboxItem>
          ))}
        </ComboboxList>
        {filteredItems.length === 0 && !showCreate && (
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        )}
        {showCreate && (
          <div className="border-t p-1">
            {createError && (
              <p className="px-1.5 py-1 text-xs text-destructive">
                {createError}
              </p>
            )}
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm text-primary hover:bg-accent disabled:opacity-50"
              onClick={handleCreate}
              disabled={isCreating}
            >
              {isCreating ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PlusIcon className="size-4" />
              )}
              {isCreating ? "Creating..." : createLabel(inputValue)}
            </button>
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  )
}

export default EntityCombobox
