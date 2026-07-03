/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from "vitest"
import { useState } from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { TaxIdsEditor, type TaxIdRow } from "./tax-ids-editor"

const types = [
  { code: "IN_GSTIN", label: "GSTIN", countryIso: "IN", formatRegex: "^[0-9A-Z]{15}$", displayOrder: 1 },
  { code: "IN_PAN", label: "PAN", countryIso: "IN", formatRegex: null, displayOrder: 2 },
  { code: "SG_UEN", label: "UEN", countryIso: "SG", formatRegex: null, displayOrder: 1 },
]

function Harness({ initial = [] }: { initial?: TaxIdRow[] }) {
  const [rows, setRows] = useState<TaxIdRow[]>(initial)
  return <TaxIdsEditor taxIdTypes={types} value={rows} onChange={setRows} />
}

describe("TaxIdsEditor", () => {
  it("adds a row when a type is picked from the grouped picker", () => {
    render(<Harness />)
    expect(screen.getByText("No tax IDs added yet.")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Add tax ID"), { target: { value: "IN_GSTIN" } })
    expect(screen.getByLabelText("GSTIN value")).toBeInTheDocument()
    expect(screen.queryByText("No tax IDs added yet.")).not.toBeInTheDocument()
  })

  it("shows a soft (non-blocking) warning on format mismatch and clears it when valid", () => {
    render(<Harness initial={[{ taxType: "IN_GSTIN", value: "" }]} />)
    const input = screen.getByLabelText("GSTIN value")
    fireEvent.change(input, { target: { value: "bad" } })
    expect(screen.getByText(/Doesn.t match the expected GSTIN format/)).toBeInTheDocument()
    // The row is still editable — nothing blocks a save.
    fireEvent.change(input, { target: { value: "22AAAAA0000A1Z5" } })
    expect(screen.queryByText(/Doesn.t match the expected/)).not.toBeInTheDocument()
  })

  it("removes a row", () => {
    render(<Harness initial={[{ taxType: "IN_PAN", value: "AAAAA1111A" }]} />)
    expect(screen.getByLabelText("PAN value")).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText("Remove PAN"))
    expect(screen.queryByLabelText("PAN value")).not.toBeInTheDocument()
    expect(screen.getByText("No tax IDs added yet.")).toBeInTheDocument()
  })

  it("renders a row of an inactive/unknown type by its raw code (never dropped)", () => {
    render(<Harness initial={[{ taxType: "ZZ_OLD", value: "legacy-1" }]} />)
    expect(screen.getByText("ZZ_OLD")).toBeInTheDocument()
    expect(screen.getByLabelText("ZZ_OLD value")).toBeInTheDocument()
  })
})
