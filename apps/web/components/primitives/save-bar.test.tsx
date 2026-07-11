/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { SaveBar } from "./save-bar"

describe("SaveBar", () => {
  it("is hidden (aria-hidden) when closed", () => {
    render(<SaveBar open={false} onSave={vi.fn()} onDiscard={vi.fn()} />)
    expect(screen.getByRole("region", { hidden: true })).toHaveAttribute("aria-hidden", "true")
  })

  it("shows the message and fires save / discard when open", () => {
    const onSave = vi.fn()
    const onDiscard = vi.fn()
    render(
      <SaveBar open message="3 unsaved changes" onSave={onSave} onDiscard={onDiscard} />,
    )
    expect(screen.getByText("3 unsaved changes")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    expect(onDiscard).toHaveBeenCalledOnce()
    expect(onSave).toHaveBeenCalledOnce()
  })

  it("disables actions and shows a saving state", () => {
    const onSave = vi.fn()
    render(<SaveBar open saving onSave={onSave} onDiscard={vi.fn()} />)
    const saveBtn = screen.getByRole("button", { name: /Saving/ })
    expect(saveBtn).toBeDisabled()
    fireEvent.click(saveBtn)
    expect(onSave).not.toHaveBeenCalled()
  })
})
