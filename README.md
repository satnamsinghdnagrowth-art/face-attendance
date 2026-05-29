# ExamGuard — Exam Monitoring & Face Verification System

A production-ready, cross-platform mobile platform for secure exam hall management. Hall invigilators verify student entry using face recognition. Chief examiners monitor all halls in real time, receive instant fraud alerts, and review flagged cases. The system also supports traditional face-based classroom attendance for teachers.

**Live backend:** `https://face-attendance-9kza.onrender.com`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Prerequisites](#3-prerequisites)
4. [Project Structure](#4-project-structure)
5. [Backend Setup](#5-backend-setup)
6. [Mobile App Setup](#6-mobile-app-setup)
7. [Running the Application](#7-running-the-application)
8. [Docker](#8-docker)
9. [API Reference](#9-api-reference)
10. [Verification Flow](#10-verification-flow)
11. [User Roles & Credentials](#11-user-roles--credentials)
12. [Environment Variables](#12-environment-variables)
13. [EAS Build (Android / iOS)](#13-eas-build-android--ios)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. System Overview

| Layer | Technology |
|---|---|
| Mobile App | React Native (Expo SDK 51) + TypeScript |
| State Management | Redux Toolkit + socket middleware |
| Backend API | Node.js 20 + Express + TypeScript |
| Database | PostgreSQL 15 (Neon / Render PostgreSQL) |
| Cache / Token Blacklist | Redis 7 (Upstash — optional, degrades gracefully) |
| File Storage | Cloudinary (production) / local disk (dev) |
| Real-time | Socket.IO (exam rooms + hall rooms) |
| Face Embedding (backend) | `sharp` — pixel-based 128-dim embedding via centre-crop + grayscale |
| Face Matching | Cosine similarity on stored `float8[]` embeddings |
| Authentication | JWT — access 15 min + refresh 7 days |
| Deployment | Render.com (backend Docker) + EAS (mobile builds) |
| CI Tests | Jest — 223 tests, all passing |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────┐
│               React Native Mobile App                │
│       (Expo, iOS / Android — EAS build)              │
│                                                      │
│  Student │ Teacher │ Admin │ Chief │ Invigilator      │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS REST  (/api  + /api/v2/)
                       │ WebSocket   (Socket.IO)
                       ▼
┌──────────────────────────────────────────────────────┐
│          Node.js + Express Backend  (port 3000)      │
│                                                      │
│  /api/auth      /api/face       /api/attendance      │
│  /api/v2/exams  /api/v2/verify  /api/v2/reports      │
│                                                      │
│  Socket.IO rooms:                                    │
│    exam:{examId}         — chief examiner            │
│    exam_hall:{hallId}    — hall invigilator          │
│    user:{userId}         — personal notifications   │
└────┬───────────────────────────┬─────────────────────┘
     │                           │
     ▼                           ▼
┌──────────┐               ┌──────────┐
│PostgreSQL│               │  Redis   │
│ (Neon /  │               │(Upstash) │
│  Render) │               │optional  │
└──────────┘               └──────────┘
```

**Redis is optional.** When Redis is unavailable the backend runs in degraded mode — token blacklisting and session caching are skipped but all core features (auth, verification, attendance) continue working via the database.

---

## 3. Prerequisites

### Required

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 LTS | https://nodejs.org |
| npm | ≥ 10 | bundled with Node.js |
| PostgreSQL | ≥ 15 | https://www.postgresql.org/download |
| Expo CLI | latest | `npm i -g expo-cli` |
| EAS CLI | latest | `npm i -g eas-cli` |

### Mobile targets

**Android:** Android Studio + Android SDK (API 33+). USB Debugging on physical device.

**iOS (macOS only):** Xcode 15+ + iOS Simulator or physical device (Apple Developer account required for device builds).

**Expo Go (fastest start):** Install [Expo Go](https://expo.dev/client) on your phone and scan the QR code. Phone and laptop must be on the same Wi-Fi.

### Optional (Docker)

| Tool | Version |
|---|---|
| Docker | ≥ 24 |
| Docker Compose | ≥ 2 |

---

## 4. Project Structure

```
face_recognization_attendance_system/
├── README.md
├── TECHNICAL_PROGRESS.md
│
├── backend/                               # Node.js + Express API
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile                         # Auto-runs migrations then starts server
│   ├── docker-compose.yml
│   ├── render.yaml                        # Render.com deploy config
│   └── src/
│       ├── server.ts                      # HTTP + Socket.IO entry point
│       ├── app.ts                         # Express app setup
│       ├── config/
│       │   ├── database.ts                # PostgreSQL pool
│       │   ├── redis.ts                   # Redis with graceful degradation
│       │   └── env.ts                     # Validated environment variables
│       ├── middleware/
│       │   ├── auth.middleware.ts         # JWT verify (safeGet for blacklist)
│       │   ├── role.middleware.ts         # Role-based access (requireRole)
│       │   ├── upload.middleware.ts       # Multer memory storage
│       │   ├── validate.middleware.ts     # express-validator runner
│       │   └── error.middleware.ts        # Global error handler
│       ├── utils/
│       │   ├── face.utils.ts              # computeImageEmbedding (sharp), cosine similarity
│       │   ├── uuid.validator.ts          # PostgreSQL-compatible UUID regex (replaces isUUID())
│       │   ├── encryption.ts              # bcrypt, AES, token helpers
│       │   ├── response.ts                # Standardised API response helpers
│       │   └── logger.ts                  # Winston logger
│       ├── services/
│       │   ├── auth.service.ts            # Login, register, OTP, token refresh
│       │   ├── face.service.ts            # Embedding storage + comparison
│       │   ├── verification.service.ts    # Exam entry verification + verdict logic
│       │   ├── exam.service.ts            # Exam / hall / session / enrolment CRUD
│       │   ├── exam.alert.service.ts      # Alert raise / resolve / auto-raise
│       │   ├── attendance.service.ts      # Class session + attendance records
│       │   ├── notification.service.ts    # Socket.IO broadcast helpers
│       │   ├── storage.service.ts         # Cloudinary / local file save
│       │   ├── pdf.service.ts             # pdfkit compliance report
│       │   ├── liveness.service.ts        # Liveness stub (plug in Vision / Rekognition)
│       │   ├── ocr.service.ts             # ID-card OCR stub
│       │   └── sis.integration.service.ts # University SIS webhook
│       ├── controllers/                   # Request handlers per domain
│       ├── routes/                        # Route definitions
│       ├── sockets/
│       │   └── attendance.socket.ts       # Socket.IO auth (safeGet) + event handlers
│       └── migrations/
│           ├── 001_init.sql               # Schema + super admin seed
│           ├── 002_seed_test_users.sql    # Test users
│           ├── 003_seed_classes.sql       # Classes + subjects
│           ├── 004_exam_monitoring.sql    # Exam tables + role extension
│           ├── 005_seed_exam_data.sql     # Exam accounts + CS-FINAL-2026
│           ├── 006_multi_tenant.sql       # Institutions table (multi-tenancy)
│           ├── 007_fix_admin_password.sql # Admin@123 hash correction
│           └── migrate.ts                 # Idempotent migration runner
│
└── mobile/                                # Expo React Native app
    ├── App.tsx                            # Root — Provider, ErrorBoundary, Navigator
    ├── app.json                           # Expo config (slug: face-attend)
    ├── eas.json                           # EAS build profiles
    ├── package.json
    └── src/
        ├── api/
        │   ├── client.ts                  # Axios + token interceptor + socket sync on refresh
        │   ├── auth.api.ts
        │   ├── exam.api.ts                # Full v2 exam + verify API
        │   ├── face.api.ts
        │   ├── attendance.api.ts
        │   └── user.api.ts
        ├── store/
        │   ├── index.ts                   # Store + socketMiddleware
        │   └── slices/
        │       ├── auth.slice.ts          # Auth state (socket lifecycle in middleware)
        │       ├── exam.slice.ts          # Exam / session / verification state
        │       ├── attendance.slice.ts
        │       └── ui.slice.ts
        ├── middleware/
        │   └── socketMiddleware.ts        # Socket connect/disconnect on auth events
        ├── navigation/
        │   ├── AppNavigator.tsx           # Role-based root navigator
        │   ├── AuthNavigator.tsx
        │   ├── AdminNavigator.tsx
        │   ├── TeacherNavigator.tsx
        │   ├── StudentNavigator.tsx
        │   ├── ExamNavigator.tsx          # Chief examiner (5 tabs)
        │   └── InvigilatorNavigator.tsx   # Hall invigilator (3 tabs)
        ├── screens/
        │   ├── auth/                      # Login, ForgotPassword, OTP
        │   ├── admin/                     # User mgmt, analytics, reports
        │   ├── teacher/                   # Dashboard, StartSession, LiveScan
        │   ├── student/                   # Dashboard, History, Enrolment, Profile
        │   └── exam/
        │       ├── InvigilatorHomeScreen.tsx
        │       ├── HallSessionScreen.tsx
        │       ├── StudentListScreen.tsx  # Real-time socket verdicts
        │       ├── EntryVerificationScreen.tsx
        │       ├── ChiefExaminerDashboard.tsx
        │       ├── ExamDetailScreen.tsx
        │       ├── FlaggedCasesScreen.tsx
        │       ├── ComplianceReportScreen.tsx
        │       └── ...
        ├── services/
        │   ├── socket.service.ts          # Auth-aware reconnect, exam rooms
        │   └── face-recognition.service.ts
        ├── hooks/
        │   ├── useAuth.ts
        │   ├── useCamera.ts
        │   ├── useReVerifyTimer.ts        # Re-verification countdown
        │   └── usePushNotifications.ts
        └── components/
            ├── common/                    # Button, Input, ErrorBoundary
            └── camera/                    # FaceOverlay, ScanResultOverlay
```

---

## 5. Backend Setup

### Step 1 — Database

**Cloud (recommended):** Create a free [Neon](https://neon.tech) or [Render PostgreSQL](https://render.com) database and copy the connection string.

**Local:**

```bash
psql -U postgres -c "CREATE DATABASE attendance_db;"
psql -U postgres -c "CREATE USER attendance_user WITH PASSWORD 'StrongPassword123';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE attendance_db TO attendance_user;"
```

### Step 2 — Redis (optional)

The backend starts and runs without Redis. When Redis is unavailable it logs a single warning and continues in degraded mode (no token blacklisting, no session cache).

```bash
# macOS
brew install redis && brew services start redis

# Ubuntu
sudo apt install redis-server && sudo systemctl start redis-server
```

### Step 3 — Install dependencies

```bash
cd backend
npm install
```

### Step 4 — Configure environment

```bash
cp .env.example .env
```

Edit `.env` — minimum required fields:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://attendance_user:StrongPassword123@localhost:5432/attendance_db
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=<64-char hex>
JWT_REFRESH_SECRET=<different 64-char hex>
FRONTEND_URL=http://localhost:8081
ENCRYPTION_KEY=<exactly 32 characters>
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 5 — Run migrations

```bash
npm run migrate
```

This applies all SQL files in `src/migrations/` in filename order, skipping any already recorded in the `schema_migrations` table. Idempotent — safe to run repeatedly.

```
[APPLY] 001_init.sql ...         [OK]
[APPLY] 002_seed_test_users.sql  [OK]
[APPLY] 003_seed_classes.sql     [OK]
[APPLY] 004_exam_monitoring.sql  [OK]
[APPLY] 005_seed_exam_data.sql   [OK]
[APPLY] 006_multi_tenant.sql     [OK]
[APPLY] 007_fix_admin_password.sql [OK]
Migration complete. Applied 7 migration(s).
```

### Step 6 — Start the server

```bash
# Development (ts-node-dev, auto-restart)
npm run dev

# Production
npm run build && npm start
```

Health check:

```bash
curl http://localhost:3000/api/health
# { "status": "ok", "timestamp": "..." }
```

---

## 6. Mobile App Setup

### Step 1 — Install dependencies

```bash
cd mobile
npm install
```

### Step 2 — API URL

Open `src/api/client.ts` and set `API_BASE_URL`:

```typescript
// Production (Render.com)
export const API_BASE_URL = 'https://face-attendance-9kza.onrender.com/api';

// Local — physical device (same Wi-Fi)
export const API_BASE_URL = 'http://192.168.x.x:3000/api';

// Local — Android emulator
export const API_BASE_URL = 'http://10.0.2.2:3000/api';
```

The Socket.IO URL in `src/services/socket.service.ts` must match the same host (without `/api`).

### Step 3 — Start Expo dev server

```bash
npm start
```

Scan the QR code in Expo Go or press `a` for Android emulator / `i` for iOS simulator.

---

## 7. Running the Application

### Option A — Expo Go on physical device (quickest)

1. Install **Expo Go** (App Store / Google Play)
2. Same Wi-Fi as your dev machine
3. `cd mobile && npm start` → scan QR

### Option B — Android emulator

```bash
cd mobile && npm run android
```

### Option C — iOS simulator (macOS only)

```bash
cd mobile && npm run ios
```

### Option D — Full stack locally

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd mobile && npm start
```

---

## 8. Docker

```bash
cd backend

# Build and start backend + PostgreSQL + Redis
docker-compose up --build

# Migrations run automatically when the container starts.
# To run manually inside a running container:
docker-compose exec app node dist/migrations/migrate.js

# Stop
docker-compose down

# Stop + delete DB data
docker-compose down -v
```

The Dockerfile `CMD` runs migrations then starts the server:

```
node dist/migrations/migrate.js && node dist/server.js
```

This means every Render.com deploy automatically applies any pending migrations before traffic is served.

**Docker defaults:**

| Service | Port | User | Password | DB |
|---|---|---|---|---|
| PostgreSQL | 5432 | postgres | password | attendance_db |
| Redis | 6379 | — | — | — |
| Backend | 3000 | — | — | — |

---

## 9. API Reference

All endpoints require `Authorization: Bearer <access_token>` unless marked **public**.

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | public | Email + password → tokens |
| POST | `/auth/register` | admin+ | Create a new user |
| POST | `/auth/refresh-token` | public | Rotate access + refresh tokens |
| POST | `/auth/logout` | yes | Invalidate refresh token |
| POST | `/auth/forgot-password` | public | Send OTP to email |
| POST | `/auth/reset-password` | public | Reset password with OTP |
| GET | `/auth/me` | yes | Current user profile |

### Face — `/api/face`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/face/register` | yes | Enroll face (multipart: image + optional embedding) |
| GET | `/face/:userId/status` | yes | Face enrolment status |
| POST | `/face/verify` | yes | Verify face embedding |
| DELETE | `/face/:userId` | admin+ | Delete all face data |

### Attendance (Teacher flow) — `/api/attendance`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/attendance/sessions/start` | teacher+ | Start attendance session |
| POST | `/attendance/sessions/:id/end` | teacher+ | End session |
| GET | `/attendance/sessions/:id` | teacher+ | Session details + records |
| POST | `/attendance/scan` | teacher+ | Submit face → returns match |
| POST | `/attendance/mark` | teacher+ | Manual mark |
| GET | `/attendance/history` | student | Own attendance history |
| PUT | `/attendance/:id` | teacher+ | Override record |

### Exams — `/api/v2/exams`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/v2/exams` | admin+ | Create exam |
| GET | `/v2/exams` | any | List exams (filter by status) |
| GET | `/v2/exams/:examId` | any | Exam detail + halls |
| PATCH | `/v2/exams/:examId` | admin+ | Update exam |
| PATCH | `/v2/exams/:examId/status` | chief+ | Transition status |
| GET | `/v2/exams/:examId/stats` | any | Verified / flagged / rejected counts |
| GET | `/v2/exams/:examId/alerts` | any | Active alerts |
| POST | `/v2/exams/:examId/halls` | admin+ | Add hall |
| GET | `/v2/exams/:examId/halls` | any | List halls |
| POST | `/v2/exams/:examId/halls/:hallId/enroll` | admin+ | Enrol students (JSON) |
| POST | `/v2/exams/:examId/halls/:hallId/enroll/csv` | admin+ | Enrol students (CSV upload) |
| POST | `/v2/exams/:examId/halls/:hallId/session/start` | invigilator+ | Open hall session |
| POST | `/v2/exams/sessions/:sessionId/end` | invigilator+ | Close hall session |
| GET | `/v2/exams/sessions/:sessionId/students` | any | Students + latest verdict |
| PATCH | `/v2/exams/alerts/:alertId/resolve` | chief+ | Resolve alert |
| PATCH | `/v2/exams/events/:eventId/review` | chief+ | Review flagged event |

### Verification — `/api/v2/verify`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/v2/verify/entry` | invigilator+ | Entry scan — returns verdict |
| POST | `/v2/verify/re-check` | invigilator+ | Re-verification scan |
| GET | `/v2/verify/events/:sessionId` | any | All events for a session |
| GET | `/v2/verify/student/:studentId/exam/:examId` | any | Student history for an exam |

### Reports — `/api/reports`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/reports/daily` | teacher+ | Daily report |
| GET | `/reports/monthly` | teacher+ | Monthly report |
| GET | `/reports/student/:id` | teacher+ | Per-student report |
| GET | `/reports/defaulters` | teacher+ | Below-threshold students |
| GET | `/reports/analytics/overview` | admin+ | Dashboard stats |
| GET | `/v2/exams/:examId/export` | chief+ | Compliance PDF or CSV |

### CSV enrolment format

```csv
student_email,seat_number,roll_number
alice@student.com,A-01,2023CS001
bob@student.com,A-02,2023CS002
```

`student_email` or `student_id` is required; `seat_number` and `roll_number` are optional.

### Exam status transitions

```
scheduled ──► active ──► completed
    │              │
    └──────────────┴──► cancelled
```

Invalid transitions (e.g. `completed → active`) return `409 Conflict`.

---

## 10. Verification Flow

### Entry scan (invigilator taps student → Scan to Verify)

```
Invigilator opens Hall Session → taps "Students"
         │
         ▼
Selects student from list (shows pending / flagged / verified badge)
         │
         ▼
EntryVerificationScreen opens camera (front-facing)
         │
         ▼
Invigilator taps "Scan to Verify"
  → takePictureAsync (quality 0.7, no base64)
         │
         ▼
POST /api/v2/verify/entry (multipart)
  face_image    — JPEG from camera
  exam_session_id — active session UUID
  student_id    — selected student UUID
  scan_type     — "entry"
         │
         ▼
Backend: computeImageEmbedding(file.buffer)  ← sharp centre-crop 16×8 grayscale
  → cosine similarity vs stored embeddings
  → verdict:
      verified     (≥ face_threshold 0.85)
      flagged      (≥ flag_threshold 0.70)
      rejected     (< 0.70)
      proxy_suspect (face matches different enrolled student)
      no_match      (student has no registered face)
         │
         ▼
Result overlaid on camera (2.6 s animated banner)
  ✅ VERIFIED  — green
  ⚠️ FLAGGED   — amber + "Capture ID Card" prompt
  ❌ REJECTED  — red
  👤 PROXY SUSPECTED — red + alert escalated to chief examiner
  ❓ NO FACE DATA — grey + contact admin
         │
         ▼
Socket.IO broadcast → StudentListScreen updates live
                    → ChiefExaminerDashboard receives alert if flagged/proxy
```

### Face enrolment (student, done once)

```
Student opens Face Enrolment screen
  → Camera activates
  → Photos captured
  → POST /api/face/register (multipart: image)
  → Backend: computeImageEmbedding → stored in face_embeddings (float8[])
```

---

## 11. User Roles & Credentials

### Roles

| Role | Navigator | Capabilities |
|---|---|---|
| `super_admin` | Admin (5 tabs) | Full system access |
| `admin` | Admin (5 tabs) | Users, classes, exams, reports |
| `chief_examiner` | Exam (5 tabs) | Create exams, live dashboard, alert review, compliance report |
| `hall_invigilator` | Invigilator (3 tabs) | Open hall session, scan entry, re-verify |
| `teacher` | Teacher (4 tabs) | Attendance sessions, live scan, reports |
| `student` | Student (4 tabs) | Enrol face, attendance history, leave requests |

### All test accounts (after `npm run migrate`)

| # | Role | Email | Password | Assignment |
|---|---|---|---|---|
| 1 | `super_admin` | `admin@school.com` | `Admin@123` | Full access |
| 2 | `admin` | `admin@test.com` | `password123` | Full access |
| 3 | `teacher` | `teacher@test.com` | `password123` | CS-A and IT-B |
| 4 | `student` | `student@test.com` | `password123` | Hall B · Seat B-03 |
| 5 | `chief_examiner` | `chief@exam.com` | `password123` | CS-FINAL-2026 |
| 6 | `hall_invigilator` | `invig.a@exam.com` | `password123` | Hall A · Ground Floor |
| 7 | `hall_invigilator` | `invig.b@exam.com` | `password123` | Hall B · First Floor |
| 8 | `student` | `alice@student.com` | `password123` | Hall A · Seat A-01 |
| 9 | `student` | `bob@student.com` | `password123` | Hall A · Seat A-02 |
| 10 | `student` | `carol@student.com` | `password123` | Hall A · Seat A-03 |
| 11 | `student` | `david@student.com` | `password123` | Hall B · Seat B-01 |
| 12 | `student` | `eva@student.com` | `password123` | Hall B · Seat B-02 |

> **Note:** Students must enrol their face via the Face ID tab before entry verification will produce a meaningful verdict.

### Quick login reference

```
── Admin / System ────────────────────────────────────
Super Admin:       admin@school.com    / Admin@123
Admin:             admin@test.com      / password123
Teacher:           teacher@test.com    / password123
Student:           student@test.com    / password123

── Exam Monitoring ───────────────────────────────────
Chief Examiner:    chief@exam.com      / password123
Invigilator A:     invig.a@exam.com    / password123
Invigilator B:     invig.b@exam.com    / password123
Exam student:      alice@student.com   / password123
```

### Seeded exam: CS-FINAL-2026

| Field | Value |
|---|---|
| Exam Code | `CS-FINAL-2026` |
| Title | Computer Science Final Examination 2026 |
| Date | 2026-06-15 · 09:00 – 12:00 (180 min) |
| Status | `scheduled` (activate via ExamDetail → Start Exam) |
| Face threshold | 0.85 → verified |
| Flag threshold | 0.70 → flagged |
| Hall A | Alice, Bob, Carol (Invigilator A) |
| Hall B | David, Eva, Test Student (Invigilator B) |

### Creating additional users

```bash
curl -X POST https://face-attendance-9kza.onrender.com/api/auth/register \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Invigilator",
    "email": "new@exam.com",
    "password": "SecurePass@123",
    "role": "hall_invigilator"
  }'
```

Valid roles: `super_admin` `admin` `chief_examiner` `hall_invigilator` `teacher` `student`

---

## 12. Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | yes | `development` | `development` or `production` |
| `PORT` | no | `3000` | HTTP port |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `REDIS_URL` | no | — | Redis URL — app runs without it |
| `JWT_ACCESS_SECRET` | yes | — | Min 32 chars |
| `JWT_REFRESH_SECRET` | yes | — | Min 32 chars, different from access |
| `JWT_ACCESS_EXPIRES_IN` | no | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | no | `7d` | Refresh token TTL |
| `FRONTEND_URL` | yes | — | CORS origin (comma-separated for multiple) |
| `ENCRYPTION_KEY` | yes | — | Exactly 32 characters |
| `BCRYPT_SALT_ROUNDS` | no | `12` | bcrypt cost factor |
| `FACE_SIMILARITY_THRESHOLD` | no | `0.75` | Min cosine similarity for face match |
| `UPLOAD_DIR` | no | `./uploads` | Local file storage root |
| `MAX_FILE_SIZE` | no | `10485760` | Upload limit in bytes (10 MB) |
| `CLOUDINARY_CLOUD_NAME` | no | — | Cloudinary upload (falls back to local) |
| `CLOUDINARY_API_KEY` | no | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | no | — | Cloudinary API secret |
| `LOG_LEVEL` | no | `info` | `error` `warn` `info` `debug` |
| `RATE_LIMIT_MAX` | no | `100` | Max requests per 15-min window |
| `AUTH_RATE_LIMIT_MAX` | no | `10` | Max auth requests per 15-min window |

### Mobile (`mobile/src/api/client.ts`)

The mobile app does not use a `.env` file. Configuration is in source:

| Constant | File | Description |
|---|---|---|
| `API_BASE_URL` | `src/api/client.ts` | Backend REST API base URL |
| `SOCKET_URL` | `src/services/socket.service.ts` | Socket.IO server URL |

---

## 13. EAS Build (Android / iOS)

The mobile app uses [Expo Application Services](https://expo.dev/eas) for cloud builds.

**EAS project:** `face-attend` (slug in `app.json` must match)
**Project ID:** `6eccf9b2-305f-467a-9819-39df98ea0d8b`

### Login to EAS

```bash
eas login
```

### Build profiles (`eas.json`)

| Profile | Distribution | Use case |
|---|---|---|
| `development` | internal | Dev client with hot reload |
| `preview` | internal | APK for internal testers (no store submission) |
| `production` | store | Play Store / App Store submission |

### Build commands

```bash
cd mobile

# Android APK (preview — share directly)
eas build -p android --profile preview

# Android AAB (production — Play Store)
eas build -p android --profile production

# iOS (production — App Store)
eas build -p ios --profile production

# Reconfigure EAS (if slug/projectId mismatch)
eas build:configure
```

### App identifiers

| Platform | Identifier |
|---|---|
| Android package | `com.examguard.secure` |
| iOS bundle ID | `com.examguard.secure` |
| App version | `2.0.0` |

---

## 14. Troubleshooting

### Backend won't connect to database

```bash
pg_isready -h localhost -p 5432
# Check DATABASE_URL in .env
```

### Redis connection refused at startup

This is non-fatal. The backend logs a single warning and continues without Redis. If you need Redis:

```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis-server

redis-cli ping   # Expected: PONG
```

### Migrations fail — permission denied

```bash
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE attendance_db TO attendance_user;"
psql -U postgres -d attendance_db -c "GRANT ALL ON SCHEMA public TO attendance_user;"
```

### Admin login fails (`admin@school.com`)

The correct password is `Admin@123`. Migration `007_fix_admin_password.sql` ensures the correct bcrypt hash is in the database. If you're running locally, re-run migrations:

```bash
cd backend && npm run migrate
```

### Socket "Authentication failed" warning in mobile logs

This warning fires when the backend's Redis is temporarily unavailable during socket handshake. The socket service will wait up to 6 seconds for a REST token refresh, then reconnect automatically. The fix (using `safeGet` instead of direct `redisClient.get`) is in `backend/src/sockets/attendance.socket.ts` — Redis unavailability no longer blocks socket authentication.

### `student_id must be a valid UUID` (400 on scan)

validator.js v13 enforces RFC 4122 variant bits — test-fixture UUIDs like `44444444-4444-4444-4444-444444444444` fail its check even though PostgreSQL stores them fine. The backend now uses a PostgreSQL-compatible UUID regex (`backend/src/utils/uuid.validator.ts`) that accepts any 8-4-4-4-12 hex UUID. Ensure the latest backend is deployed.

### EAS build — slug mismatch error

```
Slug for project identified by "extra.eas.projectId" (face-attend) does not match
the "slug" field (examguard).
```

Ensure `app.json` has `"slug": "face-attend"`. The EAS project was registered under `face-attend`; the display name ("ExamGuard") is independent.

### Mobile can't reach backend

1. Verify backend: `curl http://localhost:3000/api/health`
2. Physical device: use your machine's LAN IP (`ifconfig` / `ipconfig`), not `localhost`
3. Android emulator: use `http://10.0.2.2:3000/api`
4. Check firewall allows port 3000

### Camera not working in Expo Go

`expo-camera` requires a physical device for face capture. Emulators and simulators have no real camera — test verification on a real device.

### "No face detected" during enrolment

- Good lighting, no harsh backlight
- Hold device 40–70 cm from face
- Face should fill the oval guide (≥ 40% of frame)
- Remove sunglasses or face coverings

### JWT expired errors

Access tokens expire after 15 minutes. The Axios interceptor auto-refreshes them transparently. If you still see auth errors, clear Secure Storage and log in again.

---

## Development Quick Reference

```bash
# ── Backend ──────────────────────────────────────────────
cd backend
npm install              # Install dependencies
cp .env.example .env     # Configure environment
npm run migrate          # Create tables + seed all accounts
npm run dev              # Dev server (port 3000, auto-restart)
npm run build            # Compile TypeScript → dist/
npm start                # Run compiled production build
npm test                 # Run 223 Jest tests
npm run typecheck        # Type-check without building

# ── Mobile ───────────────────────────────────────────────
cd mobile
npm install              # Install dependencies
npm start                # Expo dev server
npm run android          # Android emulator
npm run ios              # iOS simulator (macOS only)

# ── EAS Cloud Builds ─────────────────────────────────────
cd mobile
eas login                        # Log in to Expo account
eas build -p android --profile preview     # Internal APK
eas build -p android --profile production  # Play Store AAB
eas build -p ios --profile production      # App Store IPA

# ── Docker (backend + DB + Redis) ────────────────────────
cd backend
docker-compose up --build        # Build and start all services
docker-compose down              # Stop
docker-compose down -v           # Stop + delete all data
```
