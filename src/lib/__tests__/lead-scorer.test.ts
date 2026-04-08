import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scoreLead } from "../lead-scorer";
import type { Lead } from "../types";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    firstName: "Test",
    lastName: "Owner",
    phone: "5550001111",
    phones: [{ number: "5550001111", type: "Mobile", dnc: false }],
    propertyAddress: "1 Main St",
    city: "Austin",
    state: "TX",
    zip: "73301",
    mailingAddress: "1 Main St",
    propertyType: "Single Family",
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1800,
    yearBuilt: 1965,
    estimatedValue: 800000,
    assessedValue: 400000,
    equityPercent: 70,
    equityDollar: 560000,
    ltvPercent: 30,
    ownerOccupied: true,
    lastSaleDate: "01-01-2010",
    lastSalePrice: 300000,
    loanRecordingDate: "01-01-2024",
    coOwnerFirstName: "Spouse",
    absenteeOwner: false,
    freeAndClear: false,
    isVacant: false,
    optOut: false,
    litigator: false,
    foreclosureStatus: "",
    mlsStatus: "",
    createdDate: "04-01-2026",
    listCount: 1,
    ...overrides,
  };
}

describe("scoreLead — DISCARD filter", () => {
  it("discards opt-out leads", () => {
    const r = scoreLead(makeLead({ optOut: true }));
    expect(r.bucket).toBe("DISCARD");
    expect(r.discardReason).toMatch(/opt[- ]?out/i);
  });

  it("discards litigators", () => {
    const r = scoreLead(makeLead({ litigator: true }));
    expect(r.bucket).toBe("DISCARD");
    expect(r.discardReason).toMatch(/litigator/i);
  });

  it("discards leads with no phones", () => {
    const r = scoreLead(makeLead({ phones: [] }));
    expect(r.bucket).toBe("DISCARD");
    expect(r.discardReason).toMatch(/phone/i);
  });

  it("discards leads where every phone is DNC", () => {
    const r = scoreLead(
      makeLead({
        phones: [
          { number: "5550000001", type: "Mobile", dnc: true },
          { number: "5550000002", type: "Landline", dnc: true },
        ],
      })
    );
    expect(r.bucket).toBe("DISCARD");
    expect(r.discardReason).toMatch(/dnc/i);
  });

  it("discards vacant homes", () => {
    expect(scoreLead(makeLead({ isVacant: true })).bucket).toBe("DISCARD");
  });

  it.each([
    ["Condo"],
    ["Apartment"],
    ["Townhouse"],
    ["Mobile Home"],
    ["Manufactured"],
  ])("discards property type %s", (type) => {
    expect(scoreLead(makeLead({ propertyType: type })).bucket).toBe("DISCARD");
  });

  it("discards foreclosure leads", () => {
    expect(scoreLead(makeLead({ foreclosureStatus: "Notice of Default" })).bucket).toBe("DISCARD");
  });

  it.each(["Active", "Pending"])("discards MLS status %s", (status) => {
    expect(scoreLead(makeLead({ mlsStatus: status })).bucket).toBe("DISCARD");
  });

  it("discards LTV > 95%", () => {
    expect(scoreLead(makeLead({ ltvPercent: 98.8 })).bucket).toBe("DISCARD");
  });

  it("strips DNC phones from cleanedPhones but keeps lead alive when at least one phone is clean", () => {
    const r = scoreLead(
      makeLead({
        phones: [
          { number: "5550000001", type: "Mobile", dnc: true },
          { number: "5550000002", type: "Mobile", dnc: false },
        ],
      })
    );
    expect(r.bucket).not.toBe("DISCARD");
    expect(r.cleanedPhones).toHaveLength(1);
    expect(r.cleanedPhones[0].number).toBe("5550000002");
  });
});

