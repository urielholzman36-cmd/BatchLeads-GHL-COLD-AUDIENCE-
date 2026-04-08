import type { Lead, LeadScore, ScoreBreakdown, Bucket, PhoneEntry } from "./types";

// Parse BatchLeads date strings (MM-DD-YYYY or YYYY-MM-DD). Returns null on failure.
function parseDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  // MM-DD-YYYY
  const us = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (us) return new Date(parseInt(us[3]), parseInt(us[1]) - 1, parseInt(us[2]));
  // YYYY-MM-DD
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

const NOW = () => new Date();

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

function scoreFinancial(lead: Lead): ScoreBreakdown["financial"] {
  // Recent-mover relief: sale within 2 years
  const saleDate = parseDate(lead.lastSaleDate);
  const recentMover = saleDate !== null && daysBetween(NOW(), saleDate) <= 730;

  let ltv = 0;
  let equityAbs = 0;
  let homeValue = 0;

  // Home value tier (always applied)
  const v = lead.estimatedValue ?? 0;
  if (v >= 800000) homeValue = 5;
  else if (v >= 400000) homeValue = 3;
  else homeValue = 1;

  if (recentMover) {
    return {
      score: 20 + homeValue,
      max: 30,
      details: { ltv: 0, equityAbs: 0, homeValue, recentMoverRelief: true },
    };
  }

  // LTV bracket
  const l = lead.ltvPercent;
  if (l !== null) {
    if (l < 30) ltv = 18;
    else if (l < 50) ltv = 14;
    else if (l < 70) ltv = 9;
    else if (l < 85) ltv = 4;
    else ltv = 0;
  }

  // Absolute equity
  const e = lead.equityDollar ?? 0;
  if (e >= 150000) equityAbs = 7;
  else if (e >= 75000) equityAbs = 4;
  else if (e >= 30000) equityAbs = 1;
  else equityAbs = 0;

  return {
    score: ltv + equityAbs + homeValue,
    max: 30,
    details: { ltv, equityAbs, homeValue, recentMoverRelief: false },
  };
}

function scoreCondition(lead: Lead): ScoreBreakdown["condition"] {
  let yearBuilt = 0;
  if (lead.yearBuilt !== null) {
    if (lead.yearBuilt < 1960) yearBuilt = 12;
    else if (lead.yearBuilt < 1980) yearBuilt = 10;
    else if (lead.yearBuilt < 2000) yearBuilt = 6;
    else if (lead.yearBuilt < 2015) yearBuilt = 2;
    else yearBuilt = 0;
  }

  let assessedGap = 0;
  if (lead.assessedValue !== null && lead.estimatedValue !== null && lead.estimatedValue > 0) {
    const ratio = lead.assessedValue / lead.estimatedValue;
    if (ratio < 0.5) assessedGap = 8;
    else if (ratio < 0.7) assessedGap = 5;
    else if (ratio < 0.9) assessedGap = 2;
    else assessedGap = 0;
  }

  let size = 1;
  const s = lead.sqft;
  if (s !== null) {
    if (s >= 1500 && s <= 3500) size = 5;
    else if ((s >= 1200 && s < 1500) || (s > 3500 && s <= 5000)) size = 3;
    else size = 1;
  }

  return { score: yearBuilt + assessedGap + size, max: 25, details: { yearBuilt, assessedGap, size } };
}

function scoreTiming(lead: Lead): ScoreBreakdown["timing"] {
  const now = NOW();

  let recentPurchase = 0;
  const sale = parseDate(lead.lastSaleDate);
  if (sale) {
    const days = daysBetween(now, sale);
    if (days < 60) recentPurchase = 12;
    else if (days < 180) recentPurchase = 9;
    else if (days < 365) recentPurchase = 5;
    else if (days < 365 * 3) recentPurchase = 2;
    else recentPurchase = 0;
  }

  let recentRefi = 0;
  const refi = parseDate(lead.loanRecordingDate);
  if (refi && sale) {
    // Only count as refi if recording is meaningfully later than sale (>30 days)
    const gapFromSale = daysBetween(refi, sale);
    if (gapFromSale > 30) {
      const days = daysBetween(now, refi);
      if (days < 180) recentRefi = 8;
      else if (days < 365) recentRefi = 5;
      else if (days < 365 * 2) recentRefi = 2;
      else recentRefi = 0;
    }
  }

  return { score: recentPurchase + recentRefi, max: 20, details: { recentPurchase, recentRefi } };
}

function scoreOwner(lead: Lead): ScoreBreakdown["owner"] {
  let tenure = 0;
  const sale = parseDate(lead.lastSaleDate);
  if (sale) {
    const years = daysBetween(NOW(), sale) / 365.25;
    if (years >= 10) tenure = 8;
    else if (years >= 5) tenure = 5;
    else if (years >= 3) tenure = 3;
    else tenure = 0;
  }
  const ownerOccupied = lead.ownerOccupied === true ? 4 : 0;
  const coOwner = lead.coOwnerFirstName.trim() !== "" ? 3 : 0;
  return { score: tenure + ownerOccupied + coOwner, max: 15, details: { tenure, ownerOccupied, coOwner } };
}

function scoreContact(lead: Lead): ScoreBreakdown["contact"] {
  const cleaned = lead.phones.filter((p) => !p.dnc);
  const cleanMobiles = cleaned.filter((p) => p.type.toLowerCase() === "mobile");
  const anyDnc = lead.phones.some((p) => p.dnc);

  let phoneQuality = 0;
  if (cleanMobiles.length >= 2) phoneQuality = 6;
  else if (cleanMobiles.length === 1) phoneQuality = 4;
  else if (cleaned.length > 0 && !anyDnc) phoneQuality = 2; // only landlines, all clean
  else if (cleaned.length > 0) phoneQuality = 1;            // mixed

  let freshness = 0;
  const created = parseDate(lead.createdDate);
  if (created) {
    const days = daysBetween(NOW(), created);
    if (days < 30) freshness = 3;
    else if (days < 90) freshness = 2;
    else freshness = 0;
  }

  let listCountAdj = 0;
  const lc = lead.listCount;
  if (lc !== null) {
    if (lc === 1) listCountAdj = 1;
    else if (lc >= 5) listCountAdj = -2;
    else listCountAdj = 0;
  }

  return {
    score: phoneQuality + freshness + listCountAdj,
    max: 10,
    details: { phoneQuality, freshness, listCountAdj },
  };
}

export function scoreLead(lead: Lead): LeadScore {
  const dq = checkDiscard(lead);
  if (dq) return discard(dq.reason, dq.cleaned);

  const cleanedPhones = lead.phones.filter((p) => !p.dnc);
  const breakdown = emptyBreakdown();
  breakdown.financial = scoreFinancial(lead);
  breakdown.condition = scoreCondition(lead);
  breakdown.timing = scoreTiming(lead);
  breakdown.owner = scoreOwner(lead);
  breakdown.contact = scoreContact(lead);

  const total = breakdown.financial.score + breakdown.condition.score + breakdown.timing.score + breakdown.owner.score + breakdown.contact.score;
  return { total, bucket: bucketFor(total), breakdown, cleanedPhones };
}

export function scoreLeads(leads: Lead[]): LeadScore[] {
  return leads.map(scoreLead);
}
