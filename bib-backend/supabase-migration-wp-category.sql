-- Add wordpress_category to contents for standalone pages generated via /generate
ALTER TABLE contents ADD COLUMN IF NOT EXISTS wordpress_category text;
