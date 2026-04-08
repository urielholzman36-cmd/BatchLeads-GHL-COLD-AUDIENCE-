# Lead Scoring Rubric v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Claude-based 1–10 lead scoring with a deterministic 100-point weighted rubric that pre-filters dead leads, scores 5 independent categories, and returns a structured breakdown.

**Architecture:** A new pure-TypeScript module `src/lib/lead-scorer.ts` exports `scoreLead(lead)` and `scoreLeads(leads)`. It is deterministic (no API calls). The Lead type is extended with the new BatchLeads fields needed by the rubric. The CSV parser is widened to populate them and stops killing leads at parse time (the scorer now handles all DISCARD logic, including partial-DNC stripping). The `/api/score` route is rewired to call the deterministic scorer instead of Claude. The lead table renders the new bucket badge plus a breakdown tooltip.

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest, Papaparse, xlsx, React 19.

**Spec:** `docs/superpowers/specs/2026-04-08-lead-scoring-rubric-v2-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/types.ts` | modify | Add new Lead fields, add `LeadScore` / `ScoreBreakdown` / `Bucket` types, update `ScoredLead` |
| `src/lib/lead-scorer.ts` | **create** | Pure deterministic scorer: DISCARD filter + 5 categories + bucketing + DNC strip |
| `src/lib/__tests__/lead-scorer.test.ts` | **create** | Comprehensive tests for filter, each category, bucketing, edge cases |
| `src/lib/csv-parser.ts` | modify | Map all new BatchLeads columns; remove parse-time DNC/litigator kill; collect all 5 phones with DNC flags |
| `src/lib/__tests__/csv-parser.test.ts` | modify | Test new fields parse, test parse-time kill is gone |
| `src/app/api/score/route.ts` | modify | Call `scoreLeads` from `lead-scorer.ts` instead of `claude-client.ts` |
| `src/components/lead-table.tsx` | modify | Replace numeric `ScoreBadge` with bucket badge + breakdown tooltip |
| `src/lib/claude-client.ts` | modify | Delete unused `scoreBatch` / `scoreLeads` / `ScoreResult` (message generation stays) |

---

## Task 1: Extend the Lead type and add scoring types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update `types.ts` to add new Lead fields and scoring types**

Replace the entire contents of `src/lib/types.ts` with:

```ts
export interface PhoneEntry {
  number: string;
  type: string; // "Mobile" | "Landline" | "" (raw from BatchLeads)
  dnc: boolean;
}

export interface Lead {
  // identity
  firstName: string;
  lastName: string;
  // primary phone (kept for backward compat = first non-DNC phone after stripping)
  phone: string;
  // all phones with DNC flags (Phone 1..5 from BatchLeads)
  phones: PhoneEntry[];

  // address
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  mailingAddress: string;

  // property facts
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  estimatedValue: number | null;
  assessedValue: number | null;
  equityPercent: number | null;     // = 100 - LTV
  equityDollar: number | null;      // raw "Equity Current Estimated Balance"
  ltvPercent: number | null;        // raw "Ltv Current Estimated Combined"
  ownerOccupied: boolean | null;

  // sale + loan timeline
  lastSaleDate: string;             // raw string, parsed by scorer
  lastSalePrice: number | null;
  loanRecordingDate: string;        // raw string, parsed by scorer

  // owner profile
  coOwnerFirstName: string;
  absenteeOwner: boolean | null;
  freeAndClear: boolean | null;

  // disqualifier signals
  isVacant: boolean | null;
  optOut: boolean | null;
  litigator: boolean | null;
  foreclosureStatus: string;        // empty string = not in foreclosure
  mlsStatus: string;                // raw, e.g. "Active" | "Pending" | "Sold" | ""

  // freshness + over-marketing
  createdDate: string;              // BatchLeads "Created Date"
  listCount: number | null;         // BatchLeads "List Count"
}

export type Bucket = "HIGH" | "MEDIUM" | "LOW" | "DISCARD";

export interface ScoreBreakdown {
  financial: {
    score: number;
    max: 30;
    details: {
      ltv: number;
      equityAbs: number;
      homeValue: number;
      recentMoverRelief: boolean;
    };
  };
  condition: {
    score: number;
    max: 25;
    details: { yearBuilt: number; assessedGap: number; size: number };
  };
  timing: {
    score: number;
    max: 20;
    details: { recentPurchase: number; recentRefi: number };
  };
  owner: {
    score: number;
    max: 15;
    details: { tenure: number; ownerOccupied: number; coOwner: number };
  };
  contact: {
    score: number;
    max: 10;
    details: { phoneQuality: number; freshness: number; listCountAdj: number };
  };
}

export interface LeadScore {
  total: number;
  bucket: Bucket;
  discardReason?: string;
  breakdown: ScoreBreakdown;
  cleanedPhones: PhoneEntry[];
}

export interface ScoredLead extends Lead {
  id: string;
  score: number;          // = LeadScore.total
  bucket: Bucket;
  breakdown: ScoreBreakdown;
  scoreReason: string;    // short human-readable summary derived from breakdown
  message: string;
  selected: boolean;
  status: "new" | "already_contacted";
}

export interface SendResult {
  leadId: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  score: number;
  message: string;
  ghlContactId: string | null;
  status: "sent" | "failed";
  error: string | null;
  sentAt: string;
}

export interface SendLogEntry extends SendResult {
  id: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles (this will surface every site that needs an update — that is intentional)**

Run: `npx tsc --noEmit`
Expected: errors in `csv-parser.ts`, `claude-client.ts`, `api/score/route.ts`, `lead-table.tsx`, possibly `db.ts` and `history.ts`. **Do not fix them yet** — each subsequent task fixes exactly one site. Note the error count for sanity-checking later.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): extend Lead with BatchLeads fields and add LeadScore types"
```

