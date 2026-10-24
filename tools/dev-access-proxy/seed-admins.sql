-- Local development only: two admin_users for tools/dev-access-proxy (pick one with ?dev_user=<email>).
-- Apply with `pnpm db:seed:admins` after `pnpm db:migrate:local`. Never run against a remote database.
INSERT OR IGNORE INTO admin_users(email, role, created_at) VALUES
  ('admin@example.test', 'admin', '2026-01-01T00:00:00.000Z'),
  ('coordinator@example.test', 'coordinator', '2026-01-01T00:00:00.000Z');
