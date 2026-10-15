-- Allows each FTP site to reuse an imported page as the visual shell for new services.
ALTER TABLE public.ftp_site_configs
  ADD COLUMN IF NOT EXISTS default_template_remote_path text
  CHECK (
    default_template_remote_path IS NULL
    OR (
      default_template_remote_path <> ''
      AND default_template_remote_path NOT LIKE '/%'
      AND position('..' in default_template_remote_path) = 0
    )
  );
