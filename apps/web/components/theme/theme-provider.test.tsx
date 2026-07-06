import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ThemeProvider } from "@/components/theme/theme-provider"
import { ModeToggle } from "@/components/theme/mode-toggle"
import { THEME_STORAGE_KEY } from "@/lib/theme/theme-object"

beforeEach(() => {
  localStorage.clear()
  document.cookie = `${THEME_STORAGE_KEY}=; path=/; max-age=0`
  document.documentElement.classList.remove("dark")
  // jsdom does not implement matchMedia; stub it (defaults OS to light).
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})

afterEach(cleanup)

describe("ThemeProvider", () => {
  it("hydrates the explicit stored preference without changing it", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark")
    render(
      <ThemeProvider defaultTheme="dark">
        <div>content</div>
      </ThemeProvider>,
    )
    // Applied the dark class from the stored preference.
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("toggles the mode and mirrors the preference to a cookie for SSR", async () => {
    const user = userEvent.setup()
    localStorage.setItem(THEME_STORAGE_KEY, "dark")
    render(
      <ThemeProvider defaultTheme="dark">
        <ModeToggle />
      </ThemeProvider>,
    )
    expect(document.documentElement.classList.contains("dark")).toBe(true)

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /toggle theme/i }))
    })

    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light")
    // The cookie is what keeps the next SSR paint flash-free.
    expect(document.cookie).toContain(`${THEME_STORAGE_KEY}=light`)
  })
})
