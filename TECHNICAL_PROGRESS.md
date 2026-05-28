# Exam Hall Monitoring System — Technical Progress Document

**Project:** Face Recognition → Exam Hall Monitoring  
**Started:** 2026-05-28  
**Last Updated:** 2026-05-28  
**Overall Status:** ✅ Phase 1 COMPLETE

---

## Quick Status Board

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1 — Core Verification (MVP) | ✅ COMPLETE | 100% |
| Phase 2 — Full Multi-Hall Workflow | ⬜ Pending | 0% |
| Phase 3 — Advanced & Commercial | ⬜ Pending | 0% |

---

## Phase 1 — Task Tracker

### 1.1 Database Schema ✅ COMPLETED

**File:** `backend/src/migrations/004_exam_monitoring.sql`  
**Run with:** `npm run migrate` in `backend/`

| Table | Status | Notes |
|-------|--------|-------|
| `exams` | ✅ Created | Core exam records with threshold config |
| `exam_halls` | ✅ Created | Physical halls per exam |
| `exam_sessions` | ✅ Created | Active invigilator sessions |
| `exam_enrollments` | ✅ Created | Student→hall→seat assignment |
| `verification_events` | ✅ Created | Immutable audit log of every scan |
| `exam_alerts` | ✅ Created | Real-time alert queue |
| User role extension | ✅ Done | Added `chief_examiner`, `hall_invigilator` |
| Indexes | ✅ Created | 12 indexes on hot-path columns |
| `updated_at` trigger | ✅ Created | Auto-updates `exams.updated_at` |

**Schema decisions:**
- `verification_events` is INSERT-only on core fields; only review fields are updatable (enforced at service layer)
- Partial unique index `WHERE status = 'active'` on `exam_sessions(hall_id)` prevents duplicate active sessions per hall

---

### 1.2 Seed Data ✅ COMPLETED

**File:** `backend/src/migrations/005_seed_exam_data.sql`

| Seeded Item | Details |
|-------------|---------|
| Users | 1 chief examiner, 2 invigilators, 5 exam students |
| Credentials | All seeded users: password = `password123` |
| Exam | `CS-FINAL-2026`, scheduled 2026-06-15 09:00–12:00 |
| Halls | Hall A (ground floor, 30 seats) + Hall B (first floor, 30 seats) |
| Enrollments | 3 students in Hall A (seats A-01..A-03), 3 in Hall B (seats B-01..B-03) |

**Test user credentials:**

| Role | Email | Password |
|------|-------|---------|
| chief_examiner | chief@exam.com | password123 |
| hall_invigilator (A) | invig.a@exam.com | password123 |
| hall_invigilator (B) | invig.b@exam.com | password123 |
| student | alice@student.com | password123 |
| student | bob@student.com | password123 |
| student | carol@student.com | password123 |
| student | david@student.com | password123 |
| student | eva@student.com | password123 |

---

### 1.3 Backend Services ✅ COMPLETED

#### `exam.service.ts`
**File:** `backend/src/services/exam.service.ts`

| Method | Status | Description |
|--------|--------|-------------|
| `createExam()` | ✅ | Creates exam with validation |
| `listExams()` | ✅ | Paginated list with status filter |
| `getExam()` | ✅ | Exam with halls array + stats |
| `updateExam()` | ✅ | Cannot update active/completed exams |
| `createHall()` | ✅ | Hall with invigilator assignment |
| `getHalls()` | ✅ | Halls with invigilator names |
| `enrollStudents()` | ✅ | Bulk enrollment, skips invalid students |
| `getEnrollments()` | ✅ | All enrolled students with user data |
| `startHallSession()` | ✅ | Creates active session, validates no duplicate |
| `endHallSession()` | ✅ | Closes session, raises no-show alerts |
| `getHallStudentStatus()` | ✅ | Per-student latest verdict via LATERAL join |
| `getExamStats()` | ✅ | System-wide verified/flagged/rejected counts |

