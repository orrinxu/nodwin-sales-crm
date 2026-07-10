import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { MultiSelect, type MultiSelectOption } from "./multi-select"

const OPTIONS: MultiSelectOption[] = [
  { id: "in", label: "India" },
  { id: "us", label: "United States" },
  { id: "gb", label: "United Kingdom" },
]

function Harness({ initial = [] as string[], onChange = vi.fn() }) {
  const [value, setValue] = useState<string[]>(initial)
  return (
    <MultiSelect
      options={OPTIONS}
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange(v)
      }}
      placeholder="Add countries..."
    />
  )
}

describe("MultiSelect", () => {
  it("adds an option as a chip when picked from the dropdown", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.click(screen.getByPlaceholderText("Add countries..."))
    await user.click(await screen.findByRole("option", { name: "India" }))

    expect(onChange).toHaveBeenLastCalledWith(["in"])
    // Chip now shows the label, and the picked option leaves the dropdown.
    expect(screen.getByText("India")).toBeInTheDocument()
  })

  it("filters options by the typed query", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Harness />)

    await user.click(screen.getByPlaceholderText("Add countries..."))
    await user.type(screen.getByPlaceholderText("Add countries..."), "united")

    expect(screen.getByRole("option", { name: "United States" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "United Kingdom" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "India" })).not.toBeInTheDocument()
  })

  it("removes a selected chip via its remove button", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onChange = vi.fn()
    render(<Harness initial={["in"]} onChange={onChange} />)

    await user.click(screen.getByRole("button", { name: "Remove India" }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it("never shows an already-selected option in the dropdown", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Harness initial={["in"]} />)

    // With a chip present the placeholder is cleared; target the input by role.
    await user.click(screen.getByRole("combobox"))
    expect(screen.queryByRole("option", { name: "India" })).not.toBeInTheDocument()
    expect(screen.getByRole("option", { name: "United States" })).toBeInTheDocument()
  })
})
