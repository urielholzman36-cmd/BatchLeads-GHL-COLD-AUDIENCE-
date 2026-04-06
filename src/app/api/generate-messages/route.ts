import { NextRequest, NextResponse } from "next/server";
import { generateMessages } from "@/lib/claude-client";
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
  const guidelines: string = body.guidelines || "";
  const link: string = body.link || "";

  try {
    const messages = await generateMessages(leads, guidelines, link);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("[generate-messages] error:", err);
    return NextResponse.json(
      { error: "Message generation failed", details: String(err) },
      { status: 500 }
    );
  }
}
