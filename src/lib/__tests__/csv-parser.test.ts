import { describe, it, expect } from "vitest";
import { parseCSV } from "../csv-parser";

describe("parseCSV", () => {
  it("parses a standard BatchLeads CSV with all fields", () => {
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

  it("parses snake_case column names with missing optional fields", () => {
    const csv = [
      "first_name,last_name,phone_number,property_address,city,state,zip_code",
      "Jane,Doe,5559876543,456 Oak Ave,Houston,TX,77001",
    ].join("\n");

    const leads = parseCSV(csv);
    expect(leads).toHaveLength(1);

    const lead = leads[0];
    expect(lead.firstName).toBe("Jane");
    expect(lead.lastName).toBe("Doe");
    expect(lead.phone).toBe("5559876543");
    expect(lead.propertyAddress).toBe("456 Oak Ave");
    expect(lead.city).toBe("Houston");
    expect(lead.state).toBe("TX");
    expect(lead.zip).toBe("77001");
    // Optional fields should be null
    expect(lead.bedrooms).toBeNull();
    expect(lead.bathrooms).toBeNull();
    expect(lead.sqft).toBeNull();
    expect(lead.yearBuilt).toBeNull();
    expect(lead.estimatedValue).toBeNull();
    expect(lead.equityPercent).toBeNull();
    expect(lead.ownerOccupied).toBeNull();
    expect(lead.lastSalePrice).toBeNull();
    expect(lead.absenteeOwner).toBeNull();
    expect(lead.freeAndClear).toBeNull();
  });

  it("returns an empty array for an empty CSV", () => {
    const leads = parseCSV("");
    expect(leads).toHaveLength(0);
  });

  it("handles CSV with only headers (no data rows)", () => {
    const csv = "First Name,Last Name,Phone\n";
    const leads = parseCSV(csv);
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
});
