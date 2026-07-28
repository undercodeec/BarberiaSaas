CREATE TABLE "client_labels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "name" VARCHAR(60) NOT NULL,
  "color" CHAR(7) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "client_labels_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_labels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "client_labels_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_labels_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "client_labels_organization_id_name_idx" ON "client_labels"("organization_id", "name");
CREATE INDEX "client_labels_created_by_user_id_name_idx" ON "client_labels"("created_by_user_id", "name");

CREATE TABLE "client_label_assignments" (
  "client_id" UUID NOT NULL,
  "label_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_label_assignments_pkey" PRIMARY KEY ("client_id", "label_id"),
  CONSTRAINT "client_label_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "client_label_assignments_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "client_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "client_label_assignments_label_id_idx" ON "client_label_assignments"("label_id");