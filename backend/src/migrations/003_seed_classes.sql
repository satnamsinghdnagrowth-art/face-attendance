-- ─── Seed: Classes, Subjects, Enrollments ────────────────────────────────────
-- Uses real user IDs from the database.
-- Teacher  : 0dec5420-63ce-4bc6-b7a3-fa6776e34054  (teacher@test.com)
-- Student  : 37366226-8596-48f5-8341-a77c752f9c54  (student@test.com)
-- Admin    : 8f727a73-f5ec-4eac-9ff7-609d112cbc97  (admin@test.com)

-- ─── Classes ─────────────────────────────────────────────────────────────────
INSERT INTO classes (id, name, department, semester, academic_year, admin_id)
VALUES
  (
    'aaaaaaaa-0001-4000-a000-000000000001',
    'Computer Science - A',
    'Computer Science',
    'Semester 5',
    '2024-25',
    '8f727a73-f5ec-4eac-9ff7-609d112cbc97'
  ),
  (
    'aaaaaaaa-0002-4000-a000-000000000002',
    'Information Technology - B',
    'Information Technology',
    'Semester 3',
    '2024-25',
    '8f727a73-f5ec-4eac-9ff7-609d112cbc97'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Subjects ────────────────────────────────────────────────────────────────
INSERT INTO subjects (id, name, code, class_id, teacher_id)
VALUES
  (
    'bbbbbbbb-0001-4000-b000-000000000001',
    'Data Structures & Algorithms',
    'CS501',
    'aaaaaaaa-0001-4000-a000-000000000001',
    '0dec5420-63ce-4bc6-b7a3-fa6776e34054'
  ),
  (
    'bbbbbbbb-0002-4000-b000-000000000002',
    'Operating Systems',
    'CS502',
    'aaaaaaaa-0001-4000-a000-000000000001',
    '0dec5420-63ce-4bc6-b7a3-fa6776e34054'
  ),
  (
    'bbbbbbbb-0003-4000-b000-000000000003',
    'Database Management Systems',
    'CS503',
    'aaaaaaaa-0001-4000-a000-000000000001',
    '0dec5420-63ce-4bc6-b7a3-fa6776e34054'
  ),
  (
    'bbbbbbbb-0004-4000-b000-000000000004',
    'Web Technologies',
    'IT301',
    'aaaaaaaa-0002-4000-a000-000000000002',
    '0dec5420-63ce-4bc6-b7a3-fa6776e34054'
  ),
  (
    'bbbbbbbb-0005-4000-b000-000000000005',
    'Computer Networks',
    'IT302',
    'aaaaaaaa-0002-4000-a000-000000000002',
    '0dec5420-63ce-4bc6-b7a3-fa6776e34054'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Enroll student in both classes ──────────────────────────────────────────
INSERT INTO class_enrollments (student_id, class_id)
VALUES
  (
    '37366226-8596-48f5-8341-a77c752f9c54',
    'aaaaaaaa-0001-4000-a000-000000000001'
  ),
  (
    '37366226-8596-48f5-8341-a77c752f9c54',
    'aaaaaaaa-0002-4000-a000-000000000002'
  )
ON CONFLICT (student_id, class_id) DO NOTHING;
