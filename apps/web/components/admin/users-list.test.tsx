/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { UsersList } from "./users-list"
import type { AdminUserRecord } from "@/lib/data/users"

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock("server-only", () => ({}))

const users: AdminUserRecord[] = [
  {
    id: "u-admin", email: "alice@nodwin.com", fullName: "Alice Admin", role: "admin", active: true,
    crmInboundEmail: null, primaryEntityId: "e1", primaryEntityName: "Nodwin India",
    primaryBusinessUnitId: null, primaryBusinessUnitName: null, managerUserId: null, managerName: null,
  },
  {
    id: "u-rep", email: "charlie@nodwin.com", fullName: "Charlie Rep", role: "sales_rep", active: true,
    crmInboundEmail: null, primaryEntityId: "e1", primaryEntityName: "Nodwin India",
    primaryBusinessUnitId: null, primaryBusinessUnitName: null, managerUserId: "u-admin", managerName: "Alice Admin",
  },
]

function makeProps(extra = {}) {
  return {
    users,
    currentUserId: "u-admin",
    canManageRoles: true,
    entities: [{ id: "e1", name: "Nodwin India" }],
    businessUnits: [{ id: "b1", name: "East Asia" }],
    updateAction: vi.fn().mockResolvedValue(undefined),
    ...extra,
  }
}

describe("UsersList", () => {
  beforeEach(() => mockRefresh.mockClear())

  it("lists users with role badges and the (you) marker", () => {
    render(<UsersList {...makeProps()} />)
    // Email is unique per row (the name can also appear as another user's manager).
    expect(screen.getByText("alice@nodwin.com")).toBeInTheDocument()
    expect(screen.getByText("charlie@nodwin.com")).toBeInTheDocument()
    expect(screen.getByText("Sales Rep")).toBeInTheDocument()
    expect(screen.getByText("(you)")).toBeInTheDocument()
  })

  it("filters by search", async () => {
    render(<UsersList {...makeProps()} />)
    await userEvent.type(screen.getByPlaceholderText("Search users…"), "charlie")
    // Alice's row is gone (her email no longer shown).
    expect(screen.queryByText("alice@nodwin.com")).not.toBeInTheDocument()
    expect(screen.getByText("charlie@nodwin.com")).toBeInTheDocument()
  })

  it("edits another user and saves", async () => {
    const props = makeProps()
    render(<UsersList {...props} />)
    await userEvent.click(screen.getByRole("button", { name: "Edit Charlie Rep" }))
    expect(await screen.findByText("Edit user")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(props.updateAction).toHaveBeenCalledWith("u-rep", expect.objectContaining({ role: "sales_rep" }))
    })
  })

  it("omits role/manager/entity from the payload for an entity admin (canManageRoles=false)", async () => {
    const props = makeProps({ canManageRoles: false })
    render(<UsersList {...props} />)
    await userEvent.click(screen.getByRole("button", { name: "Edit Charlie Rep" }))
    await userEvent.click(await screen.findByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(props.updateAction).toHaveBeenCalled()
    })
    const payload = props.updateAction.mock.calls[0][1] as Record<string, unknown>
    expect("role" in payload).toBe(false)
    expect("primaryEntityId" in payload).toBe(false)
    expect("managerUserId" in payload).toBe(false)
    // Still allowed to edit name / BU / active.
    expect("active" in payload).toBe(true)
  })
})
