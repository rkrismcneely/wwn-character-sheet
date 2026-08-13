-- Additive administrator-role migration. Better Auth owns this server-only
-- field; existing and future accounts remain ordinary users by default.
ALTER TABLE `user`
  ADD COLUMN `role` text DEFAULT 'user' NOT NULL
  CHECK (`role` in ('user', 'admin'));
