# Lead Scoring Rubric v2 — Design Spec

**Date:** 2026-04-08
**Project:** BatchLeads GHL Cold Audience
**Status:** Approved by user, ready for implementation planning
**Replaces:** Current scoring logic in `src/lib/claude-client.ts` `scoreBatch()`

## Goal

Replace the current vague HIGH/MED/LOW bucket prompt with a deterministic, weighted, multi-signal scoring system that:

1. Uses far more of the 96 columns BatchLeads already exports (we currently use ~10)
2. Filters obviously-dead leads BEFORE calling Claude (saves API spend)
3. Rewards both "recent mover" and "long-tenure owner" profiles equally
4. Produces an auditable score breakdown so the UI can explain *why* a lead scored what it did

## Stage 1 — DISCARD Filter (deterministic, pre-Claude)

A lead is killed before any AI scoring if **any** of the following are true. No Claude API call is made for discarded leads.

| Condition | Reason |
|---|---|
| `Opt-Out = Yes` | Legally required |
| `Litigator = Yes` | Lawsuit risk |
| All phone numbers are DNC, OR no phones at all | Unreachable |
| `Is Vacant = Yes` | Nobody home |
| `Property Type Detail` contains: Condo, Apartment, Townhouse, Mobile, Manufactured | Not a remodel target |
| `Foreclosure Status` populated (any stage) | Distressed, wrong audience |
| `MLS Status` = Active or Pending | Currently selling, not improving |
| `LTV > 95%` | No equity to fund a remodel |

### Side-effect: partial DNC stripping

If *some* phone numbers on a lead are DNC but others are clean, the lead survives. The DNC numbers are stripped from the contact record entirely. Only clean numbers persist into the scored lead and into the eventual CSV export.

## Stage 2 — Weighted Score (0–100 points)

Score is the sum of 5 independent category scores. Each category captures a different dimension, so a lead can earn points from multiple angles simultaneously.

### Category 1 — 💰 Financial Capacity (30 pts)

| Sub-signal | Max | Brackets |
|---|---:|---|
| LTV (relative equity) | 18 | <30% → 18 / 30–50% → 14 / 50–70% → 9 / 70–85% → 4 / 85–95% → 0 |
| Absolute equity ($) | 7 | $150k+ → 7 / $75k–150k → 4 / $30k–75k → 1 / <$30k → 0 |
| Home value tier | 5 | $800k+ → 5 / $400k–800k → 3 / <$400k → 1 |

**Recent-mover relief:** If `Last Sale Date` is within 2 years, skip LTV and absolute-equity scoring entirely. A fresh buyer is by definition high-LTV — penalizing them for that is wrong, since the bank just verified their income and creditworthiness. Instead, award a flat **20 pts** for the LTV+equity portion. The home value tier (5 pts) still applies on top, so the maximum in this branch is 25 pts. Recent movers earn the missing 5 pts back via the Timing category.

### Category 2 — 🏚️ Property Condition (25 pts)

| Sub-signal | Max | Brackets |
|---|---:|---|
| Year built | 12 | <1960 → 12 / 1960–1980 → 10 / 1980–2000 → 6 / 2000–2015 → 2 / 2015+ → 0 |
| Assessed-vs-Estimated value gap | 8 | Assessed/Estimated <50% → 8 / 50–70% → 5 / 70–90% → 2 / 90%+ → 0 |
| Size sweet spot (sqft) | 5 | 1500–3500 → 5 / 1200–1500 or 3500–5000 → 3 / else → 1 |

The assessed/estimated gap is a strong "untouched original" signal — when county assessed value lags far behind market value, it usually means the home has not been permitted/improved recently.

### Category 3 — 📅 Life-Event Timing (20 pts)

| Sub-signal | Max | Brackets |
|---|---:|---|
| Recent purchase (`Last Sale Date`) | 12 | <60 days → 12 / 60–180 days → 9 / 180 days–1 yr → 5 / 1–3 yrs → 2 / 3 yrs+ → 0 |
| Recent refinance (`Loan Recording Date`) | 8 | <6 mo → 8 / 6–12 mo → 5 / 1–2 yrs → 2 / 2 yrs+ → 0 |

**Refi rule:** the refinance signal only counts if `Loan Recording Date` is meaningfully later than `Last Sale Date` (more than ~30 days). Otherwise it is the original purchase mortgage and scores 0.

### Category 4 — 👤 Owner Stability (15 pts)

