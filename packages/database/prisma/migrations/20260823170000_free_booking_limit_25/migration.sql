-- Mantiene el plan existente alineado con la politica vigente de Nava Free.
-- No altera reservas ni miembros historicos de las organizaciones.
UPDATE "plans"
SET
  "limits" = jsonb_set("limits", '{rolling30DayBookings}', '25'::jsonb, true),
  "features" = (
    SELECT jsonb_agg(
      CASE
        WHEN item.feature = '40 reservas en 30 dias' THEN '25 reservas en 30 dias'
        ELSE item.feature
      END
    )
    FROM jsonb_array_elements_text("features") AS item(feature)
  ),
  "updated_at" = NOW()
WHERE "code" = 'free';
