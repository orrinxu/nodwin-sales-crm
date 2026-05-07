/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { RichTextEditor } from "./rich-text-editor"

const mockEditor = {
  getHTML: vi.fn(() => "<p></p>"),
  commands: {
    setContent: vi.fn(),
    toggleBold: vi.fn(),
    toggleItalic: vi.fn(),
    toggleBulletList: vi.fn(),
    toggleOrderedList: vi.fn(),
    setLink: vi.fn(),
    unsetLink: vi.fn(),
    focus: vi.fn(),
    extendMarkRange: vi.fn(() => ({ setLink: vi.fn() })),
  },
  chain: vi.fn(() => mockEditor.commands),
  isActive: vi.fn(() => false),
  getAttributes: vi.fn(() => ({})),
  setEditable: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  destroy: vi.fn(),
  registerPlugin: vi.fn(),
  unregisterPlugin: vi.fn(),
}

vi.mock("@tiptap/react", async () => {
  const actual = await vi.importActual<typeof import("@tiptap/react")>("@tiptap/react")
  return {
    ...actual,
    useEditor: vi.fn((options) => {
      if (options?.onUpdate) {
        options.onUpdate({ editor: mockEditor as unknown as import("@tiptap/react").Editor })
      }
      return mockEditor
    }),
    EditorContent: vi.fn(({ editor, className, style }) => (
      <div data-testid="editor-content" className={className} style={style}>
        {editor ? "Editor" : "No editor"}
      </div>
    )),
  }
})

vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: vi.fn(({ children }) => (
    <div data-testid="bubble-menu">{children}</div>
  )),
}))

describe("RichTextEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders editor content", () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    expect(screen.getByTestId("editor-content")).toBeInTheDocument()
  })

  it("calls onChange when content updates", () => {
    const onChange = vi.fn()
    mockEditor.getHTML.mockReturnValue("<p>Hello</p>")

    render(<RichTextEditor value="" onChange={onChange} />)

    expect(onChange).toHaveBeenCalledWith("<p>Hello</p>")
  })

  it("calls onChange with empty string for empty paragraph", () => {
    const onChange = vi.fn()
    mockEditor.getHTML.mockReturnValue("<p></p>")

    render(<RichTextEditor value="" onChange={onChange} />)

    expect(onChange).toHaveBeenCalledWith("")
  })

  it("renders toolbar buttons", () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText("Bold")).toBeInTheDocument()
    expect(screen.getByLabelText("Italic")).toBeInTheDocument()
    expect(screen.getByLabelText("Bullet list")).toBeInTheDocument()
    expect(screen.getByLabelText("Ordered list")).toBeInTheDocument()
    expect(screen.getByLabelText("Add link")).toBeInTheDocument()
  })

  it("applies aria-label when provided", () => {
    render(
      <RichTextEditor
        value=""
        onChange={vi.fn()}
        ariaLabel="Description editor"
      />
    )
    expect(screen.getByTestId("editor-content")).toBeInTheDocument()
  })

  it("applies disabled state", () => {
    render(<RichTextEditor value="" onChange={vi.fn()} disabled />)
    expect(mockEditor.setEditable).toHaveBeenCalledWith(false)
  })

  it("applies custom minHeight", () => {
    render(
      <RichTextEditor value="" onChange={vi.fn()} minHeight="200px" />
    )
    expect(screen.getByTestId("editor-content")).toHaveStyle("min-height: 200px")
  })
})
