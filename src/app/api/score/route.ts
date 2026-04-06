import { NextRequest, NextResponse } from "next/server";
import { scoreLeads } from "@/lib/claude-client";
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

  try {
    const scores = await scoreLeads(leads);
    return NextResponse.json({ scores });
  } catch (err) {
    console.error("[score] AI error:", err);
    return NextResponse.json(
      { error: "AI scoring failed", details: String(err) },
      { status: 500 }
    );
  }
}
