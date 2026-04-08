import type { Lead, ScoredLead } from "./types";

export interface OutreachSession {
  id: string;
  label: string;
  createdAt: string;
  fingerprint: string;
  rawLeads: Lead[];
  scoredLeads?: ScoredLead[];
  summary?: { summary: string; hiddenGems: Array<{ phone: string; reason: string }> };
}

const KEY = "vo360_outreach_history";
const MAX_SESSIONS = 25;

export function fingerprintLeads(leads: Pick<Lead, "phone">[]): string {
  return leads
    .map((l) => l.phone)
    .filter(Boolean)
    .sort()
    .join("|");
}

export function loadHistory(): OutreachSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as OutreachSession[];
  } catch {
    return [];
  }
}

function saveHistory(sessions: OutreachSession[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch {
    // localStorage may be full — drop oldest and retry
    try {
      localStorage.setItem(KEY, JSON.stringify(sessions.slice(0, 10)));
    } catch {
      // give up silently
    }
  }
}

export function upsertSession(session: OutreachSession) {
  const all = loadHistory();
  const idx = all.findIndex((s) => s.fingerprint === session.fingerprint);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...session };
  } else {
    all.unshift(session);
  }
  // Sort by createdAt desc
  all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  saveHistory(all);
}

export function findSessionByFingerprint(fp: string): OutreachSession | undefined {
  return loadHistory().find((s) => s.fingerprint === fp);
}

export function deleteSession(id: string) {
  saveHistory(loadHistory().filter((s) => s.id !== id));
}

export function renameSession(id: string, label: string) {
  const all = loadHistory();
  const s = all.find((x) => x.id === id);
  if (s) {
    s.label = label;
    saveHistory(all);
  }
}
