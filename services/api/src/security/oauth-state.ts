import crypto from "node:crypto";
import { safeEqual } from "./tokens.js";

export type OAuthStatePayload = {
  nonce: string;
  returnTo: string;
  issuedAt: number;
};

export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyOAuthState(
  signedState: string,
  secret: string,
  expectedNonce: string,
  now = Date.now(),
): OAuthStatePayload {
  const [encodedPayload, signature, extra] = String(signedState || "").split(".");
  if (!encodedPayload || !signature || extra) {
    throw new Error("Invalid OAuth state.");
  }
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  if (!safeEqual(signature, expectedSignature)) {
    throw new Error("Invalid OAuth state signature.");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as OAuthStatePayload;
  if (!payload.nonce || !safeEqual(payload.nonce, expectedNonce)) {
    throw new Error("OAuth state cookie mismatch.");
  }
  if (!Number.isFinite(payload.issuedAt) || now - payload.issuedAt > 10 * 60 * 1000 || payload.issuedAt > now + 30_000) {
    throw new Error("OAuth state expired.");
  }
  if (!payload.returnTo.startsWith("/") || payload.returnTo.startsWith("//")) {
    throw new Error("Invalid OAuth return path.");
  }
  return payload;
}
