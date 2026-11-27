import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SwarExSethu — Voice Health Companion",
  description: "Voice-first health check-in, medication adherence & caregiver bridge for Indian households",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">{children}</body>
    </html>
  );
}