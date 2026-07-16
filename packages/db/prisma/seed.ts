import { loadDbEnv } from "@notif/config";
import { ServiceAccountSchema } from "@notif/contracts";
import { encryptServiceAccount } from "@notif/crypto";
import { prisma, type Prisma } from "@notif/db";
import { createHash } from "node:crypto";

// Validate + load env (DATABASE_URL, PORTAL_ENCRYPTION_KEY).
loadDbEnv();

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * Build a structurally-valid (but fake) service account. These pass zod
 * validation without contacting Google. Replace with real JSON via the
 * dashboard when you want live sends (FCM_DRIVER=firebase).
 */
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

async function reset(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.campaignDelivery.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.template.deleteMany();
  await prisma.segment.deleteMany();
  await prisma.deviceToken.deleteMany();
  await prisma.project.deleteMany();
}

interface DemoProject {
  name: string;
  slug: string;
  fcmProjectId: string;
  fcmAppId: string;
  defaultBroadcastTopic: string;
  androidChannelId: string;
  registrationSecret: string;
}

const demoProjects: DemoProject[] = [
  {
    name: "CricRumble",
    slug: "cricrumble",
    fcmProjectId: "cricrumble-fcm",
    fcmAppId: "1:000000000000:android:cricrumbledemo",
    defaultBroadcastTopic: "cricrumble_all",
    androidChannelId: "cricrumble_alerts",
    registrationSecret: "cricrumble-dev-registration-secret",
  },
  {
    name: "Acme Sports",
    slug: "acme-sports",
    fcmProjectId: "acme-sports-fcm",
    fcmAppId: "1:111111111111:android:acmedemo",
    defaultBroadcastTopic: "all-users",
    androidChannelId: "sports_alerts",
    registrationSecret: "acme-dev-registration-secret",
  },
  {
    name: "Nimbus Weather",
    slug: "nimbus-weather",
    fcmProjectId: "nimbus-weather-fcm",
    fcmAppId: "1:222222222222:android:nimbusdemo",
    defaultBroadcastTopic: "weather-alerts",
    androidChannelId: "weather_alerts",
    registrationSecret: "nimbus-dev-registration-secret",
  },
];

async function main(): Promise<void> {
  console.log("Seeding demo data...");
  await reset();

  let count = 0;
  for (const p of demoProjects) {
    const enc = encryptServiceAccount(fakeServiceAccount(p.fcmProjectId));
    const project = await prisma.project.create({
      data: {
        name: p.name,
        slug: p.slug,
        fcmServiceAccountJson: enc.ciphertext,
        credentialFingerprint: enc.credentialFingerprint,
        fcmProjectId: enc.fcmProjectId,
        fcmAppId: p.fcmAppId,
        fcmClientEmail: enc.fcmClientEmail,
        defaultBroadcastTopic: p.defaultBroadcastTopic,
        androidChannelId: p.androidChannelId,
        registrationSecretHash: hashSecret(p.registrationSecret),
      },
    });
    count++;
    console.log(`  + project ${project.name} (${project.slug}) -> fcm ${project.fcmProjectId}`);
    console.log(`    topic=${project.defaultBroadcastTopic} regSecret(dev)=${p.registrationSecret}`);

    await prisma.deviceToken.createMany({
      data: [
        {
          projectId: project.id,
          projectKey: project.slug,
          firebaseProjectId: project.fcmProjectId,
          firebaseAppId: project.fcmAppId,
          token: `tok-${p.slug}-android-1`,
          platform: "ANDROID",
          locale: "en-US",
          topics: [p.defaultBroadcastTopic],
          topicSubscriptionStatus: "SUBSCRIBED",
          notificationPermission: "GRANTED",
          isActive: true,
        },
        {
          projectId: project.id,
          projectKey: project.slug,
          firebaseProjectId: project.fcmProjectId,
          firebaseAppId: project.fcmAppId,
          token: `tok-${p.slug}-ios-1`,
          platform: "IOS",
          locale: "en-GB",
          topics: [p.defaultBroadcastTopic],
          topicSubscriptionStatus: "SUBSCRIBED",
          notificationPermission: "GRANTED",
          isActive: true,
        },
        {
          projectId: project.id,
          projectKey: project.slug,
          firebaseProjectId: project.fcmProjectId,
          firebaseAppId: project.fcmAppId,
          token: `tok-${p.slug}-web-1`,
          platform: "WEB",
          locale: "de-DE",
          topics: [],
          topicSubscriptionStatus: "UNKNOWN",
          notificationPermission: "UNKNOWN",
          isActive: true,
        },
        {
          projectId: project.id,
          projectKey: project.slug,
          firebaseProjectId: project.fcmProjectId,
          firebaseAppId: project.fcmAppId,
          token: `stale-${p.slug}-1`,
          platform: "ANDROID",
          locale: "en-US",
          topics: [],
          topicSubscriptionStatus: "UNKNOWN",
          notificationPermission: "GRANTED",
          isActive: true,
        },
      ],
    });

    await prisma.segment.create({
      data: {
        projectId: project.id,
        name: "English Android users",
        rules: { platform: "ANDROID", locale: "en-US", lastSeenWithinDays: 30 } as Prisma.InputJsonValue,
      },
    });

    await prisma.template.create({
      data: {
        projectId: project.id,
        name: p.slug === "cricrumble" ? "Match Starting" : "Welcome",
        title:
          p.slug === "cricrumble" ? "{{teamA}} vs {{teamB}}" : "Welcome, {{firstName}}!",
        body:
          p.slug === "cricrumble"
            ? "Live action starts at {{matchTime}}. Open CricRumble now."
            : "Thanks for joining {{appName}}. Enjoy the ride.",
        imageUrl: p.slug === "cricrumble" ? "{{imageUrl}}" : null,
        deepLink: p.slug === "cricrumble" ? "/matches/{{matchId}}" : null,
        dataJson:
          p.slug === "cricrumble"
            ? ({ type: "MATCH_START", matchId: "{{matchId}}", deepLink: "/matches/{{matchId}}" } as Prisma.InputJsonValue)
            : ({ screen: "home" } as Prisma.InputJsonValue),
        variables:
          p.slug === "cricrumble"
            ? ["teamA", "teamB", "matchTime", "imageUrl", "matchId"]
            : ["firstName", "appName"],
      },
    });
  }

  await prisma.template.create({
    data: {
      projectId: null,
      name: "Generic Announcement",
      title: "{{headline}}",
      body: "{{message}}",
      variables: ["headline", "message"],
      dataJson: {} as Prisma.InputJsonValue,
    },
  });

  console.log("Seed complete. %d projects created.", count);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
