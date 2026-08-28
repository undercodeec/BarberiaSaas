CREATE TABLE "welcome_survey_responses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "selected_options" VARCHAR(120)[] NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welcome_survey_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "welcome_survey_responses_selected_options_not_empty"
      CHECK (cardinality("selected_options") > 0)
);

CREATE UNIQUE INDEX "welcome_survey_responses_user_id_key"
  ON "welcome_survey_responses"("user_id");

CREATE INDEX "welcome_survey_responses_submitted_at_idx"
  ON "welcome_survey_responses"("submitted_at");

ALTER TABLE "welcome_survey_responses"
  ADD CONSTRAINT "welcome_survey_responses_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
