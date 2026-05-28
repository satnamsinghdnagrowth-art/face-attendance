-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255)  NOT NULL,
  email         VARCHAR(255)  UNIQUE NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  phone         VARCHAR(20),
  role          VARCHAR(20)   NOT NULL CHECK (role IN ('super_admin', 'admin', 'teacher', 'student')),
  photo_url     TEXT,
  is_active     BOOLEAN       DEFAULT true,
  last_login    TIMESTAMP,
  created_at    TIMESTAMP     DEFAULT NOW(),
  updated_at    TIMESTAMP     DEFAULT NOW()
);

-- ─── Classes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255)  NOT NULL,
  department    VARCHAR(255)  NOT NULL,
  semester      VARCHAR(50),
  academic_year VARCHAR(20),
  admin_id      UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP     DEFAULT NOW()
);

-- ─── Subjects ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255)  NOT NULL,
  code          VARCHAR(50)   UNIQUE NOT NULL,
  class_id      UUID          REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id    UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP     DEFAULT NOW()
);

-- ─── Class Enrollments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_enrollments (
  id          UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id    UUID       NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP  DEFAULT NOW(),
  UNIQUE(student_id, class_id)
);

-- ─── Face Embeddings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS face_embeddings (
  id               UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  embedding_vector FLOAT8[]   NOT NULL,
  image_url        TEXT,
  version          INTEGER    DEFAULT 1,
  is_active        BOOLEAN    DEFAULT true,
  created_at       TIMESTAMP  DEFAULT NOW()
);

-- ─── Attendance Sessions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  class_id    UUID        REFERENCES classes(id) ON DELETE CASCADE,
  subject_id  UUID        REFERENCES subjects(id) ON DELETE SET NULL,
  start_time  TIMESTAMP   NOT NULL DEFAULT NOW(),
  end_time    TIMESTAMP,
  status      VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  latitude    FLOAT8,
  longitude   FLOAT8,
  notes       TEXT,
  created_at  TIMESTAMP   DEFAULT NOW()
);

-- ─── Attendance Records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_records (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id       UUID        REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id         UUID        REFERENCES classes(id) ON DELETE SET NULL,
  subject_id       UUID        REFERENCES subjects(id) ON DELETE SET NULL,
  date             DATE        NOT NULL DEFAULT CURRENT_DATE,
  status           VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'late', 'leave', 'manual_override')),
  confidence_score FLOAT8,
  gps_latitude     FLOAT8,
  gps_longitude    FLOAT8,
  image_url        TEXT,
  marked_at        TIMESTAMP   DEFAULT NOW(),
  created_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMP   DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

-- ─── Leave Requests ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID        REFERENCES users(id) ON DELETE CASCADE,
  class_id    UUID        REFERENCES classes(id) ON DELETE CASCADE,
  from_date   DATE        NOT NULL,
  to_date     DATE        NOT NULL,
  reason      TEXT        NOT NULL,
  status      VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP   DEFAULT NOW(),
  CONSTRAINT leave_dates_check CHECK (to_date >= from_date)
);

-- ─── Refresh Tokens ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMP    NOT NULL,
  created_at  TIMESTAMP    DEFAULT NOW()
);

-- ─── OTP Codes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       VARCHAR(10)  NOT NULL,
  type       VARCHAR(20)  DEFAULT 'password_reset' CHECK (type IN ('password_reset', 'email_verification', 'login')),
  expires_at TIMESTAMP    NOT NULL,
  used       BOOLEAN      DEFAULT false,
  created_at TIMESTAMP    DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email            ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role             ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active        ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_face_embeddings_user   ON face_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_face_embeddings_active ON face_embeddings(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session  ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student  ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date     ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_class    ON attendance_records(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status   ON attendance_records(status);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class   ON attendance_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_teacher ON attendance_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_status  ON attendance_sessions(status);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_student   ON class_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class     ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user         ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash         ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_otp_codes_user              ON otp_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_subjects_class              ON subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher            ON subjects(teacher_id);

-- ─── Seed: Super Admin ────────────────────────────────────────────────────────
-- Password: Admin@123
-- Hash generated with bcrypt rounds=12
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Super Admin',
  'admin@school.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj0QkGOIKTKi',
  'super_admin'
)
ON CONFLICT (email) DO NOTHING;

-- ─── Trigger: Auto-update updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
    CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_attendance_records_updated_at') THEN
    CREATE TRIGGER update_attendance_records_updated_at
      BEFORE UPDATE ON attendance_records
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;
