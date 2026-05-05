import "server-only"
import { timingSafeEqual, createHmac } from "node:crypto"

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WebhookVerificationError"
  }
}

export type HmacAlgorithm = "sha256" | "sha1" | "sha512"

export function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: HmacAlgorithm = "sha256",
): void {
  if (!signature) {
    throw new WebhookVerificationError("Missing signature")
  }

  const expected = createHmac(algorithm, secret).update(payload, "utf8").digest("hex")
  const expectedBuf = Buffer.from(expected, "utf8")
  const signatureBuf = Buffer.from(signature, "utf8")

  if (
    expectedBuf.length !== signatureBuf.length
    || !timingSafeEqual(expectedBuf, signatureBuf)
  ) {
    throw new WebhookVerificationError(`HMAC-${algorithm.toUpperCase()} signature mismatch`)
  }
}
