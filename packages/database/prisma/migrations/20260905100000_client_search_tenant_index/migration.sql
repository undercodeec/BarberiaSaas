CREATE EXTENSION IF NOT EXISTS btree_gin;

CREATE INDEX "clients_organization_full_name_trgm_idx"
  ON "clients" USING GIN (
    "organization_id" uuid_ops,
    LOWER("full_name") gin_trgm_ops
  )
  WHERE "deleted_at" IS NULL;