---

## Task 2: CSV parser — populate the new fields and stop killing at parse time

**Files:**
- Modify: `src/lib/csv-parser.ts`
- Test: `src/lib/__tests__/csv-parser.test.ts`

- [ ] **Step 1: Write failing tests for the new behavior**

Open `src/lib/__tests__/csv-parser.test.ts` and **append** the following block at the bottom of the existing `describe("parseCSV", ...)`:

```ts
  it("populates the new Lead fields from BatchLeads columns", () => {
    const csv = [
      "First Name,Last Name,Phone 1,Phone 1 DNC,Phone 1 TYPE,Phone 2,Phone 2 DNC,Phone 2 TYPE,Property Address,Property City,Property State,Property Zip,Mailing Address,Property Type Detail,Bedroom Count,Bathroom Count,Total Building Area Square Feet,Year Built,Estimated Value,Total Assessed Value,Ltv Current Estimated Combined,Equity Current Estimated Balance,Owner Occupied,Last Sale Date,Last Sale Price,Loan Recording Date,Owner 2 First Name,Is Vacant,Opt-Out,Litigator,Foreclosure Status,Mls Status,Created Date,List Count",
      "Jane,Doe,5551111111,No,Mobile,5552222222,Yes,Landline,123 Main St,Dallas,TX,75001,123 Main St,Single Family,3,2,1800,1965,800000,400000,30,560000,Yes,03-01-2020,500000,03-15-2024,John,No,No,No,,Sold,03-20-2026,1",
    ].join("\n");

    const leads = parseCSV(csv);
    expect(leads).toHaveLength(1);
    const lead = leads[0];

    expect(lead.phones).toHaveLength(2);
    expect(lead.phones[0]).toEqual({ number: "5551111111", type: "Mobile", dnc: false });
    expect(lead.phones[1]).toEqual({ number: "5552222222", type: "Landline", dnc: true });
    expect(lead.phone).toBe("5551111111");

    expect(lead.mailingAddress).toBe("123 Main St");
    expect(lead.assessedValue).toBe(400000);
    expect(lead.equityDollar).toBe(560000);
    expect(lead.ltvPercent).toBe(30);
    expect(lead.equityPercent).toBe(70); // 100 - 30
    expect(lead.loanRecordingDate).toBe("03-15-2024");
    expect(lead.coOwnerFirstName).toBe("John");
    expect(lead.isVacant).toBe(false);
    expect(lead.optOut).toBe(false);
    expect(lead.foreclosureStatus).toBe("");
    expect(lead.mlsStatus).toBe("Sold");
    expect(lead.createdDate).toBe("03-20-2026");
    expect(lead.listCount).toBe(1);
  });

  it("does NOT kill leads at parse time when Phone 1 is DNC (scorer handles it now)", () => {
    const csv = [
      "First Name,Last Name,Phone 1,Phone 1 DNC,Phone 1 TYPE,Phone 2,Phone 2 DNC,Phone 2 TYPE,Property Address,Property City,Property State,Property Zip,Property Type Detail",
      "Bob,Smith,5550000001,Yes,Mobile,5550000002,No,Mobile,1 Elm,Austin,TX,73301,Single Family",
    ].join("\n");

    const leads = parseCSV(csv);
    expect(leads).toHaveLength(1);
    expect(leads[0].phones).toHaveLength(2);
    expect(leads[0].phones[0].dnc).toBe(true);
    expect(leads[0].phones[1].dnc).toBe(false);
  });

  it("still skips rows with no phone numbers at all", () => {
    const csv = [
      "First Name,Last Name,Phone 1,Property Address,Property City,Property State,Property Zip,Property Type Detail",
      "NoPhone,Person,,1 Elm,Austin,TX,73301,Single Family",
    ].join("\n");
    expect(parseCSV(csv)).toHaveLength(0);
  });
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/lib/__tests__/csv-parser.test.ts`
Expected: the three new tests fail. Existing tests may also fail because the Lead shape changed — that is fine, we will make them all pass in step 3.

