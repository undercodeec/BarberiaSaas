ALTER TABLE "users"
  ADD COLUMN "profile_photo_data" TEXT,
  ADD COLUMN "profile_bio" VARCHAR(500);

CREATE TABLE "user_portfolio_items" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "photo_data" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "user_portfolio_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_portfolio_items_user_id_created_at_idx"
  ON "user_portfolio_items"("user_id", "created_at");

ALTER TABLE "user_portfolio_items"
  ADD CONSTRAINT "user_portfolio_items_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
