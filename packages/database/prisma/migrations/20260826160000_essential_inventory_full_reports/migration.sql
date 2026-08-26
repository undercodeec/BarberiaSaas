UPDATE "plans"
SET
  "feature_flags" = "feature_flags" || CASE
    WHEN "code" = 'free' THEN '{"fullReports":false}'::jsonb
    WHEN "code" IN ('essential', 'local', 'multi') THEN '{"fullReports":true}'::jsonb
    ELSE '{}'::jsonb
  END,
  "updated_at" = NOW()
WHERE "code" IN ('free', 'essential', 'local', 'multi');

UPDATE "plans"
SET
  "feature_flags" = "feature_flags" || '{"inventory":true,"fullReports":true}'::jsonb,
  "features" = '["1 profesional activo y 1 sucursal","Reservas y clientes ilimitados","Agenda y reservas publicas","Servicios e historial de clientes","Caja operativa, inventario y reportes completos"]'::jsonb,
  "updated_at" = NOW()
WHERE "code" = 'essential';
