# Sensara — AI-Powered Elder Care Monitoring

**Real-time visual and audio safety monitoring for elderly care homes.**

Built at KeanHacks. Prototype only — not a medical device. All resident data is mock/demo data.

---

## The Problem

Care facilities are chronically understaffed. Caregivers are stretched thin across dozens of residents, each with different mobility limitations and fall-risk profiles. When a resident falls, wanders out of a safe area, or begins choking — they may not be able to reach a call button. Continuous manual surveillance is not feasible.

**Sensara gives caregivers an extra layer of awareness** — a real-time AI safety layer that monitors residents through a standard webcam and microphone with no specialized hardware required.

---

## What It Does

Sensara runs **MediaPipe pose detection entirely in the browser**, extracting 33 body landmarks per frame. It computes safety signals (posture angle, stillness duration, safe-zone position, hand placement) and classifies the resident's current state every frame. When a concern is detected, caregivers are alerted visually, by text-to-speech, SMS, and email — and every event is persisted to **MongoDB Atlas** for longitudinal history and analytics.

### Two Modes

**Multi-Feed Demo** — A simulated 4-camera care-home command center using prerecorded video files. Demonstrates how Sensara scales across multiple residents and rooms simultaneously, with a Facility Alert Panel showing a live sorted alert queue (Urgent first) with wait timers and save-to-history buttons.

**Live Camera Demo** — Full real-time webcam monitoring including pose skeleton overlay, draggable safe zone, audio distress detection, AI care guidance, and critical event video clip recording to S3.

---

## Safety Classification

| Level | Color | Description |
|---|---|---|
| **Stable** | 🟢 Green | No concerning activity |
| **Watch** | 🟡 Yellow | Posture elevated, left safe zone, or out of frame |
| **Assist** | 🟠 Orange | Unsafe posture sustained, prolonged immobility (>5 min) |
| **Urgent** | 🔴 Red | Possible fall, choking gesture, or audio distress |

---

## Detection Capabilities

All visual detection is **rule-based using pose landmarks** — no custom ML training required.

| Detection | How It Works |
|---|---|
| **Fall** | Torso angle >50° and stillness >10s → Urgent |
| **Immobility** | No significant movement for >5 minutes → Assist |
| **Wandering** | Torso center exits safe zone for >3 continuous seconds → Watch |
| **Unsafe posture** | Torso angle >35° sustained for >3s → Watch/Assist |
| **Choking (visual)** | Both wrists near throat for >4 continuous seconds → Urgent |
| **Audio distress** | ElevenLabs transcribes mic; distress keywords trigger Urgent/Assist |
| **Out of frame** | Key landmarks not visible → Watch |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS with custom Sensara design system |
| Pose Detection | MediaPipe Pose Landmarker — runs entirely in-browser (GPU/CPU) |
| Database | **MongoDB Atlas** — event history, analytics, resident profiles, caregiver notes |
| Video Storage | Amazon S3 — critical event clip upload and playback via presigned URLs |
| Video Capture | Browser MediaRecorder API (WebM/VP9 + Opus audio) |
| Audio STT | ElevenLabs `scribe_v2` — transcription + non-speech audio event detection |
| SMS Alerts | Twilio Programmable Messaging |
| Email Alerts | Resend — HTML email on urgent events |
| AI Assistant | Anthropic Claude API (`claude-haiku`) with mock fallback |
| TTS Alerts | Web Speech API (`speechSynthesis`) |

---

## MongoDB Atlas

MongoDB Atlas is the **persistence and analytics backbone** of Sensara. Every detected safety event is stored as a document in real time and the dashboard queries Atlas for live stats and per-resident history.

### Collections

| Collection | What's Stored |
|---|---|
| `safety_events` | Every alert — severity, event type, confidence score, full pose signals, reason, acknowledgment status, timestamps |
| `residents` | Resident profiles — name, age, room, fall risk, mobility, conditions, care notes |
| `caregiver_notes` | Staff annotations attached to specific events by `eventId` |
| `video_clips` | S3 clip metadata — object key, bucket, duration, timestamps, resident + event link |