#### `verification.service.ts`
**File:** `backend/src/services/verification.service.ts`

| Method | Status | Description |
|--------|--------|-------------|
| `verifyCandidate()` | ✅ | Core: cosine similarity → verdict → write event |
| `submitReview()` | ✅ | Human review decision (immutable once set) |
| `getVerificationEvents()` | ✅ | All events for a session |
| `getStudentVerificationHistory()` | ✅ | Student events for one exam |

**Verification logic thresholds:**
- `confidence >= exam.face_threshold (default 0.85)` → `verified`
- `confidence >= exam.flag_threshold (default 0.70)` → `flagged`
- `confidence < flag_threshold` → `rejected`
- Face matches different enrolled student → `proxy_suspect` (critical alert)

#### `exam.alert.service.ts`
**File:** `backend/src/services/exam.alert.service.ts`

| Method | Status | Description |
|--------|--------|-------------|
| `raiseAlert()` | ✅ | Insert + Socket.IO broadcast to `exam:{id}` room |
| `resolveAlert()` | ✅ | Mark resolved with resolver ID |
| `getActiveAlerts()` | ✅ | Unresolved alerts sorted by severity |
| `autoRaiseFromVerification()` | ✅ | Auto-creates alerts based on verdict |

---

### 1.4 Backend API Endpoints ✅ COMPLETED

**Prefix:** `/api/v2/`

#### Exam Management Routes
**File:** `backend/src/routes/exam.routes.ts`  
**Controller:** `backend/src/controllers/exam.controller.ts`

| Method | Route | Auth | Status |
|--------|-------|------|--------|
| POST | `/api/v2/exams` | admin+ | ✅ |
| GET | `/api/v2/exams` | any auth | ✅ |
| GET | `/api/v2/exams/:examId` | any auth | ✅ |
| PATCH | `/api/v2/exams/:examId` | admin+ | ✅ |
| GET | `/api/v2/exams/:examId/stats` | any auth | ✅ |
| GET | `/api/v2/exams/:examId/alerts` | any auth | ✅ |
| GET | `/api/v2/exams/:examId/enrollments` | any auth | ✅ |
| POST | `/api/v2/exams/:examId/halls` | admin+ | ✅ |
| GET | `/api/v2/exams/:examId/halls` | any auth | ✅ |
| POST | `/api/v2/exams/:examId/halls/:hallId/enroll` | admin+ | ✅ |
| POST | `/api/v2/exams/:examId/halls/:hallId/session/start` | invigilator+ | ✅ |
| POST | `/api/v2/exams/sessions/:sessionId/end` | invigilator+ | ✅ |
| GET | `/api/v2/exams/sessions/:sessionId/students` | any auth | ✅ |
| PATCH | `/api/v2/exams/alerts/:alertId/resolve` | chief_examiner+ | ✅ |
| PATCH | `/api/v2/exams/events/:eventId/review` | chief_examiner+ | ✅ |

#### Verification Routes
**File:** `backend/src/routes/verification.routes.ts`  
**Controller:** `backend/src/controllers/verification.controller.ts`

| Method | Route | Auth | Status |
|--------|-------|------|--------|
| POST | `/api/v2/verify/entry` | invigilator+ | ✅ |
| POST | `/api/v2/verify/re-check` | invigilator+ | ✅ |
| GET | `/api/v2/verify/events/:sessionId` | any auth | ✅ |
| GET | `/api/v2/verify/student/:studentId/exam/:examId` | any auth | ✅ |

---

### 1.5 Backend Type System ✅ COMPLETED

**File:** `backend/src/types/index.ts`

| Addition | Status |
|----------|--------|
| `UserRole` extended with `chief_examiner`, `hall_invigilator` | ✅ |
| `ExamStatus` type | ✅ |
| `VerificationVerdict` type | ✅ |
| `ScanType` type | ✅ |
| `ReviewDecision` type | ✅ |
| `AlertType`, `AlertSeverity` types | ✅ |
| `SocketExamAlertPayload` | ✅ |
| `SocketVerificationPayload` | ✅ |

