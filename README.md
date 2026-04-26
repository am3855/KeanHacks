# Sensara — AI-Powered Elder Care Monitoring
Real-time visual and audio safety monitoring for elderly care homes.



## The Problem
Care facilities are chronically understaffed. Caregivers are stretched thin across dozens of residents with different mobility limitations and fall-risk profiles. When a resident falls, wanders, or begins choking — they may not be able to reach a call button. Continuous manual surveillance is not feasible.

Sensara gives caregivers a real-time AI safety layer that monitors residents through a standard webcam and microphone with no specialized hardware required.

## What It Does
Sensara runs MediaPipe pose detection entirely in the browser, extracting 33 body landmarks per frame. It computes safety signals (posture angle, stillness duration, safe-zone position, hand placement) and classifies the resident's current state every frame. When a concern is detected, caregivers are alerted visually, by text-to-speech, SMS, and email — and every event is persisted to MongoDB Atlas for longitudinal history and analytics.

## Two Modes
**Multi-Feed Demo** — A simulated 4-camera care-home command center using prerecorded video files. Demonstrates how Sensara scales across multiple residents and rooms simultaneously, with a Facility Alert Panel showing a live sorted alert queue (Urgent first) with wait timers and save-to-history buttons.

**Live Camera Demo** — Full real-time webcam monitoring including pose skeleton overlay, draggable safe zone, audio distress detection, AI care guidance, and critical event video clip recording to S3.

## Detection Capabilities
| Detection | How It Works |
|---|---|
| Fall | Torso angle >50° and stillness >10s → Urgent |
| Immobility | No significant movement for >5 minutes → Assist |
| Wandering | Torso center exits safe zone for >3 continuous seconds → Watch |
| Unsafe posture | Torso angle >35° sustained for >3s → Watch/Assist |
| Choking (visual) | Both wrists near throat for >4 continuous seconds → Urgent |
| Audio distress | ElevenLabs transcribes mic; distress keywords trigger Urgent/Assist |
| Out of frame | Key landmarks not visible → Watch |


## Tech Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Pose Detection | MediaPipe Pose Landmarker — runs entirely in-browser |
| Database | MongoDB Atlas |
| Video Storage | Amazon S3 |
| Video Capture | Browser MediaRecorder API |
| Audio STT | ElevenLabs scribe_v2 |
| SMS Alerts | Twilio Programmable Messaging |
| Email Alerts | Resend |
| AI Assistant | Anthropic Claude API (claude-haiku) |
| TTS Alerts | Web Speech API |

## MongoDB Atlas
Every detected safety event is stored as a document in real time. Collections: `safety_events`, `residents`, `caregiver_notes`, `video_clips`. Aggregation pipelines power 24-hour analytics and per-resident history. App runs fully in-memory demo mode if `MONGODB_URI` is not set.
