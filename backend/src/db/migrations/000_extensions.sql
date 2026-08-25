-- Case-insensitive text type, used for email so lookups/uniqueness are
-- case-insensitive without extra application logic.
CREATE EXTENSION IF NOT EXISTS citext;
