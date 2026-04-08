"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LeadTable from "@/components/lead-table";
import type { Lead, ScoredLead, LeadScore, ScoreBreakdown } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import {
  fingerprintLeads,
  findSessionByFingerprint,
  upsertSession,
} from "@/lib/history";
import {
  loadTemplates,
  upsertTemplate,
  deleteTemplate,
  type MessageTemplate,
} from "@/lib/templates";

type PageState =
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; leads: ScoredLead[] };

interface SummaryData {
  summary: string;
  hiddenGems: Array<{ phone: string; reason: string }>;
}

function summarizeBreakdown(b: ScoreBreakdown, bucket: string): string {
  const parts: Array<[string, number, number]> = [
    ["financial", b.financial.score, b.financial.max],
    ["condition", b.condition.score, b.condition.max],
    ["timing", b.timing.score, b.timing.max],
    ["owner", b.owner.score, b.owner.max],
    ["contact", b.contact.score, b.contact.max],
  ];
  const top = parts
    .map(([label, s, m]) => ({ label, pct: m > 0 ? s / m : 0 }))
    .sort((a, z) => z.pct - a.pct)
    .slice(0, 2)
    .map((x) => x.label)
    .join(" + ");
  return `${bucket} · strong ${top}`;
}

export default function ReviewPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>({ kind: "loading", message: "Scoring leads..." });
  const [guidelines, setGuidelines] = useState("");
  const [link1, setLink1] = useState("");
  const [link2, setLink2] = useState("");
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");

  useEffect(() => {
    const tpls = loadTemplates();
    setTemplates(tpls);
    // Auto-load first template on first mount
    if (tpls.length > 0 && !activeTemplateId) {
      const t = tpls[0];
      setActiveTemplateId(t.id);
      setGuidelines(t.guidelines);
      setLink1(t.link1);
      setLink2(t.link2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setActiveTemplateId(id);
    setGuidelines(t.guidelines);
    setLink1(t.link1);
    setLink2(t.link2);
  }

  function handleSaveTemplate() {
    const name = prompt("Template name:", "");
    if (!name || !name.trim()) return;
    const t: MessageTemplate = {
      id: uuidv4(),
      name: name.trim(),
      guidelines,
      link1,
      link2,
      createdAt: new Date().toISOString(),
    };
    upsertTemplate(t);
    setTemplates(loadTemplates());
    setActiveTemplateId(t.id);
  }

  function handleUpdateTemplate() {
    const t = templates.find((x) => x.id === activeTemplateId);
    if (!t) return;
    const updated: MessageTemplate = { ...t, guidelines, link1, link2 };
    upsertTemplate(updated);
    setTemplates(loadTemplates());
  }

  function handleDeleteTemplate() {
    const t = templates.find((x) => x.id === activeTemplateId);
    if (!t || t.builtIn) return;
    if (!confirm(`Delete template "${t.name}"?`)) return;
    deleteTemplate(t.id);
    const remaining = loadTemplates();
    setTemplates(remaining);
    if (remaining.length > 0) applyTemplate(remaining[0].id);
  }
  const [regenerating, setRegenerating] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const rawLeadsRef = useRef<Lead[]>([]);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

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

    // Try cached session by fingerprint
    const fp = fingerprintLeads(leads);
    const existing = findSessionByFingerprint(fp);
    if (existing && existing.scoredLeads && existing.scoredLeads.length > 0) {
      setState({ kind: "ready", leads: existing.scoredLeads });
      if (existing.summary) setSummary(existing.summary);
      return;
    }

    runScoringAndMessages(leads, "", "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist whenever ready state changes
  useEffect(() => {
    if (state.kind !== "ready") return;
    const fp = fingerprintLeads(rawLeadsRef.current);
    const existing = findSessionByFingerprint(fp);
    upsertSession({
      id: existing?.id ?? uuidv4(),
      label:
        existing?.label ??
        `Upload ${new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })} · ${rawLeadsRef.current.length} leads`,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      fingerprint: fp,
      rawLeads: rawLeadsRef.current,
      scoredLeads: state.leads,
      summary: summary ?? undefined,
    });
  }, [state, summary]);

  function handleRescore() {
    if (rawLeadsRef.current.length === 0) return;
    setSummary(null);
    runScoringAndMessages(rawLeadsRef.current, guidelines, link1, link2);
  }

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

      const scores = (scoreData.scores as LeadScore[]) ?? [];
      scored = leads
        .map((lead, i): ScoredLead | null => {
          const s = scores[i];
          if (!s) return null;
          if (s.bucket === "DISCARD") return null;
          const reason = summarizeBreakdown(s.breakdown, s.bucket);
          return {
            ...lead,
            id: uuidv4(),
            score: s.total,
            bucket: s.bucket,
            breakdown: s.breakdown,
            scoreReason: reason,
            message: "",
            selected: s.bucket === "HIGH" || s.bucket === "MEDIUM",
            status: "new" as const,
          };
        })
        .filter((l): l is ScoredLead => l !== null);
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

      // Fetch summary in the background (non-blocking)
      fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: withMessages.map((l) => ({
            phone: l.phone,
            firstName: l.firstName,
            lastName: l.lastName,
            propertyAddress: l.propertyAddress,
            city: l.city,
            score: l.score,
            scoreReason: l.scoreReason,
          })),
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && data.summary) setSummary(data);
        })
        .catch(() => {
          // Summary failure is non-fatal
        });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Message generation failed" });
    }
  }

  function getScoreDistribution(leads: ScoredLead[]) {
    const high = leads.filter((l) => l.bucket === "HIGH").length;
    const medium = leads.filter((l) => l.bucket === "MEDIUM").length;
    const low = leads.filter((l) => l.bucket === "LOW").length;
    return { high, medium, low };
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
          {/* Intelligence Report — editorial layout */}
          {(() => {
            const dist = getScoreDistribution(state.leads);
            const total = state.leads.length || 1;
            const pct = (n: number) => Math.round((n / total) * 100);
            return (
              <article className="relative overflow-hidden bg-white border border-gray-200 rounded-2xl mb-6 shadow-[0_20px_60px_-40px_rgba(30,42,120,0.35)]">
                {/* Masthead */}
                <header className="relative bg-[#0b1020] px-5 md:px-6 py-3 overflow-hidden">
                  <div className="absolute inset-0 vo360-gradient-animated opacity-20" />
                  <div className="absolute inset-x-0 bottom-0 h-px vo360-gradient-bg" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-baseline gap-3">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-semibold">
                        Intelligence Report
                      </div>
                      <span className="text-white/20">·</span>
                      <span className="italic text-sm text-white/80">scoreboard</span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold vo360-gradient-text">{total}</span>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 ml-1.5">leads</span>
                    </div>
                  </div>
                </header>

                {/* Stat tiles */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                  {[
                    { label: "High", range: "70+", n: dist.high, color: "#15803d", bar: "from-green-400 to-emerald-600" },
                    { label: "Medium", range: "50–69", n: dist.medium, color: "#a16207", bar: "from-amber-400 to-orange-500" },
                    { label: "Low", range: "0–49", n: dist.low, color: "#b91c1c", bar: "from-rose-400 to-red-600" },
                  ].map((tier) => (
                    <div key={tier.label} className="px-4 md:px-5 py-4 relative">
                      <div className="flex items-baseline justify-between">
                        <div className="text-[9px] uppercase tracking-[0.2em] font-bold" style={{ color: tier.color }}>
                          {tier.label}
                        </div>
                        <div className="text-[9px] text-gray-400 tabular-nums">{tier.range}</div>
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <div className="text-3xl font-light tracking-tight tabular-nums" style={{ color: tier.color }}>
                          {tier.n}
                        </div>
                        <div className="text-[10px] text-gray-400 tabular-nums">{pct(tier.n)}%</div>
                      </div>
                      <div className="mt-2 h-[3px] w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${tier.bar} rounded-full transition-all duration-700`}
                          style={{ width: `${pct(tier.n)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {summary ? (
                  <>
                    {/* Editorial note */}
                    <div className="px-5 md:px-6 py-5 flex gap-4">
                      <div className="shrink-0 flex flex-col items-start gap-1 pr-4 border-r border-gray-100">
                        <div className="text-[9px] uppercase tracking-[0.22em] font-bold text-[#1e2a78]">
                          Analyst
                        </div>
                        <div className="w-6 h-px vo360-gradient-bg" />
                        <div className="italic text-[10px] text-gray-400">note</div>
                      </div>
                      <p className="text-[15px] md:text-base text-[#0b1020] leading-relaxed">
                        {summary.summary}
                      </p>
                    </div>

                    {/* Hidden Gems */}
                    {summary.hiddenGems.length > 0 && (
                      <div className="border-t border-gray-100 px-5 md:px-6 py-5 bg-gradient-to-b from-[#fff9fc] to-white">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full vo360-gradient-bg text-white text-[10px]">
                            ◆
                          </span>
                          <div className="text-[9px] uppercase tracking-[0.22em] font-bold text-[#1e2a78]">
                            Hidden Gems
                          </div>
                          <div className="italic text-[10px] text-gray-400">
                            worth a second look
                          </div>
                          <div className="ml-auto text-[10px] text-gray-400">
                            {summary.hiddenGems.length}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {summary.hiddenGems.map((gem) => {
                            const lead = state.leads.find((l) => l.phone === gem.phone);
                            if (!lead) return null;
                            return (
                              <div
                                key={gem.phone}
                                className="group relative bg-white border border-gray-200 rounded-xl p-4 hover:border-[#d633a0]/40 hover:shadow-[0_15px_40px_-25px_rgba(214,51,160,0.5)] transition-all"
                              >
                                <div className="absolute top-0 left-4 right-4 h-px vo360-gradient-bg opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="flex items-start gap-3">
                                  <div className="shrink-0 w-11 h-11 rounded-xl border-2 border-[#1e2a78]/15 flex items-center justify-center font-bold text-lg text-[#1e2a78] bg-white">
                                    {lead.score}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-[#0b1020] text-sm truncate">
                                      {lead.firstName} {lead.lastName}
                                    </div>
                                    <div className="text-[11px] text-gray-500 truncate">
                                      {lead.propertyAddress}
                                    </div>
                                  </div>
                                </div>
                                <p className="mt-3 text-xs text-gray-600 leading-relaxed italic font-display">
                                  &ldquo;{gem.reason}&rdquo;
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-6 md:px-10 py-12 flex items-center gap-3 text-gray-400">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span className="italic text-sm">
                      The analyst is reading your batch&hellip;
                    </span>
                  </div>
                )}
              </article>
            );
          })()}

          {/* Controls */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            {/* Template picker */}
            <div className="flex flex-wrap items-center gap-2 pb-4 mb-4 border-b border-gray-100">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Template
              </label>
              <select
                value={activeTemplateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="flex-1 min-w-[200px] text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.builtIn ? "★ " : ""}{t.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleUpdateTemplate}
                disabled={!activeTemplateId}
                className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Save current guidelines + links to this template"
              >
                Update
              </button>
              <button
                onClick={handleSaveTemplate}
                className="text-xs font-medium px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
              >
                + Save as new
              </button>
              <button
                onClick={handleDeleteTemplate}
                disabled={!activeTemplateId || templates.find((t) => t.id === activeTemplateId)?.builtIn}
                className="text-xs font-medium px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Delete template"
              >
                Delete
              </button>
            </div>
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
            <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRescore}
              disabled={regenerating}
              className="inline-flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-800 font-medium px-4 py-2.5 rounded-lg transition-colors"
              title="Discard cached scores and re-run AI scoring from scratch"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
              </svg>
              Re-score Leads
            </button>
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
