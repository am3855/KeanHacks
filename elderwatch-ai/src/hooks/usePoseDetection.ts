"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PoseLandmark } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// usePoseDetection — MediaPipe Pose Landmarker + Webcam Integration Hook
//
// Manages the full lifecycle:
//   1. Request webcam access
//   2. Lazily initialize MediaPipe PoseLandmarker from CDN
//   3. Run detectForVideo() in a requestAnimationFrame loop
//   4. Expose current landmarks, visibility status, and references to the
//      video/canvas elements for rendering
// ─────────────────────────────────────────────────────────────────────────────

export type PoseStatus = "idle" | "loading" | "running" | "no-webcam" | "error";

export interface PoseDetectionResult {
  landmarks: PoseLandmark[] | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  status: PoseStatus;
  errorMessage: string | null;
  stream: MediaStream | null;
}

const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export function usePoseDetection(): PoseDetectionResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<unknown>(null);
  const animFrameRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const streamRef = useRef<MediaStream | null>(null);

  const [landmarks, setLandmarks] = useState<PoseLandmark[] | null>(null);
  const [status, setStatus] = useState<PoseStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // ─── Initialize MediaPipe and webcam ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setStatus("loading");

      // 1. Request webcam
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
      } catch (err) {
        if (!cancelled) {
          setStatus("no-webcam");
          setErrorMessage(
            "Webcam access denied or unavailable. Please allow camera access and refresh."
          );
        }
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      setStream(stream);
      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve).catch(resolve);
        };
      });

      // Resize canvas to match video
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
      }

      // 2. Load MediaPipe dynamically (avoids SSR issues)
      let PoseLandmarker: unknown, FilesetResolver: unknown;
      try {
        const mp = await import("@mediapipe/tasks-vision");
        PoseLandmarker = mp.PoseLandmarker;
        FilesetResolver = mp.FilesetResolver;
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Failed to load MediaPipe. Check your network connection.");
        }
        return;
      }

      if (cancelled) return;

      // 3. Create the pose landmarker
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vision = await (FilesetResolver as any).forVisionTasks(MEDIAPIPE_WASM);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        poseLandmarkerRef.current = await (PoseLandmarker as any).createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (err) {
        // GPU delegate may fail on some browsers — retry with CPU
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const vision = await (FilesetResolver as any).forVisionTasks(MEDIAPIPE_WASM);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          poseLandmarkerRef.current = await (PoseLandmarker as any).createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            runningMode: "VIDEO",
            numPoses: 1,
          });
        } catch (retryErr) {
          if (!cancelled) {
            setStatus("error");
            setErrorMessage("Failed to initialize pose detection model.");
          }
          return;
        }
      }

      if (cancelled) return;
      setStatus("running");
      startLoop();
    }

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      poseLandmarkerRef.current = null;
    };
  }, []);

  // ─── Frame detection loop ──────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    function loop() {
      const video = videoRef.current;
      const landmarker = poseLandmarkerRef.current;

      if (!video || !landmarker || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      const now = performance.now();
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results = (landmarker as any).detectForVideo(video, now);
          if (results.landmarks && results.landmarks.length > 0) {
            // MediaPipe returns normalized landmarks; cast to our PoseLandmark type
            setLandmarks(results.landmarks[0] as PoseLandmark[]);
          } else {
            setLandmarks(null);
          }
        } catch {
          // Frame processing error — skip silently
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    }
    animFrameRef.current = requestAnimationFrame(loop);
  }, []);

  return { landmarks, videoRef, canvasRef, status, errorMessage, stream };
}
