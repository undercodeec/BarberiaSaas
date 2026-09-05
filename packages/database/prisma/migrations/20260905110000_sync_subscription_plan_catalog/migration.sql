-- Sincroniza el catálogo persistido con las definiciones vigentes de
-- subscription-policy.ts. Las solicitudes no actualizan estas filas compartidas.
UPDATE "plans"
SET
  "name" = CASE "code"
    WHEN 'free' THEN 'Nava Free'
    WHEN 'essential' THEN 'Nava Esencial'
    WHEN 'local' THEN 'Nava Local'
    WHEN 'multi' THEN 'Nava Multi'
  END,
  "monthly_price_cents" = CASE "code"
    WHEN 'free' THEN 0
    WHEN 'essential' THEN 983
    WHEN 'local' THEN 2983
    WHEN 'multi' THEN 4883
  END,
  "currency_code" = 'USD',
  "limits" = CASE "code"
    WHEN 'free' THEN '{"clients":100,"locations":1,"rolling30DayBookings":25,"teamMembers":1}'::jsonb
    WHEN 'essential' THEN '{"clients":null,"locations":1,"rolling30DayBookings":null,"teamMembers":1}'::jsonb
    WHEN 'local' THEN '{"clients":null,"locations":3,"rolling30DayBookings":null,"teamMembers":12}'::jsonb
    WHEN 'multi' THEN '{"clients":null,"locations":6,"rolling30DayBookings":null,"teamMembers":40}'::jsonb
  END,
  "features" = CASE "code"
    WHEN 'free' THEN '["1 profesional","1 sucursal","25 reservas en los ultimos 30 dias","100 clientes activos","Agenda y reservas publicas","Caja y reportes basicos"]'::jsonb
    WHEN 'essential' THEN '["1 profesional activo y 1 sucursal","Reservas y clientes ilimitados","Agenda y reservas publicas","Servicios e historial de clientes","Caja operativa, inventario y reportes completos"]'::jsonb
    WHEN 'local' THEN '["Hasta 3 sucursales","Hasta 12 profesionales en total para toda la organizacion","Reservas y clientes ilimitados","Caja, POS y comisiones","Inventario, reportes completos, roles y permisos","0% de comision por reservas directas"]'::jsonb
    WHEN 'multi' THEN '["Hasta 6 sucursales","Hasta 40 profesionales en total para toda la organizacion","Reservas y clientes ilimitados","Caja, POS, comisiones e inventario por sucursal","Reportes completos, roles y permisos","0% de comision por reservas directas"]'::jsonb
  END,
  "feature_flags" = CASE "code"
    WHEN 'free' THEN '{"commissions":false,"fullReports":false,"inventory":false,"multiLocation":false,"publicBooking":true,"reports":true,"team":false,"wallet":true}'::jsonb
    WHEN 'essential' THEN '{"commissions":false,"fullReports":true,"inventory":true,"multiLocation":false,"publicBooking":true,"reports":true,"team":false,"wallet":true}'::jsonb
    WHEN 'local' THEN '{"commissions":true,"fullReports":true,"inventory":true,"multiLocation":true,"publicBooking":true,"reports":true,"team":true,"wallet":true}'::jsonb
    WHEN 'multi' THEN '{"commissions":true,"fullReports":true,"inventory":true,"multiLocation":true,"publicBooking":true,"reports":true,"team":true,"wallet":true}'::jsonb
  END,
  "is_active" = true,
  "is_public" = true,
  "sort_order" = CASE "code"
    WHEN 'free' THEN 10
    WHEN 'essential' THEN 20
    WHEN 'local' THEN 30
    WHEN 'multi' THEN 40
  END,
  "updated_at" = NOW()
WHERE "code" IN ('free', 'essential', 'local', 'multi');
