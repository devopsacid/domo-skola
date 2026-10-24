-- 0002_audit_search: allow the audit action 'search' (a text search in the admin list is audited by
-- fact and filter enums only, never by its text). SQLite cannot alter a CHECK constraint, so the table
-- is rebuilt: same columns, same ids (the AUTOINCREMENT sequence follows the copied ids), same indexes,
-- and the three append-only triggers are recreated exactly as in 0001_init.sql.
-- DROP TABLE does not fire the delete trigger, so the retention guard is not involved.
CREATE TABLE audit_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL CHECK(length(actor_email) BETWEEN 3 AND 254),
  actor_role TEXT NOT NULL CHECK(actor_role IN ('admin','coordinator')),
  action TEXT NOT NULL CHECK(action IN ('view','search','status_change','note_add','email_resend','export','delete','retention_purge')),
  subject_type TEXT NOT NULL CHECK(subject_type IN ('inquiry','application','bulk')),
  subject_id TEXT CHECK(subject_id IS NULL OR length(subject_id) <= 64),
  details TEXT CHECK(details IS NULL OR length(details) <= 1000),
  request_id TEXT CHECK(request_id IS NULL OR length(request_id) <= 64)
);

INSERT INTO audit_log_new(id, at, actor_email, actor_role, action, subject_type, subject_id, details, request_id)
  SELECT id, at, actor_email, actor_role, action, subject_type, subject_id, details, request_id FROM audit_log;

DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;

CREATE INDEX audit_log_at ON audit_log(at);
CREATE INDEX audit_log_subject ON audit_log(subject_type, subject_id);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER audit_log_no_replace BEFORE INSERT ON audit_log
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM audit_log WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER audit_log_guard_delete BEFORE DELETE ON audit_log
WHEN (SELECT purge_allowed FROM retention_guard WHERE id = 1) <> 1
BEGIN
  SELECT RAISE(ABORT, 'audit_log rows may only be deleted by the retention purge');
END;