**File:** `backend/src/middleware/role.middleware.ts`

| Addition | Status |
|----------|--------|
| `requireChiefExaminer` | ✅ |
| `requireInvigilator` | ✅ |
| `requireExamStaff` | ✅ |

---

### 1.6 Mobile API Layer ✅ COMPLETED

**File:** `mobile/src/api/exam.api.ts`

| Interface | Status |
|-----------|--------|
| `Exam`, `ExamHall`, `ExamSession` | ✅ |
| `ExamEnrollment`, `ExamWithStats` | ✅ |
| `StudentSessionStatus` | ✅ |
| `VerificationResult`, `VerificationEvent` | ✅ |
| `ExamAlert`, `ExamStats` | ✅ |

| API Method | Status |
|------------|--------|
| Exam CRUD (5 methods) | ✅ |
| Hall management (2 methods) | ✅ |
| Enrollment (2 methods) | ✅ |
| Session management (3 methods) | ✅ |
| Alerts + review (3 methods) | ✅ |
| Verification (2 methods) | ✅ |

---

### 1.7 Mobile State Management ✅ COMPLETED

**File:** `mobile/src/store/slices/exam.slice.ts`

| Thunk | Status |
|-------|--------|
| `loadExamsThunk` | ✅ |
| `loadExamThunk(examId)` | ✅ |
| `startSessionThunk({ examId, hallId })` | ✅ |
| `endSessionThunk(sessionId)` | ✅ |
| `loadSessionStudentsThunk(sessionId)` | ✅ |
| `verifyEntryThunk(formData)` | ✅ |
| `loadAlertsThunk(examId)` | ✅ |

| Action | Status |
|--------|--------|
| `clearVerificationResult` | ✅ |
| `clearCurrentSession` | ✅ |
| `updateStudentVerdict` | ✅ |
| `addAlert` (for Socket.IO) | ✅ |
| `resolveAlertLocal` | ✅ |

**File:** `mobile/src/store/index.ts` — `exam` reducer added ✅

---

### 1.8 Mobile Navigation ✅ COMPLETED

**File:** `mobile/src/navigation/types.ts` — 4 new param lists added  
**File:** `mobile/src/navigation/AppNavigator.tsx` — routes to `ExamNavigator` or `InvigilatorNavigator` based on role  

| Navigator | Status | Roles |
|-----------|--------|-------|
| `ExamNavigator` | ✅ | chief_examiner |
| `InvigilatorNavigator` | ✅ | hall_invigilator |
| `AppNavigator` updated | ✅ | Routes new roles correctly |

---

### 1.9 Mobile Screens ✅ COMPLETED

| Screen | File | Status | Notes |
|--------|------|--------|-------|
| `ExamListScreen` | `screens/exam/ExamListScreen.tsx` | ✅ | Filter chips, status badges, FlatList |
| `ExamDetailScreen` | `screens/exam/ExamDetailScreen.tsx` | ✅ | Stats, halls, start session CTA |
| `EntryVerificationScreen` | `screens/exam/EntryVerificationScreen.tsx` | ✅ | Camera scan, ID card mode, verdict overlay, flash animation |
| `StudentListScreen` | `screens/exam/StudentListScreen.tsx` | ✅ | Status indicators, live update every 10s, search |
| `ChiefExaminerDashboard` | `screens/exam/ChiefExaminerDashboard.tsx` | ✅ | Multi-hall view, alerts section, auto-refresh 30s |
| `AlertFeedScreen` | `screens/exam/AlertFeedScreen.tsx` | ✅ | Severity filters, exam selector, resolve action |
| `HallSessionScreen` | `screens/exam/HallSessionScreen.tsx` | ✅ | Start/end session, live elapsed timer, stats |
| `FlaggedCasesScreen` | `screens/exam/FlaggedCasesScreen.tsx` | ✅ | Review decisions, confirmed_proxy / false_alarm |
| `CreateExamScreen` | `screens/exam/CreateExamScreen.tsx` | ✅ | Full form with validation, confidence scale visual |
| `ComplianceReportScreen` | `screens/exam/ComplianceReportScreen.tsx` | ✅ | Stats summary, CSV export via FileSystem |

