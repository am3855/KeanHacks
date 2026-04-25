import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      animation: {
        "pulse-urgent": "pulseUrgent 1s ease-in-out infinite",
        "pulse-assist": "pulseAssist 1.5s ease-in-out infinite",
        "pulse-watch": "pulseWatch 2s ease-in-out infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-in": "slideIn 0.2s ease-out",
      },
      keyframes: {
        pulseUrgent: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.7)" },
          "50%": { boxShadow: "0 0 0 12px rgba(239, 68, 68, 0)" },
        },
        pulseAssist: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(249, 115, 22, 0.6)" },
          "50%": { boxShadow: "0 0 0 10px rgba(249, 115, 22, 0)" },
        },
        pulseWatch: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(234, 179, 8, 0.5)" },
          "50%": { boxShadow: "0 0 0 8px rgba(234, 179, 8, 0)" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      colors: {
        stable: { bg: "#166534", border: "#22c55e", text: "#86efac" },
        watch: { bg: "#713f12", border: "#eab308", text: "#fde047" },
        assist: { bg: "#7c2d12", border: "#f97316", text: "#fdba74" },
        urgent: { bg: "#7f1d1d", border: "#ef4444", text: "#fca5a5" },
      },
    },
  },
  plugins: [],
};

export default config;
