-- 0001_init: forms, admin, audit and abuse-control tables.
-- Forward-only. Enum CHECK lists mirror src/shared/enums.ts (parity test: tests/unit/enums.test.ts)
-- and length limits mirror LIMITS in src/shared/schemas/common.ts.
-- All timestamps are ISO-8601 UTC TEXT; ids are crypto.randomUUID() TEXT.
-- No column exists for birth numbers, diagnoses or other sensitive child data (brief section 7).

CREATE TABLE contact_inquiries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  locale TEXT NOT NULL CHECK(locale IN ('sk','cs','en')),
  parent_name TEXT NOT NULL CHECK(length(parent_name) BETWEEN 1 AND 120),
  email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
  phone TEXT CHECK(phone IS NULL OR length(phone) <= 32),
  region TEXT NOT NULL CHECK(region IN ('banska_bystrica','ruzomberok','liptovsky_mikulas','other')),
  subject TEXT NOT NULL CHECK(subject IN ('general','visit','enrollment','other')),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','closed')),
  status_changed_at TEXT,
  privacy_notice_version TEXT NOT NULL,
  privacy_ack_at TEXT NOT NULL,
  source_page TEXT,
  suspected_spam INTEGER NOT NULL DEFAULT 0 CHECK(suspected_spam IN (0,1)),
  retain_until TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  locale TEXT NOT NULL CHECK(locale IN ('sk','cs','en')),
  parent_name TEXT NOT NULL CHECK(length(parent_name) BETWEEN 1 AND 120),
  email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
  -- NOT NULL follows brief section 7 step 1; the owner may relax it (then recreate the column in a new migration).
  phone TEXT NOT NULL CHECK(length(phone) BETWEEN 1 AND 32),
  municipality TEXT NOT NULL CHECK(length(municipality) BETWEEN 1 AND 120),
  region TEXT NOT NULL CHECK(region IN ('banska_bystrica','ruzomberok','liptovsky_mikulas','other')),
  preferred_language TEXT NOT NULL CHECK(preferred_language IN ('sk','cs','en')),
  child_name TEXT NOT NULL CHECK(length(child_name) BETWEEN 1 AND 60),
  intended_grade INTEGER NOT NULL CHECK(typeof(intended_grade) = 'integer' AND intended_grade BETWEEN 1 AND 4),
  intended_school_year TEXT NOT NULL CHECK(intended_school_year GLOB '[0-9][0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]'),
  current_arrangement TEXT CHECK(current_arrangement IN ('kindergarten','registered_school','individual_education','other','prefer_not_say')),
  motivation TEXT CHECK(motivation IS NULL OR length(motivation) <= 2000),
  environment_priorities TEXT CHECK(environment_priorities IS NULL OR length(environment_priorities) <= 2000),
  questions TEXT CHECK(questions IS NULL OR length(questions) <= 2000),
  preferred_next_step TEXT NOT NULL CHECK(preferred_next_step IN ('call','visit','info')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','meeting_planned','in_discussion','accepted','waitlisted','closed')),
  status_changed_at TEXT,
  privacy_notice_version TEXT NOT NULL,
  privacy_ack_at TEXT NOT NULL,
  suspected_spam INTEGER NOT NULL DEFAULT 0 CHECK(suspected_spam IN (0,1)),
  retain_until TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  author_email TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  inquiry_id TEXT REFERENCES contact_inquiries(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES applications(id) ON DELETE CASCADE,
  CHECK((inquiry_id IS NULL) <> (application_id IS NULL))
);

-- Separate legal basis from the privacy acknowledgement; never a condition of applying.
CREATE TABLE marketing_consents (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  locale TEXT NOT NULL CHECK(locale IN ('sk','cs','en')),
  purpose TEXT NOT NULL,
  consent_text_version TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('contact','application')),
  inquiry_id TEXT REFERENCES contact_inquiries(id) ON DELETE SET NULL,
  application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
  withdrawn_at TEXT,
  withdrawal_channel TEXT
);

-- Delivery tracking only: no recipient address and no body.
CREATE TABLE email_deliveries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('sender_confirmation','admin_notification')),
  inquiry_id TEXT REFERENCES contact_inquiries(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','failed','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((inquiry_id IS NULL) <> (application_id IS NULL))
);

-- Append-only: updates are blocked by trigger; only the retention job deletes.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK(actor_role IN ('admin','coordinator')),
  action TEXT NOT NULL CHECK(action IN ('view','status_change','note_add','email_resend','export','delete','retention_purge')),
  subject_type TEXT NOT NULL CHECK(subject_type IN ('inquiry','application','bulk')),
  subject_id TEXT,
  details TEXT,
  request_id TEXT
);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TABLE admin_users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('admin','coordinator')),
  created_at TEXT NOT NULL,
  disabled_at TEXT
);

-- key = HMAC(ip or email) + route + window; rows expire after 24 hours.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX contact_inquiries_status_created ON contact_inquiries(status, created_at);
CREATE INDEX applications_status_created ON applications(status, created_at);
CREATE INDEX contact_inquiries_region ON contact_inquiries(region);
CREATE INDEX applications_region ON applications(region);
CREATE INDEX applications_grade ON applications(intended_grade);
CREATE INDEX contact_inquiries_retain ON contact_inquiries(retain_until);
CREATE INDEX applications_retain ON applications(retain_until);
CREATE INDEX notes_inquiry ON notes(inquiry_id);
CREATE INDEX notes_application ON notes(application_id);
CREATE INDEX email_deliveries_inquiry ON email_deliveries(inquiry_id);
CREATE INDEX email_deliveries_application ON email_deliveries(application_id);
CREATE INDEX marketing_consents_inquiry ON marketing_consents(inquiry_id);
CREATE INDEX marketing_consents_application ON marketing_consents(application_id);
CREATE INDEX audit_log_at ON audit_log(at);
CREATE INDEX rate_limits_expires ON rate_limits(expires_at);
