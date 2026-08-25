import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCredentialMismatchError, isStaleTokenError } from "../fcm/types.js";
import { isLikelyFcmToken } from "../fcm-token.js";

describe("FCM error classification", () => {
  it("detects stale / invalid registration tokens", () => {
    assert.equal(isStaleTokenError("messaging/registration-token-not-registered"), true);
    assert.equal(isStaleTokenError("messaging/invalid-registration-token"), true);
    assert.equal(isStaleTokenError("messaging/internal-error"), false);
  });

  it("treats invalid-argument as stale when the message is about the token", () => {
    assert.equal(
      isStaleTokenError(
        "messaging/invalid-argument",
        "The registration token is not a valid FCM registration token",
      ),
      true,
    );
    assert.equal(
      isStaleTokenError("messaging/invalid-argument", "Image URL must be a valid URL string"),
      false,
    );
  });

  it("detects mismatched credentials", () => {
    assert.equal(isCredentialMismatchError("messaging/mismatched-credential"), true);
    assert.equal(isCredentialMismatchError("messaging/registration-token-not-registered"), false);
  });
});

describe("isLikelyFcmToken", () => {
  it("rejects seed / probe tokens", () => {
    assert.equal(isLikelyFcmToken("tok-influventure-android-1"), false);
    assert.equal(isLikelyFcmToken("stale-influventure-1"), false);
    assert.equal(isLikelyFcmToken("short"), false);
  });

  it("accepts long colon-containing tokens", () => {
    const fake =
      "dGVzdA:APA91b" + "A".repeat(140);
    assert.equal(isLikelyFcmToken(fake), true);
  });
});
