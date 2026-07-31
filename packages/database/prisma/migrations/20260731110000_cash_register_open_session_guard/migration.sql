CREATE UNIQUE INDEX "cash_register_sessions_one_open_organization"
ON "cash_register_sessions" ("organization_id")
WHERE "status" = 'OPEN' AND "organization_id" IS NOT NULL;

CREATE UNIQUE INDEX "cash_register_sessions_one_open_owner"
ON "cash_register_sessions" ("owner_user_id")
WHERE "status" = 'OPEN' AND "organization_id" IS NULL;
