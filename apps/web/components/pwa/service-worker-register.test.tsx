import { describe, it, expect, vi, afterEach } from "vitest"
import { render } from "@testing-library/react"
import { ServiceWorkerRegister } from "./service-worker-register"

function stubServiceWorker() {
  const register = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register },
    configurable: true,
  })
  return register
}

describe("ServiceWorkerRegister (ORR-705)", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("renders nothing", () => {
    const { container } = render(<ServiceWorkerRegister />)
    expect(container).toBeEmptyDOMElement()
  })

  it("does not register the worker outside production", () => {
    vi.stubEnv("NODE_ENV", "development")
    const register = stubServiceWorker()
    render(<ServiceWorkerRegister />)
    expect(register).not.toHaveBeenCalled()
  })

  it("registers /sw.js in production once the document is ready", () => {
    vi.stubEnv("NODE_ENV", "production")
    // jsdom reports readyState "complete", so registration runs synchronously.
    const register = stubServiceWorker()
    render(<ServiceWorkerRegister />)
    expect(register).toHaveBeenCalledWith("/sw.js")
  })
})
