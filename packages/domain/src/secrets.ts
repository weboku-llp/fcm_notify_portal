import { decryptServiceAccount } from "@notif/crypto";
import type { Project } from "@notif/db";
import type { FcmProjectContext } from "./fcm/index.js";

/** Build the per-project context the FCM sender needs from a DB row. */
export function projectContext(project: Project): FcmProjectContext {
  return {
    projectId: project.id,
    serviceAccount: decryptServiceAccount(project.fcmServiceAccountJson),
    androidChannelId: project.androidChannelId,
  };
}