describe("scoreLead — Financial Capacity (30 pts)", () => {
  it("scores LTV <30% as 18 pts", () => {
    const r = scoreLead(makeLead({ ltvPercent: 25, equityDollar: 600000, estimatedValue: 800000 }));
    expect(r.breakdown.financial.details.ltv).toBe(18);
  });

  it.each([
    [20, 18],
    [40, 14],
    [60, 9],
    [80, 4],
    [90, 0],
  ])("LTV %i%% → %i pts", (ltv, pts) => {
    const r = scoreLead(makeLead({ ltvPercent: ltv }));
    expect(r.breakdown.financial.details.ltv).toBe(pts);
  });

  it.each([
    [200000, 7],
    [100000, 4],
    [50000, 1],
    [10000, 0],
  ])("absolute equity $%i → %i pts", (eq, pts) => {
    const r = scoreLead(makeLead({ equityDollar: eq, lastSaleDate: "01-01-2010" }));
    expect(r.breakdown.financial.details.equityAbs).toBe(pts);
  });

  it.each([
    [1000000, 5],
    [600000, 3],
    [200000, 1],
  ])("home value $%i → %i pts", (val, pts) => {
    const r = scoreLead(makeLead({ estimatedValue: val }));
    expect(r.breakdown.financial.details.homeValue).toBe(pts);
  });

  it("applies recent-mover relief: sale within 2 years awards 20 pts flat for ltv+equity", () => {
    const r = scoreLead(
      makeLead({
        ltvPercent: 85,
        equityDollar: 60000,
        estimatedValue: 800000,
        lastSaleDate: "03-01-2026", // recent
      })
    );
    expect(r.breakdown.financial.details.recentMoverRelief).toBe(true);
    expect(r.breakdown.financial.details.ltv).toBe(0);
    expect(r.breakdown.financial.details.equityAbs).toBe(0);
    expect(r.breakdown.financial.score).toBe(25); // 20 relief + 5 home value tier
  });

  it("financial total = ltv + equityAbs + homeValue when no relief", () => {
    const r = scoreLead(
      makeLead({
        ltvPercent: 25, equityDollar: 600000, estimatedValue: 1000000,
        lastSaleDate: "01-01-2010",
      })
    );
    expect(r.breakdown.financial.score).toBe(18 + 7 + 5);
  });
});

describe("scoreLead — Property Condition (25 pts)", () => {
  it.each([
    [1955, 12],
    [1970, 10],
    [1990, 6],
    [2005, 2],
    [2020, 0],
  ])("year built %i → %i pts", (yr, pts) => {
    const r = scoreLead(makeLead({ yearBuilt: yr }));
    expect(r.breakdown.condition.details.yearBuilt).toBe(pts);
  });

  it.each([
    [200000, 800000, 8],   // 25% ratio
    [500000, 800000, 5],   // 62.5%
    [640000, 800000, 2],   // 80%
    [760000, 800000, 0],   // 95%
  ])("assessed %i / estimated %i → %i pts", (a, e, pts) => {
    const r = scoreLead(makeLead({ assessedValue: a, estimatedValue: e }));
    expect(r.breakdown.condition.details.assessedGap).toBe(pts);
  });

  it.each([
    [2200, 5],
    [1300, 3],
    [4000, 3],
    [800, 1],
    [6000, 1],
  ])("sqft %i → %i pts", (s, pts) => {
    const r = scoreLead(makeLead({ sqft: s }));
    expect(r.breakdown.condition.details.size).toBe(pts);
  });
});

describe("scoreLead — Timing (20 pts)", () => {
  const NOW_ISO = "2026-04-08";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["03-20-2026", 12], // ~19 days ago → <60d
    ["01-15-2026", 9],  // ~83 days
    ["09-15-2025", 5],  // ~205 days
    ["05-01-2024", 2],  // ~2 years
    ["01-01-2020", 0],  // 6 years
  ])("recent purchase %s → %i pts", (date, pts) => {
    const r = scoreLead(makeLead({ lastSaleDate: date }));
    expect(r.breakdown.timing.details.recentPurchase).toBe(pts);
  });

  it("refi: 0 pts when loan recording date is same as sale date (original mortgage)", () => {
    const r = scoreLead(makeLead({ lastSaleDate: "01-01-2010", loanRecordingDate: "01-05-2010" }));
    expect(r.breakdown.timing.details.recentRefi).toBe(0);
  });

  it.each([
    ["12-01-2025", 8], // <6 mo
    ["07-01-2025", 5], // ~9 mo
    ["07-01-2024", 2], // ~21 mo
    ["01-01-2020", 0],
  ])("refi recording %s → %i pts (with old sale date)", (date, pts) => {
    const r = scoreLead(makeLead({ lastSaleDate: "01-01-2010", loanRecordingDate: date }));
    expect(r.breakdown.timing.details.recentRefi).toBe(pts);
  });
});

describe("scoreLead — Owner Stability (15 pts)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08"));
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["01-01-2010", 8], // 16 yrs
    ["01-01-2018", 5], // 8 yrs
    ["01-01-2022", 3], // 4 yrs
    ["01-01-2025", 0], // 1 yr
  ])("tenure %s → %i pts", (date, pts) => {
    const r = scoreLead(makeLead({ lastSaleDate: date }));
    expect(r.breakdown.owner.details.tenure).toBe(pts);
  });

  it("owner-occupied = 4 pts", () => {
    expect(scoreLead(makeLead({ ownerOccupied: true })).breakdown.owner.details.ownerOccupied).toBe(4);
    expect(scoreLead(makeLead({ ownerOccupied: false })).breakdown.owner.details.ownerOccupied).toBe(0);
  });

  it("co-owner present = 3 pts", () => {
    expect(scoreLead(makeLead({ coOwnerFirstName: "Spouse" })).breakdown.owner.details.coOwner).toBe(3);
    expect(scoreLead(makeLead({ coOwnerFirstName: "" })).breakdown.owner.details.coOwner).toBe(0);
  });
});

