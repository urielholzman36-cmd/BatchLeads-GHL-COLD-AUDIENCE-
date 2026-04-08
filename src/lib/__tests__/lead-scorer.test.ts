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
