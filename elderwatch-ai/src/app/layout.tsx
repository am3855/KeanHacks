import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ElderWatch AI — Real-time Safety Monitoring",
  description:
    "Prototype visual safety monitoring assistant for elderly care homes. Not a medical device.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-slate-950 min-h-screen">{children}</body>
    </html>
  );
}
