import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EmailOtpForm } from "./email-otp-form"

vi.mock("server-only", () => ({}))

const mockSignInWithOtp = vi.fn()
const mockVerifyOtp = vi.fn()
const mockPush = vi.fn()
const mockRefresh = vi.fn()

const mockSupabaseClient = {
  auth: {
    signInWithOtp: mockSignInWithOtp,
    verifyOtp: mockVerifyOtp,
  },
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    refresh: mockRefresh,
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockSignInWithOtp.mockReset()
  mockVerifyOtp.mockReset()
  mockPush.mockReset()
  mockRefresh.mockReset()
})

describe("EmailOtpForm", () => {
  it("renders the email input and send button", () => {
    render(<EmailOtpForm />)

    expect(screen.getByLabelText("Email address")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /send verification code/i })).toBeInTheDocument()
  })

  it("disables send button when email is empty", () => {
    render(<EmailOtpForm />)

    expect(screen.getByRole("button", { name: /send verification code/i })).toBeDisabled()
  })

  it("calls signInWithOtp on email submit", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(<EmailOtpForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send verification code/i }))

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: "user@nodwin.com",
        options: { shouldCreateUser: true },
      })
    })
  })

  it("shows error when signInWithOtp fails", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: new Error("Rate limit exceeded") })

    const user = userEvent.setup()
    render(<EmailOtpForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send verification code/i }))

    await waitFor(() => {
      expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument()
    })
  })

  it("transitions to OTP step after successful send", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(<EmailOtpForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send verification code/i }))

    await waitFor(() => {
      expect(screen.getByLabelText("Verification code")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /verify code/i })).toBeInTheDocument()
    })
  })

  it("shows the email in the OTP step", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(<EmailOtpForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send verification code/i }))

    await waitFor(() => {
      expect(screen.getByText(/user@nodwin\.com/)).toBeInTheDocument()
    })
  })

  it("calls verifyOtp on OTP submit and redirects", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    mockVerifyOtp.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(<EmailOtpForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send verification code/i }))

    await waitFor(() => {
      expect(screen.getByLabelText("Verification code")).toBeInTheDocument()
    })

    const otpInput = screen.getByLabelText("Verification code")
    await user.type(otpInput, "123456")

    await user.click(screen.getByRole("button", { name: /verify code/i }))

    await waitFor(() => {
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: "user@nodwin.com",
        token: "123456",
        type: "email",
      })
      expect(mockRefresh).toHaveBeenCalled()
      expect(mockPush).toHaveBeenCalledWith("/contacts")
    })
  })

  it("disables verify button when OTP is not 6 digits", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(<EmailOtpForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send verification code/i }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /verify code/i })).toBeDisabled()
    })
  })

  it("only allows numeric input in OTP field", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(<EmailOtpForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send verification code/i }))

    await waitFor(() => {
      expect(screen.getByLabelText("Verification code")).toBeInTheDocument()
    })

    const otpInput = screen.getByLabelText("Verification code") as HTMLInputElement
    await user.type(otpInput, "abc123def456")

    expect(otpInput.value).toBe("123456")
  })

  it("shows error when verifyOtp fails", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    mockVerifyOtp.mockResolvedValue({ error: new Error("Invalid or expired token") })

    const user = userEvent.setup()
    render(<EmailOtpForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send verification code/i }))

    await waitFor(() => {
      expect(screen.getByLabelText("Verification code")).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText("Verification code"), "123456")
    await user.click(screen.getByRole("button", { name: /verify code/i }))

    await waitFor(() => {
      expect(screen.getByText("Invalid or expired token")).toBeInTheDocument()
    })
  })

  it("goes back to email step when back button is clicked", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    const user = userEvent.setup()
    render(<EmailOtpForm />)

    await user.type(screen.getByLabelText("Email address"), "user@nodwin.com")
    await user.click(screen.getByRole("button", { name: /send verification code/i }))

    await waitFor(() => {
      expect(screen.getByText(/use a different email/i)).toBeInTheDocument()
    })

    await user.click(screen.getByText(/use a different email/i))

    await waitFor(() => {
      expect(screen.getByLabelText("Email address")).toBeInTheDocument()
      expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument()
    })
  })
})