### How It's Used

- **Real-time event persistence** — Every classified safety event hits `POST /api/events`, which inserts into `safety_events` (with per-event-type cooldowns to prevent spam)
- **Aggregation analytics** — `GET /api/analytics` runs MongoDB aggregation pipelines to compute 24-hour totals, urgent counts, most frequent event type, and the resident with the most alerts
- **Resident history** — `GET /api/residents/[id]/history` queries events and video clips per resident
- **Caregiver notes** — `POST /api/events/[id]/notes` inserts notes linked to specific events
- **Video clip metadata** — After S3 upload, `POST /api/video-clips` saves the S3 key and metadata; playback generates a presigned GET URL on demand
- **Graceful fallback** — App runs fully in-memory demo mode if `MONGODB_URI` is not set

---

## Architecture

```
Browser
┌──────────────────────────────────────────────────────────────┐
│  Webcam (getUserMedia)          Microphone (getUserMedia)     │
│       │                                │                      │
│       ▼                                ▼                      │
│  MediaPipe Pose Landmarker      MediaRecorder (6s chunks)     │
│  33 body landmarks (x,y,z)             │                      │
│       │                                └──► POST /api/audio/analyze
│       ▼                                                       │
│  poseHelpers.ts — signal extraction                           │
│  (posture angle, stillness, safe zone, hands-near-throat)     │
│       │                                                       │
│       ▼                                                       │
│  classifySafety.ts                                            │
│  → { severity, eventType, reason, confidence }                │
│       │                                                       │
│       ├──► Dashboard UI (badge, timeline, analytics)          │
│       ├──► Browser TTS alert                                  │
│       └──► POST /api/events                                   │
│                 │                                             │
│  [Urgent only] ─┴──► useVideoRecorder → S3 presigned PUT      │
└──────────────────────────────────────────────────────────────┘
                  │
     Next.js API Routes (server-side)
┌──────────────────────────────────────────────────────────────┐
│  /api/events            →  MongoDB: safety_events            │
│  /api/analytics         →  MongoDB aggregation pipeline      │
│  /api/residents         →  MongoDB: residents                │
│  /api/audio/analyze     →  ElevenLabs STT → event insert     │
│  /api/video-clips       →  S3 presign + MongoDB: video_clips │
│  /api/assistant         →  Claude API or mock guidance       │
│  /api/seed              →  Populate demo residents + events  │
└──────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
KeanHacks/
└── elderwatch-ai/
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx                         # Main dashboard (client component)
    │   │   ├── layout.tsx
    │   │   ├── globals.css
    │   │   └── api/
    │   │       ├── events/route.ts              # GET/POST safety events
    │   │       ├── events/[id]/acknowledge/     # PATCH — mark acknowledged
    │   │       ├── events/[id]/notes/           # GET/POST caregiver notes
    │   │       ├── events/[id]/video-clip/      # PATCH — link S3 clip to event
    │   │       ├── analytics/route.ts           # MongoDB 24h aggregation
    │   │       ├── residents/route.ts           # GET all residents
    │   │       ├── residents/[id]/history/      # GET per-resident event history
    │   │       ├── audio/analyze/route.ts       # ElevenLabs STT + distress classification
    │   │       ├── assistant/route.ts           # Claude AI care guidance
    │   │       ├── seed/route.ts                # Seed demo data into MongoDB
    │   │       ├── status/route.ts              # Service health check
    │   │       ├── sms/test/route.ts            # Test Twilio SMS
    │   │       ├── video-clips/route.ts         # GET/POST clip metadata
    │   │       ├── video-clips/presign-upload/  # Generate S3 presigned PUT URL
    │   │       └── video-clips/[id]/playback-url/ # Generate S3 presigned GET URL
    │   ├── components/
    │   │   ├── PoseCamera.tsx                   # Canvas: video + skeleton + safe zone
    │   │   ├── ResidentCard.tsx                 # Profile + current status + pose signals
    │   │   ├── EventTimeline.tsx                # Event list with ack, notes, video clips
    │   │   ├── AnalyticsCard.tsx                # 24h MongoDB stats
    │   │   ├── AIAssistant.tsx                  # Claude guidance panel
    │   │   ├── AudioMonitor.tsx                 # Mic capture + ElevenLabs STT card
    │   │   ├── MultiFeedDemo.tsx                # 4-camera command center
    │   │   ├── DemoVideoTile.tsx                # Individual feed tile with scripted events
    │   │   ├── FacilityAlertPanel.tsx           # Sorted multi-room alert queue
    │   │   └── SafetyBadge.tsx                  # Reusable severity badge
    │   ├── hooks/
    │   │   ├── usePoseDetection.ts              # MediaPipe init + webcam + animation loop
    │   │   ├── useResidentMonitor.ts            # Signal extraction + classify + DB persist
    │   │   ├── useVideoRecorder.ts              # S3 clip recording (urgent, cooldown-gated)
    │   │   └── useAlerts.ts                     # TTS alerts (debounced)
    │   └── lib/
    │       ├── types.ts                         # All TypeScript interfaces and constants
    │       ├── classifySafety.ts                # Safety classification rule engine
    │       ├── poseHelpers.ts                   # Pose signal extraction utilities
    │       ├── elevenlabs.ts                    # STT + audio distress keyword classifier
    │       ├── sms.ts                           # Twilio SMS integration (server-only)
    │       ├── emailAlerts.ts                   # Resend email integration (server-only)
    │       ├── mockData.ts                      # Mock resident profiles (demo only)
    │       ├── mongodb.ts                       # MongoDB Atlas connection + pool
    │       └── db/
    │           ├── events.ts                    # safety_events CRUD helpers
    │           ├── residents.ts                 # residents CRUD helpers
    │           ├── notes.ts                     # caregiver_notes CRUD helpers
    │           └── videoClips.ts               # video_clips CRUD helpers
    └── public/
        ├── sensara-logo.png
        └── demo-videos/                         # Prerecorded feeds for Multi-Feed tab
            ├── fall-demo.mp4
            ├── stable-demo.mp4
            ├── wandering-demo.mp4
            └── choking-demo.mp4
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- Webcam (for Live Camera tab)
- MongoDB Atlas free cluster (optional — app runs in full demo mode without it)

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
# MongoDB Atlas — event persistence and analytics
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=sensara

# Anthropic Claude — AI care assistant (optional, mock used without it)
ANTHROPIC_API_KEY=sk-ant-...

# AWS S3 — critical event video clip storage (optional)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=your-bucket-name

# ElevenLabs — audio distress detection (optional)
ELEVENLABS_API_KEY=sk_...

# Twilio — SMS alerts for urgent events (optional)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
CAREGIVER_PHONE_NUMBER=+1xxxxxxxxxx

# Resend — email alerts for urgent events (optional)
RESEND_API_KEY=re_...
CAREGIVER_EMAIL=caregiver@example.com
ALERT_FROM_EMAIL=Sensara <onboarding@resend.dev>
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Seed demo data

```bash
curl -X POST http://localhost:3000/api/seed
```

Inserts 3 mock residents, historical safety events, and caregiver notes into MongoDB Atlas.

---

## Alerts & Notifications

| Channel | Trigger | Cooldown |
|---|---|---|
| Browser TTS | Any severity change | 15 seconds |
| SMS (Twilio) | Urgent events only | 2 min per resident + event type |
| Email (Resend) | Urgent events only | 2 min per resident + event type |
| S3 Video Clip | Urgent events only | 2 min per event type |

---

## Disclaimer

Sensara is a **hackathon prototype for demonstrating assistive safety monitoring concepts**.

- It does not diagnose medical conditions
- It does not replace trained caregivers or medical staff
- It should not be used as the sole method for monitoring residents
- All data in this demo is entirely fictitious — no real patient information is used
- Any real deployment would require resident/guardian consent, end-to-end encryption, role-based access controls, and full compliance review (HIPAA, GDPR, etc.)

---

MIT — KeanHacks Hackathon
