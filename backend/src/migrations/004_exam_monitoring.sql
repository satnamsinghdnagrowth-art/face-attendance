-- ─── Migration 004: Exam Hall Monitoring ─────────────────────────────────────

-- Extend role check to include exam roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN ('super_admin', 'admin', 'chief_examiner', 'hall_invigilator', 'teacher', 'student')
);

-- ─── Table: exams ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                   VARCHAR(255) NOT NULL,
  exam_code               VARCHAR(50)  UNIQUE NOT NULL,
  subject_id              UUID REFERENCES subjects(id) ON DELETE SET NULL,
  scheduled_start         TIMESTAMP    NOT NULL,
  scheduled_end           TIMESTAMP    NOT NULL,
  duration_mins           INTEGER      NOT NULL DEFAULT 180,
  re_verify_interval_mins INTEGER      DEFAULT 0,
  face_threshold          FLOAT        DEFAULT 0.85,
  flag_threshold          FLOAT        DEFAULT 0.70,
  status                  VARCHAR(20)  DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  instructions            TEXT,
  created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMP    DEFAULT NOW(),
  updated_at              TIMESTAMP    DEFAULT NOW()
);

-- ─── Table: exam_halls ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_halls (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id         UUID         NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  hall_name       VARCHAR(100) NOT NULL,
  capacity        INTEGER      NOT NULL DEFAULT 50,
  invigilator_id  UUID         REFERENCES users(id) ON DELETE SET NULL,
  floor           VARCHAR(50),
  building        VARCHAR(100),
  created_at      TIMESTAMP    DEFAULT NOW(),
  UNIQUE (exam_id, hall_name)
);

-- ─── Table: exam_sessions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_sessions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id          UUID         NOT NULL REFERENCES exams(id),
  hall_id          UUID         NOT NULL REFERENCES exam_halls(id),
  invigilator_id   UUID         NOT NULL REFERENCES users(id),
  started_at       TIMESTAMP    DEFAULT NOW(),
  ended_at         TIMESTAMP,
  status           VARCHAR(20)  DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'aborted')),
  total_students   INTEGER      DEFAULT 0,
  verified_count   INTEGER      DEFAULT 0,
  flagged_count    INTEGER      DEFAULT 0,
  rejected_count   INTEGER      DEFAULT 0,
  notes            TEXT
);

-- Only one active session per hall at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_sessions_hall_active
  ON exam_sessions (hall_id)
  WHERE status = 'active';

-- ─── Table: exam_enrollments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_enrollments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id      UUID        NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  hall_id      UUID        NOT NULL REFERENCES exam_halls(id),
  student_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat_number  VARCHAR(20),
  roll_number  VARCHAR(50),
  enrolled_at  TIMESTAMP   DEFAULT NOW(),
  UNIQUE (exam_id, student_id)
);

-- ─── Table: verification_events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verification_events (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_session_id    UUID        NOT NULL REFERENCES exam_sessions(id),
  exam_id            UUID        NOT NULL REFERENCES exams(id),
  student_id         UUID        NOT NULL REFERENCES users(id),
  matched_user_id    UUID        REFERENCES users(id),
  scan_type          VARCHAR(20) NOT NULL
    CHECK (scan_type IN ('entry', 're_verify', 'manual', 'id_card')),
  confidence_score   FLOAT,
  verdict            VARCHAR(20) NOT NULL
    CHECK (verdict IN ('verified', 'flagged', 'rejected', 'no_match', 'proxy_suspect')),
  face_image_url     TEXT,
  id_card_image_url  TEXT,
  id_card_number     VARCHAR(100),
  gps_latitude       FLOAT,
  gps_longitude      FLOAT,
  device_id          VARCHAR(100),
  scanned_by         UUID        NOT NULL REFERENCES users(id),
  scanned_at         TIMESTAMP   DEFAULT NOW(),
  reviewed_by        UUID        REFERENCES users(id),
  review_decision    VARCHAR(20)
    CHECK (review_decision IN ('confirmed_proxy', 'false_alarm', 'inconclusive')),
  review_note        TEXT,
  reviewed_at        TIMESTAMP
);

-- ─── Table: exam_alerts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_alerts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id      UUID        NOT NULL REFERENCES exams(id),
  hall_id      UUID        REFERENCES exam_halls(id),
  event_id     UUID        REFERENCES verification_events(id),
  alert_type   VARCHAR(30) NOT NULL
    CHECK (alert_type IN ('proxy_suspect', 'low_confidence', 'no_show', 'repeated_failure', 'id_mismatch')),
  severity     VARCHAR(10) DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message      TEXT        NOT NULL,
  student_id   UUID        REFERENCES users(id),
  is_resolved  BOOLEAN     DEFAULT false,
  resolved_by  UUID        REFERENCES users(id),
  resolved_at  TIMESTAMP,
  created_at   TIMESTAMP   DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exams_status          ON exams(status);
CREATE INDEX IF NOT EXISTS idx_exam_halls_exam       ON exam_halls(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_hall    ON exam_sessions(hall_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam    ON exam_sessions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_enrollments_exam    ON exam_enrollments(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_enrollments_student ON exam_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_ve_exam_session       ON verification_events(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_ve_student            ON verification_events(student_id);
CREATE INDEX IF NOT EXISTS idx_ve_verdict            ON verification_events(verdict);
CREATE INDEX IF NOT EXISTS idx_ve_scanned_at         ON verification_events(scanned_at);
CREATE INDEX IF NOT EXISTS idx_exam_alerts_exam      ON exam_alerts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_alerts_resolved  ON exam_alerts(is_resolved);

-- ─── Trigger: keep exams.updated_at current ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_exams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_exams_updated_at ON exams;
CREATE TRIGGER trg_exams_updated_at
  BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION update_exams_updated_at();
