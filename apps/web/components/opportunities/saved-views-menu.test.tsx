/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

import { SavedViewsMenu } from "./saved-views-menu"
import type { SavedViewRecord } from "@/lib/data/saved-views"

const VIEWS: SavedViewRecord[] = [
  { id: "v1", name: "Hot deals", scope: "all", filters: { stageFilter: "negotiate" } },
  { id: "v2", name: "My propose", scope: "all", filters: { stageFilter: "propose" } },
]

function renderMenu(views: SavedViewRecord[]) {
  return render(
    <SavedViewsMenu
      savedViews={views}
      scope="all"
      currentFilters={{ stageFilter: "propose" }}
      canSave
      onApply={vi.fn()}
      saveViewAction={vi.fn(async () => views[0])}
      deleteSavedViewAction={vi.fn(async () => {})}
    />,
  )
}

describe("SavedViewsMenu", () => {
  it("renders the Views trigger with a count when there are saved views", () => {
    renderMenu(VIEWS)
    const trigger = screen.getByRole("button", { name: /Views/ })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent("2")
  })

  it("renders the trigger without a count when there are no saved views", () => {
    renderMenu([])
    const trigger = screen.getByRole("button", { name: /Views/ })
    expect(trigger).toBeInTheDocument()
    expect(trigger).not.toHaveTextContent("0")
  })
})
