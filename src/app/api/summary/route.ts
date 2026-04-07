import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

interface ScoredLeadSummary {
  phone: string;
  firstName: string;
  lastName: string;
  propertyAddress: string;
  city: string;
  score: number;
  scoreReason: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.leads) || body.leads.length === 0) {
    return NextResponse.json(
      { error: "leads array is required" },
      { status: 400 }
    );
  }

  const leads: ScoredLeadSummary[] = body.leads;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const leadsJson = leads.map((l) => ({
    phone: l.phone,
    name: `${l.firstName} ${l.lastName}`.trim() || "(no name)",
    address: `${l.propertyAddress}, ${l.city}`,
    score: l.score,
    reason: l.scoreReason,
  }));

  const prompt = `You are a home remodeling outreach strategist. I just scored ${leads.length} leads 1-10 for remodeling potential. Give me a brief analysis.

Lead scores:
${JSON.stringify(leadsJson, null, 2)}

Return ONLY a JSON object with this exact shape (no markdown, no code fences):
{
  "summary": "2-3 sentence overall analysis of what kinds of properties scored high and the common patterns you see",
  "hiddenGems": [
    { "phone": "...", "reason": "why this lower-scored (4-6) lead might still be worth reaching out to" }
  ]
}

Include 3-5 hidden gems max — pick leads scored 4-6 that have some interesting angle (unique property, good location, etc.) the user might overlook. If there are no real hidden gems, return an empty array.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse JSON from Claude");

    const parsed = JSON.parse(match[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[summary] error:", err);
    return NextResponse.json(
      { error: "Summary generation failed" },
      { status: 500 }
    );
  }
}
