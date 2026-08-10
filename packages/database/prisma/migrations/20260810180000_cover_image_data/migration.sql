-- The mobile app persists the selected cover as a compressed data URI during
-- the pilot. A varchar(2048) truncates legitimate photographs.
ALTER TABLE "user_registration_profiles"
ALTER COLUMN "cover_image_uri" TYPE TEXT;
