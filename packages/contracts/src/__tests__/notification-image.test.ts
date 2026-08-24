import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeNotificationImageUrl } from "../notification-image.js";

describe("normalizeNotificationImageUrl", () => {
  it("allows empty / null (no image)", () => {
    assert.deepEqual(normalizeNotificationImageUrl(null), { ok: true, imageUrl: null });
    assert.deepEqual(normalizeNotificationImageUrl(""), { ok: true, imageUrl: null });
    assert.deepEqual(normalizeNotificationImageUrl("   "), { ok: true, imageUrl: null });
  });

  it("accepts https URLs", () => {
    const url = "https://cdn.example.com/photo.jpg";
    assert.deepEqual(normalizeNotificationImageUrl(url), { ok: true, imageUrl: url });
  });

  it("rejects http", () => {
    const result = normalizeNotificationImageUrl("http://cdn.example.com/photo.jpg");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /https/i);
  });

  it("rejects relative paths and junk", () => {
    assert.equal(normalizeNotificationImageUrl("/updates/photo.jpg").ok, false);
    assert.equal(normalizeNotificationImageUrl("not a url").ok, false);
    assert.equal(normalizeNotificationImageUrl("{{imageUrl}}").ok, false);
  });
});
