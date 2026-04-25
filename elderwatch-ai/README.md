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
| Wandering detection (safe zone exit, 3s debounce) | ✅ MVP |
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
| S3 critical-event video clip recording (urgent only, 2 min cooldown) | ✅ MVP |
| Presigned URL upload (browser → S3 direct) | ✅ MVP |
| Presigned URL playback (temporary signed GET) | ✅ MVP |
| Video clip history tab with "View Clip" | ✅ MVP |
| "Trigger Critical Event" demo button | ✅ MVP |
| Seizure-like movement detection (experimental, conservative, off by default) | ✅ MVP |
| ElevenLabs audio monitoring (STT + distress classification) | ✅ MVP |
| Audio-based choking / breathing distress detection | ✅ MVP |
| Vision-based choking detection (hands near throat heuristic) | ✅ MVP |
| Pause Monitoring (stops all detection, classification, and S3 uploads) | ✅ MVP |

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
| Audio STT | ElevenLabs `scribe_v2` (optional) |
| AI Assistant | Claude API (`claude-haiku`) or mocked responses |

---

## Architecture

```
Browser
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Webcam (getUserMedia)         Microphone (getUserMedia)        │
│       │                               │                         │
│       ▼                               ▼                         │
│  MediaPipe Pose Landmarker     MediaRecorder (6s chunks)        │
│  33 landmarks (normalized x,y,z)      │                         │
│       │                               └──► POST /api/audio/analyze
│       ▼                                                         │
│  poseHelpers.ts                                                 │
│  • calculatePostureAngle()     → degrees from vertical          │
│  • detectLyingDown()           → boolean                        │
│  • calculateMovementScore()    → 0–1 (all landmarks)            │
│  • calculateMajorBodyMovementScore() → 0–1 (no wrists)         │
│  • getBodyCenter()             → torso center (shoulder+hip avg)│
│  • isInsideSafeZone()          → boolean (6% margin)            │
│  • detectHandsNearThroat()     → boolean                        │
│       │                                                         │
│       ▼                                                         │
│  classifySafety.ts                                              │
│  • classifyResidentSafety(signals, options)                     │
│    → { severity, eventType, reason, confidence }                │
│       │                                                         │
│       ├──► Dashboard UI (ResidentCard, EventTimeline, etc.)     │
│       │    • Color-coded severity badge                         │
│       │    • Pulsing visual border on Assist/Urgent             │
│       │    • Browser TTS announcement                           │
│       │                                                         │
│       └──► POST /api/events (per-event-type cooldown)           │
│                 │                                               │
│  [Urgent only] ─┴──► useVideoRecorder → S3 presigned PUT        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                  │                  │
Server (Next.js API Routes)          │
┌─────────────────┼──────────────────┼──────────────────────────┐
│                 ▼                  ▼                           │
│  /api/events         ──► MongoDB: safety_events collection     │
│  /api/audio/analyze  ──► ElevenLabs STT → MongoDB event        │
│  /api/residents      ──► MongoDB: residents collection         │
│  /api/analytics      ──► MongoDB aggregation pipeline          │
│  /api/assistant      ──► Claude API or mock guidance           │
│  /api/seed           ──► Seed demo data                        │
│  /api/video-clips    ──► Presign S3 upload / MongoDB metadata  │
└────────────────────────────────────────────────────────────────┘
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

# ElevenLabs STT for audio monitoring (optional — simulate mode available without it)
ELEVENLABS_API_KEY=sk_...
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

All visual detection is **rule-based** using pose landmarks — no custom ML training required.

### Signal Extraction (`src/lib/poseHelpers.ts`)

| Signal | How it's computed |
|---|---|
| `postureAngle` | `atan2(|shoulderMid.x − hipMid.x|, |shoulderMid.y − hipMid.y|)` — angle of torso from vertical |
| `isLyingDown` | Torso angle > 50° **or** horizontal body spread > 1.3× vertical spread |
| `movementScore` | Average Euclidean delta of 7 key landmarks between consecutive frames, normalized 0–1 |
| `majorBodyMovementScore` | Same as `movementScore` but uses only nose, shoulders, and hips — excludes wrists/elbows to avoid false seizure triggers from arm movement |
| `secondsStill` | Elapsed time since `movementScore` last exceeded 0.02 threshold |
| `insideSafeZone` | **Torso center** (average of all available shoulder + hip landmarks) within the configured rectangle, with 6% outward margin to absorb boundary glitches. Default zone covers ~96% of the frame height. |
| `secondsOutsideSafeZone` | Elapsed time since torso center first left the safe zone — wandering only fires after 3 continuous seconds |
| `secondsHighMovement` | Elapsed time since `majorBodyMovementScore` continuously exceeded seizure threshold — seizure detection requires ≥ 6 sustained seconds |
| `handsNearThroatSeconds` | Elapsed time both wrists have been within 0.12 normalized units of the throat area (midpoint between nose and shoulder midpoint) |
| `visible` | At least 2 of 5 core landmarks (nose, shoulders, hips) have visibility > 0.3 |

### Classification Rules (`src/lib/classifySafety.ts`)

| Priority | Condition | Severity | Event |
|---|---|---|---|
| 1 | `!visible` | Watch | out_of_frame |
| 2 | `isLyingDown && movementScore < 0.1 && secondsStill > 10` | Urgent | possible_fall |
| 3 | `isLyingDown && movementScore >= 0.1` | Assist | fall_risk |
| 4 | `secondsStill > 300` | Assist | immobility |
| 5 | `handsNearThroatSeconds >= 3 && postureAngle > 15 && !isLyingDown` | Urgent | possible_choking |
| 6 | `seizureEnabled && !isLyingDown && secondsHighMovement >= 6 && movementScore > 0.70 && majorBodyMovementScore > 0.55` | Urgent | seizure_like_motion |
| 7 | `!insideSafeZone && secondsOutsideSafeZone >= 3` | Watch | wandering |
| 8 | `postureAngle > 60` | Assist | unsafe_posture |
| 9 | `postureAngle > 35` | Watch | unsafe_posture |
| 10 | — | Stable | normal |

### Audio Classification (`src/lib/elevenlabs.ts`)

When ElevenLabs is configured, each 6-second audio chunk is transcribed and classified:

| Priority | Condition | Severity | Event |
|---|---|---|---|
| 1 | Choking keyword matched (e.g. "can't breathe", "gasping") | Urgent | possible_choking |
| 2 | ≥ 2 distress keywords **or** 1 keyword + vocal distress audio tag | Urgent | audio_distress |
| 3 | 1 distress keyword, choking/breathing sound tag, or distress vocal tag | Assist | possible_distress_sound / possible_choking |
| 4 | Fall-sound audio tag (thud, bang, crash) only | Watch | possible_fall_sound |
| 5 | No indicators | Stable | normal |

Distress keywords include: `help`, `i fell`, `can't get up`, `pain`, `emergency`, etc.  
Choking keywords include: `choking`, `can't breathe`, `gasping`, `no air`, `struggling to breathe`, etc.

