-- Add institutions table
CREATE TABLE IF NOT EXISTS institutions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(255) NOT NULL,
  code         VARCHAR(50) UNIQUE NOT NULL,
  contact_email VARCHAR(255),
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- Seed a default institution for existing data
INSERT INTO institutions (id, name, code, contact_email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Default Institution', 'DEFAULT', 'admin@school.com')
ON CONFLICT (code) DO NOTHING;

-- Add institution_id to users (nullable — null = global/admin)
ALTER TABLE users ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

-- Add institution_id to exams
ALTER TABLE exams ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;
ALTER TABLE exams ALTER COLUMN institution_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

-- Add institution_id to classes
ALTER TABLE classes ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

-- Backfill existing rows to default institution
UPDATE exams   SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id IS NULL;
UPDATE classes SET institution_id = '00000000-0000-0000-0000-000000000001' WHERE institution_id IS NULL;

-- Add push_tokens table (for Phase 2 push notifications)
CREATE TABLE IF NOT EXISTS push_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(255) NOT NULL,
  platform    VARCHAR(10) DEFAULT 'expo' CHECK (platform IN ('expo', 'fcm', 'apns')),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, token)
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

-- Add report_hash column to exams for digital signature (Phase 3)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS report_hash VARCHAR(64);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS report_generated_at TIMESTAMP;

-- Trigger for institutions.updated_at
CREATE OR REPLACE FUNCTION update_institutions_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_institutions_updated_at') THEN
    CREATE TRIGGER update_institutions_updated_at
      BEFORE UPDATE ON institutions
      FOR EACH ROW EXECUTE FUNCTION update_institutions_updated_at();
  END IF;
END $$;
