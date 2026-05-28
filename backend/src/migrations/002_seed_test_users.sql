-- Test users — password for all is: password123
-- Hash generated with bcryptjs rounds=12

INSERT INTO users (name, email, password_hash, role, is_active)
VALUES
  ('Test Student',  'student@test.com', '$2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG', 'student',     true),
  ('Test Teacher',  'teacher@test.com', '$2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG', 'teacher',     true),
  ('Test Admin',    'admin@test.com',   '$2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG', 'admin',       true)
ON CONFLICT (email) DO NOTHING;
