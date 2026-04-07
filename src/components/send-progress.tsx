"use client";

import type { SendResult } from "@/lib/types";

interface SendProgressProps {
  total: number;
  current: number;
  results: SendResult[];
  done: boolean;
}

export default function SendProgress({ total, current, results, done }: SendProgressProps) {
  const sentCount = results.filter((r) => r.status === "sent").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const failures = results.filter((r) => r.status === "failed");

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
      {!done ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-blue-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-gray-700 font-medium">
              Sending {current} of {total}&hellip;
            </p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">{percent}% complete</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-gray-900 font-semibold text-lg">Sending Complete</p>
          </div>
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{sentCount}</p>
              <p className="text-sm text-gray-500">Sent</p>
            </div>
            {failedCount > 0 && (
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">{failedCount}</p>
                <p className="text-sm text-gray-500">Failed</p>
              </div>
            )}
          </div>
        </div>
      )}

      {failures.length > 0 && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm font-medium text-red-600 mb-2">Failed sends:</p>
          <ul className="space-y-1">
            {failures.map((r) => (
              <li key={r.leadId} className="text-sm text-gray-700">
                <span className="font-medium">{r.firstName} {r.lastName}</span> ({r.phone})
                {r.error && <span className="text-red-500"> — {r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
