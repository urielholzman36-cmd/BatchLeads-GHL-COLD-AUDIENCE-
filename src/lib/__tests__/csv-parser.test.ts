import { describe, it, expect } from "vitest";
import { parseCSV } from "../csv-parser";

describe("parseCSV", () => {
  it("parses a standard CSV with all fields", () => {
    const csv = [
      "First Name,Last Name,Phone,Property Address,City,State,Zip Code,Property Type,Beds,Baths,Sqft,Year Built,Estimated Value,Equity %,Owner Occupied,Last Sale Date,Last Sale Price,Absentee Owner,Free And Clear",
      "John,Smith,5551234567,123 Main St,Dallas,TX,75001,Single Family,3,2,1800,1998,350000,45,Yes,2015-06-01,200000,No,No",
    ].join("\n");

    const leads = parseCSV(csv);
    expect(leads).toHaveLength(1);

    const lead = leads[0];
    expect(lead.firstName).toBe("John");
    expect(lead.lastName).toBe("Smith");
    expect(lead.phone).toBe("5551234567");
    expect(lead.propertyAddress).toBe("123 Main St");
    expect(lead.city).toBe("Dallas");
    expect(lead.state).toBe("TX");
    expect(lead.zip).toBe("75001");
    expect(lead.propertyType).toBe("Single Family");
    expect(lead.bedrooms).toBe(3);
    expect(lead.bathrooms).toBe(2);
    expect(lead.sqft).toBe(1800);
    expect(lead.yearBuilt).toBe(1998);
    expect(lead.estimatedValue).toBe(350000);
    expect(lead.equityPercent).toBe(45);
    expect(lead.ownerOccupied).toBe(true);
    expect(lead.lastSaleDate).toBe("2015-06-01");
    expect(lead.lastSalePrice).toBe(200000);
    expect(lead.absenteeOwner).toBe(false);
    expect(lead.freeAndClear).toBe(false);
  });

  it("parses BatchLeads-style column names", () => {
    const csv = [
      "First Name,Last Name,Phone 1,Phone 1 DNC,Litigator,Property Address,Property City,Property State,Property Zip,Property Type Detail,Bedroom Count,Bathroom Count,Total Building Area Square Feet,Year Built,Estimated Value,Ltv Current Estimated Combined,Owner Occupied,Last Sale Date,Last Sale Price",
      "Jesus,Yanez,6192611192,Yes,No,936 Cunard St,San Diego,CA,92154,Single Family,3,2,1441,1969,783040,98.8,Yes,03-16-2026,797500",
      ",,6193334444,No,No,12533 Shropshire Ln,San Diego,CA,92128,Single Family,4,2,2082,1980,1413531,0,Yes,04-01-2026,1475000",
    ].join("\n");

    const leads = parseCSV(csv);
    // Parser no longer filters DNC at parse time — scorer handles it.
    expect(leads).toHaveLength(2);

    const lead = leads[1];
    expect(lead.phone).toBe("6193334444");
    expect(lead.propertyAddress).toBe("12533 Shropshire Ln");
    expect(lead.city).toBe("San Diego");
    expect(lead.sqft).toBe(2082);
    expect(lead.yearBuilt).toBe(1980);
    expect(lead.estimatedValue).toBe(1413531);
    // LTV of 0 → equity of 100
    expect(lead.equityPercent).toBe(100);
  });

  it("parses litigator flag (does not filter at parse time)", () => {
    const csv = [
      "First Name,Last Name,Phone 1,Litigator,Property Address,Property City,Property State,Property Zip",
      "Bad,Actor,5551112222,Yes,123 Oak St,Dallas,TX,75001",
      "Good,Person,5553334444,No,456 Pine Ave,Dallas,TX,75001",
    ].join("\n");

    const leads = parseCSV(csv);
    expect(leads).toHaveLength(2);
    expect(leads[0].litigator).toBe(true);
    expect(leads[1].litigator).toBe(false);
  });

  it("skips rows without phone numbers", () => {
    const csv = [
      "First Name,Last Name,Phone,Property Address,City,State,Zip",
      "NoPhone,Person,,123 Main St,Dallas,TX,75001",
      "HasPhone,Person,5551234567,456 Oak Ave,Dallas,TX,75001",
    ].join("\n");

    const leads = parseCSV(csv);
    expect(leads).toHaveLength(1);
    expect(leads[0].firstName).toBe("HasPhone");
  });

  it("returns an empty array for an empty CSV", () => {
    const leads = parseCSV("");
    expect(leads).toHaveLength(0);
  });

  it("handles numeric values with dollar signs", () => {
    const csv = [
      "First Name,Last Name,Phone,Property Address,City,State,Zip,Estimated Value,Last Sale Price",
      "Bob,Jones,5550001111,789 Pine St,Austin,TX,78701,$450000,$320000",
    ].join("\n");

    const leads = parseCSV(csv);
    expect(leads[0].estimatedValue).toBe(450000);
    expect(leads[0].lastSalePrice).toBe(320000);
  });

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
});
