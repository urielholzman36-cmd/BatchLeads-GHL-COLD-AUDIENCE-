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
