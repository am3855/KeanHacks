"use client";

import { useEffect, useRef } from "react";
import { POSE_CONNECTIONS } from "@/lib/poseHelpers";
import type { PoseLandmark, SafeZone, ResidentStatusValue } from "@/lib/types";
import type { PoseStatus } from "@/hooks/usePoseDetection";

// ─────────────────────────────────────────────────────────────────────────────
// PoseCamera — Renders video + skeleton overlay on a canvas, plus the safe zone
// rectangle and a live status chip in the corner.
// ─────────────────────────────────────────────────────────────────────────────

interface PoseCameraProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  landmarks: PoseLandmark[] | null;
  status: PoseStatus;
  errorMessage: string | null;
  safeZone: SafeZone;
  severity: ResidentStatusValue;
}

const SEVERITY_COLORS: Record<ResidentStatusValue, string> = {
  stable: "#22c55e",
  watch: "#eab308",
  assist: "#f97316",
  urgent: "#ef4444",
};

const SKELETON_COLOR = "#60a5fa"; // blue-400
const JOINT_COLOR = "#93c5fd";    // blue-300
const SAFE_ZONE_COLOR = "rgba(34, 197, 94, 0.35)";
const SAFE_ZONE_BORDER = "#22c55e";

export default function PoseCamera({
  videoRef,
  canvasRef,
  landmarks,
  status,
  errorMessage,
  safeZone,
  severity,
}: PoseCameraProps) {
  const drawingRef = useRef<number>(0);

  // ─── Canvas drawing loop ───────────────────────────────────────────────────
  useEffect(() => {
    function draw() {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || video.readyState < 2) {
        drawingRef.current = requestAnimationFrame(draw);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        drawingRef.current = requestAnimationFrame(draw);
        return;
      }

      // Match canvas dimensions to actual video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
      }

      const W = canvas.width;
      const H = canvas.height;

      // 1. Draw mirrored video frame
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, W, H);
      ctx.restore();

      // 2. Draw safe zone rectangle
      const szX = safeZone.x * W;
      const szY = safeZone.y * H;
      const szW = safeZone.width * W;
      const szH = safeZone.height * H;
      ctx.fillStyle = SAFE_ZONE_COLOR;
      ctx.fillRect(szX, szY, szW, szH);
      ctx.strokeStyle = SAFE_ZONE_BORDER;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(szX, szY, szW, szH);
      ctx.setLineDash([]);

      // Safe zone label
      ctx.fillStyle = SAFE_ZONE_BORDER;
      ctx.font = "bold 11px monospace";
      ctx.fillText("SAFE ZONE", szX + 6, szY + 14);

      // 3. Draw skeleton if landmarks are available
      if (landmarks && landmarks.length > 0) {
        // Mirror landmark X coordinates to match the flipped video
        const mirrorX = (x: number) => 1 - x;

        // Draw bone connections
        ctx.strokeStyle = SKELETON_COLOR;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        for (const [a, b] of POSE_CONNECTIONS) {
          const lmA = landmarks[a];
          const lmB = landmarks[b];
          if (!lmA || !lmB) continue;
          // Skip low-visibility landmarks
          if (
            (lmA.visibility !== undefined && lmA.visibility < 0.3) ||
            (lmB.visibility !== undefined && lmB.visibility < 0.3)
          ) continue;

          ctx.beginPath();
          ctx.moveTo(mirrorX(lmA.x) * W, lmA.y * H);
          ctx.lineTo(mirrorX(lmB.x) * W, lmB.y * H);
          ctx.stroke();
        }

        // Draw joints
        for (let i = 0; i < landmarks.length; i++) {
          const lm = landmarks[i];
          if (!lm) continue;
          if (lm.visibility !== undefined && lm.visibility < 0.3) continue;
          ctx.beginPath();
          ctx.arc(mirrorX(lm.x) * W, lm.y * H, 4, 0, 2 * Math.PI);
          ctx.fillStyle = JOINT_COLOR;
          ctx.fill();
          ctx.strokeStyle = "#1e40af";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // 4. Severity status chip (top-left)
      const chipColor = SEVERITY_COLORS[severity];
      const chipLabel = severity.toUpperCase();
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.beginPath();
      ctx.roundRect?.(8, 8, 110, 28, 6) ?? ctx.fillRect(8, 8, 110, 28);
      ctx.fill();
      ctx.fillStyle = chipColor;
      ctx.font = "bold 13px monospace";
      ctx.fillText(`● ${chipLabel}`, 16, 27);

      drawingRef.current = requestAnimationFrame(draw);
    }

    drawingRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(drawingRef.current);
  }, [landmarks, safeZone, severity, videoRef, canvasRef]);

  // ─── Status overlay messages ───────────────────────────────────────────────
  const overlayContent = (() => {
    if (status === "loading") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 text-white gap-3">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-300">Loading pose detection model…</p>
        </div>
      );
    }
    if (status === "no-webcam" || status === "error") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 text-white gap-3 px-6 text-center">
          <svg className="w-12 h-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.893L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          <p className="text-sm text-red-300">{errorMessage || "Camera unavailable"}</p>
          <p className="text-xs text-gray-400">Safety classification is paused.</p>
        </div>
      );
    }
    if (status === "idle") {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/70">
          <p className="text-gray-400 text-sm">Initializing…</p>
        </div>
      );
    }
    return null;
  })();

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-gray-900 border border-gray-700">
      {/* Hidden video element — feed for MediaPipe */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        autoPlay
      />

      {/* Canvas — shows mirrored video + skeleton overlay */}
      <canvas
        ref={canvasRef}
        className="w-full h-auto block"
        style={{ aspectRatio: "4/3", background: "#111827" }}
      />

      {/* Status overlay (loading / error) */}
      {overlayContent}

      {/* Legend */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1 bg-black/50 rounded-lg px-2 py-1.5 text-[10px] text-gray-300">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-blue-400" />
          <span>Skeleton</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-green-500 border-dashed" />
          <span>Safe Zone</span>
        </div>
      </div>
    </div>
  );
}
