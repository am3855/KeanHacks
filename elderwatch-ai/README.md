# ElderWatch AI

**Real-time visual safety monitoring assistant for elderly care homes.**

> ⚠️ **Prototype only. Not a medical device. Do not use for real patient care.**  
> All resident data is mock/demo data only. This system does not diagnose medical conditions,
> does not replace trained caregivers, and should not be the sole method of resident monitoring.

---

## Problem Statement

Care facilities face a critical challenge: staff stretched thin across dozens of residents, each
with unique mobility limitations and fall-risk profiles. Residents who fall, wander outside their
safe area, or sit in unsafe postures for extended periods may not be able to call for help. Call
buttons aren't always reachable. Continuous manual monitoring is not feasible.

**ElderWatch AI** gives caregivers an extra layer of awareness — a real-time visual safety layer
powered by pose detection that runs entirely in the browser, with no specialized hardware required.

---

## Solution Overview

```
Camera → MediaPipe Pose Detection → Safety Classifier → Dashboard + Alerts
                                                      ↓
                                               MongoDB (event history)
                                                      ↓
                                           Optional AI Care Assistant
```

The system:
1. Reads the laptop/tablet webcam in real time
2. Runs **MediaPipe Pose Landmarker** in the browser to extract 33 body landmarks per frame
3. Applies **rule-based safety signal extraction** to compute posture angle, lying-down state,
   movement score, stillness duration, and safe-zone position
4. **Classifies** the resident's current status as Stable / Watch / Assist / Urgent
5. Displays a **caregiver dashboard** with live feed, status badge, event timeline, and analytics
6. **Persists every alert** to MongoDB Atlas for longitudinal trend analysis
7. Optionally calls **Claude AI** to provide contextual caregiver guidance

---

## Key Features

| Feature | Status |
|---|---|
| Live webcam feed with pose skeleton overlay | ✅ MVP |
| Real-time fall detection | ✅ MVP |
| Immobility detection (>5 min stillness) | ✅ MVP |
| Wandering detection (safe zone exit) | ✅ MVP |
| Unsafe posture detection | ✅ MVP |
| Caregiver dashboard with status badge | ✅ MVP |
| Event timeline with timestamps | ✅ MVP |
| Browser TTS audio alerts | ✅ MVP |
| Pulsing/glowing visual alerts | ✅ MVP |
| MongoDB event persistence | ✅ MVP |
| Resident history & trend analytics | ✅ MVP |
| Acknowledge alerts + caregiver notes | ✅ MVP |
| AI Care Assistant (mock + Claude) | ✅ MVP |
| Resident profile selector | ✅ MVP |
| Demo data seed button | ✅ MVP |
| S3 critical-event video clip recording | ✅ MVP |
| Presigned URL upload (browser → S3 direct) | ✅ MVP |
| Presigned URL playback (temporary signed GET) | ✅ MVP |
| Video clip history tab with "View Clip" | ✅ MVP |
| "Trigger Critical Event" demo button | ✅ MVP |
| Seizure-like motion event type | ✅ MVP |

---

## Resident Safety Levels

| Level | Color | Description |
|---|---|---|
| **Stable** | 🟢 Green | No concerning activity. Resident is moving normally within their safe zone. |
| **Watch** | 🟡 Yellow | Mild concern: posture angle elevated, out of frame, or left safe zone. Caregiver should note. |
| **Assist** | 🟠 Orange | Active concern: unsafe posture, prolonged immobility (>5 min), or low-position movement. Caregiver should check in. |
| **Urgent** | 🔴 Red | Immediate concern: resident appears to be lying down with minimal movement (possible fall). Respond now. |

---

## Alert Examples

