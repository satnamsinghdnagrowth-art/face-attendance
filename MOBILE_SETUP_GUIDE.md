# Mobile App Setup Guide — FaceAttend

## Quick Overview

This is an **Expo (React Native)** app. You run it on your phone using the **Expo Go** app — no USB, no build required. Your phone and computer must be on the **same Wi-Fi network**.

---

## Step 1 — Install Expo Go on Your Phone

| Platform | Link |
|----------|------|
| Android  | Play Store → search **"Expo Go"** → install |
| iPhone   | App Store → search **"Expo Go"** → install |

---

## Step 2 — Verify Your Machine's IP Address

Your current machine IP is: **`192.168.29.85`**

To re-check it anytime, run in terminal:
```bash
ip addr show | grep "inet " | grep -v "127.0.0.1"
```
Look for the `192.168.x.x` address on your Wi-Fi/ethernet interface.

If the IP has changed, update **two files**:

**`mobile/app.json`** — lines 68–69:
```json
"extra": {
  "apiUrl": "http://YOUR_NEW_IP:3000",
  "socketUrl": "http://YOUR_NEW_IP:3000"
}
```

**`backend/.env`** — FRONTEND_URL line:
```
FRONTEND_URL=http://YOUR_NEW_IP:8081
```

---

## Step 3 — Start the Backend Server

Open a terminal and run:
```bash
cd /home/hello/Test/face_recognization_attendance_system/backend
npm run dev
```

You should see output like:
```
Server running on port 3000
Database connected
```

**Keep this terminal open.**

To verify the backend is reachable from your phone's browser, open:
```
http://192.168.29.85:3000/health
```
You should get a JSON response. If not, see Troubleshooting below.

---

## Step 4 — Start the Expo (Mobile) Dev Server

Open a **second terminal** and run:
```bash
cd /home/hello/Test/face_recognization_attendance_system/mobile
npx expo start
```

Wait for the QR code to appear in the terminal. It looks like:

```
Metro waiting on exp://192.168.29.85:8081
  ▄▄▄▄▄▄▄▄▄▄▄
  █ ▄▄▄▄▄ █▀█
  █ █   █ █▀▀
  ...
```

**Keep this terminal open too.**

---

## Step 5 — Connect Your Phone

### Android
1. Open **Expo Go** app
2. Tap **"Scan QR code"**
3. Point your camera at the QR code in the terminal
4. The app will load on your phone

### iPhone
1. Open the default **Camera** app (not Expo Go)
2. Point at the QR code — a banner appears at the top
3. Tap the banner → it opens in Expo Go automatically

---

## Step 6 — Grant Permissions When Prompted

The app will ask for these permissions on first launch — **allow all of them**:

- **Camera** — required for face recognition
- **Location** — required for venue-based attendance verification
- **Photo Library** — required for uploading profile photo

---

## Common Problems & Fixes

### Problem: QR code scans but app shows "Network request failed" or can't connect

**Cause:** Your phone can't reach the backend at `192.168.29.85:3000`.

**Fix checklist:**
1. Confirm phone and computer are on the **same Wi-Fi network** (not one on 5GHz and other on 2.4GHz hotspot — both must be same router)
2. Check backend is running (Step 3)
3. Check firewall is not blocking port 3000:
   ```bash
   sudo ufw allow 3000
   sudo ufw allow 8081
   ```
4. Test from phone browser: open `http://192.168.29.85:3000/health`

---

### Problem: QR code appears but scanning does nothing / times out

**Cause:** Expo tunnel mode may be needed if your network blocks LAN connections.

**Fix:** Start Expo with tunnel mode:
```bash
npx expo start --tunnel
```
This routes through Expo's servers — slower but bypasses network restrictions. Requires internet on both devices.

---

### Problem: "Something went wrong" screen in Expo Go

**Fix:**
1. Shake your phone to open the Expo developer menu
2. Tap **"Reload"**
3. If still broken, check the terminal running `npx expo start` for red error messages

---

### Problem: Metro bundler shows "Unable to resolve module"

**Fix:**
```bash
cd mobile
rm -rf node_modules
npm install
npx expo start --clear
```

---

### Problem: Backend starts but crashes immediately

**Fix:** Check Redis is running (required by backend):
```bash
sudo systemctl start redis
sudo systemctl status redis
```
Or start Redis via Docker:
```bash
docker run -d -p 6379:6379 redis:alpine
```

---

### Problem: IP address changed (e.g., after reconnecting Wi-Fi)

**Fix:** Find new IP and update both files:
```bash
# 1. Get new IP
ip addr show | grep "inet " | grep -v "127.0.0.1"

# 2. Update app.json (replace 192.168.29.85 with new IP)
# 3. Update backend/.env FRONTEND_URL
# 4. Restart both servers
```

---

## Normal Startup Sequence (Summary)

```
Terminal 1:  cd backend  →  npm run dev          (keeps running)
Terminal 2:  cd mobile   →  npx expo start       (keeps running)
Phone:       Open Expo Go  →  Scan QR code
```

---

## Ports Used

| Service        | Port | URL from phone                      |
|----------------|------|-------------------------------------|
| Backend API    | 3000 | `http://192.168.29.85:3000`         |
| Expo Metro     | 8081 | `exp://192.168.29.85:8081`          |

---

## First-Time App Usage

1. **Register** — Create an account (Admin or Employee role)
2. **Enroll face** — Go to Profile → tap "Enroll Face" → follow camera prompts
3. **Mark attendance** — Go to Attendance → tap "Check In" → let camera scan your face
4. Face must be enrolled before attendance marking will work
