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
