import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCredentialMismatchError, isStaleTokenError } from "../fcm/types.js";

describe("FCM error classification", () => {
  it("detects stale / invalid registration tokens", () => {
    assert.equal(isStaleTokenError("messaging/registration-token-not-registered"), true);
    assert.equal(isStaleTokenError("messaging/invalid-registration-token"), true);
    assert.equal(isStaleTokenError("messaging/internal-error"), false);
  });

  it("detects mismatched credentials", () => {
    assert.equal(isCredentialMismatchError("messaging/mismatched-credential"), true);
    assert.equal(isCredentialMismatchError("messaging/registration-token-not-registered"), false);
  });
});
