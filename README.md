# FaceAttend — Face Recognition Attendance System

A production-ready, cross-platform mobile attendance system for schools and colleges. Teachers mark attendance automatically by scanning the classroom with their phone camera — the system detects and identifies students using face recognition in real time.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Prerequisites](#3-prerequisites)
4. [Project Structure](#4-project-structure)
5. [Backend Setup & Configuration](#5-backend-setup--configuration)
6. [Mobile App Setup & Configuration](#6-mobile-app-setup--configuration)
7. [Running the Application](#7-running-the-application)
8. [Running with Docker](#8-running-with-docker)
9. [API Reference](#9-api-reference)
10. [Face Recognition Flow](#10-face-recognition-flow)
11. [User Roles & Default Credentials](#11-user-roles--default-credentials)
12. [Environment Variables Reference](#12-environment-variables-reference)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. System Overview

| Layer | Technology |
|---|---|
| Mobile App | React Native (Expo) + TypeScript |
| State Management | Redux Toolkit |
| Backend API | Node.js + Express + TypeScript |
| Database | PostgreSQL 15 |
| Cache / Sessions | Redis 7 |
| File Storage | Local disk (served via Express static) |
| Real-time | Socket.IO |
| Face Detection (mobile) | expo-face-detector |
| Face Matching (backend) | Cosine similarity on stored embeddings |
| Authentication | JWT (access 15 min + refresh 7 days) |

---

## 2. Architecture

```
┌─────────────────────────────────┐
│     React Native Mobile App     │
│   (Expo, iOS / Android)         │
│                                 │
│  Student  │ Teacher │  Admin    │
│  Screens  │ Screens │  Screens  │
└─────────────────┬───────────────┘
                  │ HTTPS / REST API
                  │ WebSocket (Socket.IO)
                  ▼
┌─────────────────────────────────┐
│     Node.js + Express Backend   │
│           Port 3000             │
│                                 │
│  Auth API  │  Face API  │  ...  │
│  Attendance│  Reports   │  ...  │
│                                 │
│  /uploads  (local file storage) │
└────┬──────────────┬─────────────┘
     │              │
     ▼              ▼
┌─────────┐   ┌──────────┐
│PostgreSQL│   │  Redis   │
│  Port   │   │  Port    │
│  5432   │   │  6379    │
└─────────┘   └──────────┘
```

---

## 3. Prerequisites

Install the following tools before getting started:

### Required

| Tool | Version | Download |
|---|---|---|
| Node.js | >= 20.x LTS | https://nodejs.org |
| npm | >= 10.x | Bundled with Node.js |
| PostgreSQL | >= 15.x | https://www.postgresql.org/download |
| Redis | >= 7.x | https://redis.io/docs/install |
| Expo CLI | Latest | `npm install -g expo-cli` |

### Mobile Development (choose your target platform)

**For Android:**
- Android Studio with Android SDK (API Level 33+)
- Android emulator OR a physical Android device
- Enable "USB Debugging" on physical device

**For iOS (macOS only):**
- Xcode 15+ from the Mac App Store
- iOS Simulator OR a physical iPhone (requires Apple Developer account for device)

**Expo Go (easiest — no emulator needed):**
- Install [Expo Go](https://expo.dev/client) on your physical Android or iOS device
- Connect phone and laptop to the same Wi-Fi network

### Optional (for Docker setup)

| Tool | Version |
|---|---|
| Docker | >= 24.x |
| Docker Compose | >= 2.x |

---

## 4. Project Structure

```
face_recognization_attendance_system/
├── README.md
├── plan.md
│
├── backend/                          # Node.js + Express API
│   ├── .env.example                  # Copy to .env and fill in values
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── uploads/                      # Auto-created — local file storage
│   │   ├── photos/                   # User profile photos
│   │   ├── faces/                    # Face enrollment images
│   │   └── attendance/               # Attendance proof images
│   └── src/
│       ├── server.ts                 # Entry point — HTTP + Socket.IO
│       ├── app.ts                    # Express app setup
│       ├── config/
│       │   ├── database.ts           # PostgreSQL pool
│       │   ├── redis.ts              # Redis client
│       │   └── env.ts                # Env variable validation
│       ├── types/index.ts            # Shared TypeScript types
│       ├── middleware/
│       │   ├── auth.middleware.ts    # JWT verification
│       │   ├── role.middleware.ts    # Role-based access control
│       │   ├── upload.middleware.ts  # Multer local disk config
│       │   ├── validate.middleware.ts
│       │   └── error.middleware.ts   # Global error handler
│       ├── services/
│       │   ├── auth.service.ts       # Login, register, tokens, OTP
│       │   ├── face.service.ts       # Embedding storage + comparison
│       │   ├── attendance.service.ts # Session + record management
│       │   ├── storage.service.ts    # Local file save/delete
│       │   └── notification.service.ts
│       ├── controllers/              # Request handlers
│       ├── routes/                   # Route definitions
│       ├── sockets/
│       │   └── attendance.socket.ts  # Socket.IO event handlers
│       └── migrations/
│           ├── 001_init.sql          # Full DB schema
│           └── migrate.ts            # Migration runner
│
└── mobile/                           # Expo React Native App
    ├── App.tsx                       # Root component
    ├── app.json                      # Expo config
    ├── package.json
    ├── tsconfig.json
    ├── babel.config.js
    └── src/
        ├── types/index.ts
        ├── constants/
        │   ├── colors.ts             # Design system colors
        │   └── theme.ts              # react-native-paper theme
        ├── api/
        │   ├── client.ts             # Axios instance + interceptors
        │   ├── auth.api.ts
        │   ├── face.api.ts
        │   ├── attendance.api.ts
        │   └── user.api.ts
        ├── store/                    # Redux Toolkit
        │   ├── index.ts
        │   └── slices/
        │       ├── auth.slice.ts
        │       ├── attendance.slice.ts
        │       └── ui.slice.ts
        ├── navigation/
        │   ├── AppNavigator.tsx      # Root — auth check + role routing
        │   ├── AuthNavigator.tsx
        │   ├── StudentNavigator.tsx
        │   ├── TeacherNavigator.tsx
        │   └── AdminNavigator.tsx
        ├── screens/
        │   ├── auth/                 # Login, ForgotPassword, OTP
        │   ├── student/              # Dashboard, History, Enrollment, Profile
        │   ├── teacher/              # Dashboard, StartSession, LiveScan, Review
        │   └── admin/               # Analytics, StudentMgmt, TeacherMgmt, Reports
        ├── components/
        │   ├── common/               # Button, Input, Card, Avatar, Badge
        │   └── camera/               # FaceOverlay, ScanResultOverlay
        ├── services/
        │   ├── face-recognition.service.ts  # expo-face-detector wrapper
        │   ├── offline.service.ts           # SQLite offline cache + sync
        │   └── socket.service.ts            # Socket.IO client
        ├── hooks/
        │   ├── useAuth.ts
        │   ├── useCamera.ts
        │   └── useLocation.ts
        └── utils/
            ├── storage.ts            # expo-secure-store token management
            ├── permissions.ts        # Camera/location/notification permissions
            └── helpers.ts            # Date formatting, color helpers, etc.
```

---

## 5. Backend Setup & Configuration

### Step 1 — Set up PostgreSQL

**Option A — Neon (already configured):**
The project uses [Neon](https://neon.tech) serverless PostgreSQL. The connection string is already set in `.env` — no local PostgreSQL installation needed. Neon enforces SSL on all connections, which the backend handles automatically.

**Option B — Local PostgreSQL (alternative):**

```bash
# macOS (Homebrew)
brew install postgresql@15 && brew services start postgresql@15

# Ubuntu / Debian
sudo apt install postgresql-15 && sudo systemctl start postgresql
```

Create the database and user:

```bash
psql -U postgres -c "CREATE DATABASE attendance_db;"
psql -U postgres -c "CREATE USER attendance_user WITH PASSWORD 'StrongPassword123';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE attendance_db TO attendance_user;"
```

Then update `DATABASE_URL` in `.env` to:
```
DATABASE_URL=postgresql://attendance_user:StrongPassword123@localhost:5432/attendance_db
```

### Step 2 — Install Redis

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu / Debian
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Windows — use WSL2 or download from:
# https://github.com/microsoftsoft/redis/releases
```

Verify Redis is running:

```bash
redis-cli ping
# Expected output: PONG
```

### Step 3 — Install backend dependencies

```bash
cd backend
npm install
```

### Step 4 — Configure environment variables

```bash
# Copy the example env file
cp .env.example .env
```

Open `.env` and fill in your values:

```env
NODE_ENV=development
PORT=3000

# PostgreSQL — use the credentials from Step 1
DATABASE_URL=postgresql://attendance_user:StrongPassword123@localhost:5432/attendance_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secrets — generate strong random strings (minimum 32 characters)
# You can generate them with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_ACCESS_SECRET=replace_with_64_char_random_hex_string
JWT_REFRESH_SECRET=replace_with_different_64_char_random_hex_string

JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Local file storage path (relative to backend/ directory)
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# CORS — URL of your frontend / mobile dev server
FRONTEND_URL=http://localhost:8081

# Face recognition matching threshold (0.0 - 1.0)
# 0.75 = require 75% similarity to count as a match
FACE_SIMILARITY_THRESHOLD=0.75

# AES encryption key — exactly 32 characters
ENCRYPTION_KEY=replace_with_exactly_32_char_key_!

BCRYPT_SALT_ROUNDS=12
LOG_LEVEL=info
LOG_DIR=./logs
```

**Generate secure secrets easily:**

```bash
# Run in terminal to get a random JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run this twice — use the first output for `JWT_ACCESS_SECRET` and the second for `JWT_REFRESH_SECRET`.

### Step 5 — Run database migrations

This creates all tables, indexes, and seeds the default super-admin account:

```bash
npm run migrate
```

Expected output:
```
✅ Migration 001_init.sql completed successfully
✅ Default super admin created: admin@school.com
```

### Step 6 — Start the backend server

```bash
# Development mode (auto-restarts on file changes)
npm run dev

# Production mode (compile first, then run)
npm run build
npm start
```

The API will be available at: **http://localhost:3000**

Health check:

```bash
curl http://localhost:3000/api/health
# Expected: { "status": "ok", "timestamp": "..." }
```

---

## 6. Mobile App Setup & Configuration

### Step 1 — Install Expo CLI globally

```bash
npm install -g expo-cli eas-cli
```

### Step 2 — Install mobile app dependencies

```bash
cd mobile
npm install
```

### Step 3 — Configure the API base URL

Open `src/api/client.ts` and update the `BASE_URL` to point to your backend:

```typescript
// For physical device on the same network — use your machine's local IP
const BASE_URL = 'http://192.168.1.100:3000/api';

// For Android emulator (emulator reaches host at 10.0.2.2)
const BASE_URL = 'http://10.0.2.2:3000/api';

// For iOS Simulator (simulator reaches host at localhost)
const BASE_URL = 'http://localhost:3000/api';
```

**Finding your machine's local IP:**

```bash
# macOS / Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig | findstr "IPv4"
```

### Step 4 — Configure Socket.IO URL

Open `src/services/socket.service.ts` and update the socket URL to match the same host as your API.

### Step 5 — Configure app permissions (already in app.json)

The `app.json` already includes the required permissions:
- Camera — for face detection during enrollment and attendance scanning
- Location — for geo-tagging attendance records
- Notifications — for attendance alerts

### Step 6 — Start the Expo development server

```bash
cd mobile
npm start
# OR
expo start
```

This opens the **Expo Developer Tools** in your browser. You will see a QR code.

---

## 7. Running the Application

### Option A — Expo Go on Physical Device (Recommended for quick start)

1. Install **Expo Go** from the App Store (iOS) or Google Play (Android)
2. Make sure your phone and computer are on the **same Wi-Fi network**
3. Run `npm start` inside the `mobile/` directory
4. Scan the QR code shown in the terminal with:
   - iOS: use the Camera app
   - Android: use the Expo Go app's QR scanner

### Option B — Android Emulator

1. Open Android Studio → AVD Manager → Create a virtual device (Pixel 7, API 33+)
2. Start the emulator
3. Run:

```bash
cd mobile
npm run android
# OR
expo start --android
```

### Option C — iOS Simulator (macOS only)

1. Open Xcode → Preferences → Components → Install an iOS simulator
2. Run:

```bash
cd mobile
npm run ios
# OR
expo start --ios
```

### Option D — Run everything together (backend + mobile)

Open two terminal windows:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 — Mobile:**
```bash
cd mobile
npm start
```

---

## 8. Running with Docker

Use Docker Compose to run the backend, PostgreSQL, and Redis together with one command.

### Step 1 — Build and start all services

```bash
cd backend
docker-compose up --build
```

This starts:
- **app** — Node.js backend on port 3000
- **postgres** — PostgreSQL on port 5432
- **redis** — Redis on port 6379

### Step 2 — Run migrations inside the container

```bash
docker-compose exec app npm run migrate
```

### Step 3 — Stop all services

```bash
docker-compose down

# To also delete the database volume (full reset):
docker-compose down -v
```

### Docker environment

The default Docker credentials (from `docker-compose.yml`):

| Service | Host | Port | User | Password | Database |
|---|---|---|---|---|---|
| PostgreSQL | localhost | 5432 | postgres | password | attendance_db |
| Redis | localhost | 6379 | — | — | — |

> **For production:** Change the default passwords in `docker-compose.yml` and use Docker secrets or a proper secret manager.

---

## 9. API Reference

All endpoints are prefixed with `/api`. Protected endpoints require the `Authorization: Bearer <access_token>` header.

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | No | Login with email + password |
| POST | `/auth/register` | Admin | Register a new user |
| POST | `/auth/refresh-token` | No | Get new access token using refresh token |
| POST | `/auth/logout` | Yes | Invalidate refresh token |
| POST | `/auth/forgot-password` | No | Send OTP to email |
| POST | `/auth/reset-password` | No | Reset password with OTP |
| GET | `/auth/me` | Yes | Get current user profile |

### Face Recognition

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/face/register` | Yes | Enroll face (multipart: image + embedding) |
| GET | `/face/:userId/status` | Yes | Check enrollment status |
| POST | `/face/verify` | Yes | Verify a face embedding |
| DELETE | `/face/:userId` | Admin | Delete all face data for a user |
| POST | `/face/liveness-check` | Yes | Submit liveness verification result |

### Attendance

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/attendance/sessions/start` | Teacher | Start an attendance session |
| POST | `/attendance/sessions/:id/end` | Teacher | End a session |
| GET | `/attendance/sessions/:id` | Teacher | Get session details + records |
| POST | `/attendance/scan` | Teacher | Submit face embedding — returns matched student |
| POST | `/attendance/mark` | Teacher | Manually mark a student |
| GET | `/attendance/history` | Student | Get own attendance history |
| PUT | `/attendance/:id` | Teacher | Override an attendance record |
| GET | `/attendance/summary/:studentId` | Teacher+ | Get student attendance summary |

### Classes & Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/classes` | Yes | List all classes |
| POST | `/classes` | Admin | Create a class |
| GET | `/classes/:id/students` | Teacher+ | List enrolled students |
| POST | `/classes/:id/students` | Admin | Enroll a student in a class |
| GET | `/users` | Admin | List users (paginated, filterable) |
| PUT | `/users/:id` | Admin | Update user details |
| POST | `/users/:id/photo` | Yes | Upload profile photo |

### Reports

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/reports/daily` | Teacher+ | Daily attendance report |
| GET | `/reports/monthly` | Teacher+ | Monthly attendance report |
| GET | `/reports/student/:id` | Teacher+ | Student-specific report |
| GET | `/reports/defaulters` | Teacher+ | Students below attendance threshold |
| GET | `/reports/analytics/overview` | Admin | Dashboard statistics |
| GET | `/reports/export/csv` | Admin | Export data as CSV |

---

## 10. Face Recognition Flow

### Student Face Enrollment (done once per student)

```
Student opens Enrollment Screen
         │
         ▼
Camera activates with oval face guide
         │
         ▼
expo-face-detector detects face in frame
         │  ← real-time detection loop
         ▼
Face quality validated (size, angle, not blurry)
         │
         ▼
Auto-capture triggered (5 photos, different angles)
Landmark coordinates extracted per capture
         │
         ▼
Each image + landmark embedding sent to backend
POST /api/face/register (multipart)
         │
         ▼
Backend stores:
  • Face image file  → backend/uploads/faces/
  • Embedding vector → face_embeddings table (float8[])
         │
         ▼
Enrollment complete ✓
```

### Attendance Marking (teacher scans classroom)

```
Teacher starts session → POST /api/attendance/sessions/start
         │
         ▼
LiveScan screen opens full-screen camera
         │
         ▼ ← continuous frame analysis loop
expo-face-detector detects face bounding boxes
         │
         ▼
For each detected face (debounced — max 1 call/5s per face region):
  • Capture image frame
  • Extract face region + landmarks
  • Build 128-float embedding from landmarks
         │
         ▼
POST /api/attendance/scan
  { sessionId, embedding: number[] }
         │
         ▼
Backend face.service:
  1. Load all embeddings for students in this class
  2. Compute cosine similarity against each
  3. Return best match if similarity > 0.75
         │
         ▼
Result overlaid on camera:
  ✅ "John Doe — 94% confidence" → Mark PRESENT
  ❌ "Unknown face"              → No action
         │
         ▼
POST /api/attendance/mark → attendance_records table
Socket.IO event → all connected clients see live update
```

---

## 11. User Roles & Default Credentials

### All Roles

| Role | Mobile Navigator | Capabilities |
|---|---|---|
| `super_admin` | Admin tabs | Full system access — manage everything |
| `admin` | Admin tabs | Manage students, teachers, classes, exams, reports |
| `chief_examiner` | Exam tabs (5 tabs) | Create exams, live monitoring dashboard, alert review, flag cases |
| `hall_invigilator` | Invigilator tabs (3 tabs) | Manage assigned hall, scan students at entry, re-verify |
| `teacher` | Teacher tabs | Start attendance sessions, live face scan, reports |
| `student` | Student tabs | Enroll face, view own attendance, submit leave requests |

---

### All Test Accounts (after running `npm run migrate`)

> All seeded accounts use password: **`password123`**  
> Super Admin uses password: **`Admin@123`**

#### System Accounts

| Role | Name | Email | Password | Notes |
|---|---|---|---|---|
| `super_admin` | Super Admin | `admin@school.com` | `Admin@123` | Created by `001_init.sql` — change on first login |
| `admin` | Test Admin | `admin@test.com` | `password123` | Created by `002_seed_test_users.sql` |
| `teacher` | Test Teacher | `teacher@test.com` | `password123` | Assigned to CS-A and IT-B classes |
| `student` | Test Student | `student@test.com` | `password123` | Enrolled in Hall B (Seat B-03) of CS-FINAL-2026 |

#### Exam Monitoring Accounts (created by `005_seed_exam_data.sql`)

| Role | Name | Email | Password | Assignment |
|---|---|---|---|---|
| `chief_examiner` | Chief Examiner | `chief@exam.com` | `password123` | Oversees CS-FINAL-2026 |
| `hall_invigilator` | Hall Invigilator A | `invig.a@exam.com` | `password123` | Hall A — Main Block, Ground Floor |
| `hall_invigilator` | Hall Invigilator B | `invig.b@exam.com` | `password123` | Hall B — Main Block, First Floor |
| `student` | Alice Johnson | `alice@student.com` | `password123` | Hall A, Seat A-01 |
| `student` | Bob Smith | `bob@student.com` | `password123` | Hall A, Seat A-02 |
| `student` | Carol White | `carol@student.com` | `password123` | Hall A, Seat A-03 |
| `student` | David Brown | `david@student.com` | `password123` | Hall B, Seat B-01 |
| `student` | Eva Green | `eva@student.com` | `password123` | Hall B, Seat B-02 |

#### Quick Login Reference for Mobile App Testing

```
── Attendance System ─────────────────────────────────────
Admin panel:        admin@school.com    / Admin@123
Teacher dashboard:  teacher@test.com    / password123
Student view:       student@test.com    / password123

── Exam Monitoring ───────────────────────────────────────
Chief Examiner:     chief@exam.com      / password123
Invigilator (A):    invig.a@exam.com    / password123
Invigilator (B):    invig.b@exam.com    / password123
Exam student:       alice@student.com   / password123
```

#### Seeded Exam: CS-FINAL-2026

| Field | Value |
|---|---|
| Title | Computer Science Final Examination 2026 |
| Exam Code | `CS-FINAL-2026` |
| Date | 2026-06-15, 09:00 – 12:00 (3 hours) |
| Status | `scheduled` (start via ExamDetail screen) |
| Face Threshold | 0.85 (verified) |
| Flag Threshold | 0.70 (flagged → manual review) |
| Hall A | 3 students: Alice, Bob, Carol (Invigilator A) |
| Hall B | 3 students: David, Eva, Test Student (Invigilator B) |

> **Note:** Students must enroll their face via the Face ID tab before  
> verification will work. Use `POST /api/face/register` with a face image.

---

### Creating Additional Users

After logging in as admin, use the Register API:

```bash
curl -X POST http://localhost:3030/api/auth/register \
  -H "Authorization: Bearer <your_access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Teacher",
    "email": "newteacher@school.com",
    "password": "SecurePass123",
    "role": "teacher"
  }'
```

Valid roles: `super_admin`, `admin`, `chief_examiner`, `hall_invigilator`, `teacher`, `student`

---

## 12. Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `development` | `development` or `production` |
| `PORT` | No | `3000` | HTTP server port |
| `DATABASE_URL` | Yes | — | Full PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection URL |
| `JWT_ACCESS_SECRET` | Yes | — | Secret for signing access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | — | Secret for signing refresh tokens (min 32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token TTL |
| `UPLOAD_DIR` | No | `./uploads` | Local file storage root directory |
| `MAX_FILE_SIZE` | No | `10485760` | Max upload size in bytes (default: 10 MB) |
| `FRONTEND_URL` | Yes | — | Allowed CORS origin (mobile app URL) |
| `FACE_SIMILARITY_THRESHOLD` | No | `0.75` | Min cosine similarity to count as face match |
| `ENCRYPTION_KEY` | Yes | — | AES-256 key — must be exactly 32 characters |
| `BCRYPT_SALT_ROUNDS` | No | `12` | bcrypt cost factor |
| `LOG_LEVEL` | No | `info` | `error`, `warn`, `info`, `debug` |
| `LOG_DIR` | No | `./logs` | Log file output directory |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Rate limit window (15 min in ms) |
| `RATE_LIMIT_MAX` | No | `100` | Max requests per window (general) |
| `AUTH_RATE_LIMIT_MAX` | No | `10` | Max requests per window (auth endpoints) |

### Mobile (`mobile/src/api/client.ts`)

These are hardcoded constants (not a `.env` file since Expo managed workflow doesn't support `.env` natively without extra config):

| Constant | Location | Description |
|---|---|---|
| `BASE_URL` | `src/api/client.ts` | Backend API base URL |
| Socket URL | `src/services/socket.service.ts` | Socket.IO server URL |

---

## 13. Troubleshooting

### Backend won't start — "Cannot connect to database"

```bash
# Verify PostgreSQL is running
pg_isready -h localhost -p 5432

# Check your DATABASE_URL in .env matches the actual credentials
psql postgresql://attendance_user:StrongPassword123@localhost:5432/attendance_db -c "\l"
```

### Backend won't start — "Redis connection refused"

```bash
# Check Redis is running
redis-cli ping   # Expected: PONG

# If not running:
# macOS:  brew services start redis
# Linux:  sudo systemctl start redis-server
```

### Migration fails — "permission denied"

```bash
# Grant all permissions to your database user
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE attendance_db TO attendance_user;"
psql -U postgres -d attendance_db -c "GRANT ALL ON SCHEMA public TO attendance_user;"
```

### Mobile app can't reach the backend

1. Confirm backend is running: `curl http://localhost:3000/api/health`
2. If using Expo Go on a physical device, use your machine's **local network IP** (not `localhost`)
3. Ensure your firewall allows connections on port 3000
4. Android emulator: use `http://10.0.2.2:3000/api` (emulator's alias for host machine)

### Camera not working in Expo Go

Expo Go supports `expo-camera` on physical devices. Simulators/emulators have limited camera support. Test face features on a real device.

### Face enrollment fails — "No face detected"

- Ensure lighting is adequate (not too dark, no harsh backlight)
- Hold device 40–70 cm from face
- Face should occupy at least 40% of the oval guide area
- Remove sunglasses or heavy accessories

### TypeScript errors in mobile tsconfig.json

If you see `File 'expo/tsconfig.base' not found`, it means `node_modules` haven't been installed yet. Run:

```bash
cd mobile && npm install
```

The error disappears once the `expo` package is installed.

### JWT token expired errors

Access tokens expire after 15 minutes by design. The mobile app auto-refreshes them using the stored refresh token. If you see persistent auth errors, clear the app's secure storage and log in again.

### Uploads directory not created

The backend creates upload directories on startup. If they're missing:

```bash
mkdir -p backend/uploads/photos backend/uploads/faces backend/uploads/attendance backend/logs
```

---

## Development Quick Reference

```bash
# ── Backend ──────────────────────────────────────────────
cd backend
npm install              # Install dependencies
cp .env.example .env     # Configure environment
npm run migrate          # Create DB tables + seed admin
npm run dev              # Start dev server (port 3000)
npm run build            # Compile TypeScript
npm start                # Run compiled production build
npm run typecheck        # Check types without building

# ── Mobile ───────────────────────────────────────────────
cd mobile
npm install              # Install dependencies
npm start                # Start Expo dev server
npm run android          # Open on Android emulator
npm run ios              # Open on iOS simulator (macOS only)

# ── Docker (backend + DB + Redis) ────────────────────────
cd backend
docker-compose up --build                # Start everything
docker-compose exec app npm run migrate  # Run migrations
docker-compose down                      # Stop
docker-compose down -v                   # Stop + delete DB data
```
