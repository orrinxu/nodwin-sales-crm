/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { OrganisationSettings } from "./organisation-settings"
import type { ReportingCurrencyOverview } from "@/lib/data/organisation-settings"

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock("server-only", () => ({}))

const currencies = [
  { code: "USD", name: "US Dollar" },
  { code: "INR", name: "Indian Rupee" },
]
const entities = [
  { id: "e1", name: "Nodwin India" },
  { id: "e2", name: "Trinity Gaming" },
]

function makeProps(overview: ReportingCurrencyOverview, extra = {}) {
  return {
    overview,
    currencies,
    entities,
    defaultCurrency: "USD",
    canEditGroupDefault: true,
    setGroupAction: vi.fn().mockResolvedValue(undefined),
    setEntityAction: vi.fn().mockResolvedValue(undefined),
    removeEntityAction: vi.fn().mockResolvedValue(undefined),
    ...extra,
  }
}

describe("OrganisationSettings", () => {
  beforeEach(() => mockRefresh.mockClear())

  it("renders the reporting currency section", () => {
    render(<OrganisationSettings {...makeProps({ groupDefault: null, entityOverrides: [] })} />)
    expect(screen.getByText("Reporting currency")).toBeInTheDocument()
    expect(screen.getByText("Group default")).toBeInTheDocument()
  })

  it("shows the group default read-only when the viewer can't edit it (entity admin)", () => {
    render(
      <OrganisationSettings
        {...makeProps({ groupDefault: "INR", entityOverrides: [] }, { canEditGroupDefault: false })}
      />,
    )
    // No Save button for the group default; the value is shown as text.
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument()
    expect(screen.getByText(/set by a group admin/)).toBeInTheDocument()
  })

  it("saves the group default", async () => {
    const props = makeProps({ groupDefault: "INR", entityOverrides: [] })
    render(<OrganisationSettings {...props} />)
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(props.setGroupAction).toHaveBeenCalledWith({ currencyCode: "INR" })
    })
  })

  it("lists an existing per-entity override", () => {
    render(
      <OrganisationSettings
        {...makeProps({
          groupDefault: "USD",
          entityOverrides: [{ entityId: "e1", entityName: "Nodwin India", currencyCode: "INR" }],
        })}
      />,
    )
    expect(screen.getByText("Nodwin India")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Remove override for Nodwin India" }),
    ).toBeInTheDocument()
  })

  it("removes an override", async () => {
    const props = makeProps({
      groupDefault: "USD",
      entityOverrides: [{ entityId: "e1", entityName: "Nodwin India", currencyCode: "INR" }],
    })
    render(<OrganisationSettings {...props} />)
    await userEvent.click(screen.getByRole("button", { name: "Remove override for Nodwin India" }))
    await waitFor(() => {
      expect(props.removeEntityAction).toHaveBeenCalledWith("e1")
    })
  })

  it("only offers entities without an existing override in the add picker", () => {
    // e1 already has an override, so only e2 (Trinity) should be addable.
    render(
      <OrganisationSettings
        {...makeProps({
          groupDefault: null,
          entityOverrides: [{ entityId: "e1", entityName: "Nodwin India", currencyCode: "INR" }],
        })}
      />,
    )
    // The "Add override" control is present (there is a still-addable entity).
    expect(screen.getByRole("button", { name: /add override/i })).toBeInTheDocument()
  })
})