---

## Monitoring Behavior Notes

### Safe Zone

The default safe zone covers nearly the full camera frame (x: 8%, y: 2%, width: 84%, height: 96%).
Wandering detection uses the **torso center** (average of all available shoulder and hip landmarks)
rather than just hips, so a seated or leaning person is accurately placed. A 6% outward margin
and a **3-second continuous-exit debounce** prevent momentary boundary glitches from firing alerts.

### Seizure-Like Movement Detection

Seizure-like movement detection is **experimental and off by default**. Enable it via the toggle
in the dashboard header. When enabled, an alert fires only when:

- Major-body movement score (nose + shoulders + hips only, excluding wrists) exceeds 0.55
- Overall movement score exceeds 0.70
- Both conditions persist for **≥ 6 continuous seconds**
- The resident is not lying down

This conservative threshold is designed to tolerate normal activities (standing up, reaching,
gesturing). The dashboard and event labels use the phrasing **"Possible Seizure-Like Movement"**
with the note "caregiver should check" — this system detects sustained rapid body movement and
does not diagnose seizures.

### Choking Detection

Choking can be detected from two independent sources:

**Audio (ElevenLabs):** Keywords like "choking", "can't breathe", "gasping", "no air" in
transcribed speech trigger an **Urgent** alert immediately. Breathing-sound tags (coughing,
wheezing, gasping) without keywords trigger an **Assist** alert.

**Vision (pose):** If both wrists are within ~12% of normalized frame width of the throat
landmark (midpoint between nose and shoulder midpoint) **continuously for ≥ 3 seconds** and
the resident is not lying flat, an **Urgent** choking alert fires.

### Pause Monitoring

