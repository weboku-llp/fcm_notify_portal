/**
 * One-off: add Influventure project without wiping existing projects.
 * Usage from repo root:
 *   pnpm --filter @notif/db exec dotenv -e ../../.env -- tsx prisma/add-influventure.ts
 */
import { loadDbEnv } from "@notif/config";
import { ServiceAccountSchema } from "@notif/contracts";
import { encryptSecret, encryptServiceAccount, resolveEncryptionKey } from "@notif/crypto";
import { prisma, type Prisma } from "@notif/db";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INFLUVENTURE_TEMPLATES } from "./influventure-templates";

loadDbEnv();

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function encryptTokenSourceApiKey(plaintext: string): string {
  const secret = process.env.PORTAL_ENCRYPTION_KEY;
  if (!secret) throw new Error("PORTAL_ENCRYPTION_KEY is not set");
  return encryptSecret(plaintext, resolveEncryptionKey(secret));
}

function fakeServiceAccount(projectId: string) {
  return ServiceAccountSchema.parse({
    type: "service_account",
    project_id: projectId,
    private_key_id: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nMIIBVAIBADANBgkqExampleFakeKeyForLocalSeedingOnlyNotARealKey==\n-----END PRIVATE KEY-----\n",
    client_email: `firebase-adminsdk@${projectId}.iam.gserviceaccount.com`,
    client_id: "123456789012345678901",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk%40${projectId}.iam.gserviceaccount.com`,
    universe_domain: "googleapis.com",
  });
}

function readInfluventureExportKey(): string | null {
  const envPath = resolve("A:/influventure/apps/api/.env");
  if (!existsSync(envPath)) return null;
  const text = readFileSync(envPath, "utf8");
  const m = text.match(/^NOTIF_PORTAL_TOKEN_EXPORT_KEY=(.+)$/m);
  return m?.[1]?.trim().replace(/^["']|["']$/g, "") || null;
}

async function main(): Promise<void> {
  const slug = "influventure";
  const existing = await prisma.project.findUnique({ where: { slug } });
  if (existing) {
    console.log(`Already exists: ${existing.name} (${existing.id})`);
    return;
  }

  const enc = encryptServiceAccount(fakeServiceAccount("influventure-fcm"));
  const exportKey = readInfluventureExportKey();
  const registrationSecret = "influventure-dev-registration-secret";

  const project = await prisma.project.create({
    data: {
      name: "Influventure",
      slug,
      fcmServiceAccountJson: enc.ciphertext,
      credentialFingerprint: enc.credentialFingerprint,
      fcmProjectId: enc.fcmProjectId,
      fcmAppId: "1:333333333333:android:influventuredemo",
      fcmClientEmail: enc.fcmClientEmail,
      defaultBroadcastTopic: "influventure_all",
      androidChannelId: "influventure_alerts",
      registrationSecretHash: hashSecret(registrationSecret),
      tokenSourceApiBaseUrl: "http://localhost:5000",
      tokenSourceApiKeyEncrypted: exportKey ? encryptTokenSourceApiKey(exportKey) : null,
      tokenSourceEnabled: false,
    },
  });

  await prisma.deviceToken.createMany({
    data: [
      {
        projectId: project.id,
        projectKey: project.slug,
        firebaseProjectId: project.fcmProjectId,
        firebaseAppId: project.fcmAppId,
        token: "tok-influventure-android-1",
        platform: "ANDROID",
        locale: "en-US",
        topics: [project.defaultBroadcastTopic],
        topicSubscriptionStatus: "SUBSCRIBED",
        notificationPermission: "GRANTED",
        isActive: true,
      },
      {
        projectId: project.id,
        projectKey: project.slug,
        firebaseProjectId: project.fcmProjectId,
        firebaseAppId: project.fcmAppId,
        token: "tok-influventure-ios-1",
        platform: "IOS",
        locale: "en-GB",
        topics: [project.defaultBroadcastTopic],
        topicSubscriptionStatus: "SUBSCRIBED",
        notificationPermission: "GRANTED",
        isActive: true,
      },
    ],
  });

  for (const tpl of INFLUVENTURE_TEMPLATES) {
    await prisma.template.create({
      data: {
        projectId: project.id,
        name: tpl.name,
        title: tpl.title,
        body: tpl.body,
        imageUrl: tpl.imageUrl ?? null,
        deepLink: tpl.deepLink ?? null,
        dataJson: tpl.dataJson as Prisma.InputJsonValue,
        variables: tpl.variables,
      },
    });
  }

  console.log(`Created ${project.name} (${project.slug}) id=${project.id}`);
  console.log(`  templates=${INFLUVENTURE_TEMPLATES.length}`);
  console.log(`  topic=${project.defaultBroadcastTopic}`);
  console.log(`  tokenSource=${project.tokenSourceApiBaseUrl} key=${exportKey ? "set" : "missing"}`);
  console.log(`  NOTE: placeholder Firebase SA — replace via Manage → Credentials before live sends.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
