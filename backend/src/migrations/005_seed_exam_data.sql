-- ─── Seed 005: Exam Monitoring Test Data ─────────────────────────────────────
-- Existing user IDs carried over from 003_seed_classes.sql:
--   Teacher  : 0dec5420-63ce-4bc6-b7a3-fa6776e34054  (teacher@test.com)
--   Student  : 37366226-8596-48f5-8341-a77c752f9c54  (student@test.com)
--   Admin    : 8f727a73-f5ec-4eac-9ff7-609d112cbc97  (admin@test.com)
-- Password for all seeded users below: "password123"
--   hash: $2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG

-- ─── New users ────────────────────────────────────────────────────────────────
INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Chief Examiner',
    'chief@exam.com',
    '$2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG',
    'chief_examiner',
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Hall Invigilator A',
    'invig.a@exam.com',
    '$2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG',
    'hall_invigilator',
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Hall Invigilator B',
    'invig.b@exam.com',
    '$2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG',
    'hall_invigilator',
    true
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'Alice Johnson',
    'alice@student.com',
    '$2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG',
    'student',
    true
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'Bob Smith',
    'bob@student.com',
    '$2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG',
    'student',
    true
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    'Carol White',
    'carol@student.com',
    '$2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG',
    'student',
    true
  ),
  (
    '77777777-7777-7777-7777-777777777777',
    'David Brown',
    'david@student.com',
    '$2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG',
    'student',
    true
  ),
  (
    '88888888-8888-8888-8888-888888888888',
    'Eva Green',
    'eva@student.com',
    '$2a$12$MAtc00Zay3jn0FhZYt/uy.DbmVY/JMYJrStamAfLfCZyGAbJRwcfG',
    'student',
    true
  )
ON CONFLICT (email) DO NOTHING;

-- ─── Exam ─────────────────────────────────────────────────────────────────────
INSERT INTO exams (
  id, title, exam_code,
  subject_id,
  scheduled_start, scheduled_end, duration_mins,
  face_threshold, flag_threshold,
  status, created_by
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Computer Science Final Examination 2026',
  'CS-FINAL-2026',
  'bbbbbbbb-0001-4000-b000-000000000001',   -- Data Structures & Algorithms from 003
  '2026-06-15 09:00:00',
  '2026-06-15 12:00:00',
  180,
  0.85,
  0.70,
  'scheduled',
  '8f727a73-f5ec-4eac-9ff7-609d112cbc97'   -- admin
)
ON CONFLICT (exam_code) DO NOTHING;

-- ─── Exam Halls ───────────────────────────────────────────────────────────────
INSERT INTO exam_halls (id, exam_id, hall_name, capacity, invigilator_id, building, floor)
VALUES
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Hall A',
    30,
    '22222222-2222-2222-2222-222222222222',
    'Main Block',
    'Ground Floor'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Hall B',
    30,
    '33333333-3333-3333-3333-333333333333',
    'Main Block',
    'First Floor'
  )
ON CONFLICT (exam_id, hall_name) DO NOTHING;

-- ─── Enrollments: Hall A — Alice, Bob, Carol ──────────────────────────────────
INSERT INTO exam_enrollments (exam_id, hall_id, student_id, seat_number)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '44444444-4444-4444-4444-444444444444',
    'A-01'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '55555555-5555-5555-5555-555555555555',
    'A-02'
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '66666666-6666-6666-6666-666666666666',
    'A-03'
  )
ON CONFLICT (exam_id, student_id) DO NOTHING;

-- ─── Enrollments: Hall B — David, Eva, original student ──────────────────────
INSERT INTO exam_enrollments (exam_id, hall_id, student_id, seat_number, roll_number)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '77777777-7777-7777-7777-777777777777',
    'B-01',
    NULL
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '88888888-8888-8888-8888-888888888888',
    'B-02',
    NULL
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '37366226-8596-48f5-8341-a77c752f9c54',
    'B-03',
    '2023CS001'
  )
ON CONFLICT (exam_id, student_id) DO NOTHING;
