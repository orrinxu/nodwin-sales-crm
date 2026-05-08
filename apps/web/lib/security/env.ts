import { envSchema, type Env } from "./env-schema"

export { envSchema, type Env } from "./env-schema"

let parsed: Env | null = null

function getEnv(): Env {
  if (!parsed) {
    parsed = envSchema.parse(process.env)
  }
  return parsed
}

export const env = new Proxy({} as Env, {
  get(_, prop: string | symbol) {
    if (typeof prop === "symbol") return undefined
    return getEnv()[prop as keyof Env]
  },
  has(_, prop: string | symbol) {
    if (typeof prop === "symbol") return false
    return prop in getEnv()
  },
  ownKeys() {
    return Reflect.ownKeys(getEnv())
  },
  getOwnPropertyDescriptor() {
    return {
      enumerable: true,
      configurable: true,
    }
  },
})
