import { describe, it, expect, vi } from "vitest"
import { buildProvenanceInput, persistGeneratorArtifacts } from "./generator-artifacts"
import type { GenerateOpportunityResult } from "@/app/(crm)/opportunities/generate-actions"

const RESULT: GenerateOpportunityResult = {
  ok: true,
  prefill: { name: "Valorant India Invitational" },
  model: "claude-opus-4-8",
  truncated: true,
  notes: ["No account matched \"Acme Corp\"."],
  resolution: {
    name: { status: "ok", source: "subject line", confidence: 0.9, raw: "Valorant India Invitational", display: "Valorant India Invitational" },
    account: { status: "unmatched", source: "from Acme", confidence: 0.7, raw: "Acme Corp", display: "Acme Corp" },
  },
}

describe("buildProvenanceInput", () => {
  it("maps the resolution to per-field {status, confidence, source, raw} and carries model/notes/truncated", () => {
    const input = buildProvenanceInput("opp-1", RESULT, false)
    expect(input).toMatchObject({
      opportunityId: "opp-1",
      model: "claude-opus-4-8",
      sourceKind: "text",
      truncated: true,
      notes: ["No account matched \"Acme Corp\"."],
    })
    expect(input.fields.name).toEqual({ status: "ok", confidence: 0.9, source: "subject line", raw: "Valorant India Invitational" })
    expect(input.fields.account).toEqual({ status: "unmatched", confidence: 0.7, source: "from Acme", raw: "Acme Corp" })
    // display/candidates are UI-only and must not leak into the stored record.
    expect(Object.keys(input.fields.name)).toEqual(["status", "confidence", "source", "raw"])
  })

  it("sets sourceKind='document' when an RFP file backs the extraction", () => {
    expect(buildProvenanceInput("opp-1", RESULT, true).sourceKind).toBe("document")
  })

  it("defaults model to null when the provider reported none", () => {
    const input = buildProvenanceInput("opp-1", { ...RESULT, model: undefined }, false)
    expect(input.model).toBeNull()
  })
})

describe("persistGeneratorArtifacts", () => {
  const file = new File(["%PDF-1.4"], "brief.pdf", { type: "application/pdf" })

  it("records provenance and attaches the RFP file when both are present", async () => {
    const recordProvenance = vi.fn(async () => ({ ok: true }))
    const uploadRfp = vi.fn(async () => {})

    await persistGeneratorArtifacts({
      opportunityId: "opp-1",
      result: RESULT,
      rfpFile: file,
      deps: { recordProvenance, uploadRfp },
    })

    expect(recordProvenance).toHaveBeenCalledWith(expect.objectContaining({ opportunityId: "opp-1", sourceKind: "document" }))
    expect(uploadRfp).toHaveBeenCalledWith("opp-1", file)
  })

  it("skips provenance for a manual create (no result) and skips upload when no file", async () => {
    const recordProvenance = vi.fn(async () => ({ ok: true }))
    const uploadRfp = vi.fn(async () => {})

    await persistGeneratorArtifacts({
      opportunityId: "opp-1",
      result: null,
      rfpFile: null,
      deps: { recordProvenance, uploadRfp },
    })

    expect(recordProvenance).not.toHaveBeenCalled()
    expect(uploadRfp).not.toHaveBeenCalled()
  })

  it("skips provenance when the resolution is empty (nothing to attribute)", async () => {
    const recordProvenance = vi.fn(async () => ({ ok: true }))
    const uploadRfp = vi.fn(async () => {})

    await persistGeneratorArtifacts({
      opportunityId: "opp-1",
      result: { ok: true, resolution: {} },
      rfpFile: null,
      deps: { recordProvenance, uploadRfp },
    })

    expect(recordProvenance).not.toHaveBeenCalled()
  })

  it("is best-effort: a provenance failure never blocks the file upload and never throws", async () => {
    const recordProvenance = vi.fn(async () => { throw new Error("db down") })
    const uploadRfp = vi.fn(async () => {})
    const err = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      persistGeneratorArtifacts({ opportunityId: "opp-1", result: RESULT, rfpFile: file, deps: { recordProvenance, uploadRfp } }),
    ).resolves.toBeUndefined()

    expect(uploadRfp).toHaveBeenCalledOnce()
    err.mockRestore()
  })

  it("is best-effort: an upload failure never throws", async () => {
    const recordProvenance = vi.fn(async () => ({ ok: true }))
    const uploadRfp = vi.fn(async () => { throw new Error("storage 500") })
    const err = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      persistGeneratorArtifacts({ opportunityId: "opp-1", result: RESULT, rfpFile: file, deps: { recordProvenance, uploadRfp } }),
    ).resolves.toBeUndefined()

    err.mockRestore()
  })
})
