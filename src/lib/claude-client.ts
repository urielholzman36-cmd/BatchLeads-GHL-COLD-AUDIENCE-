import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const BATCH_SIZE = 15;

function getClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

export interface MessageResult {
  phone: string;
  message: string;
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
  const mainOffer =
    guidelines && guidelines.trim()
      ? guidelines.trim()
      : "a free in-home design consultation";
  const brandName = "VO360";
  const bonusOffer =
    "$1,500 in free showroom credits (1 credit = $1) toward their first project";
  const mainLink = link1.trim();
  const secondaryLink = link2.trim();

  const prompt = `You are an expert direct-response copywriter for cold outreach in the home services industry.

Your job is to write a short, highly personalized outreach message to a homeowner or new mover that feels human, warm, relevant, and curiosity-driven. The goal is not to hard-sell — the goal is to get the lead to reply.

Write in natural American English.

Inputs (constant for every lead in this batch):
- Brand name: ${brandName}
- Main offer: ${mainOffer}
- Main link: ${mainLink || "(none)"}
- Secondary link: ${secondaryLink || "(none)"}
- Bonus offer (MANDATORY in every message): ${bonusOffer}
- Tone: warm, personal, local, helpful

Requirements:
1. Start with a personalized congratulations on their new home or property.
2. Make the message feel like a thoughtful gift, not an advertisement.
3. Mention the main offer in one simple sentence.
4. LINKS — this rule is MANDATORY:
   - If BOTH "Main link" and "Secondary link" are provided (not "(none)"), you MUST include BOTH links in every message, naturally woven in. Do not pick one — include both.
   - If only ONE link is provided, include that one.
   - If neither is provided, skip links entirely.
   - When using both, give each link a clear, distinct purpose (e.g., one for browsing/info, one for booking/action) so they don't feel redundant.
6. Keep the message between 60 and 110 words.
7. Do not sound pushy, spammy, or corporate.
8. You MUST explicitly mention that the homeowner is receiving $1,500 in free showroom credits, and make clear that 1 credit = $1.
9. Do NOT use hype phrases like "limited time", "act now", or "exclusive deal".
10. End with one simple question that creates curiosity and makes it easy to reply.
11. If the lead has a first name, use it. If not, open with a warm generic greeting like "Hi there" or "Hey neighbor".
12. Mention their street/address or neighborhood to feel personal.
13. NEVER mention equity, property value, ownership status, or financial details.
14. One core idea, one CTA, focused on the homeowner — not the company.

For each lead, write the message in ONE of these three styles. Mix the styles across the batch so roughly a third use each (don't pick the same style for every lead):
- Version A: very natural and personal (60–110 words)
- Version B: slightly more promotional but still warm (60–110 words)
- Version C: ultra-short, reply-focused (rule 6 word count does NOT apply — keep it under 40 words)

Pick whichever style fits each lead best, but vary across the batch.

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
