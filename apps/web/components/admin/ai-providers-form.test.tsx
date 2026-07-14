/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AiProvidersForm } from "./ai-providers-form"
import { PROVIDER_MODELS } from "@/lib/ai/provider-models"
import { AI_FEATURE_NAMES } from "@/lib/ai/features"
import type { AiProvidersView, AiProviderSafe } from "@/lib/data/ai-providers"

vi.mock("server-only", () => ({}))

function provider(overrides: Partial<AiProviderSafe> & Pick<AiProviderSafe, "provider" | "label">): AiProviderSafe {
  return {
    enabled: false,
    baseUrl: null,
    model: null,
    hasApiKey: false,
    priority: 100,
    selfHosted: false,
    configured: false,
    ...overrides,
  }
}

function makeView(overrides: Partial<AiProvidersView> = {}): AiProvidersView {
  return {
    providers: [
      provider({ provider: "claude", label: "Claude (Anthropic)" }),
      provider({ provider: "ollama_local", label: "Ollama", selfHosted: true }),
    ],
    primaryProvider: null,
    featureProviderOverrides: {},
    ...overrides,
  }
}

function datalistOptions(container: HTMLElement, provider: string): string[] {
  const list = container.querySelector<HTMLDataListElement>(`#ai-model-options-${provider}`)
  if (!list) return []
  return Array.from(list.querySelectorAll("option")).map((o) => o.value)
}

describe("AiProvidersForm — model picker", () => {
  it("shows the curated models as datalist options for a provider with a list", () => {
    const { container } = render(<AiProvidersForm data={makeView()} saveAction={vi.fn()} />)

    const claudeInput = screen.getByLabelText("Model for Claude (Anthropic)")
    // Input is wired to its datalist so the browser offers the suggestions.
    expect(claudeInput).toHaveAttribute("list", "ai-model-options-claude")
    expect(datalistOptions(container, "claude")).toEqual(PROVIDER_MODELS.claude)
    // Sanity: the seeded list is non-empty and includes the adapter default.
    expect(PROVIDER_MODELS.claude).toContain("claude-sonnet-4-6")
  })

  it("falls back to a plain free-text input for an empty-list (self-hosted) provider", () => {
    const { container } = render(<AiProvidersForm data={makeView()} saveAction={vi.fn()} />)

    const ollamaInput = screen.getByLabelText("Model for Ollama")
    expect(ollamaInput).not.toHaveAttribute("list")
    expect(ollamaInput).toHaveAttribute("placeholder", "model name")
    expect(container.querySelector("#ai-model-options-ollama_local")).toBeNull()
  })

  it("preserves a custom / unknown model value on save", async () => {
    const saveAction = vi.fn().mockResolvedValue(undefined)
    render(<AiProvidersForm data={makeView()} saveAction={saveAction} />)

    const claudeInput = screen.getByLabelText("Model for Claude (Anthropic)")
    await userEvent.type(claudeInput, "claude-some-future-model")
    expect(claudeInput).toHaveValue("claude-some-future-model")

    await userEvent.click(screen.getByRole("button", { name: /save providers/i }))

    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))
    const payload = saveAction.mock.calls[0][0] as {
      providers: { provider: string; model: string }[]
    }
    const claude = payload.providers.find((p) => p.provider === "claude")
    expect(claude?.model).toBe("claude-some-future-model")
  })

  it("saves a picked curated model value", async () => {
    const saveAction = vi.fn().mockResolvedValue(undefined)
    const data = makeView({
      providers: [provider({ provider: "claude", label: "Claude (Anthropic)", model: "claude-opus-4-8" })],
    })
    render(<AiProvidersForm data={data} saveAction={saveAction} />)

    expect(screen.getByLabelText("Model for Claude (Anthropic)")).toHaveValue("claude-opus-4-8")

    await userEvent.click(screen.getByRole("button", { name: /save providers/i }))
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))
    const payload = saveAction.mock.calls[0][0] as {
      providers: { provider: string; model: string }[]
    }
    expect(payload.providers[0].model).toBe("claude-opus-4-8")
  })
})

describe("AiProvidersForm — provider override (ORR-685)", () => {
  // Derive from the source of truth so adding an AI feature never breaks this test.
  const ALL_FEATURES = AI_FEATURE_NAMES

  it("fans a single chosen provider out to every feature", async () => {
    const saveAction = vi.fn().mockResolvedValue(undefined)
    const data = makeView({
      providers: [provider({ provider: "claude", label: "Claude (Anthropic)", enabled: true })],
      featureProviderOverrides: {},
    })
    render(<AiProvidersForm data={data} saveAction={saveAction} />)

    await userEvent.click(screen.getByRole("combobox", { name: /ai provider override/i }))
    await userEvent.click(await screen.findByRole("option", { name: "Claude (Anthropic)" }))

    await userEvent.click(screen.getByRole("button", { name: /save providers/i }))
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))

    const payload = saveAction.mock.calls[0][0] as { featureProviderOverrides: Record<string, string> }
    expect(payload.featureProviderOverrides).toEqual(
      Object.fromEntries(ALL_FEATURES.map((f) => [f, "claude"])),
    )
  })

  it("clears all overrides when set to Auto", async () => {
    const saveAction = vi.fn().mockResolvedValue(undefined)
    const data = makeView({
      providers: [provider({ provider: "claude", label: "Claude (Anthropic)", enabled: true })],
      // A uniform per-feature map collapses to the single control showing 'claude'.
      featureProviderOverrides: Object.fromEntries(ALL_FEATURES.map((f) => [f, "claude"])),
    })
    render(<AiProvidersForm data={data} saveAction={saveAction} />)

    await userEvent.click(screen.getByRole("combobox", { name: /ai provider override/i }))
    await userEvent.click(await screen.findByRole("option", { name: /auto/i }))

    await userEvent.click(screen.getByRole("button", { name: /save providers/i }))
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))

    const payload = saveAction.mock.calls[0][0] as { featureProviderOverrides: Record<string, string> }
    expect(payload.featureProviderOverrides).toEqual({})
  })

  it("normalises a legacy mixed per-feature map to a single provider on save", async () => {
    const saveAction = vi.fn().mockResolvedValue(undefined)
    const data = makeView({
      providers: [
        provider({ provider: "claude", label: "Claude (Anthropic)", enabled: true }),
        provider({ provider: "ollama_local", label: "Ollama", enabled: true, selfHosted: true }),
      ],
      // Mixed values → the control starts at Auto; picking one normalises everything.
      featureProviderOverrides: { summarise_deal: "claude", opportunity_extraction: "ollama_local" },
    })
    render(<AiProvidersForm data={data} saveAction={saveAction} />)

    await userEvent.click(screen.getByRole("combobox", { name: /ai provider override/i }))
    await userEvent.click(await screen.findByRole("option", { name: "Ollama" }))

    await userEvent.click(screen.getByRole("button", { name: /save providers/i }))
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(1))

    const payload = saveAction.mock.calls[0][0] as { featureProviderOverrides: Record<string, string> }
    expect(payload.featureProviderOverrides).toEqual(
      Object.fromEntries(ALL_FEATURES.map((f) => [f, "ollama_local"])),
    )
  })
})
