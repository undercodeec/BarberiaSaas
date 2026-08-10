ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'FREE';

ALTER TABLE "subscriptions"
  ADD COLUMN "free_booking_grace_used" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "plans" (
  "id", "code", "name", "monthly_price_cents", "currency_code", "limits",
  "features", "feature_flags", "is_active", "is_public", "sort_order",
  "created_at", "updated_at"
)
VALUES
  (
    gen_random_uuid(), 'free', 'Nava Free', 0, 'USD',
    '{"locations":1,"teamMembers":1,"rolling30DayBookings":40,"clients":100}'::jsonb,
    '["1 profesional", "1 sucursal", "40 reservas en 30 dias", "100 clientes", "Agenda y reservas publicas", "Caja y reportes basicos"]'::jsonb,
    '{"commissions":false,"inventory":false,"multiLocation":false,"publicBooking":true,"reports":true,"team":false,"wallet":true}'::jsonb,
    true, true, 10, NOW(), NOW()
  ),
  (
    gen_random_uuid(), 'essential', 'Nava Esencial', 983, 'USD',
    '{"locations":1,"teamMembers":1,"rolling30DayBookings":null,"clients":null}'::jsonb,
    '["1 profesional activo y 1 sucursal", "Reservas y clientes ilimitados", "Agenda y reservas publicas", "Servicios e historial de clientes", "Caja operativa y reportes esenciales"]'::jsonb,
    '{"commissions":false,"inventory":false,"multiLocation":false,"publicBooking":true,"reports":true,"team":false,"wallet":true}'::jsonb,
    true, true, 20, NOW(), NOW()
  ),
  (
    gen_random_uuid(), 'local', 'Nava Local', 2999, 'USD',
    '{"locations":1,"teamMembers":null,"rolling30DayBookings":null,"clients":null}'::jsonb,
    '["1 sucursal", "Profesionales ilimitados sin cobro por usuario", "Reservas y clientes ilimitados", "Caja, POS y comisiones", "Inventario, reportes completos, roles y permisos", "0% de comision por reservas directas"]'::jsonb,
    '{"commissions":true,"inventory":true,"multiLocation":false,"publicBooking":true,"reports":true,"team":true,"wallet":true}'::jsonb,
    true, true, 30, NOW(), NOW()
  )
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "monthly_price_cents" = EXCLUDED."monthly_price_cents",
  "limits" = EXCLUDED."limits",
  "features" = EXCLUDED."features",
  "feature_flags" = EXCLUDED."feature_flags",
  "is_active" = true,
  "is_public" = true,
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = NOW();

UPDATE "plans" SET "is_public" = false, "is_active" = false, "updated_at" = NOW()
WHERE "code" IN ('solo', 'multi');

UPDATE "subscriptions" AS subscription
SET "plan_id" = essential_plan."id", "updated_at" = NOW()
FROM "plans" AS old_plan, "plans" AS essential_plan
WHERE subscription."plan_id" = old_plan."id"
  AND old_plan."code" = 'solo'
  AND essential_plan."code" = 'essential';

UPDATE "subscriptions" AS subscription
SET "plan_id" = local_plan."id", "updated_at" = NOW()
FROM "plans" AS old_plan, "plans" AS local_plan
WHERE subscription."plan_id" = old_plan."id"
  AND old_plan."code" = 'multi'
  AND local_plan."code" = 'local';

UPDATE "subscriptions"
SET
  "trial_ends_at" = "current_period_start" + INTERVAL '14 days',
  "current_period_end" = "current_period_start" + INTERVAL '14 days',
  "grace_ends_at" = NULL,
  "updated_at" = NOW()
WHERE "status" = 'TRIAL'
  AND "trial_ends_at" = "current_period_start" + INTERVAL '7 days';
