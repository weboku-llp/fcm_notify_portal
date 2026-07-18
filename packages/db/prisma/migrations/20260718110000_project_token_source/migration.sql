-- CreateEnum
CREATE TYPE "DeviceTokenSource" AS ENUM ('DIRECT_REGISTER', 'PROJECT_API');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'TOKEN_SYNCED';

-- AlterTable Project
ALTER TABLE "Project" ADD COLUMN "tokenSourceApiBaseUrl" TEXT;
ALTER TABLE "Project" ADD COLUMN "tokenSourceApiKeyEncrypted" TEXT;
ALTER TABLE "Project" ADD COLUMN "tokenSourceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "tokenSourceLastSyncAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "tokenSourceLastSyncOk" BOOLEAN;
ALTER TABLE "Project" ADD COLUMN "tokenSourceLastSyncError" TEXT;
ALTER TABLE "Project" ADD COLUMN "tokenSourceLastSyncCount" INTEGER;

-- AlterTable DeviceToken
ALTER TABLE "DeviceToken" ADD COLUMN "source" "DeviceTokenSource" NOT NULL DEFAULT 'DIRECT_REGISTER';

-- AlterTable Campaign
ALTER TABLE "Campaign" ADD COLUMN "refreshFromApiBeforeSend" BOOLEAN NOT NULL DEFAULT false;
