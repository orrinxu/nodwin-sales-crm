import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MyTasks, type MyTask } from "./my-tasks"

const createTaskAction = vi.fn()
const completeTaskAction = vi.fn()
vi.mock("@/app/(crm)/dashboard/actions", () => ({
  createTaskAction: (...a: unknown[]) => createTaskAction(...a),
  completeTaskAction: (...a: unknown[]) => completeTaskAction(...a),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const tasks: MyTask[] = [
  {
    id: "1",
    title: "Overdue one",
    dueDate: "2020-01-01",
    priority: "normal",
    opportunityId: null,
    opportunityName: null,
    accountName: null,
    contactName: null,
  },
]

beforeEach(() => {
  createTaskAction.mockReset()
  completeTaskAction.mockReset()
  createTaskAction.mockResolvedValue({ id: "x" })
  completeTaskAction.mockResolvedValue(undefined)
})

describe("MyTasks", () => {
  it("groups tasks by due date and completes one", async () => {
    render(<MyTasks tasks={tasks} />)
    expect(screen.getByText("Overdue one")).toBeTruthy()
    expect(screen.getByText(/Overdue \(1\)/)).toBeTruthy()

    fireEvent.click(screen.getByLabelText("Complete Overdue one"))
    await waitFor(() => expect(completeTaskAction).toHaveBeenCalledWith("1"))
  })

  it("adds a task via the quick-add", async () => {
    render(<MyTasks tasks={[]} />)
    expect(screen.getByText(/No open tasks/)).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText("Add a task…"), {
      target: { value: "New follow-up" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Add/ }))
    await waitFor(() =>
      expect(createTaskAction).toHaveBeenCalledWith({ title: "New follow-up", dueDate: undefined }),
    )
  })
})
