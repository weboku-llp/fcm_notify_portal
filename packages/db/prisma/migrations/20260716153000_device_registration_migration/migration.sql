-- AlterEnum CampaignMode
ALTER TYPE "CampaignMode" ADD VALUE 'ALL_REGISTERED';
ALTER TYPE "CampaignMode" ADD VALUE 'SELECTED_USERS';

-- CreateEnum
CREATE TYPE "TopicSubscriptionStatus" AS ENUM ('PENDING', 'SUBSCRIBED', 'FAILED', 'UNKNOWN');
CREATE TYPE "NotificationPermission" AS ENUM ('GRANTED', 'DENIED', 'PROVISIONAL', 'UNKNOWN');
CREATE TYPE "AuditAction" AS ENUM ('DEVICE_REGISTERED', 'DEVICE_INVALIDATED', 'CAMPAIGN_CREATED', 'CAMPAIGN_SENT', 'CAMPAIGN_FAILED', 'CREDENTIALS_TESTED', 'PROJECT_CREATED', 'PROJECT_UPDATED');

-- AlterTable Project
ALTER TABLE "Project" ADD COLUMN "fcmAppId" TEXT;
ALTER TABLE "Project" ADD COLUMN "registrationSecretHash" TEXT;

-- AlterTable DeviceToken (unique was created as an INDEX, not a CONSTRAINT)
DROP INDEX IF EXISTS "DeviceToken_projectId_token_key";

ALTER TABLE "DeviceToken" ADD COLUMN "projectKey" TEXT;
ALTER TABLE "DeviceToken" ADD COLUMN "firebaseProjectId" TEXT;
ALTER TABLE "DeviceToken" ADD COLUMN "firebaseAppId" TEXT;
ALTER TABLE "DeviceToken" ADD COLUMN "appBuildNumber" TEXT;
ALTER TABLE "DeviceToken" ADD COLUMN "notificationPermission" "NotificationPermission" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "DeviceToken" ADD COLUMN "timezone" TEXT;
ALTER TABLE "DeviceToken" ADD COLUMN "topicSubscriptionStatus" "TopicSubscriptionStatus" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "DeviceToken" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DeviceToken" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DeviceToken" ADD COLUMN "invalidatedAt" TIMESTAMP(3);
ALTER TABLE "DeviceToken" ADD COLUMN "invalidationReason" TEXT;

UPDATE "DeviceToken" AS dt
SET
  "projectKey" = p."slug",
  "firebaseProjectId" = p."fcmProjectId"
FROM "Project" AS p
WHERE dt."projectId" = p."id";

ALTER TABLE "DeviceToken" ALTER COLUMN "projectKey" SET NOT NULL;
ALTER TABLE "DeviceToken" ALTER COLUMN "firebaseProjectId" SET NOT NULL;

CREATE UNIQUE INDEX "DeviceToken_projectKey_token_key" ON "DeviceToken"("projectKey", "token");
CREATE INDEX "DeviceToken_projectId_isActive_idx" ON "DeviceToken"("projectId", "isActive");
CREATE INDEX "DeviceToken_firebaseProjectId_idx" ON "DeviceToken"("firebaseProjectId");
CREATE INDEX "DeviceToken_lastSeenAt_idx" ON "DeviceToken"("lastSeenAt");
CREATE INDEX "Project_fcmProjectId_idx" ON "Project"("fcmProjectId");

-- AlterTable Campaign
ALTER TABLE "Campaign" ADD COLUMN "targetUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Campaign" ADD COLUMN "targetValue" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "estimatedRecipients" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "attemptedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Campaign" ADD COLUMN "firebaseMessageId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "firebaseResponse" JSONB;
ALTER TABLE "Campaign" ADD COLUMN "createdBy" TEXT;

-- AlterTable CampaignDelivery
ALTER TABLE "CampaignDelivery" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "CampaignDelivery" ADD COLUMN "messageId" TEXT;

-- CreateTable AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "action" "AuditAction" NOT NULL,
    "actor" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
