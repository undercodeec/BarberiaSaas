ALTER TABLE "plans"
ADD COLUMN "feature_flags" JSONB NOT NULL DEFAULT '{}';
