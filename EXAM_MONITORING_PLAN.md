# Exam Hall Monitoring System — Architecture & Execution Plan

**Document Type:** Technical Architecture Plan  
**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** For Review & Approval  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What We Already Have](#2-what-we-already-have)
3. [What Needs to Change or Be Built](#3-what-needs-to-change-or-be-built)
4. [New System Architecture](#4-new-system-architecture)
5. [Database Schema Changes](#5-database-schema-changes)
6. [New API Design](#6-new-api-design)
7. [Mobile App Changes](#7-mobile-app-changes)
8. [Backend Changes](#8-backend-changes)
9. [Feature Specifications](#9-feature-specifications)
10. [Implementation Phases](#10-implementation-phases-roadmap)
11. [Security Considerations](#11-security-considerations)
12. [Risk Assessment](#12-risk-assessment)
13. [Testing Strategy](#13-testing-strategy)
14. [Timeline & Effort Estimate](#14-timeline--effort-estimate)
15. [Open Decisions for Review](#15-open-decisions-for-review)

---

## 1. Executive Summary

### What This Is

Transform the existing Face Recognition Attendance System into a dedicated **Exam Hall Monitoring Platform** used by universities and certification bodies to:

- Verify student identity at exam hall entry via face scan
- Detect proxy candidates (someone sitting the exam on behalf of another student)
- Generate a legally-admissible audit trail for every verification event
- Alert invigilators in real-time when confidence drops below the trust threshold
- Support periodic re-verification during the exam without disrupting students

### Why This Requires a Separate Plan

The attendance system is built around **sessions that track presence** (is the student here?). The exam monitoring system is built around **identity assurance events** (is this the correct person?). The data model, the confidence thresholds, and the workflows are fundamentally different.

Attendance: one scan = one record per session.  
Exam monitoring: multiple scans per student per exam, each with a verification verdict.

### Core Principle

> **Every scan must produce an immutable, timestamped, auditable verification record.  
> Confidence below threshold is not a failure — it is an alert that triggers a human decision.**

---

## 2. What We Already Have

The following components from the current system can be **reused with minimal or no change**.

| Component | Current Purpose | Reuse in Exam System |
|-----------|----------------|----------------------|
| `face_embeddings` table | Student face enrollment | ✅ Direct reuse — same enrollment flow |
| `FaceEnrollmentScreen` (mobile) | 5-angle face capture | ✅ Reuse for exam pre-enrollment |
| `LiveScanScreen` (mobile) | Real-time face scan | ✅ Basis for entry scan & re-verification screen |
| Camera switch (front/rear) | Face vs ID scan toggle | ✅ Already built — critical for ID card capture |
| `faceService` (backend) | Cosine similarity matching | ✅ Reuse with stricter threshold |
| JWT auth + role system | Access control | ✅ Extend with 2 new roles |
| Socket.IO real-time layer | Live session updates | ✅ Reuse for live alert broadcasting |
| `attendance_records` schema | Timestamped presence log | ⚠️ Extend — needs exam-specific columns |
| Export (CSV) | Reporting | ✅ Extend for compliance report format |
| Admin dashboard | Overview metrics | ⚠️ Adapt — replace attendance rate with verification rate |
| Offline sync service | Low-connectivity support | ✅ Critical for exam halls with poor WiFi |

**Reuse coverage: approximately 60% of existing backend, 50% of existing mobile.**

---

## 3. What Needs to Change or Be Built

### Must Build (New)

| Feature | Why |
|---------|-----|
| Exam management (CRUD) | Exams are not the same as attendance sessions |
| Hall + seat assignment | Need to know which student sits where |
| Dual-camera ID card capture | Rear camera captures physical ID for cross-reference |
| Verification event log | Every scan = a verification event, not just "present/absent" |
| Periodic re-verification scheduler | Automated timer-based re-scan prompts during exam |
| Suspect alert system | Real-time escalation when confidence < strict threshold |
| Chief Examiner dashboard | Live hall view: who's verified, who's flagged, active alerts |
| Compliance audit export | Legally formatted PDF/CSV with all verification events |
| Flagged cases review screen | Human reviewer resolves flagged verifications |

### Must Modify (Existing)

| Component | Change Required |
|-----------|----------------|
| Face match threshold | Lower from 0.75 → 0.85 for exam security (stricter) |
| `attendance_sessions` → `exam_sessions` | Add exam-specific fields |
| LiveScanScreen | Add ID card capture mode, verdict display, flag escalation |
| Role system | Add `chief_examiner` and `hall_invigilator` roles |
| Notification system | Add alert categories: PROXY_SUSPECT, LOW_CONFIDENCE, NO_SHOW |
| Admin dashboard | Replace teacher-centric view with exam-centric view |

### Can Defer (Phase 2+)

| Feature | Reason to Defer |
|---------|----------------|
| OCR on ID card | Complexity; manual ID number entry works for MVP |
| Liveness detection | Anti-spoofing (photo-in-front-of-camera attack); add in Phase 2 |
| Seating chart visual map | Nice to have; text list works for MVP |
| AI anomaly detection | Flag students who look away frequently; complex, add later |
| Integration with university SIS | API-level integration per client; custom per deployment |

---

## 4. New System Architecture

### Role Hierarchy

```
super_admin
  └── institution_admin          (manages exams, halls, enrollments)
        ├── chief_examiner        (oversees all halls in one exam)
        │     └── hall_invigilator (manages one hall, runs scans)
        └── student               (enrolled, gets scanned)
```

### System Flow Overview

```
PRE-EXAM (Days before)
┌─────────────────────────────────────────────────────┐
│  admin creates Exam → assigns Halls → assigns       │
│  Students to Hall+Seat → students enroll face       │
│  (if not already enrolled)                          │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
EXAM DAY — ENTRY PHASE (30 mins before exam)
┌─────────────────────────────────────────────────────┐
│  invigilator opens Hall Session on mobile           │
│  Student arrives → invigilator scans face           │
│  [confidence ≥ 0.85] → VERIFIED ✓ → seated         │
│  [confidence 0.70–0.84] → FLAGGED ⚠️ → manual ID  │
│  [confidence < 0.70] → REJECTED ✗ → escalate       │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
EXAM IN PROGRESS — RE-VERIFICATION PHASE
┌─────────────────────────────────────────────────────┐
│  Timer fires every N minutes (configurable)         │
│  invigilator walks to flagged/random seat           │
│  Re-scan in place → verdict logged                  │
│  Discrepancy → alert sent to chief_examiner         │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
POST-EXAM — AUDIT & REPORTING
┌─────────────────────────────────────────────────────┐
│  chief_examiner reviews flagged cases               │
│  Resolves each with: CONFIRMED_PROXY / FALSE_ALARM  │
│  Generates compliance report (PDF/CSV)              │
│  Report includes: all events, confidence scores,    │
│  photos, reviewer decisions, timestamps             │
└─────────────────────────────────────────────────────┘
```

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        MOBILE APP (Expo)                          │
│                                                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Hall Invig.    │  │ Chief Examiner  │  │ Admin/Setup     │  │
│  │  - Entry Scan   │  │ - Live Dashboard│  │ - Exam CRUD     │  │
│  │  - Re-verify    │  │ - Alert review  │  │ - Hall setup    │  │
│  │  - ID capture   │  │ - Flagged cases │  │ - Seat assign   │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                     │            │
└───────────┼────────────────────┼─────────────────────┼────────────┘
            │ HTTPS / WebSocket  │                     │
┌───────────▼────────────────────▼─────────────────────▼────────────┐
│                        BACKEND (Node.js + Express)                 │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐│
│  │ Exam Routes  │  │ Verify Routes│  │  Alert/Notification      ││
│  │ /api/exams   │  │ /api/verify  │  │  Socket.IO rooms         ││
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘│
│         │                 │                                        │
│  ┌──────▼─────────────────▼───────────────────────────────────┐   │
│  │              Core Services                                  │   │
│  │  faceService (cosine sim)  │  examService                  │   │
│  │  verificationService       │  alertService                 │   │
│  └──────────────────────────────────────────────────────────-─┘   │
└───────────────────────────────┬────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                  ▼
        PostgreSQL            Redis             File Storage
     (all exam data)      (active sessions,  (scan images,
                           real-time state)   ID captures)
```

---

## 5. Database Schema Changes

### New Tables

#### `exams`
Core exam record — one row per examination event.

```sql
CREATE TABLE exams (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(255) NOT NULL,           -- "Final Exam — Computer Science 2026"
  exam_code       VARCHAR(50) UNIQUE NOT NULL,      -- "CS-FINAL-2026"
  institution_id  UUID REFERENCES institutions(id), -- for multi-tenant
  subject_id      UUID REFERENCES subjects(id),
  scheduled_start TIMESTAMP NOT NULL,
  scheduled_end   TIMESTAMP NOT NULL,
  duration_mins   INTEGER NOT NULL,
  re_verify_interval_mins INTEGER DEFAULT 30,       -- 0 = disabled
  face_threshold  FLOAT DEFAULT 0.85,               -- stricter than attendance
  flag_threshold  FLOAT DEFAULT 0.70,               -- below this = escalate immediately
  status          VARCHAR(20) DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','active','completed','cancelled')),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
```

#### `exam_halls`
Physical rooms where exam takes place.

```sql
CREATE TABLE exam_halls (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id      UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  hall_name    VARCHAR(100) NOT NULL,              -- "Hall A", "Room 201"
  capacity     INTEGER NOT NULL,
  invigilator_id UUID REFERENCES users(id),        -- assigned hall_invigilator
  session_id   UUID REFERENCES exam_sessions(id),  -- set when hall goes active
  created_at   TIMESTAMP DEFAULT NOW()
);
```

#### `exam_sessions`
Active invigilator session for one hall (replaces `attendance_sessions` for exams).

```sql
CREATE TABLE exam_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id           UUID NOT NULL REFERENCES exams(id),
  hall_id           UUID NOT NULL REFERENCES exam_halls(id),
  invigilator_id    UUID NOT NULL REFERENCES users(id),
  started_at        TIMESTAMP DEFAULT NOW(),
  ended_at          TIMESTAMP,
  status            VARCHAR(20) DEFAULT 'active'
                    CHECK (status IN ('active','completed','aborted')),
  total_students    INTEGER DEFAULT 0,
  verified_count    INTEGER DEFAULT 0,
  flagged_count     INTEGER DEFAULT 0,
  rejected_count    INTEGER DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMP DEFAULT NOW()
);
```

#### `exam_enrollments`
Which students are assigned to which hall + seat.

```sql
CREATE TABLE exam_enrollments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id      UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  hall_id      UUID NOT NULL REFERENCES exam_halls(id),
  student_id   UUID NOT NULL REFERENCES users(id),
  seat_number  VARCHAR(20),                        -- "A-12", "Row 3 Seat 5"
  roll_number  VARCHAR(50),                        -- from admit card
  enrolled_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(exam_id, student_id),
  UNIQUE(hall_id, seat_number)
);
```

#### `verification_events` ← Core table
Every face scan = one row. This is the audit backbone.

```sql
CREATE TABLE verification_events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_session_id  UUID NOT NULL REFERENCES exam_sessions(id),
  exam_id          UUID NOT NULL REFERENCES exams(id),
  student_id       UUID NOT NULL REFERENCES users(id),  -- expected student
  matched_user_id  UUID REFERENCES users(id),           -- who face actually matched
  scan_type        VARCHAR(20) NOT NULL
                   CHECK (scan_type IN ('entry','re_verify','manual','id_card')),
  confidence_score FLOAT,                               -- 0.0 – 1.0
  verdict          VARCHAR(20) NOT NULL
                   CHECK (verdict IN ('verified','flagged','rejected','no_match')),
  face_image_url   TEXT,                                -- snapshot at scan time
  id_card_image_url TEXT,                               -- rear cam capture if used
  id_card_number   VARCHAR(100),                        -- manually entered / OCR
  gps_latitude     FLOAT,
  gps_longitude    FLOAT,
  device_id        VARCHAR(100),                        -- which mobile device scanned
  scanned_by       UUID NOT NULL REFERENCES users(id),  -- invigilator
  scanned_at       TIMESTAMP DEFAULT NOW(),
  
  -- Human review fields (filled post-exam)
  reviewed_by      UUID REFERENCES users(id),
  review_decision  VARCHAR(20)
                   CHECK (review_decision IN ('confirmed_proxy','false_alarm','inconclusive')),
  review_note      TEXT,
  reviewed_at      TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_ve_exam_session ON verification_events(exam_session_id);
CREATE INDEX idx_ve_student      ON verification_events(student_id);
CREATE INDEX idx_ve_exam         ON verification_events(exam_id);
CREATE INDEX idx_ve_verdict      ON verification_events(verdict);
CREATE INDEX idx_ve_scanned_at   ON verification_events(scanned_at);
```

#### `exam_alerts`
Real-time alert queue consumed by Chief Examiner dashboard.

```sql
CREATE TABLE exam_alerts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id      UUID NOT NULL REFERENCES exams(id),
  hall_id      UUID REFERENCES exam_halls(id),
  event_id     UUID REFERENCES verification_events(id),
  alert_type   VARCHAR(30) NOT NULL
               CHECK (alert_type IN (
                 'proxy_suspect','low_confidence','no_show',
                 'repeated_failure','id_mismatch','invigilator_offline'
               )),
  severity     VARCHAR(10) DEFAULT 'medium'
               CHECK (severity IN ('low','medium','high','critical')),
  message      TEXT NOT NULL,
  is_resolved  BOOLEAN DEFAULT false,
  resolved_by  UUID REFERENCES users(id),
  resolved_at  TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);
```

### Modified Tables

#### `users` — Add new roles

```sql
-- Extend role check constraint
ALTER TABLE users
  DROP CONSTRAINT users_role_check,
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('super_admin','admin','chief_examiner','hall_invigilator',
                    'teacher','student'));
```

#### `institutions` (New — for multi-tenant)

```sql
CREATE TABLE institutions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(255) NOT NULL,
  code         VARCHAR(50) UNIQUE NOT NULL,
  contact_email VARCHAR(255),
  created_at   TIMESTAMP DEFAULT NOW()
);
-- Add institution_id to users, exams, classes
```

> **Decision Point:** Multi-tenant (institution_id) can be deferred to Phase 2 if targeting a single university first. Phase 1 can use the existing `admin` as institution admin.

---

## 6. New API Design

### Base prefix: `/api/v2` (version the new routes)

> Using `/api/v2` keeps existing attendance system on `/api/v1` intact. Both run simultaneously during transition.

### Exam Management (Admin / Chief Examiner)

```
POST   /api/v2/exams                         Create exam
GET    /api/v2/exams                         List exams (with filters)
GET    /api/v2/exams/:examId                 Get exam detail
PATCH  /api/v2/exams/:examId                 Update exam
DELETE /api/v2/exams/:examId                 Cancel exam

POST   /api/v2/exams/:examId/halls           Create hall
GET    /api/v2/exams/:examId/halls           List halls for exam
PATCH  /api/v2/exams/:examId/halls/:hallId   Update hall / assign invigilator

POST   /api/v2/exams/:examId/enrollments     Bulk enroll students (CSV upload)
GET    /api/v2/exams/:examId/enrollments     List enrolled students
DELETE /api/v2/exams/:examId/enrollments/:id Remove student from exam
```

### Exam Session (Hall Invigilator)

```
POST   /api/v2/exam-sessions/start           Start hall session (invigilator check-in)
PATCH  /api/v2/exam-sessions/:id/end         End hall session
GET    /api/v2/exam-sessions/:id             Get session + live stats
GET    /api/v2/exam-sessions/:id/students    List students + their verification status
```

### Verification Engine (Core)

```
POST   /api/v2/verify/entry                  Entry face scan + optional ID capture
POST   /api/v2/verify/re-check               Mid-exam re-verification scan
POST   /api/v2/verify/id-card                Capture ID card image (rear cam, no face)
GET    /api/v2/verify/events/:examSessionId  All events for a session
GET    /api/v2/verify/student/:studentId     All events for one student in one exam
```

**Entry verification request body:**
```json
{
  "exam_session_id": "uuid",
  "student_id": "uuid",          // expected student (from seat assignment)
  "face_image": "base64 | uri",
  "id_card_image": "base64 | uri",  // optional
  "id_card_number": "string",       // optional, manually typed
  "seat_number": "A-12",
  "gps": { "latitude": 0.0, "longitude": 0.0 }
}
```

**Verification response:**
```json
{
  "verdict": "verified | flagged | rejected | no_match",
  "confidence_score": 0.91,
  "student": { "id": "...", "name": "...", "photo_url": "..." },
  "matched_user": { "id": "...", "name": "..." },
  "event_id": "uuid",
  "alert_raised": false,
  "message": "Identity verified with high confidence"
}
```

### Alerts & Review (Chief Examiner)

```
GET    /api/v2/alerts?examId=&resolved=false    Live alert feed
PATCH  /api/v2/alerts/:id/resolve               Mark alert resolved

GET    /api/v2/exams/:id/flagged                All flagged events
PATCH  /api/v2/verify/events/:id/review         Submit human review decision
```

### Reporting

```
GET    /api/v2/reports/exam/:examId/summary     Overall exam verification stats
GET    /api/v2/reports/exam/:examId/compliance  Full compliance report (PDF/CSV)
GET    /api/v2/reports/exam/:examId/suspects    Only flagged/rejected events
GET    /api/v2/reports/student/:studentId/history  All exams history
```

### Socket.IO Events (Real-time)

```
Client → Server:
  join_exam_hall(hallId)
  join_exam_dashboard(examId)

Server → Client:
  verification_event(payload)    // new scan result
  alert_raised(alertPayload)     // new alert
  student_verified(studentId)    // green dot on dashboard
  student_flagged(studentId)     // orange dot on dashboard  
  hall_stats_update(stats)       // live counter update
```

---

## 7. Mobile App Changes

### New Screens Required

#### 7.1 Admin / Chief Examiner Screens

| Screen | Purpose |
|--------|---------|
| `ExamListScreen` | Browse exams, filter by status/date |
| `ExamDetailScreen` | View halls, enrolled students, live stats |
| `ExamCreateScreen` | Create exam with all params |
| `HallSetupScreen` | Assign invigilator, capacity, seat plan |
| `BulkEnrollScreen` | Upload CSV or search+add students to exam |
| `ChiefExaminerDashboard` | Live view of all halls: verified/flagged/no-show counts |
| `AlertFeedScreen` | Real-time alert list, tap to review |
| `FlaggedCasesScreen` | Review flagged events, enter decision |
| `ComplianceReportScreen` | Generate and export final report |

#### 7.2 Hall Invigilator Screens

| Screen | Purpose |
|--------|---------|
| `HallSessionScreen` | Start/end hall session, see who's arrived |
| `StudentLookupScreen` | Search student by name/roll number before scanning |
| `EntryVerificationScreen` | **Core scan screen** — face + ID capture at entry |
| `ReVerifyScreen` | Mid-exam scan at seat |
| `StudentListScreen` | List of students in hall, color-coded status |

#### 7.3 Modified Existing Screens

| Screen | Change |
|--------|--------|
| `LiveScanScreen` | Add **exam mode** flag: changes UI to show verdict, confidence %, and ID card button |
| `FaceEnrollmentScreen` | Add exam pre-enrollment flow triggered by invigilator |
| `AdminDashboardScreen` | Add exam-centric stats widget |

### Navigation Structure (New)

```
ExamNavigator (role: admin / chief_examiner)
├── ExamListScreen (tab: Exams)
├── ChiefExaminerDashboard (tab: Live)
├── AlertFeedScreen (tab: Alerts)
├── FlaggedCasesScreen (tab: Review)
└── ReportsScreen (tab: Reports)

InvigilatorNavigator (role: hall_invigilator)
├── HallSessionScreen (tab: My Hall)
├── EntryVerificationScreen (tab: Scan Entry)
├── StudentListScreen (tab: Students)
└── ReVerifyScreen (accessible from StudentListScreen)
```

### Entry Verification Screen — UI Design

This is the most critical screen. Here is the flow:

```
┌─────────────────────────────────────┐
│  [← Back]   ENTRY SCAN   [End Hall] │
│  Hall A · Computer Science Final    │
├─────────────────────────────────────┤
│                                     │
│         CAMERA VIEWFINDER           │
│       (front cam — face scan)       │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Expected: ALICE JOHNSON      │  │
│  │  Seat: A-12  Roll: 2023CS045  │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  [🔄 Flip to ID Card]               │
│  [📋 Search Student]                │
│                                     │
│  VERDICT: ✅ VERIFIED               │
│  Confidence: 91.3%                  │
│  Alice Johnson · 2023CS045          │
│                                     │
│  [  Mark Entry  ] [  Flag & Hold  ] │
└─────────────────────────────────────┘
```

**State machine for the scan:**

```
IDLE
  │ invigilator selects student from list / scans QR
  ▼
READY (student info shown)
  │ tap "Scan Face"
  ▼
SCANNING (camera active, face detected)
  │ auto-scan or manual tap
  ▼
PROCESSING (API call in flight)
  │
  ├─ confidence ≥ 0.85 → VERIFIED (green, auto-proceed)
  ├─ confidence 0.70–0.84 → FLAGGED (amber, request ID)
  └─ confidence < 0.70 → REJECTED (red, escalate)
```

---

## 8. Backend Changes

### New Service Layer

#### `examService.ts`
```typescript
createExam(data): Promise<Exam>
getExam(examId): Promise<ExamWithStats>
startHallSession(examId, hallId, invigilatorId): Promise<ExamSession>
endHallSession(sessionId): Promise<void>
enrollStudents(examId, hallId, studentList): Promise<void>
getHallStudents(sessionId): Promise<StudentVerificationStatus[]>
```

#### `verificationService.ts`
```typescript
verifyEntry(params: EntryVerifyParams): Promise<VerificationResult>
  // 1. Load expected student's face embedding
  // 2. Compute embedding from submitted image
  // 3. Cosine similarity check (threshold from exam config)
  // 4. If matched_user ≠ expected_student → PROXY suspect
  // 5. Write verification_event
  // 6. Trigger alert if needed
  // 7. Return verdict + confidence

reVerify(params): Promise<VerificationResult>
  // Same as entry but scan_type = 're_verify'

submitReviewDecision(eventId, decision, note, reviewerId): Promise<void>
```

#### `alertService.ts` (extend existing notification service)
```typescript
raiseAlert(type, examId, hallId, eventId, severity): Promise<void>
  // 1. Write to exam_alerts table
  // 2. Broadcast via Socket.IO to chief_examiner room
  // 3. Push notification if app is backgrounded

resolveAlert(alertId, resolvedBy): Promise<void>
getLiveAlerts(examId): Promise<Alert[]>
```

### Face Matching Logic Change

```typescript
// Current (attendance):
const MATCH_THRESHOLD = 0.75;    // lenient — same person different lighting

// Exam monitoring:
const VERIFY_THRESHOLD = 0.85;   // high confidence → VERIFIED
const FLAG_THRESHOLD   = 0.70;   // medium confidence → FLAGGED (human review)
// Below FLAG_THRESHOLD → REJECTED + immediate alert

// NEW: proxy detection
if (matchedStudent.id !== expectedStudent.id) {
  // Face matched someone BUT not the expected person
  verdict = 'proxy_suspect';
  severity = 'critical';
  // This is the most serious alert type
}
```

### Middleware Changes

```typescript
// New role middleware
export const requireExamRole = (roles: ExamRole[]) => middleware
// Roles: chief_examiner, hall_invigilator, admin

// New rate limiting for verification endpoint
// Higher limit since scans happen rapidly at entry (100 students in 20 mins)
const verificationRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,   // 200 scans per minute per IP
});
```

---

## 9. Feature Specifications

### F-01: Exam Creation & Setup

**Actor:** Admin / Chief Examiner  
**Trigger:** Planning phase, days before exam  

**Flow:**
1. Admin creates exam with title, code, scheduled times, duration, re-verify interval
2. Admin creates halls and sets capacity
3. Admin assigns one `hall_invigilator` per hall
4. Admin assigns `chief_examiner` to the overall exam
5. Admin uploads student enrollment list (CSV: name, email, roll_number, hall, seat)
6. System creates `exam_enrollment` records and sends enrollment emails to students

**Validation rules:**
- Exam code must be unique
- Hall capacity ≥ number of students assigned to it
- `scheduled_end` must be after `scheduled_start`
- Each student can appear in only one hall per exam

---

### F-02: Student Pre-Enrollment (Face)

**Actor:** Student (self) or Invigilator (assisted)  
**Trigger:** Before exam day  

**Decision point:** Do students enroll themselves or does institution do it?

- **Option A:** Students use existing `FaceEnrollmentScreen` in the app. They enroll before exam day via link/app invitation. Lower invigilator overhead.
- **Option B:** Invigilator enrolls students on exam day before hall opens. Higher overhead but institution controls the process.

**Recommendation:** Option A with Option B as fallback. If a student has no enrollment, invigilator can enroll them on-site before the exam starts.

**System behavior:** Enrollment is locked 1 hour before exam starts. No new enrollments accepted after lock time.

---

### F-03: Entry Verification (Face Scan at Door)

**Actor:** Hall Invigilator  
**Trigger:** Student arrives at hall door  

**Step-by-step:**
1. Invigilator opens `EntryVerificationScreen`
2. Selects expected student (from hall list or QR scan of admit card)
3. Student stands in front of camera — face scan triggers
4. System compares face against enrolled embedding
5. Verdict displayed immediately:
   - **VERIFIED (≥0.85):** Green screen, name/photo shown, tap "Mark Entry" → logged
   - **FLAGGED (0.70–0.84):** Amber screen — invigilator switches to rear cam, captures physical ID card, enters ID number manually → logged with ID
   - **REJECTED (<0.70) or NO_MATCH:** Red screen — alert raised to Chief Examiner, student held at door
6. All outcomes write a `verification_event` record

**Critical rule:** Even VERIFIED students generate a verification_event. The complete log must exist for all students regardless of verdict.

---

### F-04: ID Card Capture (Rear Camera)

**Actor:** Hall Invigilator  
**Trigger:** Flagged verification or random spot-check  

**Flow:**
1. Tap "Flip to ID Card" button on scan screen
2. Rear camera activates, UI shows framing guide for card
3. Invigilator positions physical ID card in frame
4. Tap capture → image saved to `id_card_image_url` in `verification_events`
5. Invigilator manually types ID card number → stored in `id_card_number`
6. Event updated with both image and number
7. Chief Examiner can compare face photo vs ID card photo in review screen

**Phase 2 enhancement:** OCR library reads card number automatically, eliminating manual entry.

---

### F-05: Periodic Re-Verification (Mid-Exam Scans)

**Actor:** Hall Invigilator (prompted by app)  
**Trigger:** Timer — configurable per exam (default every 30 mins)  

**Flow:**
1. App timer fires → notification/alert: "Re-verification due. 12 students to re-check"
2. App shows prioritized re-verify list:
   - Students who were FLAGGED at entry (highest priority)
   - Random subset of VERIFIED students (anti-spoofing)
3. Invigilator walks to seat, taps student name → scan at their seat
4. If result differs from entry scan → immediate alert to Chief Examiner
5. Re-verify event logged as `scan_type = 're_verify'`

**Configurable:** Admin can set `re_verify_interval_mins = 0` to disable periodic re-checks entirely (for short 1-hour exams).

---

### F-06: Chief Examiner Live Dashboard

**Actor:** Chief Examiner  
**Updates:** Real-time via Socket.IO  

**Dashboard panels:**

```
┌────────────────────────────────────────────────────────┐
│  Computer Science Final 2026                          │
│  Started: 09:00 AM  │  Duration: 3hrs  │  10:23 elapsed│
├────────────────────────────────────────────────────────┤
│  HALL A            │ HALL B            │ HALL C        │
│  ✅ 42 verified    │ ✅ 38 verified    │ ✅ 31 verified │
│  ⚠️  3 flagged     │ ⚠️  1 flagged     │ ⚠️  0 flagged  │
│  ❌  0 rejected    │ ❌  1 rejected    │ ❌  0 rejected  │
│  👻  2 no-show     │ 👻  0 no-show     │ 👻  4 no-show  │
├────────────────────────────────────────────────────────┤
│  🔔 ACTIVE ALERTS (2)                                  │
│  🔴 CRITICAL: Hall B — Seat B-07 — Proxy suspected     │
│  🟠 MEDIUM: Hall A — Seat A-19 — Low confidence (71%) │
└────────────────────────────────────────────────────────┘
```

---

### F-07: Flagged Case Review

**Actor:** Chief Examiner  
**Trigger:** Post-exam or during exam for critical cases  

**For each flagged event, reviewer sees:**
- Student's enrolled face photo (from enrollment)
- Face photo captured at scan time
- ID card image (if captured)
- Confidence score
- Timestamp, hall, seat
- Scan type (entry / re-verify)

**Reviewer selects verdict:**
- `confirmed_proxy` — different person; escalate to examination board
- `false_alarm` — same person, environmental issue (poor lighting, glasses)
- `inconclusive` — cannot determine; requires further investigation

**Each decision is immutable once saved.** Review audit trail is part of the compliance report.

---

### F-08: Compliance Report Export

**Format:** PDF (primary) + CSV (raw data)  

**Report contents:**
1. Exam header (title, code, date, institution)
2. Summary statistics (total enrolled, total verified, flagged, rejected, no-shows)
3. Per-student verification log (all events, with confidence scores)
4. Flagged cases section (with photos and review decisions)
5. Chain of custody: who conducted each scan, on which device, at what GPS coordinate
6. Digital signature / report hash for tamper evidence (Phase 2)

**This report is the deliverable presented to the examination board or regulatory body.**

---

## 10. Implementation Phases (Roadmap)

### Phase 1 — Core Verification (MVP)
**Goal:** System usable for a real exam. End-to-end: entry scan → verdict → report.  
**Estimated duration:** 6–8 weeks (2 developers)

| # | Task | Owner | Week |
|---|------|-------|------|
| 1.1 | DB migrations: exams, halls, enrollments, verification_events, alerts | Backend | W1 |
| 1.2 | Exam CRUD API (`/api/v2/exams`) | Backend | W1 |
| 1.3 | Student enrollment API + bulk CSV import | Backend | W2 |
| 1.4 | `verificationService.verifyEntry()` with proxy detection | Backend | W2–3 |
| 1.5 | Entry verification API endpoint | Backend | W3 |
| 1.6 | Alert creation + Socket.IO broadcast | Backend | W3 |
| 1.7 | `ExamListScreen` + `ExamDetailScreen` (mobile) | Mobile | W2 |
| 1.8 | `EntryVerificationScreen` (mobile) — core scan screen | Mobile | W3–4 |
| 1.9 | ID card rear camera capture (mobile) | Mobile | W4 |
| 1.10 | `StudentListScreen` with live status (mobile) | Mobile | W4 |
| 1.11 | `ChiefExaminerDashboard` with real-time Socket.IO (mobile) | Mobile | W5 |
| 1.12 | Alert feed screen (mobile) | Mobile | W5 |
| 1.13 | Basic compliance CSV export | Backend | W6 |
| 1.14 | End-to-end integration testing | Both | W7 |
| 1.15 | UAT with real exam scenario (dry run) | Both | W8 |

**Phase 1 deliverable:** System can run one exam hall, scan students at entry, flag suspects, and export a basic report.

---

### Phase 2 — Full Multi-Hall + Review Workflow
**Goal:** Scale to multiple halls, add human review workflow, PDF report.  
**Estimated duration:** 4–5 weeks

| # | Task |
|---|------|
| 2.1 | Multi-hall management + per-hall invigilator assignment |
| 2.2 | Periodic re-verification timer + re-scan flow |
| 2.3 | `FlaggedCasesScreen` with photo comparison (mobile) |
| 2.4 | Review decision API + audit trail |
| 2.5 | PDF compliance report generation (using `pdfkit` or similar) |
| 2.6 | Bulk enrollment via CSV upload with validation |
| 2.7 | Push notifications for background alerts |
| 2.8 | Offline scan queue (critical for poor hall connectivity) |

---

### Phase 3 — Advanced Features & Commercial Readiness
**Goal:** Production-grade for institutional sale.  
**Estimated duration:** 6–8 weeks

| # | Task |
|---|------|
| 3.1 | Multi-tenant (institution_id isolation) |
| 3.2 | OCR on ID card (auto-read card number) |
| 3.3 | Liveness detection (prevent photo spoofing) |
| 3.4 | Seating chart visual map |
| 3.5 | University SIS API integration (import student roster) |
| 3.6 | Report digital signature (tamper-evident hash) |
| 3.7 | Batch exam scheduling |
| 3.8 | Analytics: institution-level fraud trends |

---

## 11. Security Considerations

### Face Data Handling
- Face embeddings are stored as float vectors, NOT as images — they cannot be reversed to reconstruct a face. This satisfies GDPR/DPDP "data minimisation" requirements.
- Scan images (`face_image_url`) are retained only during the exam + review period. Auto-delete policy: 30 days post-exam unless flagged.
- All S3/storage paths must be private (signed URLs only, no public access).

### Exam Integrity
- `verification_events` rows are **insert-only** — no UPDATE on the core event columns. Review fields are the only updatable columns.
- `reviewed_at` and `reviewed_by` are set once and cannot be changed again (DB trigger).
- The `exam_code` is generated server-side; client cannot choose it.

### API Security
- All `/api/v2/verify/*` endpoints require the request device to have an active `exam_session_id` that is in `status = 'active'`
- A device that is not the assigned invigilator cannot submit scans for that hall
- Rate limiting on verify endpoints: 200 requests/minute (handles bulk entry)
- IP allowlist option for on-premises deployments

### Offline Mode
- Scan results cached locally (encrypted SQLite) if network is unavailable
- Sync happens automatically when connectivity is restored
- **Conflict rule:** If the same student was scanned offline on two devices, the earlier timestamp wins

### Audit Trail
- Every API call to verification endpoints logs: user, device, IP, timestamp, payload hash
- Alerts are immutable once created; only `is_resolved` can be changed
- All DB changes use `updated_at` triggers (already in schema)

---

## 12. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Poor lighting in exam hall degrades face match accuracy | High | High | Calibration checklist; invigilator training; fallback to ID card |
| Student wears glasses/mask not present during enrollment | Medium | High | Mandatory enrollment without eyewear; re-enroll option |
| Backend API unavailable during exam | Low | Critical | Offline scan queue; local verdict caching on device |
| False proxy detection creates dispute | Medium | High | Human review workflow; photo evidence stored; appeal process |
| Student refuses to be scanned | Low | Medium | Existing examination rules must mandate participation |
| High-volume entry (100 students in 20 mins = 1 scan every 12 secs) | Certain | Medium | Entry scan queue on mobile; async API; performance tested |
| Face enrollment not done before exam | Medium | High | Reminder workflow; enrollment deadline enforcement |
| Data privacy regulatory challenge | Low | High | Embeddings-only storage (no face images kept long-term); consent form |

---

## 13. Testing Strategy

### Unit Tests (Backend)
- `verificationService` — threshold logic, proxy detection, alert triggering
- `examService` — enrollment validation, seat conflict detection
- Extend existing `attendance.controller.test.ts` pattern

### Integration Tests
- Full entry verification flow: enroll student → start session → submit scan → verify verdict + DB record
- Proxy detection: enroll student A, submit student B's face → expect `proxy_suspect` verdict
- Alert propagation: low confidence scan → verify alert created → Socket.IO event fired

### End-to-End (Exam Day Simulation)
1. Create exam with 2 halls, 10 students each
2. Enroll all students' faces
3. Start hall sessions on two devices simultaneously
4. Scan all students — mix of verified, flagged, rejected
5. Check Chief Examiner dashboard receives real-time updates
6. Submit review decisions for flagged cases
7. Export compliance report, verify all events present

### Load Test
- 100 simultaneous entry scans (exam hall rush scenario)
- Verify p95 API response < 3 seconds
- Verify no duplicate verification_events created (idempotency)

---

## 14. Timeline & Effort Estimate

### Phase 1 (MVP — core entry verification)

| Resource | Hours |
|----------|-------|
| Backend developer | ~120 hrs (6 weeks × 20 hrs) |
| Mobile developer | ~120 hrs (6 weeks × 20 hrs) |
| Testing / QA | ~40 hrs |
| **Total Phase 1** | **~280 hrs** |

### Phase 2 (Full workflow)

| Resource | Hours |
|----------|-------|
| Backend developer | ~80 hrs |
| Mobile developer | ~80 hrs |
| Testing / QA | ~30 hrs |
| **Total Phase 2** | **~190 hrs** |

### Total MVP to Production-Ready

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1 | 6–8 weeks | ~280 hrs |
| Phase 2 | 4–5 weeks | ~190 hrs |
| Phase 3 | 6–8 weeks | ~200 hrs |
| **Total** | **16–21 weeks** | **~670 hrs** |

---

## 15. Open Decisions for Review

Before execution begins, the following decisions need confirmation:

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| D-01 | Route versioning strategy | `/api/v2` parallel OR migrate existing routes | `/api/v2` parallel — safest, no regression |
| D-02 | Multi-tenant (Phase 1 or Phase 3?) | Include from start OR single-tenant MVP first | Single-tenant MVP first — faster to ship |
| D-03 | Face threshold for exam | 0.80, 0.85, or 0.90 | Start at 0.85; tune after first dry run |
| D-04 | Image retention policy | 30 days / 90 days / indefinite | 90 days post-exam for dispute window |
| D-05 | PDF compliance report | Build in-house (pdfkit) or third-party service | `pdfkit` — no external dependency |
| D-06 | Student enrollment trigger | Student self-service OR institution bulk-upload | Both options; bulk-upload required for Phase 1 |
| D-07 | Offline-first architecture | Full offline OR online-required with graceful degradation | Full offline for Phase 1 (exam hall reliability) |
| D-08 | Target platform for Phase 1 | Android only, iOS only, or both | Android only for Phase 1 (EAS preview build faster) |

---

## Summary

This plan converts the existing attendance system into a purpose-built exam monitoring platform with minimal wasted effort. Approximately 60% of the backend and 50% of the mobile code is reused. The new core is the `verification_events` table + `verificationService` which implement the stricter, auditable identity verification logic required for examination contexts.

**Phase 1 is achievable in 6–8 weeks and delivers a fully usable system for a single-university pilot.**

The biggest risks are operational (lighting, enrollment compliance, student cooperation) rather than technical. The technical architecture handles all edge cases through the flagging + human review workflow.

---

*Document prepared for review. Please confirm open decisions in Section 15 before execution begins.*
