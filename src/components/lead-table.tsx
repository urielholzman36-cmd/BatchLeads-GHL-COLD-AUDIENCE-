"use client";

import { useState } from "react";
import type { ScoredLead, Bucket, ScoreBreakdown } from "@/lib/types";

interface LeadTableProps {
  leads: ScoredLead[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUpdateMessage: (id: string, message: string) => void;
}

function BucketBadge({
  bucket,
  total,
  breakdown,
}: {
  bucket: Bucket;
  total: number;
  breakdown: ScoreBreakdown;
}) {
  const styles: Record<Bucket, string> = {
    HIGH: "bg-green-100 text-green-700",
    MEDIUM: "bg-yellow-100 text-yellow-700",
    LOW: "bg-gray-100 text-gray-600",
    DISCARD: "bg-red-100 text-red-700",
  };
  const tooltip = [
    `Total: ${total}/100`,
    `Financial: ${breakdown.financial.score}/30`,
    `Condition: ${breakdown.condition.score}/25`,
    `Timing: ${breakdown.timing.score}/20`,
    `Owner: ${breakdown.owner.score}/15`,
    `Contact: ${breakdown.contact.score}/10`,
  ].join("\n");
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-bold ${styles[bucket]}`}
    >
      {bucket} · {total}
    </span>
  );
}

export default function LeadTable({
  leads,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onUpdateMessage,
}: LeadTableProps) {
  const selectedCount = leads.filter((l) => l.selected).length;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewLead = previewId ? leads.find((l) => l.id === previewId) : null;

  if (leads.length === 0) {
    return <p className="text-gray-500 py-8 text-center">No leads to display.</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <button
          onClick={onSelectAll}
          className="text-sm text-blue-600 hover:underline"
        >
          Select All
        </button>
        <button
          onClick={onDeselectAll}
          className="text-sm text-gray-500 hover:underline"
        >
          Deselect All
        </button>
        <span className="text-sm text-gray-600 ml-auto">
          {selectedCount} of {leads.length} selected
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200" style={{ transform: "rotateX(180deg)" }}>
        <table className="min-w-full text-sm" style={{ transform: "rotateX(180deg)" }}>
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 text-left w-8"></th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Score</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Reason</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Name</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Phone</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Address</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Yr Built</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Sqft</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">Equity</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 w-[260px]">SMS Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className={lead.selected ? "bg-blue-50" : "hover:bg-gray-50"}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={lead.selected}
                    onChange={() => onToggleSelect(lead.id)}
                    className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                  />
                </td>
                <td className="px-3 py-3">
                  <BucketBadge bucket={lead.bucket} total={lead.score} breakdown={lead.breakdown} />
                </td>
                <td className="px-3 py-3 text-gray-600 max-w-[200px]">
                  <span className="line-clamp-2" title={lead.scoreReason}>
                    {lead.scoreReason}
                  </span>
                </td>
                <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">
                  {lead.firstName} {lead.lastName}
                </td>
                <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{lead.phone}</td>
                <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                  {lead.propertyAddress}, {lead.city}
                </td>
                <td className="px-3 py-3 text-gray-700">{lead.yearBuilt ?? "—"}</td>
                <td className="px-3 py-3 text-gray-700">
                  {lead.sqft != null ? lead.sqft.toLocaleString() : "—"}
                </td>
                <td className="px-3 py-3 text-gray-700">
                  {lead.equityPercent != null ? `${lead.equityPercent}%` : "—"}
                </td>
                <td className="px-3 py-3 align-top w-[260px]">
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-gray-700 leading-snug line-clamp-2 min-h-[2.5rem]">
                      {lead.message || <span className="italic text-gray-400">No message yet</span>}
                    </p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">{lead.message.length} chars</span>
                      <button
                        type="button"
                        onClick={() => setPreviewId(lead.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Preview & Edit
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {previewLead && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreviewId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  SMS Preview
                </div>
                <div className="mt-1 font-semibold text-gray-900">
                  {previewLead.firstName} {previewLead.lastName}
                </div>
                <div className="text-sm text-gray-500">
                  {previewLead.phone} · {previewLead.propertyAddress}, {previewLead.city}
                </div>
              </div>
              <button
                onClick={() => setPreviewId(null)}
                className="text-gray-400 hover:text-gray-700 p-1"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-3">
                <p className="text-[15px] leading-relaxed text-gray-900 whitespace-pre-wrap break-words">
                  {previewLead.message || (
                    <span className="italic text-gray-400">No message generated.</span>
                  )}
                </p>
              </div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Edit message
              </label>
              <textarea
                value={previewLead.message}
                onChange={(e) => onUpdateMessage(previewLead.id, e.target.value)}
                rows={6}
                className="w-full text-sm leading-relaxed text-gray-800 border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>{previewLead.message.length} characters</span>
                <span>~{Math.max(1, Math.ceil(previewLead.message.length / 160))} SMS segment(s)</span>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(previewLead.message);
                }}
                className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100"
              >
                Copy
              </button>
              <button
                onClick={() => setPreviewId(null)}
                className="text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
