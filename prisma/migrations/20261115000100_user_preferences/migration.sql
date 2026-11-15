-- Additive preferences only; no authentication/session or historical instant changes.
ALTER TABLE "user_preferences"
  ADD COLUMN "daily_digest_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "daily_digest_time" CHAR(5) NOT NULL DEFAULT '08:00',
  ADD CONSTRAINT "user_preferences_daily_digest_time_check"
    CHECK ("daily_digest_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
