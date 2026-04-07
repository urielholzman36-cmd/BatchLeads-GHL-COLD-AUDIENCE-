import Anthropic from "@anthropic-ai/sdk";
import type { Lead } from "./types";

const MODEL = "claude-sonnet-4-6";
const BATCH_SIZE = 15;

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

async function scoreBatch(
  client: Anthropic,
  leads: Lead[]
): Promise<ScoreResult[]> {
  const leadsJson = leads.map((l) => ({
    phone: l.phone,
    firstName: l.firstName,
    lastName: l.lastName,
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

Return ONLY a JSON array with this exact shape (no markdown, no explanation, no code fences):
[
  { "phone": "...", "score": 7, "reason": "Brief 1-sentence reason" }
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
      "Claude scoreLeads: could not parse JSON array from response"
    );
  }

  return JSON.parse(match[0]) as ScoreResult[];
}

/**
 * Score leads in parallel batches to avoid response truncation.
 */
export async function scoreLeads(leads: Lead[]): Promise<ScoreResult[]> {
  const client = getClient();
  const batches: Lead[][] = [];

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    batches.push(leads.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.all(
    batches.map((batch) => scoreBatch(client, batch))
  );

  return batchResults.flat();
}

async function generateMessageBatch(
  client: Anthropic,
  leads: Array<{
    phone: string;
    firstName: string;
    propertyAddress: string;
    city: string;
    state: string;
    propertyType: string;
  }>,
  guidelines: string,
  link1: string,
  link2: string
): Promise<MessageResult[]> {
  let guidelinesSection = "";
  if (guidelines && guidelines.trim()) {
    guidelinesSection = `\nAdditional guidelines from the client:\n${guidelines.trim()}\n`;
  }

  let linkSection = "";
  if (link1.trim() && link2.trim()) {
    linkSection = `\nIncorporate BOTH of these links naturally in each message:\n- Link 1: ${link1.trim()}\n- Link 2: ${link2.trim()}\n`;
  } else if (link1.trim()) {
    linkSection = `\nIncorporate this link naturally in the message: ${link1.trim()}\n`;
  } else if (link2.trim()) {
    linkSection = `\nIncorporate this link naturally in the message: ${link2.trim()}\n`;
  }

  const prompt = `You are a copywriter for a home remodeling company called VO360. Write personalized SMS messages for each lead.

Rules:
- Under 160 characters total (unless links make it longer, that's OK)
- If the lead has a first name, use it. If not, use a friendly generic greeting like "Hi there" or "Hey neighbor"
- Mention their street address or neighborhood to feel personal
- Keep a casual, friendly tone
- Soft call-to-action (never pushy or salesy)
- NEVER mention equity, property value, ownership status, or financial details
- Sound like a neighbor, not a corporation
- Each message must be unique
${guidelinesSection}${linkSection}
Leads:
${JSON.stringify(leads, null, 2)}

Return ONLY a JSON array with this exact shape (no markdown, no explanation, no code fences):
[
  { "phone": "...", "message": "..." }
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

  return JSON.parse(match[0]) as MessageResult[];
}

/**
 * Generate messages in batches.
 * Now accepts link1 and link2 instead of a single link.
 */
export async function generateMessages(
  leads: Array<{
    phone: string;
    firstName: string;
    propertyAddress: string;
    city: string;
    state: string;
    propertyType: string;
  }>,
  guidelines?: string,
  link1?: string,
  link2?: string
): Promise<MessageResult[]> {
  const client = getClient();
  const batches: typeof leads[] = [];

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    batches.push(leads.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.all(
    batches.map((batch) =>
      generateMessageBatch(
        client,
        batch,
        guidelines || "",
        link1 || "",
        link2 || ""
      )
    )
  );

  return batchResults.flat();
}
