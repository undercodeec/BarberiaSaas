CREATE TYPE "OnboardingCollaboratorRole" AS ENUM (
  'BARBER',
  'ADMINISTRATOR',
  'CUSTOM'
);

CREATE TABLE "onboarding_collaborators" (
  "id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "photo_uri" VARCHAR(2048),
  "role" "OnboardingCollaboratorRole" NOT NULL,
  "custom_role_name" VARCHAR(80),
  "custom_role_description" VARCHAR(500),
  "can_perform_services" BOOLEAN NOT NULL DEFAULT false,
  "identification" VARCHAR(64),
  "phone" VARCHAR(24),
  "agenda_color" CHAR(7) NOT NULL DEFAULT '#2464E8',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "onboarding_collaborators_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "onboarding_collaborators"
ADD CONSTRAINT "onboarding_collaborators_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "onboarding_collaborators_owner_user_id_created_at_idx"
ON "onboarding_collaborators"("owner_user_id", "created_at");