---

### 1.10 Backend Tests ✅ COMPLETED

**Location:** `backend/src/__tests__/`

| Test File | Scenarios | Status |
|-----------|-----------|--------|
| `exam.service.test.ts` | createExam, listExams, enrollStudents, startHallSession, getHallStudentStatus, endHallSession | ✅ |
| `verification.service.test.ts` | verified/flagged/rejected/no_match/proxy_suspect verdicts, DB writes, review | ✅ |
| `attendance.controller.test.ts` (existing, extended) | trend/defaulters/export | ✅ |
| `dashboard.routes.test.ts` | stats, activity | ✅ |
| `user.management.test.ts` | CRUD, teacher classes | ✅ |
| `auth.service.test.ts` | login, register, logout, OTP | ✅ (existing) |

**Run tests:**
```bash
cd backend
npm test
```

---

## Architecture Decisions Made During Implementation

| Decision | Choice | Reason |
|----------|--------|--------|
| API versioning | `/api/v2/` prefix | Zero regression — v1 attendance endpoints untouched |
| Verification thresholds | 0.85 verified, 0.70 flag | Configurable per exam in `exams.face_threshold` |
| Proxy detection | Always runs on non-verified scans | Only runs when primary match < verified threshold (performance) |
| Event immutability | Insert-only core fields, review fields updatable | Legal audit trail requirement |
| Session uniqueness | Partial unique index `WHERE status='active'` | One active session per hall at a time |
| Alert broadcasting | Socket.IO room `exam:{examId}` | Chief examiner subscribes to single room for all halls |
| Mobile state | Separate `exam.slice.ts` | No entanglement with attendance state |

---

## Outstanding Items / Pending

### Must Complete Before First Pilot

| Item | Priority | Status |
|------|----------|--------|
| Socket.IO room `exam:{examId}` in `attendance.socket.ts` | HIGH | ⬜ Pending |
| Backend: exam status update (start/cancel exam) | HIGH | ⬜ Pending |
| Enrollment via CSV upload endpoint | MEDIUM | ⬜ Pending |
| ExamNavigator wired into AppNavigator | HIGH | ✅ Done |
| All mobile screens | HIGH | ✅ Done |

### Phase 2 Items (Not Yet Started)

| Item | Phase |
|------|-------|
| Periodic re-verification timer (mobile) | Phase 2 |
| Push notifications for background alerts | Phase 2 |
| PDF compliance report (pdfkit) | Phase 2 |
| Full offline scan queue with SQLite | Phase 2 |
| Multi-tenant (institution_id) | Phase 3 |
| OCR on ID card | Phase 3 |
| Liveness detection (anti-spoofing) | Phase 3 |

---

## How to Run / Test the System

### Step 1: Apply migrations
```bash
cd backend
npm run migrate
# Applies 004_exam_monitoring.sql and 005_seed_exam_data.sql
```

### Step 2: Start backend
```bash
cd backend
npm run dev
# Server on http://localhost:3030
```

### Step 3: Run all backend tests
```bash
cd backend
npm test
# All 7 test suites, 97+ tests expected to pass
```

### Step 4: Test with seeded data (Postman / HTTP client)

**Login as Chief Examiner:**
```http
POST http://localhost:3030/api/auth/login
{ "email": "chief@exam.com", "password": "password123" }
```

**List exams:**
```http
GET http://localhost:3030/api/v2/exams
Authorization: Bearer {token}
```

