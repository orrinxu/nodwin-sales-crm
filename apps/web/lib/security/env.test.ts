import { describe, it, expect } from "vitest"
import { z } from "zod"
import { envSchema } from "./env-schema"

describe("envSchema", () => {
  const validEnv = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    POSTMARK_WEBHOOK_SECRET: "webhook-secret",
    NEXT_PUBLIC_APP_NAME: "Test CRM",
    NEXT_PUBLIC_API_URL: "http://localhost:3001/api",
    NEXT_PUBLIC_DEBUG: "false",
    NEXT_PUBLIC_LOG_LEVEL: "info",
  }

  it("parses valid environment variables", () => {
    const result = envSchema.parse(validEnv)
    expect(result.SUPABASE_URL).toBe("https://project.supabase.co")
    expect(result.SUPABASE_ANON_KEY).toBe("anon-key")
    expect(result.NEXT_PUBLIC_APP_NAME).toBe("Test CRM")
  })

  it("throws on missing required variables", () => {
    const missingUrl = { ...validEnv }
    delete (missingUrl as Record<string, unknown>).SUPABASE_URL
    expect(() => envSchema.parse(missingUrl)).toThrow(z.ZodError)
  })

  it("throws on empty required string", () => {
    const bad = { ...validEnv, SUPABASE_ANON_KEY: "" }
    expect(() => envSchema.parse(bad)).toThrow(z.ZodError)
  })

  it("throws on invalid URL", () => {
    const bad = { ...validEnv, SUPABASE_URL: "not-a-url" }
    expect(() => envSchema.parse(bad)).toThrow(z.ZodError)
  })

  it("applies default for NEXT_PUBLIC_APP_NAME", () => {
    const withoutName = { ...validEnv }
    delete (withoutName as Record<string, unknown>).NEXT_PUBLIC_APP_NAME
    const result = envSchema.parse(withoutName)
    expect(result.NEXT_PUBLIC_APP_NAME).toBe("Nodwin CRM")
  })

  it("applies default for NEXT_PUBLIC_DEBUG", () => {
    const withoutDebug = { ...validEnv }
    delete (withoutDebug as Record<string, unknown>).NEXT_PUBLIC_DEBUG
    const result = envSchema.parse(withoutDebug)
    expect(result.NEXT_PUBLIC_DEBUG).toBe(false)
  })

  it("parses NEXT_PUBLIC_DEBUG=true string as true", () => {
    const withDebug = { ...validEnv, NEXT_PUBLIC_DEBUG: "true" }
    const result = envSchema.parse(withDebug)
    expect(result.NEXT_PUBLIC_DEBUG).toBe(true)
  })

  it("parses NEXT_PUBLIC_DEBUG=false string as false", () => {
    const withDebug = { ...validEnv, NEXT_PUBLIC_DEBUG: "false" }
    const result = envSchema.parse(withDebug)
    expect(result.NEXT_PUBLIC_DEBUG).toBe(false)
  })

  it("parses NEXT_PUBLIC_DEBUG=1 string as true", () => {
    const withDebug = { ...validEnv, NEXT_PUBLIC_DEBUG: "1" }
    const result = envSchema.parse(withDebug)
    expect(result.NEXT_PUBLIC_DEBUG).toBe(true)
  })

  it("parses NEXT_PUBLIC_DEBUG=0 string as false", () => {
    const withDebug = { ...validEnv, NEXT_PUBLIC_DEBUG: "0" }
    const result = envSchema.parse(withDebug)
    expect(result.NEXT_PUBLIC_DEBUG).toBe(false)
  })

  it("parses NEXT_PUBLIC_DEBUG boolean directly", () => {
    const withDebug = { ...validEnv, NEXT_PUBLIC_DEBUG: true }
    const result = envSchema.parse(withDebug)
    expect(result.NEXT_PUBLIC_DEBUG).toBe(true)
  })

  it("applies default for NEXT_PUBLIC_LOG_LEVEL", () => {
    const withoutLevel = { ...validEnv }
    delete (withoutLevel as Record<string, unknown>).NEXT_PUBLIC_LOG_LEVEL
    const result = envSchema.parse(withoutLevel)
    expect(result.NEXT_PUBLIC_LOG_LEVEL).toBe("info")
  })

  it("throws on invalid log level", () => {
    const bad = { ...validEnv, NEXT_PUBLIC_LOG_LEVEL: "verbose" }
    expect(() => envSchema.parse(bad)).toThrow(z.ZodError)
  })
})
