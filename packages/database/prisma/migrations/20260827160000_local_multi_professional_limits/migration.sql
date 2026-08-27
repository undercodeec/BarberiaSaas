UPDATE "plans"
SET
  "limits" = jsonb_set("limits", '{teamMembers}', '12'::jsonb, true),
  "features" = '["Hasta 3 sucursales", "Hasta 12 profesionales en total para toda la organizacion", "Reservas y clientes ilimitados", "Caja, POS y comisiones", "Inventario, reportes completos, roles y permisos", "0% de comision por reservas directas"]'::jsonb,
  "updated_at" = NOW()
WHERE "code" = 'local';

UPDATE "plans"
SET
  "limits" = jsonb_set("limits", '{teamMembers}', '40'::jsonb, true),
  "features" = '["Hasta 6 sucursales", "Hasta 40 profesionales en total para toda la organizacion", "Reservas y clientes ilimitados", "Caja, POS, comisiones e inventario por sucursal", "Reportes completos, roles y permisos", "0% de comision por reservas directas"]'::jsonb,
  "updated_at" = NOW()
WHERE "code" = 'multi';
