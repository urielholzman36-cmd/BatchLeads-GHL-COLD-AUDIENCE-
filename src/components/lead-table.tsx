"use client";

import type { ScoredLead } from "@/lib/types";

interface LeadTableProps {
  leads: ScoredLead[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUpdateMessage: (id: string, message: string) => void;
}

function ScoreBadge({ score }: { score: number }) {
  let color = "bg-red-100 text-red-700";
  if (score >= 7) color = "bg-green-100 text-green-700";
  else if (score >= 4) color = "bg-yellow-100 text-yellow-700";
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${color}`}>
      {score}
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

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
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
              <th className="px-3 py-3 text-left font-semibold text-gray-600 min-w-[260px]">SMS Message</th>
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
                  <ScoreBadge score={lead.score} />
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
                <td className="px-3 py-3">
                  <textarea
                    value={lead.message}
                    onChange={(e) => onUpdateMessage(lead.id, e.target.value)}
                    rows={3}
                    className="w-full min-w-[240px] text-sm border border-gray-200 rounded-lg p-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
