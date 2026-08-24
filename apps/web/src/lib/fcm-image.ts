import { notificationImageUrlWarning } from "@notif/contracts";

/** UI helper — same rules as server-side FCM image checks. */
export function fcmImageWarning(url: string | null | undefined): string | null {
  return notificationImageUrlWarning(url);
}
