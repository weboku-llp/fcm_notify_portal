import { FirebaseFcmSender } from "./firebase.js";
import { MockFcmSender } from "./mock.js";
import type { FcmSender } from "./types.js";

export * from "./types.js";
export { FirebaseFcmSender } from "./firebase.js";
export { MockFcmSender, MOCK_STALE_PREFIX, MOCK_FAIL_PREFIX } from "./mock.js";

let cached: FcmSender | undefined;

/**
 * Resolve the configured sender. Defaults to the mock driver so local dev and
 * tests never require real credentials. Set FCM_DRIVER=firebase for live sends.
 */
export function getFcmSender(driver?: string): FcmSender {
  const resolved = driver ?? process.env.FCM_DRIVER ?? "mock";
  if (cached && cached.driver === resolved) return cached;
  cached = resolved === "firebase" ? new FirebaseFcmSender() : new MockFcmSender();
  return cached;
}
