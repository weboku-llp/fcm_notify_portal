-- Optional per-project icon (URL, public path, or data URL)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
