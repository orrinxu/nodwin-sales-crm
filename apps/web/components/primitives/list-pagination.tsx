"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { pageCount } from "@/lib/list/pagination"

interface ListPaginationProps {
  /** 1-based current page. */
  page: number
  pageSize: number
  /** Total rows across all pages (the filtered `count:'exact'`). */
  totalCount: number
  /** Navigate to a 1-based page. */
  onPageChange: (page: number) => void
  /** Noun for the count summary, e.g. "opportunity" → "12 opportunities". */
  noun?: { singular: string; plural: string }
}

/**
 * Server-driven pagination footer (ORR-755). Renders a row summary plus
 * Previous/Next controls. The parent owns the actual navigation (usually a URL
 * push) via `onPageChange`; this component only computes bounds and labels.
 */
export function ListPagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  noun = { singular: "row", plural: "rows" },
}: ListPaginationProps) {
  const pages = pageCount(totalCount, pageSize)
  const current = Math.min(Math.max(1, page), pages)
  const first = totalCount === 0 ? 0 : (current - 1) * pageSize + 1
  const last = Math.min(current * pageSize, totalCount)
  const label = totalCount === 1 ? noun.singular : noun.plural

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm text-muted-foreground">
      <div className="tabular-nums">
        {totalCount === 0 ? (
          <>No {noun.plural}</>
        ) : (
          <>
            {first.toLocaleString()}–{last.toLocaleString()} of{" "}
            {totalCount.toLocaleString()} {label}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          Page {current} of {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(current - 1)}
          disabled={current <= 1}
          aria-label="Previous page"
        >
          <ChevronLeftIcon className="size-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(current + 1)}
          disabled={current >= pages}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
