import { envSchema, type Env } from "./env-schema"

export { envSchema, type Env } from "./env-schema"

export function parseEnv(input: Record<string, unknown> = process.env): Env {
  return envSchema.parse(input)
}

export const env = parseEnv()
