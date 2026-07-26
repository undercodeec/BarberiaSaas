ALTER TABLE "user_registration_profiles"
ADD COLUMN "address_line" VARCHAR(240),
ADD COLUMN "cover_image_uri" VARCHAR(2048),
ADD COLUMN "description" VARCHAR(500),
ADD COLUMN "facebook_url" VARCHAR(2048),
ADD COLUMN "instagram_url" VARCHAR(2048);

