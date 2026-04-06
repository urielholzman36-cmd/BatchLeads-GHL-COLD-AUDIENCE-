export interface Lead {
  firstName: string;
  lastName: string;
  phone: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  estimatedValue: number | null;
  equityPercent: number | null;
  ownerOccupied: boolean | null;
  lastSaleDate: string;
  lastSalePrice: number | null;
  absenteeOwner: boolean | null;
  freeAndClear: boolean | null;
}

export interface ScoredLead extends Lead {
  id: string;
  score: number;
  scoreReason: string;
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
