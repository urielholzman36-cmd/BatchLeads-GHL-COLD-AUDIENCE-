"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UploadZone from "@/components/upload-zone";
import { parseCSV, parseXLSX } from "@/lib/csv-parser";
import type { Lead } from "@/lib/types";
import { loadHistory, deleteSession, type OutreachSession } from "@/lib/history";

type Status =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "deduping"; count: number }
  | { kind: "done"; newLeads: Lead[]; skipped: number }
  | { kind: "error"; message: string };

export default function UploadPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [history, setHistory] = useState<OutreachSession[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  function openSession(session: OutreachSession) {
    sessionStorage.setItem("outreach_leads", JSON.stringify(session.rawLeads));
    router.push("/review");
  }

  function removeSession(id: string) {
    deleteSession(id);
    setHistory(loadHistory());
  }

  async function handleFileLoaded(file: File) {
    setStatus({ kind: "parsing" });

    const ext = file.name.split(".").pop()?.toLowerCase();
    let leads: Lead[];

    try {
      if (ext === "xlsx" || ext === "xls") {
        const buffer = await file.arrayBuffer();
        leads = parseXLSX(buffer);
      } else {
        const text = await file.text();
        leads = parseCSV(text);
      }
    } catch {
      setStatus({ kind: "error", message: "Could not parse this file. Make sure it's a valid CSV or Excel file." });
      return;
    }

    if (leads.length === 0) {
      setStatus({ kind: "error", message: "No valid leads found in this file (leads need at least a phone number)." });
      return;
    }

    setStatus({ kind: "deduping", count: leads.length });

    const phones = leads.map((l) => l.phone).filter(Boolean);

    let dedupResults: Record<string, boolean> = {};
    try {
      const res = await fetch("/api/dedup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones }),
      });
      if (res.ok) {
        const data = await res.json();
        dedupResults = data.results ?? {};
      }
    } catch {
      // dedup failure is non-fatal; proceed with all leads
    }

    const newLeads = leads.filter((l) => !dedupResults[l.phone]);
    const skipped = leads.length - newLeads.length;

    setStatus({ kind: "done", newLeads, skipped });
  }

  function handleProceed() {
    if (status.kind !== "done") return;
    sessionStorage.setItem("outreach_leads", JSON.stringify(status.newLeads));
    router.push("/review");
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[2rem] mb-12 animate-rise">
        {/* Gradient backdrop */}
        <div className="absolute inset-0 vo360-gradient-animated opacity-95" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1020]/40 via-transparent to-transparent" />

        {/* Decorative orbits */}
        <div className="absolute top-1/2 right-[-120px] -translate-y-1/2 w-[520px] h-[520px] rounded-full border border-white/15 animate-spin-slow pointer-events-none" />
        <div className="absolute top-1/2 right-[-80px] -translate-y-1/2 w-[380px] h-[380px] rounded-full border border-white/20 animate-spin-slow pointer-events-none" style={{ animationDirection: "reverse", animationDuration: "22s" }} />
        <div className="absolute top-1/2 right-[-40px] -translate-y-1/2 w-[240px] h-[240px] rounded-full border border-white/25 animate-spin-slow pointer-events-none" />

        {/* Glow blobs */}
        <div className="absolute -top-32 -left-20 w-80 h-80 rounded-full bg-[#ff7a1a] opacity-30 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-100px] left-1/3 w-96 h-96 rounded-full bg-[#1e2a78] opacity-50 blur-3xl pointer-events-none" />

        <div className="relative grid md:grid-cols-[1.4fr_1fr] gap-6 px-8 md:px-12 py-10 md:py-12">
          <div className="text-white">
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-semibold text-white/90 bg-white/10 border border-white/20 backdrop-blur-md rounded-full px-3 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Your Intelligent Execution Partner
            </div>
            <h1 className="font-display text-3xl md:text-4xl lg:text-[2.75rem] font-light leading-[1.1] tracking-tight">
              Cold leads, <span className="italic font-medium">warmed by</span> <span className="font-bold">intelligence.</span>
            </h1>
            <p className="text-white/80 mt-4 max-w-md text-sm leading-relaxed">
              Upload a BatchLeads export. We dedupe, score every contact 0–100 across 5 weighted categories, and draft personalized SMS — ready to fire through GoHighLevel.
            </p>

            <div className="mt-5 flex flex-wrap gap-5 text-xs text-white/80">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center font-bold text-white text-xs">1</span>
                Upload
              </div>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center font-bold text-white text-xs">2</span>
                Score
              </div>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center font-bold text-white text-xs">3</span>
                Send via GHL
              </div>
            </div>
          </div>

          {/* Logo showcase */}
          <div className="hidden md:flex items-center justify-center relative">
            <div className="absolute inset-0 bg-white/10 backdrop-blur-sm rounded-full blur-2xl" />
            <div className="relative animate-float">
              <Image
                src="/vo360-logo.png"
                alt="VO360"
                width={220}
                height={220}
                priority
                className="drop-shadow-[0_20px_50px_rgba(0,0,0,0.4)]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Upload card */}
      <div className="max-w-2xl mx-auto -mt-2 animate-rise" style={{ animationDelay: "0.15s" }}>
        <div className="rounded-3xl border border-white/60 bg-white/80 backdrop-blur-md p-6 shadow-[0_30px_80px_-40px_rgba(30,42,120,0.4)]">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-6 rounded-full vo360-gradient-bg" />
            <h2 className="font-display text-xl font-semibold text-[#0b1020]">
              Drop your file
            </h2>
          </div>
          <UploadZone onFileLoaded={handleFileLoaded} />

      {status.kind !== "idle" && (
        <div className="mt-6 p-4 rounded-xl border border-gray-200 bg-white">
          {status.kind === "parsing" && (
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-gray-700">Reading file&hellip;</p>
            </div>
          )}

          {status.kind === "deduping" && (
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-gray-700">
                Found <strong>{status.count}</strong> leads. Checking for duplicates&hellip;
              </p>
            </div>
          )}

          {status.kind === "done" && (
            <div className="space-y-3">
              <p className="text-gray-700">
                <strong className="text-green-600">{status.newLeads.length} new leads</strong>
                {status.skipped > 0 && (
                  <span className="text-gray-500">, {status.skipped} already contacted (skipped)</span>
                )}
              </p>
              {status.newLeads.length > 0 ? (
                <button
                  onClick={handleProceed}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
                >
                  Score &amp; Generate Messages
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <p className="text-gray-500 text-sm">All leads have already been contacted.</p>
              )}
            </div>
          )}

          {status.kind === "error" && (
            <p className="text-red-600">{status.message}</p>
          )}
        </div>
      )}
        </div>
      </div>

      {/* Recent Uploads */}
      {history.length > 0 && (
        <section className="mt-20 animate-rise" style={{ animationDelay: "0.3s" }}>
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-[#1e2a78]/70 flex items-center gap-2">
                <span className="w-6 h-px bg-[#1e2a78]/30" />
                History
              </div>
              <h2 className="font-display text-4xl font-light text-[#0b1020] mt-2 tracking-tight">
                Your <span className="italic">recent</span> sessions
              </h2>
            </div>
            <span className="text-xs text-gray-500">
              {history.length} session{history.length === 1 ? "" : "s"} cached locally
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map((s) => {
              const scored = s.scoredLeads ?? [];
              const high = scored.filter((l) => l.bucket === "HIGH").length;
              const medium = scored.filter((l) => l.bucket === "MEDIUM").length;
              const low = scored.filter((l) => l.bucket === "LOW").length;
              const date = new Date(s.createdAt);
              return (
                <div
                  key={s.id}
                  className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 hover:border-[#d633a0]/40 hover:shadow-[0_20px_50px_-30px_rgba(214,51,160,0.5)] transition-all cursor-pointer"
                  onClick={() => openSession(s)}
                >
                  <div className="absolute inset-x-0 top-0 h-1 vo360-gradient-bg opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-gray-400">
                        {date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}{" "}
                        ·{" "}
                        {date.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="font-semibold text-[#0b1020] truncate mt-0.5">
                        {s.label}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${s.label}"?`)) removeSession(s.id);
                      }}
                      className="text-gray-300 hover:text-red-500 p-1 -m-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Delete session"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold vo360-gradient-text">
                      {s.rawLeads.length}
                    </span>
                    <span className="text-xs text-gray-500">leads</span>
                  </div>

                  {scored.length > 0 ? (
                    <div className="mt-4 flex gap-1.5 text-[11px] font-medium">
                      <span className="flex-1 text-center px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-100">
                        {high} high
                      </span>
                      <span className="flex-1 text-center px-2 py-1 rounded-md bg-yellow-50 text-yellow-700 border border-yellow-100">
                        {medium} med
                      </span>
                      <span className="flex-1 text-center px-2 py-1 rounded-md bg-red-50 text-red-700 border border-red-100">
                        {low} low
                      </span>
                    </div>
                  ) : (
                    <div className="mt-4 text-[11px] text-gray-400 italic">
                      Not yet scored
                    </div>
                  )}

                  <div className="mt-4 flex items-center text-xs font-medium text-[#1e2a78] group-hover:text-[#d633a0] transition-colors">
                    Open session
                    <svg className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
