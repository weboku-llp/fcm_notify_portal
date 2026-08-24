-- CricRumble per-fixture live score alert toggles
CREATE TABLE IF NOT EXISTS "CricLiveMatchAlert" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "teamHome" TEXT,
    "teamAway" TEXT,
    "kind" TEXT,
    "status" TEXT,
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoOnScoreUpdate" BOOLEAN NOT NULL DEFAULT false,
    "lastNotifiedScore" TEXT,
    "lastNotifiedAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "lastPollError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CricLiveMatchAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CricLiveMatchAlert_projectId_fixtureId_key"
  ON "CricLiveMatchAlert"("projectId", "fixtureId");

CREATE INDEX IF NOT EXISTS "CricLiveMatchAlert_projectId_alertsEnabled_autoOnScoreUpdate_idx"
  ON "CricLiveMatchAlert"("projectId", "alertsEnabled", "autoOnScoreUpdate");

DO $$ BEGIN
  ALTER TABLE "CricLiveMatchAlert"
    ADD CONSTRAINT "CricLiveMatchAlert_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
