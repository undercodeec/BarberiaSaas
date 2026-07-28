ALTER TABLE "clients"
  ADD COLUMN "last_name" VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN "birth_date" CHAR(10),
  ADD COLUMN "address_line" VARCHAR(240),
  ADD COLUMN "document_number" VARCHAR(64);
