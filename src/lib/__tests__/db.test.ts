import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { getDb, insertSendLog, querySendLog } from "../db";
import type { SendResult } from "../types";

function makeSendResult(overrides: Partial<SendResult> = {}): SendResult {
  return {
    leadId: "lead-001",
    firstName: "John",
    lastName: "Smith",
    phone: "5551234567",
    address: "123 Main St, Dallas, TX 75001",
    score: 8,
    message: "Hey John, noticed your place on Main St...",
    ghlContactId: "ghl-abc123",
    status: "sent",
    error: null,
    sentAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("db", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("inserts and retrieves a send log entry", () => {
    const entry = makeSendResult();
    insertSendLog(db, entry);

    const rows = querySendLog(db);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.id).toBe(1);
    expect(row.leadId).toBe(entry.leadId);
    expect(row.firstName).toBe(entry.firstName);
    expect(row.lastName).toBe(entry.lastName);
    expect(row.phone).toBe(entry.phone);
    expect(row.address).toBe(entry.address);
    expect(row.score).toBe(entry.score);
    expect(row.message).toBe(entry.message);
    expect(row.ghlContactId).toBe(entry.ghlContactId);
    expect(row.status).toBe("sent");
    expect(row.error).toBeNull();
    expect(row.sentAt).toBe(entry.sentAt);
  });

  it("filters by status — returns only matching entries", () => {
    const sent = makeSendResult({
      leadId: "lead-001",
      status: "sent",
      sentAt: "2024-06-01T10:00:00.000Z",
    });
    const failed = makeSendResult({
      leadId: "lead-002",
      status: "failed",
      ghlContactId: null,
      error: "GHL API timeout",
      sentAt: "2024-06-01T11:00:00.000Z",
    });

    insertSendLog(db, sent);
    insertSendLog(db, failed);

    const sentRows = querySendLog(db, { status: "sent" });
    expect(sentRows).toHaveLength(1);
    expect(sentRows[0].leadId).toBe("lead-001");
    expect(sentRows[0].status).toBe("sent");

    const failedRows = querySendLog(db, { status: "failed" });
    expect(failedRows).toHaveLength(1);
    expect(failedRows[0].leadId).toBe("lead-002");
    expect(failedRows[0].status).toBe("failed");
    expect(failedRows[0].error).toBe("GHL API timeout");

    const allRows = querySendLog(db);
    expect(allRows).toHaveLength(2);
  });
});
