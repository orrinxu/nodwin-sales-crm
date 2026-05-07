/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RichTextDisplay } from "./rich-text-display"

describe("RichTextDisplay", () => {
  it("renders sanitized HTML", () => {
    const { container } = render(<RichTextDisplay html="<p>Hello <strong>world</strong></p>" />)
    expect(container.querySelector("p")?.innerHTML).toContain("Hello")
    expect(container.querySelector("strong")?.innerHTML).toContain("world")
  })

  it("strips script tags", () => {
    render(<RichTextDisplay html="<p>Safe</p><script>alert('xss')</script>" />)
    expect(screen.getByText("Safe")).toBeInTheDocument()
    expect(screen.queryByText("alert('xss')")).not.toBeInTheDocument()
  })

  it("strips event handlers", () => {
    const { container } = render(
      <RichTextDisplay html='<p onclick="alert(1)">Click me</p>' />
    )
    const el = container.querySelector("p")
    expect(el).not.toHaveAttribute("onclick")
  })

  it("returns null for empty html", () => {
    const { container } = render(<RichTextDisplay html="" />)
    expect(container.firstChild).toBeNull()
  })

  it("applies custom className", () => {
    const { container } = render(
      <RichTextDisplay html="<p>Hello</p>" className="custom-class" />
    )
    expect(container.firstChild).toHaveClass("custom-class")
  })
})
