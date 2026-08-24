import { z } from "zod";

const BAD_IMAGE_HOST_SNIPPETS = [
  "gstatic.com",
  "ggpht.com",
  "googleusercontent.com",
  "google.com",
  "www.google.com",
] as const;

function hostnameLooksLikeGoogleThumbnail(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return BAD_IMAGE_HOST_SNIPPETS.some((snip) => host === snip || host.endsWith(`.${snip}`));
}

/**
 * Soft guidance for the UI. Does not block send — use normalizeNotificationImageUrl for that.
 */
export function notificationImageUrlWarning(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "This does not look like a valid URL.";
  }

  if (parsed.protocol !== "https:") {
    return "Use an https:// URL. HTTP links will not show on devices.";
  }

  if (hostnameLooksLikeGoogleThumbnail(parsed.hostname)) {
    return "Google image / thumbnail links usually fail on devices (hotlink protection). Use a direct CDN URL ending in .jpg, .png, or .webp.";
  }

  const path = parsed.pathname.toLowerCase();
  const hasExt = /\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(path);
  if (!hasExt) {
    return "iOS works best with a real image extension (.jpg, .png, .webp). Extension-less links often arrive without an image.";
  }

  return null;
}

/**
 * FCM rejects non-URL / non-HTTPS image values with:
 * `messaging/invalid-payload` — `android.notification.imageUrl must be a valid URL string`
 *
 * Empty / whitespace → no image (null). Otherwise must be an absolute https URL.
 * Google thumbnail hosts are rejected because devices typically cannot download them
 * (notification arrives with title/body only).
 */
export function normalizeNotificationImageUrl(
  value: string | null | undefined,
): { ok: true; imageUrl: string | null } | { ok: false; message: string } {
  if (value == null) return { ok: true, imageUrl: null };
  const trimmed = String(value).trim();
  if (!trimmed) return { ok: true, imageUrl: null };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      message:
        "Image URL must be a valid absolute URL (e.g. https://cdn.example.com/photo.jpg). Leave blank for no image.",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      message: "Image URL must use https:// — Firebase rejects http and other schemes.",
    };
  }

  if (!parsed.hostname) {
    return {
      ok: false,
      message: "Image URL is missing a hostname.",
    };
  }

  if (hostnameLooksLikeGoogleThumbnail(parsed.hostname)) {
    return {
      ok: false,
      message:
        "Google thumbnail / gstatic image links do not work in push notifications. Use a direct public CDN URL ending in .jpg, .png, or .webp (for example from your own storage or Unsplash).",
    };
  }

  return { ok: true, imageUrl: trimmed };
}

export function isValidNotificationImageUrl(value: string | null | undefined): boolean {
  return normalizeNotificationImageUrl(value).ok;
}

/** Zod field: omit / null / "" → undefined; otherwise require https URL. */
export const OptionalHttpsImageUrl = z
  .union([z.string().max(2000), z.null(), z.undefined()])
  .transform((v, ctx) => {
    const result = normalizeNotificationImageUrl(v);
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
      return z.NEVER;
    }
    return result.imageUrl ?? undefined;
  });
