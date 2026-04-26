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
        // Sensara brand palette
        sensara: {
          cream:   "#f4f0e8",
          card:    "#ffffff",
          border:  "#d4c9b0",
          divider: "#e8e0d0",
          forest: {
            950: "#0f1f18",
            900: "#1a2e25",
            800: "#2f4a3a",
            700: "#3d6b52",
            600: "#4d8566",
            500: "#5a9e78",
            400: "#7ab896",
            300: "#9ecfb4",
            200: "#c2e4d2",
            100: "#e6f5ed",
          },
          warm: {
            700: "#5c6b62",
            600: "#7a8a80",
            500: "#8a9a90",
            400: "#b0bdb6",
            300: "#d4c9b0",
            200: "#e8e0d0",
            100: "#f4f1eb",
          },
        },
        // Severity colors (unchanged — critical for readability)
        stable: { bg: "#166534", border: "#22c55e", text: "#86efac" },
        watch:  { bg: "#713f12", border: "#eab308", text: "#fde047" },
        assist: { bg: "#7c2d12", border: "#f97316", text: "#fdba74" },
        urgent: { bg: "#7f1d1d", border: "#ef4444", text: "#fca5a5" },
      },
    },
  },
  plugins: [],
};

export default config;
