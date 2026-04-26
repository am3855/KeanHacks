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

## Two-Tab Layout

The app opens to **Multi-Feed Demo** by default. Switch tabs in the header.

### Tab 1 — Multi-Feed Demo

Simulated four-camera care-home command center using prerecorded video files. Demonstrates how
ElderWatch AI scales to multiple residents and rooms simultaneously.

- **2×2 video grid**: Four prerecorded feeds with room name, resident name, risk profile, status badge
- **Scripted event timelines**: Each video's status updates based on `video.currentTime` — feeds
  progress from Stable → Watch → Urgent on scripted cues
- **Facility Alert Panel**: Live sorted alert queue (Urgent first) with wait timer, Mark Care, and
  Save to History buttons
- **Manual saves only**: The Multi-Feed tab does **not** automatically write to MongoDB or S3.
  Use "Save Event" per tile or "Save All Alerts" to persist selected events.
- **Missing video placeholder**: If demo videos are missing, each tile shows an instruction
  card — the app does not crash.

#### Demo video files

Create the folder `public/demo-videos/` and add:

| File | Feed | Scripted events |
|---|---|---|
| `fall-demo.mp4` | Room 204 — Eleanor Brooks | 0–5s stable → 5–10s watch (posture) → 10s+ urgent fall |
| `stable-demo.mp4` | Room 118 — Robert Hayes | Always stable |
| `wandering-demo.mp4` | Room 312 — Margaret Chen | 0–6s stable → 6s+ watch (wandering) |
| `choking-demo.mp4` | Lounge Area — Daniel Price | 0–4s stable → 4s+ urgent choking |

> Any short MP4 clip can be used as a placeholder. The scripted status is driven by
> `video.currentTime`, not the actual video content.

### Tab 2 — Live Camera Demo

Full real-time webcam demo with all existing functionality preserved:

- Live webcam feed with MediaPipe pose skeleton overlay
- Draggable/resizable safe zone
- Resident profile card + live event timeline
- History tab with video clip playback
- Analytics card (MongoDB 24h stats)
- AI care assistant
- Audio monitor (ElevenLabs STT)
- Trigger Critical Event button
- **Simulate Choking Event** button
- S3 combined audio+video clip recording for all critical events
- Pause/Resume monitoring

---

## Key Features

| Feature | Status |
|---|---|
| Multi-Feed Demo: 4-room command center with prerecorded videos | ✅ MVP |
| Multi-Feed: scripted status timelines per feed | ✅ MVP |
| Multi-Feed: facility alert panel (sorted by severity) | ✅ MVP |
| Multi-Feed: manual-only MongoDB saves (no auto-spam) | ✅ MVP |
| Live webcam feed with pose skeleton overlay | ✅ MVP |
| Real-time fall detection | ✅ MVP |
| Immobility detection (>5 min stillness) | ✅ MVP |
| Wandering detection (safe zone exit, 3s debounce, torso center) | ✅ MVP |
| Unsafe posture detection | ✅ MVP |
| Draggable/resizable safe zone (canvas handles, localStorage persist) | ✅ MVP |
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
| S3 combined audio+video `.webm` clip recording (all critical events) | ✅ MVP |
| Presigned URL upload (browser → S3 direct) | ✅ MVP |
| Presigned URL playback (temporary signed GET) | ✅ MVP |
| Video clip history tab with "View Clip" | ✅ MVP |
| "Trigger Critical Event" demo button | ✅ MVP |
| "Simulate Choking Event" demo button | ✅ MVP |
| Seizure-like movement detection (experimental, conservative, off by default) | ✅ MVP |
| ElevenLabs audio monitoring (STT + distress classification) | ✅ MVP |
| Visual-only choking detection (sustained 4s hands-near-throat, no audio required) | ✅ MVP |
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

When ElevenLabs is configured, each 6-second audio chunk is transcribed and classified.
**`possible_choking` is a visual-only event type — audio never produces it.**