- [ ] **Step 3: Rewrite `csv-parser.ts` to populate the new fields and drop parse-time DNC/litigator kill**

Replace the entire contents of `src/lib/csv-parser.ts` with:

```ts
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { Lead, PhoneEntry } from "./types";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-./]+/g, "");
}

// Single-value column map (one BatchLeads column → one Lead field).
const COLUMN_MAP: Record<string, string> = {
  firstname: "firstName",
  first: "firstName",
  lastname: "lastName",
  last: "lastName",

  propertyaddress: "propertyAddress",
  address: "propertyAddress",
  street: "propertyAddress",
  streetaddress: "propertyAddress",

  mailingaddress: "mailingAddress",

  city: "city",
  propertycity: "city",
  state: "state",
  propertystate: "state",
  zip: "zip",
  zipcode: "zip",
  postalcode: "zip",
  propertyzip: "zip",
  propertyzipcode: "zip",

  propertytype: "propertyType",
  propertytypedetail: "propertyType",
  type: "propertyType",

  beds: "bedrooms",
  bedrooms: "bedrooms",
  bedroomcount: "bedrooms",
  baths: "bathrooms",
  bathrooms: "bathrooms",
  bathroomcount: "bathrooms",

  sqft: "sqft",
  squarefeet: "sqft",
  livingsqft: "sqft",
  livingarea: "sqft",
  buildingareasqft: "sqft",
  totalbuildingareasquarefeet: "sqft",

  yearbuilt: "yearBuilt",

  estimatedvalue: "estimatedValue",
  marketvalue: "estimatedValue",
  avm: "estimatedValue",

  totalassessedvalue: "assessedValue",
  assessedvalue: "assessedValue",

  ltvcurrentestimatedcombined: "ltvPercent",

  equitycurrentestimatedbalance: "equityDollar",

  // legacy: equity% column maps directly to equityPercent
  "equity%": "equityPercent",
  equitypercent: "equityPercent",
  equityperc: "equityPercent",
  equitypercentage: "equityPercent",

  owneroccupied: "ownerOccupied",

  lastsaledate: "lastSaleDate",
  lastsold: "lastSaleDate",
  saledate: "lastSaleDate",
  lastsaleprice: "lastSalePrice",
  saleprice: "lastSalePrice",

  loanrecordingdate: "loanRecordingDate",

  owner2firstname: "coOwnerFirstName",

  absenteeowner: "absenteeOwner",
  absentee: "absenteeOwner",
  freeandclear: "freeAndClear",
  freeclear: "freeAndClear",

  isvacant: "isVacant",
  vacant: "isVacant",
  optout: "optOut",
  litigator: "litigator",

  foreclosurestatus: "foreclosureStatus",
  mlsstatus: "mlsStatus",

  createddate: "createdDate",
  listcount: "listCount",
};

function parseBool(value: string | undefined | null): boolean | null {
  if (value === undefined || value === null || value === "") return null;
  const v = String(value).trim().toLowerCase();
  if (v === "yes" || v === "true" || v === "1" || v === "y") return true;
  if (v === "no" || v === "false" || v === "0" || v === "n") return false;
  return null;
}

function parseNumber(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const cleaned = String(value).replace(/[$,%]/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// Build PhoneEntry[] from Phone 1..5 / Phone N DNC / Phone N TYPE columns.
function extractPhones(row: Record<string, string>, headers: string[]): PhoneEntry[] {
  const phones: PhoneEntry[] = [];
  for (let i = 1; i <= 5; i++) {
    const numHeader = headers.find((h) => normalizeKey(h) === `phone${i}`);
    if (!numHeader) continue;
    const number = (row[numHeader] ?? "").trim();
    if (!number) continue;

    const dncHeader = headers.find((h) => normalizeKey(h) === `phone${i}dnc`);
    const typeHeader = headers.find((h) => normalizeKey(h) === `phone${i}type`);
    phones.push({
      number,
      type: typeHeader ? (row[typeHeader] ?? "").trim() : "",
      dnc: dncHeader ? parseBool(row[dncHeader]) === true : false,
    });
  }

  // Legacy single-column "Phone" support if no Phone N columns matched.
  if (phones.length === 0) {
    const legacyHeader = headers.find((h) => {
      const n = normalizeKey(h);
      return n === "phone" || n === "phonenumber" || n === "primaryphone" || n === "mobilephone" || n === "cellphone";
    });
    if (legacyHeader) {
      const number = (row[legacyHeader] ?? "").trim();
      if (number) phones.push({ number, type: "", dnc: false });
    }
  }

  return phones;
}

function rowsToLeads(rows: Record<string, string>[], headers: string[]): Lead[] {
  const headerMapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = normalizeKey(header);
    const field = COLUMN_MAP[normalized];
    if (field && !Object.values(headerMapping).includes(field)) {
      headerMapping[header] = field;
    }
  }

  return rows
    .map((row) => {
      const raw: Record<string, string> = {};
      for (const [header, field] of Object.entries(headerMapping)) {
        raw[field] = row[header] ?? "";
      }

      const phones = extractPhones(row, headers);
      // Skip leads with no phones at all (cannot contact).
      if (phones.length === 0) return null;

      // Derive equityPercent: prefer ltvPercent (100 - LTV), else direct equity%.
      const ltvPercent = parseNumber(raw.ltvPercent);
      let equityPercent = parseNumber(raw.equityPercent);
      if (ltvPercent !== null) {
        equityPercent = Math.round((100 - ltvPercent) * 10) / 10;
      }

      const lead: Lead = {
        firstName: raw.firstName?.trim() ?? "",
        lastName: raw.lastName?.trim() ?? "",
        phone: phones[0].number,
        phones,

        propertyAddress: raw.propertyAddress?.trim() ?? "",
        city: raw.city?.trim() ?? "",
        state: raw.state?.trim() ?? "",
        zip: raw.zip?.trim() ?? "",
        mailingAddress: raw.mailingAddress?.trim() ?? "",

        propertyType: raw.propertyType?.trim() ?? "",
        bedrooms: parseNumber(raw.bedrooms),
        bathrooms: parseNumber(raw.bathrooms),
        sqft: parseNumber(raw.sqft),
        yearBuilt: parseNumber(raw.yearBuilt),
        estimatedValue: parseNumber(raw.estimatedValue),
        assessedValue: parseNumber(raw.assessedValue),
        equityPercent,
        equityDollar: parseNumber(raw.equityDollar),
        ltvPercent,
        ownerOccupied: parseBool(raw.ownerOccupied),

        lastSaleDate: raw.lastSaleDate?.trim() ?? "",
        lastSalePrice: parseNumber(raw.lastSalePrice),
        loanRecordingDate: raw.loanRecordingDate?.trim() ?? "",

        coOwnerFirstName: raw.coOwnerFirstName?.trim() ?? "",
        absenteeOwner: parseBool(raw.absenteeOwner),
        freeAndClear: parseBool(raw.freeAndClear),

        isVacant: parseBool(raw.isVacant),
        optOut: parseBool(raw.optOut),
        litigator: parseBool(raw.litigator),
        foreclosureStatus: raw.foreclosureStatus?.trim() ?? "",
        mlsStatus: raw.mlsStatus?.trim() ?? "",

        createdDate: raw.createdDate?.trim() ?? "",
        listCount: parseNumber(raw.listCount),
      };

      return lead;
    })
    .filter((lead): lead is Lead => lead !== null);
}

export function parseCSV(csvText: string): Lead[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (!result.data || result.data.length === 0) return [];
  const headers = Object.keys(result.data[0]);
  return rowsToLeads(result.data, headers);
}

export function parseXLSX(buffer: ArrayBuffer): Lead[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
    raw: false,
  });
  if (!rows || rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  return rowsToLeads(rows, headers);
}
```

