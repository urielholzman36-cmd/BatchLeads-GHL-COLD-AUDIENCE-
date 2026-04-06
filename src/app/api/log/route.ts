import { NextResponse } from "next/server";
import { getDb, querySendLog } from "@/lib/db";
import type { QueryFilters } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const filters: QueryFilters = {};

  const status = searchParams.get("status");
  if (status === "sent" || status === "failed") {
    filters.status = status;
  }

  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) {
    filters.dateFrom = dateFrom;
  }

  const dateTo = searchParams.get("dateTo");
  if (dateTo) {
    filters.dateTo = dateTo;
  }

  const db = getDb();
  const entries = querySendLog(db, filters);

  return NextResponse.json({ entries });
}
