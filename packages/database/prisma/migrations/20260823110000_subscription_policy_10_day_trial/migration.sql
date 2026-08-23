-- The public policy defines a 10-day trial. Extend only live trials that
-- still exactly match the previous 7-day configuration.
UPDATE "subscriptions"
SET
  "trial_ends_at" = "current_period_start" + INTERVAL '10 days',
  "current_period_end" = "current_period_start" + INTERVAL '10 days',
  "updated_at" = NOW()
WHERE "status" = 'TRIAL'
  AND "trial_ends_at" > NOW()
  AND "trial_ends_at" = "current_period_start" + INTERVAL '7 days'
  AND "current_period_end" = "current_period_start" + INTERVAL '7 days';