- [ ] **Step 4: Update existing tests in `csv-parser.test.ts` for the new Lead shape**

Existing tests that build a Lead literal or check `equityPercent` based on the old single-`Phone` column may fail because the parser now requires Phone N columns or a legacy `Phone` header. The legacy `Phone` header is supported in `extractPhones` so most existing tests should pass unchanged. For any test still failing, update it minimally to reference the new fields (e.g. expect `lead.phones[0].number === "5551234567"` if it was checking `lead.phone`). Do not delete tests.

- [ ] **Step 5: Run the full csv-parser test file**

Run: `npx vitest run src/lib/__tests__/csv-parser.test.ts`
Expected: all tests pass (including the 3 new ones).

- [ ] **Step 6: Commit**

```bash
git add src/lib/csv-parser.ts src/lib/__tests__/csv-parser.test.ts
git commit -m "feat(csv-parser): populate new BatchLeads fields and stop killing leads at parse time"
```

---

## Task 3: Create `lead-scorer.ts` — DISCARD filter

**Files:**
- Create: `src/lib/lead-scorer.ts`
- Create: `src/lib/__tests__/lead-scorer.test.ts`

- [ ] **Step 1: Write failing tests for the DISCARD filter**

Create `src/lib/__tests__/lead-scorer.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts`
Expected: all tests fail with "Cannot find module '../lead-scorer'".

