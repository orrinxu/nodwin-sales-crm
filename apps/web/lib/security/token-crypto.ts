import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import { env } from "./env"

/**
 * ORR-817: at-rest encryption for per-user Google OAuth tokens.
 *
 * App-layer AES-256-GCM. The 32-byte key comes from the GOOGLE_TOKEN_ENC_KEY
 * server env (base64-encoded). Ciphertext (never plaintext) is what lands in
 * public.google_oauth_connections.{access_token_enc,refresh_token_enc}.
 *
 * On-the-wire payload = base64( iv(12) || authTag(16) || ciphertext ). The GCM
 * auth tag is verified on decrypt, so any tampering with the stored blob throws.
 */

const ALGORITHM = "aes-256-gcm"
const KEY_BYTES = 32 // AES-256
const IV_BYTES = 12 // 96-bit nonce, the GCM standard
const AUTH_TAG_BYTES = 16

/**
 * Thrown when GOOGLE_TOKEN_ENC_KEY is missing or not a valid 32-byte base64 key,
 * or when a stored payload fails to decrypt (malformed or tampered). Callers can
 * distinguish this from generic errors to surface a "Google is not configured"
 * or "stored token is corrupt" state.
 */
export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TokenCryptoError"
  }
}

/**
 * Resolve and validate the AES-256 key from the environment. Throws a
 * TokenCryptoError (never a generic error) when the key is absent or the wrong
 * size, so the app can boot without GOOGLE_TOKEN_ENC_KEY and only fail when
 * encryption is actually exercised.
 */
function getKey(): Buffer {
  const raw = env.GOOGLE_TOKEN_ENC_KEY
  if (!raw) {
    throw new TokenCryptoError(
      "GOOGLE_TOKEN_ENC_KEY is not set — cannot encrypt/decrypt Google tokens. " +
        "Generate one with: openssl rand -base64 32",
    )
  }

  let key: Buffer
  try {
    key = Buffer.from(raw, "base64")
  } catch {
    throw new TokenCryptoError("GOOGLE_TOKEN_ENC_KEY is not valid base64.")
  }

  if (key.length !== KEY_BYTES) {
    throw new TokenCryptoError(
      `GOOGLE_TOKEN_ENC_KEY must decode to exactly ${KEY_BYTES} bytes, got ${key.length}. ` +
        "Generate one with: openssl rand -base64 32",
    )
  }

  return key
}

/**
 * Encrypt a plaintext token. Returns base64( iv || authTag || ciphertext ). A
 * fresh random IV is used per call, so encrypting the same input twice yields
 * different output.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64")
}

/**
 * Decrypt a payload produced by encryptToken. Verifies the GCM auth tag; a
 * malformed or tampered payload throws a TokenCryptoError.
 */
export function decryptToken(payload: string): string {
  const key = getKey()

  let blob: Buffer
  try {
    blob = Buffer.from(payload, "base64")
  } catch {
    throw new TokenCryptoError("Encrypted token payload is not valid base64.")
  }

  if (blob.length < IV_BYTES + AUTH_TAG_BYTES) {
    throw new TokenCryptoError("Encrypted token payload is too short / malformed.")
  }

  const iv = blob.subarray(0, IV_BYTES)
  const authTag = blob.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES)
  const ciphertext = blob.subarray(IV_BYTES + AUTH_TAG_BYTES)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    // GCM auth-tag mismatch (tampered ciphertext / iv / tag, or wrong key).
    throw new TokenCryptoError("Failed to decrypt token — payload tampered or wrong key.")
  }
}
