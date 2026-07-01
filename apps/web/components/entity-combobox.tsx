"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
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
  name?: string
  label?: string
  sublabel?: string
}

export interface EntityComboboxProps {
  items: EntityOption[]
  value: string | null
  onChange: (value: string | null) => void
  searchAction?: (query: string) => Promise<EntityOption[]>
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  onCreate?: (name: string) => Promise<EntityOption>
  createAction?: (name: string) => Promise<EntityOption>
  createLabel?: (query: string) => string
  className?: string
}

function getItemLabel(item: EntityOption): string {
  return item.label ?? item.name ?? item.id
}

function getItemSublabel(item: EntityOption): string | undefined {
  return item.sublabel
}

const defaultCreateLabel = (query: string) => `Create "${query}"`

const DEBOUNCE_MS = 250

export function EntityCombobox({
  items,
  value,
  onChange,
  searchAction,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  disabled = false,
  onCreate,
  createAction,
  createLabel = defaultCreateLabel,
  className,
}: EntityComboboxProps) {
  const _createAction = createAction ?? onCreate
  const [createdItems, setCreatedItems] = useState<EntityOption[]>([])
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<EntityOption[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const inputValueRef = useRef(inputValue)
  // eslint-disable-next-line react-hooks/refs -- keep latest inputValue accessible from callbacks without re-registering them
  inputValueRef.current = inputValue
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!searchAction) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset search results when searchAction becomes unavailable
      setSearchResults(null)
      return
    }
    const query = inputValue.trim()
    if (!query) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchAction(query)
        setSearchResults(results)
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [inputValue, searchAction])

  const allItems = useMemo(
    () => [...items, ...createdItems],
    [items, createdItems],
  )

  const filteredItems = useMemo(() => {
    if (searchAction) return searchResults ?? allItems
    if (!inputValue.trim()) return allItems
    const q = inputValue.toLowerCase()
    return allItems.filter((item) => getItemLabel(item).toLowerCase().includes(q))
  }, [searchAction, searchResults, allItems, inputValue])

  const showCreate = useMemo(() => {
    if (!_createAction || !inputValue.trim()) return false
    const trimmed = inputValue.trim()
    const exactMatch = allItems.some(
      (item) => getItemLabel(item).toLowerCase() === trimmed.toLowerCase(),
    )
    return !exactMatch
  }, [_createAction, inputValue, allItems])

  const selectedItem = useMemo(
    () => allItems.find((item) => item.id === value),
    [allItems, value],
  )

  const displayValue = value && !selectedItem
    ? value
    : selectedItem
      ? getItemLabel(selectedItem)
      : ""

  const handleValueChange = useCallback(
    (v: string | null) => {
      onChange(v)
      setInputValue("")
      setOpen(false)
    },
    [onChange],
  )

  const handleCreate = useCallback(async () => {
    if (!_createAction || isCreating) return
    setIsCreating(true)
    setCreateError(null)
    try {
      const newItem = await _createAction(inputValue.trim())
      setCreatedItems((prev) => [...prev, newItem])
      onChange(newItem.id)
      setInputValue("")
      setOpen(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create")
    } finally {
      setIsCreating(false)
    }
  }, [_createAction, isCreating, inputValue, onChange])

  return (
    <Combobox
      autoComplete="none"
      open={inputValue ? true : open}
      onOpenChange={(newOpen) => {
        if (!inputValueRef.current) setOpen(!!newOpen)
      }}
      value={value}
      onValueChange={handleValueChange}
      onInputValueChange={(v) => setInputValue(v ?? "")}
      className={className}
    >
      <ComboboxTrigger
        className={cn(value && "[&>span]:truncate", "max-w-full")}
        disabled={disabled}
      >
        <ComboboxValue placeholder={placeholder}>
          {displayValue || undefined}
        </ComboboxValue>
      </ComboboxTrigger>
      <ComboboxContent align="start">
        <ComboboxInput
          placeholder={searchPlaceholder}
          className="rounded-none rounded-t-lg border-0 ring-offset-0 focus-visible:ring-0"
        />
        <ComboboxList>
          {isSearching && (
            <div className="flex items-center gap-1.5 px-1.5 py-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Searching...
            </div>
          )}
          {!isSearching && filteredItems.length === 0 && !showCreate && (
            <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
          )}
          {!isSearching && filteredItems.map((item) => {
            const sublabel = getItemSublabel(item)
            return (
              <ComboboxItem key={item.id} value={item.id}>
                <div className="flex flex-col items-start">
                  <span>{getItemLabel(item)}</span>
                  {sublabel && (
                    <span className="text-xs text-muted-foreground">
                      {sublabel}
                    </span>
                  )}
                </div>
              </ComboboxItem>
            )
          })}
        </ComboboxList>
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