```
[TTS — Urgent]
"Urgent alert. Resident appears to be lying down with minimal movement.
 Resident: Eleanor Brooks, Room 204."

[TTS — Assist]
"Caregiver assist needed. Resident has shown very little movement for several minutes.
 Resident: Robert Hayes, Room 118."

[Visual]
Red pulsing border and red background glow on the resident card.
Canvas chip in the top-left corner shows "● URGENT".
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS (dark theme) |
| Pose Detection | MediaPipe Pose Landmarker (browser, GPU/CPU) |
| Backend | Next.js API Routes |
| Database | MongoDB Atlas (optional) + in-memory fallback |
| Video Storage | Amazon S3 via `@aws-sdk/client-s3` (optional) |
| Video Capture | Browser MediaRecorder API (WebM/VP9) |
| Audio Alerts | Web Speech API (`speechSynthesis`) |
| AI Assistant | Claude API (`claude-haiku`) or mocked responses |

---

## Architecture

```
Browser
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Webcam (getUserMedia)                                          │
│       │                                                         │
│       ▼                                                         │
│  MediaPipe Pose Landmarker ──► 33 landmarks (normalized x,y,z) │
│       │                                                         │
│       ▼                                                         │
│  poseHelpers.ts                                                 │
│  • calculatePostureAngle()   → degrees from vertical            │
│  • detectLyingDown()         → boolean                         │
│  • calculateMovementScore()  → 0–1 delta between frames         │
│  • isInsideSafeZone()        → boolean                         │
│       │                                                         │
│       ▼                                                         │
│  classifySafety.ts                                              │
│  • classifyResidentSafety(signals) → { severity, eventType,    │
│                                        reason, confidence }     │
│       │                                                         │
│       ├──► Dashboard UI (ResidentCard, EventTimeline, etc.)     │
│       │    • Color-coded severity badge                         │
│       │    • Pulsing visual border on Assist/Urgent             │
│       │    • Browser TTS announcement                           │
│       │                                                         │
│       └──► POST /api/events (debounced, 8s)                     │
│                 │                                               │
└─────────────────┼───────────────────────────────────────────────┘
                  │
Server (Next.js API Routes)
┌─────────────────┼───────────────────────────────────────────────┐
│                 ▼                                               │
│  /api/events    ──► MongoDB: safety_events collection           │
│  /api/residents ──► MongoDB: residents collection               │
│  /api/analytics ──► MongoDB aggregation pipeline               │
│  /api/assistant ──► Claude API or mock guidance                 │
│  /api/seed      ──► Seed demo data                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A webcam (built-in or USB)
- (Optional) MongoDB Atlas cluster
- (Optional) Anthropic API key

### 1. Install

```bash
cd elderwatch-ai
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# MongoDB Atlas (optional — app falls back to in-memory demo mode without it)
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=kean_hacks_database

# Anthropic API (optional — mock guidance used without it)
ANTHROPIC_API_KEY=sk-ant-...

# AWS S3 for critical event video clips (optional — events saved without clips if absent)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=your-elderwatch-clips-bucket
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Seed demo data

Click **"Seed Demo Data"** in the header, or POST to `/api/seed`:

```bash
curl -X POST http://localhost:3000/api/seed
```

This inserts 3 mock residents, 6 historical safety events, and 2 caregiver notes into MongoDB
(or pre-loads them into the in-memory store if no MongoDB is configured).

---

## Critical Event Video History

ElderWatch AI stores critical safety event clips using Amazon S3. When an urgent event occurs —
such as a possible fall or seizure-like motion — the app records a short video clip from the
webcam and uploads it **directly to S3** using a presigned PUT URL. No video data passes through
the Next.js server.

MongoDB stores the event history and metadata, including the resident ID, event type, severity,
clip timestamp, S3 object key, and duration. This keeps large video files out of the database
while preserving searchable, per-resident safety history.

### How it works

```
Critical Event Detected
        │
        ▼
Browser records 15s WebM clip (MediaRecorder API)
        │
        ▼
POST /api/video-clips/presign-upload → presigned S3 PUT URL
        │
        ▼
Browser PUT (blob) → S3 directly (no server proxy)
        │
        ▼
POST /api/video-clips → MongoDB: video_clips collection
        │
        ▼