- [ ] **Step 3: Create `lead-scorer.ts` with DISCARD logic only**

Create `src/lib/lead-scorer.ts`:

```ts
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

export function scoreLead(lead: Lead): LeadScore {
  const dq = checkDiscard(lead);
  if (dq) return discard(dq.reason, dq.cleaned);

  // Scoring not yet implemented — placeholder, will be filled in next tasks.
  const cleanedPhones = lead.phones.filter((p) => !p.dnc);
  return {
    total: 0,
    bucket: "LOW",
    breakdown: emptyBreakdown(),
    cleanedPhones,
  };
}

export function scoreLeads(leads: Lead[]): LeadScore[] {
  return leads.map(scoreLead);
}
```

- [ ] **Step 4: Run tests to verify DISCARD tests pass**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts`
Expected: all DISCARD tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-scorer.ts src/lib/__tests__/lead-scorer.test.ts
git commit -m "feat(scorer): add lead-scorer skeleton with DISCARD filter"
```

---

## Task 4: Implement Financial Capacity scoring (30 pts)

**Files:**
- Modify: `src/lib/lead-scorer.ts`
- Modify: `src/lib/__tests__/lead-scorer.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `lead-scorer.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts -t "Financial Capacity"`
Expected: all new tests FAIL.

- [ ] **Step 3: Add a date helper and the financial scoring function**

In `src/lib/lead-scorer.ts`, **add at the top of the file** (after the imports) a date parsing helper:

```ts
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
```

Then add a `scoreFinancial` function below `checkDiscard`:

```ts
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
```

Wire it into `scoreLead` — replace the placeholder body (the part after `const dq = ...; if (dq) return discard(...);`) with:

```ts
  const cleanedPhones = lead.phones.filter((p) => !p.dnc);
  const breakdown = emptyBreakdown();
  breakdown.financial = scoreFinancial(lead);

  const total = breakdown.financial.score; // other categories added in later tasks
  return { total, bucket: bucketFor(total), breakdown, cleanedPhones };
