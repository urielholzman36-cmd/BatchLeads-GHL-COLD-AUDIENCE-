import { NextRequest, NextResponse } from "next/server";
import { generateMessages } from "@/lib/claude-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.leads) || body.leads.length === 0) {
    return NextResponse.json(
      { error: "leads array is required and must not be empty" },
      { status: 400 }
    );
  }

  const leads = body.leads;
  const guidelines: string = body.guidelines || "";
  const link1: string = body.link1 || body.link || "";
  const link2: string = body.link2 || "";

  try {
    const messages = await generateMessages(leads, guidelines, link1, link2);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("[generate-messages] error:", err);
    return NextResponse.json(
      { error: "Message generation failed", details: String(err) },
      { status: 500 }
    );
  }
}