History tab: "📹 Video Clip" badge on event
"View" button → GET /api/video-clips/[id]/playback-url → presigned GET URL
```

### S3 + MongoDB Setup

1. Create a [MongoDB Atlas](https://cloud.mongodb.com) free cluster
2. Set `MONGODB_URI` and `MONGODB_DB` in `.env.local`
3. Create an S3 bucket in AWS
4. Create an IAM user with `s3:PutObject` + `s3:GetObject` permissions for that bucket
5. Set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` in `.env.local`
6. Run `npm install` then `npm run dev`
7. Click **Seed Demo Data** to pre-load residents and demo events
8. Click **⚡ Trigger Critical Event** to test the clip recording and upload workflow

The **S3 Clip Storage Ready** status pill in the header shows whether S3 is configured.

> ⚠️ **Privacy disclaimer:** All data in this demo is mock/demo data only. In any real
> deployment, video clips may contain sensitive health information and require:
> resident/guardian consent, end-to-end encryption, role-based access controls,
> a defined retention and deletion policy, and full compliance review (HIPAA, GDPR, etc.).
> This prototype is not suitable for use with real patients.

---

## Best Use of MongoDB

ElderWatch AI uses **MongoDB as the resident safety history and analytics layer**. Every detected
safety event is stored as a document with:

- Resident context (ID, name, room)
- Severity and event type
- Confidence score
- Full pose-derived safety signals (posture angle, movement score, stillness duration, safe zone
  status, visibility)
- Recommended action for the caregiver
- Acknowledgment status (acknowledged by / at)
- Caregiver notes (linked by eventId)
- Timestamps (ISO 8601)

This enables the dashboard to show not only **real-time alerts**, but also **longitudinal care
trends** such as repeated wandering episodes, frequent immobility detections, high-risk rooms,
and urgent event history per resident.

MongoDB's **flexible document model** is ideal here because each safety event may include
different combinations of signals depending on the event type — a possible-fall event carries
lying-down posture data; a wandering event carries safe-zone exit coordinates. No rigid schema
is required.

### MongoDB Collections

| Collection | Purpose |
|---|---|
| `residents` | Mock resident profiles (seed data) |
| `safety_events` | Every detected Assist/Urgent/Watch event (includes optional video clip metadata) |
| `caregiver_notes` | Caregiver notes attached to specific events |
| `video_clips` | Clip metadata — S3 key, bucket, duration, timestamps, resident/event link |

### MongoDB Setup

