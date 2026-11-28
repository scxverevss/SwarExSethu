"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic, HeartPulse, Settings, Sparkles } from "lucide-react";

interface NavbarProps {
  rightSlot?: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/", label: "Elder Check-In", icon: Mic },
  { href: "/caregiver", label: "Caregiver Bridge", icon: HeartPulse },
  { href: "/settings", label: "Profiles & Meds", icon: Settings },
];

export function Navbar({ rightSlot }: NavbarProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-swar-100/80 bg-white/85 backdrop-blur-md">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-swar-600 via-swar-700 to-indigo-700 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-swar-600/20 group-hover:scale-105 transition-transform">
            S
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-lg sm:text-xl tracking-tight text-slate-900">
                SwarExSethu
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-swar-50 text-swar-700 border border-swar-200">
                <Sparkles className="w-2.5 h-2.5" /> Voice Care AI
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              Multilingual Elder Health &amp; Caregiver Companion
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/70">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  active
                    ? "bg-white text-swar-800 shadow-sm border border-swar-100"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? "text-swar-600" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {rightSlot && <div className="flex items-center gap-2.5">{rightSlot}</div>}
      </div>
    </header>
  );
}
