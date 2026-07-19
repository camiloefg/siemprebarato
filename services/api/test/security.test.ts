import assert from "node:assert/strict";
import test from "node:test";
import { hashToken, randomToken, safeEqual } from "../src/security/tokens.js";
import { signOAuthState, verifyOAuthState } from "../src/security/oauth-state.js";

test("opaque tokens are random and purpose-bound", () => {
  const first = randomToken();
  const second = randomToken();
  assert.notEqual(first, second);
  assert.notEqual(hashToken(first, "pepper", "session"), hashToken(first, "pepper", "csrf"));
});

test("safeEqual handles equal and different values", () => {
  assert.equal(safeEqual("same", "same"), true);
  assert.equal(safeEqual("same", "different"), false);
});

test("OAuth state round-trips only with its nonce and signature", () => {
  const now = Date.now();
  const signed = signOAuthState({ nonce: "nonce-1", returnTo: "/users", issuedAt: now }, "secret");
  assert.deepEqual(verifyOAuthState(signed, "secret", "nonce-1", now), {
    nonce: "nonce-1",
    returnTo: "/users",
    issuedAt: now,
  });
  assert.throws(() => verifyOAuthState(signed, "secret", "nonce-2", now));
  assert.throws(() => verifyOAuthState(`${signed}x`, "secret", "nonce-1", now));
});

test("OAuth state rejects external return paths and expired values", () => {
  const now = Date.now();
  const external = signOAuthState({ nonce: "n", returnTo: "//evil.example", issuedAt: now }, "secret");
  assert.throws(() => verifyOAuthState(external, "secret", "n", now));
  const expired = signOAuthState({ nonce: "n", returnTo: "/", issuedAt: now - 11 * 60 * 1000 }, "secret");
  assert.throws(() => verifyOAuthState(expired, "secret", "n", now));
});