1. Create a [MongoDB Atlas](https://cloud.mongodb.com) free cluster
2. Create a database user and whitelist your IP
3. Copy the connection string into `.env.local` as `MONGODB_URI`
4. Run the app and click **"Seed Demo Data"**
5. View resident history and 24h analytics in the dashboard

---

## Detection Logic

All detection is **rule-based** using pose landmarks — no custom ML training required.

### Signal Extraction (`src/lib/poseHelpers.ts`)

| Signal | How it's computed |
|---|---|
| `postureAngle` | `atan2(|shoulderMid.x − hipMid.x|, |shoulderMid.y − hipMid.y|)` — angle of torso from vertical |
| `isLyingDown` | Torso angle > 50° **or** horizontal body spread > 1.3× vertical spread |
| `movementScore` | Average Euclidean delta of 7 key landmarks between consecutive frames, normalized 0–1 |
| `secondsStill` | Elapsed time since `movementScore` last exceeded 0.02 threshold |
| `insideSafeZone` | Hip midpoint within the configured rectangle (default: 80% of frame) |
| `visible` | Core landmarks (shoulders + hips) all have visibility > 0.4 |

### Classification Rules (`src/lib/classifySafety.ts`)

| Priority | Condition | Severity | Event |
|---|---|---|---|
| 1 | `!visible` | Watch | out_of_frame |
| 2 | `isLyingDown && movementScore < 0.1 && secondsStill > 10` | Urgent | possible_fall |
| 3 | `isLyingDown && movementScore >= 0.1` | Assist | fall_risk |
| 4 | `secondsStill > 300` | Assist | immobility |
| 5 | `!insideSafeZone` | Watch | wandering |
| 6 | `postureAngle > 60` | Assist | unsafe_posture |
| 7 | `postureAngle > 35` | Watch | unsafe_posture |
| 8 | — | Stable | normal |

---

## Project Structure

```
elderwatch-ai/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Main dashboard (client component)
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── residents/route.ts    # GET all residents
│   │       ├── residents/[id]/history/route.ts
│   │       ├── events/route.ts       # GET/POST safety events
│   │       ├── events/[id]/acknowledge/route.ts
│   │       ├── events/[id]/notes/route.ts
│   │       ├── analytics/route.ts
│   │       ├── seed/route.ts
│   │       └── assistant/route.ts    # AI care guidance
│   ├── components/
│   │   ├── PoseCamera.tsx            # Canvas with video + skeleton + safe zone
│   │   ├── ResidentCard.tsx          # Profile + current status + signal pills
│   │   ├── EventTimeline.tsx         # Scrollable event list with ack + notes
│   │   ├── AnalyticsCard.tsx         # 24h MongoDB stats
│   │   ├── SafetyBadge.tsx           # Reusable severity badge
│   │   └── AIAssistant.tsx           # Guidance panel
│   ├── hooks/
│   │   ├── usePoseDetection.ts       # MediaPipe init + webcam + rAF loop
│   │   ├── useResidentMonitor.ts     # Signal extraction + classification + persistence
│   │   └── useAlerts.ts              # TTS alerts (debounced)
│   └── lib/
│       ├── types.ts                  # All TypeScript types and constants
│       ├── classifySafety.ts         # Core safety classifier
│       ├── poseHelpers.ts            # Signal extraction from landmarks
│       ├── mockData.ts               # MOCK DATA ONLY — not real patients
│       ├── mongodb.ts                # MongoDB connection helper
│       └── db/
│           ├── residents.ts
│           ├── events.ts
│           └── notes.ts
```

---

## Hackathon MVP — Implemented vs Future Work

### Implemented (this demo)

- [x] Live webcam + MediaPipe pose skeleton overlay
- [x] Rule-based fall, immobility, wandering, posture detection
- [x] Stable / Watch / Assist / Urgent classification
- [x] Caregiver dashboard with resident selector
- [x] Color-coded severity badges with pulse animations
- [x] Browser TTS audio alerts (debounced, 15s cooldown)
- [x] Severity glow / pulse border on the camera feed
- [x] Event timeline with acknowledge + notes
- [x] MongoDB event persistence (graceful fallback to in-memory)
- [x] 24h analytics card (MongoDB aggregation)
- [x] Resident event history panel
- [x] AI Care Assistant (mock + Claude API)
- [x] Demo data seed endpoint

### Future Work

- [ ] Multi-camera / multi-room support
- [ ] Actual resident profile management (CRUD)
- [ ] Role-based access (supervisor vs caregiver)
- [ ] Push notifications (mobile app / Slack / SMS)
- [ ] Night-time monitoring mode (IR camera support)
- [ ] HIPAA-compliant data handling
- [ ] Proper consent management UI
- [ ] Shift summary reports (PDF export)
- [ ] Integration with EHR systems

---

## Privacy & Ethics

> ElderWatch AI is a **prototype for assistive safety monitoring only**.

- It does **not** diagnose medical conditions.
- It does **not** replace trained caregivers or medical staff.
- It should **not** be used as the sole method for monitoring residents.
- All data shown in this demo is **entirely fictitious (mock data)** — no real patient information
  is used or stored.
- In any real deployment, **proper consent** for camera monitoring would be required from
  residents or their guardians, and all applicable privacy laws (HIPAA, GDPR, etc.) must be
  followed.
- This system is not certified as a medical device under any regulatory framework.

---

## License

MIT — Hackathon demo project.
