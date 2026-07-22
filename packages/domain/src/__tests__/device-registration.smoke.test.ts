import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { loadDbEnv } from "@notif/config";
import { DeviceRegistrationInput } from "@notif/contracts";
import { prisma } from "@notif/db";
import { invalidateTokens, registerDevice, verifyProjectRegistrationSecret } from "../tokens.js";

loadDbEnv();

describe("device registration smoke", () => {
  after(async () => {
    await prisma.deviceToken.deleteMany({
      where: { projectKey: "cricrumble", token: { startsWith: "tok-smoke-" } },
    });
    await prisma.$disconnect();
  });

  it("upserts, refreshes, and invalidates tokens for cricrumble", async () => {
    await verifyProjectRegistrationSecret(
      "cricrumble",
      "cricrumble-dev-registration-secret",
      process.env.DEVICE_REGISTRATION_SECRET,
    );

    // Read the project's *current* Firebase ids rather than hardcoding the
    // seed placeholder — the cricrumble project gets migrated to its real
    // Firebase credentials (fcmProjectId/fcmAppId) outside of this test, and
    // registerDevice() rejects any mismatch (FIREBASE_PROJECT_MISMATCH).
    const cricrumble = await prisma.project.findUniqueOrThrow({ where: { slug: "cricrumble" } });

    const input = DeviceRegistrationInput.parse({
      projectKey: "cricrumble",
      firebaseProjectId: cricrumble.fcmProjectId,
      firebaseAppId: cricrumble.fcmAppId ?? "1:000000000000:android:cricrumbledemo",
      token: "tok-smoke-android-1",
      platform: "android",
      notificationPermission: "granted",
      appVersion: "2.0.0",
      appBuildNumber: "200",
      deviceLocale: "en-IN",
      timezone: "Asia/Kolkata",
      userId: "user-smoke-1",
    });

    const first = await registerDevice(input);
    const second = await registerDevice(input);
    assert.equal(first.registration.id, second.registration.id);
    assert.equal(first.subscribedTopic, "cricrumble_all");
    assert.equal(first.defaultBroadcastTopic, "cricrumble_all");

    await registerDevice({
      ...input,
      token: "tok-smoke-android-2",
      previousToken: "tok-smoke-android-1",
    });

    const old = await prisma.deviceToken.findUnique({
      where: { projectKey_token: { projectKey: "cricrumble", token: "tok-smoke-android-1" } },
    });
    assert.ok(old);
    assert.equal(old.isActive, false);
    assert.equal(old.invalidationReason, "replaced_by_refresh");

    const project = await prisma.project.findUniqueOrThrow({ where: { slug: "cricrumble" } });
    await invalidateTokens(project.id, ["tok-smoke-android-2"], "registration-token-not-registered");
    const invalidated = await prisma.deviceToken.findUnique({
      where: { projectKey_token: { projectKey: "cricrumble", token: "tok-smoke-android-2" } },
    });
    assert.ok(invalidated);
    assert.equal(invalidated.isActive, false);
  });

  it("rejects firebase project mismatch", async () => {
    await assert.rejects(
      () =>
        registerDevice(
          DeviceRegistrationInput.parse({
            projectKey: "cricrumble",
            firebaseProjectId: "wrong-project",
            firebaseAppId: "1:000000000000:android:cricrumbledemo",
            token: "tok-smoke-mismatch",
            platform: "android",
            notificationPermission: "granted",
          }),
        ),
      (err: { code?: string }) => err.code === "FIREBASE_PROJECT_MISMATCH",
    );
  });
});
