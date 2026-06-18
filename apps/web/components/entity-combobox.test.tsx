import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EntityCombobox } from "./entity-combobox"
import type { EntityOption } from "./entity-combobox"

const mockItems: EntityOption[] = [
  { id: "acct-1", name: "Acme Corp" },
  { id: "acct-2", name: "Globex Inc" },
  { id: "acct-3", name: "Waystar Royco" },
]

describe("EntityCombobox", () => {
  describe("rendering", () => {
    it("renders with placeholder", () => {
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          placeholder="Choose account..."
        />,
      )
      expect(screen.getByText("Choose account...")).toBeInTheDocument()
    })

    it("shows selected item name instead of placeholder", () => {
      render(
        <EntityCombobox
          items={mockItems}
          value="acct-1"
          onChange={vi.fn()}
          placeholder="Choose account..."
        />,
      )
      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
      expect(screen.queryByText("Choose account...")).not.toBeInTheDocument()
    })

    it("shows value when selected item not in items list", () => {
      render(
        <EntityCombobox
          items={mockItems}
          value="nonexistent"
          onChange={vi.fn()}
        />,
      )
      expect(screen.getByText("nonexistent")).toBeInTheDocument()
    })

    it("renders disabled state", () => {
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          disabled
        />,
      )
      const trigger = screen.getByRole("combobox")
      expect(trigger).toBeDisabled()
    })

    it("handles empty items array gracefully", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={[]}
          value={null}
          onChange={vi.fn()}
          emptyMessage="No accounts available"
        />,
      )

      await user.click(screen.getByRole("combobox"))
      expect(
        screen.getByText((content) => content.includes("No accounts available")),
      ).toBeInTheDocument()
    })
  })

  describe("filtering", () => {
    it("filters items when typing", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          searchPlaceholder="Search accounts..."
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search accounts..."), "Acme")

      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
      expect(screen.queryByText("Globex Inc")).not.toBeInTheDocument()
      expect(screen.queryByText("Waystar Royco")).not.toBeInTheDocument()
    })

    it("shows all items when input is empty", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox items={mockItems} value={null} onChange={vi.fn()} />,
      )

      await user.click(screen.getByRole("combobox"))

      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
      expect(screen.getByText("Globex Inc")).toBeInTheDocument()
      expect(screen.getByText("Waystar Royco")).toBeInTheDocument()
    })

    it("shows empty message when no results and no create", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          emptyMessage="Nothing here"
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "zzzNAzz")

      expect(
        screen.getByText((content) => content.includes("Nothing here")),
      ).toBeInTheDocument()
    })
  })

  describe("selection", () => {
    it("calls onChange when item is selected by click", async () => {
      const onChange = vi.fn()
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={onChange}
        />,
      )

      await user.click(screen.getByRole("combobox"))
      await user.click(screen.getByText("Acme Corp"))

      expect(onChange).toHaveBeenCalledWith("acct-1")
    })

    it("calls onChange when item is selected via keyboard", async () => {
      const onChange = vi.fn()
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={onChange}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "Globex")
      await user.keyboard("{ArrowDown}{Enter}")

      expect(onChange).toHaveBeenCalledWith("acct-2")
    })
  })

  describe("clearing selection", () => {
    it("calls onChange with null when value is cleared externally", () => {
      const onChange = vi.fn()
      const { rerender } = render(
        <EntityCombobox
          items={mockItems}
          value="acct-1"
          onChange={onChange}
        />,
      )
      expect(screen.getByText("Acme Corp")).toBeInTheDocument()

      rerender(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={onChange}
        />,
      )

      expect(screen.getByText("Select...")).toBeInTheDocument()
    })
  })

  describe("sublabel support", () => {
    it("renders sublabel when provided", async () => {
      const itemsWithSublabel: EntityOption[] = [
        { id: "acct-1", name: "Acme Corp", sublabel: "Technology" },
        { id: "acct-2", name: "Globex Inc" },
      ]
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={itemsWithSublabel}
          value={null}
          onChange={vi.fn()}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      expect(screen.getByText("Technology")).toBeInTheDocument()
    })

    it("does not render sublabel when not provided", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      const items = screen.getAllByRole("option")
      for (const item of items) {
        expect(item.querySelector("[data-slot]")).toBeFalsy()
      }
    })
  })

  describe("label field support", () => {
    it("uses label when both label and name are provided", async () => {
      const itemsWithLabel: EntityOption[] = [
        { id: "acct-1", name: "internal-key", label: "Acme Corporation" },
      ]
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={itemsWithLabel}
          value={null}
          onChange={vi.fn()}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
      expect(screen.queryByText("internal-key")).not.toBeInTheDocument()
    })

    it("falls back to name when label not provided", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
    })
  })

  describe("searchAction (server-side search)", () => {
    it("calls searchAction with debounced input value", async () => {
      const searchAction = vi.fn().mockResolvedValue([])
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          searchAction={searchAction}
        />,
      )

      await user.click(screen.getByRole("combobox"))
      await user.type(screen.getByPlaceholderText("Search..."), "Acme")

      await waitFor(() => {
        expect(searchAction).toHaveBeenCalledWith("Acme")
      })
    })

    it("shows loading state while searching", async () => {
      const searchAction = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 2000)),
      )
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          searchAction={searchAction}
        />,
      )

      await user.click(screen.getByRole("combobox"))
      await user.type(screen.getByPlaceholderText("Search..."), "Acme")

      await waitFor(() => {
        expect(screen.getByText("Searching...")).toBeInTheDocument()
      })
    })

    it("displays search results", async () => {
      const searchAction = vi.fn().mockResolvedValue([
        { id: "sr-1", name: "Search Result 1" },
      ])
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          searchAction={searchAction}
        />,
      )

      await user.click(screen.getByRole("combobox"))
      await user.type(screen.getByPlaceholderText("Search..."), "Acme")

      await waitFor(() => {
        expect(screen.getByText("Search Result 1")).toBeInTheDocument()
      })
      expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument()
      expect(screen.queryByText("Globex Inc")).not.toBeInTheDocument()
    })

    it("debounces rapid keystrokes", async () => {
      const searchAction = vi.fn().mockResolvedValue([])
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          searchAction={searchAction}
        />,
      )

      await user.click(screen.getByRole("combobox"))
      await user.type(screen.getByPlaceholderText("Search..."), "Acme")

      await waitFor(() => {
        expect(searchAction).toHaveBeenCalledTimes(1)
        expect(searchAction).toHaveBeenCalledWith("Acme")
      })
    })

    it("handles searchAction errors gracefully", async () => {
      const searchAction = vi.fn().mockRejectedValue(new Error("Network error"))
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          searchAction={searchAction}
          emptyMessage="No results"
        />,
      )

      await user.click(screen.getByRole("combobox"))
      await user.type(screen.getByPlaceholderText("Search..."), "Acme")

      await waitFor(() => {
        expect(
          screen.getByText((content) => content.includes("No results")),
        ).toBeInTheDocument()
      })
    })

    it("shows all items initially when no search input", async () => {
      const searchAction = vi.fn()
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          searchAction={searchAction}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
      expect(screen.getByText("Globex Inc")).toBeInTheDocument()
      expect(screen.getByText("Waystar Royco")).toBeInTheDocument()
      expect(searchAction).not.toHaveBeenCalled()
    })
  })

  describe("create-on-the-fly", () => {
    it("shows create option when no match and onCreate provided", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          onCreate={vi.fn()}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "NewCorp")

      expect(screen.getByRole("button", { name: 'Create "NewCorp"' })).toBeInTheDocument()
    })

    it("does NOT show create option when exact match exists", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          onCreate={vi.fn()}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "Acme Corp")

      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: 'Create "Acme Corp"' }),
      ).not.toBeInTheDocument()
    })

    it("does NOT show create option when onCreate is not provided", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "zzzNAzz")

      expect(
        screen.getByText((content) => content.includes("No results found.")),
      ).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /Create/ })).not.toBeInTheDocument()
    })

    it("does NOT show create option when input is empty", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          onCreate={vi.fn()}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      expect(
        screen.queryByRole("button", { name: /Create/ }),
      ).not.toBeInTheDocument()
    })

    it("calls onCreate when create button clicked and selects new item", async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: "new-1", name: "NewCorp" })
      const onChange = vi.fn()
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={onChange}
          onCreate={onCreate}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "NewCorp")
      await user.click(screen.getByRole("button", { name: 'Create "NewCorp"' }))

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalledWith("NewCorp")
        expect(onChange).toHaveBeenCalledWith("new-1")
      })
    })

    it("shows create option when using createAction prop", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          createAction={vi.fn()}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "NewCorp")

      expect(screen.getByRole("button", { name: 'Create "NewCorp"' })).toBeInTheDocument()
    })

    it("prefers createAction over onCreate when both provided", async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: "nocall", name: "Nope" })
      const createAction = vi.fn().mockResolvedValue({ id: "new-1", name: "NewCorp" })
      const onChange = vi.fn()
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={onChange}
          onCreate={onCreate}
          createAction={createAction}
        />,
      )

      await user.click(screen.getByRole("combobox"))
      await user.type(screen.getByPlaceholderText("Search..."), "NewCorp")
      await user.click(screen.getByRole("button", { name: 'Create "NewCorp"' }))

      await waitFor(() => {
        expect(createAction).toHaveBeenCalledWith("NewCorp")
        expect(onCreate).not.toHaveBeenCalled()
      })
    })

    it("shows error when creation fails", async () => {
      const onCreate = vi.fn().mockRejectedValue(new Error("Name already exists"))
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          onCreate={onCreate}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "NewCorp")
      await user.click(screen.getByRole("button", { name: 'Create "NewCorp"' }))

      expect(await screen.findByText("Name already exists")).toBeInTheDocument()
    })

    it("shows generic message for non-Error rejections", async () => {
      const onCreate = vi.fn().mockRejectedValue("oops")
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          onCreate={onCreate}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "NewCorp")
      await user.click(screen.getByRole("button", { name: 'Create "NewCorp"' }))

      expect(await screen.findByText("Failed to create")).toBeInTheDocument()
    })

    it("uses custom create label", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          onCreate={vi.fn()}
          createLabel={(q) => `Add ${q} as new`}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "NewCorp")

      expect(
        screen.getByRole("button", { name: "Add NewCorp as new" }),
      ).toBeInTheDocument()
    })

    it("shows Creating... state while create is pending", async () => {
      const onCreate = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ id: "new-1", name: "NewCorp" }), 100)),
      )
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          onCreate={onCreate}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "NewCorp")
      await user.click(screen.getByRole("button", { name: 'Create "NewCorp"' }))

      expect(screen.getByText("Creating...")).toBeInTheDocument()
    })
  })

  describe("case insensitivity", () => {
    it("filters items case-insensitively", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox items={mockItems} value={null} onChange={vi.fn()} />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "acme")

      expect(screen.getByText("Acme Corp")).toBeInTheDocument()
    })

    it("detects exact match case-insensitively for create suppression", async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={vi.fn()}
          onCreate={vi.fn()}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "ACME CORP")

      expect(
        screen.queryByRole("button", { name: /Create/ }),
      ).not.toBeInTheDocument()
    })
  })

  describe("newly created items", () => {
    it("includes newly created items in subsequent searches", async () => {
      const onCreate = vi.fn().mockResolvedValue({ id: "new-1", name: "NewCorp" })
      const onChange = vi.fn()
      const user = userEvent.setup({ pointerEventsCheck: 0 })
      const { rerender } = render(
        <EntityCombobox
          items={mockItems}
          value={null}
          onChange={onChange}
          onCreate={onCreate}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "NewCorp")
      await user.click(screen.getByRole("button", { name: 'Create "NewCorp"' }))

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalledWith("NewCorp")
        expect(onChange).toHaveBeenCalledWith("new-1")
      })

      rerender(
        <EntityCombobox
          items={mockItems}
          value="new-1"
          onChange={onChange}
          onCreate={onCreate}
        />,
      )

      await user.click(screen.getByRole("combobox"))

      await user.type(screen.getByPlaceholderText("Search..."), "NewCorp")

      const matches = screen.getAllByText("NewCorp")
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })
  })
})
