import Papa from "papaparse";
import type { Lead } from "./types";

// Normalize a column header to a consistent lowercase no-space/underscore form
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-./]+/g, "");
}

// Map of normalized column keys → Lead field names
const COLUMN_MAP: Record<string, keyof Lead> = {
  // firstName
  firstname: "firstName",
  first: "firstName",
  // lastName
  lastname: "lastName",
  last: "lastName",
  // phone
  phone: "phone",
  phonenumber: "phone",
  primaryphone: "phone",
  mobilephone: "phone",
  cellphone: "phone",
  // propertyAddress
  propertyaddress: "propertyAddress",
  address: "propertyAddress",
  street: "propertyAddress",
  streetaddress: "propertyAddress",
  // city
  city: "city",
  propertycity: "city",
  // state
  state: "state",
  propertystate: "state",
  // zip
  zip: "zip",
  zipcode: "zip",
  "zipcode": "zip",
  postalcode: "zip",
  propertyzip: "zip",
  propertyzipcode: "zip",
  // propertyType
  propertytype: "propertyType",
  type: "propertyType",
  // bedrooms
  beds: "bedrooms",
  bedrooms: "bedrooms",
  numberbeds: "bedrooms",
  numberbedrooms: "bedrooms",
  // bathrooms
  baths: "bathrooms",
  bathrooms: "bathrooms",
  numberbaths: "bathrooms",
  numberbathrooms: "bathrooms",
  // sqft
  sqft: "sqft",
  squarefeet: "sqft",
  livingsqft: "sqft",
  livingarea: "sqft",
  livingareasqft: "sqft",
  buildingareasqft: "sqft",
  // yearBuilt
  yearbuilt: "yearBuilt",
  // estimatedValue
  estimatedvalue: "estimatedValue",
  marketvalue: "estimatedValue",
  estimatedhomevalue: "estimatedValue",
  avm: "estimatedValue",
  // equityPercent
  "equity%": "equityPercent",
  equitypercent: "equityPercent",
  equity: "equityPercent",
  equityperc: "equityPercent",
  equitypercentage: "equityPercent",
  // ownerOccupied
  owneroccupied: "ownerOccupied",
  // lastSaleDate
  lastsaledate: "lastSaleDate",
  lastsold: "lastSaleDate",
  saledate: "lastSaleDate",
  // lastSalePrice
  lastsaleprice: "lastSalePrice",
  saleprice: "lastSalePrice",
  lastsoldprice: "lastSalePrice",
  // absenteeOwner
  absenteeowner: "absenteeOwner",
  absentee: "absenteeOwner",
  // freeAndClear
  freeandclear: "freeAndClear",
  freeclear: "freeAndClear",
};

function parseBool(value: string | undefined | null): boolean | null {
  if (value === undefined || value === null || value === "") return null;
  const v = value.trim().toLowerCase();
  if (v === "yes" || v === "true" || v === "1" || v === "y") return true;
  if (v === "no" || v === "false" || v === "0" || v === "n") return false;
  return null;
}

function parseNumber(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  // Remove commas and $ signs
  const cleaned = value.replace(/[$,]/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export function parseCSV(csvText: string): Lead[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (!result.data || result.data.length === 0) return [];

  // Build a mapping from the actual header keys to Lead field names
  const headers = Object.keys(result.data[0]);
  const headerMapping: Record<string, keyof Lead> = {};

  for (const header of headers) {
    const normalized = normalizeKey(header);
    const leadField = COLUMN_MAP[normalized];
    if (leadField) {
      // Only map first encountered column for each field
      if (!Object.values(headerMapping).includes(leadField)) {
        headerMapping[header] = leadField;
      }
    }
  }

  return result.data.map((row) => {
    // Build a partial record first
    const raw: Partial<Record<keyof Lead, string>> = {};
    for (const [header, leadField] of Object.entries(headerMapping)) {
      raw[leadField] = row[header];
    }

    const lead: Lead = {
      firstName: raw.firstName?.trim() ?? "",
      lastName: raw.lastName?.trim() ?? "",
      phone: raw.phone?.trim() ?? "",
      propertyAddress: raw.propertyAddress?.trim() ?? "",
      city: raw.city?.trim() ?? "",
      state: raw.state?.trim() ?? "",
      zip: raw.zip?.trim() ?? "",
      propertyType: raw.propertyType?.trim() ?? "",
      bedrooms: parseNumber(raw.bedrooms),
      bathrooms: parseNumber(raw.bathrooms),
      sqft: parseNumber(raw.sqft),
      yearBuilt: parseNumber(raw.yearBuilt),
      estimatedValue: parseNumber(raw.estimatedValue),
      equityPercent: parseNumber(raw.equityPercent),
      ownerOccupied: parseBool(raw.ownerOccupied),
      lastSaleDate: raw.lastSaleDate?.trim() ?? "",
      lastSalePrice: parseNumber(raw.lastSalePrice),
      absenteeOwner: parseBool(raw.absenteeOwner),
      freeAndClear: parseBool(raw.freeAndClear),
    };

    return lead;
  });
}
