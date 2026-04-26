"use client";

import { useState } from "react";
import type { ResidentProfile, SafetyClassification } from "@/lib/types";

interface AIAssistantProps {
  resident: ResidentProfile | null;
  classification: SafetyClassification;
}

interface AssistantResponse {
  guidance: string;
  disclaimer: string;
  generatedBy: "claude" | "mock";
}

const QUICK_QUESTIONS = [
  "What should I do?",
  "Is this an emergency?",
  "How do I help the resident?",
  "What should I document?",
];

export default function AIAssistant({ resident, classification }: AIAssistantProps) {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function askQuestion(q: string) {
    if (!resident || !q.trim()) return;
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, resident, classification }),
      });
      if (!res.ok) throw new Error("Assistant unavailable");
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setError("Could not reach the assistant. Please check on the resident directly.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-sensara-border p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-lg">🤖</span>
        <div>
          <h3 className="text-sensara-forest-900 font-semibold text-sm">AI Care Assistant</h3>
          <p className="text-sensara-warm-500 text-[10px]">General guidance only — not medical advice</p>
        </div>
      </div>

      {/* Quick question chips */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => { setQuestion(q); askQuestion(q); }}
            className="text-xs bg-sensara-warm-100 hover:bg-sensara-warm-200 text-sensara-forest-700 border border-sensara-border rounded-full px-3 py-1 transition-colors"
            disabled={loading}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && askQuestion(question)}
          placeholder="Ask about this situation…"
          className="flex-1 text-sm bg-sensara-warm-100 text-sensara-forest-900 rounded-lg px-3 py-2 border border-sensara-border focus:outline-none focus:ring-1 focus:ring-sensara-forest-500"
          disabled={loading}
        />
        <button
          onClick={() => askQuestion(question)}
          disabled={loading || !question.trim()}
          className="bg-sensara-forest-700 hover:bg-sensara-forest-600 disabled:bg-sensara-warm-200 disabled:text-sensara-warm-500 text-white rounded-lg px-3 py-2 text-sm transition-colors"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
          ) : "Ask"}
        </button>
      </div>

      {/* Response */}
      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {response && (
        <div className="bg-sensara-warm-100 border border-sensara-divider rounded-lg p-3 space-y-2 animate-fade-in">
          <p className="text-sensara-forest-800 text-sm leading-relaxed">{response.guidance}</p>
          <p className="text-[10px] text-sensara-warm-500 border-t border-sensara-divider pt-1.5">
            ⚠️ {response.disclaimer}
          </p>
          {response.generatedBy === "mock" && (
            <p className="text-[10px] text-sensara-warm-400">
              (Mock guidance — set ANTHROPIC_API_KEY to enable Claude)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
