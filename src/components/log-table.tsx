"use client";

import type { SendLogEntry } from "@/lib/types";

interface LogTableProps {
  entries: SendLogEntry[];
}

function StatusBadge({ status }: { status: "sent" | "failed" }) {
  return status === "sent" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      Sent
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      Failed
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  let color = "bg-red-100 text-red-700";
  if (score >= 7) color = "bg-green-100 text-green-700";
  else if (score >= 4) color = "bg-yellow-100 text-yellow-700";
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${color}`}>
      {score}
    </span>
  );
}

function formatDate(dateStr: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export default function LogTable({ entries }: LogTableProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium">No sends logged yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Date</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Name</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Phone</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Address</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Score</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600 min-w-[200px]">Message</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                {formatDate(entry.sentAt)}
              </td>
              <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                {entry.firstName} {entry.lastName}
              </td>
              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{entry.phone}</td>
              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{entry.address}</td>
              <td className="px-4 py-3">
                <ScoreBadge score={entry.score} />
              </td>
              <td className="px-4 py-3 text-gray-700 max-w-[260px]">
                <span
                  className="block truncate"
                  title={entry.message}
                >
                  {entry.message}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={entry.status} />
                {entry.error && (
                  <p className="text-xs text-red-500 mt-1">{entry.error}</p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