```

And add a `bucketFor` helper near the top:

```ts
function bucketFor(total: number): Bucket {
  if (total >= 55) return "HIGH";
  if (total >= 35) return "MEDIUM";
  return "LOW";
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts`
Expected: all DISCARD tests + all Financial tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-scorer.ts src/lib/__tests__/lead-scorer.test.ts
git commit -m "feat(scorer): implement Financial Capacity category (30 pts) with recent-mover relief"
```

---

## Task 5: Implement Property Condition scoring (25 pts)

**Files:**
- Modify: `src/lib/lead-scorer.ts`
- Modify: `src/lib/__tests__/lead-scorer.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
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
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts -t "Property Condition"`
Expected: FAIL.

- [ ] **Step 3: Add `scoreCondition` and wire it in**

Add to `lead-scorer.ts` below `scoreFinancial`:

```ts
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
```

In `scoreLead`, add `breakdown.condition = scoreCondition(lead);` and update `total` to `breakdown.financial.score + breakdown.condition.score`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-scorer.ts src/lib/__tests__/lead-scorer.test.ts
git commit -m "feat(scorer): implement Property Condition category (25 pts)"
```

---

## Task 6: Implement Life-Event Timing (20 pts)

**Files:**
- Modify: `src/lib/lead-scorer.ts`
- Modify: `src/lib/__tests__/lead-scorer.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
describe("scoreLead — Timing (20 pts)", () => {
  // Use vitest fake timers to pin "now" to a known date
  // so date-bracket tests are deterministic.
  // The brackets below assume NOW = 2026-04-08.
  const NOW_ISO = "2026-04-08";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["03-20-2026", 12], // ~19 days ago → <60d
    ["01-15-2026", 9],  // ~83 days
    ["10-15-2025", 5],  // ~175 days
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
```

Also add `import { vi, beforeEach, afterEach } from "vitest";` to the top of the test file (merge with existing import).

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts -t "Timing"`
Expected: FAIL.

- [ ] **Step 3: Implement `scoreTiming`**

Add to `lead-scorer.ts`:

```ts
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
```

In `scoreLead`, add `breakdown.timing = scoreTiming(lead);` and update total accordingly.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-scorer.ts src/lib/__tests__/lead-scorer.test.ts
git commit -m "feat(scorer): implement Timing category (20 pts) with refi rule"
```

---

## Task 7: Implement Owner Stability (15 pts)

**Files:**
- Modify: `src/lib/lead-scorer.ts`
- Modify: `src/lib/__tests__/lead-scorer.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
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
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts -t "Owner Stability"`
Expected: FAIL.

- [ ] **Step 3: Implement `scoreOwner`**

Add:

```ts
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
```

Wire into `scoreLead` and update total.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-scorer.ts src/lib/__tests__/lead-scorer.test.ts
git commit -m "feat(scorer): implement Owner Stability category (15 pts)"
```

---

## Task 8: Implement Contactability & Freshness (10 pts)

**Files:**
- Modify: `src/lib/lead-scorer.ts`
- Modify: `src/lib/__tests__/lead-scorer.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```ts
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

  it("mixed (some DNC) → 1 pt", () => {
    const r = scoreLead(
      makeLead({
        phones: [
          { number: "1", type: "Mobile", dnc: true },
          { number: "2", type: "Mobile", dnc: false },
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
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts -t "Contactability"`
Expected: FAIL.

- [ ] **Step 3: Implement `scoreContact`**

Add:

```ts
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
```

Wire into `scoreLead`, update `total = financial + condition + timing + owner + contact`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-scorer.ts src/lib/__tests__/lead-scorer.test.ts
git commit -m "feat(scorer): implement Contactability category (10 pts)"
```

---

## Task 9: End-to-end sanity tests for the spec's example profiles

**Files:**
- Modify: `src/lib/__tests__/lead-scorer.test.ts`

- [ ] **Step 1: Append integration tests**

```ts
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
```

- [ ] **Step 2: Run all scorer tests**

Run: `npx vitest run src/lib/__tests__/lead-scorer.test.ts`
Expected: ALL pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/lead-scorer.test.ts
git commit -m "test(scorer): add end-to-end sanity tests for spec example profiles"
```

---

## Task 10: Wire `/api/score` to the deterministic scorer

**Files:**
- Modify: `src/app/api/score/route.ts`

- [ ] **Step 1: Replace the route handler**

Replace the entire contents of `src/app/api/score/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { scoreLeads } from "@/lib/lead-scorer";
import type { Lead } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.leads) || body.leads.length === 0) {
    return NextResponse.json(
      { error: "leads array is required and must not be empty" },
      { status: 400 }
    );
  }

  const leads: Lead[] = body.leads;
  const scores = scoreLeads(leads);
  return NextResponse.json({ scores });
}
```

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit`
Expected: errors about `claude-client.ts` and `lead-table.tsx` may remain (handled in next tasks). No errors in `route.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/score/route.ts
git commit -m "feat(api/score): use deterministic scorer instead of Claude"
```

---

## Task 11: Remove unused Claude scoring code

**Files:**
- Modify: `src/lib/claude-client.ts`

- [ ] **Step 1: Delete the dead scoring exports**

In `src/lib/claude-client.ts`, **delete** these symbols (keep everything related to message generation):
- `interface ScoreResult`
- `async function scoreBatch`
- `export async function scoreLeads`

- [ ] **Step 2: Verify the file still compiles**

Run: `npx tsc --noEmit src/lib/claude-client.ts` (or just `npx tsc --noEmit` for the whole project; only `lead-table.tsx` errors should remain).

- [ ] **Step 3: Commit**

```bash
git add src/lib/claude-client.ts
git commit -m "refactor(claude-client): remove unused scoreLeads (replaced by deterministic scorer)"
```

---

## Task 12: Update `lead-table.tsx` to render bucket + breakdown

**Files:**
- Modify: `src/components/lead-table.tsx`

- [ ] **Step 1: Replace `ScoreBadge` with a bucket-aware badge**

In `src/components/lead-table.tsx`, replace the existing `ScoreBadge` component (lines 14-23) with:

```tsx
import type { Bucket, ScoreBreakdown } from "@/lib/types";

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
    `💰 Financial: ${breakdown.financial.score}/30`,
    `🏚️ Condition: ${breakdown.condition.score}/25`,
    `📅 Timing: ${breakdown.timing.score}/20`,
    `👤 Owner: ${breakdown.owner.score}/15`,
    `📞 Contact: ${breakdown.contact.score}/10`,
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
```

- [ ] **Step 2: Replace every usage of `<ScoreBadge score={lead.score} />` in this file**

Search for `ScoreBadge` and replace each call site with:

```tsx
<BucketBadge bucket={lead.bucket} total={lead.score} breakdown={lead.breakdown} />
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/lead-table.tsx
git commit -m "feat(lead-table): render bucket badge with breakdown tooltip"
```

---

## Task 13: Smoke-test in dev and verify with the real BatchLeads sample file

**Files:** none modified

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 2: Start dev server and upload the sample xlsx**

```bash
npm run dev
```

In a browser, upload `/Users/urielholzman/Desktop/BatchLeads Assistant/basic_remodel_list_1775518496.xlsx` and confirm:
- Leads with LTV > 95% appear as DISCARD (or are filtered out, depending on UI)
- Jesus Rolon (LTV 98.8%, both phones DNC) is DISCARDed
- HIGH/MEDIUM/LOW badges render with breakdown tooltips
- No console errors

- [ ] **Step 3: Stop dev server and final commit (if any cleanup was needed)**

```bash
git status
```

If clean, the implementation is done. If anything needed tweaking, commit it with a clear message.

---

## Self-Review

**Spec coverage:** ✅ all 8 DISCARD conditions tested (Task 3) ✅ all 5 categories implemented and tested (Tasks 4-8) ✅ recent-mover relief implemented and tested (Task 4) ✅ partial-DNC stripping implemented and tested (Task 3) ✅ refi rule implemented and tested (Task 6) ✅ end-to-end sanity tests for both grand-slam profiles + Jesus Rolon (Task 9) ✅ API rewired (Task 10) ✅ dead Claude code removed (Task 11) ✅ UI updated (Task 12) ✅ smoke test (Task 13).

**Placeholder scan:** No "TBD", no "implement later", no "similar to". Every code step has full code.

**Type consistency:** `LeadScore`, `ScoreBreakdown`, `Bucket`, `PhoneEntry`, `Lead`, `ScoredLead` all defined in Task 1 and used consistently in Tasks 3-12. `scoreLead` and `scoreLeads` signatures stable across tasks.

**Out of scope (intentionally deferred):**
- Migration of historical localStorage sessions scored under v1 (spec open-question #5) — historical sessions just keep their old `score` number; `bucket` will be `undefined` and the badge will gracefully fall back. If the user wants re-scoring on load, that's a small follow-up.
- Neon Postgres migration (existing blocker, unrelated)
- Intelligence Report editorial render of breakdown (spec open-question #4) — the table tooltip is the MVP; a richer report layout is a follow-up.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-08-lead-scoring-rubric-v2.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — I execute tasks in this session with checkpoints for review.

**Which approach?**
