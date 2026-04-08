import { NextRequest, NextResponse } from "next/server";
import { scoreLeads } from "@/lib/lead-scorer";
import type { Lead } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.leads) || body.leads.length === 0) {
    return NextResponse.json(
      { error: "leads array is required and must not be empty" },
      { status: 400 }
    );
  }

  const leads: Lead[] = body.leads;
  const scores = scoreLeads(leads);
  return NextResponse.json({ scores });
}
