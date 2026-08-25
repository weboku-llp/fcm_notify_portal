/**
 * Heuristic for real FCM registration tokens vs seed / probe / garbage strings.
 * Android/iOS tokens are long and typically look like `…:APA91b…`.
 * Web push tokens are also long base64-ish strings that include `:`.
 */
export function isLikelyFcmToken(token: string): boolean {
  const t = token.trim();
  if (t.length < 80) return false;
  if (!t.includes(":")) return false;
  // Obvious local seed / probe prefixes used in this repo and Influventure API.
  if (/^(tok-|stale-|smoke_|rn-client-contract)/i.test(t)) return false;
  return true;
}
