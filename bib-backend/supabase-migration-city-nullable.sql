-- Allow city to be null/empty for service-only pages (no location targeting)
ALTER TABLE contents ALTER COLUMN city DROP NOT NULL;
