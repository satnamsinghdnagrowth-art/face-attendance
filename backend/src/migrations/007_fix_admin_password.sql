-- Fix: the hash stored in 001_init.sql for admin@school.com was incorrect and
-- did not match the documented password Admin@123.  This migration resets it to
-- a freshly generated bcrypt hash (rounds=12) that verifies correctly.
--
-- Password: Admin@123
-- Generated: bcryptjs 2.4.x, rounds=12

INSERT INTO users (name, email, password_hash, role, is_active)
VALUES (
  'Super Admin',
  'admin@school.com',
  '$2a$12$a4azi2x8nRb4BAeHhYfTYOsrVAfTMLfIEgHeoFW.U4OcSHevW8JV.',
  'super_admin',
  true
)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_active     = true,
      updated_at    = NOW();