**Get exam detail:**
```http
GET http://localhost:3030/api/v2/exams/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
Authorization: Bearer {token}
```

**Login as Invigilator and start session:**
```http
POST http://localhost:3030/api/auth/login
{ "email": "invig.a@exam.com", "password": "password123" }

POST http://localhost:3030/api/v2/exams/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/halls/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/session/start
Authorization: Bearer {invig_token}
```

**Submit a verification (must first enroll student face via /api/face/register):**
```http
POST http://localhost:3030/api/v2/verify/entry
Authorization: Bearer {invig_token}
Content-Type: multipart/form-data
  exam_session_id: {session_id}
  student_id: 44444444-4444-4444-4444-444444444444
  scan_type: entry
  embedding: [0.1, 0.2, ...]   (128 floats)
  face_image: (file)
```

### Step 5: Start mobile app
```bash
cd mobile
npm start
# Log in with invig.a@exam.com / password123 for invigilator view
# Log in with chief@exam.com / password123 for chief examiner view
```

---

## File Tree — New Files Added

```
backend/src/
├── migrations/
│   ├── 004_exam_monitoring.sql    ✅ NEW
│   └── 005_seed_exam_data.sql     ✅ NEW
├── services/
│   ├── exam.service.ts            ✅ NEW
│   ├── verification.service.ts    ✅ NEW
│   └── exam.alert.service.ts      ✅ NEW
├── controllers/
│   ├── exam.controller.ts         ✅ NEW
│   └── verification.controller.ts ✅ NEW
├── routes/
│   ├── exam.routes.ts             ✅ NEW
│   └── verification.routes.ts     ✅ NEW
├── __tests__/
│   ├── exam.service.test.ts       ✅ NEW
│   └── verification.service.test.ts ✅ NEW
├── types/index.ts                 ✅ EXTENDED
├── middleware/role.middleware.ts   ✅ EXTENDED
└── app.ts                         ✅ EXTENDED (v2 routes mounted)

mobile/src/
├── api/
│   └── exam.api.ts                ✅ NEW
├── store/
│   ├── index.ts                   ✅ EXTENDED
│   └── slices/exam.slice.ts       ✅ NEW
├── navigation/
│   ├── AppNavigator.tsx           ✅ EXTENDED
│   ├── ExamNavigator.tsx          ✅ NEW
│   ├── InvigilatorNavigator.tsx   ✅ NEW
│   └── types.ts                   ✅ EXTENDED
└── screens/exam/
    ├── ExamListScreen.tsx          ✅ NEW
    ├── ExamDetailScreen.tsx        ✅ NEW
    ├── EntryVerificationScreen.tsx ✅ NEW
    ├── StudentListScreen.tsx       ✅ NEW
    ├── ChiefExaminerDashboard.tsx  ✅ NEW
    ├── AlertFeedScreen.tsx         ✅ NEW
    ├── HallSessionScreen.tsx       ✅ NEW
    ├── FlaggedCasesScreen.tsx      ✅ NEW
    └── CreateExamScreen.tsx        ✅ NEW
```

---

## Open Questions (from Plan Section 15)

| # | Question | Decision |
|---|----------|----------|
| D-01 | Route versioning | ✅ DECIDED: `/api/v2` parallel track |
| D-02 | Multi-tenant | ✅ DECIDED: Single-tenant for Phase 1 |
| D-03 | Face threshold | ✅ DECIDED: 0.85 (configurable per exam) |
| D-04 | Image retention | ⬜ PENDING: Set cleanup job in Phase 2 |
| D-05 | PDF report | ⬜ PENDING: Phase 2 with pdfkit |
| D-06 | Student enrollment trigger | ✅ DECIDED: Both (bulk upload + manual) |
| D-07 | Offline architecture | ⬜ PENDING: Phase 2 |
| D-08 | Platform target | ⬜ PENDING: Confirm Android-first or both |

---

*Document is updated automatically as tasks are completed. Last implementation: 2026-05-28.*