The **Pause Monitoring** button in the dashboard header stops all activity:

- Visual pose classification is suspended (no new events classified or persisted)
- Audio monitoring analysis is skipped (mic continues recording but chunks are not sent to ElevenLabs)
- S3 video clip recording is blocked
- A "MONITORING PAUSED" badge appears in the header
- The AI assistant question form is disabled while paused

This is intended for use when a caregiver is physically present in the room and manual monitoring
is not needed, or when the system needs to be temporarily silenced during a planned activity.

### S3 Video Clip Recording

Critical-event clips are recorded **only for `urgent` severity events** (possible fall, possible
choking, audio distress, seizure-like movement). Watch and Assist events do not trigger recording.
A **2-minute per-event-type cooldown** prevents the same event type from generating multiple clips
in a short window. This limits S3 storage costs and avoids clip spam during sustained alerts.

### Per-Event-Type Cooldowns

Each event type has an independent cooldown that limits how often it can be persisted to MongoDB:

| Event | Cooldown |
|---|---|
| wandering | 60 s |
| fall_risk | 60 s |
| unsafe_posture | 60 s |
| audio_distress | 60 s |
| possible_distress_sound | 60 s |
| possible_fall | 120 s |
| immobility | 120 s |
| possible_choking | 120 s |
| possible_fall_sound | 120 s |
| out_of_frame | 60 s |
| seizure_like_motion | 180 s |

---

## Audio Monitoring (ElevenLabs)

The **Audio Monitor** card uses the browser microphone to continuously capture audio in 6-second
chunks. Each chunk is sent to `POST /api/audio/analyze`, which calls the ElevenLabs `scribe_v2`
model to transcribe speech and detect non-speech audio events (thuds, coughing, crying, etc.).

The transcript and audio event tags are classified for distress using keyword matching. If a
distress condition is detected, a safety event is persisted to MongoDB and injected into the
event timeline in real time — exactly like a vision-detected event.

A **Simulate** button fires a hardcoded "Help! I can't get up" transcript for demo purposes
without requiring a microphone.

If `ELEVENLABS_API_KEY` is not set, the Audio Monitor card shows a "Configure ELEVENLABS_API_KEY"
notice and only the Simulate button is available.

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
│   │       ├── assistant/route.ts    # AI care guidance
│   │       ├── audio/analyze/route.ts  # ElevenLabs STT + distress classification
│   │       ├── video-clips/route.ts
│   │       ├── video-clips/presign-upload/route.ts
│   │       └── video-clips/[id]/playback-url/route.ts
│   ├── components/
│   │   ├── PoseCamera.tsx            # Canvas with video + skeleton + safe zone
│   │   ├── ResidentCard.tsx          # Profile + current status + signal pills
│   │   ├── EventTimeline.tsx         # Scrollable event list with ack + notes + audio transcript
│   │   ├── AnalyticsCard.tsx         # 24h MongoDB stats
│   │   ├── SafetyBadge.tsx           # Reusable severity badge
│   │   ├── AIAssistant.tsx           # Guidance panel
│   │   └── AudioMonitor.tsx          # Mic capture + ElevenLabs STT card
│   ├── hooks/
│   │   ├── usePoseDetection.ts       # MediaPipe init + webcam + rAF loop
│   │   ├── useResidentMonitor.ts     # Signal extraction + classification + persistence (pause-aware)
│   │   ├── useVideoRecorder.ts       # S3 clip recording (urgent-only, cooldown-limited)
│   │   └── useAlerts.ts              # TTS alerts (debounced)
│   └── lib/
│       ├── types.ts                  # All TypeScript types and constants
│       ├── classifySafety.ts         # Core safety classifier (choking, seizure, pause support)
│       ├── poseHelpers.ts            # Signal extraction — torso center, major-body score, throat heuristic
│       ├── elevenlabs.ts             # ElevenLabs STT + audio distress keyword classifier
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
- [x] S3 critical-event video clip recording (urgent-only, 2 min cooldown)
- [x] ElevenLabs STT audio monitoring with distress + choking classification
- [x] Vision-based choking detection (sustained hands-near-throat heuristic)
- [x] Experimental seizure-like movement detection (conservative 6s threshold, toggle)
- [x] Pause Monitoring — suspends all classification, audio analysis, and S3 recording
- [x] Per-event-type debounce cooldowns for MongoDB and S3

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