| Priority | Condition | Severity | Event |
|---|---|---|---|
| 1 | Choking/breathing-difficulty keyword (e.g. "can't breathe", "gasping") or choking sound + distress | Urgent | audio_distress |
| 2 | ≥ 2 distress keywords **or** 1 keyword + vocal distress audio tag | Urgent | audio_distress |
| 3 | 1 distress keyword, breathing sound tag, or distress vocal tag | Assist | possible_distress_sound |
| 4 | Fall-sound audio tag (thud, bang, crash) only | Watch | possible_fall_sound |
| 5 | No indicators | Stable | normal |

Distress keywords include: `help`, `i fell`, `can't get up`, `pain`, `emergency`, etc.  
Choking/breathing keywords include: `choking`, `can't breathe`, `gasping`, `no air`, etc. — these map to `audio_distress`, not `possible_choking`.

---

## Monitoring Behavior Notes

### Safe Zone

The default safe zone covers nearly the full camera frame (x: 4%, y: 2%, width: 92%, height: 96%).
Wandering detection uses the **torso center** (average of all available shoulder and hip landmarks)
rather than just hips, so a seated or leaning person is accurately placed. A 5% outward margin
and a **3-second continuous-exit debounce** prevent momentary boundary glitches from firing alerts.

**Editing the safe zone:** Toggle **Edit Safe Zone** in the Live Camera tab. Drag the four white
corner handles to resize, or drag the interior of the box to reposition. The zone is saved to
`localStorage` under `elderwatch_safe_zone` and persists across browser refreshes. Click
**Reset Safe Zone** to restore the default full-frame zone.

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

### Choking Detection (Visual Only)

`possible_choking` is a **visual-only event type**. Audio phrases alone ("I can't breathe",
"choking") produce `audio_distress` — never `possible_choking`. This separation prevents false
positives from normal speech.

**Vision (pose):** If one or both wrists are within ~12% normalized units of the throat landmark
(interpolated midpoint between nose and shoulder midpoint, weighted 65% toward shoulders) and
that condition persists **continuously for ≥ 4 seconds** while the resident is not lying flat,
an **Urgent** `possible_choking` event fires with confidence 0.82. A 120-second cooldown prevents
repeat events.

**Simulate Choking Event** button in the Live Camera tab creates an Urgent `possible_choking` event,
uploads a combined audio+video clip to S3, and adds it to the live timeline and MongoDB — useful
for demonstrating the detection path without needing a real gesture.

The event is always labelled **"Possible Choking"** — this system does not confirm choking.
Caregivers must check immediately.

### Pause Monitoring

The **Pause Monitoring** button in the dashboard header stops all activity:

- Visual pose classification is suspended (no new events classified or persisted)
- Audio monitoring analysis is skipped (mic continues recording but chunks are not sent to ElevenLabs)
- S3 video clip recording is blocked
- A "MONITORING PAUSED" badge appears in the header
- The AI assistant question form is disabled while paused

This is intended for use when a caregiver is physically present in the room and manual monitoring
is not needed, or when the system needs to be temporarily silenced during a planned activity.

### S3 Video Clip Recording (Combined Audio + Video)

All critical events record a **single `.webm` clip containing both video and microphone audio**
tracks when camera and microphone permissions are available.

Recording path (shared by all critical event sources):
1. If the AudioMonitor mic stream is available, reuse it; otherwise request a fresh audio stream.
2. Combine the webcam video track and microphone audio track into one `MediaStream`.
3. Record with `MediaRecorder` (`video/webm;codecs=vp9,opus` when supported).
4. Upload directly to S3 via presigned PUT URL (no server proxy).
5. Save `video_clips` metadata to MongoDB including `hasVideoTrack` and `hasAudioTrack`.

**Fallbacks:**
- If microphone permission is denied → record video-only clip, show "Microphone unavailable — saved video-only clip."
- If S3 is not configured → event is saved to MongoDB without a clip.
- If camera is unavailable → skip clip recording entirely; event is still saved to MongoDB.

Recording triggers: `possible_fall`, `possible_choking`, `audio_distress`, `seizure_like_motion`,
manual Trigger Critical Event, Simulate Choking Event, simulated audio distress.

A **2-minute per-event-type cooldown** prevents clip spam during sustained alerts.

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
