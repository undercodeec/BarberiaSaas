-- Reduce only legacy trials that are still active and retain the old 14+7-day
-- schedule. Simulated or manually adjusted subscriptions remain untouched.
UPDATE "subscriptions"
SET
  "trial_ends_at" = "current_period_start" + INTERVAL '7 days',
  "current_period_end" = "current_period_start" + INTERVAL '7 days',
  "grace_ends_at" = "current_period_start" + INTERVAL '14 days',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'TRIAL'
  AND "trial_ends_at" > CURRENT_TIMESTAMP
  AND "trial_ends_at" = "current_period_start" + INTERVAL '14 days'
  AND "current_period_end" = "current_period_start" + INTERVAL '14 days'
  AND "grace_ends_at" = "current_period_start" + INTERVAL '21 days';
