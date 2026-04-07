import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { Lead } from "./types";

// Normalize a column header to a consistent lowercase no-space/underscore form
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-./]+/g, "");
}

// Map of normalized column keys → Lead field names (or filter-only fields)
const COLUMN_MAP: Record<string, string> = {
  // firstName
  firstname: "firstName",
  first: "firstName",
  // lastName
  lastname: "lastName",
  last: "lastName",
  // phone — BatchLeads uses "Phone 1"
  phone: "phone",
  phone1: "phone",
  phonenumber: "phone",
  primaryphone: "phone",
  mobilephone: "phone",
  cellphone: "phone",
  // propertyAddress
  propertyaddress: "propertyAddress",
  address: "propertyAddress",
  street: "propertyAddress",
  streetaddress: "propertyAddress",
  // city — BatchLeads uses "Property City"
  city: "city",
  propertycity: "city",
  // state — BatchLeads uses "Property State"
  state: "state",
  propertystate: "state",
  // zip — BatchLeads uses "Property Zip"
  zip: "zip",
  zipcode: "zip",
  postalcode: "zip",
  propertyzip: "zip",
  propertyzipcode: "zip",
  // propertyType — BatchLeads uses "Property Type Detail"
  propertytype: "propertyType",
  propertytypedetail: "propertyType",
  type: "propertyType",
  // bedrooms — BatchLeads uses "Bedroom Count"
  beds: "bedrooms",
  bedrooms: "bedrooms",
  bedroomcount: "bedrooms",
  numberbeds: "bedrooms",
  numberbedrooms: "bedrooms",
  // bathrooms — BatchLeads uses "Bathroom Count"
  baths: "bathrooms",
  bathrooms: "bathrooms",
  bathroomcount: "bathrooms",
  numberbaths: "bathrooms",
  numberbathrooms: "bathrooms",
  // sqft — BatchLeads uses "Total Building Area Square Feet"
  sqft: "sqft",
  squarefeet: "sqft",
  livingsqft: "sqft",
  livingarea: "sqft",
  livingareasqft: "sqft",
  buildingareasqft: "sqft",
  livingareasquarefeet: "sqft",
  totalbuildingareasquarefeet: "sqft",
  // yearBuilt
  yearbuilt: "yearBuilt",
  // estimatedValue — BatchLeads uses "Estimated Value"
  estimatedvalue: "estimatedValue",
  marketvalue: "estimatedValue",
  estimatedhomevalue: "estimatedValue",
  avm: "estimatedValue",
  // equityPercent — BatchLeads doesn't export a % directly, but has LTV
  "equity%": "equityPercent",
  equitypercent: "equityPercent",
  equity: "equityPercent",
  equityperc: "equityPercent",
  equitypercentage: "equityPercent",
  ltvcurrentestimatedcombined: "equityPercent",
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
  // vacant — BatchLeads uses "Is Vacant"
  isvacant: "isVacant",
  vacant: "isVacant",
  // DNC flag — BatchLeads uses "Phone 1 DNC"
  phone1dnc: "phoneDnc",
  // Litigator flag
  litigator: "litigator",
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
  // Remove commas, $ signs, % signs
  const cleaned = String(value).replace(/[$,%]/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function rowsToLeads(
  rows: Record<string, string>[],
  headers: string[]
): Lead[] {
  // Build a mapping from the actual header keys to Lead field names
  const headerMapping: Record<string, string> = {};

  for (const header of headers) {
    const normalized = normalizeKey(header);
    const field = COLUMN_MAP[normalized];
    if (field) {
      if (!Object.values(headerMapping).includes(field)) {
        headerMapping[header] = field;
      }
    }
  }

  return rows
    .map((row) => {
      const raw: Record<string, string> = {};
      for (const [header, field] of Object.entries(headerMapping)) {
        raw[field] = row[header] ?? "";
      }

      // Skip rows with no phone number
      const phone = raw.phone?.trim() ?? "";
      if (!phone) return null;

      // Skip DNC or litigator leads
      if (parseBool(raw.phoneDnc) === true) return null;
      if (parseBool(raw.litigator) === true) return null;

      // Calculate equity percent from LTV if we got LTV instead of equity%
      let equityPercent = parseNumber(raw.equityPercent);
      if (equityPercent !== null) {
        // Check if the source column was LTV — if so, convert to equity
        const ltvMapped = Object.entries(headerMapping).find(
          ([, field]) => field === "equityPercent"
        );
        if (ltvMapped) {
          const normalizedHeader = normalizeKey(ltvMapped[0]);
          if (normalizedHeader.includes("ltv")) {
            equityPercent = Math.round((100 - equityPercent) * 10) / 10;
          }
        }
      }

      const lead: Lead = {
        firstName: raw.firstName?.trim() ?? "",
        lastName: raw.lastName?.trim() ?? "",
        phone,
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
        equityPercent,
        ownerOccupied: parseBool(raw.ownerOccupied),
        lastSaleDate: raw.lastSaleDate?.trim() ?? "",
        lastSalePrice: parseNumber(raw.lastSalePrice),
        absenteeOwner: parseBool(raw.absenteeOwner),
        freeAndClear: parseBool(raw.freeAndClear),
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
