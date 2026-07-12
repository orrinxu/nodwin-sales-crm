/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { RevenueScheduleEditor } from "./revenue-schedule-editor"
import type { RevenueScheduleData, ScheduleMonthDTO } from "@/app/(crm)/opportunities/finance-actions"

const BALANCED: RevenueScheduleData = {
  months: [
    { month: "2026-01-01", amount: "600.00" },
    { month: "2026-02-01", amount: "400.00" },
  ],
  amount: "1000.00",
  currency: "USD",
  hasServicePeriod: true,
  isCustom: false,
}

function renderEditor(data: RevenueScheduleData) {
  const getAction = vi.fn<(opportunityId: string) => Promise<RevenueScheduleData>>(async () => data)
  const saveAction = vi.fn<(opportunityId: string, months: ScheduleMonthDTO[]) => Promise<void>>(
    async () => {},
  )
  render(
    <RevenueScheduleEditor
      opportunityId="opp-1"
      currency="USD"
      getAction={getAction}
      saveAction={saveAction}
    />,
  )
  return { getAction, saveAction }
}

describe("RevenueScheduleEditor", () => {
  it("loads the schedule and saves when the total matches the deal amount", async () => {
    const { getAction, saveAction } = renderEditor(BALANCED)
    await userEvent.click(screen.getByRole("button", { name: /set revenue schedule/i }))
    await waitFor(() => expect(getAction).toHaveBeenCalledWith("opp-1"))
    await screen.findByText("Jan 2026")

    const save = screen.getByRole("button", { name: /save schedule/i })
    expect(save).toBeEnabled()
    await userEvent.click(save)

    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))
    const [oppId, months] = saveAction.mock.calls[0]
    expect(oppId).toBe("opp-1")
    expect(months).toHaveLength(2)
    expect(months[0].month).toBe("2026-01-01")
  })

  it("disables save while the total does not equal the deal amount", async () => {
    // Sums to 600, deal amount is 1000 → unbalanced.
    renderEditor({ ...BALANCED, months: [{ month: "2026-01-01", amount: "600.00" }] })
    await userEvent.click(screen.getByRole("button", { name: /set revenue schedule/i }))
    await screen.findByText("Jan 2026")

    expect(screen.getByRole("button", { name: /save schedule/i })).toBeDisabled()
  })
})
