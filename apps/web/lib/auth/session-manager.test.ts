import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSignOut = vi.fn(() => ({ error: null }))
const mockUnsubscribe = vi.fn()
const mockOnAuthStateChange = vi.fn((_handler: (event: string) => void) => ({
  data: { subscription: { unsubscribe: mockUnsubscribe } },
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}))

const mockPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

let effectCleanup: (() => void) | undefined

vi.mock("react", async () => {
  const actual = await vi.importActual("react")
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void)) => {
      const cleanup = cb()
      effectCleanup = cleanup as (() => void) | undefined
    },
    useCallback: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
    useRef: <T>(value: T) => ({ current: value }),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  effectCleanup = undefined
})

describe("useSessionManager", () => {
  it("subscribes to auth state changes", async () => {
    const { useSessionManager } = await import("./session-manager")
    useSessionManager()
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1)
  })

  it("redirects to /login on SIGNED_OUT event", async () => {
    const { useSessionManager } = await import("./session-manager")
    useSessionManager()
    const handler = mockOnAuthStateChange.mock.calls[0]![0]
    handler("SIGNED_OUT")
    expect(mockPush).toHaveBeenCalledWith("/login")
  })

  it("does not redirect on other auth events", async () => {
    const { useSessionManager } = await import("./session-manager")
    useSessionManager()
    const handler = mockOnAuthStateChange.mock.calls[0]![0]
    handler("SIGNED_IN")
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("unsubscribes on cleanup", async () => {
    const { useSessionManager } = await import("./session-manager")
    useSessionManager()
    expect(effectCleanup).toBeDefined()
    effectCleanup!()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe("useSignOut", () => {
  it("calls supabase.auth.signOut()", async () => {
    const { useSignOut } = await import("./session-manager")
    const { signOut } = useSignOut()
    await signOut()
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it("does not call router.push directly", async () => {
    const { useSignOut } = await import("./session-manager")
    const { signOut } = useSignOut()
    await signOut()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("throws when signOut fails", async () => {
    mockSignOut.mockRejectedValueOnce(new Error("network error"))
    const { useSignOut } = await import("./session-manager")
    const { signOut } = useSignOut()
    await expect(signOut()).rejects.toThrow("network error")
  })
})
