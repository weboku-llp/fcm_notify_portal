import { loadDbEnv } from "@notif/config";
import { ServiceAccountSchema } from "@notif/contracts";
import { encryptServiceAccount } from "@notif/crypto";
import { prisma, type Prisma } from "@notif/db";

// Validate + load env (DATABASE_URL, PORTAL_ENCRYPTION_KEY).
loadDbEnv();

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
  defaultBroadcastTopic: string;
  androidChannelId: string;
}

const demoProjects: DemoProject[] = [
  {
    name: "Acme Sports",
    slug: "acme-sports",
    fcmProjectId: "acme-sports-fcm",
    defaultBroadcastTopic: "all-users",
    androidChannelId: "sports_alerts",
  },
  {
    name: "Nimbus Weather",
    slug: "nimbus-weather",
    fcmProjectId: "nimbus-weather-fcm",
    defaultBroadcastTopic: "weather-alerts",
    androidChannelId: "weather_alerts",
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
        fcmClientEmail: enc.fcmClientEmail,
        defaultBroadcastTopic: p.defaultBroadcastTopic,
        androidChannelId: p.androidChannelId,
      },
    });
    count++;
    console.log(`  + project ${project.name} (${project.slug}) -> fcm ${project.fcmProjectId}`);

    // Device tokens, including one "stale-" token to demo pruning on send.
    await prisma.deviceToken.createMany({
      data: [
        { projectId: project.id, token: `tok-${p.slug}-android-1`, platform: "ANDROID", locale: "en-US", topics: ["all-users"] },
        { projectId: project.id, token: `tok-${p.slug}-ios-1`, platform: "IOS", locale: "en-GB", topics: ["all-users"] },
        { projectId: project.id, token: `tok-${p.slug}-web-1`, platform: "WEB", locale: "de-DE", topics: [] },
        { projectId: project.id, token: `stale-${p.slug}-1`, platform: "ANDROID", locale: "en-US", topics: [] },
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
        name: "Welcome",
        title: "Welcome, {{firstName}}!",
        body: "Thanks for joining {{appName}}. Enjoy the ride.",
        dataJson: { screen: "home" } as Prisma.InputJsonValue,
        variables: ["firstName", "appName"],
      },
    });
  }

  // A global template shared by all projects.
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