| Sub-signal | Max | Brackets |
|---|---:|---|
| Length of residence | 8 | 10 yrs+ → 8 / 5–10 yrs → 5 / 3–5 yrs → 3 / <3 yrs → 0 |
| Owner-occupied | 4 | Yes → 4 / No → 0 |
| Co-owner present (`Owner 2 First Name` populated) | 3 | Yes → 3 / No → 0 |

This category exists specifically to reward the long-tenure profile that the Timing category (by definition) cannot reward. Together, Timing + Owner Stability cover both the "just moved" and "rooted nester" archetypes.

### Category 5 — 📞 Contactability & Freshness (10 pts)

| Sub-signal | Max | Brackets |
|---|---:|---|
| Phone quality | 6 | 2+ clean mobile numbers → 6 / 1 clean mobile → 4 / only landlines → 2 / mixed → 1 |
| Lead freshness (`Created Date`) | 3 | <30 days → 3 / 30–90 days → 2 / 90 days+ → 0 |
| List Count | 1 | List Count = 1 → +1 / 2–4 → 0 / **5+ → −2** |

The List Count penalty is allowed to go negative — over-marketed leads actively drag the total score down.

## Stage 3 — Final Bucketing

| Score | Bucket | Default action |
|---:|---|---|
| **55+** | 🔥 HIGH | Send immediately (or auto-send in auto-high mode) |
| **35–54** | ⚡ MEDIUM | Manual review queue |
| **20–34** | 💤 LOW | Skip by default |
| **<20** | ❌ DISCARD | Killed in Stage 1 (never reaches scoring) |

## Output shape

The scoring function should return a structured breakdown so the UI can show *why* a lead scored what it did. Proposed shape:

```ts
type LeadScore = {
  total: number;              // 0–100
  bucket: 'HIGH' | 'MEDIUM' | 'LOW' | 'DISCARD';
  discardReason?: string;     // populated when bucket = DISCARD
  breakdown: {
    financial: { score: number; max: 30; details: { ltv: number; equityAbs: number; homeValue: number; recentMoverRelief: boolean } };
    condition: { score: number; max: 25; details: { yearBuilt: number; assessedGap: number; size: number } };
    timing:    { score: number; max: 20; details: { recentPurchase: number; recentRefi: number } };
    owner:     { score: number; max: 15; details: { tenure: number; ownerOccupied: number; coOwner: number } };
    contact:   { score: number; max: 10; details: { phoneQuality: number; freshness: number; listCountAdj: number } };
  };
  cleanedPhones: string[];   // phones surviving DNC strip
};
```

This breakdown is what the Intelligence Report panel and the lead table modal will render.

## Sanity check — grand-slam profiles

Both target archetypes must hit HIGH (≥55) under this rubric:

**Grand-slam long-tenure owner** (15-yr owner, $800k home, 30% LTV, $400k equity, 1965 build, 1800 sqft, couple, 2 clean mobiles, fresh lead, list count 1):
- Financial: 14 + 7 + 5 = 26
- Condition: 10 + 5 + 5 = 20
- Timing: 0 + 5 = 5
- Owner: 8 + 4 + 3 = 15
- Contact: 6 + 3 + 1 = 10
- **Total: 76 → HIGH ✅**

**Grand-slam recent mover** (bought 30 days ago, $800k home, 1965 build, 1800 sqft, couple, 2 clean mobiles, fresh lead, list count 1):
- Financial (relief branch): 20 + 5 = 25
- Condition: 10 + 5 + 5 = 20
- Timing: 12 + 0 = 12
- Owner: 0 + 4 + 3 = 7
- Contact: 6 + 3 + 1 = 10
- **Total: 74 → HIGH ✅**

**Sample row Jesus Rolon** (LTV 98.8%, both phones DNC):
- Stage 1 DISCARD → never scored → 0 Claude API spend ✅

## Open implementation questions

These are not blockers for the design but will need answers during plan-writing:

1. Where exactly does this slot in — replace `scoreBatch()` in `claude-client.ts`, or sit as a deterministic pre-pass in front of it? (Recommendation: scoring is purely deterministic now and does NOT need Claude at all. Claude can be reserved for the SMS *generation* step.)
2. Does the existing Lead type need new fields (`ltv`, `equityAbs`, `loanRecordingDate`, `coOwnerFirstName`, `createdDate`, `listCount`, `phones[]` with DNC flags)?
3. CSV parser (`src/lib/csv-parser.ts`) needs to map all the new BatchLeads columns we are now consuming.
4. UI updates: lead table should show the new bucket + a "why" tooltip from `breakdown`. Intelligence Report should render the breakdown editorially.
5. Backwards-compat: existing localStorage sessions were scored with v1. Decide whether to re-score on load or leave historical sessions alone.
