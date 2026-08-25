/**
 * Deactivate active DeviceToken rows that are not real FCM registration tokens
 * (seed/probe strings like tok-influventure-*). Affects all projects.
 *
 *   pnpm --filter @notif/db exec dotenv -e ../../apps/api/.env -- tsx ../../packages/domain/src/scripts/prune-non-fcm-tokens.ts
 *
 * Or from repo with DATABASE_URL + PORTAL_ENCRYPTION_KEY loaded.
 */
import { loadDbEnv } from "@notif/config";
import { deactivateNonFcmTokens } from "../tokens.js";
import { prisma } from "@notif/db";

loadDbEnv();

async function main(): Promise<void> {
  const n = await deactivateNonFcmTokens();
  console.log(`Deactivated ${n} non-FCM token(s) across all projects.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
