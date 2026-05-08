import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MagicLinkForm } from "./magic-link-form"

vi.mock("server-only", () => ({}))

const mockSignInWithOtp = vi.fn()

const mockSupabaseClient = {
  auth: {
    signInWithOtp: mockSignInWithOtp,
  },
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockSignInWithOtp.mockReset()
})

describe("MagicLinkForm", () => {
  it("renders the email input and send button", () => {
    render(<MagicLinkForm />)

    expect(screen.getByLabelText("Email address")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /send magic link/i })).toBeInTheDocument()
  })

  it("disables send button when email is empty", () => {
    render(<MagicLinkForm />)

    expect(screen.getByRole("button", { name: /send magic link/i })).toBeDisabled()
  })

  it("calls signInWithOtp on email submit", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(<MagicLinkForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send magic link/i }))

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: "user@nodwin.com",
        options: {
          emailRedirectTo: expect.stringContaining("/auth/confirm"),
          shouldCreateUser: true,
        },
      })
    })
  })

  it("shows success message after sending", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(<MagicLinkForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send magic link/i }))

    await waitFor(() => {
      expect(screen.getByText(/magic link sent/i)).toBeInTheDocument()
      expect(screen.getByText(/check your email/i)).toBeInTheDocument()
    })
  })

  it("shows error when signInWithOtp fails", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: new Error("Rate limit exceeded") })

    const user = userEvent.setup()
    render(<MagicLinkForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send magic link/i }))

    await waitFor(() => {
      expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument()
    })
  })

  it("allows sending to a different email after success", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(<MagicLinkForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send magic link/i }))

    await waitFor(() => {
      expect(screen.getByText(/magic link sent/i)).toBeInTheDocument()
    })

    await user.click(screen.getByText(/send to a different email/i))

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeInTheDocument()
    })
  })

})