describe("scoreLead — Contactability (10 pts)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08"));
  });
  afterEach(() => vi.useRealTimers());

  it("2+ clean mobiles → 6 pts", () => {
    const r = scoreLead(
      makeLead({
        phones: [
          { number: "1", type: "Mobile", dnc: false },
          { number: "2", type: "Mobile", dnc: false },
        ],
      })
    );
    expect(r.breakdown.contact.details.phoneQuality).toBe(6);
  });

  it("1 clean mobile → 4 pts", () => {
    const r = scoreLead(
      makeLead({ phones: [{ number: "1", type: "Mobile", dnc: false }] })
    );
    expect(r.breakdown.contact.details.phoneQuality).toBe(4);
  });

  it("only landlines (clean) → 2 pts", () => {
    const r = scoreLead(
      makeLead({
        phones: [
          { number: "1", type: "Landline", dnc: false },
          { number: "2", type: "Landline", dnc: false },
        ],
      })
    );
    expect(r.breakdown.contact.details.phoneQuality).toBe(2);
  });

  it("mixed landline+DNC mobile → 1 pt", () => {
    const r = scoreLead(
      makeLead({
        phones: [
          { number: "1", type: "Mobile", dnc: true },
          { number: "2", type: "Landline", dnc: false },
        ],
      })
    );
    expect(r.breakdown.contact.details.phoneQuality).toBe(1);
  });

  it.each([
    ["03-20-2026", 3], // ~19 days
    ["02-01-2026", 2], // ~67 days
    ["10-01-2025", 0], // 6+ months
  ])("freshness %s → %i pts", (date, pts) => {
    const r = scoreLead(makeLead({ createdDate: date }));
    expect(r.breakdown.contact.details.freshness).toBe(pts);
  });

  it.each([
    [1, 1],
    [3, 0],
    [7, -2],
  ])("list count %i → %i pts", (lc, pts) => {
    const r = scoreLead(makeLead({ listCount: lc }));
    expect(r.breakdown.contact.details.listCountAdj).toBe(pts);
  });
});

describe("scoreLead — sanity check from spec", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08"));
  });
  afterEach(() => vi.useRealTimers());

  it("grand-slam long-tenure owner hits HIGH (≥55)", () => {
    const r = scoreLead(makeLead({
      lastSaleDate: "01-01-2010",
      loanRecordingDate: "01-01-2025",
      yearBuilt: 1965,
      sqft: 1800,
      assessedValue: 400000,
      estimatedValue: 800000,
      ltvPercent: 30,
      equityDollar: 560000,
      ownerOccupied: true,
      coOwnerFirstName: "Spouse",
      phones: [
        { number: "1", type: "Mobile", dnc: false },
        { number: "2", type: "Mobile", dnc: false },
      ],
      createdDate: "03-20-2026",
      listCount: 1,
    }));
    expect(r.bucket).toBe("HIGH");
    expect(r.total).toBeGreaterThanOrEqual(70);
  });

  it("grand-slam recent mover hits HIGH (≥55) via relief branch", () => {
    const r = scoreLead(makeLead({
      lastSaleDate: "03-15-2026",
      loanRecordingDate: "03-20-2026",
      yearBuilt: 1965,
      sqft: 1800,
      assessedValue: 400000,
      estimatedValue: 800000,
      ltvPercent: 85, // would be 0 pts without relief
      equityDollar: 60000,
      ownerOccupied: true,
      coOwnerFirstName: "Spouse",
      phones: [
        { number: "1", type: "Mobile", dnc: false },
        { number: "2", type: "Mobile", dnc: false },
      ],
      createdDate: "03-20-2026",
      listCount: 1,
    }));
    expect(r.bucket).toBe("HIGH");
    expect(r.breakdown.financial.details.recentMoverRelief).toBe(true);
    expect(r.total).toBeGreaterThanOrEqual(70);
  });

  it("Jesus Rolon sample row from spec is auto-discarded", () => {
    const r = scoreLead(makeLead({
      ltvPercent: 98.8,
      phones: [
        { number: "6192611192", type: "Mobile", dnc: true },
        { number: "6194232578", type: "Landline", dnc: true },
      ],
    }));
    expect(r.bucket).toBe("DISCARD");
  });
});
