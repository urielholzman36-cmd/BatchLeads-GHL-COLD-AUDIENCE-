"use client";

import { useEffect, useState } from "react";
import LogTable from "@/components/log-table";
import type { SendLogEntry } from "@/lib/types";

type StatusFilter = "all" | "sent" | "failed";

export default function LogPage() {
  const [entries, setEntries] = useState<SendLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");

  async function fetchLog(statusFilter: StatusFilter) {
    setLoading(true);
    try {
      const url = statusFilter === "all" ? "/api/log" : `/api/log?status=${statusFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLog(filter);
  }, [filter]);

  const visibleEntries = entries;

  function handleExportCSV() {
    if (visibleEntries.length === 0) return;

    const headers = ["Date", "Name", "Phone", "Address", "Score", "Message", "Status", "Error"];
    const rows = visibleEntries.map((e) => [
      e.sentAt,
      `${e.firstName} ${e.lastName}`,
      e.phone,
      e.address,
      String(e.score),
      e.message,
      e.status,
      e.error ?? "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vo360-send-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filterOptions: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "all" },
    { label: "Sent", value: "sent" },
    { label: "Failed", value: "failed" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Send Log</h1>
          {!loading && (
            <p className="text-gray-500 mt-1">{visibleEntries.length} record{visibleEntries.length !== 1 ? "s" : ""}</p>
          )}
        </div>
        <button
          onClick={handleExportCSV}
          disabled={visibleEntries.length === 0}
          className="inline-flex items-center gap-2 border border-gray-300 hover:border-gray-400 bg-white text-gray-700 font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 mb-5">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === opt.value
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      ) : (
        <LogTable entries={visibleEntries} />
      )}
    </div>
  );
}
