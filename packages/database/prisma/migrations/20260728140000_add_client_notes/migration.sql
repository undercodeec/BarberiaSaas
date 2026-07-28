CREATE TABLE "client_notes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "client_id" UUID NOT NULL,
  "organization_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "photo_data" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "client_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "client_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "client_notes_client_id_created_at_idx" ON "client_notes"("client_id", "created_at");
CREATE INDEX "client_notes_organization_id_created_at_idx" ON "client_notes"("organization_id", "created_at");
CREATE INDEX "client_notes_created_by_user_id_created_at_idx" ON "client_notes"("created_by_user_id", "created_at");