import Anthropic from "@anthropic-ai/sdk";
import type { Lead } from "./types";

const MODEL = "claude-sonnet-4-6";

function getClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

export interface ScoreResult {
  phone: string;
  score: number;
  reason: string;
}

export interface MessageResult {
  phone: string;
  message: string;
}

/**
 * Score a batch of leads 1-10 for home remodeling potential.
 * Returns an array of ScoreResult, one per lead.
 */
export async function scoreLeads(leads: Lead[]): Promise<ScoreResult[]> {
  const client = getClient();

  const leadsJson = leads.map((l) => ({
    phone: l.phone,
    propertyType: l.propertyType,
    yearBuilt: l.yearBuilt,
    estimatedValue: l.estimatedValue,
    equityPercent: l.equityPercent,
    ownerOccupied: l.ownerOccupied,
    lastSaleDate: l.lastSaleDate,
    absenteeOwner: l.absenteeOwner,
    freeAndClear: l.freeAndClear,
    sqft: l.sqft,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
  }));

  const prompt = `You are a lead scoring expert for a home remodeling company. Score each lead 1–10 based on their remodeling potential.

Scoring criteria:
- HIGH (7–10): Older home (15+ years), high equity (30%+), owner-occupied, long ownership (sold 5+ years ago), free and clear is a bonus.
- MEDIUM (4–6): Home 5–15 years old, moderate equity (10–30%), may or may not be owner-occupied.
- LOW (1–3): Recently sold (within 2 years), corporate/absentee owner, low equity (<10%), vacant or new construction.

Leads to score:
${JSON.stringify(leadsJson, null, 2)}

Return ONLY a JSON array with this exact shape (no markdown, no explanation):
[
  { "phone": "...", "score": 7, "reason": "Brief 1-sentence reason" },
  ...
]`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("Claude scoreLeads: could not parse JSON array from response");
  }

  const parsed = JSON.parse(match[0]) as Array<{
    phone: string;
    score: number;
    reason: string;
  }>;

  return parsed.map((item) => ({
    phone: item.phone,
    score: item.score,
    reason: item.reason,
  }));
}

/**
 * Generate personalized SMS messages for a batch of scored leads.
 * Returns an array of MessageResult, one per lead.
 */
export async function generateMessages(
  leads: Lead[],
  guidelines?: string,
  link?: string
): Promise<MessageResult[]> {
  const client = getClient();

  const leadsJson = leads.map((l) => ({
    phone: l.phone,
    firstName: l.firstName,
    propertyAddress: l.propertyAddress,
    city: l.city,
    state: l.state,
    propertyType: l.propertyType,
  }));

  let guidelinesSection = "";
  if (guidelines && guidelines.trim()) {
    guidelinesSection = `\nAdditional guidelines from the client:\n${guidelines.trim()}\n`;
  }

  let linkSection = "";
  if (link && link.trim()) {
    linkSection = `\nIncorporate this link naturally in the message: ${link.trim()}\n`;
  }

  const prompt = `You are a copywriter for a home remodeling company called VO360. Write personalized SMS messages for each lead.

Rules:
- Under 160 characters total (including link if provided)
- Use the lead's first name
- Mention their street address or neighborhood to feel personal
- Keep a casual, friendly tone
- Soft call-to-action (never pushy or salesy)
- NEVER mention equity, property value, ownership status, or financial details
- Sound like a neighbor, not a corporation
${guidelinesSection}${linkSection}
Leads:
${JSON.stringify(leadsJson, null, 2)}

Return ONLY a JSON array with this exact shape (no markdown, no explanation):
[
  { "phone": "...", "message": "..." },
  ...
]`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(
      "Claude generateMessages: could not parse JSON array from response"
    );
  }

  const parsed = JSON.parse(match[0]) as Array<{
    phone: string;
    message: string;
  }>;

  return parsed.map((item) => ({
    phone: item.phone,
    message: item.message,
  }));
}
