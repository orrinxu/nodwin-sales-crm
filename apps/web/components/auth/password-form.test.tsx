import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PasswordForm } from "./password-form"

vi.mock("server-only", () => ({}))

const mockSignInWithPassword = vi.fn()
const mockSignOut = vi.fn()
const mockPush = vi.fn()
const mockRefresh = vi.fn()

const mockSupabaseClient = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    signOut: mockSignOut,
  },
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockSignInWithPassword.mockReset()
  mockSignOut.mockReset()
  mockPush.mockReset()
  mockRefresh.mockReset()
})

describe("PasswordForm", () => {
  it("renders email and password inputs and a sign in button", () => {
    render(<PasswordForm />)

    expect(screen.getByLabelText("Email address")).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument()
  })

  it("rejects a disallowed email domain without calling signInWithPassword", async () => {
    const user = userEvent.setup()
    render(<PasswordForm />)

    await user.type(screen.getByLabelText("Email address"), "someone@gmail.com")
    await user.type(screen.getByLabelText("Password"), "secret123")
    await user.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() =>
      expect(
        screen.getByText(/email domain is not allowed/i),
      ).toBeInTheDocument(),
    )
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it("calls signInWithPassword for an allowed domain", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { email: "user@nodwin.com" } },
      error: null,
    })

    const user = userEvent.setup()
    render(<PasswordForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.type(screen.getByLabelText("Password"), "secret123")
    await user.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() =>
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "user@nodwin.com",
        password: "secret123",
      }),
    )
  })

  it("surfaces an error when credentials are invalid", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    })

    const user = userEvent.setup()
    render(<PasswordForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.type(screen.getByLabelText("Password"), "wrongpass")
    await user.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() =>
      expect(
        screen.getByText(/invalid login credentials/i),
      ).toBeInTheDocument(),
    )
  })

  it("signs out and blocks a user whose token resolves to a disallowed domain", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { email: "sneaky@evil.com" } },
      error: null,
    })
    mockSignOut.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(<PasswordForm />)

    // Passes the client-side domain check (allowed), but the returned user is
    // on a disallowed domain -> must be signed out.
    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.type(screen.getByLabelText("Password"), "secret123")
    await user.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
  })
})
