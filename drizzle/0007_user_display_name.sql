-- Additive application-facing profile name. Better Auth continues to own the
-- Google-derived user.name value; this nullable override is managed only by
-- the authenticated Tales Without End account profile.
ALTER TABLE `user`
ADD COLUMN `display_name` text
CHECK (
  `display_name` IS NULL
  OR length(trim(`display_name`)) BETWEEN 2 AND 60
);
