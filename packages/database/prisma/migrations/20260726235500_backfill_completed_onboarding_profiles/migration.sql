UPDATE "user_registration_profiles"
SET "onboarding_completed_at" = "updated_at"
WHERE "onboarding_completed_at" IS NULL
  AND (
    "address_line" IS NOT NULL
    OR "cover_image_uri" IS NOT NULL
    OR "description" IS NOT NULL
    OR "facebook_url" IS NOT NULL
    OR "instagram_url" IS NOT NULL
  );
