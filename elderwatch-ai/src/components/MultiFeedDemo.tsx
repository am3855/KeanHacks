"use client";

import { useState, useCallback, useRef } from "react";
import DemoVideoTile, { type DemoFeedConfig, type DemoFeedStatus } from "./DemoVideoTile";
import FacilityAlertPanel, { type FeedAlert } from "./FacilityAlertPanel";

const DEMO_FEEDS: DemoFeedConfig[] = [
  {
    id: "feed1",
    room: "Room 204",
    resident: "Eleanor Brooks",
    residentId: "resident_001",
    risk: "High fall risk",
    videoFile: "fall-demo.mp4",
  },
  {
    id: "feed2",
    room: "Room 118",
    resident: "Robert Hayes",
    residentId: "resident_002",
    risk: "Post-surgery mobility",
    videoFile: "stable-demo.mp4",
  },
  {
    id: "feed3",
    room: "Room 312",
    resident: "Margaret Chen",
    residentId: "resident_003",
    risk: "Wandering / Memory care",
    videoFile: "wandering-demo.mp4",
  },
  {
    id: "feed4",
    room: "Lounge Area",
    resident: "Daniel Price",
    residentId: "demo_resident_004",
    risk: "Medium risk",
    videoFile: "choking-demo.mp4",
  },
];

interface FeedState extends DemoFeedStatus {
  alertSince: number;
}

const defaultFeedState: FeedState = {
  severity: "stable",
  eventType: "normal",
  reason: "No concerning activity detected",
  confidence: 0.95,
  alertSince: 0,
};

export default function MultiFeedDemo() {
  const [feedStates, setFeedStates] = useState<Record<string, FeedState>>({});
  // Track previous severity per feed so we preserve alertSince timestamp
  const prevSeverityRef = useRef<Record<string, string>>({});

  const handleStatusChange = useCallback((feedId: string, status: DemoFeedStatus) => {
    setFeedStates(prev => {
      const prevState = prev[feedId];
      const prevSeverity = prevSeverityRef.current[feedId] ?? "stable";

      // Only reset alertSince when severity transitions from stable → non-stable
      const alertSince =
        status.severity !== "stable" && prevSeverity === "stable"
          ? Date.now()
          : (prevState?.alertSince ?? Date.now());

      prevSeverityRef.current[feedId] = status.severity;
      return { ...prev, [feedId]: { ...status, alertSince } };
    });
  }, []);

  const alerts: FeedAlert[] = DEMO_FEEDS.map(feed => {
    const state = feedStates[feed.id] ?? defaultFeedState;
    return {
      feedId: feed.id,
      room: feed.room,
      resident: feed.resident,
      residentId: feed.residentId,
      severity: state.severity,
      eventType: state.eventType,
      reason: state.reason,
      confidence: state.confidence,
      alertSince: state.alertSince || Date.now(),
    };
  });

  const saveEvent = async (alert: FeedAlert) => {
    if (alert.severity === "stable") return;
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "multi_feed_demo",
        residentId: alert.residentId,
        residentName: alert.resident,
        room: alert.room,
        severity: alert.severity,
        eventType: alert.eventType,
        confidence: alert.confidence,
        reason: alert.reason,
        acknowledged: false,
      }),
    });
  };

  const handleSaveAll = async () => {
    const active = alerts.filter(a => a.severity !== "stable");
    await Promise.allSettled(active.map(saveEvent));
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Description banner */}
      <div className="bg-blue-950/30 border border-blue-900/50 rounded-xl px-4 py-3 flex items-start gap-3">
        <div className="w-8 h-8 bg-blue-900/60 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-blue-300 font-bold text-xs">
          4×
        </div>
        <div>
          <h2 className="text-white font-semibold text-sm">Multi-Room Command Center</h2>
          <p className="text-gray-400 text-xs mt-1 leading-relaxed">
            Simulated four-camera care-home command center using prerecorded video feeds. Designed to
            demonstrate how ElderWatch AI scales to multiple residents and rooms. Events are{" "}
            <span className="text-yellow-300">not automatically saved to MongoDB or uploaded to S3</span> —
            use the Save buttons to persist selected alerts.
          </p>
        </div>
      </div>

      {/* Main layout: 2×2 grid + alert panel */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start">
        {/* 2×2 video grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DEMO_FEEDS.map(feed => (
            <DemoVideoTile
              key={feed.id}
              config={feed}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>

        {/* Facility alert panel */}
        <FacilityAlertPanel
          alerts={alerts}
          onSaveToHistory={saveEvent}
          onSaveAll={handleSaveAll}
        />
      </div>
    </div>
  );
}
