"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LeadTable from "@/components/lead-table";
import type { Lead, ScoredLead } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

type PageState =
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; leads: ScoredLead[] };

export default function ReviewPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>({ kind: "loading", message: "Scoring leads..." });
  const [guidelines, setGuidelines] = useState("");
  const [link1, setLink1] = useState("");
  const [link2, setLink2] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const rawLeadsRef = useRef<Lead[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem("outreach_leads");
    if (!stored) {
      router.replace("/");
      return;
    }

    let leads: Lead[];
    try {
      leads = JSON.parse(stored);
    } catch {
      router.replace("/");
      return;
    }

    rawLeadsRef.current = leads;
    runScoringAndMessages(leads, "", "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runScoringAndMessages(leads: Lead[], currentGuidelines: string, currentLink1: string, currentLink2: string) {
    setState({ kind: "loading", message: `Scoring ${leads.length} leads with AI...` });

    let scored: ScoredLead[];
    try {
      const scoreRes = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads }),
      });
      if (!scoreRes.ok) {
        const err = await scoreRes.json().catch(() => ({}));
        throw new Error(err.error || "Scoring failed");
      }
      const scoreData = await scoreRes.json();

      scored = leads.map((lead) => {
        const s = (scoreData.scores as Array<{ phone: string; score: number; reason: string }>)
          ?.find((sc) => sc.phone === lead.phone) ?? { score: 5, reason: "" };
        return {
          ...lead,
          id: uuidv4(),
          score: s.score,
          scoreReason: s.reason,
          message: "",
          selected: s.score >= 5,
          status: "new" as const,
        };
      });
      scored.sort((a, b) => b.score - a.score);
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Scoring failed" });
      return;
    }

    setState({ kind: "loading", message: `Generating personalized messages for ${scored.length} leads...` });

    try {
      const msgLeads = scored.map((l) => ({
        phone: l.phone,
        firstName: l.firstName,
        propertyAddress: l.propertyAddress,
        city: l.city,
        state: l.state,
        propertyType: l.propertyType,
      }));

      const msgRes = await fetch("/api/generate-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: msgLeads, guidelines: currentGuidelines, link1: currentLink1, link2: currentLink2 }),
      });
      if (!msgRes.ok) {
        const err = await msgRes.json().catch(() => ({}));
        throw new Error(err.error || "Message generation failed");
      }
      const msgData = await msgRes.json();

      const msgs = msgData.messages as Array<{ phone: string; message: string }>;
      const withMessages = scored.map((lead) => ({
        ...lead,
        message: msgs?.find((m) => m.phone === lead.phone)?.message ?? "",
      }));

      setState({ kind: "ready", leads: withMessages });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Message generation failed" });
    }
  }

  async function handleRegenerate() {
    if (state.kind !== "ready") return;
    setRegenerating(true);

    try {
      const msgLeads = state.leads.map((l) => ({
        phone: l.phone,
        firstName: l.firstName,
        propertyAddress: l.propertyAddress,
        city: l.city,
        state: l.state,
        propertyType: l.propertyType,
      }));

      const msgRes = await fetch("/api/generate-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: msgLeads, guidelines, link1, link2 }),
      });
      if (!msgRes.ok) throw new Error("Message generation failed");
      const msgData = await msgRes.json();

      const msgs = msgData.messages as Array<{ phone: string; message: string }>;
      setState({
        kind: "ready",
        leads: state.leads.map((lead) => ({
          ...lead,
          message: msgs?.find((m) => m.phone === lead.phone)?.message ?? lead.message,
        })),
      });
    } catch {
      // Keep existing messages on failure
    } finally {
      setRegenerating(false);
    }
  }

  function handleToggleSelect(id: string) {
    if (state.kind !== "ready") return;
    setState({
      ...state,
      leads: state.leads.map((l) => (l.id === id ? { ...l, selected: !l.selected } : l)),
    });
  }

  function handleSelectAll() {
    if (state.kind !== "ready") return;
    setState({ ...state, leads: state.leads.map((l) => ({ ...l, selected: true })) });
  }

  function handleDeselectAll() {
    if (state.kind !== "ready") return;
    setState({ ...state, leads: state.leads.map((l) => ({ ...l, selected: false })) });
  }

  function handleUpdateMessage(id: string, message: string) {
    if (state.kind !== "ready") return;
    setState({
      ...state,
      leads: state.leads.map((l) => (l.id === id ? { ...l, message } : l)),
    });
  }

  function handleExportForPartner() {
    if (state.kind !== "ready") return;
    const selected = state.leads.filter((l) => l.selected);
    if (selected.length === 0) return;

    const headers = ["Phone", "First Name", "Last Name", "Message"];
    const rows = selected.map((l) => [
      l.phone,
      l.firstName,
      l.lastName,
      `"${l.message.replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outreach-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSendViaGHL() {
    if (state.kind !== "ready") return;
    const toSend = state.leads.filter((l) => l.selected);
    if (toSend.length === 0) return;
    sessionStorage.setItem("outreach_send", JSON.stringify(toSend));
    router.push("/send");
  }

  const selectedCount = state.kind === "ready" ? state.leads.filter((l) => l.selected).length : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Leads</h1>
          {state.kind === "ready" && (
            <p className="text-gray-500 mt-1">{state.leads.length} leads scored and ready</p>
          )}
        </div>
        {state.kind === "ready" && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportForPartner}
              disabled={selectedCount === 0}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export for Partner ({selectedCount})
            </button>
            <button
              onClick={handleSendViaGHL}
              disabled={selectedCount === 0}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Send via GHL ({selectedCount})
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Loading */}
      {state.kind === "loading" && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <svg className="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-gray-600 font-medium">{state.message}</p>
        </div>
      )}

      {/* Error */}
      {state.kind === "error" && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-red-600 font-medium">{state.message}</p>
          <Link href="/" className="text-blue-600 hover:underline text-sm">
            Go back
          </Link>
        </div>
      )}

      {/* Ready */}
      {state.kind === "ready" && (
        <>
          {/* Controls */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message Guidelines <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={guidelines}
                  onChange={(e) => setGuidelines(e.target.value)}
                  placeholder="e.g., Mention spring discount on kitchens..."
                  rows={2}
                  className="w-full text-sm border border-gray-200 rounded-lg p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Link 1 <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={link1}
                    onChange={(e) => setLink1(e.target.value)}
                    placeholder="https://your-website.com"
                    className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Link 2 <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={link2}
                    onChange={(e) => setLink2(e.target.value)}
                    placeholder="https://booking-link.com"
                    className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
              </div>
            </div>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-400 text-white font-medium px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap"
            >
              {regenerating ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Regenerating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate Messages
                </>
              )}
            </button>
          </div>

          {/* Lead Table */}
          <LeadTable
            leads={state.leads}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onUpdateMessage={handleUpdateMessage}
          />
        </>
      )}
    </div>
  );
}
