import Database from "better-sqlite3";
import path from "path";
import type { SendResult, SendLogEntry } from "./types";

const DEFAULT_DB_PATH = "data/outreach.db";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS send_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leadId TEXT NOT NULL,
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  score INTEGER NOT NULL,
  message TEXT NOT NULL,
  ghlContactId TEXT,
  status TEXT NOT NULL,
  error TEXT,
  sentAt TEXT NOT NULL
)
`;

/**
 * Returns a better-sqlite3 Database instance.
 * Creates the send_log table if it doesn't exist.
 * Pass ":memory:" for an in-memory database (useful for tests).
 */
export function getDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  // Resolve relative paths from the project root (cwd)
  const resolvedPath =
    dbPath === ":memory:" ? dbPath : path.resolve(process.cwd(), dbPath);

  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.exec(CREATE_TABLE_SQL);
  return db;
}

/**
 * Insert a SendResult into the send_log table.
 */
export function insertSendLog(db: Database.Database, entry: SendResult): void {
  const stmt = db.prepare(`
    INSERT INTO send_log (leadId, firstName, lastName, phone, address, score, message, ghlContactId, status, error, sentAt)
    VALUES (@leadId, @firstName, @lastName, @phone, @address, @score, @message, @ghlContactId, @status, @error, @sentAt)
  `);
  stmt.run(entry);
}

export interface QueryFilters {
  status?: "sent" | "failed";
  dateFrom?: string; // ISO string, e.g. "2024-01-01T00:00:00.000Z"
  dateTo?: string;   // ISO string
}

/**
 * Query the send_log table with optional filters.
 * Results are ordered by sentAt DESC.
 */
export function querySendLog(
  db: Database.Database,
  filters?: QueryFilters
): SendLogEntry[] {
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (filters?.status) {
    conditions.push("status = @status");
    params.status = filters.status;
  }

  if (filters?.dateFrom) {
    conditions.push("sentAt >= @dateFrom");
    params.dateFrom = filters.dateFrom;
  }

  if (filters?.dateTo) {
    conditions.push("sentAt <= @dateTo");
    params.dateTo = filters.dateTo;
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM send_log ${where} ORDER BY sentAt DESC`;

  const stmt = db.prepare(sql);
  return stmt.all(params) as SendLogEntry[];
}
