import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import Image from "next/image";
import "./globals.css";
import Link from "next/link";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VO360 Outreach",
  description: "Lead outreach for home remodeling",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
        lang="en"
        className={`${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
      >
        <body className="min-h-screen">
          <nav className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-6xl rounded-2xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-4 px-4 py-2.5">
              <Link href="/" className="flex items-center gap-2.5 group shrink-0 cursor-pointer">
                <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200/70">
                  <Image
                    src="/vo360-logo.png"
                    alt="VO360"
                    width={36}
                    height={36}
                    priority
                    className="object-contain"
                  />
                </span>
                <span className="flex flex-col leading-none">
                  <span className="text-base font-bold tracking-tight">
                    <span className="text-slate-900">vo</span>
                    <span className="brand-gradient-text">360</span>
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.18em] text-slate-400 mt-0.5">
                    Outreach
                  </span>
                </span>
              </Link>

              <div className="hidden md:flex items-center gap-1 mx-auto">
                <Link
                  href="/"
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100/80 transition-colors cursor-pointer"
                >
                  Home
                </Link>
                <Link
                  href="/review"
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100/80 transition-colors cursor-pointer"
                >
                  Review
                </Link>
              </div>

              <div className="ml-auto md:ml-0 flex items-center gap-2">
                <Link
                  href="/"
                  style={{ background: "linear-gradient(135deg, #1E1B4B 0%, #DB2777 50%, #F97316 100%)" }}
                  className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-white px-3.5 py-2 rounded-full shadow-[0_4px_14px_-4px_rgba(219,39,119,0.5)] hover:shadow-[0_6px_20px_-4px_rgba(219,39,119,0.6)] transition-all cursor-pointer"
                >
                  <span className="text-base leading-none">+</span> New Session
                </Link>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-16">{children}</main>
        </body>
      </html>
  );
}
