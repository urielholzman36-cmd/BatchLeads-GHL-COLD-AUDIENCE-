import type { Lead, LeadScore, ScoreBreakdown, Bucket, PhoneEntry } from "./types";

const DISCARD_PROPERTY_TYPES = ["condo", "apartment", "townhouse", "mobile", "manufactured"];

function emptyBreakdown(): ScoreBreakdown {
  return {
    financial: { score: 0, max: 30, details: { ltv: 0, equityAbs: 0, homeValue: 0, recentMoverRelief: false } },
    condition: { score: 0, max: 25, details: { yearBuilt: 0, assessedGap: 0, size: 0 } },
    timing:    { score: 0, max: 20, details: { recentPurchase: 0, recentRefi: 0 } },
    owner:     { score: 0, max: 15, details: { tenure: 0, ownerOccupied: 0, coOwner: 0 } },
    contact:   { score: 0, max: 10, details: { phoneQuality: 0, freshness: 0, listCountAdj: 0 } },
  };
}

function discard(reason: string, cleanedPhones: PhoneEntry[]): LeadScore {
  return { total: 0, bucket: "DISCARD", discardReason: reason, breakdown: emptyBreakdown(), cleanedPhones };
}

function checkDiscard(lead: Lead): { reason: string; cleaned: PhoneEntry[] } | null {
  if (lead.optOut === true) return { reason: "Opt-Out", cleaned: [] };
  if (lead.litigator === true) return { reason: "Litigator", cleaned: [] };

  const cleaned = lead.phones.filter((p) => !p.dnc);
  if (lead.phones.length === 0) return { reason: "No phone numbers", cleaned: [] };
  if (cleaned.length === 0) return { reason: "All phones DNC", cleaned: [] };

  if (lead.isVacant === true) return { reason: "Vacant property", cleaned };

  const pt = lead.propertyType.toLowerCase();
  if (DISCARD_PROPERTY_TYPES.some((t) => pt.includes(t))) {
    return { reason: `Property type: ${lead.propertyType}`, cleaned };
  }

  if (lead.foreclosureStatus.trim() !== "") {
    return { reason: `Foreclosure: ${lead.foreclosureStatus}`, cleaned };
  }

  const mls = lead.mlsStatus.toLowerCase();
  if (mls === "active" || mls === "pending") {
    return { reason: `MLS Status: ${lead.mlsStatus}`, cleaned };
  }

  if (lead.ltvPercent !== null && lead.ltvPercent > 95) {
    return { reason: `LTV ${lead.ltvPercent}% > 95%`, cleaned };
  }

  return null;
}

function bucketFor(total: number): Bucket {
  if (total >= 55) return "HIGH";
  if (total >= 35) return "MEDIUM";
  return "LOW";
}

export function scoreLead(lead: Lead): LeadScore {
  const dq = checkDiscard(lead);
  if (dq) return discard(dq.reason, dq.cleaned);

  // Scoring not yet implemented — placeholder, will be filled in next tasks.
  const cleanedPhones = lead.phones.filter((p) => !p.dnc);
  return {
    total: 0,
    bucket: bucketFor(0),
    breakdown: emptyBreakdown(),
    cleanedPhones,
  };
}

export function scoreLeads(leads: Lead[]): LeadScore[] {
  return leads.map(scoreLead);
}
