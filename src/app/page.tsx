"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UploadZone from "@/components/upload-zone";
import { parseCSV, parseXLSX } from "@/lib/csv-parser";
import type { Lead } from "@/lib/types";

type Status =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "deduping"; count: number }
  | { kind: "done"; newLeads: Lead[]; skipped: number }
  | { kind: "error"; message: string };

export default function UploadPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Upload Leads</h1>
      <p className="text-gray-500 mb-8">
        Upload a CSV or Excel file from BatchLeads. We&apos;ll check for duplicates and score each lead automatically.
      </p>

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
  );
}
